// The hosted file pages (owner, 2026-10-28): "a rendered, link-opened file page, like Boardy's introduction page and Instinct":
// from Telegram a designed page for ONE decision. Job match file (+ application proof file). Everything runs over memory
// stores and a fake clock: no network, no model, no database.
import assertNode from "node:assert/strict";
import { FILE_TTL_MS, fileUrlFor, mintFileToken, verifyFileToken } from "../../supabase/functions/_shared/file_link.ts";
import { handleFile, type FileDeps, type FileStore, type AppRow } from "../../supabase/functions/trainee-file/handler.ts";
import { refOf, sendJobCards, hashTag, jobViewOf, type JobView, type PreparedRow } from "../../supabase/functions/_shared/telegram_jobs.ts";
import type { TapStore } from "../../supabase/functions/_shared/channel_card_tap.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const SECRET = "file-link-secret-0123456789-abcdef";
const U = "11111111-1111-4111-8111-111111111111", V = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-10-28T12:00:00Z");
const H = "ab".repeat(32), H2 = "cd".repeat(32), PID = "33333333-3333-4333-8333-333333333333", CARD = "44444444-4444-4444-8444-444444444444";
const BASE = "https://trainee.example/file";

const hit = (n: number, extra: Record<string, unknown> = {}) => ({ job_id: `greenhouse:acme:${n}`, company: "Acme", title: `Data Analyst ${n}`, location: "Austin, TX", url: `https://boards.greenhouse.io/acme/jobs/${n}`,
  first_seen_at: "2026-10-27T12:00:00Z", pay: "$90k-$110k", fit: { reasons: ["You list SQL", "Your last role was analytics", "You are in Austin", "A fourth reason"], gaps: ["No Tableau on file"] }, ...extra });
const row = (n: number, extra: Record<string, unknown> = {}) => ({ job_id: `greenhouse:acme:${n}`, provider: "greenhouse", pay: "$90k-$110k", remote: "hybrid", seniority_band: "mid", posted_at: "2026-10-25T09:00:00Z", deadline: "2026-11-15T00:00:00Z",
  description: "<p>About us</p><p>Requirements</p><ul><li>3 years of SQL</li><li>Dashboards</li></ul>", company_domain: "acme.com", ...extra });
const prepared = (hash = H): PreparedRow => ({ id: PID, job_id: "greenhouse:acme:1", company: "Acme", url: "https://boards.greenhouse.io/acme/jobs/1", payload_hash: hash, state: "ready",
  card_lines: ["Data Analyst at Acme"], payload: { resume_sha256: "f".repeat(64), resume_name: "ada-resume.pdf", fields: [
    { name: "first_name", label: "First name", value: "Ada" }, { name: "cover_letter_text", label: "Cover note", value: "I built the pricing model at my last job." },
    { name: "work_auth", label: "Authorized to work in the US?", value: "Yes" }] } });

function memStore(init: { prepared?: PreparedRow | null; app?: AppRow | null; wanted?: boolean; postings?: any[] } = {}) {
  const mem = new Map<string, any>();
  const log = { wants: [] as string[], passes: [] as string[], saved: [] as string[] };
  let prep = init.prepared ?? null;
  let app = init.app ?? null;
  const store: FileStore = {
    async remember(u, ref, job, shownAs) { mem.set(`${u}|job|${ref}`, { job, shownAs }); },
    async recall(u, ref) { return mem.get(`${u}|job|${ref}`) ?? null; },
    async rememberList(u, id, refs) { mem.set(`${u}|list|${id}`, refs); },
    async recallList(u, id) { return mem.get(`${u}|list|${id}`) ?? null; },
    async postings() { return init.postings ?? []; },
    async save(u, ref) { log.saved.push(ref); return "saved"; },
    async prepared(u) { return u === U ? prep : null; },
    async applied(u) { return u === U && !!app; },
    async want(_u, job) { log.wants.push(job.job_id); return { result: "queued" }; },
    async pass(u, ref) { const k = `${u}|pass|${ref}`; if (mem.has(k)) return "already"; mem.set(k, 1); log.passes.push(ref); return "passed"; },
    async passed(u, ref) { return mem.has(`${u}|pass|${ref}`); },
    async appRow(u) { return u === U ? app : null; },
    async wanted(u) { return u === U && !!init.wanted; },
  };
  return { store, log, setPrepared: (p: PreparedRow | null) => { prep = p; }, setApp: (a: AppRow | null) => { app = a; } };
}
function deps(m: ReturnType<typeof memStore>, tapLog: { answered: any[]; opened: string[] }, o: { now?: number; hash?: () => string; env?: Record<string, string | undefined> } = {}): FileDeps {
  const hash = o.hash ?? (() => H);
  const tap: TapStore = {
    async card(_u, id) { return { id, items: [{ n: 1, prepared_id: PID, payload_hash: hash() }], state: "open", user_id: U } as any; },
    async prepared() { return [{ id: PID, payload_hash: hash(), company: "Acme" }]; },
    async answer(_u, card, approve) { tapLog.answered.push({ card, approve }); return approve.length ? [{ n: 1, company: "Acme", result: "queued" }] : [{ n: 1, company: "Acme", result: "declined" }]; },
  };
  const env = { TRAINEE_FILE_LINK_SECRET: SECRET, TRAINEE_FILE_BASE_URL: BASE, ...(o.env ?? {}) };
  return { store: m.store, now: () => o.now ?? NOW, env: { get: (k) => env[k] },
    cards: { async open(_u, ids) { tapLog.opened.push(...ids); return { id: CARD, items: [{ n: 1, prepared_id: ids[0], payload_hash: hash() }], shown_at: new Date(NOW).toISOString() }; } }, tap };
}
const newLog = () => ({ answered: [] as any[], opened: [] as string[] });

