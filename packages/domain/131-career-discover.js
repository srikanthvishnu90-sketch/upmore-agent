/* Career Discover extensions (F02 scenario program, SC-027/028/030/033/038).
   Built in-branch because 121-career-jobs deliberately stops at feed normalization, dedupe,
   diff, ghost FLAGS, fit scoring and the feedback shortlist. The Discover family needs four
   more behaviors, kept here so 121's contract stays untouched:
     ghostGuard(scored, {now, repostCounts})  SC-027: qualityFlags only FLAGS a ghost; the daily
                                   shortlist must also KEEP lower-odds postings out. Splits a
                                   scored list into { kept, dropped } with the flag summary kept
                                   verbatim so the user sees WHY a role was held back.
     deadlineInfo(posting, {now, cirs})       SC-033: ATS feeds carry posted_at but NO closing
                                   date, so "closes soon" is answered from (a) CIR entry-route
                                   windows for companies that have a CIR (BCG/Bain US routes
                                   are recorded closed for the 2027 cycle) and (b) posting age
                                   as a labeled proxy — never an invented close date.
     companySize(company) / sizeFilter(...)   SC-038: neither feeds nor CIRs carry headcount.
                                   A small curated band table for the STARTER_FEED companies,
                                   labeled as public-knowledge estimates (as of 2026-10);
                                   every other company is "unknown" and is labeled, never guessed.
     discoveryPlan / discover                 the canonical board registry lives in 121
                                   (BOARD_REGISTRY); discovery polls live boards only and
                                   returns deadBoards with reasons instead of silently 404ing.
     watchSet / addWatch / cadenceFor         SC-030: the watch set is the persona's starred
                                   companies plus user-added watches; cadence comes from
                                   121's POLL_MINUTES (starred 15 min, default 60).
   Pure domain module, UMD like the other domain modules. No fetch, no deploy, no secrets. */
