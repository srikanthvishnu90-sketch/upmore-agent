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
    async lastShownCard() { return open ? "card-1" : null; },
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

// SERIAL-1442: every case outside "a direct yes to the batch card, within 10 minutes, once" approves nothing.
function railsStore(o: { intent?: string | null; card?: boolean; shownAgoMs?: number; shownCard?: string | null } = {}) {
  const approvals: number[][] = [];
  let open = o.card ?? true;
  const store: CardStore = {
    async pending() { return []; },
    async open() { throw new Error("not used"); },
    async latestOpen() { return open ? { id: "card-1", items: [{ n: 1, prepared_id: "p1", payload_hash: "a".repeat(64) }, { n: 2, prepared_id: "p2", payload_hash: "b".repeat(64) }], shown_at: new Date(NOW - (o.shownAgoMs ?? 60_000)).toISOString() } : null; },
    async answer(_u, _c, approve) { approvals.push(approve); open = false; return [1, 2].map((n) => ({ n, company: `Synthetic ${n}`, result: approve.includes(n) ? "queued" : "declined" })); },
    async lastAssistantIntent() { return o.intent === undefined ? CARD_INTENT : o.intent; },
    async lastShownCard() { return o.shownCard === undefined ? (open ? "card-1" : null) : o.shownCard; },
  };
  return { store, approvals, closed: () => !open };
}
const ALL_YES = [...YES_FORMS, ...EXCEPT_FORMS, "yes, approve", "approve it"];

Deno.test("SERIAL-1442 outside the batch card a text yes never approves: no card, another thread's last word, a question asked after the card, another person", async () => {
  for (const m of ALL_YES) {
    const none = railsStore({ card: false });
    ok((await cardTurn({ message: m, userId: "u", threadId: "t", now: NOW, store: none.store })) === null && none.approvals.length === 0, `"${m}" with no card open: ${JSON.stringify(none.approvals)}`);
    const other = railsStore({ intent: "agent" });
    ok((await cardTurn({ message: m, userId: "u", threadId: "t2", now: NOW, store: other.store })) === null && other.approvals.length === 0, `"${m}" in a thread whose last word is not the card`);
    const asked = railsStore({ intent: "career_apply_questions" });
    ok((await cardTurn({ message: m, userId: "u", threadId: "t", now: NOW, store: asked.store })) === null && asked.approvals.length === 0, `"${m}" after a question was asked: could answer that question, so not the card's`);
    const person = railsStore({ card: false, intent: CARD_INTENT });
    ok((await cardTurn({ message: m, userId: "someone-else", threadId: "t", now: NOW, store: person.store })) === null && person.approvals.length === 0, `"${m}" from a person with no card of their own`);
  }
});

Deno.test("SERIAL-1442 once: after 'yes', after 'yes but not 2' and after 'no' the card is closed and a further yes approves nothing; a replay of the same yes does nothing", async () => {
  for (const first of ["yes", "yes but not 2", "no"]) {
    const s = railsStore();
    const r1 = await cardTurn({ message: first, userId: "u", threadId: "t", now: NOW, store: s.store });
    ok(r1?.status === "answered" && s.closed(), `"${first}" answers the card once: ${JSON.stringify(r1)}`);
    for (const again of ["yes", first, "approve all"]) {
      const r2 = await cardTurn({ message: again, userId: "u", threadId: "t", now: NOW + 5_000, store: s.store });
      ok(r2 === null && s.approvals.length === 1, `after "${first}", "${again}" approves nothing more: ${JSON.stringify(s.approvals)}`);
    }
  }
});

Deno.test("SERIAL-1442 exact payloads: whatever changed since the card was shown is refused by name and never queued (payload, the person's details, the employer screens, the pace)", async () => {
  const results = [
    { n: 1, company: "Changed Co", result: "changed" }, { n: 2, company: "Stale Co", result: "stale" }, { n: 3, company: "Cooldown Co", result: "company_cooldown" },
    { n: 4, company: "Dup Co", result: "duplicate" }, { n: 5, company: "Cap Co", result: "daily_cap" }, { n: 6, company: "Refused Co", result: "refused" }, { n: 7, company: "Fine Co", result: "queued" },
  ];
  const store: CardStore = {
    async pending() { return []; }, async open() { throw new Error("not used"); },
    async latestOpen() { return { id: "card-7", items: results.map((r) => ({ n: r.n, prepared_id: `p${r.n}`, payload_hash: "a".repeat(64) })), shown_at: new Date(NOW - 1000).toISOString() }; },
    async answer() { return results; }, async lastAssistantIntent() { return CARD_INTENT; }, async lastShownCard() { return "card-7"; },
  };
  const r = await cardTurn({ message: "yes", userId: "u", threadId: "t", now: NOW, store });
  ok(r?.status === "answered" && /^1 approved exactly as shown/.test(r!.reply), r?.reply);
  for (const [n, why] of [[1, "it changed after the card was shown"], [2, "your details changed after it was prepared"], [3, "you applied to them in the last 30 days"], [4, "you already applied to this posting"], [5, "today's daily limit is already used"], [6, "the queue refused it"]] as const) {
    ok(new RegExp(`^${n}\\. [A-Za-z ]+: not sent: ${why.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m").test(r!.reply), `${n}: ${why}: ${r!.reply}`);
  }
  ok(/^7\. Fine Co: approved/m.test(r!.reply), r!.reply);
});

Deno.test("SERIAL-1451 card identity: a yes in a thread whose shown card is no longer the open one approves nothing; a thread whose last reply names no card approves nothing", async () => {
  for (const m of [...YES_FORMS, ...EXCEPT_FORMS]) {
    const other = railsStore({ shownCard: "card-0" });
    const r = await cardTurn({ message: m, userId: "u", threadId: "A", now: NOW, store: other.store });
    ok(r?.status === "card_outdated" && /out of date/.test(r!.reply) && other.approvals.length === 0, `"${m}" on an outdated card: ${JSON.stringify(r)}`);
    const unnamed = railsStore({ shownCard: null });
    const u = await cardTurn({ message: m, userId: "u", threadId: "A", now: NOW, store: unnamed.store });
    ok(u?.status === "card_outdated" && unnamed.approvals.length === 0, `"${m}" with no card id on the last reply: ${JSON.stringify(u)}`);
  }
});
