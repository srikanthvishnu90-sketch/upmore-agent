// trainee-file: the hosted file pages (job match file, application proof file). Tests: tests/architect/file-page.test.ts.
//
// Access is a signed, expiring, single-user token (../_shared/file_link.ts) that the bot issues after the person's linked
// channel identity is known. Every read is scoped to the user id inside the signed claims. GET shows; only a POST with the
// token acts, and Apply on its own never sends: it shows the exact payload, and Confirm is the hash-bound approval (D-MS-1),
// run through the same tapJob/tapCard path as Telegram's Confirm button (the hash is re-read at the tap).
import { fileUrlFor, mintFileToken, verifyFileToken, type FileClaims } from "../_shared/file_link.ts";
import { blockedByHand, esc, factsOf, fullPostingOf, renderLinkState, renderMatch, renderMessage, renderProof, renderReview, renderText, statusOf, type AppRow, type Model } from "../_shared/file_page.ts";
import { hashTag, logoUrl, payloadLines, requirementsOf, tapJob, type JobDeps, type JobSender, type JobStore, type JobView, type PostingRow } from "../_shared/telegram_jobs.ts";

export type { AppRow } from "../_shared/file_page.ts";
export interface FileStore extends JobStore {
  pass(userId: string, ref: string, at: number): Promise<"passed" | "already">;
  passed(userId: string, ref: string): Promise<boolean>;
  appRow(userId: string, jobId: string): Promise<AppRow | null>; // this person's application row for the posting (career_apply_jobs)
  wanted(userId: string, url: string): Promise<boolean>; // queued to be prepared (career_apply_wanted)
}
export interface FileDeps extends Omit<JobDeps, "store"> { store: FileStore }

const SEC = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; img-src https:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" };
const html = (body: string, status = 200) => new Response(body, { status, headers: { ...SEC, "content-type": "text/html; charset=utf-8" } });
const text = (body: string, status = 200) => new Response(body, { status, headers: { ...SEC, "content-type": "text/plain; charset=utf-8" } });
const EXPIRED = "Ask Trainee in Telegram for the job again and tap Open file on the new card.";

async function load(claims: FileClaims, token: string, d: FileDeps): Promise<Model | null> {
  const got = await d.store.recall(claims.u, claims.r).catch(() => null);
  if (!got) return null;
  const rows = await d.store.postings([got.job.job_id]).catch(() => [] as PostingRow[]);
  const row = rows.find((r) => r.job_id === got.job.job_id) ?? null;
  const [passed, app, prep] = await Promise.all([
    d.store.passed(claims.u, claims.r).catch(() => false),
    d.store.appRow(claims.u, got.job.job_id).catch(() => null),
    d.store.prepared(claims.u, got.job.job_id).catch(() => null),
  ]);
  const wanted = app || prep ? false : await d.store.wanted(claims.u, got.job.url).catch(() => false);
  const job: JobView = { ...got.job, company_domain: got.job.company_domain ?? row?.company_domain ?? null };
  const req = requirementsOf(row?.description);
  const proofToken = app ? await mintFileToken({ secret: d.env.get("TRAINEE_FILE_LINK_SECRET"), userId: claims.u, ref: claims.r, kind: "proof", now: d.now() }) : null;
  const sent = app ? payloadLines({ id: app.id, job_id: job.job_id, company: app.company, url: app.url, payload: app.payload ?? {}, payload_hash: "", card_lines: [], state: app.state }, job)
    .filter((l) => l && !/^Application for your approval$|^Nothing is sent until you tap/.test(l)) : [];
  return {
    job, kind: claims.k, token, proofToken, logo: logoUrl(job, d.env), facts: factsOf(job, row, d.now()),
    reasons: job.reasons.slice(0, 3), gaps: job.gaps.slice(0, 2),
    requirements: req?.label === "Requirements" ? req.text : null, fullPosting: fullPostingOf(row),
    status: statusOf({ app, wanted, prepared: !!prep }), passed, hasApp: !!app, byHand: blockedByHand(job.url), hasPrepared: !!prep, app, sent,
  };
}

