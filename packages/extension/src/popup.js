/* Trainee assisted-apply extension — popup.
 * Shows the sign-in state, syncs the user's saved answers on open,
 * shows the current form's fill coverage from those answers (or, on
 * the local demo only, from the LABELED demo fixture), runs the fill
 * on the user's click, lists what still needs the user, and shows the
 * most recent application proof + whether Trainee has recorded it.
 */
const $ = (id) => document.getElementById(id);
const S = () => (typeof window !== "undefined" && window.TRAINEE_SYNC) ? window.TRAINEE_SYNC : null;

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0];
}
function send(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (res) => resolve(chrome.runtime.lastError ? null : res));
  });
}
function runtimeMsg(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => resolve(chrome.runtime.lastError ? null : res));
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
  const got = await chrome.storage.local.get(["traineeProofs", "traineeProofReports"]);
  const proofs = Array.isArray(got.traineeProofs) ? got.traineeProofs : [];
  if (!proofs.length) return;
  const p = proofs[proofs.length - 1];
  $("proof-line").textContent = "Application proof saved — " + (p.employer || "employer") + ", " + (p.role || "role") +
    (p.confirmationId ? ", confirmation " + p.confirmationId : "") + " (" + String(p.timestamp || "").slice(0, 10) + ").";
  const sync = S();
  const key = sync && typeof sync.proofKey === "function" ? sync.proofKey(p) : p.confirmationId;
  const reports = (got.traineeProofReports && typeof got.traineeProofReports === "object") ? got.traineeProofReports : {};
  const rep = key ? reports[key] : null;
  if (rep && rep.status === "reported") {
    $("proof-report-line").textContent = "Recorded in your Trainee tracker — receipt " + String(rep.receiptId || "").slice(0, 8) + "…";
  } else if (rep && rep.status === "queued_local_only") {
    $("proof-report-line").textContent = "Saved on this device only (" + (rep.reason || "not reported yet") + "). It sends when you sign in and sync.";
  } else {
    $("proof-report-line").textContent = "Saved on this device — the report to Trainee is attempted when the proof is captured and when you sign in.";
  }
  $("proof-block").hidden = false;
}

async function renderAccount() {
  const sync = S();
  const sess = sync ? await sync.getSession() : null;
  const meta = await chrome.storage.local.get("traineeBankMeta");
  const m = meta && meta.traineeBankMeta ? meta.traineeBankMeta : null;
  if (sess) {
    $("signin-block").hidden = true;
    $("signedin-block").hidden = false;
    $("account-line").textContent = "Signed in as " + (sess.email || "your Trainee account") + ".";
    $("sync-line").textContent = m && m.syncedAt
      ? "Saved answers synced " + String(m.syncedAt).slice(0, 16).replace("T", " ") + " — fills use your answers."
      : "Not synced yet — syncing…";
  } else {
    $("signin-block").hidden = false;
    $("signedin-block").hidden = true;
  }
  return sess;
}

async function renderCoverage() {
  const tab = await activeTab();
  if (!tab || !tab.id) { $("bank-line").textContent = "No active tab."; return; }
  const res = await send(tab.id, { type: "trainee:coverage" });
  if (!res || !res.ok) {
    $("bank-line").textContent = "Open a Greenhouse application form (or the local demo form) to use assisted fill.";
    return;
  }
  const covSession = await chrome.storage.session.get("traineeCoverage");
  const cov = covSession && covSession.traineeCoverage ? covSession.traineeCoverage : null;
  const persona = cov ? cov.bankPersona : null;
  const source = cov ? cov.bankSource : null;
  if (source === "demo-fixture") {
    $("bank-line").textContent = "DEMO saved answers — the test persona (" + (persona || "Alex Testcase (TEST)") + "), on the local demo only. Sign in to fill with your own answers.";
  } else if (persona) {
    $("bank-line").textContent = "Saved answers: " + persona + " — yours, synced from Trainee.";
  } else {
    $("bank-line").textContent = "No saved answers synced on this page — sign in above, or Trainee fills nothing.";
  }
  $("coverage-line").textContent = res.coverage.answerable + " of " + res.coverage.total + " fields answerable from your saved answers; " + res.coverage.needsUser + " need you";
  renderNeeds(res.needs);
  $("fill-btn").disabled = res.coverage.answerable === 0;
}

(async () => {
  const sync = S();
  $("signin-btn").addEventListener("click", async () => {
    if (!sync) { $("signin-status").textContent = "Sync is unavailable in this build."; return; }
    $("signin-btn").disabled = true;
    $("signin-status").textContent = "Signing in…";
    const r = await sync.signIn($("signin-email").value, $("signin-password").value);
    if (!r.ok) {
      $("signin-status").textContent = r.message || "Sign-in failed.";
      $("signin-btn").disabled = false;
      return;
    }
    $("signin-password").value = "";
    $("signin-status").textContent = "";
    await renderAccount();
    const s = await sync.syncSavedAnswers();
    $("sync-line").textContent = s.ok ? "Saved answers synced just now — fills use your answers." : (s.message || "Sync did not complete.");
    await runtimeMsg({ type: "trainee:flush-reports" });
    await renderProof();
    await renderCoverage();
    $("signin-btn").disabled = false;
  });
  $("signout-btn").addEventListener("click", async () => {
    if (sync) await sync.signOut();
    await renderAccount();
    await renderCoverage();
  });
  $("fill-btn").addEventListener("click", async () => {
    const tab = await activeTab();
    if (!tab || !tab.id) return;
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

  const sess = await renderAccount();
  if (sess && sync) {
    const s = await sync.syncSavedAnswers();
    if (s.ok) $("sync-line").textContent = "Saved answers synced just now — fills use your answers.";
    else if (s.code !== "PROFILE_NOT_FOUND") $("sync-line").textContent = s.message || "Sync did not complete — your last synced answers are still on this device.";
    else $("sync-line").textContent = s.message;
  }
  await renderProof();
  await renderCoverage();
})();
