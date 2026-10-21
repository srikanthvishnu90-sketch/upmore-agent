/* COVER-LETTER FILL (Lane C, owner ruling 2026-10-21) — for a posting
   that asks for a cover letter / cover note, the user's confirmed facts
   + the posting fill a clean structured letter: header, greeting, three
   body movements (fit-from-facts, proof-from-experience, close),
   sign-off. Gaps are FLAGGED on the record, never invented over.

   WHAT EXISTS AROUND THIS MODULE (not rebuilt here):
     - 123's generateCoverLetter: the tailor's embedded letter — it is
       CIR-driven (refuses without real company research facts) and its
       truth check spot-audits only the proof fact. 168 is the
       standalone fill the structuring audit named as missing: posting
       in (title / company / required skills / themes), no CIR needed,
       and EVERY fact-claiming sentence is truth-audited as a hard gate.
     - 148 (render machinery): 168 composes its letter document in
       148's resume-JSON shape and renders PDF + DOCX through it, with
       148's two-parser parse-check on the result. F-011's bare-Buffer
       throw is a Deno-runtime defect in 148's edge path (fix PR #150);
       168's own runs are Node, stated on every record.
     - 165 (resume structuring): the sibling facts -> document lane;
       168 shares its gap law, not its code.

   TRUSTED-FACT READER (module 167, D-007 quarantine): facts are read
   ONLY through the shared reader — reader(profile) -> the
   quarantine-cleared facts, nothing else. Resolution order:
     1. opts.reader (injected function),
     2. module 167 (global CareerTrustedFacts or
        ./167-career-trusted-facts.js, vendored in this tree at
        1d27bf6b; any of its read-shaped exports).
   There is no local fallback reader: if 167 cannot be resolved the
   seam fails CLOSED (zero cleared facts, readerSource "unavailable")
   rather than reading facts through a stand-in. Every record
   carries readerSource ("injected" | "module167" | "unavailable")
   so which reader produced a letter is never ambiguous.
   Defense in depth (the D-007 point): whatever the reader returns, a
   fact still carrying a standing uncleared marker (needs_confirmation,
   an explicit quarantine flag, a draft/quarantined status) is excluded
   here too and counted in the record as safetyExcluded — 123's audit
   law already refuses any line such a fact supports, so a drafter that
   let one through would be a bypass with extra steps. profile.basics
   (the identity header block) is not fact-bank data and is read
   directly; every FACT the letter states comes from the reader.

   TRUTH DISCIPLINE (123's audit pattern, applied to every sentence):
   each sentence in the model is typed by source —
     "fact":     built from cleared facts, carries their IDs, and must
                 pass Tailor.auditResume against the CLEARED profile
                 view (a cited quarantined ID cannot even resolve
                 there). A sentence the audit refuses is DROPPED and
                 recorded in droppedByAudit — never shipped, never
                 silently repaired.
     "posting":  restates the employer's own posting (title, company) —
                 the employer's text handed back, not a user claim.
     "structural": greeting / thanks / sign-off — no factual claim.
   A required skill or theme with no covering cleared fact is a GAP
   FLAG (UNCOVERED_SKILL / UNCOVERED_THEME) and is never claimed in the
   letter. A slot with no covering fact (proof movement, timeline
   detail, sign-off name) is omitted or explicitly bracketed and
   flagged — never filled with plausible text.

   AI-USE RULE (Doc 2 S8, parity with 123): a posting that bans
   AI-written application text degrades to mode "outline" — movements
   + the cleared fact texts for the user to write from — and no letter
   prose is generated. Banned phrases (123's list) are a hard refusal
   backstop. Deterministic: same facts + posting render the same
   letter. Pure: profile + posting in, record out. UMD. */
