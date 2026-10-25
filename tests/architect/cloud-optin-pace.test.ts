// SERIAL-1400 (1): the cloud's status reply and its "on" reply name a daily number only when the person set one. With no
// pace (null, undefined, 0, text) they say there is no daily limit, as the terms do; a product 25 never comes back.
import assertNode from "node:assert/strict";
import { cloudTurn, ownPace, paceText, termsText } from "../../supabase/functions/_shared/career_cloud_optin.ts";

const T0 = Date.parse("2026-10-25T12:00:00Z");
function storeWith(daily: unknown) {
  let last = { intent: null as string | null, content: null as string | null, at: null as number | null };
  const s = {
    dailyLimit: async () => ownPace(daily),
    get: async () => ({ enabled: true, daily: daily as any }),
    set: async (_u: string, on: boolean, _t: string | null) => ({ enabled: on, daily: daily as any }),
    lastAssistant: async () => last,
    outboxSince: async () => 0,
  };
  return { s, remember: (intent: string, content: string, at: number) => { last = { intent, content, at }; } };
}
const A_DAY = /\b\d+ a day\b/;

Deno.test("SERIAL-1400/1 no pace set: status, terms and the on-reply say no daily limit and carry no number", async () => {
  for (const [label, daily] of [["undefined", undefined], ["null", null], ["0", 0], ["text", "lots"], ["negative", -3]] as const) {
    const { s, remember } = storeWith(daily);
    const status = await cloudTurn({ message: "is the cloud on?", userId: "A", threadId: "T", now: T0, store: s });
    assertNode.ok(status && status.status === "on", label);
    assertNode.match(status!.reply, /no daily limit unless you set your own pace/, `${label}: status`);
    assertNode.doesNotMatch(status!.reply, A_DAY, `${label}: status names no number`);
    const shown = await cloudTurn({ message: "apply for me in the cloud", userId: "A", threadId: "T", now: T0, store: s });
    assertNode.equal(shown!.reply, termsText(null), `${label}: the terms are the no-pace terms`);
    assertNode.doesNotMatch(shown!.reply, A_DAY, `${label}: terms name no number`);
    remember(shown!.intent, shown!.reply, T0);
    const on = await cloudTurn({ message: "yes", userId: "A", threadId: "T", now: T0 + 1000, store: s });
    assertNode.ok(on && on.status === "on", `${label}: on`);
    assertNode.match(on!.reply, /no daily limit unless you set your own pace/, `${label}: on-reply`);
    assertNode.doesNotMatch(on!.reply, A_DAY, `${label}: on-reply names no number`);
    assertNode.doesNotMatch(status!.reply + shown!.reply + on!.reply, /\b25\b/, `${label}: no 25 anywhere`);
  }
});

Deno.test("SERIAL-1400/1 a pace the person set is named as theirs, with no maximum", async () => {
  for (const [daily, n] of [[7, 7], ["7", 7], [100, 100], [400, 400]] as const) {
    const { s, remember } = storeWith(daily);
    const status = await cloudTurn({ message: "is the cloud on?", userId: "A", threadId: "T", now: T0, store: s });
    assertNode.match(status!.reply, new RegExp(`up to ${n} a day, the pace you set yourself`), `status ${daily}`);
    const shown = await cloudTurn({ message: "apply for me in the cloud", userId: "A", threadId: "T", now: T0, store: s });
    assertNode.match(shown!.reply, new RegExp(`up to ${n} a day, the pace you set yourself`), `terms ${daily}`);
    remember(shown!.intent, shown!.reply, T0);
    const on = await cloudTurn({ message: "yes", userId: "A", threadId: "T", now: T0 + 1000, store: s });
    assertNode.match(on!.reply, new RegExp(`up to ${n} a day, the pace you set yourself`), `on ${daily}`);
  }
  assertNode.equal(ownPace("lots"), null); assertNode.equal(ownPace(0), null); assertNode.equal(ownPace(""), null); assertNode.equal(ownPace(7.9), null); // SERIAL-1430: a fraction is unreadable, never floored
  assertNode.equal(paceText(null), "with no daily limit unless you set your own pace");
});