const CareerDiscover = (() => {
  const J = (typeof require !== "undefined") ? (() => { try { return require("./121-career-jobs.js"); } catch { return null; } })() : null;
  const lc = (v) => String(v == null ? "" : v).toLowerCase();
  const normName = (v) => lc(v).replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\b(inc|llc|ltd|corp|corporation|company|co|the)\b/g, " ").replace(/\s+/g, " ").trim();

  // ---------- SC-027 ghost guard ----------
  function ghostGuard(scored, opts) {
    opts = opts || {};
    if (!J) throw new Error("131 requires 121-career-jobs alongside it");
    const kept = [], dropped = [];
    for (const item of scored || []) {
      if (item.excluded) continue;
      const posting = item.posting || item;
      const rc = (opts.repostCounts || {})[posting.job_id] || 0;
      const q = J.qualityFlags(posting, { now: opts.now || Date.now(), repost_count: rc });
      if (q.lower_odds) dropped.push({ posting, score: item.score, quality: q });
      else kept.push(item);
    }
    return { kept, dropped };
  }

  // ---------- SC-033 deadline awareness ----------
  // cirs: { <normName>: cirObject } — reads entry_routes[].status for a closed signal.
  function cirClosedRoutes(cir) {
    if (!cir) return [];
    return (cir.entry_routes || []).filter((r) => /closed|passed|just_passed/i.test(String(r.status || "")))
      .map((r) => ({ route: r.route, status: r.status }));
  }
  function deadlineInfo(posting, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const cir = (opts.cirs || {})[normName(posting.company)] || null;
    const closed = cirClosedRoutes(cir);
    const age_days = posting.posted_at ? Math.max(0, Math.floor((now - Date.parse(posting.posted_at)) / 86400000)) : null;
    if (closed.length) return { job_id: posting.job_id, company: posting.company, signal: "closed_window", recommend: false, age_days, detail: `CIR records this company's US window as closed: ${closed.map((c) => `${c.route} (${c.status})`).join("; ")}`, source: "CIR entry_routes" };
    if (age_days == null) return { job_id: posting.job_id, company: posting.company, signal: "unknown_close", recommend: true, age_days, detail: "feed gives no closing date and no posted date — closing time unknown, not guessed", source: "feed row" };
    if (age_days >= 45) return { job_id: posting.job_id, company: posting.company, signal: "closing_proxy_old", recommend: true, age_days, detail: `posted ${age_days} days ago — feeds publish no close date, so age is the only closing signal; long-open roles usually close or go stale first`, source: "feed posted_at (proxy)" };
    if (age_days <= 7) return { job_id: posting.job_id, company: posting.company, signal: "fresh", recommend: true, age_days, detail: `posted ${age_days} day${age_days === 1 ? "" : "s"} ago — newest in the set, least closing pressure`, source: "feed posted_at (proxy)" };
    return { job_id: posting.job_id, company: posting.company, signal: "open", recommend: true, age_days, detail: `posted ${age_days} days ago; no close date published by the feed`, source: "feed posted_at (proxy)" };
  }
  function sortByClosingPressure(infos) { // closed first (to warn), then oldest-open, then fresh
    const rank = { closed_window: 0, closing_proxy_old: 1, open: 2, unknown_close: 3, fresh: 4 };
    return [...(infos || [])].sort((a, b) => (rank[a.signal] - rank[b.signal]) || ((b.age_days || 0) - (a.age_days || 0)));
  }

  // ---------- SC-038 company size ----------
  // Bands only — no precise headcounts claimed. Basis: widely reported public figures as of
  // 2026-10 (company reports / press). NOT present in any ATS feed or CIR; labeled as estimates.
  const SIZE_BANDS = {
    "stripe": { band: "over_5000", basis: "public reports ~8,000 employees (2025)" },
    "airbnb": { band: "over_5000", basis: "public reports ~6,900 employees (2024 10-K)" },
    "datadog": { band: "over_5000", basis: "public reports ~5,200-6,200 employees (2024-25)" },
    "visa": { band: "over_5000", basis: "public reports ~28,000 employees" },
    "boschgroup": { band: "over_5000", basis: "Bosch Group ~418,000 employees" },
    "bosch": { band: "over_5000", basis: "Bosch Group ~418,000 employees" },
    "square": { band: "over_5000", basis: "Block, Inc. ~11,000 employees" },
    "block": { band: "over_5000", basis: "Block, Inc. ~11,000 employees" },
    "robinhood": { band: "500_to_5000", basis: "public reports ~2,300 employees (2024)" },
    "coinbase": { band: "500_to_5000", basis: "public reports ~3,700 employees (2024)" },
    "figma": { band: "500_to_5000", basis: "public reports ~1,600 employees (2025)" },
    "jane street": { band: "500_to_5000", basis: "public reports ~3,000 employees (2025)" },
    "openai": { band: "500_to_5000", basis: "public reports ~3,000-4,500 employees (2025)" },
    "ramp": { band: "500_to_5000", basis: "public reports ~1,000-1,200 employees (2025)" },
    "linear": { band: "under_500", basis: "public reports ~300 employees (2025)" },
    "ashby": { band: "under_500", basis: "public reports ~200-300 employees (2025)" },
  };
  function companySize(company) {
    const hit = SIZE_BANDS[normName(company)];
    if (!hit) return { company, known: false, band: "unknown", basis: "no size data in feed, CIR, or the curated band table — labeled unknown, not guessed" };
    return { company, known: true, band: hit.band, basis: hit.basis + " — curated estimate, not feed/CIR data" };
  }
  function sizeFilter(postings, opts) {
    opts = opts || {};
    const under500 = [], notUnder = [], unknown = [];
    for (const p of postings || []) {
      const sz = companySize(p.company);
      const row = { posting: p, size: sz };
      if (!sz.known) unknown.push(row);
      else if (sz.band === "under_500") under500.push(row);
      else notUnder.push(row);
    }
    return { under500, notUnder, unknown };
  }

  // ---------- SC-030 watch set ----------
  function watchSet(profile) {
    const starred = (profile && profile.preferences && profile.preferences.starred_companies) || [];
    return new Set(starred.map(normName));
  }
  function addWatch(set, company) { const s = new Set(set); s.add(normName(company)); return s; }
  function cadenceFor(company, set) {
    const minutes = J ? J.POLL_MINUTES : { starred: 15, default: 60 };
    return set && set.has(normName(company)) ? minutes.starred : minutes.default;
  }

  // ---------- board registry / discovery plan (REPLY-QUALITY PASS, 2026-10-13) ----------
  // The canonical company->board registry lives in 121 (BOARD_REGISTRY). Discovery must
  // SKIP dead boards and SAY SO — never silently 404 against a board with no public API.
  function discoveryPlan() {
    if (!J || !J.BOARD_REGISTRY) throw new Error("131 requires 121 BOARD_REGISTRY alongside it");
    return { feeds: J.boardFeeds(), deadBoards: J.deadBoards() };
  }
  async function discover(opts) {
    opts = opts || {};
    const plan = discoveryPlan();
    const result = await J.poll(plan.feeds, opts);
    return Object.assign({}, result, { deadBoards: plan.deadBoards });
  }

  return { ghostGuard, deadlineInfo, sortByClosingPressure, cirClosedRoutes, companySize, sizeFilter, watchSet, addWatch, cadenceFor, SIZE_BANDS, discoveryPlan, discover };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerDiscover;
