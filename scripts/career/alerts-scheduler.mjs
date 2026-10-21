// HOST TIER (Depth Lane D, 2026-10-16) — the missing step 4 of MI-032:
// the supervised scheduler that fires the alerts host cycle on cadence.
// Design + contract: docs/career/alerts-host-wiring.md §2/§5.
//
// Until this file existed, NOTHING ran runUserAlertCycle in production:
// the engine was tier-2 proven end to end and no user ever received an
// alert, because no process ever called it. This runner is that process.
// It is deliberately thin: all matching, gating, fatigue and delivery
// logic lives in 151/152 and scripts/career/alerts-host.mjs; this file
// only (a) builds the production store against the real Supabase project,
// (b) selects the due cadence subsets (starred companies every 15
// minutes, the rest hourly — the standing cadence from Spec 2 §7 /
// MI-032), (c) runs one pass per due subset for the scoped user, and
// (d) appends one JSONL record per invocation to the cycle log, which is
// the 48-hour proof surface (see alerts-scheduler-audit.mjs).
//
// SCOPE (owner instruction, first live proof): exactly ONE user — the
// gauntlet test account. The launcher resolves that user's id from the
// product's own auth records and passes it as ALERTS_USER_ID; this file
// refuses to run without it. The cycle may poll the FULL board directory
// (all live boards — polling is read-only against public ATS feeds), but
// watches and reminders exist only for the scoped user.
//
// Supervision: systemd (system service + timer on this host; PID 1 is
// systemd but the session runs as root with no user bus, so a system unit
// provides the same supervision semantics — see the unit files and the
// Lane D report). Timers are Persistent=true, so a host reboot produces
// one catch-up run instead of a silent gap; the audit script reports
// on-time vs catch-up vs missed against the 15-minute tick grid.
//
// The Supabase service key reaches this process ONLY through the
// launcher's environment (fetched in-process from the vault surrogate,
// never on disk, never logged). Exactly-once delivery is the host's
// ledger (career_reminder_outbox + claim/ack RPCs), unchanged.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { runUserAlertCycle, createSupabaseStore, probeSupabaseStore, Watch } from "./alerts-host.mjs";

const require = createRequire(import.meta.url);
const REF = "mrwngntwmnaqrqhupvlt"; // Upmore prod (the career product's own project)
const BASE = `https://${REF}.supabase.co`;
const RUNTIME = process.env.ALERTS_RUNTIME_DIR || "/home/hatch/workspace/alerts-scheduler"; // pinned: under systemd HOME is unset and os.homedir() resolves to /root — the runtime dir must not depend on it
const LOG_PATH = path.join(RUNTIME, "logs", "cycles.jsonl");
const STATE_PATH = path.join(RUNTIME, "state", "scheduler-state.json");
const STARRED_SLOT_MIN = 15;   // starred cadence: one run per 15-minute wall-clock slot
const DEFAULT_SLOT_MIN = 60;   // default cadence: one run per hourly wall-clock slot

// Which cadence subsets are due. GRID-ANCHORED (BUG-262): a subset is due
// when a new wall-clock slot has begun since its last run — never "N
// minutes since the last run", which drifts: a run at :04 pushed the
// next due to :18, the :15 timer fire found nothing due, and the slot
// was silently skipped (a 26-minute gap on a 15-minute cadence). Exported
// for its replay guard.
export function cadencesDue(sched, now, mode) {
  if (mode === "all") return ["starred", "default"];
  if (mode === "starred" || mode === "default") return [mode];
  const slotOf = (ms, min) => Math.floor(ms / (min * 60000));
  const due = [];
  if (slotOf(now, STARRED_SLOT_MIN) > slotOf(sched.starred_last || 0, STARRED_SLOT_MIN)) due.push("starred");
  if (slotOf(now, DEFAULT_SLOT_MIN) > slotOf(sched.default_last || 0, DEFAULT_SLOT_MIN)) due.push("default");
  return due;
}

function logLine(obj) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, JSON.stringify(obj) + "\n");
}

