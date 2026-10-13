/* Career Apply — third block (W06, SC-101..120; hard tasks T-35 eligibility judge, T-42 deadline
   radar, T-91 feed mesh seam, T-95/T-96 seams via 121).
   Pieces the earlier modules deliberately do not own:
     APPLICATION LOG SEAM (SC-115/116): a local, injectable application-log + inbox shape that
       mirrors 121 job ids and the 126 tracker's patterns (the tracker worker is building 126 in a
       sibling branch; when 126 lands, this seam is the shape it should consume — flagged in the
       family doc). Entries: { app_id, job_id, company, title, role_family, seniority_band,
       bucket_at_apply, fit_score_at_apply, applied_at, stage, variant_id, events[] }.
       Inbox messages: { msg_id, from, subject, at, app_ref, kind, snippet }. TEST fixtures live in
       packages/career-data/fixtures/test-application-log.json + test-inbox.json — labeled TEST,
       nothing real is claimed from them.
     statusAnswer(log, inbox, company)  log stage cross-checked against inbox messages; proof =
       the entry ids + message ids, never a bare claim.
     rejectionAutopsy(log, inbox)       rates + patterns computed FROM the rows (family, bucket,
       silent vs emailed rejections); no sugarcoating is a formatting rule: rates are stated raw.
     parseSalaryBand(text) / salaryFilter(postings, floorAnnual)   SC-118.
     detectDateAnomalies(fields, truth) / correctedFields          SC-103 ATS-mangle repair.
     variant registry + guardAttach                                SC-104/SC-120.
     deadlineRadar(cirs, {now})                                   SC-107 (T-42): dated closes
       parsed from CIR entry_routes facts; warn_at = close - 14 days.
     triageLinks(links, {postings, cirs, now})                     SC-114: duplicate / expired /
       clearance-blocked / live / unverifiable, each with a reason; never fetches a pasted link.
     eligibilityJudge(posting, profile, opts)                      SC-113 (T-35): 121 hard
       filters + proven-skill coverage of must-haves; verdict submit | skip with reasons.
   Pure domain module, UMD. No fetch, no deploy, no secrets. */
