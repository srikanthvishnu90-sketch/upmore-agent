// WO-040: mail accuracy. The rules on the labeled synthetic set (tuned on dev only), the guards that keep a wrong status
// text from ever reaching the person, and the optional model second pass (CAREER_MAIL_MODEL=on), tested with stub models
// through the real gateway and a fake OpenAI. No network, no database, no key.
// Run: deno test --no-check tests/architect/wo-040-mail-accuracy.test.ts
import { classifyMail, fromEmployer, type MailIn, planUpdates, type TrackedApp } from "../../supabase/functions/_shared/career_mail.ts";
import { MAIL_MODEL_MIN_CONFIDENCE, mailModelConfig, mailModelPayload, mailModelWiring, readVerdict, secondPass } from "../../supabase/functions/_shared/career_mail_model.ts";
import { readMailSince } from "../../supabase/functions/_shared/career_mail_gmail.ts";
import { memoryMailStore } from "../../supabase/functions/_shared/career_mail_store.ts";
import { memoryAlertStore } from "../../supabase/functions/_shared/career_alert_store.ts";
import { handleProactive } from "../../supabase/functions/career-proactive/handler.ts";
import { evaluate, splitsOf } from "../../evals/career/mail-eval.ts";
import labels from "../../evals/career/mail-labels.json" with { type: "json" };
import MODEL_SRC from "../../supabase/functions/_shared/career_mail_model.ts" with { type: "text" };
import INDEX_SRC from "../../supabase/functions/career-proactive/index.ts" with { type: "text" };

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const DAY = 86400000;
const NOW = Date.parse("2026-10-20T15:00:00Z"); // 11:00 in New York: not quiet hours
const iso = (t: number) => new Date(t).toISOString();
const SECRET = "x".repeat(40);
const API = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const meta = (from: string, subject: string, snippet: string) => ({ from, subject, snippet, date: iso(NOW) });
const kind = (from: string, subject: string, snippet: string) => classifyMail(meta(from, subject, snippet)).kind;
const app = (ref: string, company: string, more: Partial<TrackedApp> = {}): TrackedApp =>
  ({ ref, company, stage: "Submitted", source: "queue", applied_at: iso(NOW - 10 * DAY), events: [], ...more });
const mailIn = (hash: string, from: string, subject: string, snippet: string, at = NOW - 3600000): MailIn => ({ hash, from, subject, snippet, date: iso(at) });

// ------------------------------------------------------------------------------------------------ the numbers
Deno.test("WO-040/E1 the set: dev, devcheck and holdout are disjoint; WO-040's synthetic items are dev only, split by the fixed seed", () => {
  const fnv = (s: string) => { let h = 0x811c9dc5; for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h; };
  const mine = labels.mails.filter((m) => m.id.startsWith("W"));
  assert(mine.length >= 100, `at least 100 WO-040 items, got ${mine.length}`);
  for (const m of mine) {
    eq(m.split, fnv(m.id + "wo-040-seed-20261020") % 4 === 0 ? "devcheck" : "dev3", `${m.id} split by the seed`);
    assert(/synthetic/i.test(String((m as any).origin)), `${m.id} is marked synthetic`);
  }
  const held = labels.mails.filter((m) => m.split === "holdout");
  eq([held.length, held.every((m) => /^G\d\d$/.test(m.id))], [50, true], "the holdout is WO-024's 50, nothing added");
  const s = splitsOf(labels.mails as any);
  eq(s.dev.length + s.devcheck.length + s.holdout.length, labels.mails.length, "every item is in exactly one family");
});

Deno.test("WO-040/E2 dev holds the target; devcheck and the holdout are measured floors (VERIFIED in the work order), not steering", () => {
  const s = splitsOf(labels.mails as any);
  const dev = evaluate(s.dev), check = evaluate(s.devcheck), held = evaluate(s.holdout);
  assert(dev.status.precision >= 0.97 && dev.status.recall >= 0.95, `dev ${JSON.stringify(dev.status)}`);
  assert(check.status.precision >= 0.97 && check.status.recall >= 0.95, `devcheck ${JSON.stringify(check.status)}`);
  assert(held.status.precision >= 0.97 && held.status.recall >= 0.95, `holdout ${JSON.stringify(held.status)}`);
  assert(held.company.accuracy === 1 && dev.company.accuracy >= 0.99, "the employer is named right");
});

