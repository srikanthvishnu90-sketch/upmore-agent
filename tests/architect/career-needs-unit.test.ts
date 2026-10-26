// FEATURE NEEDS (2026-10-26): the needs model's order (career_needs.ts), the connector asks and the resume's contact lines
// (career_connectors.ts), and the connect flow's signed state and pages (career_connect_flow.ts). Pure; no network.
import assertNode from "node:assert/strict";
import { EVERY_FORM, type NeedsState, nextNeed, READ_SCOPE, SEND_SCOPE } from "../../supabase/functions/_shared/career_needs.ts";
import { connectorAsk, connectReply, resumeContact } from "../../supabase/functions/_shared/career_connectors.ts";
import { connectedMessage, handleConnect, issueState, verifyState } from "../../supabase/functions/_shared/career_connect_flow.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const known = (value: string, from: "resume" | "said" | "profile" = "resume") => ({ value, from });
const base = (o: Partial<NeedsState> = {}): NeedsState => ({
  resume: "confirmed", contact: { name: known("Alex Testcase"), email: known("alex@example.test"), phone: null },
  eligibility: { work_authorization: null, sponsorship: null }, scopes: [], pending: [], offered: [], ...o,
});
const T = { company: "Ramp", title: "Frontend Intern" };

Deno.test("needs: the resume comes first for any application, and nothing else is asked with it", () => {
  const n = nextNeed(base({ resume: "none", contact: { name: null, email: null, phone: null } }), "apply", T)!;
  eq([n.id, n.blocking], ["resume", true]);
  eq(nextNeed(base({ resume: "drafts" }), "apply", T)!.id, "resume_confirm", "a resume read but not confirmed is confirmed, not pasted again");
  eq(nextNeed(base({ resume: "unknown" }), "apply", T), null, "an unreadable record decides nothing");
});

Deno.test("needs: contact facts from the resume or the person's words are never asked; a missing one is, one at a time", () => {
  eq(nextNeed(base(), "apply", T), null, "name and email on the resume: nothing needed (every form asks only those by default)");
  eq(EVERY_FORM, ["name", "email"]);
  eq(nextNeed(base({ contact: { name: known("Pat", "said"), email: null, phone: null } }), "apply", T)!.id, "email");
  eq(nextNeed(base(), "apply", { ...T, requires: ["name", "email", "phone"] })!.id, "phone", "phone only when the form asks it");
  eq(nextNeed(base({ contact: { name: known("A"), email: known("a@x.test"), phone: known("+1 555", "said") } }), "apply", { ...T, requires: ["name", "email", "phone"] }), null);
});

Deno.test("needs: work authorization and sponsorship only when the form asks; then the form's open questions", () => {
  eq(nextNeed(base(), "apply", { ...T, requires: ["name", "email", "sponsorship"] })!.id, "sponsorship");
  eq(nextNeed(base({ eligibility: { work_authorization: null, sponsorship: known("No", "said") } }), "apply", { ...T, requires: ["name", "email", "sponsorship"] }), null);
  const q = nextNeed(base(), "apply", { ...T, open_questions: ["Are you 18 or older?", "Why Ramp?"] })!;
  eq(q.id, "form_question");
  assert(/"Are you 18 or older\?" \(and 1 more\)/.test(q.why), q.why);
});