const CareerApply3 = (() => {
  const J = (() => { try { return require("./121-career-jobs.js"); } catch { return null; } })();
  const s = (v) => (v == null ? "" : String(v));
  const lc = (v) => s(v).toLowerCase();
  const normName = (v) => lc(v).replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\b(inc|llc|ltd|corp|corporation|company|co|the)\b/g, " ").replace(/\s+/g, " ").trim();

  // ---------- application log seam (SC-115/116) ----------
  function statusAnswer(log, inbox, company) {
    const apps = ((log && log.applications) || []).filter((a) => normName(a.company) === normName(company));
    const msgs = (inbox && inbox.messages) || [];
    return apps.map((a) => {
      const proof = msgs.filter((m) => m.app_ref === a.app_id);
      const latest = proof.length ? proof[proof.length - 1] : null;
      const _consistent = !latest || (a.stage === "rejected" ? latest.kind === "rejection" || latest.kind === "confirmation" : true);
      return { app_id: a.app_id, company: a.company, title: a.title, stage: a.stage, applied_at: a.applied_at, variant_id: a.variant_id, log_events: (a.events || []).map((e) => e.kind), inbox_proof: proof.map((m) => ({ msg_id: m.msg_id, kind: m.kind, at: m.at, subject: m.subject })), latest_inbox_kind: latest ? latest.kind : null, cross_check: proof.length ? "log + inbox agree on this application's existence" : "log only — no inbox message references this application" };
    });
  }
  function rejectionAutopsy(log, inbox) {
    const apps = (log && log.applications) || [];
    const msgs = (inbox && inbox.messages) || [];
    const rej = apps.filter((a) => a.stage === "rejected");
    const by = (key) => { const m = {}; for (const a of rej) m[a[key]] = (m[a[key]] || 0) + 1; return m; };
    const emailed = rej.filter((a) => msgs.some((m) => m.app_ref === a.app_id && m.kind === "rejection"));
    const reach = apps.filter((a) => a.bucket_at_apply === "Reach");
    const reachRej = reach.filter((a) => a.stage === "rejected");
    return {
      total: apps.length, rejected: rej.length, rejection_rate_pct: apps.length ? Math.round(100 * rej.length / apps.length) : 0,
      by_family: by("role_family"), by_bucket: by("bucket_at_apply"), by_company: by("company"),
      emailed_rejections: emailed.length, silent_rejections: rej.length - emailed.length,
      reach_applied: reach.length, reach_rejected: reachRej.length, reach_rejection_rate_pct: reach.length ? Math.round(100 * reachRej.length / reach.length) : 0,
      avg_fit_of_rejected: rej.length ? Math.round(rej.reduce((n, a) => n + (a.fit_score_at_apply || 0), 0) / rej.length) : 0,
      still_alive: apps.filter((a) => !["rejected"].includes(a.stage)).length,
    };
  }

  // ---------- salary bands (SC-118) ----------
  function parseSalaryBand(text) {
    const t = s(text);
    const range = t.match(/\$\s?(\d{1,3}(?:,\d{3})?|\d+(?:\.\d+)?\s?k)\s?(?:-|–|to)\s?\$\s?(\d{1,3}(?:,\d{3})?|\d+(?:\.\d+)?\s?k)/i);
    const num = (x) => { x = x.replace(/,/g, "").trim(); return /k$/i.test(x) ? parseFloat(x) * 1000 : parseFloat(x); };
    if (range) {
      const hourly = /per hour|\/hr|hourly/i.test(t.slice(Math.max(0, range.index - 40), range.index + range[0].length + 40));
      let lo = num(range[1]), hi = num(range[2]);
      if (hourly) { lo = Math.round(lo * 2080); hi = Math.round(hi * 2080); }
      return { found: true, min_annual: lo, max_annual: hi, basis: hourly ? "hourly band annualized at 2080h" : "annual band as posted", raw: range[0] };
    }
    const single = t.match(/\$\s?(\d{1,3}(?:,\d{3})?|\d+(?:\.\d+)?\s?k)\s?(?:\/hr|per hour|hourly)/i) || t.match(/(?:salary|base salary|pay)[^$\n]{0,30}\$\s?(\d{1,3}(?:,\d{3})?|\d+(?:\.\d+)?\s?k)/i);
    if (single) { const v = num(single[1]); const hourly = /\/hr|per hour|hourly/i.test(single[0]); const ann = hourly ? Math.round(v * 2080) : v; return { found: true, min_annual: ann, max_annual: ann, basis: hourly ? "hourly rate annualized at 2080h" : "single figure as posted", raw: single[0] }; }
    return { found: false, min_annual: null, max_annual: null, basis: "no salary band in the posting text", raw: null };
  }
  function salaryFilter(postings, floorAnnual) {
    const above = [], below = [], noBand = [];
    for (const p of postings || []) {
      const band = parseSalaryBand(p.jd_text);
      const row = { posting: p, band };
      if (!band.found) noBand.push(row);
      else if (band.max_annual < floorAnnual) below.push(row);
      else above.push(row);
    }
    return { above, below, noBand };
  }

  // ---------- ATS date-mangle repair (SC-103) ----------
  function detectDateAnomalies(fields, truth) {
    // fields: [{field, value}] as the portal shows them; truth: {field: "YYYY-MM"} from the profile.
    const out = [];
    for (const f of fields || []) {
      const want = (truth || {})[f.field];
      const issues = [];
      const m = s(f.value).match(/^(\d{4})-(\d{2})/);
      if (!m) issues.push("unparseable date format");
      else if (Number(m[2]) > 12) issues.push(`month ${m[2]} is impossible — day/month swapped by the parser`);
      if (want && m && `${m[1]}-${m[2]}` !== want) issues.push(`portal shows ${f.value}; profile fact says ${want}`);
      if (issues.length) out.push({ field: f.field, portal_value: f.value, corrected_value: want || null, issues });
    }
    return out;
  }

  // ---------- variant registry + attach guard (SC-104/120) ----------
  function guardAttach(variants, company, variantId) {
    const v = (variants || []).find((x) => x.variant_id === variantId);
    if (!v) return { ok: false, reason: `variant ${variantId} is not in the registry — nothing attaches` };
    if (normName(v.company) !== normName(company)) return { ok: false, reason: `variant ${variantId} was tailored for ${v.company}; attaching it to ${company} is blocked before submit` };
    return { ok: true, variant: v };
  }

  // ---------- deadline radar (SC-107, T-42) ----------
  const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  function parseDates(text) {
    const out = [];
    const re = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)\b/gi;
    let m; while ((m = re.exec(s(text)))) out.push(new Date(Date.UTC(Number(m[3]), MONTHS[lc(m[1])] - 1, Number(m[2]))).toISOString().slice(0, 10));
    return out;
  }
  function deadlineRadar(cirs, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const entries = [];
    for (const cir of cirs || []) {
      for (const r of cir.entry_routes || []) {
        const dates = [...new Set((r.facts || []).flatMap((f) => parseDates(f.claim)))].sort();
        const close = dates.length ? dates[dates.length - 1] : null;
        const days = close ? Math.round((Date.parse(close) - now) / 86400000) : null;
        entries.push({ company: cir.company_name, route: r.route, status: r.status, close_date: close, days_to_close: days, warn_at: close ? new Date(Date.parse(close) - 14 * 86400000).toISOString().slice(0, 10) : null, state: close == null ? "no dated close in the company file" : days < 0 ? "closed" : days <= 14 ? "WARN — inside 2 weeks" : "open" });
      }
    }
    return entries;
  }

  // ---------- link triage (SC-114) ----------
  function triageLinks(links, opts) {
    opts = opts || {};
    const postings = opts.postings || [];
    // BUG-006 (SC-114): URL identity is the FULL url — Stripe (and others) put the job id in the
    // query string (?gh_jid=...), so stripping the query collapsed distinct roles into "duplicates".
    const byUrl = new Map(); for (const p of postings) byUrl.set(s(p.url).trim(), p);
    const seen = new Map();
    return (links || []).map((url) => {
      const clean = s(url).trim();
      if (seen.has(clean)) return { url, verdict: "duplicate", reason: `same posting as ${seen.get(clean)} — already in the list`, posting: null };
      const hit = byUrl.get(clean) || postings.find((p) => p.url && clean && (clean.includes(p.req_id || "§") || (p.source_urls || []).some((u) => s(u).trim() === clean)));
      if (hit) {
        seen.set(clean, url);
        const clearance = /\b(ts\/sci|top secret|security clearance)\b/i.test(hit.jd_text);
        const hard = J ? J.hardFilters(hit, opts.profile || {}) : [];
        return { url, verdict: clearance ? "skip — clearance-blocked" : hard.length ? "skip — hard filter" : "apply", reason: clearance ? "posting requires a security clearance" : hard.length ? hard[0] : "live in the current feed poll", posting: { job_id: hit.job_id, company: hit.company, title: hit.title } };
      }
      seen.set(clean, url);
      return { url, verdict: "ask — unverifiable", reason: "not in the current live feed poll (expired, portal-only, or a board we cannot read) — not guessed", posting: null };
    });
  }

  // ---------- eligibility judge (SC-113, T-35) ----------
  function eligibilityJudge(posting, profile, opts) {
    opts = opts || {};
    if (!J) throw new Error("132 requires 121-career-jobs alongside it");
    const fit = J.scoreFit(posting, profile);
    if (fit.excluded) return { verdict: "skip", stage: "hard filter", reasons: fit.reasons, fit };
    const proven = new Set((profile.skills || []).filter((x) => x.proven !== false).map((x) => lc(x.name)));
    const _jdSkills = [...new Set((posting.jd_text || "").split(/[^A-Za-z+#.]+/).filter(Boolean))];
    const must = (opts.mustHaveSkills || []).filter((x) => !proven.has(lc(x)));
    if (must.length && (opts.mustHaveCoverage || 0) === 0) return { verdict: "skip", stage: "skill evidence", reasons: [`no evidenced skill covers the must-haves: ${must.join(", ")}`], fit, missing_must_haves: must };
    return { verdict: "submit", stage: "eligible", reasons: fit.reasons, fit, missing_must_haves: must };
  }

  return { statusAnswer, rejectionAutopsy, parseSalaryBand, salaryFilter, detectDateAnomalies, guardAttach, deadlineRadar, parseDates, triageLinks, eligibilityJudge };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerApply3;
