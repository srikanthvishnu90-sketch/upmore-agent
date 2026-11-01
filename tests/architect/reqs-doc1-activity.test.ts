// REQS DOC 1 (Q21, Q249, Q34): "what did you do today?", "what did you send this week?", "how many applications did you
// send?" answered by code with counts from the records, the window named, the counting method said. Outcome checks: the
// counts equal the seeded career_apply_jobs and career_outreach_drafts rows inside the person's own day, through the REAL
// handler (handleChat) on real Postgres; the pure parts (the asks, the window across a daylight-saving change, the text)
// are checked on their own first.
// Run: deno test -A --no-check --import-map=tests/flow/supabase-npm.json tests/architect/reqs-doc1-activity.test.ts
import assertNode from "node:assert/strict";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, type Chat, supabaseParity } from "../flow/handler.ts";
import { activityAsk, activityText, activityTurn, localMidnight, windowOf, type ActivityRows } from "../../supabase/functions/_shared/career_activity.ts";
import { receiptAsk } from "../../supabase/functions/_shared/career_apply_receipt_read.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const HOUR = 3_600_000, DAY = 86_400_000;
// Tuesday 2026-11-03, 3:00 PM in Chicago (CST, after the daylight-saving change on Nov 1) = 21:00 UTC.
const T0 = Date.UTC(2026, 10, 3, 21, 0);
const CHI = "America/Chicago";
const iso = (t: number) => new Date(t).toISOString();
const BANNED = /great question|let me know if|anything else|happy to help|how can i help/i;

Deno.test("ACT/1 the asks: today, yesterday and the week; a receipt, a status or a search ask is not one", () => {
  eq(activityAsk("how much did we do today?"), { span: "today", said: true });
  eq(activityAsk("what did you do today"), { span: "today", said: true });
  eq(activityAsk("hey what did you send today?"), { span: "today", said: true });
  eq(activityAsk("What have you done for me this week?"), { span: "week", said: true });
  eq(activityAsk("how many applications did you send this week"), { span: "week", said: true });
  eq(activityAsk("how many emails have you sent"), { span: "week", said: false });
  eq(activityAsk("what did you get done yesterday"), { span: "yesterday", said: true });
  eq(activityAsk("give me a recap of today"), { span: "today", said: true });
  eq(activityAsk("daily recap"), { span: "today", said: true });
  eq(activityAsk("what did you send"), { span: "week", said: false });
  eq(activityAsk("what have you been up to lately"), { span: "week", said: true });
  for (const m of ["what did you send to Acme", "what did you send Acme exactly", "where are my applications", "any update?", "find me data analyst jobs today",
    "what did you do with my resume", "what should I do today", "recap", "summary", "what did I apply to", "show me the receipt for Stripe"]) eq(activityAsk(m), null, m);
  // Before: the receipt ask read "today" as a company. The handler now asks the activity turn first (ACT/5).
  assert(receiptAsk("what did you send today"), "the receipt ask still matches it on its own, so the handler's order is what fixes it");
});

