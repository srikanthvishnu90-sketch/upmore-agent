#!/usr/bin/env python3
"""Surgery part 2: JS changes for the 3-tab honest rebuild.
- Router: 3 tabs, legacy hash map, JS-generated nav
- Delete Money JS block
- Replace home renderers with the ranked queue
- Save->tracker rewire, Explore->home search, verified->researched
- New: queue engine, detector, deadlines, ledger, export/delete, bank beta
"""
import re, pathlib

P = pathlib.Path("/home/hatch/workspace/upmore/src/upmore-app-template.html")
s = P.read_text()

def del_function(src, sig):
    i = src.index(sig)
    j = src.index("{", i)
    depth = 0
    k = j
    while True:
        if src[k] == "{":
            depth += 1
        elif src[k] == "}":
            depth -= 1
            if depth == 0:
                break
        k += 1
    return src[:i] + src[k + 1:]

def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)

# ---------- toast was called but never defined ----------
rep("  /* ================= Router ================= */",
    """  function toast(msg) {
    let t = document.getElementById("upmoreToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "upmoreToast";
      t.style.cssText = "position:fixed;left:50%;bottom:calc(var(--bot,80px) + 16px);transform:translateX(-50%);background:#111;color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;z-index:9999;opacity:0;transition:opacity .25s;pointer-events:none;max-width:90vw;text-align:center;";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.style.opacity = "0"; }, 2200);
  }

  /* ================= Router ================= */""")

# ---------- Router: 3 tabs ----------
rep('const order = ["splash","welcome","time","about","situation","plan","phone","home","explore","save","guide","profile"];',
    '''const order = ["splash","welcome","time","about","situation","plan","phone","home","guide","profile"];
  const LEGACY_TABS = { money: "home", save: "home", explore: "home" };
  const TABS = [
    { id: "home", label: "Home", icon: '<path d="M3 10.5L12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>' },
    { id: "guide", label: "Guide", icon: '<path d="M12 3l2.1 6.4L20.5 11l-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-1.6z"/>' },
    { id: "profile", label: "You", icon: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c1.4-3.8 4.4-5.5 7.5-5.5s6.1 1.7 7.5 5.5"/>' }
  ];
  /* Single source of truth for the tab bar: every screen's <nav data-nav>
     is rendered from TABS, so tabs can never drift out of sync again. */
  function renderNav() {
    const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
    document.querySelectorAll("nav[data-nav]").forEach(nav => {
      nav.setAttribute("role", "tablist");
      nav.innerHTML = TABS.map(t =>
        `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === current}">${svg(t.icon)}${t.label}</button>`).join("");
      nav.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => show(b.dataset.tab));
    });
  }''')

rep("""  function show(id) {
    if (!$(id)) id = "splash";""",
    """  function show(id) {
    if (!$(id)) id = "splash";
    id = LEGACY_TABS[id] || id;
    if (!$(id)) id = "splash";""")

rep("""    if (id === "home") renderHome();
    if (id === "explore") renderExplore();
    if (id === "save") renderSave();
    if (id === "money") renderMoney();
    if (id === "guide") renderGuideEmpty();
    if (id === "profile") renderProfile();""",
    """    if (id === "home") renderHome();
    if (id === "guide") renderGuideEmpty();
    if (id === "profile") renderProfile();
    renderNav();""")

rep('  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => show(b.dataset.tab));\n', '')

# ---------- Delete Money JS ----------
a = s.index("  /* ================= Money: manage your finances ================= */")
b = s.index("  /* ================= Guide ================= */")
s = s[:a] + s[b:]
assert "renderMoney" not in s and "finance_alerts" not in s

# ---------- Delete old home renderers ----------
for sig in ["  function renderHome() {", "  function renderContinue() {",
            "  function renderMoreMoves(moves) {", "  async function renderHomeSubs() {",
            "  function renderHomePromos() {"]:
    s = del_function(s, sig)
# (call-site reps for renderHomeSubs happen below; final probes verify)

