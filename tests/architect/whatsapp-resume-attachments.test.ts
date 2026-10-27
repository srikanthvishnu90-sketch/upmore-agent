// FEATURE 16: a resume sent as a WhatsApp document, end to end through the REAL WhatsApp webhook (trainee-whatsapp/handler.ts:
// signature check, the channel core, the real inbound store), the channel bridge to the REAL agent-chat handler, on real
// Postgres. Seams: the HTTP hop to the Supabase project (tests/flow/postgrest.ts) and a fake Meta (the Graph API and its
// media host), so no request leaves the machine. Webhook bodies have the shape Meta documents for a document message
// (messages[].document: id, filename, mime_type, sha256, caption); the Graph answer is the documented
// { url, mime_type, sha256, file_size, id }. Neither is verified against Meta's live API.
//
// Fail-first on the base (PR 201's head): a document is parsed as a "seen" message with no turn, so no media request is made
// and nothing is answered with the person's resume; every case's first assertion fails.
import assertNode from "node:assert/strict";
import { deflateSync } from "../../supabase/functions/_shared/vendor/fflate-0.8.2.mjs";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, SERVICE_KEY, SUPABASE_URL, supabaseParity } from "../flow/handler.ts";
import { handleChat } from "../../supabase/functions/agent-chat/handler-career.ts";
import { handleWhatsApp } from "../../supabase/functions/trainee-whatsapp/handler.ts";
import { supabaseInboundStore } from "../../supabase/functions/trainee-inbound/store.ts";
import { chatThroughAgent } from "../../supabase/functions/_shared/channel_runtime.ts";
import { whatsappSignature } from "../../supabase/functions/_shared/whatsapp.ts";
import { MMS_REPLIES } from "../../supabase/functions/_shared/sms_media.ts";
import { REPLIES } from "../../supabase/functions/_shared/career_resume_replies.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const FX = new URL("../fixtures/resume-files/", import.meta.url).pathname;
const TOKEN = "wa-access-token-do-not-leak", APP = "a".repeat(40), PNID = "100200300", MEDIA_HOST = "media.wa-test.example", GRAPH = "graph.facebook.com";
const hex = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource))].map((x) => x.toString(16).padStart(2, "0")).join("");
const TWO_COLUMN_BULLET = "Automated the weekly operations KPI report in Python and Tableau";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, ...new Array(300).fill(9)]);

interface Seen { url: string; headers: Record<string, string> }
const net = {
  seen: [] as Seen[], routes: new Map<string, () => Response | Promise<Response>>(),
  on(u: string, r: () => Response | Promise<Response>) { this.routes.set(u, r); },
  async fetch(input: Request | URL | string, init?: RequestInit) {
    const u = String(input instanceof Request ? input.url : input);
    net.seen.push({ url: u, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    const r = net.routes.get(u);
    return r ? await r() : new Response("not found", { status: 404 });
  },
  reset() { this.seen = []; this.routes.clear(); },
  to(host: string) { return this.seen.filter((s) => new URL(s.url).hostname === host); },
};
const bytesOf = (b: Uint8Array, type: string) => new Response(b as BodyInit, { status: 200, headers: { "content-type": type } });
const jsonOf = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
const ascii = (s: string) => new TextEncoder().encode(s);
const u32 = (n: number) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let a = 0; for (const x of p) { o.set(x, a); a += x.length; } return o; };
function docxBomb(): Uint8Array {
  const z = new Uint8Array(80 * 1024 * 1024), d = deflateSync(z, { level: 9 }), nm = ascii("word/document.xml");
  const local = cat(new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 0, 8, 0, 0, 0, 0, 0]), u32(0), u32(d.length), u32(z.length), new Uint8Array([nm.length, 0, 0, 0]), nm, d);
  const cd = cat(new Uint8Array([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 0, 8, 0, 0, 0, 0, 0]), u32(0), u32(d.length), u32(z.length), new Uint8Array([nm.length, 0, 0, 0, 0, 0, 0, 0, 0, 0]), u32(0), u32(0), nm);
  return cat(local, cd, new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, 1, 0, 1, 0]), u32(cd.length), u32(local.length), new Uint8Array([0, 0]));
}

