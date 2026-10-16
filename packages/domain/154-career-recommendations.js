/* Evidence-grounded capability 2. Pure, no I/O, credentials, clocks or writes.
   Role recipes are exploration hypotheses, not labor-market statistics or
   employer requirements. Host-supplied postings need provenance + freshness;
   fixture/snapshot rows are never current openings. */
const CareerRecommendations = (() => {
  const VERSION = "2026-10-15";
  const str = (v) => typeof v === "string" ? v : "";
  const list = (v) => Array.isArray(v) ? v : [];
  const unique = (v) => [...new Set(v)];
  const label = (v) => str(v).replace(/\s+/g, " ").slice(0, 180);
  const factId = (f) => str(f.id || f.fact_id);
  const confirmed = (p) => {
    const facts = list(p && p.facts).filter((f) => f && typeof f === "object");
    return facts.filter((f) => factId(f) && facts.filter((x) => factId(x) === factId(f)).length === 1 && !f.needs_confirmation && (!f.status || f.status === "confirmed"));
  };
  const factText = (f) => [f.name, f.title, f.text, ...list(f.bullets), ...list(f.skills)].filter(Boolean).join(" ");
  // Negative statements and instructions in source documents are not positive
  // qualification evidence. Conservative exclusion beats inventing a skill.
  const usable = (f) => !/\b(no|not|never|without|lack|lacking|ignore|pretend|invent|unfamiliar|learning|beginner)\b/i.test(factText(f));
  const matches = (text, term) => new RegExp("(?:^|[^a-z0-9])" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:$|[^a-z0-9])", "i").test(text);
  function evidence(profile, term) {
    const facts = confirmed(profile).filter(usable);
    const direct = facts.filter((f) => f.kind !== "skill" && ["experience", "project", "leadership", "publication", "certification"].includes(f.kind) && (list(f.skills).some((s) => str(s).toLowerCase() === term.toLowerCase()) || matches(factText(f), term)));
    const claimed = facts.filter((f) => f.kind === "skill" && str(f.name || f.title).toLowerCase() === term.toLowerCase());
    const backed = claimed.filter((f) => list(f.evidence).some((id) => facts.some((x) => factId(x) === id && x.kind !== "skill" && matches(factText(x), term))));
    const ids = unique([...direct, ...backed].map(factId));
    return { status: ids.length ? "evidence_present" : claimed.length ? "self_reported_only" : "not_evidenced", factIds: ids.length ? ids : claimed.map(factId) };
  }
  function citations(profile, ids) {
    return confirmed(profile).filter((f) => ids.includes(factId(f))).map((f) => ({ type: "profile_fact", fact_id: factId(f), label: label(f.title || f.name || f.kind), source: f.source || "user-confirmed profile", as_of: f.confirmed_at || null }));
  }
  // These samples deliberately describe work products, not licenses or
  // employer eligibility. Every role still needs a particular posting check.
  const ROLES = [
    { id: "operations", title: "Operations coordinator", signals: ["operations", "inventory", "scheduling", "logistics", "shift", "dispatch"], skills: ["scheduling", "Excel"], sample: "map a scheduling or inventory workflow and propose one measurable improvement", tradeoffs: "confirm shift hours, physical requirements and scope in each posting" },
    { id: "customer-support", title: "Customer support specialist", signals: ["customer support", "customer service", "tickets", "help desk", "retail"], skills: ["ticket triage", "written communication"], sample: "draft replies to three fictional customer issues and a short escalation guide", tradeoffs: "confirm channel, workload, schedule and escalation responsibilities" },
    { id: "administration", title: "Administrative coordinator", signals: ["administrative", "scheduling", "calendar", "office", "records"], skills: ["scheduling", "record keeping"], sample: "create a fictional meeting schedule and an error-checked records checklist", tradeoffs: "confirm office attendance and confidentiality requirements" },
    { id: "sales", title: "Sales or account coordinator", signals: ["sales", "crm", "account management", "customer", "retail"], skills: ["CRM", "written communication"], sample: "write a fictional customer handoff and an account follow-up plan", tradeoffs: "check targets, compensation structure and whether outbound selling suits you" },
    { id: "communications", title: "Communications or content assistant", signals: ["writing", "editor", "journalism", "communications", "content", "english"], skills: ["editing", "audience research"], sample: "edit a public announcement for two audiences and explain the changes", tradeoffs: "review portfolio expectations and the amount of writing versus coordination" },
    { id: "legal-support", title: "Legal support or legal operations", signals: ["legal", "law", "juris doctor", "jd", "paralegal", "litigation", "contracts"], skills: ["legal research", "document review"], sample: "summarize a public case and build a fictional document-review checklist", tradeoffs: "verify jurisdiction, role scope and any stated credential; no bar admission is inferred" },
    { id: "compliance", title: "Compliance operations analyst", signals: ["compliance", "legal", "audit", "contracts", "law", "risk"], skills: ["policy review", "risk documentation"], sample: "compare two public policies and document a fictional exception-review process", tradeoffs: "check domain-specific requirements; a law degree does not establish regulated-role eligibility" },
    { id: "finance", title: "Finance or accounting analyst", signals: ["finance", "accounting", "valuation", "reconciliation", "bookkeeping", "financial"], skills: ["Excel", "reconciliation"], sample: "build a fictional budget-versus-actual workbook and explain its assumptions", tradeoffs: "verify seniority, accounting knowledge and any certification in the specific posting" },
    { id: "business-operations", title: "Business operations assistant", signals: ["excel", "finance", "budget", "operations", "business", "analysis"], skills: ["Excel", "process documentation"], sample: "write a one-page decision memo using a small fictional operating budget", tradeoffs: "check whether the role is primarily coordination, analysis or stakeholder work" },
    { id: "software-engineering", title: "Software engineering", signals: ["computer science", "python", "javascript", "typescript", "software", "java", "c++"], skills: ["testing", "version control"], sample: "build a small software feature, document one design tradeoff and add runnable tests", tradeoffs: "degree or coursework alone does not establish production coding experience" },
    { id: "data-analytics", title: "Data / analytics", signals: ["sql", "statistics", "analytics", "python", "data analysis", "data science"], skills: ["SQL", "data validation"], sample: "answer a question from a public dataset and write the limitations alongside the result", tradeoffs: "check quantitative and tool requirements; programming alone does not prove statistical depth" },
    { id: "health-operations", title: "Healthcare administration or coordination", signals: ["nursing", "patient", "clinical", "healthcare", "medical"], skills: ["scheduling", "record keeping"], sample: "map a fictional appointment workflow without using any patient information", tradeoffs: "verify local credentials for clinical duties; none are inferred from this administrative hypothesis" },
  ];
  function roleHypotheses(ctx) {
    const p = ctx.profile || {};
    const facts = confirmed(p).filter(usable);
    const ranked = ROLES.map((r) => {
      const anchors = facts.filter((f) => r.signals.some((s) => matches(factText(f), s)));
      return { ...r, score: anchors.length, factIds: unique(anchors.map(factId)) };
    }).filter((r) => r.score).sort((a, b) => b.score - a.score || ROLES.findIndex((r) => r.id === a.id) - ROLES.findIndex((r) => r.id === b.id));
    let selected = ranked.slice(0, 3);
    if (selected.length < 2) {
      for (const id of ["operations", "communications"]) {
        if (selected.length >= 2) break;
        if (!selected.some((r) => r.id === id)) selected.push({ ...ROLES.find((r) => r.id === id), score: 0, factIds: [] });
      }
    }
    // An education-only record anchors exploration context, never a skill claim.
    const contextIds = facts.filter((f) => f.kind === "education").map(factId);
    return selected.map((r) => ({ ...r, signals: r.signals.slice(), skills: r.skills.slice(), status: "hypothesis", evidenceLevel: r.score ? "record_signal" : "exploration_only", factIds: r.factIds.length ? r.factIds : contextIds, why: r.score ? `Confirmed record signals [${r.factIds.join(", ")}] suggest work to test; this does not establish qualification` : `An exploration option; ${contextIds.length ? `education context [${contextIds.join(", ")}] establishes no role skills` : "no confirmed role evidence is available"}`, gaps: r.skills.map((skill) => ({ skill, basis: "exploration_recipe_not_employer_requirement", ...evidence(p, skill) })) }));
  }
  function locationScope(ctx) {
    const p = ctx.profile || {}, prefs = p.preferences || {}, cons = { ...(p.constraints || {}), ...(ctx.constraints || {}) };
    let locations = unique(list(ctx.locations || prefs.locations).map(str).filter(Boolean));
    if (cons.relocation === false && !locations.length && p.basics && p.basics.location) locations = [str(p.basics.location)];
    const remoteOnly = ctx.remoteOnly === true || cons.remoteOnly === true || prefs.remote === "only" || prefs.remote === "remote_only";
    return { locations, remoteOnly, relocation: typeof cons.relocation === "boolean" ? cons.relocation : null, basis: "user-supplied preferences/constraints; residence alone is not relocation consent", unknowns: [...(!locations.length ? ["Preferred work locations are unknown."] : []), "Remote hiring geography and work authorization need each employer's wording; remote does not mean work from anywhere.", "No local market volume, salary or cost comparison is available."] };
  }
  function freshness(row, now) {
    const source = row.source || {};
    const kind = row.source_kind || source.kind;
    const url = row.source_url || source.url || row.url;
    const observed = row.observed_at || source.observed_at;
    const age = typeof now === "number" ? now - Date.parse(observed) : NaN;
    const fixture = row.isTestFixture || row.fixture || row.is_fixture || kind !== "live_public" || /fixture|snapshot|example\.(test|com)|localhost/i.test([url, row.id, row.source_path].join(" "));
    let reason = null;
    if (fixture) reason = "fixture_or_unverified_source";
    else if (!/^https:\/\//i.test(str(url))) reason = "missing_source_url";
    else if (!Number.isFinite(age) || age < 0 || age > 24 * 60 * 60 * 1000) reason = "stale_or_unknown_observation";
    else if (row.status !== "open") reason = "not_confirmed_open";
    return { current: !reason, reason, url: url || null, observed_at: observed || null, source_kind: kind || "unknown" };
  }
  function requirementGaps(profile, posting) {
    return list(posting && posting.requirements).filter((r) => r && typeof r.skill === "string" && r.skill.trim()).map((r) => ({ skill: r.skill, level: ["required", "preferred"].includes(r.level) ? r.level : "unknown", quote: r.text || null, source: { posting_id: posting.id || null, url: posting.source_url || (posting.source || {}).url || posting.url || null }, ...evidence(profile, r.skill) }));
  }
  function openingRecommendations(ctx, paths, scope) {
    const excluded = [], candidates = [], hypotheses = paths || roleHypotheses(ctx);
    for (const row of list(ctx.postings)) {
      if (!row || typeof row !== "object") continue;
      const fresh = freshness(row, ctx.now);
      if (!fresh.current) { excluded.push({ id: row.id || null, reason: fresh.reason }); continue; }
      const title = str(row.title), mode = str(row.mode || row.workplace_type).toLowerCase();
      if (scope.remoteOnly && mode !== "remote") { excluded.push({ id: row.id, reason: "remote_constraint" }); continue; }
      const places = unique([str(row.location), ...list(row.locations).map((v) => typeof v === "string" ? v : str(v && v.name))].filter(Boolean));
      // Exact normalized location matching avoids York matching New York, or
      // remote US silently matching a different jurisdiction. Host normalizes.
      const norm = (v) => str(v).trim().toLowerCase();
      if (scope.locations.length && !places.some((v) => scope.locations.some((l) => norm(v) === norm(l)))) { excluded.push({ id: row.id, reason: "location_unverified_or_mismatch" }); continue; }
      const cons = { ...((ctx.profile || {}).constraints || {}), ...(ctx.constraints || {}) };
      if ((ctx.needsIncome || cons.needsIncome) && row.paid !== true) { excluded.push({ id: row.id, reason: "paid_status_unverified" }); continue; }
      const aligned = hypotheses.filter((p) => [p.title, ...p.signals].some((term) => matches(title, term)));
      if (!aligned.length || !aligned.some((p) => p.evidenceLevel === "record_signal")) { excluded.push({ id: row.id, reason: "no_evidenced_role_alignment" }); continue; }
      candidates.push({ id: row.id || null, title, company: label(row.company), source: fresh, roleHypotheses: aligned.map((p) => p.id), factIds: unique(aligned.flatMap((p) => p.factIds)), gaps: requirementGaps(ctx.profile, row), eligibility: "unknown_until_employer_requirements_checked", location: places, mode });
    }
    return { status: candidates.length ? "sourced_openings_for_review" : "no_verified_matching_openings", openings: candidates, excluded, as_of: typeof ctx.now === "number" && Number.isFinite(ctx.now) ? new Date(ctx.now).toISOString() : null, policy: "live_public + HTTPS + explicit open + observed within 24 hours; host must verify source; no fixture fallback" };
  }
  function planPaths(ctx) {
    const c = ctx || {}, paths = roleHypotheses(c), scope = locationScope(c), openings = openingRecommendations(c, paths, scope);
    const ids = unique(paths.flatMap((p) => p.factIds));
    const sources = citations(c.profile, ids);
    sources.push({ type: "exploration_recipes", label: "Authored work-sample hypotheses; not employer requirements or market evidence", as_of: VERSION });
    const plan = paths.slice(0, 2).map((p) => ({ action: `Test ${p.title}: ${p.sample}`, timeframe: "one short session this week" }));
    plan.push({ action: "Compare the work samples for interest and difficulty, then verify one employer posting's requirements", timeframe: "after both samples" });
    const text = ["Two plausible paths to test; the record supports hypotheses, not a qualification verdict.", ...paths.slice(0, 2).map((p) => `${p.title}: ${p.why}; try ${p.sample}.`), `Location scope: ${scope.locations.join(" / ") || "not stated"}${scope.remoteOnly ? "; remote only" : ""}; no local demand ranking is known.`, openings.openings.length ? `Verified source observations: ${openings.openings.length} matching opening(s) for review; eligibility remains unknown.` : "Current openings are unverified: no fresh matching source observation is available; fixture jobs are excluded.", "Which work sample would you like to try first?"].join("\n");
    return { ok: true, kind: "plan_paths", text, paths, deterministicVerdict: null, factIds: ids, sources, as_of: VERSION, basis: { source_class: "confirmed profile facts plus authored exploration recipes", as_of: VERSION, as_of_covers: "recipe revision only; user facts and openings retain their own timestamps" }, locationScope: scope, currentOpenings: openings, experiment: { task: `Try two work samples: ${paths.slice(0, 2).map((p) => p.sample).join("; then ")}`, discriminates: paths.slice(0, 2).map((p) => p.id), cost: "time only; no purchase required" }, plan, action_plan: plan, unknowns: ["Which role fits your interests, seniority and actual employer requirements remains unknown.", ...scope.unknowns], nextStep: "Which work sample would you like to try first?" };
  }
  function quantEvidence(ctx) {
    const facts = confirmed(ctx.profile).filter(usable).filter((f) => ["education", "project", "experience"].includes(f.kind));
    return { factIds: facts.map(factId), sources: citations(ctx.profile, facts.map(factId)), text: facts.length ? `Your confirmed record contains ${facts.slice(0, 3).map((f) => `[${factId(f)}] ${label(f.title || f.kind)}`).join("; ")}; those facts alone do not establish research readiness or trading temperament.` : "No confirmed education, coding or project evidence is available; research readiness and trading temperament cannot be inferred from missing evidence." };
  }
  function skillGapPlan(ctx) {
    const c = ctx || {}, p = c.profile || {}, skill = str(c.skill).trim();
    const posting = c.posting || null;
    if (!skill && !list(posting && posting.requirements).length) {
      const paths = roleHypotheses(c).slice(0, 2);
      const gaps = paths.flatMap((r) => r.gaps.map((g) => ({ ...g, role: r.title, level: "unknown", basis: "exploration_recipe_not_employer_requirement" })));
      const ids = unique(gaps.flatMap((g) => g.factIds));
      const plan = [
        { action: "Choose one role hypothesis and obtain its exact posting requirements", timeframe: "this week" },
        { action: "Build a fictional work sample for one missing-evidence task", timeframe: "one short session this week" },
        { action: "Ask a practitioner to review the sample and update confirmed facts only after review", timeframe: "after the sample" },
      ];
      const text = ["These are work-sample gaps for role hypotheses; employer requirements remain unknown.", ...paths.map((r) => `${r.title}: ${r.gaps.map((g) => `${g.skill} — ${g.status}${g.factIds.length ? ` [${g.factIds.join(", ")}]` : ""}`).join("; ")}; try ${r.sample}.`), "Missing evidence does not prove a lack of ability; no skill is added to your profile.", "What exact posting task should the work sample demonstrate?"].join("\n");
      return { ok: true, kind: "skill_gap_plan", text, gaps, factIds: ids, alreadyHasSkill: false, requirementLevel: "unknown", sources: [...citations(p, ids), { type: "exploration_recipes", label: "Work-sample hypotheses, not employer requirements", as_of: VERSION }], basis: { source_class: "confirmed evidence plus explicitly hypothetical work-sample tasks", as_of: VERSION }, as_of: VERSION, plan, unknowns: ["The target employer requirements and screening weight are unknown."], nextStep: "What exact posting task should the work sample demonstrate?" };
    }
    let gaps = requirementGaps(p, posting);
    if (skill && !gaps.some((g) => g.skill.toLowerCase() === skill.toLowerCase())) gaps.push({ skill, level: ["required", "preferred", "preferred_not_required"].includes(c.requirementLevel) ? c.requirementLevel : "unknown", quote: null, source: { type: "caller_supplied_requirement", verified: false }, ...evidence(p, skill) });
    const target = gaps.find((g) => g.skill.toLowerCase() === skill.toLowerCase()) || gaps[0];
    const chosen = target ? target.skill : "a skill from a specific posting";
    const hours = Number.isFinite(Number(c.hoursPerWeek)) && Number(c.hoursPerWeek) > 0 ? Math.min(Number(c.hoursPerWeek), 40) : 2;
    const minutes = Math.floor(hours * 60), a = Math.floor(minutes / 3), b = Math.floor(minutes / 3);
    const technical = /\b(python|sql|go|java|javascript|typescript|testing|version control|react|c\+\+)\b/i.test(chosen);
    const artifact = technical ? `a small ${chosen} exercise with README, runnable tests and an explanation of limitations` : `a fictional ${chosen} work sample with a checklist, assumptions and a written review`;
    const phases = [{ id: "learn-basics", task: `Review the exact ${chosen} task and one relevant learning source`, minutes: a }, { id: "build-artifact", task: `Build ${artifact}`, minutes: b }, { id: "document-review", task: "Ask a practitioner to review the sample against the task checklist", minutes: minutes - a - b }];
    const alreadyHasSkill = !!target && target.status === "evidence_present";
    const level = target ? target.level : "unknown";
    const text = [`${chosen}: ${target ? `${target.status} [${target.factIds.join(", ") || "no supporting fact"}]` : "no posting requirement was supplied"}.`, `Requirement level: ${level === "preferred_not_required" || level === "preferred" ? "preferred, not required (as supplied)" : level}; missing evidence is not proof that you lack the skill.`, `Build ${artifact} inside ${hours} hours per week, then get a practitioner review; completion supplies a sample, not employer approval.`, "What exact posting task should the work sample demonstrate?"].join("\n");
    const ids = unique(gaps.flatMap((g) => g.factIds));
    return { ok: true, kind: "skill_gap_plan", text, gaps, alreadyHasSkill, requirementLevel: level, factIds: ids, sources: [...citations(p, ids), { type: "supplied_requirement", label: posting ? `Posting ${posting.id || "supplied"}; requirement wording supplied by caller` : "Caller-supplied skill; employer requirement unverified", url: posting && (posting.source_url || posting.url) || null, as_of: posting && posting.observed_at || null }], basis: { source_class: "confirmed evidence and supplied requirements; no invented employer screen", as_of: VERSION }, as_of: VERSION, artifact, phases, totalMinutesPerWeek: minutes, plan: phases.map((x) => ({ action: x.task, timeframe: `${x.minutes} minutes per week` })), reviewMethod: "Practitioner review against the stated task checklist.", stoppingCondition: "Stop when the sample and its checklist are reviewed; keep employer eligibility unknown until verified.", unknowns: ["Employer screening weight and unstated requirements are unknown.", ...(!target ? ["The target skill and requirement level are unknown."] : [])], nextStep: "What exact posting task should the work sample demonstrate?" };
  }
  // Non-mutating adapter: extraction never confirms a resume or changes the
  // caller's profile. The host must collect explicit fact confirmations.
  function ingestResume(ctx, input) {
    const P = typeof CareerProfile !== "undefined" ? CareerProfile : require("./122-career-profile.js");
    const existing = JSON.parse(JSON.stringify((ctx || {}).profile || {}));
    const profile = { ...existing, ...P.createProfile(existing) };
    const result = P.ingestResume(profile, input, { now: (ctx || {}).now || null });
    return { ...result, profile, confirmationRequired: true, recommendations: planPaths({ ...(ctx || {}), profile }) };
  }
  function intentFor(text) {
    const t = str(text).toLowerCase();
    if (/\b(apply|submit|send|email|watch|watches|watching|alerts?|pause|stop|delete)\b/.test(t)) return null;
    if (/\b(resume|résumé|cv|background|profile)\b/.test(t) && /\b(roles?|jobs?|fit|recommend|recommendations?|suit|paths?)\b/.test(t)) return "resume_roles";
    if (/\b(skill gaps?|missing skills?)\b/.test(t)) return "skill_gaps";
    if (/\b(current|fresh|live|today|right now)\b/.test(t) && /\b(openings?|jobs?|roles?|hiring)\b/.test(t)) return "current_openings";
    if (/\b(what|which)\b[^?]*\b(roles?|jobs?|careers?)\b[^?]*\b(fit|suit|recommend|qualified)\b|\brecommend\b[^?]*\b(roles?|jobs?|careers?)\b/.test(t)) return "resume_roles";
    if (/\b(where should i (work|look)|which (cities|locations)|location recommendations?)\b/.test(t)) return "locations";
    return null;
  }
  function recommend(ctx) {
    const c = ctx || {};
    if (c.recommendationIntent === "skill_gaps") return skillGapPlan(c);
    const out = planPaths(c);
    if (c.recommendationIntent === "current_openings") {
      out.kind = "current_openings";
      out.sources.push(...out.currentOpenings.openings.map((o) => ({ type: "public_posting_observation", label: o.title, url: o.source.url, as_of: o.source.observed_at })));
      out.text = out.currentOpenings.openings.length ? out.currentOpenings.openings.slice(0, 5).map((o) => `${o.title} — ${o.company || "employer unspecified"}: source ${o.source.url}, observed ${o.source.observed_at}; record signals [${o.factIds.join(", ")}]; eligibility unknown; ${o.gaps.filter((g) => g.status !== "evidence_present").map((g) => `${g.skill}: ${g.status} (${g.level})`).join("; ") || "requirements still need review"}.`).join("\n") : "Current openings are unverified: no fresh matching public source observation is available; fixture and stale jobs are excluded.";
      out.text += "\nWhich employer source and preferred work location should we check next?";
      out.nextStep = "Which employer source and preferred work location should we check next?";
    }
    if (c.recommendationIntent === "locations") {
      out.kind = "location_recommendations";
      out.text = `Location scope: ${out.locationScope.locations.join(" / ") || "not stated"}${out.locationScope.remoteOnly ? "; remote only" : ""}. Preferences guide the search; no evidence supports ranking cities by demand or pay. Remote hiring geography and work authorization remain employer-specific.\nWhich work locations and relocation limits should I use?`;
      out.nextStep = "Which work locations and relocation limits should I use?";
    }
    return out;
  }
  return { confirmed, evidence, citations, roleHypotheses, locationScope, freshness, requirementGaps, openingRecommendations, planPaths, quantEvidence, skillGapPlan, ingestResume, intentFor, recommend };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerRecommendations;
