// Backend gap map G4 (D-011): an application is prepared before the person asks. The server's caller of the queue
// path's preparation: for each posting the person's job alerts already sent them (career_apply_prepare_candidates), the
// engine's dry run (scripts/apply.ts, which plans the form with career_apply.ts planBatch) on the employer's page, with
// the person's own confirmed answers and the resume tailored to this posting, stored as the prepared application their
// card reads (career_apply_prepare_for). A posting that asks what no confirmed fact answers is asked of them once
// (career_apply_prepare_ask_for). Nothing is approved, queued or sent here: the card, and the person's one text, decide.
//
// The facts: only what the trust contract keeps (extension/src/apply_core.ts trustedManifest, WO-102). Here that is the
// person's own answers to questions they were asked (career_apply_answers_for) and, when a profile reader is given, the
// facts of their stored profile that carry the owner's confirmation event (trustedProfile, the allowlist every other
// submission path applies). Nothing else is a fact: not one the router confirmed without an event, not a draft, not a
// fact with no confirmation at all. The one filtered profile is what the facts file, the resume and the drafter see.
// The resume: the one tailored to this posting from their confirmed facts (career_tailor.ts tailorForPosting: truth
// audit, render, ATS parse), stored privately at career-resumes/<user_id>/<sha256>.pdf and bound into the payload by its
// hash, with resume_tailored (career_apply_resume_tag marks the queued job tailored only when that exact file is stored).
// A posting it cannot tailor for is not prepared (no_resume): nothing goes out with a resume the person did not get.
// Every try is recorded (career_apply_prepare_attempt_for), so a posting is retried once a week at most, or as soon as
// the questions it stopped on are answered.
// The cover letter: when a posting asks for one typed into a text box, it is drafted from the person's confirmed facts by
// the chat's own drafter (essay_draft.ts draftEssay: the employer's AI policy first, every name and number traced to a
// confirmed fact) and kept beside the question (career_apply_question_draft_put_for). It is never their answer: the chat
// shows it whole when they ask, only their "use N" saves it, and the posting is then prepared again with it.
//
// Usage (the worker host, the service role; never on a schedule from here):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno run -A workers/career-browser/prepare-ahead.ts once [--limit N] [--draft-cover-letters]
// --draft-cover-letters calls the model (the gateway's provider, paid) once or twice for each cover letter drafted; without
// it none is drafted ahead, and the person can still say "draft N" in the chat.
import { engineFacts, engineRunner, prepare, questionsToStore, type ResumeTag, type RunEngine, type TextAnswer } from "./approve-first.ts";
import { trustedManifest } from "../../extension/src/apply_core.ts";
import { type ResumeStore, tailorForPosting, type TailorDeps } from "../../supabase/functions/_shared/career_tailor.ts";
import { draftEssay, type ModelFn } from "../../supabase/functions/_shared/essay_draft.ts";
import { mapQuestion } from "../../supabase/functions/_shared/question_map.ts";

export interface Candidate {
  user_id: string; job_id: string; company: string; title: string; url: string; location: string; description: string;
  epoch: number; version: number;
}
export interface ServiceRpc { rpc: (name: string, args?: any) => PromiseLike<{ data: any; error: { message: string } | null }> }
export interface PreparedResume { path: string; sha256: string; tag: ResumeTag | null }
export interface AheadDeps {
  db: ServiceRpc; // the service role
  runEngine: RunEngine;
  // The resume tailored to this posting from the trusted profile, written to a file in dir; null when it cannot be.
  // deno-lint-ignore no-explicit-any
  resumeFor: (c: Candidate, dir: string, profile: any | null) => Promise<PreparedResume | null>;
  // The person's stored profile, as stored (storedProfile); prepareAhead keeps only its trusted facts. Absent: only their
  // answers count.
  // deno-lint-ignore no-explicit-any
  profileFor?: (userId: string) => Promise<any | null>;
  // The link the engine opens. Production: the posting's own. Tests point an https posting at a local employer page.
  urlFor?: (c: Candidate) => string;
  // The model the chat's drafter writes with; absent (or no profile), no cover letter is drafted ahead.
  draftModel?: ModelFn;
  // FEATURE 3: the model a cover note for each ready application is drafted with (the same drafter); absent, none.
  coverNoteModel?: ModelFn;
  now?: () => number;
  tmpRoot?: string;
}
export interface AheadOutcome { user_id: string; job_id: string; outcome: "ready" | "asked" | "refused" | "no_resume" | "error"; detail: string; prepared_id?: string; cover_note?: boolean }

