"use strict";
/* career-shelf-targeted.cjs — the targeted shelf read for the queue
   feed (Throughput Package B, 2026-10-21; root failure MUSE-F-005).

   THE DEFECT THIS CLOSES: the only shelf read the queue feed has is
   career_pool.loadPool — one recency-ordered window of 600 rows
   across all 11 sources. Measured on the live snapshot
   (2026-10-21, 21,688 rows): that window's seniority bands are
   mid 238 / senior 143 / manager 108 / staff 71 / director 32 /
   junior 5 / intern 2 (both Operations) — ZERO SWE+intern — while
   the shelf itself holds 173 SWE+intern postings deeper down.
   Re-pulling changes nothing: pulls 2 and 3 return the identical
   window (verified), so a 50-posting intern queue assembled from
   the window feed starves at 0 forever. The window is a discovery
   slice; a queue feed keyed to a named family/band needs a read
   keyed to that family/band.

   THE SHAPE (per the F-005 handoff, Claude's fix design): a
   targeted shelf read keyed to the named family/band, merged
   BEFORE the unchanged filter. Module 155's screening — including
   121's roleFamily / seniorityBand classification — is NOT
   touched, NOT relaxed, and NOT duplicated as a membership
   decision here. This module only FETCHES CANDIDATES:

     * Keying = candidate fetch. BAND_KEYS / FAMILY_KEYS below are
       ilike substring patterns mirrored from the TITLE side of
       121's classifiers (FAMILY_RULES + the seniorityBand title
       checks, 121-career-jobs.js), plus the one text key the band
       classifier itself credits (the intern JD-head fallback).
       A pattern is a substring, not a word match, so a keyed read
       deliberately OVER-fetches (e.g. "%intern%" also returns
       "Internal Controls Engineer"); 121's classifiers remain the
       sole membership decision, exactly as they are for the
       window pool today.
     * Band is the scarce dimension, so when a band is named the
       reads key on the band; family-only asks key on the family.
       The supplement then MERGES with the window pool (dedupe by
       posting id, window copy wins) ahead of the unchanged
       filter — the merged set strictly contains what the window
       feed serves today, so nothing the current pipeline can
       reach is lost.
     * Superset claim, stated exactly: for the BAND dimension the
       keys cover every path 121's seniorityBand can take to that
       band (title tokens, the seasonal analyst/associate
       convention, and — for intern — the JD-head fallback via the
       text key), up to each keyed read's per-key cap. Measured on
       the live shelf: the intern text key matches 5,346 rows
       (any excerpt mentioning "intern" anywhere), so its cap of
       1,000 recency-first leaves exactly 5 of the shelf's 397
       intern-band postings unfetched — all 5 stale tail postings
       (text-key ranks 2,154–4,929; posted 2026-08-27…10-02 or
       undated; 4 of 5 junk/Other-family rows), while 172 of 173
       SWE+intern and all 35 Data/ML+intern are fetched. That is
       the right trade for a queue feed — it wants the freshest
       50, and recency-first capping is what guarantees them —
       but it is a trade, named here rather than hidden. Second
       residual: an intern token split mid-word by an HTML tag in
       the raw excerpt ("inte<br>rnship") is invisible to the text
       key; the mapped jd_text would have credited it (0 measured
       cases on the live shelf). For FAMILY, no superset is
       claimed: 121 can reach a family from JD text alone (the
       firm-identity / JD-fallback passes) and no title key can
       see those — the window pool remains the carrier for them,
       which is why this read supplements and never replaces it.

   READ CONTRACT: the loader's spec shape — the same array-filter
   ilike specs career_pool.loadTargeted already emits
   ({ table, select, order, limit, filters: [{ column, op:
   "ilike", value }] }), one filter per read. The Edge root binds
   that shape today (handler-career.ts readRows); the worker
   transport (supabase-transport.cjs) binds only { column: { eq } }
   so far — the ilike binding there is the one prerequisite wiring
   edit named in the integration note
   (docs/career/queue-feed-targeted-read.md). Patterns are module
   constants, never user input.

   FAILURE POSTURE (mirrors career_pool): loadKeyed never throws.
   A failed read fails the whole supplement with
   "KB_POOL_READ_FAILED" — the caller keeps its window pool and
   its honest behavior; a partial candidate set is never dressed
   up as the shelf. No key (neither family nor band) resolves
   { postings: [], error: "SHELF_TARGETED_KEY_REQUIRED" }; an
   unknown family/band name resolves "SHELF_TARGETED_KEY_UNKNOWN".
*/
const path = require("node:path");

