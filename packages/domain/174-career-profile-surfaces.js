"use strict";
/* 174-career-profile-surfaces.js — FRONTEND LANE C (owner direction
 * 2026-10-21 16:32 CDT, frontend-first): the onboarding / profile /
 * resume SURFACES over today's engines. This module builds nothing the
 * engines already do; it shapes what the user SEES and TAPS:
 *
 *   1. FACTS IMPORT FLOW — 170's parse of pasted text becomes a review:
 *      every item carries its PROVENANCE LABEL (stated source + the
 *      verbatim span it came from + its confirmation state). Staging an
 *      import writes 122 drafts (needs_confirmation, status "draft") —
 *      nothing lands confirmed. Confirm/discard happen per item and
 *      only through 122's confirmFact / a discard patch that keeps the
 *      fact quarantined under 167 (status "discarded" + the explicit
 *      hold flag), so a discarded fact is unreachable, never deleted
 *      silently and never served.
 *   2. PROFILE EDITOR — the bank split by 167's cleared/quarantined
 *      line into labeled groups (confirmed / waiting / discarded),
 *      plus 169's gap list as the honest "what's missing" surface.
 *      Editing never overwrites: proposeEdit adds a NEW draft that
 *      supersedes the old fact; the old value stays served by 167
 *      until confirmEdit confirms the draft AND retires the original.
 *   3. DOCUMENT LINKS — 165's resume (+ parse-back gate: a resume
 *      whose parse-back is not PASS is never issued) and 168's cover
 *      letter become WO-028 document descriptors: bytes land in the
 *      PRIVATE bucket `careers-resumes` under the user's own prefix
 *      (model JSON alongside the resume), and chat delivery rides the
 *      channel_artifacts signed-link path (HMAC, 600 s). A descriptor
 *      never contains a public storage URL.
 *   4. CONNECTIONS SKELETON — one screen model, personal/groups
 *      toggle, honest empty states. Entries only ever pass through
 *      from the caller (engines 156–164 own the real records); this
 *      surface fabricates no people.
 *
 * Pure view-model + flow logic: no I/O, no model calls, deterministic.
 * Sibling engines resolve lazily (opts.deps wins; then a relative
 * require; then the global), exactly the 168 reader-seam pattern, and
 * every surface fails CLOSED (named state) when its engine is absent.
 * UMD like the other domain modules. */
