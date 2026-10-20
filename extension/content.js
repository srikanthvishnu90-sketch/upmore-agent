// WO-031: the extension on an application page (Greenhouse, Lever, Ashby; Workday basic fields only). It reads every
// field the way the engine does, runs the apply stack's planner over the person's confirmed facts and saved answers, fills
// only what the planner answered, and shows the person a card with every answer exactly as it will be sent. The site's
// own Submit is clicked only after the person's one tap approved that card, and only if the form still matches it.
(() => {
  if (globalThis.__traineeContent) return;
  globalThis.__traineeContent = true;
  const C = globalThis.TraineeCore, D = C.dom;
  const portal = C.detectPortal(location.href);
  if (!portal) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const send = (m) => chrome.runtime.sendMessage(m).catch(() => ({ ok: false }));
  const HANDOFF = "A verification check is showing on the page. Finish it yourself there, then press Approve again. Trainee never answers one.";

  let form = null, ctx = null, plan = null, jobId = null, company = "", expiresAt = null, shownAt = 0;
  let reviewed = null, busy = false, submitting = false, sent = false, refreshTimer = null;
  // WO-042: when each step of this application happened (epoch ms), for the 60-in-30 benchmark and the panel's own
  // "where the time went". Never part of the payload or its hash.
  const nav = performance.getEntriesByType("navigation")[0];
  const timing = {
    nav: Math.round(performance.timeOrigin),
    dcl: nav ? Math.round(performance.timeOrigin + nav.domContentLoadedEventEnd) : null,
    script: Date.now(),
    visibility_at_prepare: null,
  };
  const filled = new Map(); // name -> the value as the page showed it right after Trainee filled it
  const factIds = new Map(); // name -> the confirmed fact it came from
  const chosen = new Map(); // name -> the employer's option text a widget fill clicked, shown while the widget still shows it
  const edited = new Set(); // names the person changed themselves (trusted events only)

  // The person's own edits: a trusted input or change on a field. Trainee's own fills dispatch untrusted events.
  for (const t of ["input", "change"]) {
    document.addEventListener(t, (e) => {
      if (!e.isTrusted || !form || submitting) return;
      const n = D.fieldNameFor(e.target, form);
      if (n) {
        edited.add(n);
        scheduleRefresh();
      }
    }, true);
  }
  // A choice picked in a widget menu (no input event on the field itself): the focused field's.
  document.addEventListener("mousedown", (e) => {
    if (!e.isTrusted || !form || submitting) return;
    const n = document.activeElement && D.fieldNameFor(document.activeElement, form);
    if (n && form.bindings[n]?.widget) {
      edited.add(n);
      scheduleRefresh();
    }
  }, true);

  const scheduleRefresh = () => {
    if (!reviewed && !plan) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refresh().catch(() => {}), 350);
  };

  // Every non-empty answer on the form now, with where it came from (see apply_core.ts Source).
  function snapshot() {
    form = D.readForm();
    const out = [];
    for (const s of form.schema) {
      const b = form.bindings[s.name];
      let v = D.readValue(b);
      if (!v && filled.get(s.name) === "No (left unchecked)" && b.inputType === "checkbox") v = "No (left unchecked)";
      if (!v) continue;
      if (C.isIdentityField(s)) {
        out.push({ name: s.name, label: s.label, value: v, source: edited.has(s.name) ? "you" : "page", factId: null, masked: true });
        continue;
      }
      const source = filled.has(s.name) && filled.get(s.name) === v ? "trainee" : edited.has(s.name) ? "you" : "page";
      if (source === "trainee" && chosen.has(s.name)) v = chosen.get(s.name);
      out.push({ name: s.name, label: s.label, value: v, source, factId: source === "trainee" ? factIds.get(s.name) ?? null : null, masked: false });
    }
    return out;
  }
  function openRequired(fields) {
    const have = new Set(fields.map((f) => f.name));
    return form.schema.filter((s) => s.required && !have.has(s.name) && !C.fileAlternative(s, form.schema)).map((s) => C.shortLabel(s.label));
  }
  const payloadOf = (fields) =>
    C.reviewPayload({
      userId: ctx.userId, jobId, company, url: location.href, family: portal.family, fields,
      resume: ctx.resume ? { filename: ctx.resume.name, sha256: ctx.resume.sha256 } : null,
      account: { epoch: Number(ctx.account?.epoch ?? 0), version: Number(ctx.account?.version ?? 0) }, expiresAt,
    });

  // The card: rebuilt whenever the form changes before the tap, so the person always approves what is there now.
  async function refresh() {
    if (submitting || sent || !ctx) return;
    const fields = snapshot();
    const payload = payloadOf(fields);
    const hash = await C.approvalHash(payload);
    const open = openRequired(fields);
    const block = C.blockers({ fields, openRequired: open, challenge: !!D.fnDetectChallenge(), family: portal.family });
    if (!ctx.account) block.push("Your Upmore account has no job settings yet. Text Trainee once so it can record your applications.");
    else if (ctx.account.paused) block.push("Your account is paused, so nothing is sent.");
    const verification = [...new Set((D.fnCaptchaTech() || []).map((t) => t.replace(/-widget$/, "")))];
    const lines = C.cardLines({ company, family: portal.family, payload, openRequired: open, identity: plan?.identity || [], blockers: block, verification });
    reviewed = { fields, payload, hash };
    timing.card = Date.now();
    timing.first_card ??= timing.card;
    await send({ type: "card", card: { jobId, company, family: portal.family, url: location.href, lines, hash, payload, blockers: block, openRequired: open, timing: { ...timing },
      status: block.length ? "blocked" : "ready", message: block.length ? "Not ready to approve yet." : "Read every answer, then approve.", shown_at: shownAt, approved: false } });
  }

  async function prepare() {
    if (busy || submitting) return { ok: false, message: "Already working on this page." };
    if (sent) return { ok: false, message: "This application was already sent from this page." };
    busy = true;
    timing.prepare = Date.now();
    timing.visibility_at_prepare = document.visibilityState;
    try {
      ctx = await send({ type: "context" });
      timing.context = Date.now();
      if (!ctx?.signedIn) {
        await send({ type: "card", card: { status: "stopped", message: ctx?.message || "Sign in first.", lines: [] } });
        return { ok: false };
      }
      // The form may render after the page loads.
      for (let i = 0; i < 40 && D.readForm().schema.length < 2; i++) await sleep(250);
      if (D.fnDetectChallenge()) {
        await send({ type: "card", card: { status: "stopped", message: HANDOFF, lines: [] } });
        return { ok: false };
      }
      form = D.readForm();
      timing.read = Date.now();
      if (!form.schema.length) {
        await send({ type: "card", card: { status: "stopped", message: "No application form on this page yet. Open the Apply page, then press Fill again.", lines: [] } });
        return { ok: false };
      }
      jobId = C.postingKey(location.href) || C.postingKey(document.referrer || "") || location.origin + location.pathname;
      company = C.tenantOf(jobId) || location.hostname;
      expiresAt = new Date(Date.now() + 2 * 3600_000).toISOString();
      plan = C.planForm({ userId: ctx.userId, jobId, company, family: portal.family, schema: form.schema, answers: ctx.answers, saved: ctx.saved, now: Date.now() });
      timing.plan = Date.now();
      timing.fields = form.schema.length;
      timing.widgets = Object.values(form.bindings).filter((b) => b.widget).length;
      const resume = ctx.resume ? { name: ctx.resume.name, type: ctx.resume.type, bytes: Uint8Array.from(atob(ctx.resume.base64), (c) => c.charCodeAt(0)), sha256: ctx.resume.sha256 } : null;
      for (const p of plan.fill) {
        const b = form.bindings[p.name];
        if (!b || edited.has(p.name)) continue; // never over what the person typed
        // A dropdown widget: its options are read when its menu opens, and the planner chooses among them.
        const s = form.schema.find((x) => x.name === p.name);
        const choose = b.widget && s ? (labels) => C.chooseWidgetOption({ userId: ctx.userId, jobId, company, family: portal.family, field: s, labels, answers: ctx.answers, saved: ctx.saved, now: Date.now() }) : undefined;
        const ok = await D.fill(b, p.value, resume, choose);
        await sleep(20);
        let v = D.readValue(b);
        if (ok && !v && b.inputType === "checkbox" && !/^(true|yes|y|on|checked)\b/i.test(String(p.value))) v = "No (left unchecked)";
        const label = b.widget ? D.takeWidgetChoice() : null;
        if (ok && v) {
          if (label && label !== v) chosen.set(p.name, label);
          filled.set(p.name, v);
          factIds.set(p.name, p.factId);
        }
      }
      // Ask once: what only the person can answer goes to Trainee, to be asked by text and saved for every later form.
      timing.fill = Date.now();
      if (plan.needs.length && portal.family !== "workday") send({ type: "questions", jobId, company, needs: plan.needs });
      shownAt = Date.now();
      await refresh();
      return { ok: true };
    } catch (e) {
      await send({ type: "card", card: { status: "stopped", message: "This form could not be read (" + String(e.message || e).slice(0, 120) + "). Nothing was filled or sent.", lines: [] } });
      return { ok: false };
    } finally {
      busy = false;
    }
  }

  // Nothing was sent. The card says why and stays stopped until the person changes something or presses Fill again.
  async function stop(message, extra = {}) {
    submitting = false;
    await send({ type: "stopped", message, ...extra });
  }

  // After the one tap: the form must still be exactly what the person approved, nothing may be asking for a
  // verification, and the application is recorded before the site's own Submit is clicked.
  async function submit(hash) {
    if (submitting) return;
    const steps = { submit: Date.now() };
    if (!reviewed || reviewed.hash !== hash) return stop("The card you approved is not the one on this page. Nothing was sent.");
    submitting = true;
    const now = snapshot();
    const changed = C.changedFields(reviewed.fields, now);
    const nowHash = await C.approvalHash(payloadOf(now));
    if (changed.length || nowHash !== hash) return stop(`A value changed after you reviewed it (${changed.map(C.shortLabel).join("; ") || "the form"}). Nothing was sent. Press Fill this application to read the form again.`);
    if (D.fnDetectChallenge()) return stop(HANDOFF);
    const button = D.findSubmit();
    if (!button) return stop("I could not find the site's own Submit button. Nothing was sent.");
    steps.checked = Date.now();
    const masked = form.schema.filter((s) => C.isIdentityField(s)).map((s) => form.bindings[s.name]?.selector).filter(Boolean);
    const unmask = D.maskFields(masked);
    await sleep(60);
    const shot = await send({ type: "screenshot" });
    unmask();
    steps.screenshot = Date.now();
    // The last look, right before the record and the click.
    if (C.changedFields(reviewed.fields, snapshot()).length) return stop("A value changed after you reviewed it. Nothing was sent. Press Fill this application to read the form again.");
    const planned = [...filled.keys()];
    const begun = await send({ type: "begin", payload: reviewed.payload, hash, urlBefore: location.href, plannedNames: planned, screenshot: shot?.ok ? { sha256: shot.sha256, dataUrl: shot.dataUrl } : null });
    if (!begun?.ok) {
      submitting = false;
      return;
    }
    steps.begun = Date.now();
    const before = location.href;
    await send({ type: "clicked", at: Date.now(), steps });
    sent = true;
    button.click();
    // A page that answers in place (Greenhouse, Ashby) is read here; one that moves away is read by the service worker.
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      const o = D.observe(before, planned);
      if (!o.form_present_after || o.validation_errors.length || o.captcha || o.email_code_prompt) {
        await sleep(250);
        await send({ type: "outcome", observation: D.observe(before, planned) });
        submitting = false;
        return;
      }
    }
    await send({ type: "outcome", observation: D.observe(before, planned) });
    submitting = false;
  }

  chrome.runtime.onMessage.addListener((m, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (m?.type === "prepare") {
      prepare().then(reply);
      return true;
    }
    if (m?.type === "submit") {
      submit(m.hash).then(() => reply({ ok: true }));
      return true;
    }
    return false;
  });

  // Queue mode: the next posting opens, fills and shows its card by itself. In the top frame only (an embedded
  // Greenhouse form is its own frame and is filled from the panel).
  (async () => {
    const c = await send({ type: "queued" });
    if (c?.queued && !c.pending && (window === window.top || portal.embedded)) await prepare();
  })();
})();
