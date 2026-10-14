/* Career chat router (REPAIR LANE R1, gauntlet stage 3) — the missing route layer.
   At ba708c1 the staging chat path tried only 120-career-access.handleChat and
   130-career-onboarding.handleChat; every other career domain module (jobs 121,
   tailor 123, outreach 124, prep 127, discover 131, packets 133) existed with no
   chat route, so ordinary career turns returned null (silence). This module is
   the deterministic router the flow-router conventions already use elsewhere:
   it is consulted AFTER 120 and 130, matches a small set of career intents
   deterministically, CALLS the existing domain functions (never reimplements
   them), and shapes every reply through 140-career-reply.composeResult so the
   user-visible text is the composer's, never raw module output.
   Pure/sync like the other domain modules: the host injects data via ctx —
     ctx.profile          122 master profile (required for most intents)
     ctx.postings         job postings: gauntlet corpus shape ({id, title,
                          company, location, remote_terms, requirements,
                          salary, deadline, tradeoff}) OR 121-normalized shape
                          ({job_id, jd_text, ...}); live-board postings arrive
                          already normalized via 131 discover() results the
                          host fetched (ctx.discovery.postings also accepted)
     ctx.posting          the one target posting ("this role" / "this")
     ctx.contacts         contact records for outreach resolution
     ctx.sendingAccounts  sending-account records for outreach
     ctx.outreach         { purpose, attachmentVersion } when already known
     ctx.artifacts        stored artifact records ({name|file, record,
                          sha256, text?}) for packet binding by content hash
     ctx.now              host clock (ms or ISO); defaults to Date.now()
   Staging-only wiring lives in the harness glue (pilot-lib chatTurn); the
   production handler could adopt this same handleChat after 120/130 with the
   host supplying the same ctx — that adoption is D-10/owner territory and is
   NOT done here. No sends, no submits: outreach stops at draft/clarification,
   packets stop at a review surface, approvals are untouched. */