Deno.test("needs: Gmail is never a step of applying; an emailed code offers it once, then the page", () => {
  const code = { id: "job:1", company: "Ramp", title: null, state: "needs_user", reason: "email_code" };
  eq(nextNeed(base(), "apply", T), null, "no code waiting: no Gmail");
  const offer = nextNeed(base({ pending: [code] }), "apply", T)!;
  eq([offer.id, offer.blocking, offer.scopes, offer.offer_once], ["gmail_read", false, [READ_SCOPE], "gmail_read:email_code"]);
  eq(nextNeed(base({ pending: [code], resume: "none" }), "apply", T)!.id, "resume", "a blocking need for this application comes before the offer");
  eq(nextNeed(base({ pending: [code], offered: ["gmail_read:email_code"] }), "email_code")!.id, "code_by_hand", "offered once");
  eq(nextNeed(base({ pending: [code], scopes: [READ_SCOPE] }), "email_code"), null, "connected: the reader takes it");
  eq(nextNeed(base(), "outreach")!.id, "send_unavailable", "sending is deferred in Google verification until approved");
  eq(nextNeed(base({ sendAvailable: true }), "outreach")!.scopes, [SEND_SCOPE]);
  eq(nextNeed(base({ scopes: [SEND_SCOPE] }), "outreach"), null);
  eq(nextNeed(base(), "track_replies")!.scopes, [READ_SCOPE]);
});

Deno.test("connector asks: connect, disconnect and what can you see; past tense is the inbox check's", () => {
  for (const m of ["connect gmail", "Connect my Gmail please", "can you link my google account?", "set up my email"]) eq(connectorAsk(m), "connect", m);
  for (const m of ["disconnect gmail", "please disconnect my Google account", "revoke access to my gmail", "stop reading my email"]) eq(connectorAsk(m), "disconnect", m);
  for (const m of ["what can you see?", "What do you have access to", "what's connected?"]) eq(connectorAsk(m), "see", m);
  for (const m of ["I connected my Gmail", "I just linked my google", "apply me to Ramp", "email Maya at Ramp", ""]) eq(connectorAsk(m), null, m);
});

Deno.test("connect reply: each scope in plain words, the link alone, never a password or a code", () => {
  const r = connectReply({ scopes: [READ_SCOPE], url: "https://x.test/functions/v1/career-connect?t=abc" });
  assert(/the security code the application system \(Greenhouse, Lever, Ashby or Workday\) emails you/.test(r) && !/Send one email you approved/.test(r), r);
  assert(/expires in 15 minutes/.test(r) && /never ask for your password or a code/.test(r), r);
  eq(r.split("\n").at(-1), "https://x.test/functions/v1/career-connect?t=abc");
});

Deno.test("resume contact: the email and phone as written, the name only from the line above them", () => {
  eq(resumeContact("TEST RESUME - synthetic\n\nAlex Testcase (TEST)\nChicago, IL (TEST) | alex.testcase@example.test | +1 555-0100 (TEST)\n"),
    { name: "Alex Testcase", email: "alex.testcase@example.test", phone: "+1 555-0100" });
  eq(resumeContact("EXPERIENCE\nBuilt things"), { name: null, email: null, phone: null });
  eq(resumeContact("Summary of work\npat@x.test").name, null, "a line that is not a name is never taken as one");
});

Deno.test("connect flow: the state is signed, bound to one link and expires; a forged or late one is refused", async () => {
  const id = "11111111-2222-4333-8444-555555555555", now = 1_800_000_000_000;
  const st = await issueState(id, "k", now);
  eq(await verifyState(st, "k", now + 1000), id);
  eq(await verifyState(st, "other", now), null);
  eq(await verifyState(st, "k", now + 16 * 60 * 1000), null);
  eq(await verifyState(st.replace(id, "11111111-2222-4333-8444-555555555556"), "k", now), null);
  eq(await verifyState(st, "", now), null, "no secret, no state");
});

Deno.test("connect flow: the message says only what Google granted", () => {
  eq(connectedMessage("a@g.test", [READ_SCOPE]), `Gmail connected: a@g.test. You allowed me to read your mail, for employers' replies and application codes. You didn't allow sending, so I won't do that. Say "disconnect gmail" any time to remove it.`);
  assert(/You didn't allow reading mail, so I won't do that/.test(connectedMessage(null, [SEND_SCOPE])));
});