const must = (r: { data: any; error: { message: string } | null }, what: string) => {
  if (r.error) throw Error(`${what}: ${r.error.message}`);
  return r.data;
};

// FEATURE 1: `only` prepares just these postings of this person (the rows the chat just queued, prepare-ahead.ts serve);
// the candidates are still the database's (career_apply_prepare_candidates: its gates decide), only narrowed.
export async function prepareAhead(d: AheadDeps, o: { perPerson?: number; limit?: number; only?: { user_id: string; job_ids: string[] } } = {}): Promise<AheadOutcome[]> {
  const now = d.now ?? Date.now;
  const all: Candidate[] = must(await d.db.rpc("career_apply_prepare_candidates", {
    p_now: new Date(now()).toISOString(), p_per_person: o.perPerson ?? 5, p_limit: o.limit ?? 50,
  }), "read the postings to prepare") ?? [];
  const only = o.only ? new Set(o.only.job_ids) : null;
  const candidates = only ? all.filter((c) => c.user_id === o.only!.user_id && only.has(c.job_id)) : all;
  const out: AheadOutcome[] = [];
  for (const c of candidates) out.push(await prepareOne(d, c));
  return out;
}

// One posting prepared for one person: the queue path's own preparation, the same for the CLI's candidates above and for
// the scheduled run (career_proactive_run.ts runPrepareAhead, FEATURE 3). Every try is recorded
// (career_apply_prepare_attempt_for); a ready one is stored for their card (career_apply_prepare_for), its payload
// carrying the hash of the resume tailored to this posting and, when one was drafted (`coverNoteModel`), the cover note,
// so the card's tap approves exactly those.
export async function prepareOne(d: AheadDeps, c: Candidate): Promise<AheadOutcome> {
  const now = d.now ?? Date.now;
  let done: AheadOutcome | null = null;
  const record = async (outcome: AheadOutcome["outcome"], detail: string, prepared?: string, engineJob?: string) => {
    const r = await d.db.rpc("career_apply_prepare_attempt_for", {
      p_user: c.user_id, p_posting_job_id: c.job_id, p_outcome: outcome, p_detail: detail.slice(0, 500), p_prepared: prepared ?? null,
      p_engine_job_id: engineJob ?? null,
    });
    if (r.error) console.error(`prepare-ahead: the try on ${c.job_id} was not recorded (${r.error.message})`);
    done = { user_id: c.user_id, job_id: c.job_id, outcome, detail, ...(prepared ? { prepared_id: prepared } : {}) };
    return done;
  };
  const dir = await Deno.makeTempDir({ prefix: "trainee-ahead-", ...(d.tmpRoot ? { dir: d.tmpRoot } : {}) });
  try {
    // Their own answers to questions they were asked, and their profile's confirmed facts: the trust contract decides.
    const rows: TextAnswer[] = must(await d.db.rpc("career_apply_answers_for", { p_user: c.user_id }), "read their answers") ?? [];
    const profile = d.profileFor ? trustedProfile(await d.profileFor(c.user_id), c.user_id, rows) : null;
    // The posting's own company (career_postings), which the engine names the application by (else the board's tenant):
    // the 30-day one-company rule and the person's card then count employers, not job boards.
    const file = {
      user_id: c.user_id, answers: {}, saved: {}, posting: { company: c.company },
      ...(profile && Array.isArray(profile.facts) ? { facts: profile.facts } : {}),
    };
    const merged = engineFacts(file, rows);
    const trusted = trustedManifest({ owner: c.user_id, file: merged, rows, resume: null }).answers;
    const factsPath = `${dir}/facts.json`;
    await Deno.writeTextFile(factsPath, JSON.stringify(merged), { mode: 0o600 });
    const resume = await d.resumeFor(c, dir, profile);
    if (!resume) {
      // SUBMIT-STEER-1130: confirmed facts but no name or email on file, so no resume can carry them. Ask for those, once
      // (bound to this posting, so their answers make it a candidate again), instead of stopping here for good.
      const missing = profile && Array.isArray(profile.facts) && profile.facts.length ? contactAsk(profile, rows, c.company) : [];
      if (missing.length) {
        const n = must(await d.db.rpc("career_apply_prepare_ask_for", {
          p_user: c.user_id, p_posting_job_id: c.job_id, p_engine_job_id: c.job_id, p_questions: missing,
        }), "store the questions");
        return { user_id: c.user_id, job_id: c.job_id, outcome: "asked", detail: `${n} question(s) asked: their name and email, for the resume` };
      }
      return await record("no_resume", "no resume could be tailored to this posting from their confirmed facts");
    }
    const r = await prepare({
      url: d.urlFor ? d.urlFor(c) : c.url, factsPath, resumePath: resume.path, account: { epoch: Number(c.epoch), version: Number(c.version) },
      now: now(), runEngine: d.runEngine, resumeTag: resume.tag,
    });
    if (!r.ready) {
      const result: any = r.result;
      // The questions name the posting's own company too (the engine's stop names the board's tenant or the page's host).
      const ask = result.reason === "needs_answers"
        ? questionsToStore({ ...result, company: c.company || result.company }, { facts: trusted, answered: new Set(rows.map((x) => x.key)) })
        : null;
      if (ask?.questions.length) {
        const n = must(await d.db.rpc("career_apply_prepare_ask_for", {
          p_user: c.user_id, p_posting_job_id: c.job_id, p_engine_job_id: ask.posting, p_questions: ask.questions,
        }), "store the questions");
        const letters = d.draftModel && profile ? await coverLettersAhead(d.db, d.draftModel, c, ask, profile) : 0;
        return {
          user_id: c.user_id, job_id: c.job_id, outcome: "asked",
          detail: `${n} question(s) asked${letters ? `; ${letters} cover letter${letters === 1 ? "" : "s"} drafted for them to read` : ""}`,
        };
      }
      return await record("refused", String(result.reason ?? result.state ?? "not ready"), undefined, result.posting);
    }
    if (r.payload.resume_sha256 !== resume.sha256) return await record("error", "the engine sent another resume than the tailored one");
    // FEATURE 3: a cover note drafted for this posting from their confirmed facts only (the chat's drafter, with its fact
    // lock and the employer's AI policy), bound into the payload and shown whole on the card, so the tap approves it as
    // read. A note that fails any check is left out and the application is prepared without one.
    // deno-lint-ignore no-explicit-any
    let payload: any = r.payload, card: string[] = r.card;
    const note = d.coverNoteModel && profile ? await coverNote(d.coverNoteModel, c, profile) : null;
    if (note) {
      payload = { ...payload, cover_note: { text: note.text, fact_ids: note.factIds.slice(0, 20) } };
      card = [...card, `Cover note: ${note.text}`];
    }
    const saved = await d.db.rpc("career_apply_prepare_for", { p_user: c.user_id, p_posting_job_id: c.job_id, p_payload: payload, p_card_lines: card });
    if (saved.error) return await record("refused", `not stored: ${saved.error.message}`, undefined, r.payload.job_id);
    return { user_id: c.user_id, job_id: c.job_id, outcome: "ready", detail: "prepared for their card", prepared_id: saved.data.id, ...(note ? { cover_note: true } : {}) };
  } catch (e) {
    return done ?? await record("error", e instanceof Error ? e.message : String(e));
  } finally {
    await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
}

// The cover note for one posting (FEATURE 3), drafted by essay_draft.ts draftEssay: only the person's confirmed facts,
// every name and number traced to one of them, short enough to be one line of the card. Null when it is not drafted.
export const COVER_NOTE_LABEL = (c: Pick<Candidate, "title" | "company">) => `Cover letter for the ${c.title} role at ${c.company} (max 500 characters)`;
// deno-lint-ignore no-explicit-any
async function coverNote(model: ModelFn, c: Candidate, profile: any): Promise<{ text: string; factIds: string[] } | null> {
  const r = await draftEssay({
    q: { id: "", label: COVER_NOTE_LABEL(c), type: "textarea", kind: "essay", company: c.company || null, job_ids: [c.job_id], ai_policy: null },
    siblingLabels: [], deps: { model, facts: () => (Array.isArray(profile.facts) ? profile.facts : []) },
  }).catch((e) => ({ ok: false as const, why: "model" as const, detail: [e instanceof Error ? e.message : String(e)] }));
  if (!r.ok) { console.error(`prepare-ahead: no cover note for ${c.job_id} (${r.why}: ${r.detail.join("; ").slice(0, 200)})`); return null; }
  return { text: r.text.replace(/\s+/g, " ").trim(), factIds: r.factIds };
}

// The name and email a tailored resume prints, asked as the shared facts the forms ask (fact:first_name, fact:last_name,
// fact:email), only those not answered yet and only when the profile has no confirmed basics of its own.
const CONTACT_QUESTIONS = [
  { key: "fact:first_name", label: "First name" }, { key: "fact:last_name", label: "Last name" }, { key: "fact:email", label: "Email" },
];
// deno-lint-ignore no-explicit-any
function contactAsk(profile: any, rows: TextAnswer[], company: string | null) {
  if (profile?.basics?.name && profile?.basics?.email) return [];
  const answered = new Set(rows.filter((r) => typeof r.answer === "string" && r.answer.trim()).map((r) => r.key));
  return CONTACT_QUESTIONS.filter((q) => !answered.has(q.key))
    .map((q) => ({ ...q, kind: "fact", type: "input_text", options: [], ...(company ? { company } : {}) }));
}

// The cover letters a posting asks for, typed into a text box (question_map.ts essay_cover_letter), each drafted once and
// kept beside its question. A draft that fails any of the drafter's checks is not kept: the question stays theirs.
// deno-lint-ignore no-explicit-any
async function coverLettersAhead(db: ServiceRpc, model: ModelFn, c: Candidate, ask: { posting: string; questions: any[] }, profile: any): Promise<number> {
  let kept = 0;
  for (const q of ask.questions) {
    if (q.kind !== "essay" || mapQuestion({ label: String(q.label), type: String(q.type), options: [] }).fact !== "essay_cover_letter") continue;
    const r = await draftEssay({
      q: { id: "", label: String(q.label), type: String(q.type), kind: "essay", company: q.company ?? c.company, job_ids: [ask.posting], ai_policy: q.ai_policy ?? null },
      siblingLabels: ask.questions.filter((x) => x !== q).flatMap((x) => [String(x.label), String(x.ai_policy ?? "")]),
      deps: { model, facts: () => (Array.isArray(profile.facts) ? profile.facts : []) },
    });
    if (!r.ok) { console.error(`prepare-ahead: no cover letter drafted for ${c.job_id} (${r.why}: ${r.detail.join("; ").slice(0, 200)})`); continue; }
    const saved = await db.rpc("career_apply_question_draft_put_for", {
      p_user: c.user_id, p_engine_job_id: ask.posting, p_key: q.key, p_text: r.text, p_fact_ids: r.factIds.slice(0, 20),
    });
    if (saved.error) console.error(`prepare-ahead: the cover letter for ${c.job_id} was not kept (${saved.error.message})`);
    else if (saved.data) kept++;
  }
  return kept;
}

// The person's stored profile with only what the trust contract keeps (WO-102, the allowlist production-sources.cjs
// trustedMaster applies on the batch path): a fact stays only when it is confirmed (status "confirmed", needs no
// confirmation), the owner's own, carries a positive owner provenance and the event that confirmed it, is not quarantined
// (D-007) and is derived from nothing excluded. A profile naming another owner is nobody's. The name and email the resume
// prints come from the person's own answers (first name, last name, email), or from a basics block that carries its own
// confirmation event; else none, and no resume is tailored (career_tailor refuses one without them).
// deno-lint-ignore no-explicit-any
export function trustedProfile(profile: any, owner: string, rows: TextAnswer[]): any | null {
  if (!profile || typeof profile !== "object" || (profile.user_id !== undefined && profile.user_id !== owner)) return null;
  // deno-lint-ignore no-explicit-any
  const entry = (f: any, id: unknown, value: unknown) => ({
    value: String(value ?? ""), factId: String(id ?? ""), confirmed: f.status === "confirmed" && f.needs_confirmation === false,
    ...(f.user_id ? { user_id: f.user_id } : {}), provenance: f.provenance, confirmation_event_id: f.confirmation_event_id,
    ...(Array.isArray(f.derived_from) ? { derived_from: f.derived_from } : {}),
  });
  const facts = Array.isArray(profile.facts) ? profile.facts : [];
  // deno-lint-ignore no-explicit-any
  const answers: Record<string, any> = {};
  // A fact's words are its first non-empty one of these (the brain's own facts carry an empty title).
  // deno-lint-ignore no-explicit-any
  const words = (f: any) => [f.value, f.title, f.name, f.text].find((v) => typeof v === "string" && v.trim()) ?? "";
  facts.forEach((f: any, i: number) => { if (f && typeof f === "object") answers[`fact:${i}`] = entry(f, f.id, words(f)); });
  const b = profile.basics && typeof profile.basics === "object" ? profile.basics : {};
  answers.basics = entry(b, b.id || "basics", b.name || b.email || "basics");
  const kept = trustedManifest({ owner, file: { user_id: owner, answers }, rows: [], resume: null }).answers;
  const said = (k: string) => {
    const r = rows.find((x) => x.key === `fact:${k}` && typeof x.answer === "string" && x.answer.trim());
    return r ? r.answer.trim() : null;
  };
  const name = [said("first_name"), said("last_name")].filter(Boolean).join(" ") || said("full_name") || said("name");
  const basics = kept.basics ? b : { ...(name ? { name } : {}), ...(said("email") ? { email: said("email") } : {}), ...(said("phone") ? { phone: said("phone") } : {}) };
  return { ...profile, user_id: owner, basics, facts: facts.filter((_f: unknown, i: number) => !!kept[`fact:${i}`]) };
}

// The resume tailored to the posting (WO-028, career_tailor.ts) from the trusted profile prepareAhead hands it, the bytes
// kept as they were stored so the engine sends exactly the stored file. Production: supabaseResumeStore(admin) and
// edgeRenderer(); the store's put is what makes the file "one Trainee stored for this person", which
// career_apply_resume_tag checks before calling the job tailored.
export function tailoredResume(o: { render: TailorDeps["render"]; resumes: ResumeStore; now?: () => number }) {
  // deno-lint-ignore no-explicit-any
  return async (c: Candidate, dir: string, profile: any | null): Promise<PreparedResume | null> => {
    if (!profile) return null;
    let bytes: Uint8Array | null = null;
    const tee: ResumeStore = {
      put: async (path, pdf) => { bytes = pdf; await o.resumes.put(path, pdf); },
      signedUrl: (path, seconds) => o.resumes.signedUrl(path, seconds),
      removeAll: (u) => o.resumes.removeAll(u),
    };
    const t = await tailorForPosting({
      userId: c.user_id, profile, posting: { text: `${c.title} at ${c.company}\n\n${c.description ?? ""}`, job_id: c.job_id, company: c.company },
      deps: { render: o.render, resumes: tee }, now: (o.now ?? Date.now)(),
    });
    if (!t.ok || !bytes) return null;
    const path = `${dir}/${t.filename.replace(/[^A-Za-z0-9._-]/g, "_") || "resume.pdf"}`;
    await Deno.writeFile(path, bytes, { mode: 0o600 });
    return { path, sha256: t.sha256, tag: { tailored: true, persona: t.persona } };
  };
}

// The profile the chat keeps for the person (the 122 master in agent_flow_state), as stored: their most recently updated
// thread that holds one and names no other owner (career_apply_profile_for). It is never trusted as read; prepareAhead
// filters it (trustedProfile). A read that fails is no profile: only their answers count.
export function storedProfile(admin: ServiceRpc) {
  // deno-lint-ignore no-explicit-any
  return async (userId: string): Promise<any | null> => {
    const r = await admin.rpc("career_apply_profile_for", { p_user: userId });
    if (r.error) { console.error(`prepare-ahead: their profile was not read (${r.error.message})`); return null; }
    const p = r.data;
    if (!p || typeof p !== "object" || Array.isArray(p) || (p.user_id !== undefined && p.user_id !== userId)) return null;
    return { ...p, user_id: userId };
  };
}

// FEATURE 1: the worker host's door for the chat (agent-chat kickPrepare, career_apply_from_chat.ts). A POST with the
// shared token and { user_id, job_ids } is answered 202 at once and prepares exactly those queued rows, one run at a time
// (runs are chained, never concurrent). Anything else is refused. It prepares only; nothing is approved, queued or sent.
export function prepareDoor(o: { token: string; run: (only: { user_id: string; job_ids: string[] }) => Promise<unknown> }) {
  let chain: Promise<unknown> = Promise.resolve();
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
    if (!o.token || req.headers.get("authorization") !== `Bearer ${o.token}`) return new Response("unauthorized", { status: 401 });
    // deno-lint-ignore no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { return new Response("bad request", { status: 400 }); }
    const user = String(body?.user_id ?? ""), ids = Array.isArray(body?.job_ids) ? body.job_ids.map(String).filter((x: string) => x && x.length <= 300).slice(0, 100) : [];
    if (!UUID.test(user) || !ids.length) return new Response("bad request", { status: 400 });
    chain = chain.then(() => o.run({ user_id: user, job_ids: ids })).catch((e) => console.error(`prepare-ahead serve: ${e instanceof Error ? e.message : e}`));
    return new Response(JSON.stringify({ accepted: ids.length }), { status: 202, headers: { "content-type": "application/json" } });
  };
}

