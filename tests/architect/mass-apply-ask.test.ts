// MASS APPLY (owner, 2026-11-01): "apply to the top 10 frontend internships in Chicago" in ONE message: the postings on
// file that match the role (every role word in the title) and the place (in the location) are searched for and queued,
// up to the number asked, with no list shown first. Without role words, "the top N" stays the thread's last list.
// Synthetic only; no network, no database.
import assertNode from "node:assert/strict";
import { applyManyAsk, applyTurn, manyWhatOf } from "../../supabase/functions/_shared/career_apply_chat.ts";
import { memoryWantStore } from "../../supabase/functions/_shared/career_apply_want.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const T = Date.parse("2026-11-01T18:00:00Z");
const posting = (i: number, title: string, location: string) => ({ job_id: `greenhouse:co${i}:${i}`, company: `TEST Co ${i}`, title, location, url: `https://boards.greenhouse.io/co${i}/jobs/${i}`, first_seen_at: new Date(T - i * 60000).toISOString() });
const ON_FILE = [
  ...Array.from({ length: 14 }, (_, i) => posting(i + 1, "Frontend Engineering Intern", "Chicago, IL")),
  posting(20, "Frontend Engineering Intern", "New York, NY"),
  posting(21, "Backend Engineering Intern", "Chicago, IL"),
  posting(22, "Senior Frontend Engineer", "Chicago, IL"),
];
const world = () => {
  const wants = memoryWantStore();
  const searched: string[][] = [];
  const turn = (message: string, shortlist: any[] | null = null) => applyTurn({ message, userId: "u1", now: T, wants, apps: async () => [], facts: [], shortlist,
    postings: { search: async (words) => { searched.push(words); return ON_FILE.slice(); } }, resumeOnFile: async () => true });
  return { wants, turn, searched, keys: async () => (await wants.list("u1")).map((w) => w.posting_key).sort() };
};

Deno.test("the one-message ask is read: count, role words, place", () => {
  eq(applyManyAsk("apply to the top 10 frontend internships in Chicago"), { kind: "first", n: 10, what: { role: "frontend internships", words: ["frontend", "internships"], place: "chicago" } });
  eq(applyManyAsk("Apply me to the first 4 remote data analyst jobs"), { kind: "first", n: 4, what: { role: "data analyst jobs", words: ["data", "analyst"], place: "remote" } });
  // No role words: the thread's list, as before.
  eq(applyManyAsk("apply to the top 2"), { kind: "first", n: 2 });
  eq(applyManyAsk("apply to the top 3 of them"), { kind: "first", n: 3 });
  // Words with no role noun are not a search ("quickly", "instead", "jobs that fit this").
  eq(applyManyAsk("apply to the top 3 quickly"), { kind: "first", n: 3 });
  eq(applyManyAsk("apply me to the top 3 jobs that fit this"), { kind: "first", n: 3 });
  eq(manyWhatOf("of these"), null);
  eq(manyWhatOf(""), null);
});

Deno.test("'apply to the top 10 frontend internships in Chicago' with no list: the 10 newest matching postings queued, nothing else", async () => {
  const w = world();
  const r = await w.turn("apply to the top 10 frontend internships in Chicago");
  eq([r?.intent, r?.status], ["career_apply_queue", "queued"], r?.reply);
  eq(await w.keys(), ON_FILE.slice(0, 10).map((p) => p.job_id).sort(), "exactly the first 10 Chicago frontend internships");
  assert(/Queued 10\b/.test(r!.reply) && /nothing is sent|Nothing is sent/i.test(r!.reply), r!.reply);
  assert(!/New York|Backend|Senior/.test(r!.reply), `nothing outside the ask: ${r!.reply}`);
  assert(w.searched.length === 1 && w.searched[0].includes("frontend"), JSON.stringify(w.searched));
});

Deno.test("fewer on file than asked: says how many it found; none: queues nothing and says so", async () => {
  const w = world();
  const r = await w.turn("apply to the top 50 frontend internships in Chicago");
  eq(r?.status, "queued");
  assert(/^I found 14 open, not 50, so these 14\./.test(r!.reply), r!.reply);
  eq((await w.keys()).length, 14);
  const none = await world().turn("apply to the top 5 frontend internships in Boston");
  eq(none?.status, "none");
  assert(/no open frontend internships postings in Boston on file, so nothing was queued/.test(none!.reply), none!.reply);
});

Deno.test("the ask names its role even when a list is on the thread: the search wins, the list is not used", async () => {
  const w = world();
  const list = [{ id: "lever:other:1", company: "TEST Listed", title: "Data Analyst", location: "Chicago, IL", url: "https://jobs.lever.co/other/0e0c3b0e-0000-4000-8000-000000000001" }];
  await w.turn("apply to the top 3 frontend internships in Chicago", list);
  eq(await w.keys(), ON_FILE.slice(0, 3).map((p) => p.job_id).sort());
  // Without role words the list is the ask's, as before.
  const v = world();
  await v.turn("apply to the top 1", list);
  eq(await v.keys(), ["lever:other:0e0c3b0e-0000-4000-8000-000000000001"]);
});