const { CareerPool } = require(path.join(__dirname, "..", "..", "supabase", "functions", "_shared", "career_pool.js"));

// Band keys, mirrored from 121.seniorityBand's title checks (in
// classifier order) + the intern JD-head fallback's text key.
const BAND_KEYS = {
  intern: {
    title: ["%intern%", "%co-op%", "%summer%analyst%", "%summer%associate%", "%winter%analyst%", "%winter%associate%"],
    text: ["%intern%"],
  },
  director: { title: ["%director%", "%vp%", "%vice president%", "%head of%", "%chief%"], text: [] },
  manager: { title: ["%manager%"], text: [] },
  staff: { title: ["%staff%", "%principal%"], text: [] },
  senior: { title: ["%senior%", "%sr%"], text: [] },
  new_grad: {
    title: ["%new grad%", "%early career%", "%entry level%", "%graduate program%", "%rotational%", "%university%"],
    text: ["%new grad%", "%early career%", "%entry level%", "%graduate program%", "%rotational%"],
  },
  junior: { title: ["%junior%", "%jr%", "%associate%"], text: [] },
};

// Family keys, mirrored from the title side of 121's FAMILY_RULES
// (distinctive substrings of each rule's alternation) + the two
// title fallbacks ("%analyst%" -> Finance, "%engineer%" -> SWE).
const FAMILY_KEYS = {
  Medicine: ["%nurse%", "%nursing%", "%clinical%", "%medical%", "%pharmacy%", "%healthcare%", "%health care%", "%physician%", "%radiologic%", "%respiratory%", "%phlebotom%"],
  Law: ["%paralegal%", "%legal%", "%law clerk%", "%attorney%", "%counsel%", "%litigation%", "%juris%"],
  "Real Estate": ["%real estate%", "%acquisitions%", "%asset management%", "%leasing%", "%brokerage%", "%property management%", "%multifamily%", "%mortgage%", "%escrow%"],
  Finance: ["%quant%", "%trader%", "%trading%", "%investment bank%", "%banking%", "%private equity%", "%equity research%", "%portfolio%", "%fp&a%", "%financial%", "%finance%", "%accounting%", "%audit%", "%treasury%", "%capital markets%", "%wealth%", "%actuar%", "%underwrit%", "%analyst%"],
  SWE: ["%software%", "%backend%", "%back end%", "%frontend%", "%front end%", "%full stack%", "%fullstack%", "%mobile%", "%ios%", "%android%", "%devops%", "%sre%", "%site reliability%", "%platform engineer%", "%infrastructure%", "%systems engineer%", "%firmware%", "%embedded%", "%web developer%", "%application engineer%", "%quality engineer%", "%qa engineer%", "%security engineer%", "%engineer%"],
  "Data/ML": ["%data scien%", "%machine learning%", "%ml engineer%", "%ai engineer%", "%data engineer%", "%data analyst%", "%analytics engineer%", "%research scien%"],
  PM: ["%product manager%", "%program manager%", "%product management%", "%technical program%"],
  Design: ["%designer%", "%design%", "%ux%", "%user research%"],
  Consulting: ["%consultant%", "%consultancy%", "%consulting%", "%advisory%", "%strategy associate%"],
  Operations: ["%operations%", "%bizops%", "%supply chain%", "%logistics%", "%data entry%"],
  Marketing: ["%marketing%", "%growth%", "%brand%", "%content strateg%"],
  Sales: ["%account executive%", "%sales%", "%business development%", "%bd representative%", "%sdr%", "%bdr%"],
};

// One bounded read per key pattern. Intern candidates shelf-wide
// measure in the hundreds; 1000 keeps any single keyed read under
// the window loader's order of magnitude while never binding on
// the benchmark dimension (recency order: the freshest candidates
// are the ones a queue wants first anyway).
const DEFAULT_PER_KEY_LIMIT = 1000;

