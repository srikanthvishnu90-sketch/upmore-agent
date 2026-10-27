// FEATURE 16: a resume sent as a text-message attachment (MMS / iMessage through LoopMessage), end to end through the REAL
// inbound webhook (supabase/functions/trainee-inbound/handler.ts handleInbound, the channel core, the real inbound store), the
// real channel bridge to the REAL agent-chat handler, on real Postgres. The seams: the HTTP hop to the Supabase project
// (tests/flow/postgrest.ts), the texting provider's attachment host (a fake internet below, so no request leaves the machine),
// and delivery (recorded, nothing is sent). No model is called.
//
// Every case is a person texting: a brand-new number, messy captions, the wrong file, a picture, a retry, a STOP. Each asserts
// STATE (accounts, outbox rows, stored messages, draft facts, fact_confirmed events, opt-out, and the exact requests made to
// the fake internet), and that the reply is true to that state.
//
// Fail-first on the base (PR 201's head): the webhook ignores a text with no words ("no text (attachments are not read yet)"),
// so no account is made, nothing is fetched, nothing is answered: every case's first assertion fails.
import assertNode from "node:assert/strict";
import { deflateSync, zlibSync } from "../../supabase/functions/_shared/vendor/fflate-0.8.2.mjs";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, SERVICE_KEY, SUPABASE_URL, supabaseParity } from "../flow/handler.ts";
import { handleChat } from "../../supabase/functions/agent-chat/handler-career.ts";
import { handleInbound } from "../../supabase/functions/trainee-inbound/handler.ts";
import { supabaseInboundStore } from "../../supabase/functions/trainee-inbound/store.ts";
import { chatThroughAgent } from "../../supabase/functions/_shared/channel_runtime.ts";
import { MMS_REPLIES } from "../../supabase/functions/_shared/sms_media.ts";
import { REPLIES } from "../../supabase/functions/_shared/career_resume_replies.ts";
import { CHANNEL_REPLIES } from "../../supabase/functions/_shared/channel.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const FX = new URL("../fixtures/resume-files/", import.meta.url).pathname;
const SECRET = "s".repeat(40), LOOP_KEY = "loop-api-key-do-not-leak", HOST = "media.loop-test.example";
const url = (p: string) => `https://${HOST}/${p}`;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const hex = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource))].map((x) => x.toString(16).padStart(2, "0")).join("");
const file = (n: string) => Deno.readFile(FX + n);
const TWO_COLUMN_BULLET = "Automated the weekly operations KPI report in Python and Tableau";
const DOCX_BULLET = "Wrote the integration tests for the payments service";
const RTF_BULLET = "Led weekly labs for 40 students in Data Structures";
const TEXT_BULLET = "Built the weekly on-time-in-full report in SQL and Excel";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(300).fill(7)]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, ...new Array(300).fill(9)]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, ...new Array(300).fill(1)]);

// ---- the fake internet: the texting provider's attachment host, and anything else a bad address points at ----------------
interface Seen { url: string; headers: Record<string, string>; credentials: string | undefined; redirect: string | undefined }
type Route = () => Response | Promise<Response>;
const internet = {
  seen: [] as Seen[], routes: new Map<string, Route>(),
  on(u: string, r: Route) { this.routes.set(u, r); },
  async fetch(input: Request | URL | string, init?: RequestInit) {
    const req = input instanceof Request ? input : null;
    const u = String(req?.url ?? input);
    internet.seen.push({ url: u, headers: Object.fromEntries(new Headers(init?.headers ?? req?.headers).entries()), credentials: init?.credentials, redirect: init?.redirect });
    const r = internet.routes.get(u);
    if (!r) return new Response("not found", { status: 404 });
    const sig = init?.signal;
    const res = r();
    if (!sig) return await res;
    return await Promise.race([res, new Promise<Response>((_, rej) => sig.addEventListener("abort", () => rej(sig.reason ?? new DOMException("aborted", "AbortError")), { once: true }))]);
  },
  reset() { this.seen = []; this.routes.clear(); },
  to(host: string) { return this.seen.filter((s) => new URL(s.url).hostname === host); },
};
const bytesResponse = (b: Uint8Array, type: string | null, extra: Record<string, string> = {}) => new Response(b as BodyInit, { status: 200, headers: { ...(type ? { "content-type": type } : {}), ...extra } });
// A body that never ends, 64 KB at a time; `stats` says how much was pulled and whether the reader gave up.
function endless(stats: { pulled: number; cancelled: boolean }, headers: Record<string, string> = {}) {
  const chunk = new Uint8Array(65536).fill(0x41);
  const body = new ReadableStream<Uint8Array>({
    // "Never ends" for the guard that matters: it ends at 40 MB only so that a missing guard fails the test instead of hanging it.
    pull(c) { if (stats.pulled >= 40 * 1024 * 1024) { c.close(); return; } stats.pulled += chunk.length; c.enqueue(chunk); },
    cancel() { stats.cancelled = true; },
  }, new CountQueuingStrategy({ highWaterMark: 0 }));
  return new Response(body, { status: 200, headers: { "content-type": "application/pdf", ...headers } });
}

