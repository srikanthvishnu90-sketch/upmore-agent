/* F3 web onboarding — name, resume, target roles, first reviewed match, in one
   session under 2 minutes (Trainee builder plan 2026-10-22, item F3).
   Pure flow + render over the product's REAL models — no parallel vocabulary:
     - the profile is the 122 master profile (packages/domain/122-career-profile.js):
       basics, preferences, facts with stable IDs, the typed resume ingest;
     - every answer is stored as a CONFIRMED 122 fact carrying provenance
       "owner stated (web onboarding, <date>)" and a confirmation event id —
       the exact shape the prepare contract (extension apply_core
       trustedManifest / typedProfileFile) consumes — and, for the name, as a
       WO-102 answers-record entry the manifest reads directly;
     - target roles land in preferences.roles and the goal rides the 142
       goal-spine carriage (stated_facts {kind:"goal", key:"career"}) — the
       stores the router and the matcher actually read;
     - the first match is composed by 121's own matcher
       (profileFromPersona + scoreFit): every considered posting returns
       exactly once, kept or dropped with the rule that dropped it.
   The current step is DERIVED from what is stored (plus explicit skip
   records), so leaving mid-flow and returning resumes at the first
   unanswered step with earlier answers intact, and a finished flow is
   never re-asked. UMD like the other career modules: Node tests require
   it; the app build inlines it after 122/121. */
