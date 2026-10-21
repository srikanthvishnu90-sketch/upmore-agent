// WO-096: the code an employer's form emails the person, read from their own Gmail (gmail.readonly, their consent) for an
// application they approved, typed into the page and never anywhere else. A fake mailbox of SYNTHETIC emails (Greenhouse,
// Lever, Ashby, Workday shapes), a fake Gmail API, a fake clock. No network, no database, no real mail.
import {
  ATS_CODE_SENDERS, atsOfUrl, careerCodeMailbox, type CodeMailbox, type CodeMessage, codeQuery, codeStop, DRIVE_WINDOW_MS, EmailCode,
  extractCodes, fetchVerificationCode, gmailCodeMailbox, handleEmailCode, lookOnce, redactCode,
} from "../../supabase/functions/_shared/career_email_code.ts";
import { CODE_MAX_WAIT_MS, CODE_POLL_DELAYS_MS, pollForCode } from "../../supabase/functions/_shared/career_email_code_poll.ts";
import { classifyMail } from "../../supabase/functions/_shared/career_mail.ts";
import { CAREER_READ_SCOPE } from "../../supabase/functions/_shared/career_mail_gmail.ts";
import FN_SRC from "../../supabase/functions/career-email-code/index.ts" with { type: "text" };
import CORE_SRC from "../../supabase/functions/_shared/career_email_code.ts" with { type: "text" };
import CONFIG from "../../supabase/config.toml" with { type: "text" };
import GATE from "../../scripts/gate.sh" with { type: "text" };
import APPLY_SRC from "../../scripts/apply.ts" with { type: "text" };
import BACKGROUND from "../../extension/background.js" with { type: "text" };
import CONTENT from "../../extension/content.js" with { type: "text" };
import DOM_SRC from "../../extension/src/dom.ts" with { type: "text" };
import { createRequire } from "node:module";
import { runApproved } from "../../workers/career-browser/approve-first.ts";
import { cardOutcome } from "../../extension/src/apply_core.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}

const USER = "TEST-USER-096";
const ASKED = Date.UTC(2026, 9, 20, 22, 0, 0); // the moment the form asked for the code
const GH = "Xy7kQ2mB", GH_OTHER = "Pq4rS8tU", LEVER = "482913", ASHBY = "736205", WD = "55102938";
// Gmail's own Authentication-Results for mail a domain signed (the first header is the only one trusted).
const authFor = (domain: string, pass = true) => [
  `mx.google.com; dkim=${pass ? "pass" : "fail"} header.i=@${domain} header.s=s1 header.b=TEST; spf=pass smtp.mailfrom=${domain}; dmarc=${
    pass ? "pass" : "fail"
  } (p=NONE) header.from=${domain}`,
];
// The same message has the same id however often a test builds it (a mailbox is read many times).
const mail = (o: Partial<CodeMessage> & { from: string; at: number }): CodeMessage => {
  const domain = o.from.split("@").pop()!.replace(/>$/, "");
  return { id: `${o.from}|${o.at}|${o.text}`, internalDate: o.at, from: o.from, subject: o.subject ?? "", text: o.text ?? "", auth: o.auth ?? authFor(domain) };
};
const greenhouseMail = (code: string, at: number, from = "Greenhouse <no-reply@us.greenhouse-mail.io>") =>
  mail({
    from,
    at,
    subject: "Security code for your application to Acme Synthetic",
    text: `Hi Test,\n\nCopy and paste this code into the security code field on your application: ${code}\n\nThis code expires in 10 minutes.`,
  });
const leverMail = (code: string, at: number) =>
  mail({ from: "Acme Synthetic <no-reply@hire.lever.co>", at, subject: "Verify your email", text: `Your verification code is ${code}. It expires soon.` });
const ashbyMail = (code: string, at: number) =>
  mail({ from: "Acme Synthetic <no-reply@ashbyhq.com>", at, subject: "Your verification code", text: `Enter this verification code to submit your application: ${code}` });
const workdayMail = (code: string, at: number) =>
  mail({ from: "acme@myworkday.com", at, subject: "Verification code", text: `Your one-time passcode is ${code}` });

