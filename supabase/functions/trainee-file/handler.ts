// trainee-file: the hosted jobs list page. Tests: tests/architect/file-page.test.ts.
//
// Login is Telegram's own identity: a Mini App opened by the bot's web_app button carries signed initData (HMAC with the bot
// token), which is checked here and mapped to the linked Trainee account; or the signed, expiring, single-user link the bot
// sends (../_shared/file_link.ts). Every read is scoped to the user id of the verified identity.
//
// The Apply tap IS the approval: it carries the first 16 hex of the payload hash shown for that row, the payload is read again
// at the tap, and a payload that changed since the page was drawn is refused with a refresh prompt (D-MS-1). The approval runs
// through tapJob's Confirm (the same path as Telegram's Confirm button: cards.open then tapCard, once). "Apply to all" carries
// the hash of the exact set shown; it approves nothing unless the set is still exactly that.
import { FILE_TTL_MS, mintFileToken, SESSION_TTL_MS, verifyFileToken, type FileClaims } from "../_shared/file_link.ts";
import { verifyInitData } from "../_shared/telegram_webapp.ts";
import { BOOT_SCRIPT, FEED_SCRIPT, fullOf, hostOf, renderBootstrap, renderFeed, renderLinkState, renderText, snippetOf, statusOf, type AppRow, type Feed, type Row } from "../_shared/file_page.ts";
import { BLOCKED_HOST, hashTag, logoUrl, tapJob, type JobDeps, type JobSender, type JobStore, type PostingRow, type PreparedRow } from "../_shared/telegram_jobs.ts";

export type { AppRow } from "../_shared/file_page.ts";
export interface FileStore extends JobStore {
  appRow(userId: string, jobId: string): Promise<AppRow | null>; // this person's application row for the posting (career_apply_jobs)
  wanted(userId: string, url: string): Promise<boolean>; // queued to be prepared (career_apply_wanted)
}
export interface FileDeps extends Omit<JobDeps, "store"> {
  store: FileStore;
  userOfTelegram?: (telegramId: string) => Promise<string | null>; // channel_contacts: 'tg:<id>' -> the linked account
}
export const MAX_ROWS = 30;

const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const b64 = (h: string) => btoa(h.match(/../g)!.map((x) => String.fromCharCode(parseInt(x, 16))).join(""));
const scriptHashes = (async () => `'sha256-${b64(await sha(FEED_SCRIPT))}' 'sha256-${b64(await sha(BOOT_SCRIPT))}'`)();
async function headers(type: string): Promise<Record<string, string>> {
  return { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff", "content-type": type,
    "content-security-policy": `default-src 'none'; script-src ${await scriptHashes}; connect-src 'self'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'` };
}
const html = async (body: string, status = 200) => new Response(body, { status, headers: await headers("text/html; charset=utf-8") });
const text = async (body: string, status = 200) => new Response(body, { status, headers: await headers("text/plain; charset=utf-8") });
const NEW_LINK = "Ask Trainee in Telegram for your jobs again and open the new link.";