// ---- hostile files, built here ----------------------------------------------------------------------------------------
const u32 = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
// A one-entry zip holding `payload` (already deflated), with the sizes the header declares.
function zipOf(name: string, deflated: Uint8Array, declaredSize: number, realSize: number): Uint8Array {
  const nm = new TextEncoder().encode(name);
  const local = [new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 0, 8, 0, 0, 0, 0, 0]), u32(0), u32(deflated.length), u32(declaredSize), new Uint8Array([nm.length, 0, 0, 0]), nm, deflated];
  const lsz = local.reduce((n, x) => n + x.length, 0);
  const cd = [new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 0, 8, 0, 0, 0, 0, 0]), u32(0), u32(deflated.length), u32(declaredSize), new Uint8Array([nm.length, 0, 0, 0, 0, 0, 0, 0, 0, 0]), u32(0), u32(0), nm];
  const csz = cd.reduce((n, x) => n + x.length, 0);
  const end = [new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, 1, 0, 1, 0]), u32(csz), u32(lsz), new Uint8Array([0, 0])];
  void realSize;
  const parts = [...local, ...cd, ...end], out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
const ZEROS_80MB = new Uint8Array(80 * 1024 * 1024);
const docxBombHonest = () => { const d = deflateSync(ZEROS_80MB, { level: 9 }); return zipOf("word/document.xml", d, ZEROS_80MB.length, ZEROS_80MB.length); };
const docxLyingSmall = () => zipOf("word/document.xml", deflateSync(ZEROS_80MB.subarray(0, 30000), { level: 9 }), 100, 30000);
const docxBombLying = () => { const d = deflateSync(ZEROS_80MB, { level: 9 }); return zipOf("word/document.xml", d, 900, ZEROS_80MB.length); };
const ascii = (s: string) => new TextEncoder().encode(s);
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let a = 0; for (const x of p) { o.set(x, a); a += x.length; } return o; };
const pdfWith = (dict: string, body: Uint8Array) => cat(ascii(`%PDF-1.4\n1 0 obj\n<< ${dict} /Length ${body.length} >>\nstream\n`), body, ascii("\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"));
const pdfBomb = () => pdfWith("/Filter /FlateDecode", zlibSync(ZEROS_80MB, { level: 9 }));
function a85(b: Uint8Array): Uint8Array {
  let out = "";
  for (let i = 0; i < b.length; i += 4) {
    const n = Math.min(4, b.length - i);
    let v = 0;
    for (let k = 0; k < 4; k++) v = v * 256 + (k < n ? b[i + k] : 0);
    const d: number[] = [];
    for (let k = 0; k < 5; k++) { d.unshift(v % 85); v = Math.floor(v / 85); }
    out += String.fromCharCode(...d.slice(0, n + 1).map((x) => x + 33));
  }
  return ascii(out + "~>");
}
const pdfBombA85 = () => pdfWith("/Filter [ /ASCII85Decode /FlateDecode ]", a85(zlibSync(ZEROS_80MB, { level: 9 })));
const pdfLzw = () => pdfWith("/Filter /LZWDecode", new Uint8Array(200).fill(3));
const xlsxLike = () => zipOf("xl/workbook.xml", deflateSync(ascii("<workbook/>")), 11, 11);

// ---- the world ---------------------------------------------------------------------------------------------------------
let pg: Pg, admin: any;
const sends: { contact: string; bubbles: string[] }[] = [], delivered: any[] = [];
const envOf = (extra: Record<string, string> = {}) => ({ get: (k: string) => ({ TRAINEE_INBOUND_SECRET: SECRET, LOOPMESSAGE_API_KEY: LOOP_KEY, TRAINEE_SIGNUP: "open", LOOPMESSAGE_MEDIA_HOSTS: HOST, ...extra } as Record<string, string>)[k] });
let nextId = 1, tick = Date.parse("2026-10-26T15:00:00Z");
let timeoutMs: number | undefined;
let envExtra: Record<string, string> = {};
function inbound(from: string, o: { text?: string; attachments?: unknown; id?: string }) {
  const id = o.id ?? `mm-${nextId++}`;
  const body: Record<string, unknown> = { alert_type: "message_inbound", message_id: id, recipient: from, text: o.text ?? "" };
  if (o.attachments !== undefined) body.attachments = o.attachments;
  const deps = {
    env: envOf(envExtra), now: () => (tick += 1000), store: () => supabaseInboundStore(admin),
    send: () => async (contact: string, bubbles: string[]) => { sends.push({ contact, bubbles }); return { ok: true as const, id: null }; },
    chat: chatThroughAgent(SUPABASE_URL, SERVICE_KEY),
    deliverReply: async (a: unknown) => { delivered.push(a); },
    mediaFetch: internet.fetch.bind(internet) as typeof fetch, mediaTimeoutMs: timeoutMs,
    optedOut: async (contact: string) => (await admin.rpc("channel_opted_out", { p_contact: contact })).data === true,
  };
  return { id, run: async () => { const res = await handleInbound(new Request(`https://fn.test/trainee-inbound?secret=${SECRET}`, { method: "POST", body: JSON.stringify(body) }), deps as any); return { status: res.status, body: await res.json() }; } };
}
const text = (from: string, text: string, id?: string) => inbound(from, { text, id }).run();
const mms = (from: string, attachments: unknown, o: { text?: string; id?: string } = {}) => inbound(from, { ...o, attachments }).run();

