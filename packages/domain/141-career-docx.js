/* DOCX renderer for tailored resumes (companion to 123-career-tailor.js).
   The tailor renders ATS-safe text + markdown and returns pdf:null
   honestly (62-agent-documents.js is a document vault, not a renderer).
   Most recruiters accept DOCX, so this module builds a REAL .docx by
   hand: a minimal valid OOXML package written as a ZIP with no external
   dependencies (own CRC32 + local-header/central-directory writer,
   zlib.deflateRawSync for the entries — zlib is Node core).

   Package parts (exactly four):
     [Content_Types].xml  — part content types (main document + styles)
     _rels/.rels          — package -> word/document.xml
     word/document.xml    — the resume: name as a Title paragraph, section
                            headings as Heading1 paragraphs, bullets as
                            ListBullet paragraphs, the rest Normal.
     word/styles.xml      — Normal (default), Title, Heading1, ListBullet.

   TRUTH RULE (same hard gate as APPE-002): this renderer renders ONLY
   line.text. Fact IDs, evidence links and every other internal field on
   a resume line are internal audit metadata and NEVER appear in the
   document. And a resume the truth audit refused is refused here too:
   renderDocx checks the input first and returns
   { ok:false, refused:true } — with no buffer — for any resume carrying
   ok === false or refused === true (at the top level or on a wrapped
   tailorResume result's inner resume). An unaudited resume is never
   rendered.
   Pure: resume object in, { ok, buffer, contentType, filename } out.
   UMD like the other domain modules. */
