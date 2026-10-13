/* Career master profile (Doc 2 §1; capabilities DISC-002, APPE-001).
   The master profile is the single source of truth for every tailored output.
   EVERY fact carries a stable fact ID (F-001, F-002, ...): IDs are assigned once
   in insertion order from the profile's own counter, never reused, and an
   update never changes an ID, so a tailored line can cite the exact fact that
   supports it and an auditor can check nothing was invented.
   Skills: a skill fact with no evidence (empty `evidence` list and no other
   fact naming the skill) is flagged `unproven: true` — it may be shown to the
   user, but the truth audit in 123-career-tailor.js will not let it support a
   tailored line.
   Ingestion:
     - LinkedIn data archive: Connections.csv + Profile.csv (documented
       LinkedIn export formats; real headers are used in the tests). Parsed
       into profile facts + connection records, each tagged source
       "linkedin-export". Malformed rows (wrong column count) are collected
       as errors and skipped, never thrown and never silently canonised.
     - Plain-text resume: parsed into DRAFT facts, every one with
       needs_confirmation:true and status:"draft". A draft fact does not
       support tailoring until confirmFact() is called — ingestion never
       silently canonises.
   Fact-mining interview: factMiningQuestions(entry) returns the digging
   questions for a thin entry (missing stack / scale / what-it-replaced /
   metric / outcome), modelled on Doc 2 §1 ("what stack, how many users,
   what did it replace, any metric?").
   Pure: no I/O. The caller passes CSV / resume text in. UMD like the other
   domain modules. */
