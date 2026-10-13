/* Career job discovery + fit scoring (DISC-003..008; Doc 2 section 2 + Appendix B.2).
   Pure domain module, UMD like the other domain modules. Fetch is INJECTED (opts.fetch) so tests run
   offline on recorded-shape fixtures and the proof script (scripts/career/proof-jobs.mjs) runs the
   same code path against the REAL public ATS feeds. No deploy, no secrets: these are public,
   no-login JSON endpoints (Doc 2 Appendix A.2: Greenhouse/Lever/Ashby/SmartRecruiters = public feeds).

   Normalized posting: { job_id, company, title, role_family, seniority_band, location, remote, url,
                         posted_at, jd_text, source, sources, source_urls, department, req_id }
   job_id is stable: source+company+req id when the feed gives one, else an FNV-1a hash of the URL.

   Functions:
     feeds.greenhouse(token) / lever(company) / ashby(name) / smartrecruiters(company)
                                   feed descriptors { source, company_token, url } for Appendix B.2 endpoints
     fetchFeed(feed, {fetch})      one feed -> { status, url, postings, error? } (never throws on HTTP error)
     fetchAll(feeds, {fetch})      many feeds -> { postings (deduped), feeds: [per-feed results] }
     normalize* (per ATS)          raw feed JSON -> normalized postings
     dedupe(postings)              company + normalized title + location (+ req id when both sides have one)
     diffNew(current, prior)       DISC-004: only genuinely new job_ids vs a prior snapshot
     poll(feeds, {fetch, store, snapshotKey, now})
                                   fetch + dedupe + diff against the injectable KV snapshot store, save the
                                   new snapshot (+ repost history), return { postings, new_postings, feeds }
     qualityFlags(posting, {now, repost_count})   DISC-008 ghost/quality flags with plain-language reasons
     scoreFit(posting, profile, cir?)              DISC-005: hard filters first (a hard fail is EXCLUDED with
                                   the reason, never scored), then soft score 0-100 with reasons + gaps and a
                                   Reach/Match/Safety bucket (optional CIR bar; absent -> neutral bar 60)
     buildShortlist(scored, {limit, feedback})     DISC-006: top-N per day; yes/no feedback memory (injected
                                   store rows) nudges later scores by role_family / company / skills
     recordFeedback(store, entry)  append a yes/no row to the injected feedback store
   Role families are SWE + Finance first (owner ruling 2026-10-12): STARTER_FEEDS weights banks, trading
   firms, fintechs and big-tech SWE boards. Poll cadence per Doc 1/2 Appendix B speed rules: starred
   companies every 15 min, the rest hourly (POLL_MINUTES) — detection, not scheduling, lives here. */
