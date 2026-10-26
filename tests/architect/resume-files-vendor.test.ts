// FEATURE 16: the vendored readers are the published builds, byte for byte (pins in _shared/vendor/THIRD_PARTY_NOTICES.txt),
// and the PDF reader is loaded only when a PDF arrives: the career entry's static graph never pulls it in, and the deploy
// stage (scripts/career/stage-career.cjs) follows the literal import("./vendor/...") so the file ships with the function.
// Run: deno test -A --no-check tests/architect/resume-files-vendor.test.ts
import assertNode from "node:assert/strict";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const V = new URL("../../supabase/functions/_shared/vendor/", import.meta.url);
const hex = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");

Deno.test("vendored builds match their pins", async () => {
  for (const [name, sha, size] of [
    ["pdfjs-serverless-unpdf-1.8.1.mjs", "6c826bd6198f20a1ac5c7bf99649cee30a0cc5d0a0730f15f238d5523dcd30b8", 1676063],
    ["fflate-0.8.2.mjs", "8cc1f687e0159e977addb6b85e274dbd11e622cf151f4fcb7b85d49622ea43e7", 89198],
  ] as const) {
    const b = await Deno.readFile(new URL(name, V));
    eq([b.length, await hex(b)], [size, sha], name);
    const notices = await Deno.readTextFile(new URL("THIRD_PARTY_NOTICES.txt", V));
    eq(notices.includes(sha), true, `${name}'s pin is in the notices`);
  }
});

Deno.test("pdf.js is loaded on demand, and the deploy stage ships it", async () => {
  const src = await Deno.readTextFile(new URL("../career_resume_ingest_files.ts", V));
  eq(/^import[^;]*pdfjs/m.test(src), false, "no static import of pdf.js");
  eq(src.includes('import("./vendor/pdfjs-serverless-unpdf-1.8.1.mjs")'), true);
  eq(src.includes("isEvalSupported: false"), true, "pdf.js never evaluates code from a font program");
  const dir = await Deno.makeTempDir();
  const p = await new Deno.Command("node", { args: [new URL("../../scripts/career/stage-career.cjs", import.meta.url).pathname, dir, "--json"], stdout: "piped" }).output();
  const report = JSON.parse(new TextDecoder().decode(p.stdout).trim().split("\n").pop()!);
  const paths = report.fileList.map((f: { path: string }) => f.path);
  for (const f of ["_shared/career_resume_ingest_files.ts", "_shared/career_resume_intake.ts", "_shared/vendor/pdfjs-serverless-unpdf-1.8.1.mjs", "_shared/vendor/fflate-0.8.2.mjs"]) eq(paths.includes(f), true, `${f} is staged`);
  await Deno.remove(dir, { recursive: true });
});
