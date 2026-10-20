// WO-031: the review card (the extension's side panel). It shows every answer exactly as it will be sent, what is still
// needed, and the resume; the one Approve tap sends the card's own hash, so only the reviewed application can go. A tap
// that a script made (not the person's own click) is refused.
const $ = (id) => document.getElementById(id);
const send = (m) => chrome.runtime.sendMessage(m);
const params = new URLSearchParams(location.search);
let tabId = params.has("tab") ? Number(params.get("tab")) : null;
let last = null;

async function targetTab() {
  if (params.has("tab")) return tabId;
  const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  tabId = t ? t.id : null;
  return tabId;
}

function text(el, s, warn = false) {
  el.textContent = s || "";
  el.classList.toggle("warn", !!warn);
}

// Only the newest render is shown: an older one finishing late would put an earlier card (and its hash) on screen.
let renderSeq = 0;
async function render() {
  const mine = ++renderSeq;
  await targetTab();
  const st = await send({ type: "status", tabId });
  if (mine !== renderSeq) return;
  last = st;
  $("signin").hidden = st.signedIn;
  $("setup").hidden = !st.signedIn;
  $("page").hidden = !st.signedIn;
  $("queue-box").hidden = !st.signedIn;
  $("signout").hidden = !st.signedIn;
  text($("who"), st.signedIn ? st.email : "");
  text($("resume-name"), st.resume ? st.resume.name : "none yet");
  text($("facts-count"), st.importedFacts ? `${st.importedFacts} confirmed facts imported for this browser session.` : "");
  const card = st.card;
  const list = $("card");
  list.textContent = "";
  for (const line of card?.lines || []) {
    const li = document.createElement("li");
    li.textContent = line;
    if (/^Before you can approve:/.test(line)) li.className = "block";
    list.appendChild(li);
  }
  text($("status"), card?.message || "Open an application, then press Fill this application.", card?.status === "stopped" || card?.status === "blocked");
  $("approve").disabled = !(card && card.status === "ready" && card.hash);
  $("approve").dataset.hash = card?.hash || "";
  text($("result"), card?.status === "done" ? `${card.message}${card.ms ? ` ${(card.ms / 1000).toFixed(1)} s from card to answer.` : ""}${card.recorded === false ? " Not recorded yet; kept on this computer." : ""}` : "");
  const q = st.queue;
  const ol = $("queue");
  ol.textContent = "";
  q.items.forEach((it, i) => {
    const li = document.createElement("li");
    li.textContent = `${it.state === "open" ? "now: " : ""}${it.url}${it.state !== "waiting" && it.state !== "open" ? ` (${it.state}${it.ms ? `, ${(it.ms / 1000).toFixed(1)} s` : ""})` : ""}`;
    if (i === q.index && q.running) li.style.fontWeight = "600";
    ol.appendChild(li);
  });
  const done = q.items.filter((x) => !["waiting", "open"].includes(x.state)).length;
  text($("queue-progress"), q.items.length ? `${done} of ${q.items.length} done${st.timing.avg_ms ? `; average ${(st.timing.avg_ms / 1000).toFixed(1)} s from card to confirmed` : ""}` : "");
}

$("use-app").onclick = async () => text($("signin-msg"), (await send({ type: "signin-app" })).message || "Signed in.") || render();
$("magic").onclick = async () => text($("signin-msg"), (await send({ type: "signin-magic", email: $("email").value.trim() })).message);
$("signout").onclick = async () => {
  await send({ type: "signout" });
  render();
};
$("resume").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = await send({ type: "set-resume", name: f.name, mime: f.type, base64: btoa(bin) });
  if (!r.ok) text($("status"), r.message, true);
  render();
};
$("facts").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const r = await send({ type: "import-facts", json: await f.text() });
  text($("status"), r.ok ? "Your confirmed facts are loaded for this browser session." : r.message, !r.ok);
  render();
};
$("fill").onclick = async () => {
  text($("status"), "Reading the form and filling what Trainee knows...");
  const r = await send({ type: "prepare", tabId: await targetTab() });
  if (r && r.ok === false && r.message) text($("status"), r.message, true);
  render();
};
// The one tap. Only the person's own click counts, and it approves the hash of the card on screen.
$("approve").onclick = async (e) => {
  if (!e.isTrusted) return;
  const hash = $("approve").dataset.hash;
  if (!hash) return;
  $("approve").disabled = true;
  const r = await send({ type: "approve", tabId: await targetTab(), hash });
  if (!r.ok) text($("status"), r.message, true);
  render();
};
const qmsg = (r) => text($("q-msg"), r.ok ? (r.added !== undefined ? `${r.added} posting${r.added === 1 ? "" : "s"} added.` : "") : r.message, !r.ok);
$("q-add").onclick = async () => {
  qmsg(await send({ type: "queue-set", text: $("links").value }));
  $("links").value = "";
  render();
};
$("q-tabs").onclick = async () => (qmsg(await send({ type: "queue-from-tabs" })), render());
$("q-matches").onclick = async () => (qmsg(await send({ type: "queue-from-matches" })), render());
$("q-start").onclick = async () => (qmsg(await send({ type: "queue-start", tabId: params.has("tab") ? tabId : undefined })), render());
$("q-skip").onclick = async () => (qmsg(await send({ type: "queue-skip" })), render());
$("q-stop").onclick = async () => (qmsg(await send({ type: "queue-stop" })), render());
$("q-clear").onclick = async () => (qmsg(await send({ type: "queue-clear" })), render());

chrome.storage.onChanged.addListener(() => render());
chrome.tabs.onActivated?.addListener(() => render());
chrome.tabs.onUpdated?.addListener((id) => id === tabId && render());
render();