const CareerJobs = (() => {
  const DAY = 86400000;
  const POLL_MINUTES = { starred: 15, default: 60 };
  const NEUTRAL_BAR = 60;

  // ---------- helpers ----------
  const s = (v) => (v == null ? "" : String(v));
  const lc = (v) => s(v).toLowerCase();
  function hash(str) { // FNV-1a 32-bit, deterministic across runs/machines
    let h = 0x811c9dc5;
    const t = s(str);
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, "0");
  }
  function stripHtml(html) {
    return s(html).replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  const normName = (v) => lc(v).replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\b(inc|llc|ltd|corp|corporation|company|co|the)\b/g, " ").replace(/\s+/g, " ").trim();
  const normTitle = (v) => lc(v).replace(/[^a-z0-9 ]/g, " ").replace(/\b(senior|sr|junior|jr|lead|staff|principal|i|ii|iii|iv)\b/g, " ").replace(/\s+/g, " ").trim();
  const normLoc = (v) => lc(v).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().replace(/\bnyc\b/g, "new york").split(" ").slice(0, 3).join(" ");
  const iso = (v) => { if (!v) return null; const d = new Date(typeof v === "number" ? v : Date.parse(v)); return isNaN(d) ? null : d.toISOString(); };

  // ---------- classification ----------
  const FAMILY_RULES = [
    ["Finance", /\b(quant|trader|trading|investment bank|banking analyst|private equity|equity research|portfolio|fp&a|financial analyst|finance|accounting|audit|treasury|capital markets|wealth|risk analyst|actuar|underwrit)/],
    ["SWE", /\b(software|backend|back end|frontend|front end|full stack|fullstack|mobile|ios|android|devops|sre|site reliability|platform engineer|infrastructure|systems engineer|firmware|embedded|web developer|engineer,? software|application engineer|quality engineer|qa engineer|security engineer)/],
    ["Data/ML", /\b(data scien|machine learning|ml engineer|ai engineer|data engineer|data analyst|analytics engineer|research scien)/],
    ["PM", /\b(product manager|program manager|product management|technical program)/],
    ["Design", /\b(designer|design|ux|ui\b|user research)/],
    ["Consulting", /\b(consultant|consulting|advisory associate|strategy associate)/],
    ["Operations", /\b(operations|business operations|bizops|supply chain|logistics)/],
    ["Marketing", /\b(marketing|growth|brand|content strateg)/],
    ["Sales", /\b(account executive|sales|business development|bd representative|sdr|bdr)\b/],
  ];
  function roleFamily(title, jd) {
    const t = lc(title);
    for (const [fam, re] of FAMILY_RULES) if (re.test(t)) return fam;
    const j = lc(jd).slice(0, 600);
    for (const [fam, re] of FAMILY_RULES) if (re.test(j)) return fam;
    if (/\bengineer/.test(t)) return "SWE";
    if (/\banalyst/.test(t)) return "Finance";
    return "Other";
  }
  function seniorityBand(title, jd) {
    const t = lc(title), j = lc(jd);
    if (/\b(intern|internship|co-op)\b/.test(t)) return "intern";
    if (/\b(director|vp|vice president|head of|chief)\b/.test(t)) return "director";
    if (/\bmanager\b/.test(t)) return "manager";
    if (/\b(staff|principal)\b/.test(t)) return "staff";
    if (/\b(senior|sr\.?)\b/.test(t)) return "senior";
    if (/\b(new grad|early career|entry level|graduate program|rotational|university)\b/.test(t + " " + j.slice(0, 400))) return "new_grad";
    if (/\b(junior|jr\.?|associate)\b/.test(t)) return "junior";
    if (/\b(intern|internship)\b/.test(j.slice(0, 300))) return "intern";
    return "mid";
  }
  function remoteOf(location, jd) {
    const t = lc(location) + " " + lc(jd).slice(0, 500);
    if (/\bhybrid\b/.test(t)) return "hybrid";
    if (/\bremote\b/.test(t)) return "remote";
    return "onsite";
  }

  function basePosting(p) {
    const req = p.req_id ? s(p.req_id) : "";
    const job_id = req ? `${p.source}:${normName(p.company)}:${req}`.replace(/\s+/g, "-")
                       : `${p.source}:${normName(p.company)}:${hash(p.url)}`.replace(/\s+/g, "-");
    const jd_text = stripHtml(p.jd_text || "");
    return {
      job_id, company: s(p.company), title: s(p.title),
      role_family: roleFamily(p.title, jd_text), seniority_band: seniorityBand(p.title, jd_text),
      location: s(p.location || ""), remote: remoteOf(p.location, jd_text),
      url: s(p.url), posted_at: iso(p.posted_at), jd_text,
      source: p.source, sources: [p.source], source_urls: [s(p.url)],
      department: s(p.department || ""), req_id: req || null,
    };
  }

  // ---------- per-ATS normalization (recorded shapes; see tests) ----------
  function normalizeGreenhouse(json, token) {
    const company = (json && json.name) || token;
    return ((json && json.jobs) || []).map((j) => basePosting({
      // BUG-005 (SC-032): Stripe's board returns requisition_id "See Opening ID" for ALL 721 jobs —
      // using it as the req id collapsed every Stripe posting onto ONE job_id. A requisition id
      // that is a placeholder (or shared text, not an identifier) must fall back to the numeric id.
      source: "greenhouse", company, title: j.title, req_id: (j.requisition_id && !/see opening/i.test(String(j.requisition_id))) ? j.requisition_id : j.id,
      location: (j.location && j.location.name) || (j.offices && j.offices[0] && j.offices[0].name) || "",
      url: j.absolute_url, posted_at: j.first_published || j.updated_at || j.created_at,
      jd_text: j.content || "", department: (j.departments && j.departments[0] && j.departments[0].name) || "",
    }));
  }
  function normalizeLever(json, companyToken) {
    return (Array.isArray(json) ? json : []).map((j) => basePosting({
      source: "lever", company: companyToken, title: j.text, req_id: j.id,
      location: (j.categories && j.categories.location) || "", url: j.hostedUrl || j.applyUrl,
      posted_at: j.createdAt, jd_text: j.descriptionPlain || j.description || "",
      department: (j.categories && (j.categories.team || j.categories.department)) || "",
    }));
  }
  function normalizeAshby(json, name) {
    return ((json && json.jobs) || []).map((j) => basePosting({
      source: "ashby", company: (json && json.name) || name, title: j.title, req_id: j.id,
      location: j.location || j.locationName || "", url: j.jobUrl || j.applyUrl,
      posted_at: j.publishedAt || j.createdAt, jd_text: j.descriptionPlain || j.descriptionHtml || "",
      department: j.departmentName || j.teamName || "",
    }));
  }
  function normalizeSmartRecruiters(json, companyToken) {
    return ((json && json.content) || []).map((j) => {
      const loc = j.location || {};
      const location = [loc.city, loc.region, loc.country].filter(Boolean).join(", ") + (loc.remote ? " (Remote)" : loc.hybrid ? " (Hybrid)" : "");
      const sections = j.jobAd && j.jobAd.sections ? Object.values(j.jobAd.sections).map((x) => (x && (x.text || "")) || "").join(" ") : "";
      return basePosting({
        source: "smartrecruiters", company: (j.company && j.company.name) || companyToken, title: j.name, req_id: j.ref || j.id,
        location, url: `https://jobs.smartrecruiters.com/${companyToken}/${j.id}`,
        posted_at: j.releasedDate || j.createdOn, jd_text: sections, department: (j.department && j.department.label) || "",
      });
    });
  }
  const NORMALIZERS = { greenhouse: normalizeGreenhouse, lever: normalizeLever, ashby: normalizeAshby, smartrecruiters: normalizeSmartRecruiters };

  // ---------- feeds (Doc 2 Appendix B.2, exact endpoints) ----------
  const feeds = {
    greenhouse: (token) => ({ source: "greenhouse", company_token: token, url: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true` }),
    lever: (company) => ({ source: "lever", company_token: company, url: `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json` }),
    ashby: (name) => ({ source: "ashby", company_token: name, url: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(name)}` }),
    smartrecruiters: (company) => ({ source: "smartrecruiters", company_token: company, url: `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings` }),
  };
  // Starter boards, SWE + Finance first (owner ruling 2026-10-12).
  const STARTER_FEEDS = [
    feeds.greenhouse("stripe"), feeds.greenhouse("robinhood"), feeds.greenhouse("coinbase"),
    feeds.greenhouse("datadog"), feeds.greenhouse("airbnb"), feeds.greenhouse("figma"),
    feeds.lever("leverdemo"), feeds.ashby("ramp"), feeds.ashby("openai"), feeds.ashby("ashby"),
    feeds.smartrecruiters("Square"), feeds.smartrecruiters("BoschGroup"),
  ];

  // ---------- canonical board registry (REPLY-QUALITY PASS, 2026-10-13) ----------
  // This is THE company->board registry: scripts/career/proof-jobs.mjs pulls from it and
  // 131-career-discover plans discovery from it. Every entry carries an explicit status.
  // An entry is 'live' ONLY if a real fetch from this machine returned postings JSON
  // (evidence: docs/career/board-registry-fix-2026-10-13.md). A board whose public ATS
  // endpoints all 404 — or answer with an empty body indistinguishable from a nonexistent
  // company — is 'dead': it is never fetched, and callers report it in deadBoards.
  const CHECKED_AT = "2026-10-13";
  const liveBoard = (company, provider, board, note) => Object.assign(feeds[provider](board),
    { company, provider, board, status: "live", checkedAt: CHECKED_AT, note });
  const deadBoard = (company, board, note) => ({ source: "custom", company_token: board, url: null,
    company, provider: "custom/no-public-api", board, status: "dead", checkedAt: CHECKED_AT, note });
  const BOARD_REGISTRY = [
    liveBoard("Stripe", "greenhouse", "stripe", "verified live 2026-10-13: HTTP 200, 722 postings"),
    liveBoard("Robinhood", "greenhouse", "robinhood", "verified live 2026-10-13: HTTP 200, 178 postings"),
    liveBoard("Airbnb", "greenhouse", "airbnb", "verified live 2026-10-13: HTTP 200, 164 postings"),
    liveBoard("Datadog", "greenhouse", "datadog", "verified live 2026-10-13: HTTP 200, 437 postings"),
    liveBoard("Coinbase", "greenhouse", "coinbase", "verified live 2026-10-13: HTTP 200, 225 postings"),
    liveBoard("Figma", "greenhouse", "figma", "verified live 2026-10-13: HTTP 200, 148 postings"),
    liveBoard("Jane Street", "greenhouse", "janestreet", "verified live 2026-10-13: HTTP 200, 229 postings"),
    deadBoard("Goldman Sachs", "goldmansachs", "no public ATS API: Greenhouse boards goldmansachs/goldman/goldmansachsembassy/gs/goldman-sachs all HTTP 404, Lever goldmansachs 404, Ashby goldmansachs/goldman-sachs 404, SmartRecruiters GoldmanSachs 200 with totalFound 0 (identical to a gibberish token); careers site is a custom surface (goldmansachs.com/careers, HTTP 200 HTML, no public postings JSON) — checked 2026-10-13"),
    liveBoard("Lever (demo board)", "lever", "leverdemo", "verified live 2026-10-13: HTTP 200, 10 postings"),
    deadBoard("Netflix", "netflix", "no public ATS API: Lever netflix/netflixjobs HTTP 404, Ashby netflix 404, Greenhouse netflix 404; jobs.netflix.com / explore.jobs.netflix.net are custom surfaces (HTTP 200 HTML, no public postings JSON) — checked 2026-10-13"),
    liveBoard("Ashby", "ashby", "ashby", "verified live 2026-10-13: HTTP 200, 66 postings"),
    liveBoard("Ramp", "ashby", "ramp", "FIXED 2026-10-13: was Lever (api.lever.co/v0/postings/ramp = HTTP 404); Ramp's real board is Ashby — HTTP 200, 165 postings"),
    liveBoard("OpenAI", "ashby", "openai", "verified live 2026-10-13: HTTP 200, 805 postings"),
    liveBoard("Linear", "ashby", "linear", "verified live 2026-10-13: HTTP 200, 31 postings"),
    deadBoard("Square", "Square", "SmartRecruiters endpoint answers HTTP 200 with totalFound 0 and zero postings (run 1 and 2026-10-13); SmartRecruiters returns the identical 200/totalFound 0 body for a gibberish company token, so the 200 evidences no real board and no postings have ever been pulled from it — checked 2026-10-13"),
    liveBoard("Bosch Group", "smartrecruiters", "BoschGroup", "verified live 2026-10-13: HTTP 200, 100 postings on first page, totalFound 4948"),
    deadBoard("Visa", "Visa", "SmartRecruiters endpoint answers HTTP 200 with totalFound 0 and zero postings (run 1 and 2026-10-13); SmartRecruiters returns the identical 200/totalFound 0 body for a gibberish company token, so the 200 evidences no real board and no postings have ever been pulled from it — checked 2026-10-13"),
  ];
  const liveBoards = () => BOARD_REGISTRY.filter((b) => b.status === "live");
  const deadBoards = () => BOARD_REGISTRY.filter((b) => b.status === "dead")
    .map((b) => ({ company: b.company, provider: b.provider, board: b.board, status: b.status, checkedAt: b.checkedAt, reason: b.note }));
  // Feed descriptors for the live boards only — dead boards produce no fetchable feed.
  const boardFeeds = () => liveBoards().map((b) => ({ source: b.source, company_token: b.company_token, url: b.url, company: b.company, provider: b.provider, board: b.board, status: b.status, checkedAt: b.checkedAt, note: b.note }));

  const realFetch = (url) => (typeof fetch !== "undefined" ? fetch(url, { headers: { accept: "application/json" } }) : Promise.reject(new Error("no fetch available; inject opts.fetch")));

  async function fetchFeed(feed, opts) {
    // Dead boards are never fetched: no silent 404s, the skip is the result.
    if (feed && feed.status === "dead") return { source: feed.source, company_token: feed.company_token, url: feed.url || null, status: 0, postings: [], skipped: true, error: `board marked dead (${(feed.company || feed.company_token || "?")}: ${feed.note || "no public API"})` };
    const f = (opts && opts.fetch) || realFetch;
    try {
      const res = await f(feed.url);
      const status = res.status != null ? res.status : (res.ok ? 200 : 0);
      if (status < 200 || status >= 300) return { source: feed.source, company_token: feed.company_token, url: feed.url, status, postings: [], error: `HTTP ${status}` };
      const json = typeof res.json === "function" ? await res.json() : res;
      const postings = NORMALIZERS[feed.source](json, feed.company_token);
      return { source: feed.source, company_token: feed.company_token, url: feed.url, status, postings };
    } catch (e) {
      return { source: feed.source, company_token: feed.company_token, url: feed.url, status: 0, postings: [], error: s(e && e.message || e) };
    }
  }

  // ---------- dedupe ----------
  // City segment only: "San Francisco, CA" and "San Francisco, California" are the same place to a feed.
  function dedupeKey(p) { return `${normName(p.company)}|${normTitle(p.title)}|${normLoc(s(p.location).split(",")[0])}`; }
  function dedupe(postings) {
    const groups = new Map();
    for (const p of postings || []) {
      const key = dedupeKey(p);
      // Req ids are source-scoped: two DIFFERENT boards carrying the same role merge even though
      // their req ids differ; two postings on the SAME board with different req ids are distinct roles.
      const hit = (groups.get(key) || []).find((g) => g.source !== p.source || !(g.req_id && p.req_id && g.req_id !== p.req_id));
      if (!hit) { groups.set(key, (groups.get(key) || []).concat([Object.assign({}, p, { sources: [...(p.sources || [p.source])], source_urls: [...(p.source_urls || [p.url])] })])); continue; }
      for (const u of p.source_urls || [p.url]) if (!hit.source_urls.includes(u)) hit.source_urls.push(u);
      for (const src of p.sources || [p.source]) if (!hit.sources.includes(src)) hit.sources.push(src);
      if ((p.jd_text || "").length > (hit.jd_text || "").length) hit.jd_text = p.jd_text;
      if (!hit.posted_at || (p.posted_at && p.posted_at < hit.posted_at)) hit.posted_at = p.posted_at;
      if (!hit.department && p.department) hit.department = p.department;
    }
    return [...groups.values()].flat();
  }

  // ---------- new-posting detection (DISC-004) ----------
  function diffNew(current, prior) {
    const seen = new Set((prior && prior.job_ids) || []);
    return (current || []).filter((p) => !seen.has(p.job_id));
  }
  function makeSnapshot(postings, now, priorHistory) {
    const history = Object.assign({}, (priorHistory || {}));
    const at = new Date(now || Date.now()).toISOString();
    for (const p of postings) {
      const h = history[p.job_id];
      if (!h) history[p.job_id] = { first_seen: at, last_seen: at, repost_count: 0, present: true };
      else { if (!h.present) h.repost_count = (h.repost_count || 0) + 1; h.last_seen = at; h.present = true; }
    }
    for (const id of Object.keys(history)) if (!postings.some((p) => p.job_id === id)) history[id].present = false;
    return { saved_at: at, job_ids: postings.map((p) => p.job_id), history };
  }
  // Injectable KV: { get(key), set(key, value) } — sync or async, plain JSON values.
  async function poll(feedList, opts) {
    opts = opts || {};
    const store = opts.store, key = opts.snapshotKey || "career:jobs:snapshot";
    const prior = store ? await store.get(key) : null;
    const results = [];
    for (const fd of feedList) results.push(await fetchFeed(fd, opts));
    const postings = dedupe(results.flatMap((r) => r.postings));
    const new_postings = diffNew(postings, prior);
    const snapshot = makeSnapshot(postings, opts.now, prior && prior.history);
    if (store) await store.set(key, snapshot);
    const skippedDead = (feedList || []).filter((fd) => fd && fd.status === "dead")
      .map((fd) => ({ company: fd.company || fd.company_token, provider: fd.provider || fd.source, board: fd.board || fd.company_token, status: "dead", reason: fd.note || "board marked dead" }));
    return { postings, new_postings, feeds: results, snapshot, deadBoards: skippedDead };
  }

  // ---------- ghost / quality flags (DISC-008) ----------
  function qualityFlags(posting, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const age_days = posting.posted_at ? Math.max(0, Math.floor((now - Date.parse(posting.posted_at)) / DAY)) : null;
    const repost_count = opts.repost_count || 0;
    const jd = lc(posting.jd_text);
    const flags = [];
    if (age_days != null && age_days >= 60) flags.push({ code: "stale", reason: `open ${age_days} days` });
    else if (age_days != null && age_days >= 30) flags.push({ code: "aging", reason: `open ${age_days} days` });
    if (repost_count >= 1) flags.push({ code: "reposted", reason: `reposted ${repost_count === 1 ? "once" : repost_count + " times"}` });
    if (!posting.department && !/\b(team|group|organization|org)\b/.test(jd.slice(0, 800))) flags.push({ code: "missing_team", reason: "no named team in the posting" });
    if (!/(\$\s?\d|salary|compensation range|pay range|base salary)/.test(jd)) flags.push({ code: "missing_salary", reason: "no salary or compensation range shown" });
    const bad = flags.some((f) => f.code === "stale" || f.code === "reposted");
    const summary = flags.length ? `${flags.map((f) => f.reason).join(", ")}${bad ? " — lower odds" : ""}` : "no quality flags";
    return { age_days, repost_count, flags, summary, lower_odds: bad };
  }

  // ---------- fit scoring (DISC-005) ----------
  function profileSkills(profile) {
    const raw = (profile && (profile.skills || (profile.facts && profile.facts.skills))) || [];
    return raw.map((x) => typeof x === "string" ? { name: x, proven: true } : { name: s(x.name || x.skill), proven: x.proven !== false && !x.unproven }).filter((x) => x.name);
  }
  function hardFilters(posting, profile) {
    const fails = [];
    const c = (profile && profile.constraints) || {};
    const prefs = (profile && profile.preferences) || {};
    const jd = lc(posting.jd_text), title = lc(posting.title);
    // excluded company = a stated deal-breaker
    const excluded = (prefs.excluded_companies || []).map(normName);
    if (excluded.includes(normName(posting.company))) fails.push(`company: ${posting.company} is on your excluded list`);
    // location
    const wantLocs = (c.locations || prefs.locations || []).map(normLoc).filter(Boolean);
    if (wantLocs.length && posting.remote !== "remote") {
      const pl = normLoc(posting.location);
      if (!wantLocs.some((w) => pl.includes(w) || w.includes(pl.split(" ")[0]))) fails.push(`location: posting is in ${posting.location || "an unlisted place"}; you want ${[...(c.locations || prefs.locations)].join(", ")}`);
    }
    if (prefs.remote_only && posting.remote === "onsite") fails.push(`location: posting is on-site in ${posting.location}; you want remote`);
    // work authorization (Doc 2 section 2 example: "requires US citizenship; you said you need sponsorship")
    const needsSponsorship = c.needs_sponsorship === true || /sponsor/i.test(s(c.work_authorization));
    const citizenOnly = /\b(u\.?s\.? citizens? only|must be a u\.?s\.? citizen|requires? u\.?s\.? citizenship|us citizenship required)\b/.test(jd);
    const noSponsor = /\b(no sponsorship|will not sponsor|cannot sponsor|unable to sponsor|without sponsorship|does not offer sponsorship)\b/.test(jd);
    if (citizenOnly && !/citizen/i.test(s(c.work_authorization))) fails.push(`work authorization: posting requires US citizenship; your profile says ${s(c.work_authorization) || "not a US citizen"}`);
    else if (needsSponsorship && noSponsor) fails.push(`work authorization: posting offers no sponsorship; you said you need sponsorship`);
    else if (needsSponsorship && citizenOnly) fails.push(`work authorization: posting requires US citizenship; you said you need sponsorship`);
    // clearance
    const needsClearance = /\b(ts\/sci|top secret|security clearance|secret clearance)\b/.test(jd);
    if (needsClearance && (!c.clearance || /none|no\b/i.test(s(c.clearance)))) fails.push(`clearance: posting requires a security clearance; none on your profile`);
    // graduation window
    const gradYear = c.graduation_year || (c.graduation_date ? Number(s(c.graduation_date).slice(0, 4)) : null);
    const jdGradYears = [...new Set([...jd.matchAll(/\b(?:graduat\w*|class of)\D{0,12}(20\d\d)\b/g)].map((m) => Number(m[1])))];
    if (gradYear && jdGradYears.length && /\b(intern|new grad|early career|university)\b/.test(title + " " + jd.slice(0, 300)) && !jdGradYears.includes(gradYear))
      fails.push(`graduation window: posting targets ${jdGradYears.join("/")}; you graduate ${gradYear}`);
    // seniority
    const years = typeof profile.experience_years === "number" ? profile.experience_years : null;
    const level = lc(profile.level || c.level || "");
    if ((posting.seniority_band === "senior" || posting.seniority_band === "staff" || posting.seniority_band === "director") && (level === "new_grad" || level === "student" || (years != null && years < 2)))
      fails.push(`seniority: posting is ${posting.seniority_band}-level; your profile is ${level || years + " yrs experience"}`);
    if (posting.seniority_band === "intern" && years != null && years >= 3 && level !== "student") fails.push(`seniority: posting is an internship; your profile shows ${years} yrs experience`);
    const reqYears = jd.match(/\b(\d+)\+?\s*(?:years|yrs)(?:\s*of)?\s*(?:experience|exp)\b/);
    if (reqYears && years != null && years + 1 < Number(reqYears[1])) fails.push(`seniority: posting asks ${reqYears[1]}+ years of experience; your profile shows ${years}`);
    // degree
    const deg = lc(profile.degree || c.degree || "");
    if (/\bph\.?d\.?\b/.test(jd.slice(0, 1200)) && /\brequired\b/.test(jd.slice(0, 1200)) && !/ph/.test(deg)) fails.push(`degree: posting requires a PhD; your profile degree is ${deg || "not listed"}`);
    if (/\bmaster'?s\b/.test(jd.slice(0, 1200)) && /\brequired\b/.test(jd.slice(0, 1200)) && deg && !/master|ph/.test(deg)) fails.push(`degree: posting requires a master's; your profile degree is ${deg}`);
    return fails;
  }

  function scoreFit(posting, profile, cir) {
    const fails = hardFilters(posting, profile || {});
    if (fails.length) return { job_id: posting.job_id, excluded: true, score: null, bucket: null, reasons: fails, gaps: fails, matched_skills: [], missing_skills: [], hard_fails: fails };
    const prefs = (profile && profile.preferences) || {};
    const jd = lc(posting.title + " " + posting.jd_text);
    const skills = profileSkills(profile);
    // Proven-only matching (SC-037, BUG-002): a skill with no evidence link on the profile must NOT
    // earn score or appear as a match — it is named as a gap instead. Before this fix an unproven
    // skill (e.g. Rust on the TEST persona) counted toward skillScore exactly like an evidenced one.
    const matchedAll = skills.filter((x) => jd.includes(lc(x.name)));
    const matched = matchedAll.filter((x) => x.proven);
    const unprovenMatched = matchedAll.filter((x) => !x.proven);
    const missing = skills.filter((x) => !jd.includes(lc(x.name)));
    const reasons = [], gaps = [];
    // skills overlap: 0-50
    let skillScore = 0;
    if (skills.length) { skillScore = Math.round(50 * matched.length / Math.max(3, Math.min(skills.length, 10))); }
    if (matched.length) reasons.push(`skills match: ${matched.slice(0, 6).map((x) => x.name).join(", ")}`);
    if (unprovenMatched.length) gaps.push(`not counted — no evidence on your profile for: ${unprovenMatched.map((x) => x.name).join(", ")} (the posting mentions it, but only evidenced skills match)`);
    // experience relevance: 0-25 (role-family preference + keyword overlap with the profile's own words)
    let expScore = 0;
    const wantFamilies = (prefs.role_families || prefs.roles || []).map(lc);
    if (wantFamilies.includes(lc(posting.role_family))) { expScore += 12; reasons.push(`role family ${posting.role_family} is one you asked for`); }
    const profileWords = new Set(lc([profile.experience_text || "", profile.summary || "", skills.filter((x) => x.proven).map((x) => x.name).join(" ")].join(" ")).split(/[^a-z0-9+#.]+/).filter((w) => w.length > 3));
    const jdWords = new Set(jd.split(/[^a-z0-9+#.]+/).filter((w) => w.length > 3));
    const overlap = [...profileWords].filter((w) => jdWords.has(w)).length;
    expScore += Math.min(13, overlap);
    if (overlap >= 5) reasons.push(`your experience language overlaps this description (${overlap} shared terms)`);
    else gaps.push(`little overlap between your experience and this description (${overlap} shared terms)`);
    if (missing.length && matched.length) gaps.push(`your other profile skills not mentioned here: ${missing.slice(0, 5).map((x) => x.name).join(", ")}`);
    // company preference: 0-15, starred first
    let companyScore = 0;
    const starred = (prefs.starred_companies || []).map(normName);
    if (starred.includes(normName(posting.company))) { companyScore = 15; reasons.push(`${posting.company} is a company you starred`); }
    // role-family / location soft points: 0-10 combined into experience bucket cap check below
    let score = Math.max(0, Math.min(100, skillScore + expScore + companyScore + (posting.remote === "remote" && prefs.remote_ok !== false ? 3 : 0)));
    score = Math.max(0, Math.min(100, score));
    // bucket from the CIR bar (optional plain object: { bar } or { bar_score } or { competitiveness: 0-100 })
    const bar = cir && typeof cir === "object" ? (typeof cir.bar === "number" ? cir.bar : typeof cir.bar_score === "number" ? cir.bar_score : typeof cir.competitiveness === "number" ? cir.competitiveness : NEUTRAL_BAR) : NEUTRAL_BAR;
    const diff = score - bar;
    const bucket = diff >= 15 ? "Safety" : diff >= -10 ? "Match" : "Reach";
    reasons.push(`bucket ${bucket}: score ${score} vs bar ${bar}${cir ? " (company bar)" : " (neutral bar; no company record yet)"}`);
    return { job_id: posting.job_id, excluded: false, score, bucket, bar, reasons, gaps, matched_skills: matched.map((x) => x.name), unproven_skills: unprovenMatched.map((x) => x.name), missing_skills: missing.map((x) => x.name), hard_fails: [] };
  }

  // ---------- APPE-001 persona fixture -> scoring profile ----------
  // The master profile holds facts with IDs (Doc 2 section 1); this adapts that fact shape
  // (packages/career-data/fixtures/test-persona.json, a synthetic TEST persona) into the profile
  // shape scoreFit consumes, citing fact IDs so a score can be traced back to profile facts.
  function profileFromPersona(persona) {
    const facts = (persona && persona.facts) || [];
    const byKind = (k) => facts.filter((f) => f.kind === k);
    const skills = byKind("skill").map((f) => ({ name: f.text, proven: !f.unproven && (f.evidence || []).length > 0, fact_id: f.fact_id }));
    const constraintText = byKind("constraint").map((f) => f.text).join(" ");
    const prefText = byKind("preference").map((f) => f.text).join(" ");
    const grad = constraintText.match(/graduat\w*[^0-9]*(20\d\d)/i) || byKind("education").map((f) => f.text).join(" ").match(/class of (20\d\d)/i);
    const starred = (prefText.match(/starred companies:\s*([^.;]+)/i) || [])[1];
    const locations = ["New York", "NYC", "Chicago", "San Francisco", "Seattle", "Austin", "Boston", "Remote"].filter((l) => new RegExp(l, "i").test(prefText));
    // Canonical master-profile schema (122-career-profile): structured basics/constraints/preferences
    // win over prose parsing when present. Added at integration 2026-10-12 so ONE persona fixture
    // serves both the profile store and fit scoring.
    const canonSkills = byKind("skill").map((f) => ({ name: String(f.text || "").replace(/^Skill:\s*/i, ""), proven: !f.unproven && (f.evidence || []).length > 0, fact_id: f.id || f.fact_id }));
    const canonGradYear = persona && persona.constraints && persona.constraints.graduationDate ? Number(String(persona.constraints.graduationDate).slice(0, 4)) : null;
    const canonStarred = persona && persona.preferences && Array.isArray(persona.preferences.targetCompanies) ? persona.preferences.targetCompanies : null;
    const canonLocations = persona && persona.preferences && Array.isArray(persona.preferences.locations) ? persona.preferences.locations : null;
    const prof0 = {
      persona_id: persona && persona.persona_id, label: persona && persona.label,
      skills: (persona && persona.constraints) ? canonSkills : skills,
      degree: (byKind("education")[0] || {}).text || "",
      level: /sophomore|student|class of/i.test(byKind("education").map((f) => f.text).join(" ")) ? "student" : "",
      experience_years: 1,
      experience_text: facts.filter((f) => ["experience", "project", "leadership"].includes(f.kind)).map((f) => f.text).join(" "),
      constraints: {
        work_authorization: /us citizen/i.test(constraintText) ? "US citizen" : constraintText,
        needs_sponsorship: /without sponsorship/i.test(constraintText) ? false : /need sponsorship|requires sponsorship/i.test(constraintText),
        graduation_year: grad ? Number(grad[1]) : null,
        graduation_date: grad ? `${grad[1]}-05` : null,
        clearance: /clearance/i.test(constraintText) ? constraintText : null,
        locations,
      },
      preferences: {
        role_families: [/swe|software/i.test(prefText) ? "SWE" : null, /finance|quant|bank/i.test(prefText) ? "Finance" : null].filter(Boolean),
        locations, starred_companies: starred ? starred.split(",").map((x) => x.trim()).filter(Boolean) : [],
      },
    };
    if (persona && persona.constraints) {
      if (canonGradYear) { prof0.constraints.graduation_year = canonGradYear; prof0.constraints.graduation_date = String(persona.constraints.graduationDate); }
      if (typeof persona.constraints.needsSponsorship === "boolean") prof0.constraints.needs_sponsorship = persona.constraints.needsSponsorship;
      if (persona.constraints.workAuthorization) prof0.constraints.work_authorization = persona.constraints.workAuthorization;
    }
    if (canonStarred) prof0.preferences.starred_companies = canonStarred;
    if (canonLocations) { prof0.preferences.locations = canonLocations; prof0.constraints.locations = canonLocations; }
    // Canonical preferences.roles (SC-034, BUG-003): variant personas state roles only in the
    // structured preferences block ("Data Analyst", "Software Engineer"); the prose parser above
    // never saw them, so their role-family preference silently never fired. Derive families with
    // the same classifier the postings use.
    if (persona && persona.preferences && Array.isArray(persona.preferences.roles) && persona.preferences.roles.length) {
      const fams = [...new Set(persona.preferences.roles.map((r) => roleFamily(r, "")).filter((f) => f && f !== "Other"))];
      if (fams.length) prof0.preferences.role_families = fams;
    }
    return prof0;
  }

  // ---------- shortlist + feedback memory (DISC-006) ----------
  function feedbackNudge(feedbackRows, posting) {
    let nudge = 0; const why = [];
    for (const r of feedbackRows || []) {
      const yes = r.decision === "yes";
      if (r.role_family && lc(r.role_family) === lc(posting.role_family)) { nudge += yes ? 4 : -6; why.push(`${yes ? "you said yes to" : "you passed on"} a ${posting.role_family} role before (${yes ? "+4" : "-6"})`); }
      if (r.company && normName(r.company) === normName(posting.company)) { nudge += yes ? 5 : -8; why.push(`${yes ? "you said yes to" : "you passed on"} ${posting.company} before (${yes ? "+5" : "-8"})`); }
      for (const sk of r.skills || []) if ((posting.matched_skills || []).some((m) => lc(m) === lc(sk))) { nudge += yes ? 1 : -1; }
    }
    return { nudge: Math.max(-20, Math.min(20, nudge)), why: [...new Set(why)] };
  }
  async function feedbackRowsOf(store) {
    if (!store) return [];
    if (Array.isArray(store)) return store;
    if (typeof store.get === "function") return (await store.get("career:jobs:feedback")) || [];
    if (Array.isArray(store.rows)) return store.rows;
    return [];
  }
  async function recordFeedback(store, entry) {
    const row = { decision: entry.decision, role_family: entry.role_family || null, company: entry.company || null, skills: entry.skills || [], job_id: entry.job_id || null, at: entry.at || new Date().toISOString() };
    if (Array.isArray(store)) { store.push(row); return row; }
    if (store && typeof store.get === "function" && typeof store.set === "function") { const rows = (await store.get("career:jobs:feedback")) || []; rows.push(row); await store.set("career:jobs:feedback", rows); return row; }
    if (store && Array.isArray(store.rows)) { store.rows.push(row); return row; }
    throw new Error("feedback store must be an array, {rows}, or a KV {get,set}");
  }
  async function buildShortlist(scored, opts) {
    opts = opts || {};
    const limit = opts.limit || opts.perDay || 10;
    const rows = await feedbackRowsOf(opts.feedbackStore || opts.feedback);
    const enriched = [];
    for (const item of scored || []) {
      if (item.excluded || item.score == null) continue;
      const posting = item.posting || item;
      const merged = Object.assign({}, posting, { matched_skills: item.matched_skills || [] });
      const fb = feedbackNudge(rows, merged);
      enriched.push({ posting, score: item.score, adjusted_score: Math.max(0, Math.min(100, item.score + fb.nudge)), bucket: item.bucket, reasons: [...(item.reasons || []), ...fb.why], gaps: item.gaps || [], feedback_nudge: fb.nudge });
    }
    enriched.sort((a, b) => b.adjusted_score - a.adjusted_score || s(b.posting.posted_at).localeCompare(s(a.posting.posted_at)));
    return enriched.slice(0, limit);
  }

  return { POLL_MINUTES, NEUTRAL_BAR, STARTER_FEEDS, BOARD_REGISTRY, liveBoards, deadBoards, boardFeeds, feeds, fetchFeed, fetchAll: async (fl, o) => { const r = []; for (const f of fl) r.push(await fetchFeed(f, o)); return { feeds: r, postings: dedupe(r.flatMap((x) => x.postings)), deadBoards: (fl || []).filter((fd) => fd && fd.status === "dead").map((fd) => ({ company: fd.company || fd.company_token, provider: fd.provider || fd.source, board: fd.board || fd.company_token, status: "dead", reason: fd.note || "board marked dead" })) }; },
    normalizeGreenhouse, normalizeLever, normalizeAshby, normalizeSmartRecruiters,
    dedupe, dedupeKey, diffNew, makeSnapshot, poll, qualityFlags, hardFilters, scoreFit, profileFromPersona, buildShortlist, recordFeedback, feedbackNudge,
    roleFamily, seniorityBand, stripHtml, hash };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerJobs;
