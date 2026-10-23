/* 170-career-facts-parser.js — TEXTED-FACTS PARSER (owner ruling
 * 2026-10-21). Turns raw facts a user texts in free form (a message
 * dump: comma lists, run-on sentences, parenthetical bullets) into
 * structured, provenance-stamped fact records in the fact bank's
 * shapes — the 122 master basics block + fact records, with the
 * name/value record shapes module 149's derivation reads (kinds
 * "eligibility" and "profile").
 *
 * DETERMINISTIC: rules and patterns only. NO model calls, no network,
 * no I/O in the parse path — the same text always parses to the same
 * records, and the parse is replayable in tests.
 *
 * NOTHING DROPPED, NOTHING INVENTED:
 *  - Every input segment is accounted for: it produces records, or it
 *    lands VERBATIM in the returned `unparsed` list with a named
 *    reason, or both (records + a verbatim residue entry for the part
 *    no rule matched).
 *  - The parser never manufactures a value: no graduation month from
 *    a year, no salary from a revenue metric, no expansion of an
 *    abbreviation, no degree word the text did not state. A bracketed
 *    placeholder like "[28]" is not a fact — it stays unparsed.
 *  - Every record carries provenance: `source` plus the verbatim
 *    `span` it came from and its [start, end) offsets in the input,
 *    so text.slice(start, end) === span always holds.
 *
 * Output records are DRAFTS (needs_confirmation: true): a parser's
 * read of free text is reviewed before it becomes a confirmed bank
 * fact, the same discipline as 122's resume-ingest drafts. Wiring
 * this output into the live intake is a separate follow-up; this
 * module performs no writes.
 * UMD like the other domain modules. */
