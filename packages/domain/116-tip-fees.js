  /* Tip and junk-fee inflation tracker (C11; registry TXN-019 "tip and adjustment reconciliation"): the effective
     tip percentage and the service/delivery fee load per merchant, tracked over time from real receipt-level data —
     "your average DoorDash order now carries 31% in fees, up from 24% in March". Read-only, numbers only.
       ask(words)                                     null | { kind: "fees" | "tip" | "both", merchant, named_months }
       summarize(receipts, now, opts)                 the computed rows behind an answer: per merchant (the receipt's
                                                      merchant name as given), per period, the mean percentages and
                                                      the itemized-receipt counts behind them, plus the excluded count
       answer({ receipts, now, tz, words })           reply text; also answer(words, { receipts, now, tz }) and
                                                      answer(receipts, words, now, opts)
     A receipt row is what parseReceipt (62-agent-documents.js) returns: merchant, on (YYYY-MM-DD), subtotal_cents,
     tip_cents, delivery_fee_cents, service_fee_cents, tax_cents — a field the receipt did not state is null. A receipt
     counts toward a percentage only when it states the fields that percentage needs: the subtotal, and the tip (for
     the tip %) or at least one fee (for the fee load). A stated $0.00 fee counts; an absent fee is never read as $0.
     Fee load per receipt = (delivery + service + any other stated fee fields) / subtotal; effective tip per receipt =
     tip / subtotal; the reported percentage is the mean of the per-receipt percentages, to one decimal. Tax is never
     a fee and never a tip. Periods: the calendar month of `now` against the month before it, equal in length, unless
     the ask names a month (that month, against the one before it) or two months (the first against the second).
     Receipts in the two periods that state neither a usable subtotal nor the breakdown are left out and counted as
     excluded. Pure: rows and the clock are passed in. */
  const TipFees = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const MONTH_RES = [/\bjan(?:uary)?\b/, /\bfeb(?:ruary)?\b/, /\bmar(?:ch)?\b/, /\bapr(?:il)?\b/, /\bmay\b/, /\bjune?\b/, /\bjuly?\b/, /\baug(?:ust)?\b/, /\bsept?(?:ember)?\b/, /\boct(?:ober)?\b/, /\bnov(?:ember)?\b/, /\bdec(?:ember)?\b/];
    const DAY = 86400000;
    const HONEST = "Tips and fees can only be tracked from itemized receipts, and none are on file.";
    // Every fee field a receipt (or a row handed to this module) may state, apart from tax, which is never a fee.
    const FEE_FIELDS = ["delivery_fee_cents", "service_fee_cents", "other_fee_cents", "booking_fee_cents", "platform_fee_cents", "small_order_fee_cents", "fee_cents"];

    const LEAD = /^\s*(?:(?:hey|hi|ok|okay|so|um|upmore|pls|please|can you|could you)[,\s]+)*/i;
    const clean = (m) => String(m || "").toLowerCase().replace(/[’‘]/g, "'").replace(LEAD, "").replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").trim();
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const centsOf = (v) => (v !== null && v !== undefined && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
    const dayOf = (r) => {
      const v = r && (r.on || r.posted_on || r.date || r.received_at);
      if (typeof v !== "string") return null;
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
      const t = Date.parse(v);
      return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
    };
    const merchantOf = (r) => String((r && (r.merchant || r.from_name || r.merchant_raw)) || "").replace(/\s+/g, " ").trim() || "Unknown merchant";
    const subtotalOf = (r) => centsOf(r && r.subtotal_cents);
    const tipOf = (r) => centsOf(r && r.tip_cents);
    function feesOf(r) {
      let sum = 0, stated = false;
      for (const f of FEE_FIELDS) { const v = centsOf(r && r[f]); if (v !== null) { sum += v; stated = true; } }
      return stated ? sum : null;
    }
    // Usable for a percentage at all: a subtotal above zero and a stated tip or a stated fee.
    const usable = (r) => { const s = subtotalOf(r); return s !== null && s > 0 && (tipOf(r) !== null || feesOf(r) !== null); };

    // ---- the person's words ----
    const STOP_LEAD = new Set(["how", "much", "many", "do", "does", "did", "i", "you", "we", "my", "the", "a", "an", "are", "is", "were", "was", "your", "what", "whats", "show", "tell", "me", "about", "getting", "worse", "junk", "delivery", "service", "food", "average", "effective", "and", "or", "on"]);
    const STOP_TAIL = new Set(["orders", "order", "food", "delivery", "service"]);
    function merchantCandidate(raw) {
      let words = String(raw || "").replace(/[^a-z0-9&' .-]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
      while (words.length && STOP_LEAD.has(words[0])) words.shift();
      while (words.length && STOP_TAIL.has(words[words.length - 1])) words.pop();
      if (!words.length || words.length > 3) return null;
      const c = words.join(" ");
      if (/\b(?:balance|budget|groceries|spending|spend|fees?|tips?|tipping|percent|inflation|track|card|pay|paid|much|many|did|does|what|when|how|is|are|was|were|get|getting|going|come|came)\b/.test(c)) return null;
      return c;
    }
    function merchantIn(t) {
      const noMonths = MONTH_RES.reduce((s, re) => s.replace(re, " "), t);
      const trail = /\b(?:on|at|for|from)\s+([a-z][a-z0-9&' .-]*)$/.exec(noMonths);
      if (trail) { const c = merchantCandidate(trail[1]); if (c) return c; }
      const lead = /^(.+?)\s+(?:tips?|fees?)\b/.exec(noMonths);
      if (lead) return merchantCandidate(lead[1]);
      return null;
    }
    function namedMonths(t) {
      const found = [];
      MONTH_RES.forEach((re, i) => { const m = re.exec(t.replace(/\bmay i\b/g, "")); if (m) found.push({ at: m.index, month: i + 1 }); });
      return found.sort((a, b) => a.at - b.at).map((f) => f.month);
    }
    function ask(words) {
      const t = clean(words);
      if (!t || t.length > 140) return null;
      if (/\boverdraft\b|\blate fee\b|\batm fee\b|\bannual fee\b/.test(t)) return null;
      const hasFees = /\bfees?\b/.test(t), hasTip = /\b(?:tips?|tipping|gratuity)\b/.test(t);
      if (!hasFees && !hasTip) return null;
      // A definition question ("what is a tip") is not a tracking ask about the person's own receipts.
      if (/^(?:what is|what's|what does|define)\b/.test(t) && !/\bmy\b|\bi tip\b/.test(t)) return null;
      // Tipping etiquette ("should i tip 20% on takeout", "is it unusual to tip") is advice about other people's
      // money, not tracking of the person's own receipts.
      if (/\bshould i tip\b|\bis it (?:unusual|normal|standard|expected|customary|ok|okay) to tip\b|\bwhat'?s the (?:standard|normal|usual|right|proper)\b[^.]*\btip/.test(t)) return null;
      let kind = hasFees && hasTip ? "both" : hasFees ? "fees" : "tip";
      if (kind === "tip") {
        const own = /\bhow much\b|\bdo i tip\b|\bi tip\b|\bmy (?:tip|tips|tipping)\b|\baverage\b|\bpercent|\btipping\b|\btips? (?:on|at|for)\b|\bgetting\b|\bgoing up\b|\binflation\b|\btrack|\bon [a-z]/.test(t) || !!merchantIn(t);
        if (!own) return null;
      }
      if (kind === "fees" || kind === "both") {
        // A fee-load ask is about the fees on the person's own orders: a delivery/service/junk framing, what they
        // paid or are paying, or a trend. A fee schedule ("what are the fees on my chase card") and somebody
        // else's fee (an airline bag fee) are not this.
        const own = /\bdelivery\b|\bservice (?:fee|fees|charge|charges)\b|\bjunk\b|\bi (?:pay|paid|paying|am paying|got charged|was charged)\b[^.]*\bfees?\b|\bfees?\b[^.]*\b(?:going up|getting worse|rising|increasing|higher|adding up)\b|\b(?:going up|getting worse|rising|increasing)\b[^.]*\bfees?\b|\bhow much\b[^.]*\bmy (?:delivery |service )?fees?\b/.test(t) || !!merchantIn(t);
        if (!own && kind === "fees") return null;
        if (!own && kind === "both") kind = "tip";
      }
      return { kind, merchant: merchantIn(t), named_months: namedMonths(t) };
    }

    // ---- the periods ----
    const pad = (n) => String(n).padStart(2, "0");
    const periodOf = (y, m) => ({ y, m, key: `${y}-${pad(m)}`, name: MONTHS[m - 1] });
    const prevOf = (y, m) => (m === 1 ? periodOf(y - 1, 12) : periodOf(y, m - 1));
    function periods(q, now, tz) {
      const today = MA.todayIn(now, tz), y = +today.slice(0, 4), m = +today.slice(5, 7);
      const named = q && Array.isArray(q.named_months) ? q.named_months : [];
      if (!named.length) return { current: periodOf(y, m), previous: prevOf(y, m) };
      const cy = named[0] > m ? y - 1 : y, current = periodOf(cy, named[0]);
      if (named.length < 2) return { current, previous: prevOf(cy, named[0]) };
      const py = named[1] > named[0] ? cy - 1 : cy;
      return { current, previous: periodOf(py, named[1]) };
    }

    // ---- the numbers ----
    function metric(rows, valueOf) {
      const counted = rows.filter((r) => { const s = subtotalOf(r), v = valueOf(r); return s !== null && s > 0 && v !== null; });
      if (!counted.length) return { count: 0, pct: null, total_cents: 0 };
      const mean = counted.reduce((s, r) => s + (valueOf(r) / subtotalOf(r)) * 100, 0) / counted.length;
      return { count: counted.length, pct: Math.round(mean * 10) / 10, total_cents: counted.reduce((s, r) => s + valueOf(r), 0) };
    }
    function summarize(receipts, now, opts) {
      const o = typeof opts === "string" ? { tz: opts } : opts || {}, tz = o.tz || "UTC";
      const q = o.ask || (typeof o.words === "string" ? ask(o.words) : typeof o.message === "string" ? ask(o.message) : null);
      const p = periods(q, now, tz), rows = Array.isArray(receipts) ? receipts : [];
      const wantMerchant = q && q.merchant ? norm(q.merchant) : null;
      const matches = (r) => { if (!wantMerchant) return true; const n = norm(merchantOf(r)); return n === wantMerchant || (wantMerchant.length >= 3 && (n.includes(wantMerchant) || wantMerchant.includes(n))); };
      const inPeriod = (r, per) => { const d = dayOf(r); return d !== null && d.slice(0, 7) === per.key; };
      const groups = new Map();
      for (const r of rows) {
        if (!r || !matches(r)) continue;
        const key = norm(merchantOf(r)) || "unknownmerchant";
        if (!groups.has(key)) groups.set(key, { merchant: merchantOf(r), currentRows: [], previousRows: [] });
        const g = groups.get(key);
        if (inPeriod(r, p.current)) g.currentRows.push(r);
        else if (inPeriod(r, p.previous)) g.previousRows.push(r);
      }
      const side = (list) => ({ fees: metric(list, feesOf), tip: metric(list, tipOf), orders: list.filter(usable).length });
      const merchants = [...groups.values()].map((g) => ({ merchant: g.merchant, current: side(g.currentRows), previous: side(g.previousRows) }))
        .filter((g) => g.current.orders > 0 || g.previous.orders > 0)
        .sort((a, b) => b.current.orders - a.current.orders || b.previous.orders - a.previous.orders || a.merchant.localeCompare(b.merchant));
      const inScope = rows.filter((r) => r && matches(r) && (inPeriod(r, p.current) || inPeriod(r, p.previous)));
      return {
        current: p.current, previous: p.previous, merchants,
        total_receipts: rows.length,
        itemized_receipts: rows.filter((r) => r && usable(r)).length,
        excluded_count: inScope.filter((r) => !usable(r)).length,
        kind: q ? q.kind : "both", merchant: q ? q.merchant : null,
      };
    }

    // ---- the reply ----
    const pctText = (p) => `${Number.isInteger(p) ? String(p) : p.toFixed(1)}%`;
    const countIn = (n, name) => `${n} order${n === 1 ? "" : "s"} in ${name}`;
    const dirOf = (a, b) => (a > b ? "up from" : a < b ? "down from" : null);
    function feeLine(name, cur, prev, s) {
      const c = s.current.fees, v = s.previous.fees;
      if (c.count && v.count) {
        const d = dirOf(c.pct, v.pct);
        return d ? `${name}: your average order now carries ${pctText(c.pct)} in fees, ${d} ${pctText(v.pct)} in ${prev.name} (${countIn(c.count, cur.name)}, ${countIn(v.count, prev.name)}).`
          : `${name}: your average order carries ${pctText(c.pct)} in fees in ${cur.name}, the same as ${pctText(v.pct)} in ${prev.name} (${countIn(c.count, cur.name)}, ${countIn(v.count, prev.name)}).`;
      }
      if (c.count) return `${name}: your average order carries ${pctText(c.pct)} in fees in ${cur.name} (${c.count} order${c.count === 1 ? "" : "s"}); no itemized receipts in ${prev.name} to compare with.`;
      if (v.count) return `${name}: no itemized receipts in ${cur.name} to say the current fee load; in ${prev.name} it was ${pctText(v.pct)} (${countIn(v.count, prev.name)}).`;
      return null;
    }
    function tipLine(name, cur, prev, s) {
      const c = s.current.tip, v = s.previous.tip;
      if (c.count && v.count) {
        const d = dirOf(c.pct, v.pct);
        return d ? `${name}: your average tip is ${pctText(c.pct)} of the subtotal in ${cur.name}, ${d} ${pctText(v.pct)} in ${prev.name} (${countIn(c.count, cur.name)}, ${countIn(v.count, prev.name)}).`
          : `${name}: your average tip is ${pctText(c.pct)} of the subtotal in ${cur.name}, the same as ${pctText(v.pct)} in ${prev.name} (${countIn(c.count, cur.name)}, ${countIn(v.count, prev.name)}).`;
      }
      if (c.count) return `${name}: your average tip was ${pctText(c.pct)} of the subtotal in ${cur.name} (${c.count} order${c.count === 1 ? "" : "s"}); no itemized receipts in ${prev.name} to compare with.`;
      if (v.count) return `${name}: no itemized receipts in ${cur.name} to say the current tip; in ${prev.name} it was ${pctText(v.pct)} of the subtotal (${countIn(v.count, prev.name)}).`;
      return null;
    }
    function sourceLine(receipts, now, tz) {
      const days = (receipts || []).filter((r) => r && usable(r)).map(dayOf).filter(Boolean).sort();
      const through = days.length ? days[days.length - 1] : null;
      const label = through ? `${MON[+through.slice(5, 7) - 1]} ${+through.slice(8, 10)}, ${through.slice(0, 4)}` : null;
      const asOf = Number.isFinite(Date.parse(now)) || now instanceof Date || typeof now === "number" ? MA.timeLabel(now, tz) : null;
      return `From your itemized receipts${label ? `, receipts through ${label}` : ""}${asOf ? `, as of ${asOf}` : ""}.`;
    }
    function answer(...args) {
      let input = {}, words;
      if (args[0] && typeof args[0] === "object" && !Array.isArray(args[0]) && !(args[0] instanceof Date)) { input = args[0]; words = input.words !== undefined ? input.words : input.message; }
      else if (typeof args[0] === "string") { words = args[0]; input = args[1] || {}; }
      else if (Array.isArray(args[0])) { input = { receipts: args[0], now: args[2], tz: args[3] && args[3].tz }; words = args[1]; }
      const receipts = input.receipts || input.transactions || [], now = input.now !== undefined ? input.now : (typeof args[2] !== "undefined" ? args[2] : Date.now());
      const tz = input.tz || "UTC";
      const q = typeof words === "string" ? ask(words) : words && typeof words === "object" ? words : words === undefined ? { kind: "both", merchant: null, named_months: [] } : null;
      if (!q) return null;
      const s = summarize(receipts, now, { tz, ask: q });
      if (!s.itemized_receipts) return HONEST;
      const lines = [];
      if (!s.merchants.length) {
        lines.push(`I don't see any itemized receipts${q.merchant ? ` for ${q.merchant}` : ""} in ${s.current.name} or ${s.previous.name} to track tips or fees from.`);
      } else {
        for (const m of s.merchants) {
          if (s.kind === "fees" || s.kind === "both") { const l = feeLine(m.merchant, s.current, s.previous, m); if (l) lines.push(l); }
          if (s.kind === "tip" || s.kind === "both") { const l = tipLine(m.merchant, s.current, s.previous, m); if (l) lines.push(l); }
        }
      }
      if (s.excluded_count) lines.push(`${s.excluded_count} receipt${s.excluded_count === 1 ? "" : "s"} in ${s.current.name} and ${s.previous.name} ${s.excluded_count === 1 ? "was" : "were"} left out: no subtotal or no tip or fee breakdown was stated on ${s.excluded_count === 1 ? "it" : "them"}.`);
      lines.push(sourceLine(receipts, now, tz));
      return lines.join("\n");
    }
    return { ask, answer, summarize, HONEST, FEE_FIELDS, itemized: usable, feesOf, tipOf };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = TipFees;
