#!/usr/bin/env node
/* Build the embedded career-KB aggregates the product reads at runtime
   (packages/career-data/kb-aggregates.json, consumed by
   packages/domain/153-career-kb.js).

   WHY EMBEDDED: the domain modules are pure/injected and the Deno bundle
   host cannot be assumed to hand them a live DB client (the CIR
   mechanism, BUG-174, embeds CAREER_CIRS_JSON the same way). The
   aggregates are generated from the SAME library files the
   career_kb_* tables were loaded from (knowledge-db.md read contract):
     ~/workspace/your_files/hired-research/   (Mega Task 1 role files)
     ~/workspace/your_files/resume-skills/    (Mega Task 3 skills files)
   Every aggregate carries its n and its source file, so a citation built
   from it is honest. Frequencies are extracted ONLY where a file states
   a skill together with a percentage/fraction AND an n (a table header,
   an evidence note, or the same sentence) — nothing is inferred.

   Regenerate:
     node scripts/career/build-kb-aggregates.cjs
   Overrides: KB_HIRED_DIR=... KB_SKILLS_DIR=... KB_OUT=... */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const ROOT = path.resolve(__dirname, "..", "..");
const HIRED = process.env.KB_HIRED_DIR || path.join(os.homedir(), "workspace/your_files/hired-research");
const SKILLS = process.env.KB_SKILLS_DIR || path.join(os.homedir(), "workspace/your_files/resume-skills");
const OUT = process.env.KB_OUT || path.join(ROOT, "packages/career-data/kb-aggregates.json");

