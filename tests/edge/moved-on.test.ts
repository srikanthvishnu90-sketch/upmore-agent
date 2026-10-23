// A message answered before the flow router (an answer from code, a settings command) drops a live card and says so
// (live gauntlet L3-01, go-live f2ffce9: "send sam $40", then "what's my balance" was answered from code and the card stayed
// live, so the next "yes" staged it). dropLiveCards in _shared/flow_router.ts, called by agent-chat/handler.ts movedOn().
// Check: deno test -A --no-check tests/edge/moved-on.test.ts
import { routeFlows, dropLiveCards, mapFlowData, type FlowDb } from "../../supabase/functions/_shared/flow_router.ts";
const handlerSrc = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler.ts", import.meta.url));
function assert(v: unknown, m = "assertion failed") { if (!v) throw new Error(m); }
const T0 = Date.UTC(2026, 9, 12, 19, 1, 0);
function world(): FlowDb & { state(): any } {
  let state: any = null;
  const recipients = [{ id: "r-venmo", handle: "@sam-upmore-test", display_name: "Sam", channel: "in-app", source: "confirmed", rail: "venmo", last_used_at: new Date(T0).toISOString() }];
  return {
    state: () => state,
    async loadState() { return state ? JSON.parse(JSON.stringify(state)) : null; },
    async saveState(s: any) { state = JSON.parse(JSON.stringify(s)); },
    async loadData() { return { ok: true, ...mapFlowData([], [], [], recipients) }; },
    async saveRecipients() {},
  } as any;
}
const route = (db: FlowDb, t: string) => routeFlows(t, { db, extract: null, now: () => T0 } as any);

Deno.test("a live send card is dropped by an answer from code, said once, and a later yes stages nothing", async () => {
  const db = world();
  const card: any = await route(db, "send sam $40");
  assert(card && card.route.outcome === "confirm", `the card is up: ${card && card.reply}`);
  const note = await dropLiveCards(db, () => T0);
  assert(note === "(I dropped the $40.00 to Sam since you moved on; nothing was sent. Say it again when you want it.)", String(note));
  const yes: any = await route(db, "yes");
  assert(!yes || yes.fallthrough || !/Staged\b|Sent\.|Landed/.test(yes.reply), `a late yes stages nothing: ${yes && yes.reply}`);
});

Deno.test("with no live card nothing is dropped, said or written", async () => {
  const db = world();
  assert(await dropLiveCards(db, () => T0) === null);
  assert(db.state() === null, "no state written");
});

Deno.test("the handler drops a live card on an answer from code and on a settings reply", () => {
  const src = String(handlerSrc);
  assert(/const movedOn = async \(\) => \{ try \{ return await dropLiveCards\(/.test(src), "movedOn is defined");
  const direct = src.indexOf("if (direct) {"), settings = src.indexOf("const s = await settingsMessage(");
  assert(direct > 0 && src.slice(direct, direct + 400).includes("await movedOn()"), "the direct answer drops the card");
  assert(settings > 0 && src.slice(settings, settings + 400).includes("await movedOn()"), "the settings reply drops the card");
});