const resumeOf = (p: PreparedRow | null): string | null => {
  if (!p) return null;
  const name = String((p.payload as Record<string, unknown>)?.resume_name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (name) return name;
  const s = String((p.payload as Record<string, unknown>)?.resume_sha256 ?? "");
  return /^[a-f0-9]{64}$/.test(s) ? `resume ${s.slice(0, 12)}` : null;
};
const byHandOf = (url: string) => { try { return BLOCKED_HOST.test(new URL(url).hostname); } catch { return false; } };

async function loadFeed(claims: FileClaims, token: string, d: FileDeps, notes: Record<string, string> = {}, top?: string): Promise<Feed | null> {
  const refs = ((await d.store.recallList(claims.u, claims.r).catch(() => null)) ?? []).slice(0, MAX_ROWS);
  const got = (await Promise.all(refs.map(async (ref) => ({ ref, c: await d.store.recall(claims.u, ref).catch(() => null) })))).filter((x) => x.c);
  if (!got.length) return null;
  const postings = await d.store.postings(got.map((x) => x.c!.job.job_id)).catch(() => [] as PostingRow[]);
  const rows: Row[] = await Promise.all(got.map(async ({ ref, c }) => {
    const job = { ...c!.job }, post = postings.find((p) => p.job_id === job.job_id) ?? null;
    job.company_domain = job.company_domain ?? post?.company_domain ?? null;
    const [app, prep] = await Promise.all([d.store.appRow(claims.u, job.job_id).catch(() => null), d.store.prepared(claims.u, job.job_id).catch(() => null)]);
    const wanted = app || prep ? false : await d.store.wanted(claims.u, job.url).catch(() => false);
    return { ref, job, logo: logoUrl(job, d.env), snippet: snippetOf(job, post?.description), full: fullOf(post?.description),
      status: statusOf({ app, wanted }), tag: prep ? hashTag(prep.payload_hash) : null, resume: resumeOf(prep), byHand: byHandOf(job.url), note: notes[ref] };
  }));
  // The set "Apply to all" approves: the rows that can be approved right now, with the exact payload tag each shows.
  const set = rows.filter((r) => !r.status && !r.byHand && r.tag);
  const setHash = set.length ? (await sha(`v1|${set.map((r) => `${r.ref}:${r.tag}`).join(",")}`)).slice(0, 16) : null;
  return { token, rows, setHash, setSize: set.length, top };
}

// One Apply = one hash-bound approval through the Telegram Confirm path. Returns a note for the row when it did not go.
async function approveOne(u: string, ref: string, tag: string, d: FileDeps): Promise<string | null> {
  const said: string[] = [];
  const send: JobSender = { photo: async () => ({ ok: true }), text: async (a) => { said.push(a.text); return { ok: true, id: null }; } };
  const res = await tapJob({ userId: u, data: `jcy:${ref}:${tag}`, messageId: null, deps: d, send });
  if (res.status === "confirmed") return null;
  if (res.status === "changed") return "Changed since you opened this page, so nothing was sent.";
  if (res.status === "duplicate") return "Already in your applications.";
  return (said[0] ?? "Nothing was approved.").slice(0, 160);
}

export async function handleFile(req: Request, d: FileDeps): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "POST") return html(renderLinkState("Not supported", ["This page only opens and answers."]), 405);
  const url = new URL(req.url);
  let fields: URLSearchParams = url.searchParams;
  if (req.method === "POST") { try { fields = new URLSearchParams(await req.text()); } catch { fields = new URLSearchParams(); } }
  const botUrl = (d.env.get("TRAINEE_BOT_URL") || "").trim();
  const bot = /^https:\/\//.test(botUrl) ? botUrl : null;
  const secret = d.env.get("TRAINEE_FILE_LINK_SECRET");
  const state = (title: string, paras: string[], status: number) => html(renderLinkState(title, paras, bot), status);

  let token = fields.get("t") ?? "";
  if (!token) {
    const list = fields.get("list") ?? "";
    if (!/^[0-9a-f]{10}$/.test(list)) return state("This link isn't valid", ["It may be cut short or changed. " + NEW_LINK], 403);
    if (req.method !== "POST" || !fields.get("init")) return html(renderBootstrap(list)); // the Mini App page: reads Telegram's signed data and posts it back
    // Mini App login: Telegram's signed initData, then the account that Telegram identity is linked to.
    const init = await verifyInitData(fields.get("init"), d.env.get("TELEGRAM_BOT_TOKEN"), d.now());
    if (!init.ok) {
      if (init.why === "not_configured") return state("Sign-in isn't set up yet", ["Telegram sign-in isn't switched on yet, so nothing can be opened. Nothing was sent."], 503);
      if (init.why === "stale") return state("This sign-in has expired", ["Close this screen and open the list again from Telegram."], 410);
      return state("Telegram couldn't verify this sign-in", ["Nothing was opened. Open the list again from the button in Telegram."], 403);
    }
    const user = d.userOfTelegram ? await d.userOfTelegram(init.telegramId).catch(() => null) : null;
    if (!user) return state("This Telegram account isn't linked", ["Share your phone number with Trainee in the Telegram chat first, then open the list again."], 403);
    const minted = await mintFileToken({ secret, userId: user, list, now: d.now(), ttlMs: SESSION_TTL_MS });
    if (!minted) return state("Sign-in isn't set up yet", ["The page's link signing isn't switched on yet, so nothing can be opened."], 503);
    token = minted;
  }

  const check = await verifyFileToken(token, secret, d.now());
  if (!check.ok) {
    if (check.why === "not_configured") return state("Links aren't set up yet", ["The jobs page isn't switched on yet, so nothing can be opened. Nothing was sent."], 503);
    if (check.why === "expired") return state("This link has expired", ["Links last a day so a forwarded one stops working. " + NEW_LINK], 410);
    return state("This link isn't valid", ["It may be cut short or changed. " + NEW_LINK], 403);
  }
  const claims = check.claims;
  const { u } = claims;
  const action = req.method === "POST" ? (fields.get("action") ?? "") : "";
  const notes: Record<string, string> = {};
  let top: string | undefined;

  if (action) {
    if (!["apply", "applyall"].includes(action)) return state("Not done", ["That is not something this page can do. Nothing was sent."], 400);
    const refs = (await d.store.recallList(u, claims.r).catch(() => null)) ?? [];
    if (action === "apply") {
      const ref = fields.get("ref") ?? "", tag = fields.get("tag") ?? "";
      if (!refs.includes(ref)) return state("This job isn't on your list", ["It is no longer on your list. " + NEW_LINK], 404);
      const cur = await loadFeed(claims, token, d);
      const row = cur?.rows.find((r) => r.ref === ref);
      if (!row) return state("This job isn't on your list", [NEW_LINK], 404);
      if (row.status) { /* already in motion: the row shows its word, nothing more to do */ }
      else if (row.byHand) notes[ref] = "Not applied for automatically on this site. Open it and apply there yourself.";
      else if (tag === "none" && !row.tag) {
        const w = await d.store.want(u, row.job, d.now()).catch(() => ({ result: "refused" as const, reason: "I couldn't save that just now." }));
        if (w.result === "refused") notes[ref] = `Not queued: ${w.reason ?? "I can't open that posting's application form yet."}`;
      } else if (!/^[0-9a-f]{16}$/.test(tag) || tag !== row.tag) {
        notes[ref] = "Changed since you opened this page, so nothing was sent.";
      } else {
        const n = await approveOne(u, ref, tag, d);
        if (n) notes[ref] = n;
      }
    } else {
      // Apply to all: exactly the set that was shown. If the set is not the same now, nothing is approved.
      const cur = await loadFeed(claims, token, d);
      const posted = fields.get("set") ?? "";
      if (!cur || !cur.setHash || posted !== cur.setHash) top = "This list changed since you opened it, so nothing was approved.";
      else {
        for (const r of cur.rows.filter((x) => !x.status && !x.byHand && x.tag)) {
          const n = await approveOne(u, r.ref, r.tag!, d);
          if (n) notes[r.ref] = n;
        }
        const failed = Object.keys(notes).length;
        if (failed) top = `${failed} of ${cur.setSize} were not approved; each says why.`;
      }
    }
  }

  const feed = await loadFeed(claims, token, d, notes, top);
  if (!feed) return state("This list is gone", ["It is no longer available. " + NEW_LINK], 404);
  if (req.method === "GET" && fields.get("format") === "text") return text(renderText(feed));
  return html(renderFeed(feed));
}
export { FILE_TTL_MS, hostOf };
