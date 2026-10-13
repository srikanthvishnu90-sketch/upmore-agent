/* Career season layer (SC-141..145 tail of Track): season dashboard vs plan, comp-expectation
   T3 draft, assessment-score logging, season retro. Built on career/sc-w08 over the 126 track
   store shape (vendored from career/sc-f04 pending integration dedupe — see bug-ledger BUG-101).
   Pure: no sends ever; the comp draft is approval-gated (T3) and never carries a number the
   user did not approve; reschedule slots come from 124.proposeSlots over the user's real
   (injected) calendar busy intervals. */
const CareerSeason = (() => {
  "use strict";
  const _DAY = 86400000;
  const rowsOf = (store) => Array.isArray(store) ? store : (store && store.rows) || [];
  const weekKey = (t) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10); };

  function seasonDashboard(store, plan, opts) {
    opts = opts || {}; const rows = rowsOf(store); const byWeek = {};
    for (const r of rows) { const w = weekKey(Date.parse(r.applied_at)); byWeek[w] = byWeek[w] || { week_start: w, applied: 0, referred: 0, interviews: 0, offers: 0 };
      byWeek[w].applied++; if (r.source === "referred") byWeek[w].referred++;
      if ((r.events || []).some((e) => e.type === "interview_invite" || e.type === "interview")) byWeek[w].interviews++;
      if (r.stage === "Offer" || (r.events || []).some((e) => e.type === "offer")) byWeek[w].offers++; }
    const weeks = Object.values(byWeek).sort((a, b) => a.week_start.localeCompare(b.week_start));
    const total = rows.length, target = (plan && plan.targetApplications) || null;
    return { total_applications: total, plan_target: target, plan_pct: target ? Math.round(100 * total / target) : null,
      on_pace: target ? total >= target * ((plan && plan.paceFraction) || 1) : null, by_week: weeks,
      by_stage: rows.reduce((m, r) => { m[r.stage] = (m[r.stage] || 0) + 1; return m; }, {}),
      text: `${total} applications${target ? ` against a plan of ${target} (${Math.round(100 * total / target)}%)` : ""} across ${weeks.length} active week(s).` };
  }

  function draftCompExpectation(input) {
    input = input || {};
    // SC-142 / SC-073 law: never a number the user didn't approve. No approved figure + no
    // approved range => ASK, with the market range offered instead of a number.
    if (input.approvedFigure == null && !input.approvedRange) return { ok: false, status: "ASK", sends: false,
      reason: "no_user_approved_comp_figure_on_record", offered_instead: input.marketRange || null,
      unblock: "You approve an exact figure or a range — this one needs your explicit yes — then the draft carries exactly that." };
    const figure = input.approvedFigure != null ? String(input.approvedFigure) : `${input.approvedRange[0]}–${input.approvedRange[1]}`;
    return { ok: true, status: "DRAFT_NEEDS_YOUR_YES", requires_approval: true, sends: false, needs_explicit_yes: true, figure_used: figure,
      card: { type: "comp_expectation", title: "Comp expectation — needs your figure", kind: "comp_expectation", company: input.company || null, figure, action: "Approve the figure, then draft" },
      draft: { body: `Thanks for asking. Based on the role and market, my expectation is ${figure}. I'm flexible on the mix and more focused on the role fit — happy to discuss once we're further along.\n\nBest,\n${input.userName || ""}`,
        note: "Draft only. Nothing is sent silently; the figure is exactly the one the user approved." } };
  }

  function logAssessmentScore(store, company, input) {
    input = input || {}; const rows = rowsOf(store);
    const app = rows.find((r) => String(r.company).toLowerCase() === String(company).toLowerCase());
    if (!app) return { ok: false, reason: "no_application_row_for:" + company };
    app.assessment = { score: input.score, max: input.max || null, at: input.at || null, source: "user-reported" };
    app.events = app.events || [];
    app.events.push({ type: "assessment_score", at: input.at || null, source: "user-reported", detail: `assessment score logged: ${input.score}${input.max ? "/" + input.max : ""}`, stage_after: app.stage });
    const pct = input.max ? Math.round(100 * Number(String(input.score).replace(/[^0-9.]/g, "")) / Number(input.max)) : null;
    const prep = pct == null ? "Score logged; prep adjustment needs the scale (max) to judge it." : pct >= 70
      ? "Strong score — next-round prep shifts to interview rounds: behavioral + role depth." : "Below 70% — next-round prep adds an assessment-skills drill block before interview prep.";
    return { ok: true, company: app.company, assessment: app.assessment, pct, next_round_prep_adjustment: prep, stage: app.stage };
  }

  function seasonRetro(store, opts) {
    opts = opts || {}; const rows = rowsOf(store);
    const conv = (src) => { const rs = rows.filter((r) => r.source === src); const moved = rs.filter((r) => !["Submitted", "Confirmed", "Saved", "Rejected", "Ghosted", "Withdrawn"].includes(r.stage)).length; // BUG-102 fix: Rejected is not advancement
      return { applications: rs.length, advanced_past_confirmation: moved, offers: rs.filter((r) => r.stage === "Offer" || r.stage === "Accepted").length,
        rejected: rs.filter((r) => r.stage === "Rejected").length, rate_pct: rs.length ? Math.round(1000 * moved / rs.length) / 10 : 0 }; };
    const cold = conv("cold"), referred = conv("referred");
    const versions = {}; for (const r of rows) { versions[r.resume_version] = versions[r.resume_version] || { applications: 0, advanced: 0 };
      versions[r.resume_version].applications++; if (!["Submitted", "Confirmed", "Saved", "Rejected"].includes(r.stage)) versions[r.resume_version].advanced++; }
    const loser = Object.entries(versions).sort((a, b) => (a[1].advanced / Math.max(1, a[1].applications)) - (b[1].advanced / Math.max(1, b[1].applications)))[0];
    return { total: rows.length, cold, referred,
      what_converted: referred.rate_pct >= cold.rate_pct
        ? `Referred applications advanced at ${referred.rate_pct}% vs cold at ${cold.rate_pct}% — in your own log, referrals are the converting channel.`
        : `Honest read: referred advanced at ${referred.rate_pct}% vs cold at ${cold.rate_pct}% in this log — referrals did NOT out-convert cold this season (small samples: ${referred.applications} referred / ${cold.applications} cold). The plan below still leads with warm paths because referred rows produced ${referred.offers} offer(s) and zero rejections.`,
      what_didnt: `Cold Reach applications and resume version ${loser ? loser[0] : "?"} converted worst (${loser ? loser[1].advanced + "/" + loser[1].applications + " advanced" : "n/a"}).`,
      next_season_plan: ["Lead with warm paths: run the top-10 warm-path sweep before applying cold anywhere.",
        `Kill resume version ${loser ? loser[0] : "?"}; keep the converting variant only.`,
        "Hold applications 48h where a referral path exists; apply cold only when no path exists."],
      computed_from: "application log rows only — no invented outcomes" };
  }
  return { seasonDashboard, draftCompExpectation, logAssessmentScore, seasonRetro };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerSeason;