const CareerProfile = (() => {
  const KINDS = ["experience", "project", "skill", "education", "award", "leadership", "publication", "certification", "language", "preference", "other"];

  function nextId(profile) {
    profile._seq = (profile._seq || 0) + 1;
    return `F-${String(profile._seq).padStart(3, "0")}`;
  }
  function bumpSeqForId(profile, id) {
    const n = Number(String(id || "").replace(/^F-/, ""));
    if (Number.isFinite(n) && n > (profile._seq || 0)) profile._seq = n;
  }

  function createProfile(seed) {
    const s = seed || {};
    const p = {
      id: s.id || "profile-1",
      label: s.label || null,
      isTestFixture: !!s.isTestFixture,
      basics: Object.assign({ name: null, email: null, phone: null, location: null, links: {} }, s.basics || {}),
      preferences: Object.assign({ roles: [], industries: [], locations: [], remote: null, companySize: null, compFloor: null, dealBreakers: [], targetCompanies: [], excludedCompanies: [] }, s.preferences || {}),
      constraints: Object.assign({ graduationDate: null, startDate: null, workAuthorization: null, needsSponsorship: null, relocation: null, securityClearance: null }, s.constraints || {}),
      defaults: Object.assign({ pronouns: null, demographicPreference: "decline to answer", gpa: null }, s.defaults || {}),
      facts: [],
      connections: [],
      _seq: 0,
    };
    for (const f of s.facts || []) addFact(p, f, { keepId: true });
    for (const c of s.connections || []) p.connections.push(Object.assign({}, c));
    return p;
  }

  // profileFromData is createProfile with the fixture/JSON shape kept verbatim.
  function profileFromData(data) { return createProfile(data || {}); }

  function normalizeFact(profile, input, opts) {
    const o = opts || {};
    const f = Object.assign({}, input || {});
    f.id = o.keepId && f.id ? String(f.id) : nextId(profile);
    if (o.keepId) bumpSeqForId(profile, f.id);
    f.kind = KINDS.includes(f.kind) ? f.kind : "other";
    f.title = f.title || f.name || "";
    f.text = f.text || f.title || "";
    f.bullets = Array.isArray(f.bullets) ? f.bullets.slice() : [];
    f.skills = Array.isArray(f.skills) ? f.skills.slice() : (f.name && f.kind === "skill" ? [f.name] : []);
    f.evidence = Array.isArray(f.evidence) ? f.evidence.slice() : [];
    f.source = f.source || "user";
    f.needs_confirmation = !!f.needs_confirmation;
    f.status = f.needs_confirmation ? "draft" : (f.status || "confirmed");
    if (f.kind === "skill") {
      f.name = f.name || f.title;
      f.unproven = f.evidence.length === 0;
    }
    return f;
  }

  function addFact(profile, input, opts) {
    const f = normalizeFact(profile, input, opts);
    // A skill is proven if another already-stored fact evidences it by name,
    // even when its own evidence list is empty at insert time; recompute on add.
    profile.facts.push(f);
    refreshSkillFlags(profile);
    return f;
  }
  function refreshSkillFlags(profile) {
    for (const f of profile.facts) {
      if (f.kind !== "skill") continue;
      const name = (f.name || "").toLowerCase();
      const evidencedByFactText = profile.facts.some((x) => x.id !== f.id && x.kind !== "skill" && ((x.skills || []).some((s) => String(s).toLowerCase() === name) || String(x.text || "").toLowerCase().includes(name)));
      f.unproven = !(f.evidence && f.evidence.length) && !evidencedByFactText;
    }
  }
  function updateFact(profile, id, patch) {
    const f = getFact(profile, id);
    if (!f) return null;
    const keepId = f.id;
    Object.assign(f, patch || {});
    f.id = keepId; // IDs are stable: an update never reassigns one.
    if (f.kind === "skill") f.unproven = !(f.evidence && f.evidence.length);
    refreshSkillFlags(profile);
    return f;
  }
  function getFact(profile, id) { return (profile.facts || []).find((f) => f.id === id) || null; }
  function listFacts(profile, filter) {
    return (profile.facts || []).filter((f) => !filter || Object.entries(filter).every(([k, v]) => f[k] === v));
  }
  function confirmFact(profile, id) {
    const f = getFact(profile, id);
    if (!f) return null;
    f.needs_confirmation = false; f.status = "confirmed";
    return f;
  }
  function confirmedFacts(profile) { return (profile.facts || []).filter((f) => !f.needs_confirmation); }
  function unprovenSkills(profile) { refreshSkillFlags(profile); return (profile.facts || []).filter((f) => f.kind === "skill" && f.unproven); }
  function skillEvidence(profile, skillName) {
    const name = String(skillName || "").toLowerCase();
    const skill = (profile.facts || []).find((f) => f.kind === "skill" && (f.name || "").toLowerCase() === name);
    const supporting = (profile.facts || []).filter((f) => !f.needs_confirmation && f.kind !== "skill" && ((f.skills || []).some((s) => String(s).toLowerCase() === name) || String(f.text || "").toLowerCase().includes(name)));
    const evidenceIds = new Set([].concat((skill && skill.evidence) || [], supporting.map((f) => f.id)));
    return { skill: skill || null, proven: evidenceIds.size > 0 && (!!skill ? !skill.unproven || supporting.length > 0 : supporting.length > 0), evidenceFactIds: [...evidenceIds], supportingFactIds: supporting.map((f) => f.id) };
  }

  // ---- fact-mining interview (Doc 2 §1) ----
  const METRIC_RE = /\b\d+(\.\d+)?\s*(%|users?|customers?|teams?|members?|people|hours?|minutes?|pages?|companies|participants|requests|ms\b|x\b)/i;
  const NUMBER_RE = /\b\d[\d,.]*\b/;
  function factMiningQuestions(entry) {
    const e = entry || {};
    const text = [e.title, e.text, ...(e.bullets || [])].filter(Boolean).join(" ");
    const stack = (e.skills && e.skills.length) || /\b(react|python|java|javascript|typescript|go|sql|excel|kubernetes|docker|aws|node)\b/i.test(text);
    const qs = [];
    if (!stack) qs.push("What stack or tools did you use for this — languages, frameworks, and infrastructure?");
    if (!/\b\d+\s+(?:\w+\s+)?(users?|customers?|teams?|members?|people|participants)\b/i.test(text)) qs.push("How many users, teams, or people used or were affected by this?");
    if (!/replac|instead of|manual|spreadsheet|previously|before this/i.test(text)) qs.push("What did this replace, or what was done manually before it?");
    if (!METRIC_RE.test(text) && !NUMBER_RE.test(text)) qs.push("Is there any metric — a percentage, a time saved, a count, or a result you can point to?");
    if (!/result|outcome|cut |increased|reduced|improved|led to|shipped|launched/i.test(text)) qs.push("What changed because of this work — what was the outcome?");
    if (!(e.start || e.end || /\b(19|20)\d{2}\b/.test(text))) qs.push("When did you do this, and for how long?");
    return qs;
  }
  const isThin = (entry) => factMiningQuestions(entry).length >= 2;

  // ---- CSV (LinkedIn exports use quoted fields with embedded commas) ----
  function parseCsv(text) {
    const rows = []; let row = [], cur = "", inQ = false;
    const s = String(text || "");
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inQ) {
        if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && s[i + 1] === "\n") i++;
        row.push(cur); cur = "";
        if (row.some((x) => String(x).trim() !== "")) rows.push(row);
        row = [];
      } else cur += c;
    }
    row.push(cur);
    if (row.some((x) => String(x).trim() !== "")) rows.push(row);
    return rows;
  }
  function rowsToObjects(text, headerNeedle) {
    const rows = parseCsv(text);
    const hi = rows.findIndex((r) => r.some((c) => String(c).trim().toLowerCase() === headerNeedle));
    if (hi < 0) return { headers: [], objects: [], errors: [{ row: 0, reason: `header row containing "${headerNeedle}" not found` }], preamble: rows.length };
    const headers = rows[hi].map((h) => String(h).trim());
    const objects = [], errors = [];
    rows.slice(hi + 1).forEach((r, idx) => {
      if (r.length !== headers.length) { errors.push({ row: hi + 2 + idx, reason: `expected ${headers.length} columns, got ${r.length}`, raw: r }); return; }
      const obj = {}; headers.forEach((h, j) => { obj[h] = String(r[j] == null ? "" : r[j]).trim(); });
      objects.push(obj);
    });
    return { headers, objects, errors, preamble: hi };
  }

  // LinkedIn Connections.csv headers (real export):
  // First Name,Last Name,URL,Email Address,Company,Position,Connected On
  function parseLinkedInConnections(csvText) {
    const { objects, errors } = rowsToObjects(csvText, "first name");
    const connections = objects.map((o) => ({
      firstName: o["First Name"] || "", lastName: o["Last Name"] || "",
      name: `${o["First Name"] || ""} ${o["Last Name"] || ""}`.trim(),
      url: o["URL"] || null, email: o["Email Address"] || null,
      company: o["Company"] || null, position: o["Position"] || null,
      connectedOn: o["Connected On"] || null, source: "linkedin-export",
    })).filter((c) => c.name);
    return { connections, errors };
  }
  // LinkedIn Profile.csv headers (real export):
  // First Name,Last Name,Maiden Name,Address,Birth Date,Headline,Summary,Industry,Zip Code,Geo Location,Twitter Handles,Websites,Instant Messengers
  function parseLinkedInProfile(csvText) {
    const { objects, errors } = rowsToObjects(csvText, "first name");
    if (!objects.length) return { profileRow: null, errors };
    const o = objects[0];
    return {
      profileRow: {
        firstName: o["First Name"] || "", lastName: o["Last Name"] || "",
        headline: o["Headline"] || null, summary: o["Summary"] || null,
        industry: o["Industry"] || null, geoLocation: o["Geo Location"] || null,
        websites: o["Websites"] || null, source: "linkedin-export",
      },
      errors,
    };
  }
  function ingestLinkedIn(profile, input) {
    const inp = input || {};
    const addedFacts = [], errors = [];
    if (inp.connectionsCsv) {
      const r = parseLinkedInConnections(inp.connectionsCsv);
      errors.push(...r.errors.map((e) => ({ ...e, file: "Connections.csv" })));
      for (const c of r.connections) profile.connections.push(c);
      if (r.connections.length) addedFacts.push(addFact(profile, { kind: "other", title: `LinkedIn connections (${r.connections.length})`, text: `Imported ${r.connections.length} LinkedIn connections from a LinkedIn data export.`, source: "linkedin-export" }));
    }
    if (inp.profileCsv) {
      const r = parseLinkedInProfile(inp.profileCsv);
      errors.push(...r.errors.map((e) => ({ ...e, file: "Profile.csv" })));
      if (r.profileRow) {
        const pr = r.profileRow;
        if (pr.firstName || pr.lastName) profile.basics.name = profile.basics.name || `${pr.firstName} ${pr.lastName}`.trim();
        if (pr.geoLocation) profile.basics.location = profile.basics.location || pr.geoLocation;
        addedFacts.push(addFact(profile, { kind: "other", title: pr.headline || "LinkedIn headline", text: [pr.headline, pr.summary].filter(Boolean).join(" — ") || "LinkedIn profile imported.", source: "linkedin-export" }));
      }
    }
    return { addedFacts, connections: profile.connections.slice(), errors };
  }

  // ---- plain-text resume ingestion -> DRAFT facts only ----
  const SECTION_KIND = { education: "education", experience: "experience", "work experience": "experience", employment: "experience", projects: "project", "personal projects": "project", leadership: "leadership", awards: "award", certifications: "certification", skills: "skill", "technical skills": "skill" };
  function parseResumeText(text) {
    const lines = String(text || "").split(/\r?\n/);
    const drafts = [];
    let section = null, current = null;
    const flush = () => { if (current) { drafts.push(current); current = null; } };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (/^test resume/i.test(line)) continue;
      const sec = SECTION_KIND[line.toLowerCase().replace(/:$/, "")];
      if (sec && line.length < 40) { flush(); section = sec; continue; }
      if (!section) continue; // header/contact block is not a fact
      if (section === "skill") {
        for (const name of line.split(/[,;•|]/).map((x) => x.trim()).filter(Boolean)) {
          drafts.push({ kind: "skill", name, title: name, text: `Skill: ${name}`, skills: [name], evidence: [], source: "resume-ingest", needs_confirmation: true, status: "draft" });
        }
        continue;
      }
      const bullet = line.match(/^[-•*]\s+(.*)$/);
      if (bullet && current) { current.bullets.push(bullet[1]); current.text += ` ${bullet[1]}`; continue; }
      if (bullet && !current) { current = { kind: section, title: bullet[1], text: bullet[1], bullets: [], source: "resume-ingest", needs_confirmation: true, status: "draft" }; continue; }
      flush();
      current = { kind: section, title: line, text: line, bullets: [], source: "resume-ingest", needs_confirmation: true, status: "draft" };
    }
    flush();
    return drafts;
  }
  function ingestResume(profile, text) {
    const drafts = parseResumeText(text).map((d) => addFact(profile, d));
    // addFact normalises needs_confirmation from the draft flag; re-assert it so
    // a resume draft can never arrive confirmed by accident.
    for (const f of drafts) { f.needs_confirmation = true; f.status = "draft"; }
    refreshSkillFlags(profile);
    return { drafts, factIds: drafts.map((f) => f.id) };
  }

  return { KINDS, createProfile, profileFromData, addFact, updateFact, getFact, listFacts, confirmFact, confirmedFacts, unprovenSkills, skillEvidence, factMiningQuestions, isThin, parseCsv, parseLinkedInConnections, parseLinkedInProfile, ingestLinkedIn, parseResumeText, ingestResume, refreshSkillFlags };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerProfile;