function createTargetedShelfRead(deps) {
  const d = deps || {};
  if (typeof d.readRows !== "function") throw new Error("targeted shelf read: a readRows(spec) function is required — the read never invents a data source");
  const jobs = d.jobs || null;
  const perKeyLimit = Number.isSafeInteger(d.perKeyLimit) && d.perKeyLimit > 0 ? d.perKeyLimit : DEFAULT_PER_KEY_LIMIT;

  // loadKeyed({ family, band, limit }) -> { postings, error, reads,
  // rowsMoved, keyedBy }. Candidates only: every posting is mapped
  // by career_pool.mapKbPosting with the caller's 121 helpers, so
  // role_family / seniority_band on the candidates are 121's own
  // stamps — the downstream filter reads them exactly as it reads
  // the window pool's.
  async function loadKeyed(target) {
    const t = target || {};
    const family = typeof t.family === "string" && t.family ? t.family : null;
    const band = typeof t.band === "string" && t.band ? t.band : null;
    if (!family && !band) return { postings: [], error: "SHELF_TARGETED_KEY_REQUIRED", reads: 0, rowsMoved: 0, keyedBy: null };
    let keyedBy, table;
    if (band) {
      table = BAND_KEYS[band];
      keyedBy = "band";
      if (!table) return { postings: [], error: "SHELF_TARGETED_KEY_UNKNOWN", reads: 0, rowsMoved: 0, keyedBy };
    } else {
      table = FAMILY_KEYS[family];
      keyedBy = "family";
      if (!table) return { postings: [], error: "SHELF_TARGETED_KEY_UNKNOWN", reads: 0, rowsMoved: 0, keyedBy };
    }
    // BAND_KEYS entries are { title, text }; FAMILY_KEYS entries are
    // flat title-pattern arrays (family has no text key).
    const titleKeys = Array.isArray(table) ? table : table.title;
    const textKeys = Array.isArray(table) ? [] : table.text;
    const specs = [];
    for (const value of titleKeys) specs.push({ column: "title", value });
    for (const value of textKeys) specs.push({ column: "text_excerpt", value });
    const byId = new Map();
    let rowsMoved = 0;
    for (const f of specs) {
      let rows;
      try {
        rows = await d.readRows({
          table: CareerPool.KB_POSTINGS_TABLE,
          select: CareerPool.KB_POSTINGS_COLUMNS,
          order: { column: "posted_at", ascending: false, nullsFirst: false },
          limit: perKeyLimit,
          filters: [{ column: f.column, op: "ilike", value: f.value }],
        });
      } catch {
        return { postings: [], error: "KB_POOL_READ_FAILED", reads: specs.length, rowsMoved, keyedBy };
      }
      if (!Array.isArray(rows)) return { postings: [], error: "KB_POOL_READ_FAILED", reads: specs.length, rowsMoved, keyedBy };
      rowsMoved += rows.length;
      for (const row of rows) {
        const p = CareerPool.mapKbPosting(row, jobs);
        if (p && !byId.has(p.id)) byId.set(p.id, p);
      }
    }
    const postings = [...byId.values()].sort((a, b) => {
      const pa = a.posted_at ? Date.parse(a.posted_at) : null;
      const pb = b.posted_at ? Date.parse(b.posted_at) : null;
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return pb - pa;
    });
    const limit = Number.isSafeInteger(t.limit) && t.limit > 0 ? t.limit : null;
    return { postings: limit ? postings.slice(0, limit) : postings, error: null, reads: specs.length, rowsMoved, keyedBy };
  }

  return { loadKeyed };
}

// mergePostings(base, extra): the supplement merge ahead of the
// unchanged filter. Dedupe by posting identity (id, falling back
// to job_id / corpus_id — the three are one value on mapped KB
// postings); the BASE copy wins (the window pool's mapping is the
// incumbent), extras append in their own recency order.
function mergePostings(base, extra) {
  const seen = new Set();
  const out = [];
  const keyOf = (p) => p && (p.id || p.job_id || p.corpus_id);
  for (const p of base || []) {
    const k = keyOf(p);
    if (k) { if (seen.has(k)) continue; seen.add(k); }
    out.push(p);
  }
  for (const p of extra || []) {
    const k = keyOf(p);
    if (k) { if (seen.has(k)) continue; seen.add(k); }
    out.push(p);
  }
  return out;
}

module.exports = { createTargetedShelfRead, mergePostings, BAND_KEYS, FAMILY_KEYS, DEFAULT_PER_KEY_LIMIT };