// A fake mailbox: Gmail's search (newest first, from: domains, after: seconds) over the messages present at each look.
function fakeBox(all: () => CodeMessage[], seen: { queries: string[]; gets: number } = { queries: [], gets: 0 }): CodeMailbox {
  return {
    async search(q) {
      seen.queries.push(q);
      const after = Number(/after:(\d+)/.exec(q)?.[1] ?? 0) * 1000;
      const domains = /from:\(([^)]*)\)/.exec(q)?.[1].split(" OR ") ?? [];
      return all().filter((m) => m.internalDate >= after && domains.some((d) => m.from.includes(d))).sort((a, b) => b.internalDate - a.internalDate)
        .map((m) => m.id);
    },
    async get(id) {
      seen.gets++;
      return all().find((m) => m.id === id) ?? null;
    },
  };
}
const clock = (start: number) => {
  let t = start;
  return { now: () => t, sleep: async (ms: number) => void (t += ms), advance: (ms: number) => (t += ms) };
};
const once = (box: CodeMailbox, ats: string, now = ASKED + 20_000) =>
  fetchVerificationCode({ userId: USER, ats, sinceMs: ASKED, maxWaitMs: 0 }, { mailbox: async () => box, now: () => now });

// Every console line written while fn runs, for the redaction scans.
async function captured<T>(fn: () => Promise<T>): Promise<{ value: T; lines: string[] }> {
  const lines: string[] = [];
  const saved = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  for (const k of Object.keys(saved) as (keyof typeof saved)[]) (console as any)[k] = (...a: unknown[]) => lines.push(a.map((x) => typeof x === "string" ? x : Deno.inspect(x)).join(" "));
  try {
    return { value: await fn(), lines };
  } finally {
    Object.assign(console, saved);
  }
}

Deno.test("WO-096 Greenhouse: the code it emailed after the form asked is found, in memory only", async () => {
  const box = fakeBox(() => [greenhouseMail(GH, ASKED + 4_000)]);
  const r = await once(box, "greenhouse");
  assert(r.status === "found", JSON.stringify(r));
  eq(r.code.reveal(), GH);
  // Every printable form of the result hides the code.
  for (const s of [JSON.stringify(r), String(r.code), `${r.code}`, Deno.inspect(r), Deno.inspect(r.code, { depth: 9 })]) {
    assert(!s.includes(GH), "the code printed: " + s);
  }
});

Deno.test("WO-096 Lever, Ashby and Workday: each system's own code, by its own pattern", async () => {
  const lever = await once(fakeBox(() => [leverMail(LEVER, ASKED + 3_000)]), "lever");
  assert(lever.status === "found" && lever.code.reveal() === LEVER, JSON.stringify(lever));
  const ashby = await once(fakeBox(() => [ashbyMail(ASHBY, ASKED + 3_000)]), "ashby");
  assert(ashby.status === "found" && ashby.code.reveal() === ASHBY, JSON.stringify(ashby));
  const wd = await once(fakeBox(() => [workdayMail(WD, ASKED + 3_000)]), "workday");
  assert(wd.status === "found" && wd.code.reveal() === WD, JSON.stringify(wd));
  // A Lever code is never read from Ashby's mail, and the other way round: the search names one system's senders.
  eq((await once(fakeBox(() => [ashbyMail(ASHBY, ASKED + 3_000)]), "lever")).status, "not_yet");
});

Deno.test("WO-096 strict patterns: a plain word, a phone number or a year is never a code", () => {
  eq(extractCodes("greenhouse", "Copy and paste this code into the security code field on your application: Complete"), []);
  eq(extractCodes("greenhouse", "Your security code is: PASSWORD"), []);
  eq(extractCodes("greenhouse", "security code field on your application: " + GH), [GH]);
  eq(extractCodes("lever", "Call 415-555-0199 about your application in 2026."), []);
  eq(extractCodes("lever", "Your verification code is 1234567"), [], "seven digits is not Lever's six");
  eq(extractCodes("ashby", "Thanks for applying! Reference 736205."), [], "a number without the words is not a code");
});