Deno.test("connect flow: unconfigured, a tap uses nothing and goes nowhere; a bad state never reaches Google", async () => {
  const calls: string[] = [];
  // The link itself is fine (a peek says ok); only the OAuth client is missing.
  const admin = { rpc: (n: string) => { calls.push(n); return Promise.resolve({ data: n === "career_connect_link_peek" ? { status: "ok", connector: "google", scopes: [] } : null, error: null }); }, from: () => { throw new Error("no table read"); } };
  const env = { get: (k: string) => (k === "SUPABASE_URL" ? "https://p.test" : undefined) };
  const fetch = (() => { throw new Error("no network"); }) as unknown as typeof globalThis.fetch;
  const tap = await handleConnect(new Request("https://p.test/functions/v1/career-connect", { method: "POST", body: new URLSearchParams({ t: "x".repeat(32) }) }), { admin, env, fetch });
  eq(tap.status, 503);
  eq(calls, ["career_connect_link_peek"], "the token is only peeked, never used, while connect is off");
  const back = await handleConnect(new Request("https://p.test/functions/v1/career-connect?state=c1.bad&code=x"), { admin, env, fetch });
  eq(back.status, 400);
  eq(calls, ["career_connect_link_peek"], "a bad state reaches no record and no provider");
  assert((back.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"));
});

Deno.test("connect flow pages: text from the records is escaped (no markup or script gets in)", async () => {
  const { page } = await import("../../supabase/functions/_shared/career_connect_flow.ts");
  const html = await page(`<img src=x onerror=alert(1)>`, [`"><script>alert(1)</script>`, "a & b"], 200, { action: "https://p.test/x\"><b>", token: `t"><script>`, label: "Go" }).text();
  assert(!/<script>|<img|<b>/.test(html), html);
  assert(html.includes("&lt;script&gt;") && html.includes("&amp;") && html.includes("&quot;&gt;&lt;b&gt;"), html);
});

Deno.test("connector asks: oversized or empty input is never a connector ask", () => {
  eq(connectorAsk(`connect gmail ${"x".repeat(400)}`), null);
  eq(connectorAsk("   "), null);
});

Deno.test("apply gate: only with CAREER_NEEDS_RESUME_FIRST=on, only for an apply ask, and never when the server prepare refuses it itself", async () => {
  const { applyGate } = await import("../../supabase/functions/_shared/career_connectors.ts");
  const admin = new Proxy({}, { get() { throw new Error("no record is read"); } });
  const env = (o: Record<string, string>) => ({ get: (k: string) => o[k] });
  const link = "apply me to https://jobs.ashbyhq.com/ramp/a13ae586-f4cb-4385-8822-c42b9b54ed74";
  const base = { admin, userId: "u", profile: null, situation: null };
  eq(await applyGate({ ...base, message: link, env: env({}) }), null, "off by default: FEATURE 1 decides");
  eq(await applyGate({ ...base, message: link, env: env({ CAREER_NEEDS_RESUME_FIRST: "on", CAREER_PREPARE_AHEAD_URL: "https://w.test", CAREER_PREPARE_AHEAD_TOKEN: "k" }) }), null,
    "the server prepare is configured: its own no_resume reply asks for the resume");
  eq(await applyGate({ ...base, message: "what can you see?", env: env({ CAREER_NEEDS_RESUME_FIRST: "on" }) }), null, "not an apply ask");
});

// A stand-in for the service-role client: each table answers its rows, each function its value; every call is recorded.
function fakeAdmin(tables: Record<string, unknown[]>, rpcs: Record<string, unknown>) {
  const calls: string[] = [];
  const query = (t: string) => {
    const q: any = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, delete: () => q,
      maybeSingle: () => Promise.resolve({ data: (tables[t] ?? [])[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) => Promise.resolve({ data: tables[t] ?? [], error: null }).then(ok, no) };
    return q;
  };
  return { calls, admin: { from: (t: string) => { calls.push(`from:${t}`); return query(t); }, rpc: (n: string) => { calls.push(`rpc:${n}`); return Promise.resolve({ data: rpcs[n] ?? null, error: null }); } } };
}

Deno.test("the offer is made once even when two turns reach it together: a mark that is not the first adds nothing", async () => {
  const { needsTurn } = await import("../../supabase/functions/_shared/career_connectors.ts");
  const situation = { tasks: [{ kind: "application", id: "job:1", company: "Ramp", title: null, state: "needs_user", evidence: { reason: "email_code" } }] };
  const run = async (marked: boolean) => {
    const f = fakeAdmin({ channel_contacts: [{ channel: "telegram" }] }, { career_needs_mark: marked, career_connect_link_issue: "t".repeat(32) });
    const out = await needsTurn({ admin: f.admin, message: "where are my applications?", userId: "u", threadId: "th", bridge: true, now: 0, profile: null, situation,
      env: { get: (k: string) => (k === "SUPABASE_URL" ? "https://p.test" : undefined) }, fetch: (() => { throw new Error("no network"); }) as unknown as typeof fetch,
      answered: { stood: { reply: "Ramp: stopped, needs you.", intent: "career_apply_status", status: "shown" } } });
    return { out, calls: f.calls };
  };
  const first = await run(true);
  assert(first.out && /If you connect Gmail, I can read a code like that myself/.test(first.out.reply) && first.out.reply.includes("https://p.test/functions/v1/career-connect?t="), JSON.stringify(first.out));
  eq((first.out!.meta as any)?.link_button?.url, "https://p.test/functions/v1/career-connect?t=" + "t".repeat(32), "on Telegram the link rides as a URL button");
  assert(first.out!.reply.includes("Google doesn't allow signing in inside Telegram's own browser"), first.out!.reply);
  const second = await run(false);
  eq(second.out, null, "the other turn's mark came first: this reply is left as it was");
  assert(!second.calls.includes("rpc:career_connect_link_issue"), "and no link is minted for it");
});

Deno.test("apply gate: only the resume holds an apply ask; a missing email is said after it is queued", async () => {
  const { gateNeed } = await import("../../supabase/functions/_shared/career_connectors.ts");
  eq(gateNeed(base({ resume: "none" }), T)!.id, "resume");
  eq(gateNeed(base({ resume: "drafts" }), T)!.id, "resume_confirm");
  eq(gateNeed(base(), T), null, "a confirmed resume never holds it");
  eq(gateNeed(base({ contact: { name: known("A"), email: null, phone: null } }), T), null, "a contact need never holds it");
  eq(gateNeed(base({ resume: "unknown" }), T), null, "an unreadable record decides nothing");
});

Deno.test("the Google scopes are listed in one place, and the database allows exactly those", async () => {
  const { google } = await import("../../supabase/functions/_shared/connectors/google.ts");
  eq(google.allScopes(), ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"]);
  // What a consent may ask for today: exactly the verification submission (google_scopes.ts), gmail.send deferred.
  const none = { get: (_k: string) => undefined };
  eq(google.requestable(["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"], none),
    { scopes: ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly"], dropped: ["https://www.googleapis.com/auth/gmail.send"] });
  const approved = { get: (k: string) => (k === "GOOGLE_APPROVED_EXTRA_SCOPES" ? "https://www.googleapis.com/auth/gmail.send" : undefined) };
  eq(google.requestable(["https://www.googleapis.com/auth/gmail.send"], approved).scopes, ["openid", "email", "https://www.googleapis.com/auth/gmail.send"]);
  const sql = await Deno.readTextFile(new URL("../../supabase/migrations/20261026160000_career_connect_needs.sql", import.meta.url));
  const listed = /scopes <@ array\[([^\]]+)\]::text\[\]/.exec(sql)![1].match(/'([^']+)'/g)!.map((x) => x.slice(1, -1));
  eq(listed.sort(), [...google.allScopes()].sort());
  for (const k of ["read", "send"] as const) assert(google.allScopes().includes(google.scopes[k]));
});

Deno.test("connected message: how to carry on, only when what it needs was granted", () => {
  const all = [READ_SCOPE, SEND_SCOPE];
  assert(/Text "check my email now" and I'll look for employers' replies\./.test(connectedMessage("a@g.test", all, { purpose: "track_replies" })));
  assert(!/check my email now/.test(connectedMessage("a@g.test", [SEND_SCOPE], { purpose: "track_replies" })), "read not granted: no promise to read");
  assert(/approve it again; I'll send exactly that message/.test(connectedMessage("a@g.test", all, { purpose: "send_email" })));
  assert(!/approve it again/.test(connectedMessage("a@g.test", [READ_SCOPE], { purpose: "send_email" })));
  assert(!/check my email now|approve (?:it|them) again|next applications/.test(connectedMessage("a@g.test", all, { purpose: "connect" })));
});

Deno.test("connect reply on Telegram says to open the link in the phone's browser; elsewhere it doesn't", () => {
  assert(/Google doesn't allow signing in inside Telegram's own browser/.test(connectReply({ scopes: [READ_SCOPE], url: "https://x.test/?t=a", channel: "telegram" })));
  assert(!/Telegram/.test(connectReply({ scopes: [READ_SCOPE], url: "https://x.test/?t=a", channel: "web" })));
});

Deno.test("connectors: only a built connector is one (an unknown or inherited name is not)", async () => {
  const { connectorOf } = await import("../../supabase/functions/_shared/connectors/index.ts");
  eq(connectorOf("google")?.provider, "google_career");
  for (const id of ["microsoft", "__proto__", "constructor", "", null, undefined]) eq(connectorOf(id as any), null, String(id));
});

Deno.test("disconnect that fails part way says so, and never claims it disconnected", async () => {
  const { needsTurn } = await import("../../supabase/functions/_shared/career_connectors.ts");
  const f = fakeAdmin({ user_oauth_connections: [{ provider: "google_career", email: "a@g.test", scopes: "openid email" }] }, { career_connect_links_burn: 0, oauth_vault_read: null });
  const admin = { ...f.admin, rpc: (n: string, a: unknown) => n === "oauth_vault_delete" ? Promise.resolve({ data: null, error: { message: "vault down" } }) : f.admin.rpc(n) };
  const out = await needsTurn({ admin, message: "disconnect gmail", userId: "u", threadId: "th", bridge: false, now: 0, profile: null, situation: null,
    env: { get: () => undefined }, fetch: (() => Promise.resolve(new Response("", { status: 200 }))) as unknown as typeof fetch, answered: {} });
  eq([out?.intent, out?.resultStatus], ["career_google_disconnect", "failed"], "the one disconnect (google_disconnect.ts), through the connector");
  assert(/^I couldn't finish disconnecting Gmail: I wasn't able to delete the stored Google tokens/.test(out!.reply) && !/Gmail is disconnected/.test(out!.reply), out!.reply);
});

Deno.test("needs state: a resume confirmed in another thread counts, even with unconfirmed drafts in this one", async () => {
  const { readNeedsState } = await import("../../supabase/functions/_shared/career_connectors.ts");
  const confirmed = { facts: [{ status: "confirmed", needs_confirmation: false, confirmation_event_id: "e1" }] };
  const drafts = { facts: [{ source: "resume-ingest", status: "draft" }] };
  eq((await readNeedsState(fakeAdmin({}, { career_apply_profile_for: confirmed }).admin, { userId: "u", profile: drafts, situation: null })).resume, "confirmed");
  eq((await readNeedsState(fakeAdmin({}, { career_apply_profile_for: null }).admin, { userId: "u", profile: drafts, situation: null })).resume, "drafts");
  eq((await readNeedsState(fakeAdmin({}, { career_apply_profile_for: null }).admin, { userId: "u", profile: null, situation: null })).resume, "none");
});

Deno.test("the email card's 'connect Gmail in the Trainee app' becomes the signed link for sending, and the card stays the last word", async () => {
  const { needsTurn } = await import("../../supabase/functions/_shared/career_connectors.ts");
  const { EMAIL_INTENT } = await import("../../supabase/functions/_shared/career_apply_email.ts");
  const f = fakeAdmin({ channel_contacts: [{ channel: "telegram" }] }, { career_connect_link_issue: "s".repeat(32) });
  const issued: unknown[] = [];
  const admin = { ...f.admin, rpc: (n: string, a: unknown) => { if (n === "career_connect_link_issue") issued.push(a); return f.admin.rpc(n); } };
  const emailed = { reply: "NOT_WIRED: not sent. Trainee can't send from your Gmail yet. Connect Gmail in the Trainee app (it asks to send on your behalf), then say yes again.", status: "NOT_WIRED", waiting: true, card_id: "card-1" };
  const fetchNone = (() => { throw new Error("no network"); }) as unknown as typeof fetch;
  // Sending deferred (google_scopes.ts): no link is made for it, and the reply says so instead of pointing anywhere.
  const deferred = await needsTurn({ admin, message: "yes", userId: "u", threadId: "th", bridge: true, now: 0, profile: null, situation: null,
    env: { get: (k: string) => (k === "SUPABASE_URL" ? "https://p.test" : undefined) }, fetch: fetchNone, answered: { emailed } });
  eq([deferred?.intent, deferred?.resultStatus], [EMAIL_INTENT, "NOT_WIRED"]);
  assert(/^NOT_WIRED: not sent\. Trainee can't send from your Gmail yet\.\nSending from your Gmail isn't available in Trainee yet: Google hasn't approved it/.test(deferred!.reply) && !/Trainee app|career-connect/.test(deferred!.reply), deferred!.reply);
  eq((deferred!.meta as any).email_card, "card-1");
  eq(issued.length, 0, "no link for a scope that may not be asked");
  // Once the owner names gmail.send approved: the signed link for sending.
  const out = await needsTurn({ admin, message: "yes", userId: "u", threadId: "th", bridge: true, now: 0, profile: null, situation: null,
    env: { get: (k: string) => (k === "SUPABASE_URL" ? "https://p.test" : k === "GOOGLE_APPROVED_EXTRA_SCOPES" ? "https://www.googleapis.com/auth/gmail.send" : undefined) }, fetch: fetchNone,
    answered: { emailed } });
  eq([out?.intent, out?.resultStatus, out?.handler], [EMAIL_INTENT, "NOT_WIRED", "email"]);
  assert(/Connect Gmail for sending with the link below, then say yes again\./.test(out!.reply) && !/Trainee app/.test(out!.reply), out!.reply);
  assert(/Send one email you approved word for word in the chat, from your own Gmail/.test(out!.reply) && !/security code/.test(out!.reply) && out!.reply.endsWith("https://p.test/functions/v1/career-connect?t=" + "s".repeat(32)), out!.reply);
  eq((out!.meta as any).email_card, "card-1", "the card stays this thread's last word by its id");
  eq((issued[0] as any).p_scopes, ["openid", "email", "https://www.googleapis.com/auth/gmail.send"]);
  eq((issued[0] as any).p_purpose, "send_email");
});

Deno.test("an email card that was shown, or sent, is left exactly as its turn wrote it", async () => {
  const { needsTurn } = await import("../../supabase/functions/_shared/career_connectors.ts");
  for (const emailed of [{ reply: "Here is the email to Acme. Say yes to send it.", status: "shown", waiting: true, card_id: "c" },
    { reply: "Sent. NOT_WIRED words in a quote: Connect Gmail in the Trainee app", status: "sent", waiting: false }]) {
    const f = fakeAdmin({}, {});
    const out = await needsTurn({ admin: f.admin, message: "yes", userId: "u", threadId: "th", bridge: false, now: 0, profile: null, situation: null,
      env: { get: () => "https://p.test" }, fetch: (() => { throw new Error("no network"); }) as unknown as typeof fetch, answered: { emailed } });
    eq(out, null, emailed.status);
    assert(!f.calls.includes("rpc:career_connect_link_issue"), "no link minted");
  }
});

Deno.test("keys and tokens are removed from the chat before anything stores them; ordinary words are not", async () => {
  const { redactIdentity, redactionNote } = await import("../../supabase/functions/_shared/identity_redact.ts");
  const gone = (m: string) => { const r = redactIdentity(m); return { text: r.text, key: r.removed.includes("key") }; };
  for (const [m, secret] of [
    ["here's my openai api key sk-proj-AbCdEfGhIjKlMnOpQrStUvWx0123456789", "sk-proj-AbCdEfGhIjKlMnOpQrStUvWx0123456789"],
    ["token: ghp_abcdefghijklmnopqrstuvwxyz0123456789AB", "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB"],
    ["stripe sk_live_51HabcdefGHIJKLmnop0123", "sk_live_51HabcdefGHIJKLmnop0123"],
    ["aws AKIAIOSFODNN7EXAMPLE", "AKIAIOSFODNN7EXAMPLE"],
    ["access token = ya29.a0AfH6SMBx1234567890abcdefghij", "ya29.a0AfH6SMBx1234567890abcdefghij"],
    ["jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijklmnop", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijklmnop"],
  ] as const) {
    const r = gone(m);
    assert(r.key && !r.text.includes(secret) && r.text.includes("[key removed]"), `${m} -> ${r.text}`);
  }
  const app = redactIdentity("my app password is abcd1234efgh5678");
  assert(!app.text.includes("abcd1234efgh5678") && app.removed.length === 1, app.text);
  for (const m of ["my token expired yesterday", "what is an api key?", "the access token is broken", "skip-this-one please", "I applied to Stripe", "my access token is notarealtokenatall"]) {
    const r = gone(m);
    eq([r.key, r.text], [false, m], m);
  }
  assert(/key or token/.test(redactionNote(["key"])!) && /Never send passwords or codes/.test(redactionNote(["key"])!));
});

Deno.test("a removed secret gets the safe path for what it was about; nothing asks for it again", async () => {
  const { secretTurn } = await import("../../supabase/functions/_shared/career_connectors.ts");
  eq(secretTurn("hello"), null);
  eq(secretTurn("my gmail password is [password removed]")?.about, "google");
  assert(/say "connect gmail"/.test(secretTurn("my gmail password is [password removed]")!.reply));
  eq(secretTurn("linkedin password is [password removed]")?.about, "linkedin");
  assert(/never sign in to LinkedIn or Indeed/.test(secretTurn("linkedin password is [password removed]")!.reply));
  eq(secretTurn("my workday password is [password removed]")?.about, "employer");
  eq(secretTurn("the code is [code removed]")?.about, "code");
  assert(/Type a code on the page that asked for it/.test(secretTurn("the code is [code removed]")!.reply));
  eq(secretTurn("api key [key removed]")?.about, "key");
  assert(/revoke it where you made it/.test(secretTurn("api key [key removed]")!.reply));
  eq(secretTurn("password: [password removed]")?.about, "password");
  for (const s of ["google", "linkedin", "employer", "code", "key", "password"]) void s;
  for (const m of ["my gmail password is [password removed]", "api key [key removed]", "the code is [code removed]"]) assert(!/send (?:it|me)|paste it|tell me (?:it|your)/i.test(secretTurn(m)!.reply), m);
});

Deno.test("connector asks: 'what can you do' and 'what do you need' in a new person's words", () => {
  for (const m of ["hey, what can you do??", "what else can you help me with", "what do you do", "how can you help"]) eq(connectorAsk(m), "can", m);
  for (const m of ["what do you need from me now", "what else do you need", "what should i send you", "what info do you need", "whats missing?"]) eq(connectorAsk(m), "need", m);
  for (const m of ["what can you see", "what's connected"]) eq(connectorAsk(m), "see", m);
});