Deno.test("ACT/2 the window: the person's own midnight, across a daylight-saving change; no zone is UTC and said", () => {
  eq(localMidnight(2026, 11, 3, CHI), Date.UTC(2026, 10, 3, 6), "CST midnight is 06:00 UTC");
  eq(localMidnight(2026, 10, 31, CHI), Date.UTC(2026, 9, 31, 5), "CDT midnight is 05:00 UTC");
  eq(localMidnight(2026, 11, 1, CHI), Date.UTC(2026, 10, 1, 5), "the change day starts in CDT");
  const today = windowOf("today", T0, CHI);
  eq([today.from, today.to, today.zoneSaid], [Date.UTC(2026, 10, 3, 6), T0, false]);
  assert(/^Today \(since midnight, America\/Chicago\)$/.test(today.label), today.label);
  const y = windowOf("yesterday", T0, CHI);
  eq([y.from, y.to], [Date.UTC(2026, 10, 2, 6), Date.UTC(2026, 10, 3, 6)]);
  const w = windowOf("week", T0, CHI);
  eq(w.from, Date.UTC(2026, 9, 28, 5), "7 calendar days: Oct 28 (CDT) to today");
  assert(/^The last 7 days \(Oct 28 to Nov 3, America\/Chicago\)$/.test(w.label), w.label);
  const u = windowOf("today", T0, null);
  eq([u.from, u.zoneSaid], [Date.UTC(2026, 10, 3), true]);
  assert(/UTC, since I don't have your time zone/.test(u.label), u.label);
  eq(windowOf("today", T0, "Not/AZone").zoneSaid, true, "an unusable zone is never used");
});

const app = (company: string, state: string, created: number, updated = created) => ({ company, state, created_at: iso(created), updated_at: iso(updated) });
const mail = (name: string, firm: string, status: string, at: number) => ({ name, firm, status, sent_at: iso(at) });

Deno.test("ACT/3 the text: counts equal the rows inside the window; confirmed apart from not confirmed; method said; unreadable named", () => {
  const start = Date.UTC(2026, 10, 3, 6);
  const rows: ActivityRows = { tz: CHI, apps: [
    app("Acme", "confirmed", start + HOUR, start + 2 * HOUR),
    app("Globex", "submitted_unconfirmed", start + HOUR, start + 3 * HOUR),
    app("Hooli", "needs_user", start + 4 * HOUR),
    app("Umbrella", "queued", start + 5 * HOUR),
    app("Initech", "failed", start - 2 * DAY, start + 6 * HOUR),
    app("Oldco", "confirmed", start - 3 * DAY, start - 3 * DAY), // outside today
    app("Lastnight", "submitted_unconfirmed", start - 1, start - 1), // one millisecond before midnight
  ], emails: [mail("Maya Chen", "Ramp", "sent", start + HOUR), mail("Leo Park", "Stripe", "bounced", start + 2 * HOUR), mail("Old Sent", "Brex", "sent", start - DAY),
    mail("Still Sending", "Mercury", "sending", start + 3 * HOUR), mail("Failed Send", "Plaid", "failed", start + 3 * HOUR)] };
  const t = activityText(rows, windowOf("today", T0, CHI), { span: "today", said: true });
  eq(t.status, "shown");
  const first = t.reply.split("\n")[0];
  eq(first, "Today (since midnight, America/Chicago): 4 applications approved and queued, 2 sent to the employer (1 confirmed by the employer, 1 not confirmed yet) and 2 emails sent from your account.");
  assert(/Confirmed by the employer: Acme\./.test(t.reply) && /Sent, no confirmation from the employer yet: Globex\./.test(t.reply), t.reply);
  assert(/Stopped, waiting on you: Hooli\./.test(t.reply) && /Did not go through: Initech\./.test(t.reply) && /Queued and not sent yet: Umbrella\./.test(t.reply), t.reply);
  assert(/Emails went to: Maya Chen at Ramp, Leo Park at Stripe \(1 bounced back\)\./.test(t.reply), t.reply);
  assert(!/Oldco|Lastnight|Brex/.test(t.reply), `nothing outside the window: ${t.reply}`);
  assert(!/Mercury|Plaid/.test(t.reply), `an email still sending or that failed was not sent: ${t.reply}`);
  assert(/^How I counted: .*nothing is estimated\.$/m.test(t.reply), t.reply);
  assert(!BANNED.test(t.reply) && !/—|;/.test(t.reply), `plain, no banned phrase, no em-dash or semicolon: ${t.reply}`);
  // The week: days with work counted in the person's own days.
  const wk = activityText(rows, windowOf("week", T0, CHI), { span: "week", said: false });
  assert(/^You didn't say when, so this is the last 7 days\.\nThe last 7 days/.test(wk.reply), wk.reply);
  assert(/: 7 applications approved and queued, 4 sent to the employer \(2 confirmed by the employer, 2 not confirmed yet\) and 3 emails sent/.test(wk.reply), wk.reply);
  assert(/Days with work: 4 of 7\./.test(wk.reply), `Oct 31, Nov 1, Nov 2 and Nov 3 (Chicago): ${wk.reply}`);
  // Nothing on record: said, never padded.
  const none = activityText({ tz: CHI, apps: [], emails: [] }, windowOf("today", T0, CHI), { span: "today", said: true });
  eq(none.status, "none");
  assert(/nothing happened\. No application was queued or sent, and no email went out/.test(none.reply), none.reply);
  // A record that could not be read is named and not counted; the other is still counted.
  const lost = activityText({ tz: CHI, apps: rows.apps, emails: null }, windowOf("today", T0, CHI), { span: "today", said: true });
  eq(lost.status, "partial");
  assert(/Not read just now, so not counted: your email log\./.test(lost.reply) && !/emails? sent from your account/.test(lost.reply), lost.reply);
  const noQueue = activityText({ tz: CHI, apps: null, emails: rows.emails }, windowOf("today", T0, CHI), { span: "today", said: true });
  eq(noQueue.status, "partial");
  assert(/Not read just now, so not counted: your application queue\./.test(noQueue.reply) && !/applications? approved/.test(noQueue.reply) && /2 emails sent/.test(noQueue.reply), noQueue.reply);
  const gone = activityText({ tz: null, apps: null, emails: null }, windowOf("today", T0, null), { span: "today", said: true });
  eq(gone.status, "unreadable");
  assert(/can't count anything/.test(gone.reply) && !/\d+ applications?/.test(gone.reply), gone.reply);
});

Deno.test("ACT/4 the turn: the read is asked only for an activity ask; a failed read is said", async () => {
  let reads = 0;
  const read = async () => { reads++; return { tz: CHI, apps: [], emails: [] } as ActivityRows; };
  eq(await activityTurn({ message: "where are my applications", userId: "U", now: T0, read }), null);
  eq(reads, 0);
  const r = (await activityTurn({ message: "what did you do today", userId: "U", now: T0, read }))!;
  eq([r.intent, r.status, reads], ["career_activity", "none", 1]);
  const f = (await activityTurn({ message: "what did you do today", userId: "U", now: T0, read: async () => { throw new Error("down"); } }))!;
  eq(f.status, "unreadable");
});

const PEOPLE: Record<string, string> = { "tok-a1": "7b0f8f8e-6a43-4a49-9d2c-0000000ac701", "tok-a2": "7b0f8f8e-6a43-4a49-9d2c-0000000ac702" };
const HASH = "a".repeat(64);

Deno.test({ name: "ACT/5 the real handler on real Postgres: counts equal the seeded rows in the person's day; another person's rows never counted", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (!pgBinDir()) { if (CI) throw new Error("needs Postgres 16 in CI"); console.log("NOT_RUN locally: no Postgres binaries"); return; }
  const pg: Pg = await startPg();
  let handler: Awaited<ReturnType<typeof careerHandler>> | null = null;
  const realNow = Date.now;
  try {
    await supabaseParity(pg);
    for (const [tok, id] of Object.entries(PEOPLE)) {
      await pg.sql(`insert into auth.users (id, email) values ('${id}', '${tok}@example.test'); insert into public.profiles (id) values ('${id}');
        insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');`);
    }
    const [A1, A2] = [PEOPLE["tok-a1"], PEOPLE["tok-a2"]];
    await pg.sql(`insert into public.career_alert_prefs (user_id, tz, prefs, last_checked_at) values ('${A1}', '${CHI}', '{"on": false, "keywords": ["data analyst"], "locations": [], "remote_ok": true, "report_hour": 8, "quiet_start": 22, "quiet_end": 7, "max_instant_per_day": 3}', now());`);
    const start = Date.UTC(2026, 10, 3, 6); // midnight in Chicago
    // A confirmed row carries the employer's matched email (the database refuses a confirmation without one).
    const job = (u: string, n: number, company: string, state: string, created: number, updated = created) => {
      const sent = state === "confirmed" || state === "submitted_unconfirmed", mail = state === "confirmed";
      return `insert into public.career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash, state, created_at, updated_at, attempts, email_confirmed_at, confirmation_mail_hash)
       values ('${u}', 'gh:${n}', '${company}', 'https://example.test/${n}', '{"title":"Data Analyst"}', '${HASH}', '${HASH}', '${state}', '${iso(created)}', '${iso(updated)}', ${sent ? 1 : 0}, ${mail ? `'${iso(updated)}'` : "null"}, ${mail ? `'${"b".repeat(64)}'` : "null"});`;
    };
    // Setup, not the person acting: past rows written as the worker left them, so the queue's write-time guards (the
    // resume sent, the employer's matched email) are off for this seed only; every check constraint still holds.
    await pg.sql(["set session_replication_role = replica;",
      job(A1, 1, "Acme", "confirmed", start + HOUR, start + 2 * HOUR),
      job(A1, 2, "Globex", "submitted_unconfirmed", start + HOUR, start + 3 * HOUR),
      job(A1, 3, "Hooli", "needs_user", start + 4 * HOUR),
      job(A1, 4, "Umbrella", "queued", start + 5 * HOUR),
      job(A1, 5, "Oldco", "confirmed", start - 3 * DAY, start - 3 * DAY),
      job(A1, 6, "Lastnight", "submitted_unconfirmed", start - 60_000, start - 60_000),
      job(A2, 7, "Otherco", "confirmed", start + HOUR, start + HOUR),
      "set session_replication_role = origin;",
    ].join("\n"));
    const draft = (u: string, n: number, name: string, firm: string, status: string, at: number) =>
      `insert into public.career_outreach_drafts (user_id, batch_id, n, recipient, recipient_email, subject, body, footer, hash, status, approved_hash, approved_at, sent_at, gmail_id)
       values ('${u}', '00000000-0000-4000-8000-00000000000${u === A1 ? 1 : 2}', ${n}, '${JSON.stringify({ name, firm, title: "", school: "", email: `x${n}@example.test`, source: "test" })}',
       'x${n}@example.test', 'Hello', 'Body', 'Footer', '${HASH}', '${status}', ${status === "shown" ? "null" : `'${HASH}'`}, ${status === "shown" ? "null" : `'${iso(at)}'`}, ${status === "shown" ? "null" : `'${iso(at)}'`}, ${status === "shown" ? "null" : `'g${n}'`});`;
    await pg.sql([
      draft(A1, 1, "Maya Chen", "Ramp", "sent", start + HOUR),
      draft(A1, 2, "Leo Park", "Stripe", "replied", start + 2 * HOUR),
      draft(A1, 3, "Not Sent", "Brex", "shown", start + 3 * HOUR),
      draft(A1, 6, "Still Sending", "Brex", "sending", start + 3 * HOUR),
      draft(A1, 4, "Old Sent", "Plaid", "sent", start - 2 * DAY),
      draft(A2, 5, "Other Person", "Mercury", "sent", start + HOUR),
    ].join("\n"));
    handler = await careerHandler(pg, PEOPLE);
    const say = async (c: Chat, text: string, at = T0) => {
      Date.now = () => at;
      try { const r = await c.say(text); eq(r.status, 200, r.reply); return r; } finally { Date.now = realNow; }
    };
    const c1 = handler.chat("tok-a1");
    const before = await pg.sql(`select count(*) from public.career_apply_jobs; select count(*) from public.career_outreach_drafts`);

    await t.step("today: the exact counts of the seeded rows inside Chicago's day, the window and the method said", async () => {
      const r = await say(c1, "how much did we do today?");
      eq(r.intent, "career_activity", r.reply);
      eq(r.resultStatus, "shown", r.reply);
      assert(r.reply.startsWith("Today (since midnight, America/Chicago): 4 applications approved and queued, 2 sent to the employer (1 confirmed by the employer, 1 not confirmed yet) and 2 emails sent from your account."), r.reply);
      assert(/How I counted:/.test(r.reply), r.reply);
      assert(!/Oldco|Lastnight|Brex|Plaid|Otherco|Mercury/.test(r.reply), `outside the window, not sent, or another person's: ${r.reply}`);
    });

    await t.step("'what did you send today' is this ask, never a receipt for a company called today", async () => {
      const r = await say(c1, "what did you send today?");
      eq(r.intent, "career_activity", r.reply);
      assert(r.reply.startsWith("Today (since midnight, America/Chicago): 4 applications") && !/receipt/i.test(r.reply), r.reply);
    });

    await t.step("the week, no window said: the last 7 days, said; days with work counted", async () => {
      const r = await say(c1, "how many applications have you sent");
      eq(r.intent, "career_activity", r.reply);
      assert(/^You didn't say when, so this is the last 7 days\./.test(r.reply), r.reply);
      assert(/6 applications approved and queued, 4 sent to the employer \(2 confirmed by the employer, 2 not confirmed yet\) and 3 emails sent/.test(r.reply), r.reply);
      assert(/Days with work: 4 of 7\./.test(r.reply), `Oct 31, Nov 1, Nov 2 and Nov 3 in Chicago: ${r.reply}`);
    });

    await t.step("another person: their own rows only, in UTC since no zone is saved (said)", async () => {
      const r = await say(handler!.chat("tok-a2"), "what did you do today");
      eq(r.intent, "career_activity", r.reply);
      assert(/^Today \(since midnight, UTC, since I don't have your time zone\): 1 application approved and queued, 1 sent to the employer \(1 confirmed by the employer, 0 not confirmed yet\) and 1 email sent/.test(r.reply), r.reply);
      assert(!/Acme|Ramp|Maya/.test(r.reply), r.reply);
    });

    eq(await pg.sql(`select count(*) from public.career_apply_jobs; select count(*) from public.career_outreach_drafts`), before, "read only: nothing written");
  } finally {
    Date.now = realNow;
    handler?.restore();
    await pg.stop();
  }
} });
