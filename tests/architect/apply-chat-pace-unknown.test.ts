// SERIAL-1420 (b): a pace that could not be read is unknown, not "no preference". When the lookup fails the turn tries once
// more; if that fails too it tells the person plainly and queues nothing. The handler's reader throws on an RPC error
// (it used to return undefined, which queueWants read as no pace).
import assertNode from "node:assert/strict";
import { applyTurn, paceReader } from "../../supabase/functions/_shared/career_apply_chat.ts";
import { memoryWantStore } from "../../supabase/functions/_shared/career_apply_want.ts";

const NOW = Date.parse("2026-10-25T16:00:00Z");
const posting = { job_id: "greenhouse:testco1:1", company: "Test Co 1", title: "Data Analyst", url: "https://boards.greenhouse.io/testco1/jobs/1", location: "Chicago, IL" };
const world = (limits: () => Promise<any>) => {
  const wants = memoryWantStore();
  const search = async (words: string[]) => [posting].filter((p) => words.every((w) => `${p.company} ${p.title}`.toLowerCase().includes(w.toLowerCase())));
  return { wants, turn: () => applyTurn({ message: "apply to the Data Analyst role at Test Co 1", userId: "u1", now: NOW, postings: { search }, wants, apps: async () => [], facts: [], limits }) };
};

Deno.test("SERIAL-1420/b the pace lookup fails twice: the person is told, nothing is queued", async () => {
  let calls = 0;
  const w = world(async () => { calls++; throw new Error("rpc down"); });
  const r = await w.turn();
  assertNode.equal(calls, 2, "one retry, then stop");
  assertNode.equal(r?.status, "pace_unknown");
  assertNode.match(r!.reply, /couldn't read your daily pace/i);
  assertNode.match(r!.reply, /nothing was queued/i);
  assertNode.doesNotMatch(r!.reply, /\bQueued\b/);
  assertNode.equal((await w.wants.list("u1")).length, 0);
});

Deno.test("SERIAL-1420/b one failure then an answer: the retry is used and the posting is queued under the pace read", async () => {
  let calls = 0;
  const w = world(async () => { calls++; if (calls === 1) throw new Error("blip"); return { daily: 7 }; });
  const r = await w.turn();
  assertNode.equal(calls, 2);
  assertNode.equal(r?.status, "queued");
  assertNode.equal((await w.wants.list("u1")).length, 1);
});

Deno.test("SERIAL-1420/b no pace set is an answer (null), not a failure: queued with no limit", async () => {
  let calls = 0;
  const w = world(async () => { calls++; return { daily: null }; });
  assertNode.equal((await w.turn())?.status, "queued");
  assertNode.equal(calls, 1);
});

Deno.test("SERIAL-1420/b the handler's reader: an RPC error throws, a missing row throws; it never reads a bare integer as the answer", async () => {
  const admin = (r: any) => ({ rpc: async () => r });
  await assertNode.rejects(() => paceReader(admin({ error: { message: "permission denied" }, data: null }), "u1")(), /pace/);
  await assertNode.rejects(() => paceReader(admin({ error: null, data: null }), "u1")(), /no row/);
  await assertNode.rejects(() => paceReader(admin({ error: null, data: 7 }), "u1")(), /no row/);
  await assertNode.rejects(() => paceReader({ rpc: async () => { throw new Error("socket closed"); } }, "u1")(), /pace/);
});

// SERIAL-1430 (a): a stored pace that cannot be read is not "no preference" and not a lookup failure: no retry, nothing
// queued, and the person is told what their record says and what to say to fix it.
Deno.test("SERIAL-1430/a an unreadable saved pace: nothing queued, told plainly with the fix, read once", async () => {
  let calls = 0;
  const w = world(async () => { calls++; return { daily: null, unreadable: "lots" }; });
  const r = await w.turn();
  assertNode.equal(calls, 1, "an unreadable value is an answer, not a failure to retry");
  assertNode.equal(r?.status, "pace_unreadable");
  assertNode.match(r!.reply, /saved daily pace could not be read/i);
  assertNode.match(r!.reply, /"lots"/);
  assertNode.match(r!.reply, /set my daily pace to/i);
  assertNode.match(r!.reply, /nothing was queued/i);
  assertNode.equal((await w.wants.list("u1")).length, 0);
});

Deno.test("SERIAL-1430/a the handler's reader: none, set and unreadable come from career_apply_pace_state, never from a bare integer", async () => {
  const admin = (row: any) => ({ rpc: async (name: string) => { if (name !== "career_apply_pace_state") throw new Error(`unexpected rpc ${name}`); return { error: null, data: [row] }; } });
  assertNode.deepEqual(await paceReader(admin({ state: "none", pace: null, raw: null }), "u1")(), { daily: null });
  assertNode.deepEqual(await paceReader(admin({ state: "set", pace: 7, raw: "7" }), "u1")(), { daily: 7 });
  assertNode.deepEqual(await paceReader(admin({ state: "unreadable", pace: null, raw: "lots" }), "u1")(), { daily: null, unreadable: "lots" });
  assertNode.deepEqual(await paceReader(admin({ state: "unreadable", pace: null, raw: "2147483648" }), "u1")(), { daily: null, unreadable: "2147483648" });
  await assertNode.rejects(() => paceReader({ rpc: async () => ({ error: { message: "down" }, data: null }) }, "u1")(), /pace/);
});
