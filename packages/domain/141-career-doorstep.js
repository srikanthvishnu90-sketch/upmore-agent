/* Career doorstep — the chat ACTION seam (repair lane R3, gauntlet C15/C17/C18/C20/C37).
   One seam pattern for every action in this module:
     user turn -> routed action (handleChat) -> a domain module or the F3 form
     driver executes -> the result carries a typed resultStatus (the canonical
     oracle set: completed | prepared | awaiting_user | running | partial |
     blocked | failed | unknown_outcome) plus structured proof the composer /
     grader can read.
   What lives here (and ONLY here, per lane ownership):
     1. DOORSTEP FORM SEAM (C17/C18, C20 pre-submit): fills the F3 replica
        forms step by step through the fixture form driver — values resolved
        from profile facts only, conditional fields handled, unknowns and
        consent/declaration answers surfaced as ASKS (never guessed, never
        inferred — sensitive answers least of all), the hidden-default stop
        honored (UNRESOLVED_HIDDEN_DEFAULT is the terminal step, not a
        surprise at submit) — and stops ON the final review screen. Product
        output is the doorstep proof chain: step log (field, value source,
        result per agent step), a would-submit payload snapshot (all values +
        sha256 of the bound resume artifact + sha256 of the payload), and a
        sink-armed verification: a dry validation of the exact payload against
        the driver (missing fields, hidden defaults, late material) with NO
        submission.
     2. C20 SUBMIT LEG: after the doorstep, the case's own approved in-sink
        submit runs through this same seam. Exactly one submit per payload;
        a sink timeout is reported as unknown_outcome (never as success);
        "did it go through?" reconciles the sink BEFORE any retry, and a
        repeat approval while an outcome is unknown/confirmed is refused.
     3. QUEUE CONTROL (C37): "stop everything" halts the outreach queue and
        PERSISTS the halt (the queue state is the host-persisted object /
        JSON file passed in ctx; the halt flag and per-item status are
        written into it). Duplicate events (same event_id) are deduped and
        out-of-order events (older sent_at than the state they would rewind)
        cannot revive a halted item. Pending recipients are also suppressed
        through 124's own suppression store when the host passes one, so a
        send-time check in 124 would stop them too. 124 is CALLED, never edited.
     4. PACKET BINDING LEG (C15): packet preparation via chat resolves the
        requested artifact version among same-named records by CONTENT HASH
        and calls 133's assemblePacket (called, never edited); the returned
        packet carries this seam's binding + review surface.
   Approval gates are untouched: sensitive/consent answers still stop for the
   user, submits still require the case's explicit approval turn, caps are
   124's and are not touched here. All form writes go only to the F3 local
   receipt sink. No real sends, no real submissions.
   ROUTER REGISTRATION (one line, for the coordinator at integration): in the
   chat router's handler chain, after 120-career-access and
   130-career-onboarding, add CareerDoorstep.handleChat as the next tried
   handler — pilot-lib.cjs chatTurn is the staging mirror of that chain.
   Node host note: the form driver and queue-file persistence use fs/path
   through guarded requires; in a non-Node bundle the doorstep fill/submit
   functions report blocked instead of throwing. */
