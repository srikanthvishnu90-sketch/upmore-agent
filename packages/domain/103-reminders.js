  /* Reminders in chat (megadoc D11 "remind me to pay rent on the 28th"). A reminder is the person's own words said back
     on the day they asked for, by the hourly run; it never pays, moves or cancels anything.
       parse(words, now, tz)        null (not a reminder ask) | { ok: false, reply } | { ok: true, reminder, reply }
       due(reminders, now, tz, sent) the ones to say now: { key, text } (once each by key; from 9 a.m. in the person's day)
       describe(reminders, now, tz) one line for "show my alerts" ("" with none)
     A reminder is stored as a person-set watch { id, kind: "reminder", text, on | monthly_day, created_on, created_at }
     in agent_proactive_settings.watches (no migration; the table refuses a run of 9+ digits, so the words keep no long
     number and the id is base 36). When: "tomorrow", "today", "on the 28th", "on Oct 28", "on 10/28", "on Friday", "in 3
     days", "next week"; "every month on the 28th" (or "monthly") repeats, and a month without that day uses its last.
     No day said is asked about, never guessed. A day already past this month is next month's ("the 5th" on Oct 12 is Nov
     5). A route reminder ("... for R0119") is the route path's, not this. Pure. Depth packet REMINDERS. */
  const Reminders = (() => {
    const DAY = 86400000, HOUR_LOCAL = 9, MAX_TEXT = 120, MAX_ACTIVE = 5;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const pad = (n) => String(n).padStart(2, "0");
    const local = (now, tz) => {
      const ms = typeof now === "number" ? now : Date.parse(now);
      let zone = tz || "UTC";
      try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); } catch (e) { zone = "UTC"; }
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
      return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, zone };
    };
    const addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
    const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dowOf = (ymd) => new Date(ymd + "T00:00:00Z").getUTCDay();
    // "Friday, Oct 16"; another year than the person's today is said ("Friday, Jan 15, 2027").
    const label = (ymd, today) => `${DOW[dowOf(ymd)]}, ${MON[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}${today && today.slice(0, 4) !== ymd.slice(0, 4) ? `, ${ymd.slice(0, 4)}` : ""}`;
    const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
    // A monthly day in a given month: the 31st in a 30-day month is its 30th.
    const monthDay = (y, m, d) => `${y}-${pad(m)}-${pad(Math.min(d, lastDay(y, m)))}`;

    const LEAD = /^\s*(?:(?:hey|hi|ok|okay|so|yo|pls|please|upmore)[,\s]+)*(?:(?:can|could|would|will) (?:you|u)\s+(?:please\s+|pls\s+)?|please\s+|pls\s+)?/i;
    const ASK = /^(?:remind me|set (?:a |me a )?reminder|send me a reminder|ping me|text me a reminder)\b/i;
    const ROUTE = /\br\d{4}\b/i;
    function when(t, today) {
      let m;
      const y = +today.slice(0, 4), mo = +today.slice(5, 7), d = +today.slice(8, 10);
      if ((m = /\b(?:every month|each month|monthly)\b/.exec(t))) {
        const day = /\b(?:on )?(?:the )?(\d{1,2})(?:st|nd|rd|th)\b/.exec(t);
        if (!day || +day[1] < 1 || +day[1] > 31) return { error: "monthly_day" };
        return { monthly_day: +day[1] };
      }
      if (/\btoday\b|\btonight\b|\blater today\b/.test(t)) return { on: today };
      if (/\btomorrow\b|\btmrw\b|\btmr\b/.test(t)) return { on: addDays(today, 1) };
      if ((m = /\bin (\d{1,3}) days?\b/.exec(t))) return +m[1] >= 1 && +m[1] <= 365 ? { on: addDays(today, +m[1]) } : { error: "range" };
      if ((m = /\bin (\d{1,2}) weeks?\b/.exec(t))) return +m[1] >= 1 && +m[1] <= 52 ? { on: addDays(today, 7 * +m[1]) } : { error: "range" };
      if (/\bnext week\b/.test(t)) return { on: addDays(today, 7) };
      if ((m = /\b(?:on |by |this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(t))) {
        const want = DOW.map((x) => x.toLowerCase()).indexOf(m[1]); let n = (want - dowOf(today) + 7) % 7; if (n === 0) n = 7;
        return { on: addDays(today, n) };
      }
      if ((m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/.exec(t))) {
        const mm = MON.map((x) => x.toLowerCase()).indexOf(m[1].slice(0, 3)) + 1, dd = +m[2];
        let yy = m[3] ? +m[3] : y;
        if (dd < 1 || dd > lastDay(yy, mm)) return { error: "date" };
        let on = `${yy}-${pad(mm)}-${pad(dd)}`;
        if (!m[3] && on < today) { yy += 1; if (dd > lastDay(yy, mm)) return { error: "date" }; on = `${yy}-${pad(mm)}-${pad(dd)}`; }
        return on < today ? { error: "past" } : { on };
      }
      if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t))) {
        const mm = +m[1], dd = +m[2];
        let yy = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : y;
        if (mm < 1 || mm > 12 || dd < 1 || dd > lastDay(yy, mm)) return { error: "date" };
        let on = `${yy}-${pad(mm)}-${pad(dd)}`;
        if (!m[3] && on < today) { yy += 1; on = `${yy}-${pad(mm)}-${pad(dd)}`; }
        return on < today ? { error: "past" } : { on };
      }
      if ((m = /\b(?:on |by )?the (\d{1,2})(?:st|nd|rd|th)\b|\bon (\d{1,2})(?:st|nd|rd|th)\b/.exec(t))) {
        const dd = +(m[1] || m[2]);
        if (dd < 1 || dd > 31) return { error: "date" };
        if (dd >= d && dd <= lastDay(y, mo)) return { on: `${y}-${pad(mo)}-${pad(dd)}` };
        const ny = mo === 12 ? y + 1 : y, nm = mo === 12 ? 1 : mo + 1;
        if (dd > lastDay(ny, nm)) return { error: "date" };
        return { on: `${ny}-${pad(nm)}-${pad(dd)}` };
      }
      return { error: "none" };
    }
    // The words to say back: what follows "to" / "about", without the when-words and filler.
    // Said back in the person's voice turned to Upmore's: "check my refund" becomes "check your refund".
    const yours = (s) => s.replace(/\bmy\b/g, "your").replace(/\bmine\b/g, "yours").replace(/\bme\b/g, "you").replace(/\bi'm\b/g, "you're").replace(/\bi\b/g, "you");
    // "to pay rent" is something to do; "about the dentist" or "for my car insurance" is something to think of.
    function mode(t) { const r = t.replace(ASK, " ").replace(/\s+/g, " ").trim(); return /^(?:me\s+)?(?:about|of|for)\b/.test(r) || (!/\bto\s+[a-z]/.test(r) && !/^(?:me\s+)?to\b/.test(r)) ? "about" : "to"; }
    function what(t) {
      let s = t.replace(ASK, " ").replace(/^\s*(?:me\s+)?(?:to|about|that|of|for)\s+/i, " ");
      s = s.replace(/\b(?:every month|each month|monthly)\b/g, " ")
        .replace(/\b(?:on |by |before )?(?:the )?\d{1,2}(?:st|nd|rd|th)\b/g, " ")
        .replace(/\b(?:on |by |before |this |next )?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g, " ")
        .replace(/\b(?:on |by |before )?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/g, " ")
        .replace(/\b(?:on |by |before )?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
        .replace(/\b(?:today|tonight|later today|tomorrow|tmrw|tmr|next week|in \d{1,3} (?:days?|weeks?))\b/g, " ")
        .replace(/^\s*(?:to|about|that|for)\s+/i, " ").replace(/\s+/g, " ").trim().replace(/^(?:to|about|for)\s+/, "").replace(/[\s,.!?]+$/, "");
      s = s.replace(/\s+before$/, "").trim();
      return s.replace(/\d{9,}/g, "#").slice(0, MAX_TEXT);
    }
    function parse(words, now, tz) {
      const raw = String(words || "").replace(/[’‘]/g, "'"), t = raw.toLowerCase().replace(LEAD, "").replace(/\s+/g, " ").trim();
      if (!ASK.test(t) || ROUTE.test(t)) return null;
      // A free trial with its end date is the trial tracker's (it counts back from the end itself).
      if (/\btrials?\b/.test(t)) return null;
      // "remind me when X happens" is a watch ("tell me when"), not a dated reminder.
      if (/^(?:remind me|ping me)\s+(?:when|if|whenever)\b/.test(t)) return null;
      // "Remind me what you can do", "remind me how much I owe sam": a question, not a reminder (found 2026-10-12).
      if (/^remind me\s+(?:what|how|who|where|why|which|whether)\b/.test(t)) return null;
      const L = local(now, tz), text = what(t), how = mode(t);
      // "before the 20th" is the day before it, said as such; a day before today is not a day.
      const before = /\bbefore (?:the |on )?(?=\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|sun|mon|tue|wed|thu|fri|sat|tomorrow|today|tonight)/.test(t);
      let w = when(t, L.date);
      if (before && w.on) w = addDays(w.on, -1) >= L.date ? { on: addDays(w.on, -1), before: w.on } : { error: "past" };
      if (before && w.monthly_day) w = { error: "monthly_before" };
      if (!text) return { ok: false, reply: 'What should I remind you about? Say it like "remind me to pay rent on the 28th". Nothing was set.' };
      if (w.error === "none") return { ok: false, reply: `When should I remind you to ${text}? Say a day, like "on the 28th", "on Friday" or "tomorrow". Nothing was set.` };
      if (w.error === "monthly_before") return { ok: false, reply: `Which day of the month should I remind you? Say it like "remind me to ${text} on the 27th every month". Nothing was set.` };
      if (w.error === "monthly_day") return { ok: false, reply: `Which day of the month? Say it like "remind me to ${text} on the 28th every month". Nothing was set.` };
      if (w.error) return { ok: false, reply: `I couldn't read that date${w.error === "past" ? " (it's already past)" : ""}, so nothing was set. Say a day, like "on the 28th" or "on Oct 28".` };
      const nowMs = typeof now === "number" ? now : Date.parse(now);
      const reminder = Object.assign({ id: `r-${nowMs.toString(36)}`, kind: "reminder", text, how, created_on: L.date, created_at: new Date(nowMs).toISOString(), status: "active" }, w.monthly_day ? { monthly_day: w.monthly_day } : { on: w.on });
      const zone = L.zone.split("/").pop().replace(/_/g, " "), said = `${how} ${yours(text)}`;
      const billish = /\b(?:rent|bills?|payment|card|loan|mortgage|insurance|premium|utilities)\b/.test(text);
      const reply = w.monthly_day
        ? `I'll remind you ${said} on the ${ord(w.monthly_day)} of every month, from ${HOUR_LOCAL} a.m. ${zone} time${w.monthly_day > 28 ? " (the last day in a shorter month)" : ""}. It's a reminder only: nothing is paid or moved. Say "stop the reminder ${how} ${text}" to end it.`
        : `I'll remind you ${said} ${w.on === L.date && L.hour >= HOUR_LOCAL ? "later today (I check every hour)" : `on ${label(w.on, L.date)}${w.before ? `, the day before ${label(w.before).split(", ")[1]}` : ""}, from ${HOUR_LOCAL} a.m. ${zone} time`}. It's a reminder only: nothing is paid or moved.${billish ? ` Say "remind me ${how} ${text} on the ${ord(+w.on.slice(8, 10))} every month" if you want it monthly.` : ""}`;
      return { ok: true, reminder, reply };
    }
    // The day a reminder is for, if that day is `ymd`.
    function dayFor(r, ymd) {
      if (r.on) return r.on === ymd ? ymd : null;
      if (r.monthly_day) { const d = monthDay(+ymd.slice(0, 4), +ymd.slice(5, 7), r.monthly_day); return d === ymd ? d : null; }
      return null;
    }
    // Today's from 9 a.m.; yesterday's, if the hourly run missed it (an outage), from 9 a.m. today, saying the day.
    function due(reminders, now, tz, sent) {
      const L = local(now, tz), done = new Set(sent || []), out = [], yesterday = addDays(L.date, -1);
      for (const r of reminders || []) {
        if (!r || r.kind !== "reminder" || r.status === "paused" || r.status === "revoked" || !r.id) continue;
        for (const [ymd, late] of [[yesterday, true], [L.date, false]]) {
          const day = dayFor(r, ymd);
          if (!day || (r.created_on && day < r.created_on) || L.hour < HOUR_LOCAL) continue;
          const key = `reminder:${r.id}:${day}`;
          if (done.has(key)) continue;
          done.add(key);
          out.push({ key, text: `Reminder${r.how === "about" ? " about" : ""}: ${yours(r.text)}.${late ? ` This was for yesterday, ${label(day).split(", ")[1]}; I'm sorry it's late.` : ""} (You asked me to remind you${r.monthly_day ? " on this day each month" : ""}; nothing was paid or moved.)` });
        }
      }
      return out;
    }
    function describe(reminders, now, tz) {
      const L = local(now, tz);
      const live = (reminders || []).filter((r) => r && r.kind === "reminder" && r.status !== "revoked" && (r.monthly_day || (r.on && r.on >= L.date)));
      return live.length ? `Reminders: ${live.map((r) => r.monthly_day ? `${yours(r.text)} (the ${ord(r.monthly_day)} of every month)` : `${yours(r.text)} (${label(r.on, L.date)})`).join("; ")}.` : "";
    }
    // "stop the reminder to pay rent", "cancel my rent reminder", "delete all my reminders"
    function stop(words, reminders) {
      const t = String(words || "").toLowerCase().replace(/[’‘]/g, "'").replace(LEAD, "").replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").trim();
      const m = /^(?:stop|cancel|delete|remove|turn off|forget|clear)\s+(?:all\s+(?:of\s+)?)?(?:my\s+|the\s+)?(?:(.+?)\s+)?reminders?(?:\s+(?:to|about|for)\s+(.+))?$/.exec(t);
      if (!m) return null;
      const live = (reminders || []).filter((r) => r && r.kind === "reminder");
      const term = String(m[2] || m[1] || "").replace(/^(?:all|the|my)\s+/, "").trim();
      const pick = !term || /^(?:all|every)$/.test(term) ? live : live.filter((r) => r.text.toLowerCase().includes(term));
      if (!pick.length) return { remove: [], reply: `I don't have a reminder${term ? ` about "${term}"` : ""}, so nothing changed.` };
      return { remove: pick, reply: `Stopped ${pick.length === 1 ? "the reminder" : `${pick.length} reminders`}: ${pick.map((r) => yours(r.text)).join("; ")}. Nothing else changed.` };
    }
    const isReminder = (w) => !!w && w.kind === "reminder";
    // The chat command over the stored watches: { watches, reply } (watches null when nothing changes) or null.
    // At most MAX_ACTIVE reminders; a one-off whose day has passed is dropped when anything is saved.
    function command(words, watches, now, tz) {
      const list = watches || [], L = local(now, tz);
      const t = String(words || "").toLowerCase().replace(/[’‘]/g, "'").replace(LEAD, "").replace(/\s+/g, " ").replace(/[\s?.!]+$/, "").trim();
      if (/^(?:show|list|what are)(?: me)? my reminders$|^what (?:are|did) (?:my reminders|i ask you to remind me)/.test(t)) {
        const line = describe(list, now, tz);
        return { watches: null, reply: line || 'You have no reminders. Say "remind me to pay rent on the 28th" to set one.' };
      }
      const st = stop(words, list);
      if (st) return { watches: st.remove.length ? list.filter((w) => !st.remove.includes(w)) : null, reply: st.reply };
      const p = parse(words, now, tz);
      if (!p) return null;
      if (!p.ok) return { watches: null, reply: p.reply };
      const kept = list.filter((w) => !isReminder(w) || w.monthly_day || (w.on && w.on >= L.date));
      const same = kept.find((w) => isReminder(w) && w.text === p.reminder.text && w.on === p.reminder.on && w.monthly_day === p.reminder.monthly_day);
      if (same) return { watches: null, reply: `You already have that reminder: ${describe([same], now, tz).replace(/^Reminders: /, "").replace(/\.$/, "")}. Nothing changed.` };
      if (kept.filter(isReminder).length >= MAX_ACTIVE) return { watches: null, reply: `You already have ${MAX_ACTIVE} reminders, the most I keep. Say "show my reminders", then "stop the reminder to ..." for one you don't need. Nothing was set.` };
      return { watches: kept.concat([p.reminder]), reply: p.reply };
    }
    return { parse, due, describe, stop, command, isReminder, HOUR_LOCAL, MAX_ACTIVE };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = Reminders;
