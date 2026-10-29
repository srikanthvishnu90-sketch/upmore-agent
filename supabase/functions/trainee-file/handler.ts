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
import { BOOT_SCRIPT, FEED_SCRIPT, fullOf, hostOf, renderBootstrap, renderFeed, renderLinkState, renderPreview, renderText, snippetOf, statusOf, type AppRow, type Feed, type Row } from "../_shared/file_page.ts";
import { dayOf } from "../_shared/file_page.ts";
import { BLOCKED_HOST, hashTag, logoDomain, logoUrl, screenedOut, tapJob, type JobDeps, type JobSender, type JobStore, type JobView, type PostingRow, type PreparedRow } from "../_shared/telegram_jobs.ts";

export type { AppRow } from "../_shared/file_page.ts";
export interface FileStore extends JobStore {
  appRow(userId: string, jobId: string): Promise<AppRow | null>; // this person's application row for the posting (career_apply_jobs)
  wanted(userId: string, url: string): Promise<boolean>; // queued to be prepared (career_apply_wanted)
  claimLink(userId: string, jti: string, at: number): Promise<boolean>; // true only the first time a link token id is taken
}
export interface FileDeps extends Omit<JobDeps, "store"> {
  store: FileStore;
  userOfTelegram?: (telegramId: string) => Promise<string | null>; // channel_contacts: 'tg:<id>' -> the linked account
}
export const MAX_ROWS = 30;

const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const b64 = (h: string) => btoa(h.match(/../g)!.map((x) => String.fromCharCode(parseInt(x, 16))).join(""));
const scriptHashes = (async () => `'sha256-${b64(await sha(FEED_SCRIPT))}' 'sha256-${b64(await sha(BOOT_SCRIPT))}'`)();
// frame-ancestors: Telegram's own web clients only (the Mini App is a frame inside web.telegram.org); nothing else may frame the page.
// img-src: the logo provider's origin only (computed from config), never every https host.
const FRAMES = "https://web.telegram.org https://*.telegram.org";
function logoOrigins(env: { get(k: string): string | undefined }): string {
  const tpl = (env.get("TRAINEE_LOGO_URL") || "").trim() || "https://www.google.com/s2/favicons?sz=128&domain={domain}";
  let origin = "";
  try { const u = new URL(tpl.split("{domain}").join("example.com")); if (u.protocol === "https:") origin = u.origin; } catch { /* no logo provider */ }
  return [origin, origin.includes("google.com") ? "https://*.gstatic.com" : ""].filter(Boolean).join(" ");
}
async function headers(type: string, env: { get(k: string): string | undefined }): Promise<Record<string, string>> {
  return { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff", "content-type": type,
    "content-security-policy": `default-src 'none'; script-src ${await scriptHashes} https://telegram.org; connect-src 'self'; img-src ${logoOrigins(env) || "'none'"}; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; form-action 'self'; base-uri 'none'; frame-ancestors ${FRAMES}` };
}
const NEW_LINK = "Ask Trainee in Telegram for your jobs again and open the new link.";

