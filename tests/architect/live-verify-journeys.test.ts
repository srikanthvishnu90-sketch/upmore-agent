// scripts/live/journeys.ts: what a brand-new person can trigger beyond the fifteen features. Each check PASSes when the
// state and the reply agree that the task was done, and FAILs when either is missing or the reply claims more than the
// state holds, against a real Postgres with the career schema, read as the SELECT-only role.
import nodeAssert from "node:assert/strict";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import * as L from "../../scripts/live/lib.ts";
import type * as C from "../../scripts/live/checks.ts";
import * as J from "../../scripts/live/journeys.ts";
import { readOnlyConnection } from "./live-verify-pg.ts";

const CI = !!Deno.env.get("CI");
const U = "5e1f0000-0000-4000-8000-0000000002a1", T_U = "5e1f0000-0000-4000-8000-0000000002d1";
const run: C.Run = { userId: U, startedAt: new Date(Date.now() - 3600_000).toISOString() };
const turn = (o: Partial<C.Turn> & { reply: string }): C.Turn => ({ status: 200, threadId: T_U, turnKey: crypto.randomUUID(), meta: {}, at: new Date(Date.now() - 60_000).toISOString(), ...o });
const is = (r: L.Result, status: L.Status, msg = "", why?: RegExp) => {
  nodeAssert.equal(r.status, status, `${msg} ${r.check}: ${r.reason}`);
  if (why) nodeAssert.match(r.reason, why, `${msg}: the reason names the fault`);
};
const account = (v: Record<string, unknown>) => `insert into career_watch_kv (user_id, key, value) values ('${U}', 'career:account', '${JSON.stringify(v)}') on conflict (user_id, key) do update set value = excluded.value`;

Deno.test("live verify journeys: the reply-only checks pass a true answer and fail a false or empty one", () => {
  const bench: C.Bench[] = [{ kind: "lca", shown: true, median: 197000, n: 49 }];
  const ask = turn({ reply: "Congratulations. What's the base salary, the role and the city?" });
  is(J.offerAsksOnce(ask, turn({ reply: "Google's own filings: median $197,000 from 49 filings." }), bench), "PASS");
  is(J.offerAsksOnce(turn({ reply: "Congratulations!" }), turn({ reply: "median $197,000" }), bench), "FAIL", "never asked");
  is(J.offerAsksOnce(ask, turn({ reply: "Google's own filings: median $197,000 from 49 filings. What's the base salary?" }), bench), "FAIL", "asked again", /asks again/);
  is(J.offerAsksOnce(ask, turn({ reply: "Nice offer." }), bench), "FAIL", "no benchmark");
  is(J.helpAnswer(turn({ reply: "I find jobs, tailor your resume, apply with your approval, run interview mocks and benchmark offers." })), "PASS");
  is(J.helpAnswer(turn({ reply: "I'm here to help!" })), "FAIL");
  is(J.helpAnswer(turn({ reply: "I did not catch what to do with that one." })), "FAIL", "catch-all");
  is(J.companyResearch(turn({ reply: "From Stripe's postings on file: 12 open roles." })), "PASS");
  is(J.companyResearch(turn({ reply: "Nothing is on file for Stripe yet." })), "PASS");
  is(J.companyResearch(turn({ reply: "Stripe pays $250k and has a great culture." })), "FAIL", "unsourced");
});

let pg: Pg | null = null, conn: { exec: L.Exec; end: () => Promise<void> } | null = null;
const db = () => L.readOnlyDb(conn!.exec);
const seed = (s: string) => pg!.sql(s);

