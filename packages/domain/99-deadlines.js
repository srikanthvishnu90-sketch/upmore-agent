  /* A deadline is near (the owner's Full Agent Capability List, item 39: "tax date, FSA use-it-or-lose-it, open
     enrollment, class action claim date"; registry TAX-010 filing calendar, TAX-003 estimated tax, INS-009 enrollment
     windows, SAVE-020 for the FSA date). Read-only: dates and days left, never what to file, pay or pick.
       data     packages/offers/deadlines.json (the router bundle's DEADLINES_JSON when left out): public dates, each with
                its source, the day it was checked and how; a tax date rolls past weekends and legal holidays here
       watches  agent_proactive_settings.watches: what the person told Upmore, stored as watches of kind "deadline_fact"
                (no migration): { fact: "estimated_tax" | "extension" (tax_year) | "medicare" | "marketplace" |
                "fsa" (plan_year_end, grace_until) | "work_oe" (opens, closes), created_at, created_on, status }
     Functions:
       rollForward(ymd)                    { on, moved, from, text }: Saturday, Sunday or a legal holiday (the federal
                                           ones and D.C.'s Emancipation Day, as observed) moves a tax date to the next
                                           business day (IRS Publication 509; the estimated-tax FAQ)
       upcoming(now, opts)                 every date on file and from the person's facts, in their day: id, due_on,
                                           days, applies (said to them on their own), source, stale
       proactive(ctx)                      the hourly run's notes: 14 and 2 days before, once per (deadline, lead) by
                                           key, held in quiet hours; a public date that applies to everyone needs alerts
                                           on and the daily budget unless within 2 days (AgentLoop.budgetAllows); a date
                                           the person gave or a public one they said applies to them is theirs (comes
                                           with alerts off, never uses the budget)
       command(words, watches, now, tz)    "I pay estimated taxes", "I filed an extension", "I'm on Medicare", "I get my
                                           insurance from HealthCare.gov", "my FSA plan year ends December 31 with a grace
                                           period until March 15", "my open enrollment at work is November 2 to November
                                           13", "forget my FSA deadline": the watches to save and the restated reply
       ask(words) / answer(words, now, opts)  "what deadlines are coming up", "when are taxes due", "when is open
                                           enrollment", "when is my fsa deadline", class actions (not built: no verified
                                           settlement list; a placeholder catalog is never said as real)
     Pure: the clock, the zone, the data and the person's facts are passed in. Depth packet DEADLINES. */
  const Deadlines = (() => {
    const DAY = 86400000;
    const KIND = "deadline_fact";
    const LEADS = [14, 2];
    const HORIZON = 183;
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const Loop = typeof AgentLoop !== "undefined" ? AgentLoop : require("./43-agent-loop.js");
    const dataOf = (d) => d || (typeof DEADLINES_JSON !== "undefined" ? DEADLINES_JSON : null);

    // ---- calendar ----
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    const dayMs = (s) => Date.parse(`${s}T00:00:00Z`);
    const addDays = (s, n) => new Date(dayMs(s) + n * DAY).toISOString().slice(0, 10);
    const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / DAY);
    const dow = (s) => new Date(dayMs(s)).getUTCDay();
    const ymd = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const validDay = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthDay = (s) => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8, 10))}`;
    const long = (s) => `${WEEKDAYS[dow(s)]}, ${monthDay(s)}, ${s.slice(0, 4)}`;
    const short = (s) => `${MONTHS[Number(s.slice(5, 7)) - 1].slice(0, 3)} ${Number(s.slice(8, 10))}, ${s.slice(0, 4)}`;
    const nth = (y, m, wd, n) => ymd(y, m, 1 + ((wd - new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 7) % 7) + (n - 1) * 7);
    const lastOf = (y, m, wd) => { const d = new Date(Date.UTC(y, m, 0)).getUTCDate(); return ymd(y, m, d - ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() - wd + 7) % 7)); };
    const observed = (s) => dow(s) === 6 ? addDays(s, -1) : dow(s) === 0 ? addDays(s, 1) : s;
    // Federal legal holidays (5 U.S.C. 6103, as observed) and D.C.'s Emancipation Day (April 16, observed on a weekday),
    // which the IRS counts as a legal holiday. Next year's New Year's Day can be observed on December 31.
    function holidays(y) {
      const h = {};
      const put = (s, name) => { if (!h[s]) h[s] = name; };
      for (const yy of [y, y + 1]) put(observed(ymd(yy, 1, 1)), "New Year's Day");
      put(nth(y, 1, 1, 3), "Martin Luther King Jr. Day");
      if ((y - 1965) % 4 === 0) put(dow(ymd(y, 1, 20)) === 0 ? ymd(y, 1, 21) : ymd(y, 1, 20), "Inauguration Day");
      put(nth(y, 2, 1, 3), "Washington's Birthday");
      put(observed(ymd(y, 4, 16)), "Emancipation Day in Washington, D.C.");
      put(lastOf(y, 5, 1), "Memorial Day");
      put(observed(ymd(y, 6, 19)), "Juneteenth");
      put(observed(ymd(y, 7, 4)), "Independence Day");
      put(nth(y, 9, 1, 1), "Labor Day");
      put(nth(y, 10, 1, 2), "Columbus Day");
      put(observed(ymd(y, 11, 11)), "Veterans Day");
      put(nth(y, 11, 4, 4), "Thanksgiving Day");
      put(observed(ymd(y, 12, 25)), "Christmas Day");
      return h;
    }
    function rollForward(s) {
      let on = s;
      const why = [];
      for (let i = 0; i < 10; i++) {
        const w = dow(on), hol = holidays(Number(on.slice(0, 4)))[on];
        if (w === 0 || w === 6) { if (!why.includes("a weekend")) why.push("a weekend"); }
        else if (hol) why.push(`${hol} on ${WEEKDAYS[w]}, ${monthDay(on)}`);
        else break;
        on = addDays(on, 1);
      }
      const reasons = why.map((r, i) => (i === 0 ? r : `then ${r}`)).join(", ");
      return { on, moved: on !== s, from: s, text: on !== s ? `moved from ${WEEKDAYS[dow(s)]}, ${monthDay(s)} (${reasons})` : "" };
    }

    // ---- the person's day ----
    const zoneOk = (tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };
    const zoneOr = (tz) => (tz && zoneOk(tz) ? tz : "America/New_York");
    function partsIn(t, tz) {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
      return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute), s: Number(p.second) };
    }
    const todayIn = (now, tz) => { const p = partsIn(now, zoneOr(tz)); return ymd(p.y, p.m, p.d); };
    // Midnight that starts a day in the zone (the budget's "within two days" is counted to it).
    const startOfDay = (s, tz) => { const g = dayMs(s), p = partsIn(g, tz); return g - (Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - g); };
    const zoneLabel = (tz) => (tz === "UTC" ? "UTC" : `${tz.split("/").pop().replace(/_/g, " ")} time`);

    // ---- the data on file ----
    function validate(data) {
      const problems = [], ids = new Set();
      for (const r of (data && data.deadlines) || []) {
        const tag = (r && r.id) || "?";
        if (!r || !/^[a-z0-9][a-z0-9-]*$/.test(r.id || "")) problems.push(`${tag}: id must be lowercase words`);
        if (ids.has(r.id)) problems.push(`${tag}: duplicate id`);
        ids.add(r.id);
        if (!ISO.test(r.date || "")) problems.push(`${tag}: date must be a date`);
        if (!r.source || !r.source.title || !/^https:\/\//.test(r.source.url || "")) problems.push(`${tag}: source needs a title and an https link`);
        if (!ISO.test(r.checked_on || "")) problems.push(`${tag}: checked_on must be a date`);
        if (!["tax", "enrollment"].includes(r.group)) problems.push(`${tag}: group must be tax or enrollment`);
        if (!["everyone", "estimated_tax", "extension", "medicare", "marketplace"].includes(r.audience)) problems.push(`${tag}: unknown audience`);
        if (/\d{9,}/.test(String(r.id))) problems.push(`${tag}: no long digit runs in an id`);
      }
      return problems;
    }
    const host = (url) => String(url || "").replace(/^https:\/\/(?:www\.)?/, "").split("/")[0];
    const CAPS = { everyone: "TAX-010", extension: "TAX-010", estimated_tax: "TAX-003", medicare: "INS-009", marketplace: "INS-009" };
    // What the person told Upmore, one per kind (the newest wins).
    function facts(watches) {
      const f = {};
      for (const w of watches || []) if (w && w.kind === KIND && w.status !== "revoked" && w.fact) f[w.fact] = w;
      return f;
    }
    const TOLD = { estimated_tax: "You told me you pay estimated tax.", extension: "You told me you filed an extension.", medicare: "You told me you're on Medicare.", marketplace: "You told me you get coverage through HealthCare.gov." };
    const IF = { estimated_tax: ", if you pay estimated tax", extension: ", if you requested an extension", medicare: ", for people with Medicare", marketplace: ", if you buy coverage there" };
    const LABEL = { tax: "Tax date", enrollment: "Enrollment", fsa: "FSA" };
    function applies(r, f) {
      if (r.audience === "everyone") return true;
      if (r.audience === "extension") return !!f.extension && Number(f.extension.tax_year) === Number(r.id.replace(/^\D*(\d{4})$/, "$1"));
      return !!f[r.audience];
    }
    // Every date on file and from the person's facts, in the person's day, soonest first.
    function upcoming(now, opts) {
      const o = opts || {}, tz = zoneOr(o.tz), today = todayIn(now, tz), data = dataOf(o.data), f = facts(o.watches);
      const fresh = (data && data.fresh_days) || 90, out = [];
      for (const r of (data && data.deadlines) || []) {
        const roll = r.rolls ? rollForward(r.date) : { on: r.date, moved: false, text: "" };
        const age = daysBetween(r.checked_on, today);
        out.push({ id: r.id, group: r.group, audience: r.audience, what: r.what, verb: r.verb, opens_on: r.opens_on || null, due_on: roll.on, moved: roll.text, days: daysBetween(today, roll.on),
          applies: applies(r, f), personal: false, capability_id: CAPS[r.audience], source: r.source, checked_on: r.checked_on, stale: age > (r.fresh_days || fresh) || age < 0, note: r.note || null });
      }
      if (f.fsa) {
        const last = f.fsa.grace_until || f.fsa.plan_year_end;
        if (ISO.test(last || "")) out.push({ id: `fsa-${last}`, group: "fsa", audience: "self", what: "your use-it-or-lose-it date", verb: "is", due_on: last, moved: "", days: daysBetween(today, last), applies: true, personal: true,
          capability_id: "SAVE-020", grace: !!f.fsa.grace_until, plan_year_end: f.fsa.plan_year_end || null, said_on: f.fsa.created_on || null });
      }
      if (f.work_oe && ISO.test(f.work_oe.closes || "")) out.push({ id: `work-oe-${f.work_oe.closes}`, group: "enrollment", audience: "self", what: "open enrollment at work", verb: "closes", opens_on: f.work_oe.opens || null, due_on: f.work_oe.closes, moved: "",
        days: daysBetween(today, f.work_oe.closes), applies: true, personal: true, capability_id: "INS-009", said_on: f.work_oe.created_on || null });
      return out.sort((a, b) => a.due_on.localeCompare(b.due_on) || a.id.localeCompare(b.id));
    }

    // ---- said on its own ----
    const leftText = (n) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `${n} days from today`);
    function citeOf(r) {
      if (r.personal) return `(${r.group === "enrollment" ? "the dates you told me" : "from what you told me"}${r.said_on ? ` on ${short(r.said_on)}` : ""})`;
      return `(${r.source.title}, checked ${short(r.checked_on)}${r.stale ? `; that may have changed, so check ${host(r.source.url)}` : ""})`;
    }
    function noteText(r) {
      if (r.group === "fsa") return `FSA: ${r.what} is ${long(r.due_on)} (${r.grace ? "the grace period you told me about" : "the end of your plan year, as you told me"}), ${leftText(r.days)}. Your plan's terms decide what happens to money left after it. ${citeOf(r)}`;
      const head = r.personal ? `${r.what} ${r.verb} ${long(r.due_on)}` : `${r.what} ${r.verb} ${long(r.due_on)}${r.moved ? `, ${r.moved}` : ""}`;
      return `${LABEL[r.group]}: ${head}, ${leftText(r.days)}.${!r.personal && r.audience !== "everyone" ? ` ${TOLD[r.audience]}` : ""} ${citeOf(r)}`;
    }
    function proactive(ctx) {
      const c = ctx || {}, now = c.now, tz = zoneOr(c.tz), sent = new Set(c.sent || []), times = c.budget_times || [];
      const out = { messages: [], suppressed: [] };
      for (const r of upcoming(now, { tz, data: c.data, watches: c.watches })) {
        if (!r.applies || r.days < 0 || r.days > LEADS[0]) continue;
        const lead = r.days <= LEADS[1] ? LEADS[1] : LEADS[0], key = `deadline:${r.id}:${lead}`;
        if (sent.has(key)) continue;
        const own = r.audience !== "everyone";
        if (!own && c.alerts === false) { out.suppressed.push({ key, reason: "alerts_off" }); continue; }
        if (c.quiet_now) { out.suppressed.push({ key, reason: "quiet_hours" }); continue; }
        let exempt = own;
        if (!own) {
          const b = Loop.budgetAllows(times, { key, kind: "deadline", reason: `${r.what} ${r.verb} ${short(r.due_on)}`, deadline: Math.max(now, startOfDay(r.due_on, tz)) }, now);
          if (!b.allowed) { out.suppressed.push({ key, reason: b.reason }); continue; }
          exempt = b.reason !== "budget";
          if (!exempt) times.push(now);
        }
        sent.add(key);
        out.messages.push({ key, kind: own ? "watch" : "finding", text: noteText(r), capability_id: r.capability_id, urgent: false, cadence: exempt,
          source: r.personal ? "what you told me" : r.source.title, as_of: r.personal ? r.said_on : r.checked_on, due_on: r.due_on, lead });
      }
      return out;
    }

    // ---- what the person tells Upmore ----
    const MONTH_RE = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
    const DATE = `(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2}(?:\\d{2})?)?|(?:${MONTH_RE})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?)`;
    // A date the person typed: with its year, or the next one on or after `from`. null when it is not a real day.
    function readDate(text, from) {
      const t = String(text || "").toLowerCase().trim();
      let y = null, m, d, x;
      if ((x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) { y = +x[1]; m = +x[2]; d = +x[3]; }
      else if ((x = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}(?:\d{2})?))?$/.exec(t))) { m = +x[1]; d = +x[2]; if (x[3]) y = x[3].length === 2 ? 2000 + +x[3] : +x[3]; }
      else if ((x = new RegExp(`^(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?$`).exec(t))) { m = MONTHS.findIndex((n) => n.toLowerCase().startsWith(x[1].slice(0, 3))) + 1; d = +x[2]; if (x[3]) y = +x[3]; }
      else return null;
      if (y === null) { y = Number(from.slice(0, 4)); if (!validDay(y, m, d) || ymd(y, m, d) < from) y += 1; if (!validDay(y, m, d)) y += 1; }
      return validDay(y, m, d) ? ymd(y, m, d) : null;
    }
    const BAD_DATE = "I couldn't read that date. Try \"December 31\" or \"12/31/2026\". Nothing changed.";
    const LEAD_LINE = "I'll tell you 14 days and 2 days before";
    const NAMES = { estimated_tax: "that you pay estimated tax", extension: "your extension", medicare: "that you're on Medicare", marketplace: "that you get coverage through HealthCare.gov", fsa: "your FSA dates", work_oe: "your work's open enrollment dates" };
    const FORGET_WORDS = [["fsa", /^(?:my )?(?:health )?fsa\b/], ["work_oe", /^(?:my )?(?:work|job|employer|company|benefits)(?:'s)? open enrollment\b|^(?:my )?open enrollment at work\b/], ["estimated_tax", /^(?:my )?(?:estimated|quarterly) tax/], ["extension", /^(?:my )?(?:tax )?extension\b/], ["medicare", /^(?:my )?medicare\b/], ["marketplace", /^(?:my )?(?:marketplace|healthcare\.gov|aca|obamacare)\b/], ["all", /^(?:my )?deadlines?\b/]];
    function command(words, watches, now, tz, data) {
      const t = String(words || "").trim().replace(/\s+/g, " ");
      if (!t || t.length > 200 || /\d{9,}/.test(t)) return null;
      const zone = zoneOr(tz), today = todayIn(now, zone), list = watches || [];
      const save = (fact, fields, reply) => ({
        watches: list.filter((w) => !(w && w.kind === KIND && w.fact === fact)).concat([Object.assign({ id: `deadline-${fact}-${Math.floor(now).toString(36)}`, kind: KIND, fact }, fields, { created_at: new Date(now).toISOString(), created_on: today, status: "active" })]),
        reply,
      });
      let x;
      // Taking one back: "forget my FSA deadline", "I'm not on Medicare", "I don't pay estimated taxes".
      if ((x = /^(?:forget|stop|remove|delete|clear)\s+(?:about\s+)?(.+?)(?:\s+(?:deadlines?|dates?|reminders?))?\s*[.!]*$/i.exec(t))) {
        const hit = FORGET_WORDS.find(([, re]) => re.test(x[1].toLowerCase()));
        if (!hit) return null;
        const f = facts(list), gone = hit[0] === "all" ? Object.keys(f) : f[hit[0]] ? [hit[0]] : [];
        if (!gone.length) return { reply: hit[0] === "all" ? "You haven't told me any deadlines of your own. Nothing changed." : `I don't have ${NAMES[hit[0]]}. Nothing changed.`.replace("I don't have that you", "You haven't told me that you") };
        return { watches: list.filter((w) => !(w && w.kind === KIND && gone.includes(w.fact))), reply: `Done: I've forgotten ${gone.map((g) => NAMES[g]).join(" and ")}. Public dates that apply to everyone still come with your alerts.` };
      }
      if (/^(?:i'?m|i am|we'?re|we are) not on medicare\s*[.!]*$/i.test(t)) return command("forget medicare", list, now, zone, data);
      if (/^(?:i|we) (?:don'?t|do not) (?:pay|make) (?:estimated|quarterly) tax(?:es| payments)?\s*[.!]*$/i.test(t)) return command("forget estimated tax", list, now, zone, data);
      if (/^(?:i|we) (?:pay|make|send) (?:my |our )?(?:estimated|quarterly) (?:tax(?:es)?|tax payments|payments)(?: to the irs)?\s*[.!]*$/i.test(t)) {
        const next = upcoming(now, { tz: zone, data, watches: [{ kind: KIND, fact: "estimated_tax" }] }).find((r) => r.audience === "estimated_tax" && r.days >= 0);
        return save("estimated_tax", {}, `Noted: you pay estimated tax. ${LEAD_LINE} each federal estimated-tax date${next ? ` (next: ${long(next.due_on)}, ${next.what})` : ""}. Dates only; the amounts are yours. Say "forget my estimated tax dates" to stop.`);
      }
      if ((x = /^(?:i|we) (?:filed|requested|got|asked for|have) (?:an? )?(?:tax |irs )?extension(?: for (?:my |our |the )?(20\d\d)(?: taxes| tax return| return)?)?\s*[.!]*$/i.exec(t))) {
        const y = Number(today.slice(0, 4)), ty = x[1] ? Number(x[1]) : today <= ymd(y, 10, 15) ? y - 1 : y;
        const row = upcoming(now, { tz: zone, data, watches: [{ kind: KIND, fact: "extension", tax_year: ty }] }).find((r) => r.audience === "extension" && r.applies);
        return save("extension", { tax_year: ty }, `Noted: you filed an extension for your ${ty} return. ${row ? `Extended ${ty} returns are due ${long(row.due_on)}; ${LEAD_LINE} it.` : `I don't have the extended date for ${ty} on file, so I can't remind you of it yet.`} Say "forget my extension" to stop.`);
      }
      if (/^(?:i'?m|i am|we'?re|we are) on medicare\s*[.!]*$|^(?:i|we) have medicare\s*[.!]*$/i.test(t)) return save("medicare", {}, `Noted: you're on Medicare. ${LEAD_LINE} Medicare Open Enrollment ends, from the dates on file. Say "forget my medicare deadline" to stop.`);
      if (/^(?:i|we) (?:get|buy|have) (?:my |our )?(?:health )?(?:insurance|coverage|plan) (?:from|on|through) (?:the )?(?:healthcare\.gov|marketplace|aca|obamacare|exchange)\s*[.!]*$|^(?:i'?m|i am|we'?re|we are) on (?:an? )?(?:aca|obamacare|marketplace|healthcare\.gov) plan\s*[.!]*$/i.test(t))
        return save("marketplace", {}, `Noted: you get coverage through HealthCare.gov. ${LEAD_LINE} its enrollment dates on file. Say "forget my marketplace deadline" to stop.`);
      if ((x = new RegExp(`^my (?:health )?fsa(?:'s)?(?: plan)?(?: year)? (?:ends|runs out|closes|expires)(?: on)? ${DATE}(?:,? (?:with|and) (?:a |the )?grace period (?:until|to|through|thru|ending)? ?${DATE})?\\s*[.!]*$`, "i").exec(t))) {
        const end = readDate(x[1], today), grace = x[2] ? readDate(x[2], end || today) : null;
        if (!end || (x[2] && !grace) || (grace && grace < end)) return { reply: BAD_DATE };
        const last = grace || end;
        return save("fsa", { plan_year_end: end, grace_until: grace }, `Noted: your FSA plan year ends ${long(end)}${grace ? `, with a grace period to ${long(grace)}` : ""}, so your use-it-or-lose-it date is ${long(last)}. ${LEAD_LINE} it; your plan's terms decide what happens to money left after it. Say "forget my FSA deadline" to stop.`);
      }
      const WORK = "my (?:open enrollment at work|(?:work|job|employer|company|benefits)(?:'s)? open enrollment)";
      if ((x = new RegExp(`^${WORK} (?:is|runs|goes)(?: from)? ${DATE} (?:to|through|thru|until|-) ${DATE}\\s*[.!]*$`, "i").exec(t)) || (x = new RegExp(`^${WORK} (?:ends|closes|is due|deadline is)(?: on)? ${DATE}\\s*[.!]*$`, "i").exec(t))) {
        const a = x[2] ? readDate(x[1], today) : null, b = x[2] ? readDate(x[2], a || today) : readDate(x[1], today);
        if (!b || (x[2] && (!a || a > b))) return { reply: BAD_DATE };
        return save("work_oe", { opens: a, closes: b }, `Noted: open enrollment at work ${a ? `runs ${long(a)} to ${long(b)}` : `closes ${long(b)}`}. ${LEAD_LINE} it closes. Say "forget my work open enrollment" to stop.`);
      }
      return null;
    }
    // "show my alerts": the facts the person gave, in one line.
    function describe(watches) {
      const f = facts(watches), parts = [];
      if (f.estimated_tax) parts.push("you pay estimated tax");
      if (f.extension) parts.push(`you filed an extension for ${f.extension.tax_year}`);
      if (f.medicare) parts.push("you're on Medicare");
      if (f.marketplace) parts.push("you get coverage through HealthCare.gov");
      if (f.fsa) parts.push(`your FSA use-it-or-lose-it date is ${short(f.fsa.grace_until || f.fsa.plan_year_end)}`);
      if (f.work_oe) parts.push(`open enrollment at work closes ${short(f.work_oe.closes)}`);
      return parts.length ? `Deadlines you told me about: ${parts.join("; ")} (I tell you 14 days and 2 days before).` : "";
    }
    const isFact = (w) => !!w && w.kind === KIND;

    // ---- on ask ----
    const Q = /^(?:when|what|whats|what's|which|is|are|does|do|any|how long|tell me|show me|list)\b|\?\s*$/i;
    const OFF = /\b(?:should (?:i|we)|recommend|worth it|better|how much|deduct|owe|penalt|remind me|text me|alert me|ping me|llc|business|corporat|s-corp|partnership|payroll|1099s?|(?:property|state|sales|car|vehicle|school|local|city) tax(?:es)?)\b/i;
    function ask(words) {
      const w = String(words || "").trim().toLowerCase().replace(/\s+/g, " ");
      if (!w || w.length > 160 || /\bsystem\s*:/.test(w)) return null;
      // A question about dates: asking Upmore to file, a statement, or a mention of the topic is not one.
      if (/\bclass[- ]action\b/.test(w) && Q.test(w) && /\b(?:deadlines?|claim (?:date|by)|due|when)\b/.test(w) && !/\bshould (?:i|we)\b/.test(w)) return "class_action";
      if (OFF.test(w) || !Q.test(w)) return /^(?:upcoming|my|any|the) deadlines\s*[?.!]*$|^deadlines\s*[?.!]*$/.test(w) ? "all" : null;
      const WHEN = /\b(?:when|what date|by when|deadlines?|due|dates?|day|last day|ends?|close|closes|start|starts|opens|begins?)\b/;
      if (/\bfsa\b/.test(w) && /\b(?:deadline|due|when|last day|expires?|use it or lose it|ends?)\b/.test(w)) return "fsa";
      if (/\b(?:estimated|quarterly) (?:tax|taxes|tax payments?|payments?)\b/.test(w) && /\b(?:due|deadlines?|when|dates?|next)\b/.test(w)) return "estimated";
      if (/\b(?:open|annual) enrollment\b|\benrollment period\b/.test(w) && WHEN.test(w.replace(/\b(?:open|annual) enrollment\b|\benrollment period\b/g, " "))) return "enrollment";
      if (/\btax(?:es)? (?:are |is )?due\b|\btax (?:deadline|day|dates?|filing deadline)\b|\bfile (?:my |our )?(?:taxes|tax return|return)\b|\bfiling deadline\b|\bextension deadline\b|\btaxes due\b/.test(w) && WHEN.test(w)) return "tax";
      if (/\bdeadlines\b|\b(?:upcoming|next|any) deadline\b|\bdeadlines? (?:coming up|ahead|soon)\b/.test(w) && !/\bdeadlines? (?:to|for|on)\b/.test(w)) return "all";
      return null;
    }
    const NO_CLASS = "Class-action claim dates aren't here: I don't have a verified settlement list yet.";
    const inText = (n) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);
    function lineOf(r, today) {
      const when = `- ${long(r.due_on)} (${inText(r.days)}): `;
      if (r.group === "fsa") return `${when}your FSA ${r.what.replace(/^your /, "")} (${r.grace ? "the grace period" : "the end of your plan year"}), as you told me on ${short(r.said_on || today)}.`;
      if (r.personal) return `${when}${r.what} ${r.verb}${r.opens_on ? ` (it opens ${long(r.opens_on)})` : ""}, as you told me on ${short(r.said_on || today)}.`;
      const opens = r.opens_on && r.opens_on > today ? ` (${r.audience === "marketplace" ? "open enrollment opens" : "it opens"} ${long(r.opens_on)})` : r.opens_on ? ` (open since ${long(r.opens_on)})` : "";
      const who = r.audience === "everyone" ? "" : r.applies ? `; ${TOLD[r.audience].replace(/^You told me /, "you told me ").replace(/\.$/, "")}` : IF[r.audience];
      return `${when}${r.what}${r.verb === "is" ? "" : ` ${r.verb}`}${r.moved ? `, ${r.moved}` : ""}${opens}${who}.`;
    }
    function footer(shown, today) {
      const L = [], pub = shown.filter((r) => !r.personal);
      if (!pub.length) return L;
      const stale = pub.filter((r) => r.stale);
      if (stale.length) L.push(`The dates on file were checked ${short(stale[0].checked_on)}; they may have changed, so check ${[...new Set(stale.map((r) => host(r.source.url)))].join(" or ")} before relying on them.`);
      const byDate = {};
      for (const r of pub) (byDate[r.checked_on] = byDate[r.checked_on] || new Set()).add(r.source.title);
      L.push(Object.keys(byDate).sort().map((d) => `Sources, checked ${short(d)}: ${[...byDate[d]].join("; ")}.`).join(" "));
      return L;
    }
    function answer(words, now, opts) {
      const kind = ask(words);
      if (!kind) return null;
      if (kind === "class_action") return `${NO_CLASS} The deadlines I can say are federal tax dates, Medicare and HealthCare.gov enrollment, and the FSA and work open-enrollment dates you give me.`;
      const o = opts || {}, tz = zoneOr(o.tz), today = todayIn(now, tz), all = upcoming(now, { tz, data: o.data, watches: o.watches }), f = facts(o.watches);
      const ahead = all.filter((r) => r.days >= 0), w = String(words).toLowerCase();
      const head = (title) => `${title} (today is ${long(today)}, ${zoneLabel(tz)}):`;
      const runOut = (group, label) => { const last = all.filter((r) => r.group === group && !r.personal).map((r) => r.due_on).sort().pop(); return last ? `The ${label} dates on file run through ${long(last)}; later ones aren't on file yet.` : `No ${label} dates are on file.`; };
      if (kind === "fsa") {
        const r = ahead.find((x) => x.group === "fsa");
        if (!r) return f.fsa ? `Your FSA date ${short(f.fsa.grace_until || f.fsa.plan_year_end)} has passed. Tell me your next plan year's end ("my FSA plan year ends December 31, 2027") and I'll tell you 14 days and 2 days before.` : "I don't have your FSA dates. Tell me \"my FSA plan year ends December 31\" (and the grace period, if your plan has one) and I'll tell you 14 days and 2 days before. I never assume you have an FSA.";
        return [head("Your FSA date"), lineOf(r, today), "Your plan's terms decide what happens to money left after it."].join("\n");
      }
      let shown, extra = [], group;
      if (kind === "tax" || kind === "estimated") {
        group = "tax";
        const tax = ahead.filter((r) => r.group === "tax" && r.days <= 400);
        if (kind === "estimated") shown = tax.filter((r) => r.audience === "estimated_tax");
        else {
          const first = (a) => tax.filter((r) => r.audience === a).slice(0, 1);
          shown = [].concat(first("everyone"), first("extension"), tax.filter((r) => r.audience === "estimated_tax").slice(0, 2)).sort((a, b) => a.due_on.localeCompare(b.due_on) || a.id.localeCompare(b.id));
        }
        if (!shown.length) return runOut("tax", "tax");
        extra.push("A tax date that lands on a weekend or a legal holiday moves to the next business day. State dates can differ, and the IRS can postpone dates for disaster areas.");
      } else if (kind === "enrollment") {
        group = "enrollment";
        const en = ahead.filter((r) => r.group === "enrollment");
        const only = /\bmedicare\b/.test(w) ? "medicare" : /\b(?:healthcare\.gov|marketplace|aca|obamacare|exchange)\b/.test(w) ? "marketplace" : /\b(?:work|job|employer|company|benefits)\b/.test(w) ? "self" : null;
        shown = only ? en.filter((r) => r.audience === only) : en;
        if (!f.work_oe && (!only || only === "self")) extra.push("Your work's open enrollment dates aren't on file. Tell me \"my open enrollment at work is November 2 to November 13\" and I'll tell you 14 days and 2 days before it closes.");
        for (const n of new Set(shown.map((r) => r.note).filter(Boolean))) extra.push(n);
        if (!shown.length) return [runOut("enrollment", "enrollment")].concat(extra).join("\n");
      } else {
        shown = ahead.filter((r) => r.days <= HORIZON);
        const nextReturn = ahead.find((r) => r.audience === "everyone" && r.group === "tax");
        if (nextReturn && !shown.includes(nextReturn)) shown.push(nextReturn);
        const missing = [!f.fsa && "your FSA", !f.work_oe && "your work's open enrollment"].filter(Boolean);
        if (missing.length) extra.push(`${missing.join(" and ")} ${missing.length > 1 ? "aren't" : "isn't"} on file: tell me ("my FSA plan year ends December 31", "my open enrollment at work ends November 13") and I'll tell you 14 days and 2 days before.`.replace(/^y/, "Y"));
        extra.push(NO_CLASS);
        if (!shown.length) return [`Nothing on file in the next ${HORIZON} days.`].concat(extra).join("\n");
      }
      const title = group === "tax" ? (kind === "estimated" ? "Federal estimated tax dates ahead" : "Federal tax dates ahead") : group === "enrollment" ? "Enrollment dates ahead" : "Deadlines coming up";
      return [head(title)].concat(shown.map((r) => lineOf(r, today)), extra, footer(shown, today)).join("\n");
    }

    return { KIND, LEADS, HORIZON, holidays, rollForward, todayIn, validate, facts, upcoming, proactive, command, describe, isFact, ask, answer, readDate };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = Deadlines;
