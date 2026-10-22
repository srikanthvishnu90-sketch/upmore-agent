// Option A (chosen 2026-10-22 under the owner's delegation): a text yes never approves or sends; only the person's tap
// on the exact payload does. A chat "yes" may only open a card or bind the cloud opt-in. It never approves or fires a
// send: no approve, no queue, no claim, no finish. Every real send needs the person's tap on the exact hash-bound
// payload. This drives the real chat turns with recording stores and every way a yes can be typed. On the base
// (348c2d4a) the WO-022 card's text yes approves and queues (career_apply_card_answer_as -> career_apply_enqueue, which
// the person's own-computer worker then claims and finishes), and the cloud card's yes turn does not exist: both fail.
// Synthetic only; no network, no database.
import { CARD_INTENT, type CardStore, cardTurn } from "../../supabase/functions/_shared/career_apply_cards.ts";
const ok = (v: unknown, why: string) => { if (!v) throw new Error(why); };
const YES_FORMS = ["yes", "Yes!", "yep", "yeah", "y", "approve", "approve all", "yes please", "yes send them", "send them", "send all",
  "yes but not 2", "yes except 1", "approve, skip 2"];
// Every database door that approves, queues, claims or finishes an application.
const SEND_DOORS = /career_apply_(card_answer_(as|own)|message_card_approve_own|batch_approve_own|enqueue|cloud_begin_agent_own|extension_begin(_agent)?_own|claim(_own|_at)?|cloud_claim(_at)?|finish|cloud_finish)\b/;
const NOW = Date.parse("2026-10-22T13:00:00Z");

function wo022Store() {
  const approvals: number[][] = [];
  const store: CardStore = {
    async pending() { return []; },
    async open() { throw new Error("not used"); },
    async latestOpen() { return { id: "card-1", items: [{ n: 1, prepared_id: "p1", payload_hash: "a".repeat(64) }, { n: 2, prepared_id: "p2", payload_hash: "b".repeat(64) }], shown_at: new Date(NOW - 60_000).toISOString() }; },
    // career_apply_card_answer_as: approving any number enqueues that application (20261020050000).
    async answer(_u, _c, approve) { approvals.push(approve); return approve.map((n) => ({ n, company: `Synthetic ${n}`, result: "queued" })); },
    async lastAssistantIntent() { return CARD_INTENT; },
  };
  return { store, approvals };
}

Deno.test("text yes never sends: the prepared-applications card (WO-022) approves and queues nothing on any yes", async () => {
  for (const m of YES_FORMS) {
    const s = wo022Store();
    const r = await cardTurn({ message: m, userId: "u", threadId: "t", now: NOW, store: s.store });
    ok(r !== null, `"${m}" is still answered (told how to send), not ignored`);
    ok(s.approvals.every((a) => a.length === 0), `"${m}" approved ${JSON.stringify(s.approvals)}: a text yes queued an application`);
    ok(r!.status === "needs_tap" && /doesn't send anything/.test(r!.reply) && /tap Approve/.test(r!.reply) && !/\b(was|were|been|is|are) (sent|queued|approved)\b/i.test(r!.reply),
      `"${m}" must say nothing was sent and how to send: ${JSON.stringify(r)}`);
  }
  // A text no still declines (declining sends nothing): the decline reaches the door with no approvals.
  const s = wo022Store();
  await cardTurn({ message: "no", userId: "u", threadId: "t", now: NOW, store: s.store });
  ok(JSON.stringify(s.approvals) === "[[]]", `a no declines with no approvals: ${JSON.stringify(s.approvals)}`);
});

Deno.test("text yes never sends: the cloud card's yes only opens the card, calling no approve, queue, claim or finish door", async () => {
  let mod: any;
  try { mod = await import("../../supabase/functions/_shared/career_cloud_card_chat.ts"); } catch (e) { throw new Error(`the cloud card's yes turn is absent: ${e}`); }
  const CARD = "11111111-2222-4333-8444-555555555555";
  for (const m of [...YES_FORMS, "yes, approve", "approve it", "yes send it"]) {
    const rpcs: string[] = [], tables: string[] = [];
    const q: any = { select() { return q; }, eq() { return q; }, order() { return q; },
      limit() { return Promise.resolve({ data: [{ meta: { intent: "career_message_approval", career_approval_card_id: CARD } }], error: null }); } };
    const person = {
      from(t: string) { tables.push(t); return q; },
      rpc(name: string) { rpcs.push(name); return Promise.resolve({ data: { id: CARD, hash: "a".repeat(64), state: "open" }, error: null }); },
    };
    const r = await mod.cloudCardYesTurn({ message: m, threadId: "t", ownSession: true, store: mod.personCloudCardStore(person) });
    ok(!rpcs.some((n) => SEND_DOORS.test(n)), `"${m}" reached a send door: ${JSON.stringify(rpcs)}`);
    ok(rpcs.every((n) => n === "career_apply_message_card_read_own") && tables.every((t) => t === "agent_messages"), `"${m}": ${JSON.stringify({ rpcs, tables })}`);
    if (r) ok(r.status === "open_card" && r.card_id === CARD && /tap Approve/i.test(r.reply), `"${m}": ${JSON.stringify(r)}`);
  }
  ok(!("approve" in mod.personCloudCardStore({ from() {}, rpc() {} })), "the person's chat store has no approve method at all");
});

Deno.test("text yes never sends: no chat turn module names a claim or finish door, and the cloud card turn names no send door", async () => {
  const read = (p: string) => Deno.readTextFile(new URL(`../../supabase/functions/${p}`, import.meta.url));
  for (const p of ["agent-chat/handler-career.ts", "_shared/career_apply_cards.ts", "_shared/career_cloud_optin.ts", "_shared/career_apply_confirm.ts", "_shared/career_apply_questions.ts"]) {
    const src = await read(p);
    ok(!/career_apply_(cloud_)?(claim(_own|_at)?|finish)\b/.test(src), `${p} names a claim or finish door`);
  }
  let src = "";
  try { src = await read("_shared/career_cloud_card_chat.ts"); } catch { throw new Error("the cloud card's yes turn is absent"); }
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  ok(!SEND_DOORS.test(code), "the cloud card's chat turn names a send door in code");
});