export async function handleFile(req: Request, d: FileDeps): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "POST") return html(renderLinkState("Not supported", ["This page only opens and answers."]), 405);
  const url = new URL(req.url);
  let fields: URLSearchParams = url.searchParams;
  if (req.method === "POST") {
    try { fields = new URLSearchParams(await req.text()); } catch { fields = new URLSearchParams(); }
  }
  const token = fields.get("t") ?? "";
  const check = await verifyFileToken(token, d.env.get("TRAINEE_FILE_LINK_SECRET"), d.now());
  if (!check.ok) {
    if (check.why === "not_configured") return html(renderLinkState("Files are not set up yet", ["Trainee's file pages are not switched on yet, so nothing can be opened. Nothing was sent."]), 503);
    if (check.why === "expired") return html(renderLinkState("This link has expired", ["Links last a day so a forwarded one stops working. " + EXPIRED]), 410);
    return html(renderLinkState("This link isn't valid", ["It may be cut short or changed. " + EXPIRED]), 403);
  }
  const claims = check.claims;
  const m = await load(claims, token, d);
  if (!m) return html(renderLinkState("This file is gone", ["It is no longer available. " + EXPIRED]), 404);

  if (req.method !== "POST") {
    if (claims.k === "proof" && !m.app) return html(renderMessage({ m, eyebrow: "Application proof file", paras: ["There is no application on record for this posting, so there is no proof to show. Nothing was sent."] }), 404);
    if (fields.get("format") === "text") return text(renderText(m));
    return req.method === "HEAD" ? html("") : html(claims.k === "proof" ? renderProof(m) : renderMatch(m));
  }

  // ---- actions: POST only, match files only
  const action = fields.get("action") ?? "";
  if (claims.k !== "match" || !["pass", "apply", "confirm"].includes(action)) return html(renderMessage({ m, eyebrow: "Not done", paras: ["That is not something this page can do. Nothing was sent."] }), 400);
  const { u, r } = claims;

  if (action === "pass") {
    const res = await d.store.pass(u, r, d.now()).catch(() => null);
    if (!res) return html(renderMessage({ m, eyebrow: "Not saved", paras: ["I couldn't save that just now. Nothing was sent. Try again in a minute."] }), 503);
    return html(renderMessage({ m, eyebrow: "Passed", paras: [`${res === "already" ? "You had already passed." : "Passed."} Nothing was sent for ${m.job.title ? `${m.job.title} at ` : ""}${m.job.company}.`] }));
  }

  if (action === "apply") {
    if (m.byHand) return html(renderMessage({ m, eyebrow: "Apply there yourself", paras: ["I don't apply on LinkedIn, Indeed or Handshake for you. Open the posting and apply there yourself: " + m.job.url] }));
    if (m.hasApp) return html(renderMessage({ m, eyebrow: "Already in your applications", status: m.status, paras: ["This posting is already in your applications, so I won't queue it twice."] }));
    const prep = await d.store.prepared(u, m.job.job_id).catch(() => null);
    if (!prep) {
      const w = await d.store.want(u, m.job, d.now()).catch(() => ({ result: "refused" as const, reason: "I couldn't save that just now. Press Apply again in a minute." }));
      if (w.result === "refused") return html(renderMessage({ m, eyebrow: "Not queued", paras: [`Not queued: ${w.reason ?? "I can't open that posting's application form yet."}`] }));
      return html(renderMessage({ m, eyebrow: "Queued to prepare", status: { word: "preparing", detail: "Queued to be prepared. Nothing has been sent." }, paras: [`${m.job.title ? `${m.job.title} at ` : ""}${m.job.company} is queued to be prepared. I haven't prepared this application yet, so there is nothing to approve and nothing has gone to the employer. When it is ready, open this file again to see the exact application and Confirm it.`] }));
    }
    // The payload shown and the tag on Confirm come from this one read; Confirm re-reads and refuses any other hash.
    const lines = payloadLines(prep, m.job).filter((l) => !/^Application for your approval$|^Nothing is sent until you tap/.test(l));
    return html(renderReview(m, lines, hashTag(prep.payload_hash)));
  }

  // confirm: the hash-bound approval, through the Telegram Confirm path
  const tag = fields.get("tag") ?? "";
  if (!/^[0-9a-f]{16}$/.test(tag)) return html(renderMessage({ m, eyebrow: "Not confirmed", paras: ["Nothing was approved: this Confirm doesn't say which application it is for. Press Apply on the file to see it again."] }), 400);
  const said: string[] = [];
  const send: JobSender = { photo: async () => ({ ok: true }), text: async (a) => { said.push(a.text); return { ok: true, id: null }; } };
  const res = await tapJob({ userId: u, data: `jcy:${r}:${tag}`, messageId: null, deps: d, send });
  if (res.status === "confirmed") {
    const fresh = await d.store.appRow(u, m.job.job_id).catch(() => null);
    const st = fresh ? statusOf({ app: fresh, wanted: false, prepared: false }) : { word: "queued" as const, detail: "You approved it. It waits for the apply worker and is not submitted yet." };
    return html(renderMessage({ m, eyebrow: "Confirmed", status: st, paras: [`Confirmed: ${m.job.title ? `${m.job.title} at ` : ""}${m.job.company}, exactly as shown. It goes to the employer only when the apply worker runs it, and I'll tell you what comes back. Nothing has been submitted yet.`] }));
  }
  return html(renderMessage({ m, eyebrow: "Nothing approved", paras: said.length ? said : ["Nothing was approved."] }), res.status === "changed" ? 409 : 200);
}

export { fileUrlFor, esc };
