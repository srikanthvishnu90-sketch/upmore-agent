// What a brand-new person can trigger beyond the fifteen features: each capability's outcome in live state, and the
// reply checked against it (owner directive 2026-10-26 16:12: "Are tasks ACTUALLY completed (real state), not just
// answered?"). Read-only like checks.ts; every check is tested pass- and fail-shaped in
// tests/architect/live-verify-journeys.test.ts.
import { type Db, fail, notRun, pass, q, type Result, UUID } from "./lib.ts";
import type { Bench, Run, Turn } from "./checks.ts";
import { plainReply } from "./audit.ts";

const F = "USER";
const n = (v: unknown) => Number(v ?? 0);
const uid = (u: string) => { if (!UUID.test(u)) throw new Error("not a uuid"); return q(u); };
const low = (s: string) => String(s ?? "").toLowerCase();
const plainOr = (C: string, t: Turn): Result | null => { const why = plainReply(t); return why ? fail(F, C, why, { reply: t.reply.slice(0, 200) }) : null; };
async function accountText(db: Db, userId: string): Promise<string> {
  const r = await db.rows<{ v: string | null }>(`select value::text as v from career_watch_kv where user_id = ${uid(userId)} and key = 'career:account'`);
  return low(r[0]?.v ?? "");
}
async function standingText(db: Db, userId: string): Promise<string> {
  const r = await db.rows<{ v: string | null }>(`select value::text as v from career_watch_kv where user_id = ${uid(userId)} and key = 'career:standing'`);
  return low(r[0]?.v ?? "");
}

