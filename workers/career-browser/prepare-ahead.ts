// Backend gap map G4 (D-011): an application is prepared before the person asks. The server's caller of the queue
// path's preparation: for each posting the person's job alerts already sent them (career_apply_prepare_candidates), the
// engine's dry run (scripts/apply.ts, which plans the form with career_apply.ts planBatch) on the employer's page, with
// the person's own confirmed answers and the resume tailored to this posting, stored as the prepared application their
// card reads (career_apply_prepare_for). A posting that asks what no confirmed fact answers is asked of them once
// (career_apply_prepare_ask_for). Nothing is approved, queued or sent here: the card, and the person's one text, decide.
//
// The facts: only what the trust contract keeps (extension/src/apply_core.ts trustedManifest, WO-102). Here that is the
// person's own answers to questions they were asked (career_apply_answers_for) and, when a profile reader is given, the
// confirmed facts of their profile, by the same projection the extension uses. Nothing else is a fact.
// The resume: the one tailored to this posting from their confirmed facts (career_tailor.ts tailorForPosting: truth
// audit, render, ATS parse), stored privately at career-resumes/<user_id>/<sha256>.pdf and bound into the payload by its
// hash, with resume_tailored (career_apply_resume_tag marks the queued job tailored only when that exact file is stored).
// A posting it cannot tailor for is not prepared (no_resume): nothing goes out with a resume the person did not get.
// Every try is recorded (career_apply_prepare_attempt_for), so a posting is retried once a week at most, or as soon as
// the questions it stopped on are answered.
//
// Usage (the worker host, the service role; never on a schedule from here):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno run -A workers/career-browser/prepare-ahead.ts once [--limit N]
import { engineFacts, engineRunner, prepare, questionsToStore, type ResumeTag, type RunEngine, type TextAnswer } from "./approve-first.ts";
import { trustedManifest } from "../../extension/src/apply_core.ts";
import { type ResumeStore, tailorForPosting, type TailorDeps } from "../../supabase/functions/_shared/career_tailor.ts";

export interface Candidate {
  user_id: string; job_id: string; company: string; title: string; url: string; location: string; description: string;
  epoch: number; version: number;
}
export interface ServiceRpc { rpc: (name: string, args?: any) => PromiseLike<{ data: any; error: { message: string } | null }> }
export interface PreparedResume { path: string; sha256: string; tag: ResumeTag | null }
export interface AheadDeps {
  db: ServiceRpc; // the service role
  runEngine: RunEngine;
  // The resume tailored to this posting, written to a file in dir; null when it cannot be tailored.
  resumeFor: (c: Candidate, dir: string) => Promise<PreparedResume | null>;
  // The person's stored profile (its confirmed facts join the trusted facts); absent: only their answers count.
  profileFor?: (userId: string) => Promise<any | null>;
  // The link the engine opens. Production: the posting's own. Tests point an https posting at a local employer page.
  urlFor?: (c: Candidate) => string;
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
      const profile = d.profileFor ? await d.profileFor(c.user_id) : null;
      const file = { user_id: c.user_id, answers: {}, saved: {}, ...(profile && Array.isArray(profile.facts) ? { facts: profile.facts } : {}) };
      const merged = engineFacts(file, rows);
      const trusted = trustedManifest({ owner: c.user_id, file: merged, rows, resume: null }).answers;
      const factsPath = `${dir}/facts.json`;
      await Deno.writeTextFile(factsPath, JSON.stringify(merged), { mode: 0o600 });
      const resume = await d.resumeFor(c, dir);
      if (!resume) { await record("no_resume", "no resume could be tailored to this posting from their confirmed facts"); continue; }
      const r = await prepare({
        url: d.urlFor ? d.urlFor(c) : c.url, factsPath, resumePath: resume.path, account: { epoch: Number(c.epoch), version: Number(c.version) },
        now: now(), runEngine: d.runEngine, resumeTag: resume.tag,
      });
      if (!r.ready) {
        const result: any = r.result;
        const ask = result.reason === "needs_answers" ? questionsToStore(result, { facts: trusted, answered: new Set(rows.map((x) => x.key)) }) : null;
        if (ask?.questions.length) {
          const n = must(await d.db.rpc("career_apply_prepare_ask_for", {
            p_user: c.user_id, p_posting_job_id: c.job_id, p_engine_job_id: ask.posting, p_questions: ask.questions,
          }), "store the questions");
          out.push({ user_id: c.user_id, job_id: c.job_id, outcome: "asked", detail: `${n} question(s) asked` });
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

// The resume tailored to the posting (WO-028, career_tailor.ts), the bytes kept as they were stored so the engine sends
// exactly the stored file. Production: supabaseResumeStore(admin) and edgeRenderer(); the store's put is what makes the
// file "one Trainee stored for this person", which career_apply_resume_tag checks before calling the job tailored.
export function tailoredResume(o: { profileFor: (userId: string) => Promise<any | null>; render: TailorDeps["render"]; resumes: ResumeStore; now?: () => number }) {
  return async (c: Candidate, dir: string): Promise<PreparedResume | null> => {
    const profile = await o.profileFor(c.user_id);
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

// The profile the chat keeps for the person (the 122 master in agent_flow_state), as extension-sync reads it.
// deno-lint-ignore no-explicit-any
export function storedProfile(admin: any) {
  return async (userId: string): Promise<any | null> => {
    const r = await admin.from("agent_flow_state").select("state").eq("user_id", userId);
    if (r.error || !Array.isArray(r.data)) return null;
    for (const row of r.data) {
      const p = row?.state?.career?.stores?.profile;
      if (p && typeof p === "object" && (p.basics || p.facts)) return { ...p, user_id: userId };
    }
    return null;
  };
}

if (import.meta.main) {
  const [cmd, ...rest] = Deno.args;
  if (cmd !== "once") {
    console.error("usage: prepare-ahead.ts once [--limit N]   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment)");
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
  const done = await prepareAhead({
    db: admin, runEngine: engineRunner({ root }), profileFor,
    resumeFor: tailoredResume({ profileFor, render: edgeRenderer(), resumes: supabaseResumeStore(admin) }),
  }, { limit: Number.isInteger(limit) && limit > 0 ? limit : 50 });
  for (const r of done) console.log(`${r.outcome.toUpperCase()} ${r.job_id} (${r.detail})`);
  console.log(`${done.filter((r) => r.outcome === "ready").length} of ${done.length} prepared before they asked; nothing was sent.`);
}