let pg: Pg, admin: any, envExtra: Record<string, string> = {}, tick = Date.parse("2026-10-26T15:00:00Z"), seq = 1;
const env = () => ({ get: (k: string) => ({ WHATSAPP_TOKEN: TOKEN, WHATSAPP_PHONE_NUMBER_ID: PNID, WHATSAPP_APP_SECRET: APP, WHATSAPP_VERIFY_TOKEN: "v".repeat(40), TRAINEE_SIGNUP: "open", WHATSAPP_MEDIA_HOSTS: MEDIA_HOST, ...envExtra } as Record<string, string>)[k] });
async function post(from: string, message: Record<string, unknown>, id = `wamid.t${seq++}`) {
  const body = { object: "whatsapp_business_account", entry: [{ id: "WABA1", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "15550001111", phone_number_id: PNID },
    contacts: [{ profile: { name: "Test Person" }, wa_id: from }], messages: [{ from, id, timestamp: String(Math.floor(tick / 1000)), ...message }] } }] }] };
  const raw = new TextEncoder().encode(JSON.stringify(body));
  const res = await handleWhatsApp(new Request("https://fn.test/trainee-whatsapp", { method: "POST", headers: { "x-hub-signature-256": await whatsappSignature(APP, raw) }, body: raw }), {
    env: env(), now: () => (tick += 1000), store: () => supabaseInboundStore(admin), chat: chatThroughAgent(SUPABASE_URL, SERVICE_KEY),
    deliver: async () => {}, mediaFetch: net.fetch.bind(net) as typeof fetch,
    optedOut: async (c: string) => (await admin.rpc("channel_opted_out", { p_contact: c })).data === true,
  } as any);
  return { id, status: res.status, body: await res.json() };
}
const doc = (id: string, o: Record<string, unknown> = {}) => ({ type: "document", document: { id, filename: "CV final.pdf", mime_type: "application/pdf", caption: "my resume pls", ...o } });
const text = (from: string, t: string) => post(from, { type: "text", text: { body: t } });
// Meta's two answers for one media id.
async function meta(id: string, bytes: Uint8Array, o: { type?: string; url?: string; file_size?: number; sha256?: string | null; bytesRoute?: () => Response | Promise<Response> } = {}) {
  const url = o.url ?? `https://${MEDIA_HOST}/dl/${id}`;
  net.on(`https://${GRAPH}/v21.0/${id}`, () => jsonOf({ messaging_product: "whatsapp", url, mime_type: o.type ?? "application/pdf", sha256: o.sha256 === undefined ? await0(bytes) : o.sha256, file_size: o.file_size ?? bytes.length, id }));
  net.on(url, o.bytesRoute ?? (() => bytesOf(bytes, o.type ?? "application/pdf")));
}
const sync = new Map<Uint8Array, string>();
const await0 = (b: Uint8Array) => sync.get(b) ?? null;

const sql = async (q: string) => (await pg.sql(q)).trim();
const num = async (q: string) => Number(await sql(q));
const json = async (q: string) => JSON.parse((await sql(q)) || "null");
const person = async (wa: string) => (await json(`select to_jsonb(c) from public.channel_contacts c where contact = 'wa:${wa}'`)) as { user_id: string; thread_id: string | null; opted_out: boolean } | null;
const replyTo = (userId: string, id: string) => sql(`select text from public.career_outbox where user_id = '${userId}' and key = 'reply:wa:${id}'`);
const drafts = async (t: string | null) => t ? (await json(`select coalesce(jsonb_agg(f), '[]') from public.agent_flow_state s, jsonb_array_elements(s.state#>'{career,stores,profile,facts}') f where s.thread_id = '${t}' and f->>'source' = 'resume-ingest' and f->>'status' = 'draft'`)) as any[] : [];
const confirmed = async (u: string) => (await json(`select coalesce(jsonb_agg(detail order by id), '[]') from public.career_events where user_id = '${u}' and kind = 'fact_confirmed'`)) as any[];
const kept = async (t: string | null) => t ? await json(`select state#>'{career,stores,resumeIntake,upload}' from public.agent_flow_state where thread_id = '${t}'`) : null;
async function nothingSaved(wa: string, why: string) {
  const p = await person(wa);
  if (!p?.user_id) return;
  eq([(await drafts(p.thread_id)).length, (await confirmed(p.user_id)).length, await kept(p.thread_id)], [0, 0, null], `${why}: nothing saved`);
}

