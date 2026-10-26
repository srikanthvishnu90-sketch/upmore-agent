// FEATURE 16, owner directive 2026-10-26 ("a new user's resume, in any format and on any channel, must end as confirmed
// facts that every later feature uses, never re-asked"): a brand-new person, end to end through the REAL handler
// (handleChat) on real Postgres, with account memory on (CAREER_ACCOUNT_MEMORY=on, as the owner sets it):
//   web       a two-column PDF, a hedge ("wait, not yet") that confirms nothing, then "yep that's right";
//   Telegram  a Word file through the channel bridge;
//   SMS       a two-page paste through the channel bridge (no file path on SMS: the paste is how a resume arrives);
// then, for each: the apply queue takes "apply to the <role> at <Company>" (it refuses anyone with no confirmed resume),
// "tailor my resume for ..." builds the PDF from the confirmed entries, a NEW thread knows the resume ("what do you know
// about me") and tailors from it, and sending the resume again adds no second copy. Nothing in any later reply asks for
// the resume again.
import assertNode from "node:assert/strict";
import zlib from "node:zlib";
import nodeCrypto from "node:crypto";
import { Buffer } from "node:buffer";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, type Chat, SERVICE_KEY, supabaseParity } from "../flow/handler.ts";
import { CareerRender } from "../../supabase/functions/_shared/router_core.career.js";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const FX = new URL("../fixtures/resume-files/", import.meta.url).pathname;
const R = (CareerRender as any).withRuntime({ zlib, crypto: nodeCrypto, Buffer });
const WEB = "7b0f8f8e-6a43-4a49-9d2c-0000000016c1", TG = "7b0f8f8e-6a43-4a49-9d2c-0000000016c2", SMS = "7b0f8f8e-6a43-4a49-9d2c-0000000016c3";
const COMPANY = "Quillstone Analytics", ROLE = "Data Analyst";
const REASK = /paste (it|your resume|the text)|attach your resume|send (me )?your resume|no (confirmed )?resume on file|need your resume|upload your resume/i;
const b64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

