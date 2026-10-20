// WO-037: how long from a matching posting first seen to the alert delivered, and why. Three parts:
//   latencyReport   p50 / p95 / max from rows (career_outbox alerts with posting_first_seen_at, created_at, delivered_at),
//                   the same numbers the database function career_alert_latency gives; quiet-hours waits counted apart
//   worstCase       the arithmetic: wait for the alerts run to read the posting + that run + wait for a delivery tick +
//                   the rows ahead of it + its own send, from the real cron cadences (parseCron of the schedule files)
//   simulate        a day of runs at those cadences with a seeded random load: p50 / p95 / max, and the alerts the
//                   current design never sends (a posting committed after the alerts run read, but first seen before
//                   it, falls behind last_checked_at and is skipped for good)
// Every timing input is passed in and labeled by the caller (ASSUMED until measured on the live runs).
//   deno run -A scripts/career/alert_latency.ts [--rows export.json]
export interface Cadence { everyMin: number; offsetMin: number }
// "2-59/5 * * * *" -> every 5 minutes from minute 2; "* * * * *" -> every minute; "*/10 * * * *" -> every 10 from 0.
export function parseCron(expr: string): Cadence {
  const m = String(expr).trim().split(/\s+/)[0];
  if (m === "*") return { everyMin: 1, offsetMin: 0 };
  let r = /^\*\/(\d+)$/.exec(m);
  if (r) return { everyMin: Number(r[1]), offsetMin: 0 };
  r = /^(\d+)-59\/(\d+)$/.exec(m);
  if (r) return { everyMin: Number(r[2]), offsetMin: Number(r[1]) };
  r = /^(\d+)$/.exec(m);
  if (r) return { everyMin: 60, offsetMin: Number(r[1]) };
  throw new Error(`unsupported cron minute field: ${m}`);
}
export const cronOf = (sql: string) => { const m = /cron\.schedule\('[^']+',\s*'([^']+)'/.exec(sql); if (!m) throw new Error("no cron.schedule in file"); return m[1]; };

export interface Model {
  ingest: Cadence; proactive: Cadence; deliver: Cadence;
  ingestRunMaxS: number; // the latest a board's postings are written after the run started (and first_seen_at was stamped)
  proactiveRunMaxS: number; // the alerts run from start to its last outbox row
  deliverRowsPerRun: number; sendS: number; // trainee-deliver: rows per tick, seconds per row sent
  raceFixed?: boolean; // the proposed fix: a posting committed after a read is picked up by the next run, not skipped
}
const MIN = 60;
const nextTick = (t: number, c: Cadence) => { // first tick at or after t (seconds from midnight)
  const p = c.everyMin * MIN, o = c.offsetMin * MIN;
  return Math.ceil((t - o) / p) * p + o;
};

// The longest a single alert waits, with `ahead` rows already queued for the same delivery tick.
export function worstCase(m: Model, ahead = 0) {
  const gap = ((m.proactive.offsetMin - m.ingest.offsetMin) % m.ingest.everyMin + m.ingest.everyMin) % m.ingest.everyMin * MIN || m.ingest.everyMin * MIN;
  const raced = m.ingestRunMaxS > gap; // the posting can land after the alerts run read
  // Fixed, a late posting waits one more run. Unfixed, it is never sent, so the worst DELIVERED alert is one written in time.
  const toRead = raced && m.raceFixed ? gap + m.proactive.everyMin * MIN : gap;
  const ticksAhead = Math.floor(ahead / m.deliverRowsPerRun);
  const parts = { to_alerts_read_s: toRead, alerts_run_s: m.proactiveRunMaxS, to_delivery_tick_s: m.deliver.everyMin * MIN,
    backlog_s: ticksAhead * m.deliver.everyMin * MIN + (ahead % m.deliverRowsPerRun) * m.sendS, send_s: m.sendS };
  const seconds = Object.values(parts).reduce((a, b) => a + b, 0);
  return { seconds, minutes: +(seconds / 60).toFixed(1), parts, race: raced ? (m.raceFixed ? "a late write waits one more run" : `a posting written more than ${gap} s after its ingest run started is never alerted`) : "none" };
}
// The most alerts one alerts run may queue at once and still have its last one delivered inside `budgetS`.
export function maxBurst(m: Model, budgetS = 900): number {
  let n = 0;
  while (worstCase(m, n).seconds <= budgetS && n < 1e6) n++;
  return n; // rows: 0..n-1 ahead, so n alerts fit
}

export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// One simulated stretch: every ingest run detects `perRun` matching postings, each written at a random time within the
// run; the alerts runs read what is written by their start (last_checked_at moves to each run's start); delivery ticks
// send up to deliverRowsPerRun rows each, oldest first.
export function simulate(m: Model, o: { hours: number; perRun: number; seed: number }) {
  const rnd = mulberry32(o.seed), end = o.hours * 3600;
  const posts: { seen: number; written: number }[] = [];
  for (let t = nextTick(0, m.ingest); t < end; t += m.ingest.everyMin * MIN) {
    for (let i = 0; i < o.perRun; i++) posts.push({ seen: t, written: t + rnd() * m.ingestRunMaxS });
  }
  const queued: { seen: number; at: number }[] = [];
  let missed = 0, last = -Infinity;
  const pending = new Set(posts.map((_, i) => i));
  for (let t = nextTick(0, m.proactive); t < end + 3600; t += m.proactive.everyMin * MIN) {
    const runS = rnd() * m.proactiveRunMaxS;
    for (const i of [...pending]) {
      const p = posts[i];
      if (p.written > t) continue; // not in the table yet when this run reads
      pending.delete(i);
      if (!m.raceFixed && p.seen < last) { missed++; continue; } // written after an earlier read: behind last_checked_at
      queued.push({ seen: p.seen, at: t + rnd() * runS });
    }
    last = t;
  }
  missed += pending.size;
  queued.sort((a, b) => a.at - b.at);
  const lat: number[] = [];
  let qi = 0;
  const waiting: { seen: number; at: number }[] = [];
  for (let t = nextTick(0, m.deliver); qi < queued.length || waiting.length; t += m.deliver.everyMin * MIN) {
    while (qi < queued.length && queued[qi].at <= t) waiting.push(queued[qi++]);
    const batch = waiting.splice(0, m.deliverRowsPerRun);
    batch.forEach((r, k) => lat.push(t + (k + 1) * m.sendS - r.seen));
    if (t > end + 48 * 3600) break;
  }
  return { alerts: posts.length, delivered: lat.length, missed, p50_s: percentile(lat, 0.5), p95_s: percentile(lat, 0.95), max_s: lat.length ? Math.max(...lat) : null };
}

export interface LatencyRow { posting_first_seen_at: string | null; created_at: string; deliver_at: string; delivered_at: string | null }
export function latencyReport(rows: LatencyRow[]) {
  const s = (x: string) => Date.parse(x) / 1000;
  const a = rows.filter((r) => r.posting_first_seen_at);
  const prompt = a.filter((r) => s(r.deliver_at) <= s(r.created_at) + 60);
  const done = prompt.filter((r) => r.delivered_at);
  const d = done.map((r) => s(r.delivered_at!) - s(r.posting_first_seen_at!)), q = prompt.map((r) => s(r.created_at) - s(r.posting_first_seen_at!));
  return { alerts: a.length, delivered: done.length, held_for_quiet_hours: a.length - prompt.length,
    queued_p50_s: percentile(q, 0.5), queued_p95_s: percentile(q, 0.95), delivered_p50_s: percentile(d, 0.5), delivered_p95_s: percentile(d, 0.95),
    delivered_max_s: d.length ? Math.max(...d) : null, over_15_min: d.filter((x) => x > 900).length };
}

if (import.meta.main) {
  const root = new URL("../../", import.meta.url);
  const read = (f: string) => Deno.readTextFileSync(new URL(f, root));
  const current: Model = {
    ingest: parseCron(cronOf(read("scripts/launch/schedule-career-ingest.sql"))),
    proactive: parseCron(cronOf(read("scripts/launch/schedule-career-proactive.sql"))),
    deliver: parseCron(cronOf(read("scripts/launch/schedule-trainee-deliver.sql"))),
    // ASSUMED until the live runs are measured: ingest starts no board after 100 s (handler deadline) and a board read
    // times out at 15 s, plus its writes: 125 s. The alerts run: 20 s. Delivery: 20 rows a tick (ROWS_PER_RUN), about
    // 0.6 s per bubble and up to 2 bubbles for an alert: 1.2 s a row.
    ingestRunMaxS: 125, proactiveRunMaxS: 20, deliverRowsPerRun: 20, sendS: 1.2,
  };
  const proposed: Model = { ...current, proactive: { everyMin: 5, offsetMin: (current.ingest.offsetMin + 3) % 5 }, raceFixed: true };
  const out = (label: string, m: Model) => {
    console.log(`${label} cadences: ingest every ${m.ingest.everyMin} min from :0${m.ingest.offsetMin}, alerts every ${m.proactive.everyMin} min from :0${m.proactive.offsetMin}, delivery every ${m.deliver.everyMin} min`);
    console.log(`${label} WORST (one alert, nothing ahead) ${JSON.stringify(worstCase(m))}`);
    console.log(`${label} MAX_BURST alerts one run can queue and all be delivered within 15 min: ${maxBurst(m)}`);
    for (const perRun of [1, 20, 100, 300]) console.log(`${label} SIM 24h, ${perRun} alerts per ingest run: ${JSON.stringify(simulate(m, { hours: 24, perRun, seed: 37 }))}`);
  };
  out("CURRENT", current);
  out("PROPOSED", proposed);
  const i = Deno.args.indexOf("--rows");
  if (i >= 0) console.log(`REPORT ${JSON.stringify(latencyReport(JSON.parse(Deno.readTextFileSync(Deno.args[i + 1]))))}`);
}
