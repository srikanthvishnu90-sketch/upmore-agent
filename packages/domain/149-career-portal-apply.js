/* Career portal apply — CA-03 sandbox leg (Spec 2 §6.1 pipeline + §6.3
   browser rules, enforced as code, not prompts).
   What this module IS: the portal driver for the apply family. It drives a
   hosted application form through a page-adapter ("board") seam — analyze
   the form, fill it from CONFIRMED profile facts only, stop ON the final
   review screen (the doorstep) with an exact would-submit payload snapshot,
   and submit ONLY on an explicit owner approval, exactly once, with
   timeout -> needs_human reconciliation (§8.3). §6.3 rules are hard code:
     - employer-hosted forms on TESTED ATS families only (Greenhouse,
       Lever, Ashby, SmartRecruiters, plus the bespoke program-site
       fellowship families 8VC + Kleiner Perkins — MI-104); LinkedIn /
       Indeed apply automation is refused by construction
       (AGGREGATOR_APPLY_FORBIDDEN);
     - one isolated session per user; a session refuses any other user;
     - a captcha / verification code at any point STOPS the run and hands
       the user the link to finish the last step (CAPTCHA_HANDOFF) — this
       module contains no solver call and no disguise technique, ever;
     - legal attestation fields are never auto-answered; they need the
       user's explicit per-run confirmation. EEO defaults to
       "Decline to self-identify" unless the user chose otherwise (§6.1).
   What this module is NOT: a browser. The board seam is the page adapter;
   in this build two boards exist — createSandboxBoard below (a faithful
   Greenhouse-shaped hosted form over a LOCAL receipt sink, labeled
   SANDBOX/TEST, following the 133 makeTestBoard / F3 form-driver pattern)
   and the module-150 Playwright driver (packages/domain/
   150-career-portal-browser.js), which drives REAL hosted forms to the
   doorstep. Its submit leg is ARMED-ONLY (BUG-063 / lane defect D3): a
   browser board transmits only when submitDoorstep below arms it from
   an approval that carries the owner's batch approval reference
   (approval.approvalRef) on top of approvedByUser — approval alone, or
   a board constructed armed for the test lane, are the only other
   paths, and an unarmed board's submit() throws REAL_SUBMIT_DISABLED.
   Since MI-116 the approval must also carry the doorstep's payload
   hash (approval.payloadSha256): submitDoorstep re-builds the
   would-submit payload from the board's CURRENT answers and refuses
   APPROVAL_PAYLOAD_MISMATCH before arming if any value changed, any
   field gained an answer, or any answer was cleared since approval
   (Spec 2 §10 — changing a payload after approval invalidates it).
   The §6.3 host gate is enforced on EVERY navigation hop (BUG-060 /
   D1): a redirect off the allowlist surfaces from the driver as a typed
   HOST_REDIRECT_REFUSED stop, and a board exposing zero fillable fields
   is a typed EMPTY_FORM stop, never a doorstep (BUG-061 / D2).
   classifyTarget can recognize a real ATS URL, but runApply refuses
   any board that is neither a registered sandbox board nor the attested
   browser driver (REAL_PORTAL_NOT_WIRED). Account-walled boards
   (Workday/iCIMS/Taleo) and the owner's signed-in session remain future,
   owner-gated work — see docs/career/board-automation-map.md.
   Caps (§6.4) are the owner's DECIDED numbers (15/day locked 2026-10-12;
   5/vendor/day; 1/company/30 days) and are ENFORCED here (MI-110): a run
   or submit that would exceed one stops CAP_REACHED naming the cap and
   the count, counted from the submissions ledger this module writes;
   the never-twice-to-the-same-job rule (§8.3) is enforced alongside.
   Pure: no network, no clock except values passed in. UMD. */