Deno.test({ name: "FEATURE 16 new user: a resume on any channel ends as confirmed facts that apply, tailor and a new thread use, never asked for again", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (!pgBinDir()) { if (CI) throw new Error("needs Postgres 16 in CI"); console.log("NOT_RUN locally: no Postgres binaries"); return; }
  const pg: Pg = await startPg();
  let handler: Awaited<ReturnType<typeof careerHandler>> | null = null;
  const before = Deno.env.get("CAREER_ACCOUNT_MEMORY");
  try {
    await supabaseParity(pg);
    for (const id of [WEB, TG, SMS]) {
      await pg.sql(`insert into auth.users (id, email) values ('${id}', '${id}@example.test'); insert into public.profiles (id) values ('${id}');
        insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');`);
    }
    const desc = `${ROLE} at ${COMPANY}. You will build SQL and Python reporting for operations and logistics teams. Requirements: SQL, Python, Excel, Tableau.`;
    await pg.sql(`insert into public.career_kb_postings (posting_key, source, board, company, title, location, url, posted_at, text_excerpt, content_hash) values
        ('test:quillstone:16', 'greenhouse', 'quillstone', '${COMPANY}', '${ROLE}', 'Chicago, IL', 'https://boards.greenhouse.io/quillstone/jobs/16', now(), '${desc}', 'h16');
      insert into public.career_postings (job_id, provider, board, company, title, location, url, description, first_seen_at, last_seen_at)
        values ('greenhouse:quillstone:16', 'greenhouse', 'quillstone', '${COMPANY}', '${ROLE}', 'Chicago, IL', 'https://boards.greenhouse.io/quillstone/jobs/16', '${desc}', now(), now());`);
    Deno.env.set("CAREER_ACCOUNT_MEMORY", "on");
    handler = await careerHandler(pg, { "tok-web": WEB });
    const num = async (q: string) => Number(await pg.sql(q));
    const say = async (c: Chat, m: string, extra: Record<string, unknown> = {}) => { const r = await c.say(m, extra); eq(r.status, 200, `${m.slice(0, 60)}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`); return r; };
    const confirmedOf = async (person: string) => num(`select count(*) from public.career_events where user_id = '${person}' and kind = 'fact_confirmed'`);
    const pdfLines = async (person: string, body: any) => {
      const ref = body.artifacts?.[0]?.ref;
      assert(ref, `a tailored PDF rides the reply: ${JSON.stringify(body.artifacts ?? null)}`);
      const bytes = (await pg.sql(`select bytes_b64 from public.channel_artifacts where id = '${ref}' and user_id = '${person}'`)).trim();
      return (R.extractPdfLines(Buffer.from(bytes, "base64")) as string[]).join("\n");
    };

    // The later features, the same for every channel: each runs on the confirmed facts, and none asks for the resume.
    async function laterFeatures(person: string, open: () => Chat, extra: Record<string, unknown>, bullet: string) {
      const c = open();
      const facts = await confirmedOf(person);
      assert(facts >= 5, `confirmed with events: ${facts}`);
      const applied = await say(c, `apply to the ${ROLE} role at ${COMPANY}`, extra);
      eq(applied.intent, "career_apply_queue", applied.reply);
      assert(!REASK.test(applied.reply), `apply never asks for the resume again: ${applied.reply}`);
      eq(await num(`select count(*) from public.career_apply_wanted where user_id = '${person}' and posting_key = 'greenhouse:quillstone:16'`), 1, "queued for them");
      const tailored = await say(c, `tailor my resume for the ${ROLE} role at ${COMPANY}`, extra);
      eq(tailored.intent, "career_tailor", tailored.reply);
      assert(!REASK.test(tailored.reply), `tailoring never asks for the resume again: ${tailored.reply}`);
      // The tailored PDF is built from their own confirmed entries: at least one confirmed bullet, word for word.
      const pdf = await pdfLines(person, tailored.body);
      const bullets: string[] = JSON.parse(await pg.sql(`select coalesce(json_agg(b), '[]') from public.career_watch_kv k, jsonb_array_elements(k.value#>'{memory,profile,facts}') f, jsonb_array_elements_text(coalesce(f->'bullets', '[]')) b where k.user_id = '${person}' and k.key = 'career:account' and f->>'status' = 'confirmed'`));
      const flat = (x: string) => x.replace(/\s+/g, " ").trim();
      assert(bullets.includes(bullet) && bullets.some((b) => flat(pdf).includes(flat(b))), `a confirmed bullet in the PDF (lines wrap):\n${pdf}`);
      // A new conversation: the account remembers the resume.
      const fresh = open();
      const known = await say(fresh, "what do you know about me", extra);
      assert(fresh.thread() && fresh.thread() !== c.thread(), "a second thread");
      assert(new RegExp(`From your resume: ${facts} confirmed entries`).test(known.reply), `the new thread knows the resume: ${known.reply}`);
      const again = await say(fresh, `can you tailor my resume to the ${ROLE} job at ${COMPANY}?`, extra);
      eq(again.intent, "career_tailor", again.reply);
      assert(!REASK.test(again.reply), `nor in a new thread: ${again.reply}`);
      eq(await confirmedOf(person), facts, "using the facts confirms nothing new and asks nothing");
    }

    await t.step("web: a two-column PDF; a hedge confirms nothing; 'yep that's right' confirms every entry naming the file", async () => {
      const mk = () => handler!.chat("tok-web");
      const c = mk();
      const bytes = await Deno.readFile(FX + "two-column.pdf");
      const shown = await say(c, "here's my cv", { resume_file: { data: b64(bytes), name: "Avery CV final (2).pdf", mime: "application/pdf" } });
      eq([shown.intent, shown.resultStatus], ["career_resume_ingest", "awaiting_user"], shown.reply);
      const hedge = await say(c, "wait, not yet");
      assert(!(hedge.intent === "career_resume_ingest" && hedge.resultStatus === "completed"), hedge.reply);
      eq(await confirmedOf(WEB), 0, "a hedge confirms nothing");
      const yes = await say(c, "yep that's right");
      eq([yes.intent, yes.resultStatus], ["career_resume_ingest", "completed"], yes.reply);
      const files = await num(`select count(*) from public.career_events where user_id = '${WEB}' and kind = 'fact_confirmed' and detail->'upload'->>'kind' = 'file'`);
      eq(files, await confirmedOf(WEB), "every confirmation names the file");
      await laterFeatures(WEB, mk, {}, "Automated the weekly operations KPI report in Python and Tableau");
      // The same file again: nothing new to confirm, and nothing confirmed is duplicated.
      const rc = mk();
      const resent = await say(rc, "", { resume_file: { data: b64(bytes), name: "Avery CV final (2).pdf", mime: "application/pdf" } });
      eq([resent.intent, resent.resultStatus], ["career_resume_ingest", "already_on_record"], resent.reply);
      eq(resent.reply, `That resume is already on your record.\nAll ${await confirmedOf(WEB)} of its entries are confirmed facts already, so there is nothing new to confirm and nothing was changed. Name a role (or paste a posting) and the tailoring runs on them.`, "said as it is, and no yes is asked for");
      assert(!REASK.test(resent.reply) && !/say "yes/i.test(resent.reply), resent.reply);
      const inThread = await num(`select count(*) from public.agent_flow_state s, jsonb_array_elements(s.state#>'{career,stores,profile,facts}') f where s.thread_id = '${rc.thread()}' and f->>'status' = 'confirmed'`);
      const drafts = await num(`select count(*) from public.agent_flow_state s, jsonb_array_elements(s.state#>'{career,stores,profile,facts}') f where s.thread_id = '${rc.thread()}' and f->>'status' = 'draft'`);
      eq([inThread, drafts], [await confirmedOf(WEB), 0], "the account's confirmed entries, no second copy and no new draft");
    });

    await t.step("Telegram: a Word file through the channel bridge", async () => {
      const as = { as_user_id: TG };
      const mk = () => handler!.chat(SERVICE_KEY);
      const c = mk();
      const bytes = await Deno.readFile(FX + "table-layout.docx");
      const shown = await say(c, "", { ...as, resume_file: { data: b64(bytes), name: "resume.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ref: "tg-file:AgADnewuser16" } });
      eq([shown.intent, shown.resultStatus], ["career_resume_ingest", "awaiting_user"], shown.reply);
      const yes = await say(c, "yes, that's my resume", as);
      eq([yes.intent, yes.resultStatus], ["career_resume_ingest", "completed"], yes.reply);
      eq(await num(`select count(*) from public.career_events where user_id = '${TG}' and kind = 'fact_confirmed' and detail->'upload'->>'ref' = 'tg-file:AgADnewuser16'`), await confirmedOf(TG), "every confirmation names the Telegram file");
      await laterFeatures(TG, mk, as, "Wrote the integration tests for the payments service");
    });

    await t.step("SMS: a two-page paste through the channel bridge, read whole", async () => {
      const as = { as_user_id: SMS };
      const mk = () => handler!.chat(SERVICE_KEY);
      const c = mk();
      const paste = await Deno.readTextFile(FX + "long-paste.txt");
      const shown = await say(c, paste, as);
      eq([shown.intent, shown.resultStatus], ["career_resume_ingest", "awaiting_user"], shown.reply.slice(0, 300));
      const yes = await say(c, "yes that's my resume", as);
      eq([yes.intent, yes.resultStatus], ["career_resume_ingest", "completed"], yes.reply);
      await laterFeatures(SMS, mk, as, "Built the weekly on-time-in-full report in SQL and Excel that the regional director used to set carrier targets");
    });
  } finally {
    if (before === undefined) Deno.env.delete("CAREER_ACCOUNT_MEMORY"); else Deno.env.set("CAREER_ACCOUNT_MEMORY", before);
    handler?.restore();
    await pg.stop();
  }
} });
