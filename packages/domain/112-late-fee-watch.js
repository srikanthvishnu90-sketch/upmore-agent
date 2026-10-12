  /* Late-fee alert (megadoc D15: "set a late fee alert for bills"). The person turns it on in chat; it is restated in
     exact terms and stored as a person-set watch of kind "late_fee" in agent_proactive_settings.watches (no migration):
       { id, kind: "late_fee", created_on, status: "active", text }
     From then on, each charge the bank's own words call a late fee ("LATE FEE", "LATE PAYMENT FEE", "LATE CHARGE",
     "LATE PMT FEE") that posts on or after the day it was set is said once, with its amount to the cent, the bank's words,
     the account when the row names it, and the posted date, from the person's bank rows. It is a watch the person asked
     for, so it comes through outside the daily budget and once only by its log key (latefee:<row id>).
     It only tells: nothing is paid, disputed or asked of the bank. Bank rows are saved only when the person refreshes
     their connected bank, so a fee is seen after the refresh that brings it in; the set reply says so.
       command(words, watches, now, tz)   set, stop or show; a new watch list and the reply (null for anything else)
       alerts(watches, transactions, now, { sent })   the messages to send now: { key, text } each
     Pure: rows and the clock are passed in. Depth packet LATE-FEE (tests/depth-LATE-FEE.test.cjs). */
  const LateFeeWatch = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const KIND = "late_fee", money = MA.money;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const md = (d) => `${MON[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
    // The bank's own words for a late fee. "Late night" or "Late Show" tickets are never fees: the word "fee", "charge"
    // or "penalty" must follow.
    const FEE = /\blate\s*(?:payment\s*|pmt\s*|pay\s*)?(?:fee|charge|chg|penalty)\b|\blate\s*fee\b/i;
    const NOT_FEE = /\breversal\b|\brefund\b|\bwaive[sd]?\b|\bcredit\b|\badj(?:ustment)?\b/i;
    const isWatch = (w) => w && w.kind === KIND && w.status !== "stopped";
    const SET = /^\s*(?:please\s+|pls\s+|can you\s+|could you\s+)?(?:set(?:\s+up)?|turn on|start|add|create|make)\s+(?:a\s+|an\s+|the\s+|my\s+)?late[- ]?fee\s+(?:alert|watch|warning|notification)s?\b|^\s*(?:please\s+)?(?:alert|tell|warn|notify|text|ping)\s+me\s+(?:if|when|whenever|about|of)\s+(?:i\s+(?:get|got|am|'m)\s+(?:charged\s+|hit with\s+)?)?(?:a\s+|any\s+)?late\s*(?:payment\s*)?fees?\b|^\s*(?:let me know|tell me)\s+(?:if|when)\s+(?:i\s+(?:get|got|am|'m)\s+(?:charged\s+|hit with\s+)?)?(?:a\s+|any\s+)?late\s*fees?\b/i;
    const STOP = /^\s*(?:please\s+)?(?:stop|turn off|cancel|remove|delete|end|disable|no more)\s+(?:the\s+|my\s+)?late[- ]?fee\s+(?:alert|watch|warning|notification)s?\b|^\s*(?:stop|quit)\s+(?:telling|alerting|warning)\s+me\s+about\s+late\s*fees?\b/i;
    const SHOW = /^\s*(?:is\s+)?(?:my\s+)?late[- ]?fee\s+(?:alert|watch)\s+(?:on|set|active)\b|^\s*do i have\s+(?:a\s+)?late[- ]?fee\s+(?:alert|watch)\b/i;
    const TERMS = "When a charge your bank calls a late fee posts on any linked account, I'll tell you once, with the amount, your bank's words, the account and the date, from your bank rows. I see new charges after you refresh your connected bank. It only tells you: nothing is paid, disputed or asked of the bank. Say \"stop the late fee alert\" to turn it off.";
    function todayOf(now, tz) { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now)); } catch (_) { return new Date(now).toISOString().slice(0, 10); } }
    function command(words, watches, now, tz) {
      const t = String(words || "").replace(/[‘’]/g, "'"), have = (watches || []).filter(isWatch);
      if (STOP.test(t)) {
        if (!have.length) return { watches: null, reply: "You don't have a late-fee alert on, so nothing changed." };
        return { watches: (watches || []).filter((w) => !isWatch(w)), reply: "Late-fee alert off. I won't tell you about late fees anymore. Nothing else changed." };
      }
      if (SHOW.test(t)) return { watches: null, reply: have.length ? `Your late-fee alert is on, since ${md(have[0].created_on)}. ${TERMS}` : "You don't have a late-fee alert on. Say \"set a late fee alert\" to turn one on." };
      if (!SET.test(t)) return null;
      if (have.length) return { watches: null, reply: `Your late-fee alert is already on, since ${md(have[0].created_on)}. Nothing changed.` };
      const day = todayOf(now, tz);
      const w = { id: `latefee-${day.replace(/-/g, "")}`, kind: KIND, created_on: day, status: "active", text: "Tell me when a late fee posts" };
      return { watches: (watches || []).concat([w]), reply: `Late-fee alert on, from today (${md(day)}). ${TERMS}` };
    }
    const cents = (r) => (r && r.amount_cents !== null && r.amount_cents !== undefined && Number.isFinite(Number(r.amount_cents)) ? Math.round(Number(r.amount_cents)) : NaN);
    const dayOf = (r) => (typeof r.posted_on === "string" ? r.posted_on.slice(0, 10) : null);
    // A late fee the bank's words name, posted (never pending), a charge, on or after the day the alert was set.
    function fees(watch, rows) {
      return (rows || []).filter((r) => r && !r.is_pending && cents(r) < 0 && dayOf(r) && dayOf(r) >= watch.created_on && FEE.test(String(r.merchant_raw || r.description || "")) && !NOT_FEE.test(String(r.merchant_raw || r.description || "")));
    }
    function alerts(watches, rows, now, opts) {
      const o = opts || {}, sent = new Set(o.sent || []), w = (watches || []).find(isWatch);
      if (!w) return [];
      const out = [];
      for (const r of fees(w, rows).sort((a, b) => dayOf(a).localeCompare(dayOf(b)))) {
        const key = `latefee:${r.id || `${dayOf(r)}:${cents(r)}:${String(r.merchant_raw || "").slice(0, 40)}`}`;
        if (sent.has(key)) continue;
        const words = String(r.merchant_raw || r.description || "").replace(/\s+/g, " ").trim().slice(0, 60);
        out.push({ key, row_id: r.id || null, cents: -cents(r), text: `A late fee posted: ${money(-cents(r))}, "${words}"${r.account_name ? ` on ${r.account_name}` : ""}, ${md(dayOf(r))}. Your bank or card issuer is who can waive it; Upmore hasn't contacted anyone.` });
      }
      return out;
    }
    return { KIND, FEE, command, alerts, fees, isWatch };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = LateFeeWatch;