// ------------------------------------------------------------------------------------------------ causes that generalise
// Fresh wordings, not copied from any labeled item.
Deno.test("WO-040/R1 rejection in the other ways employers write it", () => {
  for (const [from, subject, snippet] of [
    ["Brex <no-reply@ashbyhq.com>", "Brex - update", "Hi Sam, we have decided to take things in a different direction for this role."],
    ["Asana <no-reply@greenhouse.io>", "Your Asana application", "The hiring team has selected another candidate for the Account Manager role."],
    ["Cigna <cigna@myworkday.com>", "Application status", "Your application for Claims Specialist will not be considered further."],
    ["Okta <no-reply@hire.lever.co>", "Okta - Solutions Engineer", "We're closing out your application since the team has moved ahead with other applicants."],
    ["Intuit <intuit@myworkday.com>", "Requisition update", "The Tax Analyst requisition has been cancelled and we will not be filling it."],
  ]) eq(kind(from, subject, snippet), "rejection", subject);
});

Deno.test("WO-040/R2 interviews by their invitation words; a one-way recorded video is an assessment; a step that may come is not one", () => {
  eq(kind("Asana <no-reply@greenhouse.io>", "Asana: next steps", "Hi Sam, the hiring manager would love to talk with you this week."), "interview");
  eq(kind("Okta <no-reply@hire.lever.co>", "Okta - technical screen", "You're invited to a technical screen. Book a slot that works."), "interview");
  eq(kind("Brex <no-reply@ashbyhq.com>", "Brex: you're through", "You've advanced to the next round for Product Designer."), "interview");
  eq(kind("HireVue <noreply@hirevue.com>", "Your Intuit video interview", "Intuit invites you to record your answers to five questions for Tax Analyst."), "assessment");
  eq(kind("Okta <no-reply@hire.lever.co>", "Okta - SQL exercise", "Next step for the Data Analyst role: a 45-minute SQL exercise."), "assessment");
  eq(kind("Cigna <cigna@myworkday.com>", "Application received", "Thank you for applying for Claims Specialist. If you are selected for an interview, a recruiter will call you."), "received");
});

Deno.test("WO-040/R3 non-job mail that shares the words stays 'other': card and loan applications, health assessments, mock interviews, cold outreach", () => {
  for (const [from, subject, snippet] of [
    ["Amex <no-reply@americanexpress.com>", "We received your application", "Thanks for applying for the Gold Card. We'll email you with our decision."],
    ["Lending Club <hello@lendingclub.com>", "Application received", "Your loan application is under review."],
    ["Kaiser Permanente <noreply@kp.org>", "Complete your wellness assessment", "Finish your wellness assessment to earn rewards."],
    ["Career Services <careers@nyu.edu>", "Book a mock interview", "Schedule a mock interview with a coach before recruiting season."],
    ["Jo Ruiz <jo@apex-talentpartners.com>", "Quick question", "Your background caught my eye; would love to set up a call about a role with my client."],
  ]) eq(kind(from, subject, snippet), "other", subject);
});