Deno.test({ name: "FEATURE 16 WhatsApp: a resume sent as a document is fetched through Meta safely, read through the web path, and confirmed only by the person's yes", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (!pgBinDir()) { if (CI) throw new Error("needs Postgres 16 in CI"); console.log("NOT_RUN locally: no Postgres binaries"); return; }
  pg = await startPg();
  const before = Deno.env.get("CAREER_ACCOUNT_MEMORY");
  let handler: Awaited<ReturnType<typeof careerHandler>> | null = null;
  try {
    await supabaseParity(pg);
    handler = await careerHandler(pg, {});
    Deno.env.set("CAREER_ACCOUNT_MEMORY", "on");
    const toDb = globalThis.fetch;
    globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
      const req = new Request(input as any, init);
      return new URL(req.url).pathname === "/functions/v1/agent-chat" ? handleChat(req) : toDb(req);
    }) as typeof fetch;
    admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const pdf = await Deno.readFile(FX + "two-column.pdf"), pdfSha = await hex(pdf);
    sync.set(pdf, pdfSha);
    const reset = () => { net.reset(); envExtra = {}; };

    await t.step("a new number sends a PDF: two Meta requests with the token only on Meta's hosts, drafts shown, nothing confirmed until the yes, each entry names the file", async () => {
      reset();
      const P = "15555550101", mid = "100000000000001";
      await meta(mid, pdf);
      const accounts = await num(`select count(*) from auth.users`);
      const r = await post(P, doc(mid));
      eq(r.status, 200, JSON.stringify(r.body));
      const p = (await person(P))!;
      assert(p?.user_id && (await num(`select count(*) from auth.users`)) === accounts + 1, "an account for the new number");
      eq(net.seen.map((s) => s.url), [`https://${GRAPH}/v21.0/${mid}`, `https://${MEDIA_HOST}/dl/${mid}`], "exactly the two requests Meta documents");
      for (const s of net.seen) eq(s.headers.authorization, `Bearer ${TOKEN}`, "the token goes to Meta's hosts");
      const d = await drafts(p.thread_id);
      assert(d.length >= 5 && d.some((x) => (x.bullets ?? []).includes(TWO_COLUMN_BULLET)), `drafts in the file's words: ${await replyTo(p.user_id, r.id)}`);
      eq((await confirmed(p.user_id)).length, 0, "nothing confirmed by sending a file");
      eq((await kept(p.thread_id)).ref, `wa-file:${mid}`);
      await text(P, "hmm wait");
      eq((await confirmed(p.user_id)).length, 0);
      await text(P, "yes thats my resume");
      const ev = await confirmed(p.user_id);
      eq(ev.length, d.length);
      for (const e of ev) eq([e.upload.kind, e.upload.ref, e.upload.sha256], ["file", `wa-file:${mid}`, pdfSha]);
    });

    await t.step("the same webhook delivered again (and racing) fetches once, answers once", async () => {
      reset();
      const P = "15555550102", mid = "100000000000002", wam = "wamid.dup1";
      await meta(mid, pdf);
      const rs = await Promise.all([post(P, doc(mid), wam), post(P, doc(mid), wam)]);
      await post(P, doc(mid), wam);
      eq(net.seen.length, 2, "one pair of requests for three deliveries");
      assert(rs.some((r) => JSON.stringify(r.body).includes("duplicate webhook")), `one of the racing deliveries was recognised: ${JSON.stringify(rs.map((r) => r.body))}`);
      const p = (await person(P))!;
      eq(await num(`select count(*) from public.career_outbox where user_id = '${p.user_id}'`), 1, "one reply");
    });

    await t.step("a picture is told to send a PDF without being downloaded; an unreadable document, a mislabelled one, and an unlisted media host each save nothing", async () => {
      reset();
      const P1 = "15555550111";
      const r1 = await post(P1, { type: "image", image: { id: "100000000000011", mime_type: "image/jpeg", caption: "resume" } });
      eq([net.seen.length, await replyTo((await person(P1))!.user_id, r1.id)], [0, REPLIES.image]);
      await nothingSaved(P1, "picture");
      // a JPEG sent as a "document"
      const P2 = "15555550112", m2 = "100000000000012";
      await meta(m2, JPEG, { type: "application/pdf" });
      const r2 = await post(P2, doc(m2));
      eq(await replyTo((await person(P2))!.user_id, r2.id), REPLIES.image);
      await nothingSaved(P2, "jpeg as document");
      // the scan
      const scan = await Deno.readFile(FX + "scanned.pdf"), P3 = "15555550113", m3 = "100000000000013";
      sync.set(scan, await hex(scan)); await meta(m3, scan);
      const r3 = await post(P3, doc(m3));
      eq(await replyTo((await person(P3))!.user_id, r3.id), REPLIES.scanned);
      await nothingSaved(P3, "scan");
      // Meta answers an address on a host the owner did not list: the token is not sent there, nothing is read.
      const P4 = "15555550114", m4 = "100000000000014";
      await meta(m4, pdf, { url: "https://evil.example/steal.pdf" });
      const r4 = await post(P4, doc(m4));
      eq(await replyTo((await person(P4))!.user_id, r4.id), MMS_REPLIES.blocked);
      eq(net.to("evil.example").length, 0, "the token never reached the unlisted host");
      await nothingSaved(P4, "unlisted host");
      // a media id that is not an id
      const P5 = "15555550115", before = net.seen.length;
      const r5 = await post(P5, doc("../../etc/passwd"));
      eq([net.seen.length, await replyTo((await person(P5))!.user_id, r5.id)], [before, MMS_REPLIES.blocked]);
    });

    await t.step("Meta's failures and lies: 5xx, a redirect from Graph, a wrong checksum, an oversize or never-ending body, a bomb, and the retry after a failure", async () => {
      reset();
      // Graph is down
      const P1 = "15555550121", m1 = "100000000000021";
      net.on(`https://${GRAPH}/v21.0/${m1}`, () => new Response("down", { status: 503 }));
      const r1 = await post(P1, doc(m1));
      eq(await replyTo((await person(P1))!.user_id, r1.id), MMS_REPLIES.download);
      await nothingSaved(P1, "graph 503");
      net.on(`https://${GRAPH}/v21.0/${m1}`, () => jsonOf({ url: `https://${MEDIA_HOST}/dl/${m1}`, file_size: pdf.length, id: m1 }));
      net.on(`https://${MEDIA_HOST}/dl/${m1}`, () => bytesOf(pdf, "application/pdf"));
      await post(P1, doc(m1));
      assert((await drafts((await person(P1))!.thread_id)).length >= 5, "the retry is read");
      // Graph redirects
      const P2 = "15555550122", m2 = "100000000000022";
      net.on(`https://${GRAPH}/v21.0/${m2}`, () => new Response(null, { status: 302, headers: { location: "https://evil.example/x" } }));
      const r2 = await post(P2, doc(m2));
      eq([await replyTo((await person(P2))!.user_id, r2.id), net.to("evil.example").length], [MMS_REPLIES.blocked, 0]);
      // The media host redirects away
      const P3 = "15555550123", m3 = "100000000000023";
      await meta(m3, pdf, { bytesRoute: () => new Response(null, { status: 302, headers: { location: "https://evil.example/x.pdf" } }) });
      const r3 = await post(P3, doc(m3));
      eq([await replyTo((await person(P3))!.user_id, r3.id), net.to("evil.example").length], [MMS_REPLIES.blocked, 0]);
      // The bytes are not the ones Meta described
      const P4 = "15555550124", m4 = "100000000000024";
      await meta(m4, pdf, { sha256: "0".repeat(64) });
      const r4 = await post(P4, doc(m4));
      eq(await replyTo((await person(P4))!.user_id, r4.id), MMS_REPLIES.download);
      await nothingSaved(P4, "wrong checksum");
      // Meta says it is big / it never ends
      const P5 = "15555550125", m5 = "100000000000025";
      await meta(m5, pdf, { file_size: 50 * 1024 * 1024 });
      const r5 = await post(P5, doc(m5));
      eq(await replyTo((await person(P5))!.user_id, r5.id), MMS_REPLIES.too_large);
      eq(net.to(MEDIA_HOST).filter((s) => s.url.endsWith(m5)).length, 0, "not downloaded");
      const stats = { pulled: 0, cancelled: false }, P6 = "15555550126", m6 = "100000000000026";
      const chunk = new Uint8Array(65536).fill(0x41);
      await meta(m6, pdf, { file_size: 1000, bytesRoute: () => new Response(new ReadableStream<Uint8Array>({ pull(c) { if (stats.pulled >= 40 << 20) { c.close(); return; } stats.pulled += chunk.length; c.enqueue(chunk); }, cancel() { stats.cancelled = true; } }, new CountQueuingStrategy({ highWaterMark: 0 })), { status: 200, headers: { "content-type": "application/pdf" } }) });
      const r6 = await post(P6, doc(m6));
      eq(await replyTo((await person(P6))!.user_id, r6.id), MMS_REPLIES.too_large);
      assert(stats.cancelled && stats.pulled <= 10 * 1024 * 1024 + 2 * 65536, `cut at the cap while streaming: ${JSON.stringify(stats)}`);
      // A zip bomb
      const bomb = docxBomb(), P7 = "15555550127", m7 = "100000000000027";
      await meta(m7, bomb, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sha256: null });
      const r7 = await post(P7, doc(m7, { filename: "x.docx" }));
      eq(await replyTo((await person(P7))!.user_id, r7.id), MMS_REPLIES.bomb);
      await nothingSaved(P7, "bomb");
    });

    await t.step("not configured, and two people: no media host listed fetches nothing; each document belongs to its sender; STOP drops a document unfetched", async () => {
      reset();
      const P1 = "15555550131", m1 = "100000000000031";
      await meta(m1, pdf);
      envExtra = { WHATSAPP_MEDIA_HOSTS: "" };
      const r1 = await post(P1, doc(m1));
      eq([net.seen.length, await replyTo((await person(P1))!.user_id, r1.id)], [0, MMS_REPLIES.not_wired]);
      envExtra = {};
      const docx = await Deno.readFile(FX + "table-layout.docx"), A = "15555550132", B = "15555550133", ma = "100000000000032", mb = "100000000000033";
      sync.set(docx, await hex(docx));
      await meta(ma, pdf); await meta(mb, docx, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      await Promise.all([post(A, doc(ma)), post(B, doc(mb, { filename: "b.docx", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))]);
      const pa = (await person(A))!, pb = (await person(B))!;
      assert(!JSON.stringify(await drafts(pa.thread_id)).includes("payments service") && !JSON.stringify(await drafts(pb.thread_id)).includes("KPI report"), "nothing crossed");
      await text(B, "yes thats my resume");
      eq([(await confirmed(pa.user_id)).length, (await confirmed(pb.user_id)).length > 0], [0, true]);
      // STOP, then a document
      const C = "15555550134", mc = "100000000000034";
      await meta(mc, pdf);
      await text(C, "hi");
      await text(C, "STOP");
      const before = net.seen.length;
      await post(C, doc(mc));
      eq([(await person(C))!.opted_out, net.seen.length], [true, before]);
    });
  } finally {
    if (before === undefined) Deno.env.delete("CAREER_ACCOUNT_MEMORY"); else Deno.env.set("CAREER_ACCOUNT_MEMORY", before);
    handler?.restore();
    await pg.stop();
  }
} });
