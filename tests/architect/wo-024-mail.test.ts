// WO-024: application status from the person's own mail. Synthetic mail, a fake Gmail and in-memory stores only: no
// network, no database, no model. Run: deno test --no-check tests/architect/wo-024-mail.test.ts
import { candidates, classifyMail, followUps, type MailIn, matchApplication, planUpdates, sameCompany, standing, type TrackedApp } from "../../supabase/functions/_shared/career_mail.ts";
import { careerToken, messageHash, readMailSince } from "../../supabase/functions/_shared/career_mail_gmail.ts";
import { memoryMailStore } from "../../supabase/functions/_shared/career_mail_store.ts";
import { memoryAlertStore } from "../../supabase/functions/_shared/career_alert_store.ts";
import { handleProactive } from "../../supabase/functions/career-proactive/handler.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { evaluate } from "../../evals/career/mail-eval.ts";
import labels from "../../evals/career/mail-labels.json" with { type: "json" };

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

// ------------------------------------------------------------------------------------------------ a fake Gmail
interface FakeMsg { id: string; at: number; from: string; subject: string; snippet: string }
function fakeGmail(msgs: FakeMsg[], o: { limitList?: number; limitGet?: number } = {}) {
  const calls: { url: string; method: string; body?: string }[] = [];
  let listLimits = o.limitList ?? 0, getLimits = o.limitGet ?? 0;
  const rate = () => new Response(JSON.stringify({ error: { errors: [{ reason: "rateLimitExceeded" }] } }), { status: 429, headers: { "retry-after": "1" } });
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input), method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? String(init.body) : undefined });
    if (url.startsWith(API + "?")) {
      if (listLimits-- > 0) return rate();
      const after = Number(/after:(\d+)/.exec(decodeURIComponent(url))?.[1] ?? 0) * 1000;
      const ids = msgs.filter((m) => m.at > after).sort((a, b) => b.at - a.at).map((m) => ({ id: m.id }));
      return new Response(JSON.stringify({ messages: ids }), { status: 200 });
    }
    const m = /messages\/([^?]+)\?format=metadata/.exec(url);
    if (m) {
      if (getLimits-- > 0) return rate();
      const msg = msgs.find((x) => x.id === decodeURIComponent(m[1]));
      if (!msg) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ id: msg.id, internalDate: String(msg.at), snippet: msg.snippet,
        payload: { headers: [{ name: "From", value: msg.from }, { name: "Subject", value: msg.subject }, { name: "Date", value: new Date(msg.at).toUTCString() }] } }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}
const mail = (id: string, at: number, from: string, subject: string, snippet: string): FakeMsg => ({ id, at, from, subject, snippet });

function harness(o: { msgs: FakeMsg[]; store: ReturnType<typeof memoryMailStore>; grant?: (u: string) => boolean }) {
  const gmail = fakeGmail(o.msgs), outbox = memoryAlertStore(), runs: any[] = [];
  let now = NOW;
  const run = async (at = now) => {
    now = at;
    const res = await handleProactive(new Request("https://x/", { method: "POST", headers: { "x-trainee-proactive-secret": SECRET } }), {
      env: { get: (k: string) => (k === "CAREER_PROACTIVE_SECRET" ? SECRET : undefined) }, store: () => outbox,
      recentPostings: async () => [], postingsById: async () => [], recordRun: async (r) => { runs.push(r); }, now: () => now,
      mail: { store: () => o.store, read: (u, since, n) => readMailSince({ fetch: gmail.fetch, token: async (id) => ((o.grant ?? (() => true))(id) ? "TEST-TOKEN" : null), sleep: async () => {} }, u, since, n) },
    });
    return { status: res.status, body: await res.json() };
  };
  return { run, outbox, gmail, runs };
}

