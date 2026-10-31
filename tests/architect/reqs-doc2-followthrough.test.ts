// REQS DOC 2 (tasks and follow-through): reminders the person sets in chat, "any update?" and "what's waiting on me?".
// Outcome checks: the career_outbox rows a reminder writes, cancels and delivers (deliverDue over the real claim), and the
// replies the REAL handler (handleChat) gives on real Postgres; the pure parts (when-phrases, the asks, the overview's
// sections) are checked on their own first. Items: Q325/Q347/Q350/Q352/Q370/Q374 (reminders), Q264/Q489/Q255/Q273/Q280/
// Q421/Q448 (one current-state answer, confirmed apart from unconfirmed, blockers with their unblock step), Q365 (the
// "waiting on you" list with ages).
// Run: deno test -A --no-check --import-map=tests/flow/supabase-npm.json tests/architect/reqs-doc2-followthrough.test.ts
import assertNode from "node:assert/strict";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, type Chat, SERVICE_KEY, SUPABASE_URL, supabaseParity } from "../flow/handler.ts";
import { deliverDue } from "../../supabase/functions/_shared/channel.ts";
import { supabaseChannelStore } from "../../supabase/functions/_shared/channel_store.ts";
import { memoryReminderStore, REMINDER_PREFIX, supabaseReminderStore, reminderAsk, reminderTurn, whenOf, zonedInstant } from "../../supabase/functions/_shared/career_reminders.ts";
import { overviewAsk, overviewTurn } from "../../supabase/functions/_shared/career_overview.ts";
import { situationFrom, type SituationRows } from "../../supabase/functions/_shared/career_situation.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
// Tuesday 2026-11-03, 9:00 AM in Chicago (CST, after the daylight-saving change on Nov 1).
const T0 = Date.UTC(2026, 10, 3, 15, 0);

Deno.test("DOC2/1 the asks: a reminder, a list, a cancel; a recall, a bare cancel and a status ask are not reminders", () => {
  eq(reminderAsk("remind me tomorrow at 9am to send my transcript to Acme"), { kind: "set", what: "send my transcript to Acme", when: "tomorrow at 9am" });
  eq(reminderAsk("Remind me to follow up with Initech on Friday at noon"), { kind: "set", what: "follow up with Initech", when: "on Friday at noon" });
  eq(reminderAsk("can you remind me in 2 hours to call the recruiter?"), { kind: "set", what: "call the recruiter", when: "in 2 hours" });
  eq(reminderAsk("remind me about the Globex deadline"), { kind: "when", what: "the Globex deadline" });
  eq(reminderAsk("remind me"), { kind: "when", what: "" }, "a bare ask is the reminder turn's, never the router's 'no reminders' line");
  eq(reminderAsk("set a reminder"), { kind: "when", what: "" });
  eq(reminderAsk("what reminders do I have?"), { kind: "list" });
  eq(reminderAsk("cancel reminder 2"), { kind: "cancel", which: { n: 2 } });
  eq(reminderAsk("cancel my reminder about Acme"), { kind: "cancel", which: { about: "Acme" } });
  eq(reminderAsk("stop reminding me"), { kind: "cancel", which: { all: true } });
  for (const m of ["remind me what jobs you found", "remind me what time my Acme interview is tomorrow", "remind me about intro 1 in 3 days", "remind me in 5 days if no reply", "remind me why I skipped Acme", "cancel that", "any updates?", "follow up with Acme", "apply to Ramp tomorrow"]) eq(reminderAsk(m), null, m);
  eq(overviewAsk("any update?"), { kind: "overview" });
  eq(overviewAsk("How's it going"), { kind: "overview" });
  eq(overviewAsk("what's waiting on me?"), { kind: "waiting" });
  for (const m of ["any updates on my applications", "where are my applications", "any update on my emails", "what do you need from me", "how is the weather going"]) eq(overviewAsk(m), null, m);
});

