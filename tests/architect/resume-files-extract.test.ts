// FEATURE 16 (capability map ON-02): ingestResumeFile reads the resume files people have into the text the router's
// resume step parses, and refuses in plain words what it cannot read honestly. For each fixture (synthetic personas,
// tests/fixtures/resume-files/make.py) the expected entries are found with their exact text by module 122's own parser,
// and the structure report says what was found. Every refusal is exact and carries no text.
// Run: deno test -A --no-check tests/architect/resume-files-extract.test.ts
import assertNode from "node:assert/strict";
import { CareerProfile } from "../../supabase/functions/_shared/router_core.career.js";
import { docxText, ingestResumeFile, PDF_MAX_PAGES, REPLIES, RESUME_FILE_MAX_BYTES, RESUME_TEXT_MAX, rtfText, shapeResumeText, splitColumns } from "../../supabase/functions/_shared/career_resume_ingest_files.ts";
import { zipSync, strToU8 } from "../../supabase/functions/_shared/vendor/fflate-0.8.2.mjs";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const FX = new URL("../fixtures/resume-files/", import.meta.url).pathname;
const read = (n: string) => Deno.readFile(FX + n);
// deno-lint-ignore no-explicit-any
const entries = (text: string) => (CareerProfile as any).parseResumeText(text) as any[];
// deno-lint-ignore no-explicit-any
const shape = (ds: any[], kind: string) => ds.filter((d) => d.kind === kind).map((d) => kind === "skill" ? d.name : [d.title, ...d.bullets]);
const hex = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");

const TWO_COLUMN_TEXT = `Avery Lindqvist
avery.lindqvist@example.com · Chicago, IL · github.com/avery-l-example
Skills
SQL, Python, Tableau
dbt, Airflow, Excel
Education
B.S. Statistics, Lakeshore State
Certifications
Certified Analytics Professional
Experience
Data Analyst, Northwind Logistics Jun 2024 – Present
• Built a SQL pipeline that flagged late shipments across 14 warehouses, cutting manual review from 6 hours to 1 a week
• Automated the weekly operations KPI report in Python and Tableau
Analytics Intern, Fabrikam Health May 2023 – Aug 2023
• Cleaned 3 years of clinic scheduling data and documented the no-show model the team adopted
Projects
Shipment delay forecaster
• Gradient-boosted model on public freight data; 0.81 AUC`;

