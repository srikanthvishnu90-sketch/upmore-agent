// F09 round 4: the posting screen's yes/no question gets Yes / No inline buttons on Telegram (callback data exactly "yes" / "no",
// read as that text, as a reply to the buttons' own message), the plain words "Reply yes or no." elsewhere. Fake deps, no network.
import assert from "node:assert/strict";
import { runInbound, SCREEN_BUTTONS } from "../../supabase/functions/_shared/channel_inbound.ts";
import { chatThroughAgent } from "../../supabase/functions/_shared/channel_runtime.ts";
import { telegramAdapter } from "../../supabase/functions/_shared/telegram.ts";
import { screenMeta } from "../../supabase/functions/_shared/career_apply_screen_answer.ts";

const NOW = Date.parse("2026-10-28T18:00:00Z");
function deps(chatOut: Record<string, unknown>) {
  const sent: any[] = [], chats: any[] = [], toasts: string[] = [], taps: string[] = [];
  const d: any = {
    env: { get: () => undefined }, now: () => NOW, render: (t: string) => [t],
    store: { claimMessage: async () => true, person: async (c: string) => ({ userId: "u1", threadId: "t1", contact: c }), refusedBefore: async () => false, createPerson: async () => { throw new Error("no"); },
      setThread: async () => {}, setOptOut: async () => {}, enqueueReply: async () => true, confirmLink: async () => { throw new Error("a button tap must never confirm a link"); } },
    reply: async (_c: string, b: string[], opts?: any) => { sent.push({ b, opts }); return { ok: true }; },
    chat: async (a: any) => { chats.push(a); return { status: 200, reply: "Will you need visa sponsorship?", threadId: "t1", ...chatOut }; }, deliver: async () => {},
    cardTap: async (a: any) => { taps.push(a.data); return { toast: "no", reply: "Nothing was approved.", status: "refused" }; },
    answerCallback: async (_id: string, t: string) => { toasts.push(t); return true; },
  };
  return { d, sent, chats, toasts, taps };
}
const text = (channel: string, t: string) => ({ provider: channel, channel, messageId: String(Math.random()), contact: channel === "telegram" ? "tg:1" : "wa:1", address: "1", kind: "text", text: t });
const tap = (data: string) => ({ provider: "telegram", channel: "telegram", messageId: String(Math.random()), contact: "tg:1", address: "1", kind: "callback", text: "", callback: { id: "cb1", data, messageId: "77" } });

Deno.test("the buttons are exactly Yes / No with data yes / no", () => {
  assert.deepEqual(SCREEN_BUTTONS, [[{ text: "Yes", data: "yes" }, { text: "No", data: "no" }]]);
  const calls: any[] = [];
  const a = telegramAdapter({ token: "T", fetch: (async (_u: string, i: RequestInit) => { calls.push(JSON.parse(String(i.body))); return Response.json({ ok: true, result: { message_id: 1 } }); }) as any, sleep: async () => {} });
  return a.send("9", ["Yes or no?"], { buttons: SCREEN_BUTTONS }).then(() => {
    assert.deepEqual(calls[0].reply_markup.inline_keyboard, [[{ text: "Yes", callback_data: "yes" }, { text: "No", callback_data: "no" }]]);
  });
});

Deno.test("Telegram: a turn that asks the yes/no question sends it with the Yes / No buttons", async () => {
  const t = deps({ screenButtons: true });
  await runInbound(text("telegram", "apply to all") as any, t.d);
  assert.deepEqual(t.sent.at(-1), { b: ["Yes or no?"], opts: { buttons: SCREEN_BUTTONS } });
});

Deno.test("other channels: the plain words 'Reply yes or no.' (once, not again when the reply already says it)", async () => {
  const wa = deps({ screenButtons: true });
  await runInbound(text("whatsapp", "apply to all") as any, wa.d);
  assert.deepEqual(wa.sent.at(-1), { b: ["Reply yes or no."], opts: undefined });
  const said = deps({ screenButtons: true, reply: "Reply yes or no. I need a real answer for that." });
  await runInbound(text("whatsapp", "maybe") as any, said.d);
  assert.equal(said.sent.length, 0);
  const none = deps({});
  await runInbound(text("telegram", "hello") as any, none.d);
  assert.equal(none.sent.length, 0, "no yes/no question open: no buttons");
});

Deno.test("a tap on Yes / No is the person's one word, as a reply to the buttons' message; any other callback data is not", async () => {
  for (const w of ["yes", "no"]) {
    const t = deps({});
    await runInbound(tap(w) as any, t.d);
    assert.equal(t.chats.length, 1);
    assert.equal(t.chats[0].message, w);
    assert.equal(t.chats[0].replyToMessageId, "77", "a stale button is never the reply a card's yes needs");
    assert.equal(t.toasts.length, 1);
    assert.deepEqual(t.taps, []);
  }
  for (const data of ["YES", "yes ", "yesno", "maybe", "tca:x:y", "jca:1"]) {
    const t = deps({});
    await runInbound(tap(data) as any, t.d);
    assert.equal(t.chats.length, 0, `callback data ${data} is not a screen answer`);
  }
});

Deno.test("meta.screen_buttons reaches the channel only as exactly ['Yes','No']; the screen's single yes/no ask carries it", async () => {
  const run = async (meta: unknown) => {
    const f = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({ reply: "q", thread_id: "t", meta })) as any;
    try { return await chatThroughAgent("https://x.test", "k")({ userId: "u", threadId: null, message: "m", turnKey: "k" }); } finally { globalThis.fetch = f; }
  };
  assert.equal((await run({ screen_buttons: ["Yes", "No"] })).screenButtons, true);
  assert.equal((await run({ screen_buttons: ["Yes", "No", "Maybe"] })).screenButtons, undefined);
  assert.equal((await run({ screen_buttons: ["Sure"] })).screenButtons, undefined);
  assert.equal((await run({})).screenButtons, undefined);
  const ask = (facts: string[]) => screenMeta({ asks: facts.map((fact) => ({ fact, question: "?" })), held: [] } as any);
  assert.deepEqual(ask(["sponsorship"])!.screen_buttons, ["Yes", "No"]);
  assert.equal(ask(["location"])!.screen_buttons, undefined);
  assert.equal(ask(["sponsorship", "citizenship"])!.screen_buttons, undefined, "a bare yes/no answers none of several");
});
