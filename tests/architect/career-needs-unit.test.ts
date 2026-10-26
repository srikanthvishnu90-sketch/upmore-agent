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
  eq(nextNeed(base(), "outreach")!.scopes, [SEND_SCOPE]);
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
  assert(/read: Google's permission covers all of your mail/.test(r) && !/send:/.test(r), r);
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
  const admin = { rpc: (n: string) => { calls.push(n); return Promise.resolve({ data: null, error: null }); }, from: () => { throw new Error("no table read"); } };
  const env = { get: (k: string) => (k === "SUPABASE_URL" ? "https://p.test" : undefined) };
  const fetch = (() => { throw new Error("no network"); }) as unknown as typeof globalThis.fetch;
  const tap = await handleConnect(new Request("https://p.test/functions/v1/career-connect", { method: "POST", body: new URLSearchParams({ t: "x".repeat(32) }) }), { admin, env, fetch });
  eq(tap.status, 503);
  eq(calls, [], "the token is not used while connect is off");
  const back = await handleConnect(new Request("https://p.test/functions/v1/career-connect?state=c1.bad&code=x"), { admin, env, fetch });
  eq(back.status, 400);
  eq(calls, []);
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