// The card exists the way the bot leaves it: remembered under (user, ref). Returns a ready token for it.
async function seed(m: ReturnType<typeof memStore>, user = U, n = 1, h: Record<string, unknown> = {}, kind: "match" | "proof" = "match") {
  const view = jobViewOf(hit(n, h), (m.store as any).__rows?.[n] ?? row(n));
  const ref = await refOf(user, view.job_id);
  await m.store.remember(user, ref, view, "photo");
  const t = (await mintFileToken({ secret: SECRET, userId: user, ref, kind, now: NOW }))!;
  return { view, ref, t };
}
const get = (d: FileDeps, t: string, extra = "") => handleFile(new Request(`https://x.example/f?t=${encodeURIComponent(t)}${extra}`), d);
const post = (d: FileDeps, fields: Record<string, string>) =>
  handleFile(new Request("https://x.example/f", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() }), d);

// ---- accessibility checks on a rendered page (no DOM library: the checks are on the markup we write)
function a11y(html: string) {
  assert(/^<!doctype html>/i.test(html), "doctype");
  assert(/<html lang="en"/.test(html), "html lang");
  assert(/<meta name="viewport" content="width=device-width, initial-scale=1"/.test(html), "viewport");
  assert(/<title>[^<]{3,}<\/title>/.test(html), "title");
  eq((html.match(/<h1[ >]/g) ?? []).length, 1, "exactly one h1");
  const levels = [...html.matchAll(/<h([1-6])[ >]/g)].map((x) => Number(x[1]));
  for (let i = 1; i < levels.length; i++) assert(levels[i] - levels[i - 1] <= 1, `heading levels do not skip: ${levels}`);
  for (const img of html.matchAll(/<img\b[^>]*>/g)) assert(/\balt="[^"]+"/.test(img[0]), `img has alt text: ${img[0]}`);
  for (const inp of html.matchAll(/<input\b[^>]*>/g)) assert(/type="hidden"/.test(inp[0]) || /aria-label=/.test(inp[0]), `input is hidden or labelled: ${inp[0]}`);
  for (const b of html.matchAll(/<button\b[^>]*>([^<]*)</g)) assert(b[1].trim().length > 1, "button has text");
  assert(!/<script\b/i.test(html), "no script");
  assert(/prefers-color-scheme:\s*dark/.test(html), "dark mode");
  assert(/min-height:\s*(4[4-9]|[5-9][0-9])px/.test(html), "tap targets of at least 44px");
  assert(/<main\b/.test(html) && /<header\b/.test(html), "landmarks");
}
const plain = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ");

// ================================================================== tokens
Deno.test("token: binds one user, one card and a kind; verifies; nothing readable inside beyond opaque ids", async () => {
  const t = (await mintFileToken({ secret: SECRET, userId: U, ref: "a".repeat(12), kind: "match", now: NOW }))!;
  const v = await verifyFileToken(t, SECRET, NOW + 1000);
  assert(v.ok);
  if (v.ok) eq([v.claims.u, v.claims.r, v.claims.k, v.claims.e], [U, "a".repeat(12), "match", NOW + FILE_TTL_MS]);
  assert(!t.includes("Acme") && !/\s/.test(t));
});

