// WO-061/H031 (architect): a rule about a resume the person names ("always use my X resume") is about a record. When no
// resume by that name is on file, remember_instruction keeps nothing and tells the model what the person needs to hear
// first: it is not on file, add it. When it is on file, the rule is kept as before. Synthetic personas; no model.
import { careerTools, resumeNamedIn } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { memoryStandingStore } from "../../supabase/functions/_shared/agent/memory.ts";
import { edgeRenderer, memoryPersonaStore, memoryResumeStore } from "../../supabase/functions/_shared/career_tailor.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const T = Date.parse("2026-10-21T15:00:00Z");
const ctx = (message: string) => ({ userId: "TEST-U", threadId: "TH", now: T, state: {}, turn: { message, added: [] } });
const tools = (o: { personas?: ReturnType<typeof memoryPersonaStore> | null } = {}) => {
  const memory = memoryStandingStore();
  const tailor = o.personas === null ? null : { posting: async () => null, personas: o.personas ?? memoryPersonaStore(), resumes: memoryResumeStore(), render: edgeRenderer() };
  const remember = careerTools({ postings: async () => [], memory, tailor }).find((t) => t.name === "remember_instruction")!;
  return { memory, remember };
};
const refusal = async (f: () => Promise<unknown>) => { try { await f(); return ""; } catch (e) { return (e as Error).message; } };

Deno.test("WO-061/H031 the name of a resume is read from their words; words that only describe their one resume name nothing", () => {
  assert(resumeNamedIn("from now on always use my robotics resume") === "robotics");
  assert(resumeNamedIn("use the ops version of my resume for these") === "ops");
  assert(resumeNamedIn("apply with my supply chain resume") === "supply chain");
  for (const t of ["always use my resume", "use my updated resume", "keep my resume to one page", "use the base resume", "I need visa sponsorship"]) {
    assert(resumeNamedIn(t) === null, `names nothing: ${t}`);
  }
});

Deno.test("WO-061/H031 no resume by that name on file: nothing is kept, and the refusal says what to tell them first", async () => {
  const said = "from now on always use my robotics resume when you apply";
  const { memory, remember } = tools({ personas: memoryPersonaStore({ "TEST-U": { items: [{ name: "logistics", lead: [], hide: [], at: "2026-10-20T00:00:00.000Z" }], active: null } }) });
  const err = await refusal(() => remember.run({ instruction: "Always apply with the robotics resume", quote: "always use my robotics resume" }, ctx(said)));
  assert(/no resume named "robotics" on file/.test(err) && /saved: logistics/.test(err), err);
  assert(/first sentence/.test(err) && /add it/.test(err), "the model is told to lead with it and ask them to add it");
  assert((await memory.standing("TEST-U")).length === 0, "nothing is kept");
});

Deno.test("WO-061/H031 with no resume store at all, the same: none is on file", async () => {
  const { memory, remember } = tools({ personas: null });
  const err = await refusal(() => remember.run({ instruction: "Use the robotics resume", quote: "always use my robotics resume" }, ctx("always use my robotics resume")));
  assert(/no resume named "robotics" on file \(saved: none\)/.test(err), err);
  assert((await memory.standing("TEST-U")).length === 0);
});

Deno.test("WO-061/H031 the named resume is on file: the rule is kept; a rule naming no resume is untouched", async () => {
  const personas = memoryPersonaStore({ "TEST-U": { items: [{ name: "robotics", lead: [], hide: [], at: "2026-10-20T00:00:00.000Z" }], active: null } });
  const { memory, remember } = tools({ personas });
  const r: any = await remember.run({ instruction: "Always apply with the robotics resume", quote: "always use my robotics resume" }, ctx("always use my robotics resume please"));
  assert(r.kept?.said === "always use my robotics resume", JSON.stringify(r));
  const s: any = await remember.run({ instruction: "No staffing agencies", quote: "no staffing agencies" }, ctx("no staffing agencies, ever"));
  assert(s.total === 2 && (await memory.standing("TEST-U")).length === 2);
});