// FEATURE 3: the scheduled run's `prepareAhead` dependency (career-proactive handler.ts), one posting at a time through
// prepareOne. coverNotes: the model call behind CAREER_PREPARE_AHEAD_COVER=on (off by default), metered per person into
// agent_turn_costs; off, no cover note is drafted and the application is prepared without one.
// deno-lint-ignore no-explicit-any
export function aheadPrepare(o: { admin: any; base: Omit<AheadDeps, "coverNoteModel">; cover?: { call: (payload: any, meter: any) => Promise<any>; newMeter: () => any } }) {
  return async (c: Candidate): Promise<AheadOutcome> => {
    const meter = o.cover ? o.cover.newMeter() : null;
    const out = await prepareOne({ ...o.base, ...(o.cover && meter ? { coverNoteModel: (payload: unknown) => o.cover!.call(payload, meter) } : {}) }, c);
    if (meter?.calls) {
      const { error } = await o.admin.from("agent_turn_costs").insert({ user_id: c.user_id, thread_id: null, provider: meter.provider, models: meter.models, calls: meter.calls,
        failed: meter.failed, input_tokens: meter.input_tokens, output_tokens: meter.output_tokens, cached_tokens: meter.cached_tokens, usd_micros: meter.usd_micros, unpriced: meter.unpriced });
      if (error) console.error(`prepare-ahead: the cover note's cost was not recorded (${error.message})`);
    }
    return out;
  };
}