# ---------- New: queue engine + home + deadlines + ledger + extras ----------
NEW_JS = r'''
  /* ================= The queue: one ranked list (the CFO) =================
     score = dollars_at_stake x confidence x urgency(days_to_deadline) / effort_minutes
     Every card carries its inputs as data-* attributes so the ranking is
     auditable, and the top card states the math in plain words. */
  function qScore(dollars, conf, urg, eff) {
    return (Number(dollars) || 0) * conf * urg / Math.max(Number(eff) || 1, 1);
  }
  function qUrgency(days) {
    if (days == null || isNaN(days)) return 1;
    if (days <= 1) return 5;
    if (days <= 3) return 4;
    if (days <= 7) return 3;
    if (days <= 30) return 2;
    return 1;
  }
  function qDaysUntil(iso) {
    if (!iso) return null;
    const t = new Date(String(iso).slice(0, 10) + "T23:59:59");
    if (isNaN(t)) return null;
    return Math.ceil((t.getTime() - Date.now()) / 86400000);
  }
  function qDueText(days) {
    if (days == null) return "";
    if (days < 0) return Math.abs(days) + "d overdue";
    if (days === 0) return "today";
    return "in " + days + "d";
  }
  const qAnnual = sub => Number(sub.amount || 0) * (INT2MO[sub.billing_interval] || 1) * 12;
  const normMerch = m => String(m || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const qDollars = r => Number(r.payout_max ?? r.payout_min ?? 0) || 0;
  const qConf = r => r.status === "researched" ? 0.7 : 0.4;
  const qEffort = r => { const t = ((r.time_min_minutes ?? 0) + (r.time_max_minutes ?? 0)) / 2; return t > 0 ? t : 30; };

  async function buildQueue() {
    const cards = [];
    const d = planData();
    // earn: top ranked moves
    const moves = (d._moves || rankMoves()).slice(0, 6);
    moves.forEach(r => {
      const dollars = qDollars(r), conf = qConf(r), eff = qEffort(r);
      const urg = r.speed === "today" ? 2 : r.speed === "days" ? 1.5 : 1;
      cards.push({ type: "earn", id: "earn-" + r.id, title: routeTitle(r), sub: routeMeta(r),
        dollars, conf, urg, eff, cta: "Walk me through it", act: () => startWalkthrough(r.id),
        why: dollars > 0
          ? `$${Math.round(dollars)} x ${Math.round(conf * 100)}% / ${Math.round(eff)} min${urg > 1 ? " - pays fast" : ""}`
          : `Payout varies - researched ${Math.round(conf * 100)}%` });
    });
    // continue: the walkthrough already started
    const cont = Object.keys(prog).map(id => {
      const r = routeById(id);
      if (!r || !r.steps || !r.steps.length) return null;
      const done = (prog[id] || []).length;
      return (done > 0 && done < r.steps.length) ? { r, done } : null;
    }).filter(Boolean)[0];
    if (cont) {
      const dollars = qDollars(cont.r);
      const eff = Math.max((cont.r.steps.length - cont.done) * 3, 3);
      cards.push({ type: "continue", id: "cont-" + cont.r.id, title: "Continue: " + routeTitle(cont.r),
        sub: `Step ${cont.done + 1} of ${cont.r.steps.length}`, dollars, conf: 0.9, urg: 1.5, eff,
        cta: "Resume", act: () => startWalkthrough(cont.r.id),
        why: `Already started - $${Math.round(dollars)} x 90% / ${eff} min` });
    }
    if (saveUid()) {
      const subs = (await saveRows("save_subscriptions", "created_at", false))
        .filter(x => x.status !== "cancelled");
      // detector 1: possible duplicate recurring charges
      const groups = {};
      subs.forEach(x => { const k = normMerch(x.merchant); (groups[k] = groups[k] || []).push(x); });
      Object.values(groups).forEach(g => {
        if (g.length < 2) return;
        const dollars = g.slice(1).reduce((t, x) => t + qAnnual(x), 0);
        cards.push({ type: "duplicate", id: "dup-" + normMerch(g[0].merchant),
          title: `Possible duplicate: ${g[0].merchant}`,
          sub: `${g.length} active charges look like the same subscription`,
          dollars, conf: 0.8, urg: 1.5, eff: 3,
          cta: "Review", act: () => openSubSheet(g[1].id),
          why: `$${Math.round(dollars)}/yr at stake x 80% / 3 min` });
      });
      subs.forEach(x => {
        // detector 2: bill spike (amount raised vs what you last entered)
        if (x.previous_amount != null && Number(x.amount) > Number(x.previous_amount)) {
          const up = (Number(x.amount) - Number(x.previous_amount)) * (INT2MO[x.billing_interval] || 1) * 12;
          cards.push({ type: "spike", id: "spike-" + x.id,
            title: `${x.merchant} bill went up`,
            sub: `${money$(x.previous_amount)} -> ${money$(x.amount)}${INTPER[x.billing_interval] || ""} (+$${Math.round(up)}/yr)`,
            dollars: up, conf: 0.95, urg: 2, eff: 10,
            cta: "Review", act: () => openSubSheet(x.id),
            why: `+$${Math.round(up)}/yr x 95% / 10 min - price hike you entered` });
        }
        // detector 3: renewal approaching (date you entered)
        const bd = qDaysUntil(x.next_billing_date);
        if (bd != null && bd <= 14) {
          const per = Number(x.amount) || 0, urg = qUrgency(bd);
          cards.push({ type: "renewal", id: "ren-" + x.id,
            title: `${x.merchant} renews ${qDueText(bd)}`,
            sub: `${money$(x.amount)}${INTPER[x.billing_interval] || ""} - review before it renews`,
            dollars: per, conf: 1.0, urg, eff: 5,
            cta: "Review", act: () => openSubSheet(x.id),
            why: `$${per} x 100% / 5 min - renews ${qDueText(bd)}` });
        }
        // cancel candidate: every recurring charge is a keep-or-cut decision
        const annual = qAnnual(x);
        cards.push({ type: "cancel", id: "cancel-" + x.id,
          title: `Cancel ${x.merchant}`,
          sub: `Keep $${Math.round(annual)}/yr`, dollars: annual, conf: 1.0, urg: 1, eff: 5,
          cta: "Review", act: () => openSubSheet(x.id),
          why: `$${Math.round(annual)}/yr x 100% / 5 min` });
      });
      // deadline engine: renewals + claims you entered
      const rens = await saveRows("save_renewals", "renews_on", true);
      rens.filter(r => r.status === "upcoming").forEach(r => {
        const days = qDaysUntil(r.renews_on), urg = qUrgency(days);
        cards.push({ type: "renewal", id: "renewal-" + r.id, title: r.name,
          sub: `Renews ${qDueText(days)}${r.prep_notes ? " - " + r.prep_notes : ""}`,
          dollars: 0, conf: 1.0, urg, eff: 10,
          cta: "Mark done", act: () => deadlineDone("save_renewals", r.id),
          why: `Deadline ${qDueText(days)} - no dollars set, ranked on urgency` });
      });
      const claims = await saveRows("save_claims", "deadline", true);
      claims.filter(c => c.status === "open").forEach(c => {
        const days = qDaysUntil(c.deadline), urg = qUrgency(days);
        const dollars = Number(c.amount || 0);
        cards.push({ type: "deadline", id: "claim-" + c.id,
          title: c.merchant ? `${c.merchant} - ${c.kind}` : c.kind,
          sub: `${c.steps ? c.steps + " - " : ""}due ${qDueText(days)}`,
          dollars, conf: 0.9, urg, eff: 15,
          cta: "Mark claimed", act: () => deadlineDone("save_claims", c.id),
          why: `$${dollars} x 90% / 15 min - due ${qDueText(days)}` });
      });
      // claim: promos that fit
      D.routes.filter(r => ["Bank Bonus", "Brokerage Promo", "Signup Bonus"].includes(r.category)).slice(0, 3)
        .forEach(r => {
          const dollars = qDollars(r), conf = qConf(r), eff = qEffort(r);
          cards.push({ type: "claim", id: "claim-" + r.id, title: r.provider || "Promo",
            sub: String(r.reward || "").slice(0, 90), dollars, conf, urg: 1, eff,
            cta: "Start", act: () => openPromoSheet(r.id),
            why: `$${Math.round(dollars)} x ${Math.round(conf * 100)}% / ${Math.round(eff)} min` });
        });
    }
    cards.forEach(c => { c.score = qScore(c.dollars, c.conf, c.urg, c.eff); });
    cards.sort((a, b) => b.score - a.score);
    return cards;
  }

  async function renderQueue() {
    const box = $("queue");
    if (!box) return;
    const cards = await buildQueue();
    if (!cards.length) {
      box.innerHTML = `<p class="psub">Nothing queued yet - search above or track a subscription below.</p>`;
      return;
    }
    box.innerHTML = cards.map((c, i) => `
      <article class="qcard${i === 0 ? " top" : ""}" data-type="${c.type}"
        data-dollar="${Math.round(c.dollars)}" data-conf="${c.conf}" data-urg="${c.urg}"
        data-eff="${Math.round(c.eff)}" data-score="${c.score.toFixed(2)}">
        ${i === 0 ? `<p class="qtop">Up next</p>` : ""}
        <h4>${esc(c.title)}</h4>
        <p class="qm">${esc(c.sub)}</p>
        <p class="qwhy">${esc(c.why)}</p>
        <button class="qcta" data-qid="${esc(c.id)}">${esc(c.cta)}</button>
      </article>`).join("");
    const byId = Object.fromEntries(cards.map(c => [c.id, c]));
    box.querySelectorAll("[data-qid]").forEach(b => b.onclick = () => { const c = byId[b.dataset.qid]; if (c) c.act(); });
    const top = cards[0];
    const hs = $("homeSub");
    if (hs && top) hs.textContent = `Up next: ${top.title} - ${top.why}`;
  }

  async function deadlineDone(table, id) {
    try { await supa.from(table).update({ status: table === "save_claims" ? "claimed" : "done" }).eq("id", id); } catch (e) {}
    renderQueue(); renderDeadlines();
  }

  function renderHome() {
    const d = planData();
    const hr = new Date().getHours();
    const part = hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening";
    $("hello").textContent = `Good ${part}, ${d.name}`;
    const av = $("avatar");
    av.textContent = (d.name || "V").charAt(0).toUpperCase();
    av.onclick = () => show("profile");
    renderExplore();
    renderQueue();
    renderTracker();
  }

  /* ================= Deadlines & claims (Track section) ================= */
  async function renderDeadlines() {
    const box = $("deadlineList");
    if (!box) return;
    if (!saveUid()) { box.innerHTML = ""; return; }
    const [rens, claims] = await Promise.all([
      saveRows("save_renewals", "renews_on", true),
      saveRows("save_claims", "deadline", true)
    ]);
    const items = [
      ...rens.filter(r => r.status === "upcoming").map(r => ({ t: "save_renewals", id: r.id, name: r.name, date: r.renews_on, sub: r.kind || "renewal" })),
      ...claims.filter(c => c.status === "open").map(c => ({ t: "save_claims", id: c.id, name: c.merchant ? c.merchant + " - " + c.kind : c.kind, date: c.deadline, sub: (c.amount ? money$(c.amount) + " - " : "") + "due" }))
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    box.innerHTML = items.length ? items.map(it => {
      const days = qDaysUntil(it.date);
      return `<div class="item"><div class="grow"><p class="t">${esc(it.name)}</p>
        <p class="m">${esc(it.sub)} - ${esc(qDueText(days))}</p></div>
        <button class="linkbtn" data-done="${it.t}:${it.id}">Done</button></div>`;
    }).join("") : `<div class="item"><div class="grow"><p class="m">No deadlines tracked - add renewals and claims below.</p></div></div>`;
    box.querySelectorAll("[data-done]").forEach(b => b.onclick = () => {
      const [t, id] = b.dataset.done.split(":");
      deadlineDone(t, id);
    });
  }
  let dlWired = false;
  function wireDeadlines() {
    if (dlWired) return; dlWired = true;
    $("dlAdd").onclick = async () => {
      const name = $("dlName").value.trim(), date = $("dlDate").value, kind = $("dlKind").value;
      if (!name || !date) { toast("Give it a name and a date"); return; }
      const amt = parseFloat($("dlAmount").value);
      const notes = $("dlNotes").value.trim();
      $("dlAdd").disabled = true;
      let ok = false;
      if (kind === "renewal") {
        ok = await saveInsert("save_renewals", { name, renews_on: date, kind: "renewal", prep_notes: notes, status: "upcoming" });
      } else {
        ok = await saveInsert("save_claims", { merchant: name, kind, amount: amt > 0 ? amt : null, deadline: date, steps: notes, status: "open" });
      }
      $("dlAdd").disabled = false;
      if (ok) { ["dlName", "dlDate", "dlAmount", "dlNotes"].forEach(id => $(id).value = ""); renderDeadlines(); renderQueue(); toast("Tracked"); }
    };
  }

  /* ================= Money log (You tab) =================
     Backed by save_ledger. Totals are computed live as SUM(amount):
     a reversal inserts an offsetting entry and flags the original.
     Entries are never edited or deleted. */
  const LEDGER_BUCKETS = ["Received", "Avoided", "Reduced", "Cash flow", "Found"];
  async function renderLedger() {
    const box = $("ledgerList"), tots = $("ledgerTotals");
    if (!box || !tots) return;
    if (!saveUid()) { tots.innerHTML = ""; box.innerHTML = `<p class="psub">Sign in to keep your money log.</p>`; return; }
    const rows = await saveRows("save_ledger", "occurred_on", false);
    const sums = {};
    LEDGER_BUCKETS.forEach(b => sums[b] = 0);
    rows.forEach(r => { if (sums[r.bucket] !== undefined) sums[r.bucket] += Number(r.amount || 0); });
    tots.innerHTML = LEDGER_BUCKETS.map(b =>
      `<div class="ledgertot"><b>${money$(sums[b])}</b><span>${b}</span></div>`).join("");
    box.innerHTML = rows.length ? rows.map(r => `
      <div class="item"><div class="grow${r.reversed ? " lrev" : ""}">
        <p class="t">${esc(r.title)}${Number(r.amount) < 0 ? " (reversal)" : ""}</p>
        <p class="m num">${money$(r.amount)} - ${esc(r.bucket)} - ${esc(r.occurred_on || "")}${r.detail ? " - " + esc(r.detail) : ""}</p>
      </div>${!r.reversed && Number(r.amount) !== 0 ? `<button class="linkbtn" data-rev="${r.id}">Reverse</button>` : ""}</div>`
    ).join("") : `<div class="item"><div class="grow"><p class="m">$0.00 - log your first real result below.</p></div></div>`;
    box.querySelectorAll("[data-rev]").forEach(b => b.onclick = () => ledgerReverse(b.dataset.rev, rows));
  }
  async function ledgerReverse(id, rows) {
    const r = (rows || []).find(x => String(x.id) === String(id));
    if (!r || r.reversed) return;
    await saveInsert("save_ledger", {
      bucket: r.bucket, amount: -Number(r.amount || 0),
      title: "Reversal: " + r.title, detail: r.detail || "",
      occurred_on: new Date().toISOString().slice(0, 10)
    });
    try { await supa.from("save_ledger").update({ reversed: true }).eq("id", r.id); } catch (e) {}
    renderLedger();
  }
  let ledgerWired = false;
  function wireLedger() {
    if (ledgerWired) return; ledgerWired = true;
    $("ledgerAdd").onclick = () => {
      $("ledgerForm").hidden = !$("ledgerForm").hidden;
      if (!$("ledgerForm").hidden && !$("lgDate").value) $("lgDate").value = new Date().toISOString().slice(0, 10);
    };
    $("lgCancel").onclick = () => { $("ledgerForm").hidden = true; };
    $("lgSave").onclick = async () => {
      const amt = parseFloat($("lgAmount").value);
      const title = $("lgTitle").value.trim();
      if (!(amt > 0) || !title) { toast("Add an amount and a note"); return; }
      $("lgSave").disabled = true;
      const ok = await saveInsert("save_ledger", {
        bucket: $("lgType").value, amount: amt, title, detail: "",
        occurred_on: $("lgDate").value || new Date().toISOString().slice(0, 10)
      });
      $("lgSave").disabled = false;
      if (ok) { ["lgAmount", "lgTitle"].forEach(id => $(id).value = ""); $("ledgerForm").hidden = true; renderLedger(); toast("Logged"); }
    };
  }

  /* ================= You extras: bank beta, export, delete ================= */
  let youExtrasWired = false;
  function wireYouExtras() {
    if (youExtrasWired) return; youExtrasWired = true;
    $("bankBetaRow").onclick = () => {
      const em = (typeof session !== "undefined" && session && session.user && session.user.email) || "";
      if (em) $("bankEmail").value = em;
      $("bankStatus").textContent = "";
      $("bankSheet").hidden = false;
    };
    $("bankClose").onclick = () => { $("bankSheet").hidden = true; };
    $("bankSheet").addEventListener("click", e => { if (e.target.id === "bankSheet") $("bankSheet").hidden = true; });
    $("bankNotify").onclick = async () => {
      const email = $("bankEmail").value.trim();
      if (!email || email.indexOf("@") < 0) { $("bankStatus").textContent = "Enter a valid email."; return; }
      try {
        const { error } = await supa.from("finance_waitlist").upsert({ user_id: saveUid(), email }, { onConflict: "email" });
        $("bankStatus").textContent = error ? "Something went wrong - try again." : "You're on the list. We'll email your invite.";
      } catch (e) { $("bankStatus").textContent = "Something went wrong - try again."; }
    };
    $("exportData").onclick = exportUserData;
    wireDeleteSheet();
  }
  async function exportUserData() {
    if (!saveUid()) { toast("Sign in to export"); return; }
    const tables = ["save_subscriptions", "save_ledger", "save_renewals", "save_claims", "save_receipts"];
    const out = { exported_at: new Date().toISOString(), user_id: saveUid() };
    for (const t of tables) out[t] = await saveRows(t, "created_at", false);
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "upmore-data.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("Downloaded");
  }
  let deleteWired = false;
  function wireDeleteSheet() {
    if (deleteWired) return; deleteWired = true;
    $("deleteData").onclick = () => {
      $("deleteConfirmInput").value = "";
      $("deleteStatus").textContent = "";
      $("deleteConfirmBtn").disabled = true;
      $("deleteConfirmBtn").style.opacity = 0.5;
      $("deleteSheet").hidden = false;
    };
    $("deleteClose").onclick = () => { $("deleteSheet").hidden = true; };
    $("deleteCancel").onclick = () => { $("deleteSheet").hidden = true; };
    $("deleteSheet").addEventListener("click", e => { if (e.target.id === "deleteSheet") $("deleteSheet").hidden = true; });
    $("deleteConfirmInput").oninput = e => {
      const ok = e.target.value.trim() === "DELETE";
      $("deleteConfirmBtn").disabled = !ok;
      $("deleteConfirmBtn").style.opacity = ok ? 1 : 0.5;
    };
    $("deleteConfirmBtn").onclick = async () => {
      $("deleteConfirmBtn").disabled = true;
      $("deleteStatus").textContent = "Deleting...";
      const uid = saveUid();
      try {
        for (const t of ["save_subscriptions", "save_ledger", "save_renewals", "save_claims", "save_receipts"]) {
          await supa.from(t).delete().eq("user_id", uid);
        }
        try { await supa.functions.invoke("delete-account"); } catch (e) {}
        try { await supa.auth.signOut(); } catch (e) {}
      } catch (e) {}
      session = null; dbProfile = null;
      $("deleteSheet").hidden = true;
      show("welcome");
    };
  }

'''
rep("  /* ================= Save (subscriptions) ================= */", NEW_JS + "  /* ================= Save (subscriptions) ================= */")