Deno.test("token: expires; refuses a forged user id, a wrong key, garbage, and a missing or short secret", async () => {
  const t = (await mintFileToken({ secret: SECRET, userId: U, ref: "a".repeat(12), kind: "match", now: NOW }))!;
  eq(await verifyFileToken(t, SECRET, NOW + FILE_TTL_MS), { ok: false, why: "expired" });
  eq(await verifyFileToken(t, SECRET, NOW + FILE_TTL_MS - 1).then((x) => x.ok), true);
  // swap the claims for another user's, keep the signature
  const other = (await mintFileToken({ secret: SECRET, userId: V, ref: "a".repeat(12), kind: "match", now: NOW }))!;
  const forged = `${other.split(".").slice(0, 2).join(".")}.${t.split(".")[2]}`;
  eq(await verifyFileToken(forged, SECRET, NOW), { ok: false, why: "bad_signature" });
  eq(await verifyFileToken(t, "another-secret-0123456789-abcdef", NOW), { ok: false, why: "bad_signature" });
  for (const junk of ["", "x", "v1.a.b", "v2." + t.slice(3), null, undefined, 5]) assert(!(await verifyFileToken(junk, SECRET, NOW)).ok);
  eq(await verifyFileToken(t, undefined, NOW), { ok: false, why: "not_configured" });
  eq(await verifyFileToken(t, "short", NOW), { ok: false, why: "not_configured" });
  eq(await mintFileToken({ secret: undefined, userId: U, ref: "a".repeat(12), kind: "match", now: NOW }), null);
  eq(await mintFileToken({ secret: SECRET, userId: U, ref: "not-a-ref", kind: "match", now: NOW }), null);
});

Deno.test("token: the link is built only when the secret and an https base are set; a lifetime is capped at 72 hours", async () => {
  const env = (o: Record<string, string>) => ({ get: (k: string) => o[k] });
  eq(await fileUrlFor(env({}), U, "a".repeat(12), "match", NOW), null);
  eq(await fileUrlFor(env({ TRAINEE_FILE_LINK_SECRET: SECRET, TRAINEE_FILE_BASE_URL: "http://x.example/file" }), U, "a".repeat(12), "match", NOW), null);
  eq(await fileUrlFor(env({ TRAINEE_FILE_BASE_URL: BASE }), U, "a".repeat(12), "match", NOW), null);
  const u = await fileUrlFor(env({ TRAINEE_FILE_LINK_SECRET: SECRET, TRAINEE_FILE_BASE_URL: BASE }), U, "a".repeat(12), "match", NOW);
  assert(u && u.startsWith(`${BASE}?t=v1.`));
  const long = (await mintFileToken({ secret: SECRET, userId: U, ref: "a".repeat(12), kind: "match", now: NOW, ttlMs: 999 * 3600_000 }))!;
  eq(await verifyFileToken(long, SECRET, NOW + 73 * 3600_000), { ok: false, why: "expired" });
});

// ================================================================== the Telegram card carries the link
Deno.test("telegram: a card gets an 'Open file' URL button only when the link is configured, and the existing three buttons are unchanged", async () => {
  const sent: any[] = [];
  const m = memStore({ postings: [row(1)] }), log = newLog();
  const d = deps(m, log);
  const send = { photo: async (a: any) => { sent.push(a); return { ok: true }; }, text: async () => ({ ok: true, id: "1" }) };
  await sendJobCards({ userId: U, hits: [hit(1)], deps: { ...d, fileLink: (u, r) => fileUrlFor(d.env, u, r, "match", NOW) }, send });
  const rowsA = sent[0].buttons;
  eq(rowsA[0].map((b: any) => b.text), ["Apply", "Details", "Save"]);
  assert(rowsA[1][0].url.startsWith(`${BASE}?t=v1.`) && rowsA[1][0].text === "Open file");
  const ref = await refOf(U, "greenhouse:acme:1");
  const v = await verifyFileToken(new URL(rowsA[1][0].url).searchParams.get("t"), SECRET, NOW);
  assert(v.ok && v.claims.u === U && v.claims.r === ref);
  sent.length = 0;
  await sendJobCards({ userId: U, hits: [hit(1)], deps: d, send });
  eq(sent[0].buttons.length, 1);
});