// ------------------------------------------------------------------------------------------------ safety invariants
Deno.test("WO-040/S1 a scam or look-alike 'offer' is never texted: look-alike domains, payment apps, and a display name on a stranger's domain", () => {
  eq(kind("Okta Careers <offers@okta-careers.net>", "Offer of employment", "We are pleased to extend an offer for the Solutions Engineer role."), "other");
  eq(kind("Okta <hr@oktahq-staffing.com>", "Job offer", "Congratulations, you're hired! Your first pay comes by Zelle."), "other");
  // The display name says the employer the person applied to; the domain is not that employer's: no text, nothing tracked.
  const p = planUpdates([mailIn("s1", "Okta <offers@oktajobs.co>", "Your offer from Okta", "We are pleased to offer you the Solutions Engineer position.")], [app("job:1", "Okta", { role: "Solutions Engineer" })], NOW);
  eq([p.texts.length, p.events.length, p.refused], [0, 0, 1], "a spoofed display name never moves an application");
  // The employer's own domain and its ATS do.
  const ok = planUpdates([mailIn("s2", "Okta <no-reply@hire.lever.co>", "Your offer from Okta", "We are pleased to offer you the Solutions Engineer position.")], [app("job:1", "Okta", { role: "Solutions Engineer" })], NOW);
  eq([ok.texts.length, ok.events[0]?.stage], [1, "Offer"]);
  assert(fromEmployer({ kind: "offer", company: "Okta", domain: "okta.com", evidence: "" }, app("job:1", "Okta")), "okta.com is Okta's");
});

Deno.test("WO-040/S2 a hand application starts tracking only on the employer's own 'received'; no other kind, no model, starts one", () => {
  const recv = planUpdates([mailIn("h1", "Brex <no-reply@ashbyhq.com>", "Thanks for applying to Brex", "We received your application for Product Designer.")], [], NOW);
  eq([recv.events.length, recv.events[0]?.new_app, recv.texts.length], [1, true, 1]);
  const inv = planUpdates([mailIn("h2", "Brex <no-reply@ashbyhq.com>", "Brex interview", "We'd like to schedule a phone interview for Product Designer.")], [], NOW);
  eq([inv.events.length, inv.unmatched], [0, 1], "an interview about nothing on file is never texted");
  const decided = new Map([["h3", { kind: "received" as const, company: "Brex", domain: "ashbyhq.com", evidence: "model received 0.99", source: "model" as const }]]);
  const viaModel = planUpdates([mailIn("h3", "Brex <no-reply@ashbyhq.com>", "Brex", "Your materials are with the team.")], [], NOW, decided);
  eq([viaModel.events.length, viaModel.unmatched], [0, 1], "the model's 'received' never opens an application");
});

// ------------------------------------------------------------------------------------------------ the second pass
// A fake OpenAI: each request's body is kept; the answer is whatever the test says, with usage so the cost is metered.
function fakeOpenAI(answer: (body: any) => string | Error) {
  const bodies: any[] = [];
  const request = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    bodies.push(body);
    const a = answer(body);
    if (a instanceof Error) return new Response(JSON.stringify({ error: { type: "server_error", message: a.message } }), { status: 500 });
    return new Response(JSON.stringify({ id: "x", model: body.model, choices: [{ message: { content: a }, finish_reason: "stop" }], usage: { prompt_tokens: 320, completion_tokens: 18 } }), { status: 200 });
  }) as typeof fetch;
  return { request, bodies };
}
const ENV = (more: Record<string, string> = {}) => ({ get: (k: string) => ({ OPENAI_API_KEY: "sk-test-not-real", CAREER_MODEL: "gpt-5-mini", ...more } as Record<string, string>)[k] });
function costSink() {
  const rows: any[] = [];
  const admin = { from: (t: string) => ({ insert: async (row: any) => { rows.push({ table: t, ...row }); return { error: null }; } }) };
  return { admin, rows };
}
// An ambiguous message (rules: "other", but a step word from the employer's ATS) and a clear one.
const VAGUE = mailIn("v1", "Asana <no-reply@greenhouse.io>", "Asana - update on your application", "Hi Sam, thanks for your patience. We have news about the Account Manager role; please see the portal.");
const CLEAR = mailIn("c1", "Asana <no-reply@greenhouse.io>", "Your Asana application", "Unfortunately, we have decided not to move forward with your application.");