const CareerPortalApply = (() => {
  const crypto = (() => { try { return require("crypto"); } catch (e) { return null; } })();
  const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

  const ATS_HOSTS = [
    { re: /(^|\.)greenhouse\.io$/, family: "greenhouse" },
    { re: /(^|\.)lever\.co$/, family: "lever" },
    { re: /(^|\.)ashbyhq\.com$/, family: "ashby" },
    { re: /(^|\.)smartrecruiters\.com$/, family: "smartrecruiters" },
    // MI-104: bespoke program-site fellowship forms — one family class
    // (each program's own site form), two instances with genuinely
    // different hosts and field sets, so each gets its own family:
    // the 8VC Fellowship form on 8vc.com (Webflow; census 2026-10-15
    // §8) and the Kleiner Perkins Fellows application at
    // fellows.kleinerperkins.com (census 2026-10-15 §7). Both patterns
    // are anchored to the END of the hostname, so lookalikes
    // (8vc.example.com, kleinerperkins.com.evil.com) do NOT match.
    { re: /(^|\.)8vc\.com$/, family: "eightvc" },
    { re: /(^|\.)kleinerperkins\.com$/, family: "kleinerperkins" },
  ];
  const AGGREGATOR_HOSTS = [/(^|\.)linkedin\.com$/, /(^|\.)indeed\.com$/];
  const EEO_DECLINE = "Decline to self-identify";
  // Spec 2 §6.4 caps — DECIDED by the owner (15/day locked 2026-10-12) and enforced (MI-110).
  const SPEC_CAPS = { perDay: 15, perVendorPerDay: 5, perCompanyPer30Days: 1 };

  const normName = (v) => String(v == null ? "" : v).toLowerCase().replace(/\(test\)/gi, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  // ---------- §6.3 target classification ----------
  function classifyTarget(url) {
    let host = "";
    try { host = new URL(String(url)).hostname.toLowerCase(); } catch (e) {
      return { allowed: false, code: "BAD_URL", host: "", kind: null };
    }
    if (AGGREGATOR_HOSTS.some((re) => re.test(host))) {
      return { allowed: false, code: "AGGREGATOR_APPLY_FORBIDDEN", host, kind: "aggregator",
        reason: "LinkedIn / Indeed apply automation is never built (§6.3) — the penalty would fall on the user's own account" };
    }
    const ats = ATS_HOSTS.find((a) => a.re.test(host));
    if (ats) return { allowed: true, code: null, host, kind: "employer_ats", atsFamily: ats.family };
    if (host === "localhost" || /(^|\.)test$/.test(host)) {
      return { allowed: true, code: null, host, kind: "sandbox", atsFamily: null };
    }
    return { allowed: false, code: "UNTESTED_ATS_HOST", host, kind: "unknown",
      reason: "only tested ATS families (Greenhouse, Lever, Ashby, SmartRecruiters, 8VC, Kleiner Perkins) and registered sandbox boards may be driven (§6.3)" };
  }

  // ---------- the sandbox board (faithful hosted-form seam, TEST only) ----------
  // Greenhouse-shaped field set. Behaviors are switchable so the §11(F)
  // suite can stage a captcha, a submit timeout (with or without the
  // receipt landing), and an account name that mismatches the profile.
  const SANDBOX_FIELDS = [
    { field_id: "full_name", label: "Full name", kind: "standard", profile_key: "name", required: true },
    { field_id: "email", label: "Email", kind: "standard", profile_key: "email", required: true },
    { field_id: "phone", label: "Phone", kind: "standard", profile_key: "phone", required: false },
    { field_id: "location", label: "Location", kind: "standard", profile_key: "location", required: false },
    { field_id: "resume", label: "Resume", kind: "standard", profile_key: "resume", required: true },
    { field_id: "work_authorization", label: "Are you authorized to work in the US?", kind: "screening", question_key: "work_authorization", required: true },
    { field_id: "sponsorship", label: "Will you require sponsorship?", kind: "screening", question_key: "sponsorship", required: true },
    { field_id: "cover_note", label: "Cover note", kind: "free_text", question_key: "cover_note", required: false },
    { field_id: "gender", label: "Gender (voluntary)", kind: "eeo", question_key: "eeo_gender", required: false },
    { field_id: "certify_true", label: "I certify the above is true", kind: "attestation", question_key: "certify_true", required: true },
  ];
  function createSandboxBoard(opts) {
    const o = opts || {};
    const state = {
      answers: {}, submitted: null, confirmationSeq: 0,
      submitOutcome: o.submitOutcome || "accepted",
      captchaAt: o.captchaAt || null, // null | "open" | "review"
      accountName: o.accountName !== undefined ? o.accountName : "Alex Testcase (TEST)",
    };
    const calls = { open: 0, fill: 0, submit: 0 };
    return {
      kind: "sandbox", sandbox: true, atsFamily: "greenhouse",
      host: "sandbox.greenhouse-like.test",
      calls,
      get accountName() { return state.accountName; },
      setSubmitOutcome(v) { state.submitOutcome = v; },
      open() { calls.open += 1; return { ok: true, captcha: state.captchaAt === "open" ? "challenge" : null }; },
      form() { return { fields: SANDBOX_FIELDS.map((f) => Object.assign({}, f)), captchaAt: state.captchaAt }; },
      fill(fieldId, value) { calls.fill += 1; state.answers[fieldId] = value; return value; },
      answers() { return Object.assign({}, state.answers); },
      atReview() { return { ok: true, captcha: state.captchaAt === "review" ? "challenge" : null }; },
      submit() {
        calls.submit += 1;
        if (state.submitOutcome === "accepted") {
          state.confirmationSeq += 1;
          state.submitted = { confirmationId: `SBX-${String(state.confirmationSeq).padStart(4, "0")}`, answers: Object.assign({}, state.answers) };
          return { outcome: "accepted", confirmationId: state.submitted.confirmationId };
        }
        if (state.submitOutcome === "timeout_receipt") {
          state.confirmationSeq += 1;
          state.submitted = { confirmationId: `SBX-${String(state.confirmationSeq).padStart(4, "0")}`, answers: Object.assign({}, state.answers) };
          return { outcome: "timeout" }; // the receipt landed; the driver cannot know yet
        }
        return { outcome: "timeout" }; // timeout_noreceipt: nothing landed
      },
      submissionState() {
        return state.submitted
          ? { submitted: true, confirmationId: state.submitted.confirmationId }
          : { submitted: false, confirmationId: null };
      },
    };
  }

  // ---------- MI-104: the bespoke program-site sandbox boards (TEST only) ----------
  // Two program-site forms, two families — the sites share nothing but
  // the family CLASS (a fellowship program's own site form), so each
  // gets its own board + field set, staged from its census summary
  // only (fellowship census 2026-10-15 §8 for 8VC, §7 for Kleiner
  // Perkins). Neither census could publish an exact field list (both
  // record "read at drive time"); the live forms' fields are read at
  // drive time by module 150 and these boards are the faithful local
  // seams for the pipeline, like the Greenhouse one. On both boards:
  // identity/contact/education/resume + work-authorization/sponsorship
  // screening fill from confirmed facts only; every free-text/essay
  // field is an owner ask that fills ONLY from the owner's own
  // confirmed draft — never invented; certify stays explicit-only.
  //
  // 8VC Fellowship (8vc.com, Webflow): a 3-month summer internship
  // placing undergraduate students (sophomore through graduating
  // senior) as engineers at 8VC portfolio startups; one application
  // covers dozens of companies; Engineering + Design pathways — the
  // pathway is the applicant's own choice, staged as a screening field
  // that fills only from a confirmed answer and otherwise stays an ask.
  const EIGHTVC_FIELDS = [
    { field_id: "full_name", label: "Full name", kind: "standard", profile_key: "name", required: true },
    { field_id: "email", label: "Email", kind: "standard", profile_key: "email", required: true },
    { field_id: "phone", label: "Phone", kind: "standard", profile_key: "phone", required: false },
    { field_id: "location", label: "Location", kind: "standard", profile_key: "location", required: false },
    { field_id: "country", label: "Country", kind: "standard", profile_key: "country", required: true },
    { field_id: "school", label: "School", kind: "standard", profile_key: "education_school", required: false },
    { field_id: "graduation_year", label: "Graduation Year", kind: "standard", profile_key: "education_graduation_year", required: false },
    { field_id: "linkedin", label: "LinkedIn Profile", kind: "standard", profile_key: "linkedin", required: false },
    { field_id: "website", label: "Portfolio / personal website", kind: "standard", profile_key: "website", required: false },
    { field_id: "resume", label: "Resume/CV", kind: "standard", profile_key: "resume", required: true },
    { field_id: "work_authorization", label: "Are you authorized to work in the US?", kind: "screening", question_key: "work_authorization", required: true },
    { field_id: "sponsorship", label: "Will you require sponsorship?", kind: "screening", question_key: "sponsorship", required: true },
    { field_id: "pathway", label: "Fellowship pathway (Engineering or Design)", kind: "screening", question_key: "pathway", required: false },
    { field_id: "project_description", label: "Project description", kind: "free_text", question_key: "project_description", required: false },
    { field_id: "why_8vc_fellowship", label: "Why 8VC Fellowship", kind: "free_text", question_key: "why_8vc_fellowship", required: false },
    { field_id: "certify_true", label: "I certify the above is true", kind: "attestation", question_key: "certify_true", required: true },
  ];
  function createEightVcSandboxBoard(opts) {
    const o = opts || {};
    const state = {
      answers: {}, submitted: null, confirmationSeq: 0,
      submitOutcome: o.submitOutcome || "accepted",
      captchaAt: o.captchaAt || null,
      accountName: o.accountName !== undefined ? o.accountName : "Alex Testcase (TEST)",
    };
    const calls = { open: 0, fill: 0, submit: 0 };
    return {
      kind: "sandbox", sandbox: true, atsFamily: "eightvc",
      host: "sandbox.8vc-like.test",
      calls,
      get accountName() { return state.accountName; },
      setSubmitOutcome(v) { state.submitOutcome = v; },
      open() { calls.open += 1; return { ok: true, captcha: state.captchaAt === "open" ? "challenge" : null }; },
      form() { return { fields: EIGHTVC_FIELDS.map((f) => Object.assign({}, f)), captchaAt: state.captchaAt }; },
      fill(fieldId, value) { calls.fill += 1; state.answers[fieldId] = value; return value; },
      answers() { return Object.assign({}, state.answers); },
      atReview() { return { ok: true, captcha: state.captchaAt === "review" ? "challenge" : null }; },
      submit() {
        calls.submit += 1;
        if (state.submitOutcome === "accepted") {
          state.confirmationSeq += 1;
          state.submitted = { confirmationId: `SBX-8-${String(state.confirmationSeq).padStart(4, "0")}`, answers: Object.assign({}, state.answers) };
          return { outcome: "accepted", confirmationId: state.submitted.confirmationId };
        }
        return { outcome: "timeout" };
      },
      submissionState() {
        return state.submitted
          ? { submitted: true, confirmationId: state.submitted.confirmationId }
          : { submitted: false, confirmationId: null };
      },
    };
  }

  // Kleiner Perkins Fellows (fellows.kleinerperkins.com): summer
  // engineering internships inside KP portfolio companies, SF Bay Area,
  // in person; deadline Jan 31, 2027, 11:59pm PST. The program's top
  // criterion is "experience launching a meaningful product/project
  // from scratch" and it asks about positions of influence in campus
  // organizations — both are staged as free_text owner asks (the
  // write-ups are the substance of the application and are the owner's
  // own writing; campus offices are not in the fact bank). Degree in
  // progress (CS/engineering/math/physics) fills from the education fact.
  const KLEINERPERKINS_FIELDS = [
    { field_id: "full_name", label: "Full name", kind: "standard", profile_key: "name", required: true },
    { field_id: "email", label: "Email", kind: "standard", profile_key: "email", required: true },
    { field_id: "phone", label: "Phone", kind: "standard", profile_key: "phone", required: false },
    { field_id: "location", label: "Location", kind: "standard", profile_key: "location", required: false },
    { field_id: "country", label: "Country", kind: "standard", profile_key: "country", required: true },
    { field_id: "school", label: "School", kind: "standard", profile_key: "education_school", required: false },
    { field_id: "degree", label: "Degree", kind: "standard", profile_key: "education_degree", required: false },
    { field_id: "discipline", label: "Field of Study", kind: "standard", profile_key: "education_discipline", required: false },
    { field_id: "graduation_year", label: "Graduation Year", kind: "standard", profile_key: "education_graduation_year", required: false },
    { field_id: "linkedin", label: "LinkedIn Profile", kind: "standard", profile_key: "linkedin", required: false },
    { field_id: "website", label: "Portfolio / personal website", kind: "standard", profile_key: "website", required: false },
    { field_id: "resume", label: "Resume/CV", kind: "standard", profile_key: "resume", required: true },
    { field_id: "work_authorization", label: "Are you authorized to work in the US?", kind: "screening", question_key: "work_authorization", required: true },
    { field_id: "sponsorship", label: "Will you require sponsorship?", kind: "screening", question_key: "sponsorship", required: true },
    { field_id: "project_you_launched_from_scratch", label: "Project you launched from scratch", kind: "free_text", question_key: "project_you_launched_from_scratch", required: false },
    { field_id: "campus_leadership_and_roles", label: "Campus leadership and roles", kind: "free_text", question_key: "campus_leadership_and_roles", required: false },
    { field_id: "certify_true", label: "I certify the above is true", kind: "attestation", question_key: "certify_true", required: true },
  ];
  function createKleinerPerkinsSandboxBoard(opts) {
    const o = opts || {};
    const state = {
      answers: {}, submitted: null, confirmationSeq: 0,
      submitOutcome: o.submitOutcome || "accepted",
      captchaAt: o.captchaAt || null,
      accountName: o.accountName !== undefined ? o.accountName : "Alex Testcase (TEST)",
    };
    const calls = { open: 0, fill: 0, submit: 0 };
    return {
      kind: "sandbox", sandbox: true, atsFamily: "kleinerperkins",
      host: "sandbox.kleinerperkins-like.test",
      calls,
      get accountName() { return state.accountName; },
      setSubmitOutcome(v) { state.submitOutcome = v; },
      open() { calls.open += 1; return { ok: true, captcha: state.captchaAt === "open" ? "challenge" : null }; },
      form() { return { fields: KLEINERPERKINS_FIELDS.map((f) => Object.assign({}, f)), captchaAt: state.captchaAt }; },
      fill(fieldId, value) { calls.fill += 1; state.answers[fieldId] = value; return value; },
      answers() { return Object.assign({}, state.answers); },
      atReview() { return { ok: true, captcha: state.captchaAt === "review" ? "challenge" : null }; },
      submit() {
        calls.submit += 1;
        if (state.submitOutcome === "accepted") {
          state.confirmationSeq += 1;
          state.submitted = { confirmationId: `SBX-K-${String(state.confirmationSeq).padStart(4, "0")}`, answers: Object.assign({}, state.answers) };
          return { outcome: "accepted", confirmationId: state.submitted.confirmationId };
        }
        return { outcome: "timeout" };
      },
      submissionState() {
        return state.submitted
          ? { submitted: true, confirmationId: state.submitted.confirmationId }
          : { submitted: false, confirmationId: null };
      },
    };
  }

  // ---------- isolated per-user session (§6.3) ----------
  let sessionSeq = 0;
  function createPortalSession(input) {
    const inp = input || {};
    if (!inp.userId) throw new Error("createPortalSession: userId is required — sessions are per-user, never shared");
    if (!inp.board) throw new Error("createPortalSession: a board (page adapter) is required");
    sessionSeq += 1;
    return {
      sessionId: `PS-${sessionSeq}`, userId: inp.userId, board: inp.board,
      doorstep: null, submission: null, needsReconcile: false,
    };
  }

  // ---------- profile contract: standard-field value resolution ----------
  // Flat keys live on the profile itself (name, email, phone, location,
  // linkedin, github, website, current_company, preferred_name, country).
  // Education keys (BUG-062 / lane defect D4) live under profile.education
  // in the fact-bank F-001 shape — { school, degree, discipline,
  // start_date, end_date, gpa, graduation_year } — with a flat
  // profile["education_<key>"] accepted as a fallback. A key that
  // resolves nowhere is an ask (no_confirmed_fact), never invented.
  const EDUCATION_KEYS = ["school", "degree", "discipline", "start_date", "end_date", "gpa", "graduation_year"];
  function profileValue(profile, key) {
    if (!profile || !key) return undefined;
    if (key === "resume") return profile.resume;
    if (key.startsWith("education_")) {
      const sub = key.slice("education_".length);
      if (profile.education && profile.education[sub] !== undefined) return profile.education[sub];
      return profile[key];
    }
    return profile[key];
  }

  // ---------- answer derivation: the answer map is DERIVED from the fact bank (BUG-238 / FR-396) ----------
  // The bug: the pipeline's answer map was hand-maintained and lagged
  // the bank — it carried only work_authorization + sponsorship, so
  // drives stopped on questions the bank already answered ("Are you 18
  // or older?" with the DOB fact on file — Claude Corps staging,
  // 2026-10-15). The map is now BUILT from the bank's confirmed facts:
  // every derived answer names the fact ID it traces to, only
  // status:"confirmed" facts feed it, and answerMapCoverage() reports
  // any bank fact KIND that neither a derivation nor a reasoned
  // exemption accounts for — the contract test
  // (tests/career-portal-answer-map.test.cjs) fails on an uncovered
  // kind, so a growing bank forces the wiring instead of silently
  // stopping drives. Hand-adding an answer key with no declared
  // fact-kind source is likewise a test failure: ANSWER_KEY_SOURCES is
  // the only place a key may be declared.
  const ANSWER_KEY_SOURCES = {
    work_authorization: ["eligibility"],
    sponsorship: ["eligibility"],
    age_18_plus: ["profile"],          // derived from the date-of-birth fact vs the run's clock
    located_in_us: ["profile"],        // derived from the country fact
    education_level: ["education"],    // the level token of the education fact's degree
    years_of_experience: ["experience"], // the span of the experience facts, in completed years
    experience_3mo_plus: ["experience"], // the same span against a 3-month threshold
  };
  // Fact kinds that are profile MATERIAL (documents, tailoring,
  // research) rather than portal screening answers — exempt from
  // answer derivation WITH the reason recorded. A kind listed nowhere
  // (not consumed, not exempt) is uncovered and fails the contract.
  const NON_ANSWER_FACT_KINDS = {
    leadership: "club/leadership record — resume and profile material, never a screening answer",
    certification: "credential record — resume/document material, never a screening answer",
    other: "interests and miscellany — profile material only",
    skill: "skill inventory — tailoring material, not a screening answer",
    research: "research record — fellowship/essay material, not a portal screening answer",
    metric: "company metrics — essay/profile material, not a screening answer",
  };
  const US_STATE_NAMES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia" };
  // City -> IANA zone for the bank's own residence only. A residence
  // outside this table derives NO time-zone answer (the field stays an
  // ask) — the zone is a fact about where the person lives, never a guess.
  const CITY_TIME_ZONES = { "Chicago": "America/Chicago", "Hawthorn Woods": "America/Chicago" };
  const DEGREE_LEVELS = [
    { re: /\bph\.?d\b|doctorate|doctoral/i, level: "PhD" },
    { re: /\bmaster/i, level: "Master's Degree" },
    { re: /\bbachelor/i, level: "Bachelor's Degree" },
    { re: /\bassociate/i, level: "Associate's Degree" },
    { re: /\bhigh school|secondary/i, level: "High School Diploma" },
  ];
  function fullYearsBetween(fromIso, nowMs) {
    const from = new Date(String(fromIso || ""));
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(nowMs)) return null;
    const now = new Date(nowMs);
    let years = now.getUTCFullYear() - from.getUTCFullYear();
    const m = now.getUTCMonth() - from.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < from.getUTCDate())) years -= 1;
    return years;
  }
  function monthsBetween(fromYear, nowMs) {
    const y = parseInt(String(fromYear || ""), 10);
    if (!Number.isFinite(y) || !Number.isFinite(nowMs)) return null;
    const now = new Date(nowMs);
    return (now.getUTCFullYear() - y) * 12 + now.getUTCMonth(); // start year read as January of that year
  }
  function stateFromPlace(place) {
    const tail = String(place || "").split(",").pop().trim();
    if (!tail) return null;
    if (/^[A-Za-z]{2}$/.test(tail)) return US_STATE_NAMES[tail.toUpperCase()] || null;
    return tail; // already a full state name as the owner stated it
  }
  // deriveAnswers(bank, now) -> { answers, profileFields, traces }.
  // `answers` drops straight into profile.answers (each entry carries
  // confirmed:true only when its source fact is confirmed, plus the
  // factId trace); `profileFields` carries the flat profile keys the
  // same facts answer (preferred_name, state_of_residence, time_zone,
  // country, date_of_birth, and the education block in the F-001
  // contract shape). Nothing here invents: a source fact that is
  // absent or unconfirmed yields no entry, and the field stays an ask.
  function deriveAnswers(bank, now) {
    const out = { answers: {}, profileFields: {}, traces: {} };
    if (!bank || !Array.isArray(bank.facts)) return out;
    const nowMs = tsMs(now);
    const confirmed = (f) => f && f.status === "confirmed" && f.needs_confirmation !== true;
    const byKindName = (kind, nameRe) => bank.facts.find((f) => f.kind === kind && nameRe.test(f.name || f.title || ""));
    const put = (key, value, factId, how) => {
      out.answers[key] = { value, confirmed: true, factId };
      out.traces[key] = { factId, how };
    };
    // eligibility facts (F-020 / F-021 shape: kind eligibility, value Yes/No)
    const wa = byKindName("eligibility", /work authorization/i);
    if (confirmed(wa) && wa.value !== undefined) put("work_authorization", wa.value, wa.id, "eligibility fact value");
    const sp = byKindName("eligibility", /sponsorship/i);
    if (confirmed(sp) && sp.value !== undefined) put("sponsorship", sp.value, sp.id, "eligibility fact value");
    // profile facts: country, date of birth, hometown (F-022 / F-023 / F-024 shape)
    const country = byKindName("profile", /^country$/i);
    if (confirmed(country) && country.value) {
      out.profileFields.country = country.value;
      out.traces.country = { factId: country.id, how: "country fact value" };
      if (/^united states$/i.test(String(country.value))) put("located_in_us", "Yes", country.id, "country fact = United States");
    }
    const dob = byKindName("profile", /date of birth/i);
    if (confirmed(dob) && dob.value) {
      out.profileFields.date_of_birth = dob.value;
      out.traces.date_of_birth = { factId: dob.id, how: "date-of-birth fact value" };
      const age = fullYearsBetween(dob.value, nowMs);
      if (age !== null) put("age_18_plus", age >= 18 ? "Yes" : "No", dob.id, `age ${age} computed from the DOB fact at the run's date`);
    }
    const hometown = byKindName("profile", /hometown/i);
    const basics = bank.basics || {};
    const stateSrc = (confirmed(hometown) && hometown.value) || basics.location || null;
    const state = stateSrc ? stateFromPlace(stateSrc) : null;
    if (state) {
      out.profileFields.state_of_residence = state;
      out.traces.state_of_residence = { factId: confirmed(hometown) ? hometown.id : "basics.location", how: "state parsed from the residence the bank carries" };
    }
    const citySrc = (confirmed(hometown) && hometown.value) || basics.location || "";
    const city = String(citySrc).split(",")[0].trim();
    if (city && CITY_TIME_ZONES[city]) {
      out.profileFields.time_zone = CITY_TIME_ZONES[city];
      out.traces.time_zone = { factId: confirmed(hometown) ? hometown.id : "basics.location", how: `IANA zone of the bank's residence city (${city})` };
    }
    if (basics.name) {
      const first = String(basics.name).trim().split(/\s+/)[0];
      if (first) { out.profileFields.preferred_name = first; out.traces.preferred_name = { factId: "basics.name", how: "first token of the bank's full name (no separate preferred-name fact on file)" }; }
    }
    // education facts (F-001 shape): the level token + the education block
    const edu = bank.facts.find((f) => f.kind === "education");
    if (confirmed(edu)) {
      const degreeText = [edu.title || "", edu.text || ""].join(" ");
      const lvl = DEGREE_LEVELS.find((d) => d.re.test(degreeText));
      if (lvl) put("education_level", lvl.level, edu.id, "degree level token from the education fact");
      const block = {};
      if (edu.org) block.school = edu.org;
      const degMatch = String(edu.title || "").match(/(?:pursuing\s+)?(bachelors?[^\n,]*|masters?[^\n,]*|ph\.?d[^\n,]*)/i);
      if (degMatch) block.degree = degMatch[1].trim();
      if (block.degree) { const disc = block.degree.replace(/^(bachelors?|masters?|ph\.?d)\s+(in\s+)?/i, "").trim(); if (disc && disc !== block.degree) block.discipline = disc; }
      if (edu.start) block.start_date = String(edu.start);
      if (edu.end) { block.end_date = String(edu.end); block.graduation_year = String(edu.end); }
      if (bank.defaults && bank.defaults.gpa) block.gpa = String(bank.defaults.gpa);
      if (Object.keys(block).length) { out.profileFields.education = block; out.traces.education = { factId: edu.id, how: "education block from the education fact's structured fields" }; }
    }
    // experience facts: the span answers duration questions (F-002.. shape)
    const exps = bank.facts.filter((f) => f.kind === "experience" && confirmed(f) && f.start);
    if (exps.length) {
      const earliest = exps.reduce((a, b) => (String(a.start) <= String(b.start) ? a : b));
      const months = monthsBetween(earliest.start, nowMs);
      if (months !== null && months >= 0) {
        put("years_of_experience", Math.floor(months / 12), earliest.id, `completed years across the experience span (earliest fact ${earliest.id}, ${earliest.start} -> run date)`);
        put("experience_3mo_plus", months >= 3 ? "Yes" : "No", earliest.id, `experience span is ${months} months at the run's date`);
      }
    }
    return out;
  }
  // Coverage: every fact kind the bank carries is either consumed by a
  // derivation above or exempted with a reason in NON_ANSWER_FACT_KINDS.
  // Anything else is uncovered — the contract test fails on it, which
  // is the point: a new confirmed fact kind forces its wiring here.
  function answerMapCoverage(bank) {
    const kinds = new Set();
    if (bank && Array.isArray(bank.facts)) for (const f of bank.facts) if (f && f.kind) kinds.add(f.kind);
    if (bank && bank.basics && Object.keys(bank.basics).length) kinds.add("basics");
    const consumedKinds = new Set([].concat(...Object.values(ANSWER_KEY_SOURCES)));
    consumedKinds.add("basics"); // preferred_name / location corroboration derive from the basics block
    const consumed = [], exempt = [], uncovered = [];
    for (const k of kinds) {
      if (consumedKinds.has(k)) consumed.push(k);
      else if (NON_ANSWER_FACT_KINDS[k]) exempt.push({ kind: k, reason: NON_ANSWER_FACT_KINDS[k] });
      else uncovered.push(k);
    }
    return { consumed: consumed.sort(), exempt: exempt.sort((a, b) => (a.kind < b.kind ? -1 : 1)), uncovered: uncovered.sort() };
  }

  // ---------- §6.1 step 3: form analysis ----------
  function analyzeForm(formDef) {
    return (formDef.fields || []).map((f) => ({
      field_id: f.field_id, label: f.label || f.field_id,
      category: f.kind || "unknown", required: !!f.required,
    }));
  }

  // ---------- §6.4 caps: decided numbers, enforced (MI-110 / BUG-233) ----------
  // Counts come from the submissions ledger (log.records, status
  // "submitted") — the same records submitDoorstep writes, so the ledger
  // is the per-user record across threads wherever the host persists it.
  function tsMs(ts) {
    if (typeof ts === "number" && Number.isFinite(ts)) return ts;
    const ms = Date.parse(String(ts == null ? "" : ts));
    return Number.isFinite(ms) ? ms : NaN;
  }
  function daySlice(ts) {
    if (typeof ts === "number" && Number.isFinite(ts)) return new Date(ts).toISOString().slice(0, 10);
    return String(ts == null ? "" : ts).slice(0, 10);
  }
  function vendorOf(r) {
    if (!r) return null;
    if (r.vendor) return r.vendor;
    if (r.url) return classifyTarget(r.url).atsFamily || null;
    return null;
  }
  function capCheck(log, userId, posting, now, board) {
    const p = posting || {};
    const recs = ((log && log.records) || []).filter((r) => r.userId === userId && r.status === "submitted");
    const day = daySlice(now);
    const vendor = p.vendor || vendorOf(p) || (board && board.atsFamily) || null;
    const company = p.company || null;
    const companyKey = company ? normName(company) : "";
    const nowMs = tsMs(now);
    const WINDOW30 = 30 * 24 * 3600 * 1000;
    let perDay = 0, perVendorPerDay = 0, perCompanyPer30Days = 0;
    for (const r of recs) {
      if (day && daySlice(r.timestamp) === day) {
        perDay += 1;
        if (vendor && vendorOf(r) === vendor) perVendorPerDay += 1;
      }
      if (companyKey && r.company && normName(r.company) === companyKey) {
        const ms = tsMs(r.timestamp);
        if (Number.isFinite(ms) && Number.isFinite(nowMs) && ms <= nowMs && nowMs - ms < WINDOW30) perCompanyPer30Days += 1;
      }
    }
    const counts = { perDay, perVendorPerDay, perCompanyPer30Days };
    const stops = [];
    if (perDay >= SPEC_CAPS.perDay) stops.push({ cap: "perDay", count: perDay, limit: SPEC_CAPS.perDay });
    if (vendor && perVendorPerDay >= SPEC_CAPS.perVendorPerDay) stops.push({ cap: "perVendorPerDay", count: perVendorPerDay, limit: SPEC_CAPS.perVendorPerDay, vendor });
    if (companyKey && perCompanyPer30Days >= SPEC_CAPS.perCompanyPer30Days) stops.push({ cap: "perCompanyPer30Days", count: perCompanyPer30Days, limit: SPEC_CAPS.perCompanyPer30Days, company });
    return { ok: stops.length === 0, stops, counts, vendor, company };
  }

  function capReport(log, userId, posting, now, board) {
    const recs = (log && log.records) || [];
    const chk = capCheck(log, userId, posting, now, board);
    return {
      decisionPending: false, enforced: true, // §6.4 numbers are the owner's decided caps (MI-110)
      specDefaults: Object.assign({}, SPEC_CAPS),
      submittedToday: chk.counts.perDay,
      counts: chk.counts,
      remaining: {
        perDay: Math.max(0, SPEC_CAPS.perDay - chk.counts.perDay),
        perVendorPerDay: Math.max(0, SPEC_CAPS.perVendorPerDay - chk.counts.perVendorPerDay),
        perCompanyPer30Days: Math.max(0, SPEC_CAPS.perCompanyPer30Days - chk.counts.perCompanyPer30Days),
      },
      wouldStop: chk.stops,
      submittedThisPosting: recs.filter((r) => r.userId === userId && r.status === "submitted" && posting && r.canonicalKey === posting.canonicalKey).length,
    };
  }

  function qualityGateHits(filled, posting) {
    const hits = [];
    for (const [fieldId, entry] of Object.entries(filled)) {
      const v = entry.value;
      if (typeof v === "string") {
        if (/\[[^\]]*\]|\bTODO\b|\bLOREM\b/i.test(v)) hits.push({ field_id: fieldId, reason: "placeholder_text" });
        if (entry.source === "user_confirmed_draft") {
          // §6.4: generated text naming the wrong company is THE embarrassing failure.
          const mentions = v.match(/\b(?:apply|applying|join|joining) to ([A-Z][A-Za-z0-9&.' ]{2,40})/);
          if (mentions && normName(mentions[1]) && !normName(v).includes(normName(posting.company)) && normName(mentions[1]) !== normName(posting.company)) {
            hits.push({ field_id: fieldId, reason: "wrong_company_named", named: mentions[1].trim(), expected: posting.company });
          }
        }
      }
    }
    return hits;
  }

  // ---------- the exact would-submit payload, from the board's CURRENT answers ----------
  // One builder for both hash moments (MI-116): runApply hashes its
  // output at the doorstep; submitDoorstep re-builds and re-hashes at
  // click time. Same construction, same string — comparable by design.
  // Combine composition (2026-10-15): the answer/field sources are the
  // union of the board's live readback and the session's preparation
  // accumulation (Codex's multi-round prepareRound records answers from
  // earlier form rounds in preparationPayload/preparationFields; a live
  // readback at the final review may only expose the current round's
  // elements). Live answers win on conflict — the same precedence the
  // worker branch's inline construction used.
  function buildPayload(board, session) {
    const formDef = board.form();
    const boardAnswers = Object.assign({}, (session && session.preparationPayload) || {}, board.answers());
    const fields = [];
    const seenFields = new Set();
    for (const f of [...(formDef.fields || []), ...((session && session.preparationFields) || [])]) {
      if (!f || seenFields.has(f.field_id)) continue;
      seenFields.add(f.field_id);
      fields.push(f);
    }
    const payload = {};
    for (const f of fields) {
      if (boardAnswers[f.field_id] === undefined) continue;
      payload[f.field_id] = f.field_id === "resume"
        ? { filename: boardAnswers[f.field_id].filename, sha256: boardAnswers[f.field_id].sha256 }
        : boardAnswers[f.field_id];
    }
    if (boardAnswers.resume && boardAnswers.resume.sha256) payload.resume_sha256 = boardAnswers.resume.sha256;
    return payload;
  }

  // D13 (BUG-209 / FR-365): what "missing" means for a payload value,
  // and which required fields a payload fails to carry. Ported from
  // the submit-path lineage (fix/submit-path), where the completeness
  // gate + doorstep repair were built and drive-proven on 2026-10-15;
  // this lineage's 149 never carried them — the imported guard
  // (tests/career-portal-submit-integrity.test.cjs) fails without
  // them: a required field lost at readback sailed through to a click,
  // and a hollowed doorstep payload armed. The gates below restore
  // BUG-209's enforcement on this lineage; the register/ledger
  // reconciliation (the shared register already claims FR-364/365
  // ENFORCED from the submit-path lineage) is flagged for Crew A.
  function payloadValueMissing(v) {
    if (v === undefined || v === null) return true;
    if (typeof v === "string") return v.trim() === "";
    if (Array.isArray(v)) return v.length === 0;
    return false;
  }
  function missingRequiredFields(fields, payload) {
    return (fields || [])
      .filter((f) => f.required && payloadValueMissing(payload[f.field_id]))
      .map((f) => ({ field_id: f.field_id, label: f.label || f.field_id }));
  }

  // ---------- §6.1 pipeline over the board seam ----------
  function runApply(session, input) {
    session.preparationPayload = {};
    session.preparationFields = [];
    session.doorstep = null;
    return prepareRound(session, input, false, 0, []);
  }
  function prepareRound(session, input, continued, round, priorSteps) {
    const inp = input || {};
    const posting = inp.posting || {};
    const profile = inp.profile || {};
    const log = inp.log || { records: [] };
    const stepLog = priorSteps;
    const logStep = (action, data) => stepLog.push(Object.assign({ seq: stepLog.length + 1, action }, data || {}));
    const base = () => ({ stepLog, capReport: capReport(log, session.userId, posting, inp.now, session.board) });
    const blocked = (code, extra) => Object.assign(base(), { resultStatus: "blocked", code }, extra || {});

    // session binding: a session serves exactly its own user (§6.3 isolation)
    if (inp.userId && inp.userId !== session.userId) {
      logStep("session_user_refused", { sessionUser: session.userId, runUser: inp.userId });
      return blocked("SESSION_USER_MISMATCH");
    }
    const board = session.board;
    // target rules (§6.3): aggregators and untested hosts refused before any open
    const target = classifyTarget(posting.url || "");
    logStep("classify_target", { url: posting.url || null, kind: target.kind, code: target.code });
    if (!target.allowed) return blocked(target.code, { reason: target.reason || null });
    if (!board.sandbox && !(board.browserDriver === true && board.kind === "browser")) {
      // The real-browser seam (module 150) HAS landed: an attested
      // browser board may be driven, and may transmit ONLY through the
      // arming wire in submitDoorstep (approval + approvalRef, BUG-063);
      // any other non-sandbox board is still refused outright.
      return blocked("REAL_PORTAL_NOT_WIRED", { reason: "CA-03: only sandbox boards and the attested module-150 browser driver (doorstep-only, submit disabled) can be driven" });
    }
    if (target.kind === "employer_ats" && target.atsFamily && board.atsFamily && target.atsFamily !== board.atsFamily) {
      return blocked("BOARD_POSTING_MISMATCH", { reason: "the session board does not serve this posting's ATS family" });
    }
    // step 1: eligibility — posting still open (§6.1)
    if (posting.status && posting.status !== "open") {
      logStep("eligibility_stop", { reason: "posting_not_open", status: posting.status });
      return blocked("JOB_CLOSED");
    }
    // step 1/§8.3: never twice to the same job (unique (user, posting canonical key))
    const dup = (log.records || []).some((r) => r.userId === session.userId && r.canonicalKey === posting.canonicalKey && r.status === "submitted");
    if (dup) { logStep("eligibility_stop", { reason: "duplicate" }); return blocked("DUPLICATE_APPLICATION"); }

    // open the board; a challenge here stops everything (§6.3)
    const opened = continued ? {} : board.open();
    logStep(continued ? "resume_form" : "open", { host: board.host });
    // §6.3 host gate on EVERY hop (BUG-060 / D1): the driver reports a
    // navigation that landed off the allowlist (initial URL checked
    // above is not enough — boards redirect to employer sites) as a
    // typed refusal. The run stops here: no form read, no fill, no
    // doorstep, no submit on or after the off-list page.
    if (opened && opened.code) {
      logStep("host_redirect_refused", { code: opened.code, finalUrl: opened.finalUrl || null, host: opened.host || null, at: "open" });
      return blocked(opened.code, { reason: opened.reason || "the page landed off the tested-ATS allowlist (§6.3)", finalUrl: opened.finalUrl || null, host: opened.host || null });
    }
    if (opened.captcha) {
      logStep("captcha_stop", { at: "open" });
      return blocked("CAPTCHA_HANDOFF", { handoffUrl: posting.url, screenshot_ref: opened.screenshotRef || null, reason: "a captcha/code appeared — Upmore never solves it; the user finishes the last step" });
    }
    // §11(F): the name on the board account must be the person applying
    if (board.accountName && profile.name && normName(board.accountName) !== normName(profile.name)) {
      logStep("name_mismatch_stop", { accountName: board.accountName, profileName: profile.name });
      return blocked("NAME_MISMATCH", { accountName: board.accountName, profileName: profile.name });
    }

    // steps 3+4: analyze, then fill from confirmed facts only
    const formDef = board.form();
    const formAnalysis = analyzeForm(formDef);
    for (const field of formDef.fields || []) {
      if (!session.preparationFields.some((f) => f.field_id === field.field_id)) session.preparationFields.push(field);
    }
    // D2 (BUG-061): a board exposing ZERO fields is a stop, never a
    // doorstep — last night "prepared" was spoken over forms the driver
    // never actually reached, with a payload of only the resume hash.
    if (!formDef.fields || formDef.fields.length === 0) {
      logStep("empty_form_stop", { fieldCount: 0 });
      return blocked("EMPTY_FORM", { reason: "the board exposed zero fillable fields — there is no form to prepare; this is a stop, not a doorstep", formAnalysis });
    }
    const asks = [];
    const filled = {};
    const answers = profile.answers || {};
    for (const f of formDef.fields) {
      const entry = { field_id: f.field_id, category: f.kind };
      if (f.kind === "standard") {
        const raw = profileValue(profile, f.profile_key);
        if (raw === undefined || raw === null || raw === "") { asks.push({ field_id: f.field_id, reason: "no_confirmed_fact" }); continue; }
        const value = f.profile_key === "resume" ? { filename: raw.filename, sha256: raw.sha256 } : raw;
        board.fill(f.field_id, value); filled[f.field_id] = { value, source: "profile" };
        logStep("fill", Object.assign({}, entry, { source: "profile", profile_key: f.profile_key }));
      } else if (f.kind === "screening") {
        const a = answers[f.question_key];
        if (a && a.confirmed === true && a.value !== undefined) {
          board.fill(f.field_id, a.value); filled[f.field_id] = { value: a.value, source: "user_confirmed_answer" };
          logStep("fill", Object.assign({}, entry, { source: "user_confirmed_answer", question_key: f.question_key }));
        } else { asks.push({ field_id: f.field_id, reason: a ? "answer_unconfirmed" : "no_confirmed_fact" }); }
      } else if (f.kind === "free_text") {
        const a = answers[f.question_key];
        if (a && a.confirmed === true && a.draft === true) {
          board.fill(f.field_id, a.value); filled[f.field_id] = { value: a.value, source: "user_confirmed_draft" };
          logStep("fill", Object.assign({}, entry, { source: "user_confirmed_draft", question_key: f.question_key }));
        } else { asks.push({ field_id: f.field_id, reason: "needs_user_draft_confirmation" }); }
      } else if (f.kind === "eeo") {
        const chosen = profile.eeoChoice || null;
        const value = chosen || EEO_DECLINE;
        board.fill(f.field_id, value);
        filled[f.field_id] = { value, source: chosen ? "user_eeo_choice" : "eeo_default_decline" };
        logStep("fill", Object.assign({}, entry, { source: chosen ? "user_eeo_choice" : "eeo_default_decline" }));
      } else if (f.kind === "attestation") {
        const att = (inp.attestations || {})[f.field_id];
        if (att && att.explicit === true && att.value !== undefined) {
          board.fill(f.field_id, att.value); filled[f.field_id] = { value: att.value, source: "user_explicit_attestation" };
          logStep("fill", Object.assign({}, entry, { source: "user_explicit_attestation" }));
        } else { asks.push({ field_id: f.field_id, reason: "attestation_requires_explicit_confirmation" }); }
      } else {
        asks.push({ field_id: f.field_id, reason: "unknown_field_category" });
      }
    }

    // §6.4 quality gate on everything that would be submitted
    const qHits = qualityGateHits(filled, posting);
    if (qHits.length) { logStep("quality_gate_stop", { hits: qHits }); return blocked("QUALITY_GATE", { hits: qHits }); }

    // Check observations before moving pages: a successful tool call alone
    // does not prove a required answer landed on the destination.
    const observed = board.answers();
    if (Object.keys(filled).length && !Object.keys(observed).length) return blocked("EMPTY_FORM", { reason: "no attempted answer was observed on the board", formAnalysis });
    const norm = (v) => String(v).trim().replace(/\s+/g, " ").toLowerCase();
    for (const [id, planned] of Object.entries(filled)) {
      if (observed[id] === undefined) continue;
      // Composed at the v224 combine: an EMPTY readback (absent or
      // whitespace-only) is a persistence absence, not value drift —
      // the doorstep repair loop + the D13 gate (BUG-207/209) own it
      // and end it as repair or INCOMPLETE_PAYLOAD. Only a non-empty
      // observed value that DIFFERS from the confirmed fact is drift.
      if (payloadValueMissing(observed[id])) continue;
      const wanted = planned.value, actual = observed[id];
      // Composed at the v224 combine: when the board verified the fill
      // against its own rendering (FR-395 — a widget's single-value,
      // including short forms like the country dial code "+1" for
      // "United States"), the readback is compared against that
      // rendering, not the profile text. A board that renders
      // differently from BOTH is still drift and still stops here.
      const rendered = board.renderedValues && board.renderedValues[id];
      const expected = rendered !== undefined ? rendered : wanted;
      const same = typeof expected === "object" ? JSON.stringify(expected) === JSON.stringify(actual)
        : norm(expected) === norm(actual)
          || (/^(yes|no)\b/.test(norm(expected)) && norm(expected).match(/^(yes|no)\b/)[1] === norm(actual))
          || (planned.source === "eeo_default_decline" && /decline|prefer not|not (to )?answer|not (to )?disclose/.test(norm(actual)));
      if (!same) return blocked("ANSWER_OBSERVATION_MISMATCH", { field_id: id, reason: "the observed value differs from the confirmed fact; no review or submit is allowed" });
    }
    for (const field of formDef.fields || []) {
      // Composed at the v224 combine: a required field that WAS filled
      // from confirmed facts (this round, or carried in the preparation
      // payload from an earlier round) but does not read back is a
      // persistence failure, not a user question — the user cannot fix
      // the board's remount disease. It falls through to the doorstep,
      // where the repair loop re-fills it and the D13 gate stops the
      // run INCOMPLETE_PAYLOAD if it still will not persist
      // (BUG-207/209, FR-364/365). The answer_not_observed ask remains
      // for required fields that were never filled at all.
      if (field.required && observed[field.field_id] === undefined && !asks.some((a) => a.field_id === field.field_id)
        && !filled[field.field_id] && !(session.preparationPayload && session.preparationPayload[field.field_id] !== undefined)) {
        asks.push({ field_id: field.field_id, reason: "answer_not_observed" });
      }
    }
    Object.assign(session.preparationPayload, observed);

    // required asks outstanding -> the run waits on the user (nothing invented)
    const requiredAsks = asks.filter((a) => {
      const fd = formDef.fields.find((x) => x.field_id === a.field_id);
      return fd && fd.required;
    });
    if (requiredAsks.length) {
      logStep("awaiting_user", { asks: requiredAsks.map((a) => a.field_id) });
      return Object.assign(base(), { resultStatus: "awaiting_user", asks, formAnalysis });
    }

    // §6.4 caps (MI-110): the decided caps are enforced, not reported —
    // a run that would exceed one stops here and never presents a
    // doorstep that cannot submit. submitDoorstep re-checks at click
    // time (counts can change between doorstep and click).
    const caps = capCheck(log, session.userId, posting, inp.now, board);
    if (!caps.ok) {
      const s = caps.stops[0];
      logStep("cap_reached_stop", { cap: s.cap, count: s.count, limit: s.limit, stops: caps.stops });
      return blocked("CAP_REACHED", { cap: s.cap, count: s.count, limit: s.limit, stops: caps.stops, counts: caps.counts,
        reason: `the owner's decided application cap is reached (${s.cap}: ${s.count} of ${s.limit}) — this submission waits for a later day or window` });
    }

    // the doorstep: final review, exact payload snapshot, STOP (§6.1 step 5/6 boundary)
    let review = board.atReview();
    // §6.3 hop gate at review too (BUG-060 / D1): a Next/Continue click
    // that navigated off the allowlist stops the run before any submit.
    // FORM_VALIDATION_FAILED is NOT a hop (composed at the v224
    // combine): the board never left the form — its own validation
    // rejected the page as-is, which on a remount/reset board means
    // values the drive verified were dropped after their fills. That
    // is exactly what the doorstep repair below exists for, so the
    // verdict defers: repair runs first and the review is re-checked
    // once; only a still-failing validation stops the run, under its
    // own name.
    const reviewValidationPending = !!(review && review.code === "FORM_VALIDATION_FAILED");
    if (reviewValidationPending) logStep("review_validation_deferred", { note: "the board's own validation rejects the form as-is; the doorstep repair runs before any stop is named" });
    if (review && review.code && !reviewValidationPending) {
      logStep("host_redirect_refused", { code: review.code, finalUrl: review.finalUrl || null, host: review.host || null, at: "review" });
      return blocked(review.code, { reason: review.reason || "the review step landed off the tested-ATS allowlist (§6.3)", finalUrl: review.finalUrl || null, host: review.host || null });
    }
    if (review.captcha) {
      logStep("captcha_stop", { at: "review" });
      return blocked("CAPTCHA_HANDOFF", { handoffUrl: posting.url, screenshot_ref: review.screenshotRef || null, reason: "a captcha/code appeared at the final step — Upmore never solves it; the user finishes the last step" });
    }
    if (review.needsFields || review.advanced) {
      if (round >= 7) return blocked("FORM_STEP_LIMIT", { reason: "conditional form did not stabilize within 8 observed rounds" });
      return prepareRound(session, inp, true, round + 1, stepLog);
    }
    if (review.atFinalReview === false && !reviewValidationPending) return blocked("FINAL_REVIEW_NOT_OBSERVED");
    // Composed at the v224 combine: the release line's buildPayload
    // signature (board, session — the union preparation state under live
    // answers) stands; the drive-blockers D11 repair loop below reassigns
    // payload per repair round, so the binding is `let`.
    let payload = buildPayload(board, session);
    // D2 second half (BUG-061): a payload with no actual answers in it
    // (every fill failed or read back empty) is hollow even when the
    // form had fields — it must never be spoken as a doorstep.
    if (Object.keys(payload).length === 0) {
      logStep("empty_form_stop", { fieldCount: formDef.fields.length, filledCount: 0 });
      return blocked("EMPTY_FORM", { reason: "no field value landed on the board — the would-submit payload would carry nothing but the resume hash; this is a stop, not a doorstep", formAnalysis, asks });
    }
    // D11 doorstep repair (BUG-207 / FR-364, ported from the submit-path
    // lineage): a board can drop a value AFTER its own fill verified —
    // the live board's delayed reset wiped Labelbox's name/email/
    // country/phone/location between their verified fills and the
    // doorstep readback (2026-10-15). The doorstep readback is treated
    // as a repair list: every field this run filled whose value the
    // readback no longer carries is re-filled from the same confirmed
    // value and the payload rebuilt, for up to two rounds. Repair
    // never widens what may be submitted; it only restores what was
    // already filled from confirmed facts.
    for (let round = 1; round <= 2; round++) {
      const lost = formDef.fields
        .filter((f) => filled[f.field_id] && payloadValueMissing(payload[f.field_id]))
        .map((f) => f.field_id);
      if (!lost.length) break;
      logStep("doorstep_repair", { round, fields: lost });
      for (const fieldId of lost) {
        const value = filled[fieldId].value;
        try { board.fill(fieldId, value); } catch (e) { logStep("doorstep_repair_fill_failed", { round, field_id: fieldId, code: e.code || "FILL_ERROR" }); }
      }
      payload = buildPayload(board, session);
    }
    // D13 (BUG-209 / FR-365, ported): the payload must carry a readback
    // value for EVERY required field. A required field missing HERE is
    // one whose value did not survive to readback even after repair —
    // a typed INCOMPLETE_PAYLOAD stop: no doorstep is recorded and no
    // approval in this run can arm a click over it.
    const missing = missingRequiredFields(formDef.fields, payload);
    if (missing.length) {
      logStep("incomplete_payload_stop", { missing: missing.map((m) => m.field_id) });
      return blocked("INCOMPLETE_PAYLOAD", { reason: "the board's readback is missing values for required fields — the fills did not persist; submitting would send a hollow application, so the run stops here", missing, formAnalysis, asks });
    }
    // Deferred review re-check (v224 combine): the payload is complete
    // and the repair has run — ask the board's validation again. Only
    // now may a FORM_VALIDATION_FAILED verdict stand, and any other
    // review outcome takes its normal path.
    if (reviewValidationPending) {
      const recheck = board.atReview();
      if (recheck && recheck.code) {
        logStep("review_validation_failed_after_repair", { code: recheck.code });
        return blocked(recheck.code, { reason: "the board's own validation still rejects the form after the doorstep repair restored every readback value — the stop is the board's, named as-is", formAnalysis, asks });
      }
      if (recheck && recheck.captcha) {
        logStep("captcha_stop", { at: "review_recheck" });
        return blocked("CAPTCHA_HANDOFF", { handoffUrl: posting.url, screenshot_ref: recheck.screenshotRef || null, reason: "a captcha/code appeared at the final step — Upmore never solves it; the user finishes the last step" });
      }
      if (recheck && (recheck.needsFields || recheck.advanced)) {
        if (round >= 7) return blocked("FORM_STEP_LIMIT", { reason: "conditional form did not stabilize within 8 observed rounds" });
        return prepareRound(session, inp, true, round + 1, stepLog);
      }
      if (!recheck || recheck.atFinalReview !== true) return blocked("FINAL_REVIEW_NOT_OBSERVED");
      review = recheck;
    }
    const payloadSha256 = sha256(JSON.stringify(payload));
    session.doorstep = { payload, payloadSha256, postingKey: posting.canonicalKey, vendor: caps.vendor, company: posting.company || null, atFinalReview: true,
      requiredFieldIds: formDef.fields.filter((f) => f.required).map((f) => f.field_id) };
    logStep("doorstep_reached", { payloadSha256 });
    const prepared = Object.assign(base(), {
      resultStatus: "prepared", asks, formAnalysis,
      doorstep: { atFinalReview: true, payload, payloadSha256 },
    });
    // step 6: submit only on the explicit approval carried in this run.
    // MI-116 binding: an approval exercised in the same run that built
    // the payload binds to THIS payload — the step log records the
    // binding, and submitDoorstep verifies it at click time like any
    // other bound approval.
    if (inp.approval && inp.approval.approvedByUser === true) {
      inp.approval.payloadSha256 = payloadSha256;
      logStep("approval_bound", { payloadSha256 });
      // The delegated result carries this run's step log + cap report
      // like every other return path (base() first, the leg's own
      // fields win) — returning the leg's bare object dropped the
      // audit trail, which hid the D11 doorstep repair from the run's
      // record (BUG-207 guards, ported from the submit-path lineage).
      return Object.assign(base(), submitDoorstep(session, inp.approval, { log, now: inp.now, posting }));
    }
    return prepared;
  }

  // ---------- the one submit leg: exactly once, reconciled, never blind ----------
  function submitDoorstep(session, approval, ctx) {
    const c = ctx || {};
    const log = c.log || { records: [] };
    if (session.needsReconcile) {
      return { resultStatus: "blocked", code: "RECONCILE_REQUIRED",
        reason: "a previous submit's outcome is unknown — read the destination state before any retry (§8.3)" };
    }
    if (session.submission && session.submission.status === "submitted") {
      return { resultStatus: "blocked", code: "ALREADY_SUBMITTED", submission: session.submission };
    }
    if (!approval || approval.approvedByUser !== true) {
      return { resultStatus: "blocked", code: "APPROVAL_REQUIRED", reason: "the doorstep stops here until the owner taps submit" };
    }
    if (!session.doorstep) {
      return { resultStatus: "blocked", code: "NO_DOORSTEP", reason: "no prepared doorstep payload in this session" };
    }
    // D13 (BUG-209 / FR-365) at the gate itself (ported from the
    // submit-path lineage): the stored doorstep payload is re-verified
    // before caps, binding, or arming — every required field the
    // doorstep was built over must still carry a value in it. A
    // hollowed payload is refused here, unarmed, unclicked.
    const gateMissing = (session.doorstep.requiredFieldIds || [])
      .filter((id) => payloadValueMissing(session.doorstep.payload[id]))
      .map((id) => ({ field_id: id }));
    if (gateMissing.length) {
      return { resultStatus: "blocked", code: "INCOMPLETE_PAYLOAD", missing: gateMissing,
        reason: "the doorstep payload is missing readback values for required fields — the submit gate refuses to arm or click over a hollow payload" };
    }
    const board = session.board;
    // §6.4 caps re-check (MI-110): counts can change between doorstep
    // and click — the gate that fires is the gate that counts. The cap
    // stop lands BEFORE the arming wire: a capped submit never arms.
    const caps = capCheck(log, session.userId, {
      canonicalKey: session.doorstep.postingKey,
      vendor: session.doorstep.vendor || null,
      company: session.doorstep.company || (c.posting && c.posting.company) || null,
      url: (c.posting && c.posting.url) || null,
    }, c.now, board);
    if (!caps.ok) {
      const s = caps.stops[0];
      return { resultStatus: "blocked", code: "CAP_REACHED", cap: s.cap, count: s.count, limit: s.limit, stops: caps.stops, counts: caps.counts,
        reason: `the owner's decided application cap is reached (${s.cap}: ${s.count} of ${s.limit}) — this submission waits for a later day or window` };
    }
    // §10 payload binding (MI-116 / BUG-234): the approval binds to the
    // EXACT payload, not the job. Rebuild the would-submit payload from
    // the board's CURRENT answers and compare hashes — a value changed,
    // a field answered, or a field cleared since approval invalidates
    // the approval (Spec 2 §10). The stop lands BEFORE the arming wire:
    // a mismatched payload never arms and never clicks. An approval
    // carrying no payload hash no longer fires against a doorstep.
    const approvedHash = approval.payloadSha256 || null;
    const livePayload = buildPayload(board, session);
    const liveHash = sha256(JSON.stringify(livePayload));
    if (!approvedHash || approvedHash !== liveHash) {
      const approvedPayload = session.doorstep.payload || {};
      const changedFields = [], addedFields = [], removedFields = [];
      for (const k of Object.keys(livePayload)) {
        if (!(k in approvedPayload)) addedFields.push(k);
        else if (JSON.stringify(livePayload[k]) !== JSON.stringify(approvedPayload[k])) changedFields.push(k);
      }
      for (const k of Object.keys(approvedPayload)) if (!(k in livePayload)) removedFields.push(k);
      return { resultStatus: "blocked", code: "APPROVAL_PAYLOAD_MISMATCH",
        approvedPayloadSha256: approvedHash, livePayloadSha256: liveHash,
        changedFields, addedFields, removedFields,
        reason: !approvedHash
          ? "the approval does not bind the exact payload it approves (no payload hash) — re-approve the shown doorstep so the approval carries its payload hash (§10)"
          : `the filled payload changed after approval, so the approval is invalidated (§10) — changed: [${changedFields.join(", ")}], added: [${addedFields.join(", ")}], removed: [${removedFields.join(", ")}]; re-approve the current doorstep to submit` };
    }
    // THE ARMING WIRE (BUG-063 / D3): this approval gate is the ONLY
    // place a board gets armed for a real submit. Arming requires BOTH
    // (a) this gate's pass (approvedByUser === true, checked above) AND
    // (b) an approval reference naming the owner's batch approval
    // (approval.approvalRef, or ctx.approvalRef). A board that exposes
    // no armForSubmit (the sandbox board — a local test sink) needs no
    // arming; a browser board stays unarmed without the ref and its
    // submit() throws REAL_SUBMIT_DISABLED, which propagates as before.
    const approvalRef = approval.approvalRef || approval.ref || c.approvalRef || null;
    if (board && typeof board.armForSubmit === "function") {
      board.armForSubmit({ approvedByUser: true, approvalRef, canonicalKey: session.doorstep.postingKey,
        payload: session.doorstep.payload, payloadSha256: session.doorstep.payloadSha256 });
    }
    const out = board.submit();
    if (out.outcome === "accepted") {
      session.submission = { status: "submitted", confirmationId: out.confirmationId, needsHuman: false, receiptBoard: board.kind, approvalRef, payloadSha256: approvedHash,
        confirmationText: out.confirmationText || null, screenshotRef: out.screenshotRef || null, confirmationUrl: out.finalUrl || null };
      log.records.push({ userId: session.userId, canonicalKey: session.doorstep.postingKey, status: "submitted", timestamp: c.now || null, confirmationId: out.confirmationId, vendor: caps.vendor, company: caps.company });
      return { resultStatus: "completed", submission: session.submission, doorstep: session.doorstep };
    }
    // timeout (or any non-accept): the outcome is UNKNOWN — never spoken as sent (§8.3)
    session.needsReconcile = true;
    session.submission = { status: "unknown_outcome", needsHuman: true, receiptBoard: board.kind,
      confirmationText: out.confirmationText || null, screenshotRef: out.screenshotRef || null, confirmationUrl: out.finalUrl || null };
    return { resultStatus: "unknown_outcome", submission: session.submission,
      reason: "the board did not answer — the application may or may not have landed; check before any retry" };
  }

  // ---------- reconciliation: truth is read from the board, never from memory ----------
  function reconcile(session) {
    const st = session.board.submissionState();
    if (st.submitted) {
      session.needsReconcile = false;
      session.submission = { status: "submitted", confirmationId: st.confirmationId, needsHuman: false, receiptBoard: session.board.kind, reconciled: true,
        confirmationText: st.confirmationText || null, screenshotRef: st.screenshotRef || null };
      return { resultStatus: "completed", submission: Object.assign({ onBoard: true }, session.submission) };
    }
    if (st.unverifiable === true) {
      // The board cannot prove a negative (a real portal without account
      // access): the outcome STAYS unknown and the reconcile lock stays
      // on — a human reads the captured evidence; no retry is cleared.
      return { resultStatus: "unknown_outcome",
        submission: { status: "unknown_outcome", onBoard: null, needsHuman: true, receiptBoard: session.board.kind,
          confirmationText: st.confirmationText || null, screenshotRef: st.screenshotRef || null },
        reason: "the board's state cannot be read back — the captured confirmation evidence is attached; a human verifies before any retry" };
    }
    session.needsReconcile = false; // state is now KNOWN: nothing landed; a fresh approval may retry
    return { resultStatus: "unknown_outcome",
      submission: { status: "not_submitted", onBoard: false, needsHuman: true, receiptBoard: session.board.kind },
      reason: "the board holds no submission for this session — a retry needs a fresh approval, and the earlier attempt stays on record as an uncertain outcome" };
  }

  // ---------- MI-115 / BUG-235: unknown_outcome is not terminal — the resolver ----------
  // A bounded sweep over application records still at unknown_outcome.
  // It READS destination state (employer-side status readers) and
  // records every attempt on the record; it NEVER submits anything —
  // there is no submit path in this function. Design note (contract
  // mi-115): Spec 2 §8.3 says check the user's email first, but the
  // inbox half is NOT_WIRED — Gmail is not connected in-product
  // (MI-074 / CA-08b). An `inboxScan` seam is accepted; when it is
  // absent the attempt RECORDS inbox_unavailable instead of pretending
  // to have checked. A "submitted" claim counts only with the
  // employer's own confirmation ID attached (the BUG-208 lesson: an
  // ID-less claim is not proof). Anything unproven stays unknown and
  // gains a named userQuestion — re-presented, never silently dropped.
  function resolveUnknownOutcomes(input) {
    const inp = input || {};
    const records = inp.records || [];
    const nowMs = tsMs(inp.now);
    const minAgeMs = (inp.minAgeHours != null ? inp.minAgeHours : 24) * 3600 * 1000;
    const maxPerPass = inp.maxPerPass != null ? inp.maxPerPass : 20;
    const recId = (r) => r.appId || r.canonicalKey || null;
    const report = { attempted: 0, resolved: [], stillUnknown: [], skipped: [] };
    if (!Number.isFinite(nowMs)) {
      for (const r of records) if (r && r.status === "unknown_outcome") report.skipped.push({ id: recId(r), reason: "no_clock" });
      return report;
    }
    const eligible = records
      .filter((r) => r && r.status === "unknown_outcome")
      .sort((a, b) => (tsMs(a.timestamp) || 0) - (tsMs(b.timestamp) || 0));
    const readerFor = (rec) => {
      if (typeof inp.readers === "function") return inp.readers;
      if (inp.readers && typeof inp.readers === "object") {
        const hit = inp.readers[rec.canonicalKey] || inp.readers[rec.appId];
        if (typeof hit === "function") return hit;
        if (hit && typeof hit === "object") return () => hit;
      }
      return null;
    };
    for (const rec of eligible) {
      if (report.attempted >= maxPerPass) { report.skipped.push({ id: recId(rec), reason: "pass_bound" }); continue; }
      const ageMs = nowMs - tsMs(rec.timestamp);
      if (!Number.isFinite(ageMs) || ageMs < minAgeMs) { report.skipped.push({ id: recId(rec), reason: "too_young" }); continue; }
      const prior = rec.resolutionAttempts || [];
      const last = prior[prior.length - 1];
      if (last && Number.isFinite(tsMs(last.at)) && nowMs - tsMs(last.at) < minAgeMs) {
        report.skipped.push({ id: recId(rec), reason: "attempt_throttled" }); continue;
      }
      report.attempted += 1;
      const methodsTried = [];
      let outcome = null, method = "none_available";
      if (typeof inp.inboxScan === "function") {
        methodsTried.push("inbox_scan");
        let inboxRes = null;
        try { inboxRes = inp.inboxScan(rec); } catch (e) { inboxRes = null; }
        if (inboxRes && inboxRes.state === "submitted" && inboxRes.confirmationId) { outcome = inboxRes; method = "inbox_scan"; }
      } else {
        methodsTried.push("inbox_unavailable");
      }
      if (!outcome) {
        const reader = readerFor(rec);
        if (reader) {
          methodsTried.push("employer_status_read");
          let readerRes = null;
          try { readerRes = reader(rec); } catch (e) { readerRes = { state: "unverifiable", reason: `reader_error: ${(e && e.message) || e}` }; }
          if (readerRes) { outcome = readerRes; method = "employer_status_read"; }
        }
      }
      const attempt = { at: inp.now, method, methodsTried, result: null };
      if (methodsTried.includes("inbox_unavailable")) {
        attempt.notes = "inbox_unavailable (MI-074: Gmail not connected in-product — employer-side check only)";
      }
      if (outcome && outcome.state === "submitted" && outcome.confirmationId) {
        rec.status = "submitted";
        rec.resolvedBy = method === "inbox_scan" ? "inbox_confirmed" : "employer_confirmed";
        rec.confirmationId = outcome.confirmationId;
        rec.stillUnknown = false;
        delete rec.userQuestion;
        attempt.result = "resolved_submitted";
        report.resolved.push({ id: recId(rec), to: "submitted", resolvedBy: rec.resolvedBy, confirmationId: outcome.confirmationId });
      } else if (outcome && outcome.state === "not_submitted") {
        rec.status = "not_submitted";
        rec.resolvedBy = "employer_verified_absent";
        rec.stillUnknown = false;
        delete rec.userQuestion;
        attempt.result = "resolved_not_submitted";
        report.resolved.push({ id: recId(rec), to: "not_submitted", resolvedBy: rec.resolvedBy });
      } else {
        rec.stillUnknown = true;
        rec.userQuestion = `Did a confirmation email arrive for ${rec.company || "this application"}? The employer's board cannot prove whether the application landed, and it has stayed unknown since ${rec.timestamp || "submission"}.`;
        attempt.result = "still_unknown";
        if (outcome && outcome.state === "submitted" && !outcome.confirmationId) attempt.detail = "reader claimed submitted without a confirmation ID — not proof";
        else if (outcome && outcome.reason) attempt.detail = outcome.reason;
        report.stillUnknown.push({ id: recId(rec), userQuestion: rec.userQuestion });
      }
      if (!rec.resolutionAttempts) rec.resolutionAttempts = [];
      rec.resolutionAttempts.push(attempt);
    }
    return report;
  }

  return { classifyTarget, createSandboxBoard, createEightVcSandboxBoard, createKleinerPerkinsSandboxBoard, createPortalSession, analyzeForm, runApply, submitDoorstep, reconcile, resolveUnknownOutcomes, profileValue, capCheck, deriveAnswers, answerMapCoverage, ANSWER_KEY_SOURCES, NON_ANSWER_FACT_KINDS, EDUCATION_KEYS, SANDBOX_FIELDS, EIGHTVC_FIELDS, KLEINERPERKINS_FIELDS, SPEC_CAPS };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerPortalApply;
