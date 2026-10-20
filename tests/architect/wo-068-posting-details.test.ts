// WO-068 (architect): the live task battery (WO-065, CI run 39460746482) asked "what does the role pay?" of a posting whose
// own text states "$153,000—$221,000", and the agent said the posting does not list pay: search_jobs gave it no pay and
// no text. Now every hit carries the pay the posting states (or null), and get_posting reads one posting in full.
import { payFrom } from "../../supabase/functions/_shared/posting_pay.ts";
import { searchPostings } from "../../supabase/functions/_shared/career_search.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }

Deno.test("WO-068/1 the pay a posting states, as written; never a funding round, a gift card or a guess", () => {
  eq(payFrom("The base salary range for this role is $153,000—$221,000 USD. Benefits"), "$153,000—$221,000 USD");
  eq(payFrom("Pay: $45/hr. Weekend shifts"), "$45/hr");
  eq(payFrom("Salary €60k–€75k plus bonus"), "€60k–€75k");
  eq(payFrom("Compensation: 85,000 - 110,000 USD per year"), "85,000 - 110,000 USD per year");
  eq(payFrom("The annual base salary is $120,000 to $150,000."), "$120,000 to $150,000");
  eq(payFrom("We raised $120,000,000 in Series C funding."), null);
  eq(payFrom("Refer a friend and get a $50 gift card"), null);
  eq(payFrom("Requirements: SQL, Python, 3 years"), null);
});

const POOL = [
  { job_id: "greenhouse:figma:1", company: "Figma", title: "Content Strategist", location: "San Francisco, CA", url: "https://job-boards.greenhouse.io/figma/jobs/1", first_seen_at: "2026-10-20T00:00:00Z", description: "Write content. The base salary range is $153,000—$221,000 USD. Requirements: 5 years of content strategy." },
  { job_id: "greenhouse:acme:2", company: "Acme", title: "Content Writer", location: "Remote", url: "https://job-boards.greenhouse.io/acme/jobs/2", first_seen_at: "2026-10-19T00:00:00Z", description: "Write content for our blog. Requirements: portfolio." },
];

Deno.test("WO-068/2 every search hit says the pay its posting states, or null", () => {
  const r = searchPostings(POOL, "content", null, 10);
  eq(r.postings.map((p) => [p.company, p.pay]), [["Figma", "$153,000—$221,000 USD"], ["Acme", null]]);
});

Deno.test("WO-068/3 get_posting reads one posting in full; an unknown id says so; without a reader it says not connected", async () => {
  const byId = async (id: string) => POOL.find((p) => p.job_id === id) ?? null;
  const t = careerTools({ postings: async () => POOL, posting: byId } as any).find((x) => x.name === "get_posting")!;
  eq(t.effect, "read");
  const ctx = { userId: "u", threadId: "t", now: 0, state: {} } as any;
  const p: any = await t.run({ job_id: "greenhouse:figma:1" }, ctx);
  eq([p.company, p.title, p.pay], ["Figma", "Content Strategist", "$153,000—$221,000 USD"]);
  assert(/5 years of content strategy/.test(p.text), "the requirements are in the text");
  let err = "";
  try { await t.run({ job_id: "greenhouse:x:9" }, ctx); } catch (e) { err = (e as Error).message; }
  assert(/no posting/.test(err), err);
  const bare = careerTools({ postings: async () => [] }).find((x) => x.name === "get_posting")!;
  try { await bare.run({ job_id: "greenhouse:figma:1" }, ctx); err = ""; } catch (e) { err = (e as Error).message; }
  assert(/not connected/.test(err), err);
});