Deno.test("WO-096 an old code is ignored: mail from before the form asked (less the tolerance) or older than 15 minutes", async () => {
  // The code from an earlier application, 5 minutes before this form asked.
  eq((await once(fakeBox(() => [greenhouseMail(GH_OTHER, ASKED - 5 * 60_000)]), "greenhouse")).status, "not_yet");
  // Within the small tolerance (mail clocks and the page's own send are not exact): counted.
  const near = await once(fakeBox(() => [greenhouseMail(GH, ASKED - 10_000)]), "greenhouse");
  assert(near.status === "found" && near.code.reveal() === GH);
  // The old code beside the new one: only the new one counts (never ambiguous).
  const both = await once(fakeBox(() => [greenhouseMail(GH_OTHER, ASKED - 5 * 60_000), greenhouseMail(GH, ASKED + 6_000)]), "greenhouse");
  assert(both.status === "found" && both.code.reveal() === GH, JSON.stringify(both));
  // D-021: past 15 minutes nothing counts, whatever the caller asked.
  const stale = await fetchVerificationCode({ userId: USER, ats: "greenhouse", sinceMs: ASKED, maxWaitMs: 0 }, {
    mailbox: async () => fakeBox(() => [greenhouseMail(GH, ASKED + 1_000)]),
    now: () => ASKED + 16 * 60_000,
  });
  eq(stale.status, "not_yet");
  // The search itself asks Gmail only for mail after the ask, by the senders' domains.
  eq(codeQuery("greenhouse", ASKED), `from:(greenhouse-mail.io OR greenhouse.io) after:${ASKED / 1000}`);
});

Deno.test("WO-096 a wrong sender is ignored: the employer's own domain, a look-alike, or a From line Gmail did not authenticate", async () => {
  const text = (code: string) => `Copy and paste this code into the security code field on your application: ${code}`;
  const wrong = [
    mail({ from: "Acme Recruiting <jobs@acme-synthetic.example>", at: ASKED + 2_000, text: text(GH) }),
    mail({ from: "no-reply@greenhouse-mail.io.attacker.example", at: ASKED + 2_000, text: text(GH) }),
    mail({ from: "no-reply@notgreenhouse.io", at: ASKED + 2_000, text: text(GH) }),
    { ...greenhouseMail(GH, ASKED + 2_000), auth: authFor("greenhouse-mail.io", false) },
    { ...greenhouseMail(GH, ASKED + 2_000), auth: [] },
  ];
  for (const m of wrong) {
    const box: CodeMailbox = { search: async () => [m.id], get: async () => m }; // even if the search let it through
    eq((await once(box, "greenhouse")).status, "not_yet", m.from + " " + m.auth.join());
  }
});

