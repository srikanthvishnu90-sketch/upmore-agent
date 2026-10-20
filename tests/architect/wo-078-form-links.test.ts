// WO-078: a posting the shelf holds can be queued, whatever its public link looks like. Found by the live task battery
// (CI run 39485162284): "apply to the first two" refused Stripe and Pinterest, and "apply me to 25 Product Manager jobs"
// refused 3 Fivetran postings, all "not a posting link the extension can open". They are Greenhouse postings whose public
// link is the employer's own careers page (www.fivetran.com/careers/job?gh_jid=…). The shelf knows each one's board and id
// (job_id greenhouse:fivetran:7918612003), and the board's own form lives at a fixed address: the same one the form
// captures and the live fills use (scripts/career/pick-form-sources.cjs). A link alone, with no id, is still refused.
import { formUrlFor } from "../../supabase/functions/_shared/posting_key.ts";
import { memoryWantStore, queueWants } from "../../supabase/functions/_shared/career_apply_want.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const NOW = Date.UTC(2026, 9, 20, 15);

Deno.test("WO-078/1 each board's own form address, from the shelf's id", () => {
  eq(formUrlFor("greenhouse:fivetran:7918612003"), "https://job-boards.greenhouse.io/fivetran/jobs/7918612003");
  eq(formUrlFor("lever:elfbeauty:015a5229-3e9d-477d-8c3f-62292d3fa3a7"), "https://jobs.lever.co/elfbeauty/015a5229-3e9d-477d-8c3f-62292d3fa3a7");
  eq(formUrlFor("ashby:plaid:d2c9d8b1-0428-4fdf-8b00-fd3ea28271b3"), "https://jobs.ashbyhq.com/plaid/d2c9d8b1-0428-4fdf-8b00-fd3ea28271b3");
  for (const bad of ["smartrecruiters:x:1", "greenhouse:fivetran:abc", "greenhouse::1", "linkedin:x:1", "", "greenhouse:a/b:1"]) eq(formUrlFor(bad), null, bad);
});

Deno.test("WO-078/2 an employer-page link with its shelf id is queued at the board's form, keyed once", async () => {
  const store = memoryWantStore();
  const r = await queueWants(store, "u", [
    { url: "https://www.fivetran.com/careers/job?gh_jid=7918612003", job_id: "greenhouse:fivetran:7918612003", company: "Fivetran", title: "Senior Data Analyst" },
    { url: "https://job-boards.greenhouse.io/fivetran/jobs/7918612003", company: "Fivetran", title: "Senior Data Analyst" },
  ] as any, NOW);
  eq(r.queued, 1, "the same posting by either link is one want");
  eq(r.items[0].posting_key, "greenhouse:fivetran:7918612003");
  eq(r.items[0].url, "https://job-boards.greenhouse.io/fivetran/jobs/7918612003");
  eq(r.refused, []);
});

Deno.test("WO-078/3 a link alone that is no form the extension opens is still refused; Lever and Ashby ids open their form step", async () => {
  const r = await queueWants(memoryWantStore(), "u", [
    { url: "https://stripe.com/jobs/listing/x/7306915" },
    { url: "https://jobs.lever.co/elfbeauty/015a5229-3e9d-477d-8c3f-62292d3fa3a7", job_id: "lever:elfbeauty:015a5229-3e9d-477d-8c3f-62292d3fa3a7" },
    { url: "https://example.com/x", job_id: "ashby:plaid:d2c9d8b1-0428-4fdf-8b00-fd3ea28271b3" },
  ] as any, NOW);
  eq(r.refused.map((x) => x.url), ["https://stripe.com/jobs/listing/x/7306915"]);
  eq(r.items.map((w) => w.url), ["https://jobs.lever.co/elfbeauty/015a5229-3e9d-477d-8c3f-62292d3fa3a7/apply",
    "https://jobs.ashbyhq.com/plaid/d2c9d8b1-0428-4fdf-8b00-fd3ea28271b3/application"]);
});

Deno.test("WO-078/4 the chat tool takes search_jobs' job_id and says so in its schema", async () => {
  const wants = memoryWantStore();
  const tools = Object.fromEntries(careerTools({ postings: async () => [], wants } as any).map((t) => [t.name, t]));
  const q = tools.queue_applications;
  assert(JSON.stringify(q.input_schema).includes("job_id"), "the schema names job_id");
  const out: any = await q.run({ postings: [{ url: "https://www.fivetran.com/careers/job?gh_jid=7918612003", job_id: "greenhouse:fivetran:7918612003", company: "Fivetran", title: "Senior Data Analyst" }] },
    { userId: "u", threadId: "t", now: NOW, state: {}, turn: { message: "apply me to it", added: [] } });
  eq(out.queued, 1);
  eq(wants.dump().u.map((w) => w.url), ["https://job-boards.greenhouse.io/fivetran/jobs/7918612003"]);
});
