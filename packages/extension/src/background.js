/* Trainee assisted-apply extension — background service worker.
 *
 * Jobs:
 *   1. Receive proof records from the content script, screenshot the tab
 *      the proof was captured on (v2 per-application proof: screenshot +
 *      captured answers + parsed employer confirmation), and file them
 *      locally.
 *   2. REPORT the proof back to Trainee (SAVED-ANSWERS SYNC lane,
 *      2026-10-20 — this replaces the spike's NOT_WIRED stub): the
 *      report goes to the extension-sync function's application-proofs
 *      endpoint under the signed-in user's own session, and the
 *      product records it as an employer-record tracker entry. When a
 *      report cannot go out (signed out, offline, refused), the proof
 *      stays in the outbox with status 'queued_local_only' and the
 *      true reason, and is retried on sign-in / sync (the popup's
 *      flush). A rail that cannot send says so — it never pretends.
 *
 * Storage access: chrome.storage.session is trusted-contexts-only by
 * default in MV3, which silently blocks the content script's coverage
 * and fill-snapshot writes (found by the trunk install proof in real
 * Chromium, 2026-10-20 — the jsdom fixture check never exercised this
 * path). The call below, made from this trusted context, widens
 * session storage to the content script so the flow the popup drives
 * can actually run.
 */
try { importScripts("config.js", "sync-client.js"); } catch (e) { /* sync client unavailable: reports honestly stay queued_local_only */ }
try {
  const p = chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });
  if (p && typeof p.catch === "function") p.catch(() => { /* session stays trusted-only */ });
} catch (e) { /* older Chrome without setAccessLevel: session stays trusted-only */ }

const sync = () => (typeof self !== "undefined" && self.TRAINEE_SYNC) ? self.TRAINEE_SYNC : null;
function proofKeyOf(proof) {
  const s = sync();
  if (s && typeof s.proofKey === "function") return s.proofKey(proof);
  return (proof && proof.confirmationId) || `${(proof && proof.employer) || "?"}|${(proof && proof.url) || "?"}|${(proof && proof.timestamp) || "?"}`;
}

async function attemptReport(proof) {
  const s = sync();
  const key = proofKeyOf(proof);
  let outcome;
  if (!s) {
    outcome = { ok: false, status: "queued_local_only", reason: "the sync client is unavailable in this build" };
  } else {
    try { outcome = await s.reportProof(proof); }
    catch (e) { outcome = { ok: false, status: "queued_local_only", reason: "the report attempt failed before it was sent" }; }
  }
  const got = await chrome.storage.local.get(["traineeProofReports", "traineeProofOutbox"]);
  const reports = (got.traineeProofReports && typeof got.traineeProofReports === "object") ? got.traineeProofReports : {};
  reports[key] = outcome.ok
    ? { status: "reported", receiptId: outcome.receipt ? outcome.receipt.id : null, duplicate: !!outcome.duplicate, at: new Date().toISOString() }
    : { status: "queued_local_only", reason: outcome.reason || "not reported", at: new Date().toISOString() };
  const outbox = Array.isArray(got.traineeProofOutbox) ? got.traineeProofOutbox : [];
  outbox.push({
    key,
    confirmationId: proof.confirmationId || null,
    employer: proof.employer || null,
    at: new Date().toISOString(),
    status: reports[key].status,
    ...(reports[key].status === "reported"
      ? { receiptId: reports[key].receiptId, endpoint: "extension-sync/application-proofs" }
      : { reason: reports[key].reason, endpoint: "extension-sync/application-proofs" }),
  });
  await chrome.storage.local.set({ traineeProofReports: reports, traineeProofOutbox: outbox });
  return reports[key];
}

async function flushReports() {
  const got = await chrome.storage.local.get(["traineeProofs", "traineeProofReports"]);
  const proofs = Array.isArray(got.traineeProofs) ? got.traineeProofs : [];
  const reports = (got.traineeProofReports && typeof got.traineeProofReports === "object") ? got.traineeProofReports : {};
  let attempted = 0, reported = 0;
  for (const proof of proofs) {
    const key = proofKeyOf(proof);
    if (reports[key] && reports[key].status === "reported") continue;
    attempted++;
    const r = await attemptReport(proof);
    if (r.status === "reported") reported++;
  }
  return { attempted, reported };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "trainee:flush-reports") {
    flushReports().then((r) => sendResponse({ ok: true, ...r })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type !== "trainee:proof" || !msg.proof) return;
  (async () => {
    const proof = msg.proof;
    let screenshot = null;
    try {
      if (sender && sender.tab && typeof sender.tab.windowId === "number") {
        screenshot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
      }
    } catch (e) { screenshot = null; /* tab gone or not capturable — the text proof still stands */ }
    const got = await chrome.storage.local.get(["traineeProofs"]);
    const proofs = Array.isArray(got.traineeProofs) ? got.traineeProofs : [];
    const idx = proofs.findIndex((p) => p.confirmationId && p.confirmationId === proof.confirmationId);
    if (idx >= 0 && screenshot) { proofs[idx].screenshot = screenshot; await chrome.storage.local.set({ traineeProofs: proofs }); }
    await attemptReport(proof);
    try { await chrome.action.setBadgeText({ text: "✓" }); } catch (e) { /* badge is cosmetic */ }
  })();
});