Deno.test("WO-096 two different codes: ambiguous, never guessed; the same code sent twice is one code", async () => {
  const two = await once(fakeBox(() => [greenhouseMail(GH, ASKED + 2_000), greenhouseMail(GH_OTHER, ASKED + 9_000)]), "greenhouse");
  eq(two.status, "ambiguous");
  assert(!JSON.stringify(two).includes(GH) && !JSON.stringify(two).includes(GH_OTHER), "an ambiguous result names no code");
  assert(/didn't guess/.test(codeStop("ambiguous", "greenhouse")) && /yourself/.test(codeStop("ambiguous", "greenhouse")));
  const resent = await once(fakeBox(() => [greenhouseMail(GH, ASKED + 2_000), greenhouseMail(GH, ASKED + 9_000)]), "greenhouse");
  assert(resent.status === "found" && resent.code.reveal() === GH);
  // Two codes in one message are ambiguous too.
  const m = mail({ from: "no-reply@greenhouse-mail.io", at: ASKED + 1_000, text: `security code field on your application: ${GH}\nOr the security code is: ${GH_OTHER}` });
  eq((await once({ search: async () => [m.id], get: async () => m }, "greenhouse")).status, "ambiguous");
});

Deno.test("WO-096 no Google connection, or a grant without mail reading: the stop names exactly what to do", async () => {
  const none = await fetchVerificationCode({ userId: USER, ats: "greenhouse", sinceMs: ASKED }, {
    mailbox: careerCodeMailbox({
      connection: async () => null, readVault: async () => null, writeVault: async () => {}, fetch: (() => { throw Error("no network"); }) as any,
      env: { get: () => undefined }, now: () => ASKED,
    }),
    now: () => ASKED,
  });
  eq(none.status, "no_google_connection");
  eq(codeStop("no_google_connection", "greenhouse"), "Connect Google so I can read the code Greenhouse emails you, or type the code on the page yourself.");
  const sendOnly = await fetchVerificationCode({ userId: USER, ats: "lever", sinceMs: ASKED }, {
    mailbox: careerCodeMailbox({
      connection: async () => ({ vault_name: `oauth_google_career_${USER}`, scopes: "https://www.googleapis.com/auth/gmail.send" }),
      readVault: async () => null, writeVault: async () => {}, fetch: (() => { throw Error("no network"); }) as any, env: { get: () => undefined },
      now: () => ASKED,
    }),
    now: () => ASKED,
  });
  eq(sendOnly.status, "scope_missing");
  assert(/allow reading mail/.test(codeStop("scope_missing", "lever")) && /Lever/.test(codeStop("scope_missing", "lever")));
  assert(/type the code/i.test(codeStop("not_yet", "ashby")) && /Ashby/.test(codeStop("not_yet", "ashby")));
});

Deno.test("WO-096 the wait: looks at once, then backs off, about three minutes at most; a late code is still found", async () => {
  let t = ASKED, sleeps: number[] = [];
  const late = greenhouseMail(GH, ASKED + 25_000);
  const seen = { queries: [] as string[], gets: 0 };
  const box = fakeBox(() => (t >= late.internalDate ? [late] : []), seen);
  const r = await fetchVerificationCode({ userId: USER, ats: "greenhouse", sinceMs: ASKED }, {
    mailbox: async () => box, now: () => t, sleep: async (ms) => void (sleeps.push(ms), t += ms),
  });
  assert(r.status === "found" && r.code.reveal() === GH, JSON.stringify(r));
  eq(sleeps, CODE_POLL_DELAYS_MS.slice(0, sleeps.length), "the backoff schedule");
  assert(seen.queries.length === sleeps.length + 1, "one look before any wait");
  // Nothing ever comes: it stops by three minutes and says not_yet.
  t = ASKED;
  sleeps = [];
  const never = await fetchVerificationCode({ userId: USER, ats: "greenhouse", sinceMs: ASKED }, {
    mailbox: async () => fakeBox(() => []), now: () => t, sleep: async (ms) => void (sleeps.push(ms), t += ms),
  });
  eq(never.status, "not_yet");
  assert(sleeps.reduce((a, b) => a + b, 0) <= CODE_MAX_WAIT_MS && sleeps.reduce((a, b) => a + b, 0) >= 150_000, String(sleeps));
  // An answer that is not "not_yet" ends the wait at once.
  let looks = 0;
  const c = clock(ASKED);
  eq((await pollForCode(async () => (looks++, { status: "ambiguous" }), c)).status, "ambiguous");
  eq(looks, 1);
});

Deno.test("WO-096 the real Gmail client: list then get format=full, the body decoded; 401 is no connection, a scope refusal is scope_missing", async () => {
  const b64 = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const urls: string[] = [];
  const full = {
    id: "g1", internalDate: String(ASKED + 3_000),
    payload: {
      headers: [
        { name: "From", value: "Greenhouse <no-reply@us.greenhouse-mail.io>" },
        { name: "Subject", value: "Security code for your application" },
        { name: "Authentication-Results", value: authFor("greenhouse-mail.io")[0] },
      ],
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: b64(`Copy and paste this code into the security code field on your application: ${GH}`) } },
        { mimeType: "text/html", body: { data: b64(`<p>security code field on your application: <b>${GH}</b></p>`) } },
      ],
    },
  };
  const fetcher = (async (url: string, init: any) => {
    urls.push(url);
    assert(init.headers.Authorization === "Bearer TEST-TOKEN");
    if (/\?q=/.test(url)) return new Response(JSON.stringify({ messages: [{ id: "g1" }] }), { status: 200 });
    return new Response(JSON.stringify(full), { status: 200 });
  }) as typeof fetch;
  const r = await once(gmailCodeMailbox({ fetch: fetcher, token: "TEST-TOKEN" }), "greenhouse");
  assert(r.status === "found" && r.code.reveal() === GH, JSON.stringify(r));
  assert(urls[0].startsWith("https://gmail.googleapis.com/gmail/v1/users/me/messages?q=") && /format=full$/.test(urls[1]), urls.join("\n"));
  assert(decodeURIComponent(urls[0]).includes("from:(greenhouse-mail.io OR greenhouse.io) after:"));
  const revoked = gmailCodeMailbox({ fetch: (async () => new Response("{}", { status: 401 })) as any, token: "x" });
  eq((await once(revoked, "greenhouse")).status, "no_google_connection");
  const narrow = gmailCodeMailbox({
    fetch: (async () => new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED", message: "Request had insufficient authentication scopes." } }), { status: 403 })) as any,
    token: "x",
  });
  eq((await once(narrow, "greenhouse")).status, "scope_missing");
  // A passing failure (Gmail's 503) is looked at again, not a stop.
  eq((await once(gmailCodeMailbox({ fetch: (async () => new Response("", { status: 503 })) as any, token: "x" }), "greenhouse")).status, "not_yet");
});