# ---------- Save section rewire ----------
rep("""  async function renderSave() {
    const signed = !!(await getSessionToken());
    $("saveSignedOut").hidden = signed;
    $("saveSignedIn").hidden = !signed;
    if (!signed) return;
    renderSubs();
  }""",
    """  async function renderTracker() {
    const signed = !!(await getSessionToken());
    $("saveSignedOut").hidden = signed;
    $("saveSignedIn").hidden = !signed;
    if (!signed) return;
    renderSubs();
    renderDeadlines();
  }""")

rep("""      const ok = await saveInsert("save_subscriptions", {
        merchant: m, amount: amt, currency: "USD",
        billing_interval: $("subInterval").value,
        status: "active", detected_via: "manual",
      });
      b.disabled = false;
      if (ok) { ["subMerchant", "subAmount"].forEach(id => $(id).value = ""); renderSubs(); renderHomeSubs(); }""",
    """      const nb = $("subNextBill").value || null;
      const ok = await saveInsert("save_subscriptions", {
        merchant: m, amount: amt, currency: "USD",
        billing_interval: $("subInterval").value,
        next_billing_date: nb,
        status: "active", detected_via: "manual",
      });
      b.disabled = false;
      if (ok) { ["subMerchant", "subAmount"].forEach(id => $(id).value = ""); $("subNextBill").value = ""; renderSubs(); renderQueue(); }""")

