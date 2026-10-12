  /* "I got charged for something I cancelled" (megadoc J08), from the person's own rows. Read-only; nothing is sent.
       ask(words)                                   null | { name, date, month, ago }   (name null when none was said)
       answer({ message, now, tz, transactions, cancellations })
     The cancel day comes from the cancel flow's own record (68-agent-cancel.js cases: { merchant, name, state,
     cancelled_at, reference }; cancelled, verified or accepted, the merchant's own record) or from the day the person
     says ("on Sep 20", "9/20", "in September" = after Sep 30, "last month"). Charges from that merchant (whole-word name
     match) posted after the cancel day are listed to the cent; one posted within 2 days after may have been made before
     the cancel (banks post a day or two late) and is said so. With no cancel day on file and none said, the charges of the
     last 90 days are listed and the day is asked, never assumed. A record that isn't cancelled is never called cancelled.
     The next step is the merchant first (a draft the person sends), then the dispute flow by name. Pure. Depth packet
     CANCELLED-CHARGE. */
  const CancelledCharge = (() => {
    const MA = typeof MoneyAnswers !== "undefined" ? MoneyAnswers : require("./80-money-answers.js");
    const DAY = 86400000, LAG_DAYS = 2, BACK_DAYS = 90;
    const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const DONE = ["cancelled", "verified", "accepted"];
    const money = MA.money;
    const cents = (r) => (r && Number.isSafeInteger(Number(r.amount_cents)) ? Number(r.amount_cents) : NaN);
    const dayOf = (r) => (r && typeof r.posted_on === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.posted_on) ? r.posted_on.slice(0, 10) : null);
    const addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
    const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);
    const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const pad = (n) => String(n).padStart(2, "0");
    const label = (ymd, today) => `${MONTHS[+ymd.slice(5, 7) - 1].slice(0, 3)} ${+ymd.slice(8, 10)}${today && today.slice(0, 4) !== ymd.slice(0, 4) ? `, ${ymd.slice(0, 4)}` : ""}`;
    // The name as whole words in the bank text, or run together across whole words ("planet fitness" in "PLANETFITNESS
    // 123", "netflix" in "NETFLIX.COM"); never inside a longer word ("hulu" is not "HULULAND").
    const toks = (x) => String(x || "").toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
    function nameMatch(raw, name) {
      const w = toks(raw), q = toks(name), sq = q.join("");
      if (!q.length || !sq) return false;
      for (let a = 0; a < w.length; a++) {
        if (q.every((t, k) => w[a + k] === t)) return true;
        let run = "";
        for (let b = a; b < w.length && run.length < sq.length; b++) { run += w[b]; if (run === sq) return true; }
      }
      return false;
    }
    const cap = (s) => String(s).replace(/(^|[\s'.&-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

    const LEAD = /^\s*(?:(?:hey|hi|ok|okay|so|yo|ugh|um|upmore)[,\s]+)*/i;
    const clean = (m) => String(m || "").toLowerCase().replace(/[’‘]/g, "'").replace(LEAD, "").replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").trim();
    // The cancel words and the charge words, in either order: "charged ... after i cancelled", "i cancelled X but they
    // still charged me", "still being billed for X even though i cancelled".
    const CANCEL = /\b(?:cancel(?:l)?ed|canceled|unsubscribed)\b/;
    const CHARGE = /\b(?:charg(?:e|ed|es|ing)|bill(?:ed|ing|s)?|took|taking|debited|renewed)\b/;
    const NOT_THIS = /\bdispute\b|\bchargeback\b|\bwin[- ]?back\b|\bcome back\b|\bresubscribe\b|\btrial\b|\bhow (?:do|can) i cancel\b|\bcancel (?:my|the|it)\b(?!.*\b(?:cancel(?:l)?ed|canceled)\b)/;
    const GENERIC = /^(?:something|it|that|this|them|a subscription|my subscription|the subscription|a service|my membership|the membership|an? (?:app|account)|my account|stuff|things?|everything|subscriptions?|they|he|she|you)$/;
    const NAME_PATTERNS = [
      /\b(?:cancel(?:l)?ed|canceled|unsubscribed from)\s+(?:my\s+|the\s+|our\s+)?(.+?)(?:\s+(?:subscription|membership|account|plan|service))?(?:\s+(?:on|in|last|back|like|a|an|over|already|about|around|weeks?|days?|months?|\d+|one|two|three|yesterday|today|this)\b.*|\s*(?:,|\bbut\b|\band\b|\byet\b|\bstill\b|\bthey\b|\bit\b).*)?$/,
      /^(?:why (?:is|did|does|has|was)\s+)?(.+?)\s+(?:still\s+)?(?:charg(?:ed|ing|es)|bill(?:ed|ing|s)|took money from)\s+(?:me|my)\b/,
      /\b(?:charged|billed)\s+(?:me\s+)?(?:again\s+)?(?:for|by)\s+(?:my\s+|the\s+)?(.+?)\s+(?:after|even though|though|although|but|when|since|despite)\b/,
    ];
    function nameIn(t) {
      for (const re of NAME_PATTERNS) {
        const m = re.exec(t);
        if (!m) continue;
        let n = m[1].replace(/^(?:i\s+)?(?:already\s+)?/, "").replace(/\s+(?:subscription|membership|account|plan|service)$/, "").replace(/\s+(?:still|again|anyway)$/, "").trim();
        // A date where the name should be ("cancelled in august") is no name here; the next form may have one.
        if (/\b(?:i|i'm|i've)\b/.test(n) || n.split(" ").length > 4 || /^(?:in|on|last|about|around|a|an|it|that|this|\d)\b/.test(n)) continue;
        if (!n || GENERIC.test(n) || /^(?:my|the|a)\s+\w+s$/.test(n)) return null;
        return n;
      }
      return null;
    }
    // The cancel day the person says: "on sep 20", "sep 20th", "9/20", "in september", "last month", "2 weeks ago".
    function dateIn(t, today) {
      let m;
      const y = +today.slice(0, 4);
      if ((m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/.exec(t))) {
        const mm = MON.indexOf(m[1].slice(0, 3)) + 1, dd = +m[2];
        let yy = m[3] ? +m[3] : y;
        if (dd < 1 || dd > lastDay(yy, mm)) return { bad: true };
        let d = `${yy}-${pad(mm)}-${pad(dd)}`;
        if (!m[3] && d > today) { yy -= 1; d = `${yy}-${pad(mm)}-${pad(Math.min(dd, lastDay(yy, mm)))}`; }
        return d > today ? { bad: true } : { date: d, said: label(d, today) };
      }
      if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t))) {
        const mm = +m[1], dd = +m[2];
        let yy = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : y;
        if (mm < 1 || mm > 12 || dd < 1 || dd > lastDay(yy, mm)) return { bad: true };
        let d = `${yy}-${pad(mm)}-${pad(dd)}`;
        if (!m[3] && d > today) { yy -= 1; d = `${yy}-${pad(mm)}-${pad(dd)}`; }
        return d > today ? { bad: true } : { date: d, said: label(d, today) };
      }
      // A month without a day: the cancel was some time in it, so only charges after its last day count.
      if ((m = /\b(?:in|during|back in|early|mid|late)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/.exec(t))) {
        const mm = MONTHS.map((x) => x.toLowerCase()).indexOf(m[1]) + 1;
        let yy = y; if (`${yy}-${pad(mm)}-01` > today) yy -= 1;
        return { date: `${yy}-${pad(mm)}-${pad(lastDay(yy, mm))}`, said: `in ${MONTHS[mm - 1]}`, month: true };
      }
      if (/\blast month\b/.test(t)) {
        const mo = +today.slice(5, 7), yy = mo === 1 ? y - 1 : y, mm = mo === 1 ? 12 : mo - 1;
        return { date: `${yy}-${pad(mm)}-${pad(lastDay(yy, mm))}`, said: "last month", month: true };
      }
      if ((m = /\b(\d{1,2}|a|one|two|three) (day|week|month)s? ago\b/.exec(t))) {
        const n = { a: 1, one: 1, two: 2, three: 3 }[m[1]] || +m[1], unit = { day: 1, week: 7, month: 30 }[m[2]];
        // "2 weeks ago" is a rough day: counted back exactly, with slack (3 days a week, 7 a month) in which a charge is said
        // as maybe before the cancel, never as certainly after it.
        return { date: addDays(today, -n * unit), said: `${m[1] === "a" ? "a" : n} ${m[2]}${n === 1 ? "" : "s"} ago`, rough: true, slack: m[2] === "day" ? 0 : unit === 7 ? 3 : 7 };
      }
      return null;
    }
    function ask(words) {
      const t = clean(words);
      if (!t || t.length > 200 || !CANCEL.test(t) || !CHARGE.test(t) || NOT_THIS.test(t)) return null;
      return { name: nameIn(t), text: t };
    }

    // The person's cancellation of this merchant on file: the latest one the merchant's own record calls cancelled, or
    // the latest attempt that isn't (said as not confirmed).
    function recordFor(name, cancellations) {
      const mine = (cancellations || []).filter((c) => c && (nameMatch(c.name, name) || nameMatch(c.merchant, name) || (c.name && nameMatch(name, c.name))));
      const done = mine.filter((c) => DONE.includes(c.state) && Number.isFinite(c.cancelled_at)).sort((a, b) => a.cancelled_at - b.cancelled_at);
      if (done.length) return { done: done[done.length - 1] };
      return mine.length ? { open: mine[mine.length - 1] } : null;
    }
    function answer(input) {
      const o = input || {}, q = typeof o.message === "string" ? ask(o.message) : o.message;
      if (!q) return null;
      const tz = o.tz || "UTC", now = o.now, today = MA.todayIn(now, tz), rows = (o.transactions || []).filter((r) => r && dayOf(r) && Number.isFinite(cents(r)) && (!r.currency || String(r.currency).toUpperCase() === "USD"));
      const src = MA.txSource(o.transactions || [], tz), records = o.cancellations;
      const said = dateIn(q.text || "", today);
      const confirmed = (records || []).filter((c) => c && DONE.includes(c.state) && Number.isFinite(c.cancelled_at));
      // Which service: the one named, else the only one Upmore cancelled, else asked.
      let name = q.name, rec = null;
      if (!name) {
        const names = [...new Set(confirmed.map((c) => c.name || MA.display(c.merchant)))];
        if (names.length === 1) name = names[0];
        else {
          const lead = records === null ? "I can't read the cancellations I've done for you right now, and you didn't say which service. " : names.length ? `You've cancelled ${names.join(", ")} with me. ` : "";
          return `${lead}Which service charged you after you cancelled? Say it like "I cancelled Hulu on Sep 20 and still got charged", and I'll check your charges from it.`;
        }
      }
      rec = recordFor(name, records || []);
      const shown = cap(rec && rec.done && rec.done.name ? rec.done.name : rec && rec.open && rec.open.name ? rec.open.name : name);
      const posted = rows.filter((r) => !r.is_pending && cents(r) < 0 && !r.is_transfer && nameMatch(r.merchant_raw, name) && dayOf(r) <= addDays(today, 1));
      const pending = rows.filter((r) => r.is_pending && cents(r) < 0 && nameMatch(r.merchant_raw, name));
      const lines = [];
      // The cancel day: the merchant's own record first, then the person's words.
      let cancelDay = null, how = "";
      if (rec && rec.done) {
        cancelDay = MA.todayIn(rec.done.cancelled_at, tz);
        how = `${shown}'s own record when I cancelled it for you${rec.done.reference ? `, confirmation ${String(rec.done.reference).slice(0, 40)}` : ""}`;
      } else if (said && !said.bad) {
        cancelDay = said.date;
        how = said.month ? "the month you gave" : said.rough ? "counted from when you said" : "the day you gave";
      }
      if (!cancelDay) {
        const recent = posted.filter((r) => daysBetween(dayOf(r), today) <= BACK_DAYS).sort((a, b) => dayOf(b).localeCompare(dayOf(a)));
        if (rec && rec.open) lines.push(`I tried to cancel ${shown} for you, but ${shown}'s record never said cancelled (it reads ${String(rec.open.state || "unknown").replace(/_/g, " ")}), so I can't call it cancelled.`);
        if (said && said.bad) lines.push("I couldn't read the day you cancelled.");
        lines.push(recent.length
          ? `Your charges from ${shown} in the last ${BACK_DAYS} days: ${recent.slice(0, 4).map((r) => `${money(-cents(r))} on ${label(dayOf(r), today)}`).join(", ")}.`
          : `I don't see a charge from ${shown} in your linked accounts in the last ${BACK_DAYS} days.`);
        if (recent.length) lines.push(`When did you cancel? Say it like "I cancelled ${shown} on Sep 20", or check the date on ${shown}'s cancellation email, and I'll tell you which of these came after it.`);
        lines.push(src);
        return lines.join("\n");
      }
      const after = posted.filter((r) => dayOf(r) > cancelDay).sort((a, b) => dayOf(a).localeCompare(dayOf(b)));
      const when = said && !said.bad && !(rec && rec.done) ? (said.month ? `you cancelled ${said.said}` : said.rough ? `you cancelled, about ${said.said}` : `you cancelled on ${said.said}`) : `you cancelled on ${label(cancelDay, today)}`;
      if (!after.length) {
        lines.push(`I don't see a charge from ${shown} after ${when} (${how}).${pending.length ? ` There ${pending.length === 1 ? "is a pending charge" : `are ${pending.length} pending charges`} from ${shown}: ${pending.map((r) => `${money(-cents(r))}`).join(", ")}; pending charges can still change or drop off.` : ""}`);
        lines.push(`If you see one in your card's app that isn't here yet, it may not have reached your linked accounts. Say "tell me when ${shown} charges me" and I'll watch for it.`);
        lines.push(src);
        return lines.join("\n");
      }
      const list = after.map((r) => `${money(-cents(r))} on ${label(dayOf(r), today)}`);
      const slack = rec && rec.done ? 0 : (said && said.slack) || 0;
      const early = after.filter((r) => daysBetween(cancelDay, dayOf(r)) <= LAG_DAYS + slack);
      // "Yes" only when at least one charge is clearly after the cancel; one that may predate it is said, not called a yes.
      lines.push(`${early.length < after.length ? "Yes: " : ""}${shown} charged you ${after.length === 1 ? list[0] : `${after.length} times, ${list.join(" and ")}`}, after ${when} (${how}).`);
      if (early.length) lines.push(`${early.length === after.length && after.length === 1 ? "It" : early.map((r) => `The ${money(-cents(r))} on ${label(dayOf(r), today)}`).join(" and ")} posted within ${LAG_DAYS + slack} days of ${slack ? "about when you cancelled" : "the cancel"}, so it may have been made before you cancelled${slack ? "" : ": banks post charges a day or two late"}. Check its date against ${shown}'s cancellation email.`);
      const last = after[after.length - 1], total = after.reduce((a, r) => a - cents(r), 0);
      const draftDay = rec && rec.done ? label(cancelDay, today) : said && said.month ? said.said : said && said.rough ? `about ${said.said}` : label(cancelDay, today);
      const ref = rec && rec.done && rec.done.reference ? ` (confirmation ${String(rec.done.reference).slice(0, 40)})` : "";
      lines.push(`Ask ${shown} for the money back first. A message you can send them:\n"Hi, I cancelled my ${shown} subscription ${said && (said.month || said.rough) && !(rec && rec.done) ? draftDay : `on ${draftDay}`}${ref}, but I was charged ${after.length === 1 ? `${money(-cents(last))} on ${label(dayOf(last), today)}` : `${money(total)} in ${after.length} charges, the last on ${label(dayOf(last), today)}`}. Please refund ${after.length === 1 ? "this charge" : "these charges"} to my card and confirm my account is closed."`);
      lines.push(`If ${shown} won't refund it, say "dispute this charge" and I'll draft the dispute for your card company. Nothing was sent.`);
      lines.push(src);
      return lines.join("\n");
    }
    return { ask, answer, dateIn, nameIn, nameMatch };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = CancelledCharge;