Deno.test("WO-096 the career grant's own scope is the read scope, and the senders are the ATS's own domains", () => {
  eq(CAREER_READ_SCOPE, "https://www.googleapis.com/auth/gmail.readonly");
  eq(ATS_CODE_SENDERS.greenhouse, ["greenhouse-mail.io", "greenhouse.io"]);
  eq(atsOfUrl("https://job-boards.greenhouse.io/acme/jobs/1"), "greenhouse");
  eq(atsOfUrl("https://jobs.lever.co/acme/1/apply"), "lever");
  eq(atsOfUrl("https://jobs.ashbyhq.com/acme/1"), "ashby");
  eq(atsOfUrl("https://acme.wd5.myworkdayjobs.com/x"), "workday");
  eq(atsOfUrl("https://acme-synthetic.example/careers"), null);
});

// ------------------------------------------------------------------------------------------------ the edge function
const JOB_ID = "11111111-2222-3333-4444-555555555555", LEASE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const NOW = ASKED + 30_000;
const driving = (o: Record<string, unknown> = {}) => ({
  user_id: USER, state: "driving", lease_token: LEASE, url: "https://job-boards.greenhouse.io/acme/jobs/1", claimed_at: new Date(ASKED - 60_000).toISOString(), ...o,
});
const call = (body: unknown, token = "TEST-JWT") =>
  new Request("https://fn.example.test/career-email-code", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
  });
function handlerDeps(job: any, box: CodeMailbox, looks: any[] = []) {
  return {
    user: async (t: string) => (t === "TEST-JWT" ? { id: USER } : null),
    job: async (u: string, id: string) => (u === USER && id === JOB_ID ? job : null),
    look: (i: any) => (looks.push(i), fetchVerificationCode(i, { mailbox: async () => box, now: () => NOW })),
    now: () => NOW,
  };
}

Deno.test("WO-096 edge function: only an application the person approved, while it is being sent, under its lease", async () => {
  const box = fakeBox(() => [greenhouseMail(GH, ASKED + 4_000)]);
  const req = { apply_id: JOB_ID, lease: LEASE, since_ms: ASKED };
  const looks: any[] = [];
  const refusals: [string, any, Request][] = [
    ["signed out", driving(), call(req, "")],
    ["someone else's session", driving(), call(req, "OTHER-JWT")],
    ["not approved (queued, never claimed)", driving({ state: "queued", lease_token: null, claimed_at: null }), call(req)],
    ["already finished", driving({ state: "confirmed" }), call(req)],
    ["another drive's lease", driving(), call({ ...req, lease: "ffffffff-0000-0000-0000-000000000000" })],
    ["a drive claimed long ago", driving({ claimed_at: new Date(NOW - DRIVE_WINDOW_MS - 1).toISOString() }), call(req)],
    ["another application", driving(), call({ ...req, apply_id: "99999999-2222-3333-4444-555555555555" })],
  ];
  for (const [why, job, r] of refusals) {
    const res = await handleEmailCode(r, handlerDeps(job, box, looks));
    assert(res.status === 401 || res.status === 403, `${why}: ${res.status}`);
    assert(!(await res.text()).includes(GH), why);
  }
  eq(looks.length, 0, "no refused request ever looked in the mailbox");
  // The posting's own system decides: a Greenhouse application cannot ask for Lever's mail.
  eq((await handleEmailCode(call({ ...req, ats: "lever" }), handlerDeps(driving(), box, looks))).status, 400);
  eq(looks.length, 0);
  // The approved drive: one look, the code in the body (to the page that asked), not cached.
  const ok = await handleEmailCode(call(req), handlerDeps(driving(), box, looks));
  eq(ok.status, 200);
  eq(ok.headers.get("cache-control"), "no-store");
  eq(await ok.json(), { status: "found", code: GH });
  eq(looks.length, 1);
  eq(looks[0].maxWaitMs, 0, "one look per request; the caller polls");
  // since_ms earlier than the drive's claim is moved up to it (less a minute): never an older application's code.
  await handleEmailCode(call({ ...req, since_ms: 0 }), handlerDeps(driving(), box, looks));
  eq(looks[1].sinceMs, Date.parse(driving().claimed_at as string) - 60_000);
  // Not connected: the stop, by name.
  const none = await handleEmailCode(call(req), { ...handlerDeps(driving(), box), look: (i: any) => fetchVerificationCode(i, { mailbox: async () => ({ status: "no_google_connection" }), now: () => NOW }) });
  eq(await none.json(), { status: "no_google_connection", stop: "Connect Google so I can read the code Greenhouse emails you, or type the code on the page yourself." });
  // A posting on an employer's own site (Greenhouse embedded): the caller names the system.
  const embedded = await handleEmailCode(call({ ...req, ats: "greenhouse" }), handlerDeps(driving({ url: "https://acme-synthetic.example/careers?gh_jid=1" }), box));
  eq((await embedded.json()).status, "found");
});

