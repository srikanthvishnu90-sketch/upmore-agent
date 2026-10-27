// LANE L3 (2026-10-27): the link the older suites never asserted together. #215's channel suites prove a resume sent as an
// attachment is fetched safely, read, and confirmed only by the person's yes (fact_confirmed events naming the file);
// #211's suites prove the one confirmed-resume record for pastes and the web. This test joins them on the integrated
// stack: a resume confirmed from a CHANNEL FILE ends as the one career_resume_record, and no second entry point can
// create a divergent record — the same file again changes nothing, and a different file arriving over the chat bridge
// (the exact chatThroughAgent request every channel, WhatsApp included, sends with its downloaded media) MOVES the
// one record: still one row, generation +1, the old sha256 retired and no longer allowed on any application.
//
// Fail-first: on the stack without #211 the confirmation events exist but career_resume_record does not, so the first
// record assertion fails; on a stack where a channel file never reached the record, the same assertion fails.
import assertNode from "node:assert/strict";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, SERVICE_KEY, SUPABASE_URL, supabaseParity } from "../flow/handler.ts";
import { handleChat } from "../../supabase/functions/agent-chat/handler-career.ts";
import { handleInbound } from "../../supabase/functions/trainee-inbound/handler.ts";
import { supabaseInboundStore } from "../../supabase/functions/trainee-inbound/store.ts";
import { chatThroughAgent } from "../../supabase/functions/_shared/channel_runtime.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const FX = new URL("../fixtures/resume-files/", import.meta.url).pathname;
const SECRET = "s".repeat(40), LOOP_KEY = "loop-api-key-do-not-leak", HOST = "media.loop-test.example";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCX_BULLET = "Wrote the integration tests for the payments service";
const hex = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource))].map((x) => x.toString(16).padStart(2, "0")).join("");
const file = (n: string) => Deno.readFile(FX + n);

// ---- the fake internet: only the texting provider's attachment host exists -----------------------------------------
const internet = {
  routes: new Map<string, () => Response>(),
  on(u: string, r: () => Response) { this.routes.set(u, r); },
  async fetch(input: Request | URL | string, init?: RequestInit) {
    const u = String(input instanceof Request ? input.url : input);
    const r = internet.routes.get(u);
    return r ? r() : new Response("not found", { status: 404 });
  },
};
const bytesResponse = (b: Uint8Array, type: string) => new Response(b as BodyInit, { status: 200, headers: { "content-type": type } });

// ---- the world -------------------------------------------------------------------------------------------------------
let pg: Pg, admin: any;
const sends: { contact: string; bubbles: string[] }[] = [], delivered: any[] = [];
let nextId = 1, tick = Date.parse("2026-10-27T15:00:00Z");
function inbound(from: string, o: { text?: string; attachments?: unknown; id?: string }) {
  const id = o.id ?? `mm-${nextId++}`;
  const body: Record<string, unknown> = { alert_type: "message_inbound", message_id: id, recipient: from, text: o.text ?? "" };
  if (o.attachments !== undefined) body.attachments = o.attachments;
  const deps = {
    env: { get: (k: string) => ({ TRAINEE_INBOUND_SECRET: SECRET, LOOPMESSAGE_API_KEY: LOOP_KEY, TRAINEE_SIGNUP: "open", LOOPMESSAGE_MEDIA_HOSTS: HOST } as Record<string, string>)[k] },
    now: () => (tick += 1000), store: () => supabaseInboundStore(admin),
    send: () => async (contact: string, bubbles: string[]) => { sends.push({ contact, bubbles }); return { ok: true as const, id: null }; },
    chat: chatThroughAgent(SUPABASE_URL, SERVICE_KEY),
    deliverReply: async (a: unknown) => { delivered.push(a); },
    mediaFetch: internet.fetch.bind(internet) as typeof fetch, mediaTimeoutMs: undefined,
    optedOut: async (contact: string) => (await admin.rpc("channel_opted_out", { p_contact: contact })).data === true,
  };
  return { id, run: async () => { const res = await handleInbound(new Request(`https://fn.test/trainee-inbound?secret=${SECRET}`, { method: "POST", body: JSON.stringify(body) }), deps as any); return { status: res.status, body: await res.json() }; } };
}
const sql = async (q: string) => (await pg.sql(q)).trim();
const json = async (q: string) => JSON.parse((await sql(q)) || "null");
const person = async (contact: string) => (await json(`select to_jsonb(c) from public.channel_contacts c where contact = '${contact}'`)) as { user_id: string; thread_id: string | null } | null;
const record = async (userId: string) => await json(`select coalesce((select json_build_object('rows', (select count(*) from public.career_resume_record where user_id = '${userId}'),
  'state', state, 'kind', kind, 'sha256', sha256, 'generation', generation, 'source_ref', source_ref, 'has_bytes', bytes is not null,
  'confirmed_at', confirmed_at) from public.career_resume_record where user_id = '${userId}'), '{"rows":0}')`);
