// The IOU log in chat (megadoc C05, D08, D09, D10; packages/domain/105-iou-log.js) through the real settings path:
// saved in the person's own settings row (its own column, 20261012050000_ious.sql) beside their watches and rules, listed
// and settled from it, and never answered by a direct answer or a money flow first. Nothing moves. Permission-free.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { parseCommand, settingsMessage } from "../../supabase/functions/_shared/proactive.ts";
import { ANSWERS, ORDER } from "./lib/direct_chain.ts";
import { connectReply } from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";
const MIGRATION = Deno.readTextFileSync(new URL("../../supabase/migrations/20261012050000_ious.sql", import.meta.url));

const NOW = Date.parse("2026-10-12T15:00:00Z");
const db = (settings: any) => {
  const saved: any[] = [];
  return { saved, get: () => settings, read: async () => ({ ok: true, settings }), save: async (c: any) => { saved.push(c); settings = Object.assign({}, settings, c); return true; } };
};

Deno.test("'log that I owe Mom 200' is saved in the ious column only, restated, nothing moved (D08)", async () => {
  const d = db({ time_zone: "America/New_York", watches: [{ id: "b1", kind: "category_budget", category: "groceries", amount_cents: 40000 }], ious: [] });
  const r = await settingsMessage("log that I owe mom 200", d as any, NOW);
  assertEquals(r, { reply: "Logged: you owe Mom $200.00. It's a note only: nothing was paid, requested or sent. Say \"pay mom 200\" when you want to send it.", changed: true });
  assertEquals(Object.keys(d.saved[0]), ["ious"], "only the IOU column is written");
  assertEquals(d.get().watches.length, 1, "the budget is untouched");
});

Deno.test("'Jake owes me 20', then 'what do I owe people' and 'who still owes me' (C05, D09)", async () => {
  const d = db({ ious: [] });
  for (const m of ["log that I owe mom 200", "jake owes me 20"]) await settingsMessage(m, d as any, NOW);
  assertEquals((await settingsMessage("what do I owe people", d as any, NOW))!.reply, "You owe: Mom $200.00. $200.00 in all.\nFrom your IOU log, what you've told me; I don't check it against your accounts.");
  const who = await settingsMessage("who still owes me", d as any, NOW);
  assertEquals(who!.changed, false);
  assertMatch(who!.reply, /^Owed to you: Jake \$20\.00\./);
});

Deno.test("'mark Mom's 200 as paid' settles it in the saved row (D10)", async () => {
  const d = db({ ious: [] });
  await settingsMessage("log that I owe mom 200", d as any, NOW);
  const r = await settingsMessage("mark mom's 200 as paid", d as any, NOW);
  assertEquals(r!.reply, "Marked paid: the $200.00 you owed Mom. It's a note only: nothing was paid, requested or sent.");
  assertEquals(d.get().ious[0].status, "settled");
});

Deno.test("no direct answer or money answer takes an IOU first; 'who owes me money' stays the money-owed answer", async () => {
  for (const m of ["log that I owe mom 200", "jake owes me 20", "what do I owe people", "mark mom's 200 as paid", "i owe sam 15 for lunch", "jake paid me back", "how much does jake owe me", "show my ious", "i lent maya 40", "forget the iou with jake", "who still owes me"]) {
    assertEquals(connectReply(m), null, m);
    for (const k of ORDER) assertEquals(await ANSWERS[k](m), null, `${k} takes "${m}"`);
    assert(parseCommand(m, null, NOW), `the settings path reads "${m}"`);
  }
  let got: string | null = null;
  for (const k of ORDER) if (await ANSWERS[k]("who owes me money")) { got = k; break; }
  assertEquals(got, "moneyOwedReply");
});

Deno.test("the migration holds the shape the code writes: names, directions, whole cents, statuses, no long digits", () => {
  for (const clause of ["jsonb_array_length(ious) <= 40", "ious::text !~ '\\d{9,}'", '@.direction == "i_owe" || @.direction == "owes_me"', '@.status == "open" || @.status == "settled"', "@.amount_cents > 10000000"]) assert(MIGRATION.includes(clause), clause);
});
