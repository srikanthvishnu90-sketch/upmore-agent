/* Career application guardrails + submission seams (Doc 2 §5.3, §5.4, §5.5, §6;
   capabilities APPE-005 sensitive-answer confirmation, APPE-007 referral
   stacking, APPE-008 batch card / caps / duplicate / audit record).
   Built 2026-10-12 in branch career/sc-f03 for scenario family F03
   (SC-047, SC-051..SC-058, SC-060) because pivot/career shipped the tailor
   (123) and discovery (121) rails but NO apply rail: the confirmation seams
   the scenario ledger names ("APPE-005 seam", "APPE-008") did not exist.

   Hard rules encoded (Doc 2, binding):
   - T3 sensitive answers (work authorization / sponsorship, salary, EEO,
     clearance, criminal history) are NEVER guessed and NEVER entered without
     the user confirming the saved value verbatim in this session (§5.3, S6).
     Salary is stricter still: no number is ever entered that the user did
     not approve; the only default is "negotiable / open" where allowed.
   - Knockout honesty (§5.3): if the user truly does not meet a stated
     requirement, the application STOPS with the reason. It proceeds only on
     an explicit user override ("apply anyway"), never silently.
   - Daily cap (§5.4, owner suggestion adopted in Doc 2: 15/day). The cap
     cannot be talked up in chat — attemptRaiseCap always refuses.
   - Duplicate protection (§5.4): no second application to the same
     company+role while a prior record exists in the application log.
   - Current-employer guard (§5.4): no applying to a company that appears as
     an employer on the master profile, unless the user explicitly confirms
     the move is intentional (the stated exception path).
   - Batch approval (§5.4/ledger SC-054): ONE card lists every role; nothing
     is recorded as approved before the user's yes.
   - Audit record (§5.5): job, company, URL, timestamp, resume version,
     cover-letter id, every question + answer + its source, confirmation
     state, referral attached (Y/N + who). Records live in an INJECTED log
     ({records: []}) so tests/scenarios own the store; this module is pure.
   - Referral stacking (§6): before submitting, check for a warm path. The
     outreach engine (124-career-outreach.js, branch career/outr) is NOT
     merged into this branch, so warm-path contacts are passed IN using
     OUTR-shaped records ({full_name, current_firm, relationship_to_user} —
     the field names 124's normalizeCandidate produces). When 124 lands, the
     caller swaps its candidate pipeline output in unchanged.
   Pure: no I/O, no network, no clock except values passed in. UMD. */