Deno.test("WO-040/M1 only ambiguous mail goes to the model, and only its From, Subject and snippet: no body, no date, no hash", async () => {
  assert(classifyMail(VAGUE).ambiguous === true && classifyMail(VAGUE).kind === "other", "the vague one is ambiguous");
  assert(!classifyMail(CLEAR).ambiguous, "a clear rejection is not");
  assert(!classifyMail(meta("Shopwise <no-reply@shopwise.example>", "Update on your order status", "A special offer is waiting; schedule your delivery.")).ambiguous, "a shop's order status is not sent");
  const seen: any[] = [];
  const sp = await secondPass([VAGUE, CLEAR], async (payload) => { seen.push(payload); return { content: [{ type: "text", text: '{"kind":"none","confidence":0.9}' }] }; });
  eq([sp.asked, seen.length], [1, 1]);
  const user = seen[0].messages[0].content as string;
  eq(user.split("\n").map((l: string) => l.split(":")[0]), ["From", "Subject", "Snippet"]);
  assert(!JSON.stringify(seen[0]).includes(VAGUE.date) && !JSON.stringify(seen[0]).includes("v1"), "no date, no hash");
  assert(user.includes(VAGUE.snippet) && user.includes(VAGUE.subject), "the snippet and subject as Gmail gave them");
  eq(Object.keys(mailModelPayload(VAGUE)).sort(), ["max_tokens", "messages", "system"]);
});

Deno.test("WO-040/M2 guardrails: garbage, a kind outside the list, a string or out-of-range confidence, or under the threshold is 'none'", async () => {
  for (const text of ["I think it's an offer!", '{"kind":"hired","confidence":0.99}', '{"kind":"offer","confidence":"0.99"}', '{"kind":"offer","confidence":7}', '{"kind":"other","confidence":0.99}', `{"kind":"interview","confidence":${MAIL_MODEL_MIN_CONFIDENCE - 0.01}}`, ""]) {
    const sp = await secondPass([VAGUE], async () => ({ content: [{ type: "text", text }] }));
    eq(sp.decided.size, 0, `refused: ${text}`);
  }
  eq(readVerdict({ content: [{ type: "text", text: 'Sure: {"kind": "Interview", "confidence": 0.93}' }] }), { kind: "interview", confidence: 0.93 });
  const thrown = await secondPass([VAGUE], async () => { throw new Error("provider down"); });
  eq([thrown.decided.size, thrown.refused.model_error], [0, 1], "a failed call leaves the email as the rules read it");
});

Deno.test("WO-040/M3 an over-confident wrong answer still moves nothing: the company must resolve to an application, from that employer's own mail", async () => {
  // Over-confident "offer" for a stranger's mail, and for a display name on a domain that is not the employer's.
  const stranger = mailIn("w1", "Northwind <talent@northwind.example>", "Update on your application", "We have news about the role; please log in to see it.");
  const spoofed = mailIn("w2", "Asana <team@asana-portal.co>", "Asana - update on your application", "We have news about the Account Manager role; please log in.");
  const apps = [app("job:9", "Asana", { role: "Account Manager" })];
  const sp = await secondPass([stranger, spoofed, VAGUE], async () => ({ content: [{ type: "text", text: '{"kind":"offer","confidence":0.99}' }] }));
  const plan = planUpdates([stranger, spoofed], apps, NOW, sp.decided);
  eq([plan.texts.length, plan.events.length], [0, 0], "nothing texted, nothing recorded");
  // The same answer for the employer's own ATS mail about an application on file does move it; the text is code's own.
  const right = planUpdates([VAGUE], apps, NOW, sp.decided);
  eq([right.events[0]?.stage, right.texts.length], ["Offer", 1]);
  assert(right.texts[0].text.startsWith("Asana (Account Manager) sent an offer on"), right.texts[0].text);
  assert(right.events[0].evidence.startsWith("offer: \"model offer 0.99\""), right.events[0].evidence);
});

