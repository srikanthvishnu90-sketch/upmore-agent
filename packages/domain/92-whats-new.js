  /* What's new: the review inbox in chat (overnight H1; teardown rows T1-ORIGIN-028 Review Transactions, T2-COPILOT-068/160
     Mark as reviewed / To Review, T2-MONARCH-065/066 Needs Review, T2-YNAB-218 New transactions banner). "what's new?"
     lists what posted since the person last asked, from their own rows, and flags what deserves a look:
       - a charge well above that merchant's usual amount (more than twice its median of earlier charges, at least $20 more),
       - a merchant seen for the first time in their history,
       - the same amount at the same merchant twice on one day,
       - a fee (overdraft, late, ATM, foreign transaction, service, interest charge).
     The "reviewed through" marker is the date in Upmore's own last "what's new" reply in this thread, read back from the
     thread (no table): the first time, the last 7 days. Answering marks those rows reviewed, and the reply says so. Every
     name goes through MerchantLabel; every reply ends with its source and as-of. Pure; tests/whats-new.test.cjs, depth
     packet WHATS-NEW. */
  const WhatsNew = (() => {
    const label = raw => (typeof MerchantLabel !== "undefined" ? MerchantLabel : require("./32-merchant-label.js")).safe(raw);
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const validYmd = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
    const nice = s => `${MON[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}`;
    const addDays = (s, n) => new Date(Date.parse(s + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
    const money = c => (c < 0 ? "-" : "") + "$" + (Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const FIRST_DAYS = 7, SHOW = 12;
    const MARKER = /^Reviewed through (\d{4}-\d{2}-\d{2})\b/m;
    const FEE = /\b(?:overdraft|nsf|insufficient funds|late (?:fee|charge|payment fee)|atm (?:fee|surcharge)|foreign (?:transaction )?fee|service (?:fee|charge)|monthly (?:maintenance )?fee|maintenance fee|interest charge|returned (?:item|payment) fee)\b/i;
    const ASK = /^\s*(?:hey|hi|ok|okay|so|yo)?[,\s]*(?:what'?s new|whats new|anything new|any new (?:transactions|charges|activity)|new transactions|what did i miss|what came in|what posted|what'?s changed|review my (?:transactions|charges|spending)|anything (?:i should|to) (?:look at|review|check)|show (?:me )?(?:my )?new (?:transactions|charges|activity))(?:\s+(?:today|lately|recently|since (?:last time|yesterday)|in my accounts?|on my accounts?|with my money))?\s*[?.!]*\s*$/i;

    function isAsk(message) { return ASK.test(String(message || "")); }

    // The marker from Upmore's own last "what's new" reply in this thread (newest first), or null.
    function markerFrom(previous) {
      for (const m of previous || []) {
        if (!m || m.role !== "assistant") continue;
        const hit = MARKER.exec(String(m.content || ""));
        if (hit && validYmd(hit[1])) return hit[1];
      }
      return null;
    }

    const usd = r => !r.currency || r.currency === "USD";
    const keyOf = r => String(r.merchant_raw || "").toUpperCase().replace(/[#*]?\d[\d\-*#]*/g, " ").replace(/[^A-Z& ]+/g, " ").replace(/\s+/g, " ").trim();
    const median = xs => { const s = xs.slice().sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2)) : null; };

    function answer(message, ctx) {
      if (!isAsk(message)) return null;
      const c = ctx || {}, today = c.today, rows = (c.transactions || []).filter(r => r && validYmd(String(r.posted_on || "").slice(0, 10)) && Number.isFinite(r.amount_cents) && !r.is_transfer);
      if (!(c.transactions || []).length) return { kind: "none_linked", text: "I don't see a connected bank or card yet, so there's nothing to review. Connect one in the app (Home, then Connect bank) and ask again." };
      const marker = markerFrom(c.previous);
      const from = marker ? addDays(marker, 1) : addDays(today, -(FIRST_DAYS - 1));
      const day = r => String(r.posted_on).slice(0, 10);
      const fresh = rows.filter(r => day(r) >= from && day(r) <= today).sort((a, b) => (day(a) < day(b) ? 1 : day(a) > day(b) ? -1 : Math.abs(b.amount_cents) - Math.abs(a.amount_cents)));
      const through = rows.map(day).filter(d => d <= today).sort().slice(-1)[0] || null;
      const since = marker ? `since you last checked (reviewed through ${nice(marker)})` : `in the last ${FIRST_DAYS} days`;
      const lines = [];
      if (!fresh.length) {
        lines.push(`Nothing new has posted ${since}.`);
      } else {
        const out = fresh.filter(r => r.amount_cents < 0 && usd(r)).reduce((s, r) => s - r.amount_cents, 0);
        const inn = fresh.filter(r => r.amount_cents > 0 && usd(r)).reduce((s, r) => s + r.amount_cents, 0);
        const foreign = fresh.filter(r => !usd(r)).length;
        lines.push(`${fresh.length} new ${fresh.length === 1 ? "transaction" : "transactions"} ${since}: ${money(out)} out, ${money(inn)} in${foreign ? ` (and ${foreign} in another currency, not added in)` : ""}.`);
        // What deserves a look, each flag from the person's own earlier rows.
        const flags = [];
        const earlier = rows.filter(r => day(r) < from && r.amount_cents < 0);
        for (const r of fresh) {
          if (r.amount_cents >= 0) continue;
          const k = keyOf(r), name = label(r.merchant_raw);
          const prior = earlier.filter(x => keyOf(x) === k).map(x => -x.amount_cents);
          if (FEE.test(String(r.merchant_raw || ""))) flags.push(`${name}, ${money(-r.amount_cents)} on ${nice(day(r))}, is a fee.`);
          else if (!prior.length && earlier.length) flags.push(`${name} (${money(-r.amount_cents)} on ${nice(day(r))}) is new: no earlier charge from it in your history.`);
          else if (prior.length >= 2) {
            const med = median(prior);
            if (-r.amount_cents > 2 * med && -r.amount_cents - med >= 2000) flags.push(`${name} charged ${money(-r.amount_cents)} on ${nice(day(r))}, more than twice its usual ${money(med)}.`);
          }
          const twin = fresh.find(x => x !== r && keyOf(x) === k && day(x) === day(r) && x.amount_cents === r.amount_cents && x.account_id === r.account_id);
          if (twin && fresh.indexOf(twin) > fresh.indexOf(r)) flags.push(`${name} charged ${money(-r.amount_cents)} twice on ${nice(day(r))}; if that's one purchase, say "dispute the ${money(-r.amount_cents)} charge on ${nice(day(r))}".`);
        }
        if (flags.length) { lines.push("Worth a look:"); for (const f of flags.slice(0, 6)) lines.push(`- ${f}`); }
        lines.push("Everything new:");
        for (const r of fresh.slice(0, SHOW)) lines.push(`- ${nice(day(r))}: ${label(r.merchant_raw)}, ${r.amount_cents < 0 ? money(-r.amount_cents) : `+${money(r.amount_cents)}`}${usd(r) ? "" : ` ${r.currency}`}${r.is_pending ? " (pending)" : ""}`);
        if (fresh.length > SHOW) lines.push(`- and ${fresh.length - SHOW} more.`);
      }
      const markTo = through && through >= from ? through : (marker || addDays(today, -FIRST_DAYS));
      lines.push(`Reviewed through ${markTo}. Next time you ask, I'll show what posts after that.${marker ? " A charge that posts late under an earlier date won't show here; ask for this week's spending to see everything." : ""}`);
      lines.push(`From your linked accounts, transactions through ${through ? nice(through) + ", " + through.slice(0, 4) : "none yet"}.`);
      return { kind: "whats_new", count: fresh.length, from, marker, through: markTo, text: lines.join("\n") };
    }

    return { isAsk, answer, markerFrom, FEE };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = WhatsNew;
