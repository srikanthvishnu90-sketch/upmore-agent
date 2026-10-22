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
// Owned product-inbox delivery uses an atomic outbox/lease/ack transaction.
// The source queue is cleared only after durable transfer. Expired leases
// require reconciliation using the existing lease; no external send occurs.
// File/memory stores remain proof-only KV adapters and cannot deliver.
// Supabase construction/probing must confirm both the KV table and RPCs.
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
// The table itself is created by an OWNER-RUN migration
// (supabase/migrations/20261015020000_career_watch_kv.sql, design note §1):
// until the owner runs it, every operation fails NOT_WIRED with the
// missing-table reason (see isMissingTableError / notWiredTableError), and
// probeSupabaseStore() reports the same verdict without attempting a write.
export const WATCH_KV_MIGRATION = "supabase/migrations/20261015020000_career_watch_kv.sql";

// A PostgREST failure means "this table is not there" when the schema cache
// has no such table (PGRST205) or Postgres itself reports an undefined table
// (42P01). Message matching is scoped to the adapter's own table name so an
// unrelated failure is never relabeled.
export function isMissingTableError(error, table) {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const msg = String(error.message || error);
  const t = String(table || "career_watch_kv").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`could not find the table '[^']*${t}'|relation "[^"]*${t}" does not exist|${t}.*does not exist`, "i").test(msg);
}

export function notWiredTableError(table, cause) {
  const t = table || "career_watch_kv";
  const err = new Error(
    `supabase watch store is NOT_WIRED: table public.${t} does not exist ` +
    `(owner-run migration ${WATCH_KV_MIGRATION} has not been applied)`);
  err.code = "NOT_WIRED";
  err.table = t;
  if (cause) err.cause = cause;
  return err;
}

// Construction-time facts only (synchronous): what is missing before a store
// can even be attempted. Table existence is asynchronous knowledge — with a
// client and a userId the honest status is UNPROBED until probeSupabaseStore()
// (or the first operation) resolves it; this function never guesses it.
export function supabaseStoreStatus(opts) {
  const o = opts || {};
  const missing = [];
  if (!o.client) missing.push("no PostgREST client injected (the deployed host supplies the service-role client)");
  if (!o.userId) missing.push("no userId (the store is per-user by construction)");
  const table = o.table || "career_watch_kv";
  if (missing.length) return { status: "NOT_WIRED", missing, table };
  return { status: "UNPROBED", missing, table,
    note: `construction inputs present; table public.${table} existence is established by probeSupabaseStore() or the first operation (owner-run migration ${WATCH_KV_MIGRATION})` };
}

