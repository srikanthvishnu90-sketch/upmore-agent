// SERIAL-1430 (b): the person sets or clears their pace in chat; what the column cannot hold is refused at that point and
// said so; nothing is stored silently changed. The write is the service's career_apply_pace_set, which refuses the same.
import assertNode from "node:assert/strict";
import { paceAsk, paceTurn } from "../../supabase/functions/_shared/career_apply_chat.ts";

Deno.test("SERIAL-1430/b the ask: set, change, or clear; questions and other numbers are not it", () => {
  for (const [m, want] of [
    ["set my daily pace to 7", { pace: "7" }], ["Set my pace to 25 a day", { pace: "25" }], ["change my daily limit to 40", { pace: "40" }], ["apply 10 a day", { pace: "10" }],
    ["set my daily pace to none", { pace: null }], ["no daily pace", { pace: null }], ["remove my daily limit", { pace: null }], ["clear my daily pace", { pace: null }],
    ["set my daily pace to 2147483648", { pace: "2147483648" }], ["set my daily pace to lots", { pace: "lots" }],
  ] as const) assertNode.deepEqual(paceAsk(m), want, m);
  for (const m of ["what is my daily pace?", "apply to 3 roles", "apply to the top 2", "my phone number is 312-555-0142", "I applied to 7 jobs today"]) assertNode.equal(paceAsk(m), null, m);
});

Deno.test("SERIAL-1430/b a pace the column holds is stored and confirmed; one it cannot hold is refused, said so, and nothing is stored", async () => {
  const stored: string[] = [];
  const rpc = async (name: string, args: any) => {
    assertNode.equal(name, "career_apply_pace_set");
    const p = String(args.p_pace ?? "none");
    if (/^(none|no|off|clear)$/i.test(p)) { stored.push("none"); return { error: null, data: { state: "none", pace: null } }; }
    if (!/^\s*\+?[0-9]+\s*$/.test(p) || Number(p) < 1 || Number(p) > 2147483647) return { error: { message: `invalid pace: a whole number from 1 to 2147483647, or none (got ${p})` }, data: null };
    stored.push(p); return { error: null, data: { state: "set", pace: Number(p) } };
  };
  const turn = (message: string) => paceTurn({ message, userId: "u1", admin: { rpc } });
  const ok = await turn("set my daily pace to 7");
  assertNode.equal(ok?.status, "set");
  assertNode.match(ok!.reply, /7 a day/);
  assertNode.match(ok!.reply, /no daily pace/i);
  const big = await turn("set my daily pace to 2147483648");
  assertNode.equal(big?.status, "refused");
  assertNode.match(big!.reply, /2147483648/);
  assertNode.match(big!.reply, /whole number from 1 to 2147483647/);
  const text = await turn("set my daily pace to lots");
  assertNode.equal(text?.status, "refused");
  const zero = await turn("apply 0 a day");
  assertNode.equal(zero?.status, "refused");
  const none = await turn("no daily pace");
  assertNode.equal(none?.status, "none");
  assertNode.match(none!.reply, /no daily pace/i);
  assertNode.deepEqual(stored, ["7", "none"], "only what the column holds reached the store");
  assertNode.equal(await turn("what is my daily pace?"), null);
});

Deno.test("SERIAL-1430/b a store that cannot be reached: said, nothing claimed set", async () => {
  const r = await paceTurn({ message: "set my daily pace to 7", userId: "u1", admin: { rpc: async () => { throw new Error("socket closed"); } } });
  assertNode.equal(r?.status, "unreadable");
  assertNode.match(r!.reply, /couldn't save/i);
  assertNode.doesNotMatch(r!.reply, /is 7 a day/);
});
