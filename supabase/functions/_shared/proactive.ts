// The agent speaks first (owner's capability list, section 2; Instinct spec docs 01 and 02): the scheduler and the
// delivery layer around engines that already exist and are tested offline. Nothing here invents a detector or a
// number. AgentProactive.feed runs the monitors, the save engine and the alerts (ALRT-001..012); AgentLoop.budgetAllows
// keeps the proactivity budget (one unrequested message a day, four a week; safety, the person's own watches, deadlines
// and the cadences they asked for are exempt); AgentLedger produces every number in the recap, the brief and the close;
// AgentControl keeps the person's standing reports ("every Friday, tell me my food spend").
//
// plan() is pure: rows in, messages out. A store loads the rows and delivers: each message is logged under a unique
// (user, key) first, so a second run, a retry or two schedulers racing can never send it twice; then it lands in the
// person's "Updates from Upmore" chat thread. Every message ends with its data source and as-of time. Nothing here moves
// money, contacts anyone or changes an account: it reads and reports.
//
// Monthly rent (a standing flow the person turned on, packages/domain/81-standing-rent.js): a few days before each due
// date the person is OFFERED that month's card ("Want this month's card to send it? Reply YES or NO"). The offer never
// stages anything: a yes puts up the rent flow's own card, which restates the amount, month and recipient and needs its
// own yes; a no skips the month.
//
// Category budgets (packages/domain/93-budgets.js): a budget the person set in chat is stored as a watch of kind
// "category_budget". Once at 80% and once at 100% of it each month the agent says so, as a watch: what the person asked
// to hear, outside the daily budget, once only by its log key (budget:<id>:<month>:<threshold>). Tracking only: nothing
// is blocked or moved.
//
// Deadlines (capability list item 39, packages/domain/99-deadlines.js over packages/offers/deadlines.json): a dated
// federal tax date, Medicare or HealthCare.gov enrollment date, or an FSA or work open-enrollment date the person gave,
// said 14 days and 2 days before (key deadline:<id>:<lead>), held in quiet hours. A public date for everyone is a finding
// (alerts on, the daily budget unless within 2 days); a date the person told Upmore applies to them is theirs (a watch).
// What they tell it ("I pay estimated taxes", "my FSA plan year ends December 31") is a watch of kind "deadline_fact".
// Dates only, never what to file, pay or pick; nothing about accounts, so it runs with nothing linked too.
import { AgentProactive, AgentLedger, AgentLoop, AgentControl, AgentAlerts, StandingRent, TheNumbers, Budgets, CategoryRules, Deadlines, Reminders } from "./router_core.js";

export interface ProactiveSettings {
  alerts: boolean;                  // event alerts and findings (low balance ahead, large charge, price rise, ...)
  morning_brief: boolean;           // off unless asked: balance, safe to spend, bills due today
  weekly_recap_dow: number | null;  // 0 = Sunday .. 6; null = off
  monthly_close: boolean;           // on the 1st: last month in, out, and what changed
  quiet_start: number | null;       // local hour quiet hours begin (nothing but safety and watches is sent)
  quiet_end: number | null;
  time_zone: string;                // IANA zone the person's day is counted in
  buffer_cents: number | null;      // the cushion "low balance ahead" warns under
  large_threshold_cents: number | null;
  watches: any[];                   // AgentAlerts.parseWatch conditions the person asked for, and their category budgets (Budgets)
  control: any | null;              // AgentControl state: the person's standing reports
  category_rules?: any[];           // CategoryRules: "count Target as groceries" (its own column, 20261012040000)
}
// The time zone default is an assumption the person can change by saying "my time zone is Pacific"; it decides what
// "today", "Sunday" and quiet hours mean, never a number.
export const DEFAULT_SETTINGS: ProactiveSettings = { alerts: true, morning_brief: false, weekly_recap_dow: 0, monthly_close: true, quiet_start: 22, quiet_end: 7, time_zone: "America/New_York", buffer_cents: null, large_threshold_cents: null, watches: [], control: null };

export interface TrialOffer { kind: "cancel_trial"; merchant: string; subscription_id: string; ends_on: string; amount_cents: number | null; cancel_url: string | null; cancel_steps: string | null }
// The month's rent card, offered: what the person would be asked to say yes to. Nothing here is staged.
export interface RentOffer { kind: "rent_month"; standing_id: string; month: string; due_on: string; amount_cents: number; payee_name: string; rail: string }
export type ProactiveOffer = TrialOffer | RentOffer;
export interface ProactiveMessage { key: string; kind: string; text: string; capability_id: string; urgent: boolean; cadence: boolean; source: string; as_of: string | null; offer?: ProactiveOffer }
export interface SentRow { key: string; sent_at: number; cadence: boolean }
// standing: the person's active rows of public.standing_payments (their rent rule).
export interface ProactiveInput { accounts: any[]; transactions: any[]; settings: Partial<ProactiveSettings> | null; sent: SentRow[]; subscriptions?: any[]; standing?: any[] }

const DAY = 86400000;
const money = (c: number) => (c < 0 ? "-$" : "$") + Math.floor(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(Math.abs(c) % 100).padStart(2, "0");
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const addDays = (ymd: string, n: number) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);

