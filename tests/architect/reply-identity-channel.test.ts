// SERIAL-1462: the reply-to id travels from the channel to the turn, and the card a text carried is found again from the
// provider's id of that text. Synthetic only; no network, no database.
import assertNode from "node:assert/strict";
import { chatThroughAgent } from "../../supabase/functions/_shared/channel_runtime.ts";
import { supabaseCardStore } from "../../supabase/functions/_shared/career_apply_cards.ts";
import { supabaseInboundStore } from "../../supabase/functions/trainee-inbound/store.ts";

Deno.test("SERIAL-1462 chatThroughAgent sends reply_to_message_id only when the channel gave one, and returns the card the reply showed", async () => {
  const bodies: any[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_u: any, init: any) => { bodies.push(JSON.parse(init.body)); return new Response(JSON.stringify({ reply: "card text", thread_id: "t-1", meta: { intent: "career_apply_card", card_id: "11111111-2222-4333-8444-555555555555" } }), { status: 200 }); }) as any;
  try {
    const chat = chatThroughAgent("https://x.test", "k");
    const a = await chat({ userId: "u", threadId: null, message: "yes", turnKey: "tk-1", replyToMessageId: "40" });
    assertNode.equal(bodies[0].reply_to_message_id, "40");
    assertNode.equal(a.cardId, "11111111-2222-4333-8444-555555555555", "the card the reply showed comes back for the outbox row");
    await chat({ userId: "u", threadId: "t-1", message: "show my applications", turnKey: "tk-2" });
    assertNode.ok(!("reply_to_message_id" in bodies[1]), "none given: none sent");
  } finally { globalThis.fetch = realFetch; }
});

Deno.test("SERIAL-1462 cardOfMessage: the app's message id in this thread, or the provider id of the delivered text that carried the card; anything else is no card", async () => {
  const outbox = [
    { key: "reply:lm-in-7", card_id: "11111111-2222-4333-8444-555555555555", provider_id: "LM-OUT-1", provider_ids: ["LM-OUT-1", "LM-OUT-2"], status: "delivered", user_id: "u" },
    { key: "card:22222222-2222-4333-8444-555555555555", card_id: null, provider_id: "LM-OUT-9", provider_ids: ["LM-OUT-9"], status: "delivered", user_id: "u" },
    { key: "reply:lm-in-8", card_id: null, provider_id: "LM-OUT-5", provider_ids: ["LM-OUT-5"], status: "delivered", user_id: "u" },
  ];
  const messages = [{ id: 10, thread_id: "t", role: "assistant", meta: { intent: "career_apply_card", card_id: "33333333-2222-4333-8444-555555555555" } }, { id: 11, thread_id: "t", role: "assistant", meta: { intent: "career_apply_status" } }];
  const admin: any = {
    from(table: string) {
      const filters: ((r: any) => boolean)[] = [];
      const q: any = {
        select() { return q; },
        eq(col: string, v: any) { filters.push((r) => String(r[col]) === String(v)); return q; },
        or(expr: string) {
          const m = expr.match(/^provider_id\.eq\."?([^",}]+)"?,provider_ids\.cs\.\{"?([^"}]+)"?\}$/);
          filters.push((r) => r.provider_id === m![1] || (r.provider_ids ?? []).includes(m![2]));
          return q;
        },
        limit() { const rows = (table === "agent_messages" ? messages : outbox).filter((r) => filters.every((f) => f(r))); return Promise.resolve({ data: rows, error: null }); },
      };
      return q;
    },
    rpc() { throw new Error("not used"); },
  };
  const store = supabaseCardStore(admin);
  assertNode.equal(await store.cardOfMessage!("t", 10, "u"), "33333333-2222-4333-8444-555555555555", "the app's card message");
  assertNode.equal(await store.cardOfMessage!("t", 11, "u"), null, "the app's other message");
  assertNode.equal(await store.cardOfMessage!("t", "LM-OUT-2", "u"), "11111111-2222-4333-8444-555555555555", "a reply text that carried the card, by any of its provider ids");
  assertNode.equal(await store.cardOfMessage!("t", "LM-OUT-9", "u"), "22222222-2222-4333-8444-555555555555", "a pushed card's row, by its key");
  assertNode.equal(await store.cardOfMessage!("t", "LM-OUT-5", "u"), null, "a delivered text that carried no card");
  assertNode.equal(await store.cardOfMessage!("t", "LM-UNKNOWN", "u"), null, "an id the outbox never sent");
  assertNode.equal(await store.cardOfMessage!("t", "LM-OUT-2", "someone-else"), null, "another person's reply id finds nothing of theirs");
});

Deno.test("SERIAL-1462 the inbound store records the card a reply showed on its outbox row", async () => {
  const inserts: any[] = [];
  const admin: any = { from(table: string) { return { insert: async (row: any) => { inserts.push({ table, row }); return { data: null, error: null }; } }; } };
  const store = supabaseInboundStore(admin);
  await store.enqueueReply("u", "reply:lm-in-7", "the card text", Date.parse("2026-10-25T12:00:00Z"), "imessage", undefined, "11111111-2222-4333-8444-555555555555");
  await store.enqueueReply("u", "reply:lm-in-8", "a plain answer", Date.parse("2026-10-25T12:01:00Z"), "imessage");
  assertNode.equal(inserts[0].row.card_id, "11111111-2222-4333-8444-555555555555");
  assertNode.ok(!("card_id" in inserts[1].row), "no card: no column written");
});
