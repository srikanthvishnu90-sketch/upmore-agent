// The career tools (WO-002): thin wrappers over the domain modules that already work, operating on the same per-person
// career state the CareerHost persists (ctx.state is the host's turn ctx: profile, trackStore, …). Tools return data; the
// model writes the words. No reply prose lives here.
import { CareerProfile, CareerTrack, CareerPrep } from "../router_core.career.js";
import type { ToolSpec, ToolCtx } from "./loop.ts";

const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: "object" as const, properties, required });
const str = (description: string) => ({ type: "string", description });
const profileOf = (c: ToolCtx) => ((c.state.profile as any) ??= CareerProfile.createProfile({}));
const trackOf = (c: ToolCtx) => ((c.state.trackStore as any) ??= CareerTrack.createMemoryStore([]));
const words = (s: unknown) => String(s ?? "").toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 1);

export function careerTools(deps: { postings: () => Promise<any[]> }): ToolSpec[] {
  return [
    {
      name: "get_profile", effect: "read",
      description: "Read what is on file about the person: confirmed facts (usable in applications) and facts still waiting for their confirmation.",
      input_schema: obj(),
      run: async (_i, c) => { const p = profileOf(c); return { confirmed: CareerProfile.confirmedFacts(p), unconfirmed: (p.facts || []).filter((f: any) => f.needs_confirmation) }; },
    },
    {
      name: "add_profile_fact", effect: "write_own",
      description: "Save one thing the person said about themselves (experience, education, skill, goal, location, preference) as a draft fact, in their words. It is not usable until they confirm it.",
      input_schema: obj({ kind: str("experience | education | skill | goal | location | preference | other"), text: str("The fact in the person's own words") }, ["kind", "text"]),
      run: async (i, c) => ({ fact: CareerProfile.addFact(profileOf(c), { kind: String(i.kind), text: String(i.text), needs_confirmation: true, status: "draft" }) }),
    },
    {
      name: "confirm_profile_fact", effect: "write_own",
      description: "Mark a draft fact confirmed, only after the person has said it is right.",
      input_schema: obj({ id: str("The fact id, e.g. F-001") }, ["id"]),
      run: async (i, c) => { const f = CareerProfile.confirmFact(profileOf(c), String(i.id)); if (!f) throw new Error(`no fact ${i.id} on file`); return { fact: f }; },
    },
    {
      name: "list_applications", effect: "read",
      description: "List the person's tracked job applications with company, role and current stage.",
      input_schema: obj(),
      run: async (_i, c) => ({ applications: trackOf(c).rows }),
    },
    {
      name: "track_application", effect: "write_own",
      description: "Record an application the person made, or move an existing one to a new stage when they report news (stages: Saved, Submitted, Recruiter screen, OA/assessment, Interview rounds, Final, Offer, Rejected, Withdrawn, Accepted).",
      input_schema: obj({ company: str("Employer name as the person said it"), role: str("Job title, if said"), stage: str("The stage to record") }, ["company", "stage"]),
      run: async (i, c) => {
        const s = trackOf(c);
        const moved = CareerTrack.manualUpdate(s, String(i.company), String(i.stage), { now: c.now });
        return { application: moved.ok ? moved.application : CareerTrack.addApplication(s, { company: String(i.company), role: i.role ? String(i.role) : "", stage: String(i.stage) }, { now: c.now }) };
      },
    },
    {
      name: "search_jobs", effect: "read",
      description: "Search live job postings by keywords (role, skill, place). Returns real postings with their links and when they were first seen; an empty pool is reported as source 'none'.",
      input_schema: obj({ query: str("Keywords, e.g. 'data analyst remote'"), limit: { type: "number", description: "Max results, default 10" } }),
      run: async (i) => {
        const pool = await deps.postings();
        if (!pool.length) return { postings: [], total: 0, source: "none" };
        const q = words(i.query);
        const hits = pool.filter((p) => { const hay = `${p.title || ""} ${p.description || ""} ${p.location || ""} ${p.company || ""}`.toLowerCase(); return q.every((w) => hay.includes(w)); })
          .sort((a, b) => String(b.first_seen_at || "").localeCompare(String(a.first_seen_at || "")));
        const limit = Math.max(1, Math.min(50, Number(i.limit) || 10));
        return { postings: hits.slice(0, limit), total: hits.length, source: "live" };
      },
    },
    {
      name: "get_interview_questions", effect: "read",
      description: "Get practice interview questions for a role or company from the researched question banks.",
      input_schema: obj({ role: str("The role or field, e.g. 'consulting analyst', 'nurse case manager'"), company: str("Company, if any") }),
      run: async (i) => {
        const cir = i.company ? (CareerPrep.findCir ? CareerPrep.findCir(String(i.company)) : null) : null;
        const bank = CareerPrep.questionBank({ role: i.role ? String(i.role) : "", roleFamily: i.role ? String(i.role) : "", cir: cir || undefined });
        return { questions: (bank.questions || []).slice(0, 10), company_record: !!(cir) };
      },
    },
    {
      name: "score_interview_answer", effect: "read",
      description: "Score a practice interview answer with the rubric (structure, evidence, specificity) and return what to fix.",
      input_schema: obj({ answer: str("The person's answer, verbatim") }, ["answer"]),
      run: async (i) => CareerPrep.scoreAnswer(String(i.answer)),
    },
  ];
}