const allowed = async (userId: string, sha: string) => (await sql(`select public.career_resume_allowed('${userId}', '${sha}')`)) === "t" ? "true" : "false";
const skip = () => { if (pgBinDir()) return false; if (CI) throw new Error("needs Postgres 16 in CI"); console.log("NOT_RUN locally: no Postgres binaries"); return true; };

Deno.test({ name: "one confirmed resume: a channel file is the record, the same file again changes nothing, a second channel's file moves the one record", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (skip()) return;
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
    const pdf = await file("two-column.pdf"), docx = await file("table-layout.docx");
    const pdfSha = await hex(pdf), docxSha = await hex(docx);
    const P = "+13125550301", f = `https://${HOST}/files/cv.pdf`;
    internet.on(f, () => bytesResponse(pdf, "application/pdf"));
    const bridge = chatThroughAgent(SUPABASE_URL, SERVICE_KEY);
    let uid = "", thread: string | null = null, at1 = "";

    await t.step("an SMS attachment, confirmed by the person's yes, IS the one record (kind file, the file's sha256, no copy kept)", async () => {
      const m = inbound(P, { text: "heres my cv lol", attachments: [f] });
      const r = await m.run();
      eq(r.status, 200, JSON.stringify(r.body));
      const p = (await person(P))!;
      uid = p.user_id; thread = p.thread_id;
      eq(await record(uid), { rows: 0 }, "nothing is the resume until they confirm it");
      await inbound(P, { text: "yep thats right" }).run();
      const rec = await record(uid);
      eq(rec.rows, 1, "exactly one record row");
      eq([rec.state, rec.kind, rec.sha256, rec.generation], ["confirmed", "file", pdfSha, 1]);
      eq(rec.source_ref, `mms-file:sha256:${pdfSha}`, "the record names the channel file it came from");
      eq(rec.has_bytes, false, "the database holds no bytes for an MMS file: recorded by its sha256 with no copy");
      at1 = rec.confirmed_at;
      eq(await allowed(uid, pdfSha), "true", "an application may carry the record's file");
    });

    await t.step("the same file again on the same channel: already on record, and the record does not move", async () => {
      const again = inbound(P, { attachments: [f] });
      await again.run();
      const out = await sql(`select text from public.career_outbox where user_id = '${uid}' and key = 'reply:${again.id}'`);
      assert(/already on your record/.test(out), out);
      const rec = await record(uid);
      eq([rec.rows, rec.sha256, rec.generation, rec.confirmed_at], [1, pdfSha, 1, at1], "no divergent record, no new generation");
    });

    await t.step("a different resume over the chat bridge (a WhatsApp document's own request) moves the ONE record: generation 2, the old sha retired", async () => {
      const shown = await bridge({ userId: uid, threadId: thread, message: "", turnKey: `l3-wa-file-${nextId++}`, file: { bytes: docx, name: "resume.docx", mime: DOCX_MIME, ref: "wa-file:l3-media-1", sha256: docxSha } });
      assert(shown.reply.includes(DOCX_BULLET), `the second file's entries are shown for a yes: ${shown.reply.slice(0, 300)}`);
      eq((await record(uid)).generation, 1, "not the resume until they confirm it");
      const yes = await bridge({ userId: uid, threadId: thread, message: "yes that's my resume", turnKey: `l3-wa-yes-${nextId++}` });
      eq(yes.resultStatus, "completed", yes.reply);
      const rec = await record(uid);
      eq([rec.rows, rec.state, rec.kind, rec.sha256, rec.generation], [1, "confirmed", "file", docxSha, 2], "still exactly one row: it moved");
      eq(rec.source_ref, "wa-file:l3-media-1", "the record names the second channel's file");
      eq(await allowed(uid, docxSha), "true", "the new record's file may be carried");
      eq(await allowed(uid, pdfSha), "false", "the replaced resume may never be carried again");
      eq(await sql(`select count(*) from public.career_resume_retired where user_id = '${uid}' and sha256 = '${pdfSha}'`), "1", "the old sha256 is retired");
    });
  } finally {
    if (before === undefined) Deno.env.delete("CAREER_ACCOUNT_MEMORY"); else Deno.env.set("CAREER_ACCOUNT_MEMORY", before);
    handler?.restore();
    await pg.stop();
  }
} });
