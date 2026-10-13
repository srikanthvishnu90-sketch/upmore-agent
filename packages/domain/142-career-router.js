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
  const Reply = typeof CareerReply !== "undefined" ? CareerReply : req("./140-career-reply.js");
  // Lane A (gauntlet round 2): the intent-ownership layer below CALLS the
  // doorstep seam (141) and the onboarding/profile write path (130) through
  // their existing exports — it never edits them. Both are guarded: in the
  // router bundle neither file is bundled, so the requires resolve to null
  // there and the handlers fall back to the stores' shared write surfaces
  // (the same ctx objects 141/130 read and write).
  const Doorstep = typeof CareerDoorstep !== "undefined" ? CareerDoorstep : req("./141-career-doorstep.js");
  const Onboarding = typeof CareerOnboarding !== "undefined" ? CareerOnboarding : req("./130-career-onboarding.js");
  const nodeFs = (() => { try { return typeof require !== "undefined" ? require("fs") : null; } catch { return null; } })();

  const s = (v) => String(v == null ? "" : v);
  const lc = (v) => s(v).toLowerCase();
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
      const fit = Jobs.scoreFit(posting, sp);
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

  function compose(result) {
    if (!Reply) return result.reply || "";
    const c = Reply.composeResult(result);
    return c.bubbles.join("\n");
  }
  function roleSentence(item) {
    const where = item.remote === "remote" ? "remote" : item.remote === "hybrid" ? `hybrid in ${s(item.location).split(",")[0]}` : s(item.location);
    const pay = item.posting.salary && item.posting.salary.raw ? `, ${item.posting.salary.raw}` : "";
    return `${item.title} at ${item.company} — ${where}${pay}: ${item.reason}; caveat: ${item.caveat}.`;
  }

  function handleDiscovery(text, ctx, opts) {
    const o = opts || {};
    const profile = ctx.profile;
    const t = lc(text);
    const countM = t.match(/(\d+)\s*(?:roles|jobs|internships)/);
    const limit = o.limit || (countM ? Number(countM[1]) : 5);
    const { ranked, excluded } = rankedShortlist(profile, ctx, o);
    const top = ranked.slice(0, limit);
    const publicFacts = {
      shortlist: top.map((r) => ({ id: r.id, title: r.title, company: r.company, location: r.location, score: r.score, bucket: r.bucket, reason: r.reason, caveat: r.caveat })),
      ranked: ranked.map((r) => ({ id: r.id, title: r.title, company: r.company, score: r.score, reason: r.reason, caveat: r.caveat })),
      excluded, resultStatus: "prepared",
    };
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
    const facts = [
      `It leads with your proven skills${matched.length ? ` for this role: ${matched.join(", ")}` : ""}, and every line traces to a fact already on your profile.`,
      gaps.length ? `Skill gap, named plainly: ${gaps.join(", ")} ${gaps.length === 1 ? "is" : "are"} named in the posting and not on your profile, so ${gaps.length === 1 ? "it was" : "they were"} not added to the resume.` : "No skill gap: every skill the posting names is evidenced on your profile.",
      `Saved as a rendered text artifact (there is no PDF renderer yet, so no PDF is claimed), sha256 ${artifact.sha256}.`,
    ];
    const reply = compose({ headline: `Your resume is tailored for ${titleLine}.`, facts, nextStep: "Review the artifact, and I can prepare the full application packet next." });
    return { intent: "career_tailor", reply, resultStatus: "prepared", artifact, gaps, tailored: { ok: true, mode: tailored.mode, version: tailored.version } };
  }

  // ---------- packets (133) + artifact binding by hash ----------
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
    const packet = { ok: true, company: posting.company, jobId: posting.id || posting.corpus_id || null, title: posting.title, submitted: false, onePage: pkt.onePage || null, ats: pkt.ats ? { ok: pkt.ats.ok } : null, artifactBinding: selected ? { file: selected.name, record: selected.record, sha256: selected.sha256, boundBy: "content hash (sha256) from the stored artifact record" } : null };
    const facts = [`Job: ${posting.title} at ${posting.company}.`];
    if (selected) facts.push(`Document: ${selected.name}, the ${descriptor} version, bound by its content hash sha256 ${selected.sha256}.`);
    else facts.push("Document: the packet carries the freshly tailored resume, because no stored version was supplied to bind.");
    facts.push("Nothing is submitted — this packet is a review copy only.");
    const reply = compose({ headline: `Your ${descriptor} application packet is ready for review.`, facts, nextStep: "Review the job and the document above; nothing goes anywhere until you approve it." });
    return { intent: "career_packet", reply, resultStatus: "prepared", packet };
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
    const user = { name: (profile.basics && profile.basics.name) || "the candidate" };
    const draft = Outreach.draftFor(candidate, user, {});
    const gate = Outreach.qualityGate ? Outreach.qualityGate(draft, candidate, {}) : null;
    const facts = [`Subject: ${draft.subject}.`, `It would come from your ${accounts[0].kind || "connected"} account, with your resume attached (${attachmentVersion}).`, "This draft is not sent — it waits for your approval."];
    const reply = compose({ headline: `A draft to ${contact.name} is ready.`, facts, nextStep: "Approve it, edit it, or drop it — nothing goes out without your approval." });
    return { intent: "outreach_draft", reply, resultStatus: "awaiting_user", clarifications: 0, missing: [], sends: 0, draft, gate };
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
      reply = compose({ headline: "Cancelled the rest of the queue.", facts: [`${landed === 1 ? "One message" : `${landed} messages`} already went out before this, and ${landed === 1 ? "it stays" : "they stay"} on record as sent.`, `The remaining ${halted} pending item${halted === 1 ? " is" : "s are"} halted, and the halt is saved.`], nextStep: "Nothing else will go out from this queue." });
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
  function handleChat(text, ctx) {
    const c = ctx || {};
    const t = lc(text);
    if (!t) return null;
    const profile = c.profile || null;
    // INTENT OWNERSHIP (lane A, round 2): state-changing turns are owned
    // before every existing route — including an active mock session, whose
    // plain answers never carry these instruction shapes.
    const owned = handleStateChangeIntents(text, c);
    if (owned) return owned;
    // An active mock session captures plain answers before any other intent,
    // unless the turn plainly starts a different career task.
    if (profile && profile._careerRouterPrep && !/\b(find|tailor|send|email|prep(are)? the|packet|mock interview|stop|start over)\b/.test(t)) {
      return handlePrepAnswer(text, c);
    }
    if (/\b(mock interview|interview me|practice interview|mock me)\b/.test(t)) {
      if (!profile) return { intent: "prep_needs_profile", reply: compose({ headline: "I need your profile record to run a mock from your real work." }) };
      return handlePrepStart(text, c);
    }
    if (/\b(tailor|customi[sz]e)\b[^.]*\bresume\b|\bresume\b[^.]*\bto this\b/.test(t)) {
      if (!profile) return null;
      return handleTailor(text, c);
    }
    if (/\bprep(are)?\b[^.]*\b(application|packet)\b|\bapplication packet\b/.test(t)) {
      if (!profile) return null;
      return handlePacket(text, c);
    }
    if (/\b(send|email)\b[^.]*\bresume\b|\bsend\s+[A-Za-z][a-z]+\s+my\b/.test(t)) {
      return handleOutreach(text, c);
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
    // Career-adjacent but unmatched: the 140 unmatched fallback finally has a
    // caller (the baseline noted it existed with none in the path).
    if (/\b(job|career|resume|interview|application|internship|intern)\b/.test(t)) {
      return { intent: "career_fallback", reply: Reply ? Reply.fallback("unmatched") : "I didn't catch that.", resultStatus: "awaiting_user" };
    }
    return null; // not a career turn this router owns: silence stays for other lanes' surfaces
  }

  return { handleChat, handleStateChangeIntents, recordInvalidation, sha256, rankedShortlist, scoringProfile, adaptPosting, jdTextForPosting, preCheck, detectContradiction };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerRouter;