// ------------------------------------------------------------------------------------------------ the classifier
Deno.test("WO-024/M1 a rejection, an interview and an offer are read from the employer's words; the employer is named", () => {
  const r = classifyMail({ from: "Stripe <no-reply@us.greenhouse-mail.io>", subject: "Your application to Stripe", snippet: "After careful review, we've decided not to move forward with your application.", date: iso(NOW) });
  eq([r.kind, r.company], ["rejection", "Stripe"]);
  assert(r.evidence.length <= 300 && r.evidence.includes("not to move") && r.evidence.includes("Your application to Stripe"), r.evidence);
  eq(classifyMail({ from: "Plaid <no-reply@hire.lever.co>", subject: "Plaid: Let's schedule a chat", snippet: "We would like to set up a 30 minute phone screen.", date: iso(NOW) }).kind, "interview");
  eq(classifyMail({ from: "Target <target@myworkday.com>", subject: "Your job offer from Target", snippet: "We are excited to offer you the Store Team Leader position.", date: iso(NOW) }).kind, "offer");
});

Deno.test("WO-024/M2 never by guess: newsletters, job alerts, receipts, scams and anything unclear are 'other'", () => {
  for (const m of [
    { from: "LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>", subject: "30+ new jobs for 'analyst'", snippet: "Stripe is hiring. Apply now." },
    { from: "Notion Team <team@mail.notion.so>", subject: "What's new in Notion", snippet: "New features. Unsubscribe." },
    { from: "Stripe <notifications@stripe.com>", subject: "Your receipt from Acme Inc #1234", snippet: "Amount paid $25.00." },
    { from: "HR <hr.hiring@gmail.com>", subject: "Job Offer: Remote Data Entry", snippet: "No interview required. We will send you a check to purchase equipment." },
    { from: "Mom <mom@gmail.com>", subject: "Did you hear back from Stripe?", snippet: "Any news on the Stripe interview?" },
    { from: "Someone <someone@example.com>", subject: "Hello", snippet: "Just checking in about the weekend." },
  ]) eq(classifyMail({ ...m, date: iso(NOW) }).kind, "other", m.subject);
  // A personal address never names the employer by its domain: no application called "gmail" is ever opened.
  const p = planUpdates([m("p", NOW, "Pat Lee <pat.lee@gmail.com>", "Re: the role", "Unfortunately we will not be moving forward with your application.")], [], NOW);
  eq([p.events.length, p.unmatched], [0, 1]);
});

Deno.test("WO-024/M3 evidence never holds a long number (an emailed code or an ID)", () => {
  const r = classifyMail({ from: "Goldman Sachs <noreply@gs.com>", subject: "Application Confirmation 4829137", snippet: "Thank you for submitting your application. Your application ID is GS-55102991.", date: iso(NOW) });
  eq(r.kind, "received");
  assert(!/\d{6,}/.test(r.evidence), r.evidence);
});

Deno.test("WO-024/M4 the labeled synthetic set: the tuned splits hold the target; the held-out split is measured, not steered", () => {
  assert(labels.synthetic === true && labels.mails.length >= 150, "at least 150 synthetic, labeled emails");
  const tuned = evaluate(labels.mails.filter((m) => m.split !== "holdout"));
  assert(tuned.status.precision >= 0.97 && tuned.status.recall >= 0.95, JSON.stringify(tuned.status));
  const held = evaluate(labels.mails.filter((m) => m.split === "holdout"));
  // The measured held-out numbers (docs/career/mail-tracking.md) are a floor against regressions, not the target.
  assert(held.total >= 50 && held.status.precision >= 0.88 && held.status.recall >= 0.75, JSON.stringify(held.status));
});

// ------------------------------------------------------------------------------------------------ matching
const app = (ref: string, company: string, more: Partial<TrackedApp> = {}): TrackedApp =>
  ({ ref, company, stage: "Submitted", source: "queue", applied_at: iso(NOW - 20 * DAY), events: [], ...more });

