// Google verification (owner, 2026-10-26: "yes start google's verification"). What the submission promises Google, held
// by code: the consent URL asks only for the submitted scopes; a disconnect revokes the grant at Google and deletes the
// mail rows (the SQL half is tests/db/google_disconnect_erase.test.sql); the public pages carry the Limited Use statement
// and say only what the code does; the pre-consent words are one source. No network, no database, no real Google.
import { createRequire } from "node:module";
import {
  approvedExtras, consentNotice, EMAIL, GMAIL_READONLY, GMAIL_SEND, OPENID, permissionScopes, requestableScopes, SUBMITTED_SCOPES,
} from "../../supabase/functions/_shared/google_scopes.ts";
import { GOOGLE_REVOKE, requestScopesFor, revokeAtGoogle, scopeSet } from "../../supabase/functions/gmail-oauth/career.ts";
import { buildNoticePage } from "../../scripts/launch/build-google-notice-page.ts";
import OAUTH_SRC from "../../supabase/functions/gmail-oauth/index.ts" with { type: "text" };
import GO_LIVE from "../../scripts/launch/trainee-go-live.sh" with { type: "text" };
import DB_RUN from "../db/run.sh" with { type: "text" };
import MIGRATION from "../../supabase/migrations/20261026200011_google_disconnect_erase.sql" with { type: "text" };
import DOC from "../../docs/launch/GOOGLE-VERIFICATION-2026-10-26.md" with { type: "text" };

const ROOT = new URL("../../", import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, ROOT));
const eq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
};
const assert = (c: unknown, m: string) => {
  if (!c) throw new Error(m);
};
const env = (v: Record<string, string> = {}) => ({ get: (k: string) => v[k] });
const CAL_FB = "https://www.googleapis.com/auth/calendar.freebusy", CAL_EV = "https://www.googleapis.com/auth/calendar.events";
const FULL_MAIL = "https://mail.google.com/";

Deno.test("GV/1 the submission is openid, email and gmail.readonly; send and Calendar are never asked for by default", () => {
  eq(SUBMITTED_SCOPES, [OPENID, EMAIL, GMAIL_READONLY], "the scopes submitted on 2026-10-26");
  const r = requestableScopes([GMAIL_READONLY, GMAIL_SEND, CAL_FB, CAL_EV], env());
  eq(r.scopes, [OPENID, EMAIL, GMAIL_READONLY], "only the submitted ones reach the consent URL");
  eq(r.dropped, [GMAIL_SEND, CAL_FB, CAL_EV], "and what was refused is named");
  eq(requestableScopes([], env()).scopes, [OPENID, EMAIL], "an empty ask still only names the account");
  eq(requestableScopes([GMAIL_READONLY, GMAIL_READONLY], env()).scopes, [OPENID, EMAIL, GMAIL_READONLY], "a repeated scope is asked once");
});

Deno.test("GV/2 gmail.send comes back only when the owner says Google approved it; junk in the switch widens nothing", () => {
  const on = env({ GOOGLE_APPROVED_EXTRA_SCOPES: GMAIL_SEND });
  eq(requestableScopes([GMAIL_READONLY, GMAIL_SEND], on).scopes, [OPENID, EMAIL, GMAIL_READONLY, GMAIL_SEND], "approved send is asked");
  eq(requestableScopes([GMAIL_READONLY, GMAIL_SEND, CAL_FB], on).dropped, [CAL_FB], "Calendar stays out");
  // A bare word, a full-mail URL on another host, a header break and a list with spaces: none is a scope this accepts.
  const junk = env({ GOOGLE_APPROVED_EXTRA_SCOPES: `gmail.send ${FULL_MAIL} https://www.googleapis.com/auth/gmail.modify\r\nX: y ,` });
  eq(approvedExtras(junk), ["https://www.googleapis.com/auth/gmail.modify"], "only a googleapis scope URL is read from the switch");
  eq(requestableScopes([FULL_MAIL, GMAIL_SEND], junk).scopes, [OPENID, EMAIL], "full mail access and unapproved send are refused");
  eq(requestableScopes([GMAIL_READONLY], env({ GOOGLE_APPROVED_EXTRA_SCOPES: "" })).scopes, [OPENID, EMAIL, GMAIL_READONLY], "empty switch");
});

