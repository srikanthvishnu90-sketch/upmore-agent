"use strict";
/* queue-feed.cjs — THROUGHPUT LANE (2026-10-21): the targeted shelf
   read for batch queue feeding, in the F-005 handoff shape.

   The defect it answers (measured, throughput/BASELINE.md): the
   production feed (production-sources.postingsFor) sees ONLY the
   pool loader's 600-row recency window. For the benchmark's own
   shape — "software engineering intern roles", greenhouse — that
   window holds ZERO eligible postings (F-005), while the shelf
   holds 91; the 50th sits ~8,000 rows deep in recency order. A
   50-queue can therefore never assemble from the window, no matter
   how fast the worker drains.

   Shape: window-first (the common case stays one read), then a
   targeted top-up that pages the family's boards directly — the
   worker transport's eq filter pages board-by-board, which is the
   only paging the transport supports (no offset; PostgREST caps
   every read at 1,000 rows, both measured). Rows are mapped by the
   SHARED career_pool mapper and classified by module 121's own
   classifiers — the same family/band rule module 155 applies — so
   the feed can only ever ADD eligible postings; 155's screening
   runs unchanged on what it returns. Eligibility includes §6.3
   driveability through module 150's hostAllowed — a posting the
   driver would refuse at session creation never enters the queue.

   Contract: createQueueFeed({ readRows, jobs, boardsFor }) ->
   { postingsForTargeted(userId, familyText, count, opts) }.
   boardsFor(atsFamily) resolves the family's board tokens in scan
   order (the composition root owns the census — in production a
   worker-start GROUP BY over career_kb_postings; this module never
   invents the list). opts.atsFamily defaults to "greenhouse" (the
   only family with a driveable verdict today). Resolves
   { postings, stats } — postings = window pool with targeted
   eligible appended (deduped by 155's posting identity), stats
   carries the measured cost of the assembly. Throws
   BATCH_DISCOVERY_READ_FAILED on a failed window read, exactly
   like the production source: a batch never prepares against a
   silently-empty pool. */
const path = require("node:path");
const { CareerPool } = require(path.join(__dirname, "..", "..", "supabase", "functions", "_shared", "career_pool.js"));
const PortalBrowser = require(path.join(__dirname, "..", "..", "packages", "domain", "150-career-portal-browser.js"));

const coded = (code, message) => Object.assign(new Error(message || code), { code });
const lc = (v) => String(v == null ? "" : v).trim().toLowerCase();
const keyOf = (p) => `${lc(p && p.company)}::${lc(p && (p.title || p.role))}::${lc(p && p.url)}`;

function createQueueFeed(deps) {
  const d = deps || {};
  if (typeof d.readRows !== "function") throw coded("QUEUE_FEED_NOT_WIRED", "createQueueFeed: readRows is required");
  if (!d.jobs || typeof d.jobs.askRoleFamilies !== "function" || typeof d.jobs.seniorityBand !== "function") {
    throw coded("QUEUE_FEED_NOT_WIRED", "createQueueFeed: module 121 classifiers (askRoleFamilies/seniorityBand) are required");
  }
  if (typeof d.boardsFor !== "function") throw coded("QUEUE_FEED_NOT_WIRED", "createQueueFeed: boardsFor(atsFamily) is required — the feed never invents the board census");
  const Jobs = d.jobs;
  const loader = CareerPool.createKbPoolLoader({ readRows: d.readRows, jobs: Jobs, limit: d.windowLimit });

  function eligible(p, fams, wantIntern, atsFamily) {
    if (atsFamily && p.source !== atsFamily) return false;
    if (!fams.includes(p.role_family)) return false;
    if (wantIntern && p.seniority_band !== "intern") return false;
    // §6.3 driveability: a posting whose stored URL sits on an
    // employer-site wrapper (databricks.com/...?gh_jid=) is refused
    // at session creation — measured 29 of the shelf's 91
    // SWE-intern-greenhouse postings. It must not enter a queue:
    // eligibility means the driver may open it, not merely that it
    // classifies. Module 150's own gate is the judge, never a copy.
    if (typeof PortalBrowser.hostAllowed === "function") {
      const gate = PortalBrowser.hostAllowed(p.url || "");
      if (!gate || !gate.allowed) return false;
    }
    return true;
  }

  async function postingsForTargeted(userId, familyText, count, opts) {
    const o = opts || {};
    const atsFamily = o.atsFamily || "greenhouse";
    const want = Number.isSafeInteger(count) && count > 0 ? count : 15;
    const fams = Jobs.askRoleFamilies(familyText || "");
    const wantIntern = Jobs.seniorityBand(familyText || "", "") === "intern";
    const t0 = Date.now();
    const stats = { windowRows: 0, windowEligible: 0, boardsRead: 0, rowsScanned: 0, targetedEligible: 0, ms: 0 };

    const pool = await loader.loadPool();
    if (pool.error) throw coded("BATCH_DISCOVERY_READ_FAILED", "the KB pool read failed — the batch stops named rather than preparing against an invented or silently-empty pool");
    const postings = pool.postings.slice();
    stats.windowRows = postings.length;
    const seen = new Set(postings.map(keyOf));
    let have = fams.length ? postings.filter((p) => eligible(p, fams, wantIntern, atsFamily)).length : 0;
    stats.windowEligible = have;

    // No classifiable family: the window is all anyone can honestly
    // offer (155 keeps the whole shelf in that case too).
    if (fams.length && have < want) {
      const boards = await d.boardsFor(atsFamily);
      const driveable = [];
      const rest = [];
      for (const board of boards || []) {
        if (have >= want) break;
        const rows = await d.readRows({
          table: CareerPool.KB_POSTINGS_TABLE,
          select: CareerPool.KB_POSTINGS_COLUMNS,
          filters: { board: { eq: board } },
          order: { column: "posted_at", ascending: false, nullsFirst: false },
          limit: 1000,
        });
        stats.boardsRead += 1;
        stats.rowsScanned += rows.length;
        for (const row of rows) {
          const p = CareerPool.mapKbPosting(row, Jobs);
          if (!p) continue;
          const k = keyOf(p);
          if (seen.has(k)) continue;
          seen.add(k);
          // ORDER IS THE CONTRACT: 155 selects its first N eligible
          // in pool order and its own screen does not apply the
          // §6.3 gate — so driveable-eligible postings ride ahead
          // of the rest of the scan, or the queue fills with
          // postings that die at session creation (measured).
          if (eligible(p, fams, wantIntern, atsFamily)) { have += 1; stats.targetedEligible += 1; driveable.push(p); }
          else rest.push(p);
        }
      }
      postings.push(...driveable, ...rest);
    }
    stats.ms = Date.now() - t0;
    return { postings, stats };
  }

  return { postingsForTargeted };
}

module.exports = { createQueueFeed };
