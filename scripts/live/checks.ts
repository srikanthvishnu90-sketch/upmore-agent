// Live production verification: the checks. Each one reads live state with SELECTs only (lib.ts readOnlyDb) and returns
// PASS / FAIL / NOT_RUN with its reason. The functions take the database and what the run observed (a chat turn, the
// test account, the run's start), never a connection of their own, so tests/architect/live-verify-checks.test.ts runs
// every one against a real Postgres seeded pass-shaped and fail-shaped: a check that cannot fail is caught there.
import { type Db, fail, notRun, pass, q, type Result, UUID } from "./lib.ts";

export interface Turn {
  status: number;
  reply: string;
  threadId: string | null;
  turnKey: string;
  meta: Record<string, any>;
  at: string; // ISO time just before the request was sent
  body?: any;
}
export interface Run { userId: string; startedAt: string }

const norm = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const uid = (u: string) => { if (!UUID.test(u)) throw new Error("not a uuid"); return q(u); };
const n = (v: unknown) => Number(v ?? 0);

// ------------------------------------------------------------------------------------------------ schema
// What each feature needs on the live schema. A missing object is a FAIL naming the migration (the bar is production).
export const NEEDS: Record<string, { obj: string; kind: "table" | "function" | "column" | "constraint"; migration: string }[]> = {
  F1: [{ obj: "public.career_apply_wanted", kind: "table", migration: "20261022100000_career_apply_wanted.sql" },
    { obj: "public.career_apply_want_put_for", kind: "function", migration: "20261026100001_career_apply_want_guard.sql" }],
  F3: [{ obj: "public.career_apply_prepared", kind: "table", migration: "20261020030000_career_apply_cards.sql" }],
  F6: [{ obj: "public.career_ingest_runs", kind: "table", migration: "20261026060106_career_ingest_runs.sql" },
    { obj: "public.career_board_state", kind: "table", migration: "20261021110000_career_board_state.sql" }],
  F7: [{ obj: "career_alert_prefs_min_fit", kind: "constraint", migration: "20261026070007_career_alert_min_fit.sql" }],
  F8: [{ obj: "public.career_mail_drafts.sent_at", kind: "column", migration: "20261026080008_career_mail_drafts_sent.sql" }],
  F9: [{ obj: "public.career_host_commit", kind: "function", migration: "20261026090009_career_account_memory.sql" }],
  F10: [{ obj: "public.career_outreach_drafts", kind: "table", migration: "20261021010000_career_outreach.sql" }],
  F14: [{ obj: "public.career_apply_receipts", kind: "table", migration: "20261026140000_career_apply_receipt_store.sql" }],
  F15: [{ obj: "public.career_apply_message_cards", kind: "table", migration: "20261021220430_career_apply_message_cards.sql" }],
  CLOUD: [{ obj: "public.career_apply_cloud_dispatch_claim", kind: "function", migration: "20261026100000_career_apply_cloud_runner.sql" }],
};
export async function schemaCheck(db: Db, feature: string): Promise<Result> {
  const needs = NEEDS[feature] ?? [];
  const missing: string[] = [];
  for (const x of needs) {
    let sql: string;
    if (x.kind === "table") sql = `select to_regclass(${q(x.obj)}) is not null as ok`;
    else if (x.kind === "constraint") sql = `select exists(select 1 from pg_constraint where conname = ${q(x.obj)}) as ok`;
    else if (x.kind === "function") sql = `select exists(select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname || '.' || p.proname = ${q(x.obj)}) as ok`;
    else {
      const [schema, table, column] = x.obj.split(".");
      sql = `select exists(select 1 from information_schema.columns where table_schema = ${q(schema)} and table_name = ${q(table)} and column_name = ${q(column)}) as ok`;
    }
    const r = await db.rows<{ ok: boolean }>(sql);
    if (!r[0]?.ok) missing.push(`${x.obj} (${x.migration})`);
  }
  // F9's memory key is in the newest career_host_commit only: the function exists from older migrations too.
  if (feature === "F9" && !missing.length) {
    const r = await db.rows<{ ok: boolean }>(`select exists(select 1 from pg_proc where proname = 'career_host_commit' and prosrc like '%''memory''%') as ok`);
    if (!r[0]?.ok) missing.push("career_host_commit without the memory key (20261026090009_career_account_memory.sql)");
  }
  return missing.length
    ? fail(feature, `${feature}.schema`, `not on the live schema: ${missing.join("; ")}`)
    : pass(feature, `${feature}.schema`, `${needs.length}/${needs.length} objects present`);
}

// ------------------------------------------------------------------------------------------------ every turn
// The reply the person got is the reply the database recorded for that turn (agent_messages, career_turn_key).
export async function turnRecorded(db: Db, feature: string, check: string, t: Turn, run: Run): Promise<Result> {
  if (t.status !== 200) return fail(feature, check, `agent-chat answered HTTP ${t.status}: ${t.reply.slice(0, 160)}`);
  if (!t.threadId || !UUID.test(t.threadId)) return fail(feature, check, "the reply named no thread");
  const r = await db.rows<{ content: string; owner: string }>(
    `select m.content, th.user_id as owner from agent_messages m join agent_threads th on th.id = m.thread_id
     where m.thread_id = ${uid(t.threadId)} and m.role = 'assistant' and m.meta->>'career_turn_key' = ${q(t.turnKey)} order by m.id desc limit 1`);
  if (!r.length) return fail(feature, check, "no assistant message was recorded for this turn (career_turn_key)");
  if (r[0].owner !== run.userId) return fail(feature, check, "the turn's thread belongs to another account");
  const a = norm(r[0].content), b = norm(t.reply);
  if (!a || !(a === b || b.includes(a) || a.includes(b))) return fail(feature, check, "the recorded reply differs from the reply sent", { recorded: r[0].content.slice(0, 200) });
  return pass(feature, check, `HTTP 200; the reply is the recorded reply (${t.reply.length} chars)`);
}

