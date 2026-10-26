// FEATURE E2E (2026-10-26): unit tests for the on-demand posting read (career_apply_link.ts) and the full name made of
// the person's own first and last answers (prepare-ahead.ts withFullName). No network: the feed is a function here.
import assertNode from "node:assert/strict";
import { boardOfCompany, companyOfBoard, linkAsk, possessiveAsk, postingForLink, postingsForRole } from "../../supabase/functions/_shared/career_apply_link.ts";
import { memoryPostingsDb } from "../../supabase/functions/_shared/career_ingest.ts";
import { withFullName } from "../../workers/career-browser/prepare-ahead.ts";

const assertEquals = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ID = "a13ae586-f4cb-4385-8822-c42b9b54ed74", LINK = `https://jobs.ashbyhq.com/ramp/${ID}`;
const feedPosting = { job_id: `ashby:ramp:${ID}`, ats_id: ID, company: "Ramp", title: "Frontend Engineer Intern (TEST)", url: LINK, location: "New York, NY", description: "TEST" };

Deno.test("linkAsk: an apply request carrying one Greenhouse, Lever or Ashby posting link; never a question, the past, or two postings", () => {
  for (const m of [`apply me to this: ${LINK}`, `can you apply to ${LINK}`, `${LINK} apply for me`, `I want to apply to this job ${LINK}.`, `apply to ${LINK}/application please`,
    "please apply to https://job-boards.greenhouse.io/acme/jobs/4000000001", "apply to https://jobs.lever.co/acme/0f0e0d0c-0b0a-4908-8706-050403020100"]) {
    const a = linkAsk(m);
    assertNodeOk(a, m);
  }
  assertEquals(linkAsk(`apply me to this: ${LINK}`)?.key, `ashby:ramp:${ID}`);
  assertEquals(linkAsk("please apply to https://job-boards.greenhouse.io/acme/jobs/4000000001")?.key, "greenhouse:acme:4000000001");
  for (const m of [`how do I apply to ${LINK}?`, `should I apply to ${LINK}`, `I applied to ${LINK}`, `look at ${LINK}`, "apply to https://www.linkedin.com/jobs/view/1",
    "apply to https://acme.wd5.myworkdayjobs.com/en-US/careers/job/x_123", "apply to https://jobs.ashbyhq.com/ramp", `apply to ${LINK} and https://jobs.ashbyhq.com/ramp/0f0e0d0c-0b0a-4908-8706-050403020100`]) {
    assertEquals(linkAsk(m), null, m);
  }
});
function assertNodeOk(v: unknown, m: string) { assertNode.ok(v, m); }

Deno.test("possessiveAsk: a role named by the company's possessive", () => {
  assertEquals(possessiveAsk("apply to Ramp's frontend intern"), { company: "Ramp", role: "frontend intern" });
  assertEquals(possessiveAsk("apply me to Ramp’s Frontend Engineer Intern role."), { company: "Ramp", role: "Frontend Engineer Intern" });
  assertEquals(possessiveAsk("how do I apply to Ramp's frontend intern"), null);
  assertEquals(possessiveAsk("apply to the frontend intern role at Ramp"), null, "the single ask's own shape (applyAsk)");
});

Deno.test("the board registry names the company; a board it does not know keeps its own name", () => {
  assertEquals(boardOfCompany("Ramp"), { company: "Ramp", provider: "ashby", board: "ramp" });
  assertEquals(boardOfCompany("Nonexistent Test Co"), null);
  assertEquals(companyOfBoard("ashby", "ramp"), "Ramp");
  assertEquals(companyOfBoard("ashby", "some-board"), "some-board");
});

Deno.test("postingForLink: on file and open is used as is; otherwise read once from the board and stored; not listed is said", async () => {
  const db = memoryPostingsDb();
  let reads = 0;
  const feed = async () => { reads++; return [feedPosting]; };
  const ask = linkAsk(`apply me to ${LINK}`)!;
  const first = await postingForLink({ ask, db, fetchFeed: feed, now: Date.parse("2026-10-26T10:00:00Z") });
  assertEquals([first.kind, (first as any).fetched, reads], ["found", true, 1]);
  const stored = await db.get(`ashby:ramp:${ID}`);
  assertEquals([stored?.company, stored?.provider, stored?.board, stored?.closed_at, stored?.first_seen_at], ["Ramp", "ashby", "ramp", null, "2026-10-26T10:00:00.000Z"]);
  const again = await postingForLink({ ask, db, fetchFeed: feed, now: Date.now() });
  assertEquals([again.kind, (again as any).fetched, reads], ["found", false, 1], "on file: no second read");
  const gone = linkAsk("apply to https://jobs.ashbyhq.com/ramp/0f0e0d0c-0b0a-4908-8706-050403020100")!;
  assertEquals((await postingForLink({ ask: gone, db, fetchFeed: feed, now: Date.now() })).kind, "not_on_board");
  assertEquals((await postingForLink({ ask: gone, db, fetchFeed: () => Promise.reject(new Error("HTTP 503")), now: Date.now() })).kind, "unreadable");
});

Deno.test("postingsForRole: every word of the role in the title, on the registered board only", async () => {
  const feed = async () => [feedPosting, { ...feedPosting, job_id: "ashby:ramp:x", ats_id: "x", title: "Backend Engineer" }];
  const r = await postingsForRole({ company: "Ramp", role: "frontend intern", fetchFeed: feed });
  assertEquals(r && "hits" in r ? r.hits.map((p) => p.title) : r, ["Frontend Engineer Intern (TEST)"]);
  assertEquals(await postingsForRole({ company: "Nonexistent Test Co", role: "intern", fetchFeed: feed }), null);
});

Deno.test("withFullName: their full name is exactly their own first and last answers; never over a full name they gave", () => {
  const rows = [{ id: "f1", key: "fact:first_name", kind: "fact", answer: " Alex " }, { id: "l1", key: "fact:last_name", kind: "fact", answer: "Testcase" }];
  assertEquals(withFullName(rows).at(-1), { id: "f1+l1", key: "fact:full_name", kind: "fact", answer: "Alex Testcase" });
  const own = [...rows, { id: "n1", key: "fact:full_name", kind: "fact", answer: "Alexandra Testcase" }];
  assertEquals(withFullName(own), own);
  assertEquals(withFullName(rows.slice(0, 1)), rows.slice(0, 1));
});