Deno.test("DOC2/2 when-phrases: the exact instant in the person's zone; a picked time or zone is said; nonsense and past are refused", () => {
  const ch = (y: number, m: number, d: number, h: number, mi = 0) => zonedInstant(y, m, d, h, mi, "America/Chicago");
  const at = (p: string, tz: string | null = "America/Chicago") => { const w = whenOf(p, T0, tz); if ("error" in w) throw new Error(w.error); return w; };
  eq(at("tomorrow at 9am").at, ch(2026, 11, 4, 9));
  eq(at("tomorrow").at, ch(2026, 11, 4, 9));
  assert(at("tomorrow").assumed.some((a) => /9:00 AM, since you didn't say a time/.test(a)));
  eq(at("in 2 hours").at, T0 + 2 * HOUR);
  eq(at("on Friday at noon").at, ch(2026, 11, 6, 12));
  eq(at("at 3").at, ch(2026, 11, 3, 15), "a bare 3 is the afternoon");
  eq(at("at 8").at, ch(2026, 11, 4, 8), "8 AM today has passed: tomorrow");
  eq(at("tonight at 9").at, ch(2026, 11, 3, 21));
  eq(at("on Nov 10").at, ch(2026, 11, 10, 9));
  eq(at("11/5 at 10am pacific time").at, zonedInstant(2026, 11, 5, 10, 0, "America/Los_Angeles"));
  const noZone = at("tomorrow at 9am", null);
  eq(noZone.at, zonedInstant(2026, 11, 4, 9, 0, "America/New_York"));
  assert(noZone.assumed.some((a) => /Eastern time, since I don't have your time zone/.test(a)), "the default zone is said");
  assert("error" in whenOf("whenever", T0, "America/Chicago"));
  assert("error" in whenOf(", ", T0, "America/Chicago"), "a phrase with no day and no time names no instant");
  assert("error" in whenOf("on Feb 30", T0, "America/Chicago"));
  // Daylight saving: 9 AM on Oct 31 (CDT) and Nov 2 (CST) are 9 AM on the clock both days.
  eq(zonedInstant(2026, 10, 31, 9, 0, "America/Chicago"), Date.UTC(2026, 9, 31, 14));
  eq(zonedInstant(2026, 11, 2, 9, 0, "America/Chicago"), Date.UTC(2026, 10, 2, 15));
});

Deno.test("DOC2/3 the reminder turn on a store: saved with its exact time and text; past, unreachable and recall save nothing", async () => {
  const s = memoryReminderStore({ zones: { U: "America/Chicago" }, reachable: { U: true, W: false } });
  const set = (await reminderTurn({ message: "remind me tomorrow at 9am to send my transcript to Acme", userId: "U", now: T0, store: s, newKey: () => "k1" }))!;
  eq(set.status, "set", set.reply);
  eq(s.dump().rows.map((r) => [r.key, r.at]), [[`${REMINDER_PREFIX}k1`, zonedInstant(2026, 11, 4, 9, 0, "America/Chicago")]]);
  assert(/^Reminder: send my transcript to Acme\. You asked me on Nov 3 to remind you at Wed, Nov 4, 9:00 AM CST\.$/.test(s.dump().rows[0].text), s.dump().rows[0].text);
  assert(set.reply.includes(s.dump().rows[0].text), `the reply shows the exact text: ${set.reply}`);
  const night = (await reminderTurn({ message: "remind me tonight at 11pm to check Acme", userId: "U", now: T0, store: s, newKey: () => "k2" }))!;
  assert(/inside your quiet hours \(10:00 PM to 7:00 AM\), so it will come when they end/.test(night.reply), night.reply);
  const past = (await reminderTurn({ message: "remind me today at 6am to stretch", userId: "U", now: T0, store: s }))!;
  // "today at 6am" is before 9 AM: past, said so.
  eq(past.status, "past", past.reply);
  const none = (await reminderTurn({ message: "remind me in 2 hours to call Dana", userId: "W", now: T0, store: s }))!;
  eq(none.status, "no_channel", none.reply);
  eq(await reminderTurn({ message: "remind me what you found", userId: "U", now: T0, store: s }), null);
  // The networking turn's own follow-up reminders stay its own (family-networking.test.ts).
  eq(await reminderTurn({ message: "remind me to follow up with maya in 3 days", userId: "U", now: T0, store: s }), null);
  const net = memoryReminderStore({ reachable: { U: true }, networking: { U: true } });
  eq(await reminderTurn({ message: "stop reminding me", userId: "U", now: T0, store: net }), null, "nothing set here and networking on record: the networking turn's cancel");
  const bare = memoryReminderStore({ reachable: { U: true } });
  eq((await reminderTurn({ message: "stop reminding me", userId: "U", now: T0, store: bare }))!.status, "none", "no networking on record: answered here, never the router's 'no reminders' line");
  eq(s.dump().rows.length, 2, "only the two set reminders exist");
  const cancel = (await reminderTurn({ message: "cancel my reminder about the transcript", userId: "U", now: T0, store: s }))!;
  eq(cancel.status, "cancelled", cancel.reply);
  eq(s.dump().rows.map((r) => r.key), [`${REMINDER_PREFIX}k2`]);
  const miss = (await reminderTurn({ message: "cancel reminder 5", userId: "U", now: T0, store: s }))!;
  eq(miss.status, "none", miss.reply);
  eq(s.dump().rows.length, 1, "a cancel that matched nothing removed nothing");
});

const rows = (o: Partial<SituationRows> = {}): SituationRows => ({ jobs: [], wanted: [], prepared: [], questions: [], outreach: [], mail_drafts: [], interviews: [], alerts: null,
  standing: [], threads: [], connections: [], cloud: null, channel: null, last_search: null, unreadable: [], ...o });
const job = (id: string, company: string, state: string, daysAgo: number, extra: Record<string, unknown> = {}) =>
  ({ id, job_id: `gh:${id}`, company, url: `https://${id}.example.test`, state, reason: null, confirmation_id: null, created_at: new Date(T0 - daysAgo * DAY).toISOString(), updated_at: new Date(T0 - daysAgo * DAY).toISOString(), title: "Data Analyst", ...extra });

Deno.test("DOC2/4 any update: confirmed apart from sent-not-confirmed, running, blocked with the step; waiting list with ages; empty and unreadable said", () => {
  const s = situationFrom(rows({ jobs: [job("a", "Acme", "confirmed", 6, { confirmation_id: "ACME-77" }), job("g", "Globex", "submitted_unconfirmed", 3), job("u", "Umbrella", "queued", 0),
    job("h", "Hooli", "needs_user", 4, { reason: "email_code" })] }), T0);
  const o = overviewTurn({ message: "any update?", situation: s, now: T0 })!;
  eq(o.intent, "career_overview");
  assert(/^Status as of now: 1 confirmed by the employer, 1 sent but not confirmed, 1 in progress, 1 waiting on you\./.test(o.reply), o.reply);
  assert(/Confirmed by the employer:\n- Acme \(Data Analyst\), confirmation ACME-77/.test(o.reply), o.reply);
  assert(/Sent, not confirmed by the employer yet:\n- Globex \(Data Analyst\): sent .*no confirmation from them yet/.test(o.reply), o.reply);
  assert(!/Globex[^\n]*confirmation [A-Z]/.test(o.reply), "an unconfirmed application is never given a confirmation");
  assert(/Waiting on you:\n- Hooli \(Data Analyst\): the employer emailed a code\. To unblock: type the code/.test(o.reply), o.reply);
  const w = overviewTurn({ message: "what's waiting on me?", situation: s, now: T0 })!;
  eq(w.intent, "career_waiting_on_you");
  assert(/^Waiting on you \(1\):\n1\. Hooli \(Data Analyst\): the employer emailed a code\. Needed: .* Waiting 4 days\.$/.test(w.reply), w.reply);
  const empty = overviewTurn({ message: "how's it going?", situation: situationFrom(rows(), T0), now: T0 })!;
  assert(/0 confirmed by the employer/.test(empty.reply) && /Nothing is in flight/.test(empty.reply), empty.reply);
  const lost = overviewTurn({ message: "any update", situation: situationFrom(rows({ unreadable: ["jobs"] }), T0), now: T0 })!;
  assert(/Not read just now, so not included: jobs\./.test(lost.reply), lost.reply);
  eq(overviewTurn({ message: "any update", situation: null, now: T0 })!.status, "unreadable");
});

const PEOPLE: Record<string, string> = {
  "tok-r1": "7b0f8f8e-6a43-4a49-9d2c-0000000d0c01", "tok-r2": "7b0f8f8e-6a43-4a49-9d2c-0000000d0c02", "tok-r3": "7b0f8f8e-6a43-4a49-9d2c-0000000d0c03",
};
const contactOf = (n: number) => `+1555020${String(n).padStart(4, "0")}`;
const outbox = async (pg: Pg, id: string) => JSON.parse((await pg.sql(`select coalesce(jsonb_agg(jsonb_build_object('key', key, 'kind', kind, 'status', status, 'text', text, 'at', (extract(epoch from deliver_at) * 1000)::bigint) order by id), '[]') from public.career_outbox where user_id = '${id}'`)) || "[]");
async function delivery(admin: any, at: number) {
  const store: any = supabaseChannelStore(admin), sent: { contact: string; text: string }[] = [];
  const r = await deliverDue({ store, now: at, send: async (contact, bubbles) => { sent.push({ contact, text: bubbles.join("\n") }); return { ok: true, id: `p${sent.length}` }; } });
  await store.release();
  return { r, sent };
}

Deno.test({ name: "DOC2/5 the real handler on real Postgres: reminders set, listed, cancelled and delivered; any update and waiting on me", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (!pgBinDir()) { if (CI) throw new Error("needs Postgres 16 in CI"); console.log("NOT_RUN locally: no Postgres binaries"); return; }
  const pg: Pg = await startPg();
  let handler: Awaited<ReturnType<typeof careerHandler>> | null = null;
  const realNow = Date.now;
  try {
    await supabaseParity(pg);
    for (const [tok, id] of Object.entries(PEOPLE)) {
      const n = Number(tok.slice(-1));
      await pg.sql(`insert into auth.users (id, email) values ('${id}', 'rem${n}@example.test'); insert into public.profiles (id) values ('${id}');
        insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');`);
    }
    const [R1, R2, R3] = [PEOPLE["tok-r1"], PEOPLE["tok-r2"], PEOPLE["tok-r3"]];
    // r1 and r2 text from a linked channel; r1 has a saved zone; r3 has no texting channel.
    await pg.sql(`insert into public.channel_contacts (contact, user_id) values ('${contactOf(1)}', '${R1}'), ('${contactOf(2)}', '${R2}');
      insert into public.career_alert_prefs (user_id, tz, prefs, last_checked_at) values ('${R1}', 'America/Chicago', '{"on": false, "keywords": ["data analyst"], "locations": [], "remote_ok": true, "report_hour": 8, "quiet_start": 22, "quiet_end": 7, "max_instant_per_day": 3}', now());`);
    handler = await careerHandler(pg, PEOPLE);
    const admin: any = createClient(SUPABASE_URL, SERVICE_KEY);
    const chat = (tok: string) => handler!.chat(tok);
    const say = async (c: Chat, text: string, at = T0) => {
      Date.now = () => at;
      try { const r = await c.say(text); eq(r.status, 200, r.reply); return r; } finally { Date.now = realNow; }
    };
    const c1 = chat("tok-r1");
    const due = zonedInstant(2026, 11, 4, 9, 0, "America/Chicago");

    await t.step("set: one outbox row at the exact time with the exact text the reply shows; a recall writes nothing", async () => {
      const r = await say(c1, "remind me tomorrow at 9am to send my transcript to Acme");
      eq(r.intent, "career_reminder_set", r.reply);
      const box = await outbox(pg, R1);
      eq(box.length, 1, JSON.stringify(box));
      eq([box[0].kind, box[0].status, Number(box[0].at)], ["status", "queued", due]);
      assert(box[0].key.startsWith(REMINDER_PREFIX), box[0].key);
      eq(box[0].text, "Reminder: send my transcript to Acme. You asked me on Nov 3 to remind you at Wed, Nov 4, 9:00 AM CST.");
      assert(r.reply.includes(box[0].text) && /Wed, Nov 4, 9:00 AM CST/.test(r.reply), r.reply);
      const recall = await say(c1, "remind me what jobs you found");
      assert(recall.intent !== "career_reminder_set", recall.intent ?? "");
      eq((await outbox(pg, R1)).length, 1, "a recall question sets nothing");
      const bare = await say(c1, "remind me");
      eq([bare.intent, bare.resultStatus], ["career_reminder_when", "needs_text"], `asked what and when, never "I don't run reminders": ${bare.reply}`);
      const past = await say(c1, "remind me today at 6am to stretch");
      eq([past.intent, past.resultStatus], ["career_reminder_set", "past"], past.reply);
      eq((await outbox(pg, R1)).length, 1, "a past time sets nothing");
    });

    await t.step("list and cancel: only this person's unsent reminders; a cancel removes exactly the one named", async () => {
      await say(c1, "remind me on Friday at noon to follow up with Initech");
      const list = await say(c1, "what reminders do I have?");
      eq(list.intent, "career_reminder_list", list.reply);
      assert(/1\. Wed, Nov 4, 9:00 AM CST: send my transcript to Acme\n2\. Fri, Nov 6, 12:00 PM CST: follow up with Initech/.test(list.reply), list.reply);
      const other = await say(chat("tok-r2"), "my reminders");
      assert(/You have no reminders set/.test(other.reply), `another person sees none: ${other.reply}`);
      const cancel = await say(c1, "cancel my reminder about Initech");
      eq([cancel.intent, cancel.resultStatus], ["career_reminder_cancel", "cancelled"], cancel.reply);
      eq((await outbox(pg, R1)).map((o: any) => o.text.slice(0, 40)), ["Reminder: send my transcript to Acme. Yo"]);
    });

    await t.step("delivery: nothing before its time; at its time, once, to the person's own contact; a pause holds it", async () => {
      const early = await delivery(admin, due - MIN);
      eq(early.sent, [], "not before its time");
      const on = await delivery(admin, due);
      eq(on.sent.map((s) => s.contact), [contactOf(1)]);
      assert(/^Reminder: send my transcript to Acme\./.test(on.sent[0].text), on.sent[0].text);
      eq((await outbox(pg, R1)).map((o: any) => o.status), ["delivered"]);
      eq((await delivery(admin, due + HOUR)).sent, [], "sent once");
      // A cancel racing the delivery (listed before, removed after it went) removes nothing that was sent.
      const sentKey = (await outbox(pg, R1))[0].key;
      eq(await supabaseReminderStore(admin).remove(R1, [sentKey]), 0);
      eq((await outbox(pg, R1)).map((o: any) => [o.key, o.status]), [[sentKey, "delivered"]], "the delivered row stays on record");
      const late = await say(c1, "cancel my reminder about Acme", due + HOUR);
      eq(late.resultStatus, "none", `a reminder already sent is not listed or cancelled: ${late.reply}`);
      const c2 = chat("tok-r2");
      const r2 = await say(c2, "remind me in 2 hours to call the recruiter");
      eq(r2.intent, "career_reminder_set", r2.reply);
      assert(/Eastern time, since I don't have your time zone/.test(r2.reply) === false, "a span needs no zone, and none is claimed");
      await pg.sql(`update public.career_watch_kv set value = jsonb_set(value, '{paused}', 'true') where user_id = '${R2}' and key = 'career:account'`);
      const held = await delivery(admin, T0 + 2 * HOUR);
      eq(held.sent, [], "a paused account gets no reminder");
      eq((await outbox(pg, R2)).map((o: any) => o.status), ["skipped_opt_out"]);
    });

    await t.step("no texting channel: nothing saved, and the reply says how to get one", async () => {
      const r = await say(chat("tok-r3"), "remind me in 2 hours to call the recruiter");
      eq([r.intent, r.resultStatus], ["career_reminder_set", "no_channel"], r.reply);
      eq(await outbox(pg, R3), []);
    });

    await t.step("any update and what's waiting on me: from the account's own records, confirmed apart from unconfirmed", async () => {
      const row = (company: string, state: string, daysAgo: number, conf: string | null, reason: string | null) => {
        const payload = JSON.stringify({ version: "1", user_id: R1, job_id: `gh:${company}`, company, url: `https://${company.toLowerCase()}.example.test/apply`, fields: [], title: "Data Analyst" });
        const h = crypto.randomUUID().replace(/-/g, "").padEnd(64, "0");
        const at = new Date(T0 - daysAgo * DAY).toISOString();
        return `('${R1}', 'gh:${company}', '${company}', 'https://${company.toLowerCase()}.example.test/apply', '${payload}'::jsonb, '${h}', '${h}', '${state}', ${reason ? `'${reason}'` : "null"}, ${conf ? `'${conf}'` : "null"}, '${at}', '${at}')`;
      };
      await pg.sql(`set session_replication_role = replica;
        insert into public.career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash, state, reason, confirmation_id, created_at, updated_at) values
          ${row("Acme", "confirmed", 6, "ACME-77", null)}, ${row("Globex", "submitted_unconfirmed", 3, null, null)}, ${row("Hooli", "needs_user", 4, null, "email_code")};
        set session_replication_role = origin;`);
      const up = await say(c1, "any update?");
      eq(up.intent, "career_overview", up.reply);
      assert(/^Status as of now: 1 confirmed by the employer, 1 sent but not confirmed, 0 in progress, 1 waiting on you\./.test(up.reply), up.reply);
      assert(/Acme \(Data Analyst\), confirmation ACME-77/.test(up.reply) && /Globex \(Data Analyst\): sent .*no confirmation from them yet/.test(up.reply), up.reply);
      assert(/Hooli \(Data Analyst\): the employer emailed a code\. To unblock:/.test(up.reply), up.reply);
      const w = await say(c1, "what's waiting on me?");
      eq(w.intent, "career_waiting_on_you", w.reply);
      assert(/^Waiting on you \(1\):\n1\. Hooli \(Data Analyst\): the employer emailed a code\. Needed: .* Waiting 4 days\./.test(w.reply), w.reply);
      const before = await pg.sql(`select count(*) from public.career_outbox where user_id = '${R1}'`);
      await say(c1, "how's it going?");
      eq(await pg.sql(`select count(*) from public.career_outbox where user_id = '${R1}'`), before, "a status answer writes nothing");
    });
  } finally {
    Date.now = realNow;
    handler?.restore();
    await pg.stop();
  }
} });
