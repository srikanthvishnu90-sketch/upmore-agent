/* RESUME STRUCTURING (owner lane, 2026-10-21) — raw facts in, a clean
   single-column ATS-safe resume out, as PDF + DOCX, with a parse-back
   proof that the files extract in reading order.

   What exists around this module (and is NOT rebuilt here):
     - WO-028: resume STORAGE (private bucket career-resumes, signed
       links) + tailoring tags. This module's outputs land there at
       integration time (see docs/career/resume-structuring-2026-10-21.md).
     - WO-075 / module 150: board resume fields — the upload consumer.
     - Module 148: renders the TAILOR's resume JSON (123) to PDF/DOCX.
       Its document model is single text runs per line, so it cannot
       place a date right-aligned on an entry's line; that layout, and
       the raw-facts -> model structuring itself, are what is net-new
       here. 165 does not call 148 and 148 is untouched.

   Pipeline (all pure, deterministic — same facts render byte-identical
   files: fixed ZIP timestamps, no PDF /ID or dates):
     normalizeFacts(raw)  -> model (header / education / experience /
                             skills / certifications / gaps)
     renderPdf(model)     -> hand-built PDF 1.4, Helvetica family,
                             single column, entry dates right-aligned
                             on the entry title's own baseline.
     renderDocx(model)    -> hand-built OOXML, stored ZIP entries, no
                             tables / text boxes / drawings; entry
                             dates ride a right-aligned tab stop, so
                             title + date stay ONE paragraph.
     parseBackCheck(model, {pdf, docx}) -> extracts text back out of
                             both files with this module's own parsers
                             (plus poppler pdftotext as an independent
                             second parser when the caller opts in and
                             the binary exists) and diffs reading order
                             + same-line date placement against the
                             model. Verdict PASS / FAIL with reasons —
                             never a numeric "ATS score".

   GAP LAW (the point of the lane): only facts present in the input go
   in. Every missing element is a GAP FLAG on the model — named in
   model.gaps, never invented, never smoothed over. A year-only date
   renders as the year and is flagged. A placeholder-shaped value
   (e.g. "[28]") is an unresolved fact-bank slot: it is dropped and
   flagged UNRESOLVED_PLACEHOLDER, never rendered. A resume the caller
   marks refused (ok === false / refused === true, the APPE-002 truth
   gate shape module 148 uses) renders NOTHING.

   RUNTIME: Node first (worker / board host / tests) — zlib and Buffer
   are captured opportunistically, never assumed. The module is written
   on Uint8Array + TextEncoder throughout, DOCX ZIP entries are STORED
   (no compression), and PDF streams fall back to uncompressed when
   zlib is absent, so the module also loads and renders in the
   require-less Deno bundle. NOTE the standing edge caveat: module
   148's bare-Buffer throw (F-011, fix PR #150 undeployed) is a
   separate module's defect; 165 has no bare-Buffer reference, but any
   edge wiring of 165 still ships under the same bundle discipline.
   UMD like the other domain modules. */
