"use strict";
/* session-pool-prototype.cjs — PROTOTYPE (Package C, 2026-10-21; NOT wired
   into the live board service or module 150 — integration spec lives in
   docs/career/board-session-pool-2026-10-21.md).

   What it prototypes: a warm-browser session pool for board drives.

   The measured problem (see the results doc): module 150 keeps ONE helper
   process + ONE Chromium per host process, but board.close() shuts the
   helper down when the LAST live board closes (150-career-portal-browser.js
   close(), "if (liveBoards.size === 0 ...) shutdown"). A serial drive loop
   — create board, drive it, close it, next posting — therefore pays a full
   Node-helper spawn + Chromium launch on EVERY drive. This pool removes the
   launch from the per-drive path while keeping the §6.3 isolation contract
   EXACTLY: one FRESH BrowserContext per drive, closed at release, so no
   cookies / storage / values can survive from one drive into the next.

   Shape:
   - ONE warm Chromium (lazy launch; same posture as the portal helper:
     headless; sandboxed unless UPMORE_CHROMIUM_SANDBOX=off, the operator
     opt-out this VM requires).
   - acquire() leases a slot (bounded: maxContexts concurrent leases, FIFO
     waiters) and returns { context, page, release() } with a brand-new
     context + page. release() closes the context (all per-drive state
     dies with it) and frees the slot.
   - Crash eviction: a browser 'disconnected' event marks the browser
     dead; the next acquire relaunches. A context-creation failure evicts
     the browser and retries the acquire once.
   - Host guard: by default the pool only navigates localhost / 127.0.0.1
     (benchmark + test pages). Integration replaces this with module 150's
     hostAllowed — the pool never weakens the caller's gate.
*/

function resolvePlaywright() {
  const path = require("node:path");
  const tries = [];
  if (process.env.UPMORE_PLAYWRIGHT_PATH) tries.push(process.env.UPMORE_PLAYWRIGHT_PATH);
  tries.push("playwright");
  tries.push(path.join(__dirname, "..", "..", "..", "sporve-agent-clone", "node_modules", "playwright"));
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  return null;
}

const coded = (code, message) => Object.assign(new Error(message), { code });

function defaultHostAllowed(url) {
  let host = "";
  try { host = new URL(String(url)).hostname.toLowerCase(); } catch (e) { return false; }
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function createSessionPool(opts) {
  const o = opts || {};
  const maxContexts = typeof o.maxContexts === "number" && o.maxContexts > 0 ? o.maxContexts : 4;
  const hostAllowed = typeof o.hostAllowed === "function" ? o.hostAllowed : defaultHostAllowed;
  const viewport = o.viewport || { width: 1280, height: 900 };

  let pw = null;
  let browser = null;
  let browserDead = false;
  let launching = null;
  let active = 0;
  const waiters = []; // FIFO of { resolve, reject }
  let closed = false;
  const stats = { launches: 0, contextsCreated: 0, acquires: 0, releases: 0, evictions: 0, launchFailures: 0 };

  async function launchBrowser() {
    if (!pw) { pw = resolvePlaywright(); if (!pw) throw coded("PLAYWRIGHT_UNRESOLVABLE", "playwright not resolvable (set UPMORE_PLAYWRIGHT_PATH)"); }
    const launchOpts = { headless: true };
    if (process.env.UPMORE_CHROMIUM_PATH) launchOpts.executablePath = process.env.UPMORE_CHROMIUM_PATH;
    if (process.env.UPMORE_CHROMIUM_SANDBOX === "off") launchOpts.args = ["--no-sandbox"];
    else launchOpts.chromiumSandbox = true;
    const b = await pw.chromium.launch(launchOpts);
    stats.launches += 1;
    b.on("disconnected", () => { if (browser === b) { browserDead = true; if (!closed) stats.evictions += 1; } });
    return b;
  }

  async function getBrowser() {
    if (browser && !browserDead) return browser;
    if (!launching) {
      launching = (async () => {
        try { browser = await launchBrowser(); browserDead = false; return browser; }
        catch (e) { stats.launchFailures += 1; browser = null; throw e; }
        finally { launching = null; }
      })();
    }
    return launching;
  }

  function pump() {
    while (!closed && active < maxContexts && waiters.length) {
      const w = waiters.shift();
      active += 1;
      makeLease().then(w.resolve, (e) => { active -= 1; w.reject(e); pump(); });
    }
  }

  async function makeLease() {
    let evictedOnce = false;
    for (;;) {
      const b = await getBrowser();
      try {
        // §6.3: a FRESH context per drive — no storage state is passed in,
        // none is read out; the context is the isolation boundary.
        const context = await b.newContext({ viewport, serviceWorkers: "block" });
        const page = await context.newPage();
        stats.contextsCreated += 1;
        stats.acquires += 1;
        let released = false;
        return {
          context, page,
          async goto(url) {
            if (!hostAllowed(url)) throw coded("POOL_HOST_REFUSED", `pool refuses to open ${url} — caller gate (default: localhost test pages only)`);
            return page.goto(url);
          },
          async release() {
            if (released) return;
            released = true;
            stats.releases += 1;
            // Closing the context destroys cookies, local/session storage,
            // IndexedDB, cache and service workers for this drive. The
            // browser (process + binary state only) is all that survives.
            try { await context.close(); } catch (e) { /* a dead context is already isolated */ }
            active -= 1;
            pump();
          },
        };
      } catch (e) {
        if (!evictedOnce) {
          // Context creation failed — treat the browser as suspect, evict
          // it, and retry the acquire exactly once on a fresh launch.
          evictedOnce = true;
          stats.evictions += 1;
          if (browser === b) { browserDead = true; try { await b.close(); } catch (_) {} if (browser === b) browser = null; }
          continue;
        }
        throw e;
      }
    }
  }

  function acquire() {
    if (closed) return Promise.reject(coded("POOL_CLOSED", "session pool is closed"));
    return new Promise((resolve, reject) => { waiters.push({ resolve, reject }); pump(); });
  }

  async function close() {
    closed = true;
    while (waiters.length) waiters.shift().reject(coded("POOL_CLOSED", "session pool is closed"));
    if (browser) { try { await browser.close(); } catch (e) {} browser = null; }
  }

  return { acquire, close, stats: () => ({ ...stats, active, waiting: waiters.length, maxContexts }) };
}

module.exports = { createSessionPool };
