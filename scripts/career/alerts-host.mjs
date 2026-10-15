// HOST TIER (not product chat code, no deploy): the alerts host wiring —
// docs/career/alerts-host-wiring.md is the design note this implements.
// Modules 151 (watch) and 152 (assign) deliberately stop at injected seams:
// 151 emits alert records to a sink; 152 holds per-user watch profiles, a
// reminder queue and seat history in an injected {get,set} store. This file
// is the host that joins them per user:
//
//   runUserAlertCycle(userId, deps):
//     load watch profile (152) -> per-board 151 runWatchCycle over the
//     user's feeds (per-user-per-board snapshot keys, BUG-091) collecting
//     alerts -> 152 runAssignCycle(alerts) -> drain the 152 queue ->
//     deliverReminder() each record through the delivery ledger.
//
// Exactly-once: 152's drain removes what it returns AND deliverReminder
// refuses any reminder_id already in the delivery ledger
// (career:delivery-ledger:<user_id>), so a crash/retry between drain and
// channel send can never produce a second delivered record.
//
// Stores (121's KV contract {get,set}, keys exactly as 152 defines):
//   createFileStore(path)      durable on one host; the host-tier proof store
//   createSupabaseStore(opts)  the deployed shape, behind the same interface;
//                              honestly NOT_WIRED without an injected
//                              PostgREST client + the career_watch_kv table
//                              (migration is owner/coordinator work — §1 of
//                              the design note). Never fakes a write.
//
// Delivery channel at this tier: "host_record" — the delivered record is
// appended to a JSONL delivered-log when deps.deliveredLogPath is given and
// always returned on the cycle result. "Received" at higher tiers is defined
// in the design note §3. Nothing here sends anything to any person.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Watch = require("../../packages/domain/151-career-alert-watch.js");
const Assign = require("../../packages/domain/152-career-assign.js");
const Jobs = require("../../packages/domain/121-career-jobs.js");

const s = (v) => (v == null ? "" : String(v));
const lc = (v) => s(v).toLowerCase();

// Per-user-per-board snapshot key: 151's boardSnapshotKey scheme (BUG-091 —
// a shared snapshot + subset polling corrupts the seen-set) scoped per user,
// so the starred (15 min) and default (60 min) subsets poll independently.
export const userBoardSnapshotKey = (feed, userId) => `${Watch.boardSnapshotKey(feed)}:${userId}`;
export const DELIVERY_LEDGER_KEY = (userId) => `career:delivery-ledger:${userId}`;

// ---- stores -----------------------------------------------------------------
// File-backed KV: the whole map is one JSON file (the alert-watch-runner.mjs
// pattern). get/set are async to match the deployed adapter's shape.
export function createFileStore(filePath) {
  const readAll = () => { try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return {}; } };
  return {
    kind: "file",
    path: filePath,
    async get(k) { const all = readAll(); return k in all ? all[k] : null; },
    async set(k, v) { const all = readAll(); all[k] = v; fs.writeFileSync(filePath, JSON.stringify(all, null, 2)); },
  };
}

// In-memory KV (151's own factory) — tests and ephemeral hosts.
export function createMemoryStore() { return Watch.createMemoryStore(); }

// Supabase-shaped adapter: same {get,set} interface over a generic per-user
// KV table (career_watch_kv: user_id, key, value jsonb). Requires an injected
// PostgREST-style client: client.from(table).select("value").eq("user_id",u)
// .eq("key",k).maybeSingle() and .upsert(row, {onConflict:"user_id,key"}).
// Without a client this is NOT_WIRED by construction — the factory throws and
// supabaseStoreStatus() reports the missing pieces instead of pretending.
export function supabaseStoreStatus(opts) {
  const o = opts || {};
  const missing = [];
  if (!o.client) missing.push("no PostgREST client injected (the deployed host supplies the service-role client)");
  if (!o.userId) missing.push("no userId (the store is per-user by construction)");
  missing.push("table public.career_watch_kv not confirmed to exist (migration is owner/coordinator work; design note §1)");
  return { status: missing.length > 1 || !o.client || !o.userId ? "NOT_WIRED" : "NOT_WIRED", missing, table: o.table || "career_watch_kv" };
}
export function createSupabaseStore(opts) {
  const o = opts || {};
  if (!o.client || !o.userId) {
    const st = supabaseStoreStatus(o);
    const err = new Error(`supabase watch store is NOT_WIRED: ${st.missing.join("; ")}`);
    err.code = "NOT_WIRED";
    err.status = st;
    throw err;
  }
  const table = o.table || "career_watch_kv";
  return {
    kind: "supabase",
    table,
    user_id: o.userId,
    async get(k) {
      const r = await o.client.from(table).select("value").eq("user_id", o.userId).eq("key", k).maybeSingle();
      if (r.error) throw new Error(`career_watch_kv read failed: ${r.error.message || r.error}`);
      return r.data ? r.data.value : null;
    },
    async set(k, v) {
      const r = await o.client.from(table).upsert(
        { user_id: o.userId, key: k, value: v, updated_at: new Date().toISOString() },
        { onConflict: "user_id,key" });
      if (r.error) throw new Error(`career_watch_kv write failed: ${r.error.message || r.error}`);
    },
  };
}

