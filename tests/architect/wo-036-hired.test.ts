// WO-036 (owner decision 2026-10-20): who a firm hired, from People Data Labs Person Search, aggregates only.
// No network: PDL is a fake fetch that returns records shaped like PDL's person schema, with planted names, profile URLs
// and contact fields that must never get past the adapter. Run: deno test -A --no-check tests/architect/wo-036-hired.test.ts
import { aggregate, CACHE_MS, DEFAULT_SIZE, type HiredStore, hiredSourceFromEnv, hiredText, MIN_N, type PdlCall, PDL_SEARCH_URL, pdlHiredSource, toSafeRecord } from "../../supabase/functions/_shared/career_hired.ts";
import { hiredDataLine, pathAnswer } from "../../supabase/functions/_shared/career_path.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const NOW = Date.UTC(2026, 9, 20, 15);
const PALANTIR = { firm_id: "palantir", name: "Palantir" };
const PLANTED = ["Zelda Plantedname", "zelda-plantedname", "zelda@planted.example", "+1-555-0100", "linkedin.com/in/zelda", "PLANTED-ID-7", "1 Planted Street"];

// A record shaped like PDL's person schema (docs.peopledatalabs.com/docs/fields), with every identifying field filled.
function person(i: number, o: { company?: string; start?: string; title?: string; school?: string; major?: string; prior?: string; gradEnd?: string } = {}) {
  return {
    id: `PLANTED-ID-${i}`, full_name: i === 7 ? "Zelda Plantedname" : `Person ${i}`, first_name: "Zelda", last_name: "Plantedname",
    linkedin_url: i === 7 ? "linkedin.com/in/zelda" : `linkedin.com/in/p${i}`, linkedin_username: "zelda-plantedname",
    emails: [{ address: "zelda@planted.example" }], work_email: "zelda@planted.example", phone_numbers: ["+1-555-0100"], mobile_phone: "+1-555-0100",
    street_addresses: [{ street_address: "1 Planted Street" }], birth_year: 2001,
    experience: [
      { company: { name: o.company ?? "palantir technologies", website: "palantir.com" }, title: { name: o.title ?? "software engineer", raw: ["Zelda Plantedname, SWE"] }, start_date: o.start ?? "2024-08", end_date: null },
      { company: { name: o.prior ?? "stripe" }, title: { name: "software engineer intern" }, start_date: "2023-06", end_date: "2023-08" },
    ],
    education: [{ school: { name: o.school ?? "stanford university", raw: ["Zelda's school"] }, degrees: ["bachelors"], majors: [o.major ?? "computer science"], end_date: o.gradEnd ?? "2024-06", start_date: "2020-09" }],
  };
}
function memoryStore(): HiredStore & { rows: Map<string, any>; calls: PdlCall[]; credits: number } {
  const rows = new Map<string, any>(), calls: PdlCall[] = [];
  return {
    rows, calls, credits: 0,
    async cached(f, r, y) { return rows.get(`${f}|${r}|${y}`) ?? null; },
    async save(a) { rows.set(`${a.firm_id}|${a.role_family}|${a.since_year}`, { aggregates: JSON.parse(JSON.stringify(a)), fetched_at: a.fetched_at }); },
    async creditsThisMonth() { return this.credits; },
    async logCall(c) { calls.push(c); this.credits += c.credits; },
  };
}
function fakePdl(data: unknown[], status = 200) {
  const seen: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response(JSON.stringify({ status, data, total: data.length }), { status }); }) as unknown as typeof fetch;
  return { f, seen };
}
const twelve = () => [
  ...Array.from({ length: 6 }, (_, i) => person(i)),
  ...Array.from({ length: 5 }, (_, i) => person(10 + i, { school: "georgia institute of technology", prior: "goldman sachs", major: "mathematics" })),
  person(7),
];

