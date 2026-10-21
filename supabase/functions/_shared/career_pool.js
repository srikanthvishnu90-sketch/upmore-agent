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
// LINK LIVENESS (MUSE-F-003, 2026-10-20 audit: 31 live / 3 dead /
// 26 unconfirmable of 60 sampled links served from this snapshot):
// a link the product serves must never be a CONFIRMED-dead link.
// When a composition root injects a probe (probeUrl — the roots
// bind createFetchProbe below; the loader itself invents no network
// path, exactly as it invents no data source), loadPool probes each
// distinct URL in the served window once per load (bounded,
// concurrency-capped) and excludes ONLY postings whose probe
// returns a definitive 404 or 410. Every other outcome — 200, 3xx,
// 403, a JS-shell page, a timeout, a network error, no URL to probe
// — is UNCONFIRMED and the posting is served exactly as before.
// The result carries deadExcluded (postings removed by this rule)
// so the exclusion is observable, never silent. Ordering and every
// other field are untouched; fetchedOn still describes the read
// window as mapped, before exclusion.
//
// SERVE-TIME LINK LIVENESS (MUSE-F-003, 2026-10-20): the loader
// accepts an injected liveness verifier (deps.liveness — a
// link_liveness.js instance) and exposes loadServablePool /
// loadServableTargeted: the same reads, with CONFIRMED-DEAD links
// (404/410, redirect-to-listing) dropped, counted and logged before
// anything is served; kept postings carry link_verdict. UNCHECKABLE
// links still serve — an unreadable JS-shell page is not evidence
// of death. Without an injected verifier the servable reads behave
// exactly like the plain reads (the composition roots opt in; the
// router wiring is the recorded follow-up in HANDOFF.md).
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

  // The only statuses that CONFIRM a posting is gone. Everything
  // else a probe can return is unconfirmed (see header).
  const DEAD_STATUSES = new Set([404, 410]);
  const PROBE_TIMEOUT_MS = 2000;
  const PROBE_CONCURRENCY = 8;

  // createFetchProbe({ fetchImpl, timeoutMs }) -> probeUrl(url).
  // The production probe the composition roots inject into
  // loadPool: HEAD first, falling back to a ranged GET only when
  // HEAD cannot answer (transport failure, or 405/501 — servers
  // that refuse HEAD). Resolves the final HTTP status number, or
  // null when nothing could be confirmed (no fetch in this runtime,
  // network error, timeout). Never throws; never reads a body.
  function createFetchProbe(opts) {
    const o = opts || {};
    const timeoutMs = Number.isSafeInteger(o.timeoutMs) && o.timeoutMs > 0 ? o.timeoutMs : PROBE_TIMEOUT_MS;
    const doFetch = typeof o.fetchImpl === "function" ? o.fetchImpl : (typeof fetch === "function" ? fetch : null);
    async function attempt(url, init) {
      if (!doFetch) return null;
      const ctl = typeof AbortController === "function" ? new AbortController() : null;
      let timer = null;
      try {
        const call = Promise.resolve().then(() => doFetch(url, ctl ? { ...init, signal: ctl.signal } : init));
        call.catch(() => {});
        const res = await Promise.race([
          call,
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              if (ctl) { try { ctl.abort(); } catch { /* already settled */ } }
              reject(new Error("liveness probe timed out"));
            }, timeoutMs);
          }),
        ]);
        if (res && res.body && typeof res.body.cancel === "function") { try { const c = res.body.cancel(); if (c && typeof c.catch === "function") c.catch(() => {}); } catch { /* body already gone */ } }
        return res && Number.isSafeInteger(res.status) ? res.status : null;
      } catch {
        return null;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    return async function probeUrl(url) {
      const head = await attempt(url, { method: "HEAD", redirect: "follow" });
      if (head !== null && head !== 405 && head !== 501) return head;
      const got = await attempt(url, { method: "GET", redirect: "follow", headers: { Range: "bytes=0-0" } });
      return got !== null ? got : head;
    };
  }

  // createKbPoolLoader({ readRows, jobs, limit, liveness,
  // probeUrl, probeConcurrency }) ->
  // { loadPool, loadTargeted, loadServablePool,
  //   loadServableTargeted }.
  // readRows is the composition root's bound reader: it receives
  // { table, select, order: { column, ascending, nullsFirst },
  // limit } and resolves the raw rows (or throws). loadPool resolves
  // { postings, fetchedOn, error } and never throws. liveness is the
  // optional link_liveness.js verifier (see the header note).
  function createKbPoolLoader(deps) {
    const d = deps || {};
    if (typeof d.readRows !== "function") throw new Error("career pool: a readRows(spec) function is required — the loader never invents a data source");
    const jobs = d.jobs || null;
    const limit = Number.isSafeInteger(d.limit) && d.limit > 0 ? d.limit : DEFAULT_LIMIT;
    const liveness = d.liveness && typeof d.liveness.verifyServing === "function" ? d.liveness : null;
    const probeUrl = typeof d.probeUrl === "function" ? d.probeUrl : null;
    const probeConcurrency = Number.isSafeInteger(d.probeConcurrency) && d.probeConcurrency > 0 ? Math.min(d.probeConcurrency, 32) : PROBE_CONCURRENCY;

    // Exclude CONFIRMED-dead postings from one load's served window
    // (MUSE-F-003 discipline, see header). Distinct URLs are probed
    // once per load (the per-load cache), concurrency-capped; any
    // probe failure leaves the posting served. Never throws.
    async function excludeDead(postings) {
      if (!probeUrl || postings.length === 0) return { postings, deadExcluded: 0 };
      const urls = [...new Set(postings.map((p) => p.url).filter((u) => /^https?:\/\//i.test(u)))];
      if (urls.length === 0) return { postings, deadExcluded: 0 };
      const dead = new Set();
      let next = 0;
      async function probeWorker() {
        while (next < urls.length) {
          const url = urls[next++];
          let status = null;
          try {
            const r = await probeUrl(url);
            status = typeof r === "number" ? r : (r && Number.isSafeInteger(r.status) ? r.status : null);
          } catch { status = null; }
          if (status !== null && DEAD_STATUSES.has(status)) dead.add(url);
        }
      }
      await Promise.all(Array.from({ length: Math.min(probeConcurrency, urls.length) }, () => probeWorker()));
      if (dead.size === 0) return { postings, deadExcluded: 0 };
      const kept = postings.filter((p) => !dead.has(p.url));
      return { postings: kept, deadExcluded: postings.length - kept.length };
    }

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
        return { postings: [], fetchedOn: null, error: "KB_POOL_READ_FAILED", deadExcluded: 0 };
      }
      if (!Array.isArray(rows)) return { postings: [], fetchedOn: null, error: "KB_POOL_READ_FAILED", deadExcluded: 0 };
      const postings = [];
      let fetchedOn = null;
      for (const row of rows) {
        const p = mapKbPosting(row, jobs);
        if (!p) continue;
        postings.push(p);
        if (p.fetched_on && (!fetchedOn || p.fetched_on > fetchedOn)) fetchedOn = p.fetched_on;
      }
      const served = await excludeDead(postings);
      return { postings: served.postings, fetchedOn, error: null, deadExcluded: served.deadExcluded };
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
    // The servable reads: the plain reads, run through the injected
    // liveness verifier before anything reaches a reply. Same
    // never-throws posture — a verifier failure serves the plain
    // result (an unchecked link may serve; a crashed turn may not).
    async function verifyServing(postings) {
      if (!liveness) return { postings, dropped: [], droppedCount: 0, verdicts: {} };
      try {
        return await liveness.verifyServing(postings);
      } catch {
        return { postings, dropped: [], droppedCount: 0, verdicts: {} };
      }
    }
    async function loadServablePool() {
      const base = await loadPool();
      if (base.error) return { ...base, dropped: [], droppedCount: 0, verdicts: {} };
      const v = await verifyServing(base.postings);
      return { postings: v.postings, fetchedOn: base.fetchedOn, error: null, deadExcluded: base.deadExcluded || 0, dropped: v.dropped, droppedCount: v.droppedCount, verdicts: v.verdicts };
    }
    async function loadServableTargeted(target) {
      const base = await loadTargeted(target);
      if (base.error) return { ...base, dropped: [], droppedCount: 0, verdicts: {} };
      const v = await verifyServing(base.postings);
      return { postings: v.postings, error: null, dropped: v.dropped, droppedCount: v.droppedCount, verdicts: v.verdicts };
    }
    return { loadPool, loadTargeted, loadServablePool, loadServableTargeted };
  }

  return { mapKbPosting, createKbPoolLoader, createFetchProbe, KB_POSTINGS_TABLE, KB_POSTINGS_COLUMNS, DEFAULT_LIMIT };
})();

export { CareerPool };
