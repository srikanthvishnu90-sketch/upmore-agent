// WO-031: the extension's service worker. It holds the person's session (chrome.storage.session only: no password, ever),
// reads their facts and saved answers through their own RPCs, keeps one review card per tab, and sends the content script
// the submit only after the person's one tap approved that card's exact payload hash. It records every application
// through the person's own RPCs (career_apply_extension_begin_own before the click, career_apply_finish_own after) and
// keeps the evidence locally. It never solves a verification and never sends anything the person did not approve.
importScripts("config.js", "lib/trainee-core.js");
const C = globalThis.TraineeCore;

const S = chrome.storage.session, L = chrome.storage.local;
const get = async (area, key, dflt) => (await area.get(key))[key] ?? dflt;
const put = (area, key, value) => area.set({ [key]: value });
const sha256Hex = async (bytes) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((n) => n.toString(16).padStart(2, "0")).join("");
const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const say = {
  signedOut: "Sign in to Upmore in the Trainee panel first. Nothing was filled.",
  handoff: "A verification check is showing on the page. Finish it yourself there, then press Approve again. Trainee never answers one.",
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
});

// Where the session goes is fixed by config.js, never by storage: a content script can write chrome.storage.local, and a
// value written there must never send the person's token to another server (WO-031 review).
async function config() {
  return { ...globalThis.TRAINEE_DEFAULTS };
}

// ------------------------------------------------------------------------------------------------ the person's session
// Only the session the person already has in the Upmore app (their own sign-in: password, Google or a magic link, done
// in the app) or a fresh one from a magic link they open themselves. Kept in chrome.storage.session, which Chrome keeps
// in memory and clears when the browser closes. A service key is refused: this computer runs only its person's own work.
function claims(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
  } catch {
    return {};
  }
}
async function keepSession(s) {
  if (!s || typeof s.access_token !== "string" || typeof s.refresh_token !== "string" || !s.refresh_token) throw Error("NOT_A_SESSION");
  if (C.jwtRole(s.access_token) !== "authenticated") throw Error("SERVICE_KEY_REFUSED");
  const c = claims(s.access_token);
  if (!c.sub) throw Error("NOT_A_SESSION");
  await put(S, "auth", { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Number(s.expires_at) || c.exp || 0, user_id: c.sub, email: c.email || s.user?.email || "" });
}
async function session() {
  const a = await get(S, "auth", null);
  if (!a) return null;
  if (a.expires_at && a.expires_at * 1000 - Date.now() < 60_000) {
    const cfg = await config();
    const r = await fetch(cfg.supabaseUrl + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST", headers: { apikey: cfg.anonKey, "content-type": "application/json" }, body: JSON.stringify({ refresh_token: a.refresh_token }),
    }).catch(() => null);
    if (!r || !r.ok) {
      await S.remove("auth");
      return null;
    }
    await keepSession(await r.json());
    return await get(S, "auth", null);
  }
  return a;
}
async function signInFromApp() {
  const cfg = await config();
  const origin = new URL(cfg.appUrl).origin;
  const tabs = (await chrome.tabs.query({})).filter((t) => t.url && t.url.startsWith(origin + "/"));
  if (!tabs.length) return { ok: false, message: `Open ${origin} in a tab, sign in there as you always do, then press this again.` };
  for (const t of tabs) {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: t.id },
      func: () => {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (/^sb-[a-z0-9]+-auth-token$/.test(k)) return localStorage.getItem(k);
        }
        return null;
      },
    }).catch(() => [null]);
    if (!res?.result) continue;
    try {
      const j = JSON.parse(res.result);
      await keepSession(j.currentSession ?? j);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message === "SERVICE_KEY_REFUSED" ? "That is not a person's sign-in; Trainee only runs as you." : "The Upmore tab is not signed in yet." };
    }
  }
  return { ok: false, message: "The Upmore tab is not signed in yet. Sign in there, then press this again." };
}
async function magicLink(email) {
  const cfg = await config();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""))) return { ok: false, message: "That does not look like an email address." };
  const r = await fetch(cfg.supabaseUrl + "/auth/v1/otp?redirect_to=" + encodeURIComponent(cfg.appUrl), {
    method: "POST", headers: { apikey: cfg.anonKey, "content-type": "application/json" }, body: JSON.stringify({ email, create_user: false }),
  }).catch(() => null);
  if (!r || !r.ok) return { ok: false, message: "The sign-in link could not be sent. Try again, or sign in on the Upmore app." };
  return { ok: true, message: "Open the link in that email on this computer. It signs you in to Upmore; then press Use my Upmore sign-in." };
}

// The person's own RPCs, as them (their session token; the anon key only names the project).
async function rpc(name, args) {
  const a = await session();
  if (!a) throw Error("SIGNED_OUT");
  const cfg = await config();
  const r = await fetch(cfg.supabaseUrl + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: { apikey: cfg.anonKey, authorization: "Bearer " + a.access_token, "content-type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).message || text;
    } catch { /* plain text */ }
    if (r.status === 401 || /jwt|not signed in/i.test(msg)) throw Error("SIGNED_OUT");
    throw Error(String(msg).slice(0, 200));
  }
  return text ? JSON.parse(text) : null;
}
async function selectOwn(path) {
  const a = await session();
  if (!a) throw Error("SIGNED_OUT");
  const cfg = await config();
  const r = await fetch(cfg.supabaseUrl + "/rest/v1/" + path, { headers: { apikey: cfg.anonKey, authorization: "Bearer " + a.access_token } });
  if (!r.ok) throw Error("READ_FAILED");
  return await r.json();
}

