  /* Scheduled send (megadoc A08: "pay maya 40 tomorrow at 9"). Upmore never sends on its own: at the time asked, the hourly
     run asks the person whether to put up the send card, and the card still needs its own yes. Set in chat, restated with
     the day and time in the person's zone; cancelable any time before. Stored as a person-set watch (no migration):
       { id, kind: "scheduled_send", command, name, amount_cents, at_date, at_hour, at_min, created_on, status }
     The command is the person's own words without the time ("pay maya 40"); the recipient is resolved only when the card
     goes up, by the send flow, with all its checks. The table refuses a run of 9+ digits, so the id is base 36.
       command(words, watches, now, tz)  set, cancel or show: { watches | null, reply }, or null for anything else
       due(watches, now, tz, sent)       the questions to ask now: { key, text, offer } once each (key ssend:<id>)
       atMs(w, tz)                       the scheduled moment in ms
     When: today, tonight, tomorrow, a weekday, "on Oct 20", "on 10/20", with "at 9", "at 9:30am", "at 5 pm", "at noon".
     No am/pm: 7 to 11 is morning, 12 and 1 to 6 afternoon or evening ("tonight" is always evening); the reply says which.
     A day with no time is 9 a.m. A time with no day is today if still ahead, else tomorrow. Repeating ("every Friday") and
     conditions ("when my paycheck lands") stay the send flow's not-built answers. Up to 60 days ahead, 5 at a time. Pure.
     Depth packet SCHED-SEND. */
  const ScheduledSend = (() => {
    const KIND = "scheduled_send", DAY = 86400000, MAX_ACTIVE = 5, MAX_DAYS = 60;
    const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const MONL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const DOW = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const pad = (n) => String(n).padStart(2, "0");
    const money = (c) => "$" + Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + pad(c % 100);
    const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
    function zoneOf(tz) { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch (e) { return "UTC"; } }
    function local(ms, tz) {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zoneOf(tz), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
      return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, min: +p.minute };
    }
    // A local date and time in a zone, as ms: the UTC guess corrected by the zone's offset at that moment (twice, so a
    // daylight-saving change between the guess and the answer settles).
    function toMs(date, hour, min, tz) {
      let ms = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hour, min);
      for (let i = 0; i < 2; i++) { const l = local(ms, tz); const seen = Date.UTC(+l.date.slice(0, 4), +l.date.slice(5, 7) - 1, +l.date.slice(8, 10), l.hour, l.min); ms += Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hour, min) - seen; }
      return ms;
    }
    const addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
    const dayLabel = (ymd, today) => `${cap(DOW[new Date(ymd + "T00:00:00Z").getUTCDay()])}, ${MONL[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}${ymd.slice(0, 4) !== today.slice(0, 4) ? `, ${ymd.slice(0, 4)}` : ""}`;
    const timeLabel = (h, m) => h === 12 && m === 0 ? "12:00 PM (noon)" : `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
    const SEND = /^(?:send|pay|venmo|zelle|cash ?app|paypal)\s+/i;
    const LEAD = /^\s*(?:(?:hey|hi|ok|okay|so|pls|please)[,\s]+)*(?:(?:can|could|would|will) (?:you|u)\s+|please\s+|pls\s+)?/i;
    // The day and time words, found and taken out of the person's words.
    function when(t, today, nowLocal) {
      let rest = t, day = null, hour = null, min = 0, evening = false, said = false, m;
      const take = (re) => { const x = re.exec(rest); if (x) rest = (rest.slice(0, x.index) + " " + rest.slice(x.index + x[0].length)).replace(/\s+/g, " ").trim(); return x; };
      if ((m = take(/\b(?:at\s+)?noon\b/i))) { hour = 12; min = 0; said = true; }
      else if ((m = take(/\bat\s+midnight\b/i))) { hour = 0; min = 0; said = true; }
      else if ((m = take(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?=$|[\s,.!?])/i))) {
        let h = +m[1]; const mm = m[2] ? +m[2] : 0, ap = m[3] ? m[3].toLowerCase()[0] : null;
        if (h > 23 || mm > 59 || (ap && (h < 1 || h > 12))) return { bad: true };
        if (ap === "p" && h < 12) h += 12; else if (ap === "a" && h === 12) h = 0;
        hour = h; min = mm; said = !!ap || h > 12 ? "exact" : "guess";
      }
      if ((m = take(/\btonight\b/i))) { day = today; evening = true; }
      else if ((m = take(/\btoday\b/i))) day = today;
      else if ((m = take(/\b(?:tomorrow|tmrw|tmr|tmw)\b/i))) day = addDays(today, 1);
      else if ((m = take(/\b(?:on\s+)?(?:this\s+|next\s+)?(sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?\b/i))) {
        const want = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(m[1].toLowerCase().slice(0, 3));
        const cur = new Date(today + "T00:00:00Z").getUTCDay(); let k = (want - cur + 7) % 7; if (k === 0) k = 7; day = addDays(today, k);
      } else if ((m = take(/\bon\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i))) {
        const mo = MON.indexOf(m[1].toLowerCase().slice(0, 3)) + 1; let y = +today.slice(0, 4); let d = `${y}-${pad(mo)}-${pad(+m[2])}`; if (d < today) d = `${y + 1}-${pad(mo)}-${pad(+m[2])}`; day = d;
      } else if ((m = take(/\bon\s+(\d{1,2})\/(\d{1,2})\b/))) {
        let y = +today.slice(0, 4); let d = `${y}-${pad(+m[1])}-${pad(+m[2])}`; if (d < today) d = `${y + 1}-${pad(+m[1])}-${pad(+m[2])}`; day = d;
      }
      if (day === null && hour === null) return null;
      if (hour !== null && said === "guess") { if (evening || (hour >= 1 && hour <= 6)) hour += 12; }
      else if (hour === null) { hour = evening ? 19 : 9; said = "default"; }
      if (day === null) day = hour * 60 + min > nowLocal.hour * 60 + nowLocal.min ? today : addDays(today, 1);
      return { day, hour, min, said, rest };
    }
    const isWatch = (w) => w && w.kind === KIND && w.status !== "stopped";
    function atMs(w, tz) { return toMs(w.at_date, w.at_hour, w.at_min || 0, tz); }
    function restate(w) { return `send ${cap(w.name)} ${money(w.amount_cents)}`; }
    function parse(words, now, tz) {
      const t0 = String(words || "").replace(/[‘’]/g, "'").trim(), t = t0.replace(LEAD, "");
      if (!SEND.test(t)) return null;
      if (/\b(?:every|each|weekly|monthly|biweekly|recurring)\b/i.test(t) || /\b(?:if|when|once|unless|after)\b/i.test(t)) return null;
      // Rent and bills have their own paths ("pay my rent", "pay the electric bill"); a send with no number in it is the
      // send flow's to ask about.
      if (/\b(?:rent|bills?|electric\w*|utilit\w*|mortgage|loan|insurance|credit card|card|phone|internet|my|the)\b/i.test(t.replace(SEND, "").split(/\b(?:today|tonight|tomorrow|tmrw|on|at)\b/i)[0]) || !/\d/.test(t.replace(/\b(?:at|on)\s+[\d:\/]+\s*(?:a\.?m\.?|p\.?m\.?)?/gi, " "))) return null;
      const nl = local(now, tz), w = when(t, nl.date, nl);
      if (!w) return null;
      if (w.bad) return { ok: false, reply: "I couldn't read that time, so nothing was scheduled. Say it like \"send Maya 40 tomorrow at 9am\"." };
      const verb = SEND.exec(w.rest)[0].trim().toLowerCase(), body = w.rest.replace(SEND, "").replace(/[.!?]+$/, "").trim();
      const am = /(?:^|\s)\$?(\d{1,6}(?:\.\d{1,2})?)(?=$|\s)/.exec(body);
      const name = body.replace(am ? am[0] : "", " ").replace(/\b(?:to|for .*$|dollars?|bucks)\b/gi, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 2).join(" ");
      if (!am || !name || /\d/.test(name)) return { ok: false, reply: "Who to and how much? Say it like \"send Maya 40 tomorrow at 9am\". Nothing was scheduled." };
      const cents = Math.round(Number(am[1]) * 100);
      if (!(cents > 0) || cents > 1000000) return { ok: false, reply: "I can schedule a send from $0.01 to $10,000.00. Nothing was scheduled." };
      const at = toMs(w.day, w.hour, w.min, tz);
      if (at <= now) return { ok: false, reply: `${timeLabel(w.hour, w.min)} ${w.day === nl.date ? "today" : "then"} has already passed, so nothing was scheduled. When should I ask you?` };
      if (at - now > MAX_DAYS * DAY) return { ok: false, reply: `I can schedule up to ${MAX_DAYS} days ahead, so nothing was scheduled.` };
      const ws = { id: `ss-${now.toString(36)}`, kind: KIND, command: `${verb} ${body}`.slice(0, 120), name: name.toLowerCase(), amount_cents: cents, at_date: w.day, at_hour: w.hour, at_min: w.min, created_on: nl.date, status: "active" };
      const ampm = w.said === "guess" ? ` (I took that as ${w.hour < 12 ? "morning" : "afternoon or evening"}; say the time with am or pm to change it)` : w.said === "default" ? " (no time was said, so the morning)" : "";
      const dayWords = w.day === nl.date ? `today, ${dayLabel(w.day, nl.date)}` : w.day === addDays(nl.date, 1) ? `tomorrow, ${dayLabel(w.day, nl.date)}` : dayLabel(w.day, nl.date);
      return { ok: true, watch: ws, reply: `Scheduled: ${dayWords}, at ${timeLabel(w.hour, w.min)} your time${ampm}, I'll ask you to ${restate(ws)}. Nothing is sent before then, and nothing is sent without its own card and your yes at that time. The check runs hourly, so the question can come up to an hour after ${timeLabel(w.hour, w.min)}. Say "cancel the scheduled send to ${cap(ws.name)}" to drop it.` };
    }
    const CANCEL = /^\s*(?:please\s+)?(?:cancel|stop|delete|remove|drop|forget)\s+(?:the\s+|my\s+|all\s+(?:my\s+)?)?(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+)?scheduled\s+(?:sends?|payments?|pays?)(?:\s+to\s+([a-z][a-z'-]*))?\s*[.!]*$/i;
    const SHOW = /^\s*(?:show|list|what are|what're)\s+(?:me\s+)?(?:my\s+)?scheduled\s+(?:sends|payments)\b|^\s*what (?:payments|sends) (?:are|do i have) scheduled\b/i;
    function command(words, watches, now, tz) {
      const t = String(words || "").replace(/[‘’]/g, "'"), all = watches || [], have = all.filter(isWatch).filter((w) => atMs(w, tz) > now - DAY);
      let m;
      if ((m = CANCEL.exec(t))) {
        const who = m[1] ? m[1].toLowerCase() : null, drop = have.filter((w) => !who || w.name.split(" ")[0] === who);
        if (!drop.length) return { watches: null, reply: who ? `You don't have a scheduled send to ${cap(who)}, so nothing changed.` : "You don't have any scheduled sends, so nothing changed." };
        return { watches: all.filter((w) => !drop.includes(w)), reply: `Cancelled: ${drop.map((w) => `${restate(w)} on ${dayLabel(w.at_date, local(now, tz).date)} at ${timeLabel(w.at_hour, w.at_min)}`).join("; ")}. Nothing was sent. Nothing else changed.` };
      }
      if (SHOW.test(t)) return { watches: null, reply: have.length ? `Scheduled: ${have.map((w) => `${restate(w)} on ${dayLabel(w.at_date, local(now, tz).date)} at ${timeLabel(w.at_hour, w.at_min)}`).join("; ")}. Each one asks you for the card at that time; nothing is sent without your yes.` : "You don't have any scheduled sends." };
      const p = parse(t, now, tz);
      if (!p) return null;
      if (!p.ok) return { watches: null, reply: p.reply };
      if (have.filter((w) => atMs(w, tz) > now).length >= MAX_ACTIVE) return { watches: null, reply: `You have ${MAX_ACTIVE} scheduled sends already, the most I keep, so nothing was scheduled. Say "show my scheduled sends" to see them.` };
      // Fired ones older than a day are dropped as the list is written, so they never fill the watch list.
      return { watches: all.filter((w) => !isWatch(w) || atMs(w, tz) > now - DAY).concat([p.watch]), reply: p.reply };
    }
    function due(watches, now, tz, sent) {
      const done = new Set(sent || []), out = [];
      for (const w of (watches || []).filter(isWatch)) {
        const at = atMs(w, tz), key = `ssend:${w.id}`;
        if (at > now || now - at > DAY || done.has(key)) continue;
        out.push({ key, text: `It's time for the payment you scheduled: ${restate(w)}. Want the card? Reply yes and I'll put it up (it needs its own yes), or no to skip it.`, offer: { kind: KIND, id: w.id, command: w.command, name: w.name, amount_cents: w.amount_cents, at_ms: at } });
      }
      return out;
    }
    return { KIND, command, parse, due, atMs, isWatch, restate };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = ScheduledSend;
