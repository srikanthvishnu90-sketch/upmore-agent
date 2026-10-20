// WO-031: the extension on an application page (Greenhouse, Lever, Ashby; Workday basic fields only). It reads every
// field the way the engine does, runs the apply stack's planner over the person's confirmed facts and saved answers, fills
// only what the planner answered, and shows the person a card with every answer exactly as it will be sent. The site's
// own Submit is clicked only after the person's one tap approved that card, and only if the form still matches it, checked
// in the same task as the click.
(() => {
  if (globalThis.__traineeContent) return;
  globalThis.__traineeContent = true;
  const C = globalThis.TraineeCore, D = C.dom;
  const portal = C.detectPortal(location.href);
  if (!portal) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const send = (m) => chrome.runtime.sendMessage(m).catch(() => ({ ok: false }));
  const HANDOFF = "A verification check is showing on the page. Finish it yourself there, then press Approve again. Trainee never answers one.";
  const NO_UNCHECKED = "No (left unchecked)";

  let form = null, ctx = null, plan = null, jobId = null, company = "", expiresAt = null, shownAt = 0;
  let reviewed = null, busy = false, submitting = false, sent = false, personAbort = false, refreshTimer = null;
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

  // The person's own edits: a trusted input or change on a field (Trainee's own fills dispatch untrusted events). A radio
  // or checkbox Trainee clicks gets a trusted change from the browser itself, so nothing that happens while Trainee is
  // filling (busy) counts as the person's: no refresh can send a half-filled card. A value the person changes meanwhile
  // still differs from what Trainee filled, and the card blocks it as the page's. While an approved application is being
  // checked and recorded, the person's edit stops it: what they approved is no longer what is on the page (WO-031
  // review). After the click nothing on the page changes the application.
  const personEdit = (name) => {
    if (busy) return;
    if (sent) return;
    if (submitting) {
      personAbort = true;
      return;
    }
    edited.add(name);
    scheduleRefresh();
  };
  for (const t of ["input", "change"]) {
    document.addEventListener(t, (e) => {
      if (!e.isTrusted || !form) return;
      const n = D.fieldNameFor(e.target, form);
      if (n) personEdit(n);
    }, true);
  }
  // A choice picked in a widget menu (no input event on the field itself): the focused field's.
  document.addEventListener("mousedown", (e) => {
    if (!e.isTrusted || !form) return;
    const n = document.activeElement && D.fieldNameFor(document.activeElement, form);
    if (n && form.bindings[n]?.widget) personEdit(n);
  }, true);

  const scheduleRefresh = () => {
    if (!reviewed && !plan) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => (busy ? undefined : refresh().catch(() => {})), 350);
  };

  // Every non-empty answer on the form now, with where it came from and what the browser sends for it (apply_core.ts).
  function snapshot() {
    form = D.readForm();
    const out = [];
    for (const s of form.schema) {
      const b = form.bindings[s.name];
      let v = D.readValue(b);
      if (!v && filled.get(s.name) === NO_UNCHECKED && b.inputType === "checkbox") v = NO_UNCHECKED;
      if (!v) continue;
      const identity = C.isIdentityField(s);
      const source = !identity && filled.has(s.name) && filled.get(s.name) === v ? "trainee" : edited.has(s.name) ? "you" : "page";
      // The employer's own option text a widget fill clicked ("United States +1"), while the widget still shows it (WO-042).
      if (source === "trainee" && chosen.has(s.name)) v = chosen.get(s.name);
      out.push({ name: s.name, label: s.label, value: v, source, factId: source === "trainee" ? factIds.get(s.name) ?? null : null,
        masked: identity || (source !== "trainee" && C.looksLikeIdNumber(v)), detail: D.readDetail(b), selector: b.selector });
    }
    // Read-only fields the page set are sent too: shown and bound to the approval (WO-031 review).
    for (const f of D.readFixed()) {
      out.push({ name: "fixed:" + f.name, label: f.label, value: f.value, source: "fixed", factId: null,
        masked: C.isIdentityField(f) || C.looksLikeIdNumber(f.value), detail: "", selector: f.selector });
    }
    return out;
  }
  const maskSelectors = (fields) => [
    ...fields.filter((f) => f.masked).map((f) => f.selector),
    ...form.schema.filter((s) => C.isIdentityField(s)).map((s) => form.bindings[s.name]?.selector),
  ].filter(Boolean);
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
    await D.hashFiles();
    const fields = snapshot();
    const payload = payloadOf(fields);
    const hash = await C.approvalHash(payload);
    const ambiguous = plan?.ambiguous || [];
    const ambiguousNames = new Set(ambiguous.map((a) => a.name));
    const open = openRequired(fields);
    const block = C.blockers({ fields, openRequired: open, challenge: !!D.fnDetectChallenge(), family: portal.family });
    if (!ctx.account) block.push("Your Upmore account has no job settings yet. Text Trainee once so it can record your applications.");
    else if (ctx.account.paused) block.push("Your account is paused, so nothing is sent.");
    const verification = [...new Set((D.fnCaptchaTech() || []).map((t) => t.replace(/-widget$/, "")))];
    const lines = C.cardLines({ company, family: portal.family, payload, openRequired: open.filter((l) => !ambiguous.some((a) => C.shortLabel(a.label) === l)),
      identity: plan?.identity || [], blockers: block, verification, ambiguous: ambiguous.filter((a) => ambiguousNames.has(a.name)) });
    reviewed = { fields, payload, hash, text: C.payloadText(payload) };
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
        // A dropdown widget or a place search: its options are read when its list opens, and the planner chooses among
        // them, with the whole form beside it (an education end date is one only beside its school).
        const s = form.schema.find((x) => x.name === p.name);
        const listed = b.widget || D.isPlaceSearch(D.element(b.selector));
        const choose = listed && s ? (labels) => C.chooseWidgetOption({ userId: ctx.userId, jobId, company, family: portal.family, field: s, form: form.schema, labels, answers: ctx.answers, saved: ctx.saved, now: Date.now() }) : undefined;
        const ok = await D.fill(b, p.value, resume, choose);
        await sleep(20);
        let v = D.readValue(b);
        if (ok && !v && b.inputType === "checkbox" && !/^(true|yes|y|on|checked)\b/i.test(String(p.value))) v = NO_UNCHECKED;
        const label = D.takeWidgetChoice();
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
    personAbort = false;
    await send({ type: "stopped", message, ...extra });
  }
  const changedMsg = (changed) =>
    `A value changed after you reviewed it (${changed.map(C.shortLabel).join("; ") || "the form"}). Nothing was sent. Press Fill this application to read the form again.`;
  const ABORTED = "You changed the form after approving, so it was not sent. Press Fill this application to read it again.";

  // Is the page still exactly the approved application? Every answer, its source, what the browser sends for it (option
  // values, checked states, the attached file's bytes), compared as the whole payload. No await: usable next to the click.
  function stillApproved() {
    const now = snapshot();
    const changed = C.changedFields(reviewed.fields, now);
    return { now, changed, ok: !changed.length && C.payloadText(payloadOf(now)) === reviewed.text };
  }

  // After the one tap: the form must still be exactly what the person approved, nothing may be asking for a verification,
  // there must be a picture of it, and the application is recorded before the site's own Submit is clicked.
  async function submit(hash) {
    if (submitting || sent) return;
    // WO-042: when each step after the tap happened, for the benchmark (never part of the payload or its hash).
    const steps = { submit: Date.now() };
    if (!reviewed || reviewed.hash !== hash) return stop("The card you approved is not the one on this page. Nothing was sent.");
    submitting = true;
    personAbort = false;
    await D.hashFiles();
    let s = stillApproved();
    if (personAbort) return stop(ABORTED);
    if (!s.ok) return stop(changedMsg(s.changed));
    if (D.fnDetectChallenge()) return stop(HANDOFF);
    const button = D.findSubmit();
    if (!button) return stop("I could not find the site's own Submit button. Nothing was sent.");
    steps.checked = Date.now();
    // Proof before the click: the filled form, identity numbers covered while the picture is taken.
    const unmask = D.maskFields(maskSelectors(s.now));
    await sleep(60);
    const shot = await send({ type: "screenshot" });
    unmask();
    if (!shot?.ok) return stop("The picture of the filled form could not be taken (keep this tab in front while it sends). Nothing was sent.");
    await D.hashFiles();
    s = stillApproved();
    if (personAbort) return stop(ABORTED);
    if (!s.ok) return stop(changedMsg(s.changed));
    steps.screenshot = Date.now();
    const planned = [...filled.keys()];
    const begun = await send({ type: "begin", payload: reviewed.payload, hash, urlBefore: location.href, plannedNames: planned, screenshot: { sha256: shot.sha256, dataUrl: shot.dataUrl } });
    if (!begun?.ok) {
      submitting = false;
      return;
    }
    // The last look and the click, in one task: no page script and no person can act between them (WO-031 review).
    const last = stillApproved();
    const challenge = !!D.fnDetectChallenge();
    if (personAbort || !last.ok || challenge || !button.isConnected) {
      const why = personAbort ? ABORTED : challenge ? HANDOFF : last.ok ? "The page's Submit button changed. Nothing was sent." : changedMsg(last.changed);
      return stop(why, { finishPending: true, reason: C.BEFORE_CLICK, beforeClick: true });
    }
    const errorsBefore = D.visibleErrors(), before = location.href;
    steps.begun = Date.now();
    sent = true;
    button.click();
    send({ type: "clicked", at: Date.now(), errorsBefore, steps });
    // A page that answers in place (Greenhouse, Ashby) is read here; one that moves away is read by the service worker.
    // The wait ends only when the form is gone, a new error appears, or the page asks for something; otherwise after 30
    // seconds the outcome is unknown, counted as applied, never resent.
    const deadline = Date.now() + C.NO_ANSWER_WAIT_MS;
    let timedOut = true;
    while (Date.now() < deadline) {
      await sleep(250);
      const o = D.observe(before, planned);
      const fresh = o.validation_errors.filter((e) => !errorsBefore.includes(e));
      if (!o.form_present_after || fresh.length || o.captcha || o.email_code_prompt) {
        timedOut = false;
        await sleep(300);
        break;
      }
    }
    const obs = D.observe(before, planned);
    // Proof after the click: what the employer answered (or the form with its errors), identity fields covered.
    const unmaskAfter = D.maskFields(maskSelectors(last.now));
    await sleep(60);
    const after = await send({ type: "screenshot" });
    unmaskAfter();
    await send({ type: "outcome", observation: obs, errorsBefore, timedOut, shotAfter: after?.ok ? { sha256: after.sha256, dataUrl: after.dataUrl } : null });
    submitting = false;
  }

  chrome.runtime.onMessage.addListener((m, sender, reply) => {
    if (sender.id !== chrome.runtime.id || sender.tab) return false;
    if (m?.type === "prepare") {
      prepare().then(reply);
      return true;
    }
    if (m?.type === "submit") {
      // Answered at once: the submit may move the page away, which would close a reply still waiting (WO-031 review).
      reply({ accepted: true });
      submit(m.hash);
      return false;
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
