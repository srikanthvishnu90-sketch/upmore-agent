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
  renderEssays(card, st.drafts || {});
  // While an edit of a used draft is on its way to the form, the card on screen is not yet what would be sent: no tap.
  $("approve").disabled = !(card && card.status === "ready" && card.hash) || syncing.size > 0;
  $("approve").dataset.hash = card?.hash || "";
  // WO-048: a Workday step's tap saves that step as a draft; only the review step's tap submits.
  $("approve").textContent = card?.action === "draft" ? "Approve this page: Save and Continue" : "Approve and submit";
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
  renderAnswerOnce(st.answerOnce);
}

// ------------------------------------------------------------------------------------------------ answer once (WO-054)
// The questions only the person can answer, gathered from the queue's next postings, most asked first, each at the
// employer's own wording and with the employer's own options. Every choice starts empty: Trainee never picks one. Skip
// leaves a question for its card; only the person's own tap on Save stores anything.
const LEFT = { essay: "written answers (drafted on their card)", personal: "self-identification questions (yours, on the form)", identity: "identity numbers (typed by you)",
  file: "file uploads", agreement: "agreements (each is one employer's)" };
// WO-074: a standing answer is one item of this same list: the class's short form (one pick, or two inputs), standing for
// the questions it lists, and saved by the same Save. It starts empty; the statement is composed only from the person's
// own picks, and only when complete (the background refuses anything else).
const RIGHTS_ELSEWHERE = [["yes", "That is every country; anywhere else I would need visa sponsorship"],
  ["no", "That is every country; I would not need visa sponsorship elsewhere"], ["partial", "That is not every country"]];
