// MASS APPLY (owner, 2026-11-01): "apply to the top 10 frontend internships in Chicago" in ONE message: the postings on
// file that match the role (every role word in the title) and the place (in the location, or remote) are searched for,
// screened, and the first N that pass are queued, with no list shown first. Review of #366: the place and remote go into
// the search itself (never cut by a nationwide newest-first limit); at most 50 per message, said plainly; ranked by fit from
// confirmed facts when it can be computed, else said to be newest first; screens before the cut to N; hedged, negated,
// conditional and second-person phrasings queue nothing. Without role words, "the top N" stays the thread's last list.
// The search is the in-memory store with the production search's semantics (career_ingest.ts memoryPostingsDb: every word
// in the title, company, place or description; title matches first, newest first; the limit honored). No network, no database.
import assertNode from "node:assert/strict";
import { applyManyAsk, applyTurn, MANY_MAX, manyWhatOf } from "../../supabase/functions/_shared/career_apply_chat.ts";
import { memoryWantStore } from "../../supabase/functions/_shared/career_apply_want.ts";
import { memoryPostingsDb } from "../../supabase/functions/_shared/career_ingest.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const T = Date.parse("2026-11-01T18:00:00Z");
let seq = 0;
const posting = (title: string, location: string, minutesAgo: number) => {
  const i = ++seq;
  return { job_id: `greenhouse:co${i}:${1000 + i}`, provider: "greenhouse", board: `co${i}`, company: `TEST Co ${i}`, title, location, url: `https://boards.greenhouse.io/co${i}/jobs/${1000 + i}`,
    description: "Build product UI.", first_seen_at: new Date(T - minutesAgo * 60000).toISOString(), last_seen_at: new Date(T).toISOString(), posted_at: null, closed_at: null } as any;
};
async function world(rows: any[], o: { apps?: any[]; facts?: any[]; failSearch?: boolean; shortlist?: any[] | null } = {}) {
  const db = memoryPostingsDb();
  await db.putMany(rows);
  const wants = memoryWantStore();
  const limits: number[] = [];
  const postings = { search: async (words: string[], limit: number) => { limits.push(limit); if (o.failSearch) throw new Error("TEST search down"); return await db.search(words, limit); } };
  const turn = (message: string) => applyTurn({ message, userId: "u1", now: T, wants, apps: async () => o.apps ?? [], facts: o.facts ?? [], shortlist: o.shortlist ?? null, postings, resumeOnFile: async () => true });
  return { turn, limits, keys: async () => (await wants.list("u1")).map((w) => w.posting_key).sort() };
}
const keysOf = (ps: any[]) => ps.map((p) => p.job_id).sort();

Deno.test("the one-message ask is read: count, role words, place; no role noun is not a search", () => {
  eq(applyManyAsk("apply to the top 10 frontend internships in Chicago"), { kind: "first", n: 10, what: { role: "frontend internships", words: ["frontend", "internships"], place: "chicago" } });
  eq(applyManyAsk("Apply me to the first 4 remote data analyst jobs"), { kind: "first", n: 4, what: { role: "data analyst jobs", words: ["data", "analyst"], place: "remote" } });
  eq(applyManyAsk("apply to the top 2"), { kind: "first", n: 2 });
  eq(applyManyAsk("apply to the top 3 of them"), { kind: "first", n: 3 });
  eq(applyManyAsk("apply to the top 3 for me"), { kind: "first", n: 3 });
  eq(applyManyAsk("apply me to the top 3 jobs that fit this"), { kind: "first", n: 3 });
  // Polite commands stay commands.
  for (const m of ["I would like to apply to the top 5 frontend internships in Chicago", "please apply me to the top 5 frontend internships in Chicago"]) eq((applyManyAsk(m) as any)?.n, 5, m);
  eq(manyWhatOf("of these"), null);
  eq(manyWhatOf(""), null);
});

Deno.test("hedged, negated, conditional and second-person phrasings are not a command: nothing queued", async () => {
  const rows = Array.from({ length: 8 }, (_, i) => posting("Frontend Engineering Intern", "Chicago, IL", i));
  for (const m of ["I wouldn't apply to the top 5 frontend internships in Chicago", "shouldn't I apply to the top 5 frontend internships in Chicago",
    "would you apply to the top 5 frontend internships in Chicago", "if i applied to the top 5 frontend internships in Chicago, what happens",
    "i don't want to apply to the top 5 frontend internships in Chicago", "what if I apply to the top 5 frontend internships in Chicago"]) {
    eq(applyManyAsk(m), null, m);
    const w = await world(rows);
    const r = await w.turn(m);
    assert(r === null || r.status !== "queued", `${m}: ${r?.reply}`);
    eq(await w.keys(), [], m);
  }
});

