/* Trainee assisted-apply extension — fill engine (pure logic, no chrome.* APIs).
 *
 * This module is the CLIENT-SIDE PORT of the product's own field knowledge:
 *   - classification: module 150 (packages/domain/150-career-portal-browser.js)
 *     classifyKind() — label-first binding rules (defect D7: a profile value
 *     binds ONLY when the field's LABEL belongs to that value's class; the DOM
 *     name/id is a fallback for label-less fields only). Rule order and regexes
 *     are ported, not re-invented; Greenhouse-relevant subset.
 *   - answers: module 149 (packages/domain/149-career-portal-apply.js) — the
 *     extension consumes the DERIVED answer map (deriveAnswers output shape:
 *     { profile, answers{key:{value,confirmed,factId}}, traces }). It never
 *     re-derives answers from raw facts, and a key that resolves nowhere is a
 *     needs-user field, never a guess (the product's no_confirmed_fact law).
 *   - confirmation parsing: module 150 extractConfirmation() ported verbatim
 *     (BUG-208 / D12: an ID counts only in a labeled confirmation context with
 *     a digit-bearing token; a still-open application form vetoes the page).
 *
 * Posture (§6.3): the engine fills; the USER reviews and clicks Submit. The
 * engine never clicks submit, never touches a captcha, and never checks an
 * attestation/certification box — that legal act is the user's own.
 * UMD-ish, exactly like the domain modules: runs as a classic script in the
 * page (window.TraineeFillEngine) and under node for the fixture check.
 */
