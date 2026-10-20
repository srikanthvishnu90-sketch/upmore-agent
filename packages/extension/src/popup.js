/* Trainee assisted-apply extension — popup.
 * Shows the current form's fill coverage from the user's answer bank, runs
 * the fill on the user's click, lists what still needs the user, and shows
 * the most recent saved application proof.
 */
const $ = (id) => document.getElementById(id);

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0];
}
function send(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (res) => resolve(chrome.runtime.lastError ? null : res));
  });
}
function renderNeeds(needs) {
  const list = $("needs-list");
  list.innerHTML = "";
  for (const n of needs || []) {
    const li = document.createElement("li");
    li.textContent = n.label + " — " + n.reason;
    list.appendChild(li);
  }
  $("needs-block").hidden = !(needs && needs.length);
}
async function renderProof() {
  const got = await chrome.storage.local.get("traineeProofs");
  const proofs = Array.isArray(got.traineeProofs) ? got.traineeProofs : [];
  if (!proofs.length) return;
  const p = proofs[proofs.length - 1];
  $("proof-line").textContent = "Application proof saved — " + (p.employer || "employer") + ", " + (p.role || "role") +
    (p.confirmationId ? ", confirmation " + p.confirmationId : "") + " (" + String(p.timestamp || "").slice(0, 10) + ").";
  $("proof-block").hidden = false;
}
(async () => {
  const tab = await activeTab();
  await renderProof();
  if (!tab || !tab.id) { $("bank-line").textContent = "No active tab."; return; }
  const res = await send(tab.id, { type: "trainee:coverage" });
  if (!res || !res.ok) {
    $("bank-line").textContent = "Open a Greenhouse application form (or the local demo form) to use assisted fill.";
    return;
  }
  const covSession = await chrome.storage.session.get("traineeCoverage");
  const persona = covSession && covSession.traineeCoverage ? covSession.traineeCoverage.bankPersona : null;
  $("bank-line").textContent = persona ? "Answer bank: " + persona : "No answer bank synced on this page — the extension fills nothing without your bank.";
  $("coverage-line").textContent = res.coverage.answerable + " of " + res.coverage.total + " fields answerable from your bank; " + res.coverage.needsUser + " need you";
  renderNeeds(res.needs);
  $("fill-btn").disabled = res.coverage.answerable === 0;
  $("fill-btn").addEventListener("click", async () => {
    $("fill-btn").disabled = true;
    const r = await send(tab.id, { type: "trainee:fill" });
    if (r && r.ok) {
      $("fill-result").textContent = "Filled " + r.filled + " fields in " + r.ms + "ms. The rest are highlighted on the page — complete them, review everything, then click Submit yourself.";
      if (r.failed && r.failed.length) $("fill-result").textContent += " Failed to fill: " + r.failed.map((f) => f.label).join(", ") + ".";
      renderNeeds(r.needsUser);
    } else {
      $("fill-result").textContent = "Fill did not run — reload the application page and try again.";
    }
    $("fill-btn").disabled = false;
  });
})();