const CareerDocx = (() => {
  const zlib = typeof require !== "undefined" ? require("zlib") : null;

  const CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  // ---- CRC32 (IEEE, table-driven) ----
  const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    return table;
  })();
  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  // ---- minimal ZIP writer (deflate, UTF-8 names, fixed DOS date) ----
  // Fixed timestamp (1980-01-01, the DOS epoch) keeps output deterministic.
  const DOS_TIME = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
  function zipBuffer(entries) {
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const entry of entries) {
      const nameBuf = Buffer.from(entry.name, "utf8");
      const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), "utf8");
      const compressed = zlib.deflateRawSync(data);
      const crc = crc32(data);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); // local file header signature
      local.writeUInt16LE(20, 4); // version needed
      local.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
      local.writeUInt16LE(8, 8); // method: deflate
      local.writeUInt16LE(DOS_TIME, 10);
      local.writeUInt16LE(DOS_DATE, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(compressed.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      local.writeUInt16LE(0, 28); // extra length
      chunks.push(local, nameBuf, compressed);
      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0); // central directory signature
      cd.writeUInt16LE(20, 4); // version made by
      cd.writeUInt16LE(20, 6); // version needed
      cd.writeUInt16LE(0x0800, 8);
      cd.writeUInt16LE(8, 10);
      cd.writeUInt16LE(DOS_TIME, 12);
      cd.writeUInt16LE(DOS_DATE, 14);
      cd.writeUInt32LE(crc, 16);
      cd.writeUInt32LE(compressed.length, 20);
      cd.writeUInt32LE(data.length, 24);
      cd.writeUInt16LE(nameBuf.length, 28);
      // extra (30), comment (32), disk (34), internal attrs (36) stay 0
      cd.writeUInt32LE(0, 38); // external attrs
      cd.writeUInt32LE(offset, 42); // local header offset
      central.push(cd, nameBuf);
      offset += local.length + nameBuf.length + compressed.length;
    }
    const cdSize = central.reduce((n, b) => n + b.length, 0);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // end of central directory
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(offset, 16);
    return Buffer.concat([...chunks, ...central, eocd]);
  }

  // ---- XML ----
  function esc(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
  function paragraph(style, text, opts) {
    const o = opts || {};
    const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
    const rPr = o.bold ? "<w:rPr><w:b/></w:rPr>" : "";
    return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  }

  const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:caps/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="360" w:hanging="180"/></w:pPr></w:style></w:styles>`;

  // Normalise the tailor's two input shapes into a flat block list:
  //   { header, sections:[{heading, lines:[{text,type}]}] }  (assembled resume)
  //   { lines:[{kind|type, text, section?}] }                (plain lines)
  // Only `text` is ever read off a line — factIds and other internal
  // fields are dropped here, at the boundary, so they cannot leak.
  function toBlocks(resume) {
    const blocks = [];
    const header = resume.header || {};
    if (header.name) blocks.push({ style: "Title", text: String(header.name) });
    const contact = [header.email, header.location].filter(Boolean).join(" | ");
    if (contact) blocks.push({ style: "Normal", text: contact });
    const links = Object.values(header.links || {}).filter(Boolean).join(" | ");
    if (links) blocks.push({ style: "Normal", text: links });
    const addLine = (line) => {
      if (!line || line.text == null || !String(line.text).trim()) return;
      const kind = line.type || line.kind || "normal";
      if (kind === "bullet") blocks.push({ style: "ListBullet", text: `\u2022 ${line.text}` });
      else if (kind === "entry") blocks.push({ style: "Normal", text: String(line.text), bold: true });
      else if (kind === "heading") blocks.push({ style: "Heading1", text: String(line.text).toUpperCase() });
      else blocks.push({ style: "Normal", text: String(line.text) });
    };
    if (Array.isArray(resume.sections) && resume.sections.length) {
      for (const s of resume.sections) {
        if (!s) continue;
        if (s.heading) blocks.push({ style: "Heading1", text: String(s.heading).toUpperCase() });
        for (const l of s.lines || []) addLine(l);
      }
    } else if (Array.isArray(resume.lines)) {
      let currentSection = null;
      for (const l of resume.lines) {
        if (l && l.section && l.section !== currentSection) {
          currentSection = l.section;
          blocks.push({ style: "Heading1", text: String(l.section).toUpperCase() });
        }
        addLine(l);
      }
    }
    return blocks;
  }

  function documentXml(resume) {
    const body = toBlocks(resume).map((b) => paragraph(b.style, b.text, { bold: b.bold })).join("");
    const sectPr = `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${sectPr}</w:body></w:document>`;
  }

  function slug(name) {
    const s = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return s || "resume";
  }

  function renderDocx(input) {
    // Unwrap a tailorResume() result ({ ok, resume, rendered, ... }) when
    // the caller hands us the whole result instead of the resume itself.
    let resume = input;
    if (resume && typeof resume === "object" && !resume.lines && !resume.sections && resume.resume) resume = resume.resume;
    // TRUTH GATE: a refused / failed audit never renders, at either level.
    if (!input || typeof input !== "object" || input.ok === false || input.refused === true || !resume || resume.ok === false || resume.refused === true) {
      return { ok: false, refused: true, reason: "resume was refused by the truth audit (or is missing); a DOCX is never rendered from an unaudited resume", buffer: null, contentType: CONTENT_TYPE, filename: null };
    }
    if (!zlib) return { ok: false, refused: false, reason: "zlib is unavailable in this runtime; DOCX rendering needs Node", buffer: null, contentType: CONTENT_TYPE, filename: null };
    const blocks = toBlocks(resume);
    if (!blocks.length) return { ok: false, refused: true, reason: "resume has no renderable lines", buffer: null, contentType: CONTENT_TYPE, filename: null };
    const buffer = zipBuffer([
      { name: "[Content_Types].xml", data: CONTENT_TYPES_XML },
      { name: "_rels/.rels", data: RELS_XML },
      { name: "word/document.xml", data: documentXml(resume) },
      { name: "word/styles.xml", data: STYLES_XML },
    ]);
    const filename = `${slug(resume.header && resume.header.name)}-resume.docx`;
    return { ok: true, buffer, contentType: CONTENT_TYPE, filename };
  }

  return { renderDocx, crc32, CONTENT_TYPE };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerDocx;
