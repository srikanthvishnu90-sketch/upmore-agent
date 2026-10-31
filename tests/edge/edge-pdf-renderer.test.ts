// LANE F — the PDF renderer lit on the edge runtime, proven through the
// DEPLOYED composition (fail-first companion to
// tests/career-render-edge-pdf.test.cjs).
//
//   user text -> the REAL CareerHost composed from the REAL built bundle
//   (supabase/functions/_shared/router_core.career.js — the exact module
//   handler-career.ts imports) -> a tailor turn -> result.artifact.pdf
//
// On the base tree (75ccf5f5 lineage) this is RED: inside the bundle,
// module 148's require("zlib") capture is null (ESM has no require), so
// renderPdf refuses, result.artifact.pdf is null, and the reply says
// "Saved as a rendered text artifact" while claiming nothing — Lane B's
// channel-doc-1 record §5 has the probe evidence. With Lane F's
// bundle-legal pure-JS zlib/SHA-256 fallback inside 148, the same turn
// emits a real PDF artifact whose sha256 is the hash of its own bytes —
// the bytes the CHANNEL-DOC-1 seam delivers unchanged.
//
// The domain-source module 148 is imported at the bottom ONLY as a
// parsing oracle (its extractors, run here in the test realm with
// Node's zlib): the bytes under test come from the bundle's renderer
// through the host, never from the oracle.
//
// MUSE-F-011 (2026-10-21): the test above runs in THIS realm, where
// Deno 2.9.7 exposes a Buffer global — the exact mask that hid the
// defect (module 148 read the bare global in ~30 places; the
// production edge runtime, Deno 2.1.4, has none, so every live tailor
// render threw ReferenceError and containment served the generic
// failure). The second test below spawns
// tests/edge/lib/render-shadow-child.ts, which evaluates module 148's
// source with globalThis.Buffer removed and renders the fixture
// resume (the PolicyMe tailor output, frozen as JSON) through
// renderPdf + renderDocx + parseCheck in that realm.
//
// Bug law: BUG-PENDING-ALLOCATION (edge-pdf-renderer) +
// FR-PENDING-ALLOCATION (edge-pdf-renderer) — requested from Crew A.
// @ts-ignore: plain-JS production module, composed as handler-career.ts composes it
import { CareerHost } from "../../supabase/functions/_shared/career_host.js";
// @ts-ignore: the built career bundle — the deployed artifact's own module
import {
  CareerAccess, CareerProfile, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment,
} from "../../supabase/functions/_shared/router_core.career.js";
import { assert, TEST_USER } from "./lib/channel_fixture.ts";
import { createRequire } from "node:module";
import { Buffer } from "node:buffer";

// Parsing oracle only (see header) — never the source of the bytes.
// Use an explicit CommonJS realm: Deno 2.1.4 does not infer this
// domain module's exports. Buffer stays local to the parsing oracle;
// the production bundle and Buffer-shadowed child remain untouched.
const oracleModule = { exports: {} as any };
new Function("module", "require", "Buffer", Deno.readTextFileSync(new URL("../../packages/domain/148-career-render.js", import.meta.url)))(
  oracleModule, createRequire(import.meta.url), Buffer,
);
const RenderOracle = oracleModule.exports;

