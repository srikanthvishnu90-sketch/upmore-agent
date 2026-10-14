/* Career portal browser driver — the CA-03 real-board seam behind module
   149's page-adapter ("board") contract (Spec 2 §6).
   What this module IS: a Playwright-class driver (via
   scripts/career/portal-browser-helper.cjs, a dumb DOM executor holding
   one isolated browser context per board) that opens a REAL hosted
   application form, discovers its fields, and lets module 149's pipeline
   fill it from confirmed facts only and stop at the final review screen
   — the doorstep — with the exact would-submit payload snapshot.
   §6.3 rules, enforced here as code, on top of 149's own checks:
     - host allowlist at the driver itself: only the tested ATS families
       (Greenhouse, Lever, Ashby, SmartRecruiters) plus localhost test
       pages may be opened; aggregators and unknown hosts are refused
       BEFORE any navigation (DRIVER_HOST_REFUSED). The gate holds on
       EVERY hop, not just the initial URL (BUG-060 / lane defect D1 —
       boards redirect Greenhouse -> the employer's own site): the
       helper aborts an off-allowlist main-frame navigation before any
       network traffic, and this driver re-checks the final URL after
       open and after the review step; an off-list landing is a typed
       HOST_REDIRECT_REFUSED stop with zero further actions;
     - a visible captcha / human-verification challenge at open or at the
       review step surfaces as { captcha: "challenge" } so 149 stops with
       CAPTCHA_HANDOFF. At that stop the driver captures a screenshot of
       the stopped page and returns it as `screenshotRef`; 149 surfaces it
       on the result as `screenshot_ref` (captcha-pack M4 — the handoff
       ticket in module 120 cannot mint without one). This module contains
       no solver and no disguise technique, ever — background captcha
       scripts are reported as captchaTech evidence, never interacted with;
     - the resume file is uploaded only after its bytes hash to the exact
       sha256 the profile carries (RESUME_SHA_MISMATCH otherwise);
     - the submit leg is ARMED-ONLY: board.submit() throws
       REAL_SUBMIT_DISABLED unless the board is armed. Arming happens
       exactly two ways (BUG-063 / lane defect D3): (a) the board was
       created with submitArmed: true — the test lane's explicit switch;
       or (b) module 149's approval gate calls board.armForSubmit()
       with approvedByUser AND an approvalRef naming the owner's batch
       approval — approval without the ref arms nothing, and the
       default path stays the refusal. An armed submit clicks
       exactly once and then CAPTURES the employer's confirmation
       (landing-page text, any confirmation/application ID, screenshot);
       the outcome is "accepted" only when that capture carries an ID or
       unambiguous success text — anything else is "unknown", which 149
       records as unknown_outcome, never as sent. submissionState()
       reports from the same capture: confirmed → submitted; ambiguous →
       unverifiable (reconcile must not clear it for a retry).
   Session isolation (§6.3): every board owns a fresh browser context —
   no cookies, storage, or values are shared between boards or users.
   Account model: boards that need no account (Greenhouse / Lever /
   Ashby public forms) run anonymously. Account-walled families
   (Workday, iCIMS, Taleo) are mapped in docs/career/board-automation-map.md
   with the least-user design (per-employer account, user-owned details,
   vaulted credential, one-time approval, Gmail verification retrieval);
   this driver does not create accounts and refuses nothing about them —
   classifyTarget in 149 still gates which hosts may be driven at all.
   Playwright is a lazy, guarded require: the module loads anywhere, and
   only board.open() needs the browser helper. Not part of the edge
   router bundle (it is Node-side tooling, like ci-browse). UMD-ish. */
