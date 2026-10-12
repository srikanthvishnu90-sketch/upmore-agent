  /* Subscription and shopping savings (Methods 3, overnight duties D1, D2, D3, D5, D6). Pure and read-only: math and
     suggestions over the person's own card and bank rows, never an action. Nothing here cancels, switches, activates or
     turns anything on: a cancel is handed to the existing cancel flow (68-agent-cancel.js), one card and one yes per
     cancellation, and the rotation plan is a per-person toggle that starts off.
       D1 cheaper tier and annual switch   M3-SUBS-05, M3-SUBS-10
       D2 perk overlap                      M3-SUBS-02 (T-Mobile), M3-SUBS-03 (Amex Blue Cash Preferred), M3-SUBS-04 (Walmart+)
       D3 rotation                          M3-SUBS-08
       D5 warehouse club math               M3-SHOP-07
       D6 Subscribe and Save stack          M3-SHOP-09
     Every number is either from the rows (named with the date of the charge and the as-of date) or an offer-book term
     (packages/offers/terms.json through 82-offer-book.js) cited with its source and checked date; a term past its
     freshness window says "may have changed: check before acting". A plan price is matched exactly: a $19.98 charge is
     not Netflix Standard. A phone plan is never guessed from a bill amount, and a card the person holds is never guessed:
     both are asked. Merchant text from the rows is data and is never echoed; findings name the service in Upmore's words.
     Input: { today: "YYYY-MM-DD", book: OfferBook.create(terms), transactions: rows, facts?: { tmobile_plan?, cards? } }.
     Rows are either the chat's shape { provider_transaction_id, account_id, posted_on, amount_cents, merchant_raw } or the
     monitors' shape { id, account_id, posted_at, amount (dollars), merchant_raw }; spending is negative, and a credit is a
     refund (only club spend nets it). */
  const SubscriptionSavings = (() => {
    const DAY = 86400000;
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    const SOURCE = "your linked card and bank rows";
    const ACTIVE_DAYS = 45, YEARLY_ACTIVE_DAYS = 380, ROTATION_MIN = 3, ANNUAL_MIN_MONTHS = 10, STAPLE_MIN = 3, STACK_MIN = 5;
    const utc = d => Date.parse(`${d}T00:00:00Z`);
    const days = (a, b) => Math.round((utc(b) - utc(a)) / DAY);
    const addDays = (d, n) => new Date(utc(d) + n * DAY).toISOString().slice(0, 10);
    const monthIndex = d => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
    const monthName = i => `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, "0")}`;
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const pct = r => `${Math.round(r * 100)}%`;

    // Which service a row is, in Upmore's words. Order matters: a Prime membership before Amazon shopping, Disney+ before
    // a Hulu bundle. The names are Upmore's; nothing the merchant string says is ever repeated.
    const SERVICES = Object.freeze([
      { id: "netflix", name: "Netflix", re: /\bnetflix\b/i, streaming: true },
      { id: "disney", name: "Disney+", re: /\bdisney\s*(?:\+|plus)|\bdisneyplus\b/i, streaming: true },
      { id: "hulu", name: "Hulu", re: /\bhulu\b/i, streaming: true },
      { id: "espn", name: "ESPN+", re: /\bespn\b/i, streaming: true },
      { id: "max", name: "Max", re: /\bhbo\s*max\b|\bhbomax\b|\bmax\.com\b/i, streaming: true },
      { id: "peacock", name: "Peacock", re: /\bpeacock\b/i, streaming: true },
      { id: "paramount", name: "Paramount+", re: /\bparamount\s*(?:\+|plus)|\bparamountplus\b/i, streaming: true },
      { id: "appletv", name: "Apple TV+", re: /\bapple\s*tv\b/i, streaming: true },
      { id: "prime", name: "Amazon Prime", re: /\b(?:amazon|amzn)\s*prime\b|\bprime\s*membership\b/i, streaming: false },
      { id: "walmart_plus", name: "Walmart+", re: /\bwalmart\s*(?:\+|plus)|\bwmt\s*plus\b/i, streaming: false },
      { id: "tmobile", name: "T-Mobile", re: /\bt-?\s?mobile\b/i, streaming: false },
      { id: "costco", name: "Costco", re: /\bcostco\b/i, streaming: false },
      { id: "amazon", name: "Amazon", re: /\bamazon\.com\b|\bamzn\s*mktp|\bamazon\s*mktpl?|\bamzn\.com\b/i, streaming: false },
    ]);
    const NAME = Object.fromEntries(SERVICES.map(s => [s.id, s.name]));
    const serviceOf = merchant => { const s = SERVICES.find(x => x.re.test(String(merchant || ""))); return s ? s.id : null; };

    // D1: a charge that equals a plan price exactly, and the cheaper tier of the same service.
    const TIERS = Object.freeze([
      { service: "netflix", from: "price.netflix.standard_cents", to: "price.netflix.standard_ads_cents", from_name: "Netflix Standard", to_name: "Standard with ads",
        tradeoff: "you'd watch with ads and may lose some features" },
    ]);
    // D1: services with a monthly and a yearly price on file.
    const ANNUAL = Object.freeze([
      { service: "peacock", month: "price.peacock.premium_month_cents", year: "price.peacock.premium_year_cents", plan: "Peacock Premium" },
      { service: "prime", month: "price.prime.month_cents", year: "price.prime.year_cents", plan: "Amazon Prime" },
    ]);
    // Yearly prices that mark a charge as a yearly bill rather than a month.
    const YEARLY_TERMS = Object.freeze({ peacock: ["price.peacock.premium_year_cents"], prime: ["price.prime.year_cents"], walmart_plus: ["price.walmart_plus.year_cents"] });
    const AMEX_ELIGIBLE = Object.freeze(["disney", "hulu", "espn"]);
    const AMEX_RE = /blue\s*cash\s*preferred/i;
    const COSTCO_FEE_RE = /member|renew|annual/i;
    const AMAZON_ONLY = new Set(["amazon"]);

    function normalize(transactions) {
      const out = [];
      for (const t of Array.isArray(transactions) ? transactions : []) {
        if (!t || t.is_pending || t.is_transfer) continue;
        const date = String(t.posted_on || t.posted_at || "").slice(0, 10);
        const cents = Number.isFinite(t.amount_cents) ? t.amount_cents : Number.isFinite(Number(t.amount)) && t.amount !== null && t.amount !== "" ? Math.round(Number(t.amount) * 100) : NaN;
        if (!ISO.test(date) || !Number.isSafeInteger(cents) || cents === 0) continue;
        const merchant = String(t.merchant_raw || t.merchant || "");
        // A charge is spending; a credit from the same merchant is a refund (kept so club spend nets its returns).
        out.push({ id: String(t.provider_transaction_id != null ? t.provider_transaction_id : t.id != null ? t.id : ""), account_id: t.account_id || null, date, cents: Math.abs(cents), refund: cents > 0, merchant, service: serviceOf(merchant) });
      }
      return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    }

    // A cited term: its value and one line naming the source and checked date; past its window, the line says so.
    function cite(book, id, today) {
      const t = book.term(id, today);
      return { id, value: t.value, unit: t.unit, stale: t.stale, source: t.source, checked_on: t.checked_on,
        line: `per ${t.source.title}, checked ${t.checked_on}${t.stale ? "; may have changed: check before acting" : ""}` };
    }
    const citeLine = terms => {
      const seen = new Set(), lines = [];
      for (const t of terms) if (!seen.has(t.line)) { seen.add(t.line); lines.push(t.line); }
      return lines.length ? ` (${lines.join("; ")})` : "";
    };

    // Per service: its charges, the latest, whether it reads as a yearly bill, and whether it is still active.
    function services(rows, book, today) {
      const by = {};
      for (const r of rows) if (r.service && days(r.date, today) >= 0) (by[r.service] = by[r.service] || []).push(r);
      const out = {};
      for (const [id, list] of Object.entries(by)) {
        const last = list[list.length - 1];
        const yearlyPrices = (YEARLY_TERMS[id] || []).map(t => book.value(t, today));
        const prev = list.length > 1 ? list[list.length - 2] : null;
        const yearly = yearlyPrices.includes(last.cents) || (!!prev && days(prev.date, last.date) >= 300);
        const active = days(last.date, today) <= (yearly ? YEARLY_ACTIVE_DAYS : ACTIVE_DAYS);
        out[id] = { id, name: NAME[id], rows: list, last, yearly, active, annual_cents: yearly ? last.cents : last.cents * 12, monthly_cents: yearly ? Math.round(last.cents / 12) : last.cents };
      }
      return out;
    }

    function finding(f) {
      const terms = f.terms || [];
      return Object.assign({ source: SOURCE, upfront_cents: 0, yearly_saving_cents: 0, action: null }, f, { terms, stale: terms.some(t => t.stale), cites: terms.map(t => t.line) });
    }
    const charged = s => `${money(s.last.cents)} on ${s.last.date}`;

    // D1 cheaper tier (M3-SUBS-05).
    function cheaperTier(svc, book, today) {
      const out = [];
      for (const tier of TIERS) {
        const s = svc[tier.service]; if (!s || !s.active || s.yearly) continue;
        const from = cite(book, tier.from, today), to = cite(book, tier.to, today);
        if (s.last.cents !== from.value || !(to.value < from.value)) continue;
        const saving = (from.value - to.value) * 12;
        out.push(finding({ duty: "D1", method: "M3-SUBS-05", kind: "cheaper_tier", service: s.id, as_of: s.last.date, rows: [s.last.id], terms: [from, to], yearly_saving_cents: saving, tradeoff: tier.tradeoff,
          title: `${s.name}: ${tier.to_name} saves ${money(saving)} a year`,
          text: `${s.name}: your ${charged(s)} matches ${tier.from_name} (${money(from.value)} a month). ${tier.to_name} is ${money(to.value)} a month: ${money(saving)} a year less. The trade-off: ${tier.tradeoff}.${citeLine([from, to])}`,
          action: { type: "suggest_plan_change", by: "person", where: `${s.name} account settings`, note: "You change the plan yourself; nothing changes until you do." } }));
      }
      return out;
    }

    // D1 annual switch (M3-SUBS-10): billed the monthly price in each of 10 or more calendar months in a row, up to now.
    function annualSwitch(svc, book, today) {
      const out = [];
      for (const a of ANNUAL) {
        const s = svc[a.service]; if (!s || !s.active || s.yearly) continue;
        const month = cite(book, a.month, today), year = cite(book, a.year, today);
        if (s.last.cents !== month.value) continue;
        const months = new Set(s.rows.filter(r => r.cents === month.value).map(r => monthIndex(r.date)));
        let run = 0, m = monthIndex(s.last.date);
        while (months.has(m)) { run++; m--; }
        if (run < ANNUAL_MIN_MONTHS) continue;
        const saving = month.value * 12 - year.value; if (saving <= 0) continue;
        const runRows = s.rows.filter(r => r.cents === month.value && monthIndex(r.date) > m).map(r => r.id);
        out.push(finding({ duty: "D1", method: "M3-SUBS-10", kind: "annual_switch", service: s.id, as_of: s.last.date, rows: runRows, terms: [month, year], yearly_saving_cents: saving, upfront_cents: year.value, months_in_a_row: run,
          tradeoff: "the year is paid up front, so the money is locked in if you quit early",
          title: `${a.plan}: paying yearly saves ${money(saving)} a year`,
          text: `${a.plan}: you've paid ${money(month.value)} a month for ${run} months in a row (latest ${s.last.date}). The yearly plan is ${money(year.value)} up front: ${money(saving)} a year less than 12 monthly charges. The trade-off: the year is paid up front, so the money is locked in if you quit early.${citeLine([month, year])}`,
          action: { type: "suggest_annual_switch", by: "person", upfront_cents: year.value, note: "You switch it yourself; nothing changes until you do." } }));
      }
      return out;
    }

    // The cancel of a paid service always goes through the cancel flow: one card and one yes for that one service.
    const cancelVia = s => ({ flow: "cancel", capability_id: "BILL-003", service: s.id, ask: `cancel ${s.name}`, approvals_required: 1 });

    // D2 perk overlap (M3-SUBS-04 Walmart+, M3-SUBS-02 T-Mobile, M3-SUBS-03 Amex Blue Cash Preferred).
    function perkOverlap(svc, book, today, facts) {
      const out = [], questions = [];
      const wm = svc.walmart_plus;
      if (wm && wm.active) {
        const perk = cite(book, "perk.walmart_plus.streaming", today);
        for (const id of ["peacock", "paramount"]) {
          const s = svc[id]; if (!s || !s.active) continue;
          out.push(finding({ duty: "D2", method: "M3-SUBS-04", kind: "perk_overlap", service: s.id, plan: "walmart_plus", as_of: s.last.date > wm.last.date ? s.last.date : wm.last.date, rows: [wm.last.id, s.last.id], terms: [perk], yearly_saving_cents: s.annual_cents,
            tradeoff: "the included plan has ads, and you can switch it only every 90 days",
            title: `Walmart+ already includes ${s.name}: about ${money(s.annual_cents)} a year`,
            text: `You pay for Walmart+ (latest ${charged(wm)}) and separately for ${s.name} (${charged(s)}). Walmart+ includes ${perk.value}. Activate the perk, then cancel the paid one: about ${money(s.annual_cents)} a year from your own charges. The trade-off: the included plan has ads, and you can switch it only every 90 days.${citeLine([perk])}`,
            action: { type: "activate_then_cancel", activate: { by: "person", where: "the Walmart app, Walmart+ benefits" }, cancel: cancelVia(s) } }));
        }
      }
      const tm = svc.tmobile;
      const tmPaid = ["netflix", "hulu"].map(id => svc[id]).filter(s => s && s.active);
      if (tm && tm.active && tmPaid.length) {
        const perk = cite(book, "perk.tmobile_experience_beyond.streaming", today);
        const plan = facts && typeof facts.tmobile_plan === "string" ? facts.tmobile_plan : null;
        if (!plan) questions.push(finding({ duty: "D2", method: "M3-SUBS-02", kind: "question", service: "tmobile", as_of: tm.last.date, rows: [tm.last.id], terms: [perk],
          ask: "tmobile_plan",
          text: `Which T-Mobile plan are you on? I can't tell a plan from the bill amount. If it's Experience Beyond, it includes ${perk.value}, and you also pay ${tmPaid.map(s => `${s.name} (${charged(s)})`).join(" and ")}.${citeLine([perk])}` }));
        else if (/experience\s*beyond/i.test(plan)) for (const s of tmPaid) {
          const extra = s.id === "hulu" ? " The Hulu part is a 12-month promo; after it, Hulu bills $7.99 a month, so set a reminder before it ends." : "";
          out.push(finding({ duty: "D2", method: "M3-SUBS-02", kind: "perk_overlap", service: s.id, plan: "tmobile_experience_beyond", as_of: s.last.date > tm.last.date ? s.last.date : tm.last.date, rows: [tm.last.id, s.last.id], terms: [perk], yearly_saving_cents: s.annual_cents,
            tradeoff: "the included plan has ads",
            title: `Your T-Mobile plan already includes ${s.name}: about ${money(s.annual_cents)} a year`,
            text: `You said your T-Mobile plan is Experience Beyond, which includes ${perk.value}. You also pay ${s.name} yourself (${charged(s)}). Activate the perk, then cancel the paid one: about ${money(s.annual_cents)} a year from your own charges. The trade-off: the included plan has ads.${extra}${citeLine([perk])}`,
            action: { type: "activate_then_cancel", activate: { by: "person", where: "the T-Mobile app, Benefits" }, cancel: cancelVia(s) } }));
        }
      }
      const eligible = AMEX_ELIGIBLE.map(id => svc[id]).filter(s => s && s.active && !s.yearly);
      if (eligible.length) {
        const credit = cite(book, "perk.amex_bcp.streaming_credit_cents", today);
        const cards = facts && Array.isArray(facts.cards) ? facts.cards : null;
        if (!cards) questions.push(finding({ duty: "D2", method: "M3-SUBS-03", kind: "question", service: eligible[0].id, as_of: eligible[0].last.date, rows: eligible.map(s => s.last.id), terms: [credit],
          ask: "cards_held",
          text: `Which credit cards do you hold? If one is an Amex Blue Cash Preferred, it gives up to ${money(credit.value)} a month back on Disney+, Hulu or ESPN billed to it, and you pay ${eligible.map(s => `${s.name} (${charged(s)})`).join(" and ")}.${citeLine([credit])}` }));
        else {
          const bcp = cards.filter(c => c && AMEX_RE.test(String(c.product || ""))).map(c => c.account_id);
          if (bcp.length) {
            const onCard = eligible.filter(s => bcp.includes(s.last.account_id)), elsewhere = eligible.filter(s => !bcp.includes(s.last.account_id));
            const room = Math.max(0, credit.value - onCard.reduce((a, s) => a + s.monthly_cents, 0));
            const gain = Math.min(room, elsewhere.reduce((a, s) => a + s.monthly_cents, 0));
            if (elsewhere.length && gain > 0) out.push(finding({ duty: "D2", method: "M3-SUBS-03", kind: "card_credit", service: elsewhere[0].id, plan: "amex_bcp", as_of: elsewhere.map(s => s.last.date).sort().slice(-1)[0], rows: elsewhere.map(s => s.last.id), terms: [credit], yearly_saving_cents: gain * 12,
              tradeoff: "the credit only counts while the bill is charged to that card",
              title: `Move ${elsewhere.map(s => s.name).join(" and ")} to your Amex Blue Cash Preferred: ${money(gain * 12)} a year back`,
              text: `${elsewhere.map(s => `${s.name} (${charged(s)})`).join(" and ")} ${elsewhere.length > 1 ? "are" : "is"} billed to another card, and you hold an Amex Blue Cash Preferred, which gives up to ${money(credit.value)} a month back on Disney+, Hulu or ESPN billed to it. Moving the bill gets ${money(gain)} a month back: ${money(gain * 12)} a year. Nothing needs cancelling.${citeLine([credit])}`,
              action: { type: "move_payment_method", by: "person", to: "your Amex Blue Cash Preferred", note: "You change the card on file yourself; then I check each statement for the credit." } }));
          }
        }
      }
      return { findings: out, questions };
    }

    // D3 rotation (M3-SUBS-08): three or more streaming services billed monthly at once. A plan, offered as a toggle that
    // starts off; every cancel and every restart still asks its own yes.
    function rotation(svc, today) {
      const live = Object.values(svc).filter(s => s.active && !s.yearly && SERVICES.find(x => x.id === s.id).streaming).sort((a, b) => b.monthly_cents - a.monthly_cents || a.id.localeCompare(b.id));
      if (live.length < ROTATION_MIN) return [];
      const total = live.reduce((a, s) => a + s.monthly_cents, 0), top = live[0].monthly_cents, saving = (total - top) * 12;
      const start = monthIndex(today) + 1;
      const schedule = live.map((s, i) => ({ month: monthName(start + i), keep: s.name }));
      return [finding({ duty: "D3", method: "M3-SUBS-08", kind: "rotation", service: "streaming", as_of: live.map(s => s.last.date).sort().slice(-1)[0], rows: live.map(s => s.last.id), terms: [], yearly_saving_cents: saving,
        services: live.map(s => ({ service: s.id, name: s.name, monthly_cents: s.monthly_cents, last_charged: s.last.date })), schedule,
        toggle: { name: "streaming rotation", on: false, turned_on_by: "the person", each_cancel_or_restart_asks: true },
        tradeoff: "you may lose old pricing or watch history after a long break",
        title: `${live.length} streaming services at once: rotating saves up to ${money(saving)} a year`,
        text: `You pay for ${live.length} streaming services at once (${live.map(s => `${s.name} ${money(s.monthly_cents)}`).join(", ")}): ${money(total)} a month together. Keeping one at a time and rotating costs at most ${money(top)} a month: up to ${money(saving)} a year less. The rotation is off; you'd turn it on yourself, and every cancel or restart still asks you first. The trade-off: you may lose old pricing or watch history after a long break.`,
        action: { type: "offer_toggle", toggle: "streaming rotation", on: false, cancels: live.map(s => cancelVia(s)) } })];
    }

    // D5 warehouse club math (M3-SHOP-07): 12 months of Costco spend against the two tiers, with the break-even.
    function warehouse(all, book, today) {
      const windowStart = addDays(today, -365);
      const inWindow = all.filter(r => r.service === "costco" && r.date > windowStart && days(r.date, today) >= 0);
      const costco = inWindow.filter(r => !r.refund), returns = inWindow.filter(r => r.refund);
      if (!costco.length) return [];
      const gold = cite(book, "price.costco.gold_star_cents", today), exec = cite(book, "price.costco.executive_cents", today);
      const rate = cite(book, "price.costco.executive_reward_rate", today), cap = cite(book, "price.costco.executive_reward_cap_cents", today);
      const terms = [gold, exec, rate, cap];
      const isFee = r => COSTCO_FEE_RE.test(r.merchant) && (r.cents === gold.value || r.cents === exec.value);
      const fees = costco.filter(isFee), buys = costco.filter(r => !isFee(r));
      const returned = returns.reduce((a, r) => a + r.cents, 0);
      const spend = Math.max(0, buys.reduce((a, r) => a + r.cents, 0) - returned);
      const tier = fees.length ? (fees[fees.length - 1].cents === exec.value ? "executive" : "gold_star") : null;
      const rateBps = Math.round(Number(rate.value) * 10000), diff = exec.value - gold.value;
      const reward = Math.min(Math.floor(spend * rateBps / 10000), cap.value);
      const breakEven = Math.ceil(diff * 10000 / rateBps);
      const earliest = all.length ? all[0].date : today, full = earliest <= addDays(today, -335);
      const asOf = inWindow[inWindow.length - 1].date, ids = inWindow.map(r => r.id);
      const tierName = { executive: "Executive", gold_star: "Gold Star" };
      const head = `Costco: ${money(spend)} spent in the last 12 months (${buys.length} charge${buys.length === 1 ? "" : "s"}${returns.length ? `, less ${money(returned)} in returns` : ""}, not counting the membership fee, through ${asOf}). Gold Star is ${money(gold.value)} a year and Executive ${money(exec.value)}, with ${pct(rate.value)} back up to ${money(cap.value)}: ${money(reward)} on your spend. Break-even: ${money(breakEven)} of spend a year.`;
      const base = { duty: "D5", method: "M3-SHOP-07", service: "costco", as_of: asOf, rows: ids, terms, spend_cents: spend, reward_cents: reward, break_even_cents: breakEven, tier };
      if (!full) return [finding(Object.assign(base, { kind: "warehouse_club", verdict: "not_enough_history",
        title: "Costco: not a full year of history yet",
        text: `${head} Your rows only go back to ${earliest}, so this is less than 12 months: I won't call upgrade or downgrade on part of a year.${citeLine(terms)}` }))];
      if (tier && !buys.length) return [finding(Object.assign(base, { kind: "warehouse_club", verdict: "cancel", yearly_saving_cents: fees[fees.length - 1].cents,
        title: `Costco: no purchases in 12 months; cancelling saves ${money(fees[fees.length - 1].cents)} a year`,
        text: `Costco: you paid the ${tierName[tier]} fee (${money(fees[fees.length - 1].cents)} on ${fees[fees.length - 1].date}) and no Costco purchases show in the last 12 months. Cancelling saves the fee: ${money(fees[fees.length - 1].cents)} a year.${citeLine(terms)}`,
        action: { type: "suggest_cancel", cancel: { flow: "cancel", capability_id: "BILL-003", service: "costco", ask: "cancel Costco membership", approvals_required: 1 } } }))];
      let verdict, saving = 0, said;
      if (tier === "gold_star") {
        if (reward > diff) { verdict = "upgrade"; saving = reward - diff; said = `You're on Gold Star: Executive would net ${money(saving)} a year.`; }
        else { verdict = "keep"; said = reward === diff ? "You're on Gold Star, right at the break-even: Executive would cost the same, so keep Gold Star." : `You're on Gold Star: keep it. Executive would cost ${money(diff - reward)} a year more than it pays back.`; }
      } else if (tier === "executive") {
        if (reward < diff) { verdict = "downgrade"; saving = diff - reward; said = `You're on Executive: Gold Star would save ${money(saving)} a year, since the reward doesn't cover the extra ${money(diff)}.`; }
        else { verdict = "keep"; said = reward === diff ? "You're on Executive, right at the break-even: either tier costs the same." : `You're on Executive: keep it. The reward nets ${money(reward - diff)} a year over Gold Star.`; }
      } else {
        verdict = reward > diff ? "executive_pays" : "gold_star_enough";
        said = reward > diff ? `I don't see your membership fee, but on this spend Executive would net ${money(reward - diff)} a year over Gold Star.` : "I don't see your membership fee, but on this spend Gold Star is enough: Executive would not pay for itself.";
      }
      return [finding(Object.assign(base, { kind: "warehouse_club", verdict, yearly_saving_cents: saving,
        title: verdict === "upgrade" ? `Costco Executive would net ${money(saving)} a year` : verdict === "downgrade" ? `Costco Gold Star would save ${money(saving)} a year` : "Costco: your tier fits your spend",
        text: `${head} ${said} Only eligible purchases earn the reward, so check what counts.${citeLine(terms)}`,
        action: verdict === "upgrade" || verdict === "downgrade" ? { type: "suggest_tier_change", by: "person", to: verdict === "upgrade" ? "executive" : "gold_star", note: "You change the tier yourself at Costco; nothing changes until you do." } : null }))];
    }

    // D6 Subscribe and Save stack (M3-SHOP-09): the same Amazon amount in three or more months is a staple; five or more
    // staples on one delivery date move from the small-order rate to the five-item rate. The rates are reported, not
    // Amazon's own published terms, and the finding says so.
    function subscribeAndSave(rows, book, today) {
      const windowStart = addDays(today, -365);
      const amazon = rows.filter(r => AMAZON_ONLY.has(r.service) && r.date > windowStart && days(r.date, today) >= 0);
      const byAmount = {};
      for (const r of amazon) (byAmount[r.cents] = byAmount[r.cents] || []).push(r);
      const staples = Object.entries(byAmount).map(([c, list]) => ({ cents: Number(c), rows: list, months: new Set(list.map(r => r.date.slice(0, 7))).size, yearly_cents: list.reduce((a, r) => a + r.cents, 0) }))
        .filter(s => s.months >= STAPLE_MIN).sort((a, b) => b.yearly_cents - a.yearly_cents || a.cents - b.cents);
      if (staples.length < STACK_MIN) return [];
      const small = cite(book, "store.amazon.sns_rate_small", today), five = cite(book, "store.amazon.sns_rate_five", today);
      const extraBps = Math.round(Number(five.value) * 10000) - Math.round(Number(small.value) * 10000);
      if (extraBps <= 0) return [];
      const spend = staples.reduce((a, s) => a + s.yearly_cents, 0), extra = Math.floor(spend * extraBps / 10000);
      const asOf = amazon[amazon.length - 1].date;
      return [finding({ duty: "D6", method: "M3-SHOP-09", kind: "subscribe_and_save", service: "amazon", as_of: asOf, rows: staples.flatMap(s => s.rows.map(r => r.id)), terms: [small, five], yearly_saving_cents: extra, reported: true,
        staples: staples.map(s => ({ amount_cents: s.cents, months: s.months, yearly_cents: s.yearly_cents })),
        tradeoff: "prices can rise after the first order, and dropping below five items on the date cuts the rate back",
        title: `Amazon Subscribe and Save: five on one date is about ${money(extra)} more a year (reported)`,
        text: `Amazon: ${staples.length} purchases repeat at the same amount (${staples.map(s => `${money(s.cents)} in ${s.months} months`).join(", ")}), ${money(spend)} in the last 12 months through ${asOf}. If they're on Subscribe and Save at ${pct(small.value)}, putting five or more on one delivery date lifts them to ${pct(five.value)}: about ${money(extra)} more a year. These rates are reported, not Amazon's published terms, and a charge can hold more than one item, so check which are the same product. The trade-off: prices can rise after the first order, and dropping below five items on the date cuts the rate back.${citeLine([small, five])}`,
        action: { type: "suggest_one_date", by: "person", where: "Amazon, Subscribe and Save", note: "You move the dates yourself; nothing changes until you do." } })];
    }

    function find(input) {
      if (!input || !ISO.test(String(input.today || ""))) throw new Error("today is required (YYYY-MM-DD)");
      if (!input.book || typeof input.book.term !== "function") throw new Error("the offer book is required (OfferBook.create(terms))");
      const today = input.today, book = input.book, facts = input.facts || {};
      const all = normalize(input.transactions).filter(r => days(r.date, today) >= 0), rows = all.filter(r => !r.refund);
      const svc = services(rows, book, today);
      const overlap = perkOverlap(svc, book, today, facts);
      const findings = [].concat(cheaperTier(svc, book, today), annualSwitch(svc, book, today), overlap.findings, rotation(svc, today), warehouse(all, book, today), subscribeAndSave(rows, book, today))
        .sort((a, b) => b.yearly_saving_cents - a.yearly_saving_cents || a.method.localeCompare(b.method) || a.service.localeCompare(b.service));
      const through = all.length ? all[all.length - 1].date : null;
      // No grand total: findings overlap (a rotation and a perk can name the same service), so their savings never add up.
      return { today, through, source: SOURCE, findings, questions: overlap.questions,
        note: "Estimates from your own charges and dated outside prices. Nothing is cancelled, switched or turned on unless you say yes to each one." };
    }

    // The same findings in the save engine's opportunity shape (49-agent-save.js), so "find me money" ranks them with
    // everything else. The title carries the cite, so a stale term is said in the ranked line too.
    function opportunities(result) {
      return ((result && result.findings) || []).filter(f => f.yearly_saving_cents > 0).map(f => ({
        play: "P1_subscription", key: `subs_save:${f.kind}:${f.service}`, method: f.method, duty: f.duty, capability_id: "BILL-012", tier: "T0",
        title: `${f.title}${citeLine(f.terms)}`, one_time_cents: 0, expected_monthly_cents: Math.round(f.yearly_saving_cents / 12), estimate: true,
        confidence: f.kind === "rotation" || f.reported || f.stale ? "medium" : "high", stale: f.stale,
        action: f.action, evidence: { rule: f.method, rows: f.rows, computed: { yearly_saving_cents: f.yearly_saving_cents, as_of: f.as_of } } }));
    }

    // The chat's words for a set of findings and questions, every line already carrying its numbers' source.
    function render(result, opts) {
      const o = opts || {}, findings = (result.findings || []).slice(0, o.limit || 5), questions = result.questions || [];
      const lines = [];
      if (findings.length) {
        lines.push(o.lead || "Here's what your own charges show, biggest saving first:");
        findings.forEach((f, i) => lines.push(`${i + 1}. ${f.text}`));
      }
      for (const q of questions) lines.push(q.text);
      if (!lines.length) return null;
      if (findings.some(f => f.action && (f.action.cancel || f.action.cancels))) lines.push("To cancel a paid one, say \"cancel\" and its name: each cancellation gets its own card and its own yes.");
      lines.push(`From ${SOURCE}, transactions through ${result.through}. Estimates, not savings yet. Nothing is cancelled, switched or turned on unless you say yes to each one.`);
      return lines.join("\n");
    }

    return { find, opportunities, render, normalize, serviceOf, SERVICES, TIERS, ANNUAL, ANNUAL_MIN_MONTHS, ROTATION_MIN, STACK_MIN, money };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = SubscriptionSavings;