Deno.test("WO-036/H1 a planted name, profile URL or contact never reaches the cache, the log or the answer", async () => {
  const safe = JSON.stringify(toSafeRecord(person(7)));
  for (const p of PLANTED) assert(!safe.toLowerCase().includes(p.toLowerCase()), `the boundary let "${p}" through: ${safe}`);
  for (const k of ["full_name", "linkedin", "email", "phone", "street", "birth", "\"id\"", "raw", "website"]) assert(!safe.includes(k), `field ${k} passed the boundary`);
  const store = memoryStore(), pdl = fakePdl(twelve());
  const src = pdlHiredSource({ key: "test-key", store, fetch: pdl.f });
  const r = await src.backgrounds(PALANTIR, "software engineer", NOW);
  eq(r.status, "ok");
  const answer = pathAnswer({ firm: "Palantir", role: "software engineer", facts: [], hired: r });
  const everything = JSON.stringify([...store.rows.values()]) + JSON.stringify(store.calls) + JSON.stringify(r) + JSON.stringify(answer);
  for (const p of PLANTED) assert(!everything.toLowerCase().includes(p.toLowerCase()), `"${p}" reached the cache, log or answer`);
  assert(!/linkedin|@|\+1-555/i.test(everything), "a profile URL or contact reached the answer");
});

Deno.test("WO-036/H2 aggregates only: nothing under 5, the sample size, PDL's coverage, and not a chance of getting in", async () => {
  const a = aggregate(twelve().map(toSafeRecord), { firm: PALANTIR, role: "software engineer", since: 2023, now: NOW });
  eq(a.n, 12);
  eq(a.schools, [{ value: "stanford university", count: 7 }, { value: "georgia institute of technology", count: 5 }]);
  eq(a.prior_employers, [{ value: "stripe", count: 7 }, { value: "goldman sachs", count: 5 }]);
  eq(a.majors.map((m) => m.value), ["computer science", "mathematics"]);
  eq(a.median_years_school_to_join, 0.2, "June 2024 to August 2024");
  const text = hiredText(a, "Palantir", "software engineer");
  assert(text.includes("12 people who joined Palantir as software engineer since 2023 (PDL's coverage, not all hires)"), text);
  assert(text.includes("Stanford University (7), Georgia Institute of Technology (5)"), text);
  assert(text.includes("not your chance of getting in"), text);
  // A bucket under 5 is never shown, even when the sample is big enough.
  const mixed = aggregate([...Array.from({ length: 6 }, (_, i) => person(i)), ...Array.from({ length: 4 }, (_, i) => person(20 + i, { school: "mit" }))].map(toSafeRecord), { firm: PALANTIR, role: "software engineer", since: 2023, now: NOW });
  assert(!mixed.schools.some((s) => s.value === "mit"), "4 people from one school is too few to say");
  // A sample under 5: too few to say, no buckets, no median.
  const few = aggregate(Array.from({ length: 4 }, (_, i) => person(i)).map(toSafeRecord), { firm: PALANTIR, role: "software engineer", since: 2023, now: NOW });
  eq([few.n, few.schools, few.median_years_school_to_join], [4, [], null]);
  assert(hiredText(few, "Palantir", "software engineer").includes("too few to say"), "says too few");
  assert(!/stanford/i.test(hiredText(few, "Palantir", "software engineer")), "nothing under 5 is shown");
  eq(MIN_N, 5);
});

Deno.test("WO-036/H3 only people who STARTED at the firm, in the role, in the window count", () => {
  const recs = [
    person(1), // counts
    person(2, { start: "2019-05" }), // started before the window
    person(3, { title: "account executive" }), // another role
    person(4, { company: "citadel securities" }), // another company
  ].map(toSafeRecord);
  eq(aggregate(recs, { firm: PALANTIR, role: "software engineer", since: 2023, now: NOW }).n, 1);
  const citadel = { firm_id: "citadel", name: "Citadel" };
  const cs = [person(5, { company: "citadel securities" }), person(6, { company: "citadel" })].map(toSafeRecord);
  eq(aggregate(cs, { firm: citadel, role: "software engineer", since: 2023, now: NOW }).n, 1, "Citadel Securities is not Citadel");
});

