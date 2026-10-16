/* Career assignment layer (Mega Task 2, assigning half; owner direction
   2026-10-14: "we need a system for knowing everything. once we have that, we
   can properly assign jobs for people interested in that position.").
   Module 151 watches boards and emits typed alert records, but an alert is
   composed against ONE injected profile inside the watch cycle — nothing held
   a user's stated interests as durable data, matched detections against them,
   or queued the result as a reminder a channel can deliver. This module is
   that half, at the same host tier as 151 (the router bundle does not carry
   it; the host schedules runAssignCycle after 151's cycle and drains the
   reminder queue through its channel):

     watch profile (per-USER record, key career:watch-profile:<user_id> in the
       injected {get,set} store — 121's KV contract; the record is user-scoped
       by construction, never keyed to a chat thread)
       -> interests: taxonomy roles (849 base occupations by SOC + the market
          splits of 00-taxonomy.md §A2) with title-variant terms, seniority
          blockers and optional filters (locations, remote, bands, firm lists)
     matcher: a candidate (a 151 alert record, or a raw 121 new posting) is
       scored against every interest — role terms, band gate, location gate,
       firm lists, opt-out — and 121 scoreFit's HARD EXCLUSION always wins
       over a title match (an alert never recommends a job the user's
       confirmed facts disqualify them from; methodology §6)
     suppression: the same seat rules 151 defines bind here (121 dedupeKey;
       14-day seat window; a re-presented req never re-reminds; a replacement
       req for a gone seat is absorbed) — persisted per user, so consuming
       raw diffs instead of 151's already-suppressed alerts cannot double-fire
     reminder: a typed career_job_reminder (the methodology §6 contract:
       role, company — or honestly not-stated under the TN-1a ruling, a
       posting with no stated company still matches and still reminds —
       deadline quoted in the posting's own words, fit lines sourced only
       from proven facts citing their fact IDs, the apply link) enqueued on a
       persisted per-user queue the host drains exactly once per record.

   Delivery itself (scheduler + channel send) is HOST wiring and is
   deliberately NOT in this module, exactly as in 151. Pure-ish domain idiom:
   all I/O arrives injected { postings | alerts, watchProfile, store, now }.

   MI-117 (Spec 2 §4.1/§4.4) — the alert-fatigue policy lives in THIS
   delivery layer, between the queue and the host's channel send:
   planDelivery() decides, per drained reminder, instant vs batched vs
   digest vs held, under the user's alert_policy (on the watch profile):
   per-user quiet hours in the user's timezone (an alert inside them holds
   to the window's end unless the user opted into night alerts), at most
   instant_daily_cap instant alerts per local day (default 5, until the
   user raises it) with the overflow folding into a digest, and batching of
   near-simultaneous openings at one company into ONE batched alert listing
   the best 3. recordAlertFeedback() carries the skip signal back: five
   skips in a row auto-tightens (the effective instant cap halves) and the
   tightening announces itself in exactly one sentence. Fatigue state is
   persisted per user under FATIGUE_KEY, so caps/streaks bind across
   cycles, never per call. runAssignCycle's queue semantics are unchanged —
   the policy never eats a reminder, it only decides how it is delivered. */