const CareerProfileSurfaces = (() => {
  const VERSION = 1;
  const BUCKET = "careers-resumes"; // WO-028 verdict: this is the only resumes bucket; private.
  const ARTIFACT_TTL_MS = 7 * 24 * 3600 * 1000; // channel_artifacts row lifetime (serve-leg shape)
  const LINK_TTL_SECONDS = 600; // signedArtifactUrl expiry, proven in the WO-028 serving leg

  function lazyRequire(name) {
    try { return require(`./${name}`); } catch { return null; }
  }
  function deps(opts) {
    const o = (opts && opts.deps) || {};
    return {
      p122: o.p122 || lazyRequire("122-career-profile.js") || globalThis.CareerProfile || null,
      p167: o.p167 || lazyRequire("167-career-trusted-facts.js") || globalThis.CareerTrustedFacts || null,
      p169: o.p169 || lazyRequire("169-career-profile-structure.js") || globalThis.CareerProfileStructure || null,
      p165: o.p165 || lazyRequire("165-career-resume-structure.js") || globalThis.CareerResumeStructure || null,
      p168: o.p168 || lazyRequire("168-career-cover-letter.js") || globalThis.CareerCoverLetter || null,
    };
  }
  const cleanStr = (x) => (x == null ? "" : String(x).trim());
  const sha256hex = (buf) => require("node:crypto").createHash("sha256").update(buf).digest("hex");

  /* ---------------- provenance labels ----------------
   * The label is the surface's honesty contract: WHERE a value came
   * from (source), the user's EXACT words it was read from (span at
   * [start,end) in the pasted text), and its confirmation state.
   * A value with no span says so — a label is never dressed up. */
  function provenanceLabel(state, prov) {
    const p = prov && typeof prov === "object" ? prov : {};
    const span = p.span != null ? String(p.span) : null;
    return {
      state, // "confirmed" | "needs_confirmation" | "unparsed" | "discarded" | "superseded"
      source: p.source || null,
      span,
      start: typeof p.start === "number" ? p.start : null,
      end: typeof p.end === "number" ? p.end : null,
      verbatim: span != null,
      display:
        state === "confirmed" ? `Confirmed — from your words: “${span == null ? "(no span recorded)" : span}”`
        : state === "needs_confirmation" ? `Not confirmed yet — you typed: “${span == null ? "(no span recorded)" : span}”`
        : state === "unparsed" ? `Couldn't read this yet — your words: “${span == null ? "" : span}”`
        : state === "discarded" ? "Discarded by you — kept out of your profile"
        : state === "superseded" ? "Replaced by a newer confirmed value"
        : state,
    };
  }

  /* ---------------- 1. facts import flow ----------------
   * importReview is PURE (no bank writes): it shapes 170's output
   * into review items. stageImport performs the 122 draft writes.
   * Decisions are applied by applyImportDecisions — the only path by
   * which an imported item becomes confirmed. */
  function importReview(parseResult, opts) {
    const r = parseResult && typeof parseResult === "object" ? parseResult : {};
    const items = [];
    const basics = r.basics && typeof r.basics === "object" ? r.basics : {};
    const bprov = r.basicsProvenance && typeof r.basicsProvenance === "object" ? r.basicsProvenance : {};
    const basicFields = [];
    for (const field of ["name", "email", "phone", "location"]) {
      if (basics[field] != null && basics[field] !== "") basicFields.push({ field, value: basics[field], prov: bprov[field] });
    }
    if (basics.links && basics.links.linkedin) basicFields.push({ field: "linkedin", value: basics.links.linkedin, prov: bprov.linkedin });
    for (const b of basicFields) {
      items.push({
        review_id: `imb_${b.field}`, type: "basic", field: b.field, value: b.value,
        label: provenanceLabel("needs_confirmation", Object.assign({ source: (r.meta && r.meta.source) || "texted-facts" }, b.prov || {})),
        actions: ["confirm", "discard"],
      });
    }
    (Array.isArray(r.facts) ? r.facts : []).forEach((f, i) => {
      items.push({
        review_id: `imp_${i + 1}`, type: "fact", index: i,
        kind: f.kind || "other", title: f.title || f.name || "",
        text: f.text || "",
        fact: f, // the 170 draft record, carried verbatim into staging
        label: provenanceLabel("needs_confirmation", f.provenance || { source: f.source || (r.meta && r.meta.source) || "texted-facts", span: f.text || null }),
        actions: ["confirm", "discard"],
      });
    });
    const unparsed = (Array.isArray(r.unparsed) ? r.unparsed : []).map((u, i) => ({
      review_id: `imu_${i + 1}`, type: "unparsed", text: u.text || "",
      reason: u.reason || "unparsed",
      label: provenanceLabel("unparsed", { source: (r.meta && r.meta.source) || "texted-facts", span: u.span != null ? u.span : u.text, start: u.start, end: u.end }),
      actions: [], // nothing to confirm: the words stay visible until the user rephrases them
    }));
    return {
      kind: "career_import_review", version: VERSION,
      items, unparsed,
      counts: {
        basics: items.filter((x) => x.type === "basic").length,
        facts: items.filter((x) => x.type === "fact").length,
        unparsed: unparsed.length,
      },
      meta: r.meta || null,
    };
  }

  function stageImport(profile, review, opts) {
    const d = deps(opts);
    if (!d.p122) return { ok: false, reason: "profile_model_unavailable", staged_fact_ids: [], pending_basics: [] };
    if (!profile || !Array.isArray(profile.facts)) return { ok: false, reason: "no_profile", staged_fact_ids: [], pending_basics: [] };
    const staged_fact_ids = [];
    const idByReview = {};
    for (const item of (review && review.items) || []) {
      if (item.type !== "fact") continue;
      const draft = Object.assign({}, item.fact, { needs_confirmation: true, status: "draft" });
      const stored = d.p122.addFact(profile, draft);
      staged_fact_ids.push(stored.id);
      idByReview[item.review_id] = stored.id;
    }
    const pending_basics = ((review && review.items) || [])
      .filter((x) => x.type === "basic")
      .map((x) => ({ review_id: x.review_id, field: x.field, value: x.value, label: x.label }));
    return { ok: true, staged_fact_ids, idByReview, pending_basics, review_id_by_fact_id: Object.fromEntries(Object.entries(idByReview).map(([k, v]) => [v, k])) };
  }

  function applyImportDecisions(profile, review, staging, decisions, opts) {
    const d = deps(opts);
    if (!d.p122) return { ok: false, reason: "profile_model_unavailable" };
    const dec = decisions && typeof decisions === "object" ? decisions : {};
    const receipt = { ok: true, confirmed: [], discarded: [], basics_confirmed: [], basics_discarded: [], still_pending: [], unknown: [] };
    const pendingBasics = new Map(((staging && staging.pending_basics) || []).map((b) => [b.review_id, b]));
    const known = new Set(((review && review.items) || []).map((x) => x.review_id));
    for (const [reviewId, action] of Object.entries(dec)) {
      if (!known.has(reviewId)) { receipt.unknown.push(reviewId); continue; }
      if (action !== "confirm" && action !== "discard") { receipt.unknown.push(reviewId); continue; }
      const factId = staging && staging.idByReview ? staging.idByReview[reviewId] : null;
      if (factId) {
        const f = d.p122.getFact(profile, factId);
        if (!f) { receipt.unknown.push(reviewId); continue; }
        if (action === "confirm") {
          if (f.status !== "confirmed") d.p122.confirmFact(profile, factId);
          receipt.confirmed.push(factId);
        } else {
          // Discard keeps the record (the user can see what was kept
          // out) but pins it inside 167's quarantine three ways.
          d.p122.updateFact(profile, factId, { status: "discarded", needs_confirmation: true, quarantined: true });
          receipt.discarded.push(factId);
        }
        continue;
      }
      const basic = pendingBasics.get(reviewId);
      if (basic) {
        if (action === "confirm") {
          profile.basics = profile.basics || { name: null, email: null, phone: null, location: null, links: {} };
          if (basic.field === "linkedin") {
            profile.basics.links = profile.basics.links || {};
            profile.basics.links.linkedin = basic.value;
          } else {
            profile.basics[basic.field] = basic.value;
          }
          profile.basics._provenance = Object.assign({}, profile.basics._provenance || {}, { [basic.field]: basic.label });
          receipt.basics_confirmed.push(basic.field);
        } else {
          receipt.basics_discarded.push(basic.field);
        }
        continue;
      }
      receipt.unknown.push(reviewId);
    }
    const decided = new Set(Object.keys(dec).filter((k) => known.has(k)));
    for (const item of (review && review.items) || []) {
      if (!decided.has(item.review_id)) receipt.still_pending.push(item.review_id);
    }
    return receipt;
  }

  /* ---------------- 2. profile editor ---------------- */
  function factLabel(f) {
    if (f.status === "discarded") return provenanceLabel("discarded", f.provenance);
    if (f.status === "superseded") return provenanceLabel("superseded", f.provenance);
    const cleared = !(f.needs_confirmation === true || f.quarantined === true ||
      ["draft", "quarantined", "held", "suppressed"].includes(f.status));
    return provenanceLabel(cleared ? "confirmed" : "needs_confirmation",
      f.provenance || { source: f.source || null, span: f.text || null });
  }
  function unconfirmedReason(f) {
    if (f.needs_confirmation) return "waiting for your confirmation";
    if (f.quarantined === true) return "on hold";
    if (["quarantined", "held", "suppressed"].includes(f.status)) return `on hold (${f.status})`;
    if (f.status === "draft") return "waiting for your confirmation";
    return "not confirmed";
  }

  function profileEditor(profile, opts) {
    const d = deps(opts);
    if (!d.p167) return { ok: false, reason: "trusted_reader_unavailable" };
    if (!profile || !Array.isArray(profile.facts)) return { ok: false, reason: "no_profile" };
    const trusted = d.p167.trustedFacts(profile);
    const trustedIds = new Set(trusted.map((f) => f.id));
    const entry = (f, group) => ({
      fact_id: f.id, kind: f.kind, title: f.title || f.name || "", text: f.text || "",
      group, label: factLabel(f),
      reason: group === "unconfirmed" ? unconfirmedReason(f) : null,
      supersedes: f.provenance && f.provenance.supersedes ? f.provenance.supersedes : null,
      actions: group === "confirmed" ? ["edit"] : group === "unconfirmed" ? ["confirm", "discard", "edit"] : [],
    });
    const confirmed = [], unconfirmed = [], discarded = [], superseded = [];
    for (const f of profile.facts) {
      if (f.status === "discarded") { discarded.push(entry(f, "discarded")); continue; }
      if (f.status === "superseded") { superseded.push(entry(f, "superseded")); continue; }
      if (trustedIds.has(f.id)) confirmed.push(entry(f, "confirmed"));
      else unconfirmed.push(entry(f, "unconfirmed"));
    }
    let gaps = [], headline = null;
    if (d.p169) {
      const model = d.p169.buildProfile({ user_id: (opts && opts.user_id) || profile.id || null, facts: profile.facts, stated_facts: (opts && opts.stated_facts) || [] });
      gaps = model.gaps || [];
      headline = model.headline ? (model.headline.text || null) : null;
    }
    return {
      ok: true, kind: "career_profile_editor", version: VERSION,
      basics: profile.basics || null,
      headline, confirmed, unconfirmed, discarded, superseded, gaps,
      counts: { confirmed: confirmed.length, unconfirmed: unconfirmed.length, discarded: discarded.length, superseded: superseded.length, gaps: gaps.length },
    };
  }

  // Editing is a proposal, never an overwrite: a new draft that
  // supersedes the original. 167 keeps serving the original until
  // confirmEdit lands.
  function proposeEdit(profile, factId, newText, opts) {
    const d = deps(opts);
    if (!d.p122) return { ok: false, reason: "profile_model_unavailable" };
    const orig = d.p122.getFact(profile, factId);
    if (!orig) return { ok: false, reason: "fact_not_found", fact_id: factId };
    if (orig.status === "discarded") return { ok: false, reason: "fact_discarded", fact_id: factId };
    const text = cleanStr(newText);
    if (!text) return { ok: false, reason: "empty_edit", fact_id: factId };
    const draft = d.p122.addFact(profile, {
      kind: orig.kind, title: orig.title, name: orig.name, text,
      bullets: [], skills: Array.isArray(orig.skills) ? orig.skills.slice() : [],
      source: "profile_edit", needs_confirmation: true, status: "draft",
      provenance: { source: "profile_edit", supersedes: factId, span: null, verbatim: text },
    });
    return { ok: true, draft_id: draft.id, replaces: factId, note: "Your current value stays in place until you confirm the new one." };
  }

  function confirmEdit(profile, draftId, opts) {
    const d = deps(opts);
    if (!d.p122) return { ok: false, reason: "profile_model_unavailable" };
    const draft = d.p122.getFact(profile, draftId);
    if (!draft) return { ok: false, reason: "fact_not_found", fact_id: draftId };
    const replaces = draft.provenance && draft.provenance.supersedes;
    if (!replaces) return { ok: false, reason: "not_an_edit_draft", fact_id: draftId };
    d.p122.confirmFact(profile, draftId);
    const orig = d.p122.getFact(profile, replaces);
    if (orig && orig.status !== "superseded") {
      d.p122.updateFact(profile, replaces, { status: "superseded", needs_confirmation: true, quarantined: true });
    }
    return { ok: true, confirmed: draftId, superseded: replaces };
  }

  /* ---------------- 3. document links (WO-028) ----------------
   * 169 model -> 165 input adapter. ADAPTER LAW (compose-leg): only
   * values that appear verbatim in the model's provenanced records
   * cross; nothing is added, rounded or inferred. */
  function adapter169to165(model, opts) {
    const v = (x) => (x == null ? undefined : (typeof x === "object" && "value" in x ? x.value : x));
    const txt = (x) => (x == null ? undefined : (typeof x === "object" && "text" in x ? x.text : v(x)));
    const m = model || {};
    const edu = (m.education || []).map((e) => ({
      school: txt(e.school),
      degree_text: [e.degree && e.degree.value && e.degree.value.display,
        e.fields_of_study && e.fields_of_study[0] && e.fields_of_study[0].value].filter(Boolean).join(" — ") || undefined,
      dates: e.span && e.span.text,
      gpa: e.gpa && typeof e.gpa.value === "number" ? e.gpa.value : undefined,
      gpa_scale: e.gpa && e.gpa.scale != null ? String(e.gpa.scale) : undefined,
      notes: (e.notes || []).map((n) => (typeof n === "string" ? n : n.value)).filter(Boolean),
    }));
    const exp = (m.experience || []).map((x) => ({
      org: txt(x.org), role: txt(x.title) || txt(x.role), dates: x.span && x.span.text,
      bullets: (x.bullets || []).map((b) => (typeof b === "string" ? b : (b.text || b.value || String(b)))),
    }));
    const skills = (m.skills || []).length
      ? m.skills.map((s) => ({ label: txt(s.label) || "Skills", items: (s.items || s.skills || []).map((i) => (typeof i === "string" ? i : (i.text || i.value || String(i)))) }))
      : [];
    return {
      name: m.contact && m.contact.name ? m.contact.name.value : undefined,
      city: m.contact ? txt(m.contact.city) : undefined,
      phone: m.contact ? txt(m.contact.phone) : undefined,
      email: m.contact ? txt(m.contact.email) : undefined,
      linkedin: m.contact ? txt(m.contact.linkedin) : undefined,
      education: edu, experience: exp, skills,
      certifications: (m.certifications || []).map((c) => ({ name: txt(c.name) || txt(c) })),
      work_authorized: opts && typeof opts.work_authorized === "boolean" ? opts.work_authorized : undefined,
    };
  }

  function documentDescriptor(kindName, filename, mime, buf, extra) {
    return Object.assign({
      kind: kindName, state: "ready",
      filename, mime, bytes_len: buf.length, sha256: sha256hex(buf),
      storage: { bucket: BUCKET, visibility: "private" }, // path bound to the user at issue time
      link: { style: "signed", ttl_seconds: LINK_TTL_SECONDS, note: "Private signed link, minted by the channel layer at send time. Never a public storage URL." },
    }, extra || {});
  }

  function issueDocuments(profile, opts) {
    const o = opts || {};
    const d = deps(o);
    const userId = o.user_id || (profile && profile.id) || null;
    const now = typeof o.now === "number" ? o.now : Date.now();
    const out = { kind: "career_documents", version: VERSION, user_id: userId, documents: [], slots: {} };
    if (!userId) { out.slots.resume = { state: "blocked", reason: "user_id_missing" }; out.slots.cover_letter = { state: "blocked", reason: "user_id_missing" }; return out; }
    // Confirmed basics are the user's stated contact facts; they reach
    // 169 as stated_facts (its contact block keys on kind "contact").
    // Unconfirmed basics never reach the profile, so they never reach
    // a document.
    const basics = (profile && profile.basics) || {};
    const stated = [];
    for (const [key, val] of [["name", basics.name], ["email", basics.email], ["phone", basics.phone], ["city", basics.location], ["linkedin", basics.links && basics.links.linkedin]]) {
      if (val != null && val !== "") stated.push({ kind: "contact", key, value: val });
    }
    const statedAll = stated.concat(Array.isArray(o.stated_facts) ? o.stated_facts : []);
    // --- resume: 169 -> adapter -> 165, parse-back is the gate ---
    if (!d.p169 || !d.p165) {
      out.slots.resume = { state: "blocked", reason: "resume_engine_unavailable" };
    } else {
      const model = d.p169.buildProfile({ user_id: userId, facts: (profile && profile.facts) || [], stated_facts: statedAll });
      const built = d.p165.buildResume(adapter169to165(model, o));
      if (!built.pdf || !built.pdf.ok) {
        out.slots.resume = { state: "blocked", reason: "resume_render_refused" };
      } else {
      const buf = Buffer.from(built.pdf.buffer);
      const pass = !!(built.parseBack && built.parseBack.status === "PASS");
      const desc = documentDescriptor("resume", built.pdf.filename, built.pdf.contentType || "application/pdf", buf, {
        parse_back: built.parseBack, model_gaps: (built.model.gaps || []).map((g) => g.code || g),
        _bytes: buf, _model: built.model,
      });
      desc.storage.path = `${userId}/${built.pdf.filename}`;
      desc.storage.alongside = `${userId}/${built.pdf.filename}.model.json`;
      desc.artifact = { table: "channel_artifacts", kind: "document", filename: built.pdf.filename, mime: desc.mime, sha256: desc.sha256, expires_at: new Date(now + ARTIFACT_TTL_MS).toISOString() };
      if (!pass) { desc.state = "blocked_parse_back"; desc.reason = "parse-back did not PASS — a resume that fails its own read-back is never issued"; }
      out.documents.push(desc);
      out.slots.resume = { state: desc.state, filename: desc.filename, sha256: desc.sha256 };
      }
    }
    // --- cover letter: 168 through the real 167 reader ---
    if (!o.posting) {
      out.slots.cover_letter = { state: "needs_posting", reason: "a cover letter is written for one role — pick the posting first" };
    } else if (!d.p168) {
      out.slots.cover_letter = { state: "blocked", reason: "cover_letter_engine_unavailable" };
    } else {
      const letter = d.p168.buildCoverLetter(profile, o.posting, { reader: d.p167 ? (p) => d.p167.trustedFacts(p) : undefined });
      if (!letter.ok) {
        out.slots.cover_letter = { state: "blocked", reason: letter.reason || "letter_not_built", gaps: letter.gaps || [] };
      } else if (letter.files && letter.files.pdf) {
        const buf = Buffer.from(letter.files.pdf.base64, "base64");
        const desc = documentDescriptor("cover_letter", letter.files.pdf.filename, letter.files.pdf.contentType || "application/pdf", buf, {
          audit: letter.audit, dropped_by_audit: (letter.droppedByAudit || []).length, word_count: letter.wordCount, _bytes: buf,
        });
        desc.storage.path = `${userId}/${letter.files.pdf.filename}`;
        desc.artifact = { table: "channel_artifacts", kind: "document", filename: desc.filename, mime: desc.mime, sha256: desc.sha256, expires_at: new Date(now + ARTIFACT_TTL_MS).toISOString() };
        out.documents.push(desc);
        out.slots.cover_letter = { state: "ready", filename: desc.filename, sha256: desc.sha256 };
      } else {
        out.slots.cover_letter = { state: "text_only", reason: letter.filesNote || "renderer unavailable", text: letter.text };
      }
    }
    return out;
  }

  // JSON-safe surface view: bytes and models never ride a surface.
  function documentsSurface(issued) {
    const strip = (doc) => { const c = Object.assign({}, doc); delete c._bytes; delete c._model; return c; };
    return {
      kind: "career_documents", version: VERSION, user_id: issued.user_id,
      documents: (issued.documents || []).map(strip),
      slots: issued.slots,
    };
  }

  /* ---------------- 4. connections skeleton ---------------- */
  function connectionsSkeleton(opts) {
    const o = opts || {};
    const pass = (arr) => (Array.isArray(arr) ? arr : []).map((e) => Object.assign({}, e));
    const personal = pass(o.personal);
    const groups = pass(o.groups);
    const active = o.active === "groups" ? "groups" : "personal";
    const side = (entries, emptyText) => ({
      count: entries.length, entries, empty: entries.length === 0,
      empty_text: entries.length === 0 ? emptyText : null,
    });
    return {
      kind: "career_connections", version: VERSION,
      toggle: ["personal", "groups"], active,
      personal: side(personal, "No personal connections yet. People appear here only after they opt in — nothing is added without consent."),
      groups: side(groups, "No groups yet. Groups appear here when you join or create one."),
      note: "Skeleton only: consent, matching and introductions live in engines 156–164. This screen invents no people.",
    };
  }

  /* ---------------- chat renderers ----------------
   * Messages-shaped text. Links are injected by the channel layer at
   * send time; without one the renderer says "private link" in words
   * — it never fabricates a URL. */
  function renderImportReview(review) {
    const lines = [`I read ${review.counts.facts + review.counts.basics} things from your message. Nothing is saved as confirmed until you tap it:`];
    for (const item of review.items) {
      lines.push(`• ${item.type === "basic" ? item.field : item.title || item.kind} — ${item.label.display}  [Confirm] [Discard]`);
    }
    for (const u of review.unparsed) lines.push(`• ${u.label.display} (${u.reason})`);
    return lines.join("\n");
  }
  function renderProfileEditor(editor) {
    if (!editor.ok) return `Profile unavailable: ${editor.reason}`;
    const lines = [`Your profile${editor.headline ? ` — ${editor.headline}` : ""}`];
    lines.push(`\nConfirmed (${editor.counts.confirmed}):`);
    for (const e of editor.confirmed) lines.push(`• ${e.title || e.kind} — ${e.label.display}`);
    if (editor.counts.unconfirmed) {
      lines.push(`\nWaiting for your confirmation (${editor.counts.unconfirmed}):`);
      for (const e of editor.unconfirmed) lines.push(`• ${e.title || e.kind} — ${e.reason}  [Confirm] [Discard]`);
    }
    if (editor.gaps && editor.gaps.length) {
      lines.push(`\nStill missing (${editor.gaps.length}):`);
      for (const g of editor.gaps) lines.push(`• ${g.code} — ${g.detail || g.where || ""}`);
    }
    if (editor.counts.discarded) lines.push(`\nKept out (${editor.counts.discarded}): discarded items stay out of every draft.`);
    return lines.join("\n");
  }
  function renderDocuments(surface, links) {
    const byKind = links || {};
    const lines = ["Your documents (private links — they expire in 10 minutes):"];
    for (const doc of surface.documents) {
      if (doc.state !== "ready") { lines.push(`• ${doc.filename} — not issued: ${doc.reason || doc.state}`); continue; }
      lines.push(`• ${doc.filename} — ${byKind[doc.kind] ? byKind[doc.kind] : "(private link)"}`);
    }
    for (const [slot, s] of Object.entries(surface.slots || {})) {
      if (s.state === "needs_posting") lines.push(`• Cover letter — ${s.reason}.`);
      else if (s.state === "blocked") lines.push(`• ${slot} — unavailable: ${s.reason}`);
      else if (s.state === "text_only") lines.push(`• Cover letter — ready as text (no file in this runtime).`);
    }
    return lines.join("\n");
  }
  function renderConnections(skel) {
    const side = skel.active === "groups" ? skel.groups : skel.personal;
    const lines = [`Connections — showing: ${skel.active} (switch: ${skel.toggle.join(" / ")})`];
    if (side.empty) lines.push(side.empty_text);
    else for (const e of side.entries) lines.push(`• ${e.name || e.title || "(unnamed)"}`);
    lines.push(skel.note);
    return lines.join("\n");
  }

  return {
    VERSION, BUCKET, ARTIFACT_TTL_MS, LINK_TTL_SECONDS,
    provenanceLabel, importReview, stageImport, applyImportDecisions,
    profileEditor, proposeEdit, confirmEdit,
    adapter169to165, issueDocuments, documentsSurface,
    connectionsSkeleton,
    renderImportReview, renderProfileEditor, renderDocuments, renderConnections,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerProfileSurfaces;
