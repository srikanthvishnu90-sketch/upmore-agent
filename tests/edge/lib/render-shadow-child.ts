// MUSE-F-011 — render-level companion to career-replay-child.ts,
// driven by the Buffer-shadowed test in
// tests/edge/edge-pdf-renderer.test.ts.
//
// Evaluates module 148's SOURCE the way the Deno bundle evaluates it
// (one flat script scope; no require, no module) with
// globalThis.Buffer removed BEFORE the source runs — then renders
// the fixture resume (tests/edge/lib/fixtures/
// tailor-resume-policyme.json: module 123's tailored output for the
// 15-fact Alex Testcase profile against the PolicyMe Junior Software
// Engineer posting, generated once on Node and frozen) through
// renderPdf + renderDocx and runs the module's own parse-check over
// both, all inside the Buffer-free realm. On the base tree this child
// dies with "ReferenceError: Buffer is not defined" at the first
// render; the parent test surfaces that stderr as the failure.
//
// Prints exactly one JSON verdict line:
//   { pdfOk, pdfBytes, pdfHead, docxOk, docxBytes, parseStatus,
//     parseReasons, artifactSha, artifactBytes }

const root = new URL("../../../", import.meta.url);

// Remove/shadow the Buffer global before module 148's source runs.
(globalThis as any).Buffer = undefined;
try { delete (globalThis as any).Buffer; } catch { /* assignment already shadowed it */ }
if (typeof (globalThis as any).Buffer !== "undefined") {
  console.log(JSON.stringify({ stage: "shadow", error: "could not remove the Buffer global in this realm" }));
  Deno.exit(2);
}

const src = await Deno.readTextFile(new URL("packages/domain/148-career-render.js", root));
const resume = JSON.parse(await Deno.readTextFile(new URL("tests/edge/lib/fixtures/tailor-resume-policyme.json", root)));

// One flat script scope, no require/module — the bundle's own shape.
// The appended line captures the module's const into a global the
// child can call (a const in eval scope does not leak on its own).
(0, eval)(`${src}\n;globalThis.__CareerRender = CareerRender;`);
const CR = (globalThis as any).__CareerRender;
if (!CR) {
  console.log(JSON.stringify({ stage: "eval", error: "module 148 did not define CareerRender" }));
  Deno.exit(2);
}

const pdf = CR.renderPdf(resume);
const docx = CR.renderDocx(resume);
const check = CR.parseCheck({ resume, pdf: pdf && pdf.buffer, docx: docx && docx.buffer });
const art = CR.artifact("pdf", pdf);
console.log(JSON.stringify({
  pdfOk: !!(pdf && pdf.ok),
  pdfBytes: pdf ? (pdf.bytes ?? null) : null,
  pdfHead: pdf && pdf.buffer ? pdf.buffer.subarray(0, 5).toString("latin1") : null,
  docxOk: !!(docx && docx.ok),
  docxBytes: docx ? (docx.bytes ?? null) : null,
  parseStatus: check.status,
  parseReasons: (check.reasons || []).map((r: any) => `${r.check}:${r.level}`),
  artifactSha: art ? art.sha256 : null,
  artifactBytes: art ? art.bytes : null,
}));