const TraineeOnboarding = (() => {
  // One number, one place (builder plan rule 3): the F3 done bar — the whole
  // flow, name to first reviewed match, fits a 2-minute interaction budget
  // (owner brief, 2026-10-22). The timed DOM test measures against this.
  const BUDGET_MS = 120000;
  const STEPS = [
    { key: "name", label: "Your name" },
    { key: "resume", label: "Your resume" },
    { key: "roles", label: "Target roles" },
    { key: "match", label: "First match" },
  ];
  const QUESTION_STEPS = ["name", "resume", "roles"];
  const SOURCE = "web-onboarding";

  function deps() {
    const P = (typeof CareerProfile !== "undefined") ? CareerProfile
      : (typeof require !== "undefined" ? require("../packages/domain/122-career-profile.js") : null);
    const J = (typeof CareerJobs !== "undefined") ? CareerJobs
      : (typeof require !== "undefined" ? require("../packages/domain/121-career-jobs.js") : null);
    return { CareerProfile: P, CareerJobs: J };
  }
  const isoOf = (ctx) => new Date((ctx && ctx.now) || Date.now()).toISOString();
  // The provenance the prepare contract accepts (apply_core POSITIVE): the
  // person stated it, here, on this date — never a derivation, never a guess.
  const provenanceOf = (ctx) => `owner stated (web onboarding, ${isoOf(ctx).slice(0, 10)})`;

  function flow(profile) {
    if (!profile.onboarding_flow) profile.onboarding_flow = { skipped: {}, seq: 0, started_at: null, match_presented_at: null, first_match_job_id: null };
    return profile.onboarding_flow;
  }
  // The same fact-version counter 130 bumps on every fact write (R2B): a
  // stored answer is a fact write, so packets prepared against older facts
  // go stale from here.
  function bumpFactVersion(profile) {
    profile.fact_version = (Number.isFinite(profile.fact_version) ? profile.fact_version : 0) + 1;
    return profile.fact_version;
  }
  function storeFact(profile, ctx, step, factFields) {
    const P = deps().CareerProfile;
    const f = flow(profile);
    f.seq += 1;
    const eventId = `web-onboarding:${step}:${f.seq}`;
    const input = Object.assign({}, factFields, {
      source: SOURCE,
      provenance: provenanceOf(ctx),
      confirmation_event_id: eventId,
      status: "confirmed",
      needs_confirmation: false,
    });
    if (ctx && ctx.owner) input.user_id = ctx.owner;
    const fact = P.addFact(profile, input);
    bumpFactVersion(profile);
    return fact;
  }

  // ---------- step state: derived from the stored profile ----------
  function answered(profile, key) {
    if (key === "name") return !!((profile.basics || {}).name && String(profile.basics.name).trim());
    if (key === "resume") return !!((profile.resume_sources || {}).active);
    if (key === "roles") return Array.isArray((profile.preferences || {}).roles) && profile.preferences.roles.length > 0;
    return false;
  }
  function stepState(profile) {
    const f = flow(profile);
    const out = QUESTION_STEPS.map((key) => {
      if (answered(profile, key)) return { key, state: "answered" };
      if (f.skipped[key]) return { key, state: "skipped", reason: f.skipped[key].reason };
      return { key, state: "pending" };
    });
    out.push({ key: "match", state: f.match_presented_at ? "presented" : "pending" });
    return out;
  }
  function currentStep(profile) {
    const st = stepState(profile);
    for (const s of st) if (s.key !== "match" && s.state === "pending") return s.key;
    return flow(profile).match_presented_at ? "done" : "match";
  }
  function progress(profile) {
    const st = stepState(profile).filter((s) => s.key !== "match");
    const answeredCount = st.filter((s) => s.state === "answered").length;
    const skippedCount = st.filter((s) => s.state === "skipped").length;
    // Coverage is covered/total, never reduced (builder plan rule 1).
    return { answered: answeredCount, skipped: skippedCount, total: QUESTION_STEPS.length, fraction: `${answeredCount}/${QUESTION_STEPS.length}` };
  }

  // ---------- the three questions ----------
  function answerName(profile, rawName, ctx) {
    const name = String(rawName || "").trim().replace(/\s+/g, " ");
    if (!name) return { ok: false, reason_class: "empty", reason: "no name was given", next_step: "Type your full name exactly as it should appear on an application." };
    profile.basics = profile.basics || {};
    profile.basics.name = name;
    const fact = storeFact(profile, ctx, "name", { kind: "profile", name: "Full name", title: "Full name", value: name, text: name });
    // The WO-102 answers record: the shape withStatedFacts merges into the
    // facts file prepare reads; a newer stated fact replaces an older one
    // under the same key.
    profile.answers = Object.assign({}, profile.answers, {
      full_name: { value: name, factId: fact.id, confirmed: true, provenance: fact.provenance, confirmation_event_id: fact.confirmation_event_id, span: name, label: "Full name" },
    });
    if (ctx && ctx.owner && profile.answers.full_name) profile.answers.full_name.user_id = ctx.owner;
    return { ok: true, fact_id: fact.id, step: currentStep(profile) };
  }

  function answerResume(profile, input, ctx) {
    const P = deps().CareerProfile;
    const r = P.ingestResume(profile, input, { now: (ctx && ctx.now) || null });
    if (!r.ok) {
      // 122's typed failure (unreadable / empty / unsupported) is surfaced
      // verbatim with its next step — the paste path is that next step, so
      // a rejected file is never a dead end.
      return { ok: false, reason_class: r.failure.reason_class, reason: r.failure.reason, next_step: r.failure.next_step };
    }
    const fileName = (input && (input.fileName || input.filename || input.name)) || "pasted-resume.txt";
    profile.resume_sources = { active: fileName, status: "active", source: SOURCE, precedence: "the person's own resume, given in web onboarding; a newer resume replaces it", at: isoOf(ctx) };
    bumpFactVersion(profile); // resume drafts are fact writes too (R2B)
    return { ok: true, added_fact_ids: r.added_fact_ids, skipped_duplicates: r.skipped_duplicates, step: currentStep(profile) };
  }

  const splitList = (t) => String(t || "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  function answerRoles(profile, input, ctx) {
    const roles = Array.isArray(input && input.roles) ? input.roles.map((x) => String(x).trim()).filter(Boolean) : splitList(input && input.roles);
    const goal = String((input && input.goal) || "").trim();
    if (!roles.length && !goal) return { ok: false, reason_class: "empty", reason: "no target roles or goal were given", next_step: "Name at least one role to look for, or say the goal in your own words." };
    profile.preferences = profile.preferences || {};
    if (roles.length) {
      profile.preferences.roles = roles;
      storeFact(profile, ctx, "roles", { kind: "preference", title: "Target roles", value: roles.join(", "), text: `Target roles: ${roles.join(", ")}` });
    }
    if (goal) {
      profile.preferences.goals = goal;
      storeFact(profile, ctx, "roles", { kind: "goal", title: "Career goal", value: goal, text: goal });
      // The goal spine (142): the declaration rides stated_facts as a keyed
      // goal fact, verbatim — the same carriage the chat goal frame writes
      // and the recall reads. A single-kind fact: a newer goal replaces it.
      profile.stated_facts = profile.stated_facts || { facts: [] };
      const facts = profile.stated_facts.facts;
      const ex = facts.find((f) => f.kind === "goal");
      const rec = { kind: "goal", key: "career", value: goal, evidence: "web onboarding", at: isoOf(ctx) };
      if (ex) Object.assign(ex, rec); else facts.push(rec);
      profile.stated_facts.updatedAt = isoOf(ctx);
    }
    return { ok: true, step: currentStep(profile) };
  }

  function skipStep(profile, key, ctx) {
    if (!QUESTION_STEPS.includes(key)) return { ok: false, reason_class: "unknown_step", reason: `no skippable step named ${key}`, next_step: "Skip one of: name, resume, roles." };
    flow(profile).skipped[key] = { at: isoOf(ctx), reason: "skipped by the person" };
    return { ok: true, step: currentStep(profile) };
  }

  // ---------- the first reviewed match ----------
  function firstMatch(profile, postings, ctx) {
    const J = deps().CareerJobs;
    const pool = Array.isArray(postings) ? postings : [];
    const scoring = J.profileFromPersona(profile);
    const fams = (scoring.preferences && scoring.preferences.role_families) || [];
    const kept = [], dropped = [];
    for (const posting of pool) {
      const fit = J.scoreFit(posting, scoring, null, fams.length ? { askFamilies: fams } : {});
      if (fit.excluded) dropped.push({ job_id: posting.job_id, company: posting.company, title: posting.title, reasons: fit.reasons || [] });
      else kept.push({ job_id: posting.job_id, company: posting.company, title: posting.title, url: posting.url || null, score: fit.score, bucket: fit.bucket, reasons: fit.reasons || [], gaps: fit.gaps || [], matched_skills: fit.matched_skills || [] });
    }
    kept.sort((a, b) => (b.score || 0) - (a.score || 0));
    const match = kept[0] || null;
    const missing = stepState(profile).filter((s) => s.key !== "match" && s.state !== "answered")
      .map((s) => ({ step: s.key, reason: s.state === "skipped" ? s.reason : "not answered yet" }));
    const f = flow(profile);
    f.match_presented_at = isoOf(ctx);
    f.first_match_job_id = match ? match.job_id : null;
    return {
      considered: pool.length,
      kept, dropped, match, missing,
      fraction: pool.length ? `${kept.length}/${pool.length}` : "0/0",
    };
  }

  // The WO-102 file half prepare consumes: the person's own answers record,
  // under their own id — nothing derived, nothing renamed.
  function answersForPrepare(profile) {
    return { user_id: profile.user_id || null, answers: profile.answers || {} };
  }

  // ---------- DOM rendering ----------
  function el(doc, tag, cls, text) {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function progressLine(doc, profile) {
    const p = progress(profile);
    const wrap = el(doc, "div", "f3-progress");
    const label = el(doc, "span", "f3-progress-label", `Answers saved ${p.fraction}`);
    const track = el(doc, "span", "f3-progress-track");
    const fill = el(doc, "span", "f3-progress-fill");
    fill.style.width = `${p.total ? (100 * p.answered) / p.total : 0}%`;
    track.appendChild(fill);
    wrap.appendChild(label);
    wrap.appendChild(track);
    return wrap;
  }
  function renderStep(doc, profile, stepKey, actions, error) {
    const stepDef = STEPS.find((s) => s.key === stepKey);
    const sec = el(doc, "section", "f3-step");
    sec.setAttribute("data-f3-step", stepKey);
    sec.setAttribute("data-active", "true");
    sec.appendChild(el(doc, "h2", "f3-h", stepDef.label));
    sec.appendChild(progressLine(doc, profile));
    if (error) {
      const alert = el(doc, "p", "f3-error", `${error.reason}${error.next_step ? ` ${error.next_step}` : ""}`);
      alert.setAttribute("role", "alert");
      sec.appendChild(alert);
    }
    const actionsRow = el(doc, "div", "f3-actions");
    const cont = el(doc, "button", "f3-btn f3-btn-primary", "Continue");
    cont.setAttribute("data-f3-continue", "");
    const skip = el(doc, "button", "f3-btn", "Skip for now");
    skip.setAttribute("data-f3-skip", "");
    skip.addEventListener("click", () => actions.skip(stepKey));
    if (stepKey === "name") {
      const input = el(doc, "input", "f3-input");
      input.setAttribute("data-f3-name-input", "");
      input.setAttribute("type", "text");
      input.setAttribute("autocomplete", "name");
      input.setAttribute("placeholder", "Your full name");
      if (profile.basics && profile.basics.name) input.value = profile.basics.name;
      sec.appendChild(input);
      cont.addEventListener("click", () => actions.answer("name", input.value));
    } else if (stepKey === "resume") {
      const file = el(doc, "input", "f3-input");
      file.setAttribute("type", "file");
      file.setAttribute("data-f3-resume-file", "");
      file.setAttribute("accept", ".txt,.md,text/plain");
      sec.appendChild(file);
      const area = el(doc, "textarea", "f3-input f3-area");
      area.setAttribute("data-f3-resume-input", "");
      area.setAttribute("rows", "8");
      area.setAttribute("placeholder", "…or paste your resume text here");
      sec.appendChild(area);
      cont.addEventListener("click", () => {
        const f = file.files && file.files[0];
        if (f && typeof actions.readFileText === "function") {
          actions.readFileText(f).then((text) => actions.answer("resume", { text, fileName: f.name, mimeType: f.type }));
        } else actions.answer("resume", { text: area.value });
      });
    } else if (stepKey === "roles") {
      const roles = el(doc, "input", "f3-input");
      roles.setAttribute("data-f3-roles-input", "");
      roles.setAttribute("type", "text");
      roles.setAttribute("placeholder", "Target roles, comma-separated — e.g. Data Analyst");
      if (profile.preferences && Array.isArray(profile.preferences.roles)) roles.value = profile.preferences.roles.join(", ");
      sec.appendChild(roles);
      const goal = el(doc, "input", "f3-input");
      goal.setAttribute("data-f3-goal-input", "");
      goal.setAttribute("type", "text");
      goal.setAttribute("placeholder", "Your goal in your own words — e.g. a data analyst internship for summer 2027");
      if (profile.preferences && profile.preferences.goals) goal.value = profile.preferences.goals;
      sec.appendChild(goal);
      cont.addEventListener("click", () => actions.answer("roles", { roles: roles.value, goal: goal.value }));
    }
    actionsRow.appendChild(cont);
    actionsRow.appendChild(skip);
    sec.appendChild(actionsRow);
    return sec;
  }
  function renderMatch(doc, profile, result) {
    const sec = el(doc, "section", "f3-step");
    sec.setAttribute("data-f3-step", "match");
    sec.setAttribute("data-active", "true");
    sec.appendChild(el(doc, "h2", "f3-h", "Your first reviewed match"));
    sec.appendChild(progressLine(doc, profile));
    sec.appendChild(el(doc, "p", "f3-coverage",
      `Postings considered ${result.considered} · kept ${result.fraction} · dropped ${result.dropped.length}/${result.considered}`));
    if (result.missing.length) {
      const basis = el(doc, "ul", "f3-missing");
      for (const m of result.missing) basis.appendChild(el(doc, "li", null, `${m.step} — ${m.reason}`));
      sec.appendChild(el(doc, "p", "f3-basis-label", "Match basis:"));
      sec.appendChild(basis);
    }
    if (result.match) {
      const card = el(doc, "article", "f3-match");
      card.setAttribute("data-f3-match", "");
      card.appendChild(el(doc, "h3", "f3-match-title", `${result.match.title} — ${result.match.company}`));
      card.appendChild(el(doc, "p", "f3-meta", `Score ${result.match.score} · ${result.match.bucket}`));
      const reasons = el(doc, "ul", "f3-reasons");
      for (const r of result.match.reasons) reasons.appendChild(el(doc, "li", null, r));
      card.appendChild(reasons);
      // INTEGRATION POINT (F2): the approval card for this match's prepared
      // application mounts into this slot (TraineeApprovalCard, trunk) —
      // the same slot contract F1's queue exposes. Nothing is prepared or
      // submittable from here until that component and the owner's word.
      const slot = el(doc, "div", "f3-card-slot");
      slot.setAttribute("data-f3-card-slot", "");
      slot.setAttribute("data-job-id", result.match.job_id);
      card.appendChild(slot);
      sec.appendChild(card);
    } else {
      sec.appendChild(el(doc, "p", "f3-nomatch",
        result.considered === 0 ? "No postings are in the pool yet, so there is nothing to match against — your answers are saved and the first match is composed as soon as postings land."
          : "No posting in the pool fits the roles on file — every considered posting is listed below with the rule that dropped it."));
    }
    if (result.dropped.length) {
      const list = el(doc, "ul", "f3-dropped");
      for (const d of result.dropped) list.appendChild(el(doc, "li", null, `${d.title} — ${d.company}: dropped — ${d.reasons.join("; ")}`));
      sec.appendChild(el(doc, "p", "f3-basis-label", "Dropped, with reasons:"));
      sec.appendChild(list);
    }
    return sec;
  }
  function renderDone(doc, profile) {
    const sec = el(doc, "section", "f3-step");
    sec.setAttribute("data-f3-step", "done");
    sec.appendChild(el(doc, "h2", "f3-h", "You are set up"));
    sec.appendChild(progressLine(doc, profile));
    const f = flow(profile);
    sec.appendChild(el(doc, "p", "f3-done",
      f.first_match_job_id ? "Your answers are saved and your first reviewed match is in your queue. Nothing here is re-asked — change any answer from your profile."
        : "Your answers are saved. Nothing here is re-asked — change any answer from your profile."));
    return sec;
  }

  // mount(el, host): host = { profile, postings, now, owner, save, readFileText }.
  // The profile object is the store: the host persists it after every answer
  // (save), so a reload mid-flow resumes from the stored profile alone.
  function mount(elm, host) {
    const doc = elm.ownerDocument;
    const profile = host.profile;
    const session = { profile, error: null };
    const ctx = () => ({ now: typeof host.now === "function" ? host.now() : Date.now(), owner: host.owner || profile.user_id || null });
    function draw() {
      const key = currentStep(profile);
      elm.innerHTML = "";
      if (key === "done") { elm.appendChild(renderDone(doc, profile)); return; }
      if (key === "match") {
        const result = firstMatch(profile, host.postings || [], ctx());
        if (typeof host.save === "function") host.save(profile);
        elm.appendChild(renderMatch(doc, profile, result));
        return;
      }
      elm.appendChild(renderStep(doc, profile, key, actions, session.error));
    }
    const actions = {
      readFileText: host.readFileText,
      answer(stepKey, payload) {
        const r = stepKey === "name" ? answerName(profile, payload, ctx())
          : stepKey === "resume" ? answerResume(profile, payload, ctx())
            : answerRoles(profile, payload, ctx());
        if (!r.ok) { session.error = r; draw(); return r; }
        session.error = null;
        if (typeof host.save === "function") host.save(profile);
        draw();
        return r;
      },
      skip(stepKey) {
        skipStep(profile, stepKey, ctx());
        session.error = null;
        if (typeof host.save === "function") host.save(profile);
        draw();
      },
    };
    draw();
    return { profile, draw, currentStep: () => currentStep(profile) };
  }

  return { BUDGET_MS, STEPS, QUESTION_STEPS, stepState, currentStep, progress, answerName, answerResume, answerRoles, skipStep, firstMatch, answersForPrepare, renderStep, renderMatch, renderDone, mount };
})();
if (typeof module !== "undefined" && module.exports) module.exports = TraineeOnboarding;