# openSubSheet: wire the update controls
rep('    $("subSheetMeta").textContent = `${money$(s.amount)}${INTPER[s.billing_interval] || ""}`;',
    '''    $("subSheetMeta").textContent = `${money$(s.amount)}${INTPER[s.billing_interval] || ""}`;
    $("subEditAmount").value = s.amount != null ? s.amount : "";
    $("subEditBill").value = s.next_billing_date || "";
    $("subUpdateBtn").onclick = async () => {
      const na = parseFloat($("subEditAmount").value);
      const nb = $("subEditBill").value || null;
      const updates = {};
      if (na > 0 && na !== Number(s.amount)) {
        updates.previous_amount = s.amount;
        updates.previous_amount_at = new Date().toISOString();
        updates.amount = na;
      }
      if (nb !== (s.next_billing_date || null)) updates.next_billing_date = nb;
      if (!Object.keys(updates).length) { $("subSheet").hidden = true; return; }
      $("subUpdateBtn").disabled = true;
      try { await supa.from("save_subscriptions").update(updates).eq("id", s.id); } catch (e) {}
      $("subUpdateBtn").disabled = false;
      $("subSheet").hidden = true;
      toast("Updated");
      renderSubs(); renderQueue();
    };''')

# openSubSheet cancel handler: refresh queue too
rep("""      renderSubs(); renderHomeSubs();
      show("guide");""",
    """      renderSubs(); renderQueue();
      show("guide");""")
