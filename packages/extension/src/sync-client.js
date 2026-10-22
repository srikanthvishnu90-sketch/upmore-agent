/* Trainee assisted-apply extension — saved-answers sync client.
 *
 * Runs in the popup and the background service worker (never in the
 * page). Jobs:
 *   - session: the user signs in with their Trainee account (email +
 *     password against the product's own GoTrue token endpoint; the
 *     password is never stored — the refresh token is, in
 *     chrome.storage.local, per DESIGN.md §2). Sign-out wipes the
 *     session AND the synced saved answers: another user of this
 *     browser profile never sees the previous user's answers.
 *   - sync: GET the signed-in user's saved answers from the
 *     extension-sync function and store them where the content script
 *     reads them (chrome.storage.local 'traineeBank' + a meta record).
 *     The product derives the answers; this client never derives.
 *   - report: POST an employer-confirmation proof to the same
 *     function after the USER's own submit. When a report cannot go
 *     out (signed out, offline, refused), the proof stays on this
 *     device with status 'queued_local_only' and the true reason —
 *     a rail that cannot send says so, it never pretends (repo law).
 */
const TraineeSync = (() => {
  const cfg = () => (typeof self !== "undefined" && self.TRAINEE_SYNC_CONFIG) || (typeof window !== "undefined" && window.TRAINEE_SYNC_CONFIG) || null;
  const store = () => (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) ? chrome.storage.local : null;

  async function getSession() {
    const s = store(); if (!s) return null;
    const g = await s.get("traineeSession");
    return g && g.traineeSession ? g.traineeSession : null;
  }
  async function setSession(session) {
    const s = store(); if (s) await s.set({ traineeSession: session });
  }
  async function signOut() {
    const s = store(); if (!s) return;
    await s.remove(["traineeSession", "traineeBank", "traineeBankMeta"]);
  }
  function sessionFromTokenResponse(j) {
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: Date.now() + (Number(j.expires_in || 3600) * 1000),
      userId: (j.user && j.user.id) || null,
      email: (j.user && j.user.email) || null,
    };
  }
  async function tokenRequest(grantType, body) {
    const c = cfg();
    if (!c) return { ok: false, message: "sync is not configured in this build" };
    let res;
    try {
      res = await fetch(`${c.supabaseUrl}/auth/v1/token?grant_type=${grantType}`, {
        method: "POST",
        headers: { apikey: c.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) { return { ok: false, message: "could not reach Trainee to sign in — check your connection" }; }
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || !j.access_token) {
      return { ok: false, message: (j && (j.error_description || j.msg || j.error)) || `sign-in failed (HTTP ${res.status})` };
    }
    const session = sessionFromTokenResponse(j);
    await setSession(session);
    if (grantType === "password") {
      // A fresh sign-in starts clean: any answers already on this
      // device belong to whoever was here before (or to the demo) and
      // are wiped before the new sync lands this user's own set.
      const s = store();
      if (s) await s.remove(["traineeBank", "traineeBankMeta"]);
    }
    return { ok: true, session };
  }
  async function signIn(email, password) {
    return tokenRequest("password", { email: String(email || "").trim(), password: String(password || "") });
  }
  async function refresh() {
    const sess = await getSession();
    if (!sess || !sess.refreshToken) return { ok: false, message: "no saved session to refresh" };
    return tokenRequest("refresh_token", { refresh_token: sess.refreshToken });
  }
  async function accessToken() {
    const sess = await getSession();
    if (!sess) return null;
    if (sess.accessToken && sess.expiresAt && sess.expiresAt - Date.now() > 60000) return sess.accessToken;
    const r = await refresh();
    return r.ok ? r.session.accessToken : null;
  }
  async function authedFetch(path, init) {
    const c = cfg();
    if (!c) return { status: 0, json: null };
    const attempt = async (token) => {
      const res = await fetch(`${c.supabaseUrl}${path}`, {
        ...(init || {}),
        headers: { apikey: c.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...((init && init.headers) || {}) },
      });
      const json = await res.json().catch(() => null);
      return { status: res.status, json };
    };
    let token = await accessToken();
    if (!token) return { status: 401, json: { code: "UNAUTHENTICATED" } };
    let r = await attempt(token);
    if (r.status === 401) {
      const ref = await refresh();
      if (ref.ok) r = await attempt(ref.session.accessToken);
    }
    return r;
  }

  async function syncSavedAnswers() {
    const c = cfg();
    if (!c) return { ok: false, code: "NOT_CONFIGURED", message: "sync is not configured in this build" };
    const sess = await getSession();
    if (!sess) return { ok: false, code: "NOT_SIGNED_IN", message: "sign in to sync your saved answers" };
    let r;
    try { r = await authedFetch(`/functions/v1/${c.functionName}/saved-answers`, { method: "GET" }); }
    catch (e) { return { ok: false, code: "NETWORK", message: "could not reach Trainee to sync — your last synced answers are still on this device" }; }
    if (r.status === 200 && r.json && r.json.savedAnswers) {
      const s = store();
      if (s) {
        await s.set({
          traineeBank: r.json.savedAnswers,
          traineeBankMeta: { source: "saved-answers", syncedAt: new Date().toISOString(), userId: r.json.user ? r.json.user.id : sess.userId, savedAnswersVersion: r.json.savedAnswers.savedAnswersVersion || null },
        });
      }
      return { ok: true, savedAnswers: r.json.savedAnswers };
    }
    if (r.status === 404) return { ok: false, code: "PROFILE_NOT_FOUND", message: (r.json && r.json.message) || "no saved answers yet" };
    if (r.status === 401) return { ok: false, code: "UNAUTHENTICATED", message: "your sign-in expired — sign in again" };
    return { ok: false, code: "SYNC_FAILED", message: (r.json && r.json.message) || `sync failed (HTTP ${r.status})` };
  }

  // The report contract (DESIGN.md §4, now wired): the proof record
  // the content script captured, shaped for the product. The product
  // re-parses the confirmation from the carried excerpt — this client
  // claims nothing the excerpt does not show.
  function proofToReportBody(proof) {
    const p = proof || {};
    return {
      employer: p.employer || null,
      role: p.role || null,
      posting: { url: p.url || null },
      confirmation: {
        confirmationId: p.confirmationId || null,
        confirmationText: p.confirmationText || "",
        successText: p.successText === true,
        formStillOpen: p.formStillOpen === true,
      },
      answersSubmitted: p.answersSubmitted || null,
      observedAt: p.timestamp || null,
    };
  }
  function proofKey(proof) {
    const p = proof || {};
    return p.confirmationId || `${p.employer || "?"}|${p.url || "?"}|${p.timestamp || "?"}`;
  }
  async function reportProof(proof) {
    const c = cfg();
    if (!c) return { ok: false, status: "queued_local_only", reason: "sync is not configured in this build" };
    const sess = await getSession();
    if (!sess) return { ok: false, status: "queued_local_only", reason: "not signed in — the report sends when you sign in" };
    let r;
    try { r = await authedFetch(`/functions/v1/${c.functionName}/application-proofs`, { method: "POST", body: JSON.stringify(proofToReportBody(proof)) }); }
    catch (e) { return { ok: false, status: "queued_local_only", reason: "could not reach Trainee — the report stays on this device and retries when you sign in or sync" }; }
    if (r.status === 200 && r.json && r.json.receipt) {
      return { ok: true, status: "reported", receipt: r.json.receipt, duplicate: !!r.json.duplicate };
    }
    const reason = (r.json && r.json.code) ? `${r.json.code}: ${r.json.message || ""}`.trim() : `the product refused the report (HTTP ${r.status})`;
    return { ok: false, status: "queued_local_only", reason };
  }

  return { getSession, signIn, signOut, refresh, accessToken, syncSavedAnswers, reportProof, proofToReportBody, proofKey };
})();
if (typeof module !== "undefined" && module.exports) module.exports = TraineeSync;
if (typeof self !== "undefined") self.TRAINEE_SYNC = TraineeSync;
if (typeof window !== "undefined") window.TRAINEE_SYNC = TraineeSync;
