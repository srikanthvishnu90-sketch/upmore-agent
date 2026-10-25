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
  now?: () => number;
  tmpRoot?: string;
}
export interface AheadOutcome { user_id: string; job_id: string; outcome: "ready" | "asked" | "refused" | "no_resume" | "error"; detail: string; prepared_id?: string }

const must = (r: { data: any; error: { message: string } | null }, what: string) => {
  if (r.error) throw Error(`${what}: ${r.error.message}`);
  return r.data;
};

export async function prepareAhead(d: AheadDeps, o: { perPerson?: number; limit?: number } = {}): Promise<AheadOutcome[]> {
  const now = d.now ?? Date.now;
  const candidates: Candidate[] = must(await d.db.rpc("career_apply_prepare_candidates", {
    p_now: new Date(now()).toISOString(), p_per_person: o.perPerson ?? 5, p_limit: o.limit ?? 50,
  }), "read the postings to prepare") ?? [];
  const out: AheadOutcome[] = [];
  for (const c of candidates) {
    const record = async (outcome: AheadOutcome["outcome"], detail: string, prepared?: string, engineJob?: string) => {
      const r = await d.db.rpc("career_apply_prepare_attempt_for", {
        p_user: c.user_id, p_posting_job_id: c.job_id, p_outcome: outcome, p_detail: detail.slice(0, 500), p_prepared: prepared ?? null,
        p_engine_job_id: engineJob ?? null,
      });
      if (r.error) console.error(`prepare-ahead: the try on ${c.job_id} was not recorded (${r.error.message})`);
      out.push({ user_id: c.user_id, job_id: c.job_id, outcome, detail, ...(prepared ? { prepared_id: prepared } : {}) });
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
          out.push({ user_id: c.user_id, job_id: c.job_id, outcome: "asked", detail: `${n} question(s) asked: their name and email, for the resume` });
          continue;
        }
        await record("no_resume", "no resume could be tailored to this posting from their confirmed facts");
        continue;
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
          out.push({
            user_id: c.user_id, job_id: c.job_id, outcome: "asked",
            detail: `${n} question(s) asked${letters ? `; ${letters} cover letter${letters === 1 ? "" : "s"} drafted for them to read` : ""}`,
          });
        } else await record("refused", String(result.reason ?? result.state ?? "not ready"), undefined, result.posting);
        continue;
      }
      if (r.payload.resume_sha256 !== resume.sha256) { await record("error", "the engine sent another resume than the tailored one"); continue; }
      const saved = await d.db.rpc("career_apply_prepare_for", { p_user: c.user_id, p_posting_job_id: c.job_id, p_payload: r.payload, p_card_lines: r.card });
      if (saved.error) await record("refused", `not stored: ${saved.error.message}`, undefined, r.payload.job_id);
      else out.push({ user_id: c.user_id, job_id: c.job_id, outcome: "ready", detail: "prepared for their card", prepared_id: saved.data.id });
    } catch (e) {
      await record("error", e instanceof Error ? e.message : String(e));
    } finally {
      await Deno.remove(dir, { recursive: true }).catch(() => {});
    }
  }
  return out;
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

if (import.meta.main) {
  const [cmd, ...rest] = Deno.args;
  if (cmd !== "once") {
    console.error("usage: prepare-ahead.ts once [--limit N] [--draft-cover-letters]   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment)");
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
  const done = await prepareAhead({
    db: admin, runEngine: engineRunner({ root }), profileFor, draftModel,
    resumeFor: tailoredResume({ render: edgeRenderer(), resumes: supabaseResumeStore(admin) }),
  }, { limit: Number.isInteger(limit) && limit > 0 ? limit : 50 });
  for (const r of done) console.log(`${r.outcome.toUpperCase()} ${r.job_id} (${r.detail})`);
  console.log(`${done.filter((r) => r.outcome === "ready").length} of ${done.length} prepared before they asked; nothing was sent.`);
  if (draftModel) console.log(`model calls for cover letters: ${meter.calls} (${meter.failed} failed), $${(meter.usd_micros / 1e6).toFixed(4)}${meter.unpriced ? `, ${meter.unpriced} unpriced` : ""}`);
}