// ---- delivery -----------------------------------------------------------------
// The delivered record: the reminder's PD-1 shape (deadline quoted from the
// posting, fit lines incl. match basis) carried verbatim, plus the delivery
// facts. speak_line is 152's own one-sentence rendering.
export function deliveredRecordFor(reminder, opts) {
  const o = opts || {};
  return {
    type: "career_job_reminder_delivered",
    reminder_id: reminder.reminder_id,
    user_id: reminder.user_id,
    job_id: reminder.job_id,
    company: reminder.company,
    company_stated: reminder.company_stated,
    title: reminder.title,
    role_title: reminder.role_title,
    location: reminder.location || null,
    url: reminder.url,
    deadline: reminder.deadline || null, // PD-1: the posting's own words, or null — never invented
    fit_lines: (reminder.fit && reminder.fit.lines) || [], // PD-1: proven-fact + match-basis lines
    matched_fact_ids: (reminder.fit && reminder.fit.matched_fact_ids) || [],
    speak_line: Assign.speakLine(reminder),
    channel: o.channel || "host_record",
    delivered_at: new Date(o.now || Date.now()).toISOString(),
  };
}

// Deliver ONE reminder exactly once. The ledger is checked before delivery
// and the id is recorded as part of the delivery step; a record re-presented
// after a crash returns { delivered: false, duplicate: true } and no second
// delivered record is ever produced. deps.sink, when given, is the channel
// hook (called with the delivered record, after the ledger write).
export async function deliverReminder(reminder, deps) {
  const d = deps || {};
  const store = d.store;
  if (!store || typeof store.get !== "function" || typeof store.set !== "function")
    throw new Error("deliverReminder requires the injected store {get,set} (the ledger lives there)");
  if (!reminder || !reminder.reminder_id) throw new Error("deliverReminder requires a reminder with reminder_id");
  const userId = reminder.user_id || d.userId;
  if (!userId) throw new Error("deliverReminder requires the reminder's user_id");
  const key = DELIVERY_LEDGER_KEY(userId);
  const ledger = (await store.get(key)) || { user_id: userId, delivered_ids: [], records: [] };
  if ((ledger.delivered_ids || []).includes(reminder.reminder_id)) {
    return { delivered: false, duplicate: true, reminder_id: reminder.reminder_id,
      record: (ledger.records || []).find((r) => r.reminder_id === reminder.reminder_id) || null };
  }
  const record = deliveredRecordFor(reminder, { now: d.now, channel: d.channel });
  ledger.delivered_ids = [...(ledger.delivered_ids || []), reminder.reminder_id];
  ledger.records = [...(ledger.records || []), record];
  await store.set(key, ledger);
  if (d.deliveredLogPath) fs.appendFileSync(d.deliveredLogPath, JSON.stringify(record) + "\n");
  if (typeof d.sink === "function") await d.sink(record);
  return { delivered: true, duplicate: false, reminder_id: reminder.reminder_id, record };
}