// The tailor core of battery execution CB-0495. The full sentence's
// "…and send me the PDF as a file in this chat" clause routes through
// Lane B's document-delivery repair (142, Lane B's lane); this guard
// isolates the RENDERER defect (§5) with the tailor-shaped ask in the
// same world, which on the base bundle reaches career_tailor and emits
// artifact.pdf === null.
const ASK = "tailor my resume for the New Grad Software Engineer role at Northwind Ledger (fictional)";
const JD = "New Grad Software Engineer at Northwind Ledger (TEST posting)\nRequired: Python, JavaScript, React, SQL, PostgreSQL, Git.\nNice to have: Kubernetes, Docker, AWS.\nYou will build APIs and deploy services.";
const POSTING = { id: "nw-ledger-1", corpus_id: "nw-ledger-1", title: "New Grad Software Engineer", company: "Northwind Ledger", jd_text: JD, source: "fixture" };
const NOW = Date.parse("2026-10-20T15:00:00.000Z");
const clone = (v: any) => JSON.parse(JSON.stringify(v));

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function sha256Hex(buf: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf as ArrayBuffer);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("staged bundle tailor turn emits a real, valid, hash-bound PDF artifact", async () => {
  const host = (CareerHost as any).createCareerHost({
    CareerAccess, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment,
  });
  const personaRaw = JSON.parse(await Deno.readTextFile(new URL("../../packages/career-data/fixtures/test-persona.json", import.meta.url)));
  const persona = (CareerProfile as any).profileFromData(personaRaw);
  const snapshot = { v: 1, scope: { userId: TEST_USER }, stores: { profile: clone(persona), posting: clone(POSTING) } };
  const ctx = host.createTurnCtx({ userId: TEST_USER, threadId: "thread-edge-pdf", now: NOW, accountPersistence: true, snapshot, account: {}, watchState: {} });
  const out = host.runTurn(ASK, ctx);

  // The turn tailored (not a refusal, not the fallback).
  assert(out.result && out.result.artifact, `no artifact on the tailor result: ${JSON.stringify(out.reply).slice(0, 200)}`);

  // The PDF artifact exists and carries bytes.
  const pdf = out.result.artifact.pdf;
  assert(pdf, `result.artifact.pdf is null — the edge renderer refused (reply: ${JSON.stringify(out.reply).slice(0, 200)})`);
  assert(typeof pdf.base64 === "string" && pdf.base64.length > 0, "artifact carries no bytes");
  const bytes = decodeBase64(pdf.base64);
  assert(bytes.length > 500, `suspiciously small PDF: ${bytes.length} bytes`);
  assertEqStr(new TextDecoder("latin1").decode(bytes.subarray(0, 5)), "%PDF-", "PDF header");
  assertEqStr(pdf.filename, "Alex_Testcase_Resume.pdf", "R8 filename");
  assertEqNum(pdf.bytes, bytes.length, "artifact byte count");

  // Structure: at least one page (the Pages object's /Count is plain text).
  const raw = new TextDecoder("latin1").decode(bytes);
  const count = raw.match(/\/Count (\d+)/);
  assert(count && parseInt(count[1], 10) >= 1, "Pages /Count >= 1");

  // Content: the independent extractor recovers the tailored text.
  const lines = RenderOracle.extractPdfLines(Buffer.from(bytes));
  assert(lines.some((l: string) => l.includes("Alex Testcase")), `name line missing: ${JSON.stringify(lines.slice(0, 4))}`);
  assert(lines.join("\n").includes("Python"), "tailored skill text missing from the PDF");

  // Hash-bound: the artifact's sha256 is the delivered bytes' own hash.
  assert(typeof pdf.sha256 === "string" && pdf.sha256.length === 64, `artifact sha256 missing/null: ${pdf.sha256}`);
  assertEqStr(pdf.sha256, await sha256Hex(bytes), "artifact sha256 != sha256(bytes)");

  // The reply's claim is now true, and the parse check passed on the edge.
  assert(out.reply.includes("attached for your review"), `reply does not claim the attachment: ${out.reply.slice(0, 200)}`);
  assert(out.reply.includes("parse check PASS"), `parse check did not pass on the edge: ${out.reply.slice(0, 300)}`);
});

Deno.test("Buffer-shadowed realm: module 148 source renders the fixture resume (MUSE-F-011)", async () => {
  const child = new URL("./lib/render-shadow-child.ts", import.meta.url).pathname;
  const out = await new Deno.Command(Deno.execPath(), { args: ["run", "-A", child], stdout: "piped", stderr: "piped" }).output();
  const stdout = new TextDecoder().decode(out.stdout).trim();
  const stderr = new TextDecoder().decode(out.stderr).trim();
  const line = stdout.split("\n").filter(Boolean).pop() || "";
  let v: any = null;
  try { v = JSON.parse(line); } catch { /* asserted below */ }
  assert(v && !v.stage, `render-shadow child produced no verdict (exit ${out.code}): ${stderr.slice(0, 400)}`);
  assert(v.pdfOk === true, "renderPdf refused in the Buffer-free realm — MUSE-F-011");
  assertEqStr(v.pdfHead, "%PDF-", "Buffer-free realm PDF header");
  assert(v.pdfBytes > 500, `Buffer-free realm PDF suspiciously small: ${v.pdfBytes}`);
  assert(v.docxOk === true, "renderDocx refused in the Buffer-free realm — MUSE-F-011");
  assertEqStr(v.parseStatus, "PASS", `Buffer-free realm parse check: ${JSON.stringify(v.parseReasons)}`);
  assert(typeof v.artifactSha === "string" && v.artifactSha.length === 64, `Buffer-free realm artifact sha256 missing: ${v.artifactSha}`);
  assertEqNum(v.artifactBytes, v.pdfBytes, "Buffer-free realm artifact byte count");
});

function assertEqStr(a: unknown, b: unknown, msg = "") {
  if (a !== b) throw new Error(`${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assertEqNum(a: unknown, b: unknown, msg = "") {
  if (a !== b) throw new Error(`${msg} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