// A turn metered at least one model call (agent_turn_costs, this thread, after the turn started).
export async function metered(db: Db, feature: string, check: string, t: Turn, run: Run): Promise<Result> {
  if (!t.threadId) return notRun(feature, check, "no thread");
  const r = await db.rows<{ rows: number; calls: number; usd_micros: number }>(
    `select count(*)::int as rows, coalesce(sum(calls), 0)::int as calls, coalesce(sum(usd_micros), 0)::bigint as usd_micros from agent_turn_costs
     where user_id = ${uid(run.userId)} and thread_id = ${uid(t.threadId)} and created_at >= ${q(t.at)}::timestamptz`);
  const x = r[0];
  if (!x || n(x.rows) === 0 || n(x.calls) === 0) return fail(feature, check, "no model call was metered for this turn in agent_turn_costs");
  return pass(feature, check, `${x.calls} model call(s) metered, ${x.usd_micros} usd_micros`, { calls: x.calls });
}

// ------------------------------------------------------------------------------------------------ F5 search
export const urlsIn = (reply: string) => [...new Set([...String(reply).matchAll(/https:\/\/[^\s)<>"']+/g)].map((m) => m[0].replace(/[.,;]+$/, "")))];
export async function searchListedOpen(db: Db, t: Turn): Promise<Result> {
  const F = "F5", C = "F5.listed_postings_open";
  if (/saved snapshot|not the live board|live board has no postings/i.test(t.reply)) return fail(F, C, "the list came from the saved snapshot: the live board had no match");
  const urls = urlsIn(t.reply);
  if (!urls.length) return fail(F, C, "the reply listed no posting links", { reply: t.reply.slice(0, 200) });
  const r = await db.rows<{ url: string; job_id: string; open: boolean }>(
    `select url, job_id, closed_at is null as open from career_postings where url in (${urls.map(q).join(",")})`);
  const byUrl = new Map(r.map((x) => [x.url, x]));
  const missing = urls.filter((u) => !byUrl.has(u)), closed = urls.filter((u) => byUrl.get(u) && !byUrl.get(u)!.open);
  if (missing.length || closed.length) return fail(F, C, `${urls.length - missing.length - closed.length}/${urls.length} listed postings are open in career_postings; not on file: ${missing.length}, closed: ${closed.length}`, { missing: missing.slice(0, 5), closed: closed.slice(0, 5) });
  return pass(F, C, `${urls.length}/${urls.length} listed postings exist in career_postings and are open`, { job_ids: r.map((x) => x.job_id) });
}
export function judgeState(t: Turn): "judged" | "off" | "failed" | "unknown" {
  if (/the model judge is off|not judged \(the model judge is off\)/i.test(t.reply)) return "off";
  if (/judge did not answer/i.test(t.reply)) return "failed";
  if (/\bjudged\b/i.test(t.reply)) return "judged";
  return "unknown";
}

// ------------------------------------------------------------------------------------------------ F1 chat-to-apply
// "k/m queued" in the reply equals the waiting rows written for the person at this turn, and each queued row is an open
// posting in career_postings.
export async function applyQueued(db: Db, feature: string, check: string, t: Turn, run: Run, wantUrls: string[] = []): Promise<Result> {
  const m = /(\d+)\/(\d+) queued/.exec(t.reply);
  if (!m) return fail(feature, check, "the reply has no coverage line (k/m queued)", { reply: t.reply.slice(0, 200) });
  const said = Number(m[1]);
  const rows = await db.rows<{ posting_key: string; url: string; open: boolean | null; on_file: boolean }>(
    `select w.posting_key, w.url, (p.job_id is not null) as on_file, p.closed_at is null as open
       from career_apply_wanted w left join career_postings p on p.job_id = w.posting_key or p.url = w.url
      where w.user_id = ${uid(run.userId)} and w.queued_at >= ${q(t.at)}::timestamptz`);
  const already = /already in your queue/i.test(t.reply) ? Number((/\((\d+) already in your queue/.exec(t.reply) ?? [])[1] ?? 0) : 0;
  if (rows.length !== said - already) return fail(feature, check, `the reply says ${said} queued (${already} already) but ${rows.length} rows were written to career_apply_wanted`);
  const bad = rows.filter((r) => !r.on_file || r.open === false);
  if (bad.length) return fail(feature, check, `${bad.length}/${rows.length} queued rows are not an open posting in career_postings`, { bad: bad.map((b) => b.url).slice(0, 5) });
  if (wantUrls.length && rows.length && !rows.some((r) => wantUrls.includes(r.url))) return fail(feature, check, "the queued row is not the posting that was asked for", { asked: wantUrls, queued: rows.map((r) => r.url) });
  if (said === 0) return fail(feature, check, "nothing was queued", { reply: t.reply.slice(0, 200) });
  return pass(feature, check, `${m[0]}; ${rows.length} new row(s) in career_apply_wanted, each an open posting`, { queued: rows.map((r) => r.posting_key) });
}

// ------------------------------------------------------------------------------------------------ hash binding
// A prepared application's payload_hash is the sha256 of its canonical payload, and any card item names that same hash.
export async function preparedBound(db: Db, feature: string, check: string, run: Run, match: { urls?: string[]; exceptUrls?: string[] } = {}): Promise<Result> {
  const filter = (match.urls?.length ? `and p.url in (${match.urls.map(q).join(",")})` : "") +
    (match.exceptUrls?.length ? ` and p.url not in (${match.exceptUrls.map(q).join(",")})` : "");
  const rows = await db.rows<{ job_id: string; state: string; bound: boolean; carded: boolean; card_ok: boolean | null }>(
    `select p.job_id, p.state,
            p.payload_hash = encode(sha256(convert_to(public.career_apply_canonical(p.payload), 'UTF8')), 'hex') as bound,
            exists(select 1 from career_apply_cards c, jsonb_array_elements(c.items) it where c.user_id = p.user_id and it->>'prepared_id' = p.id::text) as carded,
            (select bool_and(it->>'payload_hash' = p.payload_hash) from career_apply_cards c, jsonb_array_elements(c.items) it where c.user_id = p.user_id and it->>'prepared_id' = p.id::text) as card_ok
       from career_apply_prepared p where p.user_id = ${uid(run.userId)} and p.updated_at >= ${q(run.startedAt)}::timestamptz ${filter}`);
  if (!rows.length) return fail(feature, check, "no application was prepared for the test account in this run (the prepare worker did not run it)");
  const unbound = rows.filter((r) => !r.bound), badCard = rows.filter((r) => r.carded && r.card_ok === false);
  if (unbound.length) return fail(feature, check, `${unbound.length}/${rows.length} prepared payloads do not hash to their payload_hash`);
  if (badCard.length) return fail(feature, check, `${badCard.length}/${rows.length} card items name another hash than the prepared payload`);
  const carded = rows.filter((r) => r.carded).length;
  if (!carded) return fail(feature, check, `${rows.length} prepared, hash-bound, but no card was pushed for them`);
  return pass(feature, check, `${rows.length} prepared and hash-bound; ${carded}/${rows.length} on a card with the same hash (not approved: the final send is the owner's)`);
}

// Nothing was approved for the test account: no application job exists for it (the suite never taps a card).
export async function neverApproved(db: Db, run: Run): Promise<Result> {
  const r = await db.rows<{ jobs: number; cards: number }>(
    `select (select count(*) from career_apply_jobs where user_id = ${uid(run.userId)})::int as jobs,
            (select count(*) from career_apply_cards where user_id = ${uid(run.userId)} and state <> 'open')::int as cards`);
  if (n(r[0]?.jobs)) return fail("SAFETY", "SAFETY.never_approved", `the test account has ${r[0].jobs} application job(s): something approved an application`);
  if (n(r[0]?.cards)) return fail("SAFETY", "SAFETY.never_approved", `${r[0].cards} card(s) of the test account were answered: the suite never answers a card`);
  return pass("SAFETY", "SAFETY.never_approved", "the test account has no application job and no answered card: nothing was approved or sent to an employer");
}

// Production-wide invariant: no application left for an employer without the exact approval (approval_hash = payload_hash).
export const SENT_STATES = ["confirmed", "submitted_unconfirmed", "unknown_outcome"];
export const FINISHED_STATES = ["confirmed", "submitted_unconfirmed", "needs_user", "failed", "not_submitted", "unknown_outcome"];
export async function approvalInvariant(db: Db, feature: string): Promise<Result> {
  const r = await db.rows<{ sent: number; unbound: number }>(
    `select count(*)::int as sent, count(*) filter (where approval_hash is distinct from payload_hash)::int as unbound
       from career_apply_jobs where state in (${SENT_STATES.map(q).join(",")})`);
  const x = r[0];
  if (n(x.unbound)) return fail(feature, `${feature}.approval_invariant`, `${x.unbound}/${x.sent} applications that reached an employer were not bound to their approval hash`);
  return pass(feature, `${feature}.approval_invariant`, `${x.sent}/${x.sent} applications that reached an employer carry approval_hash = payload_hash`);
}
// F2: a real Greenhouse application reached an employer through the script-submit binding in the window.
export async function greenhouseSubmitted(db: Db, days = 14): Promise<Result> {
  const r = await db.rows<{ n: number; confirmed: number }>(
    `select count(*)::int as n, count(*) filter (where state = 'confirmed' or email_confirmed_at is not null)::int as confirmed
       from career_apply_jobs where url ~* '(greenhouse\\.io|grnh\\.se)' and state in (${SENT_STATES.map(q).join(",")}) and updated_at > now() - interval '${days} days'`);
  const x = r[0];
  if (!n(x.n)) return fail("F2", "F2.real_greenhouse_submit", `no Greenhouse application reached an employer in the last ${days} days (UPMORE_SCRIPT_SUBMIT_LIVE and the owner's supervised trial, owner check O-6)`);
  return pass("F2", "F2.real_greenhouse_submit", `${x.n} Greenhouse application(s) reached an employer in ${days} days; ${x.confirmed} confirmed by the employer`);
}

// ------------------------------------------------------------------------------------------------ F3 prepare-ahead
export async function prepareAheadRail(db: Db, hours = 26): Promise<Result> {
  const r = await db.rows<{ n: number; newest: string | null }>(
    `select count(*)::int as n, max(updated_at)::text as newest from career_watch_kv where key like 'career:prepare-ahead:%' and updated_at > now() - interval '${hours} hours'`);
  return n(r[0]?.n)
    ? pass("F3", "F3.rail_ran", `the prepare-ahead rail recorded ${r[0].n} person-day(s) in ${hours} h (newest ${r[0].newest})`)
    : fail("F3", "F3.rail_ran", `no prepare-ahead day record in ${hours} h: the worker's daily rail is not running (CAREER_PREPARE_AHEAD=on and prepare-ahead.ts daily on the worker host)`);
}

// ------------------------------------------------------------------------------------------------ F6 ingest
export async function ingestFresh(db: Db, o: { maxAgeMin: number; minOpen: number }): Promise<Result[]> {
  const out: Result[] = [];
  const s = await db.rows<{ age_min: number | null; open: number; new_24h: number; runs_1h: number; new_1h: number }>(
    `select (select extract(epoch from now() - max(at)) / 60 from career_ingest_runs)::int as age_min,
            (select count(*) from career_postings where closed_at is null)::int as open,
            (select count(*) from career_postings where first_seen_at > now() - interval '24 hours')::int as new_24h,
            (select count(*) from career_ingest_runs where at > now() - interval '1 hour')::int as runs_1h,
            (select coalesce(sum(postings_new + postings_seen), 0) from career_ingest_runs where at > now() - interval '1 hour')::int as new_1h`);
  const x = s[0];
  if (x.age_min == null) out.push(fail("F6", "F6.last_run_fresh", "career_ingest_runs has no run: the ingest has never recorded a lane run"));
  else if (x.age_min > o.maxAgeMin) out.push(fail("F6", "F6.last_run_fresh", `the newest ingest run is ${x.age_min} min old (more than ${o.maxAgeMin})`));
  else out.push(pass("F6", "F6.last_run_fresh", `newest ingest run ${x.age_min} min ago; ${x.runs_1h} lane runs in the last hour read ${x.new_1h} postings`));
  if (x.open < o.minOpen) out.push(fail("F6", "F6.index_size", `${x.open} open postings (fewer than ${o.minOpen}); ${x.new_24h} first seen in 24 h`));
  else if (!x.new_24h) out.push(fail("F6", "F6.index_size", `${x.open} open postings but none first seen in 24 h: the index is not moving`));
  else out.push(pass("F6", "F6.index_size", `${x.open} open postings; ${x.new_24h} first seen in the last 24 h`));
  return out;
}
export async function ingestLanes(db: Db, minFresh = 0.9): Promise<Result> {
  const r = await db.rows<{ lane: number; lanes: number; runs: number; last_at: string | null; directory_fresh: number | null; directory_total: number | null }>(
    `select lane, lanes, runs::int, last_at::text, directory_fresh, directory_total from public.career_ingest_coverage(interval '1 hour')`);
  if (!r.length) return fail("F6", "F6.lanes_cover_directory", "no lane plan on record (career_ingest_coverage is empty)");
  const silent = r.filter((x) => n(x.runs) === 0).map((x) => x.lane);
  // The directory's freshness as the newest run counted it (each run counts the whole directory after its writes).
  const newest = [...r].filter((x) => x.last_at).sort((a, b) => Date.parse(b.last_at!) - Date.parse(a.last_at!))[0];
  const fresh = n(newest?.directory_fresh), total = n(newest?.directory_total);
  const share = total ? fresh / total : 0;
  if (silent.length) return fail("F6", "F6.lanes_cover_directory", `${r.length - silent.length}/${r.length} lanes ran in the last hour; silent lanes: ${silent.slice(0, 10).join(", ")}`);
  if (share < minFresh) return fail("F6", "F6.lanes_cover_directory", `${fresh}/${total} boards read within the hour (${Math.round(share * 100)}%, below ${Math.round(minFresh * 100)}%)`);
  return pass("F6", "F6.lanes_cover_directory", `${r.length}/${r.length} lanes ran in the last hour; ${fresh}/${total} boards read within the hour`);
}
export async function cronJobs(db: Db, feature: string, pattern: string, maxAgeMin: number): Promise<Result> {
  const r = await db.rows<{ jobname: string; status: string | null; age_min: number | null }>(
    `select j.jobname, d.status, (extract(epoch from now() - d.start_time) / 60)::int as age_min from cron.job j
       left join lateral (select status, start_time from cron.job_run_details x where x.jobid = j.jobid order by start_time desc limit 1) d on true
      where j.jobname like ${q(pattern)}`);
  const C = `${feature}.schedule`;
  if (!r.length) return fail(feature, C, `no pg_cron job named like ${pattern}: the schedule script was not run`);
  const bad = r.filter((x) => x.status !== "succeeded" || x.age_min == null || x.age_min > maxAgeMin);
  if (bad.length) return fail(feature, C, `${r.length - bad.length}/${r.length} ${pattern} jobs fired and succeeded within ${maxAgeMin} min; e.g. ${bad[0].jobname}: ${bad[0].status ?? "never fired"}`);
  return pass(feature, C, `${r.length}/${r.length} ${pattern} jobs succeeded within ${maxAgeMin} min`);
}

// ------------------------------------------------------------------------------------------------ F7 alerts
export async function watchSaved(db: Db, run: Run, words: string[]): Promise<Result> {
  const r = await db.rows<{ on: boolean; keywords: string }>(
    `select coalesce((prefs->>'on')::boolean, false) as on, coalesce(prefs->'keywords', '[]'::jsonb)::text as keywords from career_alert_prefs where user_id = ${uid(run.userId)}`);
  if (!r.length) return fail("F7", "F7.watch_saved", "after the watch turn no career_alert_prefs row exists for the test account");
  if (!r[0].on) return fail("F7", "F7.watch_saved", "career_alert_prefs exists but alerts are off");
  const kw = r[0].keywords.toLowerCase();
  const missing = words.filter((w) => !kw.includes(w.toLowerCase()));
  if (missing.length) return fail("F7", "F7.watch_saved", `the saved keywords miss: ${missing.join(", ")}`, { keywords: r[0].keywords });
  return pass("F7", "F7.watch_saved", `alerts on with keywords ${r[0].keywords}`);
}
export async function runRecordFresh(db: Db, feature: string, table: "career_proactive_runs" | "channel_delivery_runs", maxAgeMin: number): Promise<Result> {
  const r = await db.rows<{ age_min: number | null; error: string | null }>(
    `select (extract(epoch from now() - run_at) / 60)::int as age_min, error from ${table} order by run_at desc limit 1`);
  const C = `${feature}.${table}_fresh`;
  if (!r.length || r[0].age_min == null) return fail(feature, C, `${table} has no run: the function has never completed a scheduled run`);
  if (r[0].error) return fail(feature, C, `the newest ${table} row (${r[0].age_min} min ago) failed: ${String(r[0].error).slice(0, 160)}`);
  if (r[0].age_min > maxAgeMin) return fail(feature, C, `the newest ${table} row is ${r[0].age_min} min old (more than ${maxAgeMin})`);
  return pass(feature, C, `newest ${table} row ${r[0].age_min} min ago, no error`);
}
// An alert for the test account, queued in this run, names an open posting whose title carries the watch's words.
export async function alertQueued(db: Db, run: Run, words: string[]): Promise<Result> {
  const r = await db.rows<{ key: string; status: string; contact: string | null; title: string | null; open: boolean | null }>(
    `select o.key, o.status, o.contact, p.title, p.closed_at is null as open from career_outbox o
       left join career_postings p on p.job_id = substr(o.key, 7)
      where o.user_id = ${uid(run.userId)} and o.kind = 'alert' and o.created_at >= ${q(run.startedAt)}::timestamptz order by o.id`);
  if (!r.length) return fail("F7", "F7.alert_for_new_posting", "no alert was queued for the test account's watch during the run");
  const good = r.filter((x) => x.title && x.open && words.every((w) => x.title!.toLowerCase().includes(w.toLowerCase())));
  if (!good.length) return fail("F7", "F7.alert_for_new_posting", `${r.length} alert(s) queued, none for an open posting whose title carries "${words.join(" ")}"`, { keys: r.map((x) => x.key).slice(0, 5) });
  return pass("F7", "F7.alert_for_new_posting", `${good.length}/${r.length} queued alert(s) name an open matching posting (e.g. ${good[0].title}); status ${good[0].status}`);
}
// Real people got alerts: delivered rows in 24 h, through a contact.
export async function alertsDelivered(db: Db, testUserId: string, hours = 24): Promise<Result> {
  const r = await db.rows<{ delivered: number; failed: number; people: number }>(
    `select count(*) filter (where status = 'delivered' and delivered_at is not null and contact is not null)::int as delivered,
            count(*) filter (where status = 'failed')::int as failed,
            count(distinct user_id) filter (where status = 'delivered')::int as people
       from career_outbox where kind = 'alert' and created_at > now() - interval '${hours} hours' and user_id <> ${uid(testUserId)}`);
  const x = r[0];
  if (!n(x.delivered)) return fail("F7", "F7.alerts_delivered", `no alert was delivered to a person in ${hours} h (${x.failed} failed)`);
  return pass("F7", "F7.alerts_delivered", `${x.delivered} alert(s) delivered to ${x.people} person(s) in ${hours} h; ${x.failed} failed`);
}
// Safety: anything queued for the test account went nowhere but the test chat (or nowhere at all).
export async function testOutboxContained(db: Db, run: Run, allowedContact: string | null): Promise<Result> {
  const r = await db.rows<{ contact: string | null; status: string }>(
    `select contact, status from career_outbox where user_id = ${uid(run.userId)} and status in ('sending', 'delivered')`);
  const stray = r.filter((x) => !allowedContact || x.contact !== allowedContact);
  return stray.length
    ? fail("SAFETY", "SAFETY.test_outbox_contained", `${stray.length} message(s) for the test account went to a contact that is not the test chat`)
    : pass("SAFETY", "SAFETY.test_outbox_contained", `${r.length} delivered message(s) for the test account, all to the test chat${allowedContact ? "" : " (none: no test chat linked)"}`);
}

// ------------------------------------------------------------------------------------------------ F8 inbox
// "check my email now": a reply that says mail was read needs a mail cursor written in that turn; one that says nothing
// was read must not have one.
export async function inboxHonest(db: Db, t: Turn, run: Run): Promise<Result> {
  const r = await db.rows<{ moved: number }>(
    `select count(*)::int as moved from career_mail_cursors where user_id = ${uid(run.userId)} and updated_at >= ${q(t.at)}::timestamptz`);
  const claimsRead = /\bI read your (?:mail|email|inbox)\b/i.test(t.reply);
  const moved = n(r[0]?.moved) > 0;
  if (claimsRead && !moved) return fail("F8", "F8.inbox_reply_matches_state", "the reply says the mail was read but no mail cursor moved");
  if (!claimsRead && moved) return fail("F8", "F8.inbox_reply_matches_state", "a mail cursor moved but the reply says nothing was read");
  if (!claimsRead && !/gmail|connect|not switched on|not connected|mail tracking/i.test(t.reply)) return fail("F8", "F8.inbox_reply_matches_state", "no mail was read and the reply does not say why", { reply: t.reply.slice(0, 200) });
  return pass("F8", "F8.inbox_reply_matches_state", claimsRead ? "the reply says mail was read and the cursor moved" : "no Gmail on the test account: the reply says so and nothing was read");
}
export async function followupsMatch(db: Db, t: Turn, run: Run): Promise<Result> {
  const r = await db.rows<{ due: number }>(`select count(*)::int as due from career_mail_drafts where user_id = ${uid(run.userId)} and kind = 'followup' and state = 'drafted'`);
  const due = n(r[0]?.due);
  const saysNone = /\b(no|nothing|none)\b[^.]{0,60}\b(follow-?ups?|due)\b|\bno follow-?ups?\b|nothing (?:is )?due/i.test(t.reply);
  if (due === 0 && !saysNone) return fail("F8", "F8.followups_reply_matches_state", "no follow-up is due on record but the reply does not say none is due", { reply: t.reply.slice(0, 200) });
  if (due > 0 && saysNone) return fail("F8", "F8.followups_reply_matches_state", `${due} follow-up draft(s) on record but the reply says none`);
  return pass("F8", "F8.followups_reply_matches_state", `${due} follow-up(s) due on record; the reply agrees`);
}

// ------------------------------------------------------------------------------------------------ F9 memory
export async function memoryAcrossThreads(db: Db, a: Turn, b: Turn, run: Run, facts: string[]): Promise<Result[]> {
  const out: Result[] = [];
  if (a.threadId && b.threadId && a.threadId === b.threadId) out.push(fail("F9", "F9.fact_used_in_new_thread", "thread B is the same thread as thread A"));
  else {
    const missing = facts.filter((f) => !norm(b.reply).includes(f.toLowerCase()));
    out.push(missing.length
      ? fail("F9", "F9.fact_used_in_new_thread", `a new thread does not know: ${missing.join(", ")}`, { reply: b.reply.slice(0, 240) })
      : pass("F9", "F9.fact_used_in_new_thread", `a new thread names ${facts.join(", ")} said in thread A`));
  }
  const ev = await db.rows<{ n: number }>(
    `select count(*)::int as n from career_events where user_id = ${uid(run.userId)} and kind = 'fact_confirmed' and at >= ${q(a.at)}::timestamptz and (${facts.map((f) => `lower(subject) like ${q(`%${f.toLowerCase()}%`)}`).join(" or ")})`);
  const acct = await db.rows<{ mem: boolean }>(`select (value ? 'memory' or value ? 'stated_facts') as mem from career_watch_kv where user_id = ${uid(run.userId)} and key = 'career:account'`);
  if (!n(ev[0]?.n)) out.push(fail("F9", "F9.fact_on_account", "no fact_confirmed event for the stated facts: the fact has no provenance on the account"));
  else if (!acct[0]?.mem) out.push(fail("F9", "F9.fact_on_account", "the account record holds no memory or stated facts"));
  else out.push(pass("F9", "F9.fact_on_account", `${ev[0].n} fact_confirmed event(s); the account record carries the memory`));
  return out;
}

// ------------------------------------------------------------------------------------------------ F10 networking
export function importCount(reply: string): { imported: number; of: number } | null {
  const m = /imported (\d+)\/(\d+) rows/i.exec(reply);
  return m ? { imported: Number(m[1]), of: Number(m[2]) } : null;
}
export async function outreachDrafted(db: Db, t: Turn, run: Run, domain: string): Promise<Result> {
  const m = /Drafted (\d+)\/(\d+)/i.exec(t.reply);
  const rows = await db.rows<{ email: string | null; status: string; hash: string; sent: boolean }>(
    `select recipient_email as email, status, hash, sent_at is not null as sent from career_outreach_drafts where user_id = ${uid(run.userId)} and created_at >= ${q(t.at)}::timestamptz`);
  if (!m) return fail("F10", "F10.draft_on_approval", /not switched on|CAREER_NETWORKING_DRAFT|nothing is drafted|would be written/i.test(t.reply)
    ? "drafting is off in production (CAREER_NETWORKING_DRAFT)" : "the reply has no draft count", { reply: t.reply.slice(0, 200) });
  if (rows.length !== Number(m[1])) return fail("F10", "F10.draft_on_approval", `the reply says ${m[0]} but ${rows.length} draft row(s) were written`);
  const stray = rows.filter((r) => !String(r.email ?? "").toLowerCase().endsWith(domain));
  if (stray.length) return fail("F10", "F10.draft_on_approval", `${stray.length} draft(s) address someone outside ${domain}`);
  if (rows.some((r) => r.sent || !["shown", "skipped"].includes(r.status))) return fail("F10", "F10.draft_on_approval", "a draft was approved or sent: drafts must wait for the person's send");
  if (rows.some((r) => !/^[0-9a-f]{64}$/.test(r.hash))) return fail("F10", "F10.draft_on_approval", "a draft has no payload hash");
  return pass("F10", "F10.draft_on_approval", `${m[0]}; ${rows.length} draft(s) waiting for approval, hash-bound, none sent`);
}

// ------------------------------------------------------------------------------------------------ F11 mock
export async function mockDone(db: Db, run: Run, debrief: Turn): Promise<Result> {
  const r = await db.rows<{ detail: any }>(
    `select detail from career_events where user_id = ${uid(run.userId)} and kind = 'mock_done' and at >= ${q(run.startedAt)}::timestamptz order by id desc limit 1`);
  if (!r.length) return fail("F11", "F11.mock_done_recorded", "the mock finished in chat but no mock_done event was written");
  const answers: any[] = Array.isArray(r[0].detail?.answers) ? r[0].detail.answers : [];
  const weak = [...new Set(answers.filter((a) => a?.weak).map((a) => String(a.skill ?? "")).filter(Boolean))];
  const m = /Weak spots kept for a drill: ([^\n.]+)/i.exec(debrief.reply);
  const said = m ? m[1].split(/,\s*|\s+and\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
  const a = [...weak].map((s) => s.toLowerCase()).sort().join("|"), b = [...said].sort().join("|");
  if (a !== b) return fail("F11", "F11.mock_done_recorded", `the debrief names weak spots [${said.join(", ")}] but the event records [${weak.join(", ")}]`);
  return pass("F11", "F11.mock_done_recorded", `mock_done recorded with ${answers.length} answer(s); weak spots in the debrief match the event (${weak.join(", ") || "none"})`);
}

// ------------------------------------------------------------------------------------------------ F12 offer
export interface Bench { kind: string; shown: boolean; median: number | null; n: number | null }
const usd = (v: number) => "$" + Math.round(v).toLocaleString("en-US");
// Every benchmark the data shows is cited with its own median and n; one the data refuses is never given a median.
export function offerNumbers(t: Turn, expected: Bench[]): Result {
  const F = "F12", C = "F12.numbers_match_benchmarks";
  const shown = expected.filter((b) => b.shown && b.median != null);
  if (!shown.length) return notRun(F, C, "the benchmark data has no figure for this offer: nothing to compare");
  const missing: string[] = [];
  for (const b of shown) {
    if (!t.reply.includes(usd(b.median!))) missing.push(`${b.kind} median ${usd(b.median!)}`);
    if (b.n != null) {
      const want = b.kind === "lca" ? `${b.n} filings` : b.n.toLocaleString("en-US");
      if (!t.reply.includes(want)) missing.push(`${b.kind} n ${want}`);
    }
  }
  if (missing.length) return fail(F, C, `the reply does not cite: ${missing.join("; ")}`, { reply: t.reply.slice(0, 300) });
  return pass(F, C, `${shown.length}/${shown.length} benchmark medians and their n cited exactly (${shown.map((b) => `${b.kind} ${usd(b.median!)}`).join(", ")})`);
}

// ------------------------------------------------------------------------------------------------ F14 receipts
export async function receiptReplyMatches(db: Db, t: Turn, run: Run): Promise<Result> {
  const r = await db.rows<{ n: number; companies: string | null }>(
    `select count(*)::int as n, string_agg(distinct company, ', ') as companies from career_apply_receipts where user_id = ${uid(run.userId)}`);
  const count = n(r[0]?.n);
  const none = /No application receipts are on record yet/i.test(t.reply);
  if (count === 0 && !none) return fail("F14", "F14.receipt_reply_matches_state", "no receipt on record but the reply does not say so", { reply: t.reply.slice(0, 200) });
  if (count > 0 && none) return fail("F14", "F14.receipt_reply_matches_state", `${count} receipt(s) on record but the reply says none`);
  return pass("F14", "F14.receipt_reply_matches_state", `${count} receipt(s) on record for the test account; the reply agrees`);
}
export async function receiptIntegrity(db: Db): Promise<Result> {
  const r = await db.rows<{ finished: number; missing: number; mismatched: number }>(
    `select count(*)::int as finished,
            count(*) filter (where r.application_id is null)::int as missing,
            count(*) filter (where r.application_id is not null and (r.payload_hash is distinct from j.payload_hash or r.approval_hash is distinct from j.approval_hash or r.state is distinct from j.state))::int as mismatched
       from career_apply_jobs j left join career_apply_receipts r on r.application_id = j.id
      where j.state in (${FINISHED_STATES.map(q).join(",")})`);
  const x = r[0];
  if (n(x.missing) || n(x.mismatched)) return fail("F14", "F14.every_finished_job_has_matching_receipt", `${x.finished - x.missing - x.mismatched}/${x.finished} finished applications have a receipt matching the job (missing ${x.missing}, mismatched ${x.mismatched})`);
  return pass("F14", "F14.every_finished_job_has_matching_receipt", `${x.finished}/${x.finished} finished applications have a receipt with the job's state, payload hash and approval hash`);
}

// ------------------------------------------------------------------------------------------------ CLOUD
export async function cloudInvariant(db: Db, hours = 168): Promise<Result> {
  const r = await db.rows<{ jobs: number; unbound: number; stuck: number }>(
    `select count(*)::int as jobs,
            count(*) filter (where j.state in (${SENT_STATES.map(q).join(",")}) and j.approval_hash is distinct from j.payload_hash)::int as unbound,
            count(*) filter (where j.state in ('claimed', 'driving') and j.claimed_at < now() - interval '30 minutes')::int as stuck
       from career_apply_jobs j where j.source = 'cloud' and j.updated_at > now() - interval '${hours} hours'`);
  const x = r[0];
  if (n(x.unbound)) return fail("CLOUD", "CLOUD.sent_only_approved", `${x.unbound} cloud-sent application(s) without the exact approval hash`);
  if (n(x.stuck)) return fail("CLOUD", "CLOUD.sent_only_approved", `${x.stuck} cloud job(s) held by a sandbox for more than 30 min`);
  if (!n(x.jobs)) return fail("CLOUD", "CLOUD.sent_only_approved", `no cloud application in ${hours} h: the cloud sender has not run in production (owner check O-1 drives the first one)`);
  return pass("CLOUD", "CLOUD.sent_only_approved", `${x.jobs} cloud job(s) in ${hours} h; every one that reached an employer carries its approval hash; none stuck`);
}

// ------------------------------------------------------------------------------------------------ TG
export async function telegramLinked(db: Db, run: Run, chatId: string): Promise<{ ok: boolean; result: Result; threadId: string | null }> {
  const r = await db.rows<{ user_id: string; thread_id: string | null; opted_out: boolean }>(
    `select user_id, thread_id, opted_out from channel_contacts where contact = ${q(`tg:${chatId}`)}`);
  if (!r.length) return { ok: false, threadId: null, result: notRun("TG", "TG.test_chat_linked", "the test chat is not linked to any account (owner setup step 4)") };
  if (r[0].user_id !== run.userId) return { ok: false, threadId: null, result: fail("TG", "TG.test_chat_linked", "the test chat is linked to another account: refusing to post as it") };
  if (r[0].opted_out) return { ok: false, threadId: null, result: fail("TG", "TG.test_chat_linked", "the test chat is opted out (STOP)") };
  return { ok: true, threadId: r[0].thread_id, result: pass("TG", "TG.test_chat_linked", "the test chat is linked to the test account") };
}
export async function telegramTurnRecorded(db: Db, run: Run, at: string, text: string): Promise<Result> {
  const r = await db.rows<{ user_msgs: number; replies: number }>(
    `select count(*) filter (where m.role = 'user' and m.content = ${q(text)})::int as user_msgs,
            count(*) filter (where m.role = 'assistant')::int as replies
       from agent_messages m join agent_threads th on th.id = m.thread_id
      where th.user_id = ${uid(run.userId)} and m.created_at >= ${q(at)}::timestamptz`);
  const x = r[0];
  if (!n(x.user_msgs)) return fail("TG", "TG.turn_recorded", "the Telegram message was not recorded as the test account's turn");
  if (!n(x.replies)) return fail("TG", "TG.turn_recorded", "the Telegram message was recorded but got no reply");
  return pass("TG", "TG.turn_recorded", "the Telegram message ran as the test account's turn and was answered");
}

// ------------------------------------------------------------------------------------------------ erase
// After "forget my career profile": everything the erase promises is gone, and the account is paused.
export async function eraseErased(db: Db, run: Run): Promise<Result[]> {
  const u = uid(run.userId);
  const tables: [string, string][] = [
    ["career_events", `select count(*)::int as n from career_events where user_id = ${u}`],
    ["career_alert_prefs", `select count(*)::int as n from career_alert_prefs where user_id = ${u}`],
    ["career_watch_kv (other than the account and turn receipts)", `select count(*)::int as n from career_watch_kv where user_id = ${u} and key <> 'career:account' and key not like 'career:turn:%'`],
    ["turn receipts still holding a reply", `select count(*)::int as n from career_watch_kv where user_id = ${u} and key like 'career:turn:%' and value->'response' is not null and value->'response' <> 'null'::jsonb`],
    ["career_outreach_drafts", `select count(*)::int as n from career_outreach_drafts where user_id = ${u}`],
    ["career_mail_events", `select count(*)::int as n from career_mail_events where user_id = ${u}`],
    ["career_mail_drafts", `select count(*)::int as n from career_mail_drafts where user_id = ${u}`],
    ["career_interviews", `select count(*)::int as n from career_interviews where user_id = ${u}`],
    ["career_apply_cloud_optin", `select count(*)::int as n from career_apply_cloud_optin where user_id = ${u}`],
  ];
  const left: string[] = [];
  for (const [name, sql] of tables) {
    const r = await db.rows<{ n: number }>(sql);
    if (n(r[0]?.n)) left.push(`${name}: ${r[0].n}`);
  }
  const acct = await db.rows<{ paused: boolean | null; mem: boolean }>(
    `select (value->>'paused')::boolean as paused, (value ? 'memory' or value ? 'stated_facts') as mem from career_watch_kv where user_id = ${u} and key = 'career:account'`);
  const out: Result[] = [];
  out.push(left.length
    ? fail("ERASE", "ERASE.erased", `the erase left rows behind: ${left.join("; ")}`)
    : pass("ERASE", "ERASE.erased", `${tables.length}/${tables.length} stores the erase covers are empty for the test account`));
  if (!acct.length || acct[0].paused !== true) out.push(fail("ERASE", "ERASE.account_paused", "after the erase the account is not paused"));
  else if (acct[0].mem) out.push(fail("ERASE", "ERASE.account_paused", "after the erase the account record still holds memory or stated facts"));
  else out.push(pass("ERASE", "ERASE.account_paused", "the account is paused and holds no memory: nothing acts on what the audit trail keeps"));
  return out;
}

// Safety, end of run: every row this run's threads produced belongs to the test account.
export async function noForeignWrites(db: Db, run: Run, threadIds: string[]): Promise<Result> {
  const ids = threadIds.filter((t) => UUID.test(t));
  if (!ids.length) return notRun("SAFETY", "SAFETY.no_foreign_writes", "no thread was used");
  const list = ids.map(q).join(",");
  const r = await db.rows<{ foreign_threads: number; foreign_costs: number; foreign_cards: number }>(
    `select (select count(*) from agent_threads where id in (${list}) and user_id <> ${uid(run.userId)})::int as foreign_threads,
            (select count(*) from agent_turn_costs where thread_id in (${list}) and user_id <> ${uid(run.userId)})::int as foreign_costs,
            (select count(*) from career_outreach_drafts where thread_id in (${list}) and user_id <> ${uid(run.userId)})::int as foreign_cards`);
  const x = r[0];
  const bad = n(x.foreign_threads) + n(x.foreign_costs) + n(x.foreign_cards);
  return bad
    ? fail("SAFETY", "SAFETY.no_foreign_writes", `rows in this run's ${ids.length} thread(s) belong to another account (threads ${x.foreign_threads}, costs ${x.foreign_costs}, drafts ${x.foreign_cards})`)
    : pass("SAFETY", "SAFETY.no_foreign_writes", `every row in this run's ${ids.length} thread(s) belongs to the test account`);
}