Deno.test("WO-024/M5 a message matches one application by employer, mail domain or board link, or none; never a forced match", () => {
  const apps = [
    app("job:1", "JPMorgan Chase & Co.", { role: "Investment Banking Summer Analyst" }),
    app("job:2", "Stripe", { role: "Software Engineer, New Grad", url: "https://boards.greenhouse.io/stripe/jobs/1" }),
    app("job:3", "Stripe", { role: "Data Analyst" }),
    app("track:a", "Plaid", { source: "tracker" }),
  ];
  const c = (from: string, subject: string, snippet: string) => classifyMail({ from, subject, snippet, date: iso(NOW) });
  eq(matchApplication(c("Jessica Park <jessica.park@jpmchase.com>", "Re: IB Summer Analyst", "Thanks for following up; applications are still being reviewed."), apps)?.ref, "job:1", "a recruiter's own domain");
  eq(matchApplication(c("Plaid <no-reply@hire.lever.co>", "Plaid - Update", "Unfortunately we won't be moving forward."), apps)?.ref, "track:a", "a tracker row, by employer");
  eq(matchApplication(c("Stripe <no-reply@us.greenhouse-mail.io>", "Your application to Stripe", "Thank you for applying to the Data Analyst role at Stripe."), apps)?.ref, "job:3", "the role says which");
  const unclear = c("Stripe <no-reply@us.greenhouse-mail.io>", "Update from Stripe", "We've decided not to move forward at this time.");
  eq([candidates(unclear, apps).length, matchApplication(unclear, apps)], [2, null], "two at Stripe and nothing says which: no match");
  eq(matchApplication(c("Ramp <no-reply@ashbyhq.com>", "Thanks for applying to Ramp", "We received your application."), apps), null, "another employer");
  assert(sameCompany("J.P. Morgan Chase", "JPMorgan") && sameCompany("Datadog", "datadoghq") && !sameCompany("Apple", "Applebee's"), "names");
});

// ------------------------------------------------------------------------------------------------ the plan
const m = (hash: string, at: number, from: string, subject: string, snippet: string): MailIn => ({ hash: hash.padEnd(64, "0"), date: iso(at), from, subject, snippet });

Deno.test("WO-024/M6 stages move forward only; a rejection after an offer is flagged and said, never applied", () => {
  const apps = [app("job:1", "Target", { stage: "Interview rounds" }), app("job:2", "Ramp", { stage: "Offer" })];
  const p = planUpdates([
    m("a", NOW - 3 * DAY, "Target <target@myworkday.com>", "Thank you for applying!", "Thank you for applying to Target. We have received your application."),
    m("b", NOW - 2 * DAY, "Ramp <no-reply@ashbyhq.com>", "Your application at Ramp", "We have decided to pursue other candidates."),
    m("c", NOW - DAY, "Target <target@myworkday.com>", "Your job offer from Target", "We are excited to offer you the position."),
  ], apps, NOW);
  eq(p.events.map((e) => [e.kind, e.stage, e.flagged]), [["received", null, false], ["rejection", null, true], ["offer", "Offer", false]]);
  eq(p.apps.find((a) => a.ref === "job:2")?.stage, "Offer", "the offer stands");
  eq(p.texts.length, 2, "a confirmation of an application already further along says nothing");
  assert(/reads as a rejection.*you are at Offer.*left it at Offer/.test(p.texts[0].text), p.texts[0].text);
});

Deno.test("WO-024/M7 follow-ups: drafted at day 14 and not before; a thank-you and nudge 7 days after an interview; each cites the application and its date", () => {
  const applied = NOW - 14 * DAY;
  const a = app("job:1", "Acme Robotics", { role: "Mechanical Engineer", applied_at: iso(applied) });
  eq(followUps([{ ...a, applied_at: iso(applied + DAY) }], NOW).length, 0, "day 13: nothing");
  const [d] = followUps([a], NOW);
  eq(d.kind, "followup");
  assert(d.text.includes("Acme Robotics") && d.text.includes("Mechanical Engineer") && d.text.includes("Oct 6"), d.text);
  assert(d.basis.includes("applied Oct 6") && d.ref === "job:1", d.basis);
  eq(followUps([{ ...a, events: [{ kind: "rejection", at: iso(NOW - DAY) }], stage: "Rejected" }], NOW).length, 0, "a closed application gets none");
  const interviewed = app("job:2", "Linear", { stage: "Interview rounds", events: [{ kind: "interview", at: iso(NOW - 7 * DAY) }] });
  const [t] = followUps([interviewed], NOW);
  eq(t.kind, "thank_you");
  assert(t.text.includes("Linear") && t.text.includes("Oct 13") && /thank you/i.test(t.text) && /update/i.test(t.text), t.text);
  eq(followUps([{ ...interviewed, events: [{ kind: "interview", at: iso(NOW - 6 * DAY) }] }], NOW).length, 0, "6 quiet days: nothing yet");
});

