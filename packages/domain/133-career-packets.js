/* Career application packets (SC-081..SC-102 build, T-29..T-38 + T-97 packet assembler).
   Assembles ONE application packet per role from the real modules:
   120 portal records + handoff tickets, 122 profile, 123 tailor/truth-audit/
   answer bank/cover letter/render, 121 fit scoring. Adds the rails this slice
   needed that no module owned: CIR(125-schema) -> tailor-CIR adapter,
   current-employer refusal, confirmation capture on a TEST board, referral
   hold decision, CIR gap callout, cover-letter voice + portal-asks gate,
   one-page + ATS render checks, and the mini-campaign seam (124-career-
   outreach does not exist on pivot/career — see docs/bug-ledger.md BUG-003;
   this is a plan/record builder only, it never sends).
   Doorstep rule: submitToTestBoard is a LOCAL test board. It never touches a
   real employer. Pure/UMD like the other domain modules. */
const CareerPackets = (() => {
  const Access = typeof CareerAccess !== "undefined" ? CareerAccess : require("./120-career-access.js");
  const Profile = typeof CareerProfile !== "undefined" ? CareerProfile : require("./122-career-profile.js");
  const Tailor = typeof CareerTailor !== "undefined" ? CareerTailor : require("./123-career-tailor.js");
  const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(inc|llc|ltd|corp|company|the)\b/g, " ").replace(/\s+/g, " ").trim();

  // ---- CIR adapter: 125-schema record -> the {company, facts[]} 123 consumes ----
  function cirForTailor(cir) {
    if (!cir) return null;
    if (Array.isArray(cir.facts) && cir.facts.length) return { company: cir.company || cir.company_name, facts: cir.facts, aiPolicy: cir.aiPolicy || null };
    const facts = [];
    const push = (x) => { const t = typeof x === "string" ? x : x && (x.statement || x.text); if (t) facts.push({ text: t }); };
    if (cir.hiring_bar_summary) push(cir.hiring_bar_summary);
    for (const g of ["stated", "revealed"]) for (const s of ((cir.screening_signals || {})[g] || [])) push(s);
    for (const s of (cir.values_culture_signals || []).slice(0, 2)) push(s);
    for (const s of ((cir.skills_dist || {}).entries || []).slice(0, 3)) if (s.label) facts.push({ text: `${cir.company_name}: ${s.label} — ${s.note || "named in the company record"}` });
    if (!facts.length && cir.thesis_text) facts.push({ text: cir.thesis_text });
    return { company: cir.company_name || cir.company, company_id: cir.company_id || null, facts, aiPolicy: cir.aiPolicy || null, source: "company file" };
  }

  // ---- SC-081: Workday-style portal account creation (record + disclosure) ----
  function createPortalAccount(input) {
    const o = input || {};
    const rec = Access.portalRecord({ company: o.company, alias_email: o.alias_email, password_vault_ref: o.password_vault_ref, created_at: o.now });
    if (!rec.ok) return rec;
    return { ok: true, record: rec.record, disclosure: `Created a ${o.company} portal account record: sign in as ${rec.record.alias_email}; the generated password is stored only in your vault under "${rec.record.password_vault_ref}" — I never put the password itself in chat, logs, or this record.`, audit: Access.auditEntry({ source: "portal", what: `portal account created for ${o.company} as ${rec.record.alias_email}`, at: o.now }) };
  }

  // ---- SC-084: current-employer refusal ----
  function currentEmployerCheck(profile, company) {
    const target = norm(company);
    const hits = Profile.confirmedFacts(profile).filter((f) => (f.kind === "experience") && f.org && norm(f.org) === target);
    // Only a CURRENT role counts: no end date, or an end date in the future.
    const now = Date.now();
    const current = hits.filter((f) => !f.end || Date.parse(`${f.end}-01T00:00:00Z`) >= now);
    return { isCurrentEmployer: current.length > 0, factIds: current.map((f) => f.id), orgs: current.map((f) => f.org) };
  }
  function guardEmployer(profile, company, opts) {
    const chk = currentEmployerCheck(profile, company);
    if (chk.isCurrentEmployer && !(opts && opts.knowingOverride)) {
      return { ok: false, refused: true, code: "current_employer", check: chk, text: `${company} is your current employer (fact ${chk.factIds.join(", ")}). I refuse this application by default — applying to your own employer through the agent can surface internally. If you truly mean it, say "override, I know" and I will proceed with that override recorded.` };
    }
    return { ok: true, check: chk, overrideRecorded: !!(chk.isCurrentEmployer && opts && opts.knowingOverride) };
  }

  // ---- T-97 packet assembler ----
  function assemblePacket(input) {
    const o = input || {};
    const guard = guardEmployer(o.profile, o.company, o);
    if (!guard.ok) return guard;
    const cirT = cirForTailor(o.cir);
    const portalAsksCover = !!o.portalAsksCoverLetter;
    const tailored = Tailor.tailorResume(o.profile, o.jdText, { family: o.family, cir: cirT, wantCoverLetter: portalAsksCover, company: o.company, jobId: o.jobId });
    if (!tailored.ok) return { ok: false, refused: true, code: "truth_audit", tailored };
    const voice = /startup|yc |y combinator/i.test(String(o.companyKind || "")) || (o.voice === "startup") ? "startup" : /bank|law|consult/i.test(String(o.companyKind || "")) || o.voice === "bank" ? "bank" : (o.voice || "professional");
    return {
      ok: true, company: o.company, jobId: o.jobId || null, portal: o.portal || null,
      employerGuard: guard, tailored, coverLetter: portalAsksCover ? tailored.coverLetter : null,
      coverLetterSkippedReason: portalAsksCover ? null : "portal does not ask for a cover letter — none generated (SC-086 rule)",
      voice: tailored.coverLetter ? voice : null,
      answerBank: cirT ? Tailor.buildAnswerBank(o.profile, o.jdText, cirT) : { ok: false, entries: [] },
      onePage: checkOnePage(tailored.rendered), ats: checkAts(tailored.rendered),
    };
  }

  // ---- SC-101 one-page rule + SC-102 ATS-safe render checks ----
  function checkOnePage(rendered) {
    if (!rendered || !rendered.text) return { ok: false, enforced: false, reason: "no rendered resume (outline mode)" };
    const lines = rendered.text.split("\n").filter((l) => l.trim()).length;
    const words = rendered.text.split(/\s+/).filter(Boolean).length;
    // One student page ≈ 55 non-blank lines / ~650 words in the ATS text render.
    return { ok: lines <= 55 && words <= 650, enforced: true, lines, words, limit: "1 page (<=55 lines, <=650 words in text render)" };
  }
  function checkAts(rendered) {
    if (!rendered) return { ok: false, reason: "no render" };
    const standard = ["SKILLS", "EXPERIENCE", "PROJECTS", "EDUCATION", "LEADERSHIP"];
    const hasTableRows = rendered.text.split("\n").some((l) => /^\s*\|/.test(l) || /\|[-: ]+\|/.test(l));
    return { ok: rendered.singleColumn === true && rendered.headings.every((h) => standard.includes(h)) && !hasTableRows && rendered.text.length > 50, singleColumn: rendered.singleColumn, headings: rendered.headings, textExtractable: rendered.text.length > 50, tables: hasTableRows, preferredFormat: "plain text (single column, standard headings)", pdf: rendered.pdf, pdfNote: rendered.pdfNote };
  }

  // ---- SC-083: confirmation capture on a LOCAL test board (never a real employer) ----
  let confSeq = 0;
  function makeTestBoard(opts) {
    const o = opts || {};
    return { kind: "TEST-BOARD (local, labeled TEST)", company: o.company, silent: !!o.silent, submissions: [] };
  }
  function submitToTestBoard(board, packet, input) {
    const o = input || {};
    const rec = { board: board.kind, company: board.company, jobId: packet.jobId, submitted_at: o.now || new Date().toISOString(), resumeVersion: packet.tailored && packet.tailored.version && packet.tailored.version.versionId, auditOk: !!(packet.tailored && packet.tailored.audit && packet.tailored.audit.ok) };
    if (board.silent) { rec.confirmation = null; rec.status = "UNCONFIRMED — flagged: test board issued no confirmation; in production this stays unconfirmed until the employer's email/portal status proves it"; }
    else { rec.confirmation = { id: `TEST-CONF-${board.company.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase()}-${++confSeq}`, channel: "test-board capture (local)", received_at: rec.submitted_at }; rec.status = "CONFIRMED (test board)"; }
    board.submissions.push(rec);
    return rec;
  }

  // ---- SC-098: CIR gap callout ----
  function gapCallout(profile, cir, fit) {
    const cirT = cirForTailor(cir);
    const gaps = [];
    const profSkills = Profile.listFacts(profile, { kind: "skill" }).filter((f) => !f.needs_confirmation && !f.unproven).map((f) => f.name.toLowerCase());
    for (const f of (cirT ? cirT.facts : [])) for (const s of Tailor.skillsInText(f.text)) if (!profSkills.includes(s.toLowerCase())) gaps.push({ skill: s, cirFact: f.text });
    const seen = new Set(); const uniq = gaps.filter((g) => !seen.has(g.skill) && seen.add(g.skill));
    return { gaps: uniq, fit: fit || null, text: uniq.length ? `Gap callout: this company's record names ${uniq.map((g) => g.skill).join(", ")} — not evidenced on your profile. ${fit ? `Your fit bucket here is ${fit.bucket} (score ${fit.score} vs bar ${fit.bar}). ` : ""}Your odds are stated, not hidden. Proceed or not — your call.` : "No skill gap named in this company's file against your proven skills.", proceedIsUserCall: true };
  }

  // ---- SC-099: referral hold decision ----
  function referralHoldDecision(input) {
    const o = input || {};
    const hoursToDeadline = o.hoursToDeadline, referralEtaHours = o.referralEtaHours;
    if (o.referralExpected && referralEtaHours <= 48 && hoursToDeadline > 48 + referralEtaHours) {
      return { decision: "HOLD", holdHours: 48, reason: `${o.contactName || "Your contact"}'s referral is expected in ~${referralEtaHours}h and the deadline is ~${hoursToDeadline}h away — holding 48 hours keeps the referral attached without risking the deadline.`, applyAfterReferral: true };
    }
    if (o.referralExpected) return { decision: "APPLY_NOW_REFER_AFTER", reason: `Deadline (~${hoursToDeadline}h) is too close to wait for a referral expected in ~${referralEtaHours}h — apply now; most portals let an employee refer after submission while the application is in review.`, applyAfterReferral: false };
    return { decision: "APPLY_NOW", reason: "No referral is expected — nothing to hold for.", applyAfterReferral: false };
  }

  // ---- SC-100: mini-campaign seam (plan + records only; NO sends) ----
  function miniCampaign(input) {
    const o = input || {};
    const people = (o.people || []).slice(0, 10);
    if (people.length < 5) return { ok: false, code: "too_few_targets", text: "A mini-campaign is 5–10 people at one company; fewer than 5 named people were supplied, so nothing was built from invented names." };
    const warmthRank = { alumni: 0, club: 1, major: 2, hometown: 3, cold: 4 };
    const sequenced = people.map((p, i) => ({ seq: i + 1, name: p.name, company: o.company, warmth: p.warmth || "cold", sharedFact: p.sharedFact || null, status: "drafted — awaiting your approval, NOT sent" })).sort((a, b) => (warmthRank[a.warmth] - warmthRank[b.warmth]) || a.seq - b.seq).map((p, i) => ({ ...p, seq: i + 1 }));
    return { ok: true, kind: "mini_campaign_plan", company: o.company, count: sequenced.length, sequenced, sends: 0, text: `No warm referral path at ${o.company}, so instead of a cold application I built a ${sequenced.length}-person mini-campaign there, sequenced warm to cold. Every draft waits for your approval — nothing has been sent.` };
  }

  // ---- SC-096: med-school essay packet from real experiences only ----
  function medEssayPacket(profile, prompts) {
    const facts = Profile.confirmedFacts(profile).filter((f) => ["experience", "project", "leadership", "education"].includes(f.kind));
    if (!facts.length) return { ok: false, reason: "no confirmed clinical/research/service facts — essays are never invented" };
    return { ok: true, essays: (prompts || ["Personal statement"]).map((prompt) => ({ prompt, outline: facts.map((f) => ({ point: f.text, factId: f.id })), instruction: "Outline + your real experiences, fact-cited. You write the essay prose — every claim traces to the cited fact." })) };
  }

  return { cirForTailor, createPortalAccount, currentEmployerCheck, guardEmployer, assemblePacket, checkOnePage, checkAts, makeTestBoard, submitToTestBoard, gapCallout, referralHoldDecision, miniCampaign, medEssayPacket, norm };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerPackets;