// ---- the per-user cycle -------------------------------------------------------
// deps: { store, fetch, feeds, now, cadence: "starred"|"default"|"all",
//         deliveredLogPath?, sink?, channel? }
// feeds default to 121's live board registry; the caller (scheduler) may pass
// a directory-built set instead. The watch profile's scoring_profile is the
// 121 profile 151 scores against; interests live on the same record for 152.
export async function runUserAlertCycle(userId, deps) {
  const d = deps || {};
  const store = d.store;
  if (!store || typeof store.get !== "function" || typeof store.set !== "function")
    throw new Error("runUserAlertCycle requires an injected store {get,set}");
  const now = d.now == null ? Date.now() : d.now;
  const wp = await Assign.loadWatchProfile(store, userId);
  if (!wp) {
    return { type: "career_alert_host_cycle", user_id: userId, at: new Date(now).toISOString(),
      status: "no_watch_profile", alerts: 0, reminders_queued: 0, delivered: [], suppressed: [], errors: [] };
  }
  if (wp.opt_out && wp.opt_out.global) {
    return { type: "career_alert_host_cycle", user_id: userId, at: new Date(now).toISOString(),
      status: "opted_out", alerts: 0, reminders_queued: 0, delivered: [], suppressed: [], errors: [] };
  }
  const scoring = wp.scoring_profile;
  if (!scoring) throw new Error(`watch profile for ${userId} carries no scoring_profile (152 needs the 121 scoreFit shape)`);
  const feeds = d.feeds || Jobs.boardFeeds();
  const starred = new Set(((scoring.preferences || {}).starred_companies || []).map(lc));
  const cadence = d.cadence || "all";
  const selected = feeds.filter((f) => {
    if (cadence === "all") return true;
    const isStarred = starred.has(lc(f.company || f.company_token));
    return cadence === "starred" ? isStarred : !isStarred;
  });

  // 151 per feed, per-user-per-board snapshot keys; sink collects alerts.
  const alerts = [];
  const errors = [];
  let seededBoards = 0;
  for (const feed of selected) {
    try {
      const r = await Watch.runWatchCycle({
        feeds: [feed], fetch: d.fetch, profile: scoring, store,
        sink: async (rec) => { alerts.push(rec); },
        now, snapshotKey: userBoardSnapshotKey(feed, userId),
        ...(d.alertOnSeed ? { alertOnSeed: true } : {}),
        ...(d.boardDeadlineMs != null ? { boardDeadlineMs: d.boardDeadlineMs } : {}),
      });
      if (r.seeded) seededBoards += 1;
      for (const e of r.errors || []) errors.push({ board: Watch.boardIdOf(feed), error: e.error });
    } catch (e) {
      errors.push({ board: Watch.boardIdOf(feed), error: s(e && e.message || e) });
    }
  }

  // Presence: every job_id the user's snapshots currently hold (152's seat
  // rule distinguishes a repost from a seat-count change by presence).
  const presentJobIds = new Set();
  for (const feed of feeds) {
    const snap = await store.get(userBoardSnapshotKey(feed, userId));
    for (const id of (snap && snap.job_ids) || []) presentJobIds.add(id);
  }

  // 152: match alerts against the user's interests, enqueue reminders.
  const assign = await Assign.runAssignCycle({ alerts, watchProfile: wp, store, now, presentJobIds });

  // Drain exactly once (152 queue contract) and deliver through the ledger.
  const queue = Assign.createReminderQueue(store, userId);
  const drained = await queue.drain();
  const delivered = [];
  for (const reminder of drained) {
    const res = await deliverReminder(reminder, { store, now, channel: d.channel, deliveredLogPath: d.deliveredLogPath, sink: d.sink });
    if (res.delivered) delivered.push(res.record);
    else errors.push({ stage: "deliver", reminder_id: reminder.reminder_id, error: "duplicate delivery suppressed by ledger" });
  }

  return {
    type: "career_alert_host_cycle", user_id: userId, at: new Date(now).toISOString(),
    status: errors.length ? "degraded" : "ok", cadence,
    boards_polled: selected.length, boards_seeded: seededBoards,
    alerts: alerts.length, alert_records: alerts,
    reminders_queued: assign.reminders.length, queue_depth: await queue.size(),
    delivered, suppressed: assign.suppressed, rejected_count: assign.rejected.length,
    errors,
  };
}

// One scheduler invocation over many users (the design note §2 step):
// sequential per user; one user's failure degrades that user only.
export async function runSchedulerPass(userIds, deps) {
  const out = [];
  for (const userId of userIds || []) {
    try { out.push(await runUserAlertCycle(userId, deps)); }
    catch (e) { out.push({ type: "career_alert_host_cycle", user_id: userId, status: "error", errors: [{ error: s(e && e.message || e) }], delivered: [] }); }
  }
  return { type: "career_alert_scheduler_pass", at: new Date((deps && deps.now) || Date.now()).toISOString(), users: out,
    delivered_total: out.reduce((a, u) => a + ((u.delivered || []).length), 0) };
}

export { Watch, Assign, Jobs };