// ------------------------------------------------------------------------------------------------ the scheduled run
Deno.test("WO-024/M8 the run: a rejection is texted once (kind status, key status:<hash>); a newsletter produces nothing", async () => {
  const store = memoryMailStore({ people: [{ user_id: "U1", read_through: iso(NOW - 3600000) }],
    queue: { U1: [{ id: "00000000-0000-4000-8000-000000000001", company: "Stripe", url: "https://boards.greenhouse.io/stripe/jobs/1", state: "confirmed", created_at: iso(NOW - 5 * DAY), updated_at: iso(NOW - 5 * DAY) }] } });
  const h = harness({ store, msgs: [
    mail("gm-1", NOW - 20 * 60000, "Stripe <no-reply@us.greenhouse-mail.io>", "Your application to Stripe", "After careful review, we've decided not to move forward with your application."),
    mail("gm-2", NOW - 10 * 60000, "Morning Brew <crew@morningbrew.com>", "Bank offers", "JPMorgan reported earnings. Unsubscribe."),
  ] });
  const r = await h.run();
  eq(r.status, 200);
  const out = h.outbox.dump().outbox;
  eq(out.map((o) => o.kind), ["status"]);
  eq(out[0].key, `status:${await messageHash("U1", "gm-1")}`);
  assert(/^Stripe said no on Oct 20\. Marked Rejected\./.test(out[0].text) && out[0].text.length < 200, out[0].text);
  const events = store.dump().events.U1;
  eq(events.map((e) => [e.ref, e.kind, e.stage]), [["job:00000000-0000-4000-8000-000000000001", "rejection", "Rejected"]], "the newsletter left no event");
  eq([r.body.statuses, r.body.followups, h.runs[0].statuses], [1, 0, 1]);
  // The next run re-reads the overlap: the same message is never said twice.
  await h.run(NOW + 5 * 60000);
  eq(h.outbox.dump().outbox.length, 1);
  assert(!JSON.stringify(store.dump()).includes("gm-1"), "the raw Gmail id is never kept");
});

Deno.test("WO-024/M9 an application made by hand is tracked: by its tracker row, or from the employer's own confirmation", async () => {
  const store = memoryMailStore({ people: [{ user_id: "U1", read_through: iso(NOW - 3600000) }],
    tracker: { U1: [{ app_id: "app-jpm-1", company: "JPMorgan Chase & Co.", role: "Investment Banking Summer Analyst", stage: "Submitted", applied_at: iso(NOW - 9 * DAY), events: [{ type: "applied", at: iso(NOW - 9 * DAY) }] }] } });
  const h = harness({ store, msgs: [
    mail("gm-10", NOW - 30 * 60000, "JPMorgan Chase & Co. <jpmc@myworkday.com>", "Next steps: JPMorgan Chase interview", "We are pleased to invite you to a virtual first round interview. Please confirm your availability."),
    mail("gm-11", NOW - 25 * 60000, "Ramp <no-reply@ashbyhq.com>", "Thanks for applying to Ramp", "We received your application for Operations Associate."),
  ] });
  await h.run();
  const ev = store.dump().events.U1;
  eq(ev.map((e) => [e.ref, e.kind, e.stage]), [["track:app-jpm-1", "interview", "Interview rounds"], ["mail:ramp:operations-associate", "received", "Submitted"]]);
  const texts = h.outbox.dump().outbox.map((o) => o.text);
  assert(texts.some((t) => t.startsWith("JPMorgan Chase & Co. (Investment Banking Summer Analyst) wants to interview you")), texts.join("\n"));
  assert(texts.some((t) => t.startsWith("Ramp (Operations Associate) confirmed your application on Oct 20. I'm tracking it.")), texts.join("\n"));
});