// ------------------------------------------------------------------------------------------------ facts and answers
// The person's confirmed facts: what they answered Trainee by text (career_apply_answers_own; a fact for every employer,
// or one wording, or one posting) plus, if they chose, the same confirmed-facts file the desktop runner reads (only
// entries marked confirmed, only theirs). Read fresh for each form, so an answer texted a minute ago fills now.
async function facts(userId) {
  const imported = await get(S, "imported_facts", { answers: {}, saved: {} });
  let rows = [];
  try {
    rows = (await rpc("career_apply_answers_own", {})) || [];
  } catch (e) {
    if (e.message === "SIGNED_OUT") throw e;
  }
  const merged = C.factsWithTextAnswers(imported, rows);
  const resume = await get(L, "resume", null);
  if (resume) merged.answers.resume = { value: resume.sha256, factId: "approved-local-resume:" + resume.sha256 };
  // WO-054: the stored rows of answers the person gave in the panel before the session, for the card's mark.
  const beforeKeys = new Set(await get(S, "answered_before", []));
  return { answers: merged.answers, saved: merged.saved, answered: rows.map((r) => r.key), userId, before: rows.filter((r) => beforeKeys.has(r.key)).map((r) => "text-answer:" + r.id) };
}
function confirmedOnly(input, owner) {
  const out = {};
  for (const [k, a] of Object.entries(input || {})) {
    if (a?.user_id && a.user_id !== owner) continue;
    if (a?.confirmed === true && typeof a.value === "string" && typeof a.factId === "string" && a.factId.length > 0 && a.factId.length <= 200) {
      out[k] = { value: a.value, factId: a.factId };
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ cards, queue, evidence
const cards = async () => await get(S, "cards", {});
// Every change to the cards goes through one queue: two handlers reading and writing the whole map at once would lose
// one change (a "stopped" overwritten by an older "ready"). The last 60 changes are kept as a trail for diagnosis.
let cardQueue = Promise.resolve();
function withCards(tabId, by, change) {
  const run = cardQueue.then(async () => {
    const all = await cards();
    const next = change(all[tabId] || null);
    if (!next) return all[tabId] || null; // nothing to change
    all[tabId] = next;
    const trail = await get(S, "card_trail", []);
    await S.set({ cards: all, card_trail: [...trail, { at: Date.now(), tabId, by, status: all[tabId].status }].slice(-60) });
    return all[tabId];
  });
  cardQueue = run.catch(() => {});
  return run;
}
// A "stopped" never lands on a card whose application already went (status done) or is past its record (begun), unless
// it is the content script's own stop before the click: "nothing was sent" is said only when that is true (WO-031 review).
const setCard = (tabId, patch, by = patch.status || "patch") =>
  withCards(tabId, by, (prev) => {
    if (patch.status === "stopped" && prev && !patch.beforeClick && (prev.status === "done" || prev.begun)) return null;
    // A late "submitting" never undoes a finished card: the page after the click may be read before the click's message.
    if (patch.status === "submitting" && prev?.status === "done") return null;
    return { ...(prev || {}), ...patch, tabId, updated_at: Date.now() };
  });
const pendings = async () => await get(S, "pending", {});
let pendingQueue = Promise.resolve();
function setPending(tabId, v) {
  const run = pendingQueue.then(async () => {
    const all = await pendings();
    if (v === null) delete all[tabId];
    else all[tabId] = v;
    await put(S, "pending", all);
  });
  pendingQueue = run.catch(() => {});
  return run;
}

// WO-048: one flag per tab, "the next Workday step may fill itself": set by an approved Save and Continue or by the
// sign-in card, taken once by the next page.
let nextQueue = Promise.resolve();
function setWorkdayNext(tabId, on) {
  const run = nextQueue.then(async () => {
    const all = await get(S, "workday_next", {});
    if (on) all[tabId] = { at: Date.now() };
    else delete all[tabId];
    await put(S, "workday_next", all);
  });
  nextQueue = run.catch(() => {});
  return run;
}
// WO-049: the written answers drafted on each tab's card, by posting and field: { [tabId]: { jobId, items: { [name]: item } } }.
// An item is drafting, drafted (shown whole, not on the form), used (on the form by the person's own "Use this"),
// refused (the employer's AI policy) or failed (thin facts, not verified, too long, the service, the daily limit).
// Only the panel asks for a draft (essay-draft), only on the person's tap; nothing drafts on its own.
const draftsAll = async () => await get(S, "essay_drafts", {});
let draftQueue = Promise.resolve();
function setDraft(tabId, jobId, name, item) {
  const run = draftQueue.then(async () => {
    const all = await draftsAll();
    const mine = all[tabId] && all[tabId].jobId === jobId ? all[tabId] : { jobId, items: {} };
    mine.items[name] = { ...item, updated_at: Date.now() };
    all[tabId] = mine;
    await put(S, "essay_drafts", all);
    return mine.items[name];
  });
  draftQueue = run.catch(() => {});
  return run;
}
async function draftsFor(tabId, jobId) {
  const d = (await draftsAll())[tabId];
  return d && jobId && d.jobId === jobId ? d.items : {};
}
const oneLine = (s, dflt) => String(s || dflt).replace(/\s+/g, " ").trim().slice(0, 600);
// The question as the employer's form asks it, the posting, and the form's other labels (for its AI policy). Never a fact:
// the function reads the person's confirmed facts from their account itself.
async function requestDraft(card, q, previous) {
  const a = await session();
  if (!a) return { ok: false, why: "signed_out", message: say.signedOut };
  const cfg = await config();
  const body = {
    posting: card.jobId, company: card.company, label: q.label, type: q.type,
    siblings: (card.formLabels || []).filter((l) => l !== q.label).slice(0, 200), limit: { chars: q.chars ?? null }, previous: previous || null,
  };
  try {
    const r = await fetch(cfg.supabaseUrl + "/functions/v1/career-essay-draft", {
      method: "POST", headers: { apikey: cfg.anonKey, authorization: "Bearer " + a.access_token, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    if (r.status === 401) return { ok: false, why: "signed_out", message: say.signedOut };
    return j && typeof j === "object" ? j : { ok: false, why: "model", message: "" };
  } catch {
    return { ok: false, why: "model", message: "" };
  }
}
const NO_DRAFT = "Trainee couldn't draft this right now, so nothing changed and the question is still open. Try again in a few minutes.";

async function keepEvidence(rec) {
  const list = await get(L, "evidence", []);
  list.unshift(rec);
  await put(L, "evidence", list.slice(0, 300));
}

async function queueState() {
  return await get(S, "queue", { items: [], index: -1, tabId: null, running: false });
}
async function openNext(q) {
  q.index++;
  while (q.index < q.items.length && q.items[q.index].state !== "waiting") q.index++;
  if (q.index >= q.items.length) {
    q.running = false;
    await put(S, "queue", q);
    return;
  }
  q.items[q.index].state = "open";
  q.items[q.index].opened_at = Date.now();
  await put(S, "queue", q);
  if (q.tabId !== null) {
    try {
      await chrome.tabs.update(q.tabId, { url: q.items[q.index].url, active: true });
      return;
    } catch { /* the tab was closed */ }
  }
  const t = await chrome.tabs.create({ url: q.items[q.index].url, active: true });
  q.tabId = t.id;
  await put(S, "queue", q);
}
async function queueAfter(tabId, state, ms, proofId) {
  const q = await queueState();
  if (!q.running || q.tabId !== tabId || q.index < 0) return;
  const it = q.items[q.index];
  it.state = state;
  if (ms !== null) it.ms = ms;
  if (proofId) it.proof_id = proofId;
  await put(S, "queue", q);
  setTimeout(() => queueState().then((q2) => q2.running && openNext(q2)), 900);
}

// ------------------------------------------------------------------------------------------------ the submit
// One finish per application, whoever reports first (the content script in place, or the page load after a navigating
// submit): the row id is taken before any await, so a second report returns at once (WO-031 review).
const finishing = new Set();
async function finish(tabId, observation, extra = {}) {
  const p = (await pendings())[tabId];
  if (!p || p.finished || finishing.has(p.id)) return null;
  finishing.add(p.id);
  p.finished = true;
  await setPending(tabId, p);
  const done = Date.now();
  const outcome = observation
    ? C.outcomeAfterClick(observation, extra.errorsBefore || p.errors_before || [], !!extra.timedOut)
    : { state: "not_submitted", reason: extra.reason || C.BEFORE_CLICK, confirmation_id: null };
  const shotAfter = observation && extra.shotAfter?.sha256 ? extra.shotAfter : null;
  const evidence = await C.evidenceRecord({
    payload: p.payload, hash: p.hash, outcome, pageText: observation?.page_text || "", urlAfter: observation?.url_after || p.url_before,
    screenshotSha256: p.screenshot_sha256, screenshotAfterSha256: shotAfter?.sha256 ?? null,
    times: { card: p.card_shown_at, approved: p.approved_at, clicked: p.clicked_at || done, done }, drafts: p.drafts || {},
  });
  // WO-049 (D-024): a drafted answer is shown in the proof as drafted by Trainee from the person's facts (their ids), and
  // used as drafted or edited by them.
  const provenance = C.draftProvenance(p.payload.fields, p.drafts || {});
  let recorded = false;
  for (let i = 0; i < 3 && !recorded; i++) {
    try {
      await rpc("career_apply_finish_own", { p_id: p.id, p_lease: p.lease, p_state: outcome.state, p_evidence: evidence });
      recorded = true;
    } catch {
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  // The proof stays on this computer: the answers as approved, both pictures, the employer's words, the times.
  const proved = outcome.state === "confirmed" && !!shotAfter;
  await keepEvidence({
    ...evidence, id: p.id, state: outcome.state, proved, job_id: p.payload.job_id, company: p.payload.company, url: p.payload.url,
    approved_answers: p.payload.fields.map((f) => (provenance[f.name] ? { ...f, provenance: provenance[f.name].said, fact_ids: provenance[f.name].fact_ids, edited: provenance[f.name].edited } : f)),
    screenshot: p.screenshot || null, screenshot_after: shotAfter?.dataUrl || null, recorded,
  });
  // Ask once, from the form: the person's own answers on the card they approved are kept for later forms, only once the
  // application went (never for a stop before the click). A failure here never touches the application's outcome.
  if (observation && p.form_answers) {
    try {
      await rpc("career_apply_questions_answer_from_form_own", { p_job_id: p.form_answers.posting, p_answers: p.form_answers.answers });
    } catch { /* kept for the next text instead: the question stays open */ }
  }
  const stats = await get(L, "timing", []);
  if (proved) await put(L, "timing", [...stats, evidence.ms_card_to_done].slice(-500));
  await setPending(tabId, null);
  // A stop before the click leaves the posting open for another try; anything after the click moves the queue on. The queue
  // is final before the card says done, so the panel never shows a done card beside an open queue item.
  if (observation) await queueAfter(tabId, proved ? "confirmed" : outcome.state, evidence.ms_card_to_done, p.id);
  const view = observation ? C.cardOutcome(outcome, !!shotAfter) : { status: "stopped", message: extra.message || "Stopped before the click. Nothing was sent." };
  return await withCards(tabId, "finish:" + outcome.state, (prev) => ({
    ...(prev || {}), tabId, updated_at: Date.now(), status: view.status, message: view.message, result: outcome.state, proved,
    ms: evidence.ms_card_to_done, recorded, proof_id: p.id, approved: false,
    // WO-042: the step marks of the click, for the 60-in-30 benchmark's timing.
    times: { ...evidence.times, ...(p.steps ? { steps: p.steps } : {}) },
  }));
}

// The page after a navigating submit (Lever's thank-you): read and photographed from the tab while it is in front, identity
// fields covered while the picture is taken.
async function readAfterNavigation(tabId, p) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["lib/trainee-core.js"] });
  const [res] = await chrome.scripting.executeScript({
    target: { tabId }, args: [p.url_before, p.planned_names],
    func: (before, names) => {
      const T = globalThis.TraineeCore, D = T.dom, f = D.readForm();
      const sel = f.schema.filter((s) => T.isIdentityField(s) || T.looksLikeIdNumber(D.readValue(f.bindings[s.name]))).map((s) => f.bindings[s.name].selector);
      globalThis.__traineeUnmask = D.maskFields(sel);
      return D.observe(before, names);
    },
  });
  let shotAfter = null;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.active) shotAfter = await capture(tab.windowId);
  await chrome.scripting.executeScript({ target: { tabId }, func: () => globalThis.__traineeUnmask?.() }).catch(() => {});
  return { observation: res?.result || null, shotAfter };
}
async function capture(windowId) {
  try {
    const url = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    return { sha256: await sha256Hex(b64ToBytes(url.split(",")[1])), dataUrl: url };
  } catch {
    return null;
  }
}

// A submit that moved the page away: the new page is read once it loads (the content script there may not run, e.g. a
// thank-you page on the employer's own site). Also called from "clicked": a fast page can finish loading before that
// message lands, and then this load event has already passed the tab by.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "complete") afterNavigation(tabId);
});
// One reader per click: two at once would take two pictures, and Chrome refuses a second capture within the second.
const reading = new Set();
async function afterNavigation(tabId) {
  const p = (await pendings())[tabId];
  if (!p || p.finished || !p.clicked_at || reading.has(p.id)) return;
  reading.add(p.id);
  try {
    await readAndFinish(tabId, p);
  } finally {
    reading.delete(p.id);
  }
}
async function readAndFinish(tabId, p) {
  await new Promise((r) => setTimeout(r, 600));
  try {
    const { observation, shotAfter } = await readAfterNavigation(tabId, p);
    if (observation) await finish(tabId, observation, { shotAfter });
  } catch {
    // The page after the click could not be read: unknown, counted as applied, never resent.
    await finish(tabId, { url_before: p.url_before, url_after: "", form_present_after: true, required_empty_after: 0, validation_errors: [], captcha: false, email_code_prompt: false, page_text: "" }, { timedOut: true });
  }
}

// ------------------------------------------------------------------------------------------------ answer once (WO-054)
// "Prepare": the next queued postings are read in hidden tabs (content.js survey(): read only, nothing filled, clicked or
// sent; each tab closed after) and the questions only the person can answer are gathered once for the panel
// (TraineeCore.answerOnceQuestions). At most PREPARE_MAX postings, four at a time: each is a whole employer page held in a
// hidden tab, and an answer given now should be about postings this session reaches. Workday postings are left out: the
// person signs in on the employer's site first (D-013), so their questions are asked on their own cards.
const PREPARE_MAX = 20, PREPARE_AT_ONCE = 4, SURVEY_WAIT_MS = 45_000;
const surveys = new Map(); // tabId -> resolve, while a hidden tab is being read
let preparing = false;
async function surveyOne(url) {
  // Opened blank, then sent to the posting, so its tab is known before its content script asks what it is for.
  const tab = await chrome.tabs.create({ url: "about:blank", active: false });
  let timer = null;
  const got = new Promise((r) => surveys.set(tab.id, r));
  const late = new Promise((r) => (timer = setTimeout(() => r({ ok: false, why: "the page did not load in time" }), SURVEY_WAIT_MS)));
  try {
    await chrome.tabs.update(tab.id, { url });
    return { ...(await Promise.race([got, late])), url };
  } catch {
    return { ok: false, why: "the page could not be opened", url };
  } finally {
    clearTimeout(timer);
    surveys.delete(tab.id);
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}
async function prepareQueue() {
  const a = await session();
  if (!a) return { ok: false, message: say.signedOut };
  const waiting = (await queueState()).items.filter((x) => x.state === "waiting");
  const workday = waiting.filter((x) => C.detectPortal(x.url)?.family === "workday").length;
  const pick = waiting.filter((x) => C.detectPortal(x.url)?.family !== "workday").slice(0, PREPARE_MAX);
  const notes = [];
  if (workday) notes.push(`${workday} Workday posting${workday === 1 ? " is" : "s are"} left out: Workday needs you signed in on the employer's site, so ${workday === 1 ? "its questions are" : "their questions are"} asked on the card.`);
  const more = waiting.length - workday - pick.length;
  if (more > 0) notes.push(`Only the next ${PREPARE_MAX} postings are read ahead (${more} more wait): each is a whole page held open in a hidden tab. Press Prepare again after them.`);
  if (!pick.length) return { ok: false, message: notes[0] || "Add some posting links first." };
  const base = { status: "reading", total: pick.length, read: 0, notes, failed: [], questions: [], standing: [], left: {}, open: 0, skipped: [], saved: [], refused: [] };
  await put(S, "answer_once", base);
  const results = new Array(pick.length);
  let next = 0, read = 0;
  const worker = async () => {
    while (next < pick.length) {
      const i = next++;
      results[i] = await surveyOne(pick[i].url);
      await put(S, "answer_once", { ...base, read: ++read });
    }
  };
  await Promise.all(Array.from({ length: Math.min(PREPARE_AT_ONCE, pick.length) }, worker));
  const ok = results.filter((r) => r.ok && Array.isArray(r.needs));
  const f = await facts(a.user_id);
  const merged = C.answerOnceQuestions({ postings: ok.map((r) => ({ jobId: String(r.jobId), company: String(r.company), url: r.url, location: typeof r.location === "string" ? r.location.slice(0, 300) : undefined, needs: r.needs })),
    answers: f.answers, answered: new Set(f.answered) });
  const left = {};
  for (const x of merged.left) left[x.why] = (left[x.why] || 0) + 1;
  await put(S, "answer_once", { ...base, status: "ready", read, postings: ok.length, questions: merged.questions, standing: merged.standing, left, open: ok.reduce((n, r) => n + r.needs.length, 0),
    failed: results.filter((r) => !r.ok).map((r) => ({ url: r.url, why: String(r.why || "not read") })) });
  return { ok: true, questions: merged.questions.length };
}
// The person's own answers from the panel, stored the way an answer given on a form is (WO-042): the question is recorded
// for the posting that asked it, then answered under its key. The planner reads each back through `saved` (or as a fact)
// when the queue reaches each posting, and puts it only on an option that posting itself offers.
async function saveAnswerOnce(picks) {
  const st = await get(S, "answer_once", null);
  if (!st || st.status !== "ready") return { ok: false, message: "Press Prepare first." };
  // WO-074: a standing answer is saved by this same Save, beside the questions.
  const live = [...(st.standing || []), ...st.questions].filter((q) => !st.skipped.includes(q.key) && !st.saved.includes(q.key));
  const r = C.answerOnceRows({ questions: live, picks: Array.isArray(picks) ? picks : [] });
  const saved = [];
  let failed = false;
  for (const g of r.groups) {
    try {
      for (let i = 0; i < g.answers.length; i += 60) {
        await rpc("career_apply_questions_put_own", { p_job_id: g.posting, p_questions: g.questions.slice(i, i + 60) });
        await rpc("career_apply_questions_answer_from_form_own", { p_job_id: g.posting, p_answers: g.answers.slice(i, i + 60) });
      }
      saved.push(...g.answers.map((x) => x.key));
    } catch (e) {
      if (e.message === "SIGNED_OUT") return { ok: false, message: say.signedOut };
      failed = true;
    }
  }
  await put(S, "answered_before", [...new Set([...(await get(S, "answered_before", [])), ...saved])]);
  // WO-074: a standing answer saved shows again, in this panel, the questions it covered and does not settle.
  const reopen = (r.reopen || []).filter((x) => saved.includes(x.key)).flatMap((x) => x.keys);
  await put(S, "answer_once", { ...st, saved: [...st.saved, ...saved], refused: r.refused, reopen: [...new Set([...(st.reopen || []), ...reopen])] });
  return { ok: !failed, saved: saved.length, refused: r.refused, message: failed ? "Some answers could not be saved; those questions stay for their cards." : "" };
}

// ------------------------------------------------------------------------------------------------ messages
async function handle(m, sender) {
  const tabId = sender.tab?.id ?? m.tabId;
  switch (m.type) {
    // ---- from the content script
    case "context": {
      const a = await session();
      const q = await queueState();
      const p = (await pendings())[tabId] || null;
      if (!a) return { signedIn: false, message: say.signedOut, queued: q.running && q.tabId === tabId };
      let account = null;
      try {
        account = await rpc("career_apply_account_own", {});
      } catch (e) {
        if (e.message === "SIGNED_OUT") return { signedIn: false, message: say.signedOut };
      }
      const f = await facts(a.user_id);
      const resume = await get(L, "resume", null);
      return { signedIn: true, userId: a.user_id, ...f, resume, account, queued: q.running && q.tabId === tabId, pending: p && !p.finished ? p : null };
    }
    case "queued": {
      const q = await queueState();
      const p = (await pendings())[tabId];
      // WO-048: a Workday step saved with the person's approval (or a sign-in they did themselves) lets the next step
      // fill itself, once, within ten minutes.
      const next = (await get(S, "workday_next", {}))[tabId];
      if (next) await setWorkdayNext(tabId, false);
      return { queued: q.running && q.tabId === tabId, pending: !!(p && !p.finished), workdayNext: !!next && Date.now() - next.at < 600_000, survey: surveys.has(tabId) };
    }
    case "card": {
      // A new card replaces the old one whole: nothing approved or measured before carries over to it. A card being
      // submitted is never replaced by the page's own refresh.
      const card = await withCards(tabId, "card", (prev) =>
        prev && prev.status === "submitting" ? prev
          : { ...m.card, tabId, approved: false, status: m.card.status || (m.card.blockers?.length ? "blocked" : "ready"), updated_at: Date.now() });
      if (m.card?.signIn) await setWorkdayNext(tabId, true);
      return { ok: true, card };
    }
    case "draft": {
      // WO-048: Workday's Save and Continue sends one step to the employer as a draft. The content script may click it only
      // for the step the person approved, by its hash; the approved answers are kept on this computer as the proof.
      const card = (await cards())[tabId];
      if (!card || !card.approved || card.approved_hash !== m.hash || card.hash !== m.hash || card.action !== "draft") {
        await setCard(tabId, { status: "stopped", message: "This page was not approved as it is now. Nothing was saved or sent.", approved: false }, "refused");
        return { ok: false };
      }
      const drafts = await get(L, "workday_drafts", []);
      drafts.unshift({ at: Date.now(), company: card.company, url: card.url, job_id: card.jobId, step: m.step, approval_hash: m.hash, approved_answers: m.payload?.fields || [],
        card_shown_at: card.shown_at || null, approved_at: card.approved_at || null });
      await put(L, "workday_drafts", drafts.slice(0, 300));
      await setWorkdayNext(tabId, true);
      await setCard(tabId, { status: "saving", message: `Saving this page to ${card.company} as a draft with Workday's Save and Continue. Nothing is submitted.` });
      return { ok: true };
    }
    case "draft-clicked":
      return { ok: true };
    case "survey": {
      // WO-054: a hidden tab's reading of its posting, taken once, only from a tab Prepare opened.
      const done = surveys.get(tabId);
      if (!done) return { ok: false };
      surveys.delete(tabId);
      done({ ok: !!m.ok, why: m.why, jobId: m.jobId, company: m.company, location: m.location, needs: Array.isArray(m.needs) ? m.needs.slice(0, 200) : [] });
      return { ok: true };
    }
    case "questions": {
      // Ask once: each question that stopped this form goes to Trainee once, to be asked by text.
      // Once per form; a Workday application asks once per step (each step has its own questions).
      const done = await get(S, "asked", {});
      const once = m.step ? `${m.jobId}\n${String(m.step).slice(0, 200)}` : m.jobId;
      if (done[once]) return { ok: true, stored: 0 };
      const f = await facts((await session())?.user_id);
      const q = C.questionsForTrainee({ jobId: m.jobId, company: m.company, location: typeof m.location === "string" ? m.location.slice(0, 300) : undefined, needs: m.needs, answers: f.answers, answered: new Set(f.answered) });
      if (!q.questions.length) return { ok: true, stored: 0 };
      try {
        const n = await rpc("career_apply_questions_put_own", { p_job_id: q.posting, p_questions: q.questions });
        done[once] = true;
        await put(S, "asked", done);
        return { ok: true, stored: n };
      } catch (e) {
        return { ok: false, message: e.message };
      }
    }
    case "screenshot": {
      // The page as the person sees it, identity fields covered by the content script while it is taken. Only from the tab
      // in front: a picture of another tab is no proof of this one.
      const tab = await chrome.tabs.get(sender.tab.id).catch(() => null);
      if (!tab?.active) return { ok: false, message: "the application's tab is not in front" };
      const shot = await capture(sender.tab.windowId);
      return shot ? { ok: true, ...shot } : { ok: false, message: "the picture could not be taken" };
    }
    case "begin": {
      const card = (await cards())[tabId];
      // The content script may only start the one application the person approved, by its hash.
      // A Workday step's draft approval (WO-048) never submits: only a card that submits starts an application.
      if (!card || !card.approved || card.approved_hash !== m.hash || card.hash !== m.hash || card.action === "draft") return { ok: false, message: "This application was not approved as it is now. Nothing was sent." };
      try {
        const row = await rpc("career_apply_extension_begin_own", { p_payload: m.payload, p_approval: m.hash });
        // The drafts behind each drafted answer, as Trainee wrote them, for the proof (edited or used as drafted).
        const items = await draftsFor(tabId, card.jobId), drafts = {};
        for (const f of m.payload.fields || []) {
          const d = items[f.name];
          if (f.source === "drafted" && d?.original) drafts[f.name] = { original: d.original, factIds: d.factIds || [] };
        }
        await setPending(tabId, {
          id: row.id, lease: row.lease, hash: m.hash, payload: m.payload, url_before: m.urlBefore, planned_names: m.plannedNames, drafts,
          form_answers: m.formAnswers?.answers?.length ? m.formAnswers : null,
          card_shown_at: card.shown_at, approved_at: card.approved_at, screenshot_sha256: m.screenshot?.sha256 || null, screenshot: m.screenshot?.dataUrl || null,
        });
        await setCard(tabId, { begun: true });
        return { ok: true };
      } catch (e) {
        const why = /daily_cap/.test(e.message) ? "You reached today's application limit." : /company_cooldown/.test(e.message)
          ? "You applied to this company in the last 30 days." : /duplicate_job/.test(e.message) ? "You already applied to this posting."
          : e.message === "SIGNED_OUT" ? say.signedOut : /stale|current/.test(e.message) ? "Your account changed since this card was made; review it again."
          : "Trainee could not record this application, so it was not sent.";
        await setCard(tabId, { status: "stopped", message: why + " Nothing was sent.", approved: false }, "refused");
        return { ok: false, message: why };
      }
    }
    case "clicked": {
      const p = (await pendings())[tabId];
      if (p) {
        p.clicked_at = m.at;
        p.errors_before = m.errorsBefore || [];
        p.steps = m.steps || null;
        await setPending(tabId, p);
      }
      await setCard(tabId, { status: "submitting", message: "Sent with the site's own Submit; waiting for the employer's answer." });
      // The click may have moved the page before this message landed (CI, a fast thank-you page): its load is over and
      // onUpdated passed the tab by. A loaded page without the clicking page's mark is the page after the click.
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (p && tab?.status === "complete") {
        const [mark] = await chrome.scripting.executeScript({ target: { tabId }, func: () => globalThis.__traineeClicked === true }).catch(() => []);
        if (mark && mark.result === false) afterNavigation(tabId);
      }
      return { ok: true };
    }
    case "outcome":
      return { ok: true, card: await finish(tabId, m.observation, m) };
    case "stopped": {
      if (m.finishPending) await finish(tabId, null, { reason: C.BEFORE_CLICK, message: m.message });
      else await setCard(tabId, { status: "stopped", message: m.message, approved: false, beforeClick: !!m.beforeClick });
      return { ok: true };
    }
    case "proof": {
      const list = await get(L, "evidence", []);
      return { ok: true, proof: list.find((e) => e.id === m.id) || null };
    }
    case "clear-proof":
      if (m.confirm !== "clear") return { ok: false, message: "Not cleared." };
      await L.remove(["evidence", "timing"]);
      return { ok: true };
    // ---- from the panel (the person)
    case "status": {
      const a = await session();
      const resume = await get(L, "resume", null);
      const timing = await get(L, "timing", []);
      const card = m.tabId !== undefined ? (await cards())[m.tabId] || null : null;
      return {
        signedIn: !!a, email: a?.email || "", resume: resume ? { name: resume.name, sha256: resume.sha256 } : null,
        card, drafts: card ? await draftsFor(m.tabId, card.jobId) : {}, queue: await queueState(),
        timing: { n: timing.length, avg_ms: timing.length ? Math.round(timing.reduce((x, y) => x + y, 0) / timing.length) : null },
        importedFacts: Object.keys((await get(S, "imported_facts", { answers: {} })).answers).length,
        answerOnce: await get(S, "answer_once", null),
      };
    }
    case "signin-app":
      return await signInFromApp();
    case "signin-magic":
      return await magicLink(m.email);
    case "signout":
      await S.remove(["auth", "imported_facts"]);
      return { ok: true };
    case "set-resume": {
      const bytes = b64ToBytes(m.base64);
      if (!bytes.length || bytes.length > 10_000_000) return { ok: false, message: "Pick a resume file under 10 MB." };
      await put(L, "resume", { name: m.name, type: m.mime || "application/pdf", base64: m.base64, sha256: await sha256Hex(bytes) });
      return { ok: true };
    }
    case "import-facts": {
      const a = await session();
      if (!a) return { ok: false, message: say.signedOut };
      try {
        const j = JSON.parse(m.json);
        if (j.user_id && j.user_id !== a.user_id) return { ok: false, message: "That facts file belongs to another account." };
        await put(S, "imported_facts", { answers: confirmedOnly(j.answers, a.user_id), saved: confirmedOnly(j.saved, a.user_id) });
        return { ok: true };
      } catch {
        return { ok: false, message: "That file is not a confirmed-facts file." };
      }
    }
    case "prepare":
      return await chrome.tabs.sendMessage(m.tabId, { type: "prepare" }).catch(() => ({ ok: false, message: "Open an application page first." }));
    case "approve": {
      // The one tap. Bound to the card the person read: its hash must be the one shown.
      let taken = false;
      await withCards(m.tabId, "approve", (card) => {
        if (!card || card.hash !== m.hash || card.status !== "ready") return null;
        taken = true;
        return { ...card, approved: true, approved_hash: m.hash, approved_at: Date.now(), status: "submitting", message: "Checking the form is still exactly what you approved...", updated_at: Date.now() };
      });
      if (!taken) return { ok: false, message: "This card changed; read the new one before approving." };
      // The content script answers at once and then works. If the page cannot be reached at all, nothing was recorded or
      // clicked; once a record exists, the outcome is finish()'s alone, never "nothing was sent" (WO-031 review).
      chrome.tabs.sendMessage(m.tabId, { type: "submit", hash: m.hash }).catch(async () => {
        if ((await pendings())[m.tabId]) return;
        await setCard(m.tabId, { status: "stopped", message: "The page could not be reached, so nothing was sent.", approved: false }, "unreachable");
      });
      return { ok: true };
    }
    case "essay-draft": {
      // WO-049: the person's tap on "Draft from my facts" (or "Redo") for one written question on the card in front of them.
      const card = (await cards())[m.tabId];
      const q = (card?.essays || []).find((e) => e.name === m.name);
      if (!card || !q || !["ready", "blocked"].includes(card.status)) return { ok: false, message: "That question is not on this card now. Press Fill this application to read the form again." };
      const prior = (await draftsFor(m.tabId, card.jobId))[m.name] || null;
      if (prior?.state === "drafting") return { ok: false, message: "Already drafting this one." };
      // Redo of a draft already on the form takes it off first: the new draft goes on only by Use this.
      if (m.redo && prior?.state === "used") {
        const r = await chrome.tabs.sendMessage(m.tabId, { type: "essay-fill", name: m.name, text: "" }).catch(() => null);
        if (!r?.ok) return { ok: false, message: r?.message || "The page could not be reached, so nothing changed." };
      }
      await setDraft(m.tabId, card.jobId, m.name, { label: q.label, state: "drafting", message: "Drafting from your confirmed facts..." });
      const r = await requestDraft(card, q, m.redo ? prior?.original || null : null);
      const item = C.showableDraft(r)
        ? { label: q.label, state: "drafted", text: r.text, original: r.text, factIds: r.fact_ids, facts: (r.facts || []).map((f) => ({ id: String(f.id), label: String(f.label) })), message: oneLine(r.message, "") }
        : { label: q.label, state: r?.why === "policy" ? "refused" : "failed", why: r?.why || "model", message: oneLine(r?.ok ? "" : r?.message, NO_DRAFT) };
      return { ok: true, item: await setDraft(m.tabId, card.jobId, m.name, item) };
    }
    case "essay-use": {
      // WO-049: the person's "Use this" (or their edit of the used text): it goes on the form as theirs, and the card is
      // read again, so their approval binds exactly this text.
      const card = (await cards())[m.tabId];
      const item = card ? (await draftsFor(m.tabId, card.jobId))[m.name] : null;
      if (!card || !item || !["drafted", "used"].includes(item.state)) return { ok: false, message: "There is no draft for that question to use." };
      if (!["ready", "blocked"].includes(card.status)) return { ok: false, message: "This application is being sent or was sent, so nothing changed." };
      const text = String(m.text ?? "");
      if (!text.trim()) return { ok: false, message: "The answer is empty. Type it, or tap Redo for another draft." };
      if (text.length > 2000) return { ok: false, message: "That answer is over 2000 characters, more than one answer can hold. Shorten it first." };
      const r = await chrome.tabs.sendMessage(m.tabId, { type: "essay-fill", name: m.name, text, factIds: item.factIds || [] }).catch(() => null);
      if (!r?.ok) return { ok: false, message: r?.message || "The page could not be reached, so nothing changed." };
      await setDraft(m.tabId, card.jobId, m.name, { ...item, state: "used", text: r.value });
      return { ok: true, hash: r.hash };
    }
    case "queue-set": {
      const urls = C.postingLinks(m.text || "", 100);
      const q = await queueState();
      const have = new Set(q.items.map((x) => C.postingKey(x.url)));
      for (const u of urls) if (!have.has(C.postingKey(u))) q.items.push({ url: u, state: "waiting" });
      await put(S, "queue", q);
      return { ok: true, added: urls.length };
    }
    case "queue-from-tabs": {
      const tabs = await chrome.tabs.query({});
      return await handle({ type: "queue-set", text: tabs.map((t) => t.url || "").join("\n") }, {});
    }
    case "queue-from-matches": {
      // Trainee's matches are the alert texts in the person's own outbox (row-level security: only theirs).
      try {
        const rows = await selectOwn("career_outbox?select=text,created_at&kind=eq.alert&order=created_at.desc&limit=50");
        return await handle({ type: "queue-set", text: rows.map((r) => r.text).join("\n") }, {});
      } catch (e) {
        return { ok: false, message: e.message === "SIGNED_OUT" ? say.signedOut : "Trainee's matches could not be read; paste the links instead." };
      }
    }
    case "queue-from-trainee": {
      // WO-066: the postings the person asked Trainee to apply to in chat, from their own queue (row-level security: only
      // theirs), into the same queue their pasted links go; each is then prepared here and goes only on its card's tap.
      try {
        const rows = await selectOwn("career_apply_wanted?select=posting_key,url&state=eq.waiting&order=queued_at.asc&limit=100");
        if (!rows.length) return { ok: false, message: "Trainee has no postings waiting for you. Ask Trainee in chat to apply to some." };
        const r = await handle({ type: "queue-set", text: rows.map((x) => x.url).join("\n") }, {});
        await rpc("career_apply_want_take_own", { p_keys: rows.map((x) => x.posting_key) });
        return r;
      } catch (e) {
        return { ok: false, message: e.message === "SIGNED_OUT" ? say.signedOut : "Trainee's picks could not be read; paste the links instead." };
      }
    }
    case "queue-start": {
      const q = await queueState();
      if (!q.items.some((x) => x.state === "waiting")) return { ok: false, message: "Add some posting links first." };
      q.running = true;
      q.index = Math.max(-1, q.items.findIndex((x) => x.state === "waiting") - 1);
      q.tabId = m.tabId ?? q.tabId ?? null;
      await put(S, "queue", q);
      await openNext(q);
      return { ok: true };
    }
    case "queue-skip": {
      const q = await queueState();
      if (q.index >= 0 && q.items[q.index]) q.items[q.index].state = "skipped";
      await put(S, "queue", q);
      if (q.running) await openNext(q);
      return { ok: true };
    }
    case "queue-stop": {
      const q = await queueState();
      q.running = false;
      await put(S, "queue", q);
      return { ok: true };
    }
    case "queue-clear":
      await put(S, "queue", { items: [], index: -1, tabId: null, running: false });
      await S.remove("answer_once");
      return { ok: true };
    case "answer-once-prepare": {
      if (preparing) return { ok: false, message: "Already reading the queue's postings." };
      preparing = true;
      try {
        return await prepareQueue();
      } finally {
        preparing = false;
      }
    }
    case "answer-once-save":
      return await saveAnswerOnce(m.answers);
    case "answer-once-skip": {
      const st = await get(S, "answer_once", null);
      if (!st) return { ok: false };
      await put(S, "answer_once", { ...st, skipped: [...new Set([...st.skipped, String(m.key)])] });
      return { ok: true };
    }
    default:
      return { ok: false, message: "unknown request" };
  }
}
// Who may ask what (WO-031 review): what the person does (approve, sign in, set the resume, the queue, the proof) comes
// only from the extension's own panel page, never from a content script running inside an employer's page; what a page
// reports comes only from a content script in a tab.
const PANEL_ONLY = new Set(["status", "signin-app", "signin-magic", "signout", "set-resume", "import-facts", "prepare", "approve", "essay-draft", "essay-use",
  "queue-set", "queue-from-tabs", "queue-from-matches", "queue-from-trainee", "queue-start", "queue-skip", "queue-stop", "queue-clear", "proof", "clear-proof",
  "answer-once-prepare", "answer-once-save", "answer-once-skip"]);
const TAB_ONLY = new Set(["context", "queued", "card", "questions", "screenshot", "begin", "clicked", "outcome", "stopped", "draft", "draft-clicked", "survey"]);
// The sender's URL is set by Chrome: a content script's is the employer page's, the panel's is panel.html (in the side
// panel it has no tab; opened as its own window it has one, so the URL decides, not the tab).
const fromPanel = (sender) => typeof sender.url === "string" && sender.url.startsWith(chrome.runtime.getURL("panel.html"));
const fromPage = (sender) => !!sender.tab && typeof sender.url === "string" && !sender.url.startsWith(chrome.runtime.getURL(""));
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  // Only this extension's own pages and content scripts talk here; nothing a web page sends is read.
  if (sender.id !== chrome.runtime.id) return false;
  const type = m?.type;
  if (PANEL_ONLY.has(type) && !fromPanel(sender)) {
    reply({ ok: false, message: "Only the Trainee panel can ask for that." });
    return false;
  }
  if (TAB_ONLY.has(type) && !fromPage(sender)) {
    reply({ ok: false, message: "Only an application page can report that." });
    return false;
  }
  if (!PANEL_ONLY.has(type) && !TAB_ONLY.has(type)) {
    reply({ ok: false, message: "unknown request" });
    return false;
  }
  handle(m || {}, sender).then(reply, (e) => reply({ ok: false, message: String(e?.message || e) }));
  return true;
});