Deno.test("WO-036/H4 credits: size-capped calls, each call's cost logged, a 30-day cache, a monthly budget", async () => {
  const store = memoryStore(), pdl = fakePdl(twelve());
  const src = pdlHiredSource({ key: "test-key", store, fetch: pdl.f });
  await src.backgrounds(PALANTIR, "software engineer", NOW);
  eq(pdl.seen.length, 1);
  eq(pdl.seen[0].url, PDL_SEARCH_URL);
  eq(pdl.seen[0].init.method, "POST");
  eq((pdl.seen[0].init.headers as Record<string, string>)["X-Api-Key"], "test-key");
  const body = JSON.parse(String(pdl.seen[0].init.body));
  eq(body.size, DEFAULT_SIZE);
  eq(body.query.bool.must, [
    { match_phrase: { "experience.company.name": "palantir" } },
    { range: { "experience.start_date": { gte: "2023-01-01" } } },
    { match: { "experience.title.name": { query: "software engineer", operator: "and" } } },
  ]);
  eq(store.calls.map((c) => [c.status, c.size_requested, c.records_returned, c.records_kept, c.credits]), [["ok", 25, 12, 12, 12]], "one credit per record returned");
  await src.backgrounds(PALANTIR, "software engineer", NOW + 29 * 86400_000);
  eq(pdl.seen.length, 1, "inside 30 days the cache answers");
  await src.backgrounds(PALANTIR, "software engineer", NOW + CACHE_MS + 1);
  eq(pdl.seen.length, 2, "after 30 days it asks again");
  // The month's budget: a call that would pass it is refused, logged, and costs nothing.
  const tight = memoryStore(); tight.credits = 290;
  const capped = fakePdl(twelve());
  const r = await pdlHiredSource({ key: "k", store: tight, fetch: capped.f, budget: 300 }).backgrounds(PALANTIR, "software engineer", NOW);
  eq(r.status, "unavailable");
  eq(capped.seen.length, 0, "no call past the budget");
  eq(tight.calls.map((c) => [c.status, c.credits]), [["budget_refused", 0]]);
  const big = fakePdl([]);
  await pdlHiredSource({ key: "k", store: memoryStore(), fetch: big.f, size: 5000 }).backgrounds(PALANTIR, "", NOW);
  eq(JSON.parse(String(big.seen[0].init.body)).size, 100, "never more than 100 a call");
  const down = memoryStore(), err = fakePdl([], 500);
  eq((await pdlHiredSource({ key: "k", store: down, fetch: err.f }).backgrounds(PALANTIR, "", NOW)).status, "unavailable");
  eq(down.calls.map((c) => [c.status, c.http_status, c.credits]), [["http_error", 500, 0]]);
});

Deno.test("WO-036/H5 without the key: NOT_WIRED, no call, and the answer keeps the honest line", async () => {
  let called = false;
  const src = hiredSourceFromEnv({ get: () => undefined }, { from() { called = true; throw new Error("no table read without the key"); } });
  const r = await src.backgrounds(PALANTIR, "software engineer", NOW);
  eq(r.status, "NOT_WIRED");
  assert(!called, "no database read without the key");
  const a = pathAnswer({ firm: "Palantir", facts: [], hired: r });
  assert(a.messages.join("\n").includes(hiredDataLine("Palantir")), "the one-line honest answer");
  eq(a.hired.status, "NOT_WIRED");
});

Deno.test("WO-036/H6 the brain tool uses the aggregates when live; a failure falls back to the honest line; odds stay unstated", async () => {
  const live = careerTools({ postings: async () => [], hired: pdlHiredSource({ key: "k", store: memoryStore(), fetch: fakePdl(twelve()).f }) }).find((t) => t.name === "career_path_answer")!;
  const c = { userId: "u1", threadId: "t1", now: NOW, state: {} as Record<string, any>, turn: { message: "how do I get into palantir as a software engineer", added: [] as string[] } };
  const r = await live.run({ firm: "Palantir", role: "software engineer" }, c) as any;
  const text = r.messages.join("\n");
  assert(text.includes("Who they hired, from People Data Labs: 12 people who joined Palantir"), text);
  assert(!text.includes(hiredDataLine("Palantir")), "the not-yet line is replaced when data is live");
  eq(r.probability.kind, "none", "hired backgrounds are not a probability");
  assert(text.includes("No honest probability exists here") && text.includes("not your chance of getting in"), "both said plainly");
  assert(!/\b\d+(?:\.\d+)?\s?%/.test(text), "no percentage anywhere");
  const broken = careerTools({ postings: async () => [], hired: { backgrounds: async () => { throw new Error("boom"); } } }).find((t) => t.name === "career_path_answer")!;
  const b = await broken.run({ firm: "Palantir" }, c) as any;
  assert(b.messages.join("\n").includes(hiredDataLine("Palantir")), "a failure is the honest line, never a guess");
  eq(b.hired.status, "unavailable");
});
