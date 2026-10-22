// Option A (chosen 2026-10-22 under the owner's delegation): a text yes never approves or sends; only the person's tap
// on the exact payload does. The card is the only cloud authorization route (C9) and a chat "yes" only opens it. While
// the cloud card is the thread's last word, a yes reads that card back as the person and points to its Approve button;
// the binding is minted only by the tap (cloud_tap). Synthetic only.
import { CLOUD_CARD_INTENT, cloudCardYesTurn, parseCardYes, TAP_TO_SEND } from "../../supabase/functions/_shared/career_cloud_card_chat.ts";
const ok = (v: unknown, why: string) => { if (!v) throw new Error(why); };
const CARD = "11111111-2222-4333-8444-555555555555", THREAD = "99999999-8888-4777-8666-555555555555";
const cardMessage = (over: Record<string, unknown> = {}) => ({ meta: { career: true, intent: CLOUD_CARD_INTENT, career_approval_card_id: CARD, ...over } });
function fakeStore(o: { last?: unknown; card?: Record<string, unknown>; readThrows?: boolean } = {}) {
  const calls: string[] = [];
  const store = {
    async lastAssistant(t: string) { calls.push(`last:${t}`); return (o.last === undefined ? cardMessage() : o.last) as any; },
    async read(id: string) { calls.push(`read:${id}`); if (o.readThrows) throw new Error("cloud card disabled"); return o.card ?? { id: CARD, state: "open" }; },
  };
  return { store, calls };
}
const turn = (message: string, s: ReturnType<typeof fakeStore>, ownSession = true) => cloudCardYesTurn({ message, threadId: THREAD, ownSession, store: s.store });

Deno.test("A: a yes while the cloud card is the last word opens exactly that card and sends nothing", async () => {
  const s = fakeStore();
  const r = await turn("Yes", s);
  ok(r?.status === "open_card" && r.card_id === CARD && r.reply === TAP_TO_SEND, JSON.stringify(r));
  ok(JSON.stringify(s.calls) === JSON.stringify([`last:${THREAD}`, `read:${CARD}`]), JSON.stringify(s.calls));
});

Deno.test("A: only an explicit yes; anything else is left to the rest of the chat", async () => {
  for (const m of ["ok", "sure", "y", "yeah", "yes please apply to more jobs", "approve all of them", "no"]) {
    const s = fakeStore();
    ok((await turn(m, s)) === null && s.calls.length === 0, `"${m}" was taken as a yes: ${JSON.stringify(s.calls)}`);
  }
  for (const m of ["yes", "Yes.", "approve", "approve it", "yes, approve", "yes send it"]) ok(parseCardYes(m), `"${m}" is a yes`);
});

Deno.test("A: nothing happens unless the cloud card itself is the thread's last word", async () => {
  for (const last of [null, cardMessage({ intent: "career_apply_card" }), cardMessage({ intent: "career_cloud_optin" }), cardMessage({ career_approval_card_id: "x" }), { meta: { intent: CLOUD_CARD_INTENT } }]) {
    const s = fakeStore({ last });
    ok((await turn("yes", s)) === null && !s.calls.some((c) => c.startsWith("read")), JSON.stringify({ last, calls: s.calls }));
  }
});

Deno.test("A: a texting channel's service-role turn is left alone (F-037's work), and reads nothing", async () => {
  const s = fakeStore();
  ok((await turn("yes", s, false)) === null && s.calls.length === 0, `a channel turn touched the store: ${JSON.stringify(s.calls)}`);
});

Deno.test("A: an answered, expired, foreign or unreadable card says so and still sends nothing", async () => {
  for (const [card, status] of [[{ id: CARD, state: "approved" }, "closed"], [{ id: CARD, state: "expired" }, "closed"], [{ id: "other", state: "open" }, "unreadable"]] as const) {
    const r = await turn("yes", fakeStore({ card: card as any }));
    ok(r?.status === status && /nothing (more )?was sent/i.test(r.reply), JSON.stringify(r));
  }
  const r = await turn("yes", fakeStore({ readThrows: true }));
  ok(r?.status === "unreadable" && /Nothing was sent/.test(r.reply), JSON.stringify(r));
});

Deno.test("A: the chat handler opens the card on the person's own session only, keeps it the last word, and runs before the brain", async () => {
  const src = await Deno.readTextFile(new URL("../../supabase/functions/agent-chat/handler-career.ts", import.meta.url));
  ok(/import \{[^}]*cloudCardYesTurn[^}]*personCloudCardStore[^}]*\} from "\.\.\/_shared\/career_cloud_card_chat\.ts"/.test(src), "the handler imports the card-yes turn");
  ok(/cloudCardYesTurn\(\{[^)]*ownSession: !isBridgeCall[^)]*store: personCloudCardStore\(supabase\)[^)]*\}\)/.test(src), "ownSession = !isBridgeCall and the person's own client, never admin");
  ok(/intent: CLOUD_CARD_INTENT[^\n]*handler: "cloud_card"/.test(src) && /agentMeta = \{ career_approval_card_id: cardYes\.card_id, open_card: cardYes\.card_id \}/.test(src),
    "the reply keeps the card as the last word and names it to open");
  const brain = src.indexOf('chooseBrain(Deno.env) === "agent"'), branch = src.indexOf("} else if (cardYes)");
  ok(brain > 0 && branch > 0 && branch < brain, "the card-yes answer is routed before the brain");
});