Deno.test("GV/3 gmail-oauth (deploys alone) asks Google exactly what the shared module allows, for both grants", () => {
  for (const extras of [undefined, "", GMAIL_SEND, `${GMAIL_SEND} ${CAL_FB}`, "nonsense"]) {
    const e = env(extras === undefined ? {} : { GOOGLE_APPROVED_EXTRA_SCOPES: extras });
    eq(requestScopesFor("career", extras), requestableScopes([GMAIL_READONLY, GMAIL_SEND, CAL_FB, CAL_EV], e), `career grant, extras ${extras}`);
    eq(requestScopesFor("gmail", extras), requestableScopes([GMAIL_READONLY], e), `legacy grant, extras ${extras}`);
  }
  eq(requestScopesFor("career").scopes, [OPENID, EMAIL, GMAIL_READONLY], "the career consent today");
});

Deno.test("GV/4 the handler builds its consent URL and its fallback granted list from the filter, never the raw career set", () => {
  const start = OAUTH_SRC.slice(OAUTH_SRC.indexOf("const startPurpose = purposeForAction(action);"), OAUTH_SRC.indexOf('if (action === "status")'));
  assert(/requestScopesFor\(startPurpose, Deno\.env\.get\("GOOGLE_APPROVED_EXTRA_SCOPES"\)\)/.test(start), "the start route filters");
  assert(/scope: asked\.scopes\.join\(" "\)/.test(start), "and puts only the filtered scopes in the URL");
  assert(!/scopesForPurpose/.test(OAUTH_SRC), "nothing in the handler asks for the raw career set (Calendar, unapproved send)");
  assert(/: requestScopesFor\(purpose, Deno\.env\.get\("GOOGLE_APPROVED_EXTRA_SCOPES"\)\)\.scopes\.join\(" "\);/.test(OAUTH_SRC),
    "when Google echoes no scope list, the row records what was asked, not the raw set");
});

Deno.test("GV/5 revoke at Google: the refresh token (else the access token) is posted to Google's revoke endpoint", async () => {
  const calls: { url: string; body: string; method: string; type: string }[] = [];
  const fake = (status: number | "throw") => (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body), method: String(init?.method), type: new Headers(init?.headers).get("content-type") ?? "" });
    if (status === "throw") throw new TypeError("network down");
    return new Response(status === 200 ? "" : JSON.stringify({ error: "invalid_token" }), { status });
  }) as typeof fetch;
  eq(await revokeAtGoogle(fake(200), JSON.stringify({ access_token: "at-1", refresh_token: "rt-1" })), "revoked", "200 revokes");
  eq(calls[0], { url: GOOGLE_REVOKE, body: "token=rt-1", method: "POST", type: "application/x-www-form-urlencoded" }, "the refresh token, form-encoded, to Google");
  eq(GOOGLE_REVOKE, "https://oauth2.googleapis.com/revoke", "Google's own endpoint");
  eq(await revokeAtGoogle(fake(200), JSON.stringify({ access_token: "at-2", refresh_token: null })), "revoked", "no refresh token");
  eq(calls[1].body, "token=at-2", "falls back to the access token");
  eq(await revokeAtGoogle(fake(400), JSON.stringify({ refresh_token: "rt-3" })), "revoked", "400: Google no longer holds it");
  eq(await revokeAtGoogle(fake(503), JSON.stringify({ refresh_token: "rt-4" })), "not_confirmed", "a server error is not a confirmed revoke");
  eq(await revokeAtGoogle(fake("throw"), JSON.stringify({ refresh_token: "rt-5" })), "not_confirmed", "a network failure is not either");
  const before = calls.length;
  eq(await revokeAtGoogle(fake(200), null), "no_token", "no stored secret");
  eq(await revokeAtGoogle(fake(200), "not json{"), "no_token", "a broken secret");
  eq(await revokeAtGoogle(fake(200), JSON.stringify({ email: "x@example.test" })), "no_token", "a secret with no token");
  eq(calls.length, before, "and none of those calls Google");
  // A hostile token value is sent as one form field, never as extra fields.
  await revokeAtGoogle(fake(200), JSON.stringify({ refresh_token: "a&token=b" }));
  eq(new URLSearchParams(calls.at(-1)!.body).getAll("token"), ["a&token=b"], "the token is one encoded field");
});