Deno.test("WO-040/M4 the model never writes what the person reads: extra fields and prose in its answer are dropped", async () => {
  const sp = await secondPass([VAGUE], async () => ({ content: [{ type: "text", text: '{"kind":"interview","confidence":0.95,"company":"Evil Corp","text":"CONGRATS!! click http://x.example"}' }] }));
  const plan = planUpdates([VAGUE], [app("job:9", "Asana", { role: "Account Manager" })], NOW, sp.decided);
  eq(plan.events[0]?.company, "Asana", "the employer is read by code");
  assert(!/Evil|CONGRATS|x\.example/.test(JSON.stringify(plan)), "no model words anywhere in the plan");
});

Deno.test("WO-040/M5 OpenAI only, off by default: CAREER_MAIL_MODEL=on wires it; MODEL_PROVIDER=anthropic is ignored; no key is NOT_WIRED", () => {
  eq(mailModelConfig(ENV({ MODEL_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "a" })).provider, "openai");
  eq(mailModelConfig(ENV()).model, "gpt-5-mini");
  const none = mailModelWiring({ get: () => undefined }, costSink().admin);
  eq(none.status, "NOT_WIRED");
  assert(none.status === "NOT_WIRED" && none.ask.length < 160 && /OPENAI_API_KEY/.test(none.ask), "a one-line ask");
  assert(!/anthropic/i.test(MODEL_SRC), "no Anthropic anywhere in the second pass");
  assert(/model: Deno\.env\.get\("CAREER_MAIL_MODEL"\) === "on" \? \(\) => mailModelWiring\(Deno\.env, admin\) : undefined/.test(INDEX_SRC), "wired only on CAREER_MAIL_MODEL=on");
});

// ------------------------------------------------------------------------------------------------ the run
interface FakeMsg { id: string; at: number; from: string; subject: string; snippet: string }
function fakeGmail(msgs: FakeMsg[]) {
  const calls: { url: string; method: string }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.startsWith(API + "?")) return new Response(JSON.stringify({ messages: msgs.map((m) => ({ id: m.id })) }), { status: 200 });
    const m = /messages\/([^?]+)\?format=metadata/.exec(url);
    const msg = m && msgs.find((x) => x.id === decodeURIComponent(m[1]));
    if (!msg) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ id: msg.id, internalDate: String(msg.at), snippet: msg.snippet, payload: { headers: [{ name: "From", value: msg.from }, { name: "Subject", value: msg.subject }] } }), { status: 200 });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}
async function run(o: { msgs: FakeMsg[]; apps?: any[]; env?: ReturnType<typeof ENV> | null; answer?: (b: any) => string | Error }) {
  const store = memoryMailStore({ people: [{ user_id: "U1", read_through: iso(NOW - 3600000) }], queue: { U1: o.apps ?? [] } });
  const gmail = fakeGmail(o.msgs), outbox = memoryAlertStore(), ai = fakeOpenAI(o.answer ?? (() => '{"kind":"none","confidence":0.9}')), costs = costSink();
  const res = await handleProactive(new Request("https://x/", { method: "POST", headers: { "x-trainee-proactive-secret": SECRET } }), {
    env: { get: (k: string) => (k === "CAREER_PROACTIVE_SECRET" ? SECRET : undefined) }, store: () => outbox,
    recentPostings: async () => [], postingsById: async () => [], recordRun: async () => {}, now: () => NOW,
    mail: {
      store: () => store,
      read: (u, since, n) => readMailSince({ fetch: gmail.fetch, token: async () => "TEST-TOKEN" }, u, since, n),
      model: o.env === null ? undefined : () => mailModelWiring(o.env ?? ENV(), costs.admin, ai.request),
    },
  });
  return { body: await res.json(), outbox: outbox.dump().outbox, store: store.dump(), gmail, ai, costs };
}
const queued = (company: string, title: string) => ({ id: 7, company, title, url: "https://boards.greenhouse.io/asana/jobs/7", state: "confirmed", created_at: iso(NOW - 9 * DAY), updated_at: iso(NOW - 9 * DAY) });
const VAGUE_MSG: FakeMsg = { id: "g-1", at: NOW - 20 * 60000, from: VAGUE.from, subject: VAGUE.subject, snippet: VAGUE.snippet };

