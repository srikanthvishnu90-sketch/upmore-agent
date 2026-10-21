// Independently invented QA development gate. No model, eval corpus, provider, or database.
// Source base: 1ec88f3cca4b21200be5c4f16ba2a948a72614b0. Canonical product code remains unchanged.
// Contract: provider candidate shape must not change an explicit hard constraint. A user may relax it;
// resulting IDs must still resolve to the original complete posting. Keep pending until source-owner agreement.
import { careerTools } from "../../../supabase/functions/_shared/agent/career_tools.ts";
import { searchPostings } from "../../../supabase/functions/_shared/career_search.ts";

const assert = (value: unknown, why: string) => { if (!value) throw Error(why); };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const OWNER = "SYN-PROVIDER-PARITY";
const POSTING = {
  job_id: "greenhouse:synthetic-parity:707", company: "SYN-PARITY-CO", title: "Reservoir Analyst",
  location: "Pine Harbor", url: "https://jobs.synthetic.invalid/parity/707", first_seen_at: "2026-10-20T00:00:00Z",
  description: "SYNTHETIC ONLY. Basin model calibration and measurement review. Full posting marker: SYN-PARITY-FULL-707.",
  pay: "$123,456 per year", closed_at: null,
};
const STRICT_QUERY = "reservoir analyst Copper Bay";
const STRICT_MESSAGE = "Only reservoir analyst jobs in Copper Bay. Do not widen the location.";
type ProviderShape = "whole-pool" | "query-filtered";

async function search(shape: ProviderShape, query: string, message: string, exclude = false) {
  const queries: string[] = [], lookedUp: string[] = [];
  const pool = [copy(POSTING)];
  const tools = careerTools({
    postings: async (q: string) => {
      queries.push(q);
      if (shape === "whole-pool") return copy(pool);
      // Exercise the actual canonical query matcher; preserve original records rather than SearchHit summaries.
      // With one candidate, title-tier ranking and provider limits cannot alter this all-word match control.
      const ids = new Set(searchPostings(pool, q, null, 50).postings.map(p => p.job_id));
      return copy(pool.filter(p => ids.has(p.job_id)));
    },
    posting: async (id: string) => { lookedUp.push(id); return copy(pool.find(p => p.job_id === id) ?? null); },
    ...(exclude ? { alerts: { get: async () => ({ prefs: { floor: { exclude_companies: [POSTING.company] } } }) } } : {}),
  } as any);
  const context: any = { userId: OWNER, threadId: "SYN-PARITY-THREAD", now: 0, state: {}, turn: { message, added: [] } };
  const result: any = await tools.find(t => t.name === "search_jobs")!.run({ query, limit: 5 }, context);
  const full = async (id: string) => await tools.find(t => t.name === "get_posting")!.run({ job_id: id }, context) as any;
  return { result, queries, lookedUp, full };
}
const ids = (r: any) => r.postings.map((p: any) => p.job_id);

Deno.test("search provider parity: an exact empty query has equal results for query-filtered and whole-pool candidates", async () => {
  const whole = await search("whole-pool", STRICT_QUERY, STRICT_MESSAGE);
  const filtered = await search("query-filtered", STRICT_QUERY, STRICT_MESSAGE);
  assert(whole.result.postings.length === 0, "synthetic exact-match zero control changed");
  assert(JSON.stringify(ids(whole.result)) === JSON.stringify(ids(filtered.result)), JSON.stringify({
    cause: "provider_shape_changes_result", whole: { ids: ids(whole.result), queries: whole.queries },
    filtered: { ids: ids(filtered.result), queries: filtered.queries },
  }));
  assert(whole.result.relaxed_to === filtered.result.relaxed_to, "relaxation disclosure differs by provider shape");
});

Deno.test("search provider hard constraint: an unapproved location broadening cannot return an out-of-location posting", async () => {
  for (const shape of ["whole-pool", "query-filtered"] as const) {
    const r = await search(shape, STRICT_QUERY, STRICT_MESSAGE);
    assert(r.result.postings.length === 0 && !r.result.relaxed_to,
      JSON.stringify({ shape, required_place: "Copper Bay", returned: r.result.postings, queries: r.queries, relaxed_to: r.result.relaxed_to }));
  }
});

Deno.test("search provider exact-match control: both providers preserve the matching job and original complete posting", async () => {
  for (const shape of ["whole-pool", "query-filtered"] as const) {
    const r = await search(shape, "reservoir analyst Pine Harbor", "Only reservoir analyst jobs in Pine Harbor.");
    assert(ids(r.result).join() === POSTING.job_id && !r.result.relaxed_to, shape + ": exact match changed");
    const full = await r.full(r.result.postings[0].job_id);
    assert(full.job_id === POSTING.job_id && full.text === POSTING.description && full.pay === POSTING.pay && full.url === POSTING.url,
      shape + ": search result lost original full text, pay, URL or identity");
    assert(r.lookedUp.join() === POSTING.job_id, shape + ": full posting lookup did not use the returned identity");
  }
});

Deno.test("search provider explicit-relaxation control: the person's broader query returns one result and supports full-posting follow-through", async () => {
  for (const shape of ["whole-pool", "query-filtered"] as const) {
    const r = await search(shape, "reservoir analyst", "You may drop Copper Bay; reservoir analyst jobs anywhere are fine.");
    assert(ids(r.result).join() === POSTING.job_id, shape + ": explicit relaxation did not find the available role");
    const full = await r.full(r.result.postings[0].job_id);
    assert(full.text.includes("SYN-PARITY-FULL-707") && full.location === POSTING.location && full.pay === POSTING.pay,
      shape + ": broader search could not follow through to original posting facts");
  }
});

Deno.test("search provider no-match control: neither provider manufactures a posting for an absent role", async () => {
  for (const shape of ["whole-pool", "query-filtered"] as const) {
    const r = await search(shape, "xylophone", "Find xylophone jobs.");
    assert(r.result.postings.length === 0 && r.queries.join() === "xylophone", shape + ": absent role was replaced");
  }
});

Deno.test("search provider saved-floor control: explicit employer exclusion survives either provider shape", async () => {
  for (const shape of ["whole-pool", "query-filtered"] as const) {
    const r = await search(shape, "reservoir analyst", "Reservoir analyst roles, excluding SYN-PARITY-CO.", true);
    assert(r.result.postings.length === 0, shape + ": saved hard exclusion was lost");
  }
});