const sql = async (q: string) => (await pg.sql(q)).trim();
const num = async (q: string) => Number(await sql(q));
const json = async (q: string) => JSON.parse((await sql(q)) || "null");
const person = async (contact: string) => (await json(`select to_jsonb(c) from public.channel_contacts c where contact = '${contact}'`)) as { user_id: string; thread_id: string | null; opted_out: boolean } | null;
const replyTo = async (userId: string, id: string) => await sql(`select text from public.career_outbox where user_id = '${userId}' and key = 'reply:${id}'`);
const drafts = async (thread: string | null) => thread ? (await json(`select coalesce(jsonb_agg(f), '[]') from public.agent_flow_state s, jsonb_array_elements(s.state#>'{career,stores,profile,facts}') f where s.thread_id = '${thread}' and f->>'source' = 'resume-ingest' and f->>'status' = 'draft'`)) as any[] : [];
const confirmed = async (userId: string) => (await json(`select coalesce(jsonb_agg(detail order by id), '[]') from public.career_events where user_id = '${userId}' and kind = 'fact_confirmed'`)) as any[];
const userMessages = async (userId: string) => num(`select count(*) from public.agent_messages m join public.agent_threads t on t.id = m.thread_id where t.user_id = '${userId}' and m.role = 'user'`);
const keptUpload = async (thread: string | null) => thread ? await json(`select state#>'{career,stores,resumeIntake,upload}' from public.agent_flow_state where thread_id = '${thread}'`) : null;
const accounts = () => num(`select count(*) from auth.users`);
// Nothing of the resume was taken: no draft or confirmed entries, no kept upload.
async function nothingSaved(contact: string, why: string) {
  const p = await person(contact);
  if (!p) return;
  eq((await drafts(p.thread_id)).length, 0, `${why}: no draft entries`);
  eq((await confirmed(p.user_id)).length, 0, `${why}: nothing confirmed`);
  eq(await keptUpload(p.thread_id), null, `${why}: no upload kept`);
}
const skip = () => { if (pgBinDir()) return false; if (CI) throw new Error("needs Postgres 16 in CI"); console.log("NOT_RUN locally: no Postgres binaries"); return true; };

