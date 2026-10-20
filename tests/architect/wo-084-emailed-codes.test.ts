// WO-084 (architect, written before the build): the code an application site emails the person is read from their own
// Gmail and filled into the form in their own browser. Owner, 2026-10-20: "build the email-code reader" (the step that
// stops Gusto, Greenhouse's security code and Workday's verification). D-021 holds: only mail at most 15 minutes old,
// never shown in chat, never stored, never logged. D-013(b) holds: never a password.
import {
  extractCode, handleApplyCode, pickCode, readEmailedCode, senderAllowed, type CodeMail,
} from "../../supabase/functions/_shared/apply_code.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
const NOW = Date.UTC(2026, 9, 20, 15);
const MIN = 60_000;
const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const mail = (o: Partial<CodeMail>): CodeMail => ({ id: "m1", from: "Greenhouse <no-reply@us.greenhouse-mail.io>", subject: "Security code for your application",
  text: "Copy and paste this code into the security code field on your application: Ab3dE9fG", internalDate: NOW - 1 * MIN, ...o });

Deno.test("WO-084/1 the code is read only when the mail plainly gives exactly one", () => {
  assert(extractCode("Security code for your application", "Copy and paste this code into the security code field on your application: Ab3dE9fG") === "Ab3dE9fG");
  assert(extractCode("Verify your email", "Your verification code is 482913. It expires in 10 minutes.") === "482913");
  assert(extractCode("Your one-time code", "Use 7710 to continue.") === "7710");
  assert(extractCode("Verify", "Your code is 482913. Your old code 551234 no longer works.") === null, "two codes: unclear, the person reads it");
  assert(extractCode("Order update", "Order 482913 shipped on 2026-10-20.") === null, "no code wording: no code");
  assert(extractCode("Thanks for applying", "We received your application for Data Analyst.") === null);
});

Deno.test("WO-084/2 only the site's own family or the employer's own domain may supply a code", () => {
  assert(senderAllowed("Greenhouse <no-reply@us.greenhouse-mail.io>", "greenhouse", null));
  assert(senderAllowed("talent@acme.com", "greenhouse", "acme.com"), "the employer's own domain");
  assert(senderAllowed("Acme Careers <noreply@careers.acme.com>", "workday", "acme.com"), "a subdomain of the employer's domain");
  assert(!senderAllowed("x@greenhouse-mail.io.evil.example", "greenhouse", null), "a look-alike domain");
  assert(!senderAllowed("x@notacme.com", "greenhouse", "acme.com"));
  assert(!senderAllowed("Greenhouse <no-reply@us.greenhouse-mail.io>", "lever", null), "another family's sender");
  assert(!senderAllowed("someone@gmail.com", "gusto", null));
});

Deno.test("WO-084/3 a code from before this application's code step, or older than 15 minutes, is never used; the newest wins", () => {
  const o = { now: NOW, since: NOW - 3 * MIN, family: "greenhouse", employerDomain: null };
  assert(pickCode([mail({ internalDate: NOW - 5 * MIN })], o) === null, "sent before this step began: an old code");
  assert(pickCode([mail({ internalDate: NOW - 20 * MIN })], { ...o, since: NOW - 30 * MIN }) === null, "older than 15 minutes (D-021)");
  assert(pickCode([mail({ internalDate: NOW + 10 * MIN })], o) === null, "dated in the future");
  assert(pickCode([mail({ from: "x@evil.example" })], o) === null, "a sender not allowed");
  const r = pickCode([mail({ id: "a", internalDate: NOW - 2 * MIN, text: "Your security code: Zz11Yy22" }), mail({ id: "b", internalDate: NOW - 1 * MIN })], o);
  assert(r?.code === "Ab3dE9fG", `the newest: ${JSON.stringify(r)}`);
});