Deno.test({ name: "live verify journeys: every state check passes its pass-shaped seed and fails its fail-shaped one (real Postgres)", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (!pgBinDir()) { if (CI) throw Error("needs Postgres 16 in CI"); console.log("NOT_RUN locally: no Postgres binaries"); return; }
  pg = await startPg();
  try {
    await seed(`alter table auth.users add column if not exists raw_app_meta_data jsonb not null default '{}'::jsonb;
      insert into auth.users (id, email) values ('${U}', 'trainee-live-verify@upmore.test'); insert into public.profiles (id) values ('${U}');
      insert into public.agent_threads (id, user_id) values ('${T_U}', '${U}');
      create table if not exists public.user_oauth_connections (user_id uuid, provider text, vault_name text, email text, scopes text, connected_at timestamptz)`);
    conn = await readOnlyConnection(pg);
    const at = new Date(Date.now() - 1000).toISOString();

    await t.step("tracker and truthful status", async () => {
      const said = turn({ at, reply: "Logged: Verifyco Test, data analyst, applied by you last week." });
      is(await J.trackerLogged(db(), said, run, "Verifyco Test"), "FAIL", "not on record");
      await seed(account({ epoch: 0, version: 1, paused: false, memory: { tracker: { rows: [{ company: "Verifyco Test" }] } } }));
      is(await J.trackerLogged(db(), said, run, "Verifyco Test"), "PASS");
      is(await J.trackerLogged(db(), turn({ at, reply: "Noted." }), run, "Verifyco Test"), "FAIL", "the reply does not name it");
      is(await J.statusTruthful(db(), turn({ reply: "Your Verifyco Test application was submitted on Oct 20." }), run, "Verifyco Test"), "FAIL", "claims a send");
      is(await J.statusTruthful(db(), turn({ reply: "You told me you applied to Verifyco Test. It was submitted on Oct 20." }), run, "Verifyco Test"), "FAIL", "claims a send beside an honest line", /went out; nothing was sent/);
      is(await J.statusTruthful(db(), turn({ reply: "You told me you applied to Verifyco Test; I have not sent anything there, so there is no confirmation on record." }), run, "Verifyco Test"), "PASS");
      is(await J.statusTruthful(db(), turn({ reply: "Good luck with Verifyco Test!" }), run, "Verifyco Test"), "FAIL", "says nothing true");
    });

    await t.step("reminders", async () => {
      is(await J.reminderRecorded(db(), turn({ at, reply: "I'll remind you tomorrow at 9:00." }), run), "FAIL", "claims, nothing recorded", /none was recorded/);
      is(await J.reminderRecorded(db(), turn({ at, reply: "I can't do that yet — I don't run reminders." }), run), "FAIL", "honest, not built", /not built/);
      await seed(`insert into career_reminder_outbox (user_id, reminder_id, payload) values ('${U}', 'r1', '{"text":"email Riley"}')`);
      is(await J.reminderRecorded(db(), turn({ at, reply: "I'll remind you tomorrow at 9:00 to email Riley." }), run), "PASS");
      is(await J.reminderRecorded(db(), turn({ at, reply: "Sure." }), run), "FAIL", "recorded, not said");
    });

    await t.step("pause, resume, a loose hold-off", async () => {
      await seed(account({ epoch: 0, version: 2, paused: true }));
      is(await J.pauseMatches(db(), turn({ reply: "Career work is paused." }), run, "pause_pauses", true), "PASS");
      is(await J.pauseMatches(db(), turn({ reply: "Okay!" }), run, "pause_pauses", true), "FAIL", "paused, not said");
      is(await J.pauseMatches(db(), turn({ reply: "The account pause is lifted." }), run, "resume_resumes", false), "FAIL", "still paused");
      is(await J.pauseMatches(db(), turn({ reply: "Holding off: career work is paused." }), run, "hold_off_reply_matches_state", null), "PASS");
      await seed(account({ epoch: 0, version: 3, paused: false }));
      is(await J.pauseMatches(db(), turn({ reply: "The account pause is lifted." }), run, "resume_resumes", false), "PASS");
      is(await J.pauseMatches(db(), turn({ reply: "Career work is paused." }), run, "hold_off_reply_matches_state", null), "FAIL", "claims a pause that is not there");
      is(await J.pauseMatches(db(), turn({ reply: "Career work is paused." }), run, "pause_pauses", true), "FAIL", "not paused");
    });

    await t.step("a correction, a preferred location", async () => {
      await seed(account({ epoch: 0, version: 4, paused: false, stated_facts: { facts: [{ kind: "year", value: "junior" }] } }));
      is(await J.factCorrected(db(), turn({ reply: "You are a senior majoring in economics." }), run, "senior", "junior"), "FAIL", "the record still says junior");
      await seed(account({ epoch: 0, version: 5, paused: false, stated_facts: { facts: [{ kind: "year", value: "senior" }] }, preferred_locations: ["Chicago"] }));
      is(await J.factCorrected(db(), turn({ reply: "You are a senior majoring in economics." }), run, "senior", "junior"), "PASS");
      is(await J.factCorrected(db(), turn({ reply: "You are a junior majoring in economics." }), run, "senior", "junior"), "FAIL", "the readback is stale");
      is(await J.factCorrected(db(), turn({ reply: "You are a senior (earlier: junior) majoring in economics." }), run, "senior", "junior"), "FAIL", "both, old and new", /still names the old/);
      is(await J.preferredLocation(db(), turn({ reply: "Saved Chicago as your preferred location." }), run, "Chicago"), "PASS");
      is(await J.preferredLocation(db(), turn({ reply: "Saved Boston." }), run, "Boston"), "FAIL", "not on record");
    });

    await t.step("alerts stopped; a standing need; the judge prompt kept, shown, gone", async () => {
      await seed(`insert into career_alert_prefs (user_id, prefs, last_checked_at) values ('${U}', '{"on":true,"keywords":["software engineer"],"locations":[],"remote_ok":false,"report_hour":8,"quiet_start":22,"quiet_end":7,"max_instant_per_day":3}', now())`);
      is(await J.alertsStopped(db(), turn({ reply: "Your job alerts are off." }), run), "FAIL", "still on");
      await seed(`update career_alert_prefs set prefs = jsonb_set(prefs, '{on}', 'false') where user_id = '${U}'`);
      is(await J.alertsStopped(db(), turn({ reply: "Your job alerts are off." }), run), "PASS");
      is(await J.alertsStopped(db(), turn({ reply: "Done." }), run), "FAIL", "not said");
      const need = turn({ at, reply: "Kept on your account: never show me staffing agencies." });
      is(await J.standingKept(db(), need, run, "staffing agencies"), "FAIL", "not kept");
      await seed(`insert into career_watch_kv (user_id, key, value) values ('${U}', 'career:standing', '{"items":[{"text":"Never show me staffing agencies"},{"text":"Judge: rate any posting that needs Java as no"}]}')`);
      is(await J.standingKept(db(), need, run, "staffing agencies"), "FAIL", "no event");
      await seed(`insert into career_events (user_id, at, kind, subject) values ('${U}', now(), 'instruction_kept', 'Never show me staffing agencies')`);
      is(await J.standingKept(db(), need, run, "staffing agencies"), "PASS");
      const jp = "rate any posting that needs Java as no";
      is(await J.judgePromptState(db(), turn({ reply: "Kept as your judge prompt." }), run, jp, "kept"), "PASS");
      is(await J.judgePromptState(db(), turn({ reply: `Your judge prompt: "${jp}".` }), run, jp, "shown"), "PASS");
      is(await J.judgePromptState(db(), turn({ reply: "You have no judge prompt." }), run, jp, "shown"), "FAIL", "not shown");
      is(await J.judgePromptState(db(), turn({ reply: "Removed your judge prompt." }), run, jp, "gone"), "FAIL", "still kept");
      await seed(`update career_watch_kv set value = '{"items":[{"text":"Never show me staffing agencies"}]}' where user_id = '${U}' and key = 'career:standing'`);
      is(await J.judgePromptState(db(), turn({ reply: "Removed your judge prompt." }), run, jp, "gone"), "PASS");
    });

    await t.step("the weak-spot drill", async () => {
      is(await J.drillMatchesWeakSpots(db(), turn({ reply: "Weak-spot drill: SQL." }), run), "NOT_RUN", "no mock yet");
      await seed(`insert into career_events (user_id, at, kind, detail) values ('${U}', now(), 'mock_done', '{"answers":[{"skill":"SQL","weak":true},{"skill":"statistics","weak":false}]}')`);
      is(await J.drillMatchesWeakSpots(db(), turn({ reply: "Weak-spot drill: 1 question on SQL." }), run), "PASS");
      is(await J.drillMatchesWeakSpots(db(), turn({ reply: "Weak-spot drill: 1 question on statistics." }), run), "FAIL", "the wrong skill");
    });

    await t.step("connecting Telegram and Gmail", async () => {
      const link = turn({ at, reply: "Open https://t.me/TraineeBot?start=abc123 on the phone where you use Telegram." });
      is(await J.telegramConnectIssued(db(), link, run), "FAIL", "a link with no token behind it", /no link token was issued/);
      is(await J.telegramConnectIssued(db(), turn({ at, reply: "You can connect Telegram in the app." }), run), "FAIL", "no link issued");
      await seed(`insert into channel_link_nonces (nonce_hash, user_id, expires_at) values ('${"a".repeat(64)}', '${U}', now() + interval '9 minutes')`);
      is(await J.telegramConnectIssued(db(), link, run), "PASS");
      is(await J.gmailConnectHonest(db(), turn({ reply: "Open https://trainee.example/connect/gmail to connect your Gmail." }), run), "PASS");
      is(await J.gmailConnectHonest(db(), turn({ reply: "Your Gmail is now connected. Settings shows it." }), run), "FAIL", "claims a grant", /says Gmail is connected/);
      is(await J.gmailConnectHonest(db(), turn({ reply: "Gmail helps me read employer replies." }), run), "FAIL", "no way given");
    });
  } finally {
    await conn?.end();
    await pg?.stop();
    pg = null; conn = null;
  }
} });
