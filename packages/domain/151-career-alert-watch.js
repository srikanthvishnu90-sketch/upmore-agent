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
  // BUG-105: the race must bound the BODY READ too, not just time-to-headers —
  // fetch resolves when headers land, and a drip-feeding body then stalls the
  // cycle forever (measured live 2026-10-14: cycles stuck 7-12 min). The
  // returned response's json()/text() race the REMAINING deadline budget.
  function withDeadline(fetchFn, ms) {
    if (!fetchFn || !ms) return fetchFn;
    return async (url) => {
      const startedAt = Date.now();
      let timer = null;
      const deadlineError = () => new Error(`board fetch deadline exceeded after ${ms}ms (G7 hard deadline)`);
      const arm = (budget) => new Promise((_, reject) => {
        timer = setTimeout(() => reject(deadlineError()), Math.max(0, budget));
        if (timer && typeof timer.unref === "function") timer.unref();
      });
      try {
        const res = await Promise.race([Promise.resolve().then(() => fetchFn(url)), arm(ms)]);
        if (!res || (typeof res.json !== "function" && typeof res.text !== "function")) return res;
        const bound = (fn) => async (...a) => {
          let bodyTimer = null;
          try {
            return await Promise.race([
              Promise.resolve().then(() => fn(...a)),
              new Promise((_, reject) => {
                bodyTimer = setTimeout(() => reject(deadlineError()), Math.max(0, ms - (Date.now() - startedAt)));
                if (bodyTimer && typeof bodyTimer.unref === "function") bodyTimer.unref();
              }),
            ]);
          } finally { if (bodyTimer) clearTimeout(bodyTimer); }
        };
        const wrapped = { status: res.status, ok: res.ok, headers: res.headers };
        if (typeof res.json === "function") wrapped.json = bound(res.json.bind(res));
        if (typeof res.text === "function") wrapped.text = bound(res.text.bind(res));
        return wrapped;
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

  function watchedOccupationsOf(profile) {
    const prefs = (profile && profile.preferences) || {};
    return Array.isArray(prefs.watched_occupations) ? prefs.watched_occupations : [];
  }
  function occupationHit(posting, occupations) {
    const title = lc(posting && posting.title);
    for (const occ of occupations || []) {
      for (const term of (occ && occ.terms) || []) {
        const t = lc(term).trim();
        if (t && new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(title)) return occ.occupation || t;
      }
    }
    return null;
  }

  // The G6 gate, exported so it can be graded on its own. Returns typed reasons either way.
  // BUG-095: the gate was hardcoded to a student (bands intern/new_grad, 121's 13
  // families) — a user watching any of the other ~890 occupations could never be
  // alerted, by construction. Bands now come from the profile
  // (preferences.alert_bands, defaulting to the student bands), and a posting also
  // passes the watch leg when its title matches a watched occupation's terms
  // (preferences.watched_occupations: [{occupation, terms}]) — the bridge from the
  // ~900-occupation taxonomy to 121's family classifier.
  function gatePosting(posting, profile, fit, watchedFamilies) {
    const reasons = [];
    const prefs = (profile && profile.preferences) || {};
    const bands = Array.isArray(prefs.alert_bands) && prefs.alert_bands.length ? prefs.alert_bands : ALERT_BANDS;
    if (!bands.includes(posting.seniority_band))
      reasons.push(`seniority_band is ${posting.seniority_band || "unknown"}; alerts fire only for ${bands.join(" / ")}`);
    const watched = watchedFamilies || [];
    const occs = watchedOccupationsOf(profile);
    const occHit = occupationHit(posting, occs);
    if (!watched.includes(posting.role_family) && !occHit) {
      let r = `role_family ${posting.role_family || "unknown"} is not in the profile's watched families (${watched.join(", ") || "none set"})`;
      if (occs.length) r += ` and the title matches no watched occupation (${occs.map((o) => o.occupation).join(", ")})`;
      reasons.push(r);
    }
    if (fit && fit.excluded)
      reasons.push(...(fit.hard_fails || fit.reasons || []).map((r) => `scoreFit hard-excluded: ${r}`));
    return { pass: reasons.length === 0, reasons, occupation_match: occHit };
  }

  // Typed alert record (G2's artifact, at watch tier): identity + board timestamps +
  // latency + fit lines sourced ONLY from the profile's proven facts, each citing its
  // fact ID (scoreFit already refuses unproven skills any match credit — BUG-002 — and
  // the fit lines inherit that: an unproven skill can never source a line here).
  function composeAlert(posting, fit, profile, detectedMs) {
    const detected_at = new Date(detectedMs).toISOString();
    const postedMs = posting.posted_at ? Date.parse(posting.posted_at) : NaN;
    const latency_seconds = isNaN(postedMs) ? null : Math.max(0, Math.round((detectedMs - postedMs) / 1000));
    // BUG-094: boards can backdate first_published (republished reqs, ATS migrations
    // importing history). A 40-day-old timestamp at first sight is a board-clock
    // artifact, not a 40-day detection latency — flag it so latency statistics and
    // the reader never mistake one for the other.
    const posted_at_quality = isNaN(postedMs) ? "missing" : (detectedMs - postedMs <= 48 * 3600 * 1000 ? "fresh" : "backdated");
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
      posted_at_quality,
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
      // Per-feed summary (additive): the adaptive scheduler (below) keeps per-board
      // health/velocity state and needs each board's own outcome, not just totals.
      feed_results: (result.feeds || []).map((r) => ({ source: r.source || null, company_token: r.company_token || null, status: r.status || 0, postings: (r.postings || []).length, error: r.error || null })),
    };
  }

  // ================= SCALE WAVE (BUG-091..096) =================
  // The watch outgrows the hardcoded registry: boards come from a verified
  // product-data directory (packages/career-data/board-directory.json, produced by
  // scripts/career/board-discovery.mjs), each board polls on its OWN cadence and
  // keeps its OWN snapshot, and a suppression layer sits between detection and
  // delivery for the three ways "new" lies at scale: reposts, recovery bursts,
  // and cross-board duplicates.

  const CADENCE = { hot: 5, active: 15, standard: 60, quiet: 240 }; // minutes
  const DEFAULT_STATE_KEY = "career:jobs:watch-state";
  const REPOST_WINDOW_MS = 14 * 24 * 3600 * 1000;
  const RECOVERY_SLACK_MS = 5 * 60 * 1000;

  // Pure cadence planner: observed posting velocity -> poll interval. A board
  // earns a faster cadence by publishing; a quiet board decays to the 4h tier
  // so the request budget concentrates where postings actually appear. Errors
  // back off (one error doubles, two park at the cap) — the polite response to
  // a sick or rate-limiting board, and the one that keeps us unbanned.
  function planCadence(obs) {
    obs = obs || {};
    const errors = obs.consecutive_errors || 0;
    let tier, base, why;
    if (!obs.cycles_observed) { tier = "standard"; base = CADENCE.standard; why = "unobserved board: standard cadence until its velocity is known"; }
    else if (obs.cycles_observed < 3) { tier = "standard"; base = CADENCE.standard; why = "insufficient history (<3 cycles): velocity is unknown, not zero — hold standard cadence"; }
    else if (obs.ewma_new_per_day >= 2) { tier = "hot"; base = CADENCE.hot; why = `${obs.ewma_new_per_day.toFixed(2)} new/day: hot tier`; }
    else if (obs.ewma_new_per_day >= 0.25) { tier = "active"; base = CADENCE.active; why = `${obs.ewma_new_per_day.toFixed(2)} new/day: active tier`; }
    else if (obs.ewma_new_per_day >= 0.02) { tier = "standard"; base = CADENCE.standard; why = `${obs.ewma_new_per_day.toFixed(2)} new/day: standard tier`; }
    else { tier = "quiet"; base = CADENCE.quiet; why = "no new postings observed: quiet tier"; }
    if (obs.starred && base > CADENCE.active) { base = CADENCE.active; tier = "active"; why += "; starred company capped at 15 min"; }
    if (errors === 1) { base = Math.min(CADENCE.quiet, base * 2); why += "; one consecutive error: interval doubled"; }
    if (errors >= 2) { base = CADENCE.quiet; tier = "quiet"; why += "; repeated errors: parked at the cap"; }
    return { tier, interval_minutes: base, reason: why };
  }

  const boardIdOf = (feed) => `${feed.source}:${feed.company_token}`;
  const boardSnapshotKey = (feed) => `career:jobs:snapshot:board:${feed.source}:${feed.company_token}`;

  // BUG-096: feeds from the verified board directory (product data), not a
  // hardcoded list. Detection polls run LIST-FIRST (gap G4): the Greenhouse
  // list endpoint without ?content=true carries id/title/location/first_published
  // at ~1/100th the payload of the full-text pull; full text is fetched only for
  // postings that survive the diff (a host concern), or when a caller passes
  // { content: true }.
  function feedsFromDirectory(entries, opts) {
    opts = opts || {};
    const out = [];
    for (const e of entries || []) {
      if (!e || e.status !== "live") continue;
      const token = e.board_token || e.board;
      if (!token || !Jobs.feeds[e.provider]) continue;
      let feed;
      if (e.provider === "greenhouse" && !opts.content)
        feed = { source: "greenhouse", company_token: token, url: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs` };
      else feed = Jobs.feeds[e.provider](token);
      out.push(Object.assign(feed, { company: e.company || token, provider: e.provider, board: token, status: "live", checkedAt: e.last_verified || null, directory: true }));
    }
    return out;
  }

  // The adaptive cycle: due boards only, one board per 121 poll under that
  // board's own snapshot key (BUG-091: a shared snapshot + subset polling
  // corrupts the seen-set — unpolled boards' ids fall out of the snapshot and
  // their postings re-fire as "new"; per-board keys make cadence free to vary).
  // Detections collect first; the suppression layer (repost / recovery /
  // cross-board) runs over the whole cycle's candidates; survivors deliver.
  async function runAdaptiveCycle(deps) {
    if (!Jobs) throw new Error("151 requires 121-career-jobs alongside it");
    deps = deps || {};
    const { profile, store, sink } = deps;
    if (!store || typeof store.get !== "function" || typeof store.set !== "function")
      throw new Error("151 runAdaptiveCycle requires an injected store {get,set}");
    if (!sink) throw new Error("151 runAdaptiveCycle requires an injected sink");
    if (!profile) throw new Error("151 runAdaptiveCycle requires the scoring profile");
    const feeds = deps.feeds || [];
    const now = nowMs(deps.now);
    const stateKey = deps.stateKey || DEFAULT_STATE_KEY;
    const doc = (await store.get(stateKey)) || {};
    const boardsState = doc.boards || {};
    const alertHistory = doc.alert_history || {};
    const starred = ((profile.preferences || {}).starred_companies || []).map(lc);

    const dueIds = Array.isArray(deps.dueBoardIds) ? new Set(deps.dueBoardIds) : null;
    const due = [], notDue = [];
    for (const feed of feeds) {
      const id = boardIdOf(feed);
      if (dueIds) { (dueIds.has(id) ? due : notDue).push(feed); continue; }
      const st = boardsState[id];
      const interval = (st && st.interval_minutes) || CADENCE.standard;
      if (!st || !st.last_polled_at || now - st.last_polled_at >= interval * 60000) due.push(feed); else notDue.push(feed);
    }

    const candidates = []; // { record, board_id }
    const suppressed = { reposts: [], recovered_absorbed: [], cross_board_duplicates: [] };
    const boardSummary = {};
    const cycleErrors = [];
    for (const feed of due) {
      const id = boardIdOf(feed);
      const prev = boardsState[id] || {};
      const collected = [];
      let res = null;
      try {
        res = await runWatchCycle({ feeds: [feed], fetch: deps.fetch, profile, store, sink: async (r) => { collected.push(r); }, now, snapshotKey: boardSnapshotKey(feed), boardDeadlineMs: deps.boardDeadlineMs });
      } catch (e) {
        cycleErrors.push({ board: id, error: s(e && e.message || e) });
      }
      const failed = !res || (res.errors || []).length > 0;
      const st = Object.assign({}, prev);
      st.cycles_observed = (prev.cycles_observed || 0) + 1;
      st.last_polled_at = now;
      if (st.first_attempt_at == null) st.first_attempt_at = now;
      st.consecutive_errors = failed ? (prev.consecutive_errors || 0) + 1 : 0;
      if (!failed) st.last_ok_at = now;
      const newSeen = res ? res.new_seen : 0;
      if (res && !res.seeded) {
        const intervalUsed = prev.interval_minutes || CADENCE.standard;
        const sample = newSeen * (1440 / Math.max(1, intervalUsed)); // new/day at this cadence
        st.ewma_new_per_day = prev.ewma_new_per_day == null ? sample : 0.7 * prev.ewma_new_per_day + 0.3 * sample;
      } else if (st.ewma_new_per_day == null) st.ewma_new_per_day = 0;
      const plan = planCadence({ cycles_observed: st.cycles_observed, ewma_new_per_day: st.ewma_new_per_day, consecutive_errors: st.consecutive_errors, starred: starred.includes(lc(feed.company)) });
      st.interval_minutes = plan.interval_minutes; st.tier = plan.tier;
      boardsState[id] = st;
      boardSummary[id] = { tier: st.tier, interval_minutes: st.interval_minutes, last_status: failed ? "error" : "ok", ewma_new_per_day: Math.round((st.ewma_new_per_day || 0) * 100) / 100, new_seen: newSeen, removed: res ? res.removed : 0 };
      if (res) for (const e of res.errors || []) cycleErrors.push({ board: id, error: e.error });
      // BUG-093 recovery rule: judged against the board's state BEFORE this cycle.
      // A posting whose board timestamp predates the last moment we could see the
      // board (last_ok_at, or our first-ever attempt) is back-catalog the board is
      // showing us late — absorb it into the baseline; it was never provably new.
      const blindStart = prev.last_ok_at != null ? prev.last_ok_at : (prev.first_attempt_at != null ? prev.first_attempt_at : null);
      for (const record of collected) {
        const postedMs = record.posted_at ? Date.parse(record.posted_at) : NaN;
        if (blindStart != null && !isNaN(postedMs) && postedMs < blindStart - RECOVERY_SLACK_MS)
          suppressed.recovered_absorbed.push({ job_id: record.job_id, board: id, posted_at: record.posted_at });
        else candidates.push({ record, board_id: id });
      }
    }

    // Presence set: every job_id any board's current snapshot holds (post-cycle).
    const presentIds = new Set();
    for (const feed of feeds) {
      const snap = await store.get(boardSnapshotKey(feed));
      for (const jid of (snap && snap.job_ids) || []) presentIds.add(jid);
    }

    // BUG-092 repost rule + cross-board duplicate rule (see header of this section).
    // Company identity comes from the BOARD's directory entry, never from the
    // posting payload: Greenhouse names the company in its payload while Lever
    // postings carry only the board token, so payload-keyed dedupe would never
    // recognize the same seat across the two boards.
    const feedById = new Map(feeds.map((f) => [boardIdOf(f), f]));
    const keyOf = (c) => Jobs.dedupeKey({ company: (feedById.get(c.board_id) || {}).company || c.record.company, title: c.record.title, location: c.record.location || "" });
    const afterRepost = [];
    for (const c of candidates) {
      const key = keyOf(c);
      const hist = alertHistory[key];
      const knownIds = hist ? (hist.job_ids || [hist.job_id]) : [];
      if (hist && now - hist.alerted_at < REPOST_WINDOW_MS && !knownIds.includes(c.record.job_id) && !knownIds.some((id) => presentIds.has(id))) {
        // The seat we alerted is gone and this req is its replacement identity:
        // a repost, not a new opening. Absorb the new id so a LATER additional
        // req (seat count growing while this one is live) still alerts.
        suppressed.reposts.push({ job_id: c.record.job_id, board: c.board_id, prior_job_ids: knownIds.slice(), key });
        hist.job_ids = knownIds.concat([c.record.job_id]);
        continue;
      }
      if (hist && knownIds.includes(c.record.job_id)) { suppressed.reposts.push({ job_id: c.record.job_id, board: c.board_id, prior_job_ids: knownIds.slice(), key, reason: "same req re-presented" }); continue; }
      afterRepost.push(c);
    }
    const byKey = new Map();
    for (const c of afterRepost) { const k = keyOf(c); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(c); }
    const survivors = [];
    for (const [key, group] of byKey) {
      const sources = new Set(group.map((c) => c.record.source));
      if (sources.size <= 1) { survivors.push(...group); continue; }
      const best = group.slice().sort((a, b) => (((b.record.fit || {}).score || 0) - ((a.record.fit || {}).score || 0)))[0];
      for (const c of group) {
        if (c.record.source === best.record.source) survivors.push(c);
        else suppressed.cross_board_duplicates.push({ job_id: c.record.job_id, board: c.board_id, kept_source: best.record.source, key });
      }
    }

    const delivered = [];
    for (const c of survivors) {
      try {
        await deliver(sink, c.record); delivered.push(c.record);
        const key = keyOf(c); const hist = alertHistory[key];
        const ids = new Set(hist ? (hist.job_ids || [hist.job_id]) : []); ids.add(c.record.job_id);
        alertHistory[key] = { job_ids: [...ids], alerted_at: now };
      }
      catch (e) { cycleErrors.push({ stage: "sink", job_id: c.record.job_id, error: s(e && e.message || e) }); }
    }
    await store.set(stateKey, { boards: boardsState, alert_history: alertHistory, updated_at: new Date(now).toISOString() });

    return {
      type: "career_adaptive_watch_cycle",
      at: new Date(now).toISOString(),
      boards_total: feeds.length,
      boards_due: due.length,
      boards_polled: due.length,
      boards_skipped_not_due: notDue.map(boardIdOf),
      alerts_delivered: delivered.length,
      alerts: delivered,
      suppressed,
      boards: boardSummary,
      errors: cycleErrors,
    };
  }

  return { runWatchCycle, watchCycle: runWatchCycle, runAdaptiveCycle, gatePosting, composeAlert, createMemoryStore, withDeadline,
    planCadence, feedsFromDirectory, boardIdOf, boardSnapshotKey, CADENCE,
    ALERT_BANDS, DEFAULT_SNAPSHOT_KEY, DEFAULT_BOARD_DEADLINE_MS, DEFAULT_STATE_KEY,
    POLL_MINUTES: Jobs ? Jobs.POLL_MINUTES : { starred: 15, default: 60 } };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerAlertWatch;
