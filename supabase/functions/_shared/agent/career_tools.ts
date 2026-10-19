// The career tools (WO-002): thin wrappers over the domain modules that already work, operating on the same per-person
// career state the CareerHost persists (ctx.state is the host's turn ctx: profile, trackStore, …). Tools return data; the
// model writes the words. No reply prose lives here.
import { CareerProfile, CareerTrack, CareerPrep } from "../router_core.career.js";
import type { ToolSpec, ToolCtx } from "./loop.ts";
import { searchPostings } from "../career_search.ts";
import { startWatching, validPrefs, validZone, type AlertStore } from "../career_alert_store.ts";
import { DEFAULT_PREFS } from "../career_alerts.ts";

const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: "object" as const, properties, required });
const str = (description: string) => ({ type: "string", description });
// A confirmation is the person's own yes, in this turn's message, to a fact they saw in an earlier turn (D-007): the
// model can never confirm a fact it just wrote, or one the person has not answered.
const AFFIRM = /\b(yes|yep|yeah|yup|correct|right|confirm(?:ed)?|accurate|exactly|true|looks (?:good|right)|that'?s (?:right|correct|it))\b/i;
const DENY = /\b(no|nope|not|wrong|incorrect|isn'?t|don'?t|doesn'?t|never|actually|but|change|fix|correct (?:it|that|this))\b/i;
function confirmationRefusal(c: ToolCtx, id: string): string | null {
  const t = c.turn;
  if (!t) return "no confirmation from the person in this turn";
  if (t.added.includes(id)) return `fact ${id} was added in this turn; show it to the person and wait for their reply before confirming`;
  if (!AFFIRM.test(t.message) || DENY.test(t.message)) return "the person's message is not a plain yes; ask them to confirm the fact as written";
  return null;
}
const profileOf = (c: ToolCtx) => ((c.state.profile as any) ??= CareerProfile.createProfile({}));
const trackOf = (c: ToolCtx) => ((c.state.trackStore as any) ??= CareerTrack.createMemoryStore([]));

// `postings(query)` returns candidate open postings: in production a full-text search of career_postings
// (supabasePostingsDb.search), in tests a fixed pool. search_jobs filters and ranks them either way.
export function careerTools(deps: { postings: (query: string) => Promise<any[]>; alerts?: AlertStore | null }): ToolSpec[] {
  const alertsOf = () => { if (!deps.alerts) throw new Error("job alerts are not configured here"); return deps.alerts; };
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
      run: async (i, c) => {
        const fact = CareerProfile.addFact(profileOf(c), { kind: String(i.kind), text: String(i.text), needs_confirmation: true, status: "draft" });
        c.turn?.added.push(fact.id);
        return { fact };
      },
    },
    {
      name: "confirm_profile_fact", effect: "write_own",
      description: "Mark a draft fact confirmed. Only works when the person's message in this turn is a plain yes to a fact shown to them in an earlier turn; otherwise it refuses and you ask them.",
      input_schema: obj({ id: str("The fact id, e.g. F-001") }, ["id"]),
      run: async (i, c) => {
        const id = String(i.id);
        if (!(profileOf(c).facts || []).some((f: any) => f.id === id)) throw new Error(`no fact ${id} on file`);
        const refusal = confirmationRefusal(c, id);
        if (refusal) throw new Error(`not confirmed: ${refusal}`);
        return { fact: CareerProfile.confirmFact(profileOf(c), id) };
      },
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
      description: "Search live job postings by keywords (role, skill, place). Returns real postings with their links, when they were first seen, and, when the person has confirmed facts, a fit score with reasons and gaps (ranked best fit first; a posting they are knocked out of ranks last with the reason). An empty pool is reported as source 'none'.",
      input_schema: obj({ query: str("Keywords, e.g. 'data analyst remote'"), limit: { type: "number", description: "Max results, default 10" } }),
      run: async (i, c) => {
        const query = String(i.query ?? "");
        const pool = await deps.postings(query);
        if (!pool.length) return { postings: [], total: 0, source: "none" };
        const r = searchPostings(pool, query, c.state.profile, Number(i.limit) || 10);
        return { ...r, source: "live" };
      },
    },
    {
      name: "set_job_alerts", effect: "write_own",
      description: "Turn on job alerts: new postings whose titles match the keywords are texted within minutes (up to max_instant_per_day), the rest go in one daily report at report_hour, quiet 22:00-07:00 in their zone. Restate exactly what will be watched.",
      input_schema: obj({
        keywords: { type: "array", items: { type: "string" }, description: "Job titles or title words to watch, e.g. ['data analyst']" },
        locations: { type: "array", items: { type: "string" }, description: "Cities or regions; empty means anywhere" },
        remote_ok: { type: "boolean", description: "Count remote postings (default true)" },
        report_hour: { type: "number", description: "Local hour 0-23 for the daily report (default 8)" },
        max_instant_per_day: { type: "number", description: "Instant alerts per day, 0-10 (default 3)" },
        timezone: str("IANA zone, e.g. America/Chicago, if the person said where they are"),
      }, ["keywords"]),
      run: async (i, c) => {
        const store = alertsOf();
        const prev = await store.get(c.userId);
        const v = validPrefs(i, prev ? prev.prefs : DEFAULT_PREFS);
        if (!v.ok) throw new Error(v.error);
        const tz = i.timezone !== undefined ? validZone(i.timezone) : (prev?.tz ?? "America/New_York");
        if (!tz) throw new Error(`unknown time zone ${i.timezone}`);
        const row = startWatching(prev, { userId: c.userId, prefs: v.prefs, tz, now: c.now });
        await store.save(row);
        return { alerts: { ...v.prefs, timezone: tz, quiet_hours: `${v.prefs.quiet_start}:00-${v.prefs.quiet_end}:00`, first_report: row.last_report_on ? "tomorrow" : "today" } };
      },
    },
    {
      name: "get_job_alerts", effect: "read",
      description: "Read the person's job-alert settings: what is watched, how many instant alerts a day, when the report comes, and whether alerts are on.",
      input_schema: obj(),
      run: async (_i, c) => { const r = await alertsOf().get(c.userId); return r ? { alerts: { ...r.prefs, timezone: r.tz } } : { alerts: null }; },
    },
    {
      name: "stop_job_alerts", effect: "write_own",
      description: "Stop every job alert and the daily report. One message stops everything; nothing more is sent until they turn alerts on again.",
      input_schema: obj(),
      run: async (_i, c) => {
        const store = alertsOf(), r = await store.get(c.userId);
        if (!r) return { stopped: true, note: "no alerts were on" };
        await store.save({ ...r, prefs: { ...r.prefs, on: false } });
        return { stopped: true };
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
