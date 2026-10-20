/* Trainee assisted-apply extension — background service worker (SPIKE stub).
 *
 * Jobs:
 *   1. Receive proof records from the content script, screenshot the tab the
 *      proof was captured on (v2 per-application proof: screenshot + captured
 *      answers + parsed employer confirmation), and file them locally.
 *   2. The proof-REPORT call back to Trainee is a stub in the spike: the
 *      record lands in chrome.storage.local 'traineeProofOutbox' with status
 *      'queued_local_only' and the endpoint named NOT_WIRED. Nothing is sent
 *      anywhere by this build — a rail that is not live says so, it never
 *      pretends (repo law). DESIGN.md specifies the real report contract.
 */
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "trainee:proof" || !msg.proof) return;
  (async () => {
    const proof = msg.proof;
    let screenshot = null;
    try {
      if (sender && sender.tab && typeof sender.tab.windowId === "number") {
        screenshot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
      }
    } catch (e) { screenshot = null; /* tab gone or not capturable — the text proof still stands */ }
    const got = await chrome.storage.local.get(["traineeProofs", "traineeProofOutbox"]);
    const proofs = Array.isArray(got.traineeProofs) ? got.traineeProofs : [];
    const idx = proofs.findIndex((p) => p.confirmationId && p.confirmationId === proof.confirmationId);
    if (idx >= 0 && screenshot) { proofs[idx].screenshot = screenshot; await chrome.storage.local.set({ traineeProofs: proofs }); }
    const outbox = Array.isArray(got.traineeProofOutbox) ? got.traineeProofOutbox : [];
    outbox.push({
      confirmationId: proof.confirmationId || null,
      employer: proof.employer || null,
      at: new Date().toISOString(),
      status: "queued_local_only",
      endpoint: "NOT_WIRED — spike build reports nowhere; see DESIGN.md for the report contract",
      screenshotCaptured: !!screenshot,
    });
    await chrome.storage.local.set({ traineeProofOutbox: outbox });
    try { await chrome.action.setBadgeText({ text: "✓" }); } catch (e) { /* badge is cosmetic */ }
  })();
});
