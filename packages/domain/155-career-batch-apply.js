"use strict";
/* 155-career-batch-apply.js — the batch-apply loop (LOOP ACCEPTANCE build,
   Crew B, 2026-10-15; joins list: ~/workspace/your_files/
   upmore-loop-acceptance-joins-2026-10-15.md).

   The owner's done-test: a user sends ONE message — "apply to 15
   <role-family> roles" — and Upmore runs the whole loop itself:
   discover -> dedupe -> eligibility/knockout screen -> tailor per
   posting -> batch approval (hash-bound) -> portal drives inside the
   code-enforced caps -> employer confirmations -> per-application
   report in the thread.

   This module is the ORCHESTRATION that did not exist. Every stage
   reuses an existing engine; nothing here reimplements one:
     discovery/dedupe/knockouts ... 121 (dedupe, evaluateKnockouts)
     screen ....................... 132 (checkCurrentEmployer) + 121
     tailor evidence .............. 123 (tailorResume)
     approval card shape .......... 132 (batchCard)
     the drive itself ............. 149 (createPortalSession, runApply,
                                    submitDoorstep — MI-110 caps and
                                    MI-116 payload binding live THERE)
     tracker write ................ injected by the caller (126/141 in
                                    the router seam; a recorder in tests)

   Hard constraints, inherited and enforced by the engines below:
   - Answers come only from confirmed facts: 149 stops a run whose
     required question has no confirmed answer (awaiting_user). This
     module NAMES that stop (UNCOVERED_QUESTION) — it never invents.
   - A captcha is a handoff (CAPTCHA_HANDOFF), never solved.
   - No stealth anything (Spec 2 §6.3): boards are reached only
     through 149/150's tested seams.
   - Caps are 149's (MI-110): enforced at doorstep time and re-checked
     at click time. This module defers what the cap stops; it never
     argues with the count.
   - The batch approval carries an approvalRef (Leg 1, 2026-10-15):
     approveRun mints it bound to the card set hash and executeRun
     passes it into submitDoorstep, because 149's arming wire arms a
     REAL board only under a ref — a hash-only approval left every
     real-board batch submit at REAL_SUBMIT_DISABLED (sandbox boards
     have no arming wire, which is why rehearsals never saw it). The
     guard is the REAL-board-double trajectories in
     tests/career-loop-acceptance.test.cjs.

   Cross-invocation design: the run object is PURE JSON (it survives
   the host snapshot via ctx.batchApplyState). Sessions are runtime
   only; on the execution turn they are rebuilt and re-prepared, and
   MI-116's rebuild-and-compare inside 149 is what makes a payload
   changed since the card stop itself (APPROVAL_PAYLOAD_MISMATCH).

   Pure/sync like the other domain modules: the host (or the test
   harness) injects postings, profiles, boards and the clock via deps. */
