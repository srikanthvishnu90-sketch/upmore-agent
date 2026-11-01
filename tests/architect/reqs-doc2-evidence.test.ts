// REQS DOC 2 (tasks and follow-through), evidence asks: Q451 (an audit, "prove you applied", answered from the receipts in
// one message: employer-confirmed apart from sent-not-confirmed, each with its confirmation id, Submit time and posting) and
// Q395 ("apply to Acme" when Acme was already applied to: the earlier application's date and where it stands, read from
// career_apply_jobs, nothing queued, and the person asked whether this is a new role).
// Outcome checks run the REAL handler (handleChat) on real Postgres: the queue (career_apply_wanted), the applications
// (career_apply_jobs) and the outbox are read back after each turn; the pure parts (the asks, the proof list) first.
// Run: deno test -A --no-check --import-map=tests/flow/supabase-npm.json tests/architect/reqs-doc2-evidence.test.ts
import assertNode from "node:assert/strict";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, type Chat, supabaseParity } from "../flow/handler.ts";
import { proofText, receiptAsk, type ReceiptReader, type ReceiptRow, receiptTurn } from "../../supabase/functions/_shared/career_apply_receipt_read.ts";
import { formUrlFor } from "../../supabase/functions/_shared/posting_key.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const DAY = 86_400_000;
// Tuesday 2026-11-03, 3:00 PM UTC.
const T0 = Date.UTC(2026, 10, 3, 15, 0);
const H = (c: string) => c.repeat(64);
const iso = (daysAgo: number) => new Date(T0 - daysAgo * DAY).toISOString();

const receipt = (company: string, state: string, daysAgo: number, o: Partial<ReceiptRow> = {}): ReceiptRow => ({
  application_id: crypto.randomUUID(), company, url: `https://job-boards.greenhouse.io/${company.toLowerCase()}/jobs/7`, final_url: null, state,
  reached_employer: state === "confirmed" || state === "submitted_unconfirmed" ? "yes" : state === "unknown_outcome" ? "unknown" : "no",
  reason: null, answers: [], resume_sha256: null, payload_hash: H("a"), approval_hash: H("a"), engine_approval: null, approved_at: iso(daysAgo + 0.01),
  clicked_at: state === "failed" ? null : iso(daysAgo), finished_at: iso(daysAgo), confirmation_id: null, confirmation_text: null, proof: {}, pictures_keep_until: iso(-90), ...o,
});
const reader = (rows: ReceiptRow[]): ReceiptReader => ({ list: async () => rows, pictures: async () => [] });

Deno.test("EVIDENCE/1 the audit asks: prove, proof, did you actually apply; a plain status or receipt ask keeps its own shape", () => {
  for (const m of ["prove you applied", "Prove it", "proof?", "show me proof you applied", "how do I know you actually applied?", "i want proof",
    "did you really submit my applications", "proof of my applications", "prove you applied to them"]) eq(receiptAsk(m), { company: null, prove: true }, m);
  for (const [m, c] of [["Prove you applied to Acme", "Acme"], ["did you actually apply to Hooli?", "Hooli"], ["prove that you actually applied to Globex Corp", "Globex Corp"],
    ["where's the proof you applied to Stripe", "Stripe"]] as const) eq(receiptAsk(m), { company: c, prove: true }, m);
  // Unchanged shapes: the receipt asks of FEATURE 14, and the status ask (career_apply_status.ts) stays the status turn's.
  eq(receiptAsk("show me the receipt for Stripe"), { company: "Stripe" });
  eq(receiptAsk("can I see the proof for my Acme Corp application"), { company: "Acme Corp" });
  eq(receiptAsk("my receipts"), { company: null });
  for (const m of ["did you apply to Acme", "prove my skills on my resume", "how do I prove I know SQL", "apply to Acme"]) eq(receiptAsk(m), null, m);
});