function standingItem(q, li) {
  const n = q.postings.length, names = [...new Set(q.postings.map((p) => p.company))];
  li.querySelector(".ao-where").textContent = `Your standing answer, given once: it stands for ${n} question${n === 1 ? "" : "s"} on ${names.length} posting${names.length === 1 ? "" : "s"} (${names.join(", ")}) and later forms. A form it does not settle asks you on its card.`;
  const box = li.querySelector(".ao-input");
  if (q.choices) {
    const sel = document.createElement("select");
    sel.className = "ao-answer";
    sel.append(new Option("Choose your answer", ""));
    for (const c of q.choices) sel.append(new Option(c.label, c.value));
    box.append(sel);
    return;
  }
  const answer = document.createElement("input");
  answer.type = "hidden";
  answer.className = "ao-answer";
  const text = document.createElement("input");
  text.type = "text";
  text.className = "sa-text";
  const sel = document.createElement("select");
  sel.className = "sa-pick";
  sel.append(new Option(q.standing === "office" ? "Up to how many days a week?" : "Is that every country?", ""));
  if (q.standing === "office") {
    text.placeholder = "Cities, e.g. Chicago, IL; New York, NY";
    for (let d = 1; d <= 5; d++) sel.append(new Option(`Up to ${d} day${d === 1 ? "" : "s"} a week${d === 5 ? " (full time on site)" : ""}`, String(d)));
  } else {
    text.placeholder = "Countries, e.g. United States";
    for (const [v, l] of RIGHTS_ELSEWHERE) sel.append(new Option(l, v));
  }
  const compose = () => {
    const list = text.value.split(q.standing === "office" ? /\s*;\s*/ : /\s*[;,]\s*/).map((x) => x.trim()).filter(Boolean);
    if (!list.length || !sel.value) return (answer.value = "");
    answer.value = q.standing === "office" ? JSON.stringify({ places: list, maxDays: Number(sel.value) })
      : JSON.stringify({ countries: list, complete: sel.value !== "partial", sponsorshipElsewhere: sel.value === "no" ? "no" : "yes" });
  };
  text.addEventListener("input", compose);
  sel.addEventListener("change", compose);
  box.append(text, " ", sel, answer);
}
function aoItem(q) {
  const li = document.createElement("li");
  li.dataset.key = q.key;
  if (q.standing) {
    li.className = "ao-standing";
    li.innerHTML = '<b class="ao-label"></b><p class="ao-where small"></p><span class="ao-input"></span> <button class="link ao-skip">Skip</button>';
    li.querySelector(".ao-label").textContent = q.label;
    standingItem(q, li);
    li.querySelector(".ao-skip").onclick = async (e) => {
      if (!e.isTrusted) return;
      await send({ type: "answer-once-skip", key: q.key });
      render();
    };
    return li;
  }
  li.innerHTML = '<b class="ao-label"></b><p class="ao-where small"></p><span class="ao-input"></span> <button class="link ao-skip">Skip</button>';
  li.querySelector(".ao-label").textContent = q.label.replace(/\s*[*✱]+\s*$/, "") + (q.similar ? ` (and ${q.similar} similar)` : "");
  const n = q.postings.length, names = [...new Set(q.postings.map((p) => p.company))];
  li.querySelector(".ao-where").textContent = q.perPosting ? `Only for ${names[0]}` : `Asked by ${n} posting${n === 1 ? "" : "s"}: ${names.join(", ")}`;
  let input;
  if (q.options.length) {
    input = document.createElement("select");
    input.append(new Option("Choose your answer", ""));
    for (const o of q.options) input.append(new Option(o, o));
    input.value = q.selected ?? "";
  } else {
    input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type your answer";
    input.value = q.selected ?? "";
  }
  input.className = "ao-answer";
  li.querySelector(".ao-input").append(input);
  li.querySelector(".ao-skip").onclick = async (e) => {
    if (!e.isTrusted) return;
    await send({ type: "answer-once-skip", key: q.key });
    render();
  };
  return li;
}
function renderAnswerOnce(ao) {
  const ol = $("ao-list");
  // WO-074: a standing answer on offer stands in for the entries it covers (they are not shown while it is, saved or not);
  // skipped, they are shown again as they were.
  const standing = ao?.status === "ready" ? (ao.standing || []).filter((q) => !ao.skipped.includes(q.key)) : [];
  // Once given, the questions it does not settle at their posting come back here (reopen), to be answered now.
  const covered = new Set(standing.flatMap((q) => q.covers || []).filter((k) => !(ao.reopen || []).includes(k)));
  const live = ao?.status === "ready" ? [...standing, ...ao.questions.filter((q) => !covered.has(q.key))].filter((q) => !ao.skipped.includes(q.key) && !ao.saved.includes(q.key)) : [];
  // The person's own unsaved choices stay as they are across renders.
  for (const el of [...ol.children]) if (!live.some((q) => q.key === el.dataset.key)) el.remove();
  live.forEach((q, i) => {
    const el = [...ol.children].find((x) => x.dataset.key === q.key) || aoItem(q);
    if (ol.children[i] !== el) ol.insertBefore(el, ol.children[i] || null);
  });
  $("ao-save").hidden = !live.length;
  if (!ao) return text($("ao-msg"), "");
  if (ao.status === "reading") return text($("ao-msg"), `Reading posting ${ao.read} of ${ao.total} in the background. Nothing is filled or sent.`);
  const left = Object.entries(ao.left || {}).map(([k, v]) => `${v} ${LEFT[k] || k}`);
  const asks = standing.length + (ao.questions || []).filter((q) => !covered.has(q.key)).length;
  text($("ao-msg"), [
    `Read ${ao.postings} of ${ao.total} postings: ${asks} question${asks === 1 ? "" : "s"} only you can answer, from ${ao.open} open on their forms.`,
    standing.length ? `${standing.length} of them ${standing.length === 1 ? "is a standing answer" : "are standing answers"}, given once for every later form too (in place of ${covered.size} question${covered.size === 1 ? "" : "s"}).` : "",
    ...(ao.notes || []), ...(ao.failed || []).map((f) => `Not read: ${f.url} (${f.why}); its questions are asked on its card.`),
    left.length ? `Left for the cards: ${left.join(", ")}.` : "",
    ao.saved.length ? `${ao.saved.length} answer${ao.saved.length === 1 ? "" : "s"} saved. Each fills every posting whose own options fit it; you approve each card as always.` : "",
    ...(ao.refused || []).map((r) => `Not saved (${r.why}): asked again on its card.`),
  ].filter(Boolean).join(" "));
}
$("q-prepare").onclick = async (e) => {
  if (!e.isTrusted) return;
  text($("ao-msg"), "Reading the queue's next postings in the background...");
  const r = await send({ type: "answer-once-prepare" });
  if (r && r.ok === false && r.message) text($("ao-msg"), r.message, true);
  render();
};
$("ao-save").onclick = async (e) => {
  if (!e.isTrusted) return; // only the person's own tap stores an answer
  const answers = [...$("ao-list").children].map((li) => ({ key: li.dataset.key, answer: li.querySelector(".ao-answer").value })).filter((a) => a.answer.trim());
  if (!answers.length) return text($("ao-msg"), "Nothing chosen yet; skipped questions stay for their cards.");
  const r = await send({ type: "answer-once-save", answers });
  if (r && r.ok === false && r.message) text($("ao-msg"), r.message, true);
  render();
};

