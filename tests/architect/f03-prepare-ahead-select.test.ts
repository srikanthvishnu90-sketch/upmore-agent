// FEATURE 3 (D-011; G4): the selection, the caps and the one card of the day (supabase/functions/_shared/
// career_prepare_ahead.ts), and the scheduled rail over in-memory stores (career_proactive_run.ts runPrepareAhead). No
// network, no database, no model. The connected proof is f03-prepare-ahead-pg.test.ts.
import { AHEAD_PER_DAY, aheadCap, aheadCardText, type AheadDay, type AheadStore, selectAhead, stopWhy } from "../../supabase/functions/_shared/career_prepare_ahead.ts";
import { runPrepareAhead } from "../../supabase/functions/_shared/career_proactive_run.ts";
import { DEFAULT_PREFS } from "../../supabase/functions/_shared/career_alerts.ts";
import { normCompany } from "../../supabase/functions/_shared/career_apply.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
const eq = (a: unknown, b: unknown, m: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
const NOW = Date.UTC(2026, 9, 26, 17); // 13:00 New York
const prefs = { ...DEFAULT_PREFS, keywords: ["data analyst"], locations: ["Chicago"] };
const post = (n: number, o: Record<string, unknown> = {}) => ({
  job_id: `gh:${n}`, company: `Co ${n}`, title: "Data Analyst", location: "Chicago, IL", url: `https://boards.greenhouse.io/co${n}/jobs/${n}`,
  first_seen_at: new Date(NOW - n * 60000).toISOString(), ...o,
});
const none = { jobs: new Set<string>(), companies: new Set<string>() };

Deno.test("selectAhead: the watch's matches, freshest first, first seen in the last 26 hours; one per employer; taken and 30-day employers left out; up to the cap", () => {
  const postings = [
    post(3), post(1), post(2),
    post(4, { company: "Co 1" }), // a second posting at an employer already picked
    post(5, { title: "Marketing Manager" }), // not their watch
    post(6, { location: "Boston, MA" }), // not their place
    post(7, { first_seen_at: new Date(NOW - 27 * 3600000).toISOString() }), // older than today
    post(8), post(9), post(10),
  ];
  const r = selectAhead({ prefs, postings, now: NOW, taken: { jobs: new Set(["gh:8"]), companies: new Set([normCompany("Co 9")]) }, cap: 3 });
  eq(r.picks.map((p) => p.job_id), ["gh:1", "gh:2", "gh:3"], "freshest first, up to the cap");
  eq(r.skipped.map((s) => [s.job_id, s.why]), [["gh:4", "same_employer"], ["gh:8", "taken"], ["gh:9", "employer_30_days"], ["gh:10", "over_cap"]], "every leftover named with its reason");
});

Deno.test("aheadCap: their own pace when set, never above AHEAD_PER_DAY; none set is AHEAD_PER_DAY; an unreadable pace prepares nothing", () => {
  eq(aheadCap(undefined), { cap: AHEAD_PER_DAY, why: null }, "no pace");
  eq(aheadCap(3), { cap: 3, why: null }, "their pace");
  eq(aheadCap("50"), { cap: AHEAD_PER_DAY, why: null }, "a high pace is still the run's day of work");
  eq(aheadCap("lots"), { cap: 0, why: "pace_unreadable" }, "unreadable");
  eq(aheadCap(0), { cap: 0, why: "pace_unreadable" }, "zero is not a pace");
});

Deno.test("aheadCardText: the coverage fraction, the card's own numbered lines, every stop named; nothing when nothing is ready", () => {
  const ready = [1, 2].map((n) => ({ id: `p${n}`, company: `Co ${n}`, card_lines: [`Co ${n}`, "Email: alex@example.test", `Sends to https://co${n}.example`] }));
  const c = aheadCardText({ picked: 3, ready, stops: [{ company: "Co 3", title: "Data Analyst", why: stopWhy({ job_id: "gh:3", outcome: "no_resume", detail: "" }) }] })!;
  assert(c.text.startsWith("2/3 applications ready for your yes."), c.text);
  // One ask per message (the owner's iMessage spec 7.1): the first ready one is the ask; the other is named as waiting.
  assert(c.text.includes("Co 1\n   Email: alex@example.test") && !c.text.includes("Sends to https://co2.example") && c.text.includes("Reply \"YES [[APPROVE-CODE]]\" to submit it") /* the database puts the card's code in the slot (20261026235017) */, c.text);
  assert(c.text.includes('1 more ready: say "show my applications" after this one.'), c.text);
  assert(c.text.includes("Not ready (1):\n- Co 3 (Data Analyst): no resume could be made for it from your confirmed details"), c.text);
  eq(c.take.map((p) => p.id), ["p1"], "the id pushed is the one asked about");
  eq(aheadCardText({ picked: 2, ready: [], stops: [] }), null, "nothing ready, no card");
  const many = Array.from({ length: 40 }, (_, i) => ({ company: `Co ${i}`, title: "Data Analyst", why: "x".repeat(150) }));
  const big = aheadCardText({ picked: 41, ready: ready.slice(0, 1), stops: many })!;
  assert(big.text.length <= 4000 && /- and \d+ more/.test(big.text), "a long list of stops is shortened and counted, never over a text's limit");
});

Deno.test("runPrepareAhead: once a local day per person with alerts on and a resume on file; the card pushed once, retried while held back; nothing for an unreadable pace", async () => {
  const days = new Map<string, AheadDay>(), pushes: { u: string; ids: string[]; text: string }[] = [];
  let hold = true;
  const prepared: string[] = [];
  const ahead: AheadStore = {
    accounts: async (ids) => new Map(ids.filter((u) => u !== "paused").map((u) => [u, { epoch: 0, version: 0 }])),
    resumeOnFile: async (u) => u !== "noresume",
    pace: async (u) => (u === "badpace" ? "lots" : u === "two" ? 2 : undefined),
    taken: async () => none,
    day: async (u) => days.get(u) ?? null,
    saveDay: async (u, d) => { days.set(u, d); },
    ready: async (_u, ids) => ids.map((id) => ({ id, company: id, card_lines: [id, "Email: a@example.test"] })),
    push: async (u, ids, text) => { if (hold) return null; pushes.push({ u, ids, text }); return `card-${u}`; },
  };
  const row = (id: string) => ({ id, tz: "America/New_York", prefs, last_checked_at: new Date(NOW - 3600000).toISOString(), instant_sent_today: 0, last_report_on: null, sent_on: null });
  const store: any = { active: async () => ["one", "two", "noresume", "badpace", "paused"].map(row) };
  const prepare = async (c: any) => { prepared.push(`${c.user_id}:${c.job_id}`); return c.job_id === "gh:2" ? { job_id: c.job_id, outcome: "asked" as const, detail: "1 question(s) asked" } : { job_id: c.job_id, outcome: "ready" as const, detail: "ok", prepared_id: `${c.user_id}-${c.job_id}` }; };
  const postings = [post(1), post(2), post(3)];
  const go = (now: number) => runPrepareAhead({ store, now, recentPostings: async () => postings, ahead, prepare });

  const a = await go(NOW);
  eq([a.people, a.picked, a.ready, a.cards, a.no_resume, a.pace_unreadable], [2, 5, 3, 0, 1, 1], "two people prepared (3 and their pace of 2); one has no resume, one an unreadable pace; the cards held back");
  eq(prepared.filter((p) => p.startsWith("two:")), ["two:gh:1", "two:gh:2"], "their own pace caps the day");
  hold = false;
  const b = await go(NOW + 5 * 60000);
  eq([b.picked, b.cards, prepared.length], [0, 2, 5], "the next run prepares nothing again and pushes the held cards");
  const one = pushes.find((p) => p.u === "one")!;
  assert(one.text.startsWith("2/3 applications ready for your yes.") && one.text.includes("- Co 2 (Data Analyst): it asks something your confirmed details don't answer"), one.text);
  const c = await go(NOW + 10 * 60000);
  eq([c.picked, c.cards, pushes.length], [0, 0, 2], "one card a day");
  const d = await go(NOW + 24 * 3600000);
  eq(d.people, 2, "a new local day prepares again");
});