Deno.test("GV/6 disconnect revokes every grant at Google before Trainee's copy of the tokens is deleted", () => {
  const block = OAUTH_SRC.slice(OAUTH_SRC.indexOf('if (action === "disconnect")'), OAUTH_SRC.indexOf('return json({ error: "unknown action" }, 400);'));
  const read = block.indexOf('admin.rpc("oauth_vault_read"'), revoke = block.indexOf("revokeAtGoogle(fetch"), del = block.indexOf('admin.rpc("oauth_vault_delete"');
  assert(read > 0 && revoke > read && del > revoke, `read the token, revoke it, then delete it (read ${read}, revoke ${revoke}, delete ${del})`);
  assert(/for \(const name of plan\.vault_names\) \{[\s\S]*?revokeAtGoogle/.test(block), "for every vault entry the plan removes");
  assert(/revoked_at_google: revoked/.test(block), "and the answer says whether Google confirmed it");
});

Deno.test("GV/7 openid and email never change what a grant may do (both status readers)", () => {
  eq(scopeSet([OPENID, "https://www.googleapis.com/auth/userinfo.email", GMAIL_READONLY]), "readonly", "career.ts: read-only with identity scopes");
  eq(scopeSet([OPENID, EMAIL]), "none", "career.ts: identity alone is no mail permission");
  eq(permissionScopes([OPENID, EMAIL, GMAIL_READONLY]), [GMAIL_READONLY], "shared module");
  const A = createRequire(import.meta.url)(new URL("packages/domain/120-career-access.js", ROOT).pathname);
  const acc = A.connectedAccounts([{ provider: "google_career", email: "p@example.test", scopes: `${OPENID} https://www.googleapis.com/auth/userinfo.email ${GMAIL_READONLY}`, connected_at: null }]);
  eq(acc.gmail.scope_set, "readonly", "router 120 reads the same grant as read-only");
  assert(/Gmail: connected as p@example\.test \(read-only\)/.test(acc.text), `and says so: ${acc.text}`);
  eq(acc.calendar_connected, false, "no Calendar from identity scopes");
});

Deno.test("GV/8 the disconnect erase migration is applied by go-live and tested by the database run", () => {
  const f = "20261026200011_google_disconnect_erase.sql";
  assert(GO_LIVE.includes(`  ${f}\n`), "listed in go-live MIGRATIONS");
  assert(GO_LIVE.includes(`"exists (select 1 from pg_trigger where tgname = 'user_oauth_connections_google_erase')"`), "with its mark");
  assert(DB_RUN.includes(f) && DB_RUN.includes("google_disconnect_erase.test.sql"), "applied and tested in tests/db/run.sh");
  for (const t of ["career_mail_events", "career_mail_drafts", "career_mail_cursors"]) {
    assert(new RegExp(`delete from public\\.${t} where user_id = old\\.user_id;`).test(MIGRATION), `the migration deletes ${t} for the row's own person`);
  }
  assert(/if old\.provider = 'google_career' then/.test(MIGRATION), "only on the career Google grant's delete");
});

const PRIVACY = read("site/privacy.html"), TERMS = read("site/terms.html"), HOME = read("site/index.html"), NOTICE = read("site/google.html");
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&larr;/g, "←").replace(/\s+/g, " ");