// ================================================================== the match file
Deno.test("match file: header, source labels on every fact, at most 3 'why' bullets, disclosures, one h1, accessible, no script", async () => {
  const m = memStore({ postings: [row(1)] }), log = newLog();
  (m.store as any).__rows = { 1: row(1) };
  const { t } = await seed(m);
  const r = await get(deps(m, log), t);
  eq(r.status, 200);
  eq(r.headers.get("content-type"), "text/html; charset=utf-8");
  assert(/no-store/.test(r.headers.get("cache-control") ?? "") && r.headers.get("referrer-policy") === "no-referrer" && /noindex/.test(r.headers.get("x-robots-tag") ?? ""));
  assert(/default-src 'none'/.test(r.headers.get("content-security-policy") ?? "") && !/script-src/.test(r.headers.get("content-security-policy") ?? ""));
  const html = await r.text();
  a11y(html);
  const text = plain(html);
  for (const want of ["Data Analyst 1", "Acme", "Austin, TX", "Hybrid", "$90k-$110k", "mid", "Oct 25", "Nov 15", "You list SQL", "Your last role was analytics", "You are in Austin"]) assert(text.includes(want), `page has "${want}"`);
  assert(!text.includes("A fourth reason"), "at most 3 reasons");
  assert(text.includes("From the posting") && text.includes("From your resume"));
  assert(html.includes('<img') && html.includes("acme.com") && /alt="Acme logo"/.test(html));
  assert(/<details[^>]*>\s*<summary[^>]*>Requirements/.test(html) && /<details[^>]*>\s*<summary[^>]*>Full posting/.test(html));
  assert(text.includes("3 years of SQL"));
  assert(!/<form[^>]*method="get"/i.test(html));
  eq((html.match(/<form\b/g) ?? []).length, 2, "Pass and Apply forms only");
});

Deno.test("match file: every fact line carries a source label; a figure that came only from the search result says 'Reported, not verified'", async () => {
  const m = memStore({ postings: [row(1, { pay: null })] }), log = newLog();
  (m.store as any).__rows = { 1: row(1, { pay: null }) };
  const { t } = await seed(m);
  const html = await (await get(deps(m, log), t)).text();
  const dl = html.match(/<dl[\s\S]*?<\/dl>/)![0];
  const rows = [...dl.matchAll(/<div class="fact">([\s\S]*?)<\/div>/g)].map((x) => x[1]);
  assert(rows.length >= 6);
  for (const r of rows) assert(/class="src"[^>]*>(From the posting|From your resume|Reported, not verified|Not listed)</.test(r), `source label on: ${plain(r)}`);
  const pay = rows.find((r) => /Pay/.test(r))!;
  assert(/Reported, not verified/.test(pay) && /\$90k-\$110k/.test(pay));
  const deadline = rows.find((r) => /Apply by/.test(r))!;
  assert(/From the posting/.test(deadline));
});

Deno.test("match file: nothing invented; unlisted facts say 'not listed'; no reasons means no 'Why this fits you' claim", async () => {
  const m = memStore(), log = newLog();
  const view = jobViewOf({ job_id: "lever:x:9", company: "Zed", title: "Analyst", location: "", url: "https://jobs.lever.co/x/9" }, null);
  const ref = await refOf(U, view.job_id);
  await m.store.remember(U, ref, view, "text");
  const t = (await mintFileToken({ secret: SECRET, userId: U, ref, kind: "match", now: NOW }))!;
  const html = await (await get(deps(m, log), t)).text();
  a11y(html);
  const text = plain(html);
  assert(text.includes("Pay not listed") || /Pay\s+not listed/.test(text));
  assert(/Apply by\s+not listed/.test(text) && /Posted\s+not listed/.test(text));
  assert(!/Why this fits you/.test(text) || /nothing on your resume/i.test(text));
  assert(!html.includes("<img"), "no domain, so a lettermark and no guessed logo");
  assert(/class="lettermark"[^>]*>Z</.test(html));
});