// "I applied to X for the Y role": the person's own word is logged on the account's tracker, and said back.
export async function trackerLogged(db: Db, t: Turn, run: Run, company: string): Promise<Result> {
  const C = "USER.tracker_logs_what_i_applied_to";
  const bad = plainOr(C, t); if (bad) return bad;
  const acct = await accountText(db, run.userId);
  const thread = t.threadId ? await db.rows<{ s: string }>(`select coalesce(state::text, '') as s from agent_flow_state where thread_id = ${uid(t.threadId)} and user_id = ${uid(run.userId)}`) : [];
  const onRecord = acct.includes(low(company)) || low(thread[0]?.s ?? "").includes(low(company));
  if (!onRecord) return fail(F, C, `${company} is not on the tracker (account or thread state)`);
  if (!low(t.reply).includes(low(company))) return fail(F, C, `the reply does not name ${company}`, { reply: t.reply.slice(0, 200) });
  return pass(F, C, `${company} is on the tracker and the reply says so`);
}
// "Did my X application go through?" with nothing sent: the reply never claims a submission the record does not hold.
const CLAIMS_SENT = /\b(?:was|were|has been|have been|got|is) (?:submitted|sent|received|delivered|confirmed)\b|\bwent through\b(?![^.]{0,30}\?)/i;
const DENIES = /\bnot\b|\bno\b|\bnever\b|\bhaven'?t\b|\bhasn'?t\b|\bisn'?t\b|\bwasn'?t\b|\bwithout\b/i;
const HONEST = /not (?:on record|sent|submitted|confirmed)|no (?:record|confirmation|application (?:was|has been) sent)|you (?:told me|said|logged|marked)|haven'?t (?:sent|submitted)|nothing (?:was|has been) sent/i;
export async function statusTruthful(db: Db, t: Turn, run: Run, company: string): Promise<Result> {
  const C = "USER.status_never_claims_an_unsent_application";
  const bad = plainOr(C, t); if (bad) return bad;
  const r = await db.rows<{ n: number }>(`select count(*)::int as n from career_apply_jobs where user_id = ${uid(run.userId)} and lower(company) = ${q(low(company))} and state in ('confirmed', 'submitted_unconfirmed')`);
  const sent = n(r[0]?.n) > 0;
  const sentences = t.reply.split(/(?<=[.!?])\s+/);
  const claims = sentences.some((s) => CLAIMS_SENT.test(s) && !DENIES.test(s));
  if (!sent && claims) return fail(F, C, `the reply says the ${company} application went out; nothing was sent`, { reply: t.reply.slice(0, 200) });
  if (!sent && !HONEST.test(t.reply)) return fail(F, C, "nothing was sent and the reply does not say so plainly", { reply: t.reply.slice(0, 200) });
  return pass(F, C, sent ? "an application was sent and the reply may say so" : "nothing was sent, and the reply says so");
}
// "Remind me tomorrow at 9am to ...": a pending reminder is recorded, and the reply says what was recorded.
export async function reminderRecorded(db: Db, t: Turn, run: Run): Promise<Result> {
  const C = "USER.reminder_recorded";
  const bad = plainOr(C, t); if (bad) return bad;
  const r = await db.rows<{ n: number }>(`select count(*)::int as n from career_reminder_outbox where user_id = ${uid(run.userId)} and status = 'pending' and created_at >= ${q(t.at)}::timestamptz`);
  const rows = n(r[0]?.n);
  const claims = /I'?ll remind you|reminder (?:is |has been )?set|I(?:'ve| have)? set (?:a|the) reminder|I'?ll (?:text|message|ping) you/i.test(t.reply);
  const refuses = /can'?t|cannot|don'?t run reminders|not (?:able|wired|connected|available)/i.test(t.reply);
  if (rows && claims) return pass(F, C, `${rows} pending reminder(s) recorded; the reply says so`);
  if (!rows && claims) return fail(F, C, "the reply says a reminder is set; none was recorded");
  if (rows && !claims) return fail(F, C, `${rows} reminder(s) recorded; the reply does not say so`);
  return fail(F, C, refuses ? "reminders are not built: the reply says so honestly, and nothing is recorded" : "no reminder recorded and the reply does not say why", { reply: t.reply.slice(0, 200) });
}
// Pause and resume: the account's paused flag is what the reply says. `expect` null: a loose phrasing, where either
// outcome is acceptable as long as the reply tells the truth about it.
export async function pauseMatches(db: Db, t: Turn, run: Run, check: string, expect: boolean | null): Promise<Result> {
  const C = `USER.${check}`;
  const bad = plainOr(C, t); if (bad) return bad;
  const r = await db.rows<{ paused: boolean | null }>(`select (value->>'paused')::boolean as paused from career_watch_kv where user_id = ${uid(run.userId)} and key = 'career:account'`);
  const paused = r[0]?.paused === true;
  const lifted = /pause is lifted|no longer paused|un-?paused|resumed|lifted/i.test(t.reply);
  const saysPaused = !lifted && /\bpaused\b|on hold|holding off/i.test(t.reply);
  if (expect !== null && paused !== expect) return fail(F, C, `the account is ${paused ? "paused" : "running"}, not ${expect ? "paused" : "running"}`);
  if (paused && !saysPaused) return fail(F, C, "the account is paused but the reply does not say so", { reply: t.reply.slice(0, 200) });
  if (!paused && saysPaused) return fail(F, C, "the reply says paused but the account is not", { reply: t.reply.slice(0, 200) });
  if (expect === false && !lifted) return fail(F, C, "the pause was lifted but the reply does not say so", { reply: t.reply.slice(0, 200) });
  return pass(F, C, `the account is ${paused ? "paused" : "running"}, as the reply says`);
}
// "Actually I'm a senior, not a junior": the correction wins, in state and in a later readback.
export async function factCorrected(db: Db, readback: Turn, run: Run, now: string, was: string): Promise<Result> {
  const C = "USER.correction_replaces_the_old_fact";
  const bad = plainOr(C, readback); if (bad) return bad;
  const acct = await accountText(db, run.userId);
  if (!acct.includes(low(now))) return fail(F, C, `"${now}" is not on the account record`);
  if (!low(readback.reply).includes(low(now))) return fail(F, C, `a later readback does not name "${now}"`, { reply: readback.reply.slice(0, 200) });
  if (new RegExp(`\\b${was}\\b`, "i").test(readback.reply)) return fail(F, C, `a later readback still names the old "${was}"`, { reply: readback.reply.slice(0, 200) });
  return pass(F, C, `"${now}" replaced "${was}" on the record and in the readback`);
}
export async function preferredLocation(db: Db, t: Turn, run: Run, place: string): Promise<Result> {
  const C = "USER.preferred_location_saved";
  const bad = plainOr(C, t); if (bad) return bad;
  const r = await db.rows<{ locs: string | null }>(`select (value->'preferred_locations')::text as locs from career_watch_kv where user_id = ${uid(run.userId)} and key = 'career:account'`);
  if (!low(r[0]?.locs ?? "").includes(low(place))) return fail(F, C, `${place} is not the account's preferred location`);
  if (!low(t.reply).includes(low(place))) return fail(F, C, `the reply does not name ${place}`);
  return pass(F, C, `${place} is the account's preferred location, as the reply says`);
}
export async function alertsStopped(db: Db, t: Turn, run: Run): Promise<Result> {
  const C = "USER.stop_alerts_stops_them";
  const bad = plainOr(C, t); if (bad) return bad;
  const r = await db.rows<{ on: boolean | null }>(`select coalesce((prefs->>'on')::boolean, false) as on from career_alert_prefs where user_id = ${uid(run.userId)}`);
  if (r[0]?.on) return fail(F, C, "alerts are still on after the stop");
  if (!/stopp|off|paused|no (?:more|longer)/i.test(t.reply)) return fail(F, C, "alerts are off but the reply does not say so", { reply: t.reply.slice(0, 200) });
  return pass(F, C, "alerts are off, as the reply says");
}
// "Never show me staffing agencies": kept on the account as a standing instruction, with its event.
export async function standingKept(db: Db, t: Turn, run: Run, words: string): Promise<Result> {
  const C = "USER.standing_need_kept";
  const bad = plainOr(C, t); if (bad) return bad;
  const st = await standingText(db, run.userId);
  const ev = await db.rows<{ n: number }>(`select count(*)::int as n from career_events where user_id = ${uid(run.userId)} and kind = 'instruction_kept' and at >= ${q(t.at)}::timestamptz`);
  if (!st.includes(low(words))) return fail(F, C, `"${words}" is not among the account's standing instructions`);
  if (!n(ev[0]?.n)) return fail(F, C, "kept, but no instruction_kept event was recorded");
  if (!/kept|saved|remember|noted/i.test(t.reply)) return fail(F, C, "kept, but the reply does not say so");
  return pass(F, C, `"${words}" kept on the account, with its event`);
}
export async function judgePromptState(db: Db, t: Turn, run: Run, phrase: string, expect: "kept" | "shown" | "gone"): Promise<Result> {
  const C = `USER.judge_prompt_${expect}`;
  const bad = plainOr(C, t); if (bad) return bad;
  const st = await standingText(db, run.userId);
  const has = st.includes("judge:") && st.includes(low(phrase));
  if (expect === "kept") return has ? pass(F, C, "the judge prompt is kept as a standing instruction") : fail(F, C, "the judge prompt is not among the standing instructions");
  if (expect === "shown") return has && low(t.reply).includes(low(phrase)) ? pass(F, C, "the reply shows the kept judge prompt") : fail(F, C, "the reply does not show the kept judge prompt", { reply: t.reply.slice(0, 200) });
  return !has ? pass(F, C, "the judge prompt is gone") : fail(F, C, "the judge prompt is still kept after \"forget\"");
}
// "Drill my weak spots" in a new thread: the drill is about the weak skills the last mock recorded.
export async function drillMatchesWeakSpots(db: Db, t: Turn, run: Run): Promise<Result> {
  const C = "USER.drill_uses_recorded_weak_spots";
  const bad = plainOr(C, t); if (bad) return bad;
  const r = await db.rows<{ detail: any }>(`select detail from career_events where user_id = ${uid(run.userId)} and kind = 'mock_done' order by id desc limit 1`);
  if (!r.length) return notRun(F, C, "no mock was finished, so there are no weak spots to drill");
  const weak = [...new Set((Array.isArray(r[0].detail?.answers) ? r[0].detail.answers : []).filter((a: any) => a?.weak).map((a: any) => String(a.skill ?? "")).filter(Boolean))] as string[];
  if (!weak.length) return /no weak spots|nothing to drill/i.test(t.reply) ? pass(F, C, "no weak spot on record, and the reply says so") : fail(F, C, "no weak spot is on record but the reply drills one");
  const named = weak.filter((w) => low(t.reply).includes(low(w)));
  return named.length ? pass(F, C, `the drill names ${named.join(", ")}, recorded weak in the last mock`) : fail(F, C, `the drill names none of the recorded weak spots (${weak.join(", ")})`, { reply: t.reply.slice(0, 200) });
}
// A half-told offer: asked once for what is missing, then benchmarked, and not asked again.
export function offerAsksOnce(first: Turn, second: Turn, expected: Bench[]): Result {
  const C = "USER.offer_asks_once_then_benchmarks";
  for (const t of [first, second]) { const bad = plainOr(C, t); if (bad) return bad; }
  if (!/\?/.test(first.reply) || !/base|salary|pay|role|title|city|where/i.test(first.reply)) return fail(F, C, "the first reply does not ask for the missing pieces", { reply: first.reply.slice(0, 200) });
  if (/what(?:'s| is) (?:the|your) base|how much is the base|which city/i.test(second.reply)) return fail(F, C, "the second reply asks again for what was just given", { reply: second.reply.slice(0, 200) });
  const shown = expected.filter((b) => b.shown && b.median != null);
  if (!shown.length) return fail(F, C, "the benchmark data has no figure for this offer");
  const usd = (v: number) => "$" + Math.round(v).toLocaleString("en-US");
  const missing = shown.filter((b) => !second.reply.includes(usd(b.median!)));
  return missing.length ? fail(F, C, `once complete, the reply does not cite ${missing.map((b) => usd(b.median!)).join(", ")}`)
    : pass(F, C, `asked once for the missing pieces, then cited ${shown.length}/${shown.length} benchmark medians`);
}
// Connecting Telegram from the web: a one-time link is issued (stored hashed) and given.
export async function telegramConnectIssued(db: Db, t: Turn, run: Run): Promise<Result> {
  const C = "USER.connect_telegram_gives_a_link";
  const bad = plainOr(C, t); if (bad) return bad;
  const r = await db.rows<{ n: number }>(`select count(*)::int as n from channel_link_nonces where user_id = ${uid(run.userId)} and created_at >= ${q(t.at)}::timestamptz and used_at is null`);
  const link = /https:\/\/t\.me\/[A-Za-z0-9_]+\?start=/i.test(t.reply);
  if (n(r[0]?.n) && link) return pass(F, C, "a one-time Telegram link was issued and given");
  if (!n(r[0]?.n) && link) return fail(F, C, "the reply gives a link, but no link token was issued");
  return fail(F, C, n(r[0]?.n) ? "a link token was issued but the reply gives no link" : "no Telegram link was issued from chat", { reply: t.reply.slice(0, 200) });
}
// Connecting Gmail: the reply gives the way to connect, and never claims a grant the account does not hold.
export async function gmailConnectHonest(db: Db, t: Turn, run: Run): Promise<Result> {
  const C = "USER.connect_gmail_gives_the_way";
  const bad = plainOr(C, t); if (bad) return bad;
  const r = await db.rows<{ n: number }>(`select count(*)::int as n from user_oauth_connections where user_id = ${uid(run.userId)} and provider in ('google_career', 'gmail')`);
  const granted = n(r[0]?.n) > 0;
  if (!granted && /\b(?:is|are) (?:now )?connected\b|connected your gmail|gmail is linked/i.test(t.reply) && !/not (?:yet )?connected/i.test(t.reply)) return fail(F, C, "the reply says Gmail is connected; no grant is on the account");
  if (!granted && !/https:\/\/\S+|settings|connect (?:gmail|your gmail) (?:in|from)|tap|button/i.test(t.reply)) return fail(F, C, "no Gmail grant and the reply gives no way to connect", { reply: t.reply.slice(0, 200) });
  return pass(F, C, granted ? "Gmail is connected, and the reply may say so" : "no grant yet; the reply gives the way to connect");
}
export function helpAnswer(t: Turn): Result {
  const C = "USER.what_can_you_do";
  const bad = plainOr(C, t); if (bad) return bad;
  const named = ["job", "resume", "appl", "interview", "offer", "alert", "follow"].filter((w) => low(t.reply).includes(w));
  return named.length >= 3 ? pass(F, C, `names ${named.length} things it does`) : fail(F, C, "the answer names fewer than 3 things it does", { reply: t.reply.slice(0, 200) });
}
export function companyResearch(t: Turn): Result {
  const C = "USER.company_research_sourced_or_says_none";
  const bad = plainOr(C, t); if (bad) return bad;
  return /source|on file|on record|filings|postings|from (?:its|their|the) |nothing (?:is )?on file|no (?:record|file)/i.test(t.reply)
    ? pass(F, C, "says where its facts come from, or that it has none")
    : fail(F, C, "gives company facts without saying where they come from", { reply: t.reply.slice(0, 200) });
}