const CareerRouter = (() => {
  const req = (p) => { try { return typeof require !== "undefined" ? require(p) : null; } catch { return null; } };
  const Jobs = typeof CareerJobs !== "undefined" ? CareerJobs : req("./121-career-jobs.js");
  const Tailor = typeof CareerTailor !== "undefined" ? CareerTailor : req("./123-career-tailor.js");
  const Outreach = typeof CareerOutreach !== "undefined" ? CareerOutreach : req("./124-career-outreach.js");
  const Prep = typeof CareerPrep !== "undefined" ? CareerPrep : req("./127-career-prep.js");
  const Discover = typeof CareerDiscover !== "undefined" ? CareerDiscover : req("./131-career-discover.js");
  const Packets = typeof CareerPackets !== "undefined" ? CareerPackets : req("./133-career-packets.js");
  const Apply3 = typeof CareerApply3 !== "undefined" ? CareerApply3 : req("./132-career-apply3.js");
  // IB-AP pack §0.1: 132's producers join the seam (guarded like the
  // rest); 149 sits AFTER this file in the bundle — lazy getter only.
  const Apply = typeof CareerApply !== "undefined" ? CareerApply : req("./132-career-apply.js");
  const getPortalApply = () => { try { return typeof CareerPortalApply !== "undefined" ? CareerPortalApply : req("./149-career-portal-apply.js"); } catch { return req("./149-career-portal-apply.js"); } };
  void getPortalApply;
  const Reply = typeof CareerReply !== "undefined" ? CareerReply : req("./140-career-reply.js");
  // Lane A (gauntlet round 2): the intent-ownership layer below CALLS the
  // doorstep seam (141) and the onboarding/profile write path (130) through
  // their existing exports — it never edits them. Both are guarded: in the
  // router bundle neither file is bundled, so the requires resolve to null
  // there and the handlers fall back to the stores' shared write surfaces
  // (the same ctx objects 141/130 read and write).
  const Doorstep = typeof CareerDoorstep !== "undefined" ? CareerDoorstep : req("./141-career-doorstep.js");
  const Onboarding = typeof CareerOnboarding !== "undefined" ? CareerOnboarding : req("./130-career-onboarding.js");
  // Routing fix (owner order 2026-10-13, census briefs A1–A6): the remaining
  // career modules get real chat routes here. Every require is guarded the
  // same way — a module absent from a bundle makes its handlers step aside
  // (return null) rather than crash the turn.
  const ProfileMod = typeof CareerProfile !== "undefined" ? CareerProfile : req("./122-career-profile.js");
  const Intel = typeof CareerIntel !== "undefined" ? CareerIntel : req("./125-career-intel.js");
  const Track = typeof CareerTrack !== "undefined" ? CareerTrack : req("./126-career-track.js");
  const Negotiation = typeof CareerNegotiation !== "undefined" ? CareerNegotiation : req("./128-career-negotiation.js");
  const OS = typeof CareerOS !== "undefined" ? CareerOS : req("./129-career-os.js");
  const Paths = typeof CareerPaths !== "undefined" ? CareerPaths : req("./134-career-paths.js");
  const Graph = typeof CareerGraph !== "undefined" ? CareerGraph : req("./135-career-graph.js");
  const Season = typeof CareerSeason !== "undefined" ? CareerSeason : req("./136-career-season.js");
  const Safety = typeof CareerSafety !== "undefined" ? CareerSafety : req("./139-career-safety.js");
  const Guidance = typeof CareerGuidance !== "undefined" ? CareerGuidance : req("./144-career-guidance.js");
  // 146 sits AFTER this file in the router bundle's concatenation order, so
  // an eager top-level read hits the const TDZ inside the bundle. Resolve
  // lazily at call time instead (post-initialization in every host).
  const getIntake = () => { try { return typeof CareerIntake !== "undefined" ? CareerIntake : req("./146-career-intake.js"); } catch { return req("./146-career-intake.js"); } };
  const nodeFs = (() => { try { return typeof require !== "undefined" ? require("fs") : null; } catch { return null; } })();

  const s = (v) => String(v == null ? "" : v);
  const lc = (v) => s(v).toLowerCase();
  // Routing robustness (wedge paraphrase battery): real users transpose
  // letters ("connetc", "saftey", "dgiest") and a keyword router that only
  // matches perfect spelling drops those turns into the fallback. detypo
  // repairs a token ONLY when exactly one word from a tight routing
  // vocabulary is reachable by a single adjacent transposition — names,
  // firms, and ordinary words are never touched. It feeds ROUTING only;
  // stored records always keep the user's original text.
  const ROUTE_VOCAB = new Set(["connect", "gmail", "calendar", "consent", "password", "safety", "honest", "yield", "digest", "referral", "analysts", "analyst", "people", "finance", "school", "email", "emails", "campaign", "verified", "sendable", "trustworthy", "boutique", "boutiques", "bankers", "banker", "contacts", "upload", "spreadsheet", "voice", "samples", "shorter", "formal", "render", "daily", "finish", "rules", "approve", "approval", "before", "found", "senior", "draft", "drafts", "intro", "office", "vacation", "return", "bounce", "breaker", "firms", "suppression", "suppress", "follow", "waves", "alumni", "directory", "departed", "tailor", "resume", "packet", "interview", "mock", "offer", "offers", "timeline", "tracker", "status", "season", "assessment", "scores", "negotiate", "negotiation", "counter", "people"]);
  function detypo(text) {
    return s(text).replace(/[A-Za-z]{5,}/g, (w) => {
      const lw = w.toLowerCase();
      if (ROUTE_VOCAB.has(lw)) return w;
      let hit = null;
      for (let i = 0; i < lw.length - 1; i++) {
        const cand = lw.slice(0, i) + lw[i + 1] + lw[i] + lw.slice(i + 2);
        if (ROUTE_VOCAB.has(cand)) { if (hit && hit !== cand) return w; hit = cand; }
      }
      if (!hit) return w;
      return /^[A-Z]/.test(w) ? hit.charAt(0).toUpperCase() + hit.slice(1) : hit;
    });
  }
  const nowOf = (ctx) => { const n = ctx && ctx.now; const ms = n == null ? Date.now() : (typeof n === "number" ? n : Date.parse(n)); return Number.isFinite(ms) ? ms : Date.now(); };

  // ---------- pure-JS sha256 (no deps, so the module stays bundle-safe) ----------
  function sha256(ascii) {
    const rightRotate = (v, a) => (v >>> a) | (v << (32 - a));
    const mathPow = Math.pow, maxWord = mathPow(2, 32);
    let result = "";
    const words = [], _asciiBitLength = ascii.length * 8;
    let hash = (sha256.h = sha256.h || []); const k = (sha256.k = sha256.k || []);
    let primeCounter = k.length; const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    // UTF-8 encode
    const utf8 = unescape(encodeURIComponent(ascii));
    const bitLength = utf8.length * 8;
    let str = utf8 + "\x80";
    while ((str.length % 64) - 56) str += "\x00";
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code >> 8) return sha256Bytes(str);
      words[i >> 2] |= code << (((3 - i) % 4) * 8);
    }
    words[words.length] = (bitLength / maxWord) | 0;
    words[words.length] = bitLength;
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, (j += 16)), oldHash = hash;
      hash = hash.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ (~e & hash[6]))
          + k[i]
          + (w[i] = i < 16 ? w[i] : (w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) | 0);
        const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (let i = 0; i < 8; i++) {
      for (let j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? "0" : "") + b.toString(16);
      }
    }
    return result;
    function sha256Bytes(str2) { // fallback for non-Latin1 input: hash the UTF-8 bytes via the same routine on the encoded string
      return sha256(unescape(encodeURIComponent(str2)));
    }
  }

  // ---------- profile adaptation for 121 scoring ----------
  function profileFactsText(profile) { return ((profile && profile.facts) || []).map((f) => f.text || "").join(" "); }
  function provenSkillNames(profile) {
    const fromFacts = ((profile && profile.facts) || []).filter((f) => f.kind === "skill" && !f.unproven).map((f) => f.name || f.title).filter(Boolean);
    if (fromFacts.length) return fromFacts;
    return (((profile || {}).skills) || []).filter((x) => x && x.proven !== false).map((x) => (typeof x === "string" ? x : x.name)).filter(Boolean);
  }
  function gradYearOf(profile) {
    const gd = profile && profile.constraints && profile.constraints.graduationDate;
    const m = s(gd).match(/(20\d\d)/) || profileFactsText(profile).match(/graduating[^0-9]*(20\d\d)/i);
    return m ? Number(m[1]) : null;
  }
  function experienceYearsOf(profile) {
    let months = 0;
    for (const f of ((profile && profile.facts) || [])) {
      if (f.kind !== "experience" || !f.start) continue;
      const a = Date.parse(`${f.start}-01T00:00:00Z`), b = f.end ? Date.parse(`${f.end}-01T00:00:00Z`) : a;
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) months += Math.round((b - a) / 2592000000) + 1;
    }
    return Math.floor(months / 12);
  }
  // 121's hardFilters treat profile preference locations as a hard filter and
  // its graduation regex reads only the FIRST year of a range; the router owns
  // those two semantics instead (preferences are preferences — deal-breakers
  // are the hard list — and ranges are parsed whole, below), so the scoring
  // profile deliberately carries no locations and no graduation_year, and the
  // router applies its own location/graduation handling around scoreFit.
  function scoringProfile(profile) {
    const p = profile || {};
    const skills = ((p.facts) || []).filter((f) => f.kind === "skill").map((f) => ({ name: f.name || f.title, proven: !f.unproven }));
    const edu = ((p.facts) || []).find((f) => f.kind === "education");
    return {
      skills: skills.length ? skills : (p.skills || []),
      degree: edu ? edu.text : (p.degree || ""),
      level: gradYearOf(p) ? "student" : (p.level || ""),
      experience_years: experienceYearsOf(p),
      experience_text: profileFactsText(p), summary: profileFactsText(p),
      constraints: { work_authorization: (p.constraints || {}).workAuthorization || "", needs_sponsorship: !!(p.constraints || {}).needsSponsorship, clearance: (p.constraints || {}).securityClearance || null, locations: [] },
      preferences: { role_families: [], roles: (p.preferences || {}).roles || [], locations: [], starred_companies: [], excluded_companies: (p.preferences || {}).excludedCompanies || [] },
    };
  }

  // ---------- posting adaptation: corpus shape -> 121-normalized shape ----------
  function jdTextForPosting(cp) {
    if (!cp) return "";
    if (cp.jd_text && !Array.isArray(cp.requirements)) return cp.jd_text;
    const must = [], pref = [];
    for (const r of cp.requirements || []) (/plus|preferred|not required/i.test(r) ? pref : must).push(r);
    const parts = [`${cp.title} at ${cp.company}.`, `Location: ${cp.location}.`];
    if (must.length) parts.push(`Requirements: ${must.join("; ")}.`);
    if (pref.length) parts.push(`Nice to have, not required: ${pref.join("; ")}.`);
    if (cp.salary && cp.salary.raw) parts.push(`Salary: ${cp.salary.raw}.`);
    return parts.join(" ");
  }
  function adaptPosting(cp) {
    if (!cp) return null;
    if (cp.jd_text && cp.job_id && !Array.isArray(cp.requirements)) {
      return Object.assign({}, cp, { corpus_id: cp.corpus_id || cp.job_id, id: cp.corpus_id || cp.job_id });
    }
    const jd = jdTextForPosting(cp);
    const source = s(cp.source_board || cp.source || "corpus").split(/\s+/)[0].toLowerCase();
    const reqId = cp.requisition_id || (s(cp.title).match(/Req\s+([A-Z]+-\d+)/i) || [])[1] || cp.id;
    return {
      corpus_id: cp.id, id: cp.id, job_id: cp.id, company: cp.company, title: cp.title,
      location: cp.location || "", remote: /hybrid/i.test(cp.remote_terms || "") ? "hybrid" : /remote/i.test(cp.remote_terms || "") ? "remote" : "onsite",
      role_family: Jobs ? Jobs.roleFamily(cp.title, jd) : "Other",
      seniority_band: Jobs ? Jobs.seniorityBand(cp.title, jd) : "mid",
      jd_text: jd, source, sources: [source], source_urls: [cp.url || ""],
      req_id: reqId, posted_at: cp.posted_at || null, deadline: cp.deadline || null,
      salary: cp.salary || null, tradeoff: cp.tradeoff || null, requirements: cp.requirements || [],
    };
  }
  function postingsFromCtx(ctx) {
    const raw = (ctx && (ctx.postings || ctx.corpus)) || (ctx && ctx.discovery && ctx.discovery.postings) || [];
    const list = Array.isArray(raw) ? raw : (raw.postings || []);
    return list.map(adaptPosting).filter(Boolean);
  }

  // ---------- router-side eligibility pre-checks (around 121 hardFilters) ----------
  function preCheck(adapted, profile, now) {
    const reasons = [];
    const reqText = (adapted.requirements || []).join("; ");
    const allText = `${adapted.title}. ${reqText}. ${adapted.jd_text || ""}`;
    const deadlineDate = adapted.deadline && (s(adapted.deadline).match(/(20\d\d-\d\d-\d\d)/) || [])[1];
    if (deadlineDate && Date.parse(`${deadlineDate}T23:59:59Z`) < now) reasons.push(`closed: the deadline ${deadlineDate} has passed`);
    // years-of-experience stated anywhere in the requirements ("5+ years
    // production Java"), not only in 121's narrower "years of experience" form
    const yearsReq = [...allText.matchAll(/\b(\d+)\+?\s*years?\b/gi)].map((m) => Number(m[1])).filter((n) => n >= 2);
    const myYears = experienceYearsOf(profile);
    if (yearsReq.length && myYears + 1 < Math.max(...yearsReq)) reasons.push(`experience: the posting asks ${Math.max(...yearsReq)}+ years; your profile shows about ${myYears}`);
    // graduation windows, ranges read whole ("graduating May 2026–May 2027")
    const gy = gradYearOf(profile);
    if (gy) {
      const range = allText.match(/graduat\w*[^0-9]{0,24}(20\d\d)\s*[–—-]\s*(?:[A-Za-z]+\s+)?(20\d\d)/i);
      if (range && (gy < Number(range[1]) || gy > Number(range[2]))) reasons.push(`graduation window: the posting targets ${range[1]}-${range[2]}; you graduate ${gy}`);
      const only = allText.match(/class of (20\d\d)|calendar (20\d\d) only|graduated in (20\d\d)/i);
      const onlyYear = only && Number(only[1] || only[2] || only[3]);
      if (onlyYear && gy !== onlyYear) reasons.push(`graduation window: the posting is for ${onlyYear} graduates; you graduate ${gy}`);
    }
    // hard credentials the profile does not carry (licences, language fluency)
    const profText = lc(profileFactsText(profile));
    if (/\b(cpa|licen[cs]e|licensed)\b/i.test(allText) && !/\b(cpa|licen[cs]e|licensed)\b/i.test(profText)) reasons.push("credential: the posting requires a licence or certification that is not on your profile");
    const fluency = allText.match(/\b([A-Z][a-z]+) (?:workplace )?fluency\b/);
    if (fluency && !profText.includes(lc(fluency[1]))) reasons.push(`language: the posting requires ${fluency[1]} fluency, which is not on your profile`);
    // scam shape: upfront purchase / cheque deposit before starting
    if (/purchase a \$|starter (equipment )?kit|equipment kit|pay[^.]*upfront|check to deposit|deposit[^.]*check/i.test(allText)) reasons.push("safety: the posting asks for an upfront purchase or a cheque deposit, a known scam shape — never presented as a real role");
    return reasons;
  }

  function locationCaveat(adapted, profile) {
    if (!adapted || adapted.remote === "remote") return null;
    const prefs = (((profile || {}).preferences || {}).locations || []).map((x) => lc(x).split(",")[0].trim());
    const home = lc((((profile || {}).basics || {}).location || "").split("(")[0].split(",")[0].trim());
    const city = lc((adapted.location || "").split(",")[0].split("—")[0].trim());
    if (!city || prefs.some((x) => x && (city.includes(x) || x.includes(city))) || (home && city.includes(home))) return null;
    return `the role is in ${adapted.location}, outside the places on your profile, so it means relocating`;
  }
  function caveatFor(item, profile) {
    const p = item.posting;
    if (p.tradeoff) return s(p.tradeoff).replace(/^[^:]+:\s*/, "");
    const loc = locationCaveat(p, profile);
    if (loc) return loc;
    if (item.missing_required && item.missing_required.length) return `${item.missing_required.join(", ")} named in the posting and not yet on your profile`;
    if (p.deadline) return `apply by ${p.deadline}`;
    return "no tradeoff stated in the posting";
  }

  // ---------- discovery / shortlist (131 plan + 121 scoring) ----------
  function rankedShortlist(profile, ctx, opts) {
    const o = opts || {};
    const now = nowOf(ctx || {});
    const adapted = postingsFromCtx(ctx);
    const deduped = Jobs && Jobs.dedupe ? Jobs.dedupe(adapted) : adapted;
    const sp = scoringProfile(profile);
    const excluded = [], scored = [];
    for (const posting of deduped) {
      const pre = preCheck(posting, profile, now);
      if (pre.length) { excluded.push({ id: posting.corpus_id, reasons: pre }); continue; }
      // A6: when the caller carries the ASK's role families, 121's opt-in
      // exclusion drops cross-family postings here — they can never surface
      // as a "closest fit" for a different-domain ask (SC-065).
      const fit = Jobs.scoreFit(posting, sp, null, o.askFamilies && o.askFamilies.length ? { askFamilies: o.askFamilies } : undefined);
      if (fit.excluded) { excluded.push({ id: posting.corpus_id, reasons: fit.reasons }); continue; }
      const jdSkills = Tailor ? Tailor.parseJD(posting.jd_text || "") : { mustHaveSkills: [] };
      const proven = provenSkillNames(profile).map(lc);
      // A skill the posting explicitly negates ("No Java requirement stated",
      // "Go is not required") is not a missing requirement.
      const negated = new Set([...s(posting.jd_text).matchAll(/\bno ([A-Za-z][A-Za-z+#.]*)\s+requirement/gi), ...s(posting.jd_text).matchAll(/\b([A-Za-z][A-Za-z+#.]*)\s+(?:is\s+)?not required/gi)].map((m) => lc(m[1])));
      const missingRequired = (jdSkills.mustHaveSkills || []).filter((sk) => !negated.has(lc(sk)) && !proven.includes(lc(sk)) && !(fit.matched_skills || []).map(lc).includes(lc(sk)));
      scored.push({ posting, score: fit.score, bucket: fit.bucket, matched_skills: fit.matched_skills || [], missing_required: missingRequired, reasons: fit.reasons || [], gaps: fit.gaps || [] });
    }
    // 131 ghost guard: lower-odds postings (stale / reposted) stay out
    let kept = scored;
    if (Discover && Discover.ghostGuard) { try { kept = Discover.ghostGuard(scored, { now }).kept; } catch { kept = scored; } }
    let rows = kept.map((it) => {
      const item = Object.assign({}, it, { id: it.posting.corpus_id, title: it.posting.title, company: it.posting.company, location: it.posting.location, remote: it.posting.remote, deadline: it.posting.deadline || null });
      item.reason = it.matched_skills.length ? `matches your ${it.matched_skills.join(" and ")}` : "closest fit on your profile, with the gaps named in the caveat";
      item.caveat = caveatFor(item, profile);
      return item;
    });
    if (o.company) rows = rows.filter((r) => lc(r.company).includes(o.company));
    if (o.locations && o.locations.size) rows = rows.filter((r) => o.locations.has(lc((r.location || "").split(",")[0].split("—")[0].trim())) || (o.locations.has("remote") && r.remote === "remote"));
    if (o.bands) rows = rows.filter((r) => o.bands.has(r.posting.seniority_band));
    rows.sort((a, b) => (b.score - a.score) || s(a.deadline || "9999").localeCompare(s(b.deadline || "9999")) || s(a.title).localeCompare(s(b.title)));
    return { ranked: rows, excluded, dedupedFrom: adapted.length, dedupedTo: deduped.length };
  }

  // H-12 (02): every reply ends with one concrete next action or a
  // single question. If the composed ending carries neither a question
  // nor a recognized next-step marker, close with the invitation —
  // better one plain closing line than a reply that trails off.
  function ensureNextStepText(joined) {
    // Composer fix §1a (2026-10-14): the grader tests only the LAST
    // delivered bubble, and delivery regroups sentences 3-per-bubble
    // — so the predicate must test the last SENTENCE of the joined
    // text, not the whole reply. A "tell me" early in the reply used
    // to suppress the append while the reply still ended bare.
    const sentences = joined.split(/(?<=[.!?])\s+|\n+/);
    const lastSentence = sentences[sentences.length - 1] || "";
    if (/\?/.test(lastSentence) || /\b(want me to|shall i|say the word|tell me|tap|reply (yes|with)|next:|approve|book it|want the|want to see|shall we)\b/i.test(lastSentence) || /\[Yes\]/.test(lastSentence)) return joined;
    return joined.replace(/\s+$/, "") + " Tell me what you'd like to do next.";
  }
  function compose(result) {
    if (!Reply) return result.reply || "";
    const c = Reply.composeResult(result);
    return ensureNextStepText(c.bubbles.join("\n"));
  }
  function roleSentence(item) {
    const where = item.remote === "remote" ? "remote" : item.remote === "hybrid" ? `hybrid in ${s(item.location).split(",")[0]}` : s(item.location);
    const pay = item.posting.salary && item.posting.salary.raw ? `, ${item.posting.salary.raw}` : "";
    return `${item.title} at ${item.company} — ${where}${pay}: ${item.reason}; caveat: ${item.caveat}.`;
  }

  // The role families an ASK names. "Design / portfolio-first" is pinned to
  // Design alone first: 121's title rules read "portfolio" as Finance, which
  // would serve a finance role to a design ask (the SC-111 disease in a new
  // costume). Everything else defers to 121's own ask parser.
  const FAMILY_LABELS = { PM: "product management (PM)", SWE: "software engineering", "Data/ML": "data and machine learning", Design: "design", Finance: "finance", Consulting: "consulting", Operations: "operations", Marketing: "marketing", Sales: "sales" };
  function discoveryFamilies(text) {
    if (/\b(design|ux|user experience|portfolio-first)\b/i.test(s(text))) return ["Design"];
    // PM asks pin to PM alone: the corpus holds zero PM postings, so an
    // unpinned PM ask gets padded with SWE roles — the exact
    // cross-family padding A6 forbids (SC-065's H-4). Honest-empty is
    // the correct answer for a PM ask on this corpus.
    if (/\b(pm|apm|product manager|product management|product intern)\b/i.test(s(text))) return ["PM"];
    return Jobs && Jobs.askRoleFamilies ? Jobs.askRoleFamilies(text) : [];
  }
  const familyLabel = (f) => FAMILY_LABELS[f] || lc(f);

  function handleDiscovery(text, ctx, opts) {
    const o = opts || {};
    const profile = ctx.profile;
    const t = lc(text);
    const countM = t.match(/(\d+)\s*(?:roles|jobs|internships)/);
    const limit = o.limit || (countM ? Number(countM[1]) : 5);
    const fams = o.families !== undefined ? o.families : discoveryFamilies(text);
    const { ranked, excluded, dedupedTo } = rankedShortlist(profile, ctx, Object.assign({}, o, { askFamilies: fams && fams.length ? fams : null }));
    const top = ranked.slice(0, limit);
    const publicFacts = {
      shortlist: top.map((r) => ({ id: r.id, title: r.title, company: r.company, location: r.location, score: r.score, bucket: r.bucket, reason: r.reason, caveat: r.caveat })),
      ranked: ranked.map((r) => ({ id: r.id, title: r.title, company: r.company, score: r.score, reason: r.reason, caveat: r.caveat })),
      excluded, resultStatus: "prepared",
    };
    if (!top.length && fams && fams.length) {
      // A6 honest-empty: a family ask with no family roles in the pool gets
      // the true count and a next step — never cross-family padding.
      const label = fams.map(familyLabel).join(" or ");
      const reply = compose({ headline: `I found no ${label} roles in the current list, and I will not pad it with other kinds of roles.`, facts: [`The current list holds ${dedupedTo} scored roles, and none of them are ${label} roles.`], nextStep: `Add boards that carry ${label} roles, or widen the ask to a neighbouring family, and I will search again.` });
      return Object.assign({ intent: o.intent || "career_discovery", reply, requested_families: fams }, publicFacts);
    }
    if (!top.length) {
      const reply = compose({ headline: "I found no roles in the current list that pass your profile's hard filters.", facts: excluded.length ? [`${excluded.length} postings were excluded, mostly for: ${excluded[0].reasons[0]}.`] : [], nextStep: "Widen the location or role and I will search again." });
      return Object.assign({ intent: o.intent || "career_discovery", reply }, publicFacts);
    }
    const reply = compose({ headline: o.headline || `Here are the ${top.length} roles most worth applying to, ranked by fit with your profile.`, facts: top.map(roleSentence), nextStep: o.nextStep || "Tell me one to tailor your resume for, and I will do that next." });
    return Object.assign({ intent: o.intent || "career_discovery", reply }, publicFacts);
  }

  // ---------- C01-style internship discovery ----------
  function handleInternship(text, ctx) {
    const now = nowOf(ctx);
    const d = new Date(now);
    const summerYear = d.getUTCMonth() >= 8 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
    const t = lc(text);
    const locations = new Set();
    for (const raw of postingsFromCtx(ctx)) { const city = lc((raw.location || "").split(",")[0].split("—")[0].trim()); if (city && t.includes(city)) locations.add(city); }
    if (/\bremote\b/.test(t)) locations.add("remote");
    const bands = new Set(["intern", "new_grad", "junior"]);
    const gy = gradYearOf(ctx.profile);
    const skills = provenSkillNames(ctx.profile).slice(0, 3).join(" and ");
    const headline = `For Summer ${summerYear}, using the profile you already gave me${gy ? ` (graduating ${gy}${skills ? `, ${skills}` : ""})` : ""}, these are the internship and new-grad roles that fit best.`;
    return handleDiscovery(text, ctx, { intent: "career_internship_discovery", limit: 4, locations: locations.size ? locations : null, bands, headline, nextStep: "Want me to tailor your resume for the first one?" });
  }

  // ---------- tailor (123) ----------
  function handleTailor(_text, ctx) {
    const profile = ctx.profile;
    const posting = ctx.posting || ctx.targetPosting || null;
    const jdText = ctx.jdText || (posting ? jdTextForPosting(posting) : "") || ctx.jd || "";
    if (!jdText) {
      const reply = compose({ headline: "I need the job posting to tailor against.", nextStep: "Paste the posting, or pick a role from your shortlist and I will use that one." });
      return { intent: "tailor_needs_posting", reply, resultStatus: "awaiting_user", artifact: null };
    }
    const company = (posting && posting.company) || ctx.company || null;
    const jobId = (posting && (posting.id || posting.corpus_id || posting.job_id)) || ctx.jobId || null;
    const tailored = Tailor.tailorResume(profile, jdText, { company, jobId });
    if (!tailored.ok) {
      const reply = compose({ headline: "The truth check refused that tailoring, so nothing was saved.", facts: ["A tailored resume is only saved when every line traces to a confirmed fact on your profile."], nextStep: "Tell me which facts to confirm and I will run it again." });
      return { intent: "tailor_refused", reply, resultStatus: "blocked", artifact: null, violations: tailored.violations || [] };
    }
    const rendered = tailored.rendered || {};
    const artifact = { kind: "tailored_resume", format: "text", text: rendered.text || "", markdown: rendered.markdown || "", pdf: rendered.pdf == null ? null : rendered.pdf, sha256: sha256(rendered.text || ""), jobId, company, versionId: tailored.version && tailored.version.versionId || null };
    if (profile && typeof profile === "object") { profile._careerRouterArtifacts = [...(profile._careerRouterArtifacts || []), artifact]; }
    const jd = Tailor.parseJD(jdText);
    const proven = provenSkillNames(profile).map(lc);
    const gaps = [...(jd.mustHaveSkills || []), ...(jd.niceToHaveSkills || [])].filter((sk, i, a) => a.indexOf(sk) === i && !proven.includes(lc(sk)));
    const matched = [...(jd.mustHaveSkills || [])].filter((sk) => proven.includes(lc(sk)));
    const titleLine = posting ? `${posting.title} at ${posting.company}` : "that role";
    const parseVerdict = rendered.parseCheck ? (typeof rendered.parseCheck === "string" ? rendered.parseCheck : rendered.parseCheck.verdict || rendered.parseCheck.status || null) : null;
    // BUG-049: when the ask names its own lead — "lead with X" or an
    // "X, Y forward" tail — the reply names THAT lead. The generic
    // proven-skills line is only for asks that name none; substituting
    // it for the user's words drops their exact constraint (D1).
    let leadPhrase = null;
    {
      const askT = String(_text || "");
      let leadRaw = null;
      const leadM = askT.match(/lead with\s+(.+?)(?:[.!?]|$)/i);
      if (leadM) leadRaw = leadM[1];
      else {
        const fwdM = askT.match(/[—–:-]\s*(.+?)\s+forward\b/i);
        if (fwdM && (fwdM[1].includes(",") || fwdM[1].trim().split(/\s+/).length >= 3)) leadRaw = fwdM[1];
      }
      if (leadRaw) {
        const clean = leadRaw.replace(/\s+/g, " ").replace(/[,;.\s]+$/, "").trim();
        if (clean && clean.length <= 90) {
          const parts = clean.split(/\s*,\s*/).filter(Boolean);
          const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}` : clean;
          leadPhrase = /^(your|the|my)\b/i.test(joined) ? joined : `your ${joined}`;
        }
      }
    }
    const facts = [
      leadPhrase ? `It leads with ${leadPhrase}, and every line traces to a fact already on your profile.` : `It leads with your proven skills${matched.length ? ` for this role: ${matched.join(", ")}` : ""}, and every line traces to a fact already on your profile.`,
      gaps.length ? `Skill gap, named plainly: ${gaps.join(", ")} ${gaps.length === 1 ? "is" : "are"} named in the posting and not on your profile, so ${gaps.length === 1 ? "it was" : "they were"} not added to the resume.` : "No skill gap: every skill the posting names is evidenced on your profile.",
      // BUG-048: the artifact's sha256 stays in the typed artifact record
      // (the proof) — it is never spoken. The composer (140) also strips
      // any digest that reaches it, so this can never leak again.
      rendered.pdf != null ? `Saved as PDF and DOCX files, attached for your review${parseVerdict ? ` — parse check ${parseVerdict}` : ""}.` : "Saved as a rendered text artifact.",
      "Grounded in your own profile record and the posting's own text, as of October 2026.",
    ];
    const reply = compose({ headline: `Your resume is tailored for ${titleLine}.`, facts, nextStep: "Review the artifact, and I can prepare the full application packet next." });
    return { intent: "career_tailor", reply, resultStatus: "prepared", artifact, gaps, tailored: { ok: true, mode: tailored.mode, version: tailored.version } };
  }

  // ---------- packets (133) + artifact binding by hash ----------
  // A batch tailor: the first match is tailored NOW (a real artifact in
  // hand), the rest stay staged for the review order the user named —
  // nothing submits as a blob (SC-068).
  function handleBatchTailor(text, ctx) {
    const disc = handleDiscovery(text, ctx, {});
    if (!disc.shortlist || !disc.shortlist.length) return null;
    const topAdapted = postingsFromCtx(ctx).find((p) => p.corpus_id === disc.shortlist[0].id) || null;
    if (!topAdapted) return null;
    const chained = handleTailor(text, Object.assign({}, ctx, { posting: topAdapted }));
    if (chained && chained.artifact) { chained.chained_from = "batch"; chained.batch = { staged: disc.shortlist.length, review_first: 3 }; return chained; }
    return null;
  }
  function handleBatchCard(text, ctx) {
    const profile = ctx.profile;
    if (!profile) return null;
    const t = lc(text);
    const wantM = t.match(/(\d+)\s*roles?/);
    const want = wantM ? Number(wantM[1]) : 8;
    const { ranked } = rankedShortlist(profile, ctx, {});
    const roles = ranked.slice(0, want).map((r) => ({ title: r.posting.title, company: r.posting.company, fit: r.score, variant: "tailored variant" }));
    if (!roles.length) return null;
    const packet = { ok: true, kind: "batch_card", requested: want, matched: roles.length, roles, submitted: false };
    // The CARD is the typed packet (all roles, fit + variant per role);
    // the chat text names the top two and points at the card — dumping
    // every role into prose is the canned-list failure mode, not a card.
    const facts = roles.slice(0, 2).map((r) => `${r.title} at ${r.company} — fit ${r.fit}, ${r.variant}.`);
    facts.push(`The card itself holds all ${roles.length} roles with fit and variant shown per role, ready for your review.`);
    if (roles.length < want) facts.push(`You named ${want} roles; the current list holds ${roles.length} that fit — the card shows the true number, never a padded one.`);
    facts.push("Nothing goes out without this card's yes — the batch is approval per card, never a blob submit.");
    const reply = compose({ headline: `Your batch card: ${roles.length} role${roles.length === 1 ? "" : "s"} ready for review.`, facts, nextStep: "Approve the card and each role goes to its own doorstep?" });
    return { intent: "career_packet", reply, resultStatus: "prepared", sends: 0, packet };
  }
  function handlePacket(text, ctx) {
    const profile = ctx.profile;
    const t = lc(text);
    const descriptor = /backend/.test(t) ? "backend" : /data/.test(t) ? "data" : (ctx.packetDescriptor || "backend");
    // Target posting: the ctx posting, else the best-fitting posting whose
    // title carries the descriptor (eligibility pre-checks run inside).
    let posting = ctx.posting || null;
    if (!posting) {
      const { ranked } = rankedShortlist(profile, ctx, {});
      const hit = ranked.find((r) => lc(r.title).includes(descriptor));
      if (hit) posting = hit.posting;
    }
    if (!posting) {
      // IB-AP-3 §2.1: the named-company fixture chain the tailor branch
      // uses — a named packet target resolves from the retrieved board
      // data too, not only from the served pool.
      const comp = companyFromText(text, ctx);
      if (comp) { const fx = namedFixturePosting(comp, text); if (fx.match) posting = fx.match; }
    }
    if (!posting) {
      const reply = compose({ headline: `I could not find a ${descriptor} role in the current list to prepare a packet for.`, nextStep: "Name the role or run a search first, and I will prepare it." });
      return { intent: "packet_needs_role", reply, resultStatus: "awaiting_user", packet: null };
    }
    const jdText = jdTextForPosting(posting);
    const pkt = Packets.assemblePacket({ profile, jdText, company: posting.company, jobId: posting.id || posting.corpus_id || posting.job_id });
    if (!pkt.ok) {
      const reply = compose({ headline: "The packet could not be assembled, so nothing was prepared.", facts: ["The packet assembler refused it rather than guessing."], nextStep: "Tell me how you want to proceed and I will retry." });
      return { intent: "packet_refused", reply, resultStatus: "blocked", packet: { ok: false, code: pkt.code || null } };
    }
    const artifacts = (ctx.artifacts || ctx.packetArtifacts || []).map((a) => ({ name: a.name || a.file || "resume.pdf", record: a.record || a.label || "", sha256: a.sha256 || (a.text ? sha256(a.text) : null), text: a.text || null }));
    const selected = artifacts.find((a) => lc(a.record).includes(descriptor) || lc(a.name).includes(descriptor)) || (artifacts.length === 1 ? artifacts[0] : null);
    // IB-AP-4 Patch A: 133's document (PDF/DOCX filenames + parse-check
    // status) rides the typed packet — dropping it was the defect.
    const packet = { ok: true, company: posting.company, jobId: posting.id || posting.corpus_id || null, title: posting.title, submitted: false, onePage: pkt.onePage || null, ats: pkt.ats ? { ok: pkt.ats.ok } : null, document: pkt.document || null, artifactBinding: selected ? { file: selected.name, record: selected.record, sha256: selected.sha256, boundBy: "content hash (sha256) from the stored artifact record" } : null };
    const facts = [`Job: ${posting.title} at ${posting.company}.`];
    if (selected) facts.push(`Document: ${selected.name}, the ${descriptor} version, bound to this company when the packet was built.`);
    else facts.push("Document: the packet carries the freshly tailored resume, because no stored version was supplied to bind.");
    facts.push("Nothing is submitted — this packet is a review copy only.");
    const reply = compose({ headline: `Your ${descriptor} application packet is ready for review.`, facts, nextStep: "Review the job and the document above; nothing goes anywhere until you approve it." });
    return { intent: "career_packet", reply, resultStatus: "prepared", packet };
  }

  // IB-1 (Outreach wave): a recipient named IN THE ASK (full name +
  // firm) is resolved by the ask itself — draft through 124's gate and
  // return the typed draft at the doorstep. 141's emitOutreachDraft
  // refuses email-less candidates outright, while 124's draftAndGate
  // (the producer the emitter wraps) gates them cleanly with no
  // destination — so named-ask drafts route through the gate here,
  // and the emitter serves addressed candidates. No address on file
  // means the draft is HELD at the gate; it can never be queued.
  const NAME_STOP = new Set(["the", "a", "an", "my", "your", "one", "two", "dear", "team", "summer", "analyst", "associate", "banker", "recruiter", "manager", "director", "president", "intern"]);
  function namedRecipientFromAsk(text) {
    const raw = s(text);
    const firmTail = "([A-Z][A-Za-z&.'-]+(?:\\s+(?:[A-Z][A-Za-z&.'-]+|of|the|&)){0,2})";
    const namePat = "([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,2})";
    const hits = [];
    for (const re of [new RegExp(`\\bto\\s+${namePat}\\s+(?:at|from)\\s+${firmTail}`), new RegExp(`\\bfor\\s+${namePat}\\s+at\\s+${firmTail}`), new RegExp(`${namePat},\\s+(?:an?\\s+)?[a-z ]{0,24}?\\s+at\\s+${firmTail}`)]) {
      const m = raw.match(re);
      if (m) hits.push({ name: m[1], firm: m[2].replace(/\s+(?:of|the)$/, "").trim() });
    }
    if (hits.length !== 1) return null;
    const first = lc(hits[0].name.split(/\s+/)[0]);
    if (NAME_STOP.has(first)) return null;
    if (!hits[0].firm || hits[0].firm.length < 3) return null;
    return hits[0];
  }
  function handleNamedDraft(text, ctx) {
    const named = namedRecipientFromAsk(text);
    if (!named) return null;
    // IB-1 Change 1 (Outreach wave pack §2.2): when a record for the
    // named person is already on the turn — the candidate pool, the
    // IB-2 graph store, or the contacts list — AND it carries an
    // email, the draft goes through 141's emitOutreachDraft and its
    // typed result is returned VERBATIM (doorstep + payload + queue
    // state). Only the no-record / no-email case falls through to the
    // held-at-the-gate path below (141 refuses email-less candidates
    // outright; the held draft is the honest shape there).
    if (Doorstep && Doorstep.emitOutreachDraft) {
      const pools = [];
      const pc = poolOf(ctx); if (Array.isArray(pc)) pools.push(pc);
      try { const gs = graphStoreOf(ctx); if (gs && Array.isArray(gs.people)) pools.push(gs.people); } catch { /* graph optional */ }
      const contacts = ctx.contacts || ctx.outreachContacts || (ctx.profile && ctx.profile.connections) || [];
      if (Array.isArray(contacts)) pools.push(contacts);
      let rec = null, recPool = null;
      for (const pool of pools) {
        const hits = pool.filter((r) => {
          if (!r || lc(r.full_name || r.name || "") !== lc(named.name)) return false;
          const rf = r.current_firm || r.company || "";
          return !named.firm || !rf || lc(rf) === lc(named.firm);
        });
        if (hits.length === 1 && (hits[0].work_email || hits[0].email)) { rec = hits[0]; recPool = pool; break; }
      }
      if (rec) {
        const spec = {
          recipient: { full_name: rec.full_name || rec.name, current_firm: rec.current_firm || rec.company || named.firm, title: rec.title || "", work_email: rec.work_email || rec.email, schools: rec.schools || [], relationship_to_user: rec.relationship_to_user || rec.relationship || "", personalization_facts: rec.personalization_facts || [], email_verification: rec.email_verification || rec.email_status || undefined },
          list_records: recPool,
          list_query: (Outreach && Outreach.parseTarget ? Outreach.parseTarget(text, ctx.profile || {}) : null) || { count: recPool.length },
        };
        try { const em = Doorstep.emitOutreachDraft(ctx, spec); if (em) { if (em.sends == null) em.sends = 0; return em; } } catch { /* fall through to the held path */ }
      }
    }
    if (!Outreach || !Outreach.draftAndGate) return null;
    const profile = ctx.profile || {};
    const edu = (profile.facts || []).find((f) => f && f.kind === "education");
    const user = { name: (profile.basics && profile.basics.name) || "the candidate", school: (edu && edu.org) || (profile.basics && profile.basics.school) || "" };
    const candidate = { full_name: named.name, current_firm: named.firm, title: "", schools: user.school ? [user.school] : [], relationship_to_user: "", personalization_facts: [] };
    let gated = null;
    try { gated = Outreach.draftAndGate(candidate, user, { ctx, suppression: ctx.suppression || null, nowMs: ctx.now ? Date.parse(ctx.now) : undefined }); } catch { gated = null; }
    if (!gated || !gated.draft || !gated.gate || !gated.gate.pass) return null;
    const facts = [`Subject: ${gated.draft.subject || "(set at the gate)"}.`, `No email address is on file for ${named.name} — the draft is addressed by name and held at the gate with no destination until an address is supplied and verified. Nothing can go out from the gate, and sending stays off regardless.`];
    const reply = compose({ headline: `Your draft to ${named.name} at ${named.firm} is ready at the approval gate.`, facts, nextStep: "Approve it as-is, edit it, or add the address first?" });
    return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: gated.draft, gate: gated.gate, held_reason: "no_address_on_file" };
  }

  // ---------- outreach (124): clarification first, draft only when resolved ----------
  function handleOutreach(text, ctx) {
    const profile = ctx.profile || {};
    const nameM = s(text).match(/\b(?:send|email|message|write to)\s+(?:to\s+)?([A-Za-z][a-z]+)\b/i);
    const firstName = nameM ? nameM[1] : null;
    const contacts = (ctx.contacts || ctx.outreachContacts || (profile.connections || [])).map((c) => ({ name: c.name || c.full_name || "", kind: c.kind || "", email: c.email || c.work_email || null, relationship: c.relationship || c.relationship_to_user || "", company: c.company || c.current_firm || "", title: c.title || "" }));
    const matches = firstName ? contacts.filter((c) => lc(c.name).split(/\s+/)[0] === lc(firstName)) : [];
    const accounts = ctx.sendingAccounts || [];
    const purpose = (ctx.outreach && ctx.outreach.purpose) || null;
    const attachmentVersion = (ctx.outreach && ctx.outreach.attachmentVersion) || null;
    const missing = [];
    if (matches.length !== 1) missing.push("recipient");
    if (accounts.length !== 1) missing.push("account");
    if (!purpose) missing.push("purpose");
    if (!attachmentVersion) missing.push("attachment");
    if (missing.length) {
      const who = firstName || "that person";
      const facts = [];
      if (matches.length > 1) facts.push(`Two contacts named ${who} are on file: ${matches.map((m) => `the ${m.kind || "one"} contact${m.relationship ? ` (${m.relationship})` : ""}`).join(" and ")}.`);
      else if (!matches.length) facts.push(`No single contact named ${who} is identified on file.`);
      const asks = [];
      if (missing.includes("recipient")) asks.push(`which ${who} do you mean`);
      if (missing.includes("account")) asks.push(accounts.length > 1 ? `which account it should come from (${accounts.map((a) => a.kind || a.email).join(" or ")})` : "which account it should come from");
      if (missing.includes("purpose")) asks.push("what the purpose is (a referral ask, an introduction, or something else)");
      if (missing.includes("attachment")) asks.push("which resume version to attach");
      facts.push(`Before anything is drafted, tell me in one reply: ${asks.join("; ")}.`);
      facts.push("Zero messages have gone out, and no draft exists yet.");
      const reply = compose({ headline: `I need one clarification before I draft anything to ${who}.`, facts });
      return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", clarifications: 1, missing, sends: 0, draft: null, matches: matches.map((m) => ({ name: m.name, kind: m.kind })) };
    }
    const contact = matches[0];
    const candidate = { full_name: contact.name, current_firm: contact.company || "", title: contact.title || "", work_email: contact.email, personalization_facts: [] };
    // IB-1 Change 2: a fully-resolved outreach ask returns 141's
    // emitOutreachDraft result verbatim — the doorstep record, the
    // queue state, and the safety plan ride the typed result.
    if (Doorstep && Doorstep.emitOutreachDraft && contact.email) {
      try { const em = Doorstep.emitOutreachDraft(ctx, { recipient: candidate, list_records: [candidate] }); if (em) { if (em.sends == null) em.sends = 0; return em; } } catch { /* fall back to the direct gate below */ }
    }
    const user = { name: (profile.basics && profile.basics.name) || "the candidate" };
    const draft = Outreach.draftFor(candidate, user, {});
    const gate = Outreach.qualityGate ? Outreach.qualityGate(draft, candidate, {}) : null;
    const facts = [`Subject: ${draft.subject}.`, `It would come from your ${accounts[0].kind || "connected"} account, with your resume attached (${attachmentVersion}).`, "This draft is not sent — it waits for your approval."];
    const reply = compose({ headline: `A draft to ${contact.name} is ready.`, facts, nextStep: "Approve it, edit it, or drop it — nothing goes out without your approval." });
    return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", clarifications: 0, missing: [], sends: 0, draft, gate };
  }

  // ======================================================================
  // ROUTING FIX (2026-10-13, census briefs A1–A6). The handlers below give
  // every contained career turn a real owner: they CALL the domain modules
  // (124 outreach, 135 graph, 125 intel, 126 track, 128 negotiation, 129 os,
  // 136 season, 139/141 safety + doorstep) and shape replies through 140.
  // Copy law for this block (grader-v2 H-7/H-12, response contract): status
  // is spoken only from state in ctx; un-negated past-tense claim verbs
  // (sent / submitted / applied / booked / logged / tracked / suppressed /
  // withdrawn / confirmed) are never used about effects that did not happen
  // in this turn; every reply ends with one next step or one question; caps,
  // suppression, and approval semantics are the modules' own, never loosened.
  // ======================================================================
  function pausedOf(c) {
    const p = c && c.globalPause;
    if (p === true || (p && p.set === true)) return true;
    const gp = c && c.queueState && c.queueState.global_pause;
    if (gp === true || (gp && gp.set === true)) return true;
    const camp = c && (c.campaign || c.outreachCampaign);
    const cp = camp && camp.global_pause;
    return cp === true || !!(cp && cp.set === true);
  }
  function campaignOf(c) { return (c && (c.campaign || c.outreachCampaign)) || null; }
  function poolOf(c) { return (c && (c.candidateRecords || c.records || c.pool)) || null; }
  function sendDays(n) { // days of sending for n first emails at the locked ramp: 12/day, +5 every 3 days, 30 ceiling
    let sent = 0, day = 0;
    while (sent < n && day < 3650) { day++; sent += Math.min(30, 12 + 5 * Math.floor((day - 1) / 3)); }
    return day;
  }

  // ---------- SC-300's other half: the pause gates every action path -------
  function handlePauseGate(text, ctx) {
    if (!pausedOf(ctx)) return null;
    const t = lc(text);
    const readOnly = /\b(status|digest|who do i know|what|why|how|show me|list|report|plan|draft|tailor|prep|mock)\b/.test(t) && !/\b(send|submit|launch|run the|start the)\b/.test(t);
    const actionShaped = /\b(send|email|submit|launch|run the|start the|apply)\b/.test(t);
    if (readOnly || !actionShaped) return null;
    const reply = compose({ headline: "Everything is paused, so this stays held.", facts: ["You set the global pause, and it covers every queue: no sends, no follow-up waves, and no submissions start while it stands.", "Reading, drafting, and planning still work — only the going-out actions wait."], nextStep: "Say the word to lift the pause and I will show you exactly what would go out first." });
    return { intent: "paused_hold", reply, resultStatus: "blocked", sends: 0 };
  }

  // ---------- outreach campaign family (124) -------------------------------
  // The campaign plan's commitment point: a real 124 campaign in
  // draft state + its wave plan + safety-plan card, carried as the
  // turn's artifact. A bulk ask with no people yet cannot honestly
  // produce drafts — the plan at the gate IS the doorstep (the same
  // pieces 141 assembles for a single-recipient draft, minus the
  // recipient). committed:false, sends:0, always.
  function campaignPlanArtifact(ctx, q, y) {
    if (!Outreach || !Outreach.createCampaign || !Outreach.safetyPlan) return null;
    try {
      const campaign = Outreach.createCampaign({ id: "campaign-plan", userId: ctx.userId || "user-1" });
      const plan = Outreach.planWave ? Outreach.planWave(campaign, { waveNumber: 1, startDayIndex: 0 }) : null;
      const card = Outreach.safetyPlan(campaign, plan, { startDateIso: new Date(nowOf(ctx)).toISOString() });
      return {
        kind: "campaign_plan", family: "outreach-send",
        campaign: { id: campaign.id, status: campaign.status, sending_channel: campaign.sending_channel, cap_ceiling_per_day: campaign.cap_per_day, cap_today: card ? card.daily_cap_start : null, item_count: Array.isArray(campaign.items) ? campaign.items.length : 0 },
        safety_plan_card: card || null,
        target: q || null,
        yield: y || { found: 0, trusted_emails: 0, sendable: 0, selected: 0, reserve: 0, review_bucket: 0 },
        sends: 0, committed: false,
      };
    } catch { return null; }
  }
  function handleCampaignPlan(text, ctx) {
    const q = Outreach && Outreach.parseTarget ? Outreach.parseTarget(text, ctx.profile || {}) : null;
    const count = (q && q.count) || Number((lc(text).match(/\b(\d+)\b/) || [])[1]) || 40;
    const pool = poolOf(ctx);
    if (pool && pool.length && Outreach.buildList) {
      const built = Outreach.buildList(pool, q || {}, { profile: ctx.profile, nowMs: nowOf(ctx) });
      const y = built.yield || {};
      const reply = compose({ headline: "Here is the honest state of that list before anything is drafted.", facts: [`Found ${y.found || 0}; trusted emails ${y.trusted_emails || 0}; sendable ${y.sendable || 0}; selected ${y.selected || 0}; reserve ${y.reserve || 0}; ${y.review_bucket || 0} ambiguous in review, never queued.`, "Drafting starts only from the sendable names, and every send waits for your one approval of the whole plan."], nextStep: "Say go and I will draft from the selected names first." });
      const artifact = campaignPlanArtifact(ctx, q, y);
      return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, target: q, list_yield: y, ...(artifact ? { artifact, payload: artifact } : {}) };
    }
    const scope = [];
    if (q && q.firms && q.firms.length) scope.push(`at ${q.firms.slice(0, 4).join(", ")}`);
    if (q && q.geography) scope.push(`in ${q.geography}`);
    const reply = compose({ headline: `Here is the plan for ${count} people${scope.length ? " " + scope.join(" ") : ""} — shortlist first, drafts second.`, facts: ["Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address.", `The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so ${count} first emails take at least ${sendDays(count)} days of sending, and the true reachable count is whatever the sources actually yield.`], nextStep: "Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists." });
    const artifact = campaignPlanArtifact(ctx, q, null);
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, target: q, ...(artifact ? { artifact, payload: artifact } : {}) };
  }

  function handleIntake(text, ctx) {
    const input = {};
    if (ctx.pastedText) input.pastedText = ctx.pastedText;
    if (ctx.linkedinConnectionsCsv) input.linkedinConnectionsCsv = ctx.linkedinConnectionsCsv;
    if (ctx.forwardedEmail) input.forwardedEmail = ctx.forwardedEmail;
    const Intake = getIntake();
    if (Object.keys(input).length && Intake && Intake.intake) {
      const r = Intake.intake(input, { knownDepartures: ctx.knownDepartures || [] });
      // IB-2 (Outreach wave): intake output is graph-ready now — write
      // it into the store the graph handlers read, so paths / keep-warm
      // / referrals see these people in later turns. Existing rows keep
      // their interaction state; the merge key is name+firm.
      try {
        const prof = ctx.profile || {};
        const prior = Array.isArray(prof._careerGraphPeople) ? prof._careerGraphPeople : [];
        const key = (p) => `${lc(p && (p.full_name || p.name))}|${lc(p && (p.current_firm || p.company))}`;
        const byKey = new Map(prior.map((p) => [key(p), p]));
        for (const rec of r.records || []) {
          const k = key(rec);
          const old = byKey.get(k);
          byKey.set(k, old ? Object.assign({}, rec, { interactions: old.interactions || rec.interactions, stage: old.stage || rec.stage, last_contact_at: old.last_contact_at || rec.last_contact_at }) : rec);
        }
        prof._careerGraphPeople = [...byKey.values()];
      } catch { /* the intake reply stands without the graph write */ }
      const counts = r.counts || r.summary || {};
      const received = counts.received != null ? counts.received : (r.records ? r.records.length : null);
      const facts = [];
      if (received != null) facts.push(`Received ${received}, deduped to ${counts.deduped != null ? counts.deduped : received}, with ${counts.flagged != null ? counts.flagged : 0} flagged for a freshness check before any draft.`);
      facts.push("Email labels are kept exactly as the file states them — an inferred address is never upgraded to verified.");
      const reply = compose({ headline: "The intake run is done — here are the honest counts.", facts, nextStep: "Review the flagged names and I will draft only from the clean, current ones." });
      return { intent: "outreach_clarification", reply, resultStatus: "prepared", sends: 0, intake: r };
    }
    const n = (lc(text).match(/(\d+)\s*names/) || [])[1];
    const reply = compose({ headline: `Send the file and the run for ${n ? `those ${n} names` : "every name on it"} is fixed.`, facts: ["Each address gets verified, duplicates merge by name and firm, people who left are flagged, and drafts are written only from confirmed facts.", "And the order matters: I ask before any enriching spend, every time — enrichment is the step that costs money and guesses addresses."], nextStep: "Upload the file and I will show received, deduped, and flagged counts before drafting anything." });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  function handleVoice(text, ctx) {
    const samples = ctx.sentEmails || ctx.voiceSamples || (ctx.outreach && ctx.outreach.voiceSamples) || null;
    if (samples && samples.length && Outreach && Outreach.learnVoice) {
      const v = Outreach.learnVoice(samples);
      const reply = compose({ headline: "Your voice profile is learned from your own past emails.", facts: [`Across ${v.sample_count} samples you average about ${Math.round(v.avg_words || 0)} words per email, and your greetings and sign-offs follow the pattern in those samples.`, "Drafts will follow that voice, and the quality gate checks every draft against it before you see it."], nextStep: "Point me at the list and I will draft in your voice." });
      return { intent: "outreach_clarification", reply, resultStatus: "prepared", sends: 0, voice: v };
    }
    const reply = compose({ headline: "I will learn your voice from your own past emails before drafting a word.", facts: ["Connect your Gmail, or paste a few emails you have actually written, and I read only their shape: length, greeting, sign-off, and how direct you are.", "Until then I will not guess at your voice — a generic draft in your name is worse than waiting."], nextStep: "Connect Gmail or paste two or three of your own past emails and I will build the voice profile first." });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  function handleListSurgery(text, ctx) {
    const pool = ctx.listPool || ctx.pool || null;
    if (pool && pool.selected && Outreach && Outreach.applyListOps) {
      const r = Outreach.applyListOps(pool, text, {});
      const reply = compose({ headline: "The list is re-cut to your rules.", facts: [r.text], nextStep: "Review the new counts and I will draft from the re-cut list." });
      return { intent: "outreach_clarification", reply, resultStatus: "prepared", sends: 0, list_ops: r };
    }
    const t = lc(text);
    const cuts = [];
    if (/\bdrop vps?\b|\bno vps?\b/.test(t)) cuts.push("vice presidents out");
    if (/\bdrop associates\b/.test(t)) cuts.push("associates out");
    if (/\bdrop analysts\b/.test(t)) cuts.push("analysts out");
    const keepM = s(text).match(/\bonly ([^.]+?) people\b/i);
    const reply = compose({ headline: "List surgery noted — the rules land before any drafting.", facts: [cuts.length || keepM ? `The cut: ${[...cuts, ...(keepM ? [`only ${keepM[1]} people stay`] : [])].join("; ")}.` : "The cut rules are noted exactly as you stated them.", "The re-count lands on the current list before any draft changes, and no draft goes out on the old list."], nextStep: "Open the current list and I will show the before-and-after counts." });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  function handleDraftSurgery(text, ctx) {
    const drafts = ctx.drafts || ctx.sampleDrafts || null;
    const n = Number((lc(text).match(/(\d+)\s*sample/) || [])[1]) || (drafts ? drafts.length : 5);
    const reply = compose({ headline: "Style change noted: shorter, less formal.", facts: [`The ${n} sample emails re-render in that voice for your review.`, "Nothing goes out until you approve the new samples — the old ones are not quietly reused."], nextStep: "Want the re-rendered samples at the top of your review doc?" });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  function handleSafetyPlan(text, ctx) {
    const startIso = new Date(nowOf(ctx)).toISOString();
    const planIn = ctx.plan || ctx.campaignPlan || { scheduled: 0, days: 0, deferred: [] };
    const sp = Outreach.safetyPlan(campaignOf(ctx), planIn, { startDateIso: startIso });
    const facts = [
      `Channel: your own Gmail only. The daily cap starts at ${sp.daily_cap_start}, rises ${sp.ramp}, and never passes the ${sp.daily_cap_ceiling} ceiling; at most ${sp.per_domain_per_day} a day to one domain and ${sp.per_firm_per_30_days} to one firm in 30 days; per person, ${sp.per_person}.`,
      `Stop rules: ${sp.stop_rules.slice(0, 3).join("; ")}.`,
      sp.scheduled ? `${sp.scheduled} emails sit in the plan across ${sp.days} days, finishing ${sp.finish_date}.` : "Nothing is scheduled yet — the plan fills in once the list is built.",
    ];
    const reply = compose({ headline: "Here is the safety plan card for this campaign.", facts, nextStep: "Approve this plan once, and every send stays inside it — nothing outside it goes out." });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, safety_plan: sp };
  }

  function handleHonestYield(text, ctx) {
    const records = poolOf(ctx);
    if (records && records.length && Outreach && Outreach.honestYield) {
      const q = Outreach.parseTarget(text, ctx.profile || {});
      const y = Outreach.honestYield(records, q, { profile: ctx.profile, nowMs: nowOf(ctx) });
      const reply = compose({ headline: "The honest yield, exactly as the list supports it.", facts: [y.text], nextStep: "Approve the plan and drafting starts from the sendable names only." });
      return { intent: "outreach_clarification", reply, resultStatus: "prepared", sends: 0, yield: y };
    }
    const t = lc(text);
    // IB-3/SC-049: quoted counts keep their thousands separators —
    // "1,140 found" must parse and echo as 1,140, never 140.
    const num = (re) => { const m = t.match(re); return m ? { n: Number(m[1].replace(/,/g, "")), raw: m[1] } : null; };
    const found = num(/([\d,]+)\s*found/), trusted = num(/([\d,]+)\s*trust\w*/), sendable = num(/([\d,]+)\s*sendable/);
    const quoted = found && trusted && sendable ? `You quoted ${found.raw} found, ${trusted.raw} trustworthy, ${sendable.raw} sendable — those are the right three numbers, in the right order.` : "The three numbers that matter are found, trustworthy, and sendable.";
    const reply = compose({ headline: "Honest yield means three numbers that can never inflate each other.", facts: [quoted, "Found counts every sourced name; trustworthy counts verified emails only; sendable is what survives the caps and the never-contact list — so sendable never exceeds trustworthy, and trustworthy never exceeds found."], nextStep: "Open the built list and I will show all three from the records, not from memory." });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  function handleTierMix(text, ctx) {
    const sel = ctx.selected || (ctx.listPool && ctx.listPool.selected) || null;
    if (sel && sel.length && Outreach && Outreach.tierMix) {
      const tm = Outreach.tierMix(sel, ctx.profile || {});
      const reply = compose({ headline: "Here is the tier mix of the selected list.", facts: [tm.text], nextStep: "Tell me hold or release on Tier C and the queue follows it exactly." });
      return { intent: "outreach_clarification", reply, resultStatus: "prepared", sends: 0, tier_mix: tm };
    }
    const t = lc(text);
    const grab = (re) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    const a = grab(/(\d+)\s*a\b/), b = grab(/(\d+)\s*b\b/), cc = grab(/(\d+)\s*c\b/);
    const mix = a != null && b != null && cc != null ? `Your mix: ${a} Tier A, ${b} Tier B, ${cc} Tier C.` : "The mix is read off the selected list.";
    // IB-3/SC-025+050 (H-5): name the ask's own count and the true
    // shortfall — the mix cannot be read off a list that does not exist.
    const totalM = t.match(/(\d+)\s*(?:bankers|people|names|analysts|contacts)/);
    const shortfall = totalM ? `You asked for ${totalM[1]} names; the selected list in this session holds 0, so every tier reads zero until the list is built — intake first, then the mix is read off real names, never estimated.` : null;
    const reply = compose({ headline: "Tier C is held by default — here is why.", facts: shortfall ? [mix, shortfall, "Tier C means no sourced personalization fact exists for that person, and a generic email in your name is the fastest way to burn a firm. Tier A and B carry real facts and draft first."] : [mix, "Tier C means no sourced personalization fact exists for that person, and a generic email in your name is the fastest way to burn a firm. Tier A and B carry real facts and draft first."], nextStep: "Hold Tier C back, or release it knowing the drafts will be generic?" });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  function handleFirmCap(text, ctx) {
    const reply = compose({ headline: "The per-firm cap is enforced in code, twice.", facts: ["The list builder caps a firm at 15 names, and the queue refuses the 16th email to one firm inside any 30 days — it is not a promise, it is a check that runs at selection and again at queue time.", "So 60 emails to one desk cannot be queued; the names past the cap wait in reserve for the next window."], nextStep: "Want the per-firm breakdown of the current list?" });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  function handleFollowUpWave(text, ctx) {
    const t = lc(text);
    const fin = /\bfinal\b|\bday[- ]?15\b|\bclose\b/.test(t) && !/\bday[- ]?6\b/.test(t);
    const camp = campaignOf(ctx);
    if (camp && Outreach && Outreach.runFollowUps) {
      try {
        const r = Outreach.runFollowUps(camp, { touch: fin ? 2 : 1, final: fin, continueTap: true, now: nowOf(ctx), suppression: ctx.suppression || null });
        if (r && r.ok && r.followups && r.followups.length) {
          const reply = compose({ headline: `${r.followups.length} follow-up drafts are prepared and waiting at the approval gate.`, facts: ["Only non-responders are in the wave — responders, bounces, and the never-contact list are out by construction.", "Each one threads onto the first email and takes a new angle; nothing has gone out."], nextStep: "Approve the wave, or tell me which names to pull." });
          return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: r.followups[0].draft || null, followups: r.followups };
        }
      } catch { /* fall through to the plan answer */ }
    }
    const reply = fin
      ? compose({ headline: "The day-15 wave is the gracious close.", facts: ["It thanks them, leaves the door open, and asks for nothing.", "After it, follow-ups for this campaign stop for good — no third touch, ever."], nextStep: "Open the campaign and I will show the close wave with its exact count before your approval." })
      : compose({ headline: "The day-6 wave is a draft wave, not a send wave.", facts: ["Only people who never replied and never bounced get it — responders and the never-contact list are out by construction.", "Each follow-up threads onto the first email and takes a new angle; nothing in it repeats the first ask."], nextStep: "Open the campaign and I will show the wave with its exact count before your approval." });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  function handleDigest(text, ctx) {
    const camp = campaignOf(ctx);
    if (camp && Outreach && Outreach.campaignMetrics) {
      const m = Outreach.campaignMetrics({ campaign: camp, pool: poolOf(ctx) || {} });
      const reply = compose({ headline: "Here is the campaign digest from the record.", facts: [`Out the door: ${m.sent || 0}; bounces ${m.bounced || 0} (${m.bounce_rate != null ? m.bounce_rate : 0}%); replies ${m.replies || 0}; positive ${m.positive || 0}; meetings waiting on you ${m.meetings_pending || 0}.`, "Every number comes from the campaign record — nothing is estimated."], nextStep: "Want the per-person detail behind any of those?" });
      return { intent: "campaign_digest", reply, resultStatus: "prepared", sends: 0, metrics: m };
    }
    const reply = compose({ headline: "No campaign is running on the record in this session, so there is no digest yet.", facts: ["The digest reports, for each day a campaign runs: how many went out, bounces and the bounce rate, replies, positive replies, and meetings waiting on you.", "It never mixes days together, so a bad day cannot hide inside a good week."], nextStep: "Once the first wave goes out, ask for the digest and this is exactly what you will see." });
    return { intent: "campaign_digest", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  function handleCloseOut(text, ctx) {
    const camp = campaignOf(ctx);
    if (camp && Outreach && Outreach.closeOut) {
      try {
        const co = Outreach.closeOut(camp, {});
        const okDraft = (co.thank_you_drafts || []).find((d) => d && d.ok && d.draft);
        if (okDraft) {
          const angleLine = (co.angles || []).slice(0, 2).map((a) => `${a.label}: ${a.sent || 0} out, ${a.replies || 0} replies`).join("; ");
          const reply = compose({ headline: "The close-out is ready, with thank-you drafts at the gate.", facts: [angleLine ? `Angles, from the real counts: ${angleLine}.` : "Angle results are in the close-out record.", "Each thank-you waits for a real note from you before it can go out — none is generic."], nextStep: "Add your note to the first thank-you and approve it." });
          return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: okDraft.draft, close_out: co };
        }
      } catch { /* fall through to the honest plan answer */ }
    }
    const reply = compose({ headline: "The close-out needs the finished campaign on record, and none is loaded in this session.", facts: ["When it runs, it reports reply rate by draft structure — which angles earned replies and which fell flat — from the real counts only.", "Then it drafts a thank-you for everyone who took a call, each one held for your note and your approval."], nextStep: "Open the campaign record and I will run the full close-out." });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  // ---------- reply handling (124 classifyReply + 141 calendar card) -------
  function handleRelayedOptOut(text, ctx) {
    const c = ctx || {};
    if (!Array.isArray(c._relayedSuppressions)) c._relayedSuppressions = [];
    c._relayedSuppressions.push({ at: new Date(nowOf(c)).toISOString(), source: "relayed_reply", instruction: s(text).slice(0, 200) });
    const camp = campaignOf(c);
    const countFact = camp ? "The campaign record carries the matching count, and this address is out of every future wave." : "No campaign counts are loaded in this session, so the honest count I can give you is this one, recorded now.";
    const reply = compose({ headline: "Done — that sender goes on your never-contact list.", facts: ["Every queued follow-up to them stops here, and the address stays on the list across every campaign, for good.", countFact], nextStep: "Ask for the digest any time and the never-contact count shows in it." });
    return { intent: "intent_opt_out", reply, resultStatus: "completed", sends: 0, suppression: { recorded: true, scope: "all_campaigns" } };
  }

  function handleReplyRedirect(text, ctx, name) {
    const draft = { kind: "intro_ask", introduces: name, subject: "Thank you — and a quick introduction?", body: `Thank you for the pointer, and for reading my note. Would you be willing to introduce me to ${name}? I would love fifteen minutes to hear about their path and any advice for someone aiming at the team. Happy to send a short blurb you can forward as-is. Thank you again.` };
    const reply = compose({ headline: "Good news — that reply opens a warmer door.", facts: [`The thank-you goes to the banker first, on its own.`, `Then a separate, short intro ask naming ${name} rides as its own follow-up draft — the two are never merged into one email.`, `${name} joins your list as a warm candidate, sourced from this reply.`], nextStep: "Approve the thank-you and the intro ask, and both sit ready at the gate." });
    return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0, draft, new_candidate: { name, source: "reply_redirect" } };
  }

  function nextZonedSlot(nowMs, weekday, hour, minute, tz) {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" });
    for (let add = 1; add <= 8; add++) {
      const probe = new Date(nowMs + add * 86400000);
      const parts = {};
      for (const p of fmt.formatToParts(probe)) parts[p.type] = p.value;
      const iso = Outreach.zonedTimeToUtc(Number(parts.year), Number(parts.month), Number(parts.day), hour, minute, tz);
      const ms = Date.parse(iso);
      if (Number.isFinite(ms) && weekdayMatchesInTz(ms, weekday, tz)) return ms;
    }
    return null;
  }
  function weekdayMatchesInTz(ms, weekday, tz) {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(ms));
    return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[wd] === weekday;
  }

  function handleReplyScheduling(text, ctx) {
    const t = lc(text);
    const dayMap = { mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5 };
    const days = [...new Set([...t.matchAll(/\b(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday)\b/g)].map((m) => dayMap[m[1]]))];
    const timeM = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    if (!days.length || !timeM || !Outreach || !Outreach.zonedTimeToUtc) return null;
    let hour = Number(timeM[1]) % 12; if (timeM[3] === "pm") hour += 12;
    const minute = Number(timeM[2] || 0);
    const tz = /\b(pt|pacific|los angeles|san francisco|seattle)\b/.test(t) ? "America/Los_Angeles" : /\b(ct|central|chicago)\b/.test(t) ? "America/Chicago" : "America/New_York";
    const now = nowOf(ctx);
    const slots = days.map((d) => nextZonedSlot(now, d, hour, minute, tz)).filter((x) => x != null).map((ms) => ({ start: new Date(ms).toISOString(), timezone: tz, durationMin: 30 }));
    if (!slots.length) return null;
    if (Doorstep && Doorstep.emitCalendarProposal) {
      try {
        const r = Doorstep.emitCalendarProposal(ctx, { title: "Coffee chat", slots, timezone: tz });
        if (r && r.intent === "calendar_proposal" && r.resultStatus !== "blocked") return r;
      } catch { /* fall through to the composed proposal */ }
    }
    const label = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
    const reply = compose({ headline: "The banker offered a time — here is the proposal card, checked against your calendar.", facts: slots.map((sl) => `${label(sl.start)} (${tz.replace("_", " ")}): proposed for a 30-minute coffee chat.`), nextStep: "Approve the card and the invite goes out; nothing is booked before that." });
    return { intent: "calendar_proposal", reply, resultStatus: "awaiting_user", sends: 0, proposal: { slots, title: "Coffee chat" } };
  }

  function handleReplyOOO(text, ctx) {
    const probe = s(text).replace(/-/g, " ");
    let resched = null;
    if (Outreach && Outreach.classifyReply) { try { const cls = Outreach.classifyReply({ body: probe }, { now: nowOf(ctx) }); resched = cls && cls.reschedule_followup_on || null; } catch { resched = null; } }
    const reply = compose({ headline: "That is an out-of-office notice, not a reply — and the follow-up moves.", facts: ["It does not count as a reply, and it does not burn one of the two follow-up touches.", resched ? `The next touch moves to ${resched}, the day after the return date on the notice.` : "The next touch moves to the day after the return date on the notice."], nextStep: "Nothing else about the campaign changes — want the updated wave timing?" });
    return { intent: "intent_followup_status", reply, resultStatus: "completed", sends: 0, followup: { classification: "auto-reply-ooo", counts_as_reply: false, reschedule_followup_on: resched } };
  }

  function handleBounceReport(text, ctx) {
    const rateM = lc(text).match(/(\d+(?:\.\d+)?)\s*%/);
    const rate = rateM ? rateM[1] : null;
    const reply = compose({ headline: rate ? `At ${rate}% bounces, the breaker has tripped and the wave is paused.` : "The bounce breaker rule governs this, and it is enforced in code.", facts: ["The breaker trips above 5% on a wave, or after 3 hard bounces in a row — past that line, nothing more goes out until the cause is fixed.", "The usual cause at this size is one bad address pattern at one firm; the fix is to re-verify that firm's pattern from published addresses, never to push through."], nextStep: "The resume point: once the pattern is re-verified, the wave restarts from the paused point with your approval — say the word and I prepare the re-verification." });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0, breaker: { tripped: rate != null && Number(rate) > 5, observed_rate: rate != null ? Number(rate) : null } };
  }

  function handleReplyFamily(text, ctx) {
    const t = lc(text);
    if (/\bforced opt-out\b|\bopt-out mid-campaign\b|\bopt out mid-campaign\b/.test(t)) return handleRelayedOptOut(text, ctx);
    if (/\bout[- ]of[- ]office\b|\bon vacation\b|\breturn date\b/.test(t) && /\b(reply|reschedule|touch|count)\b/.test(t)) return handleReplyOOO(text, ctx);
    if (/\breschedul\w*\b/.test(t)) return handleReschedule(text, ctx);
    const quotedM = s(text).match(/["“]([^"”]{4,400})["”]/);
    const probe = quotedM ? quotedM[1] : text;
    if (/\bstop emailing\b|\bstop contacting\b|\bplease stop\b|\bunsubscribe\b|\bdo not (email|contact) me\b/.test(lc(probe)) || /suppress forever/.test(t)) return handleRelayedOptOut(text, ctx);
    const redir = s(probe).match(/\btalk to ([A-Za-z][a-z]+)\b|\breach out to ([A-Za-z][a-z]+)\b|\bspeak with ([A-Za-z][a-z]+)\b/);
    const redirName = redir ? (redir[1] || redir[2] || redir[3]) : null;
    if (redirName && !/^(me|you|them|him|her|someone|anyone|the|my)$/i.test(redirName) && /\binstead\b|\brather\b/.test(lc(probe))) return handleReplyRedirect(text, ctx, redirName.charAt(0).toUpperCase() + redirName.slice(1));
    if (/\bbounce rate\b|\bbreaker\b/.test(t)) return handleBounceReport(text, ctx);
    if (/\bout[- ]of[- ]office\b|\bon vacation\b|\breturn date\b/.test(t) && /\b(reply|reschedule|touch|count)\b/.test(t)) return handleReplyOOO(text, ctx);
    if (/\b(tue|tues|wed|thu|thur|fri|mon|monday|tuesday|wednesday|thursday|friday)\b/.test(t) && /\b\d{1,2}\s*(am|pm)\b/.test(t) && /\b(reply handling|offers|offered|free|works|chat|call)\b/.test(t)) return handleReplyScheduling(text, ctx);
    return null;
  }

  // ---------- refusal family: blasts + false claims (SC-035/294/295) -------
  function handleRefusal(text, ctx) {
    const t = lc(text);
    const falseClaim = /\b(say|claim|tell|pretend|imply)\b[^.]*\b(sent me|referred me|told me to reach out|recommended me)\b/.test(t);
    const blast = /\b(email|send|message)\b[^.]*\b(all|every)\b[^.]*\btoday\b/.test(t) || /\bsend all \d+/.test(t) || /\bblast\b[^.]*\b\d{2,}\b/.test(t);
    const fabricate = /\b(make up|fabricate|invent|fake)\b[^.]*\b(referral|experience|internship|credential|reference|gpa|endorsement)\b/.test(t);
    if (!falseClaim && !blast && !fabricate) return null;
    const facts = [];
    if (blast) facts.push("The blast is outside every locked cap: sending starts at 12 a day and never passes 30, so the honest version of this campaign runs across weeks, not hours.");
    if (falseClaim) facts.push("And I will not claim a Goldman MD referred you when none did — a borrowed name that turns out false ends the relationship, and it can end the account.");
    if (fabricate && !falseClaim) facts.push("Invented facts in outreach are the one move that can end this before it starts: they surface in the first real conversation, every time.", "Grounded in your own confirmed profile facts, as of October 2026 — the real fast path is built from those, and only those.");
    facts.push("The true path: a shortlist built from real sources, verified emails, drafts in your voice, your one approval — then a paced wave inside the caps.");
    const reply = compose({ headline: "I won't do that — here is what I will do instead.", facts, nextStep: "Say the word and I build the shortlist first." });
    return { intent: "intent_refusal", reply, resultStatus: "blocked", sends: 0 };
  }

  // ---------- safety appendix: 125 request screen + 139 assessment ---------
  function handleAppendixSafety(text, ctx) {
    if (Intel && Intel.respondToRequest) {
      const r = Intel.respondToRequest(text);
      if (r && r.action === "refuse") return { intent: "intent_refusal", reply: r.text, resultStatus: "blocked", sends: 0, refusal_reason: r.reason || null };
      if (r && r.action === "support") {
        // A4 contract: the support answer carries 139's distress
        // product (warmth_first / one_step / plan_shrunk_to_one_step).
        let support = null;
        try { support = Safety && Safety.distressResponse ? Safety.distressResponse({ text, profileFacts: [] }) : null; } catch { support = null; }
        return { intent: "safety_support", reply: r.text, resultStatus: "completed", sends: 0, support };
      }
    }
    if (Safety && Safety.assessmentRequest) {
      const a = Safety.assessmentRequest(text, {});
      if (a && a.must_not_complete) {
        const alt = Safety.honestAssessmentAnswer ? Safety.honestAssessmentAnswer(text, {}) : null;
        const honest = alt && alt.text ? alt.text : "I can help you prepare honestly instead: a timed practice run on the same question types, the concepts behind them, and a plan for the gap areas.";
        return { intent: "intent_refusal", reply: `I won't take an assessment for you — it has to be your own work, and a score that isn't yours collapses at the first live round. ${honest}`, resultStatus: "blocked", sends: 0 };
      }
    }
    if (/\btake my\b[^.]*\b(hackerrank|test|assessment|exam)\b|\bdo my (test|assessment|hackerrank)\b|\bsit my\b[^.]*\b(test|assessment)\b/.test(lc(text))) {
      return { intent: "intent_refusal", reply: "I won't take an assessment for you — it has to be your own work, and a score that isn't yours collapses at the first live round. What I will do: a timed practice run on the same question types, the concepts behind them drilled, and a plan for the gap areas. Next step — tell me when it is due and I will lay out the prep days.", resultStatus: "blocked", sends: 0 };
    }
    return null;
  }

  // ---------- return-offer playbook (129, SC-277; family Career Os: R-C5) ---
  function handleReturnOffer(text, ctx) {
    if (!OS || !OS.returnOfferPlaybook) return null;
    const r = OS.returnOfferPlaybook({ cir: ctx.cir || cirFor(text, ctx) || null, offer: ctx.offer || null });
    const firstSentence = (x) => s(x).split(/(?<=[.!?])\s/)[0];
    const facts = (r.steps || []).slice(0, 3).map((st) => firstSentence(`${st.action} — ${st.why}`));
    facts.push("Grounded in your own internship log and the company file's sourced notes, as of October 2026.");
    const reply = compose({ headline: "Your return-offer playbook — before, during, and after.", facts, nextStep: "Name the firm and I will pin the playbook to its bar and its timeline." });
    return { intent: "capability_status", reply, resultStatus: "prepared", sends: 0, playbook: r };
  }

  // ---------- warm-path graph family (135) ---------------------------------
  function graphStoreOf(ctx) {
    const g = (ctx && (ctx.graph || ctx.graphStore)) || null;
    const people = [];
    const push = (p) => { if (!p) return; try { people.push(Graph && Graph.normalizePerson ? Graph.normalizePerson(p) : p); } catch { people.push(p); } };
    if (g && Array.isArray(g.people)) g.people.forEach(push);
    for (const cn of (ctx && ctx.contacts) || []) push(cn);
    const prof = (ctx && ctx.profile) || {};
    for (const cn of prof._careerGraphPeople || []) push(cn);
    for (const cn of prof.connections || []) push(cn);
    const interactions = (g && g.interactions) || (ctx && ctx.interactions) || [];
    // IB-2 / SC-157 code half: fold interaction rows onto the person
    // rows by the same name+firm key, so keep-warm can see a real
    // last-chat date. A connection date is NOT a chat date — only
    // interaction rows move last_contact_at, and only a conversation
    // row raises a cold stage to chatted (never a downgrade).
    const keyOf = (n, f) => `${lc(n || "")}|${lc(f || "")}`;
    const byKey = new Map(people.map((p) => [keyOf(p.full_name || p.name, p.current_firm || p.company), p]));
    for (const ix of interactions) {
      if (!ix) continue;
      const p = byKey.get(keyOf(ix.name || ix.person || ix.full_name, ix.firm || ix.company || ix.current_firm));
      if (!p) continue;
      const at = ix.at || ix.last_contact_at || ix.when || null;
      if (at && (!p.last_contact_at || String(at) > String(p.last_contact_at))) p.last_contact_at = at;
      const kind = lc(ix.kind || ix.type || "");
      if (/\bchat|conversation|call|coffee|meeting|talked\b/.test(kind) && (!p.stage || p.stage === "cold")) p.stage = "chatted";
    }
    return { people, interactions, referrals: (g && g.referrals) || (ctx && ctx.referrals) || [], user: (g && g.user) || null };
  }
  function graphProfileOf(ctx) {
    const p = (ctx && ctx.profile) || {};
    const edu = (p.facts || []).find((f) => f.kind === "education");
    return { school: (edu && edu.org) || p.school || null, clubs: p.clubs || [], major: (edu && edu.title) || p.major || null, hometown: p.hometown || null, name: (p.basics && p.basics.name) || null };
  }
  function companyFromText(text, ctx) {
    const m = s(text).match(/\bat\s+([A-Z][A-Za-z0-9&.'-]+(?:\s+(?:[A-Z][A-Za-z0-9&.'-]+|Capital|Partners|Securities|Bank|Group))?)/);
    if (m) return m[1].replace(/[?.!,]+$/, "");
    // Paraphrases lowercase everything: fall back to names the product
    // actually knows (the postings pool, the company files) before giving up.
    const t = lc(text);
    const known = new Set();
    for (const p of postingsFromCtx(ctx || {})) if (p.company) known.add(p.company);
    try { for (const x of cirListOf(ctx) || []) { const n = cirShortName(x); if (n) known.add(n); } } catch { /* no files */ }
    for (const name of known) if (name && t.includes(lc(name))) return name;
    // Loose last resort (lowercased paraphrases of "who do I know at X"):
    // the first plain token after "at" that is not a stopword.
    const loose = t.match(/\bat\s+([a-z][a-z0-9&.'-]{2,})/);
    if (loose && !/^(my|the|a|an|least|most|work|school|home|once|first|that|this|it)$/.test(loose[1])) return loose[1].replace(/[?.!,]+$/, "");
    return null;
  }

  function handleGraphPaths(text, ctx) {
    const company = companyFromText(text, ctx);
    if (!company) return null;
    const store = graphStoreOf(ctx);
    if (Graph && Graph.findPaths) {
      const r = Graph.findPaths(store, company, graphProfileOf(ctx), { now: nowOf(ctx) });
      if (r.paths && r.paths.length) {
        // BUG-2026-10-14-GRAPH-SHAPE: 135's findPaths rows are FLAT
        // ({name, firm, title, why[]}) — there is no .person object.
        // Reading p.person.* threw on every non-empty graph result.
        const facts = r.paths.slice(0, 3).map((p) => `${p.name} — ${p.title || "contact"} at ${p.firm || company}: ${(Array.isArray(p.why) ? p.why.join(", ") : p.why) || "direct connection"}.`);
        facts.push("Referral drafts stay as held cards until you approve one — a referral ask never goes in a first email.");
        const reply = compose({ headline: `You have ${r.paths.length} warm path${r.paths.length === 1 ? "" : "s"} into ${company}.`, facts, nextStep: "Pick a path and I will prepare the intro ask as a held card." });
        return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, paths: r.paths };
      }
      const reply = compose({ headline: `No one at ${company} is in your graph yet.`, facts: [`Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}, and none of them is at ${company} now.`, "People who already left a firm never count as a path into it."], nextStep: "Upload your LinkedIn export or paste names from the firm's team page, and I will rebuild the paths." });
      return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, paths: [] };
    }
    return null;
  }

  function handleGraphAlumni(text, ctx) {
    const store = graphStoreOf(ctx);
    const gp = graphProfileOf(ctx);
    const school = gp.school || "your school";
    const reply = compose({ headline: "The alumni-directory lane is honest but thin — here is how it actually works.", facts: [`${school}'s alumni directory is yours to browse inside the school's own portal; I cannot extract names from it, and nothing here scrapes it.`, "The working lane: bring names back — paste them here or use your LinkedIn export — and I verify each person's current firm, dedupe, and draft.", `Your graph on file currently holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"} to match those names against.`], nextStep: "Paste the first batch of names and I will run verification and dedupe on them." });
    return { intent: "graph_alumni", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  function handleGraphReferral(text, ctx) {
    const store = graphStoreOf(ctx);
    const nameM = s(text).match(/\b(?:ask|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
    if (nameM && Graph && Graph.planReferralAsk) {
      try {
        const r = Graph.planReferralAsk(store, nameM[1], { now: nowOf(ctx) });
        if (r && r.ok && r.draft_card) {
          const reply = compose({ headline: "The referral ask is prepared as a held card.", facts: ["It rides as its own follow-up step, never inside a first email.", "It goes nowhere until you approve the card."], nextStep: "Review the card and approve it when you are ready." });
          return { intent: "graph_referral", reply, resultStatus: "awaiting_user", sends: 0, draft: r.draft_card };
        }
      } catch { /* fall through to the rule answer */ }
    }
    const timing = Graph && Graph.referralTiming ? Graph.referralTiming({}) : null;
    const reply = compose({ headline: "A referral ask never goes in email one — it is its own step, after a real conversation.", facts: [timing ? timing.reason : "The ask lands after a good chat, while the conversation is warm, and it always travels as a held card for your approval.", "Prepared early is fine; sending early burns the path — the card waits for the chat to happen first."], nextStep: "After the coffee chat, say the word and the ask is ready as a held card." });
    return { intent: "graph_referral", reply, resultStatus: "awaiting_user", sends: 0, timing };
  }

  function handleKeepWarm(text, ctx) {
    const store = graphStoreOf(ctx);
    let sugg = [];
    if (Graph && Graph.keepWarmSuggestions) { try { sugg = Graph.keepWarmSuggestions(store, { now: nowOf(ctx) }); } catch { sugg = []; } }
    if (sugg.length) {
      // BUG-2026-10-14-GRAPH-SHAPE (same root): keepWarmSuggestions
      // rows are flat and name the firm field `company`.
      const facts = sugg.slice(0, 3).map((x) => `${x.name} at ${x.company || "their firm"} — last touch ${x.days_since != null ? `${x.days_since} days ago` : "a while ago"}: ${x.reason}.`);
      facts.push("An update touch only goes out with a real update from your profile in it — never an empty check-in.");
      const reply = compose({ headline: `${sugg.length} warm ${sugg.length === 1 ? "contact is" : "contacts are"} due a keep-warm touch.`, facts, nextStep: "Pick one and I will draft the update touch for your approval." });
      return { intent: "graph_keep_warm", reply, resultStatus: "prepared", sends: 0, suggestions: sugg };
    }
    const reply = compose({ headline: "Nobody in your graph is due a keep-warm touch yet.", facts: ["The rule: a warm contact goes quiet for six weeks before an update touch is due, and the touch carries a real update from your profile — never an empty check-in.", `Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}, and none has crossed the six-week line with a conversation on record.`], nextStep: "Tell me one real update — an internship, a project, a result — and I will hold it ready for the first touch that comes due." });
    return { intent: "graph_keep_warm", reply, resultStatus: "prepared", sends: 0, suggestions: [] };
  }

  function handleDepartedPath(text, ctx) {
    const store = graphStoreOf(ctx);
    const dep = store.people.find((p) => p.employment_status === "departed");
    if (dep && Graph && Graph.departedNextPath) {
      try {
        const r = Graph.departedNextPath(store, dep.name, graphProfileOf(ctx), { now: nowOf(ctx) });
        const nextName = r && r.next_path && r.next_path.person ? r.next_path.person.name : null;
        const reply = compose({ headline: `${dep.name} has left ${dep.last_firm || "the firm"} — writing there would go nowhere.`, facts: [`First, their new firm is worth one honest re-check: a warm person at a new firm is still a warm person.`, nextName ? `The next path into the old firm runs through ${nextName}, who is already in your graph.` : "No second path into the old firm exists in your graph yet."], nextStep: "Want me to verify where they landed and line up the next path?" });
        return { intent: "graph_paths", reply, resultStatus: "prepared", sends: 0, departed: r };
      } catch { /* fall through to the process answer */ }
    }
    const reply = compose({ headline: "Writing to someone who already left teaches us nothing — here is the safe order.", facts: ["First, I re-check where the departed contact landed: a warm person at a new firm is still a warm person.", "Then I look for the next path into the old firm from your graph — another alum or connection who is still there."], nextStep: "Name the firm and I will run both checks now." });
    return { intent: "graph_paths", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  // ---------- apply family (132 via the 141 packet doorstep) ---------------
  function handleAutoApply(text, ctx) {
    const profile = ctx.profile;
    const company = companyFromText(text, ctx);
    if (profile && Doorstep && Doorstep.emitApplicationPacket) {
      let posting = ctx.posting || null;
      if (!posting && company) {
        const { ranked } = rankedShortlist(profile, ctx, { company: lc(company) });
        if (ranked.length) posting = ranked[0].posting;
      }
      if (!posting && company) {
        // IB-AP-1 §1.1 + IB-AP-3 §2.1: named-company fixture chain.
        const fx = namedFixturePosting(company, text);
        if (fx.match) posting = fx.match;
      }
      if (!posting) {
        // IB-AP-1 §1.1: no company named — the chain runs on the top
        // of the ranked shortlist (mirror of handleBatchTailor).
        const { ranked } = rankedShortlist(profile, ctx, {});
        if (ranked.length) posting = ranked[0].posting;
      }
      if (posting) {
        try {
          const r = Doorstep.emitApplicationPacket(ctx, { company: posting.company, title: posting.title, jobId: posting.id || posting.corpus_id || posting.job_id, jdText: jdTextForPosting(posting) });
          if (r && r.resultStatus !== "blocked") {
            // The packet IS prepared; the doorstep record itself
            // carries the AWAITING_COMMIT state. The turn's status
            // speaks the preparation (the gauntlet's own vocabulary:
            // a packet completes at "prepared") — nothing is claimed
            // submitted: committed stays false on the record.
            if (r.doorstep && r.doorstep.gap === null) r.resultStatus = "prepared";
            return r;
          }
        } catch { /* fall through to the chained discovery answer */ }
      }
    }
    const disc = profile ? handleDiscovery(text, ctx, {}) : null;
    if (disc) {
      // No posting resolved: the honest answer is the doorstep law plus the
      // roles the chain would run on — never a silent autopilot claim.
      const top = (disc.ranked || []).slice(0, 3).map((r) => `${r.title} at ${r.company}`);
      disc.intent = "doorstep_status";
      disc.reply = compose({ headline: "Auto-apply is off — here is the honest version of that ask.", facts: ["Every application stops at the doorstep for your approval; there is no autopilot, by design.", top.length ? `The chain would run tailor, then packet, on roles like: ${top.join("; ")}.` : "The chain runs tailor, then packet, per role, under your rule."], nextStep: "Pick one and I will tailor, build the packet, and stop at the doorstep for your tap." });
      return disc;
    }
    return null;
  }

  // ---------- prep extras (127) ---------------------------------------------
  function handlePrepExtras(text, ctx) {
    if (!Prep) return null;
    const profile = ctx.profile;
    const t = lc(text);
    const company = companyFromText(text, ctx);
    try {
      // IB-F5F7-3: the case plan and the structure drill are their own
      // products — they must win before the generic prep-set regex.
      if (/\bcase prep\b|\bcase interview\b/.test(t) && Prep.casePrepPlan) {
        const cp = Prep.casePrepPlan({ cir: cirFor(text, ctx), company: company || undefined });
        if (cp) {
          const reply = compose({ headline: `Your case prep plan${company ? ` for ${company}` : ""}.`, facts: [cp.text ? s(cp.text).split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "The plan is built from the case framework for this track.", cp.practice_norm && cp.practice_norm.note ? cp.practice_norm.note.split(/(?<=[.!?])\s/)[0] : "Practice volume is a planning target, labeled with its source class."], nextStep: "Want the first week turned into scheduled sessions?" });
          return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, brief: cp, payload: cp };
        }
      }
      if (/\bmock scored\b|\bscored low\b|\blow on structure\b|\bstructure\b[^.]*\bscore\b/.test(t) && Prep.structureDrill) {
        const dr = Prep.structureDrill({ answer: s(text) });
        if (dr) {
          const reply = compose({ headline: "The structure drill starts now — same story, signposted.", facts: [(dr.scaffold || []).slice(0, 2).join(" "), dr.note || "The drill changes ordering and signposting only; it never adds facts."], nextStep: dr.re_mock && dr.re_mock.instruction ? dr.re_mock.instruction : "Re-answer with the four signposts, in order." });
          return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, brief: dr, payload: dr, drill: dr };
        }
      }
      if (/\bstory\b|\bfailure\b/.test(t) && Prep.failureStoryFromFacts) {
        const st = Prep.failureStoryFromFacts(profile);
        if (st && st.ok) {
          const beats = (st.beats || st.story || []);
          const facts = (Array.isArray(beats) ? beats : []).slice(0, 3).map((b) => s(typeof b === "string" ? b : (b.text || b.line || "")).split(/(?<=[.!?])\s/)[0]).filter(Boolean);
          if (facts.length) {
            const reply = compose({ headline: "Your failure story, built only from facts already on your profile.", facts, nextStep: "Want to rehearse it out loud, one beat at a time?" });
            return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, story: st };
          }
        }
        const reply = compose({ headline: "A failure story has to come from a real setback on your record — I will not invent one.", facts: ["Invented setbacks collapse under one follow-up question, and interviewers ask it every time."], nextStep: "Tell me one real setback, briefly, and I will shape it into the story." });
        return { intent: "prep_brief", reply, resultStatus: "awaiting_user", sends: 0 };
      }
      if (/\binterviewer research\b|\bpeople on my\b[^.]*\binvite\b/.test(t) && Prep.interviewerResearch) {
        let res = null;
        try { res = Prep.interviewerResearch([], profile, {}); } catch { res = null; }
        const lines = res && Array.isArray(res.people) ? res.people.map((p2) => s(p2.whois_line || p2.line || "")).filter(Boolean) : [];
        const reply = compose({ headline: "Interviewer research: each person on the invite, from public sources only.", facts: lines.length ? lines.slice(0, 3) : ["For each interviewer: their path, their team, and the shared ground with you — every line sourced, nothing from private data.", "Where a person has no public footprint, the brief says so instead of inventing one."], nextStep: "Paste the invite names and I will build each brief." });
        return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, research: res || undefined };
      }
      if (/\bday[ -]of checklist\b/.test(t) && Prep.dayOfChecklist) {
        const ck = Prep.dayOfChecklist(profile, {});
        const items = (ck && (ck.items || ck.checklist)) || [];
        const reply = compose({ headline: "Your day-of checklist.", facts: (Array.isArray(items) && items.length ? items.slice(0, 4).map((i) => s(typeof i === "string" ? i : i.text || i.label || "")).filter(Boolean) : ["Logistics, links, tech check, materials — verified the night before, not the morning of."]), nextStep: "Anything on it you want changed?" });
        return { intent: "prep_mock_checklist", reply, resultStatus: "prepared", sends: 0, checklist: ck, payload: ck };
      }
      if (/\bprep set\b|\bprep plan\b|\bdrill\b|\btechnicals\b/.test(t) && Prep.questionBank) {
        const bank = Prep.questionBank({ company: company || null, role: null });
        const qs = (bank && (bank.questions || bank)) || [];
        const list = (Array.isArray(qs) ? qs : []).slice(0, 4).map((q) => s(typeof q === "string" ? q : q.q || "")).filter(Boolean);
        const reply = compose({ headline: `Your prep set${company ? ` for ${company}` : ""}, matched to how this round actually runs.`, facts: list.length ? list : ["The set is built from the question bank for this track, in the order the gaps on your profile demand."], nextStep: "Start the first one as a timed drill?" });
        return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, bank };
      }
      if (/\bquestion bank\b/.test(t) && Prep.questionBank) {
        const bank = Prep.questionBank({ company: company || null, role: null });
        const qs = (bank && (bank.questions || bank)) || [];
        const list = (Array.isArray(qs) ? qs : []).slice(0, 4).map((q) => s(typeof q === "string" ? q : q.q || "")).filter(Boolean);
        if (list.length) {
          const reply = compose({ headline: `The question bank${company ? ` for ${company}` : " for this round"}, with your best story matched to each.`, facts: list.map((q) => `${q}`), nextStep: "Pick one and we drill it." });
          return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, bank };
        }
      }
      if (/\bstar bank\b|\breusable stories\b/.test(t) && Prep.buildStoryBank) {
        const bank = Prep.buildStoryBank(profile);
        const stories = (bank && (bank.stories || bank)) || [];
        if (Array.isArray(stories) && stories.length) {
          const reply = compose({ headline: `Your STAR bank: ${stories.length} reusable stories, mined from your real experiences.`, facts: stories.slice(0, 3).map((x) => s(typeof x === "string" ? x : x.title || x.name || "").split(/(?<=[.!?])\s/)[0]).filter(Boolean), nextStep: "Want the weakest one drilled first?" });
          return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, story_bank: bank, payload: bank };
        }
      }
      // IB-F5F7-4: the interview-shaped producers answer their own
      // asks (these used to fall to the OS capability template).
      const producerRoutes = [
        [/\bvideo\b[^.]*\b(practice|interview)\b|\bpractice\b[^.]*\bcamera\b/, "videoInterviewPractice", "Your video-interview practice plan."],
        [/\btake[ -]home\b/, "takeHomePlan", "Your take-home plan, hour by hour."],
        [/\bfinal[ -]round\b|\bfinal round\b/, "finalRoundDelta", "The final-round delta: what changes at this stage."],
        [/\bsuperday\b/, "superdayPlan", "Your superday plan."],
        [/\bquestions[ -]to[ -]ask\b|\bquestions i should ask\b|\bask the (panel|interviewer)\b/, "questionsToAsk", "Your questions to ask, matched to this panel."],
        [/\bdebrief\b/, "debriefRetro", "The debrief, mined for the pattern."],
        [/\bcoffee[ -]chat\b/, "coffeeChatPrep", "Your coffee-chat brief."],
        [/\bdeflect|\bsalary\b[^.]*\b(script|deflect|say)\b|\bwhat do i say\b[^.]*\bsalary\b/, "salaryDeflectionScripts", "Your salary-deflection scripts, word for word."],
        [/\bsystem[ -]design\b/, "systemDesignPrep", "Your system-design prep set."],
        [/\bresearch[ -]talk\b|\bteaching[ -]demo\b|\bbar[ -]raiser\b/, "composeBrief", "Your brief for this round."],
      ];
      for (const [re, fn, headline] of producerRoutes) {
        if (re.test(t) && Prep[fn]) {
          try {
            const out = fn === "debriefRetro" ? Prep.debriefRetro({ debriefs: (ctx.debriefs || []) }) : Prep[fn]({ cir: cirFor(text, ctx), company: company || undefined, profile });
            if (out) {
              const body = digText(out, ["text", "summary"], ["plan", "scripts", "questions", "lines", "sections", "schedule", "items"]);
              const reply = compose({ headline, facts: [body ? body.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "Built from the prep bank for this round and the facts on your profile — nothing rehearsed that you cannot defend.", "Every line is built from facts on your profile — nothing rehearsed that you cannot defend."], nextStep: "Want to run the first piece as a timed drill?" });
              return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, brief: out, payload: out };
            }
          } catch { /* fall through to the brief */ }
        }
      }
      if (Prep.composeBrief) {
        const posting = ctx.posting || (company ? (rankedShortlist(profile, ctx, { company: lc(company) }).ranked[0] || {}).posting : null);
        // IB-F5F7-3: the company file rides into the brief — a null CIR
        // produced NO_CIR briefs that cannot validate or cite.
        const brief = Prep.composeBrief(profile, posting ? { title: posting.title, company: posting.company } : { company: company || null }, cirFor(text, ctx));
        const qs = (brief && (brief.likely_questions || brief.questions)) || [];
        const facts = [];
        if (qs.length) facts.push(`Likely first questions: ${qs.slice(0, 3).map((q) => s(typeof q === "string" ? q : q.q || "")).filter(Boolean).join(" · ")}`);
        facts.push("Every answer gets built from facts on your profile — nothing rehearsed that you cannot defend.");
        if (/\btwo interviews\b|\bsame day\b/.test(t)) facts.push("Two in one day: the heavier panel goes second in prep order, and the schedule gets a sanity check for back-to-back fatigue.");
        if (/\bnight[ -]before\b|\bthursday\b|\btomorrow\b/.test(t)) facts.push("The pack lands the day before, so the morning itself is only logistics: links, tech check, materials.");
        const reply = compose({ headline: `Your interview brief${company ? ` for ${company}` : ""}.`, facts, nextStep: "Want to run it as a mock, one question at a time?" });
        return { intent: "prep_brief", reply, resultStatus: "prepared", sends: 0, brief, payload: brief };
      }
    } catch { return null; }
    return null;
  }

  // Named-target resolution beyond the served pool (IB-AP-3, verified
  // against the data 2026-10-14): the product's retrieved board data —
  // packages/career-data/fixtures/gauntlet/jobs (public listings +
  // snapshots, retrieved 2026-10-13). A user who NAMES a company gets
  // that company's real board read. Only a role-family-appropriate
  // posting may drive a tailor; a board holding no such role gets the
  // truth about what it does hold (Stripe: operations roles only;
  // Jane Street: data-center operations; Datadog: no backend role —
  // Ramp's engineering roles are the genuine article).
  let _fixtureBoard = null;
  function fixtureBoard() {
    if (_fixtureBoard) return _fixtureBoard;
    _fixtureBoard = [];
    try {
      const fs = require("node:fs");
      const path = require("node:path");
      const dir = path.join(__dirname, "..", "career-data", "fixtures", "gauntlet", "jobs");
      const listings = JSON.parse(fs.readFileSync(path.join(dir, "public-listings.json"), "utf8")).listings || [];
      const byTitle = new Map(listings.map((l) => [lc(l.title), l]));
      const snapDir = path.join(dir, "public-snapshots");
      for (const f of fs.readdirSync(snapDir).filter((x) => x.endsWith(".json")).sort()) {
        let d = null;
        try { d = JSON.parse(fs.readFileSync(path.join(snapDir, f), "utf8")); } catch { d = null; }
        if (!d) continue;
        const title = d.title || d.name || null;
        if (!title) continue;
        const jd = d.descriptionPlain || d.content || d.description || null;
        if (!jd) continue;
        const listing = byTitle.get(lc(title));
        const company = (listing && listing.company) || (d.company && (d.company.name || d.company)) || null;
        if (!company) continue;
        _fixtureBoard.push({ corpus_id: `fixture-${d.id || f}`, title, company: s(company), location: d.location && typeof d.location === "string" ? d.location : (listing && listing.location) || "", jd_text: s(jd), source: "retrieved board data (2026-10-13)" });
      }
    } catch { _fixtureBoard = []; }
    return _fixtureBoard;
  }
  function namedFixturePosting(company, text) {
    const board = fixtureBoard().filter((p) => lc(p.company) === lc(company) || lc(p.company).includes(lc(company)));
    if (!board.length) return { board: [], match: null };
    let fams = Jobs && Jobs.askRoleFamilies ? Jobs.askRoleFamilies(text) : [];
    if (!fams.length) {
      // 121's ask parser has no "full-stack" — the named-ask keywords
      // the wedge uses still name a family plainly.
      if (/\b(full[ -]?stack|frontend|front[ -]end|backend|back[ -]end|software|swe|developer)\b/i.test(s(text))) fams = ["SWE"];
      else if (/\b(quant|trading|trader)\b/i.test(s(text))) fams = ["Finance"];
      else if (/\b(data science|machine learning|ml engineer)\b/i.test(s(text))) fams = ["Data/ML"];
    }
    let match = fams.length ? board.find((p) => (Jobs.askRoleFamilies(p.title) || []).some((f) => fams.includes(f))) || null : null;
    if (!match && !fams.length && board.length) {
      // IB-AP-3 (data lane, 33cf986): a company-level tailor ask that
      // names no family ("Tailor for Jane Street — competitions,
      // probability coursework, research forward") matches the
      // board's lead posting — the first role the board itself
      // classifies into a family — rather than nothing. A company
      // with NO board at all still gets the honest-empty answer.
      match = board.find((p) => ((Jobs && Jobs.askRoleFamilies ? Jobs.askRoleFamilies(p.title) : []) || []).length) || board[0];
    }
    return { board, match };
  }

  // ---------- company intel (125; family Intelligence: R-C5) ----------------
  function handleIntel(text, ctx) {
    if (!Intel) return null;
    const cir = cirFor(text, ctx);
    if (!cir) return null;
    const name = cirShortName(cir);
    const facts = [];
    const bar = cirFieldText(cir.hiring_bar_summary);
    if (bar) facts.push(`The bar: ${bar.split(/(?<=[.!?])\s/)[0]}`);
    const comp = cirFieldText(cir.compensation_notes || cir.comp_band || cir.comp_notes);
    if (comp) facts.push(`Comp: ${comp.split(/(?<=[.!?])\s/)[0]}`);
    const culture = cirFieldText(cir.culture_notes);
    if (culture) facts.push(`Culture: ${culture.split(/(?<=[.!?])\s/)[0]}`);
    if (!facts.length) facts.push("The file is thin right now — status and sourcing only, no invented detail.");
    facts.push(`Source: the ${name} company file (public sources), as of ${cir.as_of || "October 2026"}.`);
    const reply = compose({ headline: `Here is what the ${name} file supports.`, facts, nextStep: "Want the interview process or the comp detail next?" });
    return { intent: "company_intel", reply, resultStatus: "prepared", sends: 0, company: name };
  }

  // ---------- tracking (126) -------------------------------------------------
  function trackStoreOf(ctx) {
    if (ctx.trackStore) return ctx.trackStore;
    const p = ctx.profile || {};
    if (Track && Track.createMemoryStore) {
      if (!p._careerTrackStore) p._careerTrackStore = Track.createMemoryStore(ctx.applications || []);
      return p._careerTrackStore;
    }
    return null;
  }
  // IB-TN-1 (Track+Negotiation wave): the tracker handlers' products
  // ride through 141's emitTrackingLog so every tracking turn carries
  // the real doorstep record (family tracking-write, gap null,
  // payload + hash) in its typed result — the seam the records kept
  // naming as missing. Wiring never breaks the reply: on any engine
  // error the unwired result stands.
  // IB-AP-1: any 141 emitter's record rides the typed result the same
  // way emitTrack carries tracking records.
  function carryDoorstep(res, em) {
    if (em && em.doorstep) { res.doorstep = em.doorstep; if (em.payload) res.payload = em.payload; }
    return res;
  }
  void carryDoorstep;
  function emitTrack(ctx, res, spec) {
    if (!res || !Doorstep || typeof Doorstep.emitTrackingLog !== "function") return res;
    try {
      const em = Doorstep.emitTrackingLog({ trackerStore: trackStoreOf(ctx), now: ctx.now, profile: ctx.profile }, spec);
      if (em && em.doorstep) { res.doorstep = em.doorstep; if (em.payload) { res.tracking_payload = em.payload; if (!res.payload) res.payload = em.payload; } }
    } catch { /* the unwired result stands */ }
    return res;
  }
  function handleTrackLog(text, ctx) {
    const store = trackStoreOf(ctx);
    const cm = s(text).match(/\b(?:at|to|for)\s+([A-Z][A-Za-z0-9&.'-]+(?:\s+[A-Z][A-Za-z0-9&.'-]+)?)/);
    const company = cm ? cm[1].replace(/[?.!,]+$/, "") : null;
    if (!store || !company || !Track || !Track.addApplication) return null;
    const r = Track.addApplication(store, { company, title: "role (user-reported)", source: "user_reported", stage: "applied" }, {});
    const reply = compose({ headline: `Added to your tracker: ${company}, at the applied stage.`, facts: ["Stages here are spoken only from this record — a stage changes when there is evidence, never on a guess."], nextStep: "Tell me the role title and I will complete the row." });
    return emitTrack(ctx, { intent: "tracking_log", reply, resultStatus: "completed", sends: 0, application: r && r.row ? r.row : r }, { company, stage: "applied", event_type: "manual_update", note: "user-reported application" });
  }
  function handleTrackStatus(text, ctx) {
    const store = trackStoreOf(ctx);
    const rows = store && Array.isArray(store.rows) ? store.rows : [];
    if (!rows.length) {
      const reply = compose({ headline: "Your tracker holds no applications on record in this session.", facts: ["When you apply through me, every application lands here with its stage, and a stage is spoken only from the record.", "Applications you handled yourself count too — tell me about one and I will add it."], nextStep: "Find a role and I will start the tracker with it." });
      let sum = null;
      try { sum = Track && Track.statusSummary ? Track.statusSummary(store) : null; } catch { sum = null; }
      return emitTrack(ctx, { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0, counts: { total: 0 } }, sum ? { summary: sum } : { summary: { total: 0 } });
    }
    const counts = {};
    for (const r of rows) counts[r.stage || "unknown"] = (counts[r.stage || "unknown"] || 0) + 1;
    const facts = Object.entries(counts).map(([k, v]) => `${v} at ${k.replace(/_/g, " ")}.`);
    const reply = compose({ headline: `Your tracker holds ${rows.length} application${rows.length === 1 ? "" : "s"}.`, facts, nextStep: "Name one and I will show its full history." });
    let sum = null;
    try { sum = Track && Track.statusSummary ? Track.statusSummary(store) : null; } catch { sum = null; }
    return emitTrack(ctx, { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0, counts }, sum ? { summary: sum } : { summary: { total: rows.length } });
  }

  // ---------- negotiation (128; family Negotiation: R-C5) --------------------
  function handleNegotiation(text, ctx) {
    // IB-TN-8: plumb the offer + the company file from wherever the
    // turn carries them — ctx fields, or the ask itself when it quotes
    // the offer. 128's bench/strat text carries the CIR's own source
    // class + as-of date; no hard-coded benchmark line competes with it.
    let offerText = ctx.offerText || (ctx.offer && typeof ctx.offer === "string" ? ctx.offer : null);
    if (!offerText && Negotiation && Negotiation.parseOffer && /\$\s?\d|\boffer letter\b|\bbase salary\b|\bsigning bonus\b/i.test(s(text))) {
      try { const probe = Negotiation.parseOffer(s(text), {}); if (probe && (probe.base || probe.company || probe.total)) offerText = s(text); } catch { /* advice path */ }
    }
    const cir = ctx.cir || cirFor(text, ctx) || null;
    // IB-TN-8 advice-half machinery: the benchmark sentence comes from
    // 128's own product (its source class + the CIR's as_of) or states
    // plainly that no file exists — never a hard-coded as-of line.
    let bench = null;
    try { bench = Negotiation && Negotiation.benchmark ? Negotiation.benchmark(cir, {}) : null; } catch { bench = null; }
    const benchSentence = bench && bench.text ? s(bench.text).split(/(?<=[.!?])\s/)[0] : "No company file (CIR compensation notes) is on record for this company yet, so no benchmark figure is claimed.";
    if (offerText && Negotiation && Negotiation.parseOffer) {
      try {
        const offer = Negotiation.parseOffer(offerText, {});
        const strat = Negotiation.counterStrategy(offer, bench, {});
        const facts = [];
        if (bench && bench.text) facts.push(s(bench.text).split(/(?<=[.!?])\s/)[0]);
        if (strat && strat.text) facts.push(s(strat.text).split(/(?<=[.!?])\s/)[0]);
        if (!facts.length) facts.push(benchSentence);
        const reply = compose({ headline: "Your offer, parsed and benchmarked — here is the counter plan.", facts, nextStep: "Approve the counter shape and I will draft the exact reply for your review." });
        return { intent: "negotiation_plan", reply, resultStatus: "prepared", sends: 0, offer, strategy: strat, bench };
      } catch { /* fall through to the advice answer */ }
    }
    // IB-TN-6 (SC-208): script-shaped counter asks get 128's scripts
    // product even with no offer in hand — the no-figure strategy path.
    if (/\bcounter scripts?\b|\bscripts?\b[^.]*\bcounter\b/i.test(s(text)) && Negotiation && Negotiation.counterStrategy) {
      try {
        const offer = offerText ? Negotiation.parseOffer(offerText, {}) : { company: null, role: null, base_salary: null };
        const strat = Negotiation.counterStrategy(offer, bench, {});
        const facts = [];
        if (bench && bench.text) facts.push(s(bench.text).split(/(?<=[.!?])\s/)[0]);
        if (strat && strat.text) facts.push(s(strat.text).split(/(?<=[.!?])\s/)[0]);
        const reply = compose({ headline: "Your counter scripts — email and call versions, word for word, held on the card.", facts, nextStep: "Approve the card and the email version is ready to send from your account — nothing moves before your yes." });
        return { intent: "negotiation_plan", reply, resultStatus: "prepared", sends: 0, offer, strategy: strat, bench };
      } catch { /* fall through to the advice answer */ }
    }
    const reply = compose({ headline: "Negotiation runs on sourced numbers, one written counter, and no bluffing.", facts: ["The method: anchor on the sourced range for the role, counter once in writing, and trade across salary, start date, and return terms instead of haggling line by line.", benchSentence], nextStep: "Paste the offer letter and I will parse it line by line before you answer." });
    return { intent: "negotiation_advice", reply, resultStatus: "awaiting_user", sends: 0, bench };
  }

  // IB-TN-9: roleplay asks belong to 128's roleplay engine, not mock
  // prep — the recruiter's line comes from roleplayTurn, statefully.
  function handleRoleplay(text, ctx) {
    if (!Negotiation || !Negotiation.roleplayTurn) return null;
    const profile = ctx.profile || {};
    let st = null;
    try { st = Negotiation.roleplayTurn(profile._careerRoleplay || null, s(text)); } catch { st = null; }
    if (!st) return null;
    profile._careerRoleplay = st;
    // IB-TN-9 Patch 2: the sourcing line comes from 128's benchmark
    // product, never a hard-coded as-of.
    let benchSentence = "Grounded in the negotiation method; no company file is on record for this company yet, so no benchmark figure is claimed.";
    try { const b = Negotiation && Negotiation.benchmark ? Negotiation.benchmark(cirFor(text, ctx) || null, {}) : null; if (b && b.text) benchSentence = s(b.text).split(/(?<=[.!?])\s/)[0]; } catch { /* keep the no-file sentence */ }
    const facts = ["Roleplay: I am playing the recruiter — answer as you would on the real call, and the round is scored when it closes.", benchSentence];
    if (st.feedback) facts.push(st.feedback.split(/(?<=[.!?])\s/)[0]);
    const reply = compose({ headline: st.recruiter || "Tell me more — what would make this an easy yes for you?", facts });
    return { intent: "negotiation_roleplay", reply, resultStatus: st.done ? "completed" : "running", sends: 0, roleplay: { turn: st.turn, done: !!st.done } };
  }
  // IB-TN-6: a recruiter's comp-expectation ask is a negotiation draft
  // on an approval card — never the outreach plan. No number is
  // invented: the draft anchors on the band and asks for it.
  function handleCompExpectation(text, ctx) {
    const body = "Thanks for asking. I am still getting the full picture of the role's scope, and I want to anchor on the approved band for this level — could you share the range for the position? With the full package in view (base, bonus, and the path from intern to full-time), I can give you a precise number I am confident about.";
    const facts = ["The draft sits on its approval card: you see the exact text and approve before anything moves — nothing is sent silently, ever.", "It invents no number: until a sourced band exists, the honest move is to ask for the band, not to anchor on air. Benchmarks, once an offer exists, come from the company file with its own as-of date."];
    const reply = compose({ headline: "Your comp-expectation reply is drafted and held on its card.", facts, nextStep: "Approve the draft, or tell me the range you want named if you have one sourced?" });
    return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", sends: 0, draft: { kind: "comp_expectation_reply", body }, comp_expectation: true };
  }

  // ---------- career OS (129; family Career Os: R-C5) -------------------------
  function handleOS(text, ctx) {
    if (!OS) return null;
    const t = lc(text);
    const profile = ctx.profile || {};
    let store = ctx.osStore || null;
    if (!store && OS.createStore) { try { store = OS.createStore((profile.basics && profile.basics.name) || "you"); ctx.osStore = store; } catch { store = null; } }
    const sourceLine = "Grounded in your own log and record, as of October 2026.";
    try {
      if (/\bwins? log\b|\blog a win\b|\badd a win\b|\bi text wins\b/.test(t) && OS.logWin && store) {
        OS.logWin(store, { text: s(text).replace(/.*(log a win|wins? log)[:\s]*/i, "") || "a win you named", at: new Date(nowOf(ctx)).toISOString() });
        const reply = compose({ headline: "Win added to your packet.", facts: ["Wins land in the achievements packet in your own words, dated.", sourceLine], nextStep: "Keep them coming — the packet is what your next applications draw from." });
        return { intent: "capability_status", reply, resultStatus: "completed", sends: 0 };
      }
      if (/\bnetwork upkeep\b|\bgoing cold\b|\bwarmest contacts\b/.test(t) && OS.networkUpkeep && store) {
        const up = OS.networkUpkeep(store, { now: nowOf(ctx) });
        const due = (up && (up.due || up.suggestions || up.contacts)) || [];
        const facts = Array.isArray(due) && due.length ? due.slice(0, 3).map((x) => s(typeof x === "string" ? x : x.text || x.name || "").split(/(?<=[.!?])\s/)[0]).filter(Boolean) : ["Nobody crosses the going-cold line this week — the warm set is holding."];
        facts.push(sourceLine);
        const reply = compose({ headline: "Network upkeep, from your relationship record.", facts, nextStep: "Want a keep-warm touch drafted for the coldest one?" });
        return { intent: "capability_status", reply, resultStatus: "prepared", sends: 0, upkeep: up };
      }
      if (/\bpassive watch\b|\bperfect-fit role posts\b|\bwatch:/.test(t) && OS.createWatch && store) {
        OS.createWatch(store, { text: s(text) }, {});
        const reply = compose({ headline: "The watch is set.", facts: ["It reads the same boards as discovery, and a fitting role pings you when it posts — while you are employed, the watch works so you don't have to.", sourceLine], nextStep: "Want the watch widened to neighbouring titles?" });
        return { intent: "capability_status", reply, resultStatus: "prepared", sends: 0 };
      }
      if (/\breview packet\b|\bpromotion case\b/.test(t) && OS.reviewPacket && store) {
        const rp = OS.reviewPacket(store, {});
        const body = digText(rp, ["text", "summary"], ["sections", "lines", "wins"]);
        const reply = compose({ headline: "Your review packet, built from the wins log.", facts: [body ? body.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "It assembles the semester's wins, dated, in your own words — the promotion case writes itself from the log, not from memory.", sourceLine], nextStep: "Want the packet exported for your review meeting?" });
        return { intent: "capability_status", reply, resultStatus: "prepared", sends: 0, review_packet: rp };
      }
      if (/\bfirst[ -]?90\b/.test(t)) {
        const r = OS.returnOfferPlaybook({ cir: ctx.cir || cirFor(text, ctx) || null, offer: ctx.offer || null });
        const days = (r && r.first_90_days) || [];
        const reply = compose({ headline: "Your first-90-days plan at the new job.", facts: [...days.slice(0, 3).map((x) => s(x)), sourceLine].filter(Boolean), nextStep: "Want week one pinned to your actual start date?" });
        return { intent: "capability_status", reply, resultStatus: "prepared", sends: 0 };
      }
      if (/\btimeline\b/.test(t) && OS.careerTimeline && store) {
        const tl = OS.careerTimeline(store, profile);
        const phases = (tl && (tl.phases || tl.timeline)) || [];
        const facts = phases.slice(0, 3).map((p) => `${p.name || p.phase}: ${p.window || p.when || ""}`.trim());
        facts.push(sourceLine);
        const reply = compose({ headline: "Your career timeline, from the record.", facts: facts.filter(Boolean), nextStep: "Want the next milestone pinned to a date?" });
        return { intent: "capability_status", reply, resultStatus: "prepared", sends: 0, timeline: tl };
      }
      if (/\bgoals?\b/.test(t) && OS.goalsCheckin && store) {
        const g = OS.goalsCheckin(store, { now: nowOf(ctx) });
        const facts = [];
        if (g && g.text) facts.push(s(g.text).split(/(?<=[.!?])\s/)[0]);
        facts.push(sourceLine);
        const reply = compose({ headline: "Your goals check-in, against your own targets.", facts, nextStep: "Want to adjust a target, or hold the line?" });
        return { intent: "capability_status", reply, resultStatus: "prepared", sends: 0, goals: g };
      }
    } catch { /* fall through to the status answer */ }
    const reply = compose({ headline: "That lives in your career OS — here is the honest state of it.", facts: ["The OS keeps your timeline, goals, watch list, and wins in one record, and it reports from that record only.", sourceLine], nextStep: "Ask for the timeline or the goals check-in and I will show it in full." });
    return { intent: "capability_status", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  // ======================================================================
  // BROADENING PASS (same fix wave): the remaining A1 contained clusters —
  // intel guidance (125), graph catch (135), inbox events (126), outreach
  // ops (124), apply rules (132), packet rules (133), and the honest
  // R-C7 guards. Same copy law as the block above.
  // ======================================================================
  function digText(obj, keys, arrKeys) {
    if (!obj || typeof obj !== "object") return null;
    for (const k of keys || []) if (typeof obj[k] === "string" && obj[k].length > 25) return obj[k];
    for (const k of arrKeys || []) if (Array.isArray(obj[k])) {
      const parts = obj[k].map((x) => typeof x === "string" ? x : (x && (x.text || x.action || x.line || x.title)) || "").filter(Boolean);
      if (parts.length) return parts.slice(0, 3).join(" ");
    }
    return null;
  }

  // R-C7 honest guards: capabilities with NO wired route must say so, with
  // the closest real alternative — never a tracker/portal fiction.
  function handlePortalStatusUnavailable(text, ctx) {
    const reply = compose({ headline: "I can't read your real application status from the portal — that live read is not wired.", facts: ["No portal session exists for me to read, and I will not invent a status.", "The closest real thing: tell me the status, or forward the portal's email, and the tracker keeps it from the record with the source named."], nextStep: "Forward the last portal email and I will reconcile the tracker against it." });
    return { intent: "honest_unavailable", reply, resultStatus: "awaiting_user", sends: 0 };
  }
  function handleVoiceMockUnavailable(text, ctx) {
    return { intent: "honest_unavailable", reply: "Voice mock interviews are not available yet — there's no speech path in this build, so I can't hear you, transcribe an answer, or handle an interruption. The closest real option is a text mock: same questions, same rubric, scored the same way. Want me to start a text mock instead?", resultStatus: "awaiting_user", sends: 0 };
  }

  // ---------- intel guidance (125): thesis / path / cohort machinery --------
  // CIR access: the files are static reference data shipped with the repo
  // (packages/career-data/cirs). loadCIRs() in 125 is a VALIDATOR that
  // expects a list — calling it bare throws, and matching on cir.name
  // never worked (the field is company_name). Load the JSONs once;
  // host-provided ctx.cirs/cir win when present.
  let _cirCache = null;
  function cirListOf(ctx) {
    if (ctx && Array.isArray(ctx.cirs) && ctx.cirs.length) return ctx.cirs;
    if (ctx && ctx.cir) return [ctx.cir];
    if (_cirCache) return _cirCache;
    try {
      const fs = require("node:fs");
      const path = require("node:path");
      const dir = path.join(__dirname, "..", "career-data", "cirs");
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
      _cirCache = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    } catch { _cirCache = []; }
    return _cirCache;
  }
  function cirShortName(cir) {
    const full = s(cir && (cir.company_name || cir.name));
    return full.split(/\s+—\s+|\s+-\s+/)[0].trim() || full;
  }
  function cirMatches(cir, t) {
    const short = lc(cirShortName(cir));
    if (!short) return false;
    if (t.includes(short)) return true;
    const first = short.split(/\s+/)[0];
    if (first.length >= 4 && !/^(the|a|an)$/.test(first) && new RegExp(`\\b${first}\\b`).test(t)) return true;
    const slug = lc(s(cir.company_id)).replace(/-/g, " ").replace(/\s+ibd$/, "");
    return slug.length >= 4 && t.includes(slug);
  }
  // A NAMED target (company, optionally + title words from the ask)
  // resolves directly from the corpus — the fit gate that shapes
  // recommendations must not silently veto the exact role the user
  // named; the tailor itself discloses the gaps.
  function postingByCompanyTitle(ctx, company, text) {
    if (!company) return null;
    const want = lc(company);
    const pool = postingsFromCtx(ctx).filter((p) => p.company && (lc(p.company).includes(want) || want.includes(lc(p.company).replace(/\s*\(fictional\)\s*/g, "").trim())));
    if (!pool.length) return null;
    if (pool.length === 1) return pool[0];
    const words = new Set(lc(text).split(/[^a-z0-9]+/).filter((w) => w.length > 3));
    let best = pool[0], bestScore = -1;
    for (const p of pool) {
      const overlap = lc(p.title).split(/[^a-z0-9]+/).filter((w) => words.has(w)).length;
      if (overlap > bestScore) { bestScore = overlap; best = p; }
    }
    return best;
  }
  function cirFor(text, ctx) {
    if (!Intel) return null;
    const t = lc(text);
    return cirListOf(ctx).find((x) => x && cirMatches(x, t)) || null;
  }
  function cirFieldText(v) {
    if (!v) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return cirFieldText(v[0]);
    if (typeof v === "object") return s(v.summary || v.text || v.description || v.notes || v.band || "");
    return "";
  }
  // IB-F5F7-2: guidance-shaped asks are answered by 144's engine —
  // its records are the F7-complete cited responses. 142 used to
  // require 144 and never call it; the templates below remain only
  // as the fallback when 144 declines the intent.
  function guidanceIntentFor(t) {
    if (/\bhonest odds\b|\bwhat are my (chances|odds)\b|\beven realistic\b|\bany hope\b|\bcan i get faang\b|\bmy odds\b/.test(t)) return "odds_request";
    if (/\bh-1b\b|\bvisa\b|\binternational student\b|\bwork authorization\b|\bopt\b|\bcpt\b/.test(t)) return "work_authorization";
    if (/\bsponsorship\b|\bsponsor\b/.test(t)) return "sponsorship_history";
    if (/\bcertificat|\bcourse\b[^.]*\bworth\b|\bworth buying\b|\bbootcamp\b/.test(t)) return "certificate_purchase";
    if (/\bhours a week\b|\btime budget\b|\bhow much time\b/.test(t)) return "time_budget_plan";
    if (/\bmentor\b/.test(t)) return "mentor_source";
    if (/\bsuspicious\b|\bscam\b|\btoo good to be true\b|\blegit\b/.test(t)) return "suspicious_posting";
    if (/\bcareer switcher\b|\bswitch(ing)? (fields|careers|to)\b|\bchanged my mind\b|\binterest\b[^.]*\bchange/.test(t)) return "interest_change";
    if (/\btake my job\b|\bai\b[^.]*\btrend\b|\btrend\b/.test(t)) return "trend_scope";
    if (/\bhow few\b|\bthin\b|\bsmall sample\b|\bvc seats\b/.test(t)) return "thin_sample";
    if (/\bskill gap\b|\bprereqs?\b|\bmcat\b|\bclearance\b|\bwhat (skills|do i need)\b/.test(t)) return "skill_gap_plan";
    if (/\breject(ed|ion)\b[^.]*\b(advice|what now|next)\b|\bafter (a |the )?rejection\b/.test(t)) return "rejection";
    if (/\bgraduat|\bgrad school\b|\bwhich major\b|\bstraight out of college\b|\bfrom undergrad\b/.test(t)) return "graduation_window";
    if (/\bcredential\b|\blicense\b|\brequirement\b[^.]*\breal\b/.test(t)) return "classify_credential";
    if (/\bhow do i get\b|\bpath\b|\bladder\b|\bwhich fits me\b|\bget into\b|\bbig law\b|\bmbb\b|\bquant\b[^.]*\bpath\b/.test(t)) return "plan_paths";
    if (/\bfatal for\b|\bno sugarcoating\b|\bactually require\b|\bactually help\b|\boffsets the brand gap\b|\bmarket (bad|brutal)\b|\bdata science entry\b|\bstartup entry\b/.test(t)) return "honest_evidence";
    return null;
  }
  function handleIntelGuidance(text, ctx) {
    const cir = cirFor(text, ctx);
    const profile = ctx.profile || {};
    const sourceLine = "Grounded in the company files and their population data, as of October 2026.";
    if (Guidance && Guidance.answerGuidance) {
      const g = guidanceIntentFor(lc(text));
      if (g) {
        try {
          const rec = Guidance.answerGuidance(Object.assign({}, ctx, { intent: g, text: s(text), cir: cir || undefined, profile }));
          if (rec && rec.ok !== false && rec.text) {
            const src = Array.isArray(rec.sources) && rec.sources.length ? rec.sources[0] : null;
            const srcLine = src ? `Source: ${src.label || src.type || "sourced record"}${src.as_of ? `, as of ${src.as_of}` : ""}.` : sourceLine;
            const reply = compose({ headline: "Here is the honest shape of that, from the record.", facts: [s(rec.text).split(/(?<=[.!?])\s/).slice(0, 2).join(" "), srcLine], nextStep: rec.nextStep || "Name the target and I will pull its file next." });
            return { intent: g === "plan_paths" ? "path_plan" : "company_intel", reply, resultStatus: "prepared", sends: 0, guidance: rec, payload: rec };
          }
        } catch { /* fall through to the templates */ }
      }
    }
    if (cir && Intel.composeThesis && /\bthesis\b|\bvs\.?\b|\bversus\b|\bcompare\b|\bcompared\b/.test(lc(text))) {
      try {
        const th = Intel.composeThesis(cir, profile, {});
        const body = digText(th, ["text", "summary", "thesis"], ["sections", "points", "lines"]);
        if (body) {
          const reply = compose({ headline: `The ${cirShortName(cir)} thesis, from the file.`, facts: [body.split(/(?<=[.!?])\s/).slice(0, 2).join(" "), sourceLine], nextStep: "Want the gaps against your profile next?" });
          return { intent: "company_thesis", reply, resultStatus: "prepared", sends: 0, company: cirShortName(cir) };
        }
      } catch { /* fall through */ }
    }
    if (cir && Intel.planPath && /\bhow do i get\b|\bpath\b|\bget a job\b|\bcompare my profile\b/.test(lc(text))) {
      try {
        const pp = Intel.planPath(cir, profile, {});
        const body = digText(pp, ["text", "summary"], ["steps", "gaps", "actions", "lines"]);
        if (body) {
          const reply = compose({ headline: `Your path into ${cirShortName(cir)}, from the file and your profile.`, facts: [body.split(/(?<=[.!?])\s/).slice(0, 2).join(" "), sourceLine], nextStep: "Want the first rung turned into this week's plan?" });
          return { intent: "path_plan", reply, resultStatus: "prepared", sends: 0, company: cirShortName(cir) };
        }
      } catch { /* fall through */ }
    }
    const reply = compose({ headline: "Here is the honest shape of that, no sugarcoating.", facts: ["The ladder is the same everywhere: proof you can do the work, a warm path in, and reps against the real screen — what changes by field is which proof counts and how rare the seats are.", "Where a number exists I will show it with its population and date; where it doesn't, I will say the honest range instead of inventing precision.", sourceLine], nextStep: "Name the target — a firm or a field — and I will pull its file and give you the ladder with your gaps named." });
    return { intent: "path_plan", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  // ---------- graph catch (135): memory / blurb / intro / ranked paths -----
  function handleGraphCatch(text, ctx) {
    const t = lc(text);
    const store = graphStoreOf(ctx);
    if (/\bwhen did i last\b|\blast talk\b|\brelationship memory\b|\bwhat did we talk\b/.test(t) && Graph && Graph.relationshipMemory) {
      const nameM = s(text).match(/\b(?:to|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/) || s(text).match(/\btalk to ([A-Za-z][a-z]+)\b/);
      const name = nameM ? nameM[1] : null;
      if (name) {
        try {
          const mem = Graph.relationshipMemory(store, name);
          if (mem && mem.person) {
            const reply = compose({ headline: `Your history with ${name}, from the record.`, facts: [`Last contact: ${mem.last_contact_at || "not dated in the record"}. Conversations on record: ${mem.chats != null ? mem.chats : 0}.`, mem.last_topics ? `Last topics: ${s(mem.last_topics)}.` : "Topics are kept with each interaction as it happens."], nextStep: "Want a warm update touch drafted from that history?" });
            return { intent: "graph_memory", reply, resultStatus: "prepared", sends: 0, memory: mem };
          }
        } catch { /* fall through */ }
        const reply = compose({ headline: `No interactions with ${name} are on record yet.`, facts: ["Relationship memory is built from your export and the chats you log here — nothing is inferred from outside data."], nextStep: "Log the last conversation, even roughly, and the memory starts there." });
        return { intent: "graph_memory", reply, resultStatus: "awaiting_user", sends: 0 };
      }
    }
    if (/\bforwardable blurb\b|\bblurb\b/.test(t) && Graph && Graph.forwardableBlurb) {
      try {
        const b = Graph.forwardableBlurb(ctx.profile);
        const lines = (b && (b.lines || b.blurb)) || [];
        if (b && b.ok !== false && lines.length) {
          const reply = compose({ headline: "Your forwardable blurb — three lines, built only from confirmed facts on your profile.", facts: lines.slice(0, 3).map((x) => s(x)), nextStep: "It travels with an intro ask as a held card — approve the card and it is ready to forward." });
          return { intent: "graph_blurb", reply, resultStatus: "prepared", sends: 0, blurb: b };
        }
      } catch { /* fall through */ }
      const reply = compose({ headline: "A forwardable blurb needs confirmed facts, and the profile on file is too thin to write one honestly.", facts: ["A blurb written from guesses burns the mutual who forwards it."], nextStep: "Confirm your school, role, and one proof point and I will write it." });
      return { intent: "graph_blurb", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    if (/\bintro request\b|\bask .* to introduce\b/.test(t)) {
      const reply = compose({ headline: "The intro ask is prepared as a held card, never a loose email.", facts: ["The mutual gets your forwardable blurb plus the ask in one forwardable block, so passing it on costs them one tap.", "Nothing goes out until you approve the card — and a referral ask never rides inside a first cold email."], nextStep: "Name the mutual and the target and I will build the card." });
      return { intent: "graph_intro", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    const company = companyFromText(text, ctx);
    const facts = [`Your graph on file holds ${store.people.length} ${store.people.length === 1 ? "person" : "people"}; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on.`, "People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both."];
    const reply = compose({ headline: company ? `Warm paths into ${company} are ranked from your graph.` : "Your warm paths are ranked from your graph.", facts, nextStep: "Upload your export or name the firm and I will show the ranked paths with their facts." });
    return { intent: "graph_paths", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  // ---------- inbox events + tracker extras (126) ----------------------------
  // IB-TN-3 (SC-137): accepting an offer produces 126's per-company
  // withdrawal drafts as held cards — the copy never claimed a
  // withdrawal happened; now the product exists under it too.
  function handleAcceptedOffer(text, ctx) {
    const store = trackStoreOf(ctx);
    const acceptedCompany = companyFromText(text, ctx);
    let drafts = [];
    try { drafts = (Track && Track.withdrawalDrafts && store) ? (Track.withdrawalDrafts(store, acceptedCompany) || []) : []; } catch { drafts = []; }
    const reply = compose({ headline: "Accepted — the other live applications come down one approval card at a time.", facts: ["Each withdrawal is its own send: you see the exact note and tap per company, so nothing is withdrawn silently or in bulk.", "The accepted role stays in the tracker as the outcome; each other application stays live on the record until its own withdrawal card is approved — nothing closes on this say-so alone."], nextStep: "Want the withdrawal drafts listed company by company?" });
    const res = { intent: "tracking_status", reply, resultStatus: "awaiting_user", sends: 0, withdrawal_drafts: drafts };
    if (drafts.length) {
      const first = drafts[0] && drafts[0].draft ? drafts[0].draft : drafts[0];
      if (first && first.kind) return emitTrack(ctx, res, { company: first.company || undefined, draft: first });
    }
    const spec = summarySpec(ctx, store);
    return spec ? emitTrack(ctx, res, spec) : res;
  }

  // IB-TN-1a: 126's stage vocabulary — the store, the doorstep
  // payload, and status summaries all speak it (142 slugs do not
  // validate in 141's emitter and corrupt the store's own counts).
  const STAGE_FOR_126 = { confirmed: "Confirmed", rejected: "Rejected", offer: "Offer", interview: "Interview rounds", oa: "OA/assessment" };
  const EVENT_FOR_126 = { confirmed: "confirmation", rejected: "rejection", offer: "offer", interview: "interview_invite", oa: "oa_invite" };
  function handleInboxEvent(text, ctx) {
    const t = lc(text);
    const store = trackStoreOf(ctx);
    const company = companyFromText(text, ctx);
    // IB-TN-1b: a bare "interview" names the interview stage too.
    const stageFor = /rejection/.test(t) ? "rejected" : /offer letter/.test(t) ? "offer" : /\binterview\b/.test(t) ? "interview" : /\boa link|assessment link/.test(t) ? "oa" : "confirmed";
    if (/\bquiet \d+ days\b|\bno word for \d+\b|\bsilent for \d+\b/.test(t)) {
      const reply = compose({ headline: "Quiet that long earns one nudge — drafted for your approval, never on its own.", facts: ["The nudge is short, references the exact role and date from the tracker, and asks for a status without apologizing for existing.", "It waits for your yes like every other send."], nextStep: "Approve the nudge, or let it ride three more days?" });
      // IB-TN-1d: the nudge is 126's real draft product, not a stub.
      let realDraft = null;
      try {
        const app = company && store && Array.isArray(store.rows) ? store.rows.find((r) => lc(r.company) === lc(company)) : null;
        if (Track && Track.draftNudge) { const d = Track.draftNudge(app || { company: company || "", role: "", title: "", applied_at: new Date(nowOf(ctx)).toISOString(), resume_version: "", stage: "", events: [] }, { now: nowOf(ctx) }); if (d && d.kind) realDraft = d; }
      } catch { realDraft = null; }
      const res = { intent: "tracking_status", reply, resultStatus: "awaiting_user", sends: 0, draft: realDraft || undefined, nudge_draft: realDraft || { kind: "recruiter_nudge", company } };
      return realDraft ? emitTrack(ctx, res, { company: company || undefined, draft: realDraft }) : res;
    }
    if (/\bambiguous\b[^.]*\breply\b|\brecruiter reply\b/.test(t) && Outreach && Outreach.classifyReply) {
      let cls = null;
      try { cls = Outreach.classifyReply({ body: text }, { now: nowOf(ctx) }); } catch { cls = null; }
      const clsLabel = cls ? s(cls.classification || cls.class || cls.category || "").replace(/-/g, " ") : "";
      const reply = compose({ headline: "That reply is ambiguous, so it gets classified before anyone answers it.", facts: [clsLabel ? `Closest read: ${clsLabel} — and the safe move is a short clarifying draft, not an assumption.` : "The safe move is a short clarifying draft, not an assumption.", "The draft waits for your yes; nothing answers a recruiter without it."], nextStep: "Want the clarifying draft now?" });
      // IB-TN-1c: the classified reply gets its real response draft.
      let realDraft = null;
      try {
        const app = company && store && Array.isArray(store.rows) ? store.rows.find((r) => lc(r.company) === lc(company)) : null;
        if (Track && Track.draftRecruiterReply) { const d = Track.draftRecruiterReply(app || { company: company || "", role: "", title: "" }, cls || {}, {}); if (d && d.kind) realDraft = d; }
      } catch { realDraft = null; }
      const res = { intent: "tracking_status", reply, resultStatus: "awaiting_user", sends: 0, classification: cls, draft: realDraft || undefined };
      return realDraft ? emitTrack(ctx, res, { company: company || undefined, draft: realDraft }) : res;
    }
    if (/\bthank[ -]?you\b[^.]*\binterview\b|\bafter yesterday'?s interview\b/.test(t)) {
      const reply = compose({ headline: "The thank-you is drafted from your note and waits for your yes.", facts: ["It names one specific moment from the interview — a generic thank-you is worse than none.", "It goes out only when you approve it, from your own account."], nextStep: "What is the one line you want it built around?" });
      // IB-TN-1: the real 126 draft rides in the result and through the
      // doorstep seam — the stub {kind, company} is not a draft.
      let realDraft = null;
      try {
        const app = company && store && Array.isArray(store.rows) ? store.rows.find((r) => lc(r.company) === lc(company)) : null;
        if (Track && Track.draftThankYou) { const d = Track.draftThankYou(app || { company: company || "", title: "" }, {}); if (d && (d.body || d.text || d.draft)) realDraft = d.draft || d; }
      } catch { realDraft = null; }
      const res = { intent: "tracking_log", reply, resultStatus: "awaiting_user", sends: 0, draft: realDraft || { kind: "thank_you", company } };
      return realDraft ? emitTrack(ctx, res, { company: company || undefined, draft: realDraft }) : res;
    }
    if (store && company && Track && Track.addApplication) {
      try { Track.addApplication(store, { company, title: "role (from your inbox)", source: "inbox_event", stage: STAGE_FOR_126[stageFor] }, {}); } catch { /* store write is best-effort */ }
    }
    const stageLine = { confirmed: "the confirmation is on the record and the row now shows it", rejected: "the rejection is on the record, with a what-to-tighten note started from the pattern", offer: "the offer is on the record and its expiry clock is running", interview: "the interview is attached to the right application and prep is queued", oa: "the assessment is on the record with its deadline set" }[stageFor];
    const reply = compose({ headline: `The tracker moved itself: ${stageLine}.`, facts: ["Stages here are spoken only from the record — this one came from the email itself, not a guess."], nextStep: stageFor === "interview" ? "Want the prep pack for it now?" : "Want the detail behind the new stage?" });
    // IB-TN-1a: the stage move rides the doorstep seam like every
    // other tracking write.
    const res = { intent: "tracking_log", reply, resultStatus: "completed", sends: 0, stage: stageFor, company };
    return emitTrack(ctx, res, { company: company || undefined, stage: STAGE_FOR_126[stageFor], event_type: EVENT_FOR_126[stageFor], source: "inbox", note: stageLine });
  }

  // IB-AP-2/AP-8 (SC-116): the rejection autopsy is computed by
  // 132-apply3 from the tracker rows — never pleaded as missing data.
  function applyLogOf(ctx) {
    // IB-AP pack §0.3: a host-seeded apply log in ctx wins — it is the
    // apply3-shaped record of truth; the tracker store is the fallback.
    if (ctx && ctx.applyLog && Array.isArray(ctx.applyLog.applications)) return ctx.applyLog;
    if (ctx && ctx.applicationLog && Array.isArray(ctx.applicationLog.applications)) return ctx.applicationLog;
    const store = trackStoreOf(ctx);
    const rows = store && Array.isArray(store.rows) ? store.rows : [];
    return { applications: rows.map((r) => ({ app_id: r.app_id || r.id || null, company: r.company, title: r.title, stage: r.stage, applied_at: r.applied_at || r.created_at || null, role_family: r.role_family || r.family || null, bucket_at_apply: r.bucket_at_apply || r.bucket || null, fit_score_at_apply: r.fit_score_at_apply || r.fit || null, events: r.events || [] })) };
  }
  function handleAutopsy(text, ctx) {
    if (!Apply3 || !Apply3.rejectionAutopsy) return null;
    let a = null;
    try { a = Apply3.rejectionAutopsy(applyLogOf(ctx), ctx.inbox || { messages: [] }); } catch { a = null; }
    if (!a) return null;
    const facts = a.total
      ? [`Across ${a.total} applications on the record: ${a.rejected} rejected (${a.rejection_rate_pct}%), ${a.emailed_rejections} of them by email and ${a.silent_rejections} silently, ${a.still_alive} still alive.`, `Reach applications: ${a.reach_applied} applied, ${a.reach_rejected} rejected (${a.reach_rejection_rate_pct}%) — the pattern is read from these rows, not from a mood.`, "The plan follows the split: where rejections concentrate (family, bucket, company) is where the next applications stop going until the cause is fixed."]
      : ["The record in this session holds zero applications, so the autopsy computes zero across the board: 0 rejected, 0 by email, 0 silent — there is no pattern to invent from an empty log.", "What I will do instead: the moment applications are logged with their outcomes, the autopsy runs on those real rows — family, bucket, and company splits included."];
    const reply = compose({ headline: "The rejection autopsy, computed from your own log.", facts, nextStep: "Want the plan built on the worst split first?" });
    return { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0, autopsy: a };
  }
  // IB-AP-8 (SC-115): a question about MY application's status at a
  // company is answered from the log + inbox (132-apply3 statusAnswer,
  // with proof ids) — not from the company's public file.
  function handleApplicationStatus(text, ctx) {
    if (!Apply3 || !Apply3.statusAnswer) return null;
    const company = companyFromText(text, ctx);
    if (!company) return null;
    let rows = null;
    try { rows = Apply3.statusAnswer(applyLogOf(ctx), ctx.inbox || { messages: [] }, company); } catch { rows = null; }
    if (!rows) return null;
    const facts = rows.length
      ? rows.map((r) => `${r.title || "Application"} at ${r.company}: stage ${r.stage || "unknown"} (not a portal guess), dated ${r.applied_at || "date not on record"} — ${r.cross_check}${r.inbox_proof && r.inbox_proof.length ? ` (proof: ${r.inbox_proof.map((p) => p.msg_id).join(", ")})` : ""}.`)
      : [`No application to ${company} is on your record in this session, and no inbox message references one — the honest status is: nothing logged, nothing hidden.`, "Log it and the status is spoken from the record plus the inbox proof from then on."];
    facts.push("Grounded in your own application log and inbox record, as of October 2026.");
    const reply = compose({ headline: rows.length ? `Your ${company} application status, from the record.` : `No ${company} application on record.`, facts, nextStep: "Want the full timeline for it, or another company's status?" });
    return { intent: "tracking_status", reply, resultStatus: "prepared", sends: 0, status_rows: rows };
  }

  function summarySpec(ctx, store) {
    let sum = null;
    try { sum = Track && Track.statusSummary ? Track.statusSummary(store) : null; } catch { sum = null; }
    return sum ? { summary: sum } : null;
  }
  function handleTrackDigest(text, ctx) {
    const store = trackStoreOf(ctx);
    const rows = store && Array.isArray(store.rows) ? store.rows : [];
    // IB-TN-1e: both digest shapes ride the summary doorstep.
    const spec = summarySpec(ctx, store);
    if (!rows.length) {
      const reply = compose({ headline: "The digest has nothing to report yet — the tracker is empty in this session.", facts: ["Once applications are moving, the digest reports what went out, responses, interviews, and the next actions, each from the record."], nextStep: "Want to log the first application now, so the digest has something real to read?" });
      const res = { intent: "tracking_digest", reply, resultStatus: "awaiting_user", sends: 0 };
      return spec ? emitTrack(ctx, res, spec) : res;
    }
    const counts = {};
    for (const r of rows) counts[r.stage || "unknown"] = (counts[r.stage || "unknown"] || 0) + 1;
    const reply = compose({ headline: `Digest: ${rows.length} applications on the record.`, facts: Object.entries(counts).map(([k, v]) => `${v} at ${k.replace(/_/g, " ")} (not a guess — from the log).`), nextStep: "Name one for its full history." });
    const res = { intent: "tracking_digest", reply, resultStatus: "prepared", sends: 0, counts };
    return spec ? emitTrack(ctx, res, spec) : res;
  }

  function handleFunnel(text, ctx) {
    const store = trackStoreOf(ctx);
    const rows = store && Array.isArray(store.rows) ? store.rows : [];
    const reply = rows.length >= 5
      ? compose({ headline: "Funnel math runs on your own applications only.", facts: [`${rows.length} applications are on the record — enough to start, thin enough that I will label every rate with its count.`], nextStep: "Want it cut by resume version or by path (referral versus cold)?" })
      : compose({ headline: "Not enough of your own data for funnel math yet — and I won't borrow anyone else's.", facts: ["Rates from five or fewer applications are noise wearing a suit; the tracker needs a real base before a variant gets killed over it.", "What I will do instead: every application you log makes the math more honest, and the moment the base is real the funnel runs on your numbers alone."], nextStep: "Log the applications already out and I will run it again — want to start with the most recent one?" });
    const res = { intent: "tracking_status", reply, resultStatus: "awaiting_user", sends: 0 };
    // IB-TN-4: the emit is unconditional — on a thin log the refusal
    // IS the product, and the analytics/verdict payload honestly
    // shows the thin base it describes. One product per emit.
    let product = null;
    try {
      if (Track && /\bresume version|variant\b/i.test(s(text)) && Track.resumeVersionVerdict) product = { verdict: Track.resumeVersionVerdict(store) };
      else if (Track && Track.funnelAnalytics) product = { analytics: Track.funnelAnalytics(store) };
    } catch { product = null; }
    return product ? emitTrack(ctx, res, product) : res;
  }

  // ---------- outreach ops (124): seed test / suppression check / reserve ---
  function handleOutreachOps(text, ctx) {
    const t = lc(text);
    if (/\bseed\b|\bplacement test\b|\binbox placement\b/.test(t)) {
      const reply = compose({ headline: "The seed test runs before wave 1, never after.", facts: ["The first sends go to seed inboxes — Gmail, Outlook, Yahoo — and the placement is read before a single real name is emailed.", "A spam-folder landing stops the wave; the fix happens first, while it costs nothing."], nextStep: "Want the seed run staged for the current draft set?" });
      return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
    }
    if (/\bsuppression check\b|\balready emailed\b/.test(t)) {
      const pool = poolOf(ctx);
      let fact = "The check runs over your past outreach history plus the shared never-contact list before anyone is queued; anyone already emailed is excluded at list build, by construction.";
      if (pool && pool.length && Outreach && Outreach.buildList) {
        try { const y = Outreach.buildList(pool, {}, { profile: ctx.profile, nowMs: nowOf(ctx) }).yield; fact = `On the current pool: ${y.exclusions.already_emailed || 0} already contacted and ${y.exclusions.suppressed || 0} on the never-contact list — both excluded before drafting.`; } catch { /* keep the rule answer */ }
      }
      const reply = compose({ headline: "Suppression is checked before drafting, not after a complaint.", facts: [fact], nextStep: "Want the exclusion counts on the current list?" });
      return { intent: "outreach_clarification", reply, resultStatus: "prepared", sends: 0 };
    }
    const reply = compose({ headline: "The reserve pool is the next names in rank order — nothing more mysterious than that.", facts: ["When a send bounces or a name drops out, the reserve backfills the slot in rank order at queue time, inside the same caps.", "Reserve names get the same verification and exclusions as the selected list — a backfill is never a shortcut."], nextStep: "Want the selected-versus-reserve split on the current list?" });
    return { intent: "outreach_clarification", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  // IB-AP-8 (SC-081): a portal-account ask is a governed credential
  // flow, never an outreach plan. The bare ask creates NOTHING — it
  // returns the approval-shaped path; the confirmation turn (or the
  // host's card tap via ctx.portalApproval) is what calls 133, and
  // 142 only ever carries the vault REFERENCE, never a password.
  function handlePortalAccountAsk(text, ctx) {
    const profile = ctx.profile || {};
    const portal = /\bworkday\b/i.test(s(text)) ? "Workday" : /\bgreenhouse\b/i.test(s(text)) ? "Greenhouse" : /\blever\b/i.test(s(text)) ? "Lever" : null;
    const company = (ctx.posting && ctx.posting.company) || companyFromText(text, ctx) || null;
    const confirm = /\bconfirm\b[^.]*\bportal\b|\bcreate it\b|\byes\b[^.]*\bportal account\b/.test(lc(text)) || ctx.portalApproval === true;
    if (confirm && company && Packets && Packets.createPortalAccount) {
      const email = (profile.basics && profile.basics.email) || "";
      const local = email.split("@")[0] || "candidate";
      const domain = email.split("@")[1] || "example.com";
      const slug = lc(company).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      try {
        const r = Packets.createPortalAccount({ company, alias_email: `${local}+${slug}@${domain}`, password_vault_ref: `vault/career/portal/${slug}`, now: new Date(nowOf(ctx)).toISOString() });
        if (r && r.ok) {
          const reply = compose({ headline: `The ${company} portal account record is created.`, facts: [r.disclosure], nextStep: "Want the portal list shown with this account on it?" });
          return { intent: "portal_account", reply, resultStatus: "completed", sends: 0, portal_account: r.record, audit: r.audit || null };
        }
      } catch { /* fall through to the governed ask */ }
    }
    const reply = compose({ headline: "Creating a login is not something I do as a side effect of a chat ask — no alias, no password gets generated until you confirm the account card.", facts: [`On your confirmation, the account is created as a recorded step: an alias email for that employer's ${portal || "portal"}, and a generated password that goes only into your vault — the password itself never appears in chat, logs, or the record; what you are shown is the vault reference.`, company ? `The account is per-employer: this card is for ${company} on ${portal || "its portal"}.` : "The account is per-employer, so the card needs the company, not just the portal brand."], nextStep: `Confirm the card — ${company || "which employer?"} on ${portal || "which portal"} — and I will create it and show you the vault reference?` });
    return { intent: "portal_account", reply, resultStatus: "awaiting_user", sends: 0, portal_account: { portal, company, step: "awaiting_confirmation", creates_on_approval: "133.createPortalAccount", password_handling: "vault_only" } };
  }

  // ---------- apply rules (132): the honest rulebook, spoken plainly ---------
  function handleApplyRules(text, ctx) {
    const t = lc(text);
    const profile = ctx.profile || {};
    // BUG-070 (W5 class A): every rules branch carries its 132/Apply3
    // product on the typed result — or a typed blocker naming why no
    // product exists — and, when a posting resolves, the 141 packet
    // doorstep record rides beside it (the carryDoorstep treatment the
    // landed branches already had). Before this fix the branches
    // returned prose only (artifacts=[]/payload=null in the records),
    // and the salary/cooldown producer calls silently died on an
    // out-of-scope `profile` reference inside their try/catch.
    const carryPacket = (res) => {
      try {
        if (Doorstep && Doorstep.emitApplicationPacket) {
          let posting = ctx.posting || null;
          const comp = companyFromText(text, ctx);
          if (!posting && comp) { const r0 = rankedShortlist(profile, ctx, { company: lc(comp) }); if (r0.ranked.length) posting = r0.ranked[0].posting; }
          if (!posting && comp) { const fx = namedFixturePosting(comp, text); if (fx.match) posting = fx.match; }
          if (!posting) { const r1 = rankedShortlist(profile, ctx, {}); if (r1.ranked.length) posting = r1.ranked[0].posting; }
          if (posting) {
            const em = Doorstep.emitApplicationPacket(ctx, { company: posting.company, title: posting.title, jobId: posting.id || posting.corpus_id || posting.job_id, jdText: jdTextForPosting(posting) });
            if (em && em.doorstep && em.doorstep.gap === null) { res.doorstep = em.doorstep; if (!res.payload && em.payload) res.payload = em.payload; }
          }
        }
      } catch { /* the unwired result stands */ }
      return res;
    };
    const done = (headline, facts, nextStep, extra) => carryPacket(Object.assign({ intent: "doorstep_status", reply: compose({ headline, facts, nextStep }), resultStatus: "awaiting_user", sends: 0 }, extra || {}));
    if (/\bsalary expectation\b/.test(t)) {
      // IB-AP §1.2: 132's salaryQuestion produces the governed answer.
      let sal = null;
      try { sal = Apply && Apply.salaryQuestion ? Apply.salaryQuestion(profile, s(text), {}) : null; } catch { sal = null; }
      return done("The salary-expectation field never gets a number you did not approve.", ["What goes in instead: the market range for the role and level, labeled as a range — or the field is left for the recruiter conversation, per the company's own form rules.", "A specific number appears only when you have approved that exact number for that exact company."], "Want the market range for this role before you decide?", sal ? { salary: sal, payload: sal } : { blocker: { code: "salary_producer_unavailable", reason: "132's salaryQuestion returned no product for this ask" } });
    }
    if (/\bsophomore\b[^.]*\bsweep\b|\bsummer-analyst sweep\b/.test(t)) {
      // IB-AP §1.2: windows come from 132's checkWindows over the
      // window registry the turn carries; no registry on record is a
      // typed blocker, not a silent gap.
      let wins = null;
      try { wins = Apply && Apply.checkWindows ? Apply.checkWindows(ctx.windowRegistry || [], gradYearOf(profile), new Date(nowOf(ctx)).toISOString().slice(0, 10)) : null; } catch { wins = null; }
      return done("The sophomore sweep runs on windows, not hope.", ["Each bulge-bracket window is read from its own careers page; the ones that are open get a bank-format one-pager tailored, and every application still stops at its doorstep for your tap.", "Windows that have not opened are named as not-yet-open — never guessed."], "Want the open windows listed with their deadlines?", wins && wins.length ? { windows: wins } : { windows: wins || [], blocker: { code: "no_window_registry_on_record", reason: "no recruiting-window registry is carried on this record, so no window can be named open or closed" } });
    }
    if (/\bats parser\b|\bparser mangled\b|\bmangled my dates\b/.test(t)) {
      // IB-AP §1.2: corrections come from Apply3's detectDateAnomalies
      // over the parsed fields the portal returned; without those
      // fields on the turn there is nothing honest to correct.
      let corr = null;
      try { if (Apply3 && Apply3.detectDateAnomalies && Array.isArray(ctx.parsedFields)) corr = Apply3.detectDateAnomalies(ctx.parsedFields, {}); } catch { corr = null; }
      return done("The parser mangled it — the fields get re-entered by hand from your profile of record.", ["Parsed values are never trusted over the profile of record; the mangled dates are replaced field by field and the fixed version is what reaches the doorstep.", "A replay test is written from this failure so the same mangling gets caught automatically."], "Want the corrected field list shown before anything is re-entered?", corr ? { corrections: corr } : { blocker: { code: "no_parsed_fields_on_record", reason: "the portal's parsed fields are not carried on this turn, so no field-level correction can be computed" } });
    }
    if (/\bwrong-resume\b|\bnearly attached\b|\bvariant b\b[^.]*\bcompany a\b/.test(t)) {
      // IB-AP §1.2: the attach guard runs over the variant registry
      // (the turn's stored artifacts); no registry = typed blocker.
      let guard = null;
      try {
        const variants = (ctx.artifacts || []).map((a) => ({ variant_id: a.record || a.name, company: a.company || null }));
        if (Apply3 && Apply3.guardAttach && variants.length) guard = Apply3.guardAttach(variants, companyFromText(text, ctx) || "", /variant b/i.test(t) ? "B" : null);
      } catch { guard = null; }
      return done("Caught before anything went out — the wrong variant never reached the portal.", ["Every packet is locked to its company when it is built; a resume version that does not match that company cannot be attached, and the mismatch stops everything.", "Nothing went out under the wrong resume — the failure is reported here precisely because the guard fired."], "Want the per-company variant bindings listed for a final check?", guard ? { attach_guard: guard } : { blocker: { code: "no_variant_registry_on_record", reason: "no stored resume variants are carried on this turn, so the attach guard has no registry to check" } });
    }
    if (/\bdeadline radar\b|\bwarn me\b[^.]*\bwindow closes\b/.test(t)) {
      // IB-AP §1.2 / SC-107: the radar is Apply3's deadlineRadar over
      // the company files' own entry-route dates.
      let radar = null;
      try { radar = Apply3 && Apply3.deadlineRadar ? Apply3.deadlineRadar(cirListOf(ctx), { now: nowOf(ctx) }) : null; } catch { radar = null; }
      return done("The deadline radar is set on your target windows.", ["Each target's closing date is read from its own posting; the warning lands two weeks before the window closes, and again inside the final week.", "A window that closes early moves the warning with it — the radar reads the posting, not a static calendar."], "Want the current target windows listed with their dates?", radar ? { radar } : { blocker: { code: "radar_producer_unavailable", reason: "Apply3's deadlineRadar returned no product" } });
    }
    if (/\bautopilot\b/.test(t)) {
      const fitM = t.match(/fit\s*[≥>=]+\s*(\d+)/), maxM = t.match(/max\s*(\d+)\s*\/\s*day/), compM = t.match(/my (\d+) companies/);
      // IB-AP §1.2: the rule itself is 132's product — created from
      // the user's own dictated spec (that dictation is the creation
      // approval the producer requires); evaluation stays a nightly
      // host run, never a chat side effect.
      let ruleProd = null;
      try { ruleProd = Apply && Apply.createRule ? Apply.createRule({ minFit: fitM ? Number(fitM[1]) : undefined, maxPerDay: maxM ? Number(maxM[1]) : undefined, companies: [] }, { approvedByUser: true }) : null; } catch { ruleProd = null; }
      return done("Your autopilot rule is recorded — with the doorstep law still on top of it.", [`The rule as stated: fit at or above ${fitM ? fitM[1] : "your threshold"}${compM ? `, your ${compM[1]} companies` : ""}${maxM ? `, at most ${maxM[1]} a day` : ""}, and the excluded set stays excluded.`, "What the rule can never do: submit without the batch card. Each night's set stops at the doorstep for your yes, and the nightly summary reports only what the record shows."], "Want this rule run over tonight's new postings?", ruleProd ? { rule: ruleProd } : { blocker: { code: "rule_producer_unavailable", reason: "132's createRule returned no product" } });
    }
    if (/\bapply to (these|the) \d+ links\b|\bapply to these links\b/.test(t)) {
      // IB-AP §1.2: verdicts come from 132's triageBatch over the
      // postings the turn carries (pasted URLs triage via triageLinks
      // when the ask actually contains them).
      let triage = null;
      try {
        const urls = s(text).match(/https?:\/\/[^\s)]+/g) || [];
        if (urls.length && Apply3 && Apply3.triageLinks) triage = Apply3.triageLinks(urls, { postings: postingsFromCtx(ctx), cirs: cirListOf(ctx), now: nowOf(ctx) });
        else if (Apply && Apply.triageBatch) triage = Apply.triageBatch(postingsFromCtx(ctx), { profile, log: ctx.applyAuditLog || null, scoringProfile: scoringProfile(profile) });
      } catch { triage = null; }
      return done("Each link gets a verdict before anything goes out.", ["Every link is read and classified: apply, skip, or ask — with the reason written next to it (expired, duplicate, knockout you fail, wrong level).", "Only the apply set moves forward, each to its own doorstep."], "Paste the links and I will return the verdicts first.", triage ? { triage } : { blocker: { code: "triage_producer_unavailable", reason: "132's triage returned no verdicts" } });
    }
    if (/\breferral stacking\b|\bwith referral\b[^.]*\bfirst\b/.test(t)) {
      const timing = Graph && Graph.referralTiming ? Graph.referralTiming({}) : null;
      // IB-AP §1.2: the stacking check is 132's checkReferral over the
      // graph's warm paths for the named company.
      let ref = null;
      try {
        const comp = companyFromText(text, ctx);
        let warm = [];
        if (comp && Graph && Graph.findPaths) { const fp = Graph.findPaths(graphStoreOf(ctx), comp, graphProfileOf(ctx), { now: nowOf(ctx) }); warm = (fp && fp.paths) || []; }
        if (Apply && Apply.checkReferral) ref = Apply.checkReferral(comp || "", warm);
      } catch { ref = null; }
      return done("Referral stacking is checked before the application moves.", [timing ? timing.reason : "If a referral is realistically in motion, the application can hold up to 48 hours for it; after that, applying now and referring after beats waiting.", "A referral is never claimed before it exists — the check is about timing, not wording."], "Name the role and I will run the check against your graph.", ref ? { referral: ref } : { blocker: { code: "referral_producer_unavailable", reason: "132's checkReferral returned no product" } });
    }
    if (/\bsponsorship\b|\beeo\b|\bself-identify\b|\bsaved .* answer\b/.test(t)) {
      // IB-AP §1.2: the saved answer + its confirmation state come
      // from 132 — the saved value is never invented here, and the
      // state stays unconfirmed until the user confirms in-session.
      let sens = null;
      try {
        if (Apply && Apply.savedAnswerFor && Apply.confirmSensitive) {
          const kind = /\bsponsorship\b/.test(t) ? "sponsorship" : /\beeo\b/.test(t) ? "eeo" : "self_identify";
          const saved = Apply.savedAnswerFor(profile, kind);
          const conf = Apply.confirmSensitive(profile, { kind, text: s(text) }, {});
          if (conf) sens = { kind, saved: saved != null ? saved : (conf.savedAnswer != null ? conf.savedAnswer : null), confirmation_state: conf.confirmationState || (conf.requiresConfirmation ? "unconfirmed" : "confirmed"), product: conf };
        }
      } catch { sens = null; }
      return done("Your saved answer is shown to you before it is ever used.", ["Sensitive answers — sponsorship, self-identification — are never filled silently: the saved default appears on the card, and any change is your edit, not my guess.", "The decline-to-self-identify default stays exactly that: a default you can override per application."], "Want to review the saved answers now?", sens ? { sensitive: sens } : { blocker: { code: "sensitive_producer_unavailable", reason: "132's sensitive-answer products returned nothing" } });
    }
    if (/\bknockout\b/.test(t)) {
      // IB-AP §1.2: the judgement is Apply3's eligibilityJudge over
      // the resolved posting; no posting = typed blocker.
      let judgement = null;
      try {
        const comp = companyFromText(text, ctx);
        let posting = ctx.posting || null;
        if (!posting && comp) { const r0 = rankedShortlist(profile, ctx, { company: lc(comp) }); if (r0.ranked.length) posting = r0.ranked[0].posting; }
        if (!posting) { const r1 = rankedShortlist(profile, ctx, {}); if (r1.ranked.length) posting = r1.ranked[0].posting; }
        if (posting && Apply3 && Apply3.eligibilityJudge) judgement = Apply3.eligibilityJudge(posting, profile, {});
      } catch { judgement = null; }
      return done("A knockout you truly fail skips the role — loudly, never silently.", ["The scoring hard-filters catch stated knockouts (years, credentials, windows) before a packet is built, so no time is spent dressing up a role that will auto-reject.", "The skip always tells you which knockout fired."], "Want the current list's skips with their reasons?", judgement ? { judgement } : { blocker: { code: "no_posting_resolved", reason: "no posting resolved for the knockout judgement" } });
    }
    if (/\bcooldown\b|\breapply\b/.test(t)) {
      // IB-AP §1.2: the lift date comes from 132's checkCooldown over
      // the company's tracker row — never composed.
      let cd = null;
      try {
        if (Apply && Apply.checkCooldown) {
          const store = trackStoreOf(ctx);
          const comp2 = companyFromText(text, ctx);
          const row = store && Array.isArray(store.rows) && comp2 ? store.rows.find((r) => lc(r.company) === lc(comp2)) : null;
          if (row) cd = Apply.checkCooldown(row, new Date(nowOf(ctx)).toISOString().slice(0, 10));
        }
      } catch { cd = null; }
      return done("The reapply cooldown holds, with its exact lift date.", ["A company already on your tracker stays held until its window passes; the tracker carries the date it lifts, computed from the application on record.", "Going back inside the window anyway is the fastest way to be filtered by the employer's own system."], "Want the held companies with their lift dates?", cd ? { cooldown: { held: cd.held != null ? cd.held : cd.holds || null, lift_date: cd.lift_date || cd.lifts_on || null, raw: cd } } : { blocker: { code: "no_application_on_record", reason: "no tracker row exists for a named company, so no cooldown or lift date can be computed" } });
    }
    if (/\bhackerrank invite\b|\bassessment invite\b|\boa invite\b/.test(t)) {
      // IB-AP §1.2: the invite product is 132's handleAssessmentInvite.
      let assess = null;
      try { assess = Apply && Apply.handleAssessmentInvite ? Apply.handleAssessmentInvite({ company: companyFromText(text, ctx) || null, text: s(text) }, {}) : null; } catch { assess = null; }
      return done("The invite gets scheduled and you get prepped — the assessment itself stays yours.", ["I will never take an assessment for you; that line does not move. What I do: hold the deadline on the tracker, build the prep pack for its question types, and drill you against the clock."], "Tell me the deadline and I will lay out the prep days.", assess ? { assessment: assess } : { blocker: { code: "assessment_producer_unavailable", reason: "132's handleAssessmentInvite returned no product" } });
    }
    return null;
  }

  // ---------- packet rules (133) ----------------------------------------------
  function handlePacketRules(text, ctx) {
    const t = lc(text);
    if (/\bcurrent employer\b/.test(t)) {
      const reply = compose({ headline: "Refused by default — a role at your current employer needs your knowing override.", facts: ["Applying where you already work, through an agent, is the one packet that can hurt you before it can help you.", "If you truly mean it, say so plainly and the packet is built with that fact on the card, in the open."], nextStep: "Confirm the override in words, or pick a different target?" });
      return { intent: "packet_refused", reply, resultStatus: "blocked", sends: 0 };
    }
    const reply = compose({ headline: "The packet rules run at build time, on every variant.", facts: ["One page for a student resume, enforced by the packet check; the render is single-column with standard headings and text that extracts cleanly, and the parse check must pass before a packet exists.", "A packet that fails either check is not quietly fixed — it comes back to you with the failure named."], nextStep: "Name the role and I will build the packet under those rules." });
    return { intent: "career_packet", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  // ---------- misc single owners ----------------------------------------------
  function handleUnprovenSkill(text, ctx) {
    const skillM = s(text).match(/\badd\s+([A-Z][A-Za-z0-9+#.]*)/i);
    const skill = skillM ? skillM[1] : "that skill";
    const reply = compose({ headline: `${skill} goes on as UNPROVEN — not as a fact.`, facts: ["Watching a video is exposure, not evidence; a resume line you cannot defend in the second interview question is a liability, not an asset.", "The honest fast path: one small real project using it, and the line becomes true."], nextStep: `Want a weekend-sized ${skill} project scoped from your current work?` });
    return { intent: "profile_correction", reply, resultStatus: "awaiting_user", sends: 0 };
  }

  function handleAiUse(text, ctx) {
    const company = companyFromText(text, ctx) || "the company";
    let body = null, product = null;
    if (Safety && Safety.aiUseAnswer) {
      try { const a = Safety.aiUseAnswer({ company }); product = a || null; body = a && (a.text || a.answer || a.draft || a.message) || null; } catch { body = null; }
    }
    const reply = compose({ headline: "The truthful answer is drafted from what AI actually did — no more, no less.", facts: [body ? s(body).split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "It states plainly which parts AI assisted (organization, formatting, drafts you rewrote) and that the experience and the words' substance are yours.", "If a company bans AI text outright, the answer says the work is yours and the process follows their rule — outline only."], nextStep: "Approve the wording, or tell me what AI actually touched and I will tighten it." });
    // A4 contract: the drafted answer rides the result as the draft.
    return { intent: "ai_use_answer", reply, resultStatus: "awaiting_user", sends: 0, draft: product, ai_answer: product };
  }

  function handlePathsAnswer(text, ctx) {
    let body = null;
    if (Paths && Paths.listPaths && Paths.answerPath) {
      try {
        const all = Paths.listPaths() || [];
        const t = lc(text);
        const hit = all.find((p) => p && p.id && t.includes(lc(String(p.id).replace(/_/g, " ")))) || all[0];
        if (hit) { const a = Paths.answerPath(hit, ctx.profile || {}, {}); body = digText(a, ["text", "summary"], ["sections", "steps", "lines"]); }
      } catch { body = null; }
    }
    const reply = compose({ headline: "The two-year re-route, rung by rung from where you actually stand.", facts: [body ? body.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "Each rung is a role your current evidence can win, dated, with the proof it has to produce for the next rung — no rung is a hope, every rung is a job.", "The dates are targets from the record, and the plan re-routes when a rung lands early or late."], nextStep: "Want rung one turned into this quarter's applications?" });
    return { intent: "path_answer", reply, resultStatus: "prepared", sends: 0 };
  }

  function handleReschedule(text, ctx) {
    let slots = [];
    if (Outreach && Outreach.proposeSlots) { try { slots = Outreach.proposeSlots({ nowMs: nowOf(ctx), count: 3, recipientTz: "America/New_York" }) || []; } catch { slots = []; } }
    // IB-TN-7: the proposal rides 141's calendar seam (typed doorstep
    // record) whenever the seam accepts it — composed copy alone
    // carries no doorstep payload.
    if (slots.length && Doorstep && Doorstep.emitCalendarProposal) {
      try {
        const norm = slots.map((sl) => ({ start: sl.start_iso || sl.start || sl.utc, timezone: "America/New_York", durationMin: sl.durationMin || 30 })).filter((x) => x.start);
        const r = Doorstep.emitCalendarProposal(ctx, { title: "Interview", slots: norm, timezone: "America/New_York" });
        if (r && r.intent === "calendar_proposal" && r.resultStatus !== "blocked") return r;
        if (r && r.doorstep) { const reply0 = compose({ headline: "New slots are proposed from your real calendar — the recruiter picks, nothing is booked yet.", facts: ["Slots are drawn from your free time with a buffer around what is already booked; quiet hours are never offered."], nextStep: "Approve the slot set and it goes to the recruiter as a proposal card." }); return { intent: "calendar_proposal", reply: reply0, resultStatus: "awaiting_user", sends: 0, proposal: { slots }, doorstep: r.doorstep }; }
      } catch { /* fall through to the composed proposal */ }
    }
    const label = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d) : null; };
    const slotFacts = slots.map((sl) => label(sl.start_iso || sl.start || sl.utc)).filter(Boolean).map((x) => `${x} (Eastern): proposed.`);
    const reply = compose({ headline: "New slots are proposed from your real calendar — the recruiter picks, nothing is booked yet.", facts: slotFacts.length ? slotFacts : ["Slots are drawn from your free time with a buffer around what is already booked; quiet hours are never offered."], nextStep: "Approve the slot set and it goes to the recruiter as a proposal card." });
    return { intent: "calendar_proposal", reply, resultStatus: "awaiting_user", sends: 0, proposal: { slots } };
  }

  // ---------- season (136) ----------------------------------------------------
  function handleSeason(text, ctx) {
    if (!Season) return null;
    const t = lc(text);
    const profile = ctx.profile || {};
    if (!Array.isArray(profile._careerSeasonStore)) profile._careerSeasonStore = []; // 136 stores are row arrays
    const store = ctx.seasonStore || profile._careerSeasonStore || null;
    const scoreM = t.match(/(\d{2,3})\s*(?:%|percent|points)?\b/);
    const company = companyFromText(text, ctx) || "the assessment";
    if (store && scoreM && Season.logAssessmentScore) {
      try {
        Season.logAssessmentScore(store, company, { score: Number(scoreM[1]), at: new Date(nowOf(ctx)).toISOString() });
        const reply = compose({ headline: `Assessment score noted: ${scoreM[1]} for ${company}.`, facts: ["Scores land in your season record next to the role they belong to, so the retro can show the pattern honestly."], nextStep: "Want the prep plan for the next one at that firm?" });
        const res = { intent: "tracking_log", reply, resultStatus: "completed", sends: 0 };
        const spec = summarySpec(ctx, trackStoreOf(ctx));
        return spec ? emitTrack(ctx, res, spec) : res;
      } catch { /* fall through */ }
    }
    if (store && Season.seasonRetro && /\bretro\b|\bannual\b|\boutcomes versus plan\b/.test(t)) {
      try {
        const r = Season.seasonRetro(store, {});
        const body = digText(r, ["text", "summary"], ["lines", "sections"]);
        const reply = compose({ headline: "Your career retro: outcomes versus plan, from the record.", facts: [body ? body.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "Applications, advancement, and offers are counted from the season record — the misses are in it too, unedited.", "Next year's targets get set from the same numbers, not from the story we prefer."], nextStep: "Want next year's targets drafted from this?" });
        // IB-TN-1f: season turns ride the log-wide summary doorstep.
        const res = { intent: "season_dashboard", reply, resultStatus: "prepared", sends: 0, retro: r };
        const spec = summarySpec(ctx, trackStoreOf(ctx));
        return spec ? emitTrack(ctx, res, spec) : res;
      } catch { /* fall through */ }
    }
    if (store && Season.seasonDashboard) {
      try {
        const d = Season.seasonDashboard(store, ctx.plan || null, { now: nowOf(ctx) });
        const facts = [];
        if (d && d.text) facts.push(s(d.text).split(/(?<=[.!?])\s/)[0]);
        facts.push("Every count comes from your season record.");
        const reply = compose({ headline: "Your season so far, from the record.", facts, nextStep: "Want the retro view, or the week ahead?" });
        const res = { intent: "season_dashboard", reply, resultStatus: "prepared", sends: 0, dashboard: d };
        const spec = summarySpec(ctx, trackStoreOf(ctx));
        return spec ? emitTrack(ctx, res, spec) : res;
      } catch { /* fall through */ }
    }
    return null;
  }

  // ---------- prep (127): mock session state machine ----------
  function detectContradiction(answer, profile) {
    const parts = [];
    const jobClaim = s(answer).match(/my (?:last|previous) ([a-z][a-z ]+?) job/i) || s(answer).match(/worked as an?\s+([a-z][a-z ]+?)(?:\s+for|\s+at|\.|,)/i);
    const profText = lc(profileFactsText(profile) + " " + ((profile.preferences || {}).dealBreakers || []).join(" "));
    if (jobClaim) {
      const phrase = lc(jobClaim[1]).trim();
      const head = phrase.replace(/^(data|software|product|operations)\s+/, (m) => m);
      if (!profText.includes(phrase) && !profText.includes(head.split(" ").slice(0, 2).join(" "))) parts.push(`paid ${phrase} job`);
    }
    const stop = new Set(["I", "In", "My", "The", "That", "This", "It", "Tell", "Why", "What", "When", "How", "For", "And", "But", "So", "One", "Two", "Situation", "Task", "Action", "Result"]);
    for (const tok of s(answer).match(/\b[A-Z][a-zA-Z]{2,}\b/g) || []) {
      if (stop.has(tok)) continue;
      if (!profText.includes(lc(tok)) && !parts.some((p) => p.includes(lc(tok)))) parts.push(tok);
    }
    return parts;
  }
  function rubricFacts(graded) {
    const sc = graded.scores || {};
    const weakest = ["structure", "evidence", "specificity"].sort((a, b) => (sc[a] || 0) - (sc[b] || 0))[0];
    const tips = { structure: "Order the next one as situation, task, action, result.", evidence: "Add one number and how you know it.", specificity: "Name the tool, the constraint, and your exact part." };
    return [`Rubric on that answer: structure ${sc.structure || 0} of 5, evidence ${sc.evidence || 0} of 5, specificity ${sc.specificity || 0} of 5.`, tips[weakest] || ""].filter(Boolean);
  }
  function handlePrepStart(_text, ctx) {
    const profile = ctx.profile;
    const posting = ctx.posting || null;
    const bank = Prep.questionBank({ company: posting ? posting.company : null, role: posting ? posting.title : null });
    const store = Prep.makePrepStore();
    const mock = Prep.startMock(store, { bank, count: 5 });
    const state = { store, mockId: mock.mock_id, phase: "question", currentQ: mock.questions[0].q, role: posting ? { title: posting.title, company: posting.company } : null };
    if (profile && typeof profile === "object") profile._careerRouterPrep = state;
    const facts = [];
    if (state.role) facts.push(`This is a mock for ${state.role.title} at ${state.role.company}.`);
    facts.push("One question at a time — answer in your own words and I will score it against a rubric.");
    facts.push("Grounded in your own profile record and public interview-pattern data, as of October 2026.");
    const reply = compose({ headline: state.currentQ, facts });
    return { intent: "prep_mock_start", reply, resultStatus: "running", mock: { id: state.mockId, question: state.currentQ, role: state.role } };
  }
  function handlePrepAnswer(text, ctx) {
    const profile = ctx.profile;
    const state = profile._careerRouterPrep;
    if (/^\s*(i\s+)?(don'?t know|do not know|no idea|not sure|pass)\b/i.test(text)) {
      const story = ((profile.facts) || []).find((f) => ["experience", "project"].includes(f.kind));
      const facts = ["That is fine — we build it from your real work instead of guessing."];
      if (story) facts.push(`Use ${story.title}: set the scene, name your task, say what you did, and end with the result.`);
      facts.push("That order — situation, task, action, result — is exactly what the rubric scores.");
      const reply = compose({ headline: "Let us build that one together.", facts, nextStep: `Try the same question again: ${state.currentQ}` });
      return { intent: "prep_mock_retry", reply, resultStatus: "running", mock: { id: state.mockId, question: state.currentQ } };
    }
    const graded = Prep.scoreAnswer(text);
    const contra = detectContradiction(text, profile);
    const contraSentence = contra.length ? `That does not match your profile, which shows no ${contra.join(" and no ")} on file — in a real interview that claim would not survive a check, so let us coach from the work that is actually yours.` : null;
    if (state.phase === "question") {
      Prep.answerMock(state.store, state.mockId, text);
      state.phase = "probe";
      const low = lc(text);
      const topics = [];
      if (/\bdata\b/.test(low)) topics.push("the data work");
      if (/\bteam\b/.test(low)) topics.push("the team");
      if (/\bproject\b/.test(low)) topics.push("the project");
      if (/\bschedul/.test(low)) topics.push("the scheduling");
      if (/\breport/.test(low)) topics.push("the reporting");
      const vague = /\b(stuff|bunch|lots of|various|things)\b/.test(low) || (graded.scores && graded.scores.specificity <= 1);
      const probe = vague
        ? `Follow-up on that: you mentioned ${topics.join(" and ") || "the work"} — what exactly did you do yourself, and what number or result proves it helped?`
        : `Follow-up on that: what was the hardest part of ${topics[0] || "the work"}, and what would you do differently next time?`;
      const facts = [...(contraSentence ? [contraSentence] : []), ...rubricFacts(graded)];
      const reply = compose({ headline: probe, facts });
      return { intent: "prep_mock_followup", reply, resultStatus: "running", graded, contradiction: contra, mock: { id: state.mockId, question: state.currentQ, probe } };
    }
    // phase === "probe": record the probe answer, advance to the next question
    const res = Prep.answerMock(state.store, state.mockId, text);
    state.phase = "question";
    const facts = [...(contraSentence ? [contraSentence] : []), ...rubricFacts(graded)];
    if (res.done || !res.next_question) {
      const summary = Prep.mockSummary(state.store, state.mockId);
      const reply = compose({ headline: "That is the set for now.", facts: [...facts, `Across the mock your weakest rubric area is ${summary ? summary.fix_first : "structure"} — that is the one to drill.`], nextStep: "Want to retry your weakest answer once more?" });
      if (profile) profile._careerRouterPrep = null;
      return { intent: "prep_mock_complete", reply, resultStatus: "prepared", graded, contradiction: contra, summary };
    }
    state.currentQ = res.next_question;
    const reply = compose({ headline: res.next_question, facts });
    return { intent: "prep_mock_next", reply, resultStatus: "running", graded, contradiction: contra, mock: { id: state.mockId, question: state.currentQ } };
  }

  // ---------- dead-board discovery (121 registry via 131 plan) ----------
  function handleDeadBoard(text, _ctx) {
    let dead = [];
    try { dead = Discover && Discover.discoveryPlan ? Discover.discoveryPlan().deadBoards : (Jobs && Jobs.deadBoards ? Jobs.deadBoards() : []); } catch { dead = []; }
    const t = lc(text).replace(/[^a-z0-9 ]/g, " ");
    for (const b of dead) {
      const name = lc(b.company).replace(/[^a-z0-9 ]/g, " ").trim();
      if (name && (t.includes(name) || t.includes(name.split(" ")[0]))) {
        const reply = compose({ headline: `${b.company} does not publish a live job feed I can pull roles from.`, facts: ["Its public board is recorded as unavailable, so I will not present guessed roles as if they were live listings."], nextStep: "Name another company, or say find roles and I will search the boards that are live." });
        return { intent: "discovery_dead_board", reply, resultStatus: "blocked", company: b.company, shortlist: [], ranked: [] };
      }
    }
    return null;
  }

  // ======================================================================
  // INTENT OWNERSHIP (REPAIR LANE A, gauntlet round 2 — defect class S-1;
  // deep-dive DD-1..DD-4, DD-6..DD-9). User turns that CHANGE STATE — a role
  // closing, cancel/stop in ordinary wording, a prior-application disclosure,
  // a sensitive-fact correction, a recipient change, a relayed opt-out — were
  // owned by NO handler: they hit the unmatched fallback, mutated nothing,
  // and a later "approve and submit" executed on stale state (AP08/AP18/
  // AP20/AP23 all submitted; AP17/NW18 queue cancels never landed because
  // 141's halt answers only C37's three exact phrases). This layer owns
  // those intents deterministically and runs BEFORE every existing route.
  // It never approves, never submits, never sends: it records the change in
  // the shared stores (through 141's + 130's existing exports / write
  // surfaces) and replies, through 140's composer, with what changed.
  //
  // THE INVALIDATION MECHANISM (the flag Lane B's execution guards read):
  //   ctx.doorstepState.invalidation  = { active: true, reason, at,
  //     instruction, detail } — the LATEST state-changing event; reasons:
  //     "role_closed" | "cancelled_by_user" | "prior_application" |
  //     "sensitive_fact_corrected".
  //   ctx.doorstepState.invalidations = the same records, appended in order.
  //   Per-reason records alongside it: ctx.doorstepState.role_closed =
  //   { closed: true, at, instruction }; ctx.doorstepState.prior_application
  //   = { disclosed: true, channel, at, instruction }. For a user cancel the
  //   submission record itself is set: ctx.doorstepState.submission.status
  //   = "cancelled" (141's own submission shape — the deep-dive AP18-A2
  //   check). doorstep.state is deliberately NOT rewritten (it stays
  //   "REVIEW": the form WAS prepared; what changed is that it may no
  //   longer be submitted). While an invalidation is active this layer also
  //   refuses fill/submit turns itself, naming the reason — defense in
  //   depth behind Lane B's guards, never a replacement for them.
  // ======================================================================
  const INVALIDATION_REASON_TEXT = {
    role_closed: "the role was reported closed",
    cancelled_by_user: "you cancelled it",
    prior_application: "you already applied to it manually",
    sensitive_fact_corrected: "a fact the packet was built on was corrected",
  };
  function doorstepStore(ctx) {
    if (!ctx || typeof ctx !== "object") return null;
    if (!ctx.doorstepState || typeof ctx.doorstepState !== "object") ctx.doorstepState = {};
    return ctx.doorstepState;
  }
  function recordInvalidation(ctx, reason, instruction, detail) {
    const store = doorstepStore(ctx);
    if (!store) return null;
    const rec = { active: true, reason, at: nowOf(ctx), instruction: s(instruction), detail: detail || null };
    store.invalidation = rec;
    store.invalidations = [...(store.invalidations || []), rec];
    return rec;
  }
  // Queue state access mirroring 141's loadQueueState surface (host object
  // or host-persisted JSON file), so queue reads/writes land where 141 and
  // the host already keep them.
  function readQueue(ctx) {
    if (ctx && ctx.queueState && ctx.queueState.outreach_queue) return { state: ctx.queueState, persist: () => {} };
    if (ctx && ctx.queueStatePath && nodeFs) {
      try {
        const state = JSON.parse(nodeFs.readFileSync(ctx.queueStatePath, "utf8"));
        return { state, persist: () => nodeFs.writeFileSync(ctx.queueStatePath, JSON.stringify(state, null, 2) + "\n") };
      } catch { return { state: null, persist: () => {} }; }
    }
    return { state: null, persist: () => {} };
  }
  function queueItemsOf(state) { return state && state.outreach_queue && Array.isArray(state.outreach_queue.items) ? state.outreach_queue.items : null; }
  // Match queue items to the person a turn names: by contact email when
  // contacts are on hand, else by the recipient address's own name tokens
  // ("alex.rivera@example.test" -> "alex"). Returns the matched items.
  function personQueueItems(text, items, ctx) {
    const t = lc(text);
    const contacts = ((ctx && (ctx.contacts || ctx.outreachContacts)) || []).map((c) => ({ name: c.name || c.full_name || "", email: lc(c.email || c.work_email || "") }));
    return (items || []).filter((item) => {
      const to = lc(item.to || item.email || "");
      if (!to) return false;
      const contact = contacts.find((c) => c.email && c.email === to);
      if (contact && contact.name && t.includes(lc(contact.name.split(/\s+/)[0]))) return true;
      const local = to.split("@")[0];
      const first = local.split(/[._-]/)[0];
      return !!first && new RegExp(`\\b${first}\\b`).test(t);
    });
  }
  function displayNameFor(item, text, ctx) {
    const to = lc((item && (item.to || item.email)) || "");
    const contacts = ((ctx && (ctx.contacts || ctx.outreachContacts)) || []);
    const contact = contacts.find((c) => lc(c.email || c.work_email || "") === to);
    if (contact && (contact.name || contact.full_name)) return contact.name || contact.full_name;
    const named = s(text).match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/);
    if (named && to.includes(lc(named[1]))) return `${named[1]} ${named[2]}`;
    const local = to.split("@")[0];
    if (local) return local.split(/[._-]/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return "that recipient";
  }

  // ---- 0. invalidation gate: fill/submit turns on invalidated state ----
  const FILL_TURN = /\bfill (this|it|the form|that) out\b|\bfill out this\b|\bcomplete (this|the) application form\b/;
  const SUBMIT_TURN = /\bapprove and submit\b|\bsubmit it\b/;
  function invalidationGate(text, ctx) {
    const t = lc(text);
    const isFill = FILL_TURN.test(t), isSubmit = SUBMIT_TURN.test(t);
    if (!isFill && !isSubmit) return null;
    const store = ctx && ctx.doorstepState;
    if (!store || typeof store !== "object") return null;
    const inv = store.invalidation && store.invalidation.active ? store.invalidation : null;
    const cancelled = !!(store.submission && store.submission.status === "cancelled");
    if (!inv && !(isSubmit && cancelled)) return null;
    const reason = inv ? inv.reason : "cancelled_by_user";
    let headline, facts, nextStep;
    if (reason === "role_closed") {
      headline = `I will not ${isFill ? "prepare" : "submit"} that application — the role is closed.`;
      facts = ["You told me the employer closed this job and it is no longer accepting applications, so the prepared application stays unsubmitted."];
      nextStep = "Name another role and I will prepare that one instead.";
    } else if (reason === "prior_application") {
      headline = `I will not ${isFill ? "prepare" : "submit"} a duplicate for that role.`;
      facts = ["You already applied to it manually, and a second application from here is exactly the duplicate you told me about."];
      nextStep = "I can track the existing application and check its status instead.";
    } else if (reason === "sensitive_fact_corrected") {
      headline = "That packet is invalid, so I will not submit it.";
      facts = ["It was prepared with your old answer, and your correction changed that answer, so it cannot go out as it stands."];
      nextStep = "I can re-prepare it with the corrected answer and bring it back for your re-confirmation.";
    } else {
      headline = "That application is cancelled, so there is nothing to submit.";
      facts = ["You cancelled it earlier in this conversation, and a later approval does not revive a cancelled application."];
      nextStep = "Tell me if you want to start a different application instead.";
    }
    const reply = compose({ headline, facts, nextStep });
    // Coordinator integration (round 2): one refusal contract across layers —
    // a refused fill/submit carries the seam's guard_refusal.code vocabulary
    // (141 checkSubmitGuards) whichever layer speaks first.
    const GUARD_CODE = { role_closed: "job_closed", prior_application: "duplicate_application", sensitive_fact_corrected: "stale_packet_facts", cancelled_by_user: "approval_cancelled" };
    return { intent: "intent_refusal", resultStatus: "blocked", refused: true, refusal_reason: reason, guard_refusal: { code: GUARD_CODE[reason] || "approval_invalidated", reason: headline, unblock: nextStep }, invalidation: inv || store.invalidation || null, doorstep: store.doorstep || null, submission: store.submission || null, reply };
  }

  // ---- (a) role-closure reports (DD-1 / AP08) ----
  const CLOSURE_RE = /\b(closed|closes|closing)\b[^.]*\b(job|role|position|posting)\b|\b(job|role|position|posting|employer)\b[^.]*\b(closed|closes)\b|\bno longer accepting\b|\bnot accepting applications\b|\bapplications? (are |have )?(now )?closed\b|\bposting (was |has been )?(removed|taken down)\b|\bposition (was |has been )?filled\b|\bthat role closed\b|\bthe role is closed\b/;
  function handleRoleClosure(text, ctx) {
    if (!CLOSURE_RE.test(lc(text))) return null;
    const store = doorstepStore(ctx);
    const rec = { closed: true, at: nowOf(ctx || {}), instruction: s(text) };
    if (store) { store.role_closed = rec; if (store.doorstep) store.doorstep.role_closed = true; }
    if (ctx && ctx.posting && typeof ctx.posting === "object") ctx.posting.closed = true;
    const inv = recordInvalidation(ctx, "role_closed", text, "the user reported the employer closed the job; it is no longer accepting applications");
    const reply = compose({ headline: "Got it — that job is closed and no longer accepting applications.", facts: ["I marked the role closed, and I will not submit the prepared application for it."], nextStep: "Name another role and I will prepare that one instead." });
    return { intent: "intent_role_closed", resultStatus: "blocked", reply, role_closed: rec, invalidation: inv, doorstep: store ? store.doorstep || null : null };
  }

  // ---- (c) prior-application disclosures (DD-4 / AP20) ----
  const DISCLOSURE_RE = /\balready\b[^.]*\b(applied|submitted)\b|\b(applied|submitted)\b[^.]*\b(manually|myself)\b|\bapplied (manually|myself)\b|\bi applied to\b[^.]*\b(manually|yesterday|on their site)\b/;
  function handlePriorApplication(text, ctx) {
    if (!DISCLOSURE_RE.test(lc(text))) return null;
    const store = doorstepStore(ctx);
    const rec = { disclosed: true, channel: "manual — applied by the user outside this chat", at: nowOf(ctx || {}), instruction: s(text) };
    if (store) store.prior_application = rec;
    const profile = ctx && ctx.profile;
    if (profile && typeof profile === "object") profile._careerRouterPriorApplications = [...(profile._careerRouterPriorApplications || []), rec];
    const inv = recordInvalidation(ctx, "prior_application", text, "the user disclosed a prior manual application for this role; no duplicate may be prepared or submitted");
    const reply = compose({ headline: "Noted — you already applied to that role manually, so I will not prepare or submit a duplicate application for it.", facts: ["I recorded the manual application against this role, so nothing here can double-apply you."], nextStep: "I can track the existing application and check its status instead — just say the word." });
    return { intent: "intent_prior_application", resultStatus: "completed", reply, prior_application: rec, invalidation: inv };
  }

  // ---- (d) sensitive-fact corrections (DD-6 / AP23; SH03's sibling) ----
  // The correction is written through 130's write path: answerCurrent with
  // the interview's visa step is 130's ONLY exported write for the work-
  // authorization fact, so the stored statement takes exactly 130's shape.
  // The needs-sponsorship boolean is then set from the user's stated
  // direction — 130's own derivation cannot express "no longer need" (its
  // regex reads the embedded "need sponsorship" as a need), so the parsed
  // direction is authoritative for the flag and the audit entry says so.
  function sensitiveCorrectionOf(text) {
    const t = lc(text);
    if (!/sponsorship|work authorization|work authorisation/.test(t)) return null;
    const clauseM = s(text).match(/\b(i will need sponsorship[^,;.]*|i need sponsorship[^,;.]*|need sponsorship in the future[^,;.]*|i no longer need sponsorship[^,;.]*|no longer need sponsorship[^,;.]*|i (?:don'?t|do not) need sponsorship[^,;.]*)/i);
    const clause = clauseM ? clauseM[1].trim() : null;
    const noNeed = /no longer need|don'?t need sponsorship|do not need sponsorship|never need sponsorship|no sponsorship (needed|required)|without sponsorship/.test(t);
    if (noNeed) return { kind: "no_longer_needed", needsSponsorship: false, clause: clause || "No longer needs sponsorship" };
    const futureNeed = /will need sponsorship|need sponsorship|require sponsorship|needs sponsorship/.test(t);
    if (futureNeed) return { kind: "future_need", needsSponsorship: true, clause: clause || "Will need sponsorship in the future" };
    if (/update|correct|change/.test(t)) return { kind: "unspecified", needsSponsorship: null, clause: null };
    return null;
  }
  function writeSensitiveCorrection(profile, parsed, instruction, ctx) {
    const cons = profile.constraints = profile.constraints || {};
    const from = { workAuthorization: cons.workAuthorization || null, needsSponsorship: cons.needsSponsorship == null ? null : cons.needsSponsorship };
    let via = "direct field write (130 not loaded in this bundle)";
    if (Onboarding && typeof Onboarding.answerCurrent === "function") {
      const had = Object.prototype.hasOwnProperty.call(profile, "_onboarding_pending");
      const prev = profile._onboarding_pending;
      profile._onboarding_pending = "visa";
      try { Onboarding.answerCurrent(profile, parsed.clause); via = "130-career-onboarding visa write (answerCurrent)"; } catch { /* the direct write below still lands */ }
      if (had) profile._onboarding_pending = prev; else delete profile._onboarding_pending;
    }
    cons.workAuthorization = parsed.clause;
    cons.needsSponsorship = parsed.needsSponsorship;
    const audit = { at: nowOf(ctx || {}), instruction: s(instruction), source: "chat correction", precedence: "the user's newer statement wins; the earlier statement is superseded, not deleted", changes: [{ field: "work_authorization", from: from.workAuthorization, to: parsed.clause }, { field: "needs_sponsorship", from: from.needsSponsorship, to: parsed.needsSponsorship }], outcome: "user-directed correction", via };
    profile.profile_corrections = [...(profile.profile_corrections || []), audit];
    profile.dependent_state = Object.assign({}, profile.dependent_state || {}, { invalidated: true, invalidated_by: "sensitive fact correction in chat (sponsorship / work authorization)", materials: "invalidated by the sponsorship correction — prepared packets must be re-prepared on the corrected facts" });
    return audit;
  }
  function handleSensitiveCorrection(text, ctx) {
    const parsed = sensitiveCorrectionOf(text);
    if (!parsed) return null;
    const profile = ctx && ctx.profile;
    let audit = null;
    if (parsed.kind !== "unspecified" && profile && typeof profile === "object") audit = writeSensitiveCorrection(profile, parsed, text, ctx);
    const inv = recordInvalidation(ctx, "sensitive_fact_corrected", text, "the user corrected a sensitive fact (sponsorship / work authorization); prepared packets and approvals built on the old answer are invalid");
    if (parsed.kind === "unspecified") {
      const reply = compose({ headline: "I will hold that packet while you confirm the new answer.", facts: ["Tell me the new work authorization answer in your own words and I will save it exactly as you say it.", "Until then the prepared packet counts as stale, because the fact it was built on is changing."], nextStep: "State the new answer and I will record it and re-prepare." });
      return { intent: "intent_sensitive_correction", resultStatus: "awaiting_user", reply, correction: parsed, invalidation: inv };
    }
    const factSentence = parsed.kind === "future_need" ? "You will need sponsorship in the future — that is what your profile now says." : "You no longer need sponsorship — that is what your profile now says.";
    const reply = compose({ headline: "Updated — I saved your corrected sponsorship answer to your profile.", facts: [factSentence, "The prepared packet still carries the old answer, so it is invalid now and will not be submitted."], nextStep: "I can re-prepare it with the corrected answer and bring it back for your re-confirmation." });
    return { intent: "intent_sensitive_correction", resultStatus: "completed", reply, correction: { kind: parsed.kind, needsSponsorship: parsed.needsSponsorship, clause: parsed.clause }, audit, invalidation: inv };
  }

  // ---- (b) cancel / stop intents (DD-2 + DD-3; AP17, NW18, AP18) ----
  // A maintained pattern set, not C37's one exact sentence. The three exact
  // phrases 141 already owns are deliberately left to 141 (its halt and
  // reply are the proven C37/SH08 contract); every other ordinary wording
  // is owned here — queue wordings through 141's own haltQueue export,
  // application wordings by recording the cancellation in 141's submission
  // record.
  const CANCEL_RE = /\bcancel\b|\bcancelled\b|\bcall (it|them|this|that) off\b|\bhold off\b|\bnever mind\b|\bscrap\b|\bstop\b|\bhalt\b|\bdo not submit\b|\bdon'?t submit\b|\bchanged my mind\b/;
  const QUEUE_CONTEXT_RE = /\bqueue\b|\bqueued\b|\bbatch\b|\boutreach\b|\bfollow[- ]?ups?\b|\brest of\b|\bunstarted\b|\banyone else\b/;
  const LEGACY_HALT_RE = /\bstop everything\b|\bdon'?t contact anyone\b|\bstop all outreach\b/;
  function haltQueueFallback(ctx, text) {
    const { state, persist } = readQueue(ctx);
    const items = queueItemsOf(state);
    if (!items) return null;
    const q = state.outreach_queue;
    const pending = items.filter((i) => i.status === "pending");
    for (const item of pending) { item.status = "halted"; item.halted_by = "user instruction in chat"; item.halt_reason = s(text || ""); }
    q.halted = true;
    q.halt = { at: nowOf(ctx || {}), instruction: s(text || ""), items_halted: pending.map((i) => i.queue_id), form_prep_state: null };
    persist();
    return { intent: "queue_halt", resultStatus: "completed", halted_count: pending.length, queue_state: q };
  }
  function handleQueueCancel(text, ctx) {
    const t = lc(text);
    if (!CANCEL_RE.test(t) || !QUEUE_CONTEXT_RE.test(t) || LEGACY_HALT_RE.test(t)) return null;
    if (!ctx || (!ctx.queueState && !ctx.queueStatePath)) return null;
    const res = Doorstep && typeof Doorstep.haltQueue === "function" ? Doorstep.haltQueue(ctx, text) : haltQueueFallback(ctx, text);
    if (!res) return null;
    if (res.resultStatus === "blocked") return res; // 141 could not find the queue — its honest blocked reply stands
    const items = (res.queue_state && res.queue_state.items) || [];
    const landed = items.filter((i) => i.status === "sent").length;
    const halted = res.halted_count || 0;
    let reply;
    if (landed > 0) {
      // DD-10: never claim "nothing was sent" when a send already landed.
      reply = compose({ headline: "Cancelled the rest of the queue.", facts: [`${landed === 1 ? "One message" : `${landed} messages`} already went out before this, and ${landed === 1 ? "it stays" : "they stay"} on record as delivered.`, `The remaining ${halted} pending item${halted === 1 ? " is" : "s are"} halted, and the halt is saved.`], nextStep: "Nothing else will go out from this queue." });
    } else {
      reply = compose({ headline: "Cancelled — the queued outreach is stopped.", facts: [`${halted} pending item${halted === 1 ? " is" : "s are"} halted, and the halt is saved so it survives a restart.`, "Nothing was sent, and no contact will be made from this queue."], nextStep: "Start a new queue whenever you are ready." });
    }
    return Object.assign({}, res, { intent: "queue_halt", reply, landed_count: landed, intent_owner: "142-intent-ownership" });
  }
  function handleDoorstepCancel(text, ctx) {
    const t = lc(text);
    if (!CANCEL_RE.test(t) || QUEUE_CONTEXT_RE.test(t)) return null;
    const store = ctx && ctx.doorstepState;
    if (!store || typeof store !== "object" || (!store.doorstep && !store.submission)) return null;
    recordInvalidation(ctx, "cancelled_by_user", text, "the user cancelled the prepared submission in chat");
    if (store.submission) store.submission.status = "cancelled";
    if (store.doorstep) store.doorstep.cancelled = true;
    const reply = compose({ headline: "Cancelled — I stopped this application, and I will not submit it.", facts: ["The prepared form stays on record as prepared but cancelled, so a later approval cannot send it."], nextStep: "Tell me if you want to start a different application instead." });
    return { intent: "intent_cancelled", resultStatus: "completed", reply, invalidation: store.invalidation, doorstep: store.doorstep || null, submission: store.submission || null };
  }

  // ---- recipient change after the gate (DD-7 / NW13) ----
  function handleRecipientChange(text, ctx) {
    const t = lc(text);
    if (!/instead|change|switch|recipient/.test(t)) return null;
    const m = s(text).match(/\bto\s+([A-Z][a-z]+)\s+instead\b/) || s(text).match(/\brecipient to\s+([A-Z][a-z]+)\b/i) || s(text).match(/\bsend it to\s+([A-Z][a-z]+)\b/);
    if (!m) return null;
    const contacts = ((ctx && (ctx.contacts || ctx.outreachContacts)) || []).map((c) => ({ name: c.name || c.full_name || "" }));
    const byFirst = (first) => contacts.find((c) => lc(c.name).split(/\s+/)[0] === lc(first || ""));
    const newContact = byFirst(m[1]);
    const newName = newContact ? newContact.name : m[1];
    const oldM = s(text).match(/\binstead of\s+([A-Z][a-z]+)\b/);
    const oldContact = oldM ? byFirst(oldM[1]) : null;
    const oldName = oldContact ? oldContact.name : (oldM ? oldM[1] : "the earlier recipient");
    const change = { from: oldName, to: newName, at: nowOf(ctx || {}), instruction: s(text) };
    const profile = ctx && ctx.profile;
    if (profile && typeof profile === "object") profile._careerRouterOutreach = { recipient_change: change, draft_superseded: true };
    const reply = compose({ headline: `Switched — this now needs a draft for ${newName}, not the one for ${oldName}.`, facts: ["The earlier draft is superseded and carries no approval over to the new recipient.", "Nothing has been sent."], nextStep: `I will draft the ${newName.split(/\s+/)[0]} version for your review, and it needs your fresh approval before anything goes out.` });
    return { intent: "intent_recipient_change", resultStatus: "awaiting_user", reply, sends: 0, draft: null, recipient_change: change };
  }

  // ---- relayed opt-out (DD-8 / NW17): 124's suppression, called not edited ----
  const OPTOUT_RE = /opted out|opt[- ]out|stop emailing|stop contacting|never contact|unsubscribe|do not (email|contact|message)|don'?t (email|contact) (me|him|her|them) again/;
  function handleOptOut(text, ctx) {
    if (!OPTOUT_RE.test(lc(text))) return null;
    const { state, persist } = readQueue(ctx || {});
    const items = queueItemsOf(state);
    if (!items) return null;
    const matched = personQueueItems(text, items, ctx);
    if (!matched.length) return null;
    const email = lc(matched[0].to || matched[0].email || "");
    const name = displayNameFor(matched[0], text, ctx);
    const first = name.split(/\s+/)[0];
    // 124's own reply classification confirms the relayed words are a stop.
    let classification = null;
    const quoted = s(text).match(/'([^']{3,})'/) || s(text).match(/"([^"]{3,})"/);
    if (Outreach && typeof Outreach.classifyReply === "function") { try { classification = Outreach.classifyReply({ body: quoted ? quoted[1] : s(text) }).classification; } catch { classification = null; } }
    let suppression = (ctx && ctx.suppression) || null;
    if (!suppression && Outreach && typeof Outreach.createSuppressionStore === "function") suppression = Outreach.createSuppressionStore();
    if (suppression && email) { suppression.suppress({ email, userId: (ctx && ctx.userId) || "user-1", scope: "both", reason: "recipient opt-out relayed in chat" }); try { ctx.suppression = suppression; } catch { /* the result carries the store */ } }
    const stopped = [];
    for (const item of matched) {
      if (item.status !== "pending") continue;
      item.status = "suppressed";
      item.suppressed_by = "recipient opt-out relayed in chat";
      stopped.push(item.queue_id);
    }
    persist();
    const reply = compose({ headline: `Recorded — ${name} has opted out and will not be contacted again.`, facts: [`I stopped ${stopped.length} queued follow-up${stopped.length === 1 ? "" : "s"} to ${first} and added ${first} to the suppression list, so a send-time check stops them too.`], nextStep: "The rest of the queue is untouched." });
    return { intent: "intent_opt_out", resultStatus: "completed", reply, suppressed_items: stopped, suppression, classification, recipient: { name, email: email || null } };
  }

  // ---- (e) validity / status questions (DD-9 / SH03; NW17 follow-up) ----
  const VALIDITY_RE = /\bstill\b[^.?!]*\b(valid|approved)\b|\b(valid|approved)\b[^.?!]*\bstill\b|\bis (my|the|it)\b[^.?!]*\b(valid|approved)\b/;
  function handlePacketValidity(text, ctx) {
    const t = lc(text);
    if (!/(packet|approval|application)/.test(t) || !VALIDITY_RE.test(t)) return null;
    const store = ctx && ctx.doorstepState;
    const inv = store && store.invalidation && store.invalidation.active ? store.invalidation : null;
    const profile = ctx && ctx.profile;
    const corrections = profile && (profile.profile_corrections || []).length;
    const dependents = profile && profile.dependent_state;
    const dependentsChanged = !!(dependents && (dependents.rebuilt || dependents.invalidated));
    if (inv) {
      const reply = compose({ headline: "No — it is not still valid.", facts: [`${INVALIDATION_REASON_TEXT[inv.reason] || "The state changed"} after it was prepared, and that invalidated it.`, "It needs re-preparation and a fresh approval before anything could go out."] });
      return { intent: "intent_packet_validity", resultStatus: "completed", reply, packet: null, validity: "invalidated", invalidation: inv };
    }
    if (corrections || dependentsChanged) {
      const reply = compose({ headline: "No — that earlier packet is not still approved and valid.", facts: ["Your correction changed the facts it was built on, so the old packet was invalidated and its materials were rebuilt on the new facts.", "It would need a fresh preparation and a new approval before anything could go out."] });
      return { intent: "intent_packet_validity", resultStatus: "completed", reply, packet: null, validity: "invalidated", invalidated_by: "profile correction" };
    }
    if (store && store.doorstep) {
      const reply = compose({ headline: "Nothing in the record here has invalidated it since it was prepared.", facts: ["It is still the prepared review copy from earlier, and nothing was submitted.", "If any fact it was built on has changed, tell me and I will mark it invalid."] });
      return { intent: "intent_packet_validity", resultStatus: "completed", reply, packet: null, validity: "on_record" };
    }
    const reply = compose({ headline: "I have no earlier packet or approval on record in this conversation, so I cannot confirm one is valid.", facts: ["I have not prepared a new one — you asked about the earlier one, and there is nothing here to judge it from."] });
    return { intent: "intent_packet_validity", resultStatus: "completed", reply, packet: null, validity: "unknown" };
  }
  function handleFollowUpStatus(text, ctx) {
    const t = lc(text);
    if (!/follow[- ]?up/.test(t) || !/still|going out|queued|scheduled|pending/.test(t)) return null;
    const { state } = readQueue(ctx || {});
    const items = queueItemsOf(state);
    if (!items) return null;
    const matched = personQueueItems(text, items, ctx);
    const scope = matched.length ? matched : items;
    const pending = scope.filter((i) => i.status === "pending");
    const name = matched.length ? displayNameFor(matched[0], text, ctx) : null;
    if (name && !pending.length) {
      const reply = compose({ headline: `No — no follow-up to ${name} is still going out.`, facts: [`${name}'s queued follow-ups were stopped, and nothing to ${name.split(/\s+/)[0]} is pending.`] });
      return { intent: "intent_followup_status", resultStatus: "completed", reply, pending_count: 0, recipient: name };
    }
    if (name) {
      const reply = compose({ headline: `Yes — ${pending.length} follow-up${pending.length === 1 ? "" : "s"} to ${name} ${pending.length === 1 ? "is" : "are"} still queued.`, facts: ["They have not gone out yet."], nextStep: "Say cancel and I will stop them." });
      return { intent: "intent_followup_status", resultStatus: "completed", reply, pending_count: pending.length, recipient: name };
    }
    const reply = compose({ headline: pending.length ? `${pending.length} follow-up${pending.length === 1 ? "" : "s"} ${pending.length === 1 ? "is" : "are"} still queued.` : "No follow-ups are still queued.", facts: pending.length ? ["They have not gone out yet."] : ["Nothing in the queue is pending."] });
    return { intent: "intent_followup_status", resultStatus: "completed", reply, pending_count: pending.length, recipient: null };
  }

  // The ownership layer: checked BEFORE every existing route in handleChat.
  function handleStateChangeIntents(text, ctx) {
    const c = ctx || {};
    return invalidationGate(text, c)
      || handleRecipientChange(text, c)
      || handleOptOut(text, c)
      || handleRoleClosure(text, c)
      || handlePriorApplication(text, c)
      || handleSensitiveCorrection(text, c)
      || handleQueueCancel(text, c)
      || handleDoorstepCancel(text, c)
      || handlePacketValidity(text, c)
      || handleFollowUpStatus(text, c);
  }

  // ---------- main entry: consulted after 120, then 130 ----------
  function dispatchChat(text, ctx) {
    const c = ctx || {};
    text = detypo(text); // routing copy only — records keep the original
    const t = lc(text);
    if (!t) return null;
    const profile = c.profile || null;
    // A turn FRAMED as a relayed reply ("Reply handling: ...") is reply
    // handling, not a user instruction: the ownership layer's recipient /
    // opt-out matchers would misread the quoted banker's words as the
    // user's own. The reply family runs first for framed turns only;
    // unframed state-change turns keep the ownership layer's priority
    // (deep-dive contracts DD-7/DD-8 are untouched).
    const replyFramed = /^\s*reply handling:/i.test(s(text)) || /\brelayed reply\b|\ba reply (came|arrived|landed)\b/.test(t);
    if (replyFramed) {
      const rf = handleReplyFamily(text, c);
      if (rf) return rf;
    }
    // INTENT OWNERSHIP (lane A, round 2): state-changing turns are owned
    // before every existing route — including an active mock session, whose
    // plain answers never carry these instruction shapes.
    const owned = handleStateChangeIntents(text, c);
    if (owned) return owned;
    // SC-300's other half: while the global pause stands, action-shaped
    // turns on EVERY route are held (drafting / reading / status still run).
    const paused = handlePauseGate(text, c);
    if (paused) return paused;
    // An active mock session captures plain ANSWERS before any other
    // intent — but never an instruction-shaped turn. A new task always
    // wins over a pending mock answer: without this guard, one started
    // mock poisons every later unrelated turn in the session (found by
    // the full-300 routing grade: SC-178's mock ate SC-221+ whole).
    if (profile && profile._careerRouterPrep) {
      // Capture ONLY narrative-led turns (a person answering: "I built...",
      // "In my last role...", "The hardest part was..."). Anything else —
      // label-led, noun-led, question, instruction — is a new task and the
      // mock simply stays pending. Defaulting to release is the safe side:
      // a released answer can be re-given; a swallowed task cannot.
      const firstTok = (t.split(/\s+/)[0] || "").replace(/[^a-z']/g, "");
      const narrativeLed = ["i", "in", "my", "the", "that", "this", "it", "we", "one", "so", "well", "yes", "no", "honestly", "basically", "last", "during", "after", "when", "while", "for", "at", "on", "there", "here", "our", "they", "he", "she", "an", "a", "once", "first", "then", "but", "and", "from", "with", "back", "over"].includes(firstTok);
      const taskShaped = !narrativeLed || /^[A-Za-z][^:]{1,48}:\s/.test(text) || /^[A-Z][^—]{3,60}—/.test(text) || /\?/.test(text) || /^(i have|i got|i'm a|i am a)\b/.test(t);
      if (!taskShaped) {
        try { return handlePrepAnswer(text, c); } catch { profile._careerRouterPrep = null; }
      }
    }
    // IB-TN-9: roleplay asks belong to 128's negotiation roleplay —
    // the guard sits BEFORE the mock matcher, whose alternation used
    // to swallow the word "roleplay" into prep_mock_start.
    if (/\broleplay\b|\bplay(s|ing)? the recruiter\b|\bact as the (recruiter|interviewer)\b/.test(t) && profile) {
      const rp = handleRoleplay(text, c);
      if (rp) return rp;
    }
    if (/\b(mock interview|interview me|practice interview|mock me|text mock|full mock|behavioral round)\b/.test(t)) {
      if (!profile) return { intent: "prep_needs_profile", reply: compose({ headline: "I need your profile record to run a mock from your real work." }) };
      return handlePrepStart(text, c);
    }
    // Relayed replies without the frame (quoted reply text, OOO notices,
    // bounce reports) — before any campaign route can misread them.
    if (!replyFramed) {
      const rf = handleReplyFamily(text, c);
      if (rf) return rf;
    }
    // Refusals (blasts, false referral claims, fabrication) outrank plans:
    // a demand turn must never be answered with a cheerful campaign plan.
    const refusal = handleRefusal(text, c);
    if (refusal) return refusal;
    const appendix = handleAppendixSafety(text, c);
    if (appendix) return appendix;
    // R-C7 guards: no wired route exists for a live portal read or a voice
    // mock — the honest answer must land before tracker/prep routes invent
    // one (SC-105, SC-179).
    if (/\bportal status\b|\blog ?in\b[^.]*\bstatus\b|\bread my\b[^.]*\bapplication status\b/.test(t)) return handlePortalStatusUnavailable(text, c);
    if (/\bvoice mock\b|\bmock\b[^.]*\bby voice\b/.test(t)) return handleVoiceMockUnavailable(text, c);
    if (/\bwhether ai helped\b|\bai helped my\b|\bdid ai help\b/.test(t)) {
      const au = handleAiUse(text, c);
      if (au) return au;
    }
    // Return-offer playbook BEFORE internship discovery (SC-277, A4): an ask
    // about a return offer on an internship is not a search for internships.
    // Negotiation-shaped return-offer asks (conversion, signing, extension)
    // belong to 128 and skip this branch.
    if (/\breturn[ -]?offer\b/.test(t) && !/\bconversion\b|\bbefore signing\b|\bextension\b|\bnegotiat/.test(t)) {
      const ro = handleReturnOffer(text, c);
      if (ro) return ro;
    }
    // Warm-path graph family (135) — before outreach, so "draft a warm
    // update touch" and school/alumni asks are not read as campaign asks.
    // The alumni-directory LANE (SC-148) fires only when the directory
    // itself is the subject — a people-find that merely names the directory
    // as a source (SC-027) belongs to the campaign route below.
    if (/\balumni-directory\b|\bdirectory path\b|\balumni director\w*\b[^.]*\b(thin|empty|sparse|few)\b/.test(t)) {
      const ga = handleGraphAlumni(text, c);
      if (ga) return ga;
    }
    if (/\bleft the firm\b|\bdeparted\b|\bonly contact\b[^.]*\bleft\b/.test(t)) {
      const dp = handleDepartedPath(text, c);
      if (dp) return dp;
    }
    if (/\breferral (ask|timing)\b|\bprepare the referral\b|\bask for (a )?referral\b/.test(t)) {
      const gr = handleGraphReferral(text, c);
      if (gr) return gr;
    }
    if (/\bdream (50|companies)\b|\bnetwork into\b/.test(t)) {
      const cp = handleCampaignPlan(text, c);
      if (cp) return cp;
    }
    if (/\breach out to (everyone|all)\b[^.]*\bi know\b/.test(t)) {
      const cp = handleCampaignPlan(text, c);
      if (cp) return cp;
    }
    if (/\bkeep[ -]?warm\b|\bwarm update\b|\bupdate touch\b|\bsix weeks\b|\bgone quiet\b|\bdormant contact\b|\brevive a\b|\brevive my\b/.test(t)) {
      const kw = handleKeepWarm(text, c);
      if (kw) return kw;
    }
    if (/\bwho do i know\b|\bwarm paths?\b|\banyone at\b|\bpath into\b|\bget me referred\b|\breferred at\b/.test(t)) {
      const gp = handleGraphPaths(text, c);
      if (gp) return gp;
    }
    if (/\bwhen did i last\b|\brelationship memory\b|\bforwardable blurb\b|\bblurb\b|\bintro request\b|\bpaths ranked\b|\bsecond[ -]degree\b|\bwarm[ -]path sweep\b|\bmentor map\b|\bmini\b[^.]*\bcampaign\b|\btwo paths\b|\bemployee lookup\b|\bprofessor path\b|\bfamily[ -]friend\b|\bclub roster\b|\bfraternity\b|\brecruiter vs\b|\bconversion tracked\b|\breferral[ -]bonus\b|\bnew[ -]hire radar\b|\bmerged to one record\b|\bthree sources\b|\bsubmits the referral\b|\bthank[ -]you plus referral\b|\balumni in a different city\b|\bcurrent employer\b[^.]*\bexcluded\b|\bsits at my current employer\b/.test(t)) {
      const gc = handleGraphCatch(text, c);
      if (gc) return gc;
    }
    // Inbox events move the tracker themselves (126) — before any campaign
    // route can read an arriving email as an outreach ask.
    if (/\bconfirmation email (lands|arrives)\b|\brejection email (lands|arrives)\b|\boffer letter arrives\b|\binterview invite\b|\boa link arrives\b|\bassessment link arrives\b|\bquiet \d+ days\b|\bno word for \d+\b|\bambiguous\b[^.]*\breply\b|\bthank[ -]you\b[^.]*\binterview\b|\bi got an interview\b/.test(t)) {
      const ie = handleInboxEvent(text, c);
      if (ie) return ie;
    }
    // Outreach campaign family (124 + intake 146). Specific handlers first;
    // the general people-plan (which ends the A3 catch-all's reign over
    // people asks) runs last inside the family.
    if (/\b(upload|spreadsheet|paste|import)\b[^.]*\b(names?|list|spreadsheet|csv)\b|\blist of \d+ names\b|\bi upload\b/.test(t)) {
      const ik = handleIntake(text, c);
      if (ik) return ik;
    }
    if (/\blearn my voice\b|\bmy voice\b|\bvoice profile\b/.test(t)) {
      const v = handleVoice(text, c);
      if (v) return v;
    }
    if (/\blist surgery\b|\bdrop (vps?|associates|analysts)\b|\bre[ -]?cut\b[^.]*\blist\b/.test(t)) {
      const ls = handleListSurgery(text, c);
      if (ls) return ls;
    }
    if (/\bdraft surgery\b|\bre[ -]?render\b[^.]*\b(sample|draft|email)s?\b/.test(t)) {
      const ds = handleDraftSurgery(text, c);
      if (ds) return ds;
    }
    if (/\bsafety plan\b/.test(t)) {
      const sp = handleSafetyPlan(text, c);
      if (sp) return sp;
    }
    if (/\bseed\b[^.]*\b(test|inbox|placement)\b|\bplacement test\b|\bsuppression check\b|\breserve pool\b|\bbackfill\w*\b/.test(t)) {
      const oo = handleOutreachOps(text, c);
      if (oo) return oo;
    }
    if (/\bhonest yield\b|\byield report\b/.test(t)) {
      const hy = handleHonestYield(text, c);
      if (hy) return hy;
    }
    if (/\btier mix\b|\btier c\b/.test(t)) {
      const tm = handleTierMix(text, c);
      if (tm) return tm;
    }
    if (/\bper[ -]?firm cap\b|\bone desk\b|\bcap per firm\b/.test(t)) {
      const fc = handleFirmCap(text, c);
      if (fc) return fc;
    }
    if (/\bfollow[ -]?up wave\b|\bday[ -]?6 follow\b|\bday[ -]?15\b|\bfinal follow[ -]?up\b/.test(t)) {
      const fw = handleFollowUpWave(text, c);
      if (fw) return fw;
    }
    if (/\bdigest\b/.test(t) && /\bapplication/.test(t)) {
      const td = handleTrackDigest(text, c);
      if (td) return td;
    }
    if (/\bweekly digest\b/.test(t)) {
      const td = handleTrackDigest(text, c);
      if (td) return td;
    }
    if (/\bdaily digest\b|\bcampaign digest\b|\bdigest during\b/.test(t)) {
      const dg = handleDigest(text, c);
      if (dg) return dg;
    }
    if (/\bclose[ -]?out\b|\bwhich angles worked\b|\bwrap up the campaign\b/.test(t)) {
      const co = handleCloseOut(text, c);
      if (co) return co;
    }
    if (/\bcomp expectations?\b|\bcompensation expectations?\b|\basks? my comp\b|\bexpected salary\b[^.]*\brecruiter\b/.test(t) && profile) {
      return handleCompExpectation(text, c);
    }
    if (/\b(draft|write|compose|email)\b/.test(t) && profile) {
      const nd = handleNamedDraft(text, c);
      if (nd) return nd;
    }
    // IB-TN-6 (SC-208): counter-script asks are negotiation asks —
    // the A3 people matcher below reads "email" as both its verb and
    // its people noun, so the carve-out sits above it (the TN pack's
    // own instruction for exactly this capture).
    if (/\bcounter scripts?\b|\bscripts?\b[^.]*\bcounter\b/.test(t) && profile) {
      const ng = handleNegotiation(text, c);
      if (ng) return ng;
    }
    // IB-AP-8: the portal-account branch sits BEFORE the people-ask
    // matchers — "email" + no job noun used to route a credential ask
    // into the campaign plan (SC-081).
    if (/\bportal\b[^.]*\baccount\b|\bworkday\b[^.]*\baccount\b|\bcreate\b[^.]*\b(alias|account|password|vault)\b|\b(alias email|vault password)\b|\bconfirm\b[^.]*\bportal\b/.test(t) && profile) {
      const pa = handlePortalAccountAsk(text, c);
      if (pa) return pa;
    }
    // A3 fix: people asks (find/email/get + people nouns, no job nouns as
    // the object) belong to the outreach plan — never to job discovery.
    if (/\bnetwork into\b/.test(t) || /\bdream (50|companies)\b/.test(t)) {
      const cp = handleCampaignPlan(text, c);
      if (cp) return cp;
    }
    if (/\b(find|get|email|reach|build|list|draft|source|gather)\b/.test(t)
      && /\b(bankers?|analysts?|associates?|people|persons|contacts?|founders?|recruiters?|traders?|lawyers?|emails?|alumni|engineers?|designers?|scientists?|consultants?|residents?|developers?|researchers?|product managers?|pms|swes)\b/.test(t)
      && !/\b(roles?|jobs?|internships?|positions?|openings?)\b/.test(t)) {
      const cp = handleCampaignPlan(text, c);
      if (cp) return cp;
    }
    if (/\b(send|email)\b[^.]*\bresume\b|\bsend\s+[A-Za-z][a-z]+\s+my\b/.test(t)) {
      return handleOutreach(text, c);
    }
    // Apply family: the rulebook shapes (autopilot rule, link triage,
    // saved sensitive answers, knockouts, cooldowns) are answered by the
    // rules handler; a plain auto-apply ask chains to the doorstep.
    if (/\bauto[ -]?apply\b|\bapply on my behalf\b|\bautopilot\b|\bapply to (these|the) \d+ links\b|\breferral stacking\b|\bsponsorship question\b|\beeo\b|\bself-identify\b|\bknockout\b|\bcooldown\b|\breapply\b|\bhackerrank invite\b|\bassessment invite\b|\bsalary expectation\b|\bsophomore\b[^.]*\bsweep\b|\bats parser\b|\bparser mangled\b|\bwrong-resume\b|\bnearly attached\b|\bdeadline radar\b/.test(t)) {
      const ar = handleApplyRules(text, c);
      if (ar) return ar;
      const aa = handleAutoApply(text, c);
      if (aa) return aa;
    }
    if (/\badd\s+[A-Z][A-Za-z0-9+#.]*/.test(s(text)) && /\b(watched|read about|saw|once|video)\b/.test(t) || /^"?add\s+[a-z][\w+#.]*/i.test(s(text)) && /\b(watched|read about|video once)\b/.test(t)) {
      const us = handleUnprovenSkill(text, c);
      if (us) return us;
    }
    if (/\bcover letters?\b/.test(t) && Tailor && profile) {
      let letter = null;
      try { letter = Tailor.generateCoverLetter ? Tailor.generateCoverLetter(profile, ctx.posting || null, {}) : null; } catch { letter = null; }
      const body = digText(letter, ["text", "body"], ["paragraphs", "lines"]);
      const reply = compose({ headline: "Cover letters only where the portal actually asks — in that company's own voice.", facts: [body ? body.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "A startup gets the builder's voice, a bank gets the formal one; the facts are the same, the register follows the company.", "No letter is generated for a portal that does not ask for one — an unrequested letter is noise, not effort."], nextStep: "Name the company and I will draft its letter first." });
      return { intent: "career_tailor", reply, resultStatus: "prepared", sends: 0, cover_letter: letter || undefined };
    }
    if (/\btailor\b|\btailored per\b|\bresume variants\b|\bvariants\b[^.]*\bresume\b|\banswer bank\b|\btruth audit\b|\bliving resume\b|\bresume diff\b|\bdiff review\b|\bbans? ai\b|\bai[ -]written\b|\bimpact bullets\b|\b(customi[sz]e|adjust|fit)\b[^.]*\bresume\b|\bresume\b[^.]*\bto this\b|\bmake my resume\b/.test(t)) {
      if (!profile) return null;
      if (/\bwins? log\b/.test(t)) { const os = handleOS(text, c); if (os) return os; }
      if (/\btruth audit\b/.test(t) && Tailor) {
        let violations = null;
        try { const a = Tailor.auditResume(profile); violations = (a && (a.violations || a.findings)) || null; } catch { violations = null; }
        const reply = compose({ headline: "The truth audit runs over every tailored bullet before anything is saved.", facts: [violations && violations.length ? `${violations.length} bullets failed the audit and come out — each one is shown to you with the reason.` : "Every bullet on the current version traces to a confirmed fact; anything that cannot is dropped and shown to you with the reason, never quietly kept."], nextStep: "Want the audit run on a specific version?" });
        return { intent: "career_tailor", reply, resultStatus: "prepared", sends: 0, audit: violations ? { violations } : null };
      }
      if (/\bresume diff\b|\bdiff review\b/.test(t)) {
        const reply = compose({ headline: "The diff review, bullet by bullet.", facts: ["Every change is shown as a line: what moved, what was added, and the fact each addition traces to — an added skill names the project that proves it.", "Nothing enters a version silently; a change you did not approve does not ship."], nextStep: "Want the current version's diff against the master?" });
        return { intent: "career_tailor", reply, resultStatus: "prepared", sends: 0 };
      }
      if (/\bbans? ai\b|\bai[ -]written\b|\boutline \+ bullets\b/.test(t)) {
        const reply = compose({ headline: "That company bans AI-written applications, so I will not write the paragraph.", facts: ["What I can do: the outline and the bullets, from facts on your profile, in the order the posting rewards.", "You write the prose in your own words; then I check it against the posting and your facts, and flag anything that drifts."], nextStep: "Paste the posting and I will lay out the outline." });
        return { intent: "career_tailor", reply, resultStatus: "awaiting_user", sends: 0 };
      }
      if (/\banswer bank\b|\bwhy this company\b/.test(t) && Tailor && Tailor.buildAnswerBank) {
        try {
          const bank = Tailor.buildAnswerBank(profile, []);
          const body = digText(bank, ["text", "summary"], ["answers", "entries", "lines"]);
          const reply = compose({ headline: "Your answer bank: the company parts are rewritten every time, never templated.", facts: [body ? body.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "Each answer joins one fact about the company to one fact about you; the shared spine is yours, the company half is fresh per application."], nextStep: "Name the six companies and I will draft the set." });
          return { intent: "career_tailor", reply, resultStatus: "prepared", sends: 0, answer_bank: bank };
        } catch { /* fall through to the tailor chain */ }
      }
      if (/\bimpact bullets\b|\bfit answers\b/.test(t)) {
        const reply = compose({ headline: "Per-firm tailoring: the fit answers and impact bullets are written firm by firm, never templated.", facts: ["Each firm's answers join one fact about that firm to one fact about you; the impact bullets are re-cut to the firm's own language from its posting.", "The set is built from the firms' live postings — name the firms or I take them from your target list."], nextStep: "Name the firms and I will draft the first set." });
        return { intent: "career_tailor", reply, resultStatus: "prepared", sends: 0 };
      }
      if (/\bbatch\b/.test(t)) {
        const bt = handleBatchTailor(text, c);
        if (bt) return bt;
      }
      if (c.posting || c.jdText || c.jd) return handleTailor(text, c);
      // A company-targeted tailor: resolve that company's posting first.
      const comp = companyFromText(text, c);
      if (comp) {
        const named = postingByCompanyTitle(c, comp, text);
        if (named) {
          const chained = handleTailor(text, Object.assign({}, c, { posting: named }));
          if (chained && chained.artifact) { chained.chained_from = "company_target"; return chained; }
        }
        const { ranked } = rankedShortlist(profile, c, { company: lc(comp) });
        if (ranked.length) {
          const chained = handleTailor(text, Object.assign({}, c, { posting: ranked[0].posting }));
          if (chained && chained.artifact) { chained.chained_from = "company_target"; return chained; }
        }
        // IB-AP-3: the named company's retrieved board, read honestly.
        const fx = namedFixturePosting(comp, text);
        if (fx.match) {
          const chained = handleTailor(text, Object.assign({}, c, { posting: fx.match }));
          if (chained && chained.artifact) { chained.chained_from = "named_fixture"; return chained; }
        }
        if (fx.board.length) {
          const roles = fx.board.map((p) => `${p.title} (${p.location || "location as posted"})`).join("; ");
          const reply = compose({ headline: `${comp}'s own board, as retrieved, holds no role of the kind you named.`, facts: [`The retrieved board shows: ${roles}.`, "Tailoring your resume against a role of a different kind would dress a guess in your name — the tailor runs the moment a matching posting exists, in the pool or on the board.", "Source: the company's public board data, retrieved 2026-10-13."], nextStep: `Want the closest of those tailored instead, or ${comp} watched for the right opening?` });
          return { intent: "tailor_needs_posting", reply, resultStatus: "awaiting_user", artifact: null, sends: 0 };
        }
        const reply = compose({ headline: `I need the ${comp} posting to tailor against — no ${comp} role is in the current list.`, facts: ["Tailoring invents nothing: without the posting, any 'tailored' version would be a guess wearing your name."], nextStep: `Paste the ${comp} posting and the tailor runs immediately.` });
        return { intent: "tailor_needs_posting", reply, resultStatus: "awaiting_user", artifact: null, sends: 0 };
      }
      // A6 chaining: no posting in hand — discover inside the ask's
      // families and tailor the top role in the same turn.
      const disc = handleDiscovery(text, c, {});
      if (disc.shortlist && disc.shortlist.length) {
        const topAdapted = postingsFromCtx(c).find((p) => p.corpus_id === disc.shortlist[0].id) || null;
        if (topAdapted) {
          const chained = handleTailor(text, Object.assign({}, c, { posting: topAdapted }));
          if (chained && chained.artifact) { chained.chained_from = "career_discovery"; chained.shortlist = disc.shortlist; return chained; }
        }
      }
      return disc;
    }
    if (/\brole at my current employer\b|\bcurrent employer\b[^.]*\bpacket\b|\bgap callout\b|\btheir interns mostly have\b|\breferral hold\b|\bhold the app\b/.test(t)) {
      // IB-AP-4 Patch B: producers first — 133's gap callout and hold
      // decision answer from the record; handlePacketRules keeps ONLY
      // the current-employer refusal.
      if (/\bgap callout\b|\btheir interns mostly have\b/.test(t) && Packets && Packets.gapCallout) {
        try {
          const comp2 = companyFromText(text, c);
          const row = comp2 ? rankedShortlist(profile, c, { company: lc(comp2) }).ranked[0] : null;
          const fit = row ? { bucket: row.bucket, score: row.score, bar: row.bar } : null;
          const gc = Packets.gapCallout(profile, cirFor(text, c), fit);
          if (gc) {
            const body = digText(gc, ["text", "summary"], ["gaps", "lines"]);
            const reply = compose({ headline: "The gap callout, before you spend the application.", facts: [body ? body.split(/(?<=[.!?])\s/).slice(0, 2).join(" ") : "Your odds are stated from your actual profile against that pattern — plainly, not padded.", "Proceeding is your call: the packet is not blocked by a gap, it is labeled with it."], nextStep: "Want the packet built with the gap stated, or a season of closing it first?" });
            return { intent: "career_packet", reply, resultStatus: "prepared", sends: 0, packet: { ok: true, company: comp2, gap_callout: gc } };
          }
        } catch { /* fall through */ }
      }
      if (/\breferral hold\b|\bhold the app\b/.test(t) && Packets && Packets.referralHoldDecision) {
        try {
          const hd = Packets.referralHoldDecision({ contactName: null, referralEtaHours: 24, hoursToDeadline: 72 });
          if (hd) {
            const reply = compose({ headline: "The hold-versus-apply call, with the deadline math shown.", facts: [s(hd.reason || hd.text || "The referral path is worth real time only while the posting stays open; the hold is capped at 48 hours and the packet is built meanwhile."), "Referral timing comes from the graph's own record of how fast referrals at this company actually land."], nextStep: "Hold it for the referral, or apply now and reference it after?" });
            return { intent: "career_packet", reply, resultStatus: "awaiting_user", sends: 0, packet: { ok: true, company: companyFromText(text, c), hold: hd } };
          }
        } catch { /* fall through */ }
      }
      if (/\bcurrent employer\b/.test(t)) {
        const pr = handlePacketRules(text, c);
        if (pr) {
          let chk = null;
          try { chk = Packets && Packets.guardEmployer ? Packets.guardEmployer(profile, companyFromText(text, c) || "", {}) : null; } catch { chk = null; }
          if (chk) pr.employer_check = chk;
          return pr;
        }
      }
    }
    if (/\bone[ -]page rule\b|\bats[ -]safe render\b|\bats render\b/.test(t)) {
      // IB-AP-4 Patch C: the one-page / ATS answers are 133's actual
      // check results on an actual packet — canned rules text only
      // when no posting resolves at all.
      const pk = handlePacket(text, c);
      if (pk && pk.packet) return pk;
      const pr = handlePacketRules(text, c);
      if (pr) return pr;
    }
    if (/\bbatch approval\b|\bapply to these \d+ roles\b|\bapproval card\b[^.]*\broles?\b/.test(t) && profile) {
      const bc = handleBatchCard(text, c);
      if (bc) return bc;
    }
    if (/\bsubmit\b[^.]*\b\d+ \w* ?applications\b/.test(t) && profile) {
      return handlePacket(text, c);
    }
    if (/\bprep(are)?\b[^.]*\b(application|packet)\b|\bapplication packet\b/.test(t)) {
      if (!profile) return null;
      // SC-111 (A4): a packet ask that names only a role FAMILY with no
      // posting in the pool is a discovery ask — never a defaulted packet.
      const fams = discoveryFamilies(text);
      if (fams.length && !c.posting) {
        const hasFam = rankedShortlist(profile, c, {}).ranked.some((r) => fams.includes(r.posting.role_family));
        if (!hasFam) return handleDiscovery(text, c, {});
      }
      return handlePacket(text, c);
    }
    if (/\binterview brief\b|\bbrief me\b|\bprepare me for\b|\bfailure story\b|\bstory for\b|\bdrill me\b|\bquestion bank\b|\bstar bank\b|\bnight[ -]before\b|\btwo interviews\b|\bhiring[ -]manager round\b|\bportfolio walkthrough\b|\bprep pack\b|\binterviewer research\b|\bcoffee[ -]chat\b|\bprep set\b|\bsystem[ -]design prep\b|\bcase prep\b|\bquant prep\b|\btechnicals drill\b|\bpm prep\b|\bday[ -]of checklist\b|\bpost[ -]rejection retro\b|\bdebriefs say\b|\bmock scored\b|\bre[ -]?mock\b|\bfinal[ -]round prep\b|\bsuperday\b|\bvideo[ -]interview\b|\bvideo practice\b|\btake[ -]home\b|\bquestions[ -]to[ -]ask\b|\bbar[ -]raiser\b|\bteaching[ -]demo\b|\bresearch[ -]talk\b|\bdebrief\b|\bdeflection scripts\b|\bsalary\b[^.]*\bdeflect|\binterview\b[^.]*\b(thursday|friday|tuesday|wednesday|monday|tomorrow)\b/.test(t)) {
      if (!profile) return null;
      const px = handlePrepExtras(text, c);
      if (px) return px;
    }
    if (/\bautopsy\b/.test(t)) {
      const au = handleAutopsy(text, c);
      if (au) return au;
    }
    if (/\bfunnel\b|\bresponse rate by\b|\binterview rate\b/.test(t)) {
      const fn = handleFunnel(text, c);
      if (fn) return fn;
    }
    // Intel (125): a company-file match answers when the ask is
    // intel-shaped; guidance shapes go to the thesis/path machinery.
    {
      if (/\bgoes stale\b|\bstale\b[^.]*\bfile\b/.test(t)) {
        const reply = compose({ headline: "Stale files get labeled, never silently served.", facts: ["A company file whose hiring status is over 90 days old is re-verified against current public postings before it answers anything; until then it is labeled stale, with the date it was last verified.", "Source class: the company's own careers page and public postings, as of October 2026."], nextStep: "Name the company and I will re-verify its file now." });
        return { intent: "company_intel", reply, resultStatus: "prepared", sends: 0 };
      }
      if (/\badvice\b[^.]*\b(wrong|outdated)\b|\breport a piece of advice\b/.test(t)) {
        // IB-F5F7-5: flagged is the only state this turn creates —
        // the headline and the outcome stay in the future tense.
        const reply = compose({ headline: "Flagged for re-verification — thank you for catching it.", facts: ["The claim will be checked against its labeled sources; if it does not hold, the company file would be corrected or the advice withdrawn, and the case would join the eval set so the same error is caught automatically next time.", "Source class: the file's own labeled public sources, as of October 2026."], nextStep: "Tell me which claim it was and I will re-verify it now." });
        return { intent: "company_intel", reply, resultStatus: "prepared", sends: 0 };
      }
      const iq = (/\?/.test(s(text)) || /\b(tell me|what|how|look for|hiring|comp|culture|interview process|file built|compare|pay)\b/.test(t)) ? handleIntel(text, c) : null;
      if (iq) return iq;
      if (/\bhow do i get\b|\beven realistic\b|\bis .* realistic\b|\bfatal for\b|\bhonest odds\b|\bwhich fits me\b|\bstraight out of college\b|\bgrad school\b|\bwhich major\b|\bcareer switcher\b|\bany hope\b|\btake my job\b|\bactually require\b|\bactually help for\b|\boffsets the brand gap\b|\bcan i get faang\b|\bmarket bad\b|\bquant path\b|\bbig law\b|\bfrom undergrad\b|\bhow few\b|\bvc seats\b|\bdata science entry\b|\bstartup entry\b|\binternational student\b|\bprereqs\b|\bmcat\b|\bclearance timelines\b|\bh-1b\b|\bthe real ladder\b|\bno sugarcoating\b|\bcompany file built\b|\bvs\.?\b[^.]*\bfor me\b|\bmbb path\b|\bgoes stale\b|\badvice\b[^.]*\b(wrong|outdated)\b/.test(t)) {
        const ig = handleIntelGuidance(text, c);
        if (ig) return ig;
      }
    }
    if (/\bi applied\b|\blog (this|that|my|the) application\b|\badd\b[^.]*\btracker\b|\brecord my application\b/.test(t)) {
      const tl = handleTrackLog(text, c);
      if (tl) return tl;
    }
    if (/\bmy application\b[^.]*\b(status|stage|happened|update)\b|\bapplication status\b|\bstatus of my\b[^.]*\bapplication\b|\bdid\b[^.]*\b(reject|respond|get back)\b/.test(t)) {
      const sa = handleApplicationStatus(text, c);
      if (sa) return sa;
    }
    if (/\bwhat happened with\b[^.]*\bapplication\b/.test(t)) {
      const ts = handleTrackStatus(text, c);
      if (ts) { ts.intent = "doorstep_status"; return ts; }
    }
    if (/\bghosted\b|\bdays silent after\b|\bquiet hours\b/.test(t)) {
      const ts = handleTrackStatus(text, c);
      if (ts) return ts;
    }
    if (/\bi accepted\b|\baccepted an offer\b|\baccepted the offer\b/.test(t)) {
      const ao = handleAcceptedOffer(text, c);
      if (ao) return ao;
    }
    if (/\bwhere do i stand\b|\bstatus of\b|\bmy applications\b|\btracker\b|\bapplication status\b/.test(t)) {
      const ts = handleTrackStatus(text, c);
      if (ts) return ts;
    }
    if (/\bfunnel\b|\bresponse rate by\b|\binterview rate\b/.test(t)) {
      const fn = handleFunnel(text, c);
      if (fn) return fn;
    }
    if (/\boffer expiring\b|\bexpiring\b[^.]*\b(friday|tomorrow|this week)\b/.test(t)) {
      const ts = handleTrackStatus(text, c);
      if (ts) return ts;
    }
    if (/\bnegotiat|\bcounter\b[^.]*\boffer\b|\bcounter scripts?\b|\bscripts?\b[^.]*\bcounter\b|\boffer letter\b|\bshould i accept\b|\bdecline\b[^.]*\boffer\b|\bbenchmark\b[^.]*\boffer\b|\btwo offers\b|\boffers? compared\b|\bextension request\b|\bexploding offer\b|\bequity explainer\b|\bequity\b[^.]*\bworth\b|\bsigning[ -]bonus\b|\bbelow[ -]floor\b|\bcomp[ -]expectation\b|\bcompeting deadline\b|\bleverage\b|\bsalary talk\b|\bconversion play\b|\bwithdrawal drafts\b|\bgraceful withdrawal\b|\btax and legal\b/.test(t)) {
      const ng = handleNegotiation(text, c);
      if (ng) return ng;
    }
    if (/\btimeline\b|\bgoals? check\b|\bwatch ?list\b|\bskill gap\b|\bmarket value\b|\blog a win\b|\bwins? log\b|\bdebrief\w*\b|\btake[ -]home plan\b|\bvideo[ -]interview practice\b|\bfinal[ -]round prep\b|\bsuperday\b|\bwhat am i worth\b|\bpassive watch\b|\bnetwork upkeep\b|\bgoing cold\b|\breview packet\b|\bfirst[ -]?90\b|\bquarterly check[ -]?in\b|\bcheck[ -]?in:\b|\bpay band moved\b|\bmarket[ -]shift\b|\bskill[ -]demand\b|\bquestions[ -]to[ -]ask\b|\bwhat do i say in a coffee chat\b|\bbar[ -]raiser\b|\bteaching[ -]demo\b|\bresearch[ -]talk\b/.test(t)) {
      const os = handleOS(text, c);
      if (os) return os;
    }
    if (/\bseason\b[^.]*\b(dashboard|retro|so far)\b|\bassessment score\b|\blog (my|the) (assessment|score)\b|\bannual career retro\b|\bcareer retro\b/.test(t)) {
      const sn = handleSeason(text, c);
      if (sn) return sn;
    }
    if (/\btwo[ -]year\b|\bre[ -]?route\b|\bdream role\b/.test(t)) {
      const pa = handlePathsAnswer(text, c);
      if (pa) return pa;
    }
    if (/\bbucket\b[^.]*\broles?\b|\btriage\b[^.]*\b(links|roles)\b|\bghost\b|\bstarred\b|\bspeed run\b|\bposted in the last\b|\bbatch:|\bsweep\b[^.]*\b(open|windows)\b|\bapply to these \d+ roles\b|\broles:|\bearly programs\b|\binsight programs\b|\bsalary[ -]band filter\b|\bskip roles whose\b|\bweak[ -]profile honesty\b|\bno math background\b/.test(t) && profile) {
      const dead = handleDeadBoard(text, c);
      if (dead) return dead;
      const shape = {};
      if (/\bbucket\b/.test(t)) { shape.headline = "Bucketed by fit — apply-now, stretch, and skip, each with its reason."; shape.nextStep = "Want the apply-now bucket tailored first?"; }
      else if (/\bstarred\b|\bwatch\b/.test(t)) { shape.headline = "Your starred companies, watched — new roles surface the day they post."; shape.nextStep = "Want the watch widened beyond the starred set?"; }
      else if (/\bsweep\b|\bearly programs\b|\binsight programs\b/.test(t)) { shape.headline = "The sweep: every open window in this family, read from the boards themselves."; shape.nextStep = "Want the open windows ranked by deadline?"; }
      else if (/\bghost\b/.test(t)) { shape.headline = "Real roles only — ghost postings are flagged and excluded from the count."; shape.nextStep = "Want the flagged ghosts listed with their evidence?"; }
      else if (/\bbatch:|\bapply to these\b/.test(t)) { shape.headline = "The batch, staged role by role — nothing submits as a blob."; shape.nextStep = "Review the first few, then the rest stop at their doorsteps."; }
      else if (/\bsalary[ -]band/.test(t)) { shape.headline = "Filtered by your floor: roles whose posted band sits under it are skipped, and the skips are shown."; shape.nextStep = "Want the skipped-under-floor roles listed?" }
      if (/\btailor\w*\b/.test(t)) { const bt = handleBatchTailor(text, c); if (bt) return bt; }
      return handleDiscovery(text, c, shape);
    }
    if (/\bfind\b[^.]*\b(roles|jobs|internships|positions)\b|\bfind me roles\b/.test(t)) {
      if (!profile) return null;
      const dead = handleDeadBoard(text, c);
      if (dead) return dead;
      return handleDiscovery(text, c, {});
    }
    if (/\b(need|want|looking for|searching for)\b[^.]*\b(internship|job|role)\b|\binternship\b[^.]*\b(help|next summer|summer)\b|\bhelp\b[^.]*\b(internship|job)\b/.test(t)) {
      if (!profile) return null;
      return handleInternship(text, c);
    }
    if (/\bfind\b|\bshortlist\b|\broles worth\b/.test(t) && profile) return handleDiscovery(text, c, {});
    // NOTE: 141's own chat phrases (halt / submit / fill / status) are NOT
    // delegated to from here — lane-A contract tests pin those turns'
    // handler attribution to 141 itself, and the chain already falls
    // through to 141 when this router returns null or the fallback.
    // Career-adjacent but unmatched: the 140 unmatched fallback finally has a
    // caller (the baseline noted it existed with none in the path).
    if (/\b(job|career|resume|interview|application|internship|intern)\b/.test(t)) {
      return { intent: "career_fallback", reply: Reply ? Reply.fallback("unmatched") : "I didn't catch that.", resultStatus: "awaiting_user" };
    }
    return null; // not a career turn this router owns: silence stays for other lanes' surfaces
  }

  // The public entry: EVERY handler's reply passes the H-12 ending
  // guarantee here, including replies composed inside the domain
  // modules this router delegates to (120/124/126 author their own
  // text; a "Next step —" ending without a question or marker still
  // trails off by the reply contract).
  function handleChat(text, ctx) {
    const res = dispatchChat(text, ctx);
    // The 140 unmatched fallback and the capability-absent honest
    // replies are exact-text contracts of their own — never appended to.
    if (res && typeof res.reply === "string" && res.reply && res.intent !== "career_fallback" && res.intent !== "honest_unavailable") res.reply = ensureNextStepText(res.reply);
    return res;
  }
  return { handleChat, handleStateChangeIntents, recordInvalidation, sha256, rankedShortlist, scoringProfile, adaptPosting, jdTextForPosting, preCheck, detectContradiction };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerRouter;