Deno.test("WO-096 redaction: the code is in no log line, no error, no evidence or tracker text, no chat reply", async () => {
  const box = fakeBox(() => [greenhouseMail(GH, ASKED + 4_000)]);
  const { value, lines } = await captured(async () => {
    const r = await once(box, "greenhouse");
    console.log("result", r); // what a careless caller would log
    console.error(`found ${r.status === "found" ? r.code : ""}`);
    const evidence = { code_step: r, stop: null, at: new Date(NOW).toISOString() };
    const tracker = { state: "confirmed", reason: `${r.status}`, evidence };
    const reply = `I typed the code ${r.status === "found" ? r.code : ""} Greenhouse emailed you and sent the application.`;
    let err = "";
    try {
      throw new Error(`fill failed for ${r.status === "found" ? r.code : ""}`);
    } catch (e) {
      err = String(e) + Deno.inspect(e);
    }
    return [JSON.stringify(evidence), JSON.stringify(tracker), reply, err, Deno.inspect(evidence, { depth: 20 })];
  });
  for (const s of [...value, ...lines]) assert(!s.includes(GH), "the code leaked into: " + s);
  // A text that picked the code up from a page (an echo) is cleaned by redactCode.
  eq(redactCode(`Your code ${GH} was accepted`, new EmailCode(GH)), "Your code [emailed code] was accepted");
  // The module and the function never log: nothing of the mailbox can reach a log.
  for (const src of [CORE_SRC, FN_SRC]) assert(!/console\.(log|error|warn|info|debug)/.test(src), "a log call in the code-reading path");
});

Deno.test("WO-096 mail tracking unchanged: verification mail stays noise and is never a tracker update", () => {
  const m = greenhouseMail(GH, ASKED);
  const c = classifyMail({ from: m.from, subject: m.subject, snippet: m.text.slice(0, 200), date: new Date(ASKED).toISOString(), auth: m.auth });
  eq(c.kind, "other");
});

// ------------------------------------------------------------------------------------------------ the drives
const requireCjs = createRequire(import.meta.url);
const Portal = requireCjs("../../packages/domain/149-career-portal-apply.js");