const resumeOf = (p: PreparedRow | null): string | null => {
  if (!p) return null;
  const name = String((p.payload as Record<string, unknown>)?.resume_name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (name) return name;
  const s = String((p.payload as Record<string, unknown>)?.resume_sha256 ?? "");
  return /^[a-f0-9]{64}$/.test(s) ? `resume ${s.slice(0, 12)}` : null;
};
const byHandOf = (url: string) => { try { return BLOCKED_HOST.test(new URL(url).hostname); } catch { return false; } };

// Key details: only what the posting (or the search result) states. A part from the stored posting is "From the posting"; if any part
// came only from the search result the line says "Reported, not verified". Nothing unstated is shown.
function metaOf(job: JobView, post: PostingRow | null): { meta: string; metaSrc: "From the posting" | "Reported, not verified" | null } {
  const parts: string[] = []; let reported = false;
  const take = (fromPost: unknown, fromHit: unknown) => { if (fromPost) parts.push(String(fromPost)); else if (fromHit) { parts.push(String(fromHit)); reported = true; } };
  take(post?.location, job.location);
  take(post?.pay, job.pay);
  const dl = post?.deadline ?? job.deadline;
  if (dl && dayOf(dl)) { parts.push(`Apply by ${dayOf(dl)}`); if (!post?.deadline) reported = true; }
  if (job.source) parts.push(job.source);
  return { meta: parts.join(" · "), metaSrc: parts.length ? (reported ? "Reported, not verified" : "From the posting") : null };
}

const ogImage = (env: { get(k: string): string | undefined }) => { const b = (env.get("TRAINEE_FILE_BASE_URL") || "").trim(); return /^https:\/\//.test(b) ? `${new URL(b).origin}/og-file.png` : null; };
const SECRETISH = /pass(word)?|secret|token|otp|one[- ]?time|ssn|social security|card number|\bpin\b|passport|driver'?s? licen[sc]e|national id/i;
// Every value the application will send, from the real payload the hash covers: the resume, each field, the cover note, the
// page-set fields and the destination. A field that looks like a secret is shown as "Needs you" and makes the row unapprovable here.
function sendOf(p: PreparedRow): { items: { label: string; value: string; needs?: boolean }[]; secret: string | null } {
  const pl = (p.payload ?? {}) as Record<string, unknown>;
  const items: { label: string; value: string; needs?: boolean }[] = [];
  let secret: string | null = null;
  const sha = String(pl.resume_sha256 ?? "");
  items.push({ label: "Resume", value: resumeOf(p) ?? "none attached" });
  // deno-lint-ignore no-explicit-any
  for (const f of (Array.isArray(pl.fields) ? pl.fields : []) as any[]) {
    const label = String(f?.label ?? f?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || "Field";
    const value = String(f?.value ?? "").replace(/\s+/g, " ").trim();
    if (SECRETISH.test(`${f?.name ?? ""} ${f?.label ?? ""}`)) { items.push({ label, value: "", needs: true }); secret ??= label; continue; }
    if (/file/i.test(String(f?.type ?? "")) || (sha && value === sha)) continue; // the resume line above
    items.push({ label, value: value.slice(0, 500) || "(empty)" });
  }
  const cover = pl.cover_note && typeof pl.cover_note === "object" ? String((pl.cover_note as Record<string, unknown>).text ?? "").trim() : "";
  if (cover) items.push({ label: "Cover note", value: cover.slice(0, 1500) });
  const pageFields = Array.isArray(pl.page_field_names) ? pl.page_field_names.map(String).slice(0, 30) : [];
  if (pageFields.length) items.push({ label: "Also sent, set by the employer's page, unchanged", value: pageFields.join(", ") });
  const dest = String(pl.destination ?? p.url ?? "");
  if (dest) items.push({ label: "Sends to", value: hostOf(dest) || dest.slice(0, 120) });
  return { items, secret };
}
// The logo only from the employer's own domain, through the configured provider, https only; the CSP allows that provider's origin only.
function rowLogo(job: JobView, env: { get(k: string): string | undefined }): string | null {
  const dom = logoDomain(job, env), u = logoUrl(job, env);
  if (!dom || !u) return null;
  try {
    const x = new URL(u), allowed = logoOrigins(env).split(" ").filter(Boolean)[0];
    return x.protocol === "https:" && x.origin === allowed && u.includes(encodeURIComponent(dom)) ? u : null;
  } catch { return null; }
}

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
    const sd = prep ? sendOf(prep) : null;
    const status = statusOf({ app, wanted }) ?? (sd?.secret ? { word: "needs you" as const, detail: `"${sd.secret}" needs you. I never send a password, code or ID number from here; tell Trainee in Telegram.` } : null);
    return { ref, job, logo: rowLogo(job, d.env), snippet: snippetOf(job, post?.description), full: fullOf(post?.description),
      status, tag: prep && !sd?.secret ? hashTag(prep.payload_hash) : null, resume: resumeOf(prep), byHand: byHandOf(job.url), note: notes[ref], ...metaOf(job, post), why: job.reasons.slice(0, 2),
      sends: sd && !sd.secret ? `Sends: ${resumeOf(prep) ?? "your resume"} + your saved answers` : undefined, send: sd?.items };
  }));
  // The set "Apply to all" approves: the rows that can be approved right now, with the exact payload tag each shows.
  const set = rows.filter((r) => !r.status && !r.byHand && r.tag);
  const setHash = set.length ? (await sha(`v1|${set.map((r) => `${r.ref}:${r.tag}`).join(",")}`)).slice(0, 16) : null;
  const n = rows.length;
  // The preview card is the brand card (static, nothing about the person in a public image) plus counts the page itself shows.
  const og = { title: `${n} match${n === 1 ? "" : "es"} for you`, description: "Tap Apply on any job. Opens in Trainee.", image: ogImage(d.env) };
  return { token, rows, setHash, setSize: set.length, top, og };
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

