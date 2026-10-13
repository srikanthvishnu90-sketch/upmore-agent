/* DOCX renderer tests (141-career-docx.js) — TEST persona fixtures only.
   The produced .docx is verified by parsing the ZIP back from scratch
   (central-directory reader + zlib.inflateRawSync + an independent CRC32
   implementation), never by trusting the writer's own bookkeeping. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const Profile = require("../packages/domain/122-career-profile.js");
const Tailor = require("../packages/domain/123-career-tailor.js");
const Docx = require("../packages/domain/141-career-docx.js");

const fixtureDir = path.join(__dirname, "..", "packages", "career-data", "fixtures");
function loadFixture() {
  return Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(fixtureDir, "test-persona.json"), "utf8")));
}
const SWE_JD = `Software Engineer, New Grad (TEST posting)
Required: Python, JavaScript, React, SQL, PostgreSQL, Git.
Nice to have: Kubernetes, Docker, AWS.
You will build APIs and deploy services.`;

// Independent CRC32 (same IEEE polynomial, written for the test so the
// writer's table is checked, not echoed).
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Tiny ZIP reader: locate the EOCD, walk the central directory, inflate
// each entry from its local header. Returns Map name -> { data, crc }.
function unzipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  assert.ok(eocd >= 0, "end-of-central-directory record not found");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let n = 0; n < count; n++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, "central directory entry signature");
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    assert.equal(buf.readUInt32LE(localOff), 0x04034b50, "local header signature");
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    out.set(name, { data, crc, text: data.toString("utf8") });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function tailoredResume() {
  const p = loadFixture();
  const r = Tailor.tailorResume(p, SWE_JD, { jobId: "TEST-JOB-1", date: "2026-10-12" });
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  return r;
}

test("renderDocx: valid minimal OOXML package with all four parts, CRCs verify", () => {
  const r = tailoredResume();
  const out = Docx.renderDocx(r.resume);
  assert.equal(out.ok, true);
  assert.ok(Buffer.isBuffer(out.buffer));
  assert.equal(out.contentType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.match(out.filename, /\.docx$/);
  assert.equal(out.buffer.readUInt32LE(0), 0x04034b50, "starts with a ZIP local header");
  const entries = unzipEntries(out.buffer);
  assert.deepEqual([...entries.keys()].sort(), ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml"].sort());
  for (const [name, e] of entries) assert.equal(crc32(e.data), e.crc, `CRC mismatch for ${name}`);
  assert.match(entries.get("[Content_Types].xml").text, /wordprocessingml\.document\.main\+xml/);
  assert.match(entries.get("_rels/.rels").text, /Target="word\/document\.xml"/);
  assert.match(entries.get("word/styles.xml").text, /w:styleId="Title"/);
  assert.match(entries.get("word/styles.xml").text, /w:styleId="Heading1"/);
  assert.match(entries.get("word/styles.xml").text, /w:styleId="ListBullet"/);
});

test("document.xml: persona content rendered, styled, and free of internal metadata", () => {
  const r = tailoredResume();
  const out = Docx.renderDocx(r.resume);
  const doc = unzipEntries(out.buffer).get("word/document.xml").text;
  assert.match(doc, /Alex Testcase/); // persona name (Title paragraph)
  assert.match(doc, /w:val="Title"/);
  assert.match(doc, /w:val="Heading1"/);
  assert.match(doc, /EXPERIENCE/); // section heading
  assert.match(doc, /Kubernetes/); // evidenced skills token (fact F-003)
  assert.match(doc, /Built a reporting dashboard in React and Python used by 200 internal users/); // experience line
  assert.match(doc, /w:val="ListBullet"/); // bullets as list-style paragraphs
  // TRUTH RULE: no fact IDs, no internal persona id, ever.
  assert.ok(!/\bF-\d{3}\b/.test(doc), "fact ID leaked into document.xml");
  assert.ok(!doc.includes("TEST-PERSONA"), "internal persona_id leaked into document.xml");
  assert.ok(!/\bF-\d{3}\b/.test(unzipEntries(out.buffer).get("word/styles.xml").text));
});

test("plain {lines:[{kind,text}]} shape renders, with XML escaping", () => {
  const out = Docx.renderDocx({ lines: [
    { kind: "heading", text: "Summary" },
    { kind: "bullet", text: "Shipped A & B <fast> for 200 users" },
    { kind: "normal", text: "Plain line" },
  ] });
  assert.equal(out.ok, true);
  const doc = unzipEntries(out.buffer).get("word/document.xml").text;
  assert.match(doc, /SUMMARY/);
  assert.match(doc, /Shipped A &amp; B &lt;fast&gt; for 200 users/);
  assert.ok(!doc.includes("<fast>"), "unescaped text broke the XML");
  assert.match(doc, /Plain line/);
});

test("refused resumes never render: stub, real audit refusal, and missing input", () => {
  const stub = Docx.renderDocx({ ok: false, refused: true, resume: null });
  assert.equal(stub.ok, false);
  assert.equal(stub.refused, true);
  assert.equal(stub.buffer, null);

  // Real refusal through the tailor's hard gate (unevidenced Rust claim).
  const p = loadFixture();
  const attempt = Tailor.tailorResume(p, SWE_JD, { extraLines: [{ text: "Expert in Rust with 5 years of production experience", factIds: ["F-017"], type: "bullet" }] });
  assert.equal(attempt.ok, false);
  assert.equal(attempt.refused, true);
  const viaResult = Docx.renderDocx(attempt);
  assert.equal(viaResult.ok, false);
  assert.equal(viaResult.refused, true);
  assert.equal(viaResult.buffer, null);
  const viaRender = Tailor.render(attempt, { format: "docx" });
  assert.equal(viaRender.ok, false);
  assert.equal(viaRender.buffer, null);

  const missing = Docx.renderDocx(null);
  assert.equal(missing.ok, false);
  assert.equal(missing.refused, true);
  assert.equal(Docx.renderDocx({ lines: [] }).ok, false);
});

test("tailor render(format:'docx') works end-to-end; default render unchanged", () => {
  const r = tailoredResume();
  const out = Tailor.render(r.resume, { format: "docx" });
  assert.equal(out.ok, true);
  assert.ok(Buffer.isBuffer(out.buffer));
  assert.equal(out.contentType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const doc = unzipEntries(out.buffer).get("word/document.xml").text;
  assert.match(doc, /Alex Testcase/);
  assert.ok(!/\bF-\d{3}\b/.test(doc));
  // Default text/markdown render keeps its exact prior contract.
  const plain = Tailor.render(r.resume);
  assert.equal(plain.pdf, null); // PDF still honestly has no renderer
  assert.match(plain.text, /SKILLS/);
  assert.match(plain.markdown, /## Skills/);
  // And a whole tailorResume result can be handed to render() directly.
  const whole = Tailor.render(r, { format: "docx" });
  assert.equal(whole.ok, true);
  assert.ok(Buffer.isBuffer(whole.buffer));
});