// Resolve the wiring verdict against a live-shaped client: WIRED when the
// table answers a read, NOT_WIRED (missing-table reason) when it does not
// exist, NOT_WIRED (construction reasons) when no store can be built. Any
// other database error propagates — an honest failure, never a relabel.
export async function probeSupabaseStore(opts) {
  const o = opts || {};
  const table = o.table || "career_watch_kv";
  const st = supabaseStoreStatus(o);
  if (st.status === "NOT_WIRED") return st;
  const r = await o.client.from(table).select("key").eq("user_id", o.userId).limit(1);
  if (r && r.error) {
    if (isMissingTableError(r.error, table)) {
      return { status: "NOT_WIRED", table,
        missing: [`table public.${table} does not exist (owner-run migration ${WATCH_KV_MIGRATION} has not been applied)`] };
    }
    throw new Error(`career_watch_kv probe failed: ${r.error.message || r.error}`);
  }
  if(typeof o.client.rpc!=="function")return {status:"NOT_WIRED",missing:["Atomic career RPCs are unavailable; owner-run migration "+WATCH_KV_MIGRATION],table};
  const rpcRead=await o.client.rpc("career_watch_read",{p_user:o.userId,p_key:"career:watch-profile:"+o.userId});
  if(rpcRead.error){if(rpcRead.error.code==="PGRST202")return {status:"NOT_WIRED",missing:["Atomic career RPCs are unavailable; owner-run migration "+WATCH_KV_MIGRATION],table};throw new Error("career RPC probe failed");}
  return { status: "WIRED", missing: [], table };
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
  // The fenced RPCs (career_watch_write, career_watch_cycle_commit,
  // career_reminder_enqueue) raise this exact exception when the live
  // career:account (version, epoch) differs from the caller's fence or
  // the account is paused (migration 20261015020000_career_watch_kv.sql).
  const FENCE_RAISE = "stale or paused career worker";
  const rpc = async (name, args) => {
    if (typeof o.client.rpc !== "function") throw Object.assign(new Error("Atomic reminder RPCs are NOT_WIRED"), {code:"NOT_WIRED"});
    let r;
    try { r = await o.client.rpc(name, {...args, p_user:o.userId}); }
    catch (e) { r = { data: null, error: { code: (e && e.code) || "TRANSPORT", message: String((e && e.message) || e) } }; }
    if (r.error && isMissingTableError(r.error,table)) throw notWiredTableError(table,r.error);
    if (r.error && r.error.code === "PGRST202") throw Object.assign(new Error("Atomic career RPCs are NOT_WIRED; owner-run migration "+WATCH_KV_MIGRATION),{code:"NOT_WIRED"});
    if (r.error || !r.data || r.data.error) {
      // Fence repair (2026-10-21): the underlying error used to be erased
      // here, so ~10% of scheduler cycles crashed with only this opaque
      // message in the log and no code anywhere. Carry the cause (bounded)
      // and flag the fence raise so fenced() can attempt its one repair.
      const src = r.error || (r.data && r.data.error);
      const msg = typeof src === "string" ? src : String((src && src.message) || src || "");
      const err = Object.assign(new Error("Reminder storage could not be confirmed"), {code:"reminder_storage_unavailable"});
      if (src) err.rpcCause = { code: (typeof src === "object" && src.code) || null, message: msg.slice(0, 200) };
      if (msg.includes(FENCE_RAISE)) err.fenceStale = true;
      throw err;
    }
    return r.data;
  };
  // One store instance is one cycle. The fence is captured at the first
  // read and advanced by this store's own successful writes; reads never
  // refresh it (a stale read must never arm a write that overwrites a
  // concurrent turn). The ONLY refresh happens in fenced() below, after
  // the database itself has rejected a write as stale — and even then
  // the same buffered write is replayed at most once, only when the
  // account is not paused and the fence actually moved.
  let fence;
  async function read(k) {
    const r=await rpc("career_watch_read",{p_key:k});
    if(!fence)fence={version:r.version,epoch:r.epoch};
    return r;
  }
  async function currentFence(){if(!fence)await read("career:watch-profile:"+o.userId);return fence;}
  async function refreshFence(){
    const r=await rpc("career_watch_read",{p_key:"career:account"});
    fence={version:r.version,epoch:r.epoch};
    return { fence, paused: r.paused === true || !!(r.value && r.value.paused === true) };
  }
  // A fenced write with exactly one stale-fence repair. The write set a
  // cycle commits is scheduler-owned keys (board snapshots, reminder
  // queue/history, delivery state — the watch profile is never written
  // in-cycle), enqueue is deduplicated by reminder_id in SQL, and the
  // commit re-validates the fence under the advisory lock, so replaying
  // once against the fresh fence cannot clobber a concurrent turn: if
  // the fence moved again, the retry raises and propagates.
  async function fenced(name, buildArgs){
    const before = await currentFence();
    try { return await rpc(name, buildArgs(before)); }
    catch (e) {
      if (!e || e.fenceStale !== true) throw e;
      const now = await refreshFence();
      if (now.paused) throw Object.assign(new Error("career account is paused — the fenced write stops here and is never retried"), {code:"career_paused", rpcCause: e.rpcCause || null});
      if (now.fence.version === before.version && now.fence.epoch === before.epoch) throw e;
      return rpc(name, buildArgs(now.fence));
    }
  }
  const owner = userId => {if(userId!==o.userId)throw Error("reminder_owner_mismatch");};
  const delivery = {
    async enqueue(reminder){owner(reminder.user_id);return fenced("career_reminder_enqueue",(f)=>({p_reminder:reminder,p_version:f.version,p_epoch:f.epoch}));},
    async claim(userId,id){owner(userId);return rpc("career_reminder_claim",{p_id:id});},
    async ack(userId,id,lease,record){owner(userId);return rpc("career_reminder_ack",{p_id:id,p_lease:lease,p_record:record});},
    async status(userId,id){owner(userId);return rpc("career_reminder_status",{p_id:id});},
    async pending(userId){owner(userId);return rpc("career_reminder_list",{});},
  };
  return {
    kind: "supabase",
    beginCycle() {
      const writes=new Map();
      const cycleStore={delivery,
        async get(k){return writes.has(k)?structuredClone(writes.get(k)):(await read(k)).value;},
        async set(k,v){writes.set(k,structuredClone(v));}
      };
      return {store:cycleStore,async commit(reminders){
        const saved=await fenced("career_watch_cycle_commit",(f)=>({p_version:f.version,p_epoch:f.epoch,p_writes:Object.fromEntries(writes),p_reminders:reminders}));
        fence={version:saved.version,epoch:saved.epoch};
      }};
    },
    delivery,
    table,
    user_id: o.userId,
    async get(k) { return (await read(k)).value; },
    async set(k,v) {
      const saved=await fenced("career_watch_write",(f)=>({p_key:k,p_value:v,p_version:f.version,p_epoch:f.epoch}));
      fence={version:saved.version,epoch:saved.epoch};
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

// Confirm one owned product-inbox record through atomic claim/ack RPCs.
// Crash recovery reuses the existing lease; arbitrary external sinks are disabled.
export async function deliverReminder(reminder, deps) {
  const d = deps || {}, store = d.store, api = store && store.delivery;
  if (!api || typeof api.claim !== "function" || typeof api.ack !== "function") throw Object.assign(new Error("Atomic reminder delivery is NOT_WIRED"), {code:"NOT_WIRED"});
  if (!reminder || !reminder.reminder_id || !reminder.user_id) throw Error("invalid reminder identity");
  // This worker delivers to the owned product inbox only. Arbitrary sinks,
  // email and external sends require a separately reviewed effect contract.
  if (d.sink || d.channel && d.channel !== "product_inbox") throw Object.assign(new Error("External reminder delivery is NOT_WIRED"), {code:"NOT_WIRED"});
  const userId = reminder.user_id, id = reminder.reminder_id;
  await api.enqueue(reminder);
  let claim = await api.claim(userId,id);
  if (!claim.claimed) {
    if (claim.status === "delivered") return {delivered:false,duplicate:true,reminder_id:id,record:claim.record};
    if (!d.reconcile) return {delivered:false,duplicate:false,pending:true,status:claim.status,reminder_id:id};
    // Explicit reconciliation reuses the SAME lease and payload. It can only
    // commit an idempotent row to our own inbox, never re-send an external action.
    const prior = await api.status(userId,id);
    if (!prior.leaseToken || !["claimed","uncertain"].includes(prior.status)) return {delivered:false,pending:true,status:prior.status,reminder_id:id};
    claim = {...prior,reminder:prior.reminder,claimed:true};
  }
  const record = d.record || deliveredRecordFor(claim.reminder || reminder,{now:d.now,channel:"product_inbox"});
  let acknowledged;
  try {acknowledged = await api.ack(userId,id,claim.leaseToken,record);}
  catch (error) {
    // Lost acknowledgement may follow a committed transaction. Read it back;
    // never fabricate delivery or begin a second sink/send.
    const observed = await api.status(userId,id).catch(()=>null);
    if (!observed || observed.status!=="delivered") throw error;
    acknowledged = observed;
  }
  if (acknowledged.status!=="delivered") throw Error("reminder_delivery_unconfirmed");
  // A local diagnostic log is observation, not the delivery acknowledgement.
  if (d.deliveredLogPath) fs.appendFileSync(d.deliveredLogPath,JSON.stringify(acknowledged.record)+"\n");
  return {delivered:true,duplicate:false,reminder_id:id,record:acknowledged.record};
}

// The delivered record for a multi-reminder unit (MI-117 batch / digest):
// every member is claimed and acked individually (exactly-once per reminder
// is untouched), but each ack carries THIS unit record, so the product
// inbox presents one batched/digest alert — with every member's own
// deadline and apply link on it — instead of N near-identical pings.
export function unitRecordFor(unit, now) {
  const members = unit.reminders || [];
  return {
    type: "career_job_reminder_delivered",
    presentation: unit.kind, // "batch" | "digest"
    reminder_id: members.length ? members[0].reminder_id : null,
    member_reminder_ids: members.map((r) => r.reminder_id),
    user_id: members.length ? members[0].user_id : null,
    company: unit.company || null,
    batch_size: members.length,
    speak_line: unit.speak_line,
    members: members.map((r) => ({ reminder_id: r.reminder_id, job_id: r.job_id, title: r.title, company: r.company, deadline: r.deadline || null, url: r.url })),
    fit_lines: [...new Set(members.flatMap((r) => (r.fit && r.fit.lines) || []))],
    matched_fact_ids: [...new Set(members.flatMap((r) => (r.fit && r.fit.matched_fact_ids) || []))],
    ...(unit.notice ? { notice: unit.notice } : {}),
    channel: "product_inbox",
    delivered_at: new Date(now || Date.now()).toISOString(),
  };
}

// ---- the per-user cycle -------------------------------------------------------
// The profile the cycle gates with. 151's G6 gate reads its watch legs from
// profile.preferences — role_families, or the BUG-095 taxonomy bridge
// preferences.watched_occupations (an occupation's curated terms matched
// against the posting's title / JD opening). The record the chat path stores
// carries NEITHER: 142's create-watch intent states the user's watches as
// 152 INTERESTS (role specs: title + terms) and stores a scoring_profile
// whose preferences hold no families. Gating straight from that
// scoring_profile rejects every posting — "role_family Finance is not in
// the profile's watched families (none set)" — so a watch the user created,
// can list, and can resume in chat could never alert (BUG-232, found by the
// MI-032 step-2 E2E driving a chat-created watch through this cycle). The
// bridge derives watched_occupations from the interests ONLY when the
// stored profile states no watch leg of its own (producer data wins).
// 152's per-interest matching stays the strict filter downstream, so the
// bridge widens the gate's view but can never manufacture a reminder.
export function watchCycleProfile(wp) {
  const base = (wp && wp.scoring_profile) || {};
  const prefs = Object.assign({}, base.preferences || {});
  const hasOwnLeg = (Array.isArray(prefs.role_families) && prefs.role_families.length > 0)
    || (Array.isArray(prefs.watched_occupations) && prefs.watched_occupations.length > 0);
  if (!hasOwnLeg) {
    const occs = ((wp && wp.interests) || []).map((i) => ({
      occupation: (i.role || {}).title || "",
      terms: ((i.role || {}).terms || []).slice(),
    })).filter((o) => o.occupation && o.terms.length);
    if (occs.length) prefs.watched_occupations = occs;
  }
  return Object.assign({}, base, { preferences: prefs });
}

// deps: { store, fetch, feeds, now, cadence: "starred"|"default"|"all",
//         deliveredLogPath?, sink?, channel? }
// feeds default to 121's live board registry; the caller (scheduler) may pass
// a directory-built set instead. The watch profile's scoring_profile is the
// 121 profile 151 scores against; interests live on the same record for 152.
export async function runUserAlertCycle(userId, deps) {
  const d = deps || {};
  let store = d.store;
  if (!store || typeof store.get !== "function" || typeof store.set !== "function")
    throw new Error("runUserAlertCycle requires an injected store {get,set}");
  const rootStore = d.store; // the caller's store: delivery-state writes (MI-117) persist through it after the cycle transaction commits
  if(typeof store.beginCycle!=="function")throw Object.assign(new Error("Atomic career cycle is NOT_WIRED"),{code:"NOT_WIRED"});
  const transaction=store.beginCycle();store=transaction.store;
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
  const profile = watchCycleProfile(wp);
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
        feeds: [feed], fetch: d.fetch, profile, store,
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

  // Transfer durably before removing queue entries. A failed transfer leaves
  // the queue intact; a crash after transfer is recovered from the outbox.
  if(!store.delivery || typeof store.delivery.pending!=="function") throw Object.assign(new Error("Atomic reminder delivery is NOT_WIRED"),{code:"NOT_WIRED"});
  const queue = Assign.createReminderQueue(store, userId);
  const queued = await queue.peek();
  await queue.drain(); // buffered only; no source state is persisted yet
  await transaction.commit(queued); // snapshots + history + queue + outbox, one transaction
  const pending = await store.delivery.pending(userId);
  const drained = pending.reminders || [];

  // MI-117: 152's fatigue policy plans delivery BEFORE anything is claimed.
  // Quiet hours hold, the daily instant budget folds overflow into the
  // morning digest, same-company bursts batch into one unit record. Held
  // and folded reminders are never claimed this cycle — they stay pending
  // in the outbox and are re-planned next cycle. State persists through the
  // ROOT store (the cycle buffer's writes closed at commit). A policy-layer
  // failure must never eat a delivery: on any throw the cycle falls back to
  // the unplanned per-reminder path below.
  let fatigue = null;
  let units = drained.map((r) => ({ kind: "instant", company: r.company || null, reminders: [r], speak_line: Assign.speakLine(r) }));
  if (typeof Assign.planDeliveries === "function") {
    try {
      const prior = await Assign.loadDeliveryState(rootStore, userId).catch(() => null);
      const plan = Assign.planDeliveries(drained, prior || Assign.defaultDeliveryState(userId), {
        now, userId,
        tzOffsetMinutes: d.tzOffsetMinutes || 0,
        nightOptIn: !!d.nightAlertsOptIn,
        instantCap: d.instantCapPerDay || null,
      });
      await Assign.saveDeliveryState(rootStore, plan.state).catch(() => {});
      units = plan.units;
      fatigue = { units: plan.units.length, digested: plan.digested.length, held: plan.held.length, notice: plan.notice };
    } catch { fatigue = { error: "fatigue planning failed; delivered unplanned" }; }
  }

  const delivered = [];
  for (const unit of units) {
    const record = unit.kind !== "instant" ? unitRecordFor(unit, now)
      : unit.notice ? Object.assign(deliveredRecordFor(unit.reminders[0], { now, channel: "product_inbox" }), { notice: unit.notice })
      : null;
    let satisfied = unit.reminders.length > 0, lastRecord = null;
    for (const reminder of unit.reminders) {
      const res = await deliverReminder(reminder, { store, now, channel: d.channel, deliveredLogPath: d.deliveredLogPath, sink: d.sink, reconcile: true, ...(record ? { record } : {}) });
      if (res.delivered) lastRecord = res.record;
      else if (res.duplicate && unit.kind !== "instant") lastRecord = res.record || lastRecord; // member already in the inbox under this unit's record
      else if (res.pending) { satisfied = false; errors.push({stage:"deliver",reminder_id:reminder.reminder_id,error:"owned inbox delivery pending reconciliation"}); }
      else { satisfied = false; errors.push({ stage: "deliver", reminder_id: reminder.reminder_id, error: "duplicate delivery suppressed by ledger" }); }
    }
    if (satisfied && (record || lastRecord)) delivered.push(record || lastRecord);
  }

  return {
    type: "career_alert_host_cycle", user_id: userId, at: new Date(now).toISOString(),
    status: errors.length ? "degraded" : "ok", cadence,
    boards_polled: selected.length, boards_seeded: seededBoards,
    alerts: alerts.length, alert_records: alerts,
    reminders_queued: assign.reminders.length, queue_depth: await queue.size(),
    delivered, fatigue, suppressed: assign.suppressed, rejected_count: assign.rejected.length,
    // BUG-277: the per-interest rejection reasons ride the cycle result.
    // Before this, a detected alert that no interest accepted vanished
    // with no trace in any record — the cycle reported status ok and
    // the drop was indistinguishable from "nothing to do".
    rejected: assign.rejected,
    errors,
  };
}

// One scheduler invocation over many users (the design note §2 step):
// sequential per user; one user's failure degrades that user only.
export async function runSchedulerPass(userIds, deps) {
  const out = [];
  for (const userId of userIds || []) {
    try { out.push(await runUserAlertCycle(userId, deps)); }
    catch (e) { out.push({ type: "career_alert_host_cycle", user_id: userId, status: "error", errors: [{ error: s(e && e.message || e), code: (e && e.code) || null, rpcCause: (e && e.rpcCause) || null }], delivered: [] }); }
  }
  return { type: "career_alert_scheduler_pass", at: new Date((deps && deps.now) || Date.now()).toISOString(), users: out,
    delivered_total: out.reduce((a, u) => a + ((u.delivered || []).length), 0) };
}

export { Watch, Assign, Jobs };
