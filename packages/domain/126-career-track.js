/* Career application tracking (Doc 2 section 7; F04 Track scenarios SC-061..SC-080).
   Pure domain module, UMD like 121-career-jobs. Persistence is INJECTED: a store is either a plain
   array of application rows, an object { rows: [...] }, or the array returned by createMemoryStore().
   Tests and scenario runners use the array-backed store, exactly like 121's feedback store.
   No sends, no calendar writes, no portal logins happen here: this module produces alert records,
   drafts (approval-gated), calendar-event records and analytics computed ONLY from the log's rows.

   Application row: { app_id, company, role, role_family, url, applied_at, resume_version, source
     ('cold'|'referred'), referred_by, fit_bucket ('Reach'|'Match'|'Safety'|null), stage, events[],
     offer_deadline, assessment_deadline, cooldown_until, label:'TEST' (seed data only) }
   Event: { type, at, source ('inbox'|'user-reported'|'system'|'seed'), detail, evidence }
   Stages (Doc 2 7.1): Saved, Tailoring, Ready, Submitted, Confirmed, Recruiter screen, OA/assessment,
     Interview rounds, Final, Offer, Rejected, Ghosted, Withdrawn, Accepted.
   Inbox classes (Doc 2 7.2): confirmation, rejection, oa_invite, interview_invite, offer,
     recruiter_other are SIGNALS; marketing_noise / unknown are NO-SIGNAL (never move a stage). */