Deno.test("WO-024/M10 follow-ups from the run: drafted at day 14, not at day 13, once; offered by text, never sent", async () => {
  const applied = NOW - 13 * DAY;
  const store = memoryMailStore({ people: [{ user_id: "U1", read_through: iso(NOW - 3600000) }],
    queue: { U1: [{ id: "00000000-0000-4000-8000-000000000002", company: "Acme Robotics", title: "Mechanical Engineer", url: "https://jobs.lever.co/acme/1", state: "submitted_unconfirmed", created_at: iso(applied), updated_at: iso(applied) }] } });
  const h = harness({ store, msgs: [] });
  await h.run(NOW);
  eq(h.outbox.dump().outbox.length, 0, "day 13: nothing");
  await h.run(NOW + DAY);
  const out = h.outbox.dump().outbox;
  eq(out.map((o) => [o.kind, o.key]), [["followup", "followup:followup:job:00000000-0000-4000-8000-000000000002"]]);
  assert(/No reply from Acme Robotics \(Mechanical Engineer\) \(applied Oct 7; no reply in 14 days\)\. I drafted a follow-up; it is not sent:/.test(out[0].text), out[0].text);
  eq(store.dump().drafts.U1.length, 1);
  await h.run(NOW + DAY + 3600000);
  eq(h.outbox.dump().outbox.length, 1, "drafted once");
  // Nothing was ever sent by email: every Gmail call was a read (GET), no send or draft endpoint was touched.
  assert(h.gmail.calls.length > 0 && h.gmail.calls.every((c) => c.method === "GET" && !/\/send|\/drafts|\/import|\/insert/.test(c.url)), JSON.stringify(h.gmail.calls));
  assert(h.outbox.dump().outbox.every((o) => o.kind === "status" || o.kind === "followup"));
});

Deno.test("WO-024/M11 no career grant: NOT_WIRED, nothing is read, the cursor stays", async () => {
  const store = memoryMailStore({ people: [{ user_id: "U-NONE", read_through: null }] });
  const h = harness({ store, grant: () => false, msgs: [mail("gm-20", NOW - 60000, "Stripe <no-reply@us.greenhouse-mail.io>", "Your application to Stripe", "We regret to inform you.")] });
  const r = await h.run();
  eq([r.status, h.gmail.calls.length, store.dump().cursors["U-NONE"], h.outbox.dump().outbox.length], [200, 0, undefined, 0]);
});

// ------------------------------------------------------------------------------------------------ the Gmail reader
Deno.test("WO-024/M12 the reader asks for metadata only, since a time, oldest first; returns a hash, never the id", async () => {
  const g = fakeGmail([
    mail("id-new", NOW - 60000, "A <a@x.com>", "new", "n"), mail("id-old", NOW - 7200000, "B <b@x.com>", "old", "o"), mail("id-older", NOW - 3 * DAY, "C <c@x.com>", "too old", "t"),
  ]);
  const r = await readMailSince({ fetch: g.fetch, token: async () => "T" }, "U1", NOW - DAY, NOW);
  eq(r.status, "ok");
  eq(r.mails.map((x) => x.subject), ["old", "new"]);
  eq(r.readThrough, NOW);
  const q = decodeURIComponent(g.calls[0].url);
  assert(q.includes(`after:${Math.floor((NOW - DAY) / 1000)}`) && q.includes("-in:sent"), q);
  assert(g.calls.slice(1).every((c) => c.url.includes("format=metadata") && !c.url.includes("format=full")), "never a body");
  assert(!JSON.stringify(r).includes("id-old") && r.mails[0].hash === await messageHash("U1", "id-old"), "hash, not id");
});

Deno.test("WO-024/M13 rate limits: one polite retry; a second limit stops and the cursor moves only past what was read", async () => {
  const msgs = [mail("a", NOW - 3000, "A <a@x.com>", "1", ""), mail("b", NOW - 2000, "A <a@x.com>", "2", ""), mail("c", NOW - 1000, "A <a@x.com>", "3", "")];
  const once = fakeGmail(msgs, { limitList: 1 });
  eq((await readMailSince({ fetch: once.fetch, token: async () => "T", sleep: async () => {} }, "U1", NOW - DAY, NOW)).status, "ok", "one limit, retried");
  const g = fakeGmail(msgs);
  let gets = 0;
  const limitedAfterOne = (async (u: string | URL | Request, i?: RequestInit) => {
    if (String(u).includes("format=metadata") && ++gets > 1) return new Response(JSON.stringify({ error: { errors: [{ reason: "userRateLimitExceeded" }] } }), { status: 403 });
    return g.fetch(u, i);
  }) as typeof fetch;
  const r = await readMailSince({ fetch: limitedAfterOne, token: async () => "T", sleep: async () => {} }, "U1", NOW - DAY, NOW);
  eq([r.status, r.mails.length, r.readThrough], ["RATE_LIMITED", 1, NOW - 3000]);
  const cap = await readMailSince({ fetch: fakeGmail(msgs).fetch, token: async () => "T" }, "U1", NOW - DAY, NOW, { maxMessages: 2 });
  eq([cap.status, cap.mails.map((x) => x.subject), cap.readThrough], ["ok", ["1", "2"], NOW - 2000], "a long inbox is read in order across runs");
});

