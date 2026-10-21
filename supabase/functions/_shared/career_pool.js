// career_pool.js — the hosted board source for the career agent's
// discovery pool (Lane E, Feature Depth Program v2; closes the gap
// diagnosed in the Lane D operator checklist §8).
//
// The defect this closes: handler-career.ts never passed `postings`
// into createTurnCtx, so career_host.js defaulted the pool to [] for
// every user on every turn and the live product answered every
// discovery ask with its (designed, honest) empty-list reply — "today
// it holds no roles at all" — while public.career_kb_postings held
// 21,688 real scraped postings one read away. The harness never saw
// it: the harness injects the pinned exam corpus, and production must
// never serve fixture jobs as if they were live (career_host.js
// header). This module is the production source the host file was
// built for: a bounded, recency-ordered, service-role read of
// career_kb_postings, mapped to the corpus shape module 142's
// rankedShortlist consumes (via adaptPosting's jd_text passthrough).
//
// The mapping mirrors module 121's own feed normalization
// (basePosting): job_id/corpus_id from the row's posting_key,
// role_family + seniority_band computed by 121's classifiers,
// jd_text = the row's text_excerpt with HTML stripped by 121's
// stripHtml, remote read from the row's own location/text. The
// composition roots inject the real 121 helpers; the fallbacks here
// exist only so a bare require in a test degrades the same way
// adaptPosting degrades without module 121 ("Other"/"mid").
//
// HONESTY (the snapshot rule): the KB is a corpus SNAPSHOT — rows
// carry the fetched_on of the 2026-10-14/15 load, not a live feed.
// Every mapped posting carries its row's fetched_on (and
// corpus_vintage) through, and loadPool reports the pool's freshest
// fetched_on, so the data can never be mistaken for a live
// connection. No reply surface reads fetched_on yet — the discovery
// reply has no freshness-line convention today; adding one is a
// router change and is recorded as the follow-up (checklist §8),
// NOT smuggled in here. Freshness of CONTENT is the module 152
// watcher / board-polling lane (MI-034 remainder), not this loader.
//
// FAILURE POSTURE: loadPool never throws. A failed or malformed KB
// read returns an empty pool with error "KB_POOL_READ_FAILED", and
// the caller passes [] — the product answers with its designed
// honest-empty reply. An empty pool is a truthful answer; a crashed
// turn or an invented role is not.
//
// This file is shared by two composition roots: the Edge handler
// (Deno, static import) and the worker host (Node, require) — the
// batch executor's postingsFor reads through the same loader so the
// in-turn pool and the worker pool can never disagree about what
// exists (checklist §8 step 2).
"use strict";