"use strict";
const CareerFactsParser = (() => {
  const SOURCE = "texted-facts";

  // ---- lexicons (fixed, in-code; extending them is a code change) ----
  const ROLE_KEYWORDS = ["co-founder", "founder", "intern", "analyst", "engineer", "developer", "manager", "director", "associate", "consultant", "researcher", "designer", "lead", "president", "officer"];
  const CERT_DESCRIPTORS = new Set(["modeling", "modelling", "sims", "simulations", "certificate", "certification", "course", "program", "programme"]);
  const TECH_LEXICON = ["TypeScript", "JavaScript", "Next.js", "Node.js", "Python", "React", "SQL", "Dart", "Java", "Excel"];
  const TECH_ALIASES = { TS: "TypeScript", JS: "JavaScript" };
  const SECTION_LABELS = new Set(["contact", "skills", "skill", "certs", "certifications", "certification", "education", "experience", "work"]);

  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const PHONE_RE = /\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}/;
  const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/i;
  const RANGE_RE = /\b((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2}|present|now|current)\b/i;
  const OPEN_RANGE_RE = /\b((?:19|20)\d{2})\s*[-–—]\s*$/;
  const YEAR_RE = /\b((?:19|20)\d{2})\b/;
  const WORK_AUTH_RE = /\bwork\s+authori[sz](?:ed|ation)\b\s*[:\-]?\s*(yes|no)\b/i;
  const DEGREE_RE = /\b(bachelors?|masters?|ph\.?d|doctoral|doctorate|associates?|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?)\b/i;

  function titleCase(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // Split a line into sentences. A split happens only at sentence
  // punctuation followed by whitespace and an uppercase/quote/paren —
  // so "Node.js" and "3.9" never split — and never after a lone
  // capital letter, so degree abbreviations ("B.S. Computer Science")
  // and initials stay inside their sentence.
  function splitSentences(line) {
    const parts = [];
    let start = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch !== "." && ch !== "!" && ch !== "?") continue;
      let j = i + 1;
      while (j < line.length && /\s/.test(line[j])) j++;
      if (j >= line.length) break;
      if (!/[A-Z"'(]/.test(line[j])) continue;
      const prev = line[i - 1];
      if (/[A-Z]/.test(prev || "") && (i - 2 < 0 || /[\s.]/.test(line[i - 2]))) continue;
      parts.push(line.slice(start, j));
      start = j;
      i = j - 1;
    }
    parts.push(line.slice(start));
    return parts;
  }

  function splitSegments(raw) {
    const segs = [];
    let cursor = 0;
    for (const line of String(raw).split("\n")) {
      const parts = splitSentences(line);
      for (const part of parts) {
        const text = part.trim();
        if (!text) continue;
        const start = raw.indexOf(text, cursor);
        if (start < 0) continue;
        cursor = start + text.length;
        segs.push({ text, start, end: start + text.length });
      }
    }
    return segs;
  }

  // Split on top-level commas / semicolons, respecting parentheses,
  // and never on a comma inside a number ("$9,000").
  function splitTopLevel(s, alsoSemicolon) {
    const out = [];
    let depth = 0, cur = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
      const isComma = ch === "," && !(i + 1 < s.length && /\d/.test(s[i + 1]));
      const isSemi = ch === ";" && alsoSemicolon;
      if (depth === 0 && (isComma || isSemi)) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out.map((x) => x.trim()).filter(Boolean);
  }

  function spanIn(seg, needle, fromLocal) {
    const i = seg.text.indexOf(needle, fromLocal || 0);
    if (i < 0) return null;
    return { span: needle, start: seg.start + i, end: seg.start + i + needle.length };
  }

  function techSkillsIn(text) {
    const found = [];
    const sorted = TECH_LEXICON.slice().sort((a, b) => b.length - a.length);
    for (const t of sorted) {
      const re = new RegExp(`(?<![A-Za-z])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`);
      if (re.test(text)) found.push(t);
    }
    for (const [alias, canon] of Object.entries(TECH_ALIASES)) {
      if (new RegExp(`\\b${alias}\\b`).test(text) && !found.includes(canon)) found.push(canon);
    }
    return found;
  }

  function parseTextedFacts(input, opts) {
    const raw = String(input == null ? "" : input);
    const source = (opts && opts.source) || SOURCE;
    const basics = { name: null, email: null, phone: null, location: null, links: {} };
    const basicsProvenance = {};
    const profileFields = {};
    const facts = [];
    const unparsed = [];
    const segments = splitSegments(raw);
    let structured = 0, partial = 0;

    const mkFact = (seg, fields, spanNeedle) => {
      const prov = spanNeedle ? spanIn(seg, spanNeedle) : { span: seg.text, start: seg.start, end: seg.end };
      const f = Object.assign({
        title: "", text: seg.text, bullets: [], skills: [], source,
        needs_confirmation: true, status: "draft",
        provenance: prov ? { source, span: prov.span, start: prov.start, end: prov.end } : { source, span: seg.text, start: seg.start, end: seg.end },
      }, fields);
      facts.push(f);
      return f;
    };
    const addUnparsed = (seg, text, reason, needle) => {
      const prov = needle ? spanIn(seg, needle) : null;
      unparsed.push({
        text,
        reason,
        span: prov ? prov.span : text,
        start: prov ? prov.start : seg.start,
        end: prov ? prov.end : seg.end,
      });
    };

    // ---- segment parsers (each returns true when it claimed the segment) ----

    function parseSkillsSegment(seg, body) {
      for (const item of splitTopLevel(body, true)) {
        const pieces = item.split("/").map((x) => x.trim()).filter(Boolean);
        for (const piece of pieces) {
          const name = TECH_ALIASES[piece] || piece;
          const f = mkFact(seg, { kind: "skill", name, title: name, text: `Skill: ${name}`, skills: [name] }, item);
          if (name !== piece) f.asStated = piece;
        }
      }
      return true;
    }

    function parseCertsSegment(seg, body) {
      for (const part of splitTopLevel(body, true)) {
        const paren = part.match(/\(([^()]*)\)\s*$/);
        const bullets = paren ? splitTopLevel(paren[1], true).flatMap((x) => x.split("/").map((y) => y.trim()).filter(Boolean)) : [];
        const head = (paren ? part.slice(0, paren.index) : part).trim();
        const tokens = head.split(/\s+/);
        let org = null;
        if (tokens.length > 1 && CERT_DESCRIPTORS.has(tokens[tokens.length - 1].toLowerCase())) org = tokens.slice(0, -1).join(" ");
        else if (paren) org = head;
        mkFact(seg, { kind: "certification", org, title: head, text: part, bullets }, part);
      }
      return true;
    }

    function parseContactSegment(seg) {
      let claimed = false;
      const email = seg.text.match(EMAIL_RE);
      if (email) { basics.email = email[0]; basicsProvenance.email = spanIn(seg, email[0]); claimed = true; }
      const phone = seg.text.match(PHONE_RE);
      if (phone) {
        const digits = phone[0].replace(/\D/g, "");
        basics.phone = digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : phone[0];
        basicsProvenance.phone = spanIn(seg, phone[0]);
        claimed = true;
      }
      const li = seg.text.match(LINKEDIN_RE);
      if (li) { basics.links.linkedin = li[0]; basicsProvenance.linkedin = spanIn(seg, li[0]); claimed = true; }
      if (!claimed) return false;
      // Remaining comma parts: name and/or City ST location. Anchors
      // are stripped first; a "Label:" or "(...): " prefix is split
      // off — a known section label is structural (consumed), anything
      // else is verbatim residue in `unparsed`, never dropped.
      let rest = seg.text.replace(EMAIL_RE, " ").replace(PHONE_RE, " ").replace(LINKEDIN_RE, " ");
      rest = rest.replace(/[.;]\s*$/, "");
      for (let part of splitTopLevel(rest, false)) {
        part = part.trim();
        if (!part) continue;
        const labelSplit = part.match(/^(.*?\(\S[^)]*\))\s*:\s*(.+)$/) || part.match(/^([A-Za-z][A-Za-z ]{1,24}):\s*(.+)$/);
        if (labelSplit) {
          const label = labelSplit[1].trim();
          if (!SECTION_LABELS.has(label.toLowerCase())) addUnparsed(seg, label, "contact segment prefix — not a known section label, kept verbatim", label);
          part = labelSplit[2].trim();
        }
        const loc = part.match(/^([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)*)\s+([A-Z]{2})$/);
        if (loc && !/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(part)) { basics.location = part; basicsProvenance.location = spanIn(seg, part); continue; }
        if (/^[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3}$/.test(part) && !basics.name) { basics.name = part; basicsProvenance.name = spanIn(seg, part); continue; }
        if (loc) { basics.location = part; basicsProvenance.location = spanIn(seg, part); continue; }
        addUnparsed(seg, part, "contact segment part — not name-shaped or City ST-shaped", part);
      }
      return true;
    }

    function parseEducationSegment(seg) {
      const parts = splitTopLevel(seg.text, false);
      let org = null, degreeTitle = null, start = null, end = null, sawScore = false, claimedAny = false;
      const residue = [];
      for (const part of parts) {
        // score parts first: subject GPA before general GPA
        if (/\bGPA\b/i.test(part) || /\bSAT\b/i.test(part)) {
          sawScore = true; claimedAny = true;
          let restPart = part;
          const subj = restPart.match(/\b([A-Z]{2,}|major|subject)\s+GPA\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i) || restPart.match(/\(([A-Z]{2,})\s+([0-9]+(?:\.[0-9]+)?)\)/);
          if (subj) {
            mkFact(seg, { kind: "profile", name: `${subj[1].toUpperCase()} GPA`, title: `${subj[1].toUpperCase()} GPA ${subj[2]}`, text: part, value: subj[2] }, subj[0]);
            restPart = restPart.replace(subj[0], " ");
          }
          const gen = restPart.match(/\bGPA\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)(?:\s*\/\s*([0-9]+(?:\.[0-9]+)?))?/i);
          if (gen) {
            const f = mkFact(seg, { kind: "profile", name: "GPA", title: `GPA ${gen[1]}`, text: part, value: gen[1] }, gen[0]);
            if (gen[2]) f.scale = gen[2];
            profileFields.gpa = gen[1];
          }
          const sat = restPart.match(/\bSAT\s*[:=]?\s*(\d{3,4})\b/i);
          if (sat) mkFact(seg, { kind: "profile", name: "SAT", title: `SAT ${sat[1]}`, text: part, value: sat[1] }, sat[0]);
          if (!subj && !gen && !sat) residue.push(part);
          continue;
        }
        const range = part.match(RANGE_RE) || part.match(YEAR_RE);
        if (DEGREE_RE.test(part) || (range && !org && degreeTitle === null && /\b(university|college)\b/i.test(seg.text))) {
          if (range) {
            if (range[2] && range[2] !== range[1]) { start = range[1]; end = /present|now|current/i.test(range[2]) ? "present" : range[2]; }
            else { start = range[1]; end = range[1]; }
          }
          degreeTitle = part.replace(RANGE_RE, " ").replace(YEAR_RE, " ").replace(/\s+/g, " ").replace(/[\s,]+$/, "").trim() || degreeTitle;
          claimedAny = true;
          continue;
        }
        if (/\b(university|college|institute|school)\b/i.test(part) && !org) {
          const r2 = part.match(RANGE_RE) || part.match(YEAR_RE);
          if (r2 && start === null) { start = r2[1]; end = r2[2] && r2[2] !== r2[1] ? (/present|now|current/i.test(r2[2]) ? "present" : r2[2]) : r2[1]; }
          org = part.replace(RANGE_RE, " ").replace(YEAR_RE, " ").replace(/\s+/g, " ").replace(/[\s,]+$/, "").trim();
          claimedAny = true;
          continue;
        }
        if (range && !org) {
          // Education part with a span but no degree word: leading
          // proper-name run is the school; the remainder is the stated
          // discipline text, kept verbatim (no degree word invented).
          const headText = part.replace(RANGE_RE, " ").replace(/\s+/g, " ").trim();
          const words = headText.split(" ");
          const proper = [];
          for (const w of words) { if (/^[A-Z][a-z]/.test(w) || /^[A-Z][a-z]+$/.test(w) && proper.length) { if (/^[A-Z]{2,}$/.test(w)) break; proper.push(w); } else break; }
          org = proper.join(" ") || null;
          const restWords = words.slice(proper.length).join(" ").trim();
          if (restWords) degreeTitle = restWords;
          start = range[1]; end = range[2] && range[2] !== range[1] ? (/present|now|current/i.test(range[2]) ? "present" : range[2]) : range[1];
          claimedAny = true;
          continue;
        }
        residue.push(part);
      }
      if (!claimedAny && !sawScore) return false;
      if (org || degreeTitle) {
        mkFact(seg, { kind: "education", org, title: degreeTitle || org, text: seg.text, start, end });
        for (const fact of facts) if (fact.kind === "profile" && /GPA|SAT/.test(fact.name || "")) fact.about = org;
      }
      for (const r of residue) addUnparsed(seg, r, "education segment part — no rule matched it", r);
      return true;
    }

    function parseExperienceSegment(seg) {
      const paren = seg.text.match(/\(([^()]*)\)/);
      const bullets = paren ? splitTopLevel(paren[1], true) : [];
      let head = (paren ? seg.text.slice(0, paren.index) + seg.text.slice(paren.index + paren[0].length) : seg.text).replace(/[.;]\s*$/, "").trim();
      let start = null, end = null;
      const range = head.match(RANGE_RE);
      if (range) { start = range[1]; end = /present|now|current/i.test(range[2]) ? "present" : range[2]; head = head.replace(range[0], " "); }
      else {
        const open = head.match(OPEN_RANGE_RE);
        if (open) { start = open[1]; end = null; head = head.replace(open[0], " "); }
        else { const yr = head.match(YEAR_RE); if (yr) { start = yr[1]; end = yr[1]; head = head.replace(yr[0], " "); } }
      }
      head = head.replace(/[,;]\s*$/, "").replace(/\s+/g, " ").trim();
      const tokens = head.split(" ").filter(Boolean);
      const lower = tokens.map((t) => t.toLowerCase().replace(/[^a-z-]/g, ""));
      let kwIdx = -1;
      for (let i = 0; i < lower.length; i++) if (ROLE_KEYWORDS.includes(lower[i])) { kwIdx = i; break; }
      if (kwIdx < 0 || !start) return false;
      const isModifier = (t) => /^[A-Z]{1,3}$/.test(t) || /&/.test(t);
      let role, org;
      if (kwIdx === 0) { role = tokens[0]; org = tokens.slice(1).join(" "); }
      else if (kwIdx === tokens.length - 1) {
        // Role trails the org ("Lombard Global AI M&A Intern"): acronym
        // modifiers directly before the keyword belong to the ROLE, but
        // only when at least two org tokens survive the extension —
        // "Sporv AI founder" keeps org "Sporv AI", role "Founder".
        const mods = [];
        let j = kwIdx - 1;
        while (j >= 0 && isModifier(tokens[j]) && mods.length < 2) { mods.unshift(tokens[j]); j--; }
        if (mods.length && tokens.length - 1 - mods.length >= 2) { role = mods.concat(tokens[kwIdx]).join(" "); org = tokens.slice(0, j + 1).join(" "); }
        else { role = tokens[kwIdx]; org = tokens.slice(0, kwIdx).join(" "); }
      }
      else { role = tokens.slice(0, kwIdx + 1).join(" "); org = tokens.slice(kwIdx + 1).join(" "); }
      if (!org) return false;
      org = org.replace(/^at\s+/i, "");
      role = role.split(" ").map((w) => (/^[a-z]+$/.test(w) ? titleCase(w) : w)).join(" ");
      mkFact(seg, {
        kind: "experience", org, title: role, text: seg.text, bullets,
        skills: techSkillsIn(seg.text), start, end, current: end === "present" || (end === null && start !== null),
      });
      return true;
    }

    // ---- main pass ----
    for (const seg of segments) {
      const beforeFacts = facts.length, beforeUnparsed = unparsed.length;
      const basicsBefore = JSON.stringify(basics);
      // eligibility anchor: extracted from ANY segment that states it;
      // if it is the segment's whole content the segment is structured.
      const wa = seg.text.match(WORK_AUTH_RE);
      let consumedWa = false;
      if (wa) {
        mkFact(seg, { kind: "eligibility", name: "Work authorization", title: "Work authorization", text: wa[0], value: titleCase(wa[1].toLowerCase()) }, wa[0]);
        const rest = seg.text.replace(wa[0], "").replace(/[^A-Za-z0-9]+/g, " ").trim();
        consumedWa = rest.length === 0;
      }
      let claimed = consumedWa;
      if (!claimed) {
        const skillsLabel = seg.text.match(/^skills?\s*[:\-]\s*/i);
        const certsLabel = seg.text.match(/^(?:certs?|certifications?)\s*[:\-]\s*/i);
        if (skillsLabel) claimed = parseSkillsSegment(seg, seg.text.slice(skillsLabel[0].length).replace(/[.;]\s*$/, ""));
        else if (certsLabel) claimed = parseCertsSegment(seg, seg.text.slice(certsLabel[0].length).replace(/[.;]\s*$/, ""));
        else if (EMAIL_RE.test(seg.text) || PHONE_RE.test(seg.text)) claimed = parseContactSegment(seg);
        else if (/\b(university|college)\b/i.test(seg.text) || DEGREE_RE.test(seg.text) || /\bGPA\b|\bSAT\b/i.test(seg.text)) claimed = parseEducationSegment(seg);
        else if (!basics.name && /^[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3}$/.test(seg.text.replace(/\.$/, ""))) {
          // A bare name line ("TEST Alex Example" on its own line) —
          // only when nothing else claimed the segment and no name is
          // set yet. Every token must be name-shaped, so ordinary
          // capitalized sentences never land here.
          basics.name = seg.text.replace(/\.$/, "");
          basicsProvenance.name = { span: seg.text, start: seg.start, end: seg.end };
          claimed = true;
        }
        else claimed = parseExperienceSegment(seg);
      }
      const progressed = facts.length > beforeFacts || JSON.stringify(basics) !== basicsBefore;
      if (!claimed && !consumedWa && !progressed) {
        addUnparsed(seg, seg.text, "no parser rule matched this segment");
      }
      if (progressed && unparsed.length === beforeUnparsed) structured++;
      else if (progressed) partial++;
    }

    return {
      basics,
      basicsProvenance,
      profileFields,
      facts,
      unparsed,
      meta: {
        source,
        segments: segments.length,
        structuredSegments: structured,
        partialSegments: partial,
        unparsedSegments: segments.length - structured - partial,
        factCount: facts.length,
        unparsedCount: unparsed.length,
      },
    };
  }

  return { parseTextedFacts, SOURCE };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerFactsParser;