rep("""    $("subAdd").onclick = async () => {""",
    """    wireDeadlines();
    $("subAdd").onclick = async () => {""", count=1)

# ---------- Explore -> home search ----------
rep("    loadListings();\n", "")
rep('const verifiedBadge = r.status === "verified" ? `<span class="vbadge">✓ Verified</span>` : "";',
    'const researchedBadge = r.status === "researched" ? `<span class="vbadge">\\u2713 Researched</span>` : "";')
rep("${verifiedBadge}", "${researchedBadge}")
rep('const xState = { q: "", tier: "all", cat: "all", speed: "all", lane: false, shown: 40 };',
    'const xState = { q: "", tier: "all", cat: "all", speed: "all", lane: false, shown: 12 };')

# ---------- Guide: verified -> researched ----------
rep('const verified = r.status === "verified";', 'const researched = r.status === "researched";')
rep('${verified ? " Checked against " + r.provider + "\'s own official terms." : ""}',
    '${researched ? " Researched against " + r.provider + "\'s own official terms - confirm live terms before you start." : ""}')
rep("if (!verified)", "if (!researched)")
rep("we haven't verified the live terms on this one yet.",
    "we haven't researched this one against the provider's official terms yet.")
rep('const nv = D.routes.filter(r => r.status === "verified").length;',
    'const nv = D.routes.filter(r => r.status === "researched").length;')