Deno.test("GV/9 the privacy policy carries Google's Limited Use statement and names every scope asked, and nothing else", () => {
  const t = text(PRIVACY);
  assert(t.includes("Trainee's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements."), "the Limited Use sentence, verbatim");
  assert(PRIVACY.includes('href="https://developers.google.com/terms/api-services-user-data-policy"'), "linked to Google's policy");
  assert(/never used to create, train or improve a machine learning or artificial intelligence model/.test(t), "the AI/ML training statement");
  for (const s of ["openid", "email", "gmail.readonly"]) assert(PRIVACY.includes(`<code>${s}</code>`), `names ${s}`);
  for (const s of ["gmail.send", "calendar", "gmail.modify", "mail.google.com"]) assert(!PRIVACY.includes(`<code>${s}`), `does not claim ${s}`);
  assert(/Trainee cannot send, delete, label or change any of your email/.test(t), "says what the read-only scope cannot do");
  assert(/Say "disconnect gmail"[^.]*\. Trainee revokes its access at Google, deletes the stored tokens, and deletes the tracked email results, drafts and read time/.test(t),
    "the disconnect promise the migration and revokeAtGoogle keep");
  assert(/Security codes:<\/strong> never stored/.test(PRIVACY), "codes never stored (career_email_code.ts EmailCode)");
  assert(/id="limited-use"/.test(PRIVACY) && /id="google"/.test(PRIVACY) && /id="extension"/.test(PRIVACY), "anchors the consent screen and the extension listing link to");
});

Deno.test("GV/10 the homepage links the same privacy policy and terms the consent screen will name; no template text left there", () => {
  assert(!/#product\/privacy|#product\/terms/.test(HOME), "no hash-only policy links");
  assert((HOME.match(/href="\/privacy"/g) ?? []).length >= 3 && (HOME.match(/href="\/terms"/g) ?? []).length >= 2, "footer, sign-up consent and help pages link /privacy and /terms");
  assert(!/\[Name, phone number, resume contents|\[With employers when you apply|\[Eligibility, account responsibilities|\[Describe how connections are authorized/.test(HOME), "the template placeholders are gone");
  assert(/<h1>Trainee Terms of Service<\/h1>/.test(TERMS) && /href="\/privacy"/.test(TERMS), "terms exist and point to the policy");
  for (const page of [PRIVACY, TERMS]) assert(/<a href="\/privacy">Privacy<\/a>/.test(page) && /<a href="\/terms">Terms<\/a>/.test(page), "each page links both");
});

Deno.test("GV/11 the pre-consent page is built from the consent notice, word for word", () => {
  eq(NOTICE, buildNoticePage(PRIVACY), "site/google.html is current (deno run -A scripts/launch/build-google-notice-page.ts)");
  const n = consentNotice([OPENID, EMAIL, GMAIL_READONLY], { modelCheck: true });
  for (const line of [...n.reads, ...n.never, ...n.undo]) assert(text(NOTICE).includes(line), `the page says: ${line}`);
  const send = consentNotice([OPENID, EMAIL, GMAIL_READONLY, GMAIL_SEND]);
  assert(send.reads.some((l) => /approved word for word/.test(l)) && send.never.includes("Trainee never sends an email you did not approve."), "with send, the notice says so");
  assert(!n.reads.some((l) => /\bSend\b/.test(l)) && n.never.includes("Trainee can't send, delete, label or change any email."), "without it, it says it can't");
  assert(!consentNotice([OPENID, EMAIL, GMAIL_READONLY]).reads.some((l) => /OpenAI/.test(l)), "the model line only when the second pass is on");
});

Deno.test("GV/12 the launch doc states the same scope set the code requests", () => {
  for (const s of SUBMITTED_SCOPES) assert(DOC.includes(s === OPENID || s === EMAIL ? `\`${s}\`` : s), `the doc names ${s}`);
  assert(/gmail\.send[^\n]*Deferred/i.test(DOC), "and records gmail.send as deferred");
});