const CareerResumeStructure = (() => {
  "use strict";

  // ================= runtime captures (never assumed) =================
  const nodeRequire = (() => {
    try { if (typeof module !== "undefined" && module && typeof require === "function") return require; } catch { /* ignore */ }
    try { if (typeof require === "function") return require; } catch { /* ignore */ }
    return null;
  })();
  const zlib = (() => { try { return nodeRequire ? nodeRequire("node:zlib") : null; } catch { return null; } })();
  const hasBuffer = typeof Buffer !== "undefined";
  const TE = new TextEncoder();
  const TD = new TextDecoder("utf-8");

  const utf8 = (s) => TE.encode(String(s == null ? "" : s));
  function bytesToString(bytes) { return TD.decode(bytes); }
  function concatBytes(parts) {
    let n = 0; for (const p of parts) n += p.length;
    const out = new Uint8Array(n); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  // Latin-1 byte string -> Uint8Array (PDF content streams / literals).
  function latin1Bytes(s) {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }
  function bytesToLatin1(bytes) {
    let s = ""; const CH = 8192;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
    return s;
  }
  // Renderers return Uint8Array; on Node also expose a Buffer view.
  function asBuffer(u8) { return hasBuffer ? Buffer.from(u8) : u8; }

  // ================= CRC32 + stored ZIP (DOCX package) =================
  const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
    return t;
  })();
  function crc32(u8) {
    let crc = 0xffffffff;
    for (let i = 0; i < u8.length; i++) crc = CRC_TABLE[(crc ^ u8[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  const DOS_TIME = 0; const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01, deterministic
  function zipStore(entries) {
    const chunks = []; const central = []; let offset = 0;
    for (const entry of entries) {
      const nameB = utf8(entry.name);
      const data = typeof entry.data === "string" ? utf8(entry.data) : entry.data;
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true); // method 0 = stored
      local.setUint16(10, DOS_TIME, true); local.setUint16(12, DOS_DATE, true);
      local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
      local.setUint16(26, nameB.length, true); local.setUint16(28, 0, true);
      chunks.push(new Uint8Array(local.buffer), nameB, data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
      cd.setUint16(10, 0, true); cd.setUint16(12, DOS_TIME, true); cd.setUint16(14, DOS_DATE, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
      cd.setUint16(28, nameB.length, true); cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), nameB);
      offset += 30 + nameB.length + data.length;
    }
    const cdSize = central.reduce((n, b) => n + b.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, entries.length, true); eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, cdSize, true); eocd.setUint32(16, offset, true);
    return concatBytes([...chunks, ...central, new Uint8Array(eocd.buffer)]);
  }
  // Independent reader: EOCD -> central directory -> data (stored or
  // deflated), CRC verified on read. Used by the DOCX extractor.
  function unzipParts(u8) {
    const parts = new Map();
    if (!u8 || u8.length < 22) return parts;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= 0 && i >= u8.length - 22 - 65536; i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) return parts;
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    for (let n = 0; n < count && p + 46 <= u8.length; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const crc = dv.getUint32(p + 16, true);
      const compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = bytesToString(u8.subarray(p + 46, p + 46 + nameLen));
      const lNameLen = dv.getUint16(localOff + 26, true), lExtraLen = dv.getUint16(localOff + 28, true);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = u8.subarray(start, start + compSize);
      let data = null;
      if (method === 0) data = new Uint8Array(raw);
      else if (method === 8 && zlib) { try { data = new Uint8Array(zlib.inflateRawSync(raw)); } catch { data = null; } }
      if (data && crc32(data) === crc) parts.set(name, data);
      p += 46 + nameLen + extraLen + commentLen;
    }
    return parts;
  }

  // ================= WinAnsi codec + Helvetica metrics (PDF) =================
  const WINANSI_EXTRA = new Map([["\u20AC", 0x80], ["\u2026", 0x85], ["\u2018", 0x91], ["\u2019", 0x92], ["\u201C", 0x93], ["\u201D", 0x94], ["\u2022", 0x95], ["\u2013", 0x96], ["\u2014", 0x97], ["\u02DC", 0x98], ["\u2122", 0x99], ["\u0153", 0x9c], ["\u0178", 0x9f]]);
  const WINANSI_DECODE = new Map([...WINANSI_EXTRA].map(([ch, b]) => [b, ch]));
  function encodeWinAnsi(text, unencodable) {
    const bytes = [];
    for (const ch of String(text)) {
      const code = ch.codePointAt(0);
      if (code >= 0x20 && code <= 0x7e) bytes.push(code);
      else if (code >= 0xa0 && code <= 0xff) bytes.push(code);
      else if (WINANSI_EXTRA.has(ch)) bytes.push(WINANSI_EXTRA.get(ch));
      else { bytes.push(0x3f); if (unencodable && !unencodable.includes(ch)) unencodable.push(ch); }
    }
    return Uint8Array.from(bytes);
  }
  function decodeWinAnsi(bytes) {
    let out = "";
    for (const b of bytes) {
      if (b >= 0x80 && b <= 0x9f && WINANSI_DECODE.has(b)) out += WINANSI_DECODE.get(b);
      else out += String.fromCharCode(b);
    }
    return out;
  }
  // Helvetica AFM advance widths (per 1000 em) for printable ASCII —
  // the standard core-font table; right alignment is computed from it.
  const HELV_W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const HELV_EXTRA_W = new Map([["\u2022", 556], ["\u2013", 556], ["\u2014", 1000], ["\u2018", 222], ["\u2019", 222], ["\u201C", 333], ["\u201D", 333], ["\u20AC", 556], ["\u2026", 1000]]);
  function textWidthPt(text, sizePt) {
    let units = 0;
    for (const ch of String(text)) {
      const code = ch.codePointAt(0);
      if (code >= 0x20 && code <= 0x7e) units += HELV_W[code - 0x20];
      else if (HELV_EXTRA_W.has(ch)) units += HELV_EXTRA_W.get(ch);
      else if (code >= 0xa0 && code <= 0xff) units += 556;
      else units += 556;
    }
    return (units / 1000) * sizePt;
  }
  function pdfLiteral(bytes) {
    let s = "";
    for (const b of bytes) {
      if (b === 0x28) s += "\\("; else if (b === 0x29) s += "\\)"; else if (b === 0x5c) s += "\\\\";
      else if (b >= 0x20 && b <= 0x7e) s += String.fromCharCode(b);
      else s += "\\" + b.toString(8).padStart(3, "0");
    }
    return "(" + s + ")";
  }

  // ================= fact normalization (the gap law lives here) =================
  const PLACEHOLDER_RE = /\[\d+\]/;
  const isPlaceholder = (v) => typeof v === "string" && PLACEHOLDER_RE.test(v);
  const cleanStr = (v) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : (typeof v === "number" && Number.isFinite(v) ? String(v) : null));
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // A date spec: {year, month?} | 2029 | "2029" | "May 2029" | "Present".
  function normDate(v) {
    if (v == null) return null;
    if (typeof v === "object") {
      if (v.present === true || v.current === true) return { present: true, text: "Present", year: null, month: null };
      const year = v.year != null ? Number(v.year) : null;
      let month = null;
      if (typeof v.month === "number" && v.month >= 1 && v.month <= 12) month = v.month;
      else if (typeof v.month === "string") { const mi = MONTHS.findIndex((m) => m.toLowerCase() === v.month.trim().toLowerCase()); if (mi >= 0) month = mi + 1; }
      if (!year) return null;
      return { present: false, year, month, text: month ? `${MONTHS[month - 1]} ${year}` : String(year) };
    }
    const s = cleanStr(v);
    if (!s) return null;
    if (/^(present|current|now)$/i.test(s)) return { present: true, text: "Present", year: null, month: null };
    const m = s.match(/^(?:([A-Za-z]+)\s+)?(\d{4})$/);
    if (m) {
      let month = null;
      if (m[1]) { const mi = MONTHS.findIndex((x) => x.toLowerCase() === m[1].toLowerCase()) ; if (mi >= 0) month = mi + 1; else { const si = MONTH_SHORT.findIndex((x) => x.toLowerCase() === m[1].toLowerCase()); if (si >= 0) month = si + 1; } }
      const year = Number(m[2]);
      return { present: false, year, month, text: month ? `${MONTHS[month - 1]} ${year}` : String(year) };
    }
    return { present: false, year: null, month: null, text: s }; // verbatim short label, e.g. "Summer 2027"
  }
  // "2025-2029" / "2025 – Present" / {start, end} / {start_year, end_year}.
  function normRange(e) {
    let start = null, end = null;
    if (e == null || typeof e !== "object") return { start, end, text: "" };
    if (typeof e.dates === "string") {
      const parts = e.dates.split(/\s*[\u2013\u2014-]\s*/).filter(Boolean);
      if (parts.length >= 2) { start = normDate(parts[0]); end = normDate(parts.slice(1).join(" - ")); }
      else if (parts.length === 1) { end = normDate(parts[0]); }
    }
    if (!start) start = normDate(e.start != null ? e.start : (e.start_year != null ? { year: e.start_year, month: e.start_month } : null));
    if (!end) end = normDate(e.end != null ? e.end : (e.end_year != null ? { year: e.end_year, month: e.end_month } : (e.current ? { present: true } : null)));
    const text = start && end ? `${start.text} \u2013 ${end.text}` : (end ? end.text : (start ? start.text : ""));
    return { start, end, text };
  }
  const rangeSortKey = (r) => {
    const e = r.end; const s = r.start;
    const ey = e ? (e.present ? 9999 : (e.year || 0)) : 0;
    const sy = s ? (s.year || 0) : 0;
    return ey * 10000 + sy;
  };

  function normalizeFacts(raw) {
    const gaps = [];
    const gap = (code, where, detail) => gaps.push({ code, where, detail });
    const src = raw && typeof raw === "object" ? raw : {};
    // Scalar field: placeholder-shaped values are unresolved slots, not facts.
    const field = (obj, keys, where) => {
      for (const k of keys) {
        const v = obj ? obj[k] : null;
        if (v == null) continue;
        if (isPlaceholder(v)) { gap("UNRESOLVED_PLACEHOLDER", where, `value ${JSON.stringify(v)} is an unresolved placeholder — dropped, never rendered`); return null; }
        const s = cleanStr(v);
        if (s) return s;
      }
      return null;
    };
    const listOf = (v) => (Array.isArray(v) ? v : (v == null ? [] : [v]));

    const header = {
      name: field(src, ["name", "full_name"], "header.name"),
      city: field(src, ["city", "location"], "header.city"),
      phone: field(src, ["phone", "phone_number"], "header.phone"),
      email: field(src, ["email"], "header.email"),
      linkedin: field(src, ["linkedin", "linkedin_url"], "header.linkedin"),
    };
    if (header.linkedin) header.linkedin = header.linkedin.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
    if (!header.name) gap("NAME_MISSING", "header.name", "no name in the facts — a resume cannot be rendered without one");
    if (!header.city) gap("CITY_MISSING", "header.city", "no city/location in the facts");
    if (!header.phone) gap("PHONE_MISSING", "header.phone", "no phone in the facts");
    if (!header.email) gap("EMAIL_MISSING", "header.email", "no email in the facts");
    if (!header.linkedin) gap("LINKEDIN_MISSING", "header.linkedin", "no LinkedIn in the facts");

    const education = [];
    for (const [i, e] of listOf(src.education).entries()) {
      if (!e || typeof e !== "object") continue;
      const school = field(e, ["school", "university", "institution"], `education[${i}].school`);
      if (!school) { gap("EDUCATION_ENTRY_DROPPED", `education[${i}]`, "education entry without a school — dropped, not guessed"); continue; }
      const range = normRange(e);
      if (!range.text) gap("DATE_MISSING", `education[${i}].dates`, "education entry has no dates in the facts");
      else if (range.end && !range.end.present && range.end.month == null && range.end.year) {
        gap("DATE_PARTIAL", `education[${i}].end`, "graduation month not provided — year only is rendered, the month is not invented");
      }
      const notes = [];
      if (e.gpa != null && !isPlaceholder(e.gpa)) {
        const scale = e.gpa_scale != null ? `/${cleanStr(e.gpa_scale)}` : (e.gpa_max != null ? `/${cleanStr(e.gpa_max)}` : "");
        notes.push(`GPA ${cleanStr(e.gpa)}${scale}`);
      }
      for (const n of listOf(e.notes)) { const s = cleanStr(n); if (s && !isPlaceholder(s)) notes.push(s); else if (isPlaceholder(n)) gap("UNRESOLVED_PLACEHOLDER", `education[${i}].notes`, `placeholder ${JSON.stringify(n)} dropped`); }
      education.push({
        school,
        detail: field(e, ["detail", "college", "school_detail"], `education[${i}].detail`),
        degree_text: field(e, ["degree_text", "degree", "degrees"], `education[${i}].degree_text`),
        dates: range, notes,
      });
    }
    if (!education.length) gap("EDUCATION_MISSING", "education", "no education entries in the facts");

    const experience = [];
    for (const [i, e] of listOf(src.experience).entries()) {
      if (!e || typeof e !== "object") continue;
      const org = field(e, ["org", "company", "employer", "organization"], `experience[${i}].org`);
      const role = field(e, ["role", "title", "position"], `experience[${i}].role`);
      if (!org && !role) { gap("EXPERIENCE_ENTRY_DROPPED", `experience[${i}]`, "experience entry with neither org nor role — dropped, not guessed"); continue; }
      if (!org) gap("ORG_MISSING", `experience[${i}].org`, "experience entry has a role but no org in the facts");
      if (!role) gap("ROLE_MISSING", `experience[${i}].role`, "experience entry has an org but no role in the facts");
      const range = normRange(e);
      if (!range.text) gap("DATE_MISSING", `experience[${i}].dates`, "experience entry has no dates in the facts");
      const bullets = [];
      for (const b of listOf(e.bullets || e.points || e.highlights)) {
        const s = cleanStr(b);
        if (s && !isPlaceholder(s)) bullets.push(s);
        else if (isPlaceholder(b)) gap("UNRESOLVED_PLACEHOLDER", `experience[${i}].bullets`, `placeholder ${JSON.stringify(b)} dropped`);
      }
      experience.push({ org, role, location: field(e, ["location", "city"], `experience[${i}].location`), dates: range, bullets });
    }
    experience.sort((a, b) => rangeSortKey(b.dates) - rangeSortKey(a.dates));
    if (!experience.length) gap("EXPERIENCE_MISSING", "experience", "no experience entries in the facts");

    const skills = [];
    const skSrc = src.skills;
    if (Array.isArray(skSrc)) {
      const flat = [];
      for (const s of skSrc) {
        if (typeof s === "string") { const c = cleanStr(s); if (c && !isPlaceholder(c)) flat.push(c); }
        else if (s && typeof s === "object") skills.push({ label: field(s, ["label", "group", "category"], "skills.label"), items: listOf(s.items).map(cleanStr).filter(Boolean) });
      }
      if (flat.length) skills.push({ label: null, items: flat });
    } else if (skSrc && typeof skSrc === "object") {
      for (const [label, items] of Object.entries(skSrc)) skills.push({ label, items: listOf(items).map(cleanStr).filter(Boolean) });
    }
    if (!skills.length) gap("SKILLS_MISSING", "skills", "no skills in the facts");

    const certifications = [];
    for (const c of listOf(src.certifications || src.certs)) {
      if (typeof c === "string") { const s = cleanStr(c); if (s && !isPlaceholder(s)) certifications.push({ text: s }); }
      else if (c && typeof c === "object") {
        const name = field(c, ["name", "title"], "certifications.name");
        const issuer = field(c, ["issuer", "provider"], "certifications.issuer");
        if (name) certifications.push({ text: issuer ? `${name} — ${issuer}` : name });
      }
    }

    // Unassigned raw facts (fact-bank style leftovers) are never silently
    // swallowed: placeholders among them are flagged; anything else is
    // reported back as unplaced so the caller can structure it.
    const unplaced = [];
    for (const f of listOf(src.unassigned || src.extra_facts)) {
      const v = typeof f === "string" ? f : (f && typeof f === "object" ? (f.value != null ? f.value : f.text) : null);
      if (v == null) continue;
      if (isPlaceholder(v)) gap("UNRESOLVED_PLACEHOLDER", "unassigned", `placeholder ${JSON.stringify(v)} carried no fact — dropped, never rendered`);
      else unplaced.push(cleanStr(v));
    }

    const model = {
      kind: "career_resume_model", version: 1,
      ok: !(src.ok === false || src.refused === true),
      header, education, experience, skills, certifications, gaps, unplaced,
      application: { work_authorized: typeof src.work_authorized === "boolean" ? src.work_authorized : null },
    };
    return model;
  }

  // ================= the composed line truth (render + parse-back share it) =================
  // Each item: { kind, segments: [{text, style}], text } where text is the
  // normalized single-line form extraction must reproduce, in order.
  function composeItems(model) {
    const items = [];
    const h = model.header || {};
    if (h.name) items.push({ kind: "name", segments: [{ text: h.name, style: "name" }] });
    const contact = [h.city, h.phone, h.email, h.linkedin].filter(Boolean).join(" | ");
    if (contact) items.push({ kind: "contact", segments: [{ text: contact, style: "contact" }] });
    const section = (heading, body) => { if (body.length) { items.push({ kind: "heading", segments: [{ text: heading, style: "heading" }] }); items.push(...body); } };
    const eduBody = [];
    for (const e of model.education || []) {
      eduBody.push({ kind: "entry", segments: [{ text: e.school, style: "entry" }, ...(e.dates.text ? [{ text: e.dates.text, style: "date" }] : [])] });
      const sub = [e.detail, e.degree_text].filter(Boolean).join(" — ");
      if (sub) eduBody.push({ kind: "sub", segments: [{ text: sub, style: "sub" }] });
      if (e.notes && e.notes.length) eduBody.push({ kind: "line", segments: [{ text: e.notes.join(" · "), style: "line" }] });
    }
    section("EDUCATION", eduBody);
    const expBody = [];
    for (const e of model.experience || []) {
      expBody.push({ kind: "entry", segments: [{ text: e.org, style: "entry" }, ...(e.dates.text ? [{ text: e.dates.text, style: "date" }] : [])] });
      if (e.role) expBody.push({ kind: "sub", segments: [{ text: e.location ? `${e.role} — ${e.location}` : e.role, style: "role" }] });
      for (const b of e.bullets) expBody.push({ kind: "bullet", segments: [{ text: b, style: "bullet" }] });
    }
    section("EXPERIENCE", expBody);
    const skillBody = [];
    for (const g of model.skills || []) {
      if (!g.items.length) continue;
      skillBody.push({ kind: "line", segments: g.label ? [{ text: `${g.label}:`, style: "label" }, { text: g.items.join(", "), style: "line" }] : [{ text: g.items.join(", "), style: "line" }] });
    }
    section("SKILLS", skillBody);
    const certBody = (model.certifications || []).map((c) => ({ kind: "bullet", segments: [{ text: c.text, style: "bullet" }] }));
    section("CERTIFICATIONS", certBody);
    for (const it of items) it.text = it.segments.map((s) => s.text).join(" ");
    return items;
  }

  // ================= filenames (R8 pattern, shared with 148) =================
  function filenameFor(name, ext) {
    const clean = String(name || "").replace(/\([^)]*\)/g, " ").trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    const first = (parts[0] || "Resume").replace(/[^A-Za-z'-]/g, "");
    const last = (parts.length > 1 ? parts[parts.length - 1] : "").replace(/[^A-Za-z'-]/g, "");
    return `${first}${last ? `_${last}` : ""}_Resume.${ext}`;
  }

  function renderRefusal(model) {
    if (!model || model.ok === false) return { ok: false, refused: true, reason: "the facts were refused by the truth gate (or are missing); no document is rendered", buffer: null, filename: null };
    if (!model.header || !model.header.name) return { ok: false, refused: true, reason: "no name in the facts (gap NAME_MISSING); no document is rendered", buffer: null, filename: null };
    if (!composeItems(model).length) return { ok: false, refused: true, reason: "nothing renderable in the facts", buffer: null, filename: null };
    return null;
  }

  // ================= PDF renderer =================
  // Single column, US Letter, 54pt margins. Entry dates share the title's
  // baseline, right edge on the right margin. Fonts: F1 Helvetica,
  // F2 Helvetica-Bold, F3 Helvetica-Oblique. No images, no tables.
  const PAGE = { w: 612, h: 792, margin: 54, top: 740, bottom: 52 };
  const TEXT_W = PAGE.w - PAGE.margin * 2; // 504
  const STYLE_FONT = { name: "F2", heading: "F2", entry: "F2", contact: "F1", sub: "F1", role: "F3", line: "F1", bullet: "F1", date: "F1", label: "F2" };
  const STYLE_SIZE = { name: 16, heading: 11, entry: 11, contact: 10, sub: 11, role: 11, line: 11, bullet: 11, date: 11, label: 11 };
  const LEAD = { name: 20, heading: 15, entry: 14.5, contact: 13.5, sub: 14, role: 14, line: 13.8, bullet: 13.8 };
  const GAP_BEFORE = { heading: 11, entry: 7 };

  function wrapText(text, sizePt, budgetPt) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (textWidthPt(next, sizePt) <= budgetPt || !cur) cur = next;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }
  // Item -> positioned runs [{text, font, size, x}] per visual line, plus
  // rule lines for headings. y is assigned by the paginator.
  function itemLines(item) {
    const lines = [];
    if (item.kind === "name") {
      const t = item.segments[0].text;
      lines.push({ runs: [{ text: t, font: "F2", size: 16, x: PAGE.margin + (TEXT_W - textWidthPt(t, 16)) / 2 }], lead: LEAD.name });
    } else if (item.kind === "contact") {
      const t = item.segments[0].text;
      lines.push({ runs: [{ text: t, font: "F1", size: 10, x: PAGE.margin + (TEXT_W - textWidthPt(t, 10)) / 2 }], lead: LEAD.contact });
    } else if (item.kind === "heading") {
      const t = item.segments[0].text;
      lines.push({ runs: [{ text: t, font: "F2", size: 11, x: PAGE.margin }], lead: LEAD.heading, rule: true });
    } else if (item.kind === "entry") {
      const title = item.segments[0].text;
      const date = item.segments[1] ? item.segments[1].text : "";
      const runs = [{ text: title, font: "F2", size: 11, x: PAGE.margin }];
      if (date) {
        const dw = textWidthPt(date, 11);
        if (textWidthPt(title, 11) + dw + 24 <= TEXT_W) runs.push({ text: date, font: "F1", size: 11, x: PAGE.margin + TEXT_W - dw });
        else lines.push({ runs, lead: LEAD.entry }), runs.length = 0, runs.push({ text: date, font: "F1", size: 11, x: PAGE.margin + TEXT_W - dw });
      }
      lines.push({ runs, lead: LEAD.entry });
    } else if (item.kind === "bullet") {
      const t = item.segments[0].text;
      const pieces = wrapText(t, 11, TEXT_W - 14);
      pieces.forEach((p, i) => {
        const runs = [];
        if (i === 0) runs.push({ text: "\u2022", font: "F1", size: 11, x: PAGE.margin + 2 });
        runs.push({ text: p, font: "F1", size: 11, x: PAGE.margin + 14 });
        lines.push({ runs, lead: LEAD.bullet });
      });
    } else {
      const size = 11;
      const full = item.segments.map((s) => s.text).join(" ");
      const pieces = wrapText(full, size, TEXT_W);
      pieces.forEach((p) => {
        // ONE run per display line, always. Measured against poppler
        // three ways (space-width gap / trailing space glyph / leading
        // space glyph), a mid-line font switch on this line shape
        // makes poppler merge the words across the switch
        // ("Languages:Python") — so plain lines (incl. skills label
        // lines) render as a single run in a single font. The DOCX
        // keeps the bold label: OOXML extraction is character-faithful
        // and does not share the failure.
        lines.push({ runs: [{ text: p, font: STYLE_FONT[item.segments[0].style] || "F1", size, x: PAGE.margin }], lead: LEAD[item.kind] || 13.8 });
      });
      if (!pieces.length) lines.push({ runs: [{ text: full, font: "F1", size, x: PAGE.margin }], lead: 13.8 });
    }
    return lines;
  }
  function paginate(items) {
    const pages = [[]];
    let y = PAGE.top;
    let firstOnPage = true;
    for (const item of items) {
      const lines = itemLines(item);
      const gap = firstOnPage ? 0 : (GAP_BEFORE[item.kind] || 0);
      const total = gap + lines.reduce((n, l) => n + l.lead, 0);
      if (y - total < PAGE.bottom && pages[pages.length - 1].length) { pages.push([]); y = PAGE.top; firstOnPage = true; }
      y -= firstOnPage ? 0 : (GAP_BEFORE[item.kind] || 0);
      for (const l of lines) {
        if (y - l.lead < PAGE.bottom && pages[pages.length - 1].length) { pages.push([]); y = PAGE.top; }
        y -= l.lead;
        pages[pages.length - 1].push({ runs: l.runs, rule: !!l.rule, y: Math.round(y * 100) / 100 });
        firstOnPage = false;
      }
    }
    return pages;
  }
  function renderPdf(model) {
    const refusal = renderRefusal(model);
    if (refusal) return { ...refusal, contentType: "application/pdf" };
    const items = composeItems(model);
    const pages = paginate(items);
    const unencodable = [];
    const objects = [];
    const pageIds = pages.map((_, i) => 5 + i * 2);
    const contentIds = pages.map((_, i) => 6 + i * 2);
    objects.push([1, latin1Bytes("<< /Type /Catalog /Pages 2 0 R >>")]);
    objects.push([2, latin1Bytes(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`)]);
    objects.push([3, latin1Bytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")]);
    objects.push([4, latin1Bytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")]);
    objects.push([7, latin1Bytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>")]);
    const FONT_ID = { F1: 3, F2: 4, F3: 7 };
    pages.forEach((lines, i) => {
      objects.push([pageIds[i], latin1Bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 7 0 R >> >> /Contents ${contentIds[i]} 0 R >>`)]);
      const ops = [];
      for (const l of lines) {
        for (const r of l.runs) {
          ops.push(`BT /${r.font} ${r.size} Tf 1 0 0 1 ${r.x} ${l.y} Tm ${pdfLiteral(encodeWinAnsi(r.text, unencodable))} Tj ET`);
        }
        if (l.rule) ops.push(`0.7 w ${PAGE.margin} ${l.y - 3.5} m ${PAGE.margin + TEXT_W} ${l.y - 3.5} l S`);
      }
      const raw = latin1Bytes(ops.join("\n"));
      let stream = raw; let filter = "";
      if (zlib) { stream = new Uint8Array(zlib.deflateSync(raw)); filter = " /Filter /FlateDecode"; }
      const head = latin1Bytes(`<< /Length ${stream.length}${filter} >>\nstream\n`);
      objects.push([contentIds[i], concatBytes([head, stream, latin1Bytes("\nendstream")])]);
    });
    objects.sort((a, b) => a[0] - b[0]);
    const chunks = [latin1Bytes("%PDF-1.4\n")];
    const offsets = new Map();
    let pos = chunks[0].length;
    for (const [id, body] of objects) {
      const head = latin1Bytes(`${id} 0 obj\n`); const tail = latin1Bytes("\nendobj\n");
      offsets.set(id, pos);
      chunks.push(head, body, tail);
      pos += head.length + body.length + tail.length;
    }
    const maxId = Math.max(...objects.map(([id]) => id));
    let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
    for (let id = 1; id <= maxId; id++) xref += `${String(offsets.get(id) || 0).padStart(10, "0")} 00000 n \n`;
    xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF`;
    chunks.push(latin1Bytes(xref));
    const bytes = concatBytes(chunks);
    return { ok: true, buffer: asBuffer(bytes), bytes: bytes.length, contentType: "application/pdf", filename: filenameFor(model.header.name, "pdf"), pages: pages.length, unencodable };
  }

  // ================= PDF extractor (content-stream operators) =================
  function pdfStreams(u8) {
    const s = bytesToLatin1(u8);
    const out = [];
    let idx = 0;
    while (true) {
      const st = s.indexOf("stream", idx);
      if (st < 0) break;
      const dataStart = s.indexOf("\n", st) + 1;
      const en = s.indexOf("endstream", dataStart);
      if (en < 0) break;
      const dict = s.slice(Math.max(0, st - 400), st);
      const raw = latin1Bytes(s.slice(dataStart, en).replace(/\n$/, ""));
      let data = raw;
      if (/FlateDecode/.test(dict) && zlib) { try { data = new Uint8Array(zlib.inflateSync(raw)); } catch { data = raw; } }
      out.push(bytesToLatin1(data));
      idx = en + 9;
    }
    return out;
  }
  function unescapePdfLiteral(body) {
    const bytes = [];
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c === "\\" && i + 1 < body.length) {
        const n = body[i + 1];
        if (n >= "0" && n <= "7") { let oct = n; let j = i + 2; while (j < body.length && j < i + 4 && body[j] >= "0" && body[j] <= "7") { oct += body[j]; j++; } bytes.push(parseInt(oct, 8)); i = j - 1; }
        else if (n === "n") { bytes.push(10); i++; }
        else if (n === "r") { bytes.push(13); i++; }
        else if (n === "t") { bytes.push(9); i++; }
        else { bytes.push(n.charCodeAt(0)); i++; }
      } else bytes.push(c.charCodeAt(0) & 0xff);
    }
    return decodeWinAnsi(Uint8Array.from(bytes));
  }
  // Runs -> lines by baseline y (descending), segments by x (ascending).
  function extractPdfLines(u8) {
    const lines = [];
    for (const stream of pdfStreams(u8)) {
      let x = 0, y = 0;
      const re = /1 0 0 1 ([\d.-]+) ([\d.-]+) Tm|\(((?:\\.|[^\\()])*)\)\s*Tj|(-?[\d.]+) (-?[\d.]+) Td/g;
      let m;
      while ((m = re.exec(stream)) !== null) {
        if (m[1] !== undefined) { x = Number(m[1]); y = Number(m[2]); }
        else if (m[4] !== undefined) { x += Number(m[4]); y += Number(m[5]); }
        else if (m[3] !== undefined) {
          const text = unescapePdfLiteral(m[3]);
          if (text) lines.push({ y: Math.round(y), x, text });
        }
      }
    }
    lines.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    const grouped = [];
    for (const run of lines) {
      const g = grouped[grouped.length - 1];
      if (g && Math.abs(g.y - run.y) <= 2) { g.segments.push({ x: run.x, text: run.text }); }
      else grouped.push({ y: run.y, segments: [{ x: run.x, text: run.text }] });
    }
    for (const g of grouped) {
      g.segments.sort((a, b) => a.x - b.x);
      g.text = g.segments.map((s) => s.text).join(" ");
      delete g.y;
    }
    return grouped;
  }

  // ================= DOCX renderer =================
  // One column (0.75in margins on Letter), no tables, no drawings, no
  // text boxes. Entry dates ride a RIGHT tab stop at the text edge —
  // title and date stay one paragraph, so extraction order is the
  // document order and the date is on the title's line.
  const escXml = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const TAB_RIGHT_POS = 10080; // 12240 - 1080 - 1080 twips
  function runXml(text, opts) {
    const o = opts || {};
    const rPr = (o.bold || o.italic || o.size) ? `<w:rPr>${o.bold ? "<w:b/>" : ""}${o.italic ? "<w:i/>" : ""}${o.size ? `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>` : ""}</w:rPr>` : "";
    return `<w:r>${rPr}<w:t xml:space="preserve">${escXml(text)}</w:t></w:r>`;
  }
  function docxParagraph(item) {
    if (item.kind === "name") return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>${runXml(item.segments[0].text, { bold: true, size: 32 })}</w:p>`;
    if (item.kind === "contact") return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr>${runXml(item.segments[0].text, { size: 20 })}</w:p>`;
    if (item.kind === "heading") return `<w:p><w:pPr><w:spacing w:before="260" w:after="80"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr></w:pPr>${runXml(item.segments[0].text, { bold: true, size: 22 })}</w:p>`;
    if (item.kind === "entry") {
      const date = item.segments[1] ? `<w:r><w:tab/></w:r>${runXml(item.segments[1].text, {})}` : "";
      return `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="${TAB_RIGHT_POS}"/></w:tabs><w:spacing w:before="140" w:after="20"/></w:pPr>${runXml(item.segments[0].text, { bold: true })}${date}</w:p>`;
    }
    if (item.kind === "sub") return `<w:p><w:pPr><w:spacing w:after="40"/></w:pPr>${runXml(item.segments[0].text, { italic: item.segments[0].style === "role" })}</w:p>`;
    if (item.kind === "bullet") return `<w:p><w:pPr><w:ind w:left="280" w:hanging="280"/><w:spacing w:after="40"/></w:pPr>${runXml(`\u2022 ${item.segments[0].text}`)}</w:p>`;
    const runs = item.segments.map((s, si) => runXml(si === 0 ? s.text : ` ${s.text}`, { bold: s.style === "label" })).join("");
    return `<w:p><w:pPr><w:spacing w:after="40"/></w:pPr>${runs}</w:p>`;
  }
  const DOCX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const DOCX_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
  function renderDocx(model) {
    const refusal = renderRefusal(model);
    if (refusal) return { ...refusal, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    const items = composeItems(model);
    const body = items.map(docxParagraph).join("");
    const sectPr = `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${sectPr}</w:body></w:document>`;
    const bytes = zipStore([
      { name: "[Content_Types].xml", data: DOCX_CONTENT_TYPES },
      { name: "_rels/.rels", data: DOCX_RELS },
      { name: "word/document.xml", data: document },
      { name: "word/styles.xml", data: DOCX_STYLES },
    ]);
    return { ok: true, buffer: asBuffer(bytes), bytes: bytes.length, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename: filenameFor(model.header.name, "docx") };
  }

  // ================= DOCX extractor =================
  const unescXml = (t) => String(t).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  function extractDocxLines(u8) {
    const parts = unzipParts(toU8(u8));
    const doc = parts.get("word/document.xml");
    if (!doc) return [];
    const xml = bytesToString(doc);
    const lines = [];
    const pRe = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
    let pm;
    while ((pm = pRe.exec(xml)) !== null) {
      const inner = pm[1];
      const segments = [];
      let cur = "";
      const tRe = /<w:tab\s*\/>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
      let tm;
      while ((tm = tRe.exec(inner)) !== null) {
        if (tm[1] !== undefined) cur += unescXml(tm[1]);
        else { segments.push(cur); cur = ""; }
      }
      segments.push(cur);
      const clean = segments.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
      if (clean.length) lines.push({ text: clean.join(" "), segments: clean.map((text) => ({ text })) });
    }
    return lines;
  }
  function toU8(b) {
    if (!b) return new Uint8Array(0);
    if (b instanceof Uint8Array) return b;
    if (typeof b === "string") return utf8(b);
    return new Uint8Array(b);
  }

  // ================= parse-back check (the lane's proof) =================
  const normLine = (s) => String(s == null ? "" : s).replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();
  // The expected extraction, derived from the composed items: bullet
  // glyphs lead bullet lines; wrapped display lines split exactly where
  // the PDF renderer wraps (bullets only — every other item here is
  // composed to fit one line, and compose order is model order).
  function expectedLines(model) {
    const out = [];
    for (const item of composeItems(model)) {
      if (item.kind === "bullet") {
        // Only the first wrapped display line carries the glyph; the
        // continuation lines extract bare (hanging indent).
        wrapText(item.segments[0].text, 11, TEXT_W - 14).forEach((p, i) => out.push({ text: normLine(i === 0 ? `\u2022 ${p}` : p), entry: false }));
      } else {
        out.push({ text: normLine(item.text), entry: item.kind === "entry", kind: item.kind });
      }
    }
    return out;
  }
  function diffLines(expected, actual, format) {
    const problems = [];
    const a = actual.map((l) => normLine(l.text));
    const e = expected.map((l) => l.text);
    if (a.length !== e.length) problems.push(`${format}: extracted ${a.length} lines, expected ${e.length}`);
    const n = Math.min(a.length, e.length);
    for (let i = 0; i < n; i++) {
      if (a[i] !== e[i]) problems.push(`${format}: line ${i + 1} out of order or altered — expected ${JSON.stringify(e[i])}, extracted ${JSON.stringify(a[i])}`);
    }
    // Duplication check: a repeated extracted line whose expected
    // counterpart appears once is interleaving/duplication evidence.
    const counts = new Map();
    for (const t of a) counts.set(t, (counts.get(t) || 0) + 1);
    const eCounts = new Map();
    for (const t of e) eCounts.set(t, (eCounts.get(t) || 0) + 1);
    for (const [t, c] of counts) if (c > (eCounts.get(t) || 0)) problems.push(`${format}: line duplicated in extraction: ${JSON.stringify(t)}`);
    // Same-line date check: every entry line's date shares its line.
    expected.forEach((exp, i) => {
      if (!exp.entry) return;
      const parts = exp.text.split(" ");
      const dateish = parts.slice(1).join(" ");
      if (a[i] && exp.text.includes(" - ") && !a[i].endsWith(dateish.split(" - ").pop())) problems.push(`${format}: entry line ${i + 1} date is not on the title's line`);
    });
    return problems;
  }
  function structuralProblemsPdf(u8) {
    const s = bytesToLatin1(toU8(u8));
    const problems = [];
    if (/\/Subtype\s*\/Image/.test(s)) problems.push("pdf: contains an image XObject (graphics are forbidden)");
    if (/\/Type\s*\/XObject/.test(s) && !/\/Subtype\s*\/Image/.test(s)) { /* form XObjects unused by this renderer; flag only images */ }
    return problems;
  }
  function structuralProblemsDocx(u8) {
    const parts = unzipParts(toU8(u8));
    const doc = parts.get("word/document.xml");
    const problems = [];
    if (!doc) return ["docx: word/document.xml missing or CRC-bad"];
    const xml = bytesToString(doc);
    if (/<w:tbl[\s>]/.test(xml)) problems.push("docx: contains a table (layout tables are forbidden)");
    if (/<w:drawing[\s>]/.test(xml) || /<w:pict[\s>]/.test(xml)) problems.push("docx: contains a drawing/picture (graphics are forbidden)");
    if (/txbxContent/.test(xml)) problems.push("docx: contains a text box (breaks reading order)");
    return problems;
  }
  function parseBackCheck(model, rendered, opts) {
    const o = opts || {};
    const expected = expectedLines(model);
    const out = { expected_lines: expected.length, pdf: null, docx: null, problems: [] };
    if (rendered && rendered.pdf && rendered.pdf.ok) {
      const buf = toU8(rendered.pdf.buffer);
      const lines = extractPdfLines(buf);
      const problems = [...diffLines(expected, lines, "pdf"), ...structuralProblemsPdf(buf)];
      out.pdf = { lines: lines.map((l) => l.text), problems, status: problems.length ? "FAIL" : "PASS" };
      out.problems.push(...problems);
    }
    if (rendered && rendered.docx && rendered.docx.ok) {
      const buf = toU8(rendered.docx.buffer);
      const rawLines = extractDocxLines(buf);
      // DOCX paragraphs never wrap in extraction: bullet paragraphs come
      // back whole, so the DOCX expectation is the unwrapped item list.
      const docxExpected = composeItems(model).map((item) => ({ text: normLine(item.kind === "bullet" ? `\u2022 ${item.segments[0].text}` : item.text), entry: item.kind === "entry" }));
      const problems = [...diffLines(docxExpected, rawLines, "docx"), ...structuralProblemsDocx(buf)];
      out.docx = { lines: rawLines.map((l) => l.text), problems, status: problems.length ? "FAIL" : "PASS" };
      out.problems.push(...problems);
    }
    if (o.external && nodeRequire) {
      // Independent second parser for the PDF: poppler pdftotext, when
      // the binary exists. Recorded separately; never faked.
      try {
        const fs = nodeRequire("node:fs"); const os = nodeRequire("node:os"); const cp = nodeRequire("node:child_process");
        if (rendered && rendered.pdf && rendered.pdf.ok) {
          const tmp = `${os.tmpdir()}/resume165-${process.pid}.pdf`;
          fs.writeFileSync(tmp, toU8(rendered.pdf.buffer));
          const txt = cp.execFileSync("pdftotext", ["-layout", tmp, "-"], { encoding: "utf8", timeout: 15000 });
          fs.unlinkSync(tmp);
          const extLines = txt.split("\n").map((l) => normLine(l.replace(/\s{2,}/g, " "))).filter(Boolean);
          const missing = expected.map((e) => e.text).filter((t) => !extLines.some((l) => l === t || l.startsWith(t.slice(0, 24))));
          out.external_pdftext = { ran: true, lines: extLines.length, missing, status: missing.length ? "FAIL" : "PASS" };
          if (missing.length) out.problems.push(`pdftotext: ${missing.length} expected lines not found verbatim`);
        }
      } catch (e) { out.external_pdftext = { ran: false, reason: String(e && e.message || e).slice(0, 120) }; }
    }
    out.status = out.problems.length ? "FAIL" : "PASS";
    return out;
  }

  // ================= convenience: facts -> everything =================
  function buildResume(rawFacts, opts) {
    const model = normalizeFacts(rawFacts);
    const pdf = renderPdf(model);
    const docx = renderDocx(model);
    const parseBack = pdf.ok && docx.ok ? parseBackCheck(model, { pdf, docx }, opts) : { status: "NOT_RUN", problems: ["render refused"], pdf: null, docx: null };
    return { model, pdf, docx, parseBack };
  }

  return { normalizeFacts, composeItems, expectedLines, renderPdf, renderDocx, extractPdfLines, extractDocxLines, parseBackCheck, buildResume, filenameFor, textWidthPt };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CareerResumeStructure;