Deno.test("the place goes into the search: 5 in Chicago are found behind 600 newer elsewhere; 'Chicago' only in a description is not Chicago", async () => {
  const chicago = Array.from({ length: 5 }, (_, i) => posting("Frontend Engineering Intern", "Chicago, IL", 1000 + i));
  const elsewhere = Array.from({ length: 600 }, (_, i) => posting("Frontend Engineering Intern", "New York, NY", 1 + i));
  const mentions = { ...posting("Frontend Engineering Intern", "New York, NY", 0), description: "Work with our Chicago partners." };
  const w = await world([mentions, ...elsewhere, ...chicago]);
  const r = await w.turn("apply to the top 5 frontend internships in Chicago");
  eq([r?.intent, r?.status], ["career_apply_queue", "queued"], r?.reply);
  eq(await w.keys(), keysOf(chicago));
  assert(!/New York/.test(r!.reply), r!.reply);
});

Deno.test("remote: only postings that say remote", async () => {
  const remote = Array.from({ length: 3 }, (_, i) => posting("Frontend Engineering Intern", "Remote - US", 10 + i));
  const onsite = Array.from({ length: 6 }, (_, i) => ({ ...posting("Frontend Engineering Intern", "Austin, TX", i), description: "Hybrid; remote Fridays." }));
  const w = await world([...onsite, ...remote]);
  const r = await w.turn("apply to the first 3 remote frontend internships");
  eq(r?.status, "queued", r?.reply);
  eq(await w.keys(), keysOf(remote));
});

Deno.test("screens first, then N: the 3 newest already applied to, 'top 10' still queues 10 others and names no one past the 10th", async () => {
  const rows = Array.from({ length: 60 }, (_, i) => posting("Frontend Engineering Intern", "Chicago, IL", i));
  const applied = rows.slice(0, 3).map((p, i) => ({ id: `a${i}`, company: p.company, title: p.title, url: p.url, created_at: new Date(T - 86400000).toISOString(), state: "submitted_unconfirmed", job_id: p.job_id }));
  const w = await world(rows, { apps: applied });
  const r = await w.turn("apply to the top 10 frontend internships in Chicago");
  eq(r?.status, "queued", r?.reply);
  eq(await w.keys(), keysOf(rows.slice(3, 13)), "the next 10 that pass");
  for (const p of rows.slice(13)) assert(!new RegExp(`${p.company}\\b`).test(r!.reply), `nothing past the 10th named: ${p.company} in ${r!.reply}`);
  assert(w.limits.every((l) => l >= 60), `the search is asked for every match, not N: ${w.limits}`);
});

Deno.test(`at most ${MANY_MAX} from one message, said plainly`, async () => {
  const rows = Array.from({ length: 70 }, (_, i) => posting("Frontend Engineering Intern", "Chicago, IL", i));
  const w = await world(rows);
  const r = await w.turn("apply to the top 999 frontend internships in Chicago");
  eq(r?.status, "queued", r?.reply);
  eq((await w.keys()).length, MANY_MAX);
  assert(r!.reply.includes(`One message queues at most ${MANY_MAX}, so I took ${MANY_MAX} of the 999 you asked for`), r!.reply);
});