Deno.test("EVIDENCE/2 the proof list: confirmed only when the employer confirmed it, each with its id, Submit time and posting; the rest named apart", async () => {
  const rows = [receipt("Acme", "confirmed", 6, { confirmation_id: "ACME-77" }), receipt("Globex", "submitted_unconfirmed", 3, { confirmation_text: "Thanks for applying!" }),
    receipt("Initech", "confirmed", 2), receipt("Umbrella", "unknown_outcome", 1), receipt("Hooli", "failed", 4)];
  const t = proofText(rows);
  assert(t.startsWith("Proof on record: 2 confirmed by the employer, 1 sent but not confirmed by the employer yet, 1 I can't tell arrived, 1 not sent."), t);
  assert(/Confirmed by the employer \(2\):\n1\. Acme: confirmation ACME-77; Submit clicked Oct 28, 3:00 PM UTC; posting https:\/\/job-boards\.greenhouse\.io\/acme\/jobs\/7\n2\. Initech: confirmed by their email \(no confirmation number in it\); Submit clicked Nov 1/.test(t), t);
  assert(/Sent, not confirmed by the employer yet \(Trainee's record of the Submit, not theirs\) \(1\):\n1\. Globex: Submit clicked Oct 31, 3:00 PM UTC; posting \S+; their page said "Thanks for applying!"/.test(t), t);
  assert(!/Globex: confirmation/.test(t), "a page's thank-you is never a confirmation");
  assert(/Can't tell whether it arrived \(never sent again\) \(1\):\n1\. Umbrella/.test(t) && /Not sent: Hooli\./.test(t), t);
  assert(/Ask "show me the receipt for Acme"/.test(t), t);
  const none = proofText([receipt("Hooli", "failed", 4)]);
  assert(/^Proof on record: 0 confirmed by the employer, 0 sent but not confirmed by the employer yet, 1 not sent\.\nNo application has reached an employer on record, so there is nothing to prove yet\.\nNot sent: Hooli\.$/.test(none), none);
  const turn = (await receiptTurn({ message: "prove you applied", userId: "U", now: T0, read: reader([]) }))!;
  eq(turn.status, "none", turn.reply);
  assert(/nothing to prove/.test(turn.reply), turn.reply);
  const broken = (await receiptTurn({ message: "prove it", userId: "U", now: T0, read: { list: () => Promise.reject(new Error("down")), pictures: async () => [] } }))!;
  eq(broken.status, "unreadable", "a record that can't be read is said so, never guessed");
  const one = (await receiptTurn({ message: "did you actually apply to Acme?", userId: "U", now: T0, read: reader(rows) }))!;
  eq(one.status, "shown", one.reply);
  assert(/^Receipt for your application to Acme: Acme: submitted, and Acme confirmed it \(confirmation ACME-77\)\./.test(one.reply), one.reply);
});

const PEOPLE: Record<string, string> = { "tok-e1": "7b0f8f8e-6a43-4a49-9d2c-0000000e0c01", "tok-e2": "7b0f8f8e-6a43-4a49-9d2c-0000000e0c02" };
const count = async (pg: Pg, table: string, id: string) => Number(await pg.sql(`select count(*) from public.${table} where user_id = '${id}'`));

Deno.test({ name: "EVIDENCE/3 the real handler on real Postgres: 'apply to Acme' says the earlier application and queues nothing; 'prove you applied' answers from the receipts", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (!pgBinDir()) { if (CI) throw new Error("needs Postgres 16 in CI"); console.log("NOT_RUN locally: no Postgres binaries"); return; }
  const pg: Pg = await startPg();
  let handler: Awaited<ReturnType<typeof careerHandler>> | null = null;
  const realNow = Date.now;
  try {
    await supabaseParity(pg);
    for (const [tok, id] of Object.entries(PEOPLE)) {
      await pg.sql(`insert into auth.users (id, email) values ('${id}', '${tok}@example.test'); insert into public.profiles (id) values ('${id}');
        insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');`);
    }
    const [E1, E2] = [PEOPLE["tok-e1"], PEOPLE["tok-e2"]];
    // The postings on file: one at Acme (applied to 6 days ago, confirmed), one at Globex (sent, not confirmed), a new one at Initech.
    const posting = (co: string, n: number, title: string) => `('greenhouse:${co.toLowerCase()}test:${n}', 'greenhouse', '${co.toLowerCase()}test', '${co}', '${title}', 'Chicago, IL', '${formUrlFor(`greenhouse:${co.toLowerCase()}test:${n}`)}', '${title}. SQL and dashboards.', '${iso(10)}', '${iso(0)}')`;
    await pg.sql(`insert into public.career_postings (job_id, provider, board, company, title, location, url, description, first_seen_at, last_seen_at) values
      ${posting("Acme", 7, "Data Analyst")}, ${posting("Globex", 8, "Data Analyst")}, ${posting("Initech", 9, "Data Analyst")};`);
    const app = (user: string, co: string, n: number, state: string, daysAgo: number, conf: string | null) => {
      const job = `greenhouse:${co.toLowerCase()}test:${n}`, url = formUrlFor(job)!, id = crypto.randomUUID();
      const payload = JSON.stringify({ version: "1", user_id: user, job_id: job, company: co, url, fields: [], title: "Data Analyst" });
      return { id, sql: `('${id}', '${user}', '${job}', '${co}', '${url}', '${payload}'::jsonb, '${H("b")}', '${H("b")}', '${state}', ${conf ? `'${conf}'` : "null"}, '${iso(daysAgo)}', '${iso(daysAgo)}')`,
        receipt: `('${id}', '${user}', '${co}', '${url}', '${state}', '${state === "confirmed" || state === "submitted_unconfirmed" ? "yes" : "no"}', '${H("b")}', '${H("b")}', '${iso(daysAgo)}', ${state === "failed" ? "null" : `'${iso(daysAgo)}'`}, '${iso(daysAgo)}', ${conf ? `'${conf}'` : "null"}, '${iso(-90)}')` };
    };
    const acme = app(E1, "Acme", 7, "confirmed", 6, "ACME-77"), globex = app(E1, "Globex", 8, "submitted_unconfirmed", 3, null), hooli = app(E1, "Hooli", 5, "failed", 4, null);
    await pg.sql(`set session_replication_role = replica;
      insert into public.career_apply_jobs (id, user_id, job_id, company, url, payload, payload_hash, approval_hash, state, confirmation_id, created_at, updated_at) values ${acme.sql}, ${globex.sql}, ${hooli.sql};
      insert into public.career_apply_receipts (application_id, user_id, company, url, state, reached_employer, payload_hash, approval_hash, approved_at, clicked_at, finished_at, confirmation_id, pictures_keep_until) values
        ${acme.receipt}, ${globex.receipt}, ${hooli.receipt};
      set session_replication_role = origin;`);
    handler = await careerHandler(pg, PEOPLE);
    const say = async (c: Chat, text: string) => {
      Date.now = () => T0;
      try { const r = await c.say(text); eq(r.status, 200, r.reply); return r; } finally { Date.now = realNow; }
    };
    const c1 = handler.chat("tok-e1");
    const state = async (id: string) => ({ wanted: await count(pg, "career_apply_wanted", id), jobs: await count(pg, "career_apply_jobs", id), outbox: await count(pg, "career_outbox", id) });

    await t.step("Q395: 'apply to the Data Analyst role at Acme' after a confirmed application says when and how it went, queues nothing, asks", async () => {
      const before = await state(E1);
      const r = await say(c1, "apply to the Data Analyst role at Acme");
      eq([r.intent, r.resultStatus], ["career_apply_queue", "already_applied"], r.reply);
      assert(/^You already applied to Data Analyst at Acme on Oct 28, 2026\. Where it stands: Acme \(Data Analyst\): submitted, and Acme confirmed it \(confirmation ACME-77\)\./.test(r.reply), r.reply);
      assert(/nothing was queued/i.test(r.reply) && /different role at Acme\?/.test(r.reply), r.reply);
      eq(await state(E1), before, "no queue row, no application row, no outbox row");
      const g = await say(c1, "apply to the Data Analyst role at Globex");
      eq(g.resultStatus, "already_applied", g.reply);
      assert(/on Oct 31, 2026\. Where it stands: Globex \(Data Analyst\): submitted on Oct 31; Globex has not confirmed it yet\./.test(g.reply), g.reply);
      assert(!/Globex confirmed it/.test(g.reply), "an unconfirmed application is never said confirmed");
      eq(await state(E1), before);
    });

    await t.step("Q451: 'prove you applied' lists the receipts, confirmed apart from unconfirmed, and writes nothing", async () => {
      const before = await state(E1);
      const r = await say(c1, "prove you applied");
      eq([r.intent, r.resultStatus], ["career_apply_receipt", "proof"], r.reply);
      assert(r.reply.startsWith("Proof on record: 1 confirmed by the employer, 1 sent but not confirmed by the employer yet, 1 not sent."), r.reply);
      assert(/Confirmed by the employer \(1\):\n1\. Acme: confirmation ACME-77; Submit clicked Oct 28, 3:00 PM UTC; posting https:\/\/job-boards\.greenhouse\.io\/acmetest\/jobs\/7/.test(r.reply), r.reply);
      assert(/\(1\):\n1\. Globex: Submit clicked Oct 31, 3:00 PM UTC/.test(r.reply) && !/Globex: confirmation/.test(r.reply), r.reply);
      assert(/Not sent: Hooli\./.test(r.reply), r.reply);
      const one = await say(c1, "did you actually apply to Globex?");
      eq([one.intent, one.resultStatus], ["career_apply_receipt", "shown"], one.reply);
      assert(/^Receipt for your application to Globex: Globex: submitted on Oct 31; Globex has not confirmed it yet\./.test(one.reply), one.reply);
      eq(await state(E1), before, "an audit writes nothing");
    });

    await t.step("another person's audit sees none of it", async () => {
      const r = await say(handler!.chat("tok-e2"), "prove you applied");
      eq([r.intent, r.resultStatus], ["career_apply_receipt", "none"], r.reply);
      assert(!/Acme|Globex|Hooli/.test(r.reply), r.reply);
    });
  } finally {
    Date.now = realNow;
    handler?.restore();
    await pg.stop();
  }
} });