const CareerDoorstep = (() => {
  "use strict";
  const Packets = typeof CareerPackets !== "undefined" ? CareerPackets : (() => { try { return require("./133-career-packets.js"); } catch (e) { return null; } })();
  const Outreach = typeof CareerOutreach !== "undefined" ? CareerOutreach : (() => { try { return require("./124-career-outreach.js"); } catch (e) { return null; } })();
  const Driver = (() => { try { return require("../career-data/fixtures/gauntlet/forms/form-driver.cjs"); } catch (e) { return null; } })();
  const nodeCrypto = (() => { try { return require("crypto"); } catch (e) { return null; } })();
  const nodeFs = (() => { try { return require("fs"); } catch (e) { return null; } })();

  // ---------- sha256 (crypto when available; pure-JS fallback, same digest) ----------
  function sha256Direct(input) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const rr = (x, n) => ((x >>> n) | (x << (32 - n))) | 0;
    const bytes = [];
    const str = String(input == null ? "" : input);
    for (let i = 0; i < str.length; i++) { // UTF-8 encode
      let cp = str.charCodeAt(i);
      if (cp < 0x80) bytes.push(cp);
      else if (cp < 0x800) { bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)); }
      else if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < str.length) { const lo = str.charCodeAt(++i); cp = 0x10000 + ((cp - 0xd800) * 0x400) + (lo - 0xdc00); bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)); }
      else bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    }
    const bitLenHi = Math.floor(bytes.length / 0x20000000), bitLenLo = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 3; i >= 0; i--) bytes.push((bitLenHi >>> (i * 8)) & 0xff);
    for (let i = 3; i >= 0; i--) bytes.push((bitLenLo >>> (i * 8)) & 0xff);
    let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Array(64);
    for (let block = 0; block < bytes.length; block += 64) {
      for (let t = 0; t < 16; t++) w[t] = (bytes[block + t * 4] << 24) | (bytes[block + t * 4 + 1] << 16) | (bytes[block + t * 4 + 2] << 8) | bytes[block + t * 4 + 3];
      for (let t = 16; t < 64; t++) {
        const s0 = rr(w[t - 15], 7) ^ rr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const s1 = rr(w[t - 2], 17) ^ rr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let t = 0; t < 64; t++) {
        const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
        const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H = [(H[0] + a) | 0, (H[1] + b) | 0, (H[2] + c) | 0, (H[3] + d) | 0, (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + h) | 0];
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
  }
  function sha256(input) {
    const s = String(input == null ? "" : input);
    if (nodeCrypto) return nodeCrypto.createHash("sha256").update(s, "utf8").digest("hex");
    return sha256Direct(s);
  }

  // ---------- field resolution: profile facts ONLY; unknowns are asks ----------
  const humanField = (id) => String(id || "").replace(/_/g, " ");
  function resolveField(field, ctx) {
    const p = (ctx && ctx.profile) || {};
    const basics = p.basics || {}, cons = p.constraints || {}, defaults = p.defaults || {};
    const id = field.field_id;
    const from = (value, source) => ({ value, source });
    const ask = (reason) => ({ ask: reason || "not in the profile — the user must supply it; never guessed" });
    switch (id) {
      case "full_name": return basics.name ? from(basics.name, "profile basics.name") : ask();
      case "email": return basics.email ? from(basics.email, "profile basics.email") : ask();
      case "phone": return basics.phone ? from(basics.phone, "profile basics.phone") : ask("phone is not on the profile");
      case "resume_upload": {
        const art = (ctx && ctx.resumeArtifact) || null;
        if (!art || !art.name) return ask("no resume artifact is bound to this application");
        return from(art.name, "bound resume artifact " + art.name + (art.sha256 ? " (sha256 recorded in the payload snapshot)" : ""));
      }
      case "work_authorization": {
        if (cons.needsSponsorship === true) return from("will-need-sponsorship", "profile constraints.needsSponsorship = true (stated by the user, never inferred)");
        if (cons.needsSponsorship === false && cons.workAuthorization) return from("yes-authorized", "profile constraints.workAuthorization (stated) + needsSponsorship = false");
        return ask("work authorization is sensitive and is not stated on the profile");
      }
      case "sponsorship_detail": {
        const detail = cons.sponsorshipDetail || (ctx && ctx.formFacts && ctx.formFacts.sponsorship_detail) || (/f-1|opt|sponsorship/i.test(String(cons.workAuthorization || "")) ? String(cons.workAuthorization) : null);
        return detail ? from(detail, "profile constraints (stated eligibility / sponsorship detail)") : ask("sponsorship detail is sensitive and is not stated on the profile");
      }
      case "start_date": {
        if (!cons.startDate) return ask();
        const v = String(cons.startDate);
        return from(/^\d{4}-\d{2}$/.test(v) ? v + "-01" : v, "profile constraints.startDate");
      }
      case "graduation_date": return cons.graduationDate ? from(String(cons.graduationDate), "profile constraints.graduationDate") : ask();
      case "eeo_gender": case "eeo_veteran": case "eeo_gender_reversed": {
        if (defaults.demographicPreference && /decline/i.test(String(defaults.demographicPreference))) return from("decline-to-answer", "profile defaults.demographicPreference — the user's stored decline-to-answer preference, set explicitly so no hidden default can stand");
        const explicit = ctx && ctx.eeoAnswers && ctx.eeoAnswers[id];
        return explicit ? from(explicit, "user-supplied answer for this exact field") : ask("sensitive field with no stored preference — never guessed, and a hidden default must never stand in for the user");
      }
      case "background_check_consent": return ask("consent must be the user's own act — a pre-checked box is not consent");
      case "export_control_declaration": return ask("a legal declaration must be the user's own answer");
      case "sms_opt_in": return from(false, "safe default — the user is never opted into marketing messages on their behalf; the pre-checked box is explicitly cleared");
      case "why_company": return ask("this answer must be the user's own words — left blank rather than invented");
      default: {
        const explicit = ctx && ctx.formFacts && ctx.formFacts[id];
        return explicit != null ? from(explicit, "user-supplied fact for this field") : ask();
      }
    }
  }

  // Dry validation of the EXACT payload, using the driver's own checks plus the
  // submit pre-checks (late material), WITHOUT calling submit.
  function dryValidate(session, spec) {
    const v = session.validate();
    const late = Driver.lateMaterialFields(spec).filter((f) => f.required && session.answers[f.field_id] === undefined).map((f) => f.field_id);
    const hiddenSensitive = v.hiddenDefaultsInEffect.filter((h) => h.sensitive).map((h) => h.field_id);
    return { ok: v.ok && late.length === 0 && hiddenSensitive.length === 0, missing: v.missing, hidden_defaults_in_effect: v.hiddenDefaultsInEffect, hidden_sensitive: hiddenSensitive, late_material_unacknowledged: late, submitted: false, note: "driver validate() + submit pre-checks on the exact payload; submit was NOT called" };
  }

  // ---------- 1. doorstep fill (C17/C18 + C20 pre-submit) ----------
  function fillDoorstep(ctx) {
    if (!Driver) return { ok: false, code: "driver_unavailable", reply: "The form driver is not available in this build, so I filled nothing." };
    const spec = ctx.formSpec || Driver.loadSpec(ctx.formSpecName);
    const sinkDir = ctx.sinkDir; // local receipt sink dir only; the driver refuses URLs
    const session = Driver.createSession(spec, sinkDir ? { sinkDir } : {});
    const state = ctx.doorstepState || (ctx.doorstepState = {});
    const stepLog = [], asks = [];
    let seq = 0;
    for (const step of spec.steps) {
      if (step.kind === "review") continue;
      // Two passes per step: a conditional field can become visible only
      // after its trigger field in the same step is filled.
      for (let pass = 0; pass < 2; pass++) {
        for (const field of session.visibleFields(step.step_id)) {
          if (session.answers[field.field_id] !== undefined) continue;
          const r = resolveField(field, ctx);
          if (r.ask) {
            if (!asks.some((a) => a.field === field.field_id)) asks.push({ field: field.field_id, label: field.label || humanField(field.field_id), reason: r.ask, sensitive: !!field.sensitive });
            stepLog.push({ step: ++seq, action: "ask", field: field.field_id, step_id: step.step_id, value_source: null, result: "surfaced_as_ask — left unfilled, never guessed" });
          } else {
            session.fill(ctx.formProfileId || "profile-in-ctx", field.field_id, r.value);
            stepLog.push({ step: ++seq, action: "fill", field: field.field_id, step_id: step.step_id, value: r.value, value_source: r.source, result: "filled" });
          }
        }
      }
      for (const { field } of Driver.allFields(spec).filter((x) => x.step_id === step.step_id)) {
        if (field.visible_if && !Driver.isVisible(field, session.answers) && session.answers[field.field_id] === undefined) {
          stepLog.push({ step: ++seq, action: "skip", field: field.field_id, step_id: step.step_id, value_source: null, result: "not visible — its condition is not met by the profile's answers" });
        }
      }
    }
    const validation = session.validate();
    const hiddenSensitive = validation.hiddenDefaultsInEffect.filter((h) => h.sensitive);
    const art = ctx.resumeArtifact || {};
    const answers = Object.assign({}, session.answers);
    const payload = {
      form: spec.fixture_id, company: (spec.board || {}).company || null, role: (spec.board || {}).role || null,
      answers, resume_artifact: art.name || null, resume_sha256: art.sha256 || (art.content != null ? sha256(art.content) : null),
      payload_sha256: sha256(JSON.stringify(answers)), submitted: false,
    };
    const dry = dryValidate(session, spec);
    let doorstepStateName = "REVIEW", stopCode = null, review = null;
    if (hiddenSensitive.length) {
      stopCode = "UNRESOLVED_HIDDEN_DEFAULT";
      doorstepStateName = "STOPPED";
      stepLog.push({ step: ++seq, action: "stop", code: stopCode, fields: hiddenSensitive.map((h) => h.field_id), value_source: null, result: "stopped before the review screen — a sensitive hidden default was never explicitly answered and must never ride along" });
    } else {
      review = session.review();
      stepLog.push({ step: ++seq, action: "review", field: null, step_id: review.step_id, value_source: null, result: "stopped ON the final review screen — submit not clicked" });
    }
    const doorstep = {
      form: spec.fixture_id, company: payload.company, role: payload.role,
      state: doorstepStateName, stop_code: stopCode, submitted: false,
      step_log: stepLog, asks, payload,
      dry_validate: dry, sink_armed: doorstepStateName === "REVIEW" && dry.ok,
      review,
    };
    Object.assign(state, { spec, session, doorstep, submission: { status: "not_submitted", retries: 0, reconciled_before_retry: false, receipt_id: null }, payload_sha256: payload.payload_sha256 });
    doorstep.submission = state.submission;
    return { ok: true, doorstep };
  }

  function fillReply(doorstep) {
    const askText = doorstep.asks.length ? ` I still need from you: ${doorstep.asks.map((a) => humanField(a.field)).join(", ")} — I left those unfilled rather than guessing.` : "";
    if (doorstep.state === "STOPPED") {
      return `I filled what your profile establishes, then stopped: a sensitive answer on this form is preselected in secret and you have not chosen it yourself.${askText} Nothing was submitted.`;
    }
    return `Filled the ${doorstep.company || "application"} form from your profile and stopped on the final review screen — it is not submitted.${askText} Nothing will be submitted until you approve it.`;
  }

  // ---------- 2. C20 submit + reconcile ----------
  function submitDoorstep(ctx) {
    const state = ctx.doorstepState || {};
    const sub = state.submission;
    if (sub && state.doorstep) state.doorstep.submission = sub;
    if (!state.session || !sub) return { intent: "doorstep_submit", resultStatus: "blocked", reply: "There is no prepared form waiting on its review screen, so there is nothing to submit. Ask me to fill the form out first." };
    if (sub.status === "unknown_outcome" || sub.status === "confirmed_after_reconcile" || sub.status === "submitted_accepted") {
      return { intent: "doorstep_submit", resultStatus: sub.status === "unknown_outcome" ? "unknown_outcome" : "completed", duplicate_refused: true, doorstep: state.doorstep, submission: sub, reply: `I already sent one submission for this exact review and its outcome is ${sub.status === "unknown_outcome" ? "still unknown" : "already recorded"}, so I will not submit again. Ask me "did it go through?" and I will reconcile the receipt sink before any retry.` };
    }
    if (state.doorstep.state !== "REVIEW") return { intent: "doorstep_submit", resultStatus: "awaiting_user", doorstep: state.doorstep, submission: sub, reply: `The form is stopped (${state.doorstep.stop_code || "not at review"}), so I cannot submit it. The open asks have to be answered by you first.` };
    const out = state.session.submit();
    if (out.outcome === "accepted") {
      sub.status = "submitted_accepted"; sub.receipt_id = out.receipt && out.receipt.receipt_id;
      return { intent: "doorstep_submit", resultStatus: "completed", doorstep: state.doorstep, submission: sub, reply: `Submitted once to the local test sink and confirmed with receipt ${sub.receipt_id}. That was the one approved submission for this review.` };
    }
    if (out.outcome === "timeout") {
      sub.status = "unknown_outcome"; sub.receipt_id = out.receipt_id || (out.receipt && out.receipt.receipt_id) || null; sub.receipt_written = !!out.receiptWritten;
      return { intent: "doorstep_submit", resultStatus: "unknown_outcome", doorstep: state.doorstep, submission: sub, reply: "I sent the submission once, but the response timed out, so its outcome is unknown — I am not claiming it went through. Ask me \"did it go through?\" and I will check the receipt sink before any retry." };
    }
    // Driver stop (missing required / hidden default / late material).
    sub.status = "not_submitted";
    return { intent: "doorstep_submit", resultStatus: "awaiting_user", doorstep: state.doorstep, submission: sub, stop_code: out.code || null, reply: `The form itself stopped the submit (${out.code || "a required answer is missing"}), so nothing was submitted. Answer the open asks and I will prepare it again for your approval.` };
  }
  function reconcileDoorstep(ctx) {
    const state = ctx.doorstepState || {};
    const sub = state.submission;
    if (sub && state.doorstep) state.doorstep.submission = sub;
    if (!sub || sub.status === "not_submitted") return { intent: "doorstep_status", resultStatus: "prepared", doorstep: state.doorstep || null, submission: sub || null, reply: "Nothing has been submitted for this form yet, so there is no outcome to check. It is still waiting on its review screen for your approval." };
    if (sub.status === "confirmed_after_reconcile" || sub.status === "submitted_accepted") {
      return { intent: "doorstep_status", resultStatus: "completed", doorstep: state.doorstep, submission: sub, reply: `Yes — exactly one submission is on record for this application (receipt ${sub.receipt_id}). No second submission was made.` };
    }
    // unknown_outcome: reconcile BEFORE any retry — and no retry is taken here.
    const rec = state.session.reconcile(sub.receipt_id);
    sub.reconciled_before_retry = sub.retries === 0;
    if (rec && rec.found) {
      sub.status = "confirmed_after_reconcile"; sub.receipt = rec.receipt;
      return { intent: "doorstep_status", resultStatus: "completed", doorstep: state.doorstep, submission: sub, reply: `Yes — I checked the receipt sink before any retry and found exactly one submission for this application (receipt ${sub.receipt_id}). No second submission was made, so there are no duplicates.` };
    }
    return { intent: "doorstep_status", resultStatus: "unknown_outcome", doorstep: state.doorstep, submission: sub, reply: "I checked the receipt sink and found no receipt for that submission, so its outcome is still unknown. I will not resubmit blindly — that could double-apply; tell me if you want me to prepare it again." };
  }

  // ---------- 3. queue control (C37) ----------
  function loadQueueState(ctx) {
    if (ctx.queueState) return { state: ctx.queueState, persist: () => {} };
    if (ctx.queueStatePath && nodeFs) {
      const state = JSON.parse(nodeFs.readFileSync(ctx.queueStatePath, "utf8"));
      return { state, persist: () => nodeFs.writeFileSync(ctx.queueStatePath, JSON.stringify(state, null, 2) + "\n") };
    }
    return { state: null, persist: () => {} };
  }
  function haltQueue(ctx, text) {
    const { state, persist } = loadQueueState(ctx);
    if (!state || !state.outreach_queue || !Array.isArray(state.outreach_queue.items)) {
      return { intent: "queue_halt", resultStatus: "blocked", reply: "I cannot find the outreach queue state, so I halted nothing. Point me at the queue and I will stop it." };
    }
    const q = state.outreach_queue;
    const pending = q.items.filter((i) => i.status === "pending");
    for (const item of pending) { item.status = "halted"; item.halted_by = "user instruction in chat"; item.halt_reason = String(text || ""); }
    q.halted = true;
    q.halt = { at: (ctx && ctx.now) || null, instruction: String(text || ""), items_halted: pending.map((i) => i.queue_id), form_prep_state: state.form_prep_in_progress ? state.form_prep_in_progress.state || null : null };
    if (state.form_prep_in_progress && state.form_prep_in_progress.state !== "SUBMITTED") state.form_prep_in_progress.halted = true;
    // Belt-and-braces through 124's OWN suppression API (called, not edited):
    // even a send-time pass in 124 stops a suppressed recipient.
    let suppressed = 0;
    const suppression = (ctx && ctx.suppression) || (Outreach && Outreach.createSuppressionStore ? Outreach.createSuppressionStore() : null);
    if (suppression) { for (const item of pending) if (item.to) { suppression.suppress({ email: item.to, userId: (ctx && ctx.userId) || "user-1", scope: "user", reason: "user stop-everything instruction" }); suppressed++; } if (ctx) ctx.suppression = suppression; }
    persist();
    return {
      intent: "queue_halt", resultStatus: "completed", halted_count: pending.length, suppressed_recipients: suppressed,
      queue_state: q,
      reply: `Stopped everything: ${pending.length} pending outreach item${pending.length === 1 ? " is" : "s are"} halted, and the halt is saved so it survives a restart. Nothing was sent and nothing irreversible exists — no contact will be made from this queue.`,
    };
  }
  // Inbox-event hygiene for a (possibly halted) queue state: dedupe by
  // event_id; an event older than the halt, or carrying an older status than
  // the item already holds, is out-of-order and applies nothing. A halted
  // item can never be revived by an event.
  function applyQueueEvent(state, ev) {
    const q = (state || {}).outreach_queue || {};
    q.processed_event_ids = q.processed_event_ids || [];
    if (!ev || !ev.event_id) return { applied: false, reason: "no_event_id" };
    if (q.processed_event_ids.includes(ev.event_id)) return { applied: false, deduped: true, reason: "duplicate event_id — already processed once" };
    q.processed_event_ids.push(ev.event_id);
    const item = (q.items || []).find((i) => i.queue_id === ev.queue_id);
    if (!item) return { applied: false, reason: "unknown queue item" };
    if (item.status === "halted" || q.halted) return { applied: false, reason: "queue is halted — events cannot revive a halted item", item_status: item.status };
    const evTime = Date.parse(ev.sent_at || ev.at || "") || 0;
    const itemTime = Date.parse(item.updated_at || item.sent_at || "") || 0;
    if (evTime && itemTime && evTime < itemTime) return { applied: false, reason: "out-of-order event — older than the item's current state", item_status: item.status };
    if (ev.status) { item.status = ev.status; item.updated_at = ev.sent_at || ev.at || item.updated_at; return { applied: true, item_status: item.status }; }
    return { applied: false, reason: "event carries no applicable change", item_status: item.status };
  }

  // ---------- 4. packet binding leg (C15) ----------
  function prepPacket(text, ctx) {
    if (!Packets) return { intent: "packet_prep", resultStatus: "blocked", reply: "The packet module is not available in this build, so I prepared nothing." };
    const t = String(text || "").toLowerCase();
    const m = t.match(/using the (\w+) version/) || t.match(/prep the (\w+) application/);
    const requested = m && m[1];
    const artifacts = (ctx && ctx.artifacts) || [];
    const matches = artifacts.filter((a) => a && (String(a.version || "").toLowerCase() === requested || String(a.record || "").toLowerCase().includes(requested || "\0")));
    if (!requested || matches.length !== 1) {
      return { intent: "packet_prep", resultStatus: "awaiting_user", reply: `I could not pin down exactly one "${requested || "requested"}" version among the stored documents, so I bound nothing. Tell me which version to use and I will prepare the packet with that one.` };
    }
    const artifact = matches[0];
    const binding = { version: artifact.version || requested, name: artifact.name || "resume.pdf", record: artifact.record || null, sha256: artifact.sha256 || sha256(artifact.content != null ? artifact.content : "") };
    const pin = (ctx && ctx.packet) || {};
    const packet = Packets.assemblePacket({ profile: ctx.profile, company: pin.company, jdText: pin.jdText, jobId: pin.jobId || null, family: pin.family, cir: pin.cir || null, portalAsksCoverLetter: !!pin.portalAsksCoverLetter, companyKind: pin.companyKind, voice: pin.voice });
    if (!packet.ok) return { intent: "packet_prep", resultStatus: "blocked", binding, packet, reply: `I bound the ${binding.version} version by its content hash, but the packet itself was refused (${packet.code || "truth audit"}), so nothing is prepared. Fix that first and I will rebuild it.` };
    const review = { company: packet.company, jobId: packet.jobId, portal: packet.portal || null, bound_name: binding.name, bound_version: binding.version, bound_sha256: binding.sha256, one_page_ok: packet.onePage ? packet.onePage.ok : null, ats_ok: packet.ats ? packet.ats.ok : null };
    return {
      intent: "packet_prep", resultStatus: "prepared", packet, binding, review,
      reply: `Prepared the ${binding.version} application packet for ${packet.company}, bound to the ${binding.version} version of your resume (matched by content hash, not by file name). It is ready for your review — nothing has been submitted.`,
    };
  }

  // ---------- chat routing (the seam's one entry point) ----------
  function handleChat(text, ctx) {
    const t = String(text || "").trim().toLowerCase();
    const c = ctx || {};
    if (/\bstop everything\b|\bdon'?t contact anyone\b|\bstop all outreach\b/.test(t)) return haltQueue(c, text);
    if (/\bdid it go through\b|\bdid that (go through|submit)\b|\bcheck (the )?submission status\b/.test(t)) { const r = reconcileDoorstep(c); return r.doorstep || r.submission ? r : null; }
    if (/\bapprove and submit\b|\bsubmit it\b/.test(t)) { const r = submitDoorstep(c); return (c.doorstepState && c.doorstepState.session) || r.resultStatus !== "blocked" ? r : null; }
    if (/\bfill (this|it|the form|that) out\b|\bfill out this\b|\bjust use my profile\b|\bcomplete (this|the) application form\b/.test(t)) {
      if (!c.formSpecName && !c.formSpec) return null;
      const r = fillDoorstep(c);
      if (!r.ok) return { intent: "doorstep_fill", resultStatus: "blocked", reply: r.reply };
      return { intent: "doorstep_fill", resultStatus: r.doorstep.state === "STOPPED" ? "awaiting_user" : "prepared", doorstep: r.doorstep, reply: fillReply(r.doorstep) };
    }
    if (/\bprep the \w+ application\b|\bprepare the \w+ application\b/.test(t)) return prepPacket(text, c);
    return null;
  }

  return { handleChat, fillDoorstep, dryValidate, submitDoorstep, reconcileDoorstep, haltQueue, applyQueueEvent, prepPacket, resolveField, sha256, sha256Direct };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerDoorstep;
