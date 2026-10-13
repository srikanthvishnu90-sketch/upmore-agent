  /* Crypto tax export (real-world capability C163; registry TAX-007). Read-only: no venue is connected, nothing is
     traded, filed or sent. The person pastes an export CSV from each venue (or it arrives with the ask); the rows are
     normalized, cost basis is computed lot by lot, and the export is produced in the two shapes a tax tool or a CPA
     takes: a generic tax-tool CSV and Form 8949 rows. What the file does not say is never invented: a sale with no
     matching buy in the data is listed as missing basis with its proceeds split out, a row that cannot be read is
     listed as skipped with the reason, and a transfer between the person's own venues is not a sale.
       parseCsv(text)                 { rows, skipped, venues }: generic headers (date,type,asset,quantity,price,
                                      total,fee,cost basis,exchange,note) and Coinbase-style headers (Timestamp,
                                      Transaction Type, Quantity Transacted, Total (inclusive of fees and/or
                                      spread) ...). Quantities are exact decimals (BigInt at 1e-12), money is cents.
       compute(rows, opts)            lot matching by method ("fifo" | "lifo" | "hifo"): disposals (a sale, and the
                                      spent side of a trade) with per-lot portions, short/long term by the one-year
                                      anniversary, reward/staking income at the value the file states, transfers out
                                      consuming lots without a disposal, and the shortfall when more was sold than
                                      the file's buys cover. Reported for one tax year; earlier years still consume lots.
       washPairs(rows, disposals)     a loss sale with a buy of the same asset within 30 days either side. Under the
                                      rules in force for this export the wash-sale rule (IRC 1091) covers stocks and
                                      securities; crypto is property, so the loss is NOT disallowed here and the
                                      note says so, with the pending-proposals and substance cautions.
       reconcile(result, cents)       the export's gross proceeds (before sale fees) against the gross proceeds a
                                      Form 1099-DA the person quotes states: the difference, to the cent, or a match.
       form8949Csv(result)            one row per lot portion: description, date acquired, date sold, proceeds,
                                      cost basis, gain or loss, term. A missing-basis portion keeps blank basis and
                                      gain cells and is named in the note column; nothing is filled with a guess.
       ask(words) / handle(text, o)   the chat surface: "get my crypto taxes sorted" with no file gets the honest
                                      prompt (nothing connected, nothing on file, paste each venue's export);
                                      with a file (in this message, or following the prompt) it gets the summary,
                                      the missing list and the 8949 export. A buy/sell/swap ask is never this.
     Pure: rows and words are passed in. Depth packet CRYPTO-TAX. */
  const CryptoTax = (() => {
    const QS = 1000000000000n; // quantities at 1e-12, exact
    const DAY = 86400000;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const money = (c) => { if (c == null || !Number.isFinite(c)) return ""; const s = c < 0 ? "-" : ""; const a = Math.abs(Math.round(c)); return `${s}$${Math.floor(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`; };
    const plain = (c) => { const s = c < 0 ? "-" : ""; const a = Math.abs(Math.round(c)); return `${s}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`; };
    const dayMs = (s) => Date.parse(`${s}T00:00:00Z`);
    const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / DAY);
    const label = (s) => `${MON[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8, 10))}, ${s.slice(0, 4)}`;
    // A decimal string to a scaled BigInt; null when it is not a plain decimal.
    function dec(v) {
      const t = String(v == null ? "" : v).trim().replace(/[$,]/g, "");
      if (!/^[+-]?\d*(?:\.\d+)?$/.test(t) || t === "" || t === "." || t === "+" || t === "-") return null;
      const neg = t.startsWith("-"), [ip, fp = ""] = t.replace(/^[+-]/, "").split(".");
      if (fp.length > 12) return null;
      const n = BigInt(ip || "0") * QS + BigInt((fp + "000000000000").slice(0, 12));
      return neg ? -n : n;
    }
    const decText = (q) => { const neg = q < 0n, a = neg ? -q : q, ip = a / QS, fp = String(a % QS).padStart(12, "0").replace(/0+$/, ""); return `${neg ? "-" : ""}${ip}${fp ? "." + fp : ""}`; };
    const centsOf = (v) => { const d = dec(v); if (d === null) return null; const q = (d >= 0n ? d + 5000000000n : d - 5000000000n) / 10000000000n; return Number(q); };
    const qtyText = (q) => decText(q);

    // ---- CSV ----
    function splitCsv(text) {
      const rows = []; let row = [], cell = "", quoted = false;
      const s = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (quoted) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch; }
        else if (ch === '"') quoted = true;
        else if (ch === ",") { row.push(cell); cell = ""; }
        else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
        else cell += ch;
      }
      if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
      return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
    }
    const HEAD = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const ALIAS = [
      ["on", ["date", "timestamp", "transaction date", "utc timestamp", "time"]],
      ["type", ["type", "transaction type", "side", "transaction"]],
      ["asset", ["asset", "currency", "symbol", "coin", "asset symbol"]],
      ["quantity", ["quantity", "quantity transacted", "qty", "units", "amount crypto", "crypto amount"]],
      ["price", ["price", "price at transaction", "spot price", "unit price", "price usd"]],
      ["total", ["total", "total inclusive of fees", "total inclusive of fees and or spread", "proceeds", "value", "total usd", "amount usd", "subtotal", "amount"]],
      ["fee", ["fee", "fees", "fee amount", "fees and or spread", "transaction fee"]],
      ["basis", ["cost basis", "cost basis usd", "basis"]],
      ["venue", ["exchange", "venue", "account", "source", "platform"]],
      ["note", ["notes", "note", "description", "memo"]],
      ["recvAsset", ["received asset", "asset received", "to asset", "received currency"]],
      ["recvQty", ["received quantity", "quantity received", "to quantity", "received amount"]],
    ];
    function headerIndex(cells) {
      const idx = {};
      cells.forEach((c, i) => { const h = HEAD(c); for (const [k, names] of ALIAS) if (idx[k] === undefined && names.includes(h)) idx[k] = i; });
      // A Coinbase file carries both "Subtotal" and "Total (inclusive of fees and/or spread)": the Total column is
      // the money that moved, so it wins over Subtotal/Amount when both are present.
      if (idx.total !== undefined && !/^total/.test(HEAD(cells[idx.total]))) { const t = cells.findIndex((c) => /^total/.test(HEAD(c))); if (t >= 0) idx.total = t; }
      return idx;
    }
    const isHeader = (cells) => { const idx = headerIndex(cells); return idx.on !== undefined && idx.type !== undefined && idx.asset !== undefined && idx.quantity !== undefined; };
    // A paste often arrives with words before it ("here's my export:"): the CSV starts at its header line.
    function extractCsv(text) {
      const lines = String(text || "").split("\n");
      for (let i = 0; i < lines.length; i++) { const cells = splitCsv(lines[i])[0] || []; if (isHeader(cells)) return lines.slice(i).join("\n"); }
      return null;
    }
    const looksLikeCsv = (text) => extractCsv(text) !== null;
    function readDate(v) {
      const t = String(v || "").trim();
      let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
      m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t); if (m) return `${m[3]}-${String(+m[1]).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`;
      const p = Date.parse(t); return Number.isFinite(p) ? new Date(p).toISOString().slice(0, 10) : null;
    }
    const TYPEMAP = [
      [/^(buy|purchase|bought|market buy)$/i, "buy"], [/^(sell|sale|sold|market sell)$/i, "sell"],
      [/^(trade|convert|conversion|exchange|swap)$/i, "trade"],
      [/^(reward|rewards income|staking|staking income|interest|airdrop|income|coinbase earn|earn|fork)$/i, "reward"],
      [/^(receive|received|deposit|transfer in|incoming|transfer)$/i, "receive"],
      [/^(send|sent|withdraw|withdrawal|transfer out|outgoing)$/i, "send"],
    ];
    function mapType(v) { const t = String(v || "").trim(); for (const [re, k] of TYPEMAP) if (re.test(t)) return k; return null; }
    function parseCsv(text) {
      const grid = splitCsv(text), skipped = [], rows = [];
      if (!grid.length) return { rows, skipped: [{ line: 1, reason: "the paste is empty" }], venues: [] };
      const idx = headerIndex(grid[0]);
      if (idx.on === undefined || idx.type === undefined || idx.asset === undefined || idx.quantity === undefined)
        return { rows, skipped: [{ line: 1, reason: "no header row I can read (I need date, type, asset and quantity columns)" }], venues: [] };
      const inclusiveTotal = /inclusive/i.test(String(grid[0][idx.total] || ""));
      grid.slice(1).forEach((cells, i) => {
        const line = i + 2, get = (k) => (idx[k] === undefined ? "" : String(cells[idx[k]] || "").trim());
        const on = readDate(get("on")), type = mapType(get("type")), asset = get("asset").toUpperCase().replace(/[^A-Z0-9]/g, ""), qty = dec(get("quantity"));
        if (!on) { skipped.push({ line, reason: "the date could not be read" }); return; }
        if (!type) { skipped.push({ line, reason: `the type "${get("type")}" is not one I know (buy, sell, trade, reward, receive, send)` }); return; }
        if (!asset) { skipped.push({ line, reason: "no asset named" }); return; }
        if (qty === null || qty === 0n) { skipped.push({ line, reason: "the quantity could not be read" }); return; }
        const price = idx.price === undefined ? null : centsOf(get("price"));
        const total = idx.total === undefined ? null : centsOf(get("total"));
        const fee = idx.fee === undefined ? 0 : (centsOf(get("fee")) || 0);
        const basis = idx.basis === undefined ? null : centsOf(get("basis"));
        const value = total !== null ? total : (price !== null ? Math.round(price * Number(qty < 0n ? -qty : qty) / Number(QS)) : null);
        // An inclusive total on a sale is already net of the fee; gross it back up so the engine's net = gross - fee
        // lands on the file's own number instead of charging the fee twice.
        const grossed = inclusiveTotal && (type === "sell" || type === "trade") && value !== null ? value + fee : value;
        rows.push({ id: `row-${line}`, line, on, type, asset, quantity: qty < 0n ? -qty : qty, qty_signed: qty, value_cents: grossed, fee_cents: fee, basis_cents: basis, inclusive_total: inclusiveTotal, venue: get("venue") || "the file", note: get("note"),
          recv_asset: get("recvAsset").toUpperCase().replace(/[^A-Z0-9]/g, "") || null, recv_qty: idx.recvQty === undefined ? null : dec(get("recvQty")) });
      });
      rows.sort((a, b) => a.on.localeCompare(b.on) || a.line - b.line);
      return { rows, skipped, venues: [...new Set(rows.map((r) => r.venue))] };
    }

    // ---- lot accounting ----
    const share = (totalCents, part, whole) => whole === 0n ? 0 : Number((BigInt(totalCents) * part * 2n + whole) / (whole * 2n));
    function compute(rows, opts) {
      const o = opts || {}, method = ["fifo", "lifo", "hifo"].includes(o.method) ? o.method : "fifo";
      const year = o.year || null;
      const lots = []; // {asset, acquired_on, qty (BigInt), basis_cents (number|null), venue}
      const disposals = [], incomes = [], transfers = [], problems = [];
      const pickOrder = (asset) => {
        const mine = lots.map((l, i) => [l, i]).filter(([l]) => l.asset === asset && l.qty > 0n);
        if (method === "lifo") mine.reverse();
        if (method === "hifo") mine.sort((a, b) => { const ua = a[0].basis_cents === null ? -1 : a[0].basis_cents * Number(QS) / Number(a[0].qty), ub = b[0].basis_cents === null ? -1 : b[0].basis_cents * Number(QS) / Number(b[0].qty); return ub - ua || a[0].acquired_on.localeCompare(b[0].acquired_on); });
        return mine;
      };
      const consume = (asset, qtyWanted, onDate) => {
        const portions = []; let left = qtyWanted;
        for (const [lot] of pickOrder(asset)) {
          if (left <= 0n) break;
          const take = lot.qty < left ? lot.qty : left;
          const basisUsed = lot.basis_cents === null ? null : (take === lot.qty ? lot.basis_cents : share(lot.basis_cents, take, lot.qty));
          portions.push({ acquired_on: lot.acquired_on, qty: take, basis_cents: basisUsed, venue: lot.venue });
          lot.qty -= take; if (lot.basis_cents !== null) lot.basis_cents -= basisUsed; left -= take;
        }
        return { portions, shortfall: left };
      };
      const anniversary = (s) => { const y = Number(s.slice(0, 4)) + 1, md = s.slice(5); return `${y}-${md === "02-29" ? "02-28" : md}`; };
      for (const r of rows || []) {
        if (r.type === "buy") {
          const basis = r.basis_cents !== null && r.basis_cents !== undefined ? r.basis_cents : r.value_cents === null ? null : (r.inclusive_total ? r.value_cents : r.value_cents + (r.fee_cents || 0));
          lots.push({ asset: r.asset, acquired_on: r.on, qty: r.quantity, basis_cents: basis, venue: r.venue });
          if (basis === null) problems.push({ row: r.id, text: `the ${label(r.on)} ${r.asset} buy has no price or total in the file, so its basis is unknown` });
        } else if (r.type === "reward") {
          const fmv = r.value_cents;
          incomes.push({ on: r.on, asset: r.asset, qty: r.quantity, cents: fmv, venue: r.venue, row: r.id });
          lots.push({ asset: r.asset, acquired_on: r.on, qty: r.quantity, basis_cents: fmv, venue: r.venue });
          if (fmv === null) problems.push({ row: r.id, text: `the ${label(r.on)} ${r.asset} reward has no value in the file, so its income and basis are unknown` });
        } else if (r.type === "receive") {
          lots.push({ asset: r.asset, acquired_on: r.on, qty: r.quantity, basis_cents: r.basis_cents !== null && r.basis_cents !== undefined ? r.basis_cents : null, venue: r.venue, received: true });
        } else if (r.type === "send") {
          const { portions, shortfall } = consume(r.asset, r.quantity, r.on);
          transfers.push({ on: r.on, asset: r.asset, qty: r.quantity, venue: r.venue, row: r.id, covered: r.quantity - shortfall });
          if (shortfall > 0n) problems.push({ row: r.id, text: `the ${label(r.on)} send of ${qtyText(shortfall)} ${r.asset} is more than the file's earlier buys and receives cover` });
          void portions;
        } else if (r.type === "sell" || r.type === "trade") {
          const gross = r.value_cents, fee = r.fee_cents || 0, net = gross === null ? null : gross - fee;
          const { portions, shortfall } = consume(r.asset, r.quantity, r.on);
          const coveredQty = r.quantity - shortfall;
          const disp = { on: r.on, asset: r.asset, qty: r.quantity, venue: r.venue, row: r.id, kind: r.type, gross_cents: gross, fee_cents: fee, net_cents: net, portions: [], shortfall, missing_cents: null, gain_cents: 0, short_cents: 0, long_cents: 0 };
          // The covered part of the sale gets only its share of the net proceeds; the shortfall's share is the
          // missing-basis amount below, never counted twice.
          let proceedsLeft = net === null ? null : (shortfall > 0n ? share(net, coveredQty, r.quantity) : net);
          portions.forEach((p, i) => {
            const last = i === portions.length - 1;
            const proceeds = net === null ? null : (last ? proceedsLeft : share(net, p.qty, coveredQty));
            if (proceeds !== null) proceedsLeft -= proceeds;
            const gain = proceeds === null || p.basis_cents === null ? null : proceeds - p.basis_cents;
            const long = r.on > anniversary(p.acquired_on);
            disp.portions.push(Object.assign({}, p, { proceeds_cents: proceeds, gain_cents: gain, long }));
            if (gain !== null) { disp.gain_cents += gain; if (long) disp.long_cents += gain; else disp.short_cents += gain; }
          });
          if (shortfall > 0n && net !== null) { disp.missing_cents = share(net, shortfall, r.quantity); problems.push({ row: r.id, text: `${qtyText(shortfall)} ${r.asset} of the ${label(r.on)} sale has no buy in the file to take basis from (${money(disp.missing_cents)} of its proceeds)` }); }
          if (gross === null) problems.push({ row: r.id, text: `the ${label(r.on)} ${r.asset} sale has no proceeds in the file` });
          disposals.push(disp);
          if (r.type === "trade" && r.recv_asset && r.recv_qty) lots.push({ asset: r.recv_asset, acquired_on: r.on, qty: r.recv_qty, basis_cents: gross, venue: r.venue });
          else if (r.type === "trade") problems.push({ row: r.id, text: `the ${label(r.on)} trade does not name what was received, so no lot was opened for it` });
        }
      }
      const inYear = (d) => !year || Number(d.on.slice(0, 4)) === year;
      const dy = disposals.filter(inYear), iy = incomes.filter(inYear);
      const sum = (xs, f) => xs.reduce((s, x) => s + (f(x) || 0), 0);
      const totals = {
        proceeds_net_cents: sum(dy, (d) => d.net_cents), proceeds_gross_cents: sum(dy, (d) => d.gross_cents), fees_cents: sum(dy, (d) => d.fee_cents),
        gain_cents: sum(dy, (d) => d.gain_cents), short_cents: sum(dy, (d) => d.short_cents), long_cents: sum(dy, (d) => d.long_cents),
        missing_cents: sum(dy, (d) => d.missing_cents), income_cents: sum(iy, (i) => i.cents),
      };
      const holdings = lots.filter((l) => l.qty > 0n).map((l) => ({ asset: l.asset, acquired_on: l.acquired_on, qty: l.qty, qty_text: qtyText(l.qty), basis_cents: l.basis_cents, venue: l.venue }));
      return { method, year, disposals: dy, all_disposals: disposals, incomes: iy, transfers: transfers.filter(inYear), problems, totals, holdings };
    }
    function washPairs(rows, result) {
      const buys = (rows || []).filter((r) => r.type === "buy" || r.type === "reward");
      const out = [];
      for (const d of result.all_disposals || result.disposals) {
        if (d.gain_cents >= 0) continue;
        const near = buys.filter((b) => b.asset === d.asset && Math.abs(daysBetween(d.on, b.on)) <= 30);
        if (near.length) out.push({ on: d.on, asset: d.asset, loss_cents: d.gain_cents, rebuy_on: near[0].on });
      }
      return out;
    }
    const WASH_NOTE = "Wash sales: the wash-sale rule (IRC 1091) covers stocks and securities. Crypto is treated as property, so under the rules in force for this export a loss on crypto is not disallowed when you buy the same coin back within 30 days — the losses above stand as computed. Bills to change that have been proposed but not enacted, and a sale with no real change in your position can still be challenged on substance, so keep the venue records with the export.";
    const DA_NOTE = "Form 1099-DA: venues now report gross proceeds from crypto sales on Form 1099-DA (sales in 2025 onward), and basis reporting phases in for assets acquired in 2026 onward and held at the venue. The IRS matches the gross proceeds, so the export's gross figure is the one to compare with the form — fees are not netted out of it.";
    function reconcile(result, reportedGrossCents) {
      const mine = result.totals.proceeds_gross_cents, diff = mine - reportedGrossCents;
      return { mine_cents: mine, reported_cents: reportedGrossCents, diff_cents: diff, text: diff === 0 ? `1099-DA check: the export's gross proceeds ${money(mine)} match the ${money(reportedGrossCents)} you quoted from the form, to the cent.` : `1099-DA check: the export's gross proceeds are ${money(mine)} and the form says ${money(reportedGrossCents)} — a difference of ${money(Math.abs(diff))}. That usually means a venue or a sale is missing from the file, or a trade was reported at a different value; the form's number is the one the IRS has.` };
    }

    // ---- exports ----
    const q = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    function form8949Csv(result) {
      const out = ["Description,Date Acquired,Date Sold,Proceeds (USD),Cost Basis (USD),Gain or Loss (USD),Term,Asset,Venue,Note"];
      for (const d of result.disposals) for (const p of d.portions)
        out.push([`${qtyText(p.qty)} ${d.asset}`, p.acquired_on, d.on, p.proceeds_cents === null ? "" : plain(p.proceeds_cents), p.basis_cents === null ? "" : plain(p.basis_cents), p.gain_cents === null ? "" : plain(p.gain_cents), p.long ? "Long-term" : "Short-term", d.asset, d.venue, p.basis_cents === null ? "cost basis not in the file; not guessed" : ""].map(q).join(","));
      for (const d of result.disposals) if (d.shortfall > 0n)
        out.push([`${qtyText(d.shortfall)} ${d.asset}`, "", d.on, d.missing_cents === null ? "" : plain(d.missing_cents), "", "", "", d.asset, d.venue, "no buy in the file covers this part; basis unknown, not guessed"].map(q).join(","));
      return out.join("\n");
    }
    function genericCsv(result) {
      const out = ["Date,Type,Asset,Quantity,Proceeds (USD),Cost Basis (USD),Gain or Loss (USD),Term,Fee (USD),Exchange,Note"];
      for (const d of result.disposals) for (const p of d.portions)
        out.push([d.on, d.kind, d.asset, qtyText(p.qty), p.proceeds_cents === null ? "" : plain(p.proceeds_cents), p.basis_cents === null ? "" : plain(p.basis_cents), p.gain_cents === null ? "" : plain(p.gain_cents), p.long ? "Long-term" : "Short-term", "", d.venue, p.basis_cents === null ? "cost basis not in the file" : ""].map(q).join(","));
      for (const i of result.incomes) out.push([i.on, "reward", i.asset, qtyText(i.qty), "", i.cents === null ? "" : plain(i.cents), "", "", "", i.venue, "income at the value the file states"].map(q).join(","));
      return out.join("\n");
    }

    // ---- the chat surface ----
    const TRADE_ASK = /\b(buy|sell|swap|trade|invest|short|long position|leverage)\b[^.?!]{0,40}\b(bitcoin|btc|eth|crypto|coin|token|solana|doge)\b|\b(buy|sell|swap)\s+(some\s+)?(bitcoin|btc|eth|solana|doge|xrp)\b/i;
    function ask(words) {
      const t = String(words || "");
      const hasCsv = looksLikeCsv(t);
      // A pasted file's rows say buy and sell; they are data, not a trade ask. The trade guard applies to words only,
      // and a prose ask carrying a trade verb is a trade ask even when taxes are mentioned with it.
      if (!hasCsv && TRADE_ASK.test(t)) return null;
      const taxWords = /\bcrypt(?:o|currency)?\b[^.?!]{0,60}\btax|\btax(?:es)?\b[^.?!]{0,60}\bcrypt|\bget my crypto taxes sorted\b|\bcrypto taxes\b|\b8949\b|\b1099-da\b|\b(?:bitcoin|btc|ethereum|eth|crypto|solana|doge)\b[^.?!]{0,40}\bcost basis\b|\bcost basis\b[^.?!]{0,40}\b(?:bitcoin|btc|ethereum|eth|crypto|solana|doge)\b/i.test(t);
      if (!taxWords && !hasCsv) return null;
      // A stated tax year wins; a bare year is read only when no CSV is attached (its rows carry earlier years).
      const yearM = /(?:tax year|taxes for|return for)\s+(20\d\d)/i.exec(t) || (hasCsv ? null : /\b(20\d\d)\b/.exec(t));
      const method = /\blifo\b/i.test(t) ? "lifo" : /\bhifo\b/i.test(t) ? "hifo" : /\bspecific\b/i.test(t) ? "specific" : "fifo";
      const grossM = /\b1099(?:-da)?\b[^$]{0,40}\$\s?([\d,]+(?:\.\d{2})?)/i.exec(t) || /\bgross proceeds\b[^$]{0,30}\$\s?([\d,]+(?:\.\d{2})?)/i.exec(t);
      return { year: yearM ? Number(yearM[1]) : null, method, hasCsv, reported_gross_cents: grossM ? centsOf(grossM[1]) : null };
    }
    const PROMPT = [
      "I can sort the export, but I have nothing to sort yet: no crypto venue is connected to Upmore and no crypto transactions are on file, so I won't invent any.",
      "On each venue you used (Coinbase, Kraken, whichever applies), download its transaction history or tax export as a CSV and paste it here — one file at a time is fine. Buys, sells, trades, rewards and transfers all count; a file that starts at your first buy keeps the cost basis whole.",
      "Tell me the tax year and the lot method if you have one (FIFO is the default; LIFO and HIFO are here too), and quote the gross proceeds from any Form 1099-DA you got. I'll return the gain/loss summary, a Form 8949-shaped export and a tax-tool CSV, and list anything the files don't cover instead of guessing it.",
      "This is an export, not a filing: nothing is sent anywhere, and you or your CPA file it.",
    ].join("\n");
    function handle(text, opts) {
      const o = opts || {}, a = ask(text) || ask([text, o.context || ""].join("\n"));
      const csvText = extractCsv(text) || (o.context ? extractCsv(o.context) : null);
      if (!a && !csvText) {
        // A structured paste (several delimited lines) with a tax ask in the thread is a failed file, even when its
        // own rows kept the recognizer out; a plain trade ask has no such shape and stays the guard's.
        const structured = text.split("\n").length >= 2 && /[,;]/.test(text) && (/\btax/.test(String(text).toLowerCase()) || /\btax/.test(String(o.context || "").toLowerCase()));
        if (structured) { const bad = parseCsv(extractCsv(text) || text); return `I couldn't read any transactions from that paste. ${bad.skipped.map((s) => `Line ${s.line}: ${s.reason}.`).join(" ")} Nothing was computed.`; }
        return null;
      }
      // Method words in the thread's earlier text count only in the person's own instruction form ("use LIFO"):
      // the prompt itself names every method, so a loose scan of the context would pick one the person never chose.
      const strictMethod = (s) => { const m = /(?:use|using|method is|method:)\s*(lifo|hifo|fifo)/i.exec(String(s || "")); return m ? m[1].toLowerCase() : null; };
      const meta = a || { year: null, method: "fifo", reported_gross_cents: null };
      if (csvText) {
        meta.method = strictMethod(text) || strictMethod(o.context) || meta.method;
        if (meta.reported_gross_cents === null || meta.reported_gross_cents === undefined) { const ac = ask(o.context || ""); if (ac) meta.reported_gross_cents = ac.reported_gross_cents; }
      }
      if (!csvText) {
        // Words plus a multi-line, comma-carrying paste that has no readable header is a failed file, not a fresh ask.
        if (a && text.split("\n").length >= 2 && /,/.test(text)) { const bad = parseCsv(text); return `I couldn't read any transactions from that paste. ${bad.skipped.map((s) => `Line ${s.line}: ${s.reason}.`).join(" ")} Nothing was computed.`; }
        return PROMPT;
      }
      if (meta.method === "specific") return "Specific-lot matching needs you to name the lot for each sale, which a pasted export can't carry. Paste the file with FIFO, LIFO or HIFO and I'll compute it that way; nothing was computed from this paste.";
      const parsed = parseCsv(csvText);
      if (!parsed.rows.length) return `I couldn't read any transactions from that paste. ${parsed.skipped.map((s) => `Line ${s.line}: ${s.reason}.`).join(" ")} Nothing was computed.`;
      const ctxYear = /(?:tax year|taxes for|return for)\s+(20\d\d)/i.exec(String(o.context || ""));
      const year = meta.year || (ctxYear ? Number(ctxYear[1]) : null) || Number(parsed.rows.map((r) => r.on).sort().pop().slice(0, 4));
      const result = compute(parsed.rows, { method: meta.method, year });
      const t = result.totals, wash = washPairs(parsed.rows, result);
      const lines = [];
      lines.push(`Crypto tax export for ${year}, ${meta.method.toUpperCase()}, from the file you pasted (${parsed.rows.length} rows from ${parsed.venues.join(", ")}). Every number below comes from those rows.`);
      lines.push(`Sales: ${result.disposals.length}. Gross proceeds ${money(t.proceeds_gross_cents)}, fees ${money(t.fees_cents)}, net proceeds ${money(t.proceeds_net_cents)}.`);
      lines.push(`Gains: short-term ${money(t.short_cents)}, long-term ${money(t.long_cents)}, total ${money(t.gain_cents)}.`);
      if (result.incomes.length) lines.push(`Income the file states (rewards and staking count as income when received, and that value becomes their basis): ${result.incomes.map((i) => `${qtyText(i.qty)} ${i.asset} on ${label(i.on)}, ${money(i.cents)}`).join("; ")} — ${money(t.income_cents)} total.`);
      if (result.transfers.length) lines.push(`Transfers out are not sales: ${result.transfers.map((x) => `${qtyText(x.qty)} ${x.asset} on ${label(x.on)}`).join("; ")}. I consumed their lots in order and taxed nothing on them; if one went to someone else rather than your own wallet, say so — that would be a disposal.`);
      if (t.missing_cents) lines.push(`Missing data, listed honestly: ${money(t.missing_cents)} of proceeds have no basis in the file. ${result.problems.map((p) => p.text).join("; ")}. Those parts are in the export with the basis blank — I won't guess one. A file from the venue where you first bought, starting earlier, usually closes this.`);
      else if (result.problems.length) lines.push(`Notes on the file: ${result.problems.map((p) => p.text).join("; ")}.`);
      if (parsed.skipped.length) lines.push(`Rows I could not read, skipped rather than dropped quietly: ${parsed.skipped.map((s) => `line ${s.line} (${s.reason})`).join("; ")}.`);
      if (wash.length) lines.push(`A loss sale with a buy-back inside 30 days: ${wash.map((w) => `${w.asset} sold ${label(w.on)} at a ${money(-w.loss_cents)} loss, bought again ${label(w.rebuy_on)}`).join("; ")}.`);
      lines.push(WASH_NOTE);
      lines.push(meta.reported_gross_cents !== null && meta.reported_gross_cents !== undefined ? reconcile(result, meta.reported_gross_cents).text : DA_NOTE);
      if (result.holdings.length) lines.push(`Still held from the file: ${result.holdings.map((h) => `${h.qty_text} ${h.asset} (basis ${h.basis_cents === null ? "unknown" : money(h.basis_cents)}, from ${label(h.acquired_on)})`).join("; ")}.`);
      lines.push("Form 8949 export (one row per lot portion):");
      lines.push(form8949Csv(result));
      lines.push("Tax-tool CSV:");
      lines.push(genericCsv(result));
      lines.push("Nothing was filed or sent anywhere. Give the export to your tax software or CPA; they file it.");
      return lines.join("\n");
    }
    return { parseCsv, looksLikeCsv, extractCsv, compute, washPairs, reconcile, form8949Csv, genericCsv, ask, handle, decText, qtyText, WASH_NOTE, DA_NOTE, PROMPT };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = CryptoTax;