Deno.test("two-column PDF: the header first, then each column whole; wrapped bullets joined; ligatures read as letters; right-aligned dates on their line", async () => {
  const bytes = await read("two-column.pdf");
  const r = await ingestResumeFile({ bytes, filename: "two-column.pdf", mime: "application/pdf", channel: "web", uploadRef: "web-upload:test-1" });
  assert(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  eq(r.text, TWO_COLUMN_TEXT);
  const ds = entries(r.text);
  eq(shape(ds, "experience"), [
    ["Data Analyst, Northwind Logistics Jun 2024 – Present", "Built a SQL pipeline that flagged late shipments across 14 warehouses, cutting manual review from 6 hours to 1 a week", "Automated the weekly operations KPI report in Python and Tableau"],
    ["Analytics Intern, Fabrikam Health May 2023 – Aug 2023", "Cleaned 3 years of clinic scheduling data and documented the no-show model the team adopted"],
  ]);
  eq(shape(ds, "certification"), [["Certified Analytics Professional"]], "the ﬁ ligature glyph reads as fi");
  eq(shape(ds, "skill"), ["SQL", "Python", "Tableau", "dbt", "Airflow", "Excel"]);
  eq(r.report.columns, [2]);
  eq([r.report.pages, r.report.pagesRead, r.report.confidence, r.report.resumeShaped, r.report.entries], [1, 1, "high", true, 11]);
  eq(r.report.sections.map((s) => [s.name, s.heading, s.entries]), [["Skills", "Skills", 6], ["Education", "Education", 1], ["Certifications", "Certifications", 1], ["Experience", "Experience", 2], ["Projects", "Projects", 1]]);
  eq(r.report.headingsRenamed.find((h) => h.to === "Experience"), { from: "PROFESSIONAL EXPERIENCE", to: "Experience" });
  eq([r.upload.kind, r.upload.ref, r.upload.sha256, r.upload.bytes, r.upload.format], ["file", "web-upload:test-1", await hex(bytes), bytes.length, "pdf"]);
  // A PDF with only an owner password opens without one: read the same.
  const owner = await ingestResumeFile({ bytes: await read("encrypted-owner-only.pdf"), filename: "x.pdf" });
  eq(owner.ok && owner.text, TWO_COLUMN_TEXT);
});

Deno.test("a single column with right-aligned dates is not split into columns", () => {
  const it = (s: string, x: number, y: number, w: number) => ({ s, x, y, w, size: 10 });
  const items = [it("Experience", 50, 700, 60), it("Analyst, Acme", 50, 680, 90), it("2024 – Present", 480, 680, 80), it("• Built the report that the team used every week for planning", 56, 666, 330),
    it("Barista, Bean Co", 50, 640, 90), it("2022 – 2023", 480, 640, 70), it("• Opened the store at 6 and ran the register for the morning rush", 56, 626, 340), it("Education", 50, 600, 60)];
  eq(splitColumns(items, 612).cols, 1);
});

const TABLE_TEXT = `Rowan Castellanos
rowan.castellanos@example.com | Austin, TX
Skills
JavaScript, TypeScript, React
Node.js, PostgreSQL
Education
B.S. Computer Science, Prairie Ridge University, 2025
Experience
Software Engineering Intern, Tailspin Toys — Summer 2024
• Shipped a checkout retry queue that recovered 2.3% of failed orders
• Wrote the integration tests for the payments service
Teaching Assistant, Prairie Ridge University — 2023 – 2025
• Led weekly labs for 40 students in Data Structures
Projects
Campus ride board
• A React and PostgreSQL app used by 300 students to share rides`;
const TABLE_EXP = [
  ["Software Engineering Intern, Tailspin Toys — Summer 2024", "Shipped a checkout retry queue that recovered 2.3% of failed orders", "Wrote the integration tests for the payments service"],
  ["Teaching Assistant, Prairie Ridge University — 2023 – 2025", "Led weekly labs for 40 students in Data Structures"],
];
Deno.test("DOCX laid out in a table: cells in reading order, Word list paragraphs as bullets", async () => {
  const r = await ingestResumeFile({ bytes: await read("table-layout.docx"), filename: "table-layout.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  assert(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  eq(r.text, TABLE_TEXT);
  const ds = entries(r.text);
  eq(shape(ds, "experience"), TABLE_EXP);
  eq(shape(ds, "education"), [["B.S. Computer Science, Prairie Ridge University, 2025"]]);
  eq(shape(ds, "project"), [["Campus ride board", "A React and PostgreSQL app used by 300 students to share rides"]]);
  eq([r.report.format, r.report.confidence, r.report.entries], ["docx", "high", 9]);
});

Deno.test("RTF (LibreOffice's save of the same file): the same entries", async () => {
  const r = await ingestResumeFile({ bytes: await read("table-layout.rtf"), filename: "table-layout.rtf", mime: "application/rtf" });
  assert(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  eq(shape(entries(r.text), "experience"), TABLE_EXP);
  eq(r.text.replace(/\n\n/g, "\n"), TABLE_TEXT);
  // Escapes: hex bytes in cp1252, \u with its fallback skipped, skipped destinations.
  eq(rtfText(new TextEncoder().encode("{\\rtf1{\\fonttbl{\\f0 Arial;}}{\\*\\generator x;}Caf\\'e9 \\u8212? \\bullet  Led\\par next}")), "Café — • Led\nnext");
});

Deno.test("plain text: UTF-8, UTF-16 with a BOM, and Windows-1252 all read; a long paste keeps every line", async () => {
  const paste = await Deno.readTextFile(FX + "long-paste.txt");
  const r = await ingestResumeFile({ bytes: new TextEncoder().encode(paste), filename: "resume.txt", mime: "text/plain" });
  assert(r.ok);
  if (!r.ok) return;
  const exp = entries(r.text).filter((d) => d.kind === "experience");
  eq(exp.length, 9, "eight roles and the injected line, as entries");
  eq(exp[7].title, "Operations Intern, Northwind Traders | Chicago, IL | Jun 2009 - Aug 2009");
  eq(exp[7].bullets.length, 8);
  const u16 = new Uint8Array([0xff, 0xfe, ...[..."Experience\nAnalyst, Acme\nEducation\nB.A. History"].flatMap((c) => [c.charCodeAt(0), 0])]);
  const a = await ingestResumeFile({ bytes: u16, filename: "r.txt" });
  eq(a.ok && a.text, "Experience\nAnalyst, Acme\nEducation\nB.A. History");
  const w1252 = await ingestResumeFile({ bytes: new Uint8Array([...new TextEncoder().encode("Experience\nCaf"), 0xe9, ...new TextEncoder().encode(" manager")]), filename: "r.txt" });
  eq(w1252.ok && w1252.text, "Experience\nCafé manager");
  // Text copied out of a PDF carries ligature glyphs ("ﬁ", "ﬂ"); they read as the letters (pdf.js does this for PDFs itself).
  const lig = await ingestResumeFile({ bytes: new TextEncoder().encode("Certifications\nCerti\uFB01ed \uFB02eet o\uFB03cer"), filename: "r.txt" });
  eq(lig.ok && lig.text, "Certifications\nCertified fleet officer");
});

Deno.test("a long text is cut at a line past 19,000 characters and the report says what was kept", () => {
  const line = "• Reconciled the weekly cycle counts and closed every variance with the finance team";
  const text = `Experience\nAnalyst, Acme\n${Array.from({ length: 300 }, () => line).join("\n")}\nEducation\nB.A. History`;
  const s = shapeResumeText(text, "paste");
  assert(s.report.cut && s.report.cut.total === text.length && s.report.cut.kept === s.text.length, JSON.stringify(s.report.cut));
  assert(s.text.length <= RESUME_TEXT_MAX && s.text.endsWith(line), "cut at a line end");
});

Deno.test("a ten-page PDF: the first 8 pages are read, and the report says so", async () => {
  const r = await ingestResumeFile({ bytes: await read("ten-pages.pdf"), filename: "cv.pdf" });
  assert(r.ok);
  if (!r.ok) return;
  eq([r.report.pages, r.report.pagesRead], [10, PDF_MAX_PAGES]);
  assert(r.text.includes("Field study 8,") && !r.text.includes("Field study 9,"), r.text);
  eq(r.report.cut?.why, "only the first 8 of its 10 pages are read");
});

const refused = async (bytes: Uint8Array, filename: string, mime = "", sha256: string | null = null) => {
  const r = await ingestResumeFile({ bytes, filename, mime, sha256 });
  assert(!r.ok, `${filename} must be refused`);
  return r as Extract<typeof r, { ok: false }>;
};
Deno.test("refusals: each exact, each reading nothing", async () => {
  const pdf = await read("two-column.pdf");
  eq((await refused(await read("encrypted-user-password.pdf"), "locked.pdf")).reply, REPLIES.encrypted_pdf);
  eq((await refused(await read("scanned.pdf"), "scan.pdf")).refusal, "scanned");
  // A scan with a scanner's stamp on it has a few characters of text and no resume: still a scan.
  eq((await refused(await read("scanned-stamped.pdf"), "scan.pdf")).reply, REPLIES.scanned);
  eq((await refused(await read("corrupt.pdf"), "broken.pdf")).reply, REPLIES.corrupt("PDF"));
  eq((await refused(await read("password-protected.docx"), "locked.docx")).reply, REPLIES.protected_docx);
  // An older .doc: an OLE2 container with no EncryptedPackage stream.
  const doc = new Uint8Array(1024); doc.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  eq((await refused(doc, "old.doc", "application/msword")).reply, REPLIES.legacy_doc);
  const huge = new Uint8Array(RESUME_FILE_MAX_BYTES + 1); huge.set(pdf.subarray(0, 100));
  eq((await refused(huge, "big.pdf")).reply, REPLIES.too_large("10.0"));
  eq((await refused(pdf, "two-column.pdf", "application/pdf", "ab".repeat(32))).reply, REPLIES.checksum);
  eq((await refused(new Uint8Array(0), "empty.pdf")).reply, REPLIES.empty);
  for (const [name, head] of [["p.png", [0x89, 0x50, 0x4e, 0x47]], ["p.jpg", [0xff, 0xd8, 0xff, 0xe0]], ["p.heic", [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]]] as [string, number[]][]) {
    const b = new Uint8Array(64); b.set(head);
    eq((await refused(b, name, "")).reply, REPLIES.image, name);
  }
  eq((await refused(zipSync({ "index.xml": strToU8("<x/>") }), "resume.pages")).reply, REPLIES.unsupported(".pages"));
  eq((await refused(new Uint8Array([0, 1, 2, 3, 0, 0, 0, 9, 8, 7, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]), "blob.bin")).refusal, "unsupported");
  // A zip bomb shaped as a .docx: a document.xml past the 30 MB part bound is never inflated.
  const bomb = zipSync({ "word/document.xml": strToU8(`<w:document>${" ".repeat(31 * 1024 * 1024)}</w:document>`) }, { level: 9 });
  assert(bomb.length < 200_000, `the bomb is small on the wire: ${bomb.length}`);
  eq((await refused(bomb, "bomb.docx")).reply, REPLIES.corrupt("Word file"));
  eq(docxText(bomb), null);
});

Deno.test("edge realm: with Buffer, process, require, global and setImmediate removed, PDF and DOCX still read (pure JS, no Node globals)", async () => {
  const script = `for (const g of ["Buffer", "process", "require", "module", "global", "setImmediate", "__dirname", "__filename"]) { try { delete globalThis[g]; } catch {} }
    for (const g of ["Buffer", "process", "require", "global", "setImmediate"]) if (typeof globalThis[g] !== "undefined") throw new Error(g + " is still defined");
    const m = await import(${JSON.stringify(new URL("../../supabase/functions/_shared/career_resume_ingest_files.ts", import.meta.url).href)});
    const out = [];
    for (const f of ["two-column.pdf", "table-layout.docx", "table-layout.rtf"]) {
      const r = await m.ingestResumeFile({ bytes: await Deno.readFile(${JSON.stringify(FX)} + f), filename: f });
      out.push(r.ok ? r.text.length + ":" + r.report.entries : "refused:" + r.refusal);
    }
    console.log(JSON.stringify(out));`;
  const dir = await Deno.makeTempDir();
  await Deno.writeTextFile(`${dir}/realm.js`, script);
  const p = await new Deno.Command(Deno.execPath(), { args: ["run", "-A", "--no-check", `${dir}/realm.js`], stdout: "piped", stderr: "piped" }).output();
  const out = new TextDecoder().decode(p.stdout).trim(), err = new TextDecoder().decode(p.stderr);
  eq(p.code, 0, err);
  eq(JSON.parse(out.split("\n").pop()!), [`${TWO_COLUMN_TEXT.length}:11`, `${TABLE_TEXT.length}:9`, `${TABLE_TEXT.length + 1}:9`]);
});