// The person's own clock: local date, hour and weekday, and the UTC offset quiet hours are computed with.
export function localClock(now: number, tz: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(new Date(now)).map(p => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`, hour = Number(parts.hour) % 24, minute = Number(parts.minute);
  const offset_hours = Math.round((Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, minute) - now) / 3600000);
  return { date, hour, dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday), day: Number(parts.day), offset_hours };
}
export function validZone(tz: string): boolean { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } }

// Rows from the database in the shapes the engines read: the ledger wants integer cents, the monitors want dollars, so
// one mapped row carries both. A balance that is not a whole number of cents is left out of totals, never guessed.
const KIND: Record<string, string> = { checking: "checking", savings: "savings", cash: "cash", credit: "credit_card", investment: "brokerage", loan: "loan", other: "other", unknown: "other" };
export function mapAccounts(rows: any[]) {
  return (rows || []).filter(r => r && r.status !== "disconnected" && Number.isSafeInteger(r.balance_cents)).map(r => ({
    id: r.account_id, name: r.name, institution: r.institution || null, kind: KIND[r.account_kind] || "other", currency: r.currency || "USD",
    balance_cents: r.balance_cents, available_cents: Number.isSafeInteger(r.available_cents) ? r.available_cents : undefined,
    as_of: r.balance_as_of || r.fetched_at || null, source: r.institution ? `${r.institution} via SimpleFIN` : "SimpleFIN", stale: !!r.sync_error,
    // Kept apart for the connection notes (AgentProactive.connections): the bank's own date and when Upmore saved the read.
    balance_as_of: r.balance_as_of || null, fetched_at: r.fetched_at || null,
  }));
}
export function mapTransactions(rows: any[]) {
  return (rows || []).filter(r => r && r.presence !== "superseded" && Number.isSafeInteger(r.amount_cents) && (r.currency || "USD") === "USD" && r.posted_on).map(r => ({
    id: `${r.account_id}:${r.provider_transaction_id}`, account_id: r.account_id, amount_cents: r.amount_cents, amount: r.amount_cents / 100,
    posted_at: String(r.posted_on).slice(0, 10), merchant_raw: r.merchant_raw, is_pending: !!r.is_pending, is_transfer: !!r.is_transfer,
  }));
}

// The mapped rows back in the shape the chat's numbers read (packages/domain/86-the-numbers.js), so the morning brief and
// "how much can I spend" in chat give the same safe-to-spend from the same definition.
const KIND_BACK: Record<string, string> = { checking: "checking", savings: "savings", cash: "cash", credit_card: "credit", brokerage: "investment", loan: "loan", other: "unknown" };
export function numbersRows(accounts: any[], transactions: any[]) {
  return {
    accounts: (accounts || []).map(a => ({ account_id: a.id, name: a.name, institution: a.institution, account_kind: KIND_BACK[a.kind] || "unknown", currency: a.currency || "USD",
      balance_cents: a.balance_cents, available_cents: a.available_cents ?? null, balance_as_of: a.as_of, fetched_at: a.as_of, sync_error: !!a.stale, status: "active" })),
    transactions: (transactions || []).map(t => ({ account_id: t.account_id, provider_transaction_id: String(t.id), amount_cents: t.amount_cents, posted_on: t.posted_at,
      merchant_raw: t.merchant_raw, is_pending: !!t.is_pending, is_transfer: !!t.is_transfer, currency: "USD" })),
  };
}

function asOfText(asOf: string | null, tz: string) {
  if (!asOf) return "date unknown";
  const t = Date.parse(asOf.length <= 10 ? asOf + "T12:00:00Z" : asOf);
  if (!Number.isFinite(t)) return asOf;
  return asOf.length <= 10 ? asOf : new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t));
}

// "food" is two ledger categories; the person's words map onto the ledger's, never the other way round.
const CATEGORY_WORDS: Record<string, string[]> = { food: ["groceries", "dining"], groceries: ["groceries"], grocery: ["groceries"], dining: ["dining"], "eating out": ["dining"], restaurants: ["dining"], restaurant: ["dining"], takeout: ["dining"], gas: ["transport"], transport: ["transport"], transportation: ["transport"], rides: ["transport"], uber: ["transport"], shopping: ["shopping"], subscriptions: ["subscriptions"], travel: ["travel"], entertainment: ["entertainment"], health: ["health"], utilities: ["utilities"], bills: ["utilities", "subscriptions", "insurance"], rent: ["housing"], housing: ["housing"], fees: ["fees"], spending: [] };

export function plan(input: ProactiveInput, now: number) {
  const s: ProactiveSettings = Object.assign({}, DEFAULT_SETTINGS, input.settings || {});
  const tz = validZone(s.time_zone) ? s.time_zone : DEFAULT_SETTINGS.time_zone;
  const clock = localClock(now, tz), today = clock.date;
  const out = { messages: [] as ProactiveMessage[], suppressed: [] as { key: string; reason: string }[], held: 0, today, hour: clock.hour, fired_reports: [] as { instruction_id: string; period: string }[] };
  const accounts = input.accounts || [], transactions = input.transactions || [];
  const sentKeys = new Set((input.sent || []).map(x => x.key));
  const quietRule = s.quiet_start != null && s.quiet_end != null ? { start: s.quiet_start, end: s.quiet_end, utc_offset_hours: clock.offset_hours } : null;
  const rentLater = () => rentOffers(input, today, tz, clock.hour < 8 || (!!quietRule && AgentAlerts.inQuiet(now, quietRule)), sentKeys, out);
  // The budget counts only unrequested messages; what the person asked for (a cadence, a watch) never uses it up.
  const budgetTimes = (input.sent || []).filter(x => !x.cadence).map(x => x.sent_at);
  // Item 39: dated deadlines (Deadlines.proactive), with their own source and checked date, never the accounts' as-of.
  const deadlinesLater = () => {
    const d: any = (Deadlines as any).proactive({ now, tz, watches: s.watches || [], alerts: s.alerts !== false, quiet_now: !!quietRule && AgentAlerts.inQuiet(now, quietRule), sent: [...sentKeys], budget_times: budgetTimes });
    for (const m of d.messages) { sentKeys.add(m.key); out.messages.push({ key: m.key, kind: m.kind, text: m.text, capability_id: m.capability_id, urgent: false, cadence: m.cadence, source: m.source, as_of: m.as_of }); }
    out.suppressed.push(...d.suppressed);
  };
  // Reminders the person set in chat ("remind me to pay rent on the 28th", packages/domain/103-reminders.js): their own
  // words on the day they asked for, from 9 a.m. their time, as a watch (asked for, so outside the budget and through
  // quiet hours from 9 a.m.), once each by its key. No number and no account: the source is their own message.
  for (const r of (Reminders as any).due(s.watches || [], now, tz, [...sentKeys])) {
    sentKeys.add(r.key);
    out.messages.push({ key: r.key, kind: "watch", text: r.text, capability_id: "ALRT-010", urgent: false, cadence: true, source: "the reminder you set in chat", as_of: new Date(now).toISOString() });
  }
  // Nothing linked: nothing to say from accounts, and never a number from nothing. The rent the person set up is theirs,
  // and so are the dates they told Upmore about and their reminders; a public date needs no account either.
  if (!accounts.length) { deadlinesLater(); rentLater(); return out; }
  const prov: any = (AgentLedger as any).provenance(accounts, transactions, today);
  const cite = ` (${prov.source}, as of ${asOfText(prov.as_of, tz)})`;
  const push = (m: Omit<ProactiveMessage, "source" | "as_of" | "offer"> & { offer?: ProactiveOffer }) => {
    if (sentKeys.has(m.key)) return false;
    sentKeys.add(m.key); out.messages.push(Object.assign({}, m, { text: m.text.trim() + cite, source: prov.source, as_of: prov.as_of }));
    return true;
  };
  const quiet = quietRule;
  const quietNow = !!quiet && AgentAlerts.inQuiet(now, quiet);

  // The person's own watches and budgets are theirs, not "alerts": they come through with alerts off, as "stop alerts"
  // promises ("Anything you asked me to watch still comes through").
  const plainWatches = (s.watches || []).filter((w: any) => !sticky(w));
  // Event alerts and findings, in the loop's decision order: safety, the person's watches, then findings within budget.
  if (!s.alerts && plainWatches.length) {
    for (const x of (AgentAlerts as any).evaluateWatches(plainWatches, { today, transactions, accounts })) push({ key: `watch:${x.key}`, kind: "watch", text: x.text, capability_id: x.capability_id || "ALRT-010", urgent: true, cadence: true });
  }
  if (s.alerts) {
    // Item 5: a connection that stopped updating, or rows nobody has refreshed (AgentProactive.connections), before the
    // findings so a stale number is never the only thing said; one note and one escalation each, within the daily budget,
    // held in quiet hours like any finding.
    for (const c of (AgentProactive as any).connections(accounts.map((a: any) => ({ account_id: a.id, name: a.name, institution: a.institution, balance_as_of: a.balance_as_of, fetched_at: a.fetched_at, status: "active" })), now)) {
      const key = `finding:${c.key}`;
      if (sentKeys.has(key)) continue;
      if (quietNow) { out.suppressed.push({ key: c.key, reason: "quiet_hours" }); continue; }
      const b = AgentLoop.budgetAllows(budgetTimes, { key: c.key, kind: c.kind, reason: "the numbers I read for you are out of date" } as any, now);
      if (!b.allowed) { out.suppressed.push({ key: c.key, reason: b.reason }); continue; }
      if (push({ key, kind: "finding", text: c.text, capability_id: "ACCT-005", urgent: false, cadence: b.reason !== "budget" }) && b.reason === "budget") budgetTimes.push(now);
    }
    // subscriptions: the ones the person tracks in the app (save_subscriptions), which carry trial end dates.
    const f: any = (AgentProactive as any).feed({ today, transactions, accounts, isLive: true, subscriptions: input.subscriptions || [], watches: plainWatches, quiet: quiet || undefined, buffer_cents: s.buffer_cents ?? undefined, large_threshold_cents: s.large_threshold_cents ?? undefined }, { now });
    out.held = (f.held || []).length;
    for (const x of f.safety || []) push({ key: `safety:${x.key}`, kind: "safety", text: x.text, capability_id: x.capability_id || "SEC-001", urgent: true, cadence: true });
    for (const x of f.watches || []) push({ key: `watch:${x.key}`, kind: "watch", text: x.text, capability_id: x.capability_id || "ALRT-010", urgent: true, cadence: true });
    for (const p of f.proactive || []) {
      const key = `finding:${p.key}`;
      if (sentKeys.has(key)) continue;
      if (quietNow && !p.urgent) { out.suppressed.push({ key: p.key, reason: "quiet_hours" }); continue; }
      const b = AgentLoop.budgetAllows(budgetTimes, p, now);
      if (!b.allowed) { out.suppressed.push({ key: p.key, reason: b.reason }); continue; }
      // Only what the budget itself let through counts against it; urgent items and real deadlines are exempt (AgentLoop).
      const exempt = b.reason !== "budget";
      const offer = trialOffer(p, input.subscriptions || []);
      // Owner, 2026-10-11: before a trial bills, ask "should I cancel this for you?"; nothing is cancelled without a yes.
      const text = offer ? `${p.text} Should I cancel it for you? Reply YES or NO.` : p.text;
      if (push({ key, kind: "finding", text, capability_id: offer ? "BILL-010" : p.capability_id || "ALRT-012", urgent: !!p.urgent, cadence: exempt, offer: offer || undefined }) && !exempt) budgetTimes.push(now);
    }
  }
  // Category budgets: 80% and 100% of each, once per budget per month (the log key), counted from the same rows and the
  // same categories as the chat's "how am i doing on my grocery budget" (Budgets.alerts).
  const budgets = (Budgets as any).budgetsIn(s.watches || []);
  if (budgets.length) {
    const nr = numbersRows(accounts, transactions);
    for (const a of (Budgets as any).alerts(budgets, nr.transactions, now, { tz, sent: [...sentKeys], rules: s.category_rules || [] })) push({ key: a.key, kind: "watch", text: a.text, capability_id: "ALRT-010", urgent: false, cadence: true });
  }
  // Deadlines after the findings, so a finding about the person's own money uses the day's budget first.
  deadlinesLater();
  // The month's rent card offer (after the findings, so a trial offer in the same run goes first and rent waits an hour).
  rentLater();
  // What the person asked to hear on a schedule: delivered after quiet hours, from 8 a.m. their time.
  if (quietNow || clock.hour < 8) return out;
  const L: any = AgentLedger;
  if (s.morning_brief) {
    // Safe to spend from the same function as the chat answer (TheNumbers.safeToSpend): cash minus bills due by the
    // payday read from deposits. Its first line is the number; a missing payday is said, never assumed.
    const nr = numbersRows(accounts, transactions);
    const sts: any = (TheNumbers as any).safeToSpend(nr.accounts, nr.transactions, now, { tz });
    const lines = sts ? String(sts.text).split("\n") : [];
    const safeText = !sts ? "" : sts.safe_cents === null ? lines[0] : [lines[0], sts.payday_found === false ? lines.find((l: string) => /couldn't find a regular paycheck/.test(l)) : null].filter(Boolean).join(" ");
    const dueToday = L.recurringCalendar(transactions, today, 0).items.filter((i: any) => i.direction === "debit" && i.on === today);
    const cash = sts && Number.isFinite(sts.cash_cents) ? sts.cash_cents : L.cashPosition(accounts).available_cents;
    push({ key: `brief:${today}`, kind: "morning_brief", capability_id: "ANL-005", urgent: false, cadence: true,
      text: `Good morning. Cash: ${money(cash)}. ${safeText} ${dueToday.length ? `Due today: ${dueToday.map((i: any) => `${i.merchant} ${money(i.amount_cents)}`).join(", ")}.` : "Nothing is due today."}` });
  }
  if (s.weekly_recap_dow != null && clock.dow === s.weekly_recap_dow) {
    const from = addDays(today, -7), to = addDays(today, -1);
    const spend = L.spendingByCategory(transactions, from, to);
    const income = L.enrich(transactions).filter((t: any) => t.posted_at >= from && t.posted_at <= to && t.amount_cents > 0 && t.category === "income").reduce((a: number, t: any) => a + t.amount_cents, 0);
    const ahead = L.recurringCalendar(transactions, today, 7).items.filter((i: any) => i.direction === "debit");
    const top = (spend.categories || []).slice(0, 3).map((c: any) => `${c.category.replace(/_/g, " ")} ${money(c.spend_cents)}`).join(", ");
    push({ key: `recap:${weekKey(today)}`, kind: "weekly_recap", capability_id: "ANL-020", urgent: false, cadence: true,
      text: `Your week (${from} to ${to}): ${money(income)} in, ${money(spend.total_cents)} out${top ? `; most went to ${top}` : ""}. ${ahead.length ? `Coming up in the next 7 days: ${ahead.slice(0, 4).map((i: any) => `${i.merchant} ${money(i.amount_cents)} on ${i.on}`).join(", ")}${ahead.length > 4 ? `, and ${ahead.length - 4} more` : ""}.` : "No recurring bills expected in the next 7 days."}` });
  }
  if (s.monthly_close && clock.day === 1) {
    const prev = addDays(today, -1).slice(0, 7);
    const ivs = L.incomeVsSpend(transactions, prev), mom = L.monthOverMonth(transactions, prev);
    const moved = (mom.categories || []).filter((c: any) => c.this_cents !== c.prior_cents).sort((a: any, b: any) => Math.abs(b.this_cents - b.prior_cents) - Math.abs(a.this_cents - a.prior_cents))[0];
    push({ key: `close:${prev}`, kind: "monthly_close", capability_id: "ANL-002", urgent: false, cadence: true,
      text: `${monthName(prev)} closed: ${money(ivs.income_cents)} in, ${money(ivs.spend_cents)} out, ${ivs.net_cents >= 0 ? `${money(ivs.net_cents)} kept` : `${money(-ivs.net_cents)} more out than in`}. Spending was ${money(Math.abs(mom.delta_cents))} ${mom.delta_cents >= 0 ? "higher" : "lower"} than ${monthName(mom.prior)}${moved ? `, mostly ${moved.category.replace(/_/g, " ")} (${money(moved.prior_cents)} to ${money(moved.this_cents)})` : ""}.` });
  }
  // Standing reports (CORE-004): AgentControl decides what is due, counted in the person's own day.
  if (s.control && Array.isArray(s.control.instructions) && s.control.instructions.length) {
    const ctl: any = (AgentControl as any).create(copy(s.control)), localNow = now + clock.offset_hours * 3600000;
    for (const d of ctl.instructions.due(localNow)) {
      const i = ctl.instructions.get(d.instruction_id), cats: string[] = (i.params && i.params.categories) || [], label = (i.params && i.params.label) || "spending";
      const window = i.cadence === "daily" ? [addDays(today, -1), addDays(today, -1)] : i.cadence === "monthly" ? [addDays(today, -30), addDays(today, -1)] : [addDays(today, -7), addDays(today, -1)];
      const sp = L.spendingByCategory(transactions, window[0], window[1]);
      const picked = cats.length ? (sp.categories || []).filter((c: any) => cats.includes(c.category)) : (sp.categories || []);
      const total = picked.reduce((a: number, c: any) => a + c.spend_cents, 0), n = picked.reduce((a: number, c: any) => a + c.count, 0);
      if (push({ key: `report:${d.instruction_id}:${d.period}`, kind: "standing_report", capability_id: "CORE-004", urgent: false, cadence: true, text: `Your ${label} from ${window[0]} to ${window[1]}: ${money(total)} across ${n} charge${n === 1 ? "" : "s"}. (You asked for this ${whenText(i)}.)` }))
        out.fired_reports.push({ instruction_id: d.instruction_id, period: d.period });
    }
  }
  return out;
}
// AgentControl keeps a reference to the state it is given; a copy keeps the stored settings untouched until saved.
const copy = (x: any) => x == null ? x : JSON.parse(JSON.stringify(x));
const whenText = (i: any) => i.cadence === "daily" ? "every day" : i.cadence === "monthly" ? "every month" : i.day != null ? `every ${DOW[i.day]}` : "every week";
function weekKey(ymd: string) { const d = new Date(Date.parse(ymd + "T00:00:00Z")); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); const y = d.getUTCFullYear(), w1 = new Date(Date.UTC(y, 0, 4)); return `${y}-W${String(1 + Math.round(((d.getTime() - w1.getTime()) / DAY - 3 + ((w1.getUTCDay() + 6) % 7)) / 7)).padStart(2, "0")}`; }
function monthName(ym: string) { return new Date(Date.parse(ym + "-01T00:00:00Z")).toLocaleString("en-US", { month: "long", timeZone: "UTC" }); }

// Each active rent rule whose month card is due to be offered (StandingRent.dueSoon: a few days before the due day, the
// month not already staged). Once per (rule, month) by the log key; from 8 a.m. and outside quiet hours; never in the same
// run as another offer, because one yes in the thread must answer exactly one question (it waits for the next hour).
// The source is the person's own rent setup, with the time it was last changed.
export const RENT_LEAD_DAYS = 3;
function rentOffers(input: ProactiveInput, today: string, tz: string, hold: boolean, sentKeys: Set<string>, out: { messages: ProactiveMessage[]; suppressed: { key: string; reason: string }[] }) {
  for (const row of input.standing || []) {
    const d: any = (StandingRent as any).dueSoon(row, today, RENT_LEAD_DAYS);
    if (!d || !d.rule_id) continue;
    const key = `rent:${d.rule_id}:${d.month}`;
    if (sentKeys.has(key)) continue;
    if (hold) { out.suppressed.push({ key, reason: "quiet_hours" }); continue; }
    if (out.messages.some(m => m.offer)) { out.suppressed.push({ key, reason: "one_offer_at_a_time" }); continue; }
    const asOf = row.updated_at || row.created_at || null;
    sentKeys.add(key);
    out.messages.push({ key, kind: "standing_payment", capability_id: StandingRent.CAPABILITY, urgent: false, cadence: true, source: "your rent setup", as_of: asOf,
      text: `${d.text} (from your rent setup, as of ${asOfText(asOf, tz)})`,
      offer: { kind: "rent_month", standing_id: String(d.rule_id), month: d.month, due_on: d.due_on, amount_cents: d.amount_cents, payee_name: d.payee_name, rail: d.rail } });
  }
}

function trialOffer(p: any, subs: any[]): TrialOffer | null {
  const m = /^trial_converting:([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(String(p.key || "")); if (!m) return null;
  const sub = subs.find(x => String(x.id) === m[1]); if (!sub) return null;
  const amt = Number(sub.amount);
  return { kind: "cancel_trial", merchant: String(sub.merchant), subscription_id: String(sub.id), ends_on: m[2], amount_cents: Number.isFinite(amt) && amt > 0 ? Math.round(amt * 100) : null, cancel_url: sub.cancel_url || null, cancel_steps: sub.cancel_steps || null };
}

// ---- The answer to an offer: "yes" starts the cancellation (its own card is the one explicit approval), "no" keeps
// it, and a yes after the trial has ended fires nothing. A live card in the thread always wins: its own yes is its own.
const OFFER_YES = /^\s*(?:y|yes|yeah|yep|yup|ya|sure|ok|okay|do it|please do|cancel it|yes,? cancel(?: it)?|go ahead)\s*[.!]*\s*$/i;
const OFFER_NO = /^\s*(?:n|no|nope|nah|keep it|leave it|don'?t|no thanks|not now)\s*[.!]*\s*$/i;
export interface OfferDeps { offer: any | null; threadId: string; liveCard(): Promise<boolean>; runFlow(text: string): Promise<{ reply: string; route?: any } | null>; clear(): Promise<boolean>; watch(merchant: string): Promise<boolean> }
export async function offerMessage(message: string, d: OfferDeps, now: number): Promise<{ reply: string; route?: any } | null> {
  const yes = OFFER_YES.test(message), no = OFFER_NO.test(message);
  if ((!yes && !no) || !d.offer || d.offer.thread_id !== d.threadId || (d.offer.kind !== "cancel_trial" && d.offer.kind !== "rent_month")) return null;
  if (await d.liveCard()) return null;
  if (d.offer.kind === "rent_month") return rentOfferAnswer(yes, d, now);
  const o = d.offer, name = o.merchant, when = fmtDay(o.ends_on), amt = Number.isInteger(o.amount_cents) ? money(o.amount_cents) : "the first charge";
  await d.clear();
  if (Date.parse(o.ends_on + "T23:59:59Z") < now) return { reply: `That offer has expired: the ${name} trial ended ${when}, so nothing was cancelled. If you still want it gone, say "cancel ${name}".` };
  if (no) return { reply: `Okay, I'll leave ${name} alone. ${amt === "the first charge" ? "The first charge" : `The first charge of ${amt}`} lands ${when}.` };
  // Yes: the real cancel flow first. A trial that has never charged is not on any card yet, so there is nothing for the
  // flow to act on; then the honest path is the steps to cancel, and a watch for the first charge.
  const flow = await d.runFlow(`cancel ${name}`);
  const actionable = flow && flow.route && ["confirm", "needs_terms", "guided", "stop", "blocked"].includes(flow.route.outcome);
  if (actionable) return { reply: `Okay, cancelling ${name}. ${flow!.reply}`, route: flow!.route };
  const watched = await d.watch(name);
  const how = o.cancel_url ? `open ${o.cancel_url}` : `open your ${name} account settings and find Cancel`;
  return { reply: `${name} hasn't charged you yet, so there's nothing on your cards for me to cancel from here, and nothing was cancelled. To stop it before ${when}: ${how}${o.cancel_steps ? ` (${String(o.cancel_steps).slice(0, 200)})` : ""}.${watched ? ` I'll tell you if ${name} charges you anyway.` : ""}` };
}
const fmtDay = (ymd: string) => new Date(Date.parse(ymd + "T12:00:00Z")).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
// The answer to "Want this month's rent card?": yes puts up the rent flow's own card (amount, month and recipient restated,
// 10 minutes, its own yes); no skips the month; nothing is staged here either way. A month long past offers nothing.
async function rentOfferAnswer(yes: boolean, d: OfferDeps, now: number): Promise<{ reply: string; route?: any }> {
  const o = d.offer, name = monthName(o.month);
  await d.clear();
  if (Date.parse(o.due_on + "T23:59:59Z") + 10 * DAY < now) return { reply: `That offer has expired: ${name}'s rent was due ${fmtDay(o.due_on)}, so nothing was staged. Say "pay my rent" if you want a card.` };
  if (!yes) return { reply: `Okay, skipping ${name}'s rent card. Nothing was staged or sent. Say "pay my rent" if you change your mind.` };
  const flow = await d.runFlow("pay my rent");
  if (flow && flow.reply) return { reply: flow.reply, route: flow.route };
  return { reply: `I couldn't put up ${name}'s rent card right now, so nothing was staged. Say "pay my rent" in a moment.` };
}

// ---- What the person says to set it up (conversational, remembered, restated) ----
// Each command is answered by restating exactly what will happen; nothing is guessed from words it does not know.
export interface SettingsChange { settings: Partial<ProactiveSettings>; reply: string }
const ZONES: Record<string, string> = { eastern: "America/New_York", et: "America/New_York", est: "America/New_York", edt: "America/New_York", central: "America/Chicago", ct: "America/Chicago", cst: "America/Chicago", cdt: "America/Chicago", mountain: "America/Denver", mt: "America/Denver", mst: "America/Denver", arizona: "America/Phoenix", pacific: "America/Los_Angeles", pt: "America/Los_Angeles", pst: "America/Los_Angeles", pdt: "America/Los_Angeles", alaska: "America/Anchorage", hawaii: "Pacific/Honolulu", utc: "UTC", gmt: "UTC", london: "Europe/London", uk: "Europe/London" };
const hourOf = (h: string, ap?: string) => { let n = Number(h) % 12; if (/p/i.test(ap || "")) n += 12; if (!ap && Number(h) >= 13) n = Number(h); return n; };
// Free trials in general, never a named one: "tell me when free trials are about to convert", "let me know before my
// free trials charge me", "alert me when my free trials end".
const TRIAL_ALERT_ASK = /^\s*(?:(?:please|pls|hey|ok|okay|can you|could you)[,\s]+)*(?:tell me|let me know|alert me|text me|ping me|notify me|message me)\s+(?:when|if|before|whenever)\s+(?:(?:any|all|my|the|all my|all of my|any of my)\s+)?(?:free\s+)?trials?\s+(?:(?:are|is)\s+)?(?:(?:about to|going to|gonna|set to|close to|starting to|start to)\s+)?(?:convert(?:s|ing)?|end(?:s|ing)?|expir(?:e|es|ing)|charg(?:e|es|ing)|bill(?:s|ing)?|renew(?:s|ing)?|run(?:s|ning)? out|turn(?:s|ing)? (?:into )?paid|go(?:es|ing)? paid|become(?:s)? paid)(?:\s+(?:me|us))?(?:\s+(?:to|into)\s+paid(?:\s+(?:plans?|subscriptions?))?)?\s*[.!?]*$/i;
const TRIAL_HOW = "In the week before one turns into a paid charge, I message you with the date and the amount and ask \"Should I cancel it for you?\"; nothing is cancelled without your yes.";
const TRIAL_ADD = "A trial doesn't show in your transactions until it charges, so I only track the ones you add: in the app, Add a subscription, choose Free trial under \"Bills every\" and enter the trial-end date. These messages go to people with a linked bank or card. Nothing changed.";
export function trialAlertReply(alertsOn: boolean): string {
  return alertsOn
    ? `That's on for the free trials I track. ${TRIAL_HOW} ${TRIAL_ADD}`
    : `Alerts are off, so I'm not sending trial messages right now. Say "turn alerts back on" to start them. With alerts on: ${TRIAL_HOW.charAt(0).toLowerCase()}${TRIAL_HOW.slice(1)} ${TRIAL_ADD}`;
}
export function parseCommand(text: string, current: Partial<ProactiveSettings> | null, now: number): SettingsChange | null {
  const t = String(text || "").trim(), s = Object.assign({}, DEFAULT_SETTINGS, current || {});
  if (t.length > 200) return null;
  let m;
  if ((m = /^\s*(?:my )?time ?zone(?: is)?\s+([a-z_\/ ]+?)\s*[.!]?$/i.exec(t)) || (m = /^\s*i(?:'m| am) (?:on|in) ([a-z]+) time\s*[.!]?$/i.exec(t))) {
    const z = ZONES[m[1].toLowerCase().trim()] || (validZone(m[1].trim()) && /\//.test(m[1]) ? m[1].trim() : null);
    if (!z) return { settings: {}, reply: `I don't know the time zone "${m[1].trim()}". Say Eastern, Central, Mountain, Pacific, or a zone like America/Chicago. Nothing changed.` };
    return { settings: { time_zone: z }, reply: `Got it: your day runs on ${z.replace(/_/g, " ")} time. Alerts, quiet hours and recaps follow it.` };
  }
  if (/^\s*(?:turn on|start|send me|give me)(?: the| a| my)? morning (?:brief|summary|update)s?\b/i.test(t)) return { settings: { morning_brief: true }, reply: "I'll send a morning brief from 8 a.m. your time: cash, safe to spend, and anything due that day. Say \"stop the morning brief\" to end it." };
  if (/^\s*(?:turn off|stop|no more|cancel)(?: the| my)? morning (?:brief|summary|update)s?\b/i.test(t)) return { settings: { morning_brief: false }, reply: "Morning brief stopped. Nothing else changed." };
  // The weekly recap (money in, money out and where most of it went, what's coming up), also asked for as a "weekly
  // spending summary every Sunday" (megadoc L10) or a weekly money or spend report.
  if ((m = /^\s*(?:send me |give me |i want )?(?:a |the |my )?weekly (?:(?:spending|spend|money) )?(?:recap|summary|update|report)(?: (?:on|every) (sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)(?:day)?s?)?\s*[.!]?$/i.exec(t))) {
    const d = m[1] ? ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].findIndex(x => m![1].toLowerCase().startsWith(x)) : (s.weekly_recap_dow ?? 0);
    return { settings: { weekly_recap_dow: d }, reply: `I'll send your weekly recap every ${DOW[d]} from 8 a.m.: money in, money out, and what's coming up.` };
  }
  if (/^\s*(?:turn off|stop|no more|cancel)(?: the| my)? weekly (?:(?:spending|spend|money) )?(?:recap|summary|update|report)s?\b/i.test(t)) return { settings: { weekly_recap_dow: null }, reply: "Weekly recap stopped. Nothing else changed." };
  if (/^\s*(?:turn off|stop|no more|pause|mute)(?: the| my| all)? (?:alerts|notifications|updates|messages from you)\b/i.test(t)) return { settings: { alerts: false }, reply: "Alerts are off. Anything you asked me to watch still comes through; reports you set up still arrive. Say \"turn alerts back on\" anytime." };
  if (/^\s*(?:turn|switch)(?: my)? (?:alerts|notifications) (?:back )?on\b|^\s*(?:resume|restart) (?:alerts|notifications)\b/i.test(t)) return { settings: { alerts: true }, reply: "Alerts are back on." };
  if ((m = /^\s*(?:set )?quiet hours?(?: (?:from|are|is))?\s+(\d{1,2})(?::00)?\s*(am|pm)?\s*(?:to|-|until)\s*(\d{1,2})(?::00)?\s*(am|pm)?\s*[.!]?$/i.exec(t))) {
    const a = hourOf(m[1], m[2]), b = hourOf(m[3], m[4]);
    if (a > 23 || b > 23 || a === b) return { settings: {}, reply: "I couldn't read those hours. Try \"quiet hours 10pm to 7am\". Nothing changed." };
    return { settings: { quiet_start: a, quiet_end: b }, reply: `Quiet hours set: ${fmtHour(a)} to ${fmtHour(b)} your time. Only safety alerts and things you asked me to watch come through then.` };
  }
  // Category budgets: "set a $400 grocery budget", "budget $250 a month for eating out", "stop my grocery budget",
  // "delete my budgets" (packages/domain/93-budgets.js). Each is restated exactly; nothing moves money.
  const zone = validZone(s.time_zone) ? s.time_zone : DEFAULT_SETTINGS.time_zone;
  const bc: any = (Budgets as any).command(t, s.watches || [], now, zone);
  if (bc) return { settings: bc.watches ? { watches: capWatches(bc.watches) } : {}, reply: bc.reply };
  // Category rules: "recategorize Target as groceries", "count Costco as groceries", "stop counting Target as
  // groceries", "show my category rules" (packages/domain/95-category-rules.js). Restated exactly; they change how
  // spending is counted, nothing at the bank, and never move money.
  const cr: any = (CategoryRules as any).command(t, s.category_rules || [], now);
  if (cr) return { settings: cr.rules ? { category_rules: cr.rules } : {}, reply: cr.reply };
  // Deadlines the person tells Upmore (packages/domain/99-deadlines.js): "I pay estimated taxes", "I filed an extension",
  // "I'm on Medicare", "I get my insurance from healthcare.gov", "my FSA plan year ends December 31 with a grace period
  // until March 15", "my open enrollment at work is November 2 to November 13", "forget my FSA deadline". Restated
  // exactly; dates only.
  const dc: any = (Deadlines as any).command(t, s.watches || [], now, zone);
  if (dc) return { settings: dc.watches ? { watches: capWatches(dc.watches) } : {}, reply: dc.reply };
  // Reminders (megadoc D11; packages/domain/103-reminders.js): "remind me to pay rent on the 28th", "... every month",
  // "show my reminders", "stop the reminder to pay rent". Restated with the day; a reminder only, nothing paid or moved.
  // A route reminder ("... for R0119") and a free trial with its end date are left to their own paths.
  const rc: any = (Reminders as any).command(t, s.watches || [], now, zone);
  if (rc) return { settings: rc.watches ? { watches: capWatches(rc.watches) } : {}, reply: rc.reply };
  // "Tell me when free trials are about to convert" (megadoc J15): said as it is, nothing saved. plan() asks "Should I
  // cancel it for you?" before a trial the person tracks in the app bills (save_subscriptions, billing "trial" with its
  // end date, within the 7 days before; AgentMonitors.trialsConverting), with alerts on, for people the hourly run
  // reads (a linked bank or card). Trials are never found on their own: none shows in transactions before it charges.
  // A named trial with a date ("Hulu free trial ends Oct 20, remind me") is the chat trial tracker's; this leaves it.
  if (TRIAL_ALERT_ASK.test(t) && !/\d/.test(t)) return { settings: {}, reply: trialAlertReply(s.alerts !== false) };
  // "Remind me when Netflix charges me" is a watch too (Reminders leaves "remind me when/if" to it).
  if ((m = /^\s*(?:tell me|let me know|alert me|text me|warn me|ping me|remind me)\s+(?:when|if)\s+(.+?)\s*[.!]?$/i.exec(t))) {
    const w: any = (AgentAlerts as any).parseWatch(t, now); // it strips the "tell me when" itself
    // "Tell me when my rent is due" is usually a question: an unreadable "tell me when" goes to the normal chat; an
    // explicit "alert me / text me / ping me" gets the honest list of what can be watched.
    if (!w.ok) return /^\s*tell me|^\s*let me know/i.test(t) ? null : { settings: {}, reply: w.text + " Nothing was set up." };
    // created_on: a watch reads charges from the day it was set, never older ones (59-agent-alerts.js evaluateWatches).
    // The table refuses any run of 9 or more digits in watches (no identity numbers): the id carries the time in base 36
    // and created_at is an ISO string. A millisecond timestamp here made every chat-set watch fail to save.
    const watch = Object.assign({}, w.watch, { id: `w${(s.watches || []).length + 1}-${now.toString(36)}`, created_at: new Date(now).toISOString(), created_on: localClock(now, zone).date });
    // The same watch twice would say the same thing twice ("tell me when" and then "remind me when Netflix charges me").
    if ((s.watches || []).some((x: any) => !sticky(x) && x.status !== "revoked" && AgentAlerts.restateWatch(x) === AgentAlerts.restateWatch(watch))) return { settings: {}, reply: `I'm already watching that: ${AgentAlerts.restateWatch(watch).replace(/^I'll tell you /, "")} Nothing changed.` };
    return { settings: { watches: capWatches((s.watches || []).concat([watch])) }, reply: AgentAlerts.restateWatch(watch) + " Say \"show my alerts\" to see them." };
  }
  if ((m = /^\s*every (day|morning|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)[, ]+(?:tell me|send me|show me|give me)(?: my| the)? (.+?)(?: spend(?:ing)?| spent)?\s*[.!]?$/i.exec(t))) {
    const when = m[1].toLowerCase(), words = m[2].toLowerCase().replace(/\b(spend(?:ing)?|spent|total)\b/g, "").trim();
    const cats = CATEGORY_WORDS[words];
    if (!cats) return { settings: {}, reply: `I can report spending for food, groceries, dining, gas, shopping, subscriptions, travel, entertainment, health, utilities, rent or fees. "${m[2]}" isn't one I can measure yet. Nothing was set up.` };
    const dow = DOW.findIndex(d => d.toLowerCase() === when);
    const spec = { capability_id: "ANL-001", text: `Tell me my ${words ? `${words} spending` : "spending"}`, cadence: when === "day" || when === "morning" ? "daily" : when === "month" ? "monthly" : "weekly", day: when === "month" ? 1 : dow >= 0 ? dow : null, params: { categories: cats, label: words ? `${words} spending` : "spending" } };
    const ctl: any = (AgentControl as any).create(copy(s.control) || undefined), si: any = ctl.instructions.create(spec, now);
    return { settings: { control: JSON.parse(JSON.stringify(ctl.state)) }, reply: `Done: I'll tell you your ${words ? `${words} spending` : "spending"} ${whenText(si)}. It only reads your linked accounts; it never moves money. Say "stop my ${words || "spending"} report" to end it.` };
  }
  if ((m = /^\s*(?:stop|cancel|end)(?: my| the)? (.+?) report\s*[.!]?$/i.exec(t)) && s.control) {
    const ctl: any = (AgentControl as any).create(copy(s.control)), hit = ctl.instructions.list().filter((i: any) => i.status === "active" && i.text.toLowerCase().includes(m![1].toLowerCase()));
    if (!hit.length) return { settings: {}, reply: `I don't have a ${m[1]} report set up. Nothing changed.` };
    for (const i of hit) ctl.instructions.revoke(i.id, now);
    return { settings: { control: JSON.parse(JSON.stringify(ctl.state)) }, reply: `Stopped: ${hit.map((i: any) => i.text.toLowerCase()).join(", ")}.` };
  }
  if (/^\s*(?:show|list|what are)(?: me)? my (?:alerts|watches|reports|notifications)\b|^\s*what (?:will|do) you (?:tell|send|alert) me\b/i.test(t)) return { settings: {}, reply: describe(s, now) };
  return null;
}
const fmtHour = (h: number) => `${h % 12 || 12} ${h < 12 ? "a.m." : "p.m."}`;
// The table holds at most 20 watches. Budgets (one per category, at most 8), deadline facts (one per kind, at most 6) and
// reminders (at most 5) are never pushed out by a new watch: the oldest plain watches go first, and a new one always fits.
export const MAX_WATCHES = 20;
const sticky = (w: any) => (Budgets as any).isBudget(w) || (Deadlines as any).isFact(w) || (Reminders as any).isReminder(w);
export function capWatches(list: any[]): any[] {
  const all = list || [], keep = all.filter(sticky);
  const room = Math.max(0, MAX_WATCHES - keep.length), plain = all.filter((w: any) => !sticky(w));
  const kept = new Set([...keep, ...plain.slice(Math.max(0, plain.length - room))]);
  return all.filter((w: any) => kept.has(w));
}
export function describe(s0: Partial<ProactiveSettings> | null, now: number = Date.now()) {
  const s = Object.assign({}, DEFAULT_SETTINGS, s0 || {}), parts: string[] = [];
  parts.push(s.alerts ? "Alerts are on (low balance ahead, large or unusual charges, price rises, deposits, fees), at most one unrequested note a day." : "Alerts are off.");
  const plain = (s.watches || []).filter((w: any) => !sticky(w));
  if (plain.length) parts.push(`You asked me to watch: ${plain.map((w: any) => AgentAlerts.restateWatch(w).replace(/^I'll tell you /, "").replace(/\.$/, "")).join("; ")}.`);
  const budgetLine = (Budgets as any).describe(s.watches || []);
  if (budgetLine) parts.push(budgetLine);
  const deadlineLine = (Deadlines as any).describe(s.watches || []);
  if (deadlineLine) parts.push(deadlineLine);
  const reminderLine = (Reminders as any).describe(s.watches || [], now, s.time_zone);
  if (reminderLine) parts.push(reminderLine);
  const ruleLine = (CategoryRules as any).describe(s.category_rules || []);
  if (ruleLine) parts.push(ruleLine);
  const reports = s.control && Array.isArray(s.control.instructions) ? s.control.instructions.filter((i: any) => i.status === "active") : [];
  if (reports.length) parts.push(`Reports: ${reports.map((i: any) => `${i.params && i.params.label || "spending"} ${whenText(i)}`).join("; ")}.`);
  parts.push(s.weekly_recap_dow != null ? `Weekly recap on ${DOW[s.weekly_recap_dow]}s.` : "No weekly recap.");
  parts.push(s.morning_brief ? "Morning brief on." : "No morning brief.");
  if (s.quiet_start != null && s.quiet_end != null) parts.push(`Quiet hours ${fmtHour(s.quiet_start)} to ${fmtHour(s.quiet_end)}, ${s.time_zone.replace(/_/g, " ")} time.`);
  return parts.join(" ");
}

// ---- Storage and delivery ----
export interface ProactiveStore {
  users(limit: number): Promise<string[]>;
  load(userId: string): Promise<ProactiveInput>;
  // Log first, then deliver: returns the keys actually delivered (a key already logged is skipped).
  deliver(userId: string, messages: ProactiveMessage[], firedReports: { instruction_id: string; period: string }[]): Promise<string[]>;
}
export async function runUser(store: ProactiveStore, userId: string, now: number) {
  const input = await store.load(userId);
  const p = plan(input, now);
  const delivered = p.messages.length ? await store.deliver(userId, p.messages, p.fired_reports) : [];
  return { delivered: delivered.length, planned: p.messages.length, suppressed: p.suppressed.length, held: p.held };
}
export async function runAll(store: ProactiveStore, now: number, limit = 200, deadline = Date.now() + 100000) {
  const totals = { users: 0, delivered: 0, suppressed: 0, failed: 0 };
  for (const u of await store.users(limit)) {
    if (Date.now() > deadline) break;
    totals.users++;
    try { const r = await runUser(store, u, now); totals.delivered += r.delivered; totals.suppressed += r.suppressed; }
    catch (e) { totals.failed++; console.error(`[proactive] user run failed: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return totals;
}

export const THREAD_TITLE = "Updates from Upmore";
// The real store, through the service-role client. Reads are the person's own rows; writes are the log and their thread.
export function supabaseProactiveStore(admin: any): ProactiveStore {
  return {
    async users(limit) {
      const r = await admin.from("agent_financial_accounts").select("user_id").eq("status", "active").limit(5000);
      if (r.error) throw new Error("accounts unavailable");
      // People with rent turned on are offered its card even with nothing linked; an unreadable table only skips them.
      const rent = await admin.from("standing_payments").select("user_id").eq("status", "active").limit(5000);
      if (rent.error) console.error("[proactive] standing payments unavailable");
      // So are people with a reminder set in chat (a reminder needs no account); an unreadable table only skips them.
      const set = await admin.from("agent_proactive_settings").select("user_id,watches").limit(5000);
      if (set.error) console.error("[proactive] settings unavailable");
      const reminded = set.error ? [] : (set.data || []).filter((x: any) => Array.isArray(x.watches) && x.watches.some((w: any) => (Reminders as any).isReminder(w)));
      return [...new Set([...(r.data || []), ...(rent.error ? [] : rent.data || []), ...reminded].map((x: any) => x.user_id))].slice(0, limit) as string[];
    },
    async load(userId) {
      const since = new Date(Date.now() - 400 * DAY).toISOString().slice(0, 10);
      const [acc, tx, st, log, subs, rent] = await Promise.all([
        admin.from("agent_financial_accounts").select("account_id,name,institution,currency,account_kind,balance_cents,available_cents,balance_as_of,fetched_at,sync_error,status").eq("user_id", userId),
        admin.from("agent_financial_transactions").select("account_id,provider_transaction_id,currency,amount_cents,posted_on,merchant_raw,is_pending,is_transfer,presence").eq("user_id", userId).gte("posted_on", since).order("posted_on", { ascending: true }).limit(5000),
        admin.from("agent_proactive_settings").select("*").eq("user_id", userId).maybeSingle(),
        admin.from("agent_proactive_log").select("key,sent_at,cadence").eq("user_id", userId).gte("sent_at", new Date(Date.now() - 40 * DAY).toISOString()).limit(2000),
        admin.from("save_subscriptions").select("id,merchant,amount,billing_interval,next_billing_date,status,cancel_url,cancel_steps").eq("user_id", userId).limit(500),
        admin.from("standing_payments").select("id,kind,payee_name,payee_handle,rail,amount_cents,day_of_month,funding,status,created_at,updated_at,last_staged_month").eq("user_id", userId).eq("kind", "rent").eq("status", "active").limit(5),
      ]);
      for (const r of [acc, tx, st, log]) if (r.error) throw new Error("proactive data unavailable");
      // Tracked subscriptions only add trial and renewal alerts; when they can't be read the rest still runs (logged).
      if (subs.error) console.error("[proactive] tracked subscriptions unavailable");
      // Same for the rent rule: unreadable means no rent card is offered this run, and the rest still runs (logged).
      if (rent.error) console.error("[proactive] standing payments unavailable");
      return { accounts: mapAccounts(acc.data), transactions: mapTransactions(tx.data), settings: st.data || null, sent: (log.data || []).map((x: any) => ({ key: x.key, sent_at: Date.parse(x.sent_at), cadence: !!x.cadence })), subscriptions: subs.error ? [] : (subs.data || []), standing: rent.error ? [] : (rent.data || []) };
    },
    async deliver(userId, messages, firedReports) {
      const delivered: string[] = [];
      let threadId: string | null = null;
      for (const m of messages) {
        // The log row is the once-only guarantee: a unique (user, key) insert that a race or a retry cannot repeat.
        const claim = await admin.from("agent_proactive_log").insert({ user_id: userId, key: m.key, kind: m.kind, capability_id: m.capability_id, cadence: m.cadence }).select("key");
        if (claim.error) { if (claim.error.code === "23505") continue; throw new Error("proactive log unavailable"); }
        if (!threadId) threadId = await ensureThread(admin, userId);
        const msg = await admin.from("agent_messages").insert({ thread_id: threadId, role: "assistant", content: m.text, meta: { proactive: true, key: m.key, kind: m.kind, capability_id: m.capability_id, source: m.source, as_of: m.as_of } }).select("id").single();
        if (msg.error) { await admin.from("agent_proactive_log").delete().eq("user_id", userId).eq("key", m.key); throw new Error("message delivery failed"); }
        await admin.from("agent_proactive_log").update({ thread_id: threadId, message_id: msg.data.id }).eq("user_id", userId).eq("key", m.key);
        // An offer waits for the person's yes or no in this thread; the newest offer replaces an older one.
        if (m.offer) await admin.from("agent_proactive_settings").upsert({ user_id: userId, pending_offer: Object.assign({}, m.offer, { thread_id: threadId, message_key: m.key }), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
        delivered.push(m.key);
      }
      // A standing report fired this period is remembered on the instruction itself, so a fresh state never re-fires it.
      if (firedReports.length) {
        const st = await admin.from("agent_proactive_settings").select("control").eq("user_id", userId).maybeSingle();
        if (!st.error && st.data && st.data.control) {
          const ctl: any = (AgentControl as any).create(copy(st.data.control));
          for (const f of firedReports) ctl.instructions.fired(f.instruction_id, f.period);
          await admin.from("agent_proactive_settings").update({ control: JSON.parse(JSON.stringify(ctl.state)), updated_at: new Date().toISOString() }).eq("user_id", userId);
        }
      }
      return delivered;
    },
  };
}
async function ensureThread(admin: any, userId: string): Promise<string> {
  const found = await admin.from("agent_threads").select("id").eq("user_id", userId).eq("title", THREAD_TITLE).order("created_at", { ascending: false }).limit(1);
  if (!found.error && found.data && found.data[0]) return found.data[0].id;
  const made = await admin.from("agent_threads").insert({ user_id: userId, title: THREAD_TITLE }).select("id").single();
  if (made.error) throw new Error("thread unavailable");
  return made.data.id;
}

// ---- The scheduled entry point (POST /functions/v1/agent-proactive, called hourly by pg_cron) ----
// Authenticated by PROACTIVE_SECRET in the x-upmore-proactive-secret header (constant-time compare); never a user
// JWT, never public. The response carries counts only, never message text or a person's numbers.
// `extra` runs after the main pass inside the same authenticated call (guided manual connect's session health check,
// _shared/manual_connect.ts runManualHealth); it returns counts only, and its failure never fails the main run.
export async function handleProactive(req: Request, d: { env: { get(k: string): string | undefined }; store: ProactiveStore; now?: () => number; extra?: (now: number) => Promise<Record<string, unknown>> }): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const want = d.env.get("PROACTIVE_SECRET") || "", got = req.headers.get("x-upmore-proactive-secret") || "";
  if (want.length < 32 || !sameSecret(got, want)) return json({ error: "unauthorized" }, 401);
  let limit = 200;
  try { const raw = await req.text(); if (raw.length > 200) return json({ error: "request too large" }, 413); if (raw) { const b = JSON.parse(raw); if (b.limit !== undefined) limit = b.limit; } } catch { return json({ error: "invalid request" }, 400); }
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return json({ error: "invalid limit" }, 400);
  try {
    const now = (d.now || Date.now)(), out: Record<string, unknown> = Object.assign({ ok: true }, await runAll(d.store, now, limit));
    if (d.extra) { try { out.manual_connect = await d.extra(now); } catch (e) { console.error(`[proactive] manual connect health failed: ${e instanceof Error ? e.message : String(e)}`); out.manual_connect = { failed: true }; } }
    return json(out);
  }
  catch (e) { console.error(`[proactive] run failed: ${e instanceof Error ? e.message : String(e)}`); return json({ ok: false, error: "run failed" }, 503); }
}
function sameSecret(a: string, b: string) { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }

// ---- The chat side: "send me a weekly recap on Fridays", "tell me when checking drops below $500", "quiet hours 10pm
// to 7am", "every Friday tell me my food spend", "show my alerts". Recognized without a database read (most messages
// cost nothing), then read, changed and saved through the person's own session (RLS), and restated. A save that fails
// says so and changes nothing. Returns null for anything else, which goes on to the normal chat.
export interface SettingsDb { read(): Promise<{ ok: boolean; settings: any | null }>; save(change: Partial<ProactiveSettings>): Promise<boolean> }
export async function settingsMessage(message: string, db: SettingsDb, now: number): Promise<{ reply: string; changed: boolean } | null> {
  if (!parseCommand(message, null, now)) return null;
  const cur = await db.read();
  if (!cur.ok) return { reply: "I can't reach your alert settings right now, so nothing changed. Try again in a moment.", changed: false };
  const cmd = parseCommand(message, cur.settings, now);
  if (!cmd) return null;
  if (!Object.keys(cmd.settings).length) return { reply: cmd.reply, changed: false };
  if (!(await db.save(cmd.settings))) return { reply: "I couldn't save that right now, so nothing changed. Try again in a moment.", changed: false };
  return { reply: cmd.reply, changed: true };
}
export function supabaseSettingsDb(supabase: any, userId: string): SettingsDb {
  return {
    async read() { const r = await supabase.from("agent_proactive_settings").select("*").eq("user_id", userId).maybeSingle(); return r.error ? { ok: false, settings: null } : { ok: true, settings: r.data || null }; },
    async save(change) { const r = await supabase.from("agent_proactive_settings").upsert(Object.assign({ user_id: userId }, change, { updated_at: new Date().toISOString() }), { onConflict: "user_id" }); return !r.error; },
  };
}

// The real deps for offerMessage: the pending offer is read only when the message could answer one.
export const mayAnswerOffer = (message: string) => OFFER_YES.test(message) || OFFER_NO.test(message);
export async function readOffer(supabase: any, userId: string): Promise<any | null> {
  const r = await supabase.from("agent_proactive_settings").select("pending_offer").eq("user_id", userId).maybeSingle();
  return r.error || !r.data ? null : r.data.pending_offer || null;
}
export function supabaseOfferDeps(supabase: any, userId: string, threadId: string, offer: any, x: { liveCard(): Promise<boolean>; runFlow(text: string): Promise<{ reply: string; route?: any } | null> }): OfferDeps {
  return {
    offer, threadId, liveCard: x.liveCard, runFlow: x.runFlow,
    async clear() { const r = await supabase.from("agent_proactive_settings").update({ pending_offer: null, updated_at: new Date().toISOString() }).eq("user_id", userId); return !r.error; },
    async watch(merchant: string) {
      const r = await supabase.from("agent_proactive_settings").select("watches").eq("user_id", userId).maybeSingle();
      if (r.error) return false;
      const w: any = (AgentAlerts as any).parseWatch(`tell me when ${merchant} charges me`, Date.now());
      if (!w.ok) return false;
      const watches = capWatches(((r.data && r.data.watches) || []).concat([Object.assign({}, w.watch, { id: `w-trial-${Date.now().toString(36)}`, created_at: new Date().toISOString() })]));
      const u = await supabase.from("agent_proactive_settings").upsert({ user_id: userId, watches, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      return !u.error;
    },
  };
}