const TraineeFillEngine = (() => {
  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);

  // ---------- profile value resolution (port of module 149 profileValue) ----------
  const EDUCATION_KEYS = ["school", "degree", "discipline", "start_date", "end_date", "gpa", "graduation_year"];
  function profileValue(profile, key) {
    if (!profile || !key) return undefined;
    if (key === "resume") return profile.resume;
    if (key.startsWith("education_")) {
      const sub = key.slice("education_".length);
      if (profile.education && profile.education[sub] !== undefined) return profile.education[sub];
      return profile[key];
    }
    return profile[key];
  }

  // ---------- field classification (port of module 150 classifyKind) ----------
  // desc: { label, name, id, cls, tag, inputType, groupLabel }
  // eff is the field's LABEL, normalized the way module 150 presents it:
  // boards print required markers in the label text, stripped here too.
  function classifyField(desc) {
    const d = desc || {};
    const hay = (String(d.label || "") + " " + String(d.name || "") + " " + String(d.id || "") + " " + String(d.groupLabel || "")).toLowerCase();
    const eff = (String(d.label || "").toLowerCase() || hay).replace(/[*✱]\s*$/, "").trim();
    const inputType = d.inputType || (d.tag === "select" ? "select" : d.tag === "textarea" ? "textarea" : "text");
    if (inputType === "file") {
      // A cover-letter upload is never the resume (module 150, verbatim rule).
      if (/cover/.test(hay)) return { kind: "unknown", why: "cover-letter file input is not the resume" };
      if (/resume|cv\b|curriculum/.test(hay)) return { kind: "standard", profile_key: "resume" };
      return { kind: "unknown", why: "file input with no resume match" };
    }
    if (/certif|attest|acknowledge|true and complete|provided.*true/.test(eff) && inputType === "checkbox") return { kind: "attestation", question_key: slug(eff).slice(0, 32) || "attestation" };
    if (/authori[sz]ed to work|legally authori[sz]ed|right to work/.test(eff)) return { kind: "screening", question_key: "work_authorization" };
    if (/sponsor/.test(eff)) return { kind: "screening", question_key: "sponsorship" };
    // module 149's bank-derived answer keys (BUG-238 / FR-396), same rules:
    if (/at least 18|18 (years of age|or older)|are you 18|over (the age of )?18/.test(eff)) return { kind: "screening", question_key: "age_18_plus" };
    if (/currently located in|presently located in|located in the (united states|u\.s\.|usa)|based in the (united states|u\.s\.)|do you live in the (united states|u\.s\.)/.test(eff)) return { kind: "screening", question_key: "located_in_us" };
    if (inputType !== "textarea" && /3\s*\+?\s*months?\s*(of\s+)?(internship\s+|work\s+|professional\s+|relevant\s+)?experience|at least 3 months.*experience/.test(eff)) return { kind: "screening", question_key: "experience_3mo_plus" };
    if (inputType !== "textarea" && /how many years.*experience|years?\s*of\s*(work\s+|professional\s+|relevant\s+|industry\s+)?experience|total years.*experience/.test(eff)) return { kind: "screening", question_key: "years_of_experience" };
    // EEO matches on hay (module 150): boards name these fields by machine
    // name as often as by label; the value carried is the user's own EEO
    // choice or their decline default, never a bound fact.
    if (/gender|race|ethnic|veteran|disability|sexual orientation|pronouns|lgbt|hispanic|latino/.test(hay)) return { kind: "eeo", question_key: slug(eff).slice(0, 32) || "eeo" };
    if (/preferred name|preferred first name/.test(eff)) return { kind: "standard", profile_key: "preferred_name" };
    if (/graduat/.test(eff)) return { kind: "standard", profile_key: "education_graduation_year" };
    if (/fields? of study|discipline|\bmajor\b|area of study|concentration/.test(eff)) return { kind: "standard", profile_key: "education_discipline" };
    if (/\bgpa\b|grade point average/.test(eff)) return { kind: "standard", profile_key: "education_gpa" };
    if (/school|university|college|institution|alma mater/.test(eff)) return { kind: "standard", profile_key: "education_school" };
    if (/complet/.test(eff) && /education/.test(eff) && (/highest/.test(eff) || /level/.test(eff))) return { kind: "screening", question_key: "education_level_completed" };
    if (/highest level of education|level of education|education level|educational attainment/.test(eff)) return { kind: "screening", question_key: "education_level" };
    // The boards' built-in Degree field is a LEVEL widget (BUG-238 live
    // addendum): a widget field labeled just "Degree" takes the derived level.
    if (/^degree$/.test(eff) && /select__input/.test(d.cls || "")) return { kind: "screening", question_key: "education_level" };
    if (/\bdegree\b|bachelor/.test(eff)) return { kind: "standard", profile_key: "education_degree" };
    if (/^start_year(_\d+)?$/.test(slug(d.name || ""))) return { kind: "standard", profile_key: "education_start_date" };
    if (/^end_year(_\d+)?$/.test(slug(d.name || ""))) return { kind: "standard", profile_key: "education_end_date" };
    if (/(start|begin)/.test(eff) && /(education|school|university|college)/.test(hay)) return { kind: "standard", profile_key: "education_start_date" };
    if (/(end|completion)/.test(eff) && /(education|school|university|college)/.test(hay)) return { kind: "standard", profile_key: "education_end_date" };
    if (/state of residence|in which (u\.s\. )?state.*(reside|live|located)|which state do you.*(reside|live)|what state.*(reside|live)|province of residence/.test(eff)) return { kind: "standard", profile_key: "state_of_residence" };
    if (/time ?zone/.test(eff)) return { kind: "standard", profile_key: "time_zone" };
    if (/date of birth|birth ?date|\bdob\b/.test(eff)) return { kind: "standard", profile_key: "date_of_birth" };
    if (/\bcountry\b/.test(eff)) return { kind: "standard", profile_key: "country" };
    if (/first name|last name|full name|your name|^name\b/.test(eff) || (!d.label && (d.name === "name" || d.id === "name"))) return { kind: "standard", profile_key: "name" };
    if (/e-?mail/.test(eff) || inputType === "email") return { kind: "standard", profile_key: "email" };
    if (/phone|mobile|telephone/.test(eff) || inputType === "tel") return { kind: "standard", profile_key: "phone" };
    if (/linkedin/.test(eff)) return { kind: "standard", profile_key: "linkedin" };
    if (/github/.test(eff)) return { kind: "standard", profile_key: "github" };
    if (/portfolio|website|web site|personal site/.test(eff)) return { kind: "standard", profile_key: "website" };
    if (/current company|current employer|present company/.test(eff)) return { kind: "standard", profile_key: "current_company" };
    if (/location|city|where are you based|current residence/.test(eff) && !/preference|desired/.test(eff)) return { kind: "standard", profile_key: "location" };
    if (inputType === "textarea" || /cover letter|additional information|anything else/.test(eff)) return { kind: "free_text", question_key: /cover letter/.test(eff) ? "cover_note" : (slug(eff).slice(0, 40) || "free_text") };
    if (inputType === "checkbox" && /confirm|agree/.test(eff)) return { kind: "attestation", question_key: slug(eff).slice(0, 32) || "attestation" };
    return { kind: "unknown" };
  }

  // ---------- DOM discovery (mirrors module 150 classifyFields' shape) ----------
  function labelTextFor(document, el) {
    let t = "";
    if (el.id) {
      try { const l = document.querySelector('label[for="' + el.id.replace(/"/g, '\\"') + '"]'); if (l) t = l.textContent || ""; } catch (e) { /* fall through */ }
    }
    if (!t && typeof el.closest === "function") { const wrap = el.closest("label"); if (wrap) t = wrap.textContent || ""; }
    if (!t) t = el.getAttribute && (el.getAttribute("aria-label") || "");
    return String(t || "").replace(/\s+/g, " ").trim();
  }
  function groupLabelFor(el) {
    if (typeof el.closest !== "function") return "";
    const fs = el.closest("fieldset");
    if (fs) { const lg = fs.querySelector("legend"); if (lg) return String(lg.textContent || "").replace(/\s+/g, " ").trim(); }
    return "";
  }
  function descOf(document, el) {
    const tag = String(el.tagName || "").toLowerCase();
    const inputType = tag === "input" ? String(el.type || "text").toLowerCase() : tag;
    const label = labelTextFor(document, el);
    return {
      label, name: el.getAttribute("name") || "", id: el.id || "",
      cls: typeof el.className === "string" ? el.className : "",
      tag, inputType, groupLabel: groupLabelFor(el),
      required: !!(el.required || el.getAttribute("aria-required") === "true"),
      options: tag === "select" ? Array.from(el.options || []).map((o) => ({ value: o.value, label: String(o.textContent || "").replace(/\s+/g, " ").trim() })) : undefined,
    };
  }
  // discoverFields(document) -> logical field entries:
  //   { planId, label, kind, profile_key?, question_key?, required,
  //     controls: [el], descs: [desc], inputType }
  // A first+last name pair collapses to ONE logical full_name field (module
  // 150's name_pair); radio/checkbox groups collapse by name (module 150).
  function discoverFields(document) {
    const els = Array.from(document.querySelectorAll("input, select, textarea")).filter((el) => {
      const t = String(el.type || "").toLowerCase();
      if (el.disabled) return false;
      if (t === "hidden" || t === "submit" || t === "button" || t === "reset" || t === "image") return false;
      return true;
    });
    const descs = els.map((el) => descOf(document, el));
    const consumed = new Set();
    const entries = [];
    const isNamePart = (i, re) => re.test((descs[i].label + " " + descs[i].name + " " + descs[i].id).toLowerCase()) && descs[i].inputType === "text";
    const fi = els.findIndex((_, i) => isNamePart(i, /first name/));
    const li = els.findIndex((_, i) => isNamePart(i, /last name/));
    if (fi >= 0 && li >= 0 && fi !== li) {
      entries.push({ planId: "full_name", label: "Full name", kind: "standard", profile_key: "name", required: !!(descs[fi].required || descs[li].required), controls: [els[fi], els[li]], descs: [descs[fi], descs[li]], inputType: "name_pair" });
      consumed.add(els[fi]); consumed.add(els[li]);
    }
    const groups = new Map();
    els.forEach((el, i) => {
      if (consumed.has(el)) return;
      const t = descs[i].inputType;
      if ((t === "radio" || t === "checkbox") && descs[i].name) {
        if (!groups.has(descs[i].name)) groups.set(descs[i].name, []);
        groups.get(descs[i].name).push(i);
      }
    });
    const grouped = new Set();
    for (const idxs of groups.values()) if (idxs.length >= 2) idxs.forEach((i) => grouped.add(i));
    const seenSem = new Set();
    els.forEach((el, i) => {
      if (consumed.has(el)) return;
      const d = descs[i];
      if (grouped.has(i)) {
        const idxs = groups.get(d.name);
        idxs.forEach((j) => consumed.add(els[j]));
        const gLabel = d.groupLabel || d.label || d.name;
        const kind = classifyField({ label: gLabel, name: d.name, id: "", cls: d.cls, tag: "input", inputType: d.inputType === "radio" ? "group" : "group", groupLabel: d.groupLabel });
        entries.push({ planId: slug(gLabel) || slug(d.name) || "choice_group", label: gLabel, kind: kind.kind, profile_key: kind.profile_key, question_key: kind.question_key, required: idxs.some((j) => descs[j].required), controls: idxs.map((j) => els[j]), descs: idxs.map((j) => descs[j]), inputType: d.inputType === "radio" ? "radio_group" : "checkbox_group" });
        return;
      }
      const kind = classifyField(d);
      // module 150's D6 rule: identical questions emitted twice collapse to
      // one plan entry, so the user is never asked the same question twice.
      const sem = [kind.kind, kind.profile_key || kind.question_key || "", String(d.label || "").toLowerCase()].join("|");
      if (seenSem.has(sem)) { consumed.add(el); return; }
      seenSem.add(sem);
      consumed.add(el);
      entries.push({ planId: slug(d.label) || slug(d.name) || slug(d.id) || ("field_" + i), label: d.label || d.name || d.id || ("field " + i), kind: kind.kind, profile_key: kind.profile_key, question_key: kind.question_key, required: !!d.required, controls: [el], descs: [d], inputType: d.tag === "select" ? "select" : d.inputType });
    });
    return entries;
  }

  // ---------- answer resolution: bank -> per-field plan ----------
  const EEO_DECLINE = "__eeo_decline__";
  function resolveValue(entry, bank) {
    const b = bank || {};
    const profile = b.profile || {};
    const answers = b.answers || {};
    if (entry.kind === "attestation") {
      // The user's own legal act. The extension highlights it and never
      // checks it — not even when a value were banked.
      return { status: "needs_user", reasonCode: "attestation", reason: "attestation — yours to read and confirm; the extension never checks this box" };
    }
    if (entry.inputType === "file" || (entry.descs || []).some((d) => d.inputType === "file")) {
      if (entry.profile_key === "resume") return { status: "needs_user", reasonCode: "file_attach", reason: "attach the resume file Trainee prepared — a content script cannot set a file input" };
      return { status: "needs_user", reasonCode: "file_attach", reason: "file upload with no banked file — attach it yourself if you want it included" };
    }
    if (entry.kind === "standard" && entry.profile_key) {
      if (entry.profile_key === "resume") return { status: "needs_user", reasonCode: "file_attach", reason: "attach the resume file Trainee prepared" };
      const v = profileValue(profile, entry.profile_key);
      if (v !== undefined && v !== null && String(v) !== "") return { status: "fill", value: v, source: "profile." + entry.profile_key };
      return { status: "needs_user", reasonCode: "no_confirmed_fact", reason: "no confirmed fact in your bank for this field" };
    }
    if ((entry.kind === "screening" || entry.kind === "free_text") && entry.question_key) {
      const a = answers[entry.question_key];
      if (a && a.confirmed === true && a.value !== undefined && a.value !== null && String(a.value) !== "") return { status: "fill", value: a.value, source: "answers." + entry.question_key + (a.factId ? " (" + a.factId + ")" : "") };
      return { status: "needs_user", reasonCode: "no_confirmed_fact", reason: "no confirmed answer in your bank for this question" };
    }
    if (entry.kind === "eeo") {
      const a = answers[entry.question_key] || answers["eeo_" + entry.question_key];
      if (a && a.confirmed === true && a.value !== undefined && String(a.value) !== "") return { status: "fill", value: a.value, source: "answers." + entry.question_key };
      if (b.eeoPolicy === "decline") return { status: "fill", value: EEO_DECLINE, source: "your recorded EEO preference: decline to answer" };
      return { status: "needs_user", reasonCode: "no_confirmed_fact", reason: "no EEO choice recorded in your bank" };
    }
    return { status: "needs_user", reasonCode: "unknown_field", reason: "the extension does not recognize this question — it is never guessed" };
  }
  function planFill(entries, bank) {
    return (entries || []).map((e) => Object.assign({}, e, resolveValue(e, bank)));
  }
  // Coverage counts DOM controls (what the user sees): the name pair is 2.
  function coverageOf(plan) {
    let total = 0, answerable = 0;
    const needs = [];
    for (const p of plan || []) {
      const n = (p.controls || []).length || 1;
      total += n;
      if (p.status === "fill") answerable += n;
      else needs.push({ label: p.label, reason: p.reason, reasonCode: p.reasonCode, fields: n });
    }
    return { total, answerable, needsUser: total - answerable, needs };
  }

  // ---------- filling ----------
  function setNativeValue(el, value) {
    const win = el.ownerDocument && el.ownerDocument.defaultView;
    const proto = win ? Object.getPrototypeOf(el) : null;
    const desc = proto && Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && typeof desc.set === "function") desc.set.call(el, value);
    else el.value = value;
  }
  function fireEvents(el) {
    const doc = el.ownerDocument;
    const win = doc && doc.defaultView;
    if (!win || typeof win.Event !== "function") return;
    for (const type of ["input", "change"]) { try { el.dispatchEvent(new win.Event(type, { bubbles: true })); } catch (e) { /* jsdom/older engines */ } }
  }
  function matchOptionLabel(options, value) {
    if (value === EEO_DECLINE) {
      const hit = (options || []).find((o) => /don'?t wish|decline|prefer not|no answer/i.test(o.label)) || (options || []).find((o) => /don'?t wish|decline|prefer not/i.test(o.value));
      return hit ? hit.label : null;
    }
    const want = String(value);
    const opts = options || [];
    let hit = opts.find((o) => o.label === want) || opts.find((o) => o.value === want);
    if (hit) return hit.label;
    const norm = want.toLowerCase().trim();
    hit = opts.find((o) => o.label.toLowerCase().trim() === norm) || opts.find((o) => String(o.value).toLowerCase().trim() === norm);
    if (hit) return hit.label;
    if (/^\d+$/.test(want)) { hit = opts.find((o) => new RegExp("^" + want + "\\b").test(o.label.trim())); if (hit) return hit.label; }
    return null;
  }
  // applyOne(entry) -> { filled: bool, rendered, reason? }
  // Every fill is VERIFIED by read-back (module 150's BUG-207 law): a fill
  // the page will not hold is a recorded failure, never a silent success.
  function applyOne(entry) {
    const value = entry.value;
    if (entry.inputType === "name_pair") {
      const full = String(value || "").trim();
      const sp = full.indexOf(" ");
      const first = sp > 0 ? full.slice(0, sp) : full;
      const last = sp > 0 ? full.slice(sp + 1) : "";
      const [fEl, lEl] = entry.controls;
      if (fEl) { setNativeValue(fEl, first); fireEvents(fEl); }
      if (lEl) { setNativeValue(lEl, last); fireEvents(lEl); }
      const okF = !fEl || String(fEl.value) === first;
      const okL = !lEl || String(lEl.value) === last;
      return { filled: okF && okL, rendered: { first, last } };
    }
    const el = entry.controls[0];
    if (!el) return { filled: false, reason: "no_control" };
    if (entry.inputType === "select" || el.tagName === "SELECT") {
      const options = Array.from(el.options || []).map((o) => ({ value: o.value, label: String(o.textContent || "").trim() }));
      const label = matchOptionLabel(options, value);
      if (label === null) return { filled: false, reason: "no_matching_option" };
      const opt = Array.from(el.options).find((o) => String(o.textContent || "").trim() === label);
      setNativeValue(el, opt.value);
      fireEvents(el);
      const chosen = el.options[el.selectedIndex];
      return { filled: !!chosen && String(chosen.textContent || "").trim() === label, rendered: label };
    }
    if (entry.inputType === "radio_group" || entry.inputType === "checkbox_group") {
      const labels = entry.controls.map((c) => labelTextFor(el.ownerDocument, c) || c.value || "");
      const want = value === EEO_DECLINE ? EEO_DECLINE : String(value);
      const idx = labels.findIndex((l) => matchOptionLabel([{ value: l, label: l }], want) !== null);
      if (idx < 0) return { filled: false, reason: "no_matching_option" };
      const c = entry.controls[idx];
      if (!c.checked) { c.checked = true; fireEvents(c); }
      return { filled: !!c.checked, rendered: labels[idx] };
    }
    if (entry.inputType === "checkbox") return { filled: false, reason: "single_checkbox_not_auto_filled" };
    setNativeValue(el, String(value));
    fireEvents(el);
    return { filled: String(el.value) === String(value), rendered: String(el.value) };
  }
  function applyPlan(plan) {
    const started = Date.now();
    const filled = [], failed = [], needsUser = [];
    for (const p of plan || []) {
      if (p.status !== "fill") { needsUser.push({ label: p.label, reason: p.reason, reasonCode: p.reasonCode }); continue; }
      let r;
      try { r = applyOne(p); } catch (e) { r = { filled: false, reason: "fill_error:" + String((e && e.message) || e) }; }
      if (r.filled) filled.push({ label: p.label, value: p.value, source: p.source, rendered: r.rendered });
      else failed.push({ label: p.label, value: p.value, reason: r.reason || "fill_failed" });
    }
    return { filled, failed, needsUser, ms: Date.now() - started };
  }

  // ---------- confirmation parsing (port of module 150 extractConfirmation, BUG-208) ----------
  function extractConfirmation(text, opts) {
    const t = String(text || "");
    if (opts && opts.formStillOpen) return { confirmationId: null, successText: false, formStillOpen: true };
    const idMatch = t.match(/(?:application|confirmation|reference|submission|tracking)\s*(?:(?:id|number|no\.?)\s*[:#]|#)\s*([A-Z0-9][A-Z0-9-]{4,})\b/i);
    const confirmationId = idMatch && /\d/.test(idMatch[1]) ? idMatch[1] : null;
    const successText = /(application (has been |was )?(submitted|received)|thank you for applying|we(?:'ve| have) received your application|successfully submitted|application is complete|your application was sent)/i.test(t);
    return { confirmationId, successText };
  }
  // A still-open application form vetoes any confirmation reading: a page
  // holding a live submit control beside an empty required field is an
  // unsubmitted form by construction (module 150, D12).
  function formStillOpen(document) {
    const submit = Array.from(document.querySelectorAll('button, input[type="submit"]')).some((b) => /submit/i.test(b.textContent || b.value || ""));
    if (!submit) return false;
    return Array.from(document.querySelectorAll("input, select, textarea")).some((el) => el.required && !String(el.value || "").trim() && String(el.type || "").toLowerCase() !== "file");
  }
  function detectProof(document, url, snapshot) {
    // innerText (rendered text, excludes <script>) in a real browser;
    // textContent is the fallback (module 150's helper likewise reads the
    // rendered page text, never raw markup).
    const rawText = document.body ? (document.body.innerText || document.body.textContent || "") : "";
    const text = String(rawText).replace(/\s+/g, " ").trim();
    const open = formStillOpen(document);
    const ex = extractConfirmation(text, { formStillOpen: open });
    if (!ex.confirmationId && !ex.successText) return null;
    const body = document.body;
    const h1 = document.querySelector("h1");
    const excerptAt = ex.confirmationId ? text.indexOf(ex.confirmationId) : -1;
    const excerpt = excerptAt >= 0 ? text.slice(Math.max(0, excerptAt - 200), excerptAt + 200) : text.slice(0, 400);
    return {
      employer: (body && body.getAttribute("data-employer")) || null,
      role: (body && body.getAttribute("data-role")) || (h1 ? String(h1.textContent || "").trim() : null),
      answersSubmitted: snapshot || null,
      confirmationId: ex.confirmationId,
      confirmationText: excerpt,
      // The sync report carries these so the product re-parses the
      // confirmation from the excerpt under the same rules — the
      // record claims only what the page showed (DESIGN.md §4).
      successText: !!ex.successText,
      formStillOpen: open,
      timestamp: new Date().toISOString(),
      url: String(url || ""),
    };
  }

  return { slug, classifyField, discoverFields, planFill, coverageOf, resolveValue, applyPlan, applyOne, matchOptionLabel, extractConfirmation, formStillOpen, detectProof, profileValue, EDUCATION_KEYS, EEO_DECLINE };
})();
if (typeof module !== "undefined" && module.exports) module.exports = TraineeFillEngine;
if (typeof window !== "undefined") window.TraineeFillEngine = TraineeFillEngine;
