// WO-079: a resume that waits on the person's yes says so, and says what to ask. Found by the live task battery (CI runs
// 39485101366 and 39485162284, T09): the person typed their facts ("here's me: 2 years as a data analyst…") and then asked
// for a tailored resume. Their facts were drafts (a resume uses confirmed facts only, WO-028), tailor_resume refused with
// "no confirmed experience, project or education facts", the model tried confirm_profile_fact (rightly refused: they had
// not said yes) and the turn ran out of steps: "I couldn't finish that in one go". The refusal now names the drafts and
// the one question to ask, as the missing-contact refusal already does.
import { CareerProfile } from "../../supabase/functions/_shared/router_core.career.js";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { edgeRenderer, memoryPersonaStore, memoryResumeStore } from "../../supabase/functions/_shared/career_tailor.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
const NOW = Date.UTC(2026, 9, 20, 15);
const POSTING = `Data Analyst, Acme Analytics (TEST posting)
Requirements:
- SQL, Excel and Tableau
- Build dashboards for internal users`;
const tailor = () => Object.fromEntries(careerTools({ postings: async () => [], tailor: { posting: async () => null, personas: memoryPersonaStore(), resumes: memoryResumeStore(), render: edgeRenderer() } }).map((x) => [x.name, x])).tailor_resume;
const ctx = (profile: any) => ({ userId: "u", threadId: "t", now: NOW, state: { profile } as Record<string, any>, turn: { message: "tailor my resume for this one", added: [] as string[] } });
async function refusal(profile: any): Promise<string> {
  try { await tailor().run({ posting_text: POSTING }, ctx(profile)); } catch (e) { return (e as Error).message; }
  throw new Error("tailor_resume did not refuse");
}

Deno.test("WO-079/1 drafts only: the refusal lists the person's own drafts and the one yes to ask for", async () => {
  const p = CareerProfile.createProfile({ basics: { name: "Test Person", email: "test.person@example.com" } });
  CareerProfile.addFact(p, { kind: "experience", text: "2 years as a data analyst at a regional bank, SQL, Excel, Tableau", needs_confirmation: true, status: "draft" });
  CareerProfile.addFact(p, { kind: "education", text: "BS Economics 2022", needs_confirmation: true, status: "draft" });
  const msg = await refusal(p);
  assert(msg.includes("2 years as a data analyst at a regional bank") && msg.includes("BS Economics 2022"), `the drafts are named: ${msg}`);
  assert(/ask/i.test(msg) && /\byes\b/i.test(msg), `it says what to ask: ${msg}`);
  assert(/do not call another tool|no other tool|stop here/i.test(msg), `it says to stop and ask, not to try other tools: ${msg}`);
});

Deno.test("WO-079/2 nothing at all on file: the refusal asks for their experience, never invents a list", async () => {
  const p = CareerProfile.createProfile({ basics: { name: "Test Person", email: "test.person@example.com" } });
  const msg = await refusal(p);
  assert(/no confirmed/i.test(msg), msg);
  assert(/ask/i.test(msg) && /(experience|work|education)/i.test(msg), `it asks what to build from: ${msg}`);
  assert(!/Drafts waiting/i.test(msg), "no draft list when there are no drafts");
});
