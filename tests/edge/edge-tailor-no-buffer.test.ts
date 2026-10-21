// C1 — the resume-confirm tailor leg on a runtime WITHOUT a global Buffer.
//
// Live: "Yes, that's my resume." (after the CB-0495 ask and a resume paste)
// commits the confirmation, but the chained tailor leg produces no PDF and
// channel_artifacts stays at 0 rows. Root cause: module 148 calls Buffer.*
// throughout, and the hosted Supabase edge runtime has no global Buffer
// (Deno exposes one only from 2.4 on; the local deno 2.9 CLI and Node both
// do, so every local run passed). On the deployed line the leg threw
// "ReferenceError: Buffer is not defined" at 148 renderPdf (reproduced under
// deno 2.1.4); on trunk the default renderer instance quietly refuses
// instead, so the turn answers career_tailor with no PDF — same outcome.
//
// This test drives the three live turns through the REAL CareerHost
// composed from the REAL built bundle (the modules the edge handler
// imports), with the pool mapped by the real career_pool loader; only the
// KB read is stubbed. It runs the journey twice on fresh module instances:
// once with the global Buffer present, once with globalThis.Buffer removed
// BEFORE the bundle evaluates. Both must render a valid, hash-bound PDF,
// and the bytes must be identical. Synthetic TEST data only.
import { assert, assertEq } from "./lib/channel_fixture.ts";

const USER = "00000000-0000-4000-8000-0000000000c1";
const THREAD = "00000000-0000-4000-8000-0000000000c2";
const ASK = "Tailor my resume for the Product Manager role at Natera and send me the PDF as a file in this chat.";
const RESUME = `TEST RESUME - synthetic fixture, not a real person

Alex Testcase (TEST)
Chicago, IL (TEST) | alex.testcase@example.test | +1 555-0100 (TEST)

EDUCATION
TEST University - B.S. Computer Science, GPA 3.7, graduating May 2028

EXPERIENCE
Software Engineering Intern, TEST Systems Inc, June 2025 - August 2025
- Built a reporting dashboard in React and Python used by 200 internal users
- Cut weekly reporting time by 40% by automating data pulls from PostgreSQL

Product Intern, Example Labs (TEST), June 2024 - August 2024
- Wrote product requirements for a fictional scheduling feature with 3 engineers
- Ran 12 user interviews and summarized findings for the roadmap review

SKILLS
Python, SQL, React, PostgreSQL, Excel, stakeholder management
`;
const KB_ROWS = [{
  posting_key: "greenhouse:https://boards.example.test/natera/jobs/501",
  source: "greenhouse", board: "natera", company: "Natera",
  title: "Product Manager (TEST posting)", location: "Remote, United States",
  url: "https://boards.example.test/natera/jobs/501",
  posted_at: "2026-10-18T00:00:00.000Z", fetched_on: "2026-10-14",
  text_excerpt: "Product Manager (synthetic TEST posting). Requirements: product management experience, SQL, Python, stakeholder management, roadmap ownership.",
}];

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function sha256Hex(buf: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf as unknown as ArrayBuffer);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Mods = { B: any; CareerHost: any; CareerPool: any };
async function load(tag: string): Promise<Mods> {
  // Fresh module instances (query suffix), evaluated in the realm as it is now.
  // @ts-ignore: the built career bundle — the deployed artifact's own module
  const B = await import(`../../supabase/functions/_shared/router_core.career.js?${tag}`);
  // @ts-ignore: plain-JS production module, composed as the edge handler composes it
  const { CareerHost } = await import(`../../supabase/functions/_shared/career_host.js?${tag}`);
  // @ts-ignore: plain-JS production module
  const { CareerPool } = await import(`../../supabase/functions/_shared/career_pool.js?${tag}`);
  return { B, CareerHost, CareerPool };
}

async function journey({ B, CareerHost, CareerPool }: Mods) {
  const host = CareerHost.createCareerHost({
    CareerAccess: B.CareerAccess, CareerOnboarding: B.CareerOnboarding, CareerRouter: B.CareerRouter,
    CareerDoorstep: B.CareerDoorstep, CareerReply: B.CareerReply, CareerContainment: B.CareerContainment,
  });
  const pool = CareerPool.createKbPoolLoader({
    readRows: async (spec: any) => KB_ROWS.slice(0, spec.limit),
    jobs: { roleFamily: B.CareerJobs.roleFamily, seniorityBand: B.CareerJobs.seniorityBand, stripHtml: B.CareerJobs.stripHtml },
  });
  let snapshot: any = null;
  let account: any = {};
  const turn = async (message: string) => {
    const postings = (await pool.loadPool()).postings;
    const ctx = host.createTurnCtx({ userId: USER, threadId: THREAD, now: Date.parse("2026-10-20T18:00:00.000Z"), accountPersistence: true, snapshot, account, watchState: {}, postings });
    const out = host.runTurn(message, ctx);
    snapshot = host.extractSnapshot(ctx);
    if (ctx._hostPatch && ctx._hostPatch.stated_facts) account = { ...account, stated_facts: ctx._hostPatch.stated_facts };
    return out;
  };
  const t1 = await turn(ASK);
  assertEq(t1.intent, "career_tailor", "turn 1 sets the tailor target");
  const t2 = await turn(RESUME);
  assertEq(t2.intent, "career_resume_ingest", "turn 2 drafts the pasted resume");
  const t3 = await turn("Yes, that's my resume.");
  assertEq(t3.contained, false, "turn 3 not contained");
  assertEq(t3.intent, "career_tailor", `turn 3 must chain into the tailor, got ${t3.intent}: ${String(t3.reply).slice(0, 160)}`);
  assert(/^Confirmed — \d+ facts? from your resume are on your record now\./.test(t3.reply), `confirmed lead: ${String(t3.reply).slice(0, 120)}`);
  const pdf = t3.result && t3.result.artifact && t3.result.artifact.pdf;
  assert(pdf && typeof pdf.base64 === "string" && pdf.base64.length > 0, "turn 3 carries PDF bytes");
  const bytes = decodeBase64(pdf.base64);
  assertEq(bytes.length, pdf.bytes, "declared byte count");
  assertEq(new TextDecoder("latin1").decode(bytes.subarray(0, 5)), "%PDF-", "PDF header");
  assert(new TextDecoder("latin1").decode(bytes.subarray(bytes.length - 6)).includes("%%EOF"), "PDF trailer");
  assertEq(pdf.sha256, await sha256Hex(bytes), "sha256 is the hash of the artifact's own bytes");
  return pdf;
}

Deno.test("resume-confirm tailor leg renders a real PDF on a runtime with no global Buffer (C1)", async () => {
  const g = globalThis as any;
  const saved = g.Buffer;
  // Reference run on the Buffer path: the realm's own global, or node:buffer's
  // where the runtime has no global (deno < 2.4, the hosted edge's shape).
  g.Buffer = saved ?? (await import("node:buffer")).Buffer;
  const withBuffer = await journey(await load("c1-with-buffer"));
  delete g.Buffer;
  try {
    assertEq(typeof g.Buffer, "undefined", "edge-shaped realm: no global Buffer");
    const noBuffer = await journey(await load("c1-no-buffer"));
    assertEq(noBuffer.sha256, withBuffer.sha256, "no-Buffer bytes are identical to the Buffer path");
  } finally {
    if (saved === undefined) delete g.Buffer; else g.Buffer = saved;
  }
});