// Minimal PostgREST client over the store's actual surface: rpc() for the
// career RPCs, and the from().select().eq().limit()/maybeSingle() chain
// probeSupabaseStore uses. No SDK, no stored credentials.
function createPostgrestClient(serviceKey) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
  const parse = (text) => { try { return text ? JSON.parse(text) : null; } catch { return null; } };
  const fail = (res, data, text) => ({ data: null, error: { code: (data && data.code) || `HTTP_${res.status}`, message: (data && data.message) || String(text || "").slice(0, 200) } });
  return {
    async rpc(name, args) {
      try {
        const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(args || {}) });
        const text = await res.text(); const data = parse(text);
        return res.ok ? { data, error: null } : fail(res, data, text);
      } catch (e) { return { data: null, error: { code: "TRANSPORT", message: String((e && e.message) || e) } }; }
    },
    from(table) {
      const q = { cols: "*", filters: [], limitN: null, single: false };
      const exec = async () => {
        try {
          const params = new URLSearchParams();
          params.set("select", q.cols);
          for (const [k, v] of q.filters) params.set(k, `eq.${v}`);
          if (q.limitN) params.set("limit", String(q.limitN));
          const res = await fetch(`${BASE}/rest/v1/${table}?${params.toString()}`, { headers });
          const text = await res.text(); const data = parse(text);
          if (!res.ok) return fail(res, data, text);
          if (q.single) return { data: Array.isArray(data) ? data[0] || null : data, error: null };
          return { data, error: null };
        } catch (e) { return { data: null, error: { code: "TRANSPORT", message: String((e && e.message) || e) } }; }
      };
      const chain = {
        select(cols) { q.cols = cols; return chain; },
        eq(k, v) { q.filters.push([k, v]); return chain; },
        limit(n) { q.limitN = n; return exec(); },
        maybeSingle() { q.single = true; return exec(); },
        then(res, rej) { return exec().then(res, rej); },
      };
      return chain;
    },
  };
}

// UTC offset (minutes) for an IANA zone at a moment — the fatigue policy
// works in user-local time; the test user's zone is America/Chicago.
function tzOffsetMinutes(tz, date) {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

async function main() {
  const args = process.argv.slice(2);
  const cadenceArg = ((args.find((a) => a.startsWith("--cadence=")) || "--cadence=due").split("=")[1] || "due").toLowerCase();
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const userId = process.env.ALERTS_USER_ID;
  const startedAt = new Date();
  if (!serviceKey) { console.error("SUPABASE_SERVICE_KEY missing — run via alerts-scheduler-launch.py"); process.exit(2); }
  if (!userId) { console.error("ALERTS_USER_ID missing — the scheduler is scoped to the gauntlet test user only and refuses to run unscoped"); process.exit(2); }

  const client = createPostgrestClient(serviceKey);
  const store = createSupabaseStore({ client, userId });
  const probe = await probeSupabaseStore({ client, userId });
  if (probe.status !== "WIRED") {
    logLine({ type: "career_alert_scheduler_cycle", at: startedAt.toISOString(), status: "not_wired", user_id: userId, probe: probe.checks || probe });
    console.error(`store not wired: ${JSON.stringify(probe)}`);
    process.exit(3);
  }

  let sched = {};
  try { sched = JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); } catch { sched = {}; }
  const now = Date.now();
  const due = cadencesDue(sched, now, cadenceArg);

  const directory = require("../../packages/career-data/board-directory.json");
  const entries = Array.isArray(directory) ? directory : (directory.entries || directory.boards || []);
  const feeds = Watch.feedsFromDirectory(entries, {});
  const tz = tzOffsetMinutes(process.env.ALERTS_TZ || "America/Chicago", startedAt);

  const passes = [];
  for (const cadence of due) {
    const r = await runUserAlertCycle(userId, { store, feeds, cadence, tzOffsetMinutes: tz });
    sched[`${cadence}_last`] = Date.now();
    passes.push({
      cadence, status: r.status, boards_polled: r.boards_polled,
      boards_seeded: r.boards_seeded, alerts: r.alerts, queue_depth: r.queue_depth,
      reminders_queued: r.reminders_queued, delivered: (r.delivered || []).length,
      delivered_ids: (r.delivered || []).map((x) => x.reminder_id),
      delivered_presentations: (r.delivered || []).map((x) => x.presentation || "instant"),
      fatigue: r.fatigue, errors: r.errors,
    });
  }
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(sched, null, 2));

  const line = {
    type: "career_alert_scheduler_cycle", at: startedAt.toISOString(), finished_at: new Date().toISOString(),
    user_id: userId, cadences_run: due, feeds_total: feeds.length, passes,
  };
  logLine(line);
  console.log(JSON.stringify(line, null, 1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    logLine({ type: "career_alert_scheduler_cycle", at: new Date().toISOString(), status: "crashed", error: String((e && e.message) || e), code: (e && e.code) || null, rpc_cause: (e && e.rpcCause) || null });
    console.error(e);
    process.exit(1);
  });
}