const CareerPool = (() => {
  const KB_POSTINGS_TABLE = "career_kb_postings";
  const KB_POSTINGS_COLUMNS = "posting_key,source,board,company,title,location,url,posted_at,fetched_on,corpus_vintage,text_excerpt";
  // One bounded read per turn: recency-ordered, so the window is the
  // freshest slice of the snapshot across all 11 sources; module 142
  // dedupes and scores in memory. 600 rows of <=1.5 KB excerpts is
  // the measured-comfortable per-turn bound for the Edge runtime.
  const DEFAULT_LIMIT = 600;
  // The targeted named-pair lookup (loadTargeted) is bounded far
  // tighter: one company's postings, recency-ordered — the router
  // scores them against the named title in memory.
  const TARGETED_LIMIT = 50;

  const s = (v) => (v == null ? "" : String(v));
  // 121.remoteOf, mirrored (remoteOf is not in 121's export list):
  // hybrid wins, then remote, else onsite — read from the posting's
  // own location + the head of its text, never from a guess.
  function remoteOf(location, jd) {
    const t = `${s(location).toLowerCase()} ${s(jd).toLowerCase().slice(0, 500)}`;
    if (/\bhybrid\b/.test(t)) return "hybrid";
    if (/\bremote\b/.test(t)) return "remote";
    return "onsite";
  }
  // 121.stripHtml, mirrored as the bare-require fallback; production
  // compositions inject the real one.
  function stripHtmlFallback(html) {
    return s(html).replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  // One career_kb_postings row -> one corpus posting, or null when
  // the row cannot be carried honestly (no key or no title — the row
  // is dropped, never repaired by inventing the missing half).
  // TN-1a: a company the source does not name stays null +
  // company_not_stated; the board token is an address, never a
  // company.
  function mapKbPosting(row, jobs) {
    if (!row || typeof row !== "object") return null;
    const key = s(row.posting_key).trim();
    const title = s(row.title).trim();
    if (!key || !title) return null;
    const strip = jobs && typeof jobs.stripHtml === "function" ? jobs.stripHtml : stripHtmlFallback;
    const jdText = strip(row.text_excerpt || "");
    const source = s(row.source).split(/\s+/)[0].toLowerCase() || "career_kb";
    const company = row.company == null || s(row.company).trim() === "" ? null : s(row.company);
    let postedAt = null;
    if (row.posted_at) {
      const t = Date.parse(row.posted_at);
      postedAt = Number.isFinite(t) ? new Date(t).toISOString() : null;
    }
    return {
      id: key, job_id: key, corpus_id: key,
      company, company_not_stated: company === null,
      title,
      location: s(row.location || ""),
      remote: remoteOf(row.location, jdText),
      url: s(row.url || ""),
      posted_at: postedAt,
      jd_text: jdText,
      source, sources: [source], source_urls: [s(row.url || "")],
      atsFamily: source,
      board: row.board == null ? null : s(row.board),
      role_family: jobs && typeof jobs.roleFamily === "function" ? jobs.roleFamily(title, jdText) : "Other",
      seniority_band: jobs && typeof jobs.seniorityBand === "function" ? jobs.seniorityBand(title, jdText) : "mid",
      fetched_on: row.fetched_on == null ? null : s(row.fetched_on),
      corpus_vintage: row.corpus_vintage == null ? null : s(row.corpus_vintage),
    };
  }

  // createKbPoolLoader({ readRows, jobs, limit }) -> { loadPool }.
  // readRows is the composition root's bound reader: it receives
  // { table, select, order: { column, ascending, nullsFirst },
  // limit } and resolves the raw rows (or throws). loadPool resolves
  // { postings, fetchedOn, error } and never throws.
  function createKbPoolLoader(deps) {
    const d = deps || {};
    if (typeof d.readRows !== "function") throw new Error("career pool: a readRows(spec) function is required — the loader never invents a data source");
    const jobs = d.jobs || null;
    const limit = Number.isSafeInteger(d.limit) && d.limit > 0 ? d.limit : DEFAULT_LIMIT;
    async function loadPool() {
      let rows;
      try {
        rows = await d.readRows({
          table: KB_POSTINGS_TABLE,
          select: KB_POSTINGS_COLUMNS,
          order: { column: "posted_at", ascending: false, nullsFirst: false },
          limit,
        });
      } catch {
        return { postings: [], fetchedOn: null, error: "KB_POOL_READ_FAILED" };
      }
      if (!Array.isArray(rows)) return { postings: [], fetchedOn: null, error: "KB_POOL_READ_FAILED" };
      const postings = [];
      let fetchedOn = null;
      for (const row of rows) {
        const p = mapKbPosting(row, jobs);
        if (!p) continue;
        postings.push(p);
        if (p.fetched_on && (!fetchedOn || p.fetched_on > fetchedOn)) fetchedOn = p.fetched_on;
      }
      return { postings, fetchedOn, error: null };
    }
    // V240 LIVE-FIX (probe f2): the recency window is a discovery
    // slice, not the shelf. When a turn names a specific company,
    // the named posting can sit anywhere in the KB — 1,736 rows
    // were newer than the Gusto posting the owner named, so the
    // named-role ask got the honest "not in the served list" stop
    // for a role the product's own shelf holds. loadTargeted runs
    // a second, company-filtered read of the SAME table through
    // the SAME reader contract (a `filters` spec the composition
    // roots bind to their query builders), mapped identically
    // (fetched_on carried; TN-1a intact). Same failure posture as
    // loadPool: never throws — a failed read yields an empty
    // supplement and the turn keeps its honest named stop.
    async function loadTargeted(target) {
      const company = s(target && target.company).trim();
      if (!company) return { postings: [], error: null };
      let rows;
      try {
        rows = await d.readRows({
          table: KB_POSTINGS_TABLE,
          select: KB_POSTINGS_COLUMNS,
          order: { column: "posted_at", ascending: false, nullsFirst: false },
          limit: TARGETED_LIMIT,
          filters: [{ column: "company", op: "ilike", value: `%${company.replace(/[%_\\]/g, "")}%` }],
        });
      } catch {
        return { postings: [], error: "KB_POOL_READ_FAILED" };
      }
      if (!Array.isArray(rows)) return { postings: [], error: "KB_POOL_READ_FAILED" };
      const postings = [];
      for (const row of rows) {
        const p = mapKbPosting(row, jobs);
        if (p) postings.push(p);
      }
      return { postings, error: null };
    }
    return { loadPool, loadTargeted };
  }

  // WO-105: the live pool. career_postings is what career-ingest reads from the boards every run, with a closed_at once a
  // board stops listing a posting; career_kb_postings is an October snapshot that is never refreshed, so a link ranked
  // from it may lead to a posting that closed weeks ago. The chat ranks only open live postings: an empty pool answers
  // honestly empty (a missing link beats a dead one), and the snapshot is never a fallback.
  const LIVE_POSTINGS_TABLE = "career_postings";
  const LIVE_POSTINGS_COLUMNS = "job_id,provider,board,company,title,location,url,description,posted_at,first_seen_at,last_seen_at";
  function mapLivePosting(row, jobs) {
    if (!row || typeof row !== "object") return null;
    return mapKbPosting({
      posting_key: row.job_id, source: row.provider, board: row.board, company: row.company, title: row.title,
      location: row.location, url: row.url, posted_at: row.posted_at || row.first_seen_at,
      fetched_on: s(row.last_seen_at).slice(0, 10) || null, corpus_vintage: null, text_excerpt: s(row.description).slice(0, 4000),
    }, jobs);
  }
  function createLivePoolLoader(deps) {
    const d = deps || {};
    if (typeof d.readRows !== "function") throw new Error("career pool: a readRows(spec) function is required — the loader never invents a data source");
    const jobs = d.jobs || null;
    const limit = Number.isSafeInteger(d.limit) && d.limit > 0 ? d.limit : DEFAULT_LIMIT;
    const open = { column: "closed_at", op: "is", value: null };
    async function read(spec) {
      let rows;
      try { rows = await d.readRows(spec); } catch { return null; }
      return Array.isArray(rows) ? rows : null;
    }
    async function loadPool() {
      const rows = await read({ table: LIVE_POSTINGS_TABLE, select: LIVE_POSTINGS_COLUMNS, order: { column: "last_seen_at", ascending: false, nullsFirst: false }, limit, filters: [open] });
      if (!rows) return { postings: [], fetchedOn: null, error: "LIVE_POOL_READ_FAILED" };
      const postings = [];
      let fetchedOn = null;
      for (const row of rows) {
        const p = mapLivePosting(row, jobs);
        if (!p) continue;
        postings.push(p);
        if (p.fetched_on && (!fetchedOn || p.fetched_on > fetchedOn)) fetchedOn = p.fetched_on;
      }
      return { postings, fetchedOn, error: null };
    }
    async function loadTargeted(target) {
      const company = s(target && target.company).trim();
      if (!company) return { postings: [], error: null };
      const rows = await read({ table: LIVE_POSTINGS_TABLE, select: LIVE_POSTINGS_COLUMNS, order: { column: "last_seen_at", ascending: false, nullsFirst: false }, limit: TARGETED_LIMIT,
        filters: [open, { column: "company", op: "ilike", value: `%${company.replace(/[%_\\]/g, "")}%` }] });
      if (!rows) return { postings: [], error: "LIVE_POOL_READ_FAILED" };
      return { postings: rows.map((r) => mapLivePosting(r, jobs)).filter(Boolean), error: null };
    }
    return { loadPool, loadTargeted };
  }

  return { mapKbPosting, createKbPoolLoader, KB_POSTINGS_TABLE, KB_POSTINGS_COLUMNS, DEFAULT_LIMIT, mapLivePosting, createLivePoolLoader, LIVE_POSTINGS_TABLE, LIVE_POSTINGS_COLUMNS };
})();

export { CareerPool };