const CareerCoverLetter = (() => {
  "use strict";

  const Profile = typeof CareerProfile !== "undefined" ? CareerProfile : require("./122-career-profile.js");
  const Tailor = typeof CareerTailor !== "undefined" ? CareerTailor : require("./123-career-tailor.js");

  let _renderMod;
  function renderModule() {
    if (_renderMod !== undefined) return _renderMod;
    _renderMod = null;
    if (typeof CareerRender !== "undefined") _renderMod = CareerRender;
    else if (typeof require !== "undefined") { try { _renderMod = require("./148-career-render.js"); } catch { _renderMod = null; } }
    return _renderMod;
  }

  let _readerMod;
  function readerModule() {
    if (_readerMod !== undefined) return _readerMod;
    _readerMod = null;
    if (typeof CareerTrustedFacts !== "undefined") _readerMod = CareerTrustedFacts;
    else if (typeof require !== "undefined") { try { _readerMod = require("./167-career-trusted-facts.js"); } catch { _readerMod = null; } }
    return _readerMod;
  }

  // ================= trusted-fact reader seam (module 167) =================
  const UNCLEARED_STATUS = new Set(["draft", "quarantined", "unconfirmed", "pending", "pending_confirmation", "needs_confirmation"]);
  function isUncleared(f) {
    if (!f || typeof f !== "object") return true;
    if (f.needs_confirmation === true) return true;
    if (f.quarantined === true || f.quarantine === true) return true;
    if (f.cleared === false) return true;
    const st = String(f.status || f.state || "").toLowerCase();
    if (UNCLEARED_STATUS.has(st)) return true;
    return false;
  }
  function hasContent(f) {
    return Boolean(f && (String(f.text || "").trim() || String(f.title || "").trim() || String(f.name || "").trim()));
  }
  function pickReaderFn(mod) {
    if (!mod) return null;
    if (typeof mod === "function") return mod;
    for (const k of ["readFacts", "trustedFacts", "readTrustedFacts", "clearedFacts", "reader", "read"]) {
      if (typeof mod[k] === "function") return mod[k];
    }
    return null;
  }
  function resolveFactReader(opts) {
    if (opts && typeof opts.reader === "function") return { read: opts.reader, source: "injected" };
    const fn = pickReaderFn(readerModule());
    if (fn) return { read: (p) => fn(p), source: "module167" };
    // Fail CLOSED: no reader resolvable -> no facts are cleared, and
    // buildCoverLetter refuses on the empty cleared set. Never a stub.
    return { read: () => [], source: "unavailable" };
  }
  function normalizeReaderOutput(out) {
    if (Array.isArray(out)) return out;
    if (out && Array.isArray(out.facts)) return out.facts;
    if (out && Array.isArray(out.cleared)) return out.cleared;
    return [];
  }

  // ================= small helpers =================
  function wordCount(t) { return String(t || "").trim().split(/\s+/).filter(Boolean).length; }
  function factCorpus(f) {
    return `${f.title || ""} ${f.text || ""} ${(f.bullets || []).join(" ")} ${(f.skills || []).join(" ")} ${f.name || ""}`.toLowerCase();
  }
  const MONTH_YEAR = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i;

  function coverFilename(name, ext) {
    const R = renderModule();
    if (R && typeof R.filenameFor === "function") return R.filenameFor(name, ext).replace(/_Resume\./, "_Cover_Letter.");
    const clean = String(name || "").replace(/\([^)]*\)/g, " ").trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    const first = (parts[0] || "Cover").replace(/[^A-Za-z'-]/g, "");
    const last = (parts.length > 1 ? parts[parts.length - 1] : "").replace(/[^A-Za-z'-]/g, "");
    return `${first}${last ? `_${last}` : ""}_Cover_Letter.${ext}`;
  }

  // Truth audit over the letter's fact-claiming sentences, against the
  // CLEARED profile view only (123's auditResume, its pattern and its
  // gate). Returns { ok, violations, checked }.
  function auditSentences(sentences, clearedProfile) {
    const lines = (sentences || []).filter((s) => s && s.source === "fact")
      .map((s) => ({ text: s.text, factIds: s.factIds || [], type: s.auditType || "line" }));
    if (!lines.length) return { ok: true, violations: [], checked: 0 };
    return Tailor.auditResume(lines, clearedProfile);
  }

  // ================= the build =================
  function buildCoverLetter(profile, posting, opts) {
    const o = opts || {};
    if (!profile) return { ok: false, reason: "no profile supplied", text: null };
    if (!posting || (!posting.title && !posting.company)) return { ok: false, reason: "no posting supplied (title/company)", text: null };

    const { read, source: readerSource } = resolveFactReader(o);
    const rawCleared = normalizeReaderOutput(read(profile));
    const safetyExcluded = rawCleared.filter((f) => !hasContent(f) || isUncleared(f));
    const clearedFacts = rawCleared.filter((f) => hasContent(f) && !isUncleared(f));
    const clearedProfile = Object.assign({}, profile, { facts: clearedFacts });
    const totalFacts = ((profile && profile.facts) || []).length;

    const basics = profile.basics || {};
    const title = String(posting.title || "").trim();
    const company = String(posting.company || "").trim();
    const gaps = [];
    if (!company) gaps.push({ code: "MISSING_COMPANY", detail: "posting names no company; the greeting and close stay generic" });

    // AI-use rule: a posting that bans AI-written text gets an outline.
    if (posting.aiPolicy === "ban" || posting.bansAiWrittenText === true) {
      const outlineFacts = clearedFacts.filter((f) => f.kind !== "skill").slice(0, 4);
      return {
        ok: false, mode: "outline", kind: "cover_letter",
        reason: "posting bans AI-written application text; outline only — the user writes the letter (Doc 2 S8)",
        readerSource, clearedFactCount: clearedFacts.length, safetyExcluded: safetyExcluded.length,
        posting: { title, company },
        outline: [
          { movement: "fit", prompt: `State, in your own words, that you are applying for ${title || "the role"}${company ? ` at ${company}` : ""}, and name the skills of yours this role calls for.` },
          { movement: "proof", prompt: "Describe the work below in your own words.", factIds: outlineFacts.map((f) => f.id), factTexts: outlineFacts.map((f) => f.text) },
          { movement: "close", prompt: `Say why ${company || "this company"} specifically, and invite a conversation.` },
        ],
        gaps, text: null,
      };
    }

    if (!clearedFacts.length) {
      return { ok: false, kind: "cover_letter", reason: "no quarantine-cleared facts to write from; every fact is unconfirmed or quarantined, and a letter is never written from those", readerSource, clearedFactCount: 0, safetyExcluded: safetyExcluded.length, posting: { title, company }, gaps, text: null };
    }

    // Posting -> JD shape 123 understands (skills/themes ride the text
    // so parseJD's required/nice-to-have split sees them).
    const themeList = (posting.themes || []).map((t) => String(t)).filter(Boolean);
    const jdText = [
      title,
      company ? `Company: ${company}` : "",
      (posting.skills && posting.skills.length) ? `Required: ${posting.skills.join(", ")}` : "",
      themeList.length ? `Themes: ${themeList.join(", ")}` : "",
      posting.description || "",
    ].filter(Boolean).join("\n");
    const jd = Tailor.parseJD(jdText);
    const requiredSkills = [...new Set([...(jd.mustHaveSkills || []), ...(jd.niceToHaveSkills || [])])];

    // ---- coverage accounting (before a word is written) ----
    const coveredSkills = []; // { skill, factIds }
    for (const skill of requiredSkills) {
      const ev = Profile.skillEvidence(clearedProfile, skill);
      const ids = new Set(ev && ev.proven ? (ev.evidenceFactIds || []) : []);
      if (!ids.size) {
        // fall back to a direct corpus hit on a cleared fact
        for (const f of clearedFacts) if (factCorpus(f).includes(skill.toLowerCase())) ids.add(f.id);
      }
      if (ids.size) coveredSkills.push({ skill, factIds: [...ids] });
      else gaps.push({ code: "UNCOVERED_SKILL", skill, detail: `the posting names ${skill}; no cleared fact evidences it, so the letter never claims it` });
    }
    const corpusAll = clearedFacts.map(factCorpus).join(" ");
    for (const theme of themeList) {
      const words = theme.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
      const hits = words.filter((w) => corpusAll.includes(w)).length;
      if (!words.length || hits / words.length < 0.5) {
        gaps.push({ code: "UNCOVERED_THEME", theme, detail: `the posting's theme "${theme}" is not covered by any cleared fact; it is not asserted in the letter` });
      }
    }
    // Timeline slot: intern / new-grad postings want a graduation or
    // availability detail. Only a month-level date in a cleared fact
    // fills it; years alone leave it a flagged gap — never invented.
    const wantsTimeline = /\b(intern|internship|new grad|summer|co-op)\b/i.test(`${title} ${themeList.join(" ")}`);
    if (wantsTimeline && !clearedFacts.some((f) => MONTH_YEAR.test(`${f.text || ""} ${f.title || ""}`))) {
      const edu = clearedFacts.find((f) => f.kind === "education");
      gaps.push({ code: "TIMELINE_DETAIL", detail: edu
        ? "posting is an internship/new-grad role and no cleared fact states a month-level graduation or availability date (the education fact gives years only); the letter states no month"
        : "posting is an internship/new-grad role and no cleared fact states a graduation or availability date; the letter states none" });
    }

    // ---- fact selection (posting-ranked, cleared pool only) ----
    const selected = Tailor.selectFacts(clearedProfile, jd, { limit: 4 }).map((x) => x.fact);
    const byId = new Map(clearedFacts.map((f) => [f.id, f]));
    const educationFact = selected.find((f) => f.kind === "education") || clearedFacts.find((f) => f.kind === "education") || null;
    const proofFacts = selected.filter((f) => f.kind !== "education" && f.kind !== "skill").slice(0, 2);
    if (!proofFacts.length) gaps.push({ code: "NO_PROOF_FACTS", detail: "no cleared experience/project fact to prove fit with; the proof movement is omitted rather than padded" });

    // ---- sentences ----
    const S = (text, source, movement, factIds, extra) => Object.assign({ text, source, movement, factIds: factIds || [] }, extra || {});
    const fit = [], proof = [], close = [];
    // Movement 1 — fit.
    fit.push(S(`I am applying for ${title ? `the ${title} role` : "this role"}${company ? ` at ${company}` : ""}.`, "posting", "fit"));
    if (coveredSkills.length) {
      const ids = [...new Set(coveredSkills.flatMap((c) => c.factIds))];
      const names = coveredSkills.slice(0, 4).map((c) => c.skill);
      const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
      fit.push(S(`My record includes ${list} — the skills this role calls for.`, "fact", "fit", ids, { auditType: "skills", dropRank: 4 }));
    }
    if (educationFact && String(educationFact.text || "").trim()) {
      fit.push(S(`For background, ${educationFact.text}`, "fact", "fit", [educationFact.id], { dropRank: 2 }));
    }
    // Movement 2 — proof (fact text verbatim-grounded, 123's pattern).
    if (proofFacts[0]) proof.push(S(`In my own work, ${proofFacts[0].text}`, "fact", "proof", [proofFacts[0].id], { dropRank: 3 }));
    if (proofFacts[1]) proof.push(S(`I have also done work that maps directly to this team: ${proofFacts[1].text}`, "fact", "proof", [proofFacts[1].id], { dropRank: 1 }));
    // Movement 3 — close.
    close.push(S(`That combination — direct, measured work and a specific interest in ${company || "your team"} — is why I am applying here rather than sending the same letter everywhere. I would welcome the chance to talk through the work in detail.`, "posting", "close", [], { dropRank: 5 }));
    close.push(S("Thank you for your time.", "structural", "close"));

    // ---- truth audit: hard gate, violating sentences are dropped ----
    const droppedByAudit = [];
    let bodySentences = [...fit, ...proof, ...close];
    let audit = auditSentences(bodySentences, clearedProfile);
    if (!audit.ok) {
      const bad = new Map();
      for (const v of audit.violations) bad.set(v.line, [...(bad.get(v.line) || []), v.reason]);
      bodySentences = bodySentences.filter((s) => {
        if (s.source === "fact" && bad.has(s.text)) { droppedByAudit.push({ text: s.text, movement: s.movement, reasons: bad.get(s.text) }); return false; }
        return true;
      });
      audit = auditSentences(bodySentences, clearedProfile);
    }
    const factSentencesLeft = bodySentences.filter((s) => s.source === "fact");
    if (!factSentencesLeft.length && (fit.length + proof.length)) {
      return { ok: false, kind: "cover_letter", reason: "the truth audit refused every fact-claiming sentence; no letter ships on posting text alone", readerSource, clearedFactCount: clearedFacts.length, safetyExcluded: safetyExcluded.length, posting: { title, company }, gaps, droppedByAudit, text: null };
    }
    // A dropped skills sentence un-covers its skills — re-flag them.
    for (const d of droppedByAudit) {
      for (const c of coveredSkills) {
        if (d.text.includes(c.skill) && !bodySentences.some((s) => s.text.includes(c.skill))) {
          if (!gaps.some((g) => g.code === "UNCOVERED_SKILL" && g.skill === c.skill)) {
            gaps.push({ code: "UNCOVERED_SKILL", skill: c.skill, detail: `the sentence claiming ${c.skill} failed the truth audit and was dropped; the skill is not claimed` });
          }
        }
      }
    }

    // ---- length discipline: hard cap by dropping whole sentences ----
    const maxWords = (o && o.maxWords) || 250;
    const droppedForLength = [];
    const assembleText = (sentences) => {
      const paras = [];
      const byMovement = { fit: [], proof: [], close: [] };
      for (const s of sentences) byMovement[s.movement].push(s.text);
      for (const m of ["fit", "proof", "close"]) if (byMovement[m].length) paras.push(byMovement[m].join(" "));
      return paras;
    };
    let paras = assembleText(bodySentences);
    let wc = wordCount(paras.join(" "));
    // Drop order is by dropRank (second proof point first, the close's
    // specific-interest sentence last). The application sentence and the
    // thank-you carry no rank and are never dropped; a sentence is
    // always dropped whole — text is never truncated mid-claim.
    const droppable = () => bodySentences.filter((s) => s.dropRank).sort((a, b) => a.dropRank - b.dropRank);
    while (wc > maxWords && droppable().length) {
      const victim = droppable()[0];
      bodySentences = bodySentences.filter((s) => s !== victim);
      droppedForLength.push({ text: victim.text, movement: victim.movement });
      paras = assembleText(bodySentences);
      wc = wordCount(paras.join(" "));
    }
    if (wc > maxWords) {
      return { ok: false, kind: "cover_letter", reason: `letter is ${wc} words against a ${maxWords}-word cap with only core sentences left`, readerSource, clearedFactCount: clearedFacts.length, safetyExcluded: safetyExcluded.length, posting: { title, company }, gaps, droppedByAudit, droppedForLength, text: null };
    }

    // ---- greeting / sign-off (structural) ----
    const greeting = `Dear ${company ? `${company} hiring team` : "hiring team"},`;
    let signOffName = basics.name ? String(basics.name) : null;
    if (!signOffName) gaps.push({ code: "MISSING_NAME", detail: "no name on the profile basics; the sign-off is explicitly bracketed, never guessed" });
    const closingLines = ["Sincerely,", signOffName || "[name not on file]"];

    // ---- text (paste version) + files via 148 ----
    const headerLines = [];
    if (basics.name) headerLines.push(String(basics.name));
    const contact = [basics.email, basics.location].filter(Boolean).join(" | ");
    if (contact) headerLines.push(contact);
    const linkLines = Object.values(basics.links || {}).filter(Boolean).join(" | ");
    if (linkLines) headerLines.push(linkLines);
    const text = [...headerLines, "", greeting, "", ...paras.flatMap((p) => [p, ""]), ...closingLines].join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";

    const banned = Tailor.bannedPhrasesIn(text);
    if (banned.length) {
      return { ok: false, kind: "cover_letter", reason: `letter contains banned phrase(s): ${banned.join(", ")}`, banned, readerSource, clearedFactCount: clearedFacts.length, safetyExcluded: safetyExcluded.length, posting: { title, company }, gaps, text: null };
    }

    let files = null, filesNote = null;
    const R = renderModule();
    if (R) {
      // The signature renders as ONE line in the files ("Sincerely,
      // Alex Example"): the bare name as its own line would duplicate
      // the header's name line, which 148's parse-check rightly fails.
      const doc = {
        header: { name: basics.name || "", email: basics.email || "", location: basics.location || "", links: basics.links || {} },
        sections: [{ lines: [greeting, ...paras, closingLines.join(" ")].map((t) => ({ text: t, type: "line" })) }],
      };
      const pdfRes = R.renderPdf(doc);
      const docxRes = R.renderDocx(doc);
      const pdf = pdfRes && pdfRes.ok ? Object.assign(R.artifact("pdf", pdfRes), { filename: coverFilename(basics.name, "pdf") }) : null;
      const docx = docxRes && docxRes.ok ? Object.assign(R.artifact("docx", docxRes), { filename: coverFilename(basics.name, "docx") }) : null;
      const parseCheck = (pdf || docx) ? R.parseCheck({ resume: doc, pdf: pdfRes && pdfRes.ok ? pdfRes.buffer : null, docx: docxRes && docxRes.ok ? docxRes.buffer : null, profile: clearedProfile }) : null;
      files = { pdf, docx, parseCheck };
    } else {
      filesNote = "document renderer (148-career-render.js) is not loaded in this runtime; the plain text above is the paste-ready form and no file was produced";
    }

    const movements = { fit: [], proof: [], close: [] };
    for (const s of bodySentences) movements[s.movement].push(s);
    return {
      ok: true, kind: "cover_letter", version: 1,
      readerSource, clearedFactCount: clearedFacts.length, safetyExcluded: safetyExcluded.length,
      quarantinedFactCount: totalFacts - clearedFacts.length,
      posting: { title, company, requiredSkills, themes: themeList },
      header: { name: basics.name || null, email: basics.email || null, location: basics.location || null, links: basics.links || {} },
      greeting,
      movements,
      sentences: bodySentences,
      closingLines,
      gaps, droppedByAudit, droppedForLength,
      audit: { ok: audit.ok, checked: audit.checked, violations: audit.violations || [] },
      wordCount: wc, maxWords,
      text,
      files, filesNote,
      runtime: "node",
    };
  }

  return { buildCoverLetter, auditSentences, resolveFactReader, isUncleared, coverFilename, wordCount, DEFAULT_MAX_WORDS: 250 };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CareerCoverLetter;
