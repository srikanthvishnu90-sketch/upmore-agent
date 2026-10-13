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
  const req = (p) => { try { return typeof require !== "undefined" ? require(p) : null; } catch (e) { return null; } };
  const Jobs = typeof CareerJobs !== "undefined" ? CareerJobs : req("./121-career-jobs.js");
  const Tailor = typeof CareerTailor !== "undefined" ? CareerTailor : req("./123-career-tailor.js");
  const Outreach = typeof CareerOutreach !== "undefined" ? CareerOutreach : req("./124-career-outreach.js");
  const Prep = typeof CareerPrep !== "undefined" ? CareerPrep : req("./127-career-prep.js");
  const Discover = typeof CareerDiscover !== "undefined" ? CareerDiscover : req("./131-career-discover.js");
  const Packets = typeof CareerPackets !== "undefined" ? CareerPackets : req("./133-career-packets.js");
  const Reply = typeof CareerReply !== "undefined" ? CareerReply : req("./140-career-reply.js");

  const s = (v) => String(v == null ? "" : v);
  const lc = (v) => s(v).toLowerCase();
  const nowOf = (ctx) => { const n = ctx && ctx.now; const ms = n == null ? Date.now() : (typeof n === "number" ? n : Date.parse(n)); return Number.isFinite(ms) ? ms : Date.now(); };

  // ---------- pure-JS sha256 (no deps, so the module stays bundle-safe) ----------
  function sha256(ascii) {
    const rightRotate = (v, a) => (v >>> a) | (v << (32 - a));
    const mathPow = Math.pow, maxWord = mathPow(2, 32);
    let result = "";
    const words = [], asciiBitLength = ascii.length * 8;
    let hash = (sha256.h = sha256.h || []), k = (sha256.k = sha256.k || []);
    let primeCounter = k.length, isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    // UTF-8 encode
    const utf8 = unescape(encodeURIComponent(ascii));
    let bitLength = utf8.length * 8;
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
    if (Discover && Discover.ghostGuard) { try { kept = Discover.ghostGuard(scored, { now }).kept; } catch (e) { kept = scored; } }
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
  function handleTailor(text, ctx) {
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
      if (!profText.includes(phrase) && !profText.includes(head.split(" ").slice(0, 2).join(" "))) parts.push(`a paid ${phrase} job`);
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
  function handlePrepStart(text, ctx) {
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
    const contraSentence = contra.length ? `That does not match your profile, which has no ${contra.join(" or ")} on file — in a real interview that claim would not survive a check, so let us coach from the work that is actually yours.` : null;
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
  function handleDeadBoard(text, ctx) {
    let dead = [];
    try { dead = Discover && Discover.discoveryPlan ? Discover.discoveryPlan().deadBoards : (Jobs && Jobs.deadBoards ? Jobs.deadBoards() : []); } catch (e) { dead = []; }
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

  // ---------- main entry: consulted after 120, then 130 ----------
  function handleChat(text, ctx) {
    const c = ctx || {};
    const t = lc(text);
    if (!t) return null;
    const profile = c.profile || null;
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

  return { handleChat, sha256, rankedShortlist, scoringProfile, adaptPosting, jdTextForPosting, preCheck, detectContradiction };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerRouter;
