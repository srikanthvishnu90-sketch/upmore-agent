/* Trainee assisted-apply extension — content script (Greenhouse + local demo).
 *
 * Lifecycle:
 *   1. On load: discover the form, plan against the synced answer bank, and
 *      store the coverage report for the popup. NOTHING is filled on load —
 *      filling is the user's act (popup button), because the user reviews
 *      what the extension is about to put in front of them.
 *   2. On the popup's Fill command: apply the plan, highlight every
 *      needs-user field (class trainee-needs-user), and remember the filled
 *      answers as the proof snapshot-in-waiting. The user completes the
 *      highlighted fields and clicks Submit THEMSELVES — this script has no
 *      code path that clicks a submit control, solves a captcha, or checks
 *      an attestation box (§6.3).
 *   3. On any page: if the page is a post-submit confirmation (module 150's
 *      extractConfirmation rules, ported in fill-engine.js), capture the
 *      proof record and hand it to the background worker, which screenshots
 *      the tab and files the report.
 *
 * SAVED-ANSWERS SOURCE (sync lane, 2026-10-20): the answers come from
 * chrome.storage.local 'traineeBank', whose writer decides its kind:
 * the sync client stores the signed-in user's own saved answers there
 * (source "saved-answers", served by the product's extension-sync
 * function from their confirmed profile); the local demo may seed the
 * committed fixture (fixtures/answer-bank.alex-testcase.json — the
 * Alex Testcase TEST persona, source "demo-fixture", LABELED demo
 * everywhere it surfaces). The choice between them is
 * TraineeBankSource.resolveBankSource (src/bank-source.js) and its
 * hard rule: signed in -> NEVER the fixture. On real Greenhouse hosts
 * with no synced answers, the popup says so — the extension never
 * fabricates a set.
 */
(() => {
  const E = window.TraineeFillEngine;
  if (!E) return;
  const isDemo = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  const store = (typeof chrome !== "undefined" && chrome.storage) ? chrome.storage : null;
  let bankSource = null;

  async function loadBank() {
    if (!store) return null;
    const got = await store.local.get(["traineeBank", "traineeSession"]);
    const stored = got && got.traineeBank ? got.traineeBank : null;
    const S = window.TraineeBankSource;
    const decision = S
      ? S.resolveBankSource({ hasSession: !!(got && got.traineeSession), storedBank: stored, isDemoHost: isDemo })
      : { action: stored ? "use-stored" : "none", source: stored ? "stored" : null };
    if (decision.action === "use-stored") { bankSource = decision.source; return stored; }
    if (decision.action === "seed-fixture") {
      try {
        const res = await fetch(chrome.runtime.getURL("fixtures/answer-bank.alex-testcase.json"));
        const bank = await res.json();
        bank.source = "demo-fixture"; // the storage copy is labeled; the committed fixture file is never edited
        await store.local.set({ traineeBank: bank });
        bankSource = "demo-fixture";
        return bank;
      } catch (e) { bankSource = null; return null; }
    }
    bankSource = null;
    return null;
  }

  let lastPlan = null;
  let lastCoverage = null;

  async function analyze() {
    const bank = await loadBank();
    const entries = E.discoverFields(document);
    lastPlan = bank ? E.planFill(entries, bank) : entries.map((e) => Object.assign({}, e, { status: "needs_user", reasonCode: "no_bank", reason: "no saved answers synced yet" }));
    lastCoverage = E.coverageOf(lastPlan);
    if (store) await store.session.set({ traineeCoverage: { url: location.href, at: new Date().toISOString(), bankPersona: bank ? bank.persona : null, bankSource, coverage: { total: lastCoverage.total, answerable: lastCoverage.answerable, needsUser: lastCoverage.needsUser }, needs: lastCoverage.needs } });
    return lastCoverage;
  }

  function highlightNeedsUser(plan) {
    for (const p of plan || []) {
      if (p.status === "fill") continue;
      for (const c of p.controls || []) {
        const host = c.closest(".field") || c;
        host.classList.add("trainee-needs-user");
      }
    }
  }

  async function doFill() {
    if (!lastPlan) await analyze();
    const result = E.applyPlan(lastPlan);
    highlightNeedsUser(lastPlan);
    const snapshot = {};
    for (const f of result.filled) snapshot[f.label] = f.value;
    if (store) await store.session.set({ traineeFillSnapshot: { url: location.href, at: new Date().toISOString(), answers: snapshot, failed: result.failed } });
    return result;
  }

  async function maybeProof() {
    if (!store) return;
    const snap = await store.session.get("traineeFillSnapshot");
    const snapshot = snap && snap.traineeFillSnapshot ? snap.traineeFillSnapshot.answers : null;
    const proof = E.detectProof(document, location.href, snapshot);
    if (!proof) return;
    const got = await store.local.get("traineeProofs");
    const proofs = got && Array.isArray(got.traineeProofs) ? got.traineeProofs : [];
    if (proofs.some((p) => p.confirmationId && p.confirmationId === proof.confirmationId)) return; // captured once
    proofs.push(proof);
    await store.local.set({ traineeProofs: proofs });
    if (typeof chrome !== "undefined" && chrome.runtime) chrome.runtime.sendMessage({ type: "trainee:proof", proof });
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || typeof msg.type !== "string") return;
      if (msg.type === "trainee:coverage") {
        analyze().then((cov) => sendResponse({ ok: true, coverage: { total: cov.total, answerable: cov.answerable, needsUser: cov.needsUser }, needs: cov.needs }));
        return true;
      }
      if (msg.type === "trainee:fill") {
        doFill().then((r) => sendResponse({ ok: true, filled: r.filled.length, failed: r.failed, ms: r.ms, needsUser: r.needsUser }));
        return true;
      }
    });
  }

  analyze().then(() => maybeProof()).catch(() => { /* a hostile page shape must never break the host page */ });
})();
