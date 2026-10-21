// link_liveness.js — serve-time link liveness for the career agent's
// job links (Muse surface lane, 2026-10-20; MUSE-F-003).
//
// The defect this closes: NO code anywhere in the serving chain
// checked a posting link before it reached a user. The 2026-10-20
// job-link audit (~/workspace/your_files/job-link-audit-2026-10-20.md)
// measured the shelf the bot serves from: of 60 sampled URLs, 31
// resolve to a live posting, 3 are confirmed dead (HTTP 404/410),
// and 26 cannot be confirmed either way by a raw fetch (JS-rendered
// Ashby/Lever/Workday/Greenhouse-embed shells — an unreadable page
// is NOT evidence of death).
//
// VERDICTS (the whole contract):
//   LIVE           — the fetch resolved and the page head carries a
//                    decisive posting signal (JobPosting JSON-LD or
//                    apply/description copy).
//   CONFIRMED-DEAD — HTTP 404 or 410, or a redirect that lands on a
//                    search/home/listing page instead of the posting.
//                    ONLY this verdict removes a posting from what
//                    can be served, and every removal is counted and
//                    logged by verifyServing.
//   UNCHECKABLE    — everything else: JS shells with no decisive
//                    signal, other HTTP statuses (403/500 are bot
//                    walls and outages, not proof of death),
//                    timeouts, network and truncated-read errors.
//                    UNCHECKABLE still serves.
//
// POSTURE: the verifier never throws and never empties a shelf. A
// checker outage degrades to all-UNCHECKABLE (everything serves),
// never to a crashed or empty reply. Fetches are time-boxed per URL
// and verdicts are cached per URL for a TTL (hours), so a reply
// never waits on a slow board and a popular link is not re-fetched
// per turn.
//
// CONSUMPTION: career_pool.js's loader accepts an injected instance
// (deps.liveness) and exposes loadServablePool/loadServableTargeted;
// composition roots opt in. Reply composition consuming the
// verdicts is the recorded router follow-up (HANDOFF.md).
//
// This file is shared by the same two composition roots as
// career_pool.js: the Edge handler (Deno, static import) and the
// worker host (Node, require). Global fetch only; no runtime APIs.
"use strict";

