/* Career alert watch loop (ALERT G1, BUG-090; Spec 2 job-detection/alerts).
   THE STANDING CALLER module 121 never had. 121's engine (poll / diffNew / scoreFit)
   detects new postings in ~2ms of processing, but in the product it was only ever invoked
   on demand (the chat router when a user asks; the gauntlet harness in tests) — detection
   was a capability, "alerts the moment it posts" was not a behavior. This module is the
   watch cycle as product code at harness/host tier: the deployed host schedules
   runWatchCycle() on 121's POLL_MINUTES cadence (starred 15 min / default 60 min) and
   supplies the real fetch, the per-user snapshot store, the scoring profile and the
   delivery sink. Scheduling and the delivery channel itself are HOST concerns and are
   deliberately NOT in this module (see docs/career/alert-watch.md).

   One cycle:
     (a) loads the prior snapshot/seen-set from the injected store,
     (b) calls 121's public poll() — its real fetch/dedupe/diffNew code path, fixture or
         live feeds arriving through 121's own opts.fetch seam,
     (c) for each genuinely-new posting applies the G6 GATE (the poll path in 121 has no
         level/family gate of its own — a manager posting scored Reach 13 live on
         2026-10-13 and would have alerted): alert ONLY when
         seniority_band in {intern, new_grad} AND role_family is in the profile's watched
         families AND 121 scoreFit does not hard-exclude the posting,
     (d) composes a typed ALERT RECORD and hands it to the injected sink,
     (e) the new snapshot/seen-set is persisted by 121 poll() itself (same store + key);
         removals are counted silently — a closed posting never alerts,
     (f) returns a typed cycle result; a board failure degrades THAT board only and
         never kills the cycle (G7: a per-board hard deadline is imposed here, at the
         watch level, around the injected fetch — a drip-feeding board is cut off and
         named in errors[]).
   First cycle against an empty store is a SEED cycle: it establishes the baseline
   snapshot and alerts on nothing (the postings it sees are not new to the world, only
   to us). Pass alertOnSeed:true to override. Delivery is a sink call, nothing more:
   what the sink does (chat message, push, file) is the host's decision, and the
   approval law for anything beyond alerting the user is unchanged.
   Pure-ish domain idiom like its neighbours: all I/O arrives injected
   { feeds?, fetch, profile, store, sink, now }. */