Deno.test("WO-040/W1 the run with the second pass: the model's confident reading moves the application once; its cost is one agent_turn_costs row", async () => {
  const r = await run({ msgs: [VAGUE_MSG], apps: [queued("Asana", "Account Manager")], answer: () => '{"kind":"interview","confidence":0.94}' });
  eq([r.body.mail_model, r.body.mail_model_calls, r.body.mail_model_decided, r.body.statuses], ["on", 1, 1, 1]);
  eq(r.outbox.length, 1);
  assert(r.outbox[0].text.startsWith("Asana (Account Manager) wants to interview you"), r.outbox[0].text);
  eq(r.ai.bodies.map((b) => b.model), ["gpt-5-mini"], "one call, on the career model");
  eq(r.costs.rows.length, 1);
  const c = r.costs.rows[0];
  eq([c.table, c.user_id, c.thread_id, c.provider, c.calls, c.input_tokens, c.output_tokens], ["agent_turn_costs", "U1", null, "openai", 1, 320, 18]);
  assert(c.usd_micros > 0, "priced from the gateway's table");
});

Deno.test("WO-040/W2 off by default and NOT_WIRED without a key: no model call, no cost row, the rules alone decide", async () => {
  const off = await run({ msgs: [VAGUE_MSG], apps: [queued("Asana", "Account Manager")], env: null });
  eq([off.body.mail_model, off.ai.bodies.length, off.costs.rows.length, off.outbox.length], [undefined, 0, 0, 0]);
  const nokey = await run({ msgs: [VAGUE_MSG], apps: [queued("Asana", "Account Manager")], env: { get: () => undefined } as any });
  eq([nokey.body.mail_model, nokey.ai.bodies.length, nokey.costs.rows.length, nokey.outbox.length], ["NOT_WIRED", 0, 0, 0]);
  assert(/OPENAI_API_KEY/.test(nokey.body.mail_model_ask), "the one-line ask is in the run's answer");
});

Deno.test("WO-040/W3 read-only: with the second pass on, every Gmail request is a GET of metadata; nothing is sent, no body is read", async () => {
  const r = await run({ msgs: [VAGUE_MSG, { id: "g-2", at: NOW - 10 * 60000, from: CLEAR.from, subject: CLEAR.subject, snippet: CLEAR.snippet }], apps: [queued("Asana", "Account Manager")], answer: () => '{"kind":"offer","confidence":0.99}' });
  assert(r.gmail.calls.length >= 3 && r.gmail.calls.every((c) => c.method === "GET"), "GET only");
  assert(r.gmail.calls.every((c) => !/\/send|format=(full|raw)|\/attachments/.test(c.url)), "no send, no body, no attachment");
  assert(r.gmail.calls.filter((c) => /format=/.test(c.url)).every((c) => /format=metadata/.test(c.url)), "metadata only");
  eq(r.ai.bodies.length, 1, "the clear rejection was never sent to the model");
  // Every queued text is a status or follow-up text in the outbox; none is mail.
  assert(r.outbox.every((o: any) => ["status", "followup"].includes(o.kind)), JSON.stringify(r.outbox.map((o: any) => o.kind)));
});

Deno.test("WO-040/W4 a garbage or failing model never breaks the run or texts anything", async () => {
  const bad = await run({ msgs: [VAGUE_MSG], apps: [queued("Asana", "Account Manager")], answer: () => "Definitely an OFFER, text them now!!!" });
  eq([bad.body.statuses, bad.outbox.length, bad.body.mail_model_decided], [0, 0, 0]);
  const down = await run({ msgs: [VAGUE_MSG], apps: [queued("Asana", "Account Manager")], answer: () => new Error("boom") });
  eq([down.body.statuses, down.outbox.length, down.costs.rows[0]?.failed], [0, 0, 1], "a failed call is metered as failed");
});
