// STEP 4 F1/F2 (2026-10-25): the chat-to-queue turn (career_apply_chat.ts) in memory. What it claims, what it queues, and
// that no volume ceiling applies on this path (owner, 2026-10-22: no cap on applications): the 26th posting of a day is
// queued like the first. Fail-first on edd6f90c: the 26th was refused "over today's limit of 25 applications".
import assertNode from "node:assert/strict";
import { applyAsk, applyTurn, trackedFromRows } from "../../supabase/functions/_shared/career_apply_chat.ts";
import { memoryWantStore } from "../../supabase/functions/_shared/career_apply_want.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const NOW = Date.parse("2026-10-25T16:00:00Z");
const posting = (n: number, company = `Test Co ${n}`, title = "Data Analyst") =>
  ({ job_id: `greenhouse:testco${n}:${n}`, company, title, url: `https://boards.greenhouse.io/testco${n}/jobs/${n}`, location: "Chicago, IL" });
const world = (postings: any[], apps: any[] = []) => {
  const wants = memoryWantStore();
  const search = async (words: string[]) => postings.filter((p) => words.every((w) => `${p.company} ${p.title}`.toLowerCase().includes(w.toLowerCase())));
  const turn = (message: string, facts: any[] = []) => applyTurn({ message, userId: "u1", now: NOW, postings: { search }, wants, apps: async () => apps, facts });
  return { wants, turn };
};

Deno.test("the ask: a role at an employer, or an employer alone; questions and batch shapes are never claimed", () => {
  eq(applyAsk("apply to the Data Analyst role at Test Co 1"), { role: "Data Analyst", company: "Test Co 1" });
  eq(applyAsk("Apply me to Test Co 1"), { role: null, company: "Test Co 1" });
  eq(applyAsk("how do I apply to Test Co 1?"), null);
  eq(applyAsk("apply to these"), null);
  eq(applyAsk("apply to 25 data analyst roles"), null);
  eq(applyAsk("I applied to Test Co 1 yesterday"), null);
});

Deno.test("queued once, said truthfully; a repeat changes nothing; no posting on file is not claimed", async () => {
  const w = world([posting(1)]);
  const r = await w.turn("apply to the Data Analyst role at Test Co 1");
  eq([r?.status, r?.intent], ["queued", "career_apply_queue"]);
  assert(/Nothing is sent and nothing is filled yet/.test(r!.reply) && /approve it on its card/.test(r!.reply), r!.reply);
  eq((await w.wants.list("u1")).map((x) => x.posting_key), ["greenhouse:testco1:1"]);
  eq((await w.turn("apply to the Data Analyst role at Test Co 1"))?.status, "already");
  eq(await w.turn("apply to the Data Analyst role at Nowhere Inc"), null, "not on file: the router's turn");
  eq((await w.wants.list("u1")).length, 1);
});

Deno.test("several open postings ask which; a role the employer lacks is said with what it has", async () => {
  const w = world([posting(1, "Acme", "Data Analyst"), posting(2, "Acme", "Product Manager")]);
  const which = await w.turn("apply to Acme");
  eq(which?.status, "which");
  assert(/1\. Data Analyst/.test(which!.reply) && /2\. Product Manager/.test(which!.reply), which!.reply);
  const none = await w.turn("apply to the Staff Engineer role at Acme");
  eq(none?.status, "none");
  assert(/Data Analyst/.test(none!.reply) && /nothing was queued/.test(none!.reply), none!.reply);
  eq((await w.wants.list("u1")).length, 0);
});

Deno.test("an application to that employer in the last 30 days refuses the pick; the employer guard stands", async () => {
  // The queue's own rows (career_apply_jobs), as the handler reads them; applyTurn maps them to applications.
  const rows = [{ id: "j1", company: "Test Co 1", state: "submitted_unconfirmed", created_at: new Date(NOW - 5 * 86400_000).toISOString(), updated_at: "" }];
  eq(trackedFromRows(rows as any).map((a) => a.stage), ["Submitted"], "a sent application counts; a failed one would not");
  const w = world([posting(1)], rows);
  const r = await w.turn("apply to the Data Analyst role at Test Co 1");
  eq(r?.status, "refused");
  assert(/already applied/.test(r!.reply) && /30 days/.test(r!.reply), r!.reply);
  eq((await w.wants.list("u1")).length, 0);
});

Deno.test("no volume ceiling: the 26th and 51st postings of a day are queued like the first", async () => {
  const postings = Array.from({ length: 51 }, (_, i) => posting(i + 1));
  const w = world(postings);
  for (let i = 1; i <= 51; i++) {
    const r = await w.turn(`apply to the Data Analyst role at Test Co ${i}`);
    eq(r?.status, "queued", `posting ${i}: ${r?.reply}`);
  }
  eq((await w.wants.list("u1")).length, 51);
});