Deno.test("WO-096 end to end in the portal driver: a Greenhouse-shaped form with a code step reaches the doorstep with the code typed", async () => {
  // The SANDBOX board emails its code (into the fake mailbox) when its review asks for it; the reader is the real
  // fetchVerificationCode over that mailbox, as the worker passes it.
  const c = clock(ASKED);
  const inbox: CodeMessage[] = [];
  const board = Portal.createSandboxBoard({ codeStep: { ats: "greenhouse", expect: GH } });
  const atReview = board.atReview.bind(board);
  board.atReview = () => {
    const r = atReview();
    if (r.emailCode && !inbox.length) inbox.push(greenhouseMail(GH, c.now() + 2_000)); // the employer's mail lands
    return r;
  };
  const session = Portal.createPortalSession({ userId: USER, board });
  const log = { records: [] as any[] };
  const input = {
    posting: { canonicalKey: "greenhouse:testco96:1", company: "TestCo 96", url: "https://boards.greenhouse.io/testco96/jobs/1", status: "open", atsFamily: "greenhouse" },
    profile: {
      name: "Alex Testcase (TEST)", email: "alex.testcase@example.test", resume: { filename: "r.pdf", sha256: "a".repeat(64) },
      answers: { work_authorization: { value: "Yes", confirmed: true }, sponsorship: { value: "No", confirmed: true } },
    },
    attestations: { certify_true: { value: true, explicit: true } }, log, nowMs: ASKED,
    approval: { approvedByUser: true, approvalRef: "TEST-BATCH-096" },
  };
  const { value: out, lines } = await captured(() =>
    Portal.runApplyWithEmailCode(session, input, (i: any) => fetchVerificationCode(i, { mailbox: async () => fakeBox(() => inbox), now: c.now, sleep: c.sleep }))
  );
  // D-029 rule 5: filled, then the doorstep waits for the person's own Submit; nothing is pressed for them.
  eq([out.resultStatus, out.code, out.stop], ["awaiting_user", "EMAIL_CODE_FILLED", "Filled the code Greenhouse emailed you. Press Submit to finish."]);
  assert(board.codeAccepted === true, "the code reached the page's code step");
  eq(board.calls.submit, 0);
  const steps = out.stepLog.map((s: any) => s.action);
  assert(steps.indexOf("email_code_filled") < steps.indexOf("doorstep_reached") && !steps.includes("approval_bound"), steps.join(" "));
  for (const s of [JSON.stringify(out), JSON.stringify(log), JSON.stringify(session.doorstep), JSON.stringify(session.submission), ...lines]) {
    assert(!s.includes(GH), "the code is in a record: " + s.slice(0, 160));
  }
  // The same drive without the person's approval: nothing is read, nothing is sent.
  const b2 = Portal.createSandboxBoard({ codeStep: { ats: "greenhouse", expect: GH } });
  let reads = 0;
  const unapproved = await Portal.runApplyWithEmailCode(Portal.createPortalSession({ userId: USER, board: b2 }), { ...input, approval: undefined, log: { records: [] } },
    async () => (reads++, { status: "not_yet" }));
  eq([unapproved.code, unapproved.codeStatus, reads, b2.calls.submit], ["EMAIL_CODE_REQUIRED", "not_approved", 0, 0]);
});

Deno.test("WO-096 the portal driver says the same stops as the reader", () => {
  for (const s of ["no_google_connection", "scope_missing", "ambiguous", "not_yet"] as const) {
    for (const ats of ["greenhouse", "lever", "ashby", "workday"]) eq(Portal.codeStopText(s, ats), codeStop(s, ats), `${s} ${ats}`);
  }
});

Deno.test("WO-096 the person's own worker: an approved drive asks the engine to read the code, as them, for this row only", async () => {
  const job = { id: "J-096", lease_token: "L-096", url: "https://job-boards.greenhouse.io/acme/jobs/1", payload: { engine_approval: "c".repeat(64), resume_sha256: "b".repeat(64), fields: [] } };
  const calls: { args: string[]; env?: Record<string, string> }[] = [];
  const deps = {
    claim: async () => [job], finish: async () => {}, resumeFor: async () => ({ path: "/r.pdf", sha256: "b".repeat(64) }), writeFacts: async () => "/facts.json",
    runEngine: async (args: string[], env?: Record<string, string>) => (calls.push({ args, env }), { result: { state: "confirmed" }, evidence: {} }),
  };
  await runApproved({ ...deps, emailCode: async (j) => ({ UPMORE_ACCESS_TOKEN: "TEST-SESSION", UPMORE_APPLY_JOB_ID: j.id, UPMORE_APPLY_LEASE: j.lease_token }) });
  const a = calls[0].args;
  eq(a.slice(a.indexOf("--email-code"), a.indexOf("--email-code") + 2), ["--email-code", "account"]);
  eq(calls[0].env, { UPMORE_ACCESS_TOKEN: "TEST-SESSION", UPMORE_APPLY_JOB_ID: "J-096", UPMORE_APPLY_LEASE: "L-096" });
  assert(!a.some((x) => /TEST-SESSION|L-096/.test(x)), "the session and the lease never on the command line");
  // Without a session to read as (run-one, a local payload), the engine is not asked to read mail.
  calls.length = 0;
  await runApproved(deps);
  assert(!calls[0].args.includes("--email-code") && calls[0].env === undefined);
});