Deno.test({ name: "FEATURE 16 SMS/MMS: a resume sent as a text attachment is fetched safely, read through the web path, and confirmed only by the person's yes", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (skip()) return;
  pg = await startPg();
  const before = Deno.env.get("CAREER_ACCOUNT_MEMORY");
  let handler: Awaited<ReturnType<typeof careerHandler>> | null = null;
  try {
    await supabaseParity(pg);
    handler = await careerHandler(pg, {});
    Deno.env.set("CAREER_ACCOUNT_MEMORY", "on");
    // The agent-chat function and the database are both behind the project URL; everything else goes where it was going.
    const toDb = globalThis.fetch;
    globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
      const req = new Request(input as any, init);
      return new URL(req.url).pathname === "/functions/v1/agent-chat" ? handleChat(req) : toDb(req);
    }) as typeof fetch;
    admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const pdf = await file("two-column.pdf"), docx = await file("table-layout.docx"), rtf = await file("table-layout.rtf"), plain = await file("long-paste.txt");
    const pdfSha = await hex(pdf);
    const reset = () => { internet.reset(); envExtra = {}; timeoutMs = undefined; };

    await t.step("a brand-new number texts a PDF with a messy caption: an account, drafts shown, nothing confirmed until the yes, then every entry names the file", async () => {
      reset();
      const P = "+13125550101", f = url("files/Avery%20CV%20final%20(2).pdf?sig=abc123");
      internet.on(f, () => bytesResponse(pdf, "application/pdf"));
      const accountsBefore = await accounts();
      const first = inbound(P, { text: "heres my cv lol", attachments: [f] });
      const r = await first.run();
      eq(r.status, 200, JSON.stringify(r.body));
      const p = (await person(P))!;
      assert(p && p.user_id, "a new account was made for the new number");
      eq(await accounts(), accountsBefore + 1);
      eq(internet.seen.length, 1, "one request to the provider's host");
      eq(internet.seen[0].url, f);
      const shown = await replyTo(p.user_id, first.id);
      assert(/Quillstone|Northwind|Automated the weekly/.test(shown) && /yes/i.test(shown), `the entries are shown for a yes: ${shown.slice(0, 300)}`);
      const d = await drafts(p.thread_id);
      assert(d.length >= 5 && d.every((x) => x.needs_confirmation === true), `drafts only: ${d.length}`);
      assert(d.some((x) => (x.bullets ?? []).includes(TWO_COLUMN_BULLET)), "in the file's own words");
      eq((await confirmed(p.user_id)).length, 0, "nothing is confirmed by sending a file");
      eq((await keptUpload(p.thread_id)).ref, `mms-file:sha256:${pdfSha}`, "the thread keeps the file by its sha256");
      // A hedge confirms nothing.
      await text(P, "wait not yet");
      eq((await confirmed(p.user_id)).length, 0, "a hedge confirms nothing");
      const yes = text(P, "yep thats right"); await yes;
      const ev = await confirmed(p.user_id);
      eq(ev.length, d.length, "one fact_confirmed per shown entry");
      for (const e of ev) eq([e.upload.kind, e.upload.ref, e.upload.sha256], ["file", `mms-file:sha256:${pdfSha}`, pdfSha], "each confirmation names the attachment");
      // Only what the file says: every confirmed bullet is one of the PDF's own.
      const known = new Set(["Built a SQL pipeline that flagged late shipments across 14 warehouses, cutting manual review from 6 hours to 1 a week", TWO_COLUMN_BULLET, "Cleaned 3 years of clinic scheduling data and documented the no-show model the team adopted", "Gradient-boosted model on public freight data; 0.81 AUC"]);
      const facts = (await json(`select coalesce(jsonb_agg(f), '[]') from public.agent_flow_state s, jsonb_array_elements(s.state#>'{career,stores,profile,facts}') f where s.thread_id = '${p.thread_id}' and f->>'status' = 'confirmed'`)) as any[];
      for (const f2 of facts) for (const b of f2.bullets ?? []) assert(known.has(b), `invented bullet: ${b}`);
    });

    await t.step("duplicate delivery of the same webhook (sequential and racing) fetches once, answers once, stores once", async () => {
      reset();
      const P = "+13125550102", f = url("dup.pdf");
      internet.on(f, () => bytesResponse(pdf, "application/pdf"));
      const m = inbound(P, { attachments: [f], id: "dup-1" });
      const [a, b] = await Promise.all([m.run(), inbound(P, { attachments: [f], id: "dup-1" }).run()]);
      assert([a.body.ignored, b.body.ignored].includes("duplicate webhook") && [a.body.ignored, b.body.ignored].some((x) => x !== "duplicate webhook"), JSON.stringify([a.body, b.body]));
      const again = await inbound(P, { attachments: [f], id: "dup-1" }).run();
      eq(again.body.ignored, "duplicate webhook");
      eq(internet.seen.length, 1, "one fetch for three deliveries");
      const p = (await person(P))!;
      eq(await num(`select count(*) from public.career_outbox where user_id = '${p.user_id}'`), 1, "one reply");
      eq(await userMessages(p.user_id), 1, "one stored message");
      const d1 = (await drafts(p.thread_id)).length;
      assert(d1 >= 5);
      // The same file under a NEW message id after the yes: already on record, nothing new to confirm.
      await text(P, "yes thats my resume");
      const n = (await confirmed(p.user_id)).length;
      assert(n >= 5);
      const second = inbound(P, { attachments: [f] });
      await second.run();
      eq((await confirmed(p.user_id)).length, n, "no second copy confirmed");
      eq((await drafts(p.thread_id)).length, 0, "no new draft");
      assert(/already on your record/.test(await replyTo(p.user_id, second.id)), "said as it is");
    });

    await t.step("Word, RTF and plain-text attachments are read; an octet-stream label is decided by the file's own bytes", async () => {
      reset();
      for (const [n, P, bytes, type, bullet] of [
        [1, "+13125550111", docx, DOCX_MIME, DOCX_BULLET], [2, "+13125550112", docx, "application/octet-stream", DOCX_BULLET],
        [3, "+13125550113", rtf, "text/rtf", RTF_BULLET], [4, "+13125550114", plain, "text/plain; charset=utf-8", TEXT_BULLET],
      ] as [number, string, Uint8Array, string, string][]) {
        const f = url(`kind${n}/resume`);
        internet.on(f, () => bytesResponse(bytes, type));
        const m = inbound(P, { attachments: [f] }); await m.run();
        const p = (await person(P))!, d = await drafts(p.thread_id);
        assert(d.some((x) => [x.text, ...(x.bullets ?? [])].some((s: string) => String(s).includes(bullet))), `${type}: drafts carry the file's words: ${await replyTo(p.user_id, m.id)}`);
        eq((await confirmed(p.user_id)).length, 0, `${type}: nothing confirmed`);
        eq((await keptUpload(p.thread_id)).ref, `mms-file:sha256:${await hex(bytes)}`);
      }
    });

    await t.step("a photo, a scan, a video, a spreadsheet, a mislabelled file and a text that is not a resume: each gets the plain reply, and nothing is saved", async () => {
      reset();
      const cases: [string, string, Uint8Array, string | null, string][] = [
        ["+13125550121", "photo.jpg", JPEG, "image/jpeg", REPLIES.image],
        ["+13125550122", "pdf-label-png-bytes", PNG, "application/pdf", REPLIES.image],
        ["+13125550123", "png-label-pdf-bytes", pdf, "image/png", MMS_REPLIES.mismatch],
        ["+13125550124", "text-label-pdf-bytes", pdf, "text/plain", MMS_REPLIES.mismatch],
        ["+13125550125", "clip.mov", MP4, "video/mp4", MMS_REPLIES.unsupported("video")],
        ["+13125550126", "sheet.xlsx", xlsxLike(), "application/octet-stream", MMS_REPLIES.unsupported(".zip")],
        ["+13125550127", "scan.pdf", await file("scanned.pdf"), "application/pdf", REPLIES.scanned],
        ["+13125550128", "list.txt", ascii("groceries\nmilk\neggs\nbread\n"), "text/plain", ""],
        ["+13125550129", "nothing", new Uint8Array(0), "application/pdf", MMS_REPLIES.empty],
        ["+13125550130", "binary.txt", new Uint8Array([1, 2, 0, 3, 0, 0, 4]), "text/plain", MMS_REPLIES.mismatch],
      ];
      for (const [P, name, bytes, type, want] of cases) {
        const f = url(`bad/${name}`);
        internet.on(f, () => bytesResponse(bytes, type));
        const m = inbound(P, { attachments: [f], text: "here" }); await m.run();
        const p = (await person(P))!, reply = await replyTo(p.user_id, m.id);
        if (want) eq(reply, want, name); else assert(/doesn't look like a resume/.test(reply) && /nothing from it was saved/.test(reply), `${name}: ${reply}`);
        await nothingSaved(P, name);
        assert(!/^I (read|found)/.test(reply) || /nothing/.test(reply), `${name}: the reply claims nothing was read: ${reply}`);
      }
      // A picture or mislabelled file never reaches the resume reader: no turn ran, no message stored.
      for (const P of ["+13125550121", "+13125550122", "+13125550123", "+13125550125", "+13125550129"]) eq(await userMessages((await person(P))!.user_id), 0, `${P}: no turn ran`);
    });

    await t.step("the size cap holds WHILE streaming: a body that never ends is cut at 10 MB, even when it claims to be small", async () => {
      reset();
      for (const [P, claim] of [["+13125550141", {}], ["+13125550142", { "content-length": "100" }]] as [string, Record<string, string>][]) {
        const stats = { pulled: 0, cancelled: false }, f = url(`endless/${P.slice(-3)}.pdf`);
        internet.on(f, () => endless(stats, claim));
        const m = inbound(P, { attachments: [f] }); await m.run();
        const p = (await person(P))!;
        eq(await replyTo(p.user_id, m.id), MMS_REPLIES.too_large);
        assert(stats.pulled <= 10 * 1024 * 1024 + 2 * 65536, `pulled ${stats.pulled} bytes, past the cap plus one chunk`);
        assert(stats.pulled > 10 * 1024 * 1024 - 65536 && stats.cancelled, `read up to the cap and gave up: ${JSON.stringify(stats)}`);
        await nothingSaved(P, "oversize");
      }
      // A declared size over the cap is refused without reading the body.
      const stats = { pulled: 0, cancelled: false }, f = url("declared.pdf");
      internet.on(f, () => endless(stats, { "content-length": String(50 * 1024 * 1024) }));
      const P = "+13125550143", m = inbound(P, { attachments: [f] }); await m.run();
      eq([stats.pulled, await replyTo((await person(P))!.user_id, m.id)], [0, MMS_REPLIES.too_large]);
    });

    await t.step("decompression bombs are capped by output: a lying zip, an honest zip, a Flate PDF; an old-encoding PDF is not opened", async () => {
      reset();
      const cases: [string, string, Uint8Array][] = [["+13125550151", "lying.docx", docxBombLying()], ["+13125550152", "honest.docx", docxBombHonest()], ["+13125550153", "bomb.pdf", pdfBomb()], ["+13125550155", "bomb85.pdf", pdfBombA85()], ["+13125550156", "lying-small.docx", docxLyingSmall()]];
      for (const [P, name, bytes] of cases) {
        assert(bytes.length < 1024 * 1024, `${name} is small on the wire: ${bytes.length}`);
        const f = url(`bomb/${name}`);
        internet.on(f, () => bytesResponse(bytes, name.endsWith("pdf") ? "application/pdf" : DOCX_MIME));
        const started = performance.now();
        const m = inbound(P, { attachments: [f] }); await m.run();
        const p = (await person(P))!;
        eq(await replyTo(p.user_id, m.id), MMS_REPLIES.bomb, name);
        assert(performance.now() - started < 20000, `${name} was stopped promptly`);
        eq(await userMessages(p.user_id), 0, `${name}: never reached the reader`);
        await nothingSaved(P, name);
      }
      const f = url("lzw.pdf"); internet.on(f, () => bytesResponse(pdfLzw(), "application/pdf"));
      const m = inbound("+13125550154", { attachments: [f] }); await m.run();
      eq(await replyTo((await person("+13125550154"))!.user_id, m.id), MMS_REPLIES.old_pdf);
    });

    await t.step("an untrusted address is never fetched: other hosts, http, user:password@, a port, an IP, a look-alike, a file: address", async () => {
      reset();
      const bad = ["https://evil.example/x.pdf", `http://${HOST}/x.pdf`, `https://user:pw@${HOST}/x.pdf`, `https://${HOST}:8443/x.pdf`, "https://169.254.169.254/latest/meta-data", "https://127.0.0.1/x.pdf",
        `https://${HOST}.evil.example/x.pdf`, `https://evil.example/${HOST}/x.pdf`, "file:///etc/passwd", "javascript:alert(1)", "not a url"];
      let i = 0;
      for (const a of bad) {
        const P = `+1312555016${i++ % 10}`.slice(0, 12), m = inbound(P, { attachments: [a] }); await m.run();
        const p = (await person(P))!;
        assert(p, "the person exists");
      }
      eq(internet.seen.length, 0, `no request for any of them: ${JSON.stringify(internet.seen.map((s) => s.url))}`);
      const P = "+13125550170", m = inbound(P, { attachments: ["https://evil.example/x.pdf"] }); await m.run();
      eq(await replyTo((await person(P))!.user_id, m.id), MMS_REPLIES.blocked);
      await nothingSaved(P, "blocked address");
      // Not configured: nothing is fetched, even from the provider's own host.
      envExtra = { LOOPMESSAGE_MEDIA_HOSTS: "localhost, 127.0.0.1, *.example.com, media.loop-test.example/path" };
      const f = url("ok.pdf"); internet.on(f, () => bytesResponse(pdf, "application/pdf"));
      const P2 = "+13125550171", m2 = inbound(P2, { attachments: [f] }); await m2.run();
      eq([internet.seen.length, await replyTo((await person(P2))!.user_id, m2.id)], [0, MMS_REPLIES.not_wired]);
      // Hosts that are never valid (a name with no dots, an IP address) are dropped even if the owner lists them.
      envExtra = { LOOPMESSAGE_MEDIA_HOSTS: "localhost 127.0.0.1 169.254.169.254" };
      const P4 = "+13125550173", m4 = inbound(P4, { attachments: ["https://localhost/x.pdf"] }); await m4.run();
      const m5 = inbound(P4, { attachments: ["https://127.0.0.1/x.pdf"] }); await m5.run();
      const m6 = inbound(P4, { attachments: ["https://169.254.169.254/x.pdf"] }); await m6.run();
      eq(internet.seen.length, 0, "a listed IP address or bare name is still never requested");
      envExtra = { LOOPMESSAGE_MEDIA_HOSTS: "" };
      const P3 = "+13125550172", m3 = inbound(P3, { attachments: [f] }); await m3.run();
      eq([internet.seen.length, await replyTo((await person(P3))!.user_id, m3.id)], [0, MMS_REPLIES.not_wired]);
    });

    await t.step("redirects: to another host is not followed; within the listed host is; no credentials or provider keys ride any request", async () => {
      reset();
      const away = url("r/away.pdf"), evil = "https://evil.example/steal.pdf", within = url("r/within.pdf"), final = url("r/final.pdf");
      internet.on(away, () => new Response(null, { status: 302, headers: { location: evil } }));
      internet.on(evil, () => bytesResponse(pdf, "application/pdf"));
      internet.on(within, () => new Response(null, { status: 301, headers: { location: "/r/final.pdf" } }));
      internet.on(final, () => bytesResponse(pdf, "application/pdf"));
      const m = inbound("+13125550181", { attachments: [away] }); await m.run();
      eq(await replyTo((await person("+13125550181"))!.user_id, m.id), MMS_REPLIES.blocked);
      eq(internet.seen.filter((s) => s.url.startsWith("https://evil.example")).length, 0, "the other host was never requested");
      await nothingSaved("+13125550181", "redirect away");
      // A loop of redirects ends.
      const loop = url("r/loop.pdf"); internet.on(loop, () => new Response(null, { status: 302, headers: { location: loop } }));
      const ml = inbound("+13125550183", { attachments: [loop] }); await ml.run();
      assert(internet.seen.filter((s) => s.url === loop).length <= 3, "bounded hops");
      eq(await replyTo((await person("+13125550183"))!.user_id, ml.id), MMS_REPLIES.blocked);
      // Two listed hosts: a redirect from one to the other is still another host, and not followed.
      envExtra = { LOOPMESSAGE_MEDIA_HOSTS: `${HOST} second.loop-test.example` };
      const two = url("r/two.pdf"), other = "https://second.loop-test.example/x.pdf";
      internet.on(two, () => new Response(null, { status: 302, headers: { location: other } })); internet.on(other, () => bytesResponse(pdf, "application/pdf"));
      const mt = inbound("+13125550184", { attachments: [two] }); await mt.run();
      eq([await replyTo((await person("+13125550184"))!.user_id, mt.id), internet.to("second.loop-test.example").length], [MMS_REPLIES.blocked, 0]);
      envExtra = {};
      // Within the host: followed, read.
      const m2 = inbound("+13125550182", { attachments: [within] }); await m2.run();
      assert((await drafts((await person("+13125550182"))!.thread_id)).length >= 5, "followed to the same host");
      for (const s of internet.seen) {
        for (const h of Object.keys(s.headers)) assert(!/^(authorization|cookie|x-api-key|proxy-authorization|x-trainee-secret)$/i.test(h), `a credential header on a request: ${h}`);
        assert(!JSON.stringify(s).includes(LOOP_KEY) && !JSON.stringify(s).includes(SECRET), "no key or secret on any request");
        eq([s.credentials, s.redirect], ["omit", "manual"], "no credentials, no automatic redirect");
      }
    });

    await t.step("the provider's host fails (503, unreachable, too slow, empty): said plainly, nothing saved, and sending it again works", async () => {
      reset();
      const f503 = url("f/503.pdf"), fnet = url("f/net.pdf"), fslow = url("f/slow.pdf"), f0 = url("f/empty.pdf");
      internet.on(f503, () => new Response("down", { status: 503 }));
      internet.on(fnet, () => { throw new TypeError("connection refused"); });
      internet.on(fslow, () => new Promise<Response>(() => {}));
      internet.on(f0, () => new Response(null, { status: 200, headers: { "content-type": "application/pdf" } }));
      timeoutMs = 300;
      for (const [P, f, want] of [["+13125550191", f503, MMS_REPLIES.download], ["+13125550192", fnet, MMS_REPLIES.download], ["+13125550193", fslow, MMS_REPLIES.download], ["+13125550194", f0, MMS_REPLIES.empty]] as [string, string, string][]) {
        const m = inbound(P, { attachments: [f] }); await m.run();
        eq(await replyTo((await person(P))!.user_id, m.id), want, f);
        await nothingSaved(P, f);
        eq(await userMessages((await person(P))!.user_id), 0, "no turn ran");
      }
      // The same person tries again once the host is back.
      internet.on(f503, () => bytesResponse(pdf, "application/pdf"));
      const again = inbound("+13125550191", { attachments: [f503] }); await again.run();
      assert((await drafts((await person("+13125550191"))!.thread_id)).length >= 5, "the retry is read");
    });

    await t.step("several attachments: more than three opens none; two readable files ask which; a picture beside one resume still reads the resume", async () => {
      reset();
      const a = url("m/a.pdf"), b = url("m/b.docx"), c = url("m/c.jpg"), d = url("m/d.jpg");
      internet.on(a, () => bytesResponse(pdf, "application/pdf")); internet.on(b, () => bytesResponse(docx, DOCX_MIME));
      internet.on(c, () => bytesResponse(JPEG, "image/jpeg")); internet.on(d, () => bytesResponse(JPEG, "image/jpeg"));
      const m1 = inbound("+13125550201", { attachments: [a, b, c, d] }); await m1.run();
      eq([internet.seen.length, await replyTo((await person("+13125550201"))!.user_id, m1.id)], [0, MMS_REPLIES.many(4)]);
      const m2 = inbound("+13125550202", { attachments: [a, b] }); await m2.run();
      eq(await replyTo((await person("+13125550202"))!.user_id, m2.id), MMS_REPLIES.several(2));
      await nothingSaved("+13125550202", "two files");
      const m3 = inbound("+13125550203", { attachments: [{ url: c }, { url: a }] }); await m3.run();
      const p3 = (await person("+13125550203"))!;
      assert((await drafts(p3.thread_id)).some((x) => (x.bullets ?? []).includes(TWO_COLUMN_BULLET)), "the one readable file was read");
    });

    await t.step("two people at once: each file belongs to its sender; someone else's yes confirms nothing of theirs; an unknown number with sign-up closed fetches nothing", async () => {
      reset();
      const fa = url("w/a.pdf"), fb = url("w/b.docx");
      internet.on(fa, () => bytesResponse(pdf, "application/pdf")); internet.on(fb, () => bytesResponse(docx, DOCX_MIME));
      const A = "+13125550211", B = "+13125550212";
      await Promise.all([mms(A, [fa]), mms(B, [fb])]);
      const pa = (await person(A))!, pb = (await person(B))!;
      assert(pa.user_id !== pb.user_id && pa.thread_id !== pb.thread_id);
      const da = await drafts(pa.thread_id), db = await drafts(pb.thread_id);
      assert(da.length && db.length);
      assert(!JSON.stringify(da).includes("payments service") && !JSON.stringify(db).includes("KPI report"), "no entry crossed to the other person");
      eq((await keptUpload(pa.thread_id)).ref, `mms-file:sha256:${pdfSha}`);
      eq((await keptUpload(pb.thread_id)).ref, `mms-file:sha256:${await hex(docx)}`);
      // B says yes: only B's entries are confirmed.
      await text(B, "yes thats my resume");
      eq([(await confirmed(pa.user_id)).length, (await confirmed(pb.user_id)).length > 0], [0, true]);
      // A third number who never signed up, with sign-up closed.
      envExtra = { TRAINEE_SIGNUP: "closed" };
      const seenBefore = internet.seen.length, acc = await accounts();
      const closed = "+13125550213", r = await mms(closed, [fa]);
      eq([r.body.refused, internet.seen.length, await accounts(), (await person(closed))?.user_id ?? null], ["signup closed", seenBefore, acc, null]);
    });

    await t.step("STOP: with an attachment nothing is fetched; mid-flow it stops texts and confirms nothing; an opted-out number's attachment is not opened; START turns it back on", async () => {
      reset();
      const P = "+13125550221", f = url("s/a.pdf");
      internet.on(f, () => bytesResponse(pdf, "application/pdf"));
      // A new number whose first message is a STOP with a file.
      const r0 = await mms("+13125550222", [f], { text: "STOP" });
      eq([r0.body.command, internet.seen.length], ["stop", 0], "STOP with an attachment fetches nothing");
      eq([(await person("+13125550222"))?.user_id ?? null, (await person("+13125550222"))?.opted_out], [null, true], "recorded by number, no account made");
      // Mid-flow: the file is read and shown, then STOP.
      const m = inbound(P, { attachments: [f] }); await m.run();
      const p = (await person(P))!;
      const shown = (await drafts(p.thread_id)).length;
      assert(shown >= 5 && internet.seen.length === 1);
      const stop = await text(P, "STOP");
      eq(stop.body.command, "stop");
      eq((await person(P))!.opted_out, true, "opted out");
      eq((await confirmed(p.user_id)).length, 0, "STOP confirms nothing");
      eq((await drafts(p.thread_id)).length, shown, "the drafts stay drafts");
      // Opted out: a new attachment is not fetched, nothing runs.
      const m2 = inbound(P, { attachments: [f] }); const r2 = await m2.run();
      eq([internet.seen.length, r2.body.ignored], [1, "opted out: the attachment was not opened"]);
      eq(await num(`select count(*) from public.career_outbox where user_id = '${p.user_id}' and key = 'reply:${m2.id}'`), 0, "no reply is queued to a number that said STOP");
      // START turns it back on, and the attachment then works.
      const st = await text(P, "START");
      eq([st.body.command, (await person(P))!.opted_out], ["start", false]);
      const m3 = inbound(P, { attachments: [f] }); await m3.run();
      eq(internet.seen.length, 2);
      assert(/yes/i.test(await replyTo(p.user_id, m3.id)));
      assert(CHANNEL_REPLIES.stop.length > 0);
    });
  } finally {
    if (before === undefined) Deno.env.delete("CAREER_ACCOUNT_MEMORY"); else Deno.env.set("CAREER_ACCOUNT_MEMORY", before);
    handler?.restore();
    await pg.stop();
  }
} });