Deno.test("WO-024/M14 the career token: none without the grant or its read scope; refreshed and saved when it expires; a revoked grant is NOT_WIRED", async () => {
  const vault: Record<string, string> = { "oauth_google_career_U1": JSON.stringify({ access_token: "old", refresh_token: "R", expires_at: NOW - 1 }) };
  const posts: string[] = [];
  const deps = (status = 200) => ({
    connection: async (u: string) => (u === "U1" ? { vault_name: `oauth_google_career_${u}`, scopes: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send" } : null),
    readVault: async (n: string) => vault[n] ?? null, writeVault: async (n: string, s: string) => { vault[n] = s; },
    fetch: (async (u: string | URL | Request, i?: RequestInit) => { posts.push(`${i?.method} ${u}`); return new Response(JSON.stringify(status === 200 ? { access_token: "fresh", expires_in: 3600 } : { error: "invalid_grant" }), { status }); }) as typeof fetch,
    env: { get: (k: string) => ({ GOOGLE_OAUTH_CLIENT_ID: "TEST-ID", GOOGLE_OAUTH_CLIENT_SECRET: "TEST-SECRET" } as Record<string, string>)[k] }, now: () => NOW,
  });
  eq(await careerToken(deps())("U2"), null, "no grant");
  eq(await careerToken(deps())("U1"), "fresh");
  eq(JSON.parse(vault["oauth_google_career_U1"]).access_token, "fresh");
  eq(posts, ["POST https://oauth2.googleapis.com/token"]);
  eq(await careerToken(deps())("U1"), "fresh", "a live token is used as is");
  vault["oauth_google_career_U1"] = JSON.stringify({ access_token: "old", refresh_token: "R", expires_at: NOW - 1 });
  eq(await careerToken(deps(400))("U1"), null, "revoked");
  const noRead = { ...deps(), connection: async () => ({ vault_name: "oauth_google_career_U1", scopes: ["https://www.googleapis.com/auth/gmail.send"] }) };
  eq(await careerToken(noRead)("U1"), null, "no read scope");
});

// ------------------------------------------------------------------------------------------------ where do I stand
Deno.test("WO-024/M15 'where do I stand with JPMorgan?': every application there, its stage and the last event with its date, from records only", async () => {
  const apps = [app("job:1", "JPMorgan Chase & Co.", { role: "Investment Banking Summer Analyst" }), app("track:t1", "JPMorgan Chase", { role: "Markets Analyst", source: "tracker", applied_at: iso(NOW - 3 * DAY) }), app("job:9", "Stripe")];
  const events = [{ hash: "h".repeat(64), ref: "job:1", kind: "interview" as const, company: "JPMorgan Chase & Co.", stage: "Interview rounds", flagged: false, evidence: "x", at: iso(NOW - 2 * DAY), new_app: false }];
  const s = standing("JPMorgan", apps, events);
  eq(s.found, 2);
  eq(s.text, "JPMorgan Chase & Co. (Investment Banking Summer Analyst): Interview rounds (last: interview email Oct 18)\nJPMorgan Chase (Markets Analyst): Submitted (applied Oct 17, nothing since)");
  eq(standing("Goldman Sachs", apps, events).text, "No application to Goldman Sachs on file.");
  // The brain's tool answers from the same records: the thread's tracker plus what the mail store holds.
  const tool = careerTools({ postings: async () => [], mail: { applications: async () => [apps[0]], events: async () => events } }).find((t) => t.name === "where_do_i_stand")!;
  eq(tool.effect, "read");
  const ctx = { userId: "U1", threadId: "T1", now: NOW, state: { trackStore: { rows: [{ app_id: "t1", company: "JPMorgan Chase", role: "Markets Analyst", stage: "Submitted", applied_at: iso(NOW - 3 * DAY), events: [] }] } } as Record<string, any> };
  eq(((await tool.run({ company: "jpmorgan" }, ctx)) as any).text, s.text);
});