// ------------------------------------------------------------------------------------------------ written answers (WO-049)
// Each written question the form still needs gets "Draft from my facts". Nothing is drafted until the person taps it (no
// model is ever called on its own). A draft is shown whole, editable, with the facts it came from by label; it goes on the
// form only by "Use this", and an edit after that goes on the form too, so the approval binds the edited text. A refusal,
// thin facts, an unverified or cut-off draft, or a failure is one line, and the question stays asked.
const syncing = new Set(); // names whose edited text is on its way to the form
const editTimers = {};
function essayBlock(q) {
  const el = document.createElement("div");
  el.className = "essay";
  el.dataset.name = q.name;
  el.innerHTML = '<b class="essay-label"></b><button class="essay-draft">Draft from my facts</button><p class="essay-msg msg"></p>' +
    '<p class="essay-facts small"></p><textarea class="essay-text" rows="6" hidden></textarea>' +
    '<div class="row"><button class="essay-use">Use this</button><button class="essay-redo">Redo</button></div>';
  const ta = el.querySelector(".essay-text");
  el.querySelector(".essay-draft").onclick = (e) => draftEssay(e, q.name, false);
  el.querySelector(".essay-redo").onclick = (e) => draftEssay(e, q.name, true);
  el.querySelector(".essay-use").onclick = async (e) => {
    if (!e.isTrusted) return;
    await useEssay(q.name, ta.value);
  };
  // An edit of the text already on the form goes on the form too (after a short pause); until it lands, no approval.
  ta.addEventListener("input", (e) => {
    if (!e.isTrusted || el.dataset.state !== "used") return;
    syncing.add(q.name);
    $("approve").disabled = true;
    clearTimeout(editTimers[q.name]);
    editTimers[q.name] = setTimeout(() => useEssay(q.name, ta.value), 400);
  });
  return el;
}
async function draftEssay(e, name, redo) {
  if (!e.isTrusted) return; // only the person's own tap drafts
  const el = [...$("essays").children].find((x) => x.dataset.name === name);
  if (el) {
    el.querySelector(".essay-draft").disabled = true;
    text(el.querySelector(".essay-msg"), "Drafting from your confirmed facts...");
  }
  const r = await send({ type: "essay-draft", tabId: await targetTab(), name, redo });
  if (!r?.ok && el) text(el.querySelector(".essay-msg"), r?.message || "Nothing was drafted.", true);
  render();
}
async function useEssay(name, value) {
  syncing.add(name);
  $("approve").disabled = true;
  try {
    const r = await send({ type: "essay-use", tabId: await targetTab(), name, text: value });
    const el = [...$("essays").children].find((x) => x.dataset.name === name);
    if (!r?.ok && el) text(el.querySelector(".essay-msg"), r?.message || "Nothing changed.", true);
  } finally {
    syncing.delete(name);
    render();
  }
}
function renderEssays(card, drafts) {
  const box = $("essays");
  const list = card && ["ready", "blocked"].includes(card.status) ? card.essays || [] : [];
  for (const el of [...box.children]) if (!list.some((q) => q.name === el.dataset.name)) el.remove();
  for (const q of list) {
    let el = [...box.children].find((x) => x.dataset.name === q.name);
    if (!el) box.appendChild((el = essayBlock(q)));
    const d = drafts[q.name] || null;
    const state = d?.state || "none";
    el.dataset.state = state;
    text(el.querySelector(".essay-label"), q.label.replace(/\s*[*✱]+\s*$/, ""));
    const draftBtn = el.querySelector(".essay-draft"), ta = el.querySelector(".essay-text");
    // The employer asks for the person's own words: no button, no request, the reason up front.
    if (q.own) {
      for (const s of [".essay-draft", ".essay-text", ".essay-use", ".essay-redo"]) el.querySelector(s).hidden = true;
      text(el.querySelector(".essay-facts"), "");
      text(el.querySelector(".essay-msg"), q.own, true);
      continue;
    }
    draftBtn.hidden = !["none", "failed", "drafting"].includes(state);
    draftBtn.disabled = state === "drafting";
    const shown = state === "drafted" || state === "used";
    ta.hidden = !shown;
    el.querySelector(".essay-use").hidden = state !== "drafted";
    el.querySelector(".essay-redo").hidden = !shown;
    text(el.querySelector(".essay-facts"), shown && d.facts?.length ? `From your confirmed facts: ${d.facts.map((f) => f.label).join("; ")}` : "");
    const said = state === "used" ? "On the form, as yours. Edit it here and the card follows; Approve sends exactly this text." : d?.message || "";
    if (!syncing.has(q.name)) text(el.querySelector(".essay-msg"), said, state === "failed" || state === "refused");
    // A new draft replaces what the box shows; otherwise the person's own edits stay as they are.
    if (shown && ta.dataset.original !== d.original) {
      ta.value = state === "used" ? d.text : d.original;
      ta.dataset.original = d.original;
    }
  }
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
    ? `Proof: ${p.company}, sent; the employer's page confirmed it${p.confirmation_id ? ` (${p.confirmation_id})` : ""}`
    : `Not confirmed: ${p.screenshot_after ? p.reason : "the page after the click could not be photographed"}. This is what the page showed.`);
  text($("proof-meta"), `Approved ${when(p.times?.approved_at)}, approval ${String(p.approval_hash || "").slice(0, 12)}`);
  const ol = $("proof-answers");
  ol.textContent = "";
  for (const a of p.approved_answers || []) {
    const li = document.createElement("li");
    li.textContent = `${a.label}: ${a.value}${a.provenance ? ` (${a.provenance})` : ""}`;
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
  if (!hash || syncing.size) return;
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
$("q-picks").onclick = async () => (qmsg(await send({ type: "queue-from-trainee" })), render());
$("q-start").onclick = async () => (qmsg(await send({ type: "queue-start", tabId: params.has("tab") ? tabId : undefined })), render());
$("q-skip").onclick = async () => (qmsg(await send({ type: "queue-skip" })), render());
$("q-stop").onclick = async () => (qmsg(await send({ type: "queue-stop" })), render());
$("q-clear").onclick = async () => (qmsg(await send({ type: "queue-clear" })), render());

chrome.storage.onChanged.addListener(() => render());
chrome.tabs.onActivated?.addListener(() => render());
chrome.tabs.onUpdated?.addListener((id) => id === tabId && render());
render();