const num = (s) => Number(String(s).replace(/,/g, ""));
const clean = (s) => String(s || "").replace(/\*\*/g, "").replace(/\*/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim();

function slugOf(file, suffix) {
  const base = file.replace(/\.md$/, "").replace(/^\d+-/, "");
  return suffix ? base.replace(/-resume-skills$/, "") : base;
}
function titleOf(text, slug) {
  const h1 = text.match(/^#\s+(.+)$/m);
  if (h1) {
    let t = clean(h1[1]);
    t = t.replace(/^(Hired Research|Resume \+ Skills)\s+—\s+\d+:\s+/i, "").replace(/^(Hired Research|Resume \+ Skills)\s+—\s+/i, "");
    t = t.replace(/\s*\(SOC\s+[\d-]+\)\s*$/, "").trim();
    if (t) return t;
  }
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
function socOf(text) {
  const m = text.match(/SOC\s+(\d{2}-\d{3,4})/);
  return m ? m[1] : null;
}
const SECTORS = { "11": "Management", "13": "Business and Financial Operations", "15": "Computer and Mathematical", "17": "Architecture and Engineering", "19": "Life, Physical, and Social Science", "21": "Community and Social Service", "23": "Legal", "25": "Educational Instruction and Library", "27": "Arts, Design, Entertainment, Sports, and Media", "29": "Healthcare Practitioners and Technical", "31": "Healthcare Support", "33": "Protective Service", "35": "Food Preparation and Serving", "37": "Building and Grounds Cleaning and Maintenance", "39": "Personal Care and Service", "41": "Sales and Related", "43": "Office and Administrative Support", "45": "Farming, Fishing, and Forestry", "47": "Construction and Extraction", "49": "Installation, Maintenance, and Repair", "51": "Production", "53": "Transportation and Material Moving", "55": "Military Specific" };

function briefHeadline(hiredText) {
  const sec = hiredText.split(/^## 1\. THE BRIEF\s*$/m)[1];
  if (!sec) return null;
  const para = sec.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith("#") && !p.startsWith("**") && p.length > 80);
  if (!para) return null;
  const plain = clean(para);
  const first = plain.match(/^[^.!?]*[.!?]/);
  const head = (first ? first[0] : plain).trim();
  return head.length > 260 ? head.slice(0, 257).trimEnd() + "…" : head;
}

/* ---- skill-frequency extraction: every hit carries pct + n + basis ---- */
const JUNK_SKILL = /(puts|places|named in|appears in|the paired file|in the (text|extract) read|not stated|no degree|insufficient|dominant requirement|stated\)|named anywhere|is named$| are$| was$| were$| named as | required \(| preferred \(| in the path| held\b| offered$| printed as| explicitly stated| credited$| in any wording|\(below\)|\(phrase\)|^Any |^No |^Not | confirmed$| at hire| necessary, stated|Duty-text|inside the cap)/i;
function addSkill(map, skill, pct, n, basis) {
  skill = clean(skill).replace(/^["“]|["”]$/g, "").replace(/\s+(named|appears|is|are)$/i, "").trim();
  if (!skill || skill.length < 2 || skill.length > 40) return;
  if (/^(the|a|an|in|of|set|corpus|intro|theme)s?\b/i.test(skill)) return;
  if (JUNK_SKILL.test(skill)) return;
  if (!Number.isFinite(pct) || pct < 0 || pct > 100 || !(n > 0)) return;
  const key = skill.toLowerCase();
  const prev = map.get(key);
  if (!prev || n > prev.n) map.set(key, { skill, pct: Math.round(pct * 10) / 10, n, basis });
}
function extractFromTables(text, map, defaultBasis, opts) {
  // A table block: consecutive | lines. Its n comes from a header cell or
  // the context lines above it ("(n=37)", "Set B (n=11)").
  // opts.skillsOnly: only harvest when the header/context names tools,
  // skills or keywords — seniority/degree/path tables in a hired file
  // are NOT skill evidence and must not be laundered into skills.
  const lines = text.split("\n");
  let block = [], context = [];
  const flush = () => {
    if (block.length < 2) { block = []; return; }
    const head = block[0];
    const ctxText = context.join(" ");
    const nMatch = (head + " " + ctxText).match(/\(n=([\d,]+)\)/);
    const n = nMatch ? num(nMatch[1]) : null;
    if (opts && opts.skillsOnly && !/tool|skill|keyword/i.test(head + " " + ctxText)) { block = []; return; }
    if (n) {
      for (const row of block.slice(1)) {
        const cells = row.split("|").map((c) => clean(c)).filter((c, i, a) => !(i === 0 && c === "") && !(i === a.length - 1 && c === ""));
        if (cells.length < 2) continue;
        const label = cells[0];
        if (!label || label.length > 44 || /^-+$/.test(label) || /^(skill|tool|theme|title marker|degree)/i.test(label)) continue;
        for (const cell of cells.slice(1)) {
          let m = cell.match(/^(\d[\d,]*)\s*(?:of\s*(\d[\d,]*))?\s*\((\d+(?:\.\d+)?)%\)/);
          if (m) { addSkill(map, label, num(m[3]), m[2] ? num(m[2]) : n, defaultBasis); break; }
          m = cell.match(/^(\d[\d,]*)\s*\/\s*(\d[\d,]*)$/);
          if (m && num(m[2]) > 0) { addSkill(map, label, (num(m[1]) / num(m[2])) * 100, num(m[2]), defaultBasis); break; }
          m = cell.match(/^(\d+(?:\.\d+)?)%$/);
          if (m) { addSkill(map, label, num(m[1]), n, defaultBasis); break; }
        }
      }
    }
    block = [];
  };
  for (const line of lines) {
    if (/^\s*\|/.test(line)) block.push(line);
    else { flush(); if (line.trim()) { context.push(line.trim()); if (context.length > 8) context.shift(); } }
  }
  flush();
}
function extractFromProse(text, map, fallbackN) {
  // "X" appears/named in A of B texts/postings  ·  X named in A of B postings
  for (const m of text.matchAll(/["“]([^"”]{2,42})["”]\s+(?:appears|is named|named)\s+in\s+(\d[\d,]*)\s+of\s+(\d[\d,]*)\s+(?:texts|postings|records)/gi)) {
    addSkill(map, m[1], (num(m[2]) / num(m[3])) * 100, num(m[3]), "corpus-count");
  }
  for (const m of text.matchAll(/\b([A-Z][\w+#./&'’ -]{1,34}?)\s+(?:is\s+)?named in\s+(\d[\d,]*)\s+of\s+(\d[\d,]*)\s+postings/gi)) {
    addSkill(map, m[1], (num(m[2]) / num(m[3])) * 100, num(m[3]), "analyzed-set-count");
  }
  // Huntr-style: puts/places X in NN% of postings — n from the same sentence or the file's evidence note.
  // The skill capture may not cross a sentence boundary (no ".") and may
  // not itself contain the reporting verb — both produced junk captures.
  for (const m of text.matchAll(/\b(?:puts|places)\s+([A-Z][\w+#/&'’ -]{1,34}?)\s+in\s+(?:about\s+)?(\d+(?:\.\d+)?)(?:\s*[-–]\s*\d+(?:\.\d+)?)?%[^.]{0,160}?\(n=([\d,]+)/gi)) {
    addSkill(map, m[1], num(m[2]), num(m[3]), "published-posting-analysis");
  }
  for (const m of text.matchAll(/\b(?:puts|places)\s+([A-Z][\w+#/&'’ -]{1,34}?)\s+in\s+(?:about\s+)?(\d+(?:\.\d+)?)%/gi)) {
    if (fallbackN) addSkill(map, m[1], num(m[2]), fallbackN, "published-posting-analysis");
  }
  for (const m of text.matchAll(/\b([A-Z][\w+#/&'’ -]{1,34}?)\s+in\s+(\d+(?:\.\d+)?)%\s+of\s+(?:[\w'-]+\s+){0,3}?postings[^.]{0,160}?\(n=([\d,]+)/gi)) {
    addSkill(map, m[1], num(m[2]), num(m[3]), "published-posting-analysis");
  }
  // Corpus floors printed inline: X appears in A of B texts (NN%)
  for (const m of text.matchAll(/["“]([^"”]{2,42})["”]\s+appears in\s+(\d[\d,]*)\s+of\s+(\d[\d,]*)/gi)) {
    addSkill(map, m[1], (num(m[2]) / num(m[3])) * 100, num(m[3]), "corpus-count");
  }
}

/* ---- experience bands ---- */
const BAND_RE = /^(intern|junior|assistant|entry|no seniority marker|plain title|level ii|level iii|senior|sr\.?|staff|principal|lead|senior-marked|0\s*[-–]\s*1|1\s*[-–]\s*3|3\s*[-–]\s*5|5\+|0\+|1\+|2\+|3\+|4\+|5\s+or more|under 1|1\s*[-–]\s*2|2\s*[-–]\s*4|4\s*[-–]\s*6)/i;
function extractExperience(hiredText) {
  const map = new Map();
  extractFromTables(hiredText, map, "experience-table");
  const bands = [...map.values()].filter((b) => BAND_RE.test(b.skill)).map((b) => ({ band: b.skill, pct: b.pct, n: b.n }));
  let note = null, n = null;
  const seg = hiredText.match(/Experience bands[^\n]*\n?([^\n]{0,400})/i) || hiredText.match(/\*\*Experience[^*]*\*\*[^\n]*\n?([^\n]{0,300})/i);
  if (seg) {
    const s = clean(seg[0]);
    const nm = s.match(/n=([\d,]+)/) || s.match(/\bn=(\d+)\b/);
    if (nm) n = num(nm[1]);
    note = s.length > 300 ? s.slice(0, 297).trimEnd() + "…" : s;
  }
  if (!note) {
    const ins = hiredText.match(/[^.\n]*experience[^.\n]*insufficient data \(n=([\d,]+)[^)]*\)[^.\n]*\./i);
    if (ins) { note = clean(ins[0]); n = num(ins[1]); }
  }
  if (!bands.length && !note) return null;
  return { bands: bands.slice(0, 6), note, n };
}

function main() {
  const hiredFiles = fs.readdirSync(HIRED).filter((f) => f.endsWith(".md") && !f.startsWith("00-") && f !== "INDEX.md");
  const skillFiles = new Map();
  for (const f of fs.readdirSync(SKILLS).filter((f) => f.endsWith(".md") && !f.startsWith("00-"))) {
    skillFiles.set(slugOf(f, true), f);
  }
  const roles = [];
  let withSkills = 0, withExp = 0;
  for (const f of hiredFiles.sort()) {
    const slug = slugOf(f, false);
    const hiredText = fs.readFileSync(path.join(HIRED, f), "utf8");
    const sf = skillFiles.get(slug);
    const skillsText = sf ? fs.readFileSync(path.join(SKILLS, sf), "utf8") : "";
    // basis n's, each from the file that states it — ONLY from explicit
    // basis phrasings; a stray "n=" in an evidence note may belong to a
    // different (rejected) population and must never become the basis.
    const evNote = (skillsText.match(/\*\*Evidence note:\*\*[\s\S]{0,900}/)?.[0]) || "";
    let skillsBasisN = null;
    const bn = evNote.match(/(?:rest on|computed from|frequencies (?:below )?(?:are|come|rest)[^\n]{0,60}?)\s+(?:the\s+)?(\d[\d,]*)\s+[\w ]*?postings/i)
      || evNote.match(/(\d[\d,]*)\s+postings read in full/i)
      || evNote.match(/truncated corpus texts \(first [^)]*\),\s*n=([\d,]+)/i)
      || evNote.match(/the\s+(\d[\d,]*)\s+postings behind/i);
    if (bn) skillsBasisN = num(bn[1]);
    const scaleSeg = (hiredText.match(/Honest scale[\s\S]{0,700}/)?.[0]) || hiredText.slice(0, 3000);
    const scale = scaleSeg.match(/(\d[\d,]*)\s+(?:job\s+)?postings\s+(?:examined|analyzed|read)/i);
    const postingsExaminedN = scale ? num(scale[1]) : null;

    const map = new Map();
    if (skillsText) {
      const sec2 = skillsText.split(/^## 2\./m)[1] || "";
      const sec2Body = sec2.split(/^## 3\./m)[0];
      extractFromTables(sec2Body, map, "skills-file-table");
      extractFromProse(sec2Body, map, skillsBasisN);
      extractFromProse(skillsText, map, skillsBasisN);
      extractFromTables(skillsText, map, "skills-file-table", { skillsOnly: true });
    }
    extractFromTables(hiredText, map, "hired-file-table", { skillsOnly: true });
    let skillList = [...map.values()].filter((x) => !BAND_RE.test(x.skill) && x.pct >= 2);
    skillList = skillList.filter((x) => !skillList.some((y) => y !== x && y.pct === x.pct && y.n === x.n && x.skill.toLowerCase().includes(y.skill.toLowerCase())));
    const skills = skillList.sort((a, b) => b.pct - a.pct || b.n - a.n).slice(0, 6);
    const experience = extractExperience(hiredText);
    if (skills.length) withSkills++;
    if (experience) withExp++;
    const soc = socOf(hiredText) || socOf(skillsText);
    roles.push({
      key: slug,
      title: titleOf(hiredText, slug),
      soc_code: soc,
      sector: soc ? SECTORS[soc.slice(0, 2)] || null : null,
      headline: briefHeadline(hiredText),
      skills,
      experience,
      postings_examined_n: postingsExaminedN,
      skills_basis_n: skillsBasisN,
      sources: { hired: `hired-research/${f}`, skills: sf ? `resume-skills/${sf}` : null },
    });
  }
  const out = {
    generated_by: "scripts/career/build-kb-aggregates.cjs",
    source_libraries: ["hired-research (Mega Task 1)", "resume-skills (Mega Task 3)"],
    db_tables: ["career_kb_roles", "career_kb_role_skills", "career_kb_postings", "career_kb_boards"],
    note: "Aggregates extracted only where a source file states a skill with a percentage/fraction AND an n. Every figure carries its own n and basis; a missing figure means the files state none, never that the value is zero.",
    roles,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  const bytes = fs.statSync(OUT).size;
  console.log(`roles=${roles.length} with_skills=${withSkills} with_experience=${withExp} bytes=${bytes} out=${OUT}`);
}
main();