const CRAWLER = /TelegramBot|Twitterbot|facebookexternalhit|Slackbot|WhatsApp|Discordbot|LinkedInBot/i;
const cookieOf = (req: Request, name: string) => {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) { const [k, ...v] = part.trim().split("="); if (k === name) return v.join("="); }
  return "";
};

export async function handleFile(req: Request, d: FileDeps): Promise<Response> {
  const html = async (body: string, status = 200, extra: Record<string, string> = {}) => new Response(body, { status, headers: { ...(await headers("text/html; charset=utf-8", d.env)), ...extra } });
  const text = async (body: string, status = 200) => new Response(body, { status, headers: await headers("text/plain; charset=utf-8", d.env) });
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "POST") return html(renderLinkState("Not supported", ["This page only opens and answers."]), 405);
  const url = new URL(req.url);
  let fields: URLSearchParams = url.searchParams;
  if (req.method === "POST") { try { fields = new URLSearchParams(await req.text()); } catch { fields = new URLSearchParams(); } }
  const botUrl = (d.env.get("TRAINEE_BOT_URL") || "").trim();
  const bot = /^https:\/\//.test(botUrl) ? botUrl : null;
  const secret = d.env.get("TRAINEE_FILE_LINK_SECRET");
  const state = (title: string, paras: string[], status: number) => html(renderLinkState(title, paras, bot), status);
  const bad = (why: string) => why === "not_configured" ? state("Links aren't set up yet", ["The jobs page isn't switched on yet, so nothing can be opened. Nothing was sent."], 503)
    : why === "expired" ? state("This link has expired", ["Links last a day so a forwarded one stops working. " + NEW_LINK], 410)
    : state("This link isn't valid", ["It may be cut short or changed. " + NEW_LINK], 403);

  let token = "";
  const given = fields.get("t") ?? "";
  if (req.method === "POST") {
    if (given) token = given; // a session token in a form field (never the single-use link)
    else {
      const list = fields.get("list") ?? "";
      if (!/^[0-9a-f]{10}$/.test(list) || !fields.get("init")) return state("This link isn't valid", ["It may be cut short or changed. " + NEW_LINK], 403);
      // Mini App login: Telegram's signed initData, then the account that Telegram identity is linked to.
      const init = await verifyInitData(fields.get("init"), d.env.get("TELEGRAM_BOT_TOKEN"), d.now());
      if (!init.ok) {
        if (init.why === "not_configured") return state("Sign-in isn't set up yet", ["Telegram sign-in isn't switched on yet, so nothing can be opened. Nothing was sent."], 503);
        if (init.why === "stale") return state("This sign-in has expired", ["Close this screen and open the list again from Telegram."], 410);
        return state("Telegram couldn't verify this sign-in", ["Nothing was opened. Open the list again from the button in Telegram."], 403);
      }
      const user = d.userOfTelegram ? await d.userOfTelegram(init.telegramId).catch(() => null) : null;
      if (!user) return state("This Telegram account isn't linked", ["Share your phone number with Trainee in the Telegram chat first, then open the list again."], 403);
      const minted = await mintFileToken({ secret, userId: user, list, now: d.now(), ttlMs: SESSION_TTL_MS, kind: "s" });
      if (!minted) return state("Sign-in isn't set up yet", ["The page's link signing isn't switched on yet, so nothing can be opened."], 503);
      token = minted;
    }
  } else if (given) {
    // The fallback link: taken ONCE, exchanged for an HttpOnly session cookie, then redirected to a clean URL. The token never stays in a URL.
    const c = await verifyFileToken(given, secret, d.now());
    if (!c.ok) return bad(c.why);
    if (c.claims.k !== "l") return bad("malformed");
    if (CRAWLER.test(req.headers.get("user-agent") ?? "")) {
      // A link preview fetch must not use up the link: it gets the preview tags and nothing about any job.
      const n = ((await d.store.recallList(c.claims.u, c.claims.r).catch(() => null)) ?? []).length;
      return html(renderPreview({ title: `${n} match${n === 1 ? "" : "es"} for you`, description: "Tap Apply on any job. Opens in Trainee.", image: ogImage(d.env) }));
    }
    const first = await d.store.claimLink(c.claims.u, c.claims.j, d.now()).catch(() => null);
    if (first === null) return state("Couldn't open this just now", ["Nothing was used up. Try the link again in a minute."], 503);
    if (!first) return state("This link was already used", ["A link opens your jobs once, so a forwarded copy can't. " + NEW_LINK], 410);
    const session = await mintFileToken({ secret, userId: c.claims.u, list: c.claims.r, now: d.now(), ttlMs: SESSION_TTL_MS, kind: "s" });
    if (!session) return bad("not_configured");
    return html("", 303, { location: url.pathname, "set-cookie": `tf_s=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}` });
  } else {
    const list = url.searchParams.get("list") ?? "";
    if (/^[0-9a-f]{10}$/.test(list)) return html(renderBootstrap(list)); // the Mini App page: reads Telegram's signed data and posts it back
    token = cookieOf(req, "tf_s");
    if (!token) return state("This link isn't valid", ["It may be cut short or changed. " + NEW_LINK], 403);
  }

  const check = await verifyFileToken(token, secret, d.now());
  if (!check.ok) return bad(check.why);
  if (check.claims.k !== "s") return bad("malformed");
  const claims = check.claims;
  const { u } = claims;
  const action = req.method === "POST" ? (fields.get("action") ?? "") : "";
  const notes: Record<string, string> = {};
  let top: string | undefined;

  if (action) {
    if (!["apply", "applyall", "refresh"].includes(action)) return state("Not done", ["That is not something this page can do. Nothing was sent."], 400);
    const refs = (await d.store.recallList(u, claims.r).catch(() => null)) ?? [];
    if (action === "refresh") { /* a fresh read below; nothing to do */ }
    else if (action === "apply") {
      const ref = fields.get("ref") ?? "", tag = fields.get("tag") ?? "";
      if (!refs.includes(ref)) return state("This job isn't on your list", ["It is no longer on your list. " + NEW_LINK], 404);
      const cur = await loadFeed(claims, token, d);
      const row = cur?.rows.find((r) => r.ref === ref);
      if (!row) return state("This job isn't on your list", [NEW_LINK], 404);
      if (row.status) { /* already in motion: the row shows its word, nothing more to do */ }
      else if (row.byHand) notes[ref] = "Not applied for automatically on this site. Open it and apply there yourself.";
      else if (tag === "none" && !row.tag) {
        // The same posting screen as the card's Apply (closed, stale, scam-looking, knock-out): checked before anything is queued.
        const why = await screenedOut(u, row.job, d);
        if (why) notes[ref] = `Not queued: ${why}`;
        else {
          const w = await d.store.want(u, row.job, d.now()).catch(() => ({ result: "refused" as const, reason: "I couldn't save that just now." }));
          if (w.result === "refused") notes[ref] = `Not queued: ${w.reason ?? "I can't open that posting's application form yet."}`;
        }
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