Deno.test("ranking said honestly: with no confirmed facts to score fit, 'newest first' (never 'top' by fit)", async () => {
  const rows = Array.from({ length: 4 }, (_, i) => posting("Frontend Engineering Intern", "Chicago, IL", i));
  const w = await world(rows);
  const r = await w.turn("apply to the top 4 frontend internships in Chicago");
  assert(/Ranked newest first \(I couldn't rank them by fit\)/.test(r!.reply), r!.reply);
});

Deno.test("ranked by fit from confirmed facts when it can be computed: the better fit first, said so", async () => {
  const facts = [{ id: "f1", kind: "skill", text: "React", status: "confirmed" }, { id: "f2", kind: "skill", text: "TypeScript", status: "confirmed" },
    { id: "f3", kind: "education", text: "BS Computer Science, TEST University, 2028", status: "confirmed" }];
  const newer = posting("Frontend Engineering Intern", "Chicago, IL", 1);
  const better = { ...posting("Frontend Engineering Intern", "Chicago, IL", 50), description: "React TypeScript components, React hooks, TypeScript types, accessibility." };
  const w = await world([newer, better], { facts });
  const r = await w.turn("apply to the top 1 frontend internships in Chicago");
  eq(await w.keys(), [better.job_id], r?.reply);
  assert(/Ranked best fit for your confirmed facts first/.test(r!.reply), r!.reply);
});

Deno.test("fewer on file than asked: says how many; none: nothing queued, said; the search down: nothing queued, said", async () => {
  const rows = Array.from({ length: 14 }, (_, i) => posting("Frontend Engineering Intern", "Chicago, IL", i));
  const w = await world([...rows, posting("Backend Engineering Intern", "Chicago, IL", 1), posting("Senior Frontend Engineer", "Chicago, IL", 1)]);
  const r = await w.turn("apply to the top 30 frontend internships in Chicago");
  eq(r?.status, "queued");
  assert(/I found 14 open, not 30\./.test(r!.reply), r!.reply);
  eq(await w.keys(), keysOf(rows));
  const none = await (await world(rows)).turn("apply to the top 5 frontend internships in Boston");
  eq(none?.status, "none");
  assert(/no open frontend internships postings in Boston on file, so nothing was queued/.test(none!.reply), none!.reply);
  const down = await world(rows, { failSearch: true });
  const d = await down.turn("apply to the top 5 frontend internships in Chicago");
  eq(d?.status, "unreadable");
  assert(/couldn't search the postings just now, so nothing was queued/.test(d!.reply), d!.reply);
  eq(await down.keys(), []);
});

Deno.test("the ask names its role even when a list is on the thread: the search wins; without role words, the list", async () => {
  const rows = Array.from({ length: 5 }, (_, i) => posting("Frontend Engineering Intern", "Chicago, IL", i));
  const list = [{ id: "lever:other:0e0c3b0e-0000-4000-8000-000000000001", company: "TEST Listed", title: "Data Analyst", location: "Chicago, IL", url: "https://jobs.lever.co/other/0e0c3b0e-0000-4000-8000-000000000001" }];
  const w = await world(rows, { shortlist: list });
  await w.turn("apply to the top 3 frontend internships in Chicago");
  eq(await w.keys(), keysOf(rows.slice(0, 3)));
  const v = await world(rows, { shortlist: list });
  await v.turn("apply to the top 1");
  eq(await v.keys(), [list[0].id]);
});

// Review of #366, round 3.
Deno.test("short forms: 'top 5 remote swe roles' queues from the remote software engineering postings; 'nyc' is New York", async () => {
  const remote = Array.from({ length: 6 }, (_, i) => posting("Software Engineer Intern", "Remote - US", 10 + i));
  const onsite = Array.from({ length: 4 }, (_, i) => posting("Software Engineer Intern", "Austin, TX", i));
  const w = await world([...onsite, ...remote]);
  const r = await w.turn("apply to the top 5 remote swe roles");
  eq(r?.status, "queued", r?.reply);
  eq(await w.keys(), keysOf(remote.slice(0, 5)));
  const ny = Array.from({ length: 3 }, (_, i) => posting("Software Engineering Intern", "New York, NY", 20 + i));
  const v = await world([...onsite, ...ny]);
  await v.turn("apply to the top 3 swe internships in nyc");
  eq(await v.keys(), keysOf(ny));
});

Deno.test("the same role at the same company and place posted twice is one application", async () => {
  const a = posting("Frontend Engineering Intern", "Chicago, IL", 1);
  const dup = { ...posting("Frontend Engineering Intern", "Chicago, IL", 2), company: a.company };
  const others = Array.from({ length: 3 }, (_, i) => posting("Frontend Engineering Intern", "Chicago, IL", 3 + i));
  const w = await world([a, dup, ...others]);
  await w.turn("apply to the top 3 frontend internships in Chicago");
  eq(await w.keys(), keysOf([a, ...others.slice(0, 2)]), "the duplicate is skipped, not queued twice");
});

Deno.test("'at <company>': only that employer's postings; with no role words too", async () => {
  const google = Array.from({ length: 3 }, (_, i) => ({ ...posting(`Software Engineering Intern, Team ${i + 1}`, "Chicago, IL", 10 + i), company: "Google" }));
  const others = Array.from({ length: 5 }, (_, i) => ({ ...posting(`Software Engineering Intern ${i}`, "Chicago, IL", i), description: "Founded by ex-Google engineers." }));
  const list = [{ id: "lever:other:0e0c3b0e-0000-4000-8000-000000000001", company: "TEST Listed", title: "Data Analyst", location: "Chicago, IL", url: "https://jobs.lever.co/other/0e0c3b0e-0000-4000-8000-000000000001" }];
  const w = await world([...others, ...google], { shortlist: list });
  await w.turn("apply to the top 5 at google");
  eq(await w.keys(), keysOf(google), "Google's, never the thread's list");
  const v = await world([...others, ...google]);
  await v.turn("apply to the top 2 swe internships at Google");
  eq(await v.keys(), keysOf(google.slice(0, 2)));
  const none = await (await world(others)).turn("apply to the top 2 swe internships at Google");
  eq(none?.status, "none");
  assert(/no open swe internships postings at Google/.test(none!.reply), none!.reply);
});

Deno.test("the reply: N of N counted, nothing past the Nth named (a refusal included), 'nothing is sent' said; excluded by fit goes last", async () => {
  const rows = Array.from({ length: 30 }, (_, i) => posting("Frontend Engineering Intern", "Chicago, IL", i));
  const late = rows[20];
  const applied = [{ id: "a1", company: late.company, title: late.title, url: late.url, created_at: new Date(T - 86400000).toISOString(), state: "submitted_unconfirmed", job_id: late.job_id }];
  const w = await world(rows, { apps: applied });
  const r = await w.turn("apply to the top 10 frontend internships in Chicago");
  assert(/^Ranked[^.]*\. 10\/10 queued/.test(r!.reply), `counted against the 10: ${r!.reply}`);
  assert(!new RegExp(`${late.company}\\b`).test(r!.reply), `a refusal past the 10th is not named: ${r!.reply}`);
  assert(/Nothing is sent/.test(r!.reply), r!.reply);
  const facts = [{ id: "f1", kind: "skill", text: "React", status: "confirmed" }, { id: "f3", kind: "education", text: "BS Computer Science, TEST University, 2028", status: "confirmed" }];
  const cleared = { ...posting("Frontend Engineering Intern", "Chicago, IL", 0), description: "Security clearance required. React React React." };
  const plain = posting("Frontend Engineering Intern", "Chicago, IL", 40);
  const v = await world([cleared, plain], { facts });
  await v.turn("apply to the top 1 frontend internships in Chicago");
  eq(await v.keys(), [plain.job_id], "a posting the fit excludes (clearance) ranks after one it does not");
});

// Review of #366, round 4.
Deno.test("'dc' is Washington, DC, never Washington state", async () => {
  const dc = [posting("Software Engineer Intern", "Washington, DC", 5), posting("Software Engineer Intern", "Washington D.C.", 6)];
  const state = [posting("Software Engineer Intern", "Seattle, Washington", 1), posting("Software Engineer Intern", "Spokane, WA", 2)];
  const w = await world([...state, ...dc]);
  await w.turn("apply to the top 5 swe roles in dc");
  eq(await w.keys(), keysOf(dc));
});

Deno.test("leftover words after the count always search or refuse, never the thread's list with words dropped", async () => {
  const la = Array.from({ length: 2 }, (_, i) => posting(`Software Engineer Intern ${i}`, "Los Angeles, CA", i));
  const other = [posting("Software Engineer Intern", "Austin, TX", 3)];
  const list = [{ id: "lever:other:0e0c3b0e-0000-4000-8000-000000000001", company: "TEST Listed", title: "Data Analyst", location: "Chicago, IL", url: "https://jobs.lever.co/other/0e0c3b0e-0000-4000-8000-000000000001" }];
  const w = await world([...other, ...la], { shortlist: list });
  await w.turn("apply to the top 5 swe in la");
  eq(await w.keys(), keysOf(la));
  const v = await world([...other, ...la], { shortlist: list });
  const r = await v.turn("apply to the top 3 quickly");
  eq(r?.status, "none", r?.reply);
  eq(await v.keys(), [], "nothing from the list");
});

Deno.test("'at <company>': the company itself, not a name that starts with it; found behind 600 newer postings of the role", async () => {
  const google = [{ ...posting("Software Engineering Intern", "Chicago, IL", 900), company: "Google" }];
  const lookalike = [{ ...posting("Software Engineering Intern, Platform", "Chicago, IL", 1), company: "Googleplex Labs" }];
  const many = Array.from({ length: 600 }, (_, i) => posting(`Software Engineering Intern ${i}`, "Chicago, IL", 2 + i));
  const w = await world([...lookalike, ...many, ...google]);
  await w.turn("apply to the top 3 swe internships at google");
  eq(await w.keys(), keysOf(google));
});

Deno.test("knocked-out postings rank after every other, even the newest with the most overlap", async () => {
  const facts = [{ id: "f1", kind: "skill", text: "React", status: "confirmed" }, { id: "f3", kind: "education", text: "BS Computer Science, TEST University, 2028", status: "confirmed" }];
  const knocked = [0, 1].map((m) => ({ ...posting(`Frontend Engineering Intern ${m}`, "Chicago, IL", m), description: "Security clearance required. React React React React." }));
  // Plain postings with no overlap at all (fit score 0): a knocked-out one never ties with them, newest or not.
  const plain = [50, 51].map((m) => ({ ...posting(`Frontend Engineering Intern ${m}`, "Chicago, IL", m), description: "Paint fences." }));
  const w = await world([...knocked, ...plain], { facts });
  await w.turn("apply to the top 2 frontend internships in Chicago");
  eq(await w.keys(), keysOf(plain));
});

// Review of #366, round 5.
Deno.test("a place alone is a search: 'roles in dc area', 'in washington state', 'jobs in tx'; never the thread's list", async () => {
  const list = [{ id: "lever:other:0e0c3b0e-0000-4000-8000-000000000001", company: "TEST Listed", title: "Data Analyst", location: "Chicago, IL", url: "https://jobs.lever.co/other/0e0c3b0e-0000-4000-8000-000000000001" }];
  const dc = [posting("Policy Analyst", "Washington, DC", 5), posting("Software Engineer Intern", "Washington D.C.", 6)];
  const wa = [posting("Data Analyst", "Seattle, WA", 1), posting("Nurse", "Spokane, Washington", 2)];
  const tx = [posting("Accountant", "Austin, TX", 3), posting("Software Engineer", "Houston, Texas", 4)];
  const all = [...dc, ...wa, ...tx];
  const a = await world(all, { shortlist: list });
  await a.turn("apply to the top 5 roles in dc area");
  eq(await a.keys(), keysOf(dc));
  const b = await world(all, { shortlist: list });
  const r = await b.turn("apply to the top 5 in washington state");
  eq(await b.keys(), keysOf(wa), r?.reply);
  const c = await world(all, { shortlist: list });
  await c.turn("apply to the top 4 jobs in tx");
  eq(await c.keys(), keysOf(tx));
});

Deno.test("a place alone is ranked by fit when it can be computed, and says so", async () => {
  const facts = [{ id: "f1", kind: "skill", text: "React", status: "confirmed" }, { id: "f3", kind: "education", text: "BS Computer Science, TEST University, 2028", status: "confirmed" }];
  const near = { ...posting("Frontend Engineering Intern", "Austin, TX", 30), description: "React React React components." };
  const far = { ...posting("Line Cook", "Austin, TX", 1), description: "Paint fences." };
  const w = await world([far, near], { facts });
  const r = await w.turn("apply to the top 1 in texas");
  eq(await w.keys(), [near.job_id]);
  assert(/Ranked best fit for your confirmed facts first/.test(r!.reply), r!.reply);
});

Deno.test("'at <company>': the reply names the companies included, exactly that employer", async () => {
  const google = [{ ...posting("Software Engineering Intern", "Chicago, IL", 3), company: "Google" }];
  const deepmind = [{ ...posting("Software Engineering Intern", "Chicago, IL", 4), company: "DeepMind" }];
  const w = await world([...deepmind, ...google]);
  const r = await w.turn("apply to the top 5 swe internships at google");
  eq(await w.keys(), keysOf(google));
  assert(/Companies included: Google \(only that employer; no subsidiaries are on record\)\./.test(r!.reply), r!.reply);
});
