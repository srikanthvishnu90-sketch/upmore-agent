// The card's yes (SERIAL-1440 (1); the owner, 2026-10-22 5:09 PM: "for submitting a yes, does handle a batch of
// submissions"): one texted yes to the prepared-applications card approves exactly the batch that card shows, and only
// then: as a direct reply while the card is the thread's last word, within 10 minutes of its showing, once (the card is
// single-use), each item by the payload hash the card carries (an item that changed since is refused by name). The yes
// approves; it never sends: the person's own worker claims and finishes, and no chat turn module names a claim or finish
// door. The cloud card (the bridge draft, C9) is unchanged: its yes only opens that card. Before this file's change
// (Option A, chosen 2026-10-22 under the owner's delegation) every yes was refused with "tap Approve".
// Synthetic only; no network, no database.
import { CARD_INTENT, type CardStore, cardTurn } from "../../supabase/functions/_shared/career_apply_cards.ts";
const ok = (v: unknown, why: string) => { if (!v) throw new Error(why); };
const YES_FORMS = ["yes", "Yes!", "yep", "yeah", "y", "approve", "approve all", "yes please", "yes send them", "send them", "send all"];
const EXCEPT_FORMS = ["yes but not 2", "yes except 1", "approve, skip 2"];
// Every database door that approves, queues, claims or finishes an application.
const SEND_DOORS = /career_apply_(card_answer_(as|own)|message_card_approve_own|batch_approve_own|enqueue|cloud_begin_agent_own|extension_begin(_agent)?_own|claim(_own|_at)?|cloud_claim(_at)?|finish|cloud_finish)\b/;
const NOW = Date.parse("2026-10-22T13:00:00Z");

function wo022Store(o: { shownAgoMs?: number; changed?: number[]; open?: boolean } = {}) {
  const approvals: number[][] = [];
  let open = o.open ?? true;
  const store: CardStore = {
    async pending() { return []; },
    async open() { throw new Error("not used"); },
    async latestOpen() { return open ? { id: "card-1", items: [{ n: 1, prepared_id: "p1", payload_hash: "a".repeat(64) }, { n: 2, prepared_id: "p2", payload_hash: "b".repeat(64) }], shown_at: new Date(NOW - (o.shownAgoMs ?? 60_000)).toISOString() } : null; },
    // career_apply_card_answer_as: approving a number enqueues that application by its shown hash; a changed one is refused; the card closes.
    async answer(_u, _c, approve) { approvals.push(approve); open = false; return [1, 2].map((n) => ({ n, company: `Synthetic ${n}`, result: (o.changed ?? []).includes(n) ? "changed" : approve.includes(n) ? "queued" : "declined" })); },
    async lastAssistantIntent() { return CARD_INTENT; },
  };
  return { store, approvals };
}

Deno.test("the card's yes: a direct yes within 10 minutes approves exactly the shown batch; 'yes but not 2' leaves 2 out; nothing is sent by the yes itself", async () => {
  for (const m of YES_FORMS) {
    const s = wo022Store();
    const r = await cardTurn({ message: m, userId: "u", threadId: "t", now: NOW, store: s.store });
    ok(r?.status === "answered" && JSON.stringify(s.approvals) === "[[1,2]]", `"${m}" approves the whole card: ${JSON.stringify({ r, approvals: s.approvals })}`);
    ok(/2 approved exactly as shown/.test(r!.reply) && /Nothing has gone to an employer yet/.test(r!.reply), `"${m}": the words say approved, not sent: ${r!.reply}`);
  }
  for (const m of EXCEPT_FORMS) {
    const s = wo022Store();
    const r = await cardTurn({ message: m, userId: "u", threadId: "t", now: NOW, store: s.store });
    const left = Number(m.match(/\d/)![0]);
    ok(r?.status === "answered" && s.approvals.length === 1 && !s.approvals[0].includes(left) && s.approvals[0].length === 1, `"${m}" leaves ${left} out: ${JSON.stringify(s.approvals)}`);
  }
});

Deno.test("the card's yes: refused outside the 10-minute window, after the card was answered, and for an item that changed since it was shown", async () => {
  const late = wo022Store({ shownAgoMs: 11 * 60_000 });
  const r = await cardTurn({ message: "yes", userId: "u", threadId: "t", now: NOW, store: late.store });
  ok(r?.status === "stale_card" && /more than 10 minutes ago/.test(r!.reply) && /show my applications/.test(r!.reply) && late.approvals.length === 0, `late yes: ${JSON.stringify(r)}`);
  const once = wo022Store();
  await cardTurn({ message: "yes", userId: "u", threadId: "t", now: NOW, store: once.store });
  const again = await cardTurn({ message: "yes", userId: "u", threadId: "t", now: NOW + 1000, store: once.store });
  ok(again === null && once.approvals.length === 1, `a second yes finds no open card: ${JSON.stringify({ again, approvals: once.approvals })}`);
  const changed = wo022Store({ changed: [2] });
  const c = await cardTurn({ message: "yes", userId: "u", threadId: "t", now: NOW, store: changed.store });
  ok(c?.status === "answered" && /2\. Synthetic 2: not sent: it changed after the card was shown/.test(c!.reply) && /1 approved exactly as shown/.test(c!.reply), `changed item refused by name: ${c?.reply}`);
  // A text no still declines (declining sends nothing): the decline reaches the door with no approvals.
  const s = wo022Store();
  await cardTurn({ message: "no", userId: "u", threadId: "t", now: NOW, store: s.store });
  ok(JSON.stringify(s.approvals) === "[[]]", `a no declines with no approvals: ${JSON.stringify(s.approvals)}`);
});

Deno.test("the cloud card's yes only opens the card (C9, bridge draft), calling no approve, queue, claim or finish door", async () => {
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

Deno.test("no chat turn module names a claim or finish door, and the cloud card turn names no send door", async () => {
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