const CareerApply = (() => {
  const DAILY_CAP = 15;
  const norm = (v) => String(v == null ? "" : v).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\b(inc|llc|ltd|corp|corporation|company|co|the)\b/g, " ").replace(/\s+/g, " ").trim();

  // ---------- application log + audit record (APPE-008, Doc 2 §5.5) ----------
  function createLog() { return { records: [], _seq: 0 }; }
  function buildAuditRecord(log, input) {
    const inp = input || {};
    log._seq = (log._seq || 0) + 1;
    const rec = {
      applicationId: inp.applicationId || `APP-${String(log._seq).padStart(3, "0")}`,
      jobId: inp.jobId || null, company: inp.company || null, role: inp.role || null,
      url: inp.url || null, timestamp: inp.timestamp || null,
      resumeVersionId: inp.resumeVersionId || null, coverLetterId: inp.coverLetterId || null,
      answers: (inp.answers || []).map((a) => ({ question: a.question, answer: a.answer, source: a.source || "profile", confirmationState: a.confirmationState || "not-required" })),
      confirmationProof: inp.confirmationProof || null,
      referral: { attached: !!(inp.referral && inp.referral.attached), who: (inp.referral && inp.referral.who) || null },
      trackedAs: inp.referral && inp.referral.attached ? "referred" : "cold",
      status: inp.status || "recorded",
      channel: inp.channel || null,
    };
    log.records.push(rec);
    return rec;
  }
  function findApplications(log, query) {
    const q = query || {};
    return (log.records || []).filter((r) =>
      (!q.company || norm(r.company) === norm(q.company)) &&
      (!q.role || norm(r.role) === norm(q.role)) &&
      (!q.jobId || r.jobId === q.jobId));
  }
  function getAuditRecord(log, query) {
    const hits = findApplications(log, query);
    return hits.length ? hits[hits.length - 1] : null;
  }

  // ---------- duplicate protection (APPE-008) ----------
  function checkDuplicate(log, posting) {
    const hits = findApplications(log, { company: posting.company, role: posting.title || posting.role });
    const prior = hits.find((r) => r.jobId === (posting.job_id || posting.jobId)) || hits[0] || null;
    return prior ? { duplicate: true, prior, reason: `already applied to ${prior.company} — ${prior.role} on ${prior.timestamp ? String(prior.timestamp).slice(0, 10) : "an earlier date"} (${prior.applicationId})` } : { duplicate: false, prior: null };
  }

  // ---------- current-employer guard (APPE-008) ----------
  function profileEmployers(profile) {
    return ((profile && profile.facts) || []).filter((f) => f.kind === "experience" && f.org).map((f) => ({ org: f.org, title: f.title, factId: f.id }));
  }
  function checkCurrentEmployer(profile, company) {
    const hit = profileEmployers(profile).find((e) => norm(e.org) === norm(company));
    return hit ? { blocked: true, employer: hit, reason: `${company} is your employer on your master profile (${hit.title}, fact ${hit.factId}) — the agent does not apply to your own employer`, exceptionPath: "If this move is intentional (e.g. an internal transfer or returning full-time), say so explicitly and the guard lifts for this one application." } : { blocked: false };
  }

  // ---------- daily cap (APPE-008 guardrail) ----------
  function applicationsOn(log, dateStr) { return (log.records || []).filter((r) => r.timestamp && String(r.timestamp).slice(0, 10) === dateStr).length; }
  function enforceDailyCap(log, requestedCount, dateStr) {
    const already = applicationsOn(log, dateStr);
    const remaining = Math.max(0, DAILY_CAP - already);
    const allowed = Math.min(requestedCount, remaining);
    return { cap: DAILY_CAP, alreadyToday: already, requested: requestedCount, allowed, queuedForTomorrow: requestedCount - allowed, capped: requestedCount > allowed, message: requestedCount > allowed ? `Capped at ${DAILY_CAP} applications per day: ${allowed} can go today, ${requestedCount - allowed} queue for tomorrow.` : `${requestedCount} application(s) fit inside today's cap of ${DAILY_CAP} (${already} already recorded today).` };
  }
  function attemptRaiseCap() { return { ok: false, refused: true, cap: DAILY_CAP, reason: `the daily cap of ${DAILY_CAP} cannot be raised in chat — it is a guardrail, not a preference` }; }

  // ---------- sensitive-answer seam (APPE-005, Doc 2 §5.3 + S6) ----------
  function classifyQuestion(question) {
    const q = String(question || "").toLowerCase();
    if (/sponsor/.test(q)) return "sponsorship";
    if (/authoriz|eligible to work|legally.*work/.test(q)) return "work_authorization";
    if (/salary|compensation expect|pay expect/.test(q)) return "salary";
    if (/race|ethnic|gender|veteran|disability|demographic|eeo/.test(q)) return "eeo";
    if (/clearance/.test(q)) return "clearance";
    if (/criminal|conviction|background check/.test(q)) return "background";
    if (/years of experience|how many years/.test(q)) return "factual_years";
    return "other";
  }
  // The saved sponsorship answer, derived ONLY from profile constraints/facts.
  function savedSponsorshipAnswer(profile) {
    const c = (profile && profile.constraints) || {};
    const factText = ((profile && profile.facts) || []).map((f) => f.text || "").join(" ");
    if (c.needsSponsorship) {
      if (/F-1 OPT then H-1B/.test(factText) || /F-1/.test(String(c.workAuthorization || ""))) return "Yes — F-1 OPT then H-1B.";
      return "Yes — I will require sponsorship.";
    }
    if (c.needsSponsorship === false) return "No — I do not require sponsorship.";
    return null; // not saved: the agent must ask, never guess
  }
  function savedAnswerFor(profile, kind) {
    const c = (profile && profile.constraints) || {};
    const d = (profile && profile.defaults) || {};
    if (kind === "sponsorship") return savedSponsorshipAnswer(profile);
    if (kind === "work_authorization") return c.workAuthorization || null;
    if (kind === "clearance") return c.securityClearance || "None";
    if (kind === "eeo") return d.demographicPreference || "decline to answer";
    return null;
  }
  // Returns a confirmation PROMPT, never an entered value. Only when the
  // caller passes confirmed:true (the user's tap in this session) does the
  // result carry entered:true with the answer.
  function confirmSensitive(profile, question, opts) {
    const o = opts || {};
    const kind = classifyQuestion(question);
    if (kind === "salary") return salaryQuestion(profile, question, o);
    const saved = savedAnswerFor(profile, kind);
    if (saved == null) return { kind, requiresConfirmation: true, savedAnswer: null, entered: false, prompt: `This is a sensitive question and I have no saved answer for it — I will not guess. What should I enter for: "${question}"?` };
    if (o.confirmed === true) return { kind, requiresConfirmation: true, savedAnswer: saved, entered: true, answer: saved, confirmationState: "user-confirmed-in-session" };
    return { kind, requiresConfirmation: true, savedAnswer: saved, entered: false, prompt: `This one matters — it is a sensitive answer, so this one needs your explicit yes and I never enter it without your confirmation. Your saved answer is '${saved}' Confirm to use it? [Yes / Edit]` };
  }
  // Salary: ask, offer a SOURCED range when one is passed in, default to
  // negotiable/open. A number is entered only when the user approved that
  // exact number (opts.userApprovedNumber).
  function salaryQuestion(_profile, _question, opts) {
    const o = opts || {};
    if (typeof o.userApprovedNumber === "number" && o.userApprovedNumber > 0) {
      return { kind: "salary", requiresConfirmation: true, entered: true, answer: String(o.userApprovedNumber), confirmationState: "user-approved-number" };
    }
    return { kind: "salary", requiresConfirmation: true, entered: false, savedAnswer: null, proposedDefault: "Negotiable / open to the posted range", marketRange: o.marketRange || null, prompt: `I never enter a salary number you have not approved.${o.marketRange ? ` Sourced market range: ${o.marketRange.range} (source: ${o.marketRange.source}).` : " I have no sourced market range for this role."} I can enter 'Negotiable / open' where the form allows it, or a number you approve — which?` };
  }

  // ---------- knockout honesty (Doc 2 §5.3) ----------
  function yearsForSkill(profile, skill) {
    const facts = (profile && profile.facts) || [];
    const sk = facts.find((f) => f.kind === "skill" && norm(f.name || f.title) === norm(skill));
    if (!sk) return 0;
    const ev = require("./122-career-profile.js").skillEvidence(profile, skill);
    if (!ev.proven) return 0;
    // Conservative: one internship/project cycle counts as 1 year unless the
    // supporting facts carry explicit start/end spans summing higher.
    let months = 0;
    for (const id of ev.supportingFactIds || []) {
      const f = facts.find((x) => x.id === id);
      if (f && f.start && f.end) { const a = Date.parse(`${f.start}-01T00:00:00Z`), b = Date.parse(`${f.end}-01T00:00:00Z`); if (Number.isFinite(a) && Number.isFinite(b) && b > a) months += (b - a) / 2629800000; }
    }
    return Math.max(1, Math.round(months / 12 * 10) / 10);
  }
  function checkKnockout(profile, requirement, opts) {
    const o = opts || {};
    const req = requirement || {};
    const years = typeof req.userYears === "number" ? req.userYears : yearsForSkill(profile, req.skill);
    if (years >= req.requiredYears) return { blocked: false, years, requiredYears: req.requiredYears, skill: req.skill };
    if (o.userSaysApplyAnyway === true) return { blocked: false, override: true, years, requiredYears: req.requiredYears, skill: req.skill, reason: `requirement is ${req.requiredYears} years of ${req.skill}; profile shows ${years} — proceeding only because the user explicitly said apply anyway` };
    return { blocked: true, years, requiredYears: req.requiredYears, skill: req.skill, reason: `This form requires ${req.requiredYears} years of ${req.skill}; your profile evidences ${years}. I stopped this application rather than misstate it.`, overridePath: "Say 'apply anyway' and I will proceed with your honest numbers — I will never inflate them." };
  }

  // ---------- referral stacking (APPE-007, Doc 2 §6) ----------
  // warmPaths: OUTR-shaped records (124 normalizeCandidate field names).
  function checkReferral(company, warmPaths) {
    const hits = (warmPaths || []).filter((c) => norm(c.current_firm || c.company) === norm(company));
    if (hits.length) {
      const who = hits[0].full_name || hits[0].name;
      return { warmPathFound: true, company, contacts: hits, who, proposals: [`Hold this application 48 hours and ask ${who} for a referral first`, `Apply now and have ${who} submit the referral in parallel`], trackedSeparately: true, note: "Referred applications are tracked separately from cold applications." };
    }
    return { warmPathFound: false, company, contacts: [], proposals: ["Apply cold now", `Launch a targeted outreach mini-campaign of 5–10 people at ${company} first`], trackedSeparately: true };
  }

  // ---------- batch triage (Doc 2 S3) + batch card (SC-054) ----------
  function triageBatch(postings, ctx) {
    const c = ctx || {};
    const Jobs = require("./121-career-jobs.js");
    const scoringProfile = c.scoringProfile || null;
    return (postings || []).map((p) => {
      const reasons = [];
      if (c.expiredJobIds && c.expiredJobIds.includes(p.job_id)) return { job_id: p.job_id, company: p.company, role: p.title, decision: "skip", reasons: ["posting expired / link dead at check time"] };
      const dup = c.log ? checkDuplicate(c.log, p) : { duplicate: false };
      if (dup.duplicate) return { job_id: p.job_id, company: p.company, role: p.title, decision: "skip", reasons: [dup.reason] };
      const emp = c.profile ? checkCurrentEmployer(c.profile, p.company) : { blocked: false };
      if (emp.blocked) return { job_id: p.job_id, company: p.company, role: p.title, decision: "skip", reasons: [emp.reason] };
      if (scoringProfile) {
        const fit = Jobs.scoreFit(p, scoringProfile);
        if (fit.excluded) {
          const clearance = fit.hard_fails.some((r) => /clearance/i.test(r));
          return { job_id: p.job_id, company: p.company, role: p.title, decision: clearance ? "ask" : "skip", fit: null, reasons: fit.hard_fails.map((r) => `hard filter: ${r}`) };
        }
        if (fit.restriction_unresolved || (fit.needs_user_input || []).length) {
          return { job_id: p.job_id, company: p.company, role: p.title, decision: "ask", fit: fit.score, bucket: fit.bucket,
            reasons: [...(fit.reasons || []), ...(fit.needs_user_input || []).map((q) => q.reason || q.question)], needs_user_input: fit.needs_user_input || [] };
        }
        return { job_id: p.job_id, company: p.company, role: p.title, decision: "apply", fit: fit.score, bucket: fit.bucket, reasons: fit.reasons };
      }
      reasons.push("no scoring profile passed in — fit not computed");
      return { job_id: p.job_id, company: p.company, role: p.title, decision: "ask", reasons };
    });
  }
  // Display-name normalization for card assembly (FIN-E-005): known firms keep
  // the spelling the company itself uses; anything else is trimmed + title-cased.
  const COMPANY_DISPLAY = { stripe: "Stripe", datadog: "Datadog", ramp: "Ramp", palantir: "Palantir", notion: "Notion", airbnb: "Airbnb", figma: "Figma", duolingo: "Duolingo", snowflake: "Snowflake", hubspot: "HubSpot", github: "GitHub", linkedin: "LinkedIn", openai: "OpenAI", goldman: "Goldman Sachs", "goldman sachs": "Goldman Sachs", "jane street": "Jane Street", "hudson river trading": "Hudson River Trading", "two sigma": "Two Sigma", "citadel securities": "Citadel Securities" };
  function displayCompany(name) {
    const clean = String(name == null ? "" : name).trim().replace(/\s+/g, " ");
    if (!clean) return clean;
    return COMPANY_DISPLAY[clean.toLowerCase()] || clean.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
  }
  function batchCard(rawItems, opts) {
    const o = opts || {};
    // FIN-E-005: dedupe identical company+role before the card is assembled —
    // one row per role, however many layers produced it.
    const seen = new Set(), items = [];
    for (const i of rawItems || []) {
      const company = displayCompany(i.company), role = String(i.role == null ? "" : i.role).trim().replace(/\s+/g, " ");
      const key = `${company.toLowerCase()}::${role.toLowerCase()}`;
      if (seen.has(key)) continue; seen.add(key);
      const fit = i.fit != null ? i.fit : null;
      items.push({ company, role, fit, fit_label: fit != null ? `fit ${fit}` : "no fit score yet", resumeVersion: i.resumeVersion || null });
    }
    const summary = items.map((i) => `${i.company} — ${i.role}: ${i.fit_label}`).join("; ");
    return { type: "batch_approval", title: o.title || `Apply to ${items.length} roles?`, items, count: items.length, summary, note: "Nothing submits before your yes. Each approved application gets its own audit record. Where a role has no fit score yet, the card says so instead of claiming a fit." };
  }

  // ---------- assessment invites (Doc 2 §5.3: NEVER taken for the user) ----------
  function handleAssessmentInvite(invite, opts) {
    const o = opts || {};
    return {
      company: invite.company || null, assessment: invite.assessment || "online assessment",
      deadline: invite.deadline || null,
      scheduled: { scheduled: true, at: o.scheduleAt || invite.deadline || null, reminder: "prep pack ready before the deadline" },
      prep: ["Timed practice in the assessment's stated format (your own work — practice only)", "Review the profile facts this role was tailored from, so your stories match your resume", "Logistics check: quiet room, charged laptop, deadline in your timezone"],
      takenByAgent: false,
      rule: "The agent schedules and preps but never takes an assessment for the user — taking it would be dishonest and gets candidates banned.",
    };
  }

  // ---------- duplicate protection via inbox (T-37, SC-079) ----------
  // ATS confirmation emails are evidence of a manual application. Parse the
  // injected inbox fixture/mail rows ({from, subject, date}) for application
  // confirmations and reconcile them into the log so a later apply attempt is
  // refused as a duplicate even when the agent never submitted it.
  function parseInboxConfirmations(emails) {
    const out = [];
    for (const e of emails || []) {
      const text = `${e.from || ""} ${e.subject || ""}`;
      if (!/application (received|confirmation|submitted)|thanks for applying|your application (to|for|was)/i.test(text) && !/application/i.test(e.subject || "")) continue;
      const m = String(e.subject || "").match(/application (?:to|for|received:?)\s*(.+?)(?:\s*[-–|]|$)/i) || String(e.subject || "").match(/your application (?:to|for)\s*(.+?)(?:\s*[-–|]|$)/i);
      out.push({ company: e.company || (m ? m[1].trim() : null), role: e.role || null, date: e.date || null, source: "inbox-confirmation", subject: e.subject || null });
    }
    return out.filter((x) => x.company);
  }
  function reconcileInbox(log, emails) {
    const confs = parseInboxConfirmations(emails);
    const added = [];
    for (const c of confs) {
      if (findApplications(log, { company: c.company }).length) continue;
      added.push(buildAuditRecord(log, { company: c.company, role: c.role || "role per confirmation email", timestamp: c.date ? `${String(c.date).slice(0, 10)}T09:00:00Z` : null, status: "confirmed via inbox (manual application detected)", channel: "inbox-reconciliation" }));
    }
    return { confirmations: confs, added };
  }

  // ---------- reapply cooldown sentinel (T-37, SC-080) ----------
  // cooldownDays comes from the company's record (CIR mechanics / fixture);
  // the lift date is computed, never guessed.
  function checkCooldown(record, todayStr) {
    if (!record || !record.lastApplied || !record.cooldownDays) return { active: false, reason: "no cooldown record for this company" };
    const lift = new Date(Date.parse(`${String(record.lastApplied).slice(0, 10)}T00:00:00Z`) + record.cooldownDays * 86400000);
    const liftStr = lift.toISOString().slice(0, 10);
    const active = todayStr < liftStr;
    return { active, company: record.company, lastApplied: String(record.lastApplied).slice(0, 10), cooldownDays: record.cooldownDays, liftsOn: liftStr, reason: active ? `reapply cooldown at ${record.company}: last applied ${String(record.lastApplied).slice(0, 10)}, ${record.cooldownDays}-day cooldown lifts ${liftStr}` : `cooldown lifted on ${liftStr}` };
  }

  // ---------- approved autopilot rule (SC-078, LOCKED decision shape) ----------
  // Applications may run without a per-batch card ONLY under a rule the user
  // explicitly approved, with caps, and a nightly summary. There is no silent
  // mode: a rule that was not approved does not exist, the rule's own daily
  // cap can only lower the hard 15/day cap, and every run is summarised.
  function createRule(spec, opts) {
    const o = opts || {};
    if (o.approvedByUser !== true) return { ok: false, refused: true, reason: "an autopilot rule activates only on the user's explicit approval — there is no silent autopilot (locked decision)" };
    const s = spec || {};
    return { ok: true, rule: { minFit: typeof s.minFit === "number" ? s.minFit : 80, companies: (s.companies || []).slice(), maxPerDay: Math.min(typeof s.maxPerDay === "number" ? s.maxPerDay : 10, DAILY_CAP), excludeBuckets: (s.excludeBuckets || ["Reach"]).slice(), approvedByUser: true, nightlySummary: true } };
  }
  function evaluateRule(rule, postings, ctx) {
    const c = ctx || {};
    const Jobs = require("./121-career-jobs.js");
    const today = c.date || "2026-10-12";
    const already = applicationsOn(c.log, today);
    const capToday = Math.max(0, Math.min(rule.maxPerDay, DAILY_CAP) - already);
    const applied = [], skipped = [];
    for (const p of postings || []) {
      if (applied.length >= capToday) { skipped.push({ company: p.company, role: p.title, reason: `rule cap reached (${rule.maxPerDay}/day)` }); continue; }
      if (rule.companies.length && !rule.companies.some((x) => norm(x) === norm(p.company))) { skipped.push({ company: p.company, role: p.title, reason: "company not in the rule's list" }); continue; }
      const fit = Jobs.scoreFit(p, c.scoringProfile);
      if (fit.excluded) { skipped.push({ company: p.company, role: p.title, reason: `hard filter: ${fit.hard_fails[0]}` }); continue; }
      if (fit.score < rule.minFit) { skipped.push({ company: p.company, role: p.title, reason: `fit ${fit.score} < rule minimum ${rule.minFit}` }); continue; }
      if (rule.excludeBuckets.includes(fit.bucket)) { skipped.push({ company: p.company, role: p.title, reason: `bucket ${fit.bucket} is excluded by the rule` }); continue; }
      const dup = checkDuplicate(c.log, p);
      if (dup.duplicate) { skipped.push({ company: p.company, role: p.title, reason: dup.reason }); continue; }
      applied.push(buildAuditRecord(c.log, { jobId: p.job_id, company: p.company, role: p.title, url: p.url, timestamp: `${today}T18:00:00Z`, resumeVersionId: c.resumeVersionId || null, status: "submitted under approved autopilot rule (TEST record)", channel: "autopilot-rule" }));
    }
    return { applied, skipped, capToday };
  }
  function nightlySummary(log, dateStr) {
    const todays = (log.records || []).filter((r) => r.timestamp && String(r.timestamp).slice(0, 10) === dateStr);
    return { date: dateStr, submitted: todays.length, byCompany: todays.reduce((a, r) => { a[r.company] = (a[r.company] || 0) + 1; return a; }, {}), records: todays.map((r) => r.applicationId), text: `${todays.length} application(s) submitted under your approved rule on ${dateStr}: ${todays.map((r) => `${r.company} — ${r.role}`).join("; ") || "none"}.` };
  }

  // ---------- recruiting-window sweep (SC-067) ----------
  // Window registry rows are passed in (CIR mechanics / labeled fixture):
  // {company, program, classYears:[2028], opensOn, closesOn, status}.
  function checkWindows(registry, gradYear, todayStr) {
    return (registry || []).map((w) => {
      const forClass = (w.classYears || []).includes(gradYear);
      const open = forClass && w.opensOn <= todayStr && todayStr <= w.closesOn;
      return { company: w.company, program: w.program, forYourClass: forClass, open, opensOn: w.opensOn, closesOn: w.closesOn, note: !forClass ? `not a class-of-${gradYear} program` : open ? `open now — closes ${w.closesOn}` : todayStr < w.opensOn ? `opens ${w.opensOn}` : `closed on ${w.closesOn}` };
    });
  }

  return { DAILY_CAP, createLog, buildAuditRecord, findApplications, getAuditRecord, checkDuplicate, profileEmployers, checkCurrentEmployer, applicationsOn, enforceDailyCap, attemptRaiseCap, classifyQuestion, savedSponsorshipAnswer, savedAnswerFor, confirmSensitive, salaryQuestion, yearsForSkill, checkKnockout, checkReferral, triageBatch, batchCard, displayCompany, handleAssessmentInvite, parseInboxConfirmations, reconcileInbox, checkCooldown, createRule, evaluateRule, nightlySummary, checkWindows };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerApply;
