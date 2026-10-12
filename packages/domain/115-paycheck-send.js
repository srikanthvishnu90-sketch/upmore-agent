  /* A send that waits for the person's paycheck (megadoc A15 "pay maya 40 but only if my paycheck landed"). Upmore never
     sends on its own: if a paycheck has landed (a payroll deposit posted today or yesterday in the person's day), the
     send card goes up now and needs its yes; if not, the send is saved and the hourly run asks for the card when the next
     paycheck posts, once. Other conditions ("if it's sunny", "when maya asks") stay the send flow's not-built answer.
       parse(words)                       { command, name, amount_cents } for a send on a paycheck condition, or null
       landed(rows, now, tz)              { landed, last }: the latest payroll deposit, and whether it is today's or
                                          yesterday's
       watch(parsed, now, tz)             the watch to save: { id, kind: "paycheck_send", command, name, amount_cents,
                                          created_on, status }
       command(words, watches)            "cancel the paycheck send to maya", "show my paycheck sends": { watches | null,
                                          reply } or null
       due(watches, rows, now, tz, sent)  the questions to ask now: { key, text, offer } once each (key paysend:<id>)
     A payroll deposit is a posted credit whose bank words say payroll, direct deposit, salary or paycheck. A watch older
     than 35 days says nothing (it lapsed). Stored as a person-set watch (no migration; no run of 9+ digits). Pure.
     Depth packet PAYCHECK-SEND. */
  const PaycheckSend = (() => {
    const KIND = "paycheck_send", DAY = 86400000, LAPSE_DAYS = 35;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const md = (d) => `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}`;
    const money = (c) => "$" + Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(c % 100).padStart(2, "0");
    const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
    const addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
    function todayOf(now, tz) { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now)); } catch (e) { return new Date(now).toISOString().slice(0, 10); } }
    const PAY = "(?:my )?(?:paycheck|pay ?check|payday|pay day|salary|direct deposit|pay)";
    const LANDS = "(?:has |is |have )?(?:landed|lands|land|hits|hit|has hit|comes in|came in|clears|cleared|arrives|arrived|posts|posted|is in|goes through|went through|gets? deposited|deposits?)";
    const COND = new RegExp(`\\s*,?\\s*(?:but\\s+)?(?:only\\s+)?(?:if|when|once|after)\\s+${PAY}(?:\\s+${LANDS})?\\s*$|\\s*,?\\s*(?:but\\s+)?(?:only\\s+)?after\\s+(?:payday|pay day|i get paid)\\s*$|\\s*,?\\s*(?:but\\s+)?(?:only\\s+)?(?:if|when|once)\\s+i(?:'ve)?\\s+(?:get|got|been)\\s+paid\\s*$`, "i");
    const SEND = /^(?:send|pay|venmo|zelle|cash ?app|paypal)\s+/i;
    function parse(words) {
      const t = String(words || "").replace(/[‘’]/g, "'").trim().replace(/^\s*(?:please|pls|can you|could you)\s+/i, "").replace(/[.!?]+$/, "");
      if (!SEND.test(t)) return null;
      const m = COND.exec(t);
      if (!m) return null;
      const command = t.slice(0, m.index).trim(), body = command.replace(SEND, "");
      const am = /(?:^|\s)\$?(\d{1,6}(?:\.\d{1,2})?)(?=$|\s)/.exec(body);
      const name = body.replace(am ? am[0] : "", " ").replace(/\b(?:to|for .*$|dollars?|bucks)\b/gi, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 2).join(" ");
      if (!am || !name || /\d/.test(name) || /\b(?:rent|bill|bills|card|loan)\b/i.test(name)) return null;
      const cents = Math.round(Number(am[1]) * 100);
      if (!(cents > 0) || cents > 1000000) return null;
      return { command: command.toLowerCase(), name: name.toLowerCase(), amount_cents: cents };
    }
    const PAYROLL = /\b(?:payroll|dir(?:ect)? ?dep(?:osit)?|salary|paycheck|pay ?check)\b/i;
    const cents = (r) => (r && r.amount_cents !== null && r.amount_cents !== undefined && Number.isFinite(Number(r.amount_cents)) ? Math.round(Number(r.amount_cents)) : NaN);
    const dayOf = (r) => (typeof r.posted_on === "string" ? r.posted_on.slice(0, 10) : null);
    const payrolls = (rows) => (rows || []).filter((r) => r && !r.is_pending && cents(r) > 0 && dayOf(r) && !r.is_transfer && PAYROLL.test(String(r.merchant_raw || r.description || ""))).sort((a, b) => dayOf(b).localeCompare(dayOf(a)));
    function landed(rows, now, tz) {
      const today = todayOf(now, tz), all = payrolls(rows), last = all[0] || null;
      return { landed: !!last && dayOf(last) >= addDays(today, -1) && dayOf(last) <= addDays(today, 1), last };
    }
    const said = (r) => `${money(cents(r))}, "${String(r.merchant_raw || r.description || "").replace(/\s+/g, " ").trim().slice(0, 40)}", on ${md(dayOf(r))}`;
    function watch(p, now, tz) {
      return { id: `ps-${now.toString(36)}`, kind: KIND, command: p.command.slice(0, 120), name: p.name, amount_cents: p.amount_cents, created_on: todayOf(now, tz), status: "active" };
    }
    const isWatch = (w) => w && w.kind === KIND && w.status !== "stopped";
    const restate = (w) => `send ${cap(w.name)} ${money(w.amount_cents)}`;
    const CANCEL = /^\s*(?:please\s+)?(?:cancel|stop|delete|remove|drop|forget)\s+(?:the\s+|my\s+|all\s+(?:my\s+)?)?paycheck\s+(?:sends?|payments?)(?:\s+to\s+([a-z][a-z'-]*))?\s*[.!]*$/i;
    const SHOW = /^\s*(?:show|list|what are)\s+(?:me\s+)?(?:my\s+)?paycheck\s+(?:sends|payments)\b/i;
    function command(words, watches) {
      const t = String(words || "").replace(/[‘’]/g, "'"), all = watches || [], have = all.filter(isWatch);
      let m;
      if ((m = CANCEL.exec(t))) {
        const who = m[1] ? m[1].toLowerCase() : null, drop = have.filter((w) => !who || w.name.split(" ")[0] === who);
        if (!drop.length) return { watches: null, reply: who ? `You don't have a send to ${cap(who)} waiting on your paycheck, so nothing changed.` : "You don't have any sends waiting on your paycheck, so nothing changed." };
        return { watches: all.filter((w) => !drop.includes(w)), reply: `Cancelled: ${drop.map(restate).join("; ")}, waiting on your paycheck. Nothing was sent. Nothing else changed.` };
      }
      if (SHOW.test(t)) return { watches: null, reply: have.length ? `Waiting on your paycheck: ${have.map(restate).join("; ")}. Each asks you for the card when a paycheck posts; nothing is sent without your yes.` : "You don't have any sends waiting on your paycheck." };
      return null;
    }
    function due(watches, rows, now, tz, sent) {
      const done = new Set(sent || []), today = todayOf(now, tz), out = [], pays = payrolls(rows);
      for (const w of (watches || []).filter(isWatch)) {
        const key = `paysend:${w.id}`;
        if (done.has(key) || addDays(w.created_on, LAPSE_DAYS) < today) continue;
        // A paycheck that posted on or after the day the send was set up (the set-up checked the days before and found none).
        const p = pays.find((r) => dayOf(r) >= w.created_on);
        if (!p) continue;
        out.push({ key, text: `Your paycheck posted: ${said(p)}. You asked me to ${restate(w)} after it lands. Want the card? Reply yes and I'll put it up (it needs its own yes), or no to skip it.`, offer: { kind: "scheduled_send", id: w.id, command: w.command, name: w.name, amount_cents: w.amount_cents, at_ms: now } });
      }
      return out;
    }
    return { KIND, parse, landed, watch, command, due, isWatch, restate, said };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = PaycheckSend;
