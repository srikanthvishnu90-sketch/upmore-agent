// Final A5 — low-balance warning cadence through the production proactive path (plan() in
// supabase/functions/_shared/proactive.ts, the hourly run's own function). Simulated days over a fixture
// twin of the owner's real pattern: usable cash $3.99, a $100 buffer, bills of $91.44 a month (Affirm
// $61.44 on the 15th, Comcast $30.00 on the 20th), trailing everyday spend of about $5 a day, a $2,200
// paycheck on the 2nd. Before this fix the warning's key followed the projected first-under-buffer day,
// which moves a day at a time as the trailing average moves (2026-10-13, then -14, then -15), so the same
// warning was planned fresh every day. Now: once per episode, a re-fire only on a material worsening
// (AgentAlerts.lowBalanceEpisode: the low drops >= $50 or >= 10% of the last reported low, or the first
// under-buffer day moves >= 7 days closer), silence otherwise, a silent close on recovery, a fresh fire
// for a new episode. The driver threads exactly what the store threads: the sent log (messages delivered)
// and settings.watches (plan's watches_update, saved by runUser's saveWatches in production).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, mapAccounts, mapTransactions, runUser, type ProactiveStore, type ProactiveMessage } from "../../supabase/functions/_shared/proactive.ts";

const DAY = 86400000;
const add = (ymd: string, n: number) => new Date(Date.parse(ymd + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
let seq = 0;
const row = (on: string, cents: number, merchant: string, acct = "chk") => ({ account_id: acct, provider_transaction_id: "t" + (++seq), currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed" });
const MERCH = ["WHOLE FOODS MARKET", "CHIPOTLE 1234", "UBER TRIP", "TARGET 00012345", "SHELL OIL 57442", "CVS PHARMACY 1234"];
const AMTS = [500, 510, 490, 500, 520, 480, 500, 505, 495, 500];
// The person's rows as the bank sync would have them on `upto`. `water` is the $200 City Water bill whose
// two past charges (Aug 18, Sep 18) only reach the rows on Day 5 — the day its next charge enters the
// forecast and the projected low drops by exactly its $200.
function history(upto: string, water: boolean, acct = "chk"): any[] {
  const rows: any[] = [];
  let d = "2026-07-14", i = 0;
  while (d <= upto) { rows.push(row(d, -AMTS[i % AMTS.length], MERCH[i % MERCH.length] + " " + (1000 + (i * 37) % 9000), acct)); d = add(d, 1); i++; }
  for (const b of ["2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15", "2026-11-15"]) if (b <= upto) rows.push(row(b, -6144, "AFFIRM.COM PAYMENTS", acct));
  for (const b of ["2026-07-20", "2026-08-20", "2026-09-20", "2026-10-20", "2026-11-20"]) if (b <= upto) rows.push(row(b, -3000, "COMCAST XFINITY", acct));
  for (const p of ["2026-07-02", "2026-08-02", "2026-09-02", "2026-10-02", "2026-11-02"]) if (p <= upto) rows.push(row(p, 220000, "ACME CORP PAYROLL DIR DEP", acct));
  if (water) for (const b of ["2026-08-18", "2026-09-18"]) rows.push(row(b, -20000, "CITY WATER UTILITY", acct));
  if (upto >= "2026-11-02") rows.push(row("2026-11-02", -185000, "STATE U TUITION", acct));
  return rows;
}
const acctRow = (balance: number, on: string, id = "chk") => [{ account_id: id, name: "Everyday Checking", institution: "Chase", currency: "USD", account_kind: "checking", balance_cents: balance, available_cents: balance, balance_as_of: on + "T13:30:00Z", fetched_at: on + "T13:30:00Z", sync_error: false, status: "active" }];
const SETTINGS: any = { time_zone: "America/Chicago", weekly_recap_dow: null, morning_brief: false, monthly_close: false, buffer_cents: 10000 };
const at = (on: string, hourUTC = 15) => Date.parse(on + "T00:00:00Z") + hourUTC * 3600000;

interface SimDay { on: string; balance: number; water: boolean; hourUTC?: number; extra?: any[] }
function driver() {
  let sent: any[] = [], watches: any[] = [];
  return {
    run(d: SimDay, o: { watches?: any[]; sent?: any[]; accounts?: any[]; settings?: any } = {}) {
      const now = at(d.on, d.hourUTC ?? 15);
      const tx = history(d.on, d.water).concat(d.extra || []);
      const p: any = plan({ accounts: mapAccounts(o.accounts || acctRow(d.balance, d.on)), transactions: mapTransactions(tx), settings: Object.assign({}, SETTINGS, o.settings || {}, { watches: o.watches !== undefined ? o.watches : watches }), sent: o.sent !== undefined ? o.sent : sent } as any, now);
      if (o.watches === undefined && o.sent === undefined) {
        sent = sent.concat(p.messages.map((m: any) => ({ key: m.key, sent_at: now, cadence: m.cadence })));
        if (p.watches_update) watches = p.watches_update;
      }
      return p;
    },
    get watches() { return watches; },
    get sent() { return sent; },
  };
}
const lowMsgs = (p: any) => p.messages.filter((m: any) => m.key.includes("low_balance"));
const epState = (watches: any[]) => (watches || []).find((w: any) => w.kind === "low_balance_episode");

// The owner's week: balances are the bank's available figure each morning (charges posted before that
// morning are out of it; the $61.44 Affirm charge posts Oct 15, the $200 water charge posts Oct 18).
const WEEK: SimDay[] = [
  { on: "2026-10-12", balance: 399, water: false },
  { on: "2026-10-13", balance: -101, water: false },
  { on: "2026-10-14", balance: -601, water: false },
  { on: "2026-10-15", balance: -1101, water: false },
  { on: "2026-10-16", balance: -7745, water: true },
  { on: "2026-10-17", balance: -8245, water: true },
  { on: "2026-10-18", balance: -8745, water: true },
];

Deno.test("A5 arc: fires once, jitter is silent, the $200 bill re-fires once naming the drop, recovery closes silently, a new episode fires fresh", () => {
  const sim = driver();
  const days = WEEK.map(d => sim.run(d));
  // Day 1 fires once, with the forecast's exact figures.
  assertEquals(lowMsgs(days[0]).length, 1);
  assertEquals(lowMsgs(days[0])[0].key, "watch:low_balance:ep:chk:2026-10-12:-17245:2026-10-13");
  assertEquals(lowMsgs(days[0])[0].text, "Your cash is $3.99 now; it goes under your $100.00 buffer on 2026-10-13 ($3.99) and bottoms at -$172.45 on 2026-11-01. (Chase via SimpleFIN, as of Oct 12, 8:30 AM)");
  // Days 2-4: the projection's first-under day moves (13th, 14th, 15th) and the low jitters — no re-fire.
  for (const i of [1, 2, 3]) {
    assertEquals(lowMsgs(days[i]).length, 0, `day ${i + 1} must be silent`);
    assert(days[i].suppressed.some((s: any) => s.reason === "low_balance_episode"), `day ${i + 1} suppression is the episode's, on record`);
  }
  // Day 5: the $200 water bill enters the picture; the low drops exactly $200.00 — one re-fire, naming it.
  assertEquals(lowMsgs(days[4]).length, 1);
  assertEquals(lowMsgs(days[4])[0].text, "Your cash is -$77.45 now; it goes under your $100.00 buffer on 2026-10-17 (-$77.45) and bottoms at -$372.45 on 2026-11-01. The low is now -$372.45, $200.00 lower than when I last warned you (it was -$172.45). (Chase via SimpleFIN, as of Oct 16, 8:30 AM)");
  // Days 6-7: silent again.
  for (const i of [5, 6]) assertEquals(lowMsgs(days[i]).length, 0, `day ${i + 1} must be silent`);
  // Recovery (Oct 19): the paycheck lands, the projection is above the buffer — no message, episode closed.
  const rec = sim.run({ on: "2026-10-19", balance: 190755, water: true, extra: [row("2026-10-19", 220000, "ACME CORP PAYROLL DIR DEP")] });
  assertEquals(lowMsgs(rec).length, 0, "recovery is silent");
  const closed = epState(sim.watches);
  assert(closed && closed.status === "closed" && closed.closed_on === "2026-10-19" && closed.reports === 2, JSON.stringify(closed));
  // Two weeks later (Nov 3): the money is spent down again — a new episode fires fresh, on its own key.
  const fresh = sim.run({ on: "2026-11-03", balance: 8000, water: true });
  assertEquals(lowMsgs(fresh).length, 1);
  assertEquals(lowMsgs(fresh)[0].key, "watch:low_balance:ep:chk:2026-11-03:-205820:2026-11-04");
  assertEquals(lowMsgs(fresh)[0].text, "Your cash is $80.00 now; it goes under your $100.00 buffer on 2026-11-04 ($18.33) and bottoms at -$2,058.20 on 2026-12-01. (Chase via SimpleFIN, as of Nov 3, 7:30 AM)");
  assertEquals(epState(sim.watches).opened_on, "2026-11-03");
});

Deno.test("A5 variant: worsening by date pull-forward only (>= 7 days closer) re-fires, naming the sooner day", () => {
  const sim = driver();
  sim.run(WEEK[0]);
  // Day 2's own picture is the same low ($3 of jitter at most) with first-under on 2026-10-14; the stored
  // state says the last warning had it on 2026-10-24 — ten days later. Only the date leg can fire.
  const prior = [Object.assign({}, epState(sim.watches), { last_low_cents: -16945, last_first_below_on: "2026-10-24" })];
  const p = sim.run(WEEK[1], { watches: prior, sent: [] });
  assertEquals(lowMsgs(p).length, 1);
  assert(lowMsgs(p)[0].text.includes("The first day under your buffer is now 2026-10-14, 10 days sooner than when I last warned you (it was 2026-10-24)."), lowMsgs(p)[0].text);
});

Deno.test("A5 variant: worsening below every materiality leg does NOT re-fire", () => {
  const sim = driver();
  sim.run(WEEK[0]);
  // $3.00 lower (under $50 and under 10% of $169.45) and 3 days closer (under 7): jitter, silent.
  const prior = [Object.assign({}, epState(sim.watches), { last_low_cents: -16945, last_first_below_on: "2026-10-17" })];
  const p = sim.run(WEEK[1], { watches: prior, sent: [] });
  assertEquals(lowMsgs(p).length, 0);
  assert(p.suppressed.some((s: any) => s.reason === "low_balance_episode"), JSON.stringify(p.suppressed));
});

Deno.test("A5 variant: the once-only log alone (episode state lost) still holds the cadence, read back from the report keys", () => {
  const sim = driver();
  const d1 = sim.run(WEEK[0]);
  assertEquals(lowMsgs(d1).length, 1);
  // The watches entry is gone (a lost settings row), but the sent log carries Day 1's report key with the
  // exact low and first day it reported; Day 2's jitter is still suppressed, not re-fired.
  const p = sim.run(WEEK[1], { watches: [] });
  assertEquals(lowMsgs(p).length, 0);
  assert(p.suppressed.some((s: any) => s.reason === "low_balance_episode"), JSON.stringify(p.suppressed));
});

Deno.test("A5 variant: quiet hours still hold a normal-severity warning (and do not open its episode); the urgent warning is held at night and fires once in the morning", () => {
  // Normal severity: the low point stays above $0. Rent $500 on the 2nd, $600 cash, a $200 buffer.
  const rentRows = ["2026-08-02", "2026-09-02", "2026-10-02"].map(d => row(d, -50000, "LANDLORD RENT PAYMENT"));
  const accounts = [{ account_id: "chk", name: "Everyday Checking", institution: "Chase", currency: "USD", account_kind: "checking", balance_cents: 60000, available_cents: 60000, balance_as_of: "2026-10-12T13:30:00Z", fetched_at: "2026-10-12T13:30:00Z", sync_error: false, status: "active" }];
  const settings = Object.assign({}, SETTINGS, { buffer_cents: 20000 });
  const night = at("2026-10-12", 4 + 24); // 11 p.m. Chicago on Oct 12 (04:00 UTC Oct 13)
  const held: any = plan({ accounts: mapAccounts(accounts), transactions: mapTransactions(rentRows), settings, sent: [] } as any, night);
  assertEquals(lowMsgs(held).length, 0, "quiet hours hold it");
  assertEquals(held.held, 1, "the alerts layer holds it for the morning (plan's held count)");
  assertEquals(held.watches_update, null, "a held warning opens no episode: the morning run must still fire it");
  const morning: any = plan({ accounts: mapAccounts(accounts), transactions: mapTransactions(rentRows), settings, sent: [] } as any, at("2026-10-13", 15));
  assertEquals(lowMsgs(morning).length, 1, "the morning after, it fires");
  // Urgent severity (the owner's week) at 11 p.m.: the alerts layer holds it for the morning like every
  // non-safety item, the held run opens no episode, and the morning fires it exactly once.
  const sim = driver();
  const late = sim.run(Object.assign({}, WEEK[0], { hourUTC: 4 + 24 }));
  assertEquals(lowMsgs(late).length, 0, "held at night, not sent");
  assert(late.held >= 1, "the held count carries it");
  assertEquals(late.watches_update, null, "a held warning opens no episode");
  const morning1 = sim.run(Object.assign({}, WEEK[0], { on: "2026-10-13", balance: -101, hourUTC: 15 }));
  assertEquals(lowMsgs(morning1).length, 1, "the morning fires it, once");
  const morning2 = sim.run(Object.assign({}, WEEK[0], { on: "2026-10-13", balance: -101, hourUTC: 16 }));
  assertEquals(lowMsgs(morning2).length, 0, "and not twice");
});

Deno.test("A5 variant: two different accounts dipping are two episodes, each fires once", () => {
  // One sent log and one watches store, threaded by hand: the account set is the episode's scope, so
  // account A's open episode neither suppresses nor is worsened by account B's dip.
  let sent: any[] = [], watches: any[] = [];
  const runFor = (id: string, d: SimDay) => {
    const now = at(d.on, d.hourUTC ?? 15);
    const p: any = plan({ accounts: mapAccounts(acctRow(d.balance, d.on, id)), transactions: mapTransactions(history(d.on, d.water, id)), settings: Object.assign({}, SETTINGS, { watches }), sent } as any, now);
    sent = sent.concat(p.messages.map((m: any) => ({ key: m.key, sent_at: now, cadence: m.cadence })));
    if (p.watches_update) watches = p.watches_update;
    return p;
  };
  const a1 = runFor("chk-a", WEEK[0]);
  assertEquals(lowMsgs(a1).length, 1);
  assert(lowMsgs(a1)[0].key.includes("low_balance:ep:chk-a:"), lowMsgs(a1)[0].key);
  const b1 = runFor("chk-b", WEEK[0]);
  assertEquals(lowMsgs(b1).length, 1, "account B's dip is its own episode: it fires even though A's already did");
  assert(lowMsgs(b1)[0].key.includes("low_balance:ep:chk-b:"), lowMsgs(b1)[0].key);
  assertEquals(lowMsgs(runFor("chk-a", WEEK[1])).length, 0, "and A's second day is silent, as before");
  assertEquals(lowMsgs(runFor("chk-b", WEEK[1])).length, 0, "and B's second day is silent, as before");
  assertEquals(watches.filter((w: any) => w.kind === "low_balance_episode").length, 2, "two open episodes, one per account");
});

Deno.test("A5 store: runUser delivers the episode's messages once and saves its lifecycle state, including the silent close", async () => {
  let watches: any[] = [], cur: SimDay = WEEK[0];
  const log = new Map<string, any>();
  const store: ProactiveStore & { log: typeof log } = {
    log,
    async users() { return ["u1"]; },
    async load() {
      const tx = history(cur.on, cur.water).concat(cur.on === "2026-10-19" ? [row("2026-10-19", 220000, "ACME CORP PAYROLL DIR DEP")] : []);
      return { accounts: mapAccounts(acctRow(cur.balance, cur.on)), transactions: mapTransactions(tx), settings: Object.assign({}, SETTINGS, { watches }), sent: [...log.values()].map(x => ({ key: x.key, sent_at: x.sent_at, cadence: x.cadence })) };
    },
    async deliver(_u: string, msgs: ProactiveMessage[]) {
      const out: string[] = [];
      for (const m of msgs) { if (log.has(m.key)) continue; log.set(m.key, { key: m.key, sent_at: Date.now(), cadence: m.cadence }); out.push(m.key); }
      return out;
    },
    async saveWatches(_u: string, w: any[]) { watches = w; },
  };
  cur = WEEK[0];
  const r1 = await runUser(store, "u1", at(WEEK[0].on));
  assert(r1.delivered >= 1 && [...log.keys()].some(k => k.includes("low_balance:ep:chk:2026-10-12")), JSON.stringify([...log.keys()]));
  assertEquals(epState(watches).status, "open");
  cur = WEEK[1];
  const before = new Set(log.keys());
  await runUser(store, "u1", at(WEEK[1].on));
  assert(![...log.keys()].filter(k => !before.has(k)).some(k => k.includes("low_balance")), "day 2 delivers no second warning");
  cur = { on: "2026-10-19", balance: 190755, water: true };
  await runUser(store, "u1", at("2026-10-19"));
  assertEquals(epState(watches).status, "closed", "the recovery run saves the close even though no warning went out");
});