if (import.meta.main) {
  const [cmd, ...rest] = Deno.args;
  if (cmd === "daily") {
    // FEATURE 3: the day's preparation and its one card, as the scheduled career-proactive run does it, on the host that
    // has the engine (an edge function cannot run a browser). Run it on a schedule (every 15 minutes is enough: once a
    // local day per person, the card retried until it is shown). CAREER_PREPARE_AHEAD=on is required.
    if (Deno.env.get("CAREER_PREPARE_AHEAD") !== "on") { console.error("CAREER_PREPARE_AHEAD is not on; nothing was prepared."); Deno.exit(2); }
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required; nothing was prepared."); Deno.exit(2); }
    const { createClient } = await import("npm:@supabase/supabase-js@2.117.1");
    const { edgeRenderer, supabaseResumeStore } = await import("../../supabase/functions/_shared/career_tailor.ts");
    const { supabaseAlertStore } = await import("../../supabase/functions/_shared/career_alert_store.ts");
    const { supabasePostingsDb } = await import("../../supabase/functions/_shared/career_ingest.ts");
    const { supabaseAheadStore } = await import("../../supabase/functions/_shared/career_prepare_ahead.ts");
    const { runPrepareAhead } = await import("../../supabase/functions/_shared/career_proactive_run.ts");
    const { callModel, modelConfig, newMeter } = await import("../../supabase/functions/_shared/model_gateway.ts");
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const root = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
    const cfg = { ...modelConfig(Deno.env, "chat"), model: Deno.env.get("CAREER_MODEL") || "gpt-5-mini" };
    const alerts = supabaseAlertStore(admin), postings = supabasePostingsDb(admin);
    const stats = await runPrepareAhead({
      now: Date.now(), recentPostings: (since) => postings.newSince(since), ahead: supabaseAheadStore(admin),
      // Paused, opted out or erased: nothing is prepared for them (career_quiet_users, as the scheduled run filters).
      store: { ...alerts, active: async () => {
        const rows = await alerts.active();
        const q = await admin.rpc("career_quiet_users", { p_users: rows.map((r) => r.id) });
        if (q.error) throw new Error(`read who is paused: ${q.error.message}`);
        const quiet = new Set((q.data ?? []).map((r: any) => String(r.user_id)));
        return rows.filter((r) => !quiet.has(r.id));
      } },
      watches: async (ids) => {
        const out = new Map<string, unknown>();
        const { data, error } = await admin.from("career_watch_kv").select("user_id,value").in("user_id", ids).in("key", ids.map((u) => `career:watch-profile:${u}`));
        if (error) throw new Error(`read watch records: ${error.message}`);
        for (const r of data ?? []) out.set(String(r.user_id), r.value);
        return out;
      },
      prepare: aheadPrepare({
        admin,
        base: { db: admin, runEngine: engineRunner({ root }), profileFor: storedProfile(admin), resumeFor: tailoredResume({ render: edgeRenderer(), resumes: supabaseResumeStore(admin) }) },
        cover: Deno.env.get("CAREER_PREPARE_AHEAD_COVER") === "on" ? { newMeter, call: (payload, meter) => callModel(cfg, payload, { meter, role: "chat" }) } : undefined,
      }),
    });
    console.log(`${stats.ready}/${stats.picked} applications ready for ${stats.people} people; ${stats.cards} card(s) pushed; nothing was sent.`);
    Deno.exit(0);
  }
  if (cmd !== "once" && cmd !== "serve") {
    console.error("usage: prepare-ahead.ts once [--limit N] [--draft-cover-letters] | daily   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment)\n" +
      "       prepare-ahead.ts serve [--port N] [--draft-cover-letters]   (also CAREER_PREPARE_AHEAD_TOKEN: the chat's kick, agent-chat CAREER_PREPARE_AHEAD_URL)");
    Deno.exit(2);
  }
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) { console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required; nothing was prepared."); Deno.exit(2); }
  const { createClient } = await import("npm:@supabase/supabase-js@2.117.1");
  const { edgeRenderer, supabaseResumeStore } = await import("../../supabase/functions/_shared/career_tailor.ts");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const i = rest.indexOf("--limit"), limit = i >= 0 ? Number(rest[i + 1]) : 50;
  const root = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
  const profileFor = storedProfile(admin);
  // The chat's own model door (agent-chat handler-career.ts drafts with the same configuration), only when asked.
  const { callModel, modelConfig, newMeter } = await import("../../supabase/functions/_shared/model_gateway.ts");
  const meter = newMeter(), cfg = { ...modelConfig(Deno.env, "chat"), model: Deno.env.get("CAREER_MODEL") || "gpt-5-mini" };
  const draftModel: ModelFn | undefined = rest.includes("--draft-cover-letters")
    ? (payload) => callModel(cfg, payload, { meter, role: "chat" }) : undefined;
  const deps: AheadDeps = {
    db: admin, runEngine: engineRunner({ root }), profileFor, draftModel,
    resumeFor: tailoredResume({ render: edgeRenderer(), resumes: supabaseResumeStore(admin) }),
  };
  if (cmd === "serve") {
    const token = Deno.env.get("CAREER_PREPARE_AHEAD_TOKEN") ?? "";
    if (!token) { console.error("CAREER_PREPARE_AHEAD_TOKEN is required to serve; nothing was started."); Deno.exit(2); }
    const p = rest.indexOf("--port"), port = p >= 0 ? Number(rest[p + 1]) : 8787;
    Deno.serve({ port }, prepareDoor({
      token,
      run: async (only) => {
        const done = await prepareAhead(deps, { only, perPerson: 25, limit: 200 });
        for (const r of done) console.log(`${r.outcome.toUpperCase()} ${r.job_id} (${r.detail})`);
      },
    }));
    await new Promise(() => {});
  }
  const done = await prepareAhead(deps, { limit: Number.isInteger(limit) && limit > 0 ? limit : 50 });
  for (const r of done) console.log(`${r.outcome.toUpperCase()} ${r.job_id} (${r.detail})`);
  console.log(`${done.filter((r) => r.outcome === "ready").length} of ${done.length} prepared before they asked; nothing was sent.`);
  if (draftModel) console.log(`model calls for cover letters: ${meter.calls} (${meter.failed} failed), $${(meter.usd_micros / 1e6).toFixed(4)}${meter.unpriced ? `, ${meter.unpriced} unpriced` : ""}`);
}
