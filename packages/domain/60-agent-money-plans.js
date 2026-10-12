  /* Money plans (Instinct spec docs 06, 07, 02: PAY-003/007/008/009/023/025, SAVE-001/006, SOC-002/005/006/008/010):
     the pure half of requests for money, scheduled and recurring sends, own-account
     transfers, autosave rules, the overdraft-prevention move, failed-payment triage,
     group expenses, shared goals, gifts and the household permission model. Every
     plan produces a loop request with an idempotency key, exact confirm fields and
     the tier the registry assigns; nothing here moves money. A plan that would
     overdraw, exceed a limit or reach a stranger says so instead. Loads after
     MoneyMath and AgentMoney (optional). */
  const AgentMoneyPlans = (() => {
    const DAY = 86400000;
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const cents = t => Number.isInteger(t.amount_cents) ? t.amount_cents : Math.round(Number(t.amount || 0) * 100);
    const ymd = s => String(s || "").slice(0, 10);
    const dayMs = s => Date.parse(ymd(s) + "T00:00:00Z");
    const addDays = (s, n) => new Date(dayMs(s) + n * DAY).toISOString().slice(0, 10);
    const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / DAY);
    const divRound = (n, d) => { const q = Math.trunc(n / d), r = n - q * d; return Math.abs(r) * 2 >= Math.abs(d) ? q + Math.sign(n) * Math.sign(d) : q; };
    const monthOf = s => ymd(s).slice(0, 7);
    const addMonths = (s, n) => { const d = new Date(dayMs(s)); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.toISOString().slice(0, 10); };
    const businessDaysBefore = (s, n) => { let d = ymd(s), left = n; while (left > 0) { d = addDays(d, -1); const w = new Date(dayMs(d)).getUTCDay(); if (w !== 0 && w !== 6) left--; } return d; };
    // People resolve through the one recipient layer (42-agent-recipients.js): exact handle, then full name, then first
    // name; an ambiguous or look-alike name is asked about, never picked. A stored id is looked up directly.
    const Rec = () => { if (typeof AgentRecipients === "undefined") throw new Error("AgentMoneyPlans needs AgentRecipients loaded: every person-to-person flow resolves recipients through one layer."); return AgentRecipients; };
    const person = (people, who) => (people || []).find(p => p.id && p.id === who) || (() => { const r = Rec().resolve(who, people); return r.status === "saved" ? r.person : null; })();
    const askFor = (people, who, fallback) => { const r = Rec().resolve(who, people); return ["ambiguous", "lookalike", "unavailable"].includes(r.status) ? r.ask : fallback; };
    const request = (capability_id, key, params, describe, confirm, extra) => Object.assign({ capability_id, key, idempotency_key: key, params, describe, confirm }, extra || {});
    const acct = (accounts, id) => (accounts || []).find(a => a.id === id || a.nickname === id || a.kind === id) || null;
    // Rails are said by their names ("PayPal", "Cash App"), never by their ids.
    const RAIL_NAMES = { venmo: "Venmo", cash_app: "Cash App", paypal: "PayPal", zelle: "Zelle", ach: "ACH" };
    const railName = r => RAIL_NAMES[r] || String(r).toUpperCase();
    // A day the calendar has: 2026-02-30 is refused, never scheduled for a day that never comes.
    const realDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(dayMs(s)) && new Date(dayMs(s)).toISOString().slice(0, 10) === s;
    const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");

    // PAY-003: a request for money. Staged on the rail the person uses (the user taps send on the request), reminders in the tone asked for, settled when the matching credit lands.
    const TONES = { friendly: ["Hey {name}, when you get a sec: {amount} for {what}. No rush!", "Gentle nudge on the {amount} for {what} whenever works."], plain: ["Reminder: {amount} for {what} is still open.", "Second reminder: {amount} for {what}."], firm: ["{name}, the {amount} for {what} is now {days} days old. Can you send it today?", "Final reminder: {amount} for {what}, {days} days outstanding."] };
    function requestMoney(spec, ctx) {
      const c = ctx || {}, p = person(c.people, spec.from); if (!p) return { ask: askFor(c.people, spec.from, `Who is ${spec.from}? I only request money from people in your list, so a wrong name never gets a bill.`) };
      if (!Number.isSafeInteger(spec.amount_cents) || spec.amount_cents <= 0) return { ask: "How much?" };
      const rail = (p.rails || []).find(r => ["venmo", "cash_app", "paypal", "zelle"].includes(r)) || null;
      const r = { id: `req-${c.today}-${p.id}-${spec.amount_cents}`, from: p.id, name: p.name, amount_cents: spec.amount_cents, what: spec.what || "what you owe", rail, status: "open", created_on: c.today, tone: spec.tone || "friendly", reminders_sent: 0, handoff: rail ? `${railName(rail)} request to ${p.name}${p.handle ? ` (${p.handle})` : ""} for ${money(spec.amount_cents)}, note "${spec.what || "what you owe"}": staged, you tap Request.` : `${p.name} has no request rail on file; I'll draft the message and you pick how to collect.` };
      r.capability_id = "PAY-003"; r.tier = "T3";
      return { request: r, text: r.handoff };
    }
    function reminder(req, today) {
      const days = daysBetween(req.created_on, today), set = TONES[req.tone] || TONES.friendly, n = Math.min(req.reminders_sent, set.length - 1);
      if (req.status !== "open") return null;
      if (days < (req.tone === "firm" ? 3 : 7) * (req.reminders_sent + 1)) return null;
      return { request_id: req.id, text: set[n].replace("{name}", req.name.split(" ")[0]).replace(/\{amount\}/g, money(req.amount_cents)).replace(/\{what\}/g, req.what).replace("{days}", String(days)), tone: req.tone, days_open: days, capability_id: "SOC-009" };
    }
    function settleRequests(requests, transactions, people) {
      const credits = (transactions || []).filter(t => cents(t) > 0), out = [], used = new Set();
      for (const r of requests || []) { if (r.status !== "open") continue; const p = person(people, r.from); const hit = credits.find(t => !used.has(t) && cents(t) === r.amount_cents && ymd(t.posted_at) >= r.created_on && (!p || [p.name, p.handle].filter(Boolean).some(n => String(t.merchant_raw || "").toLowerCase().includes(String(n).toLowerCase().replace("@", ""))))); if (hit) { used.add(hit); r.status = "settled"; r.settled_by = hit.id; r.settled_on = ymd(hit.posted_at); out.push({ request_id: r.id, transaction_id: hit.id, text: `${r.name} paid the ${money(r.amount_cents)} for ${r.what} on ${ymd(hit.posted_at)}.` }); } }
      return out;
    }

    // PAY-007 / PAY-008: schedule a future payment and cancel it before the rail's cutoff.
    function schedulePayment(spec, ctx) {
      const c = ctx || {};
      const on = spec.on ? ymd(spec.on) : null;
      if (on && !realDay(on)) return { ask: "Which date? I could not read that as a calendar day." };
      if (!on || dayMs(on) <= dayMs(c.today)) return { ask: "Which date? It has to be after today." };
      if (!Number.isSafeInteger(spec.amount_cents) || spec.amount_cents <= 0) return { ask: "How much?" };
      const p = person(c.people, spec.to); if (!p) return { ask: askFor(c.people, spec.to, `Who is ${spec.to}? Add them first so a scheduled payment never goes to a stranger.`) };
      const rail = spec.rail || (p.bank_account ? "ach" : (p.rails || [])[0] || null), cutoff = rail === "ach" ? businessDaysBefore(on, 1) : addDays(on, -1);
      const s = { id: `sched-${on}-${p.id}-${spec.amount_cents}`, to: p.id, name: p.name, amount_cents: spec.amount_cents, on, rail, cutoff_on: cutoff, memo: spec.memo || null, status: "scheduled", created_on: c.today, capability_id: "PAY-007", tier: "T3" };
      s.text = `Scheduled: ${money(s.amount_cents)} to ${p.name} on ${s.on} by ${rail ? railName(rail) : "a rail you choose"}. You can cancel until ${cutoff}; after that it is in flight. I confirm with you the day before it goes.`;
      return { schedule: s, text: s.text };
    }
    function cancelScheduled(s, today) {
      if (s.status !== "scheduled") return { cancelled: false, text: `That payment is ${s.status}; nothing to cancel.` };
      if (dayMs(today) > dayMs(s.cutoff_on)) return { cancelled: false, in_flight: true, text: `The ${money(s.amount_cents)} to ${s.name} passed its cutoff on ${s.cutoff_on} and is in flight. ${s.rail === "ach" ? "An ACH can be recalled the same day through the bank; I can draft that request." : "I can draft a return request to the recipient."}` };
      s.status = "cancelled"; s.cancelled_on = today;
      return { cancelled: true, text: `Cancelled: ${money(s.amount_cents)} to ${s.name} on ${s.on}. Nothing will be sent.` };
    }
    // The scheduled payments that go out today, as loop requests (the loop still confirms per tier).
    function dueScheduled(schedules, today) {
      return (schedules || []).filter(s => s.status === "scheduled" && s.on === today).map(s => request("PAY-007", `${s.id}:send`, { amount_cents: s.amount_cents, recipient: s.name, rail: s.rail, memo: s.memo }, `Scheduled payment: ${money(s.amount_cents)} to ${s.name}`, { action: "Send", amount: money(s.amount_cents), recipient: s.name, timing: s.rail === "ach" ? "lands in 1-3 business days" : "today" }, { scheduled_id: s.id }));
    }

    // PAY-009: a transfer between the user's own accounts. Never overdraws the source; confirm fields name both ends.
    function ownTransfer(spec, ctx) {
      const c = ctx || {}, from = acct(c.accounts, spec.from), to = acct(c.accounts, spec.to);
      if (!from || !to) return { ask: `Which accounts? I know ${(c.accounts || []).map(a => a.nickname || a.id).join(", ")}.` };
      if (from.id === to.id) return { ask: "Those are the same account." };
      if (!Number.isSafeInteger(spec.amount_cents) || spec.amount_cents <= 0) return { ask: "How much?" };
      const avail = Number.isInteger(from.available_cents) ? from.available_cents : from.balance_cents;
      if (spec.amount_cents > avail) return { stop: true, reason: "insufficient", text: `${from.nickname || from.id} has ${money(avail)} available; ${money(spec.amount_cents)} would overdraw it. Nothing moved.` };
      const key = `transfer:${from.id}:${to.id}:${spec.amount_cents}:${c.today}`;
      return { request: request("PAY-009", key, { amount_cents: spec.amount_cents, from: from.id, to: to.id, recipient: to.id }, `Move ${money(spec.amount_cents)} from ${from.nickname || from.id} to ${to.nickname || to.id}`, { action: "Move", amount: money(spec.amount_cents), recipient: to.nickname || to.id, from: from.nickname || from.id, timing: from.institution && from.institution === to.institution ? "instant" : "1-2 business days", fee_cents: 0 }, { amount_cents: spec.amount_cents, recipient: to.id }), leaves_cents: avail - spec.amount_cents };
    }

    // SAVE-001: autosave rules. Round-ups on card spend, a payday sweep, a threshold sweep. Each run yields one transfer request with the rows that justify it.
    function autosave(rules, ctx) {
      const c = ctx || {}, rows = (c.transactions || []).map(t => Object.assign({}, t, { amount_cents: cents(t), posted_at: ymd(t.posted_at) })), out = [];
      for (const r of rules || []) {
        if (r.status === "paused") continue;
        const to = acct(c.accounts, r.to), from = acct(c.accounts, r.from); if (!to || !from) { out.push({ rule_id: r.id, skipped: "unknown account" }); continue; }
        const avail = Number.isInteger(from.available_cents) ? from.available_cents : from.balance_cents, floor = Number.isInteger(r.keep_at_least_cents) ? r.keep_at_least_cents : 10000;
        let amount = 0, basis = [], why = "";
        if (r.kind === "round_up") { const period = rows.filter(t => t.amount_cents < 0 && !t.is_transfer && !t.is_pending && (!r.account_id || t.account_id === r.account_id) && t.posted_at > (r.last_run_on || "0000") && t.posted_at <= c.today); amount = period.reduce((s, t) => s + ((100 - (-t.amount_cents % 100)) % 100), 0); basis = period.map(t => t.id); why = `round-ups on ${period.length} purchases since ${r.last_run_on || "the start"}`; }
        else if (r.kind === "payday_sweep") { const pay = rows.find(t => t.amount_cents > 0 && t.posted_at === c.today && /payroll|direct dep|salary/i.test(t.merchant_raw || "")); if (!pay) continue; amount = r.percent_bps ? divRound(pay.amount_cents * r.percent_bps, 10000) : r.amount_cents || 0; basis = [pay.id]; why = r.percent_bps ? `${r.percent_bps / 100} percent of today's ${money(pay.amount_cents)} paycheck` : `your fixed ${money(amount)} on payday`; }
        else if (r.kind === "threshold") { if (avail <= r.above_cents) continue; amount = avail - r.above_cents; basis = []; why = `${from.nickname || from.id} is ${money(amount)} above your ${money(r.above_cents)} line`; }
        if (amount <= 0) continue;
        if (r.max_cents && amount > r.max_cents) amount = r.max_cents;
        if (avail - amount < floor) { const cut = Math.max(0, avail - floor); if (cut <= 0) { out.push({ rule_id: r.id, skipped: `would leave ${from.nickname || from.id} under its ${money(floor)} floor` }); continue; } amount = cut; why += `, trimmed to keep ${money(floor)} in ${from.nickname || from.id}`; }
        const key = `autosave:${r.id}:${c.today}`;
        out.push({ rule_id: r.id, request: request("SAVE-001", key, { amount_cents: amount, from: from.id, to: to.id, recipient: to.id }, `Autosave ${money(amount)} to ${to.nickname || to.id} (${why})`, { action: "Move", amount: money(amount), recipient: to.nickname || to.id, from: from.nickname || from.id, timing: "today", fee_cents: 0 }, { amount_cents: amount, recipient: to.id, evidence: { rows: basis, rule: r.kind, computed: { amount_cents: amount, available_cents: avail, floor_cents: floor } } }) });
      }
      return out;
    }

    // SAVE-006: the overdraft-prevention move. From the first day under the buffer, the smallest transfer from savings that keeps checking above it, with the day it must land.
    function overdraftPrevention(ctx) {
      const c = ctx || {}, L = typeof AgentLedger !== "undefined" ? AgentLedger : null; if (!L) return null;
      const checking = (c.accounts || []).find(a => a.kind === "checking" && !a.hidden), savings = (c.accounts || []).filter(a => a.kind === "savings" && !a.hidden).sort((a, b) => b.balance_cents - a.balance_cents)[0];
      if (!checking || !savings) return null;
      const f = L.cashflowForecast({ today: c.today, accounts: [checking], transactions: c.transactions, rules: c.rules, horizons: [30] }), buffer = Number.isInteger(c.buffer_cents) ? c.buffer_cents : 10000;
      const first = (f.daily || []).find(d => d.balance_cents < buffer); if (!first) return { needed: false, text: `Checking stays above your ${money(buffer)} buffer for the next 30 days.` };
      const savAvail = Number.isInteger(savings.available_cents) ? savings.available_cents : savings.balance_cents, need = buffer - f.low_point.balance_cents, amount = Math.min(need, savAvail), landBy = addDays(first.on, -1);
      // Nothing in savings is not a $0.00 transfer to confirm: say so and ask for nothing.
      if (amount <= 0) return { needed: true, first_below: first, low_point: f.low_point, amount_cents: 0, short_cents: need, land_by: landBy, request: null, text: `Checking goes under your ${money(buffer)} buffer on ${first.on} and bottoms at ${money(f.low_point.balance_cents)} on ${f.low_point.on}. Savings has ${money(savAvail)} available, so there is nothing to move from it; checking is ${money(need)} short of the line.` };
      const key = `overdraft_prevention:${first.on}:${amount}`;
      return { needed: true, first_below: first, low_point: f.low_point, amount_cents: amount, short_cents: need - amount, land_by: landBy, request: request("SAVE-006", key, { amount_cents: amount, from: savings.id, to: checking.id, recipient: checking.id }, `Move ${money(amount)} from ${savings.nickname || savings.id} to ${checking.nickname || checking.id} before ${first.on}`, { action: "Move", amount: money(amount), recipient: checking.nickname || checking.id, from: savings.nickname || savings.id, timing: `by ${landBy}`, fee_cents: 0 }, { amount_cents: amount, recipient: checking.id, deadline: dayMs(landBy), urgent: f.low_point.balance_cents < 0, reason: `checking goes under ${money(buffer)} on ${first.on}` }), text: `Checking goes under your ${money(buffer)} buffer on ${first.on} and bottoms at ${money(f.low_point.balance_cents)} on ${f.low_point.on}. Moving ${money(amount)} from ${savings.nickname || savings.id} by ${landBy} keeps it above the line${need > amount ? `; savings covers ${money(amount)} of the ${money(need)} needed` : ""}.` };
    }

    // PAY-023: failed-payment triage. The cause decides the step; a retry is a new key that names the original, never a blind resend.
    const CAUSES = [[/insufficient|nsf|balance/i, "insufficient_funds"], [/closed|no account|invalid account|account not found/i, "account_closed"], [/routing|account number|details|invalid/i, "wrong_details"], [/limit|velocity|exceed/i, "limit"], [/timeout|unavailable|down|maintenance|rail/i, "rail_down"], [/declined|refused|risk/i, "declined"]];
    function triageFailed(outcome, ctx) {
      const c = ctx || {}, reason = String(outcome.reason || outcome.message || ""), cause = (CAUSES.find(([re]) => re.test(reason)) || [null, "unknown"])[1];
      const amount = outcome.amount_cents || (outcome.params && outcome.params.amount_cents) || 0, from = acct(c.accounts, outcome.params && outcome.params.from) || (c.accounts || []).find(a => a.kind === "checking");
      const avail = from ? (Number.isInteger(from.available_cents) ? from.available_cents : from.balance_cents) : null;
      const plan = { cause, original_key: outcome.idempotency_key || null, amount_cents: amount };
      if (cause === "insufficient_funds") { const nextIncome = c.next_income_on || null; plan.step = avail != null && avail >= amount ? "funds are there now; retry" : nextIncome ? `retry on ${nextIncome} when income lands, or move ${money(amount - (avail || 0))} from savings first` : "fund the account, then retry"; plan.retry_on = avail != null && avail >= amount ? c.today : nextIncome; plan.retry = avail != null && avail >= amount; }
      else if (cause === "account_closed" || cause === "wrong_details") { plan.step = "fix the recipient details with them before any retry; a retry with the same details fails the same way"; plan.retry = false; }
      else if (cause === "limit") { plan.step = "over a limit; split across days or raise the limit with the bank; I will not retry today"; plan.retry = false; }
      else if (cause === "rail_down") { plan.step = "the rail was unavailable; retry in an hour"; plan.retry = true; plan.retry_on = c.today; }
      else if (cause === "declined") { plan.step = "the rail declined it; the bank's reason decides the next step, I do not resend"; plan.retry = false; }
      else { plan.step = "unknown cause; I do not retry blind. Check the bank's message, then tell me"; plan.retry = false; }
      if (plan.retry && outcome.params) plan.request = request(outcome.capability_id || "PAY-001", `${outcome.idempotency_key || "send"}:retry:${c.today}`, Object.assign({}, outcome.params), `Retry: ${outcome.describe || "the failed payment"} (original ${outcome.idempotency_key || "?"})`, outcome.confirm || { action: "Send", amount: money(amount), recipient: outcome.params.recipient || "?" }, { retry_of: outcome.idempotency_key || null });
      plan.text = `${outcome.describe || "The payment"} failed: ${cause.replace(/_/g, " ")}. ${plan.step.charAt(0).toUpperCase() + plan.step.slice(1)}.${plan.request ? " The retry is a new confirmation." : ""}`;
      return plan;
    }

    // PAY-025: allowance or recurring family send. A saved person, a fixed amount, a cadence, a cap; one request per period under its own key.
    function allowance(spec, ctx) {
      const c = ctx || {}, p = person(c.people, spec.to); if (!p) return { ask: askFor(c.people, spec.to, `Who is ${spec.to}? Allowances only go to people in your list.`) };
      if (!(p.history && p.history.length) && !spec.first_send_confirmed) return { ask: `${p.name} has never received money from you. The first send is confirmed in full; after that the allowance runs on its cadence.`, new_recipient: true };
      if (!Number.isSafeInteger(spec.amount_cents) || spec.amount_cents <= 0) return { ask: "How much each time?" };
      if (!["weekly", "biweekly", "monthly"].includes(spec.cadence)) return { ask: "Weekly, every two weeks, or monthly?" };
      if (spec.day != null && !(Number.isInteger(spec.day) && (spec.cadence === "monthly" ? spec.day >= 1 && spec.day <= 31 : spec.day >= 0 && spec.day <= 6))) return { ask: spec.cadence === "monthly" ? "Which day of the month, 1 to 31?" : "Which day of the week?" };
      const a = { id: `allow-${p.id}-${spec.cadence}-${spec.amount_cents}`, to: p.id, name: p.name, amount_cents: spec.amount_cents, cadence: spec.cadence, day: spec.day != null ? spec.day : null, rail: (p.rails || [])[0] || (p.bank_account ? "ach" : null), status: "active", created_on: c.today, max_per_month_cents: spec.max_per_month_cents || null, capability_id: "PAY-025", tier: "T4" };
      // Exact terms, and the truth about running it: envelope autonomy is off, so every send waits for the person's yes.
      const when = a.cadence === "monthly" ? `monthly on the ${ordinal(a.day || 1)}${(a.day || 1) > 28 ? " (the last day in shorter months)" : ""}` : `${a.cadence === "weekly" ? "every" : "every other"} ${WEEKDAYS[a.day != null ? a.day : 5]}`;
      a.text = `Allowance: ${money(a.amount_cents)} to ${p.name} ${when} by ${a.rail ? railName(a.rail) : "a rail you pick"}${a.max_per_month_cents ? `, never more than ${money(a.max_per_month_cents)} a month` : ""}. I ask for your yes before each send.`;
      return { allowance: a, text: a.text };
    }
    function dueAllowances(list, today, sentThisMonthByAllowance) {
      const out = [];
      for (const a of list || []) {
        if (a.status !== "active") continue;
        const d = new Date(dayMs(today)), dow = d.getUTCDay(), dom = d.getUTCDate(), lastDom = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
        // A monthly day past the month's end (the 31st in November, the 29th in February 2027) goes on its last day.
        const fires = a.cadence === "weekly" ? dow === (a.day != null ? a.day : 5) : a.cadence === "monthly" ? dom === Math.min(a.day || 1, lastDom) : dow === (a.day != null ? a.day : 5) && Math.floor(dayMs(today) / (7 * DAY)) % 2 === 0;
        if (!fires) continue;
        const sent = (sentThisMonthByAllowance || {})[a.id] || 0;
        if (a.max_per_month_cents && sent + a.amount_cents > a.max_per_month_cents) { out.push({ allowance_id: a.id, skipped: `this month's ${money(a.max_per_month_cents)} cap would be passed` }); continue; }
        out.push({ allowance_id: a.id, request: request("PAY-025", `${a.id}:${today}`, { amount_cents: a.amount_cents, recipient: a.name, rail: a.rail }, `Allowance: ${money(a.amount_cents)} to ${a.name}`, { action: "Send", amount: money(a.amount_cents), recipient: a.name, timing: a.rail === "ach" ? "lands in 1-3 business days" : "lands in minutes", fee_cents: 0 }, { amount_cents: a.amount_cents, recipient: a.name, cadence_requested: true }) });
      }
      return out;
    }

    // SOC-002 / SOC-005 / SOC-008 / SOC-010: group expenses, shared goals, gifts with a note, and the settled-debts feed that is off unless asked.
    function group(spec) {
      const g = { id: spec.id || `group-${String(spec.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: spec.name, members: spec.members.slice(), expenses: [], goal: spec.goal ? { name: spec.goal.name, target_cents: spec.goal.target_cents, by: spec.goal.by || null, contributions: [] } : null };
      return g;
    }
    function addExpense(g, e) {
      const MM = typeof MoneyMath !== "undefined" ? MoneyMath : null, among = e.among || g.members, shares = MM ? MM.split(e.amount_cents, among.length) : among.map((_, i) => Math.trunc(e.amount_cents / among.length) + (i < e.amount_cents % among.length ? 1 : 0));
      const row = { id: e.id || `exp-${g.expenses.length + 1}`, what: e.what, amount_cents: e.amount_cents, payer: e.payer, on: e.on, shares: among.map((m, i) => ({ who: m, cents: shares[i] })) };
      g.expenses.push(row); return row;
    }
    function groupBalances(g) {
      const net = {}; for (const m of g.members) net[m] = 0;
      for (const e of g.expenses) { net[e.payer] += e.amount_cents; for (const s of e.shares) net[s.who] -= s.cents; }
      const debts = []; for (const e of g.expenses) for (const s of e.shares) if (s.who !== e.payer) debts.push({ from: s.who, to: e.payer, amount_cents: s.cents });
      const M = typeof AgentMoney !== "undefined" ? AgentMoney : null;
      const settle = M ? M.settleGroup(debts).transfers : debts;
      return { balances: g.members.map(m => ({ who: m, net_cents: net[m], statement: net[m] > 0 ? `${m} is owed ${money(net[m])}` : net[m] < 0 ? `${m} owes ${money(-net[m])}` : `${m} is settled` })), settle_up: settle, total_cents: g.expenses.reduce((s, e) => s + e.amount_cents, 0) };
    }
    function goalPlan(g, today) {
      if (!g.goal) return null; const saved = g.goal.contributions.reduce((s, c) => s + c.amount_cents, 0), left = Math.max(0, g.goal.target_cents - saved), months = g.goal.by ? Math.max(1, Math.round(daysBetween(today, g.goal.by) / 30)) : 1;
      const MM = typeof MoneyMath !== "undefined" ? MoneyMath : null, shares = MM ? MM.split(left, g.members.length) : g.members.map(() => Math.trunc(left / g.members.length));
      // Rounded up to the cent, so the monthly amounts reach each share ("gets there" is true, not a cent short).
      const perMonth = shares.map(s => Math.ceil(s / months));
      return { name: g.goal.name, target_cents: g.goal.target_cents, saved_cents: saved, remaining_cents: left, by: g.goal.by, per_member: g.members.map((m, i) => ({ who: m, remaining_cents: shares[i], per_month_cents: perMonth[i] })), text: left ? `${g.goal.name}: ${money(saved)} of ${money(g.goal.target_cents)} in. ${g.members.map((m, i) => `${m} ${money(perMonth[i])}/month`).join(", ")} gets there${g.goal.by ? ` by ${g.goal.by}` : ""}.` : `${g.goal.name} is fully funded.` };
    }
    function contribute(g, who, amount_cents, on, ctx) { g.goal.contributions.push({ who, amount_cents, on }); return request("SOC-005", `goal:${g.id}:${who}:${on}:${amount_cents}`, { amount_cents, recipient: g.goal.account || g.name, from: ctx && ctx.from || null }, `${who}: ${money(amount_cents)} to ${g.goal.name}`, { action: "Move", amount: money(amount_cents), recipient: g.goal.name, timing: "today", fee_cents: 0 }, { amount_cents, recipient: g.goal.account || g.name }); }
    function gift(spec, ctx) {
      const c = ctx || {}, p = person(c.people, spec.to); if (!p) return { ask: askFor(c.people, spec.to, `Who is ${spec.to}?`) };
      if (!Number.isSafeInteger(spec.amount_cents) || spec.amount_cents <= 0) return { ask: "How much?" };
      if (!spec.occasion) return { ask: "What is the occasion? It goes in the note." };
      const on = spec.on || c.today, note = `${spec.occasion}${spec.message ? ": " + spec.message : ""}`;
      const r = request("SOC-008", `gift:${p.id}:${on}:${spec.amount_cents}`, { amount_cents: spec.amount_cents, recipient: p.name, memo: note, rail: (p.rails || [])[0] || null }, `Gift ${money(spec.amount_cents)} to ${p.name} for ${spec.occasion}`, { action: "Send", amount: money(spec.amount_cents), recipient: p.name, timing: on === c.today ? "today" : `on ${on}`, fee_cents: 0 }, { amount_cents: spec.amount_cents, recipient: p.name, send_on: on, occasion: spec.occasion });
      return { request: r, text: `${money(spec.amount_cents)} to ${p.name} ${on === c.today ? "today" : "on " + on} with the note "${note}". ${on === c.today ? "Confirm and it goes." : "I'll confirm with you that morning."}` };
    }
    function socialFeed(settled, prefs) {
      const on = !!(prefs && prefs.social_feed === true);
      if (!on) return { enabled: false, items: [], text: "The settled-debts feed is off. It stays off unless you turn it on; nothing is shared." };
      return { enabled: true, items: (settled || []).map(s => ({ text: `${s.from} and ${s.to} settled ${s.what || "up"}`, on: s.on })), text: `${(settled || []).length} settled.` };
    }

    // SOC-006: household roles. What each member may see and do; applied to account views and to loop requests.
    const ROLES = { owner: { see: "all", act: "all" }, partner: { see: "shared", act: "shared" }, viewer: { see: "shared", act: "none" }, teen: { see: "own", act: "own_limited" } };
    function household(spec) { return { id: spec.id || "household", members: spec.members.map(m => ({ id: m.id, name: m.name, role: ROLES[m.role] ? m.role : "viewer", limit_cents: m.limit_cents || null })) }; }
    function visibleTo(h, memberId, accounts) {
      const m = h.members.find(x => x.id === memberId); if (!m) return [];
      const r = ROLES[m.role];
      return (accounts || []).filter(a => r.see === "all" || (r.see === "shared" && (a.owners || []).length > 1) || (r.see === "own" && (a.owners || []).length === 1 && (a.owners || [])[0] === memberId) || (a.owners || []).includes(memberId) && r.see !== "shared");
    }
    function mayAct(h, memberId, req, accounts) {
      const m = h.members.find(x => x.id === memberId); if (!m) return { allowed: false, reason: "not in the household" };
      const r = ROLES[m.role]; if (r.act === "all") return { allowed: true };
      if (r.act === "none") return { allowed: false, reason: `${m.name} can see but not act` };
      const from = acct(accounts, req.params && req.params.from); const owners = from ? from.owners || [] : [];
      if (r.act === "shared") return owners.length > 1 && owners.includes(memberId) ? { allowed: true } : { allowed: false, reason: `${m.name} may only act on shared accounts` };
      if (owners.length !== 1 || owners[0] !== memberId) return { allowed: false, reason: `${m.name} may only act on their own account` };
      if (m.limit_cents && (req.params.amount_cents || 0) > m.limit_cents) return { allowed: false, reason: `over ${m.name}'s ${money(m.limit_cents)} limit; the owner approves above it` };
      return { allowed: true };
    }

    return { requestMoney, reminder, settleRequests, schedulePayment, cancelScheduled, dueScheduled, ownTransfer, autosave, overdraftPrevention, triageFailed, allowance, dueAllowances, group, addExpense, groupBalances, goalPlan, contribute, gift, socialFeed, household, visibleTo, mayAct, ROLES, TONES, businessDaysBefore, money };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentMoneyPlans;