const CareerPortalBrowser = (() => {
  const fs = require("node:fs");
  const path = require("node:path");
  const os = require("node:os");
  const crypto = require("node:crypto");
  const { spawn } = require("node:child_process");
  const Portal149 = (() => { try { return require("./149-career-portal-apply.js"); } catch (e) { return null; } })();

  const HELPER = path.join(__dirname, "..", "..", "scripts", "career", "portal-browser-helper.cjs");
  const sha256File = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  const coded = (code, message) => Object.assign(new Error(message), { code });

  // ---------- §6.3 host gate (mirrors 149; defense in depth at the driver) ----------
  function hostAllowed(url) {
    let host = "";
    try { host = new URL(String(url)).hostname.toLowerCase(); } catch (e) { return { allowed: false, host: "" }; }
    if (Portal149) {
      const c = Portal149.classifyTarget(url);
      if (c.allowed) return { allowed: true, host, atsFamily: c.atsFamily || null, kind: c.kind };
    }
    if (host === "localhost" || host === "127.0.0.1") return { allowed: true, host, atsFamily: null, kind: "local_test" };
    return { allowed: false, host, atsFamily: null, kind: null };
  }
  // The redirect gate (BUG-060): the SAME allowlist as the open gate,
  // applied to a URL the page LANDED on after navigation/redirects.
  // Returns a typed refusal shape 149 can stop with verbatim.
  function finalUrlGate(url) {
    const g = hostAllowed(url);
    if (g.allowed) return { allowed: true, host: g.host, atsFamily: g.atsFamily || null, kind: g.kind };
    return { allowed: false, code: "HOST_REDIRECT_REFUSED", host: g.host || "", finalUrl: String(url || ""),
      reason: "navigation landed off the tested-ATS allowlist (Greenhouse, Lever, Ashby, SmartRecruiters + localhost) — §6.3 gate holds on every hop" };
  }
  function atsFamilyOf(url) {
    try {
      const host = new URL(String(url)).hostname.toLowerCase();
      if (/(^|\.)greenhouse\.io$/.test(host)) return "greenhouse";
      if (/(^|\.)lever\.co$/.test(host)) return "lever";
      if (/(^|\.)ashbyhq\.com$/.test(host)) return "ashby";
      if (/(^|\.)smartrecruiters\.com$/.test(host)) return "smartrecruiters";
    } catch (e) { /* fall through */ }
    return null;
  }

  // ---------- field classification: raw DOM fields -> 149 field defs ----------
  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  // Conservative confirmation reading: an ID counts only when the page
  // labels it as one; success counts only on unambiguous employer wording.
  // Anything weaker leaves the outcome unknown — never upgraded.
  function extractConfirmation(text) {
    const t = String(text || "");
    const idMatch = t.match(/(?:application|confirmation|reference|submission|tracking)\s*(?:id|number|no\.?|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{4,})\b/i);
    const successText = /(application (has been |was )?(submitted|received)|thank you for applying|we(?:'ve| have) received your application|successfully submitted|application is complete|your application was sent)/i.test(t);
    return { confirmationId: idMatch ? idMatch[1] : null, successText };
  }

  function classifyFields(rawFields) {
    const defs = [];      // 149-shaped
    const bindings = {};  // field_id -> helper binding
    const raws = rawFields.slice();
    // virtual full_name: a first+last pair becomes ONE logical standard field
    const isFirst = (f) => /first name/.test((f.label + " " + f.name + " " + f.id).toLowerCase()) && f.inputType === "text";
    const isLast = (f) => /last name/.test((f.label + " " + f.name + " " + f.id).toLowerCase()) && f.inputType === "text";
    const first = raws.find(isFirst), last = raws.find(isLast);
    const consumed = new Set();
    if (first && last) {
      defs.push({ field_id: "full_name", label: "Full name", kind: "standard", profile_key: "name", required: !!(first.required || last.required) });
      bindings.full_name = { field_id: "full_name", inputType: "name_pair", selectors: [first.selector, last.selector] };
      consumed.add(first); consumed.add(last);
    }
    // radio / checkbox groups collapse by name
    const groups = new Map();
    for (const f of raws) {
      if (consumed.has(f)) continue;
      if ((f.inputType === "radio" || f.inputType === "checkbox") && f.name) {
        if (!groups.has(f.name)) groups.set(f.name, []);
        groups.get(f.name).push(f);
      }
    }
    const groupOf = new Map();
    for (const [name, members] of groups) {
      if (members.length < 2) continue;
      for (const m of members) groupOf.set(m, name);
    }
    const usedIds = new Set(defs.map((d) => d.field_id));
    const uniqId = (base) => { let id = base || "field"; let i = 2; while (usedIds.has(id)) id = `${base}_${i++}`; usedIds.add(id); return id; };
    // D6 (BUG-064): the new Greenhouse board emits the same question
    // twice (EEO fields x3 on one tenant) — identical defs (same kind,
    // same semantic key, same label, same DOM name) collapse to ONE
    // def, so the user is never asked the same question twice.
    const seenSem = new Set();
    // Semantic key = kind + canonical answer key + label. The DOM name
    // is deliberately NOT part of it: the duplicate emissions carry
    // DIFFERENT machine names (country / country_2, school / school_0)
    // for the same human question. Slug-derived question_keys are
    // unstable across duplicates, so only canonical keys count.
    const semKeyFor = (kind, label) => [kind.kind, kind.profile_key || (["work_authorization", "sponsorship", "cover_note"].includes(kind.question_key) ? kind.question_key : ""), String(label || "").toLowerCase().replace(/\s+/g, " ").trim()].join("|");

    for (const f of raws) {
      if (consumed.has(f)) continue;
      // D9 (BUG-066): a Lever-style custom card carries its human
      // question as the card/group heading, not a <label> — when the
      // direct label is empty, the group label IS the label, and it
      // (not the machine field name) names the field in every ask.
      const directLabel = (f.label || "").replace(/[*✱]\s*$/, "").trim();
      const groupLabel = (f.groupLabel || "").replace(/[*✱]\s*$/, "").trim();
      const label = directLabel || groupLabel;
      const labelFromGroup = !directLabel && !!groupLabel;
      const hay = (label + " " + f.name + " " + f.id + " " + groupLabel).toLowerCase();
      // groups first
      if (groupOf.has(f)) {
        const members = groups.get(groupOf.get(f));
        const gLabel = groupLabel || f.name;
        const gHay = (gLabel + " " + f.name).toLowerCase();
        const kind = classifyKind(gHay, "group");
        for (const m of members) consumed.add(m);
        if (seenSem.has(semKeyFor(kind, gLabel))) continue; // D6 duplicate group
        seenSem.add(semKeyFor(kind, gLabel));
        const gid = uniqId(slug(gLabel) || slug(f.name) || "choice_group");
        const def = { field_id: gid, label: gLabel, kind: kind.kind, required: members.some((m) => m.required) };
        if (kind.profile_key) def.profile_key = kind.profile_key;
        if (kind.question_key) def.question_key = kind.question_key;
        defs.push(def);
        bindings[gid] = {
          field_id: gid, inputType: f.inputType === "radio" ? "radio_group" : "checkbox_group",
          options: members.map((m) => ({ selector: m.selector, label: (m.label || "").replace(/[*✱]\s*$/, "").trim() || m.value || "" })),
        };
        continue;
      }
      const kind = classifyKind(hay, f.inputType, f);
      if (seenSem.has(semKeyFor(kind, label))) continue; // D6 duplicate def
      seenSem.add(semKeyFor(kind, label));
      const baseId = (labelFromGroup ? slug(label) : null) || slug(f.name) || slug(f.id) || slug(label) || `field_${f.domIndex}`;
      const def = { field_id: uniqId(baseId), label: label || baseId, kind: kind.kind, required: !!f.required };
      if (kind.profile_key) def.profile_key = kind.profile_key;
      if (kind.question_key) def.question_key = kind.question_key;
      defs.push(def);
      bindings[def.field_id] = bindingFor(f, kind);
    }
    // Contextual pass (D4, live Aquatic shape): Greenhouse's education
    // block labels its year selects only "Start date year" / "End date
    // year" — meaningless alone, unambiguous NEXT TO the block's own
    // School/Degree/Discipline fields. Bind them to the education
    // dates only when that education context is present on the form.
    if (defs.some((d) => d.profile_key && d.profile_key.startsWith("education_"))) {
      for (const d of defs) {
        if (d.kind !== "unknown") continue;
        if (/^start date year$|^start year$/.test(d.label.toLowerCase())) { d.kind = "standard"; d.profile_key = "education_start_date"; }
        else if (/^end date year$|^end year$/.test(d.label.toLowerCase())) { d.kind = "standard"; d.profile_key = "education_end_date"; }
      }
    }
    return { defs, bindings };
  }
  function classifyKind(hay, inputType, f) {
    // D7 (BUG-065): a profile value binds ONLY when the field's LABEL
    // belongs to that value's class. The DOM name/id is a fallback for
    // label-less fields only — last night "Chicago, IL" was attempted
    // into office-preference and prior-employment fields purely because
    // their machine names contained "location".
    const eff = (f && f.label ? String(f.label).toLowerCase() : "") || hay;
    if (inputType === "file") {
      // File inputs are the exception to label-first: their visible
      // label is often just "Attach", and the binding carries no typed
      // value — the upload is the profile's sha-bound resume or it
      // does not happen. A cover-letter upload is never the resume.
      if (/cover/.test(hay)) return { kind: "unknown" };
      if (/resume|cv\b|curriculum/.test(hay)) return { kind: "standard", profile_key: "resume" };
      return { kind: "unknown" };
    }
    if (/certif|attest|acknowledge|true and complete|provided.*true/.test(eff) && inputType === "checkbox") return { kind: "attestation", question_key: slug(eff).slice(0, 32) || "attestation" };
    if (/authori[sz]ed to work|legally authori[sz]ed|right to work/.test(eff)) return { kind: "screening", question_key: "work_authorization" };
    if (/sponsor/.test(eff)) return { kind: "screening", question_key: "sponsorship" };
    // EEO also matches on hay: the value carried is the decline
    // default (or the user's own EEO choice), never a bound fact, and
    // boards name these fields by machine name (hispanic_ethnicity)
    // as often as by label ("Are you Hispanic/Latino?").
    if (/gender|race|ethnic|veteran|disability|sexual orientation|pronouns|lgbt|hispanic|latino/.test(hay)) return { kind: "eeo", question_key: slug(eff).slice(0, 32) || "eeo" };
    // D4 (BUG-062): education + country keys — the answers exist in the
    // fact bank (F-001 shape) and now have keys to carry them.
    if (/preferred name|preferred first name/.test(eff)) return { kind: "standard", profile_key: "preferred_name" };
    if (/graduat/.test(eff)) return { kind: "standard", profile_key: "education_graduation_year" };
    if (/fields? of study|discipline|\bmajor\b|area of study|concentration/.test(eff)) return { kind: "standard", profile_key: "education_discipline" };
    if (/\bgpa\b|grade point average/.test(eff)) return { kind: "standard", profile_key: "education_gpa" };
    if (/school|university|college|institution|alma mater/.test(eff)) return { kind: "standard", profile_key: "education_school" };
    if (/\bdegree\b|bachelor|education level|highest level of education/.test(eff)) return { kind: "standard", profile_key: "education_degree" };
    if (f && /^start_year(_\d+)?$/.test(slug(f.name || ""))) return { kind: "standard", profile_key: "education_start_date" }; // Greenhouse's built-in education-entry fields slug to start_year_<n> / end_year_<n> (labels: "Start date year")
    if (f && /^end_year(_\d+)?$/.test(slug(f.name || ""))) return { kind: "standard", profile_key: "education_end_date" };
    if (/(start|begin)/.test(eff) && /(education|school|university|college)/.test(hay)) return { kind: "standard", profile_key: "education_start_date" };
    if (/(end|completion)/.test(eff) && /(education|school|university|college)/.test(hay)) return { kind: "standard", profile_key: "education_end_date" };
    if (/\bcountry\b/.test(eff)) return { kind: "standard", profile_key: "country" };
    if (/first name|last name|full name|your name|^name\b/.test(eff) || (f && !f.label && (f.name === "name" || f.id === "name"))) return { kind: "standard", profile_key: "name" };
    if (/e-?mail/.test(eff) || inputType === "email") return { kind: "standard", profile_key: "email" };
    if (/phone|mobile|telephone/.test(eff) || inputType === "tel") return { kind: "standard", profile_key: "phone" };
    if (/linkedin/.test(eff)) return { kind: "standard", profile_key: "linkedin" };
    if (/github/.test(eff)) return { kind: "standard", profile_key: "github" };
    if (/portfolio|website|web site|personal site/.test(eff)) return { kind: "standard", profile_key: "website" };
    if (/current company|current employer|present company/.test(eff)) return { kind: "standard", profile_key: "current_company" };
    if (/location|city|where are you based|current residence/.test(eff) && !/preference|desired/.test(eff)) return { kind: "standard", profile_key: "location" }; // a location PREFERENCE question is an ask, never the current-location value (D7)
    if (inputType === "textarea" || /cover letter|additional information|anything else/.test(eff)) return { kind: "free_text", question_key: /cover letter/.test(eff) ? "cover_note" : (slug(eff).slice(0, 40) || "free_text") };
    if (inputType === "checkbox" && /confirm|agree/.test(eff)) return { kind: "attestation", question_key: slug(eff).slice(0, 32) || "attestation" };
    return { kind: "unknown" };
  }
  function bindingFor(f, kind) {
    if (f.tag === "select") return { field_id: null, inputType: "select", selector: f.selector, options: f.options || [] };
    if (f.inputType === "file") return { field_id: null, inputType: "file", selector: f.selector };
    if (f.inputType === "checkbox") return { field_id: null, inputType: "checkbox", selector: f.selector };
    if (f.inputType === "radio") return { field_id: null, inputType: "radio_group", options: [{ selector: f.selector, label: f.label || "" }] };
    return { field_id: null, inputType: "text", selector: f.selector };
  }

  // ---------- the sync bridge to the helper process ----------
  let helperDir = null, helperProc = null, cmdSeq = 0;
  const liveBoards = new Set();
  function ensureHelper() {
    if (helperProc) return;
    // Session scratch defaults to the OS temp dir; UPMORE_SEAM_TMP relocates
    // it (sandboxes whose /tmp is a small shared tmpfs would be exhausted by
    // a Chromium profile). The helper inherits TMPDIR=base so Chromium's
    // profiles land on the same filesystem.
    const base = process.env.UPMORE_SEAM_TMP || os.tmpdir();
    try { fs.mkdirSync(base, { recursive: true }); } catch (e) {}
    helperDir = fs.mkdtempSync(path.join(base, "upmore-portal-seam-"));
    helperProc = spawn(process.execPath, [HELPER, helperDir], { detached: true, stdio: "ignore", env: { ...process.env, TMPDIR: base } });
    helperProc.unref();
    const ready = path.join(helperDir, "ready.json");
    const fatal = path.join(helperDir, "fatal.json");
    const deadline = Date.now() + 20000;
    const buf = new Int32Array(new SharedArrayBuffer(4));
    while (!fs.existsSync(ready)) {
      if (fs.existsSync(fatal)) { const f = JSON.parse(fs.readFileSync(fatal, "utf8")); throw coded(f.code || "HELPER_FATAL", f.message || "browser helper failed to start"); }
      if (Date.now() > deadline) throw coded("HELPER_TIMEOUT", "browser helper did not become ready in 20s");
      Atomics.wait(buf, 0, 0, 25);
    }
    process.on("exit", () => { try { fs.writeFileSync(path.join(helperDir, "cmd-sys-exit.json"), JSON.stringify({ type: "shutdown", boardId: "sys" })); } catch (e) {} });
  }
  function call(boardId, cmd, timeoutMs) {
    ensureHelper();
    cmdSeq += 1;
    const seq = cmdSeq;
    const cmdName = `cmd-${boardId}-${seq}.json`;
    const respName = `resp-${boardId}-${seq}.json`;
    fs.writeFileSync(path.join(helperDir, cmdName + ".tmp"), JSON.stringify(Object.assign({}, cmd, { boardId })));
    fs.renameSync(path.join(helperDir, cmdName + ".tmp"), path.join(helperDir, cmdName));
    const deadline = Date.now() + (timeoutMs || 60000);
    const buf = new Int32Array(new SharedArrayBuffer(4));
    const respPath = path.join(helperDir, respName);
    while (!fs.existsSync(respPath)) {
      if (Date.now() > deadline) throw coded("DRIVER_TIMEOUT", `browser helper did not answer '${cmd.type}' in ${timeoutMs || 60000}ms`);
      Atomics.wait(buf, 0, 0, 15);
    }
    const resp = JSON.parse(fs.readFileSync(respPath, "utf8"));
    try { fs.unlinkSync(respPath); } catch (e) {}
    if (!resp.ok) throw coded(resp.error.code || "DRIVER_ERROR", resp.error.message || "browser helper error");
    return resp.data;
  }
  function shutdownAll() {
    for (const b of Array.from(liveBoards)) { try { b.close(); } catch (e) {} }
    if (helperProc) {
      try { call("sys", { type: "shutdown" }, 5000); } catch (e) {}
      helperProc = null;
    }
  }

  // ---------- the board ----------
  let boardSeq = 0;
  function createBrowserBoard(opts) {
    const o = opts || {};
    if (!o.url) throw coded("BOARD_URL_REQUIRED", "createBrowserBoard: the posting url is required — a browser board is bound to one posting");
    if (!o.userId) throw coded("BOARD_USER_REQUIRED", "createBrowserBoard: userId is required — sessions are per-user, never shared");
    boardSeq += 1;
    const boardId = `bb-${boardSeq}`;
    const gate = hostAllowed(o.url);
    const state = {
      opened: false, closed: false, defs: null, bindings: null,
      filledValues: {}, fillFailures: [], captchaTech: [], finalUrl: null, navSteps: [],
      resumeShaChecked: null, submitAttempted: false, submitCapture: null,
      redirectRefused: null, // BUG-060: typed off-allowlist landing, once set nothing else runs
      armed: o.submitArmed === true, approvalRef: o.submitArmed === true ? (o.approvalRef || null) : null,
    };
    const refuseIfRedirected = () => {
      if (state.redirectRefused) throw coded("HOST_REDIRECT_REFUSED", `this board landed off the allowlist at ${state.redirectRefused.finalUrl} — no further actions on it (§6.3)`);
    };
    const calls = { open: 0, fill: 0, submit: 0 };
    const driverLog = [];
    const log = (action, data) => driverLog.push(Object.assign({ seq: driverLog.length + 1, action }, data || {}));

    // Captcha-stop evidence (captcha-pack M4): module 120's handoff ticket
    // cannot mint without a screenshot_ref, so a captcha stop captures the
    // stopped page. Returns the PNG path — the reference 149 surfaces on
    // the CAPTCHA_HANDOFF result as `screenshot_ref` — or null when the
    // capture itself failed (never a fabricated reference).
    function captureStopScreenshot(at) {
      try {
        const dir = o.evidenceDir || helperDir;
        if (o.evidenceDir) fs.mkdirSync(dir, { recursive: true });
        const p = path.join(dir, `captcha-${boardId}-${at}.png`);
        board.screenshot(p);
        log("captcha_screenshot", { at, screenshot_ref: p });
        return p;
      } catch (e) {
        log("captcha_screenshot_failed", { at, message: String(e.message || e) });
        return null;
      }
    }

    const board = {
      kind: "browser", sandbox: false, browserDriver: true,
      atsFamily: atsFamilyOf(o.url) || o.atsFamily || null,
      host: gate.host || "", contextId: boardId, calls, driverLog,
      get accountName() { return o.accountName || null; },
      get fillFailures() { return state.fillFailures.slice(); },
      get captchaTech() { return state.captchaTech.slice(); },
      get finalUrl() { return state.finalUrl; },
      get submitArmed() { return state.armed; },
      get approvalRef() { return state.approvalRef; },
      // THE ARMING WIRE (BUG-063 / D3): called ONLY by 149's approval
      // gate (submitDoorstep). Arms this board iff the gate passed AND
      // the approval carries a reference naming the owner's batch
      // approval. Anything else arms nothing and says so — the default
      // stays unarmed, and submit() stays the refusal.
      armForSubmit(ctx) {
        if (state.armed) return { armed: true, alreadyArmed: true, approvalRef: state.approvalRef };
        const ref = ctx && typeof ctx.approvalRef === "string" ? ctx.approvalRef.trim() : "";
        if (ctx && ctx.approvedByUser === true && ref) {
          state.armed = true; state.approvalRef = ref;
          log("submit_armed", { approvalRef: ref, canonicalKey: ctx.canonicalKey || null });
          return { armed: true, approvalRef: ref };
        }
        log("submit_arm_refused", { reason: !ctx || ctx.approvedByUser !== true ? "approval_gate_not_passed" : "approval_ref_required" });
        return { armed: false, reason: !ctx || ctx.approvedByUser !== true ? "approval_gate_not_passed" : "approval_ref_required" };
      },
      open() {
        if (state.closed) throw coded("BOARD_CLOSED", "this browser board is closed");
        if (!gate.allowed) throw coded("DRIVER_HOST_REFUSED", `driver refuses to open ${o.url} — only tested ATS families and localhost test pages may be driven (§6.3)`);
        const r = call(boardId, { type: "open", url: o.url }, 240000);
        calls.open += 1;
        state.opened = true;
        state.finalUrl = r.finalUrl; state.captchaTech = r.captchaTech || []; state.navSteps = r.navSteps || [];
        log("open", { url: o.url, finalUrl: r.finalUrl, fieldCount: r.fieldCount, captchaTech: state.captchaTech, navSteps: state.navSteps });
        // §6.3 on EVERY hop (BUG-060 / D1): wherever the page actually
        // landed — initial load, redirect chain, or the apply-click —
        // must still be on the allowlist. The helper also aborts an
        // off-list navigation pre-network (blockedNavigation).
        const landed = r.blockedNavigation || r.finalUrl;
        const fg = landed ? finalUrlGate(landed) : { allowed: true };
        if (!fg.allowed) {
          state.redirectRefused = fg;
          log("host_redirect_refused", { at: "open", finalUrl: fg.finalUrl, host: fg.host });
          return { ok: false, captcha: null, code: fg.code, finalUrl: fg.finalUrl, host: fg.host, reason: fg.reason };
        }
        if (r.captcha) { log("captcha_detected", { at: "open" }); return { ok: true, captcha: r.captcha, screenshotRef: captureStopScreenshot("open") }; }
        return { ok: true, captcha: r.captcha || null };
      },
      form() {
        refuseIfRedirected();
        if (!state.opened) board.open();
        refuseIfRedirected();
        const r = call(boardId, { type: "discover" }, 30000);
        const { defs, bindings } = classifyFields(r.fields || []);
        state.defs = defs; state.bindings = bindings;
        for (const d of defs) if (bindings[d.field_id]) bindings[d.field_id].field_id = d.field_id;
        log("discover", { fieldCount: defs.length, fields: defs.map((d) => ({ field_id: d.field_id, kind: d.kind, required: d.required })) });
        return { fields: defs.map((d) => Object.assign({}, d)), captchaAt: null };
      },
      fill(fieldId, value) {
        refuseIfRedirected();
        if (!state.bindings) board.form();
        const binding = state.bindings[fieldId];
        if (!binding) throw coded("UNKNOWN_FIELD", `no such field on this board: ${fieldId}`);
        calls.fill += 1;
        if (binding.inputType === "file") {
          if (!o.resumePath) throw coded("RESUME_FILE_MISSING", "the board was built without a local resume file to upload");
          if (state.resumeShaChecked === null) state.resumeShaChecked = sha256File(o.resumePath);
          if (!value || value.sha256 !== state.resumeShaChecked) {
            throw coded("RESUME_SHA_MISMATCH", "the local resume file's bytes do not hash to the profile's resume sha256 — refused, never uploaded");
          }
          call(boardId, { type: "fill", binding, value, filePath: o.resumePath }, 30000);
          state.filledValues[fieldId] = { filename: value.filename, sha256: value.sha256 };
          log("fill", { field_id: fieldId, source: "file_upload", filename: value.filename });
          return value;
        }
        // Non-file fills DEGRADE, never abort: a widget that times out or
        // refuses (a collapsed Greenhouse section, a custom dropdown) is
        // recorded as a fill failure and the field stays unset — 149 then
        // asks the user about it if it is required. One bad widget must
        // not kill a run that has already filled twenty good fields.
        // (The resume file fill above keeps throwing: a payload that
        // claims a resume it failed to upload would be a lie.)
        let r;
        try {
          r = call(boardId, { type: "fill", binding, value }, 30000);
        } catch (e) {
          state.fillFailures.push({ field_id: fieldId, reason: "fill_error:" + (e.code || "DRIVER_ERROR"), wanted: String(value) });
          log("fill_failed", { field_id: fieldId, reason: "fill_error:" + (e.code || "DRIVER_ERROR"), message: String(e.message || e).slice(0, 160) });
          return undefined;
        }
        if (r && r.filled === false) {
          state.fillFailures.push({ field_id: fieldId, reason: r.reason || "fill_failed", wanted: r.wanted || String(value) });
          log("fill_failed", { field_id: fieldId, reason: r.reason || "fill_failed" });
          return undefined;
        }
        state.filledValues[fieldId] = value;
        log("fill", { field_id: fieldId });
        return value;
      },
      answers() {
        if (!state.bindings) return Object.assign({}, state.filledValues);
        const list = Object.values(state.bindings).filter((b) => b.inputType !== "file");
        const r = call(boardId, { type: "readback", bindings: list }, 30000);
        const out = Object.assign({}, r.answers || {});
        for (const [k, v] of Object.entries(state.filledValues)) {
          const b = state.bindings[k];
          if (b && b.inputType === "file") out[k] = v;
        }
        return out;
      },
      atReview() {
        refuseIfRedirected();
        const r = call(boardId, { type: "review" }, 90000);
        // §6.3 hop gate at review (BUG-060): the Next/Continue clicks
        // inside the review step navigate too — wherever they landed
        // must still be on the allowlist before anything submits.
        const landed = r.blockedNavigation || r.finalUrl;
        if (landed) {
          const fg = finalUrlGate(landed);
          if (!fg.allowed) {
            state.redirectRefused = fg;
            log("host_redirect_refused", { at: "review", finalUrl: fg.finalUrl, host: fg.host });
            return { ok: false, captcha: null, code: fg.code, finalUrl: fg.finalUrl, host: fg.host, reason: fg.reason };
          }
          state.finalUrl = landed;
        }
        if (r.captcha) { log("captcha_detected", { at: "review" }); return { ok: true, captcha: "challenge", screenshotRef: captureStopScreenshot("review") }; }
        log("at_review", {});
        return { ok: true, captcha: null };
      },
      screenshot(filePath) {
        const r = call(boardId, { type: "screenshot", path: filePath }, 30000);
        log("screenshot", { path: filePath });
        return r.path;
      },
      submit() {
        refuseIfRedirected();
        // The submit leg fires ONLY on an armed board: created armed
        // (opts.submitArmed === true, the test lane) or armed by 149's
        // approval gate via armForSubmit (approval + approvalRef,
        // BUG-063). Unarmed boards refuse here no matter what approval
        // 149 was handed — the refusal stays the default path.
        if (state.armed !== true) {
          throw coded("REAL_SUBMIT_DISABLED", "this browser board is not armed for submission — the doorstep is the end of the line until 149's approval gate arms it with the owner's batch approval reference");
        }
        if (state.submitAttempted) {
          throw coded("SUBMIT_ALREADY_ATTEMPTED", "this board already fired its one submit — reconcile the captured outcome, never re-click (§8.3)");
        }
        state.submitAttempted = true;
        calls.submit += 1;
        const shotPath = path.join(o.evidenceDir || helperDir, `submit-confirmation-${boardId}.png`);
        if (o.evidenceDir) { try { fs.mkdirSync(o.evidenceDir, { recursive: true }); } catch (e) {} }
        const r = call(boardId, { type: "submit_and_capture", screenshotPath: shotPath }, 90000);
        if (r.captcha) {
          // A challenge at the moment of submit: nothing was clicked
          // through it. 149 reads the non-accepted outcome as unknown —
          // the human finishes via the handoff, never a blind retry.
          log("submit_captcha_stop", {});
          return { outcome: "captcha_stop", confirmationId: null, confirmationText: null, screenshotRef: null };
        }
        if (!r.clicked) {
          log("submit_no_control", { reason: r.reason || "no_submit_control" });
          return { outcome: "unknown", confirmationId: null, confirmationText: null, screenshotRef: null };
        }
        // CONFIRMATION CAPTURE: the employer's answer is evidence, not a
        // vibe — landing text + any confirmation/application ID + a
        // screenshot. "Accepted" is spoken ONLY when the captured page
        // carries an ID or unambiguous success text; anything else is
        // outcome "unknown" and 149 records unknown_outcome (§8.3).
        const capText = String(r.text || "").slice(0, 4000);
        const ex = extractConfirmation(capText);
        const cap = { text: capText, finalUrl: r.finalUrl || null, screenshotRef: r.screenshot || null, confirmationId: ex.confirmationId, successText: ex.successText };
        state.submitCapture = cap;
        log("submit_capture", { confirmationId: cap.confirmationId, successText: cap.successText, finalUrl: cap.finalUrl, screenshotRef: cap.screenshotRef });
        if (cap.confirmationId || cap.successText) {
          return { outcome: "accepted", confirmationId: cap.confirmationId, confirmationText: cap.text, screenshotRef: cap.screenshotRef, finalUrl: cap.finalUrl };
        }
        return { outcome: "unknown", confirmationId: null, confirmationText: cap.text, screenshotRef: cap.screenshotRef, finalUrl: cap.finalUrl };
      },
      submissionState() {
        const cap = state.submitCapture;
        if (cap && (cap.confirmationId || cap.successText)) {
          return { submitted: true, confirmationId: cap.confirmationId, confirmationText: cap.text, screenshotRef: cap.screenshotRef };
        }
        if (cap) {
          // A submit fired but its landing page proved nothing: the state
          // stays UNVERIFIABLE — reconcile must not call this "not
          // submitted" and clear the way for a duplicate (§8.3).
          return { submitted: false, confirmationId: null, unverifiable: true, confirmationText: cap.text, screenshotRef: cap.screenshotRef };
        }
        return { submitted: false, confirmationId: null, unverifiable: true };
      },
      close() {
        if (state.closed) return;
        state.closed = true;
        liveBoards.delete(board);
        try { call(boardId, { type: "close" }, 15000); } catch (e) { /* helper may already be gone */ }
        if (liveBoards.size === 0 && helperProc) { try { call("sys", { type: "shutdown" }, 5000); } catch (e) {} helperProc = null; }
      },
    };
    liveBoards.add(board);
    return board;
  }

  return { createBrowserBoard, classifyFields, hostAllowed, finalUrlGate, shutdownAll };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerPortalBrowser;