Deno.test("match file: a logo comes only from the employer's own domain; an ATS link alone gives the lettermark", async () => {
  const m = memStore(), log = newLog();
  (m.store as any).__rows = { 1: row(1, { company_domain: null }) };
  const { t } = await seed(m);
  const html = await (await get(deps(m, log), t)).text();
  assert(!html.includes("<img") && /class="lettermark"[^>]*>A</.test(html));
  assert(!/greenhouse\.io["&]/.test(html.match(/<img[^>]*>/)?.[0] ?? ""));
});

Deno.test("match file: posting text is untrusted and is escaped, never markup", async () => {
  const m = memStore(), log = newLog();
  const evil = `<script>alert(1)</script><img src=x onerror=alert(2)>`;
  const view = jobViewOf(hit(1, { title: evil, company: "A&B <b>", fit: { reasons: [evil], gaps: [] } }), row(1, { description: `Requirements\n${evil}` }));
  const ref = await refOf(U, view.job_id);
  await m.store.remember(U, ref, view, "text");
  (m.store as any).postings = async () => [row(1, { description: `Requirements\n${evil}` })];
  const t = (await mintFileToken({ secret: SECRET, userId: U, ref, kind: "match", now: NOW }))!;
  const html = await (await get(deps(m, log), t)).text();
  assert(!/<script\b/i.test(html) && !/<img src=x/i.test(html) && !/<b>/.test(html));
  assert(html.includes("A&amp;B") && !/onerror=alert/.test(html.replace(/&[a-z]+;/g, "")) || !/<img src=x/.test(html));
});

Deno.test("match file: the plain-text version carries every fact, every label and the state of every action", async () => {
  const m = memStore({ prepared: prepared(), postings: [row(1)] }), log = newLog();
  (m.store as any).__rows = { 1: row(1) };
  const { t } = await seed(m);
  const r = await get(deps(m, log), t, "&format=text");
  eq(r.status, 200);
  assert(/^text\/plain/.test(r.headers.get("content-type") ?? ""));
  const txt = await r.text();
  for (const want of ["Data Analyst 1", "Acme", "Austin, TX", "Hybrid", "Pay: $90k-$110k (From the posting)", "Level: mid", "Posted: ", "Apply by: Nov 15 (From the posting)", "Why this fits you", "• You list SQL (From your resume)",
    "Status: available", "Pass: available", "Apply: available", "Requirements", "3 years of SQL", "Full posting", "Nothing is sent until you press Confirm"]) assert(txt.includes(want), `text has "${want}":\n${txt}`);
  assert(!txt.includes("A fourth reason") && !/<[a-z]/i.test(txt));
});

// ================================================================== isolation
Deno.test("isolation: a token for user V can never open user U's card, even with U's exact reference; nothing of U's leaks into the answer", async () => {
  const m = memStore({ postings: [row(1)] }), log = newLog();
  (m.store as any).__rows = { 1: row(1) };
  const a = await seed(m, U);
  const tokenV = (await mintFileToken({ secret: SECRET, userId: V, ref: a.ref, kind: "match", now: NOW }))!;
  const r = await get(deps(m, log), tokenV);
  eq(r.status, 404);
  const body = await r.text();
  for (const secret of ["Acme", "Data Analyst", "$90k", "You list SQL", "ada-resume"]) assert(!body.includes(secret), `no leak of ${secret}`);
  // and the action path too
  m.setPrepared(prepared());
  const p = await post(deps(m, log), { t: tokenV, action: "confirm", tag: hashTag(H) });
  eq(p.status, 404);
  eq(log.answered, []);
  eq(log.opened, []);
});

Deno.test("isolation: two users each see only their own file from their own token", async () => {
  const m = memStore(), log = newLog();
  const mk = async (user: string, company: string) => {
    const view = jobViewOf({ job_id: "greenhouse:co:1", company, title: `Role at ${company}`, location: "Remote", url: "https://careers.example.com/1" }, null);
    const ref = await refOf(user, view.job_id);
    await m.store.remember(user, ref, view, "text");
    return (await mintFileToken({ secret: SECRET, userId: user, ref, kind: "match", now: NOW }))!;
  };
  const tu = await mk(U, "UCorp"), tv = await mk(V, "VCorp");
  const hu = await (await get(deps(m, log), tu)).text(), hv = await (await get(deps(m, log), tv)).text();
  assert(hu.includes("UCorp") && !hu.includes("VCorp"));
  assert(hv.includes("VCorp") && !hv.includes("UCorp"));
});

Deno.test("link states: expired, invalid and unconfigured show a clear state with no job data and no way to act", async () => {
  const m = memStore({ postings: [row(1)] }), log = newLog();
  (m.store as any).__rows = { 1: row(1) };
  const { t } = await seed(m);
  const late = await get(deps(m, log, { now: NOW + FILE_TTL_MS + 5 }), t);
  eq(late.status, 410);
  const lateHtml = await late.text();
  a11y(lateHtml);
  assert(/expired/i.test(plain(lateHtml)) && !lateHtml.includes("Acme") && !/<form/.test(lateHtml));
  const bad = await get(deps(m, log), t.slice(0, -3) + "AAA");
  eq(bad.status, 403);
  assert(/isn't valid|not valid/i.test(plain(await bad.text())));
  const none = await get(deps(m, log, { env: { TRAINEE_FILE_LINK_SECRET: undefined } }), t);
  eq(none.status, 503);
  const missing = await handleFile(new Request("https://x.example/f"), deps(m, log));
  eq(missing.status, 403);
  const expiredPost = await post(deps(m, log, { now: NOW + FILE_TTL_MS + 5 }), { t, action: "pass" });
  eq(expiredPost.status, 410);
  eq(log.passes ?? [], []);
  eq(m.log.passes, []);
});

// ================================================================== truthful status words
Deno.test("status words: each state says its own truthful word, and 'applied' is never said before a submit", async () => {
  const now = new Date(NOW).toISOString();
  const app = (state: string, extra: Partial<AppRow> = {}): AppRow => ({ id: "j1", state, reason: null, confirmation_id: null, created_at: now, updated_at: now, email_confirmed_at: null, payload: prepared().payload as any, company: "Acme", url: "https://boards.greenhouse.io/acme/jobs/1", ...extra });
  const cases: [string, Parameters<typeof memStore>[0], string, boolean][] = [
    ["nothing yet", {}, "available", false],
    ["wanted, not prepared", { wanted: true }, "preparing", false],
    ["prepared, awaiting confirm", { prepared: prepared() }, "available", false],
    ["approved, waiting", { app: app("queued") }, "queued", false],
    ["being sent", { app: app("driving") }, "preparing", false],
    ["submitted", { app: app("submitted_unconfirmed") }, "submitted", true],
    ["employer confirmed", { app: app("confirmed", { confirmation_id: "C-123" }) }, "confirmed", true],
    ["failed", { app: app("failed", { reason: "the form changed" }) }, "failed", false],
    ["needs you", { app: app("needs_user", { reason: "a captcha" }) }, "failed", false],
    ["not submitted", { app: app("not_submitted", { reason: "the posting closed" }) }, "failed", false],
    ["unknown", { app: app("unknown_outcome") }, "unknown", false],
  ];
  for (const [name, init, word, sent] of cases) {
    const m = memStore({ ...init, postings: [row(1)] }), log = newLog();
    (m.store as any).__rows = { 1: row(1) };
    const { t } = await seed(m);
    const html = await (await get(deps(m, log), t)).text();
    const status = html.match(/<p class="status[^"]*"[^>]*>([\s\S]*?)<\/p>/)![1];
    assert(new RegExp(`<strong>${word}</strong>`).test(status), `${name}: word ${word} in ${status}`);
    const txt = await (await get(deps(m, log), t, "&format=text")).text();
    assert(txt.includes(`Status: ${word}`), `${name}: text status`);
    if (!sent) assert(!/\bapplied\b/i.test(plain(html)) && !/\bapplied\b/i.test(txt), `${name}: never 'applied' before a submit`);
    if (word === "failed") assert(/the form changed|a captcha|the posting closed/.test(status), `${name}: failure carries its reason`);
  }
});

Deno.test("status words: a posting on LinkedIn, Indeed or Handshake is never applied for; the page links it to apply by hand", async () => {
  const m = memStore(), log = newLog();
  const view = jobViewOf({ job_id: "linkedin:1", company: "Acme", title: "Analyst", location: "NYC", url: "https://www.linkedin.com/jobs/view/1" }, null);
  const ref = await refOf(U, view.job_id);
  await m.store.remember(U, ref, view, "text");
  const t = (await mintFileToken({ secret: SECRET, userId: U, ref, kind: "match", now: NOW }))!;
  const html = await (await get(deps(m, log), t)).text();
  assert(!/name="action" value="apply"/.test(html) && /apply there yourself/i.test(plain(html)) && html.includes("https://www.linkedin.com/jobs/view/1"));
  const p = await post(deps(m, log), { t, action: "apply" });
  assert(/apply there yourself|don't apply on/i.test(plain(await p.text())));
  eq(m.log.wants, []);
});

// ================================================================== Apply never fires without Confirm
Deno.test("apply: shows the exact payload and a Confirm bound to its hash; nothing is approved, queued or opened by Apply", async () => {
  const m = memStore({ prepared: prepared(), postings: [row(1)] }), log = newLog();
  (m.store as any).__rows = { 1: row(1) };
  const { t } = await seed(m);
  const r = await post(deps(m, log), { t, action: "apply" });
  eq(r.status, 200);
  const html = await r.text();
  a11y(html);
  const text = plain(html);
  for (const want of ["Data Analyst 1", "Acme", "ada-resume.pdf", "I built the pricing model at my last job.", "First name: Ada", "Authorized to work in the US?: Yes", "Nothing is sent until you press Confirm"]) assert(text.includes(want), `payload shows "${want}"`);
  assert(html.includes(`name="tag" value="${hashTag(H)}"`) && /name="action" value="confirm"/.test(html));
  eq(log.answered, []);
  eq(log.opened, []);
  eq(m.log.wants, []);
  // GETting the same page never approves either, and a GET cannot carry an action
  const g = await get(deps(m, log), t, "&action=confirm&tag=" + hashTag(H));
  eq(g.status, 200);
  eq(log.answered, []);
});

Deno.test("apply: Confirm fires only with the tag of the payload that is on file now; a changed payload, a wrong tag and a missing tag approve nothing", async () => {
  const m = memStore({ prepared: prepared(H), postings: [row(1)] }), log = newLog();
  (m.store as any).__rows = { 1: row(1) };
  const { t } = await seed(m);
  let hash = H;
  const d = deps(m, log, { hash: () => hash });
  // no tag
  let r = await post(d, { t, action: "confirm" });
  assert(r.status === 400 || r.status === 409);
  // wrong tag
  r = await post(d, { t, action: "confirm", tag: hashTag(H2) });
  assert(/changed after I showed it/.test(await r.text()));
  // the payload changed after it was shown: the old tag is refused
  m.setPrepared(prepared(H2));
  r = await post(d, { t, action: "confirm", tag: hashTag(H) });
  assert(/changed after I showed it/.test(await r.text()));
  eq(log.answered, []);
  // the right tag approves exactly once, through the same card path as the Approve button
  hash = H2;
  r = await post(d, { t, action: "confirm", tag: hashTag(H2) });
  eq(r.status, 200);
  const html = await r.text();
  a11y(html);
  eq(log.answered.length, 1);
  eq(log.answered[0].approve, [1]);
  assert(/<strong>queued<\/strong>/.test(html) && /not submitted/i.test(plain(html)) && !/\bapplied\b/i.test(plain(html)));
});

Deno.test("apply: with no prepared application it queues the posting to be prepared and says 'preparing', never 'applied'; a second Apply queues nothing twice", async () => {
  const m = memStore({ postings: [row(1)] }), log = newLog();
  (m.store as any).__rows = { 1: row(1) };
  const { t } = await seed(m);
  const r = await post(deps(m, log), { t, action: "apply" });
  const html = await r.text();
  eq(m.log.wants, ["greenhouse:acme:1"]);
  assert(/<strong>preparing<\/strong>/.test(html) && !/\bapplied\b/i.test(plain(html)) && !/name="action" value="confirm"/.test(html));
  eq(log.answered, []);
});

Deno.test("apply: an exact duplicate (already in the queue) is refused, once", async () => {
  const now = new Date(NOW).toISOString();
  const m = memStore({ app: { id: "j", state: "queued", reason: null, confirmation_id: null, created_at: now, updated_at: now, email_confirmed_at: null, payload: {}, company: "Acme", url: "u" }, postings: [row(1)] }), log = newLog();
  (m.store as any).__rows = { 1: row(1) };
  const { t } = await seed(m);
  const html = await (await post(deps(m, log), { t, action: "apply" })).text();
  assert(/already in your applications/.test(plain(html)));
  eq(m.log.wants, []);
  eq(log.answered, []);
});

Deno.test("pass: records the decision, sends nothing, and the file then says so", async () => {
  const m = memStore({ prepared: prepared(), postings: [row(1)] }), log = newLog();
  (m.store as any).__rows = { 1: row(1) };
  const { t, ref } = await seed(m);
  const r = await post(deps(m, log), { t, action: "pass" });
  eq(r.status, 200);
  assert(/Nothing was sent/.test(plain(await r.text())));
  eq(m.log.passes, [ref]);
  eq(log.answered, []);
  const again = await (await get(deps(m, log), t)).text();
  assert(/You passed on this posting/.test(plain(again)));
});

Deno.test("post: unknown actions and a kind mismatch do nothing", async () => {
  const m = memStore({ prepared: prepared(), postings: [row(1)] }), log = newLog();
  (m.store as any).__rows = { 1: row(1) };
  const { t } = await seed(m);
  const r = await post(deps(m, log), { t, action: "approve-all" });
  eq(r.status, 400);
  const proofTok = (await seed(m, U, 1, {}, "proof")).t;
  const r2 = await post(deps(m, log), { t: proofTok, action: "apply" });
  eq(r2.status, 400);
  eq(log.answered, []);
  eq(m.log.wants, []);
  const del = await handleFile(new Request("https://x.example/f", { method: "DELETE" }), deps(m, log));
  eq(del.status, 405);
});

// ================================================================== proof file
Deno.test("proof file: what was sent, the truthful status, the employer's confirmation if there is one, and no actions", async () => {
  const at = "2026-10-28T10:00:00Z";
  const app: AppRow = { id: "j1", state: "confirmed", reason: null, confirmation_id: "C-123", created_at: at, updated_at: "2026-10-28T11:00:00Z", email_confirmed_at: "2026-10-28T11:00:00Z", payload: prepared().payload as any, company: "Acme", url: "https://boards.greenhouse.io/acme/jobs/1" };
  const m = memStore({ app, postings: [row(1)] }), log = newLog();
  (m.store as any).__rows = { 1: row(1) };
  const { t } = await seed(m, U, 1, {}, "proof");
  const r = await get(deps(m, log), t);
  eq(r.status, 200);
  const html = await r.text();
  a11y(html);
  const text = plain(html);
  assert(/Application proof/.test(text) && /<strong>confirmed<\/strong>/.test(html));
  for (const want of ["Data Analyst 1", "Acme", "C-123", "ada-resume.pdf", "I built the pricing model at my last job.", "First name: Ada", "Oct 28"]) assert(text.includes(want), `proof has "${want}"`);
  assert(!/<form/.test(html), "a proof file has no actions");
  const txt = await (await get(deps(m, log), t, "&format=text")).text();
  assert(txt.includes("Status: confirmed") && txt.includes("C-123") && txt.includes("Confirmation: C-123"));
});

Deno.test("proof file: submitted-but-unconfirmed says submitted and that the employer has not confirmed; no application means no proof", async () => {
  const at = "2026-10-28T10:00:00Z";
  const app: AppRow = { id: "j1", state: "submitted_unconfirmed", reason: null, confirmation_id: null, created_at: at, updated_at: at, email_confirmed_at: null, payload: {}, company: "Acme", url: "https://boards.greenhouse.io/acme/jobs/1" };
  const m = memStore({ app, postings: [row(1)] }), log = newLog();
  (m.store as any).__rows = { 1: row(1) };
  const { t } = await seed(m, U, 1, {}, "proof");
  const text = plain(await (await get(deps(m, log), t)).text());
  assert(/submitted/.test(text) && /has not confirmed/i.test(text) && !/<strong>confirmed/.test(text));
  m.setApp(null);
  const none = await get(deps(m, log), t);
  eq(none.status, 404);
  assert(/no application/i.test(plain(await none.text())));
});

Deno.test("match file links to the proof file once an application exists, with its own proof token for the same user", async () => {
  const at = "2026-10-28T10:00:00Z";
  const app: AppRow = { id: "j1", state: "queued", reason: null, confirmation_id: null, created_at: at, updated_at: at, email_confirmed_at: null, payload: {}, company: "Acme", url: "u" };
  const m = memStore({ app, postings: [row(1)] }), log = newLog();
  (m.store as any).__rows = { 1: row(1) };
  const { t, ref } = await seed(m);
  const html = await (await get(deps(m, log), t)).text();
  const href = html.match(/href="([^"]*)"[^>]*>Open the proof file/)![1].replace(/&amp;/g, "&");
  const tok = new URL(href, "https://x.example").searchParams.get("t")!;
  const v = await verifyFileToken(tok, SECRET, NOW);
  assert(v.ok && v.claims.k === "proof" && v.claims.u === U && v.claims.r === ref);
});