const CareerAlertWatch = (() => {
  const Jobs = (typeof require !== "undefined")
    ? (() => { try { return require("./121-career-jobs.js"); } catch { return null; } })()
    : (typeof CareerJobs !== "undefined" ? CareerJobs : null);

  const ALERT_BANDS = ["intern", "new_grad"];
  const DEFAULT_SNAPSHOT_KEY = "career:jobs:snapshot";
  // G7: the overnight watch's sick board drip-fed for ~14 minutes despite a socket
  // timeout. 100s per board is the deadline the restarted watcher proved with.
  const DEFAULT_BOARD_DEADLINE_MS = 100000;

  const s = (v) => (v == null ? "" : String(v));
  const lc = (v) => s(v).toLowerCase();

  function nowMs(now) {
    const v = typeof now === "function" ? now() : now;
    if (v == null) return Date.now();
    if (v instanceof Date) return v.getTime();
    if (typeof v === "number") return v;
    const p = Date.parse(v);
    return isNaN(p) ? Date.now() : p;
  }

  // G7 deadline wrapper: race the injected fetch against a wall-clock timer per call.
  // 121 calls the fetch once per feed, so one call == one board.
  function withDeadline(fetchFn, ms) {
    if (!fetchFn || !ms) return fetchFn;
    return async (url) => {
      let timer = null;
      try {
        return await Promise.race([
          Promise.resolve().then(() => fetchFn(url)),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`board fetch deadline exceeded after ${ms}ms (G7 hard deadline)`)), ms);
            if (timer && typeof timer.unref === "function") timer.unref();
          }),
        ]);
      } finally { if (timer) clearTimeout(timer); }
    };
  }

  // In-memory KV with 121's store contract ({ get, set }, sync or async) — for the
  // host-tier runner and tests; the deployed host injects its durable store instead.
  function createMemoryStore() {
    const kv = new Map();
    return { get: (k) => (kv.has(k) ? kv.get(k) : null), set: (k, v) => { kv.set(k, v); }, _kv: kv };
  }

  function watchedFamiliesOf(profile, deps) {
    if (deps && Array.isArray(deps.watchedFamilies) && deps.watchedFamilies.length) return deps.watchedFamilies;
    const prefs = (profile && profile.preferences) || {};
    return prefs.role_families || prefs.roles_families || [];
  }

  // The G6 gate, exported so it can be graded on its own. Returns typed reasons either way.
  function gatePosting(posting, profile, fit, watchedFamilies) {
    const reasons = [];
    if (!ALERT_BANDS.includes(posting.seniority_band))
      reasons.push(`seniority_band is ${posting.seniority_band || "unknown"}; alerts fire only for ${ALERT_BANDS.join(" / ")}`);
    const watched = watchedFamilies || [];
    if (!watched.includes(posting.role_family))
      reasons.push(`role_family ${posting.role_family || "unknown"} is not in the profile's watched families (${watched.join(", ") || "none set"})`);
    if (fit && fit.excluded)
      reasons.push(...(fit.hard_fails || fit.reasons || []).map((r) => `scoreFit hard-excluded: ${r}`));
    return { pass: reasons.length === 0, reasons };
  }

  // Typed alert record (G2's artifact, at watch tier): identity + board timestamps +
  // latency + fit lines sourced ONLY from the profile's proven facts, each citing its
  // fact ID (scoreFit already refuses unproven skills any match credit — BUG-002 — and
  // the fit lines inherit that: an unproven skill can never source a line here).
  function composeAlert(posting, fit, profile, detectedMs) {
    const detected_at = new Date(detectedMs).toISOString();
    const postedMs = posting.posted_at ? Date.parse(posting.posted_at) : NaN;
    const latency_seconds = isNaN(postedMs) ? null : Math.max(0, Math.round((detectedMs - postedMs) / 1000));
    const skills = (profile && profile.skills) || [];
    const matchedNames = (fit && fit.matched_skills) || [];
    const matchedFacts = skills.filter((x) => x && x.proven !== false && x.fact_id
      && matchedNames.some((m) => lc(m) === lc(x.name)));
    const fit_lines = matchedFacts.map((x) => `proven skill ${x.name} (fact ${x.fact_id}) matches this posting`);
    for (const r of (fit && fit.reasons) || [])
      if (/role family .* is one you asked for|is a company you starred/.test(r)) fit_lines.push(r);
    return {
      type: "career_job_alert",
      job_id: posting.job_id,
      company: posting.company,
      title: posting.title,
      url: posting.url,
      location: posting.location || null,
      role_family: posting.role_family,
      seniority_band: posting.seniority_band,
      source: posting.source,
      posted_at: posting.posted_at || null,
      detected_at,
      latency_seconds,
      fit_lines,
      matched_fact_ids: matchedFacts.map((x) => x.fact_id),
      fit: fit ? { score: fit.score, bucket: fit.bucket, reasons: fit.reasons || [], gaps: fit.gaps || [], matched_skills: matchedNames } : null,
    };
  }

  async function deliver(sink, record) {
    if (typeof sink === "function") return sink(record);
    if (sink && typeof sink.emit === "function") return sink.emit(record);
    if (sink && typeof sink.record === "function") return sink.record(record);
    if (sink && typeof sink.send === "function") return sink.send(record);
    if (sink && typeof sink.push === "function") return sink.push(record);
    throw new Error("sink must be a function or expose emit/record/send/push");
  }

  async function runWatchCycle(deps) {
    if (!Jobs) throw new Error("151 requires 121-career-jobs alongside it");
    deps = deps || {};
    const { profile, store, sink } = deps;
    if (!store || typeof store.get !== "function" || typeof store.set !== "function")
      throw new Error("151 runWatchCycle requires an injected store {get,set} (121's snapshot KV contract)");
    if (!sink) throw new Error("151 runWatchCycle requires an injected sink (function or {emit|record|send|push})");
    if (!profile) throw new Error("151 runWatchCycle requires the scoring profile (121 scoreFit shape)");
    const detectedMs = nowMs(deps.now);
    const key = deps.snapshotKey || DEFAULT_SNAPSHOT_KEY;
    const feeds = deps.feeds || Jobs.boardFeeds();
    const deadlineMs = deps.boardDeadlineMs == null ? DEFAULT_BOARD_DEADLINE_MS : deps.boardDeadlineMs;
    const fetchFn = withDeadline(deps.fetch || null, deadlineMs);

    // (a) prior snapshot/seen-set — read BEFORE poll overwrites it (removals + seeding).
    const prior = await store.get(key);
    const seeded = !(prior && Array.isArray(prior.job_ids));
    const priorIds = seeded ? [] : prior.job_ids.slice();

    // (b)+(e) 121's real poll: fetch + dedupe + diffNew vs the stored snapshot, then
    // poll persists the new snapshot to the same store/key itself.
    const result = await Jobs.poll(feeds, { fetch: fetchFn || undefined, store, snapshotKey: key, now: detectedMs });

    // Per-board failures degrade, never kill (121 fetchFeed already records them).
    const errors = [];
    for (const r of result.feeds || [])
      if (r.error) errors.push({ board: r.company_token || null, source: r.source || null, error: s(r.error) });

    // Removals: in the prior seen-set, absent now. Counted, never alerted. Under a
    // mass-close suspect shape (feed outage masquerading as closures) 121 preserves
    // presence — removals are not counted from an outage either.
    const currentIds = new Set((result.postings || []).map((p) => p.job_id));
    const removed = (seeded || result.mass_close_suspect) ? 0 : priorIds.filter((id) => !currentIds.has(id)).length;

    // (c)+(d) gate, compose, deliver.
    const watched = watchedFamiliesOf(profile, deps);
    const alerts = [], gated = [];
    let alerts_emitted = 0;
    for (const posting of result.new_postings || []) {
      if (seeded && !deps.alertOnSeed) continue; // baseline only — named by `seeded` on the result
      const fit = Jobs.scoreFit(posting, profile);
      const gate = gatePosting(posting, profile, fit, watched);
      if (!gate.pass) { gated.push({ job_id: posting.job_id, reasons: gate.reasons }); continue; }
      const record = composeAlert(posting, fit, profile, detectedMs);
      try {
        await deliver(sink, record);
        alerts_emitted += 1;
        alerts.push(record);
      } catch (e) {
        errors.push({ stage: "sink", job_id: posting.job_id, error: s(e && e.message || e) });
      }
    }

    const health = result.source_health || null;
    const status = errors.some((e) => e.stage === "sink") ? "degraded"
      : health && health.outcome === "outage" ? "outage"
      : errors.length ? "degraded" : "ok";
    return {
      type: "career_watch_cycle",
      status,
      seeded,
      snapshot_key: key,
      detected_at: new Date(detectedMs).toISOString(),
      polled: (result.postings || []).length,
      feeds_polled: (result.feeds || []).length,
      new_seen: (result.new_postings || []).length,
      alerts_emitted,
      alerts,
      gated_out: gated.length,
      gated,
      removed,
      errors,
      source_health: health,
      mass_close_suspect: result.mass_close_suspect || null,
    };
  }

  return { runWatchCycle, watchCycle: runWatchCycle, gatePosting, composeAlert, createMemoryStore, withDeadline,
    ALERT_BANDS, DEFAULT_SNAPSHOT_KEY, DEFAULT_BOARD_DEADLINE_MS,
    POLL_MINUTES: Jobs ? Jobs.POLL_MINUTES : { starred: 15, default: 60 } };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerAlertWatch;