const CareerAssign = (() => {
  const Jobs = (typeof require !== "undefined")
    ? (() => { try { return require("./121-career-jobs.js"); } catch { return null; } })()
    : (typeof CareerJobs !== "undefined" ? CareerJobs : null);
  const Watch = (typeof require !== "undefined")
    ? (() => { try { return require("./151-career-alert-watch.js"); } catch { return null; } })()
    : (typeof CareerAlertWatch !== "undefined" ? CareerAlertWatch : null);

  const SEAT_WINDOW_MS = 14 * 24 * 3600 * 1000; // 151 BUG-092's window, binding here too
  const PROFILE_KEY = (uid) => `career:watch-profile:${uid}`;
  const QUEUE_KEY = (uid) => `career:reminder-queue:${uid}`;
  const HISTORY_KEY = (uid) => `career:reminder-history:${uid}`;
  const FATIGUE_KEY = (uid) => `career:alert-fatigue:${uid}`;
  const DEFAULT_INSTANT_CAP = 5; // Spec 2 §4.4: ≤5 instant/day until raised
  const DEFAULT_SKIP_TIGHTEN_AFTER = 5; // Spec 2 §4.4: "skips 5 alerts in a row"

  const s = (v) => (v == null ? "" : String(v));
  const lc = (v) => s(v).toLowerCase();
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const termIn = (text, term) => new RegExp(`(^|[^a-z0-9])${esc(term)}([^a-z0-9]|$)`).test(lc(text));

  function nowMs(now) {
    const v = typeof now === "function" ? now() : now;
    if (v == null) return Date.now();
    if (v instanceof Date) return v.getTime();
    if (typeof v === "number") return v;
    const p = Date.parse(v);
    return isNaN(p) ? Date.now() : p;
  }

  // ---- role specs: the taxonomy bridge -------------------------------------
  // Curated title-variant + blocker sets for the market splits approved in
  // 00-taxonomy.md §A2 (a split exists only where the hiring recipe differs).
  // Any of the 849 base occupations gets a derived spec: its own title is the
  // term set; entry-band interests inherit the seniority blockers so a derived
  // spec can never fire on an executive title either (ASG-1).
  const ENTRY_BLOCKERS = ["senior", "sr.", "lead", "head of", "director", "vp", "vice president", "manager", "principal", "chief", "staff"];
  const SPLITS = {
    "Investment Banking Analyst": { soc: "13-2051", terms: ["investment banking"], blockers: ENTRY_BLOCKERS },
    "Private Equity Analyst": { soc: "13-2051", terms: ["private equity"], blockers: ENTRY_BLOCKERS },
    "Equity Research Analyst": { soc: "13-2051", terms: ["equity research"], blockers: ENTRY_BLOCKERS },
    "Corporate Banking Analyst": { soc: "13-2051", terms: ["corporate banking"], blockers: ENTRY_BLOCKERS },
    "Quantitative Trader": { soc: "41-3031", terms: ["quantitative trader", "quant trader"], blockers: ENTRY_BLOCKERS },
    "Software Engineering Intern / New-Grad": { soc: "15-1252", terms: ["software engineer", "software engineering"], blockers: ENTRY_BLOCKERS },
    "Machine Learning Engineer": { soc: "15-1252", terms: ["machine learning engineer", "ml engineer"], blockers: ENTRY_BLOCKERS },
    "Data Analyst": { soc: "15-2051", terms: ["data analyst"], blockers: ENTRY_BLOCKERS },
    "Product Manager": { soc: null, terms: ["product manager"], blockers: ENTRY_BLOCKERS },
    "Corporate Law Associate": { soc: "23-1011", terms: ["corporate associate", "law associate"], blockers: ENTRY_BLOCKERS },
    "Management Consultant Analyst": { soc: "13-1111", terms: ["management consultant", "consulting analyst"], blockers: ENTRY_BLOCKERS },
    "Real Estate Analyst": { soc: "13-2051", terms: ["real estate analyst", "acquisitions analyst"], blockers: ENTRY_BLOCKERS },
  };

  function roleSpecFor(input) {
    input = input || {};
    if (input.split && SPLITS[input.split]) {
      const sp = SPLITS[input.split];
      return { soc: input.soc || sp.soc, split: input.split, title: input.split, terms: sp.terms.slice(), blockers: sp.blockers.slice(), derived: false };
    }
    const title = s(input.title || input.split || "").trim();
    const base = lc(title).replace(/,?\s+all other$/, "").trim();
    const terms = base ? [base] : [];
    // plural/singular twin so "Boilermakers" also matches a "Boilermaker" title
    if (base.endsWith("s")) terms.push(base.slice(0, -1)); else if (base) terms.push(base + "s");
    return { soc: input.soc || null, split: input.split || null, title, terms: [...new Set(terms)], blockers: ENTRY_BLOCKERS.slice(), derived: true };
  }

  // ---- watch profile --------------------------------------------------------
  function createWatchProfile(userId, seed) {
    seed = seed || {};
    return {
      type: "career_watch_profile",
      version: 1,
      user_id: s(userId),
      interests: (seed.interests || []).map((i) => ({
        interest_id: s(i.interest_id),
        role: i.role,
        filters: Object.assign({ locations: [], remote_ok: true, bands: [], firms_include: [], firms_exclude: [] }, i.filters || {}),
        created_at: i.created_at || null,
      })),
      alert_policy: normalizeAlertPolicy(seed.alert_policy),
      opt_out: Object.assign({ global: false, companies: [] }, seed.opt_out || {}),
      scoring_profile: seed.scoring_profile || null, // the 121 scoreFit shape (proven-fact skills etc.)
      updated_at: seed.updated_at || null,
    };
  }

  function validateWatchProfile(wp) {
    const errors = [];
    if (!wp || wp.type !== "career_watch_profile") errors.push("not a career_watch_profile record");
    if (!wp || !s(wp.user_id)) errors.push("user_id is required (profiles are per-user, never per-thread)");
    for (const i of (wp && wp.interests) || []) {
      if (!i.interest_id) errors.push("an interest is missing its interest_id");
      const role = i.role || {};
      if (!role.soc || !/^\d{2}-\d{4}$/.test(role.soc)) errors.push(`interest ${i.interest_id || "?"}: role.soc must be a SOC code (NN-NNNN)`);
      if (!role.title) errors.push(`interest ${i.interest_id || "?"}: role.title is required`);
      if (!Array.isArray(role.terms) || !role.terms.length) errors.push(`interest ${i.interest_id || "?"}: role.terms must carry at least one title term`);
      const f = i.filters || {};
      if (!Array.isArray(f.locations) || !Array.isArray(f.bands)) errors.push(`interest ${i.interest_id || "?"}: filters.locations and filters.bands must be arrays`);
    }
    const ap = wp && wp.alert_policy;
    if (ap != null) {
      if (ap.instant_daily_cap != null && (!Number.isInteger(ap.instant_daily_cap) || ap.instant_daily_cap < 1))
        errors.push("alert_policy.instant_daily_cap must be a positive integer (Spec 2 §4.4)");
      if (ap.skip_tighten_after != null && (!Number.isInteger(ap.skip_tighten_after) || ap.skip_tighten_after < 1))
        errors.push("alert_policy.skip_tighten_after must be a positive integer");
      if (ap.quiet_hours != null) {
        if (parseHHMM(ap.quiet_hours.start) == null || parseHHMM(ap.quiet_hours.end) == null)
          errors.push("alert_policy.quiet_hours start/end must be HH:MM");
      }
    }
    return { ok: errors.length === 0, errors };
  }

  function upsertInterest(wp, interest) {
    const ix = wp.interests.findIndex((i) => i.interest_id === interest.interest_id);
    if (ix >= 0) wp.interests[ix] = interest; else wp.interests.push(interest);
    return wp;
  }
  function removeInterest(wp, interestId) {
    wp.interests = wp.interests.filter((i) => i.interest_id !== interestId);
    return wp;
  }
  function setOptOut(wp, optOut) { wp.opt_out = Object.assign({ global: false, companies: [] }, optOut || {}); return wp; }

  async function saveWatchProfile(store, wp) {
    const v = validateWatchProfile(wp);
    if (!v.ok) throw new Error(`invalid watch profile: ${v.errors.join("; ")}`);
    wp.updated_at = new Date().toISOString();
    await store.set(PROFILE_KEY(wp.user_id), wp);
    return wp;
  }
  async function loadWatchProfile(store, userId) {
    const wp = await store.get(PROFILE_KEY(userId));
    return wp || null;
  }

  // ---- matching --------------------------------------------------------------
  function roleMatch(posting, role) {
    const title = lc(posting.title);
    for (const b of role.blockers || []) if (termIn(title, lc(b))) return { hit: false, blocker: b };
    for (const t of role.terms || []) if (termIn(title, lc(t))) return { hit: true, basis: "title", term: t };
    // Multiword role terms also match in the posting's own opening text — a
    // "Summer Analyst" req whose body names the desk is a real match, labeled.
    // MI-028: a jd_head hit also returns the posting's own words around the
    // term as evidence, so the match-basis line can QUOTE the basis instead
    // of merely asserting it (same ±40-char window 151's occupationHit uses).
    const head = lc(posting.jd_text || "").slice(0, 500);
    for (const t of role.terms || []) {
      if (!t.includes(" ")) continue;
      const m = new RegExp(`(^|[^a-z0-9])${esc(lc(t))}([^a-z0-9]|$)`).exec(head);
      if (m) {
        const at = m.index + (m[1] ? m[1].length : 0);
        const evidence = s(posting.jd_text || "").slice(0, 500).slice(Math.max(0, at - 40), at + t.length + 40).trim();
        return { hit: true, basis: "jd_head", term: t, evidence };
      }
    }
    return { hit: false };
  }

  // Boards abbreviate cities freely ("NYC", "CHI", "SF, SEA, CHI, NYC" on one
  // real Stripe location string). Matching only the spelled-out city name
  // would reject a posting in the user's own city — a silent miss class
  // (ASG-9). Canonicalize known abbreviations token-wise before comparing.
  const CITY_ALIASES = { nyc: "new york", chi: "chicago", sf: "san francisco", sea: "seattle", la: "los angeles", philly: "philadelphia", atl: "atlanta", dfw: "dallas", dc: "washington" };
  const canonLoc = (txt) => lc(txt).split(/[^a-z0-9]+/).map((t) => CITY_ALIASES[t] || t).join(" ");
  function locationOk(posting, filters) {
    if (posting.remote === "remote" && filters.remote_ok !== false) return { ok: true, via: "remote" };
    const loc = canonLoc(posting.location || "");
    for (const want of filters.locations || []) {
      const w = canonLoc(want).split(",")[0].trim();
      // MI-028: carry WHICH watched location matched (`want`) — the true
      // location basis of the match, previously discarded by matchInterest.
      if (w && loc.includes(w)) return { ok: true, via: `location ${want}`, want };
    }
    if (!(filters.locations || []).length && filters.remote_ok === false) return { ok: true, via: "no location filter" };
    return { ok: false };
  }

  // Deadline in the posting's own words (methodology §6: quoted, never converted).
  function extractDeadline(posting) {
    const text = s(posting.jd_text || "");
    const m = text.match(/(applications? (?:close|deadline)|apply by|deadline|closing date)\s*(?:is|:|on)?\s*([A-Z][a-z]+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (!m) return null;
    const at = Date.parse(m[2]);
    return { text: m[0].trim(), at: isNaN(at) ? null : new Date(at).toISOString() };
  }

  // One posting x one interest. Returns { matched, reasons[], fit } — reasons
  // are data, so a no-match can always SAY why (the negative-proof contract).
  function matchInterest(posting, interest, scoringProfile) {
    const reasons = [];
    const role = interest.role || {};
    const f = interest.filters || {};
    const rm = roleMatch(posting, role);
    if (rm.blocker) reasons.push(`title carries the seniority blocker "${rm.blocker}" — not a ${role.title} posting`);
    else if (!rm.hit) reasons.push(`title matches no term for ${role.title}`);
    const band = posting.seniority_band || (Jobs ? Jobs.seniorityBand(posting.title || "", posting.jd_text || "") : "unknown");
    if ((f.bands || []).length && !f.bands.includes(band)) reasons.push(`seniority band is ${band}; this interest watches ${(f.bands || []).join(" / ")}`);
    const loc = locationOk(posting, f);
    if (!loc.ok) reasons.push(`location ${posting.location || "unstated"} is outside this interest's locations (${(f.locations || []).join(", ") || "none"}${f.remote_ok === false ? "" : " + remote"})`);
    const company = s(posting.company);
    if ((f.firms_include || []).length) {
      if (!company) reasons.push("interest is limited to named firms and this posting states no company (cannot verify the firm)");
      else if (!f.firms_include.some((x) => lc(x) === lc(company))) reasons.push(`${company} is not in this interest's firm list`);
    }
    if (company && (f.firms_exclude || []).some((x) => lc(x) === lc(company))) reasons.push(`${company} is excluded by this interest`);
    let fit = null;
    if (!reasons.length) {
      // A 151 alert record was already gated + scored at the watch tier; its
      // fit is inherited, never recomputed against a shadow of the posting.
      fit = posting._inherited_fit || (Jobs && scoringProfile ? Jobs.scoreFit(posting, scoringProfile) : null);
      if (fit && fit.excluded) reasons.push(...(fit.hard_fails || fit.reasons || []).map((r) => `scoreFit hard-excluded: ${r}`));
    }
    // MI-028 (loss point L1): the match's TRUE basis used to die here —
    // roleMatch's term (and jd_head evidence), locationOk's via/want, and the
    // band the interest watches were all computed, used as gates, and then
    // thrown away; only the bare basis enum survived, so composeReminder had
    // nothing truthful to render as a fit line for the 94% of reminders with
    // no proven-skill match. match_detail carries them to the reminder.
    const match_detail = reasons.length === 0 && rm.hit ? {
      term: rm.term || null,
      basis: rm.basis || null,
      evidence: rm.evidence || null,
      location_via: loc.ok ? loc.via : null,
      location_want: loc.want || null,
      band,
      bands_watched: (f.bands || []).slice(),
    } : null;
    return { matched: reasons.length === 0, reasons, fit, band, match_basis: rm.basis || null, match_detail };
  }

  // ---- reminder ---------------------------------------------------------------
  // MI-028 (loss points L2/L3): match-basis lines. A reminder's fit lines used
  // to come ONLY from proven-skill derivation (151 composeAlert / inherited
  // alert lines); when no proven skill matched — 808 of 858 Lane A reminders,
  // 644 of them for profiles holding no skills at all — the reminder carried
  // NO basis even though the match itself was fully evidenced. These lines
  // state the match's own true basis, labeled "match basis:", built only from
  // facts the matcher actually verified for THIS posting x interest: the
  // watched role term and where it matched (title, or the JD opening quoted
  // verbatim), the watched location (or accepted remote), and the watched
  // band. A line is emitted only when its basis was a real criterion of the
  // interest (no band line when the interest watches no bands; no location
  // line when location was not how it matched). Nothing here invents a skill
  // or a fact ID — proven-skill lines keep their own fact-cited form above.
  function matchBasisLines(posting, interest, verdict) {
    const d = (verdict && verdict.match_detail) || null;
    if (!d || !d.term) return [];
    const lines = [];
    const roleTitle = (interest.role || {}).title || "";
    if (d.basis === "jd_head" && d.evidence)
      lines.push(`match basis: watched role term "${d.term}" matches this posting's opening text — "${d.evidence}" (watched role: ${roleTitle})`);
    else
      lines.push(`match basis: watched role term "${d.term}" matches this posting's title (watched role: ${roleTitle})`);
    if (d.location_via === "remote")
      lines.push("match basis: this posting is remote and this interest accepts remote postings");
    else if (d.location_want)
      lines.push(`match basis: posting location "${posting.location || ""}" matches watched location "${d.location_want}"`);
    if ((d.bands_watched || []).length && d.band)
      lines.push(`match basis: seniority band "${d.band}" is one this interest watches`);
    return lines;
  }

  function composeReminder(posting, interest, verdict, wp, now) {
    const fit = verdict.fit || posting._inherited_fit || null;
    let fitLines = [], factIds = [], score = null, bucket = null;
    if (posting._inherited_fit_lines) { // a 151 alert record: lines already fact-cited at the watch tier
      fitLines = posting._inherited_fit_lines.slice();
      factIds = (posting._inherited_fact_ids || []).slice();
      if (fit) { score = fit.score; bucket = fit.bucket; }
    } else if (fit) {
      // Reuse 151's composer so the fact-citation law has ONE implementation.
      const rec = Watch ? Watch.composeAlert(posting, fit, wp.scoring_profile || {}, now) : null;
      if (rec) { fitLines = rec.fit_lines; factIds = rec.matched_fact_ids; }
      score = fit.score; bucket = fit.bucket;
    }
    // MI-028: append the match-basis lines after any proven-skill lines.
    // Dedupe: an inherited 151 match-basis role line already citing the same
    // term covers the role basis (never state the same basis twice); the
    // location/band lines are 152-only and always append when true.
    for (const line of matchBasisLines(posting, interest, verdict)) {
      if (fitLines.includes(line)) continue;
      const term = verdict.match_detail && verdict.match_detail.term;
      if (term && /^match basis: watched role term /.test(line)
        && fitLines.some((l) => /^match basis:/.test(l) && lc(l).includes(`"${lc(term)}"`))) continue;
      fitLines.push(line);
    }
    const company = s(posting.company) || null;
    return {
      type: "career_job_reminder",
      reminder_id: null, // set at enqueue from the seat key + job id
      user_id: wp.user_id,
      interest_id: interest.interest_id,
      role_title: interest.role.title,
      soc: interest.role.soc || null,
      job_id: posting.job_id,
      company,
      company_stated: !!company, // TN-1a: unstated is a value, never a drop and never an invention
      title: posting.title,
      location: posting.location || null,
      remote: posting.remote || null,
      url: posting.url,
      source: posting.source,
      posted_at: posting.posted_at || null,
      detected_at: new Date(now).toISOString(),
      deadline: extractDeadline(posting),
      fit: { score, bucket, lines: fitLines, matched_fact_ids: factIds },
      match_basis: verdict.match_basis || null,
      match_detail: verdict.match_detail || null, // MI-028: the auditable basis behind the match-basis fit lines
      dedupe_key: Jobs ? Jobs.dedupeKey({ company: company || "not-stated", title: posting.title, location: posting.location || "" }) : `${company || "not-stated"}|${posting.title}`,
      status: "queued",
      queued_at: new Date(now).toISOString(),
    };
  }

  function speakLine(r) {
    const who = r.company_stated ? r.company : "an employer whose name is not stated in the posting";
    const dl = r.deadline ? ` Deadline, in the posting's own words: "${r.deadline.text}".` : "";
    const fit = r.fit && r.fit.lines && r.fit.lines.length ? ` ${r.fit.lines[0]}.` : "";
    return `New ${r.role_title} posting: ${r.title} at ${who}${r.location ? ` — ${r.location}` : ""}.${fit}${dl} Apply: ${r.url}`;
  }

  // ---- reminder queue (the delivery contract) ----------------------------------
  function createReminderQueue(store, userId) {
    const key = QUEUE_KEY(userId);
    const read = async () => (await store.get(key)) || [];
    const write = async (rows) => { await store.set(key, rows); };
    return {
      key,
      async enqueue(reminder) {
        const rows = await read();
        if (rows.some((x) => x.reminder_id === reminder.reminder_id)) return false;
        rows.push(reminder);
        await write(rows);
        return true;
      },
      async peek(limit) { const rows = await read(); return limit ? rows.slice(0, limit) : rows.slice(); },
      async size() { return (await read()).length; },
      // Drain = the host's delivery pull: returns the oldest records and
      // removes exactly those; a record is never delivered twice by the queue.
      async drain(limit) {
        const rows = await read();
        const n = limit == null ? rows.length : Math.min(limit, rows.length);
        const out = rows.slice(0, n);
        await write(rows.slice(n));
        return out.map((r) => Object.assign({}, r, { status: "drained", drained_at: new Date().toISOString() }));
      },
    };
  }

  // ---- the assignment cycle ------------------------------------------------------
  function normalizeCandidate(c) {
    if (c && c.type === "career_job_alert") {
      return {
        job_id: c.job_id, company: c.company || "", title: c.title, location: c.location || "",
        remote: /remote/i.test(c.location || "") ? "remote" : "onsite",
        url: c.url, posted_at: c.posted_at || null, source: c.source,
        seniority_band: c.seniority_band, role_family: c.role_family,
        // BUG-207 / FR-364: preserve the posting's own text the alert record
        // carries (151 composeAlert, BUG-207) — blanking it here made
        // extractDeadline see an empty string (deadline null on every
        // alert-fed reminder) and removed roleMatch's JD-head leg.
        jd_text: c.jd_text || "",
        _inherited_fit: c.fit || null, _inherited_fit_lines: c.fit_lines || [], _inherited_fact_ids: c.matched_fact_ids || [],
      };
    }
    return c;
  }

  async function runAssignCycle(deps) {
    if (!Jobs) throw new Error("152 requires 121-career-jobs alongside it");
    deps = deps || {};
    const wp = deps.watchProfile;
    if (!wp) throw new Error("152 runAssignCycle requires a watchProfile (createWatchProfile)");
    const v = validateWatchProfile(wp);
    if (!v.ok) throw new Error(`invalid watch profile: ${v.errors.join("; ")}`);
    const store = deps.store;
    if (!store || typeof store.get !== "function" || typeof store.set !== "function")
      throw new Error("152 runAssignCycle requires an injected store {get,set}");
    const now = nowMs(deps.now);
    const candidates = [...(deps.alerts || []), ...(deps.postings || [])].map(normalizeCandidate);
    const queue = createReminderQueue(store, wp.user_id);
    const history = (await store.get(HISTORY_KEY(wp.user_id))) || {};
    const optedOutCompanies = ((wp.opt_out || {}).companies || []).map(lc);

    const reminders = [], suppressed = [], rejected = [];
    const cycleSeats = new Set();
    const summary = new Map(); // interest_id -> { considered, reasons: {class: count} }
    const bump = (iid, reasons) => {
      if (!summary.has(iid)) summary.set(iid, { interest_id: iid, considered: 0, reasons: {} });
      const row = summary.get(iid);
      row.considered += 1;
      for (const r of reasons) {
        const cls = /blocker/.test(r) ? "seniority_blocker" : /band is/.test(r) ? "band" : /location/.test(r) ? "location" : /firm/.test(r) ? "firm_filter" : /hard-excluded/.test(r) ? "scorefit_excluded" : /no term/.test(r) ? "role_no_match" : "other";
        row.reasons[cls] = (row.reasons[cls] || 0) + 1;
      }
    };

    for (const posting of candidates) {
      // Opt-out binds before any matching (shared cross-user suppression is a
      // host store; the per-user + per-company opt-outs live on the profile).
      if (wp.opt_out && wp.opt_out.global) { suppressed.push({ job_id: posting.job_id, reason: "opt-out: the user has opted out of job reminders globally" }); continue; }
      if (posting.company && optedOutCompanies.includes(lc(posting.company))) { suppressed.push({ job_id: posting.job_id, reason: `opt-out: the user opted out of ${posting.company}` }); continue; }

      let best = null;
      for (const interest of wp.interests) {
        const verdict = matchInterest(posting, interest, wp.scoring_profile);
        if (!verdict.matched) { rejected.push({ job_id: posting.job_id, interest_id: interest.interest_id, reasons: verdict.reasons }); bump(interest.interest_id, verdict.reasons); continue; }
        const reminder = composeReminder(posting, interest, verdict, wp, now);
        if (!best || ((reminder.fit.score || 0) > (best.reminder.fit.score || 0))) best = { reminder, interest };
      }
      if (!best) continue;

      // Seat suppression (151 BUG-092 semantics, persisted per user): the same
      // seat reminded within 14 days never re-reminds — a re-presented req is
      // the same seat; a replacement req while the old one is gone is a repost
      // (absorb the new id); a replacement while the old one still stands is a
      // seat-count change and DOES remind. Presence comes from the host's 151
      // snapshots (deps.presentJobIds); without it, a different req id is
      // treated as a new seat — we never eat a possibly-real req on a guess —
      // but a second candidate for the same seat inside ONE cycle is always
      // the cross-board duplicate 151 names.
      const r = best.reminder;
      const seat = history[r.dedupe_key];
      if (cycleSeats.has(r.dedupe_key)) { suppressed.push({ job_id: r.job_id, reason: "cross-board duplicate: same seat already reminded this cycle" }); continue; }
      if (seat && now - seat.reminded_at < SEAT_WINDOW_MS) {
        if ((seat.job_ids || []).includes(r.job_id)) { suppressed.push({ job_id: r.job_id, reason: "same req re-presented — seat already reminded" }); continue; }
        if (deps.presentJobIds && !(seat.job_ids || []).some((id) => deps.presentJobIds.has(id))) {
          seat.job_ids = (seat.job_ids || []).concat([r.job_id]);
          suppressed.push({ job_id: r.job_id, reason: "repost of a reminded seat (prior req gone, within 14 days) — absorbed" });
          continue;
        }
      }
      r.reminder_id = `rem:${r.dedupe_key}:${r.job_id}`;
      const added = await queue.enqueue(r);
      if (added) {
        reminders.push(r);
        cycleSeats.add(r.dedupe_key);
        const ids = new Set(seat ? seat.job_ids || [] : []); ids.add(r.job_id);
        history[r.dedupe_key] = { job_ids: [...ids], reminded_at: now };
      } else suppressed.push({ job_id: r.job_id, reason: "already queued (duplicate reminder suppressed)" });
    }
    await store.set(HISTORY_KEY(wp.user_id), history);

    return {
      type: "career_assign_cycle",
      user_id: wp.user_id,
      at: new Date(now).toISOString(),
      considered: candidates.length,
      reminders,
      suppressed,
      rejected,
      no_match_summary: [...summary.values()],
      queue_depth: await queue.size(),
    };
  }

  // ---- MI-117: alert-fatigue policy (Spec 2 §4.1/§4.4), the delivery layer ----
  function parseHHMM(v) {
    if (typeof v === "number" && Number.isFinite(v)) { const h = Math.floor(v); return (h >= 0 && h <= 23) ? h * 60 : null; }
    const m = /^(\d{1,2}):(\d{2})$/.exec(s(v).trim());
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    return (h <= 23 && mi <= 59) ? h * 60 + mi : null;
  }
  const fmtHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  function normalizeAlertPolicy(raw) {
    raw = raw || {};
    let quiet = { start: "22:00", end: "07:00", timezone: "UTC" };
    if (raw.quiet_hours === null) quiet = null;
    else if (raw.quiet_hours) {
      const q = raw.quiet_hours;
      quiet = {
        start: parseHHMM(q.start) != null ? fmtHHMM(parseHHMM(q.start)) : s(q.start || "22:00"),
        end: parseHHMM(q.end) != null ? fmtHHMM(parseHHMM(q.end)) : s(q.end || "07:00"),
        timezone: s(q.timezone || q.tz || "UTC") || "UTC",
      };
    }
    const cap = raw.instant_daily_cap != null ? raw.instant_daily_cap
      : raw.instant_cap != null ? raw.instant_cap
      : raw.max_instant_per_day != null ? raw.max_instant_per_day : DEFAULT_INSTANT_CAP;
    const tighten = raw.skip_tighten_after != null ? raw.skip_tighten_after : DEFAULT_SKIP_TIGHTEN_AFTER;
    return {
      quiet_hours: quiet,
      night_alerts: raw.night_alerts === true || raw.night_alerts_opt_in === true,
      instant_daily_cap: Number.isInteger(cap) && cap >= 1 ? cap : DEFAULT_INSTANT_CAP,
      skip_tighten_after: Number.isInteger(tighten) && tighten >= 1 ? tighten : DEFAULT_SKIP_TIGHTEN_AFTER,
    };
  }

  function setAlertPolicy(wp, patch) {
    wp.alert_policy = normalizeAlertPolicy(Object.assign({}, wp.alert_policy || {}, patch || {}));
    return wp;
  }

  // Local wall-clock in the policy timezone (Intl is the only clock source;
  // an unknown timezone falls back to UTC rather than guessing).
  const _dtfCache = new Map();
  function tzParts(ms, tz) {
    const zone = tz || "UTC";
    try {
      if (!_dtfCache.has(zone)) _dtfCache.set(zone, new Intl.DateTimeFormat("en-US",
        { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }));
      const parts = {};
      for (const part of _dtfCache.get(zone).formatToParts(new Date(ms))) parts[part.type] = part.value;
      return { year: parts.year, month: parts.month, day: parts.day, hour: Number(parts.hour) % 24, minute: Number(parts.minute) };
    } catch { return tzParts(ms, "UTC"); }
  }
  const localDayKey = (ms, tz) => { const p = tzParts(ms, tz); return `${p.year}-${p.month}-${p.day}`; };
  const policyTz = (policy) => (policy.quiet_hours && policy.quiet_hours.timezone) || "UTC";

  function isInQuietHours(ms, policy) {
    const pol = normalizeAlertPolicy(policy);
    if (!pol.quiet_hours) return false;
    const start = parseHHMM(pol.quiet_hours.start), end = parseHHMM(pol.quiet_hours.end);
    if (start == null || end == null || start === end) return false;
    const p = tzParts(ms, pol.quiet_hours.timezone);
    const cur = p.hour * 60 + p.minute;
    return start < end ? (cur >= start && cur < end) : (cur >= start || cur < end);
  }

  // The first minute the quiet window ends at/after ms (minute-aligned), or
  // null when ms is not inside the window. Minute-scan in the policy
  // timezone: correct across DST and overnight wraps by construction.
  function quietReleaseAt(ms, policy) {
    if (!isInQuietHours(ms, policy)) return null;
    let t = Math.floor(ms / 60000) * 60000;
    for (let i = 0; i < 1500; i++) { if (!isInQuietHours(t, policy)) return t; t += 60000; }
    return t;
  }

  function defaultFatigueState(day) {
    return { type: "career_alert_fatigue_state", version: 1, day, instant_sent: 0,
      digest_job_ids: [], held: [], skip_streak: 0, tightened: false,
      tighten_notice: null, tightened_at: null };
  }
  async function loadFatigueState(store, userId, policy, now) {
    const day = localDayKey(now, policyTz(policy));
    const raw = store ? await store.get(FATIGUE_KEY(userId)) : null;
    const st = Object.assign(defaultFatigueState(day), raw || {});
    if (st.day !== day) { st.day = day; st.instant_sent = 0; st.digest_job_ids = []; } // a new local day refills the instant budget; held/skips/tightening persist
    return st;
  }
  async function saveFatigueState(store, userId, state) { if (store) await store.set(FATIGUE_KEY(userId), state); return state; }

  function effectiveInstantCap(policy, state) {
    const base = normalizeAlertPolicy(policy).instant_daily_cap;
    return state && state.tightened ? Math.max(1, Math.floor(base / 2)) : base;
  }

  function composeBatchedAlert(company, reminders) {
    const sorted = reminders.slice().sort((a, b) => ((b.fit && b.fit.score) || 0) - ((a.fit && a.fit.score) || 0));
    const top = sorted.slice(0, 3).map((r) => ({ job_id: r.job_id, reminder_id: r.reminder_id, title: r.title, url: r.url }));
    const more = sorted.length - top.length;
    return {
      type: "career_batched_alert", company, count: reminders.length,
      job_ids: reminders.map((r) => r.job_id), reminder_ids: reminders.map((r) => r.reminder_id), top,
      speak_line: `${reminders.length} new postings at ${company}, including ${top.map((t) => t.title).join(", ")}${more > 0 ? `, and ${more} more` : ""}.`,
    };
  }

  function composeDigest(reminders, now) {
    return {
      type: "career_alert_digest", count: reminders.length,
      job_ids: reminders.map((r) => r.job_id), reminder_ids: reminders.map((r) => r.reminder_id),
      at: new Date(now).toISOString(),
      speak_line: reminders.length === 1
        ? `One more matching posting is in your digest: ${reminders[0].title} at ${reminders[0].company || "an employer whose name is not stated in the posting"}.`
        : `${reminders.length} more matching postings are in your digest.`,
    };
  }

  // Decide delivery for a batch of drained reminders. Returns the plan and
  // persists the fatigue state (cap consumption, held set, digest census).
  async function planDelivery(deps) {
    deps = deps || {};
    const wp = deps.watchProfile;
    if (!wp) throw new Error("152 planDelivery requires a watchProfile (createWatchProfile)");
    const store = deps.store;
    if (!store || typeof store.get !== "function" || typeof store.set !== "function")
      throw new Error("152 planDelivery requires an injected store {get,set}");
    const now = nowMs(deps.now);
    const policy = normalizeAlertPolicy(wp.alert_policy);
    const state = await loadFatigueState(store, wp.user_id, policy, now);

    const seen = new Set();
    const fresh = [];
    for (const r of deps.reminders || []) { if (r && r.reminder_id && !seen.has(r.reminder_id)) { seen.add(r.reminder_id); fresh.push(r); } }

    // Quiet hours (§4.1): hold everything to the window's end unless the
    // user opted into night alerts. Held alerts consume no instant budget.
    if (isInQuietHours(now, policy) && !policy.night_alerts) {
      const release = quietReleaseAt(now, policy);
      const heldById = new Map((state.held || []).map((h) => [h.reminder.reminder_id, h]));
      for (const r of fresh) heldById.set(r.reminder_id, { reminder: r, release_at: new Date(release).toISOString() });
      state.held = [...heldById.values()];
      await saveFatigueState(store, wp.user_id, state);
      return { type: "career_delivery_plan", user_id: wp.user_id, at: new Date(now).toISOString(),
        instant: [], batched: [], digest: [], digest_record: null,
        held: state.held.map((h) => h.reminder), release_at: new Date(release).toISOString(),
        notices: [], instant_sent: state.instant_sent, effective_cap: effectiveInstantCap(policy, state),
        tightened: !!state.tightened };
    }

    // Window ended (or never applied): previously held reminders re-enter
    // ahead of fresh ones, oldest first.
    const candidates = [...(state.held || []).map((h) => h.reminder), ...fresh.filter((r) => !(state.held || []).some((h) => h.reminder.reminder_id === r.reminder_id))];
    state.held = [];

    // Batching (§4.4): near-simultaneous openings at ONE stated company —
    // one delivery unit. Company-less reminders never share a unit: an
    // unstated company is not one employer (TN-1a honesty binds here too).
    const units = []; const byCompany = new Map();
    for (const r of candidates) {
      const key = r.company ? `co:${lc(r.company)}` : `solo:${r.reminder_id}`;
      if (!byCompany.has(key)) { const u = { company: r.company || null, reminders: [] }; byCompany.set(key, u); units.push(u); }
      byCompany.get(key).reminders.push(r);
    }

    const instant = [], batched = [], digest = [];
    const effCap = effectiveInstantCap(policy, state);
    for (const u of units) {
      const isBatch = u.company && u.reminders.length >= 2;
      if (state.instant_sent < effCap) {
        state.instant_sent += 1; // a batched alert consumes exactly one slot
        if (isBatch) batched.push(composeBatchedAlert(u.company, u.reminders)); else instant.push(u.reminders[0]);
      } else digest.push(...u.reminders);
    }
    if (digest.length) state.digest_job_ids = [...new Set([...(state.digest_job_ids || []), ...digest.map((r) => r.job_id)])];
    await saveFatigueState(store, wp.user_id, state);
    return { type: "career_delivery_plan", user_id: wp.user_id, at: new Date(now).toISOString(),
      instant, batched, digest, digest_record: digest.length ? composeDigest(digest, now) : null,
      held: [], release_at: null, notices: [], instant_sent: state.instant_sent,
      effective_cap: effCap, tightened: !!state.tightened };
  }

  // The skip signal (§4.4 auto-tune): a skip extends the streak, any other
  // action resets it. At skip_tighten_after in a row the policy tightens
  // (effective instant cap halves) and the tightening announces itself in
  // exactly one sentence — returned here, once, and recorded on the state.
  async function recordAlertFeedback(store, wp, action, opts) {
    opts = opts || {};
    const userId = typeof wp === "string" ? wp : (wp && wp.user_id);
    if (!userId) throw new Error("152 recordAlertFeedback requires a watch profile or user id");
    const policy = normalizeAlertPolicy((wp && wp.alert_policy) || opts.policy);
    const now = nowMs(opts.now);
    const state = await loadFatigueState(store, userId, policy, now);
    let notice = null;
    if (lc(action) === "skip") {
      state.skip_streak = (state.skip_streak || 0) + 1;
      if (!state.tightened && state.skip_streak >= policy.skip_tighten_after) {
        state.tightened = true;
        state.tightened_at = new Date(now).toISOString();
        notice = `I am tightening your instant alerts to ${effectiveInstantCap(policy, state)} a day because you skipped the last ${state.skip_streak} in a row and the rest will go to your digest.`;
        state.tighten_notice = notice;
      }
    } else state.skip_streak = 0;
    await saveFatigueState(store, userId, state);
    return { user_id: userId, action: s(action), skip_streak: state.skip_streak,
      tightened: !!state.tightened, notice, effective_cap: effectiveInstantCap(policy, state) };
  }

  return { createWatchProfile, validateWatchProfile, upsertInterest, removeInterest, setOptOut,
    saveWatchProfile, loadWatchProfile, roleSpecFor, SPLITS, matchInterest, matchBasisLines, composeReminder,
    speakLine, extractDeadline, createReminderQueue, runAssignCycle,
    PROFILE_KEY, QUEUE_KEY, HISTORY_KEY, SEAT_WINDOW_MS,
    normalizeAlertPolicy, setAlertPolicy, isInQuietHours, quietReleaseAt, effectiveInstantCap,
    composeBatchedAlert, composeDigest, planDelivery, recordAlertFeedback,
    loadFatigueState, saveFatigueState, FATIGUE_KEY, DEFAULT_INSTANT_CAP, DEFAULT_SKIP_TIGHTEN_AFTER };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerAssign;