Deno.test("WO-096 the extension: the code goes from the function's answer into the page only, and the card names the next step", () => {
  // The service worker's code step: the person's own session, this application's row and lease, the shared wait.
  const fn = BACKGROUND.slice(BACKGROUND.indexOf("async function typeEmailCode"), BACKGROUND.indexOf("// ---", BACKGROUND.indexOf("async function typeEmailCode")));
  assert(/functions\/v1\/career-email-code/.test(fn) && /apply_id: p\.id, lease: p\.lease/.test(fn) && /C\.pollForCode/.test(fn), "reads for this row, as the person");
  assert(/dom\.typeCode\(c\)/.test(fn), "typed into the page by the page's own helper");
  assert(!/console\.|keepEvidence|setCard\([^)]*\bcode\b[,)]|p\.code\s*=/.test(fn), "the code is never logged, kept in the pending record, the proof or the card");
  // D-029 rule 5: no press after the fill, anywhere in the extension's code path.
  const typeFn = DOM_SRC.slice(DOM_SRC.indexOf("export function findCodeBox"), DOM_SRC.indexOf("// The screenshot never shows"));
  for (const [name, src] of [["dom.ts", typeFn], ["background.js", fn], ["content.js", CONTENT.slice(CONTENT.indexOf("WO-096"), CONTENT.indexOf("Proof after the click"))]]) {
    assert(!/\.click\(|requestSubmit|\.submit\(|dispatchEvent\(new KeyboardEvent/.test(src), `${name} presses something after the code`);
  }
  assert(/Filled the code \$\{name\} emailed you\. Press Submit to finish\./.test(fn));
  assert(/\[data-trainee-code-box\]/.test(DOM_SRC) && /input\[type=password\], " \+ CODE_BOX/.test(DOM_SRC), "the proof's picture covers the code box");
  assert(/"email-code"/.test(BACKGROUND.slice(BACKGROUND.indexOf("const TAB_ONLY"))), "only an application page may ask");
  assert(/return \{ ok: true, typed: r\.typed, stop: r\.stop \}/.test(BACKGROUND), "the page that asked gets typed/stop, never the code");
  assert(/type: "email-code"/.test(CONTENT) && !/\.code\b(?!_)/.test(CONTENT.slice(CONTENT.indexOf("WO-096"), CONTENT.indexOf("Proof after the click"))));
  eq(cardOutcome({ state: "needs_user", reason: "email_code", confirmation_id: null }, true, codeStop("no_google_connection", "greenhouse")).message,
    "Sent, and the page now asks for the code the employer emailed you. Connect Google so I can read the code Greenhouse emails you, or type the code on the page yourself.");
  eq(cardOutcome({ state: "needs_user", reason: "captcha", confirmation_id: null }, true, "x").message,
    "Sent, and the page now asks you for something (a check or a code). Finish it yourself on the page.");
});

Deno.test("WO-096 the engine: the code is read only after the approved click, and every record it writes is cleaned of it", () => {
  const post = APPLY_SRC.indexOf("const clickAt = Date.now()"), read = APPLY_SRC.indexOf("await readCode(");
  assert(post > 0 && read > post, "mail is read only after the approved click");
  assert(read > APPLY_SRC.indexOf('await answer() !== "yes"'), "and after the person's yes");
  assert(/redactCode\(JSON\.stringify\(evidence, null, 2\), typedCode\)/.test(APPLY_SRC), "the evidence file is cleaned of the code");
  const typeFn = APPLY_SRC.slice(APPLY_SRC.indexOf("async function typeCode"), APPLY_SRC.indexOf("// A verification on the page is the person's"));
  assert(typeFn.length > 0 && !/\.click\(|\.press\(|requestSubmit|keyboard|Enter/.test(typeFn), "D-029 rule 5: the engine never presses after the code");
  assert(/Filled the code \$\{ATS_NAMES\[codeAts!\]\} emailed you\. Press Submit to finish\./.test(APPLY_SRC));
  assert(!/console\.log\([^)]*(typedCode|got\.code|reveal\(\))/.test(APPLY_SRC), "the code is never printed");
  assert(/LOCAL_GMAIL_LOCAL_ONLY/.test(APPLY_SRC), "the loopback Gmail stand-in only for local test pages");
});

Deno.test("WO-096 wiring: the function needs the person's session, is typechecked by the gate, and reads with gmail.readonly only", () => {
  assert(/\[functions\.career-email-code\]\s*\nverify_jwt = true/.test(CONFIG));
  assert(GATE.includes("supabase/functions/career-email-code/index.ts"));
  assert(!/gmail\.(send|modify|compose)|mail\.google\.com\/?"/.test(CORE_SRC.replace(/CAREER_SEND_SCOPE/g, "")), "no scope beyond reading");
  assert(/career_apply_jobs/.test(FN_SRC) && /lease_token/.test(FN_SRC), "the approval check reads the person's own queue row");
});
