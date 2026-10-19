// The career tools (WO-002): thin wrappers over the domain modules that already work, operating on the same per-person
// career state the CareerHost persists (ctx.state is the host's turn ctx: profile, trackStore, …). Tools return data; the
// model writes the words. No reply prose lives here.
import { CareerProfile, CareerTrack, CareerPrep } from "../router_core.career.js";
import type { ToolSpec, ToolCtx } from "./loop.ts";
import { searchPostings } from "../career_search.ts";
import { startWatching, validPrefs, validZone, type AlertStore } from "../career_alert_store.ts";
import { DEFAULT_PREFS } from "../career_alerts.ts";
import { applyFloor } from "../career_floor.ts";
import { addStanding, type MemoryStore, quotedFrom } from "./memory.ts";
import { dayIn, EVENT_KINDS, type EventStore, recordEvent, RECALL_MAX, windowOf } from "./timeline.ts";
import { missingIntegration } from "./integrations.ts";
import { brief as interviewBrief, findRecord } from "../career_mock.ts";

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
// `events` is the account's timeline (WO-027): each tool that changes something records it, and recall reads it back.
// Recording never fails the tool (recordEvent logs and goes on).
export function careerTools(deps: { postings: (query: string) => Promise<any[]>; alerts?: AlertStore | null; memory?: MemoryStore | null; events?: EventStore | null; tz?: string }): ToolSpec[] {
  const alertsOf = () => { if (!deps.alerts) throw new Error("job alerts are not configured here"); return deps.alerts; };
  const memoryOf = () => { if (!deps.memory) throw new Error("standing instructions are not kept here"); return deps.memory; };
  const record = (c: ToolCtx, kind: string, subject: unknown, detail: Record<string, unknown> = {}) =>
    recordEvent(deps.events, { user_id: c.userId, at: c.now, kind, subject, detail, source: "chat" });
  return [
    {
      name: "remember_instruction", effect: "write_own",
      description: "Keep something the person said must always hold (a need, a must, a never: \"I need visa sponsorship\", \"no staffing agencies\", \"never before 9am\") on their account for every future conversation. quote must be their own words from THIS message; it refuses anything they did not say. Restate it to them after saving.",
      input_schema: obj({ instruction: str("The instruction, short and plain, e.g. 'Needs visa sponsorship (F-1 OPT)'"), quote: str("Their exact words from this message that say it") }, ["instruction", "quote"]),
      run: async (i, c) => {
        if (!c.turn || !quotedFrom(c.turn.message, String(i.quote ?? ""))) throw new Error("not kept: the quote is not in the person's message this turn; only what they said is kept");
        const store = memoryOf(), had = await store.standing(c.userId);
        const r = addStanding(had, { text: String(i.instruction ?? ""), said: String(i.quote), now: c.now });
        if (!r.ok) throw new Error(r.error);
        await store.saveStanding(c.userId, r.items);
        if (r.items.length > had.length) await record(c, "instruction_kept", r.item.text, { id: r.item.id, said: r.item.said });
        return { kept: r.item, total: r.items.length };
      },
    },
    {
      name: "forget_instruction", effect: "write_own",
      description: "Remove one standing instruction, only when the person asks in this message (\"forget the sponsorship one\", \"I don't need that anymore\").",
      input_schema: obj({ id: str("The instruction id, e.g. S-001") }, ["id"]),
      run: async (i, c) => {
        if (!c.turn || !/\b(forget|remove|delete|drop|clear|no longer|not anymore|anymore|don'?t need|doesn'?t matter|cancel|never ?mind|scratch)\b/i.test(c.turn.message)) {
          throw new Error("not removed: the person did not ask to remove anything in this message");
        }
        const store = memoryOf(), items = await store.standing(c.userId), id = String(i.id);
        const gone = items.find((x) => x.id === id);
        if (!gone) throw new Error(`no standing instruction ${id}`);
        await store.saveStanding(c.userId, items.filter((x) => x.id !== id));
        await record(c, "instruction_removed", gone.text, { id });
        return { removed: id, left: items.length - 1 };
      },
    },
    {
      name: "get_memory", effect: "read",
      description: "Read everything kept about the person across conversations: standing instructions and profile facts (for \"what do you remember about me\").",
      input_schema: obj(),
      run: async (_i, c) => ({ standing: deps.memory ? await deps.memory.standing(c.userId) : [], facts: (profileOf(c).facts || []) }),
    },
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
        const fact = CareerProfile.confirmFact(profileOf(c), id);
        await record(c, "fact_confirmed", fact?.text ?? id, { id, kind: fact?.kind ?? null });
        return { fact };
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
        const application = moved.ok ? moved.application : CareerTrack.addApplication(s, { company: String(i.company), role: i.role ? String(i.role) : "", stage: String(i.stage) }, { now: c.now });
        await record(c, "status_change", String(i.company), { role: application?.role || (i.role ? String(i.role) : null), stage: application?.stage ?? String(i.stage) });
        return { application };
      },
    },
    {
      name: "search_jobs", effect: "read",
      description: "Search live job postings by keywords (role, skill, place). Returns real postings with their links, when they were first seen, and, when the person has confirmed facts, a fit score with reasons and gaps (ranked best fit first; a posting they are knocked out of ranks last with the reason). An empty pool is reported as source 'none'.",
      input_schema: obj({ query: str("Keywords, e.g. 'data analyst remote'"), limit: { type: "number", description: "Max results, default 10" } }),
      run: async (i, c) => {
        const query = String(i.query ?? "");
        const pool = await deps.postings(query);
        if (!pool.length) { await record(c, "search", query, { results: 0, source: "none" }); return { postings: [], total: 0, source: "none" }; }
        // C-04: the person's saved floor (and, always, closed postings and the same job on another board) before any
        // ranking; what was hidden is counted by reason so the reply can say it ("7 senior roles, 5 contract").
        const saved = deps.alerts ? await deps.alerts.get(c.userId).catch(() => null) : null;
        const newest = [...pool].sort((a, b) => String(b.first_seen_at || "").localeCompare(String(a.first_seen_at || "")));
        const { kept, filtered } = applyFloor(newest, saved?.prefs?.floor ?? {});
        const r = searchPostings(kept, query, c.state.profile, Number(i.limit) || 10);
        const found: any[] = Array.isArray((r as any).postings) ? (r as any).postings : [];
        await record(c, "search", query, { results: found.length, companies: [...new Set(found.map((p) => String(p.company ?? "")).filter(Boolean))].slice(0, 5) });
        return { ...r, filtered, source: "live" };
      },
    },
    {
      name: "set_job_alerts", effect: "write_own",
      description: "Turn on or change job alerts: matching new postings are texted within minutes (up to max_instant_per_day), the rest in a daily report, none in quiet hours (default 22-7). Send only what changed: a field left out keeps its value, [] clears a list, and turning alerts back on after a stop keeps the old settings. Restate exactly what will be watched.",
      input_schema: obj({
        keywords: { type: "array", items: { type: "string" }, description: "Job titles or title words to watch, e.g. ['data analyst']" },
        locations: { type: "array", items: { type: "string" }, description: "Cities or regions; empty means anywhere" },
        remote_ok: { type: "boolean", description: "Count remote postings (default true)" },
        report_hour: { type: "number", description: "Local hour 0-23 for the daily report (default 8)" },
        quiet_start: { type: "number", description: "Local hour 0-23 when texts stop (default 22)" },
        quiet_end: { type: "number", description: "Local hour 0-23 when texts may start again (default 7); 'not before 9am' is 9" },
        max_instant_per_day: { type: "number", description: "Instant alerts per day, 0-10 (default 3)" },
        timezone: str("IANA zone, e.g. America/Chicago, if the person said where they are"),
        floor: {
          type: "object",
          description: "Only what the person said they want filtered out, never inferred: levels (intern, entry, mid, senior, lead, exec) they want, types (full_time, part_time, contract, internship, temporary) they want, exclude_words, exclude_companies, min_pay {amount, period: year|hour}, allow_staffing. Restate it exactly.",
        },
      }),
      run: async (i, c) => {
        const store = alertsOf();
        const prev = await store.get(c.userId);
        const v = validPrefs(i, prev ? prev.prefs : DEFAULT_PREFS);
        if (!v.ok) throw new Error(v.error);
        const tz = i.timezone !== undefined ? validZone(i.timezone) : (prev?.tz ?? "America/New_York");
        if (!tz) throw new Error(`unknown time zone ${i.timezone}`);
        const row = startWatching(prev, { userId: c.userId, prefs: v.prefs, tz, now: c.now });
        await store.save(row);
        const f = v.prefs;
        await record(c, prev && prev.prefs.on ? "alert_changed" : "alert_set", f.keywords.join(", "), {
          keywords: f.keywords, locations: f.locations, remote_ok: f.remote_ok, floor: f.floor ?? {}, max_instant_per_day: f.max_instant_per_day,
          report_hour: f.report_hour, quiet: `${f.quiet_start}-${f.quiet_end}`, timezone: tz,
        });
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
        if (r.prefs.on) await record(c, "alert_stopped", r.prefs.keywords.join(", "), { keywords: r.prefs.keywords });
        return { stopped: true };
      },
    },
    {
      name: "recall", effect: "read",
      description: "Look up what happened on the person's account, newest first, with dates: applications prepared, approved and finished, alerts set or changed, instructions kept, facts confirmed, searches, outreach, intros. Filter by kinds, a subject (company, person or role) and when ('in October', 'last week', 'yesterday').",
      input_schema: obj({
        kinds: { type: "array", items: { type: "string", enum: [...EVENT_KINDS] }, description: "Only these kinds of events; leave out for all" },
        subject: str("A company, person or role to match, e.g. 'JPMorgan', 'Stripe', 'data analyst'"),
        when: str("The time in their words: 'in October', 'last week', 'yesterday', 'this month', 'last 30 days'"),
        limit: { type: "number", description: `Max events, default ${RECALL_MAX}` },
      }),
      run: async (i, c) => {
        const kinds: string[] = Array.isArray(i.kinds) ? i.kinds.map(String) : [];
        const unknown = kinds.filter((k) => !(EVENT_KINDS as readonly string[]).includes(k));
        if (unknown.length) throw new Error(`unknown kinds ${unknown.join(", ")}; use ${EVENT_KINDS.join(", ")}`);
        const when = i.when === undefined || i.when === null ? "" : String(i.when).trim();
        const w = when ? windowOf(when, c.now, deps.tz) : null;
        if (when && !w) return { events: [], count: 0, note: `could not read the time "${when.slice(0, 60)}"; ask with a month, "last week", "yesterday" or "this month"` };
        if (!deps.events) return { events: [], count: 0, note: "the account's history is not kept here; say so, never guess" };
        const rows = await deps.events.recall(c.userId, { kinds, subject: i.subject ? String(i.subject) : undefined, from: w?.from, to: w?.to, limit: Number(i.limit) || RECALL_MAX });
        const out: Record<string, unknown> = {
          window: w ? w.label : "all time", count: rows.length,
          events: rows.map((e) => ({ date: dayIn(e.at, deps.tz), kind: e.kind, subject: e.subject, detail: e.detail })),
        };
        // Emails and intros Trainee did not draft or make are not on record: one line that asks, never an error.
        if (!rows.length && kinds.some((k) => /^(outreach|intro)_/.test(k))) out.ask = missingIntegration("email");
        return out;
      },
    },
    {
      name: "get_interview_questions", effect: "read",
      description: "Get practice interview questions for a role or company from the researched question banks.",
      input_schema: obj({ role: str("The role or field, e.g. 'consulting analyst', 'nurse case manager'"), company: str("Company, if any") }),
      run: async (i) => {
        // WO-025: the company's record by exact name (127's findCir needs the library and matches loosely).
        const cir = i.company ? findRecord(String(i.company)) : null;
        const bank = CareerPrep.questionBank({ role: i.role ? String(i.role) : "", roleFamily: i.role ? String(i.role) : "", cir: cir || undefined });
        return { questions: (bank.questions || []).slice(0, 10), company_record: !!(cir) };
      },
    },
    {
      name: "interview_brief", effect: "read",
      description: "A pre-interview brief for a company and role: what the company's record on file says (with source labels, or that there is no record), the role's top question types, the posting's skill words, and a 10-point prep plan. Relay its text; never add company facts it does not have.",
      input_schema: obj({ company: str("Employer name as the person said it"), role: str("The role, e.g. 'data analyst'") }, ["company"]),
      run: async (i) => {
        const company = String(i.company ?? "").trim(), role = String(i.role ?? "").trim();
        const postings = await deps.postings(`${role} ${company}`.trim()).catch(() => []);
        return interviewBrief({ company, role, cir: company ? findRecord(company) : null, postings });
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