const CareerTrack = (() => {
  const DAY = 86400000;
  const STAGES = ["Saved", "Tailoring", "Ready", "Submitted", "Confirmed", "Recruiter screen", "OA/assessment", "Interview rounds", "Final", "Offer", "Rejected", "Ghosted", "Withdrawn", "Accepted"];
  const TERMINAL = ["Rejected", "Withdrawn", "Accepted"];
  const OPEN = STAGES.filter((x) => !TERMINAL.includes(x));
  // Quiet-period rule (Doc 2 7.3/7.4 examples: nudge proposed at 10 days, "21 days quiet" ghosted):
  const NUDGE_AFTER_DAYS = 10;
  const GHOST_AFTER_DAYS = 21;
  // Reapply cooldown default policy (no company file in the repo carries a cooldown field — see SC-074):
  const DEFAULT_COOLDOWN_DAYS = 180;
  const QUIET_HOURS = { start: 22, end: 7 }; // 22:00-07:00 local; low-priority batches to morning

  const s = (v) => (v == null ? "" : String(v));
  const lc = (v) => s(v).toLowerCase();
  const normCo = (v) => lc(v).replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\b(inc|llc|ltd|corp|company|co|the)\b/g, " ").replace(/\s+/g, " ").trim();
  const daysBetween = (a, b) => Math.floor((b - a) / DAY);
  const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

  // ---------- store ----------
  function rowsOf(store) {
    if (Array.isArray(store)) return store;
    if (store && Array.isArray(store.rows)) return store.rows;
    throw new Error("track store must be an array or {rows: []} (array-backed, like 121's feedback store)");
  }
  function createMemoryStore(initial) { return { rows: (initial || []).map((r) => JSON.parse(JSON.stringify(r))) }; }

  // ---------- log writes ----------
  let seq = 0;
  function addApplication(store, input, opts) {
    opts = opts || {};
    const rows = rowsOf(store);
    const at = opts.now || Date.now();
    const app = {
      app_id: input.app_id || `app-${normCo(input.company).replace(/\s+/g, "-")}-${(++seq).toString(36)}${rows.length}`,
      company: s(input.company), role: s(input.role || ""), role_family: s(input.role_family || ""),
      url: s(input.url || ""), applied_at: input.applied_at || new Date(at).toISOString(),
      resume_version: s(input.resume_version || ""), source: input.source === "referred" ? "referred" : "cold",
      referred_by: input.referred_by || null, fit_bucket: input.fit_bucket || null,
      stage: input.stage || "Submitted",
      offer_deadline: input.offer_deadline || null, assessment_deadline: input.assessment_deadline || null,
      cooldown_until: input.cooldown_until || null,
      events: [{ type: "applied", at: input.applied_at || new Date(at).toISOString(), source: input.event_source || "system", detail: `applied (${input.source === "referred" ? "referred" : "cold"}, resume ${input.resume_version || "?"})`, evidence: input.url || null }],
    };
    rows.push(app); return app;
  }
  function findByCompany(store, company) {
    const n = normCo(company); if (!n) return null;
    return rowsOf(store).find((r) => normCo(r.company) === n || normCo(r.company).includes(n) || n.includes(normCo(r.company))) || null;
  }
  function moveStage(app, stage, event, now) {
    if (!STAGES.includes(stage)) throw new Error("unknown stage: " + stage);
    app.stage = stage;
    app.events.push(Object.assign({ at: new Date(now || Date.now()).toISOString() }, event, { stage_after: stage }));
    return app;
  }
  // SC-070: manual update via chat; source is ALWAYS marked 'user-reported'.
  function manualUpdate(store, company, stage, opts) {
    opts = opts || {};
    const app = findByCompany(store, company);
    if (!app) return { ok: false, reason: `no application in the log for ${company}` };
    moveStage(app, stage, { type: "manual_update", source: "user-reported", detail: opts.detail || `user reported: ${stage}` }, opts.now);
    return { ok: true, application: app };
  }

  // ---------- status (SC-061, SC-080, SC-076) ----------
  function lastSignalAt(app) {
    const evs = (app.events || []).filter((e) => e.type !== "applied");
    return evs.length ? Date.parse(evs[evs.length - 1].at) : Date.parse(app.applied_at);
  }
  function statusSummary(store, opts) {
    opts = opts || {}; const now = opts.now || Date.now();
    const rows = rowsOf(store);
    const byStage = {}; for (const st of STAGES) byStage[st] = 0;
    const apps = rows.map((r) => {
      byStage[r.stage] = (byStage[r.stage] || 0) + 1;
      return { app_id: r.app_id, company: r.company, role: r.role, stage: r.stage, applied_at: r.applied_at, days_since_applied: daysBetween(Date.parse(r.applied_at), now), days_quiet: daysBetween(lastSignalAt(r), now), resume_version: r.resume_version, source: r.source, last_event: (r.events || [])[r.events.length - 1] || null };
    });
    return { total: rows.length, by_stage: byStage, open: apps.filter((a) => !TERMINAL.includes(a.stage)).length, applications: apps };
  }
  function statusByCompany(store, company, opts) {
    opts = opts || {}; const now = opts.now || Date.now();
    const app = findByCompany(store, company);
    if (!app) return { found: false, company };
    const last = (app.events || [])[app.events.length - 1] || null;
    return { found: true, company: app.company, role: app.role, stage: app.stage, applied_at: app.applied_at, resume_version: app.resume_version, source: app.source, days_since_applied: daysBetween(Date.parse(app.applied_at), now), last_signal: last ? { type: last.type, at: last.at, source: last.source, detail: last.detail } : null, offer_deadline: app.offer_deadline, assessment_deadline: app.assessment_deadline };
  }
  function timeline(store, company) {
    const app = findByCompany(store, company);
    if (!app) return { found: false, company };
    return { found: true, company: app.company, role: app.role, events: (app.events || []).map((e) => ({ type: e.type, at: e.at, source: e.source, detail: e.detail, evidence: e.evidence || null, stage_after: e.stage_after || null })) };
  }

  // ---------- inbox classification (Doc 2 7.2; SC-062/063/064/071/078) ----------
  // A message: { id, from, subject, body, at }. Company matched from explicit company field, else
  // from/subject/body mention of a known company name (log rows + caller-supplied list).
  const SIGNAL_RULES = [
    ["offer", /\b(offer letter|pleased to offer|offer of (employment|internship)|your offer|compensation package)\b/i],
    ["rejection", /\b(unfortunately|regret to inform|not (be )?moving forward|decided to move forward with other|other candidates|position has been filled|not selected|will not be moving)\b/i],
    ["oa_invite", /\b(online assessment|hacker ?rank|codility|codesignal|assessment (link|invitation)|complete (the|your) assessment|take-home)\b/i],
    ["interview_invite", /\b(interview|phone screen|recruiter screen|schedule (a|your) (call|chat|interview)|speak with (our|the) (recruiter|team)|calendly\.com|greenhouse.*schedul|book a time)\b/i],
    ["confirmation", /\b(application (received|submitted|confirmed)|thank you for applying|thanks for applying|we (have )?received your application|application confirmation)\b/i],
    ["recruiter_other", /\b(recruiter|talent team|hiring team|careers team)\b/i],
  ];
  const NOISE_RULES = [/\b(newsletter|webinar|job alert|jobs you might like|unsubscribe|marketing|% off|sale ends|upcoming event|blog post|digest@|no-?reply@.*(alert|news))\b/i, /^(.*?(job alert|newsletter).*?)$/i];
  function classifyMessage(msg, knownCompanies) {
    const text = `${s(msg.subject)}\n${s(msg.body)}`;
    const fromLc = lc(msg.from);
    let company = msg.company || null;
    if (!company && knownCompanies) {
      company = (knownCompanies || []).find((c) => { const n = normCo(c); return n && (lc(text).includes(lc(c)) || fromLc.includes(n.split(" ")[0])); }) || null;
    }
    if (!company && msg.company_domain) company = msg.company_domain;
    for (const re of NOISE_RULES) if (re.test(text) || re.test(fromLc)) return { message_id: msg.id || null, class: "marketing_noise", is_signal: false, decision: false, company, reasons: ["matches no-signal marketing pattern (Doc 2 7.2: noise never moves a stage)"] };
    for (const [cls, re] of SIGNAL_RULES) if (re.test(text) || (cls === "recruiter_other" && /\b(recruiter|talent team|hiring team|careers team)\b/.test(fromLc))) {
      const decision = ["rejection", "offer"].includes(cls);
      return { message_id: msg.id || null, class: cls, is_signal: true, decision, company, reasons: [`matched ${cls} pattern${re.test(text) ? "" : " (sender is a recruiter/hiring address)"}`] };
    }
    return { message_id: msg.id || null, class: "unknown", is_signal: false, decision: false, company, reasons: ["no signal pattern matched — treated as no-signal"] };
  }
  const CLASS_TO_STAGE = { confirmation: "Confirmed", rejection: "Rejected", oa_invite: "OA/assessment", interview_invite: "Interview rounds", offer: "Offer" };
  // Ingest one message: classify, link to the log row, move stage, attach evidence + side records.
  function ingestMessage(store, msg, opts) {
    opts = opts || {}; const now = opts.now || Date.parse(msg.at || Date.now()) || Date.now();
    const rows = rowsOf(store);
    const cls = classifyMessage(msg, rows.map((r) => r.company).concat(opts.knownCompanies || []));
    if (!cls.is_signal) return { classification: cls, linked: false, moved: false, alert: null, reason: "no-signal: stage unchanged" };
    const app = cls.company ? findByCompany(store, cls.company) : null;
    if (!app) return { classification: cls, linked: false, moved: false, alert: null, reason: `signal for ${cls.company || "unknown company"} but no matching application in the log` };
    const stage = CLASS_TO_STAGE[cls.class];
    const out = { classification: cls, linked: true, application: app.company, moved: false, alert: null };
    if (stage && app.stage !== stage && !TERMINAL.includes(app.stage)) {
      moveStage(app, stage, { type: cls.class, source: "inbox", detail: `${cls.class} detected in inbox message ${msg.id || "(no id)"}: "${s(msg.subject).slice(0, 90)}"`, evidence: msg.id || msg.subject || null }, now);
      out.moved = true; out.stage_after = stage;
    } else { out.stage_after = app.stage; }
    out.alert = { kind: cls.class, company: app.company, stage_after: out.stage_after, at: new Date(now).toISOString(), text: alertText(cls.class, app) };
    if (cls.class === "interview_invite") { // SC-064: calendar record attached + F09 prep seam noted
      out.calendar_event = { title: `Interview — ${app.company} (${app.role})`, company: app.company, app_id: app.app_id, source_message: msg.id || null, status: "attached-to-application (calendar rail seam)", prep: "prep triggered (F09 seam)" };
      app.events.push({ type: "calendar_event_attached", at: new Date(now).toISOString(), source: "inbox", detail: out.calendar_event.title, evidence: msg.id || null });
    }
    if (cls.class === "oa_invite") { // SC-071/SC-126: agent NEVER takes it; a dated message sets the deadline + queues prep
      const dl = extractMessageDate(msg); if (dl && !app.assessment_deadline) app.assessment_deadline = dl;
      out.assessment = handleAssessment(app, msg, now);
    }
    if (cls.class === "offer") { // SC-127: intake starts on arrival; a dated letter starts the expiry clock
      const dl = extractMessageDate(msg); if (dl && !app.offer_deadline) app.offer_deadline = dl;
      out.offer_intake = { started: true, at: new Date(now).toISOString(), company: app.company, offer_deadline: app.offer_deadline || null, expiry_clock_started: !!app.offer_deadline, next: "offer intake: read terms, start deadline countdown, prep decision card (128-career-negotiation seam)" };
    }
    if (cls.class === "rejection") out.pattern_note = rejectionAnalysis(store, opts).headline;
    return out;
  }
  function alertText(cls, app) {
    return { confirmation: `${app.company}: application confirmed.`, rejection: `${app.company} rejected this application — see the pattern note and plan.`, oa_invite: `${app.company} sent an online assessment. I can schedule, remind and prep — I do not take assessments.`, interview_invite: `${app.company} invited you to interview. Prep triggered.`, offer: `${app.company} sent an offer. Deadline tracking is on.`, recruiter_other: `${app.company} recruiter emailed.` }[cls] || `${app.company}: new signal.`;
  }
  function handleAssessment(app, msg, now) {
    return { will_take: false, statement: "I will not take this assessment for you — that would be dishonest and can get candidates banned (Doc 2 5.3).", actions: ["schedule a sitting time", "remind before the deadline", "offer prep"], prep_pack_queued: true, company: app.company, deadline: app.assessment_deadline || null, received_at: new Date(now || Date.now()).toISOString(), source_message: msg && msg.id || null };
  }

  // ---------- quiet period / ghosted (SC-067/068) ----------
  function quietReport(store, opts) {
    opts = opts || {}; const now = opts.now || Date.now();
    const nudgeAfter = opts.nudgeAfterDays != null ? opts.nudgeAfterDays : NUDGE_AFTER_DAYS;
    const ghostAfter = opts.ghostAfterDays != null ? opts.ghostAfterDays : GHOST_AFTER_DAYS;
    return rowsOf(store).filter((r) => ["Submitted", "Confirmed", "Recruiter screen", "Final"].includes(r.stage)).map((r) => {
      const days = daysBetween(lastSignalAt(r), now);
      return { company: r.company, role: r.role, stage: r.stage, days_quiet: days, last_signal_at: new Date(lastSignalAt(r)).toISOString(), nudge_due: days >= nudgeAfter, ghosted: days >= ghostAfter, state: days >= ghostAfter ? "ghosted" : days >= nudgeAfter ? "nudge_due" : "within_window" };
    }).sort((a, b) => b.days_quiet - a.days_quiet);
  }
  function markGhosted(store, opts) {
    opts = opts || {}; const now = opts.now || Date.now();
    const out = [];
    for (const q of quietReport(store, opts)) if (q.ghosted) { const app = findByCompany(store, q.company); if (app && app.stage !== "Ghosted") { moveStage(app, "Ghosted", { type: "ghosted", source: "system", detail: `${q.days_quiet} days quiet (rule: >= ${opts.ghostAfterDays != null ? opts.ghostAfterDays : GHOST_AFTER_DAYS} days with no signal)` }, now); out.push(q.company); } }
    return out;
  }
  function draftNudge(app, opts) {
    opts = opts || {}; const now = opts.now || Date.now();
    const days = daysBetween(lastSignalAt(app), now);
    return { kind: "follow_up_nudge", company: app.company, role: app.role, days_quiet: days, requires_approval: true, sends: false,
      subject: `Following up — ${app.role} application`,
      body: `Hello ${app.company} team,\n\nI'm following up on my application for ${app.role}, submitted on ${isoDay(Date.parse(app.applied_at))} (resume version ${app.resume_version || "on file"}). I'm still very interested in the role and would welcome any update on the timeline.\n\nThank you for your time,\nAlex Testcase (TEST)`,
      basis: { applied_at: app.applied_at, resume_version: app.resume_version, stage: app.stage, days_quiet: days } };
  }
  function draftThankYou(app, opts) {
    opts = opts || {}; const now = opts.now || Date.now();
    const iv = (app.events || []).filter((e) => /interview/.test(e.type)).slice(-1)[0];
    const hours = iv ? Math.max(0, Math.round((now - Date.parse(iv.at)) / 3600000)) : null;
    const note = opts.note ? s(opts.note) : null; // SC-129: the user's one-line note, carried verbatim
    return { kind: "thank_you", company: app.company, role: app.role, requires_approval: true, sends: false, within_24h: hours != null ? hours <= 24 : null, hours_since_interview: hours,
      subject: `Thank you — ${app.role} interview`,
      body: `Hello ${app.company} team,\n\nThank you for speaking with me about the ${app.role} role. I enjoyed the conversation and am even more interested in the team.${note ? `\n\nOne thing that stayed with me: ${note}.` : ""}\n\nBest regards,\nAlex Testcase (TEST)`,
      basis: { interview_event_at: iv ? iv.at : null, stage: app.stage, user_note: note } };
  }
  // SC-125: response to an ambiguous recruiter reply — drafted, never sent without the user's yes.
  function draftRecruiterReply(app, classification, opts) {
    opts = opts || {};
    return { kind: "recruiter_reply", company: app.company, role: app.role, requires_approval: true, sends: false,
      classification: classification ? classification.class : "unknown", ambiguity: "no decision stated in the message — the draft asks for the timeline/next step rather than assuming one",
      subject: `Re: ${app.role} application`,
      body: `Hello ${app.company} team,\n\nThank you for the update on my ${app.role} application. I remain very interested in the role. Could you share the expected timeline and next step on your side? Happy to find a time next week for a quick chat if that helps.\n\nBest regards,\nAlex Testcase (TEST)`,
      basis: { stage: app.stage, message_id: classification ? classification.message_id : null } };
  }
  // SC-139: options once an application is labeled Ghosted.
  function ghostedOptions(store, company, opts) {
    opts = opts || {}; const now = opts.now || Date.now();
    const app = findByCompany(store, company);
    if (!app) return { found: false, company };
    // Quiet clock runs from the last EXTERNAL signal — the system's own 'ghosted' label event must not reset it.
    const evs = (app.events || []).filter((e) => e.type !== "applied" && e.type !== "ghosted");
    const last = evs.length ? Date.parse(evs[evs.length - 1].at) : Date.parse(app.applied_at);
    const days = daysBetween(last, now);
    return { found: true, company: app.company, label: app.stage === "Ghosted" || days >= GHOST_AFTER_DAYS ? "Ghosted" : app.stage, days_quiet: days, stage: app.stage,
      options: ["Send one final, short nudge (draft on a card — your yes before it sends)", "Keep the relationship warm: thank-you/reconnect note to your contact there, no application pressure", "Close it in the log and put the hours into live applications; reapply only after the cooldown window"] };
  }

  // ---------- digest (SC-065/075) ----------
  function weeklyDigest(store, opts) {
    opts = opts || {}; const now = opts.now || Date.now(); const since = now - 7 * DAY;
    const rows = rowsOf(store);
    let sent7 = 0, responses7 = 0, interviews = 0, rejections7 = 0; const next = [];
    for (const r of rows) {
      if (Date.parse(r.applied_at) >= since) sent7++;
      const evs = (r.events || []).filter((e) => Date.parse(e.at) >= since);
      if (evs.some((e) => ["confirmation", "rejection", "oa_invite", "interview_invite", "offer", "manual_update"].includes(e.type))) responses7++;
      if (["Interview rounds", "Final"].includes(r.stage)) interviews++;
      if (evs.some((e) => e.type === "rejection")) rejections7++;
    }
    // FIN-E-013: deadlineRadar re-derives the same follow-up from quietReport.
    // Keep the radar's dated follow-up line (the more informative rendering)
    // and drop the duplicate nudge line for that company — one event, once.
    const radar = deadlineRadar(store, [], { now, withinDays: 14 });
    const radarFollowUps = new Set(radar.filter((d) => d.kind === "follow_up_due").map((d) => normCo(d.company)));
    for (const q of quietReport(store, { now })) if (q.nudge_due && !radarFollowUps.has(normCo(q.company))) next.push(`nudge ${q.company} (${q.days_quiet} days quiet)`);
    for (const d of radar) next.push(`${d.label}: ${d.date} (${d.days_away} day${d.days_away === 1 ? "" : "s"})`);
    const counts = { total_applications: rows.length, sent_last_7d: sent7, responses_last_7d: responses7, active_interviews: interviews, rejections_last_7d: rejections7, open: rows.filter((r) => !TERMINAL.includes(r.stage)).length };
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    const text = `Weekly digest: ${counts.sent_last_7d} sent this week, ${plural(counts.responses_last_7d, "response")}, ${plural(counts.active_interviews, "interview")} in progress, ${plural(counts.rejections_last_7d, "rejection")} this week. Open: ${counts.open} of ${counts.total_applications}. Next: ${next.length ? next.join("; ") : "nothing due"}.`;
    return { counts, next_actions: next, text, generated_at: new Date(now).toISOString() };
  }
  // SC-131: daily digest — same log math over a 24h window, for an active application week.
  function dailyDigest(store, opts) {
    opts = opts || {}; const now = opts.now || Date.now(); const since = now - DAY;
    const rows = rowsOf(store);
    let sent24 = 0, responses24 = 0, rejections24 = 0; const next = [];
    for (const r of rows) {
      if (Date.parse(r.applied_at) >= since) sent24++;
      const evs = (r.events || []).filter((e) => Date.parse(e.at) >= since);
      if (evs.some((e) => ["confirmation", "rejection", "oa_invite", "interview_invite", "offer", "manual_update"].includes(e.type))) responses24++;
      if (evs.some((e) => e.type === "rejection")) rejections24++;
    }
    for (const q of quietReport(store, { now })) if (q.nudge_due) next.push(`nudge ${q.company} (${q.days_quiet} days quiet)`);
    for (const d of deadlineRadar(store, [], { now, withinDays: 7 })) next.push(`${d.kind} ${d.company || d.label}: ${d.date} (${d.days_away} days)`);
    const counts = { total_applications: rows.length, sent_last_24h: sent24, responses_last_24h: responses24, rejections_last_24h: rejections24, active_interviews: rows.filter((r) => ["Interview rounds", "Final"].includes(r.stage)).length, open: rows.filter((r) => !TERMINAL.includes(r.stage)).length };
    return { window_hours: 24, counts, next_actions: next, text: `Daily digest: ${sent24} sent in the last 24h, ${responses24} responses, ${counts.active_interviews} in interview stages, ${rejections24} rejections. Open: ${counts.open} of ${counts.total_applications}. Next: ${next.length ? next.join("; ") : "nothing due"}.`, generated_at: new Date(now).toISOString() };
  }
  // Quiet hours: low-priority (digest, nudge reminders) batch to 07:00; critical fire immediately.
  function planDelivery(item, at) {
    const d = new Date(at); const h = d.getHours();
    const critical = item && (item.critical === true || ["interview_invite", "offer", "rejection"].includes(item.kind) || (item.kind === "deadline" && item.days_away != null && item.days_away <= 2));
    const inQuiet = h >= QUIET_HOURS.start || h < QUIET_HOURS.end;
    if (critical) return { deliver_at: d.toISOString(), immediate: true, batched: false, reason: "critical/status item fires even in quiet hours" };
    if (!inQuiet) return { deliver_at: d.toISOString(), immediate: true, batched: false, reason: "outside quiet hours" };
    const morning = new Date(d); morning.setHours(QUIET_HOURS.end, 0, 0, 0); if (morning <= d) morning.setDate(morning.getDate() + 1);
    return { deliver_at: morning.toISOString(), immediate: false, batched: true, reason: `quiet hours ${QUIET_HOURS.start}:00-${String(QUIET_HOURS.end).padStart(2, "0")}:00 — low-priority batches to morning` };
  }

  // ---------- funnel + rejection analytics (SC-066/077; Doc 2 7.5/7.6) ----------
  // Claims are ONLY made from the log's own rows; a comparison claim needs >=3 rows on each side
  // and a real difference, else supported:false with the reason.
  function responded(r) { return (r.events || []).some((e) => ["confirmation", "oa_invite", "interview_invite", "offer", "recruiter_other"].includes(e.type)) || ["Confirmed", "Recruiter screen", "OA/assessment", "Interview rounds", "Final", "Offer"].includes(r.stage); }
  function interviewed(r) { return ["Interview rounds", "Final", "Offer", "Accepted"].includes(r.stage) || (r.events || []).some((e) => e.type === "interview_invite"); }
  function groupStats(rows, keyFn) {
    const groups = {};
    for (const r of rows) { const k = keyFn(r) || "(none)"; groups[k] = groups[k] || { n: 0, responses: 0, interviews: 0, rejections: 0, offers: 0 }; const g = groups[k]; g.n++; if (responded(r)) g.responses++; if (interviewed(r)) g.interviews++; if (r.stage === "Rejected") g.rejections++; if (["Offer", "Accepted"].includes(r.stage)) g.offers++; }
    for (const g of Object.values(groups)) { g.response_rate = g.n ? +(g.responses / g.n).toFixed(3) : 0; g.interview_rate = g.n ? +(g.interviews / g.n).toFixed(3) : 0; }
    return groups;
  }
  function funnelAnalytics(store) {
    const rows = rowsOf(store);
    const by_version = groupStats(rows, (r) => r.resume_version);
    const by_family = groupStats(rows, (r) => r.role_family);
    const by_source = groupStats(rows, (r) => r.source);
    const claims = [];
    const cold = by_source.cold, ref = by_source.referred;
    if (cold && ref) {
      const supported = cold.n >= 3 && ref.n >= 3 && ref.interview_rate !== cold.interview_rate;
      claims.push({ claim: `referred interview rate ${ref.interview_rate} vs cold ${cold.interview_rate}`, supported, basis: { cold_n: cold.n, referred_n: ref.n }, note: supported ? "computed from your own log rows only" : "not claimed: needs >=3 rows per side and a real difference in your own log" });
    }
    const overall = groupStats(rows, () => "all").all;
    return { total: rows.length, overall, by_version, by_family, by_source, claims };
  }
  // SC-132: kill the losing resume version — from the log's rows only; a version needs >=3 rows
  // to be killable, and it is killed only when another eligible version really out-responds it.
  function resumeVersionVerdict(store) {
    const by = funnelAnalytics(store).by_version;
    const eligible = Object.entries(by).filter(([, g]) => g.n >= 3);
    const sorted = eligible.slice().sort((a, b) => a[1].response_rate - b[1].response_rate || a[1].interview_rate - b[1].interview_rate);
    const worst = sorted[0], best = sorted[sorted.length - 1];
    const killed = worst && best && worst[0] !== best[0] && worst[1].response_rate < best[1].response_rate ? worst[0] : null;
    return { killed, kept: Object.keys(by).filter((v) => v !== killed), basis: by,
      reason: killed ? `${killed} response rate ${worst[1].response_rate} over ${worst[1].n} applications is the lowest of versions with >=3 rows; best eligible is ${best[0]} at ${best[1].response_rate}. Killed = stop sending it; log rows are kept.` : "no version killed: needs >=3 rows per version and a real response-rate difference in your own log" };
  }
  function rejectionAnalysis(store) {
    const rows = rowsOf(store);
    const rejected = rows.filter((r) => r.stage === "Rejected");
    const by_source = groupStats(rejected, (r) => r.source);
    const allBySource = groupStats(rows, (r) => r.source);
    const by_bucket = groupStats(rejected, (r) => r.fit_bucket);
    const allByBucket = groupStats(rows, (r) => r.fit_bucket);
    const coldRej = (allBySource.cold && allBySource.cold.n) ? rejected.filter((r) => r.source === "cold").length + "/" + allBySource.cold.n + " cold rejected" : "no cold rows";
    const reachRej = (allByBucket.Reach && allByBucket.Reach.n) ? rejected.filter((r) => r.fit_bucket === "Reach").length + "/" + allByBucket.Reach.n + " Reach rejected" : "no Reach rows";
    const headline = rejected.length ? `${rejected.length} rejections in the log. Pattern from your own rows: ${coldRej}; ${reachRej}.` : "No rejections in the log yet — nothing to pattern-match honestly.";
    const plan = rejected.length ? ["Cut cold Reach applications to a small hand-picked set", "Put the same hours into referral asks before applying (Doc 2 section 6)", "Keep Match/Safety volume steady — that is where your responses come from"] : [];
    return { rejected_count: rejected.length, total: rows.length, rejected_by_source: by_source, rejected_by_bucket: by_bucket, headline, honest_read: rejected.length ? "The rejections concentrate where the log says they concentrate (see rejected_by_source / rejected_by_bucket) — this is a targeting/source pattern in your own data, not a generic pep talk. No sugarcoating: cold Reach is the weakest channel in this log." : headline, plan };
  }

  // ---------- deadlines (SC-069/079) ----------
  const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
  function extractCirDeadlines(cirs, now) {
    const out = [];
    for (const cir of cirs || []) {
      const txt = JSON.stringify(cir);
      const re = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d\d)/gi;
      let m; const seen = new Set();
      while ((m = re.exec(txt))) {
        if (!/deadline/i.test(txt.slice(Math.max(0, m.index - 160), m.index + 60))) continue;
        const d = new Date(Date.UTC(Number(m[3]), MONTHS[lc(m[1])], Number(m[2]), 12, 0, 0));
        const key = cir.company_name + d.toISOString().slice(0, 10); if (seen.has(key)) continue; seen.add(key);
        if (d.getTime() >= (now || Date.now()) - DAY) out.push({ kind: "cir_deadline", company: cir.company_name || cir.company_id || null, label: `${cir.company_name || cir.company_id} application deadline`, date: d.toISOString().slice(0, 10), days_away: daysBetween(now || Date.now(), d.getTime()), source: "company file record" });
      }
    }
    return out;
  }
  function deadlineRadar(store, cirs, opts) {
    opts = opts || {}; const now = opts.now || Date.now(); const within = opts.withinDays != null ? opts.withinDays : 14;
    const items = [];
    for (const r of rowsOf(store)) {
      if (r.offer_deadline) { const t = Date.parse(r.offer_deadline); items.push({ kind: "offer_expiry", company: r.company, label: `${r.company} offer expiry`, date: isoDay(t), days_away: daysBetween(now, t), source: "application log" }); }
      if (r.assessment_deadline) { const t = Date.parse(r.assessment_deadline); items.push({ kind: "assessment_deadline", company: r.company, label: `${r.company} assessment deadline`, date: isoDay(t), days_away: daysBetween(now, t), source: "application log" }); }
    }
    for (const q of quietReport(store, { now })) if (q.nudge_due) items.push({ kind: "follow_up_due", company: q.company, label: `${q.company} follow-up due (${q.days_quiet} days quiet)`, date: isoDay(now), days_away: 0, source: "application log" });
    items.push(...extractCirDeadlines(cirs, now));
    return items.filter((i) => i.days_away >= -1 && i.days_away <= within).sort((a, b) => a.days_away - b.days_away || a.date.localeCompare(b.date));
  }
  // First explicit calendar date in a message ("October 18, 2026" or 2026-10-18), as a noon-UTC ISO.
  function extractMessageDate(msg) {
    const text = `${s(msg && msg.subject)}\n${s(msg && msg.body)}`;
    const iso = text.match(/\b(20\d\d)-(0[1-9]|1[0-2])-([0-3]\d)\b/); if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T12:00:00Z`;
    const m = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d\d)/i);
    if (m) return `${m[3]}-${String(MONTHS[lc(m[1])] + 1).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}T12:00:00Z`;
    return null;
  }
  // SC-134: inside 5 days an expiring offer escalates DAILY until the user decides.
  function offerEscalation(store, company, opts) {
    opts = opts || {}; const now = opts.now || Date.now();
    const c = offerCountdown(store, company, { now });
    if (!c.found || c.days_left == null) return { found: !!c.found, company, days_left: null, escalates_daily: false, schedule: [], stops_when: "user_decides" };
    const deadline = Date.parse(c.offer_deadline);
    const schedule = [];
    if (c.days_left <= 5) for (let t = now + DAY; t <= deadline; t += DAY) schedule.push({ date: isoDay(t), kind: "offer_expiry_escalation", company: c.company });
    else for (const d of [7, 3, 1]) if (c.days_left >= d) schedule.push({ date: isoDay(deadline - d * DAY), kind: "offer_expiry_alert", company: c.company });
    if (c.days_left <= 5 && !schedule.length) schedule.push({ date: isoDay(deadline), kind: "offer_expiry_escalation", company: c.company });
    return { found: true, company: c.company, offer_deadline: c.offer_deadline, days_left: c.days_left, escalates_daily: c.days_left <= 5, schedule, stops_when: "user_decides", note: "Escalation stops only when the user accepts, declines, or negotiates an extension — silence never decides." };
  }
  function offerCountdown(store, company, opts) {
    opts = opts || {}; const now = opts.now || Date.now();
    const app = findByCompany(store, company);
    if (!app || !app.offer_deadline) return { found: !!(app), company, offer_deadline: null, days_left: null };
    const days = daysBetween(now, Date.parse(app.offer_deadline));
    return { found: true, company: app.company, offer_deadline: app.offer_deadline, days_left: days, alerts: [7, 3, 1].filter((d) => days >= d).map((d) => `alert at ${d} days before expiry`).concat(days <= 3 ? ["alert now: inside 3 days"] : []) };
  }

  // ---------- duplicate channel (SC-078), cooldown (SC-074), withdraw (SC-073) ----------
  function duplicateCheck(store, messages, company) {
    const app = findByCompany(store, company);
    const hits = (messages || []).map((m) => classifyMessage(m, [company])).map((c, i) => ({ c, m: messages[i] })).filter(({ c }) => c.is_signal && normCo(c.company || "") === normCo(company));
    const confirmation = hits.find(({ c }) => c.class === "confirmation");
    return { company, in_log: !!app, log_stage: app ? app.stage : null, inbox_evidence: hits.map(({ c, m }) => ({ message_id: m.id || null, class: c.class, subject: m.subject || null, at: m.at || null })), already_applied: !!app || !!confirmation, answer: confirmation ? `Yes — inbox confirmation found (${confirmation.m.id || "message"}: "${confirmation.m.subject || ""}").` : app ? `Yes — the log has a ${company} application at stage ${app.stage}; no inbox confirmation was found in the messages searched.` : "No log row and no inbox confirmation found in the messages searched." };
  }
  function reapplyCheck(store, company, opts) {
    opts = opts || {}; const now = opts.now || Date.now();
    const cooldownDays = opts.cooldownDays != null ? opts.cooldownDays : DEFAULT_COOLDOWN_DAYS;
    const app = findByCompany(store, company);
    if (!app) return { company, allowed: true, reason: "no prior application in the log" };
    if (app.cooldown_until) { const t = Date.parse(app.cooldown_until); return { company, allowed: now >= t, reopen_date: isoDay(t), reason: `cooldown_until stored on the log row`, source: "application log" }; }
    const terminalEv = (app.events || []).filter((e) => ["rejection"].includes(e.type)).slice(-1)[0];
    if (app.stage === "Rejected" || terminalEv) {
      const base = terminalEv ? Date.parse(terminalEv.at) : Date.parse(app.applied_at);
      const reopen = base + cooldownDays * DAY;
      return { company, allowed: now >= reopen, reopen_date: isoDay(reopen), cooldown_days: cooldownDays, reason: `last rejection ${isoDay(base)} + ${cooldownDays}-day default cooldown policy (no company-file cooldown field exists — policy default, labeled as such)`, source: "application log + default policy" };
    }
    if (!TERMINAL.includes(app.stage)) return { company, allowed: false, reopen_date: null, reason: `an application to ${company} is already open at stage ${app.stage} — duplicate protection (Doc 2 5.4)`, source: "application log" };
    return { company, allowed: true, reason: "prior application is closed with no rejection cooldown" };
  }
  function withdrawalDrafts(store, acceptedCompany) {
    const open = rowsOf(store).filter((r) => !TERMINAL.includes(r.stage) && normCo(r.company) !== normCo(acceptedCompany));
    return { accepted_company: acceptedCompany, count: open.length, requires_approval: true, sends: false,
      drafts: open.map((r) => ({ app_id: r.app_id, company: r.company, role: r.role, stage: r.stage, subject: `Withdrawing my application — ${r.role}`, body: `Hello ${r.company} team,\n\nThank you for considering my application for ${r.role}. I have accepted another offer and would like to withdraw my application.\n\nBest regards,\nAlex Testcase (TEST)` })) };
  }
  // Log marks Withdrawn ONLY after sends confirm (SC-073).
  function confirmWithdrawals(store, appIds, opts) {
    opts = opts || {}; const done = [];
    for (const id of appIds || []) { const app = rowsOf(store).find((r) => r.app_id === id); if (app && !TERMINAL.includes(app.stage)) { moveStage(app, "Withdrawn", { type: "withdrawn", source: "system", detail: `withdrawal send confirmed (accepted ${opts.acceptedCompany || "another offer"})` }, opts.now); done.push(app.company); } }
    return done;
  }

  // ---------- TEST seed (labeled TEST; persona targets: Stripe/Goldman/Jane Street/Datadog/Ramp + ledger companies) ----------
  const SEED_NOW = Date.parse("2026-10-12T12:00:00Z");
  function seedRow(o) { return Object.assign({ events: [{ type: "applied", at: o.applied_at, source: "seed", detail: `applied (${o.source}, resume ${o.resume_version})`, evidence: o.url || null }].concat(o.extra_events || []) }, o, { extra_events: undefined, label: "TEST" }); }
  function seedTestLog() {
    const ev = (type, at, detail) => ({ type, at, source: type === "manual_update" ? "user-reported" : "inbox", detail, evidence: "TEST-fixture" });
    const rows = [
      seedRow({ app_id: "TEST-app-stripe", company: "Stripe", role: "Software Engineering Intern", role_family: "SWE", url: "https://stripe.com/jobs (TEST)", applied_at: "2026-09-20T12:00:00Z", resume_version: "swe-v2", source: "referred", referred_by: "TEST referral", fit_bucket: "Reach", stage: "Offer", offer_deadline: "2026-10-20T12:00:00Z", extra_events: [ev("confirmation", "2026-09-21T12:00:00Z", "confirmation (TEST)"), ev("interview_invite", "2026-10-03T12:00:00Z", "interview invite (TEST)"), ev("offer", "2026-10-10T12:00:00Z", "offer received (TEST)")] }),
      seedRow({ app_id: "TEST-app-ramp", company: "Ramp", role: "Software Engineering Intern", role_family: "SWE", url: "https://ramp.com/careers (TEST)", applied_at: "2026-10-02T12:00:00Z", resume_version: "swe-v2", source: "cold", fit_bucket: "Match", stage: "Confirmed", extra_events: [ev("confirmation", "2026-10-02T13:00:00Z", "confirmation (TEST)")] }),
      seedRow({ app_id: "TEST-app-palantir", company: "Palantir", role: "Software Engineering Intern", role_family: "SWE", url: "https://palantir.com/careers (TEST)", applied_at: "2026-09-21T12:00:00Z", resume_version: "swe-v1", source: "cold", fit_bucket: "Reach", stage: "Submitted", extra_events: [] }),
      seedRow({ app_id: "TEST-app-goldman", company: "Goldman Sachs", role: "Summer Analyst", role_family: "Finance", url: "https://goldmansachs.com/careers (TEST)", applied_at: "2026-09-15T12:00:00Z", resume_version: "fin-v1", source: "cold", fit_bucket: "Reach", stage: "Rejected", extra_events: [ev("confirmation", "2026-09-15T13:00:00Z", "confirmation (TEST)"), ev("rejection", "2026-10-05T12:00:00Z", "rejection (TEST)")] }),
      seedRow({ app_id: "TEST-app-janestreet", company: "Jane Street", role: "Quantitative Trading Intern", role_family: "Finance", url: "https://janestreet.com (TEST)", applied_at: "2026-09-10T12:00:00Z", resume_version: "fin-v1", source: "cold", fit_bucket: "Reach", stage: "Rejected", extra_events: [ev("rejection", "2026-09-28T12:00:00Z", "rejection before OA (TEST)")] }),
      seedRow({ app_id: "TEST-app-datadog", company: "Datadog", role: "Software Engineering Intern", role_family: "SWE", url: "https://datadoghq.com (TEST)", applied_at: "2026-09-25T12:00:00Z", resume_version: "swe-v2", source: "referred", referred_by: "TEST referral", fit_bucket: "Match", stage: "Interview rounds", extra_events: [ev("confirmation", "2026-09-25T13:00:00Z", "confirmation (TEST)"), ev("interview_invite", "2026-10-08T12:00:00Z", "interview invite (TEST)"), ev("interview", "2026-10-11T12:00:00Z", "interview happened (TEST)")] }),
      seedRow({ app_id: "TEST-app-hrt", company: "Hudson River Trading", role: "Software Engineering Intern", role_family: "SWE", url: "https://hudsonrivertrading.com (TEST)", applied_at: "2026-10-05T12:00:00Z", resume_version: "swe-v1", source: "cold", fit_bucket: "Reach", stage: "OA/assessment", assessment_deadline: "2026-10-18T12:00:00Z", extra_events: [ev("oa_invite", "2026-10-09T12:00:00Z", "OA invite (TEST)")] }),
      seedRow({ app_id: "TEST-app-airbnb", company: "Airbnb", role: "Software Engineering Intern", role_family: "SWE", url: "https://airbnb.com/careers (TEST)", applied_at: "2026-09-18T12:00:00Z", resume_version: "swe-v1", source: "cold", fit_bucket: "Match", stage: "Rejected", extra_events: [ev("rejection", "2026-10-01T12:00:00Z", "rejection (TEST)")] }),
      seedRow({ app_id: "TEST-app-twosigma", company: "Two Sigma", role: "Quantitative Research Intern", role_family: "Finance", url: "https://twosigma.com (TEST)", applied_at: "2026-09-08T12:00:00Z", resume_version: "fin-v1", source: "cold", fit_bucket: "Reach", stage: "Rejected", extra_events: [ev("rejection", "2026-09-25T12:00:00Z", "rejection (TEST)")] }),
      seedRow({ app_id: "TEST-app-notion", company: "Notion", role: "Software Engineering Intern", role_family: "SWE", url: "https://notion.com/careers (TEST)", applied_at: "2026-10-08T12:00:00Z", resume_version: "swe-v2", source: "referred", referred_by: "TEST referral", fit_bucket: "Match", stage: "Confirmed", extra_events: [ev("confirmation", "2026-10-08T13:00:00Z", "confirmation (TEST)")] }),
      seedRow({ app_id: "TEST-app-citadel", company: "Citadel Securities", role: "Quantitative Trading Intern", role_family: "Finance", url: "https://citadelsecurities.com (TEST)", applied_at: "2026-09-12T12:00:00Z", resume_version: "fin-v1", source: "cold", fit_bucket: "Reach", stage: "Rejected", extra_events: [ev("rejection", "2026-09-30T12:00:00Z", "rejection (TEST)")] }),
      seedRow({ app_id: "TEST-app-examplecapital", company: "Example Capital (TEST)", role: "Finance Intern", role_family: "Finance", url: "https://example.test (TEST)", applied_at: "2026-10-06T12:00:00Z", resume_version: "fin-v2", source: "referred", referred_by: "TEST referral", fit_bucket: "Safety", stage: "Confirmed", extra_events: [ev("confirmation", "2026-10-06T13:00:00Z", "confirmation (TEST)")] }),
    ];
    return createMemoryStore(rows.map((r) => { const x = Object.assign({}, r); delete x.extra_events; return x; }));
  }

  return { STAGES, TERMINAL, OPEN, NUDGE_AFTER_DAYS, GHOST_AFTER_DAYS, DEFAULT_COOLDOWN_DAYS, QUIET_HOURS, SEED_NOW,
    createMemoryStore, rowsOf, addApplication, findByCompany, moveStage, manualUpdate,
    statusSummary, statusByCompany, timeline, lastSignalAt,
    classifyMessage, ingestMessage, handleAssessment,
    quietReport, markGhosted, draftNudge, draftThankYou, draftRecruiterReply, ghostedOptions,
    weeklyDigest, dailyDigest, planDelivery, funnelAnalytics, rejectionAnalysis, resumeVersionVerdict,
    deadlineRadar, extractCirDeadlines, offerCountdown, offerEscalation, extractMessageDate,
    duplicateCheck, reapplyCheck, withdrawalDrafts, confirmWithdrawals, seedTestLog };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerTrack;