rep("are verified against the provider's own official terms",
    "are researched against the provider's own official terms")
rep('"The rest are researched but not yet verified — I\'ll confirm them against the provider\'s own page before you start anything.",',
    '"The rest aren\'t researched yet — I\'ll confirm them against the provider\'s own page before you start anything.",')

# ---------- renderProfile: ledger + extras ----------
rep('''    $("signOut").onclick = async () => {''',
    '''    renderLedger(); wireLedger(); wireYouExtras();
    $("signOut").onclick = async () => {''', count=1)

# ---------- Boot: 3-tab allowlist + legacy hashes ----------
rep('const tab = order.includes(h) && ["home", "explore", "save", "guide", "profile"].includes(h) ? h : "home";',
    'const hh0 = LEGACY_TABS[h] || h;\n      const tab = order.includes(hh0) && ["home", "guide", "profile"].includes(hh0) ? hh0 : "home";')
rep('if (order.includes(h) && h !== "splash") { show(h); bootDone = true; }',
    'const hh1 = LEGACY_TABS[h] || h;\n    if (order.includes(hh1) && hh1 !== "splash") { show(hh1); bootDone = true; }')

P.write_text(s)
print("part 2 done:", len(s), "bytes")
for probe in ["renderMoney", "finance_alerts", '"verified"', "renderHomeSubs", "loadListings", "show(\"save\")", "show(\"explore\")", "show(\"money\")"]:
    print(f"  {probe!r}: {s.count(probe)}")
assert "renderHomeSubs" not in s and "renderMoreMoves" not in s and "loadListings" not in s
print("asserts OK")
