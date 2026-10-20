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
  $("card-proof").hidden = !card?.proof_id;
  $("card-proof").dataset.id = card?.proof_id || "";
  const q = st.queue;
  const ol = $("queue");
  ol.textContent = "";
  q.items.forEach((it, i) => {
    const li = document.createElement("li");
    li.textContent = `${it.state === "open" ? "now: " : ""}${it.url}${it.state !== "waiting" && it.state !== "open" ? ` (${it.state}${it.ms ? `, ${(it.ms / 1000).toFixed(1)} s` : ""})` : ""}`;
    if (it.proof_id) {
      const b = document.createElement("button");
      b.textContent = "Proof";
      b.className = "link proof-item";
      b.onclick = () => showProof(it.proof_id);
      li.append(" ", b);
    }
    if (i === q.index && q.running) li.style.fontWeight = "600";
    ol.appendChild(li);
  });
  const done = q.items.filter((x) => !["waiting", "open"].includes(x.state)).length;
  text($("queue-progress"), q.items.length ? `${done} of ${q.items.length} done${st.timing.avg_ms ? `; average ${(st.timing.avg_ms / 1000).toFixed(1)} s from card to confirmed` : ""}` : "");
}

// Proof of one application, as this computer kept it: what was sent, when it was approved and clicked, the picture before
// and after the click, the employer's own words, where the page ended. Never "confirmed" without the picture after.
const when = (iso) => (iso ? new Date(iso).toLocaleString() : "not recorded");
async function showProof(id) {
  const r = await send({ type: "proof", id });
  const p = r?.proof;
  $("proof").hidden = false;
  if (!p) {
    text($("proof-heading"), "No proof is kept on this computer for that application.");
    return;
  }
  text($("proof-heading"), p.proved
    ? `Proof: ${p.company}, sent and confirmed by the employer${p.confirmation_id ? ` (${p.confirmation_id})` : ""}`
    : `Not confirmed: ${p.screenshot_after ? p.reason : "the page after the click could not be photographed"}. This is what the page showed.`);
  text($("proof-meta"), `Approved ${when(p.times?.approved_at)}, approval ${String(p.approval_hash || "").slice(0, 12)}`);
  const ol = $("proof-answers");
  ol.textContent = "";
  for (const a of p.approved_answers || []) {
    const li = document.createElement("li");
    li.textContent = `${a.label}: ${a.value}`;
    ol.appendChild(li);
  }
  $("proof-before").src = p.screenshot || "";
  $("proof-before").hidden = !p.screenshot;
  $("proof-after").src = p.screenshot_after || "";
  $("proof-after").hidden = !p.screenshot_after;
  text($("proof-text"), p.confirmation_text ? `"${p.confirmation_text}"${p.confirmation_id ? ` (confirmation ${p.confirmation_id})` : ""}` : "The employer's page said nothing that could be read.");
  text($("proof-url"), `Final page: ${p.url_after || "not recorded"}`);
  const t = p.times || {};
  text($("proof-times"), `Card ${when(t.card_shown_at)}; approved ${when(t.approved_at)}; clicked ${when(t.clicked_at)}; answer read ${when(t.finished_at)}`);
}
$("card-proof").onclick = () => showProof($("card-proof").dataset.id);
$("proof-close").onclick = () => ($("proof").hidden = true);
$("clear-proof").onclick = () => {
  $("clear-confirm").hidden = false;
  text($("clear-msg"), "");
};
$("clear-no").onclick = () => ($("clear-confirm").hidden = true);
$("clear-yes").onclick = async (e) => {
  if (!e.isTrusted) return;
  const r = await send({ type: "clear-proof", confirm: "clear" });
  $("clear-confirm").hidden = true;
  $("proof").hidden = true;
  text($("clear-msg"), r.ok ? "Proof cleared from this computer." : r.message);
  render();
};

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