const CareerBatchApply = (() => {
  const req = (p) => { try { return typeof require !== "undefined" ? require(p) : null; } catch { return null; } };
  const getJobs = () => (typeof CareerJobs !== "undefined" ? CareerJobs : req("./121-career-jobs.js"));
  const getApply = () => (typeof CareerApply !== "undefined" ? CareerApply : req("./132-career-apply.js"));
  const getTailor = () => (typeof CareerTailor !== "undefined" ? CareerTailor : req("./123-career-tailor.js"));
  const getPortal = () => { try { return typeof CareerPortalApply !== "undefined" ? CareerPortalApply : req("./149-career-portal-apply.js"); } catch { return req("./149-career-portal-apply.js"); } };
  const crypto = (() => { try { return typeof require !== "undefined" ? require("node:crypto") : null; } catch { return null; } })();

  function sha256(text) {
    if (crypto && crypto.createHash) return crypto.createHash("sha256").update(String(text)).digest("hex");
    // Bundle fallback: FNV-1a — used only for run ids / card fingerprints
    // inside the chat bundle; 149's own payload hashes (the security
    // binding) are computed by 149 with its real sha256.
    let h = 0x811c9dc5;
    const str = String(text);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return `fnv1a-${h.toString(16)}`;
  }
  const s = (v) => (v == null ? "" : String(v));
  const lc = (v) => s(v).toLowerCase();
  const dayMs = 24 * 60 * 60 * 1000;

  // ---------------- J7: the apply-verb parse ----------------
  const WORD_COUNTS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, "twenty five": 25, twentyfive: 25, thirty: 30 };
  // "apply to 15 investment banking intern roles" / "apply for 15
  // nursing roles" / "apply to fifteen software engineering roles".
  // A count is REQUIRED — the owner's bar names one; count-less apply
  // asks keep the routes they have today and are not claimed here.
  function parseApplyAsk(text) {
    const t = lc(text).replace(/\s+/g, " ").trim();
    const m = t.match(/\bapply\s+(?:to|for)\s+(\d{1,3}|twenty five|twentyfive|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty)\s+(.+?)\s+(roles|jobs|positions|openings)\b/);
    if (!m) return null;
    const count = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : WORD_COUNTS[m[1]];
    if (!count || count < 1) return null;
    const familyText = m[2].trim();
    if (!familyText || familyText.length < 2) return null;
    if (/^(a|an|the|some|any)$/.test(familyText)) return null;
    return { count, familyText, unit: m[3] };
  }

  // ---------------- J2: the run object (pure JSON) ----------------
  let runSeq = 0;
  function createRun(input) {
    const inp = input || {};
    runSeq += 1;
    const now = inp.now != null ? inp.now : Date.now();
    return {
      id: `batch-${sha256(`${inp.userId}|${inp.familyText}|${inp.count}|${now}|${runSeq}`).slice(0, 12)}`,
      userId: inp.userId || null,
      familyText: inp.familyText || "",
      requested: inp.count || 0,
      status: "new", // new -> prepared(awaiting_approval) -> approved -> completed | completed_with_stops
      createdAt: now,
      found: 0,
      duplicatesRemoved: 0,
      screenedOut: [], // {postingKey, company, role, code, reasons[]}
      eligible: 0,
      selected: [], // postingKeys chosen by count, in discovery order
      deferred: [], // {postingKey, company, role, code, reason, resumeOn}
      postings: {}, // postingKey -> posting (discovery data, JSON)
      apps: {}, // postingKey -> app state (below)
      approvals: {}, // postingKey -> payloadSha256 approved on the card
      approvalRef: null, // minted by approveRun at the card's one yes,
      // bound to the card set hash — 149's arming wire requires it
      // before a REAL board (module 150) may fire (Leg 1 seam fix)
      card: null,
      cardSha256: null,
      events: [],
      summary: null,
    };
  }
  // app state: { postingKey, company, role, url, stage, stop, payloadSha256,
  //              confirmationId, tailored }
  // stages: selected | doorstep | stopped | captcha_handoff |
  //         deferred_cap | deferred_count | submitted
  function event(run, type, data) {
    run.events.push(Object.assign({ seq: run.events.length + 1, type }, data || {}));
  }
  function appOf(run, posting) {
    const key = postingKeyOf(posting);
    if (!run.apps[key]) {
      run.apps[key] = {
        postingKey: key, company: posting.company || null, role: posting.title || posting.role || null,
        url: posting.url || null, stage: "selected", stop: null, payloadSha256: null,
        confirmationId: null, tailored: null,
      };
    }
    return run.apps[key];
  }
  // MI-118: one stable application id per (run, posting), shared by
  // the prepare and submit phases across invocations, so the ledger's
  // telemetry records join into one application.
  function applicationIdFor(run, posting) {
    return `app-${sha256(`${run.id}|${postingKeyOf(posting)}`).slice(0, 12)}`;
  }
  function postingKeyOf(posting) {
    if (posting && posting.canonicalKey) return posting.canonicalKey;
    const Jobs = getJobs();
    if (Jobs && Jobs.dedupeKey) { try { return Jobs.dedupeKey(posting); } catch { /* fall through */ } }
    return `${lc(posting && posting.company)}::${lc(posting && (posting.title || posting.role))}::${s(posting && posting.url)}`;
  }

  // Runtime-only state (sessions + per-posting profiles): never on the run.
  const RUNTIME = new Map(); // runId -> { sessions: {key: session}, profiles: {key: profile} }
  function runtimeFor(run) {
    if (!RUNTIME.has(run.id)) RUNTIME.set(run.id, { sessions: {}, profiles: {} });
    return RUNTIME.get(run.id);
  }

  // ---------------- prepare: discover -> screen -> tailor -> doorsteps ----
  function prepareRun(run, deps) {
    const d = deps || {};
    const Portal = getPortal();
    const Jobs = getJobs();
    const Apply = getApply();
    const Tailor = getTailor();
    const log = d.log || { records: [] };
    const now = d.now != null ? d.now : Date.now();
    const raw = Array.isArray(d.postings) ? d.postings : [];
    run.found = raw.length;
    event(run, "discovered", { found: raw.length, familyText: run.familyText });

    // dedupe (121, MI-031 identity rules: same opening merges, different
    // req ids on one board stay distinct)
    const deduped = Jobs && Jobs.dedupe ? Jobs.dedupe(raw) : raw.slice();
    run.duplicatesRemoved = raw.length - deduped.length;
    if (run.duplicatesRemoved) event(run, "deduped", { removed: run.duplicatesRemoved });

    // screen: closed -> knockouts (121) -> current employer (132) ->
    // triageBatch hard filters when a scoring profile is supplied.
    const triage = d.scoringProfile && Apply && Apply.triageBatch
      ? new Map(Apply.triageBatch(deduped, { log, profile: d.profileMaster || null, scoringProfile: d.scoringProfile }).map((x) => [x.job_id, x]))
      : null;
    const eligiblePool = [];
    for (const posting of deduped) {
      const key = postingKeyOf(posting);
      run.postings[key] = posting;
      const out = (code, reasons) => run.screenedOut.push({ postingKey: key, company: posting.company || null, role: posting.title || posting.role || null, code, reasons });
      if (posting.status && posting.status !== "open") { out("JOB_CLOSED", [`posting status is "${posting.status}" — not open`]); continue; }
      if (Jobs && Jobs.evaluateKnockouts && d.profileMaster) {
        let ko = null;
        try { ko = Jobs.evaluateKnockouts(posting, d.profileMaster); } catch { ko = null; }
        const unmet = (ko && ko.unmet) || [];
        if (unmet.length) { out("KNOCKOUT_UNMET", unmet.map((u) => u.reason || `unmet knockout: ${u.knockout && u.knockout.requirement}`)); continue; }
      }
      if (Apply && Apply.checkCurrentEmployer && d.profileMaster) {
        const emp = Apply.checkCurrentEmployer(d.profileMaster, posting.company);
        if (emp && emp.blocked) { out("CURRENT_EMPLOYER", [emp.reason || "current employer"]); continue; }
      }
      if (triage) {
        const dec = triage.get(posting.job_id);
        if (dec && dec.decision === "skip") { out("SCREEN_SKIP", dec.reasons || []); continue; }
        if (dec && dec.decision === "ask") { out("SCREEN_ASK", dec.reasons || []); continue; }
      }
      eligiblePool.push(posting);
    }
    run.eligible = eligiblePool.length;
    event(run, "screened", { eligible: run.eligible, screenedOut: run.screenedOut.length });

    // count selection: the first N eligible, in discovery order; the
    // rest stay eligible and are deferred BY COUNT — named, never dropped.
    const chosen = eligiblePool.slice(0, run.requested);
    const overflow = eligiblePool.slice(run.requested);
    run.selected = chosen.map(postingKeyOf);
    for (const posting of overflow) {
      const key = postingKeyOf(posting);
      appOf(run, posting).stage = "deferred_count";
      run.deferred.push({ postingKey: key, company: posting.company || null, role: posting.title || posting.role || null, code: "COUNT_DEFERRED", reason: `eligible, but beyond the ${run.requested} you named — it stays in the queue, it is not dropped`, resumeOn: null });
    }

    // per selected posting: tailor evidence (123), portal profile, drive
    // to the doorstep through 149. The doorstep is a STOP (Spec 2 §6.1):
    // nothing submits in prepare, ever.
    const rt = runtimeFor(run);
    for (const posting of chosen) {
      const key = postingKeyOf(posting);
      const app = appOf(run, posting);
      if (Tailor && Tailor.tailorResume && d.profileMaster) {
        try {
          const jdText = posting.jd_text || posting.jdText || `${posting.title || ""} at ${posting.company || ""}`;
          const t = Tailor.tailorResume(d.profileMaster, jdText, {});
          app.tailored = { ran: true, version: (t && t.version) || null, gaps: t && t.gaps ? t.gaps.length : null };
        } catch { app.tailored = { ran: false }; }
      }
      const profile = profileFor(d, posting);
      rt.profiles[key] = profile;
      const board = d.boardFor ? d.boardFor(posting) : null;
      if (!board) { stopApp(run, app, "BOARD_NOT_WIRED", "no board adapter is wired for this posting's family in this run"); continue; }
      const session = Portal.createPortalSession({ userId: run.userId, board });
      rt.sessions[key] = session;
      const res = Portal.runApply(session, { posting, profile, log, userId: run.userId, now, attestations: d.attestations || {}, applicationId: applicationIdFor(run, posting), clock: d.clock || null, tokens: d.tokens, schemaSource: d.schemaSource });
      absorbPrepareResult(run, app, res);
    }

    // the card (132's shape) covers doorstep-ready applications only;
    // stops and defers are reported beside it, never hidden inside it.
    const doorstepApps = run.selected.map((k) => run.apps[k]).filter((a) => a.stage === "doorstep");
    if (Apply && Apply.batchCard && doorstepApps.length) {
      run.card = Apply.batchCard(doorstepApps.map((a) => ({ company: a.company, role: a.role, fit: null })), { title: `Apply to ${doorstepApps.length} ${run.familyText} roles?` });
    }
    run.cardSha256 = cardSha(run);
    run.status = doorstepApps.length ? "awaiting_approval" : "completed";
    run.summary = summarizeRun(run);
    event(run, "prepared", { doorstep: doorstepApps.length, status: run.status });
    return run;
  }

  function profileFor(d, posting) {
    const base = d.profile || {};
    if (typeof d.profileFor === "function") return d.profileFor(posting, base) || base;
    return base;
  }

  function absorbPrepareResult(run, app, res) {
    if (!res) { stopApp(run, app, "NO_RESULT", "the portal run returned nothing"); return; }
    if (res.resultStatus === "prepared" && res.doorstep) {
      app.stage = "doorstep";
      app.payloadSha256 = res.doorstep.payloadSha256;
      event(run, "doorstep", { postingKey: app.postingKey, company: app.company });
      return;
    }
    if (res.resultStatus === "awaiting_user") {
      // 149's required-ask gate: a required question has no confirmed
      // fact. Named here, carried verbatim — never invented around.
      stopApp(run, app, "UNCOVERED_QUESTION", "a required question has no confirmed fact — nothing was invented to fill it", { asks: res.asks || [] });
      return;
    }
    if (res.resultStatus === "blocked" && res.code === "CAP_REACHED") {
      app.stage = "deferred_cap";
      run.deferred.push({ postingKey: app.postingKey, company: app.company, role: app.role, code: "CAP_REACHED", reason: res.reason || "the daily application cap is reached", resumeOn: nextDayIso(run.createdAt) });
      event(run, "deferred_cap", { postingKey: app.postingKey, cap: res.cap || null });
      return;
    }
    if (res.resultStatus === "blocked" && res.code === "CAPTCHA_HANDOFF") {
      app.stage = "captcha_handoff";
      app.stop = { code: "CAPTCHA_HANDOFF", reason: res.reason || "a captcha appeared — Upmore never solves it", handoffUrl: res.handoffUrl || app.url };
      event(run, "captcha_handoff", { postingKey: app.postingKey });
      return;
    }
    if (res.resultStatus === "blocked") { stopApp(run, app, res.code || "BLOCKED", res.reason || "the portal run stopped"); return; }
    stopApp(run, app, res.code || "UNEXPECTED_RESULT", `unexpected portal result: ${res.resultStatus || "unknown"}`);
  }

  function stopApp(run, app, code, reason, extra) {
    app.stage = "stopped";
    app.stop = Object.assign({ code, reason }, extra || {});
    event(run, "stopped", { postingKey: app.postingKey, code });
  }

  function nextDayIso(now) {
    const d = new Date(now || Date.now());
    d.setHours(0, 0, 0, 0);
    return new Date(d.getTime() + dayMs).toISOString().slice(0, 10);
  }

  function cardSha(run) {
    const pairs = run.selected
      .map((k) => run.apps[k])
      .filter((a) => a && a.stage === "doorstep")
      .map((a) => `${a.postingKey}:${a.payloadSha256}`)
      .sort();
    return pairs.length ? sha256(pairs.join("|")) : null;
  }

  // ---------------- J3: one yes -> per-application hash-bound approvals ----
  function approveRun(run, approval) {
    if (!run || run.status !== "awaiting_approval") {
      return { ok: false, code: "NO_RUN_AWAITING_APPROVAL", reason: "there is no prepared batch waiting for a yes" };
    }
    if (!approval || approval.approvedByUser !== true) {
      return { ok: false, code: "APPROVAL_REQUIRED", reason: "the batch stops at the card until the owner says yes" };
    }
    const nowSha = cardSha(run);
    if (!nowSha || nowSha !== run.cardSha256) {
      return { ok: false, code: "APPROVAL_SET_CHANGED", reason: "the doorstep set or a payload changed since the card was shown — the batch must be re-prepared and re-approved, never silently re-pointed" };
    }
    run.approvals = {};
    for (const key of run.selected) {
      const app = run.apps[key];
      if (app && app.stage === "doorstep") run.approvals[key] = app.payloadSha256;
    }
    // THE APPROVALREF (Leg 1): minted here, at the batch card's one
    // yes, and bound to the card set hash that was just re-verified —
    // the ref names THIS run's approval of THIS doorstep set. 149's
    // arming wire (BUG-063/D3) arms a real board only with a non-empty
    // approvalRef on top of approvedByUser; without one a browser
    // board's submit() throws REAL_SUBMIT_DISABLED. Deterministic in
    // (run.id, cardSha256): re-approving the identical set re-mints
    // the identical ref, and a changed set can never reuse it (the
    // set-hash check above refuses first).
    run.approvalRef = `batch:${run.id}:${nowSha}`;
    run.status = "approved";
    event(run, "approved", { count: Object.keys(run.approvals).length, approvalRef: run.approvalRef });
    return { ok: true, approved: Object.keys(run.approvals).length, approvalRef: run.approvalRef };
  }

  // ---------------- J4: the execution loop ----------------
  function executeRun(run, deps) {
    const d = deps || {};
    const Portal = getPortal();
    const log = d.log || { records: [] };
    const now = d.now != null ? d.now : Date.now();
    const rt = runtimeFor(run);
    if (run.status !== "approved") {
      return { ok: false, code: "RUN_NOT_APPROVED", reason: "execution requires an approved batch" };
    }
    for (const key of run.selected) {
      const app = run.apps[key];
      const approvedSha = run.approvals[key];
      if (!app || !approvedSha) continue;
      const posting = run.postings[key];
      let session = rt.sessions[key];
      try {
        if (!session) {
          // Cross-invocation rebuild: a fresh session re-prepares the
          // doorstep; 149's click-time hash verification is the guard
          // that a changed payload stops (APPROVAL_PAYLOAD_MISMATCH).
          const board = d.boardFor ? d.boardFor(posting) : null;
          if (!board) { stopApp(run, app, "BOARD_NOT_WIRED", "no board adapter is wired for this posting's family in this run"); continue; }
          session = Portal.createPortalSession({ userId: run.userId, board });
          rt.sessions[key] = session;
          const profile = rt.profiles[key] || profileFor(d, posting);
          const prep = Portal.runApply(session, { posting, profile, log, userId: run.userId, now, attestations: d.attestations || {}, applicationId: applicationIdFor(run, posting), clock: d.clock || null, tokens: d.tokens, schemaSource: d.schemaSource });
          if (!prep || prep.resultStatus !== "prepared") { absorbPrepareResult(run, app, prep); continue; }
        }
        // The approval carries the batch approvalRef minted at the
        // card's yes (Leg 1): 149 reads approval.approvalRef (or
        // ctx.approvalRef) at its arming wire — a real board arms
        // only under it. A run approved in the pre-fix shape (hashes
        // only, approvalRef null) still stops at the board, named.
        const out = Portal.submitDoorstep(session, { approvedByUser: true, payloadSha256: approvedSha, approvalRef: run.approvalRef || null }, { log, now, posting, approvalRef: run.approvalRef || null, applicationId: applicationIdFor(run, posting), clock: d.clock || null, tokens: d.tokens, schemaSource: d.schemaSource });
        absorbSubmitResult(run, app, out, d);
      } catch (err) {
        stopApp(run, app, "EXECUTION_ERROR", `the drive threw: ${err && err.message ? err.message.slice(0, 160) : "unknown error"}`);
      }
    }
    const anyStopped = run.selected.some((k) => ["stopped", "captcha_handoff", "deferred_cap"].includes(run.apps[k].stage));
    run.status = anyStopped ? "completed_with_stops" : "completed";
    run.summary = summarizeRun(run);
    event(run, "executed", { status: run.status });
    return { ok: true, summary: run.summary };
  }

  function absorbSubmitResult(run, app, out, d) {
    if (out && out.resultStatus === "completed" && out.submission) {
      app.stage = "submitted";
      app.confirmationId = out.submission.confirmationId || null;
      event(run, "submitted", { postingKey: app.postingKey, confirmationId: app.confirmationId });
      if (typeof d.track === "function") {
        try { d.track({ postingKey: app.postingKey, company: app.company, role: app.role, confirmationId: app.confirmationId, status: "submitted" }); } catch { /* the submission stands; tracking is the caller's record */ }
      }
      return;
    }
    if (out && out.resultStatus === "blocked" && out.code === "CAP_REACHED") {
      app.stage = "deferred_cap";
      run.deferred.push({ postingKey: app.postingKey, company: app.company, role: app.role, code: "CAP_REACHED", reason: out.reason || "the daily application cap was reached at click time", resumeOn: nextDayIso(run.createdAt) });
      event(run, "deferred_cap", { postingKey: app.postingKey, at: "click" });
      return;
    }
    if (out && out.resultStatus === "blocked" && out.code === "CAPTCHA_HANDOFF") {
      app.stage = "captcha_handoff";
      app.stop = { code: "CAPTCHA_HANDOFF", reason: out.reason || "a captcha appeared at submit — the user finishes the last step", handoffUrl: out.handoffUrl || app.url };
      event(run, "captcha_handoff", { postingKey: app.postingKey, at: "submit" });
      return;
    }
    if (out && out.resultStatus === "blocked") {
      stopApp(run, app, out.code || "SUBMIT_BLOCKED", out.reason || "the submit gate stopped this application");
      return;
    }
    stopApp(run, app, "UNKNOWN_OUTCOME", "the submit returned no readable end state — it is recorded unknown, never retried blind (MI-115's resolver owns it from here)");
  }

  // ---------------- J5: the report ----------------
  function summarizeRun(run) {
    const apps = run.selected.map((k) => run.apps[k]).filter(Boolean);
    const submitted = apps.filter((a) => a.stage === "submitted");
    const stops = [];
    for (const a of apps) {
      if (a.stage === "stopped" && a.stop) stops.push({ postingKey: a.postingKey, company: a.company, role: a.role, code: a.stop.code, reason: a.stop.reason });
      if (a.stage === "captcha_handoff") stops.push({ postingKey: a.postingKey, company: a.company, role: a.role, code: "CAPTCHA_HANDOFF", reason: a.stop ? a.stop.reason : "a captcha appeared", handoffUrl: a.stop ? a.stop.handoffUrl : a.url });
    }
    return {
      runId: run.id, familyText: run.familyText, requested: run.requested, status: run.status,
      approvalRef: run.approvalRef || null,
      found: run.found, duplicatesRemoved: run.duplicatesRemoved,
      screenedOut: run.screenedOut.slice(),
      eligible: run.eligible, selected: run.selected.length,
      doorstep: apps.filter((a) => a.stage === "doorstep").length,
      submitted: submitted.length,
      confirmations: submitted.map((a) => ({ company: a.company, role: a.role, confirmationId: a.confirmationId })),
      stops,
      deferred: run.deferred.slice(),
    };
  }

  function speakSummary(run) {
    const sm = run.summary || summarizeRun(run);
    const lines = [];
    lines.push(`Found ${sm.found} ${run.familyText} roles${sm.duplicatesRemoved ? ` — ${sm.duplicatesRemoved} duplicate${sm.duplicatesRemoved === 1 ? "" : "s"} removed` : ""}.`);
    if (sm.screenedOut.length) lines.push(`Screened out ${sm.screenedOut.length}: ${sm.screenedOut.map((x) => `${x.company || "a posting"} (${x.code === "KNOCKOUT_UNMET" ? "knockout requirement you don't meet" : x.code === "JOB_CLOSED" ? "posting closed" : x.code})`).join("; ")}.`);
    lines.push(`${sm.eligible} were eligible; I took the ${sm.selected} you named.`);
    if (sm.status === "awaiting_approval" || run.status === "awaiting_approval") {
      lines.push(`${sm.doorstep} are tailored and sitting at the final review screen — the card shows each one with the exact answers it will send. Nothing submits until your yes.`);
    }
    if (sm.submitted) lines.push(`Submitted ${sm.submitted} with employer confirmations: ${sm.confirmations.map((c) => `${c.company} (${c.confirmationId})`).join("; ")}.`);
    for (const st of sm.stops) lines.push(`Stopped — ${st.company || "a role"}: ${st.code === "UNCOVERED_QUESTION" ? "a required question has no confirmed fact on your profile, so I stopped instead of inventing an answer" : st.code === "CAPTCHA_HANDOFF" ? `a captcha appeared; the last step is yours here: ${st.handoffUrl || ""}` : `${st.code} — ${st.reason}`}`);
    const capDef = sm.deferred.filter((x) => x.code === "CAP_REACHED");
    const countDef = sm.deferred.filter((x) => x.code === "COUNT_DEFERRED");
    if (capDef.length) lines.push(`${capDef.length} hit today's application cap and are queued for ${capDef[0].resumeOn || "tomorrow"} — they resume automatically, they are not lost.`);
    if (countDef.length) lines.push(`${countDef.length} more were eligible beyond the ${run.requested} you named; they stay in the queue.`);
    return lines;
  }

  // The serializable run is the whole run object by construction;
  // this exists so callers never reach for runtime state by accident.
  function serializeRun(run) { return JSON.parse(JSON.stringify(run)); }
  function restoreRun(json) { return json && json.id ? json : null; }

  return { parseApplyAsk, createRun, prepareRun, approveRun, executeRun, summarizeRun, speakSummary, serializeRun, restoreRun, postingKeyOf, _runtime: RUNTIME };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CareerBatchApply;