function fakeGmail(messages: Array<{ id: string; from: string; subject: string; body: string; internalDate: number }>) {
  const seen: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    seen.push(url);
    if (!url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/messages")) return new Response("{}", { status: 404 });
    const path = new URL(url).pathname.split("/").pop();
    if (path === "messages") return Response.json({ messages: messages.map((m) => ({ id: m.id })) });
    const m = messages.find((x) => x.id === path);
    if (!m) return new Response("{}", { status: 404 });
    return Response.json({ id: m.id, internalDate: String(m.internalDate), snippet: "", payload: { mimeType: "multipart/alternative",
      headers: [{ name: "From", value: m.from }, { name: "Subject", value: m.subject }],
      parts: [{ mimeType: "text/plain", body: { data: b64url(m.body) } }, { mimeType: "text/html", body: { data: b64url(`<p>${m.body}</p>`) } }] } });
  }) as typeof fetch;
  return { f, seen };
}

Deno.test("WO-084/4 read from the person's Gmail: no grant says so and reads nothing; a code is returned and never logged", async () => {
  const g = fakeGmail([{ id: "m9", from: "Greenhouse <no-reply@us.greenhouse-mail.io>", subject: "Security code", body: "Your security code is Qx7Pw2Kd", internalDate: NOW - MIN }]);
  const none = await readEmailedCode("u1", { family: "greenhouse", employer_domain: null, since: NOW - 2 * MIN }, { token: async () => null, fetch: g.f, now: () => NOW });
  assert(!none.ok && none.why === "no_gmail" && /Gmail/.test(none.message), JSON.stringify(none));
  assert(g.seen.length === 0, "no grant: nothing is read");
  const logged: string[] = [];
  const keep = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  console.log = console.error = console.warn = console.info = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); };
  try {
    const r = await readEmailedCode("u1", { family: "greenhouse", employer_domain: null, since: NOW - 2 * MIN }, { token: async () => "tok", fetch: g.f, now: () => NOW });
    assert(r.ok && r.code === "Qx7Pw2Kd", JSON.stringify(r));
  } finally { Object.assign(console, keep); }
  assert(!logged.some((l) => l.includes("Qx7Pw2Kd")), "the code is never logged");
  const q = decodeURIComponent(g.seen[0]);
  assert(/greenhouse-mail\.io/.test(q) && /newer_than:1d/.test(q), `the search asks only the family's senders: ${q}`);
  const later = await readEmailedCode("u1", { family: "greenhouse", employer_domain: null, since: NOW }, { token: async () => "tok", fetch: g.f, now: () => NOW });
  assert(!later.ok && later.why === "not_yet", "nothing new since the step began: not yet, try again");
});

const jwt = (role: string) => `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ role, sub: "u1" }))}.sig`;
Deno.test("WO-084/5 the endpoint: the person's own sign-in only, and the answer is never cached", async () => {
  const g = fakeGmail([{ id: "m9", from: "no-reply@us.greenhouse-mail.io", subject: "Security code", body: "Your security code is Qx7Pw2Kd", internalDate: NOW - MIN }]);
  const deps = { cors: {}, user: async () => ({ id: "u1" }), code: { token: async () => "tok", fetch: g.f, now: () => NOW } };
  const body = JSON.stringify({ family: "greenhouse", employer_domain: null, since: NOW - 2 * MIN });
  const post = (h: Record<string, string>) => new Request("https://x.test/functions/v1/apply-code", { method: "POST", headers: { "content-type": "application/json", ...h }, body });
  assert((await handleApplyCode(post({}), deps)).status === 401, "no sign-in");
  assert((await handleApplyCode(post({ authorization: `Bearer ${jwt("service_role")}` }), deps)).status === 403, "only a person's own session");
  const r = await handleApplyCode(post({ authorization: `Bearer ${jwt("authenticated")}` }), deps);
  assert(r.status === 200 && /no-store/.test(r.headers.get("cache-control") ?? ""), `no-store: ${r.headers.get("cache-control")}`);
  const j = await r.json();
  assert(j.ok && j.code === "Qx7Pw2Kd", JSON.stringify(j));
  const bad = await handleApplyCode(new Request("https://x.test/f", { method: "POST", headers: { authorization: `Bearer ${jwt("authenticated")}` }, body: JSON.stringify({ family: "linkedin" }) }), deps);
  assert(bad.status === 400, "a family that is not an application site is refused");
});