const LinkLiveness = (() => {
  const LIVE = "LIVE";
  const DEAD = "CONFIRMED-DEAD";
  const UNCHECKABLE = "UNCHECKABLE";

  const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // hours, per the design brief
  const DEFAULT_TIMEOUT_MS = 5000;
  const DEFAULT_CONCURRENCY = 6;
  const BODY_HEAD_BYTES = 65536; // the audit read the first ~60 KB
  const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 TraineeLinkCheck/1.0";

  // Decisive posting signals in a page head (lowercase matching).
  // The phrase set covers the audit's own live-signal vocabulary
  // ("apply for this job", "apply today", "job description",
  // "create alert", ...) plus the JobPosting JSON-LD marker.
  const LIVE_SIGNALS = [
    '"@type":"jobposting"', '"@type": "jobposting"',
    "apply for this job", "apply for this position", "apply now",
    "apply today", "apply online", "submit application",
    "job description", "job details", "responsibilities",
    "qualifications", "years of experience", "create alert",
    "what you'll do", "what you will do", "about the role",
  ];

  const s = (v) => (v == null ? "" : String(v));

  function parseUrl(u) {
    try { return new URL(u); } catch { return null; }
  }

  // A posting-detail URL: at least two path segments and an
  // identifier feel (a digit, or a long slug) — e.g.
  // /jobs/4395260009, /company/careers/open-positions/job?gh_jid=…
  function looksLikeDetailUrl(u) {
    const parsed = parseUrl(u);
    if (!parsed) return false;
    const segs = parsed.pathname.split("/").filter(Boolean);
    if (segs.length < 2) return false;
    return /\d/.test(parsed.pathname) || segs[segs.length - 1].length >= 12;
  }

  // A search/home/listing landing: the root, an index page
  // (/jobs, /careers, /search…), or a search query — the place a
  // dead posting's redirect goes to pretend nothing happened.
  function looksLikeListingUrl(u) {
    const parsed = parseUrl(u);
    if (!parsed) return false;
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    if (path === "") return true;
    if (path === "/jobs" || path === "/careers" || path === "/search" ||
        path === "/job-search" || path === "/positions" || path === "/openings") return true;
    if (path.includes("/search")) return true;
    if (parsed.searchParams.has("q") || parsed.searchParams.has("keyword") ||
        parsed.searchParams.has("keywords") || parsed.searchParams.has("search")) return true;
    return false;
  }

  // classifyProbe({ url, status, finalUrl, bodyHead, error }) ->
  // { verdict, reason }. Pure: the recorded-case guard pins this
  // table, and the live check re-runs it against real fetches.
  function classifyProbe(probe) {
    const p = probe || {};
    if (p.error) return { verdict: UNCHECKABLE, reason: "fetch-error" };
    const status = typeof p.status === "number" ? p.status : null;
    if (status === null) return { verdict: UNCHECKABLE, reason: "no-status" };
    if (status === 404 || status === 410) return { verdict: DEAD, reason: `http-${status}` };
    if (status < 200 || status >= 400) return { verdict: UNCHECKABLE, reason: `http-${status}-not-proof` };
    const url = s(p.url);
    const finalUrl = s(p.finalUrl || url);
    if (finalUrl && finalUrl !== url && looksLikeDetailUrl(url) && looksLikeListingUrl(finalUrl)) {
      return { verdict: DEAD, reason: "redirect-to-listing" };
    }
    const head = s(p.bodyHead).toLowerCase();
    if (head) {
      for (const signal of LIVE_SIGNALS) {
        if (head.includes(signal)) return { verdict: LIVE, reason: "live-signal" };
      }
      // A JSON posting record (the NYC open-data rows serve the
      // posting itself as JSON: job_id + business_title keys in a
      // JSON head) is the posting resolving, not a shell.
      const trimmed = head.trimStart();
      if ((trimmed.startsWith("{") || trimmed.startsWith("[")) &&
          head.includes('"job_id"') && head.includes('"business_title"')) {
        return { verdict: LIVE, reason: "live-signal" };
      }
    }
    return { verdict: UNCHECKABLE, reason: "no-decisive-signal" };
  }

  // One time-boxed fetch -> the probe classifyProbe consumes. Reads
  // only the body head; a truncated read classifies on status/final
  // URL alone (the audit's IncompleteRead cases land UNCHECKABLE).
  async function fetchHead(fetchFn, url, timeoutMs) {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const res = await fetchFn(url, {
        redirect: "follow",
        signal: ctl ? ctl.signal : undefined,
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      });
      let bodyHead = "";
      try {
        if (res.body && typeof res.body.getReader === "function") {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let read = 0;
          while (read < BODY_HEAD_BYTES) {
            const { done, value } = await reader.read();
            if (done) break;
            read += value.byteLength || 0;
            bodyHead += decoder.decode(value, { stream: true });
          }
          try { await reader.cancel(); } catch { /* already done */ }
        } else if (typeof res.text === "function") {
          bodyHead = (await res.text()).slice(0, BODY_HEAD_BYTES);
        }
      } catch { /* truncated/slow body: classify without it */ }
      return { status: typeof res.status === "number" ? res.status : null, finalUrl: s(res.url || url), bodyHead };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // createLinkLiveness({ fetchFn, now, ttlMs, timeoutMs,
  // concurrency, cache, log }) -> { check, verifyServing, stats,
  // classifyProbe }. Every dep is injectable; production uses the
  // globals. Never throws out of check/verifyServing.
  function createLinkLiveness(deps) {
    const d = deps || {};
    const fetchFn = typeof d.fetchFn === "function" ? d.fetchFn
      : (typeof fetch === "function" ? fetch : null);
    const now = typeof d.now === "function" ? d.now : () => Date.now();
    const ttlMs = Number.isFinite(d.ttlMs) && d.ttlMs > 0 ? d.ttlMs : DEFAULT_TTL_MS;
    const timeoutMs = Number.isFinite(d.timeoutMs) && d.timeoutMs > 0 ? d.timeoutMs : DEFAULT_TIMEOUT_MS;
    const concurrency = Number.isSafeInteger(d.concurrency) && d.concurrency > 0 ? d.concurrency : DEFAULT_CONCURRENCY;
    const cache = d.cache instanceof Map ? d.cache : new Map();
    const counters = { checks: 0, cacheHits: 0, live: 0, dead: 0, uncheckable: 0, droppedTotal: 0 };
    const dropLog = [];
    const log = typeof d.log === "function" ? d.log : (entry) => { dropLog.push(entry); };

    async function check(rawUrl) {
      const url = s(rawUrl).trim();
      if (!url || !parseUrl(url)) return { url, verdict: UNCHECKABLE, reason: "no-url", status: null, finalUrl: url, fromCache: false };
      const hit = cache.get(url);
      if (hit && now() - hit.at < ttlMs) {
        counters.cacheHits += 1;
        return { ...hit.result, fromCache: true };
      }
      counters.checks += 1;
      let probe;
      if (!fetchFn) {
        probe = { url, error: "no-fetch" };
      } else {
        try {
          const head = await fetchHead(fetchFn, url, timeoutMs);
          probe = { url, ...head };
        } catch {
          probe = { url, error: "fetch-failed" };
        }
      }
      const { verdict, reason } = classifyProbe(probe);
      if (verdict === LIVE) counters.live += 1;
      else if (verdict === DEAD) counters.dead += 1;
      else counters.uncheckable += 1;
      const result = { url, verdict, reason, status: probe.status ?? null, finalUrl: probe.finalUrl || url, fromCache: false };
      cache.set(url, { at: now(), result });
      return result;
    }

    // verifyServing(postings) -> { postings, dropped, droppedCount,
    // verdicts }. Drops ONLY CONFIRMED-DEAD; kept postings carry
    // link_verdict/link_verdict_reason. Drops are counted + logged.
    async function verifyServing(postings) {
      const list = Array.isArray(postings) ? postings : [];
      const urls = [...new Set(list.map((p) => s(p && p.url).trim()).filter(Boolean))];
      const verdicts = {};
      let idx = 0;
      async function worker() {
        while (idx < urls.length) {
          const url = urls[idx];
          idx += 1;
          const r = await check(url);
          verdicts[url] = { verdict: r.verdict, reason: r.reason };
        }
      }
      const lanes = [];
      for (let i = 0; i < Math.min(concurrency, urls.length); i += 1) lanes.push(worker());
      await Promise.all(lanes);
      const kept = [];
      const dropped = [];
      for (const p of list) {
        const url = s(p && p.url).trim();
        const v = url ? verdicts[url] : null;
        if (v && v.verdict === DEAD) {
          dropped.push(p);
          counters.droppedTotal += 1;
          log({ type: "link_liveness_drop", url, reason: v.reason });
        } else {
          if (v) { p.link_verdict = v.verdict; p.link_verdict_reason = v.reason; }
          kept.push(p);
        }
      }
      return { postings: kept, dropped, droppedCount: dropped.length, verdicts };
    }

    function stats() {
      return { ...counters, dropLog: dropLog.slice() };
    }

    return { check, verifyServing, stats, classifyProbe };
  }

  return {
    createLinkLiveness, classifyProbe,
    VERDICTS: { LIVE, DEAD, UNCHECKABLE },
    DEFAULT_TTL_MS, DEFAULT_TIMEOUT_MS,
  };
})();

export { LinkLiveness };
