// iMessage approval by replying in the card's thread (three-channel readiness E-3/E-15; the owner's iMessage spec
// section 7): LoopMessage posts a reply with thread {thread_id, initial_message_id} — the id of the bubble the person
// replied to ("First message ID to which 'reply to' was applied", https://loopmessage.com/apidocs/conversation-api-webhooks).
// The path: parseLoopInbound reads the thread id -> the adapter carries it as replyToMessageId -> the turn reaches
// cardTurn with replyChannel "imessage" -> cardOfMessage reads the id ONLY against iMessage's own delivered texts
// (career_outbox provider_id / provider_ids, the ids LoopMessage gave the card's bubbles when they went out).
// A plain "yes" in that thread approves exactly the card those bubbles carried; a yes replied to any other bubble,
// or under another channel's namespace, approves nothing. The full drive over a real Postgres is
// tests/architect/flow-channel-approvals-pg.test.ts ("imessage 8b"); this file is the same chain composed without one.
import { cardTurn, supabaseCardStore, type CardStore } from "../../supabase/functions/_shared/career_apply_cards.ts";
import { loopMessageAdapter } from "../../supabase/functions/_shared/loopmessage_adapter.ts";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const fixture = (name: string) => JSON.parse(Deno.readTextFileSync(`${ROOT}/tests/fixtures/channels/${name}`));
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }

const A = "+13231112233";
// The outbox as the deliverer leaves it: the card went out as three bubbles (provider_id is the first bubble's id,
// provider_ids every bubble's), an earlier plain reply as one.
const OUTBOX = [
  { key: "reply:lm_1", card_id: null, provider_id: "LM-OUT-9", provider_ids: null, user_id: "U1", status: "delivered", contact: A },
  { key: "card:CARD-1", card_id: "CARD-1", provider_id: "LM-OUT-11", provider_ids: ["LM-OUT-11", "LM-OUT-12", "LM-OUT-13"], user_id: "U1", status: "delivered", contact: A },
];
// The parts of the query supabaseCardStore.cardOfMessage uses, with PostgREST's meaning for the patterns it builds:
// eq on a column, provider_id.eq.<id> or provider_ids.cs.{<id>}, contact like / not like a "prefix:%" pattern.
function fakeAdmin(rows: typeof OUTBOX) {
  return {
    from(table: string) {
      assert(table === "career_outbox", `only the outbox is read for a channel reply id: ${table}`);
      const ops: ((r: typeof OUTBOX[number]) => boolean)[] = [];
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => (ops.push((r) => (r as any)[c] === v), q),
        or: (s: string) => {
          const m = /^provider_id\.eq\.("(?:[^"\\]|\\.)*"),provider_ids\.cs\.\{("(?:[^"\\]|\\.)*")\}$/.exec(s);
          assert(m, `the reply-id clause: ${s}`);
          const id = JSON.parse(m![1]);
          ops.push((r) => r.provider_id === id || (r.provider_ids?.includes(id) ?? false));
          return q;
        },
        like: (c: string, pat: string) => (ops.push((r) => String((r as any)[c]).startsWith(pat.replace(/%$/, ""))), q),
        not: (c: string, _op: string, pat: string) => (ops.push((r) => !String((r as any)[c]).startsWith(pat.replace(/%$/, ""))), q),
        limit: async () => ({ data: rows.filter((r) => ops.every((f) => f(r))), error: null }),
      };
      return q;
    },
  };
}

function store() {
  const answers: unknown[] = [];
  const real = supabaseCardStore(fakeAdmin(OUTBOX));
  const s: CardStore = {
    pending: async () => [],
    open: async () => { throw new Error("not used"); },
    latestOpen: async () => ({ id: "CARD-1", items: [{ n: 1 }], shown_at: new Date(1_000_000).toISOString() }) as any,
    answer: async (userId, cardId, approve) => { answers.push([userId, cardId, approve]); return [{ n: 1, company: "TEST imessage Employer 1", result: "queued" }]; },
    lastAssistantIntent: async () => "career_apply_card",
    lastShownCard: async () => "CARD-1",
    cardOfMessage: real.cardOfMessage,
  };
  return { store: s, answers };
}

async function threadReplyTo(initialMessageId: string): Promise<string | null> {
  const secret = "S".repeat(40);
  const a = loopMessageAdapter({ apiKey: "k", inboundSecret: secret, send: async () => ({ ok: true, id: null }) });
  const body = { ...fixture("loopmessage-inbound.json"), contact: A, text: "yes", message_id: "LM-IN-T1", webhook_id: "LM-WH-T1",
    thread: { thread_id: "TH-T1", initial_message_id: initialMessageId } };
  const r = await a.parseInbound(new Request("https://fn.test/trainee-inbound", { method: "POST", headers: { authorization: secret }, body: JSON.stringify(body) }));
  assert(!("response" in r), JSON.stringify(r));
  eq(r.messages[0].channel, "imessage");
  return r.messages[0].replyToMessageId ?? null;
}

Deno.test("iMessage: a yes replied in the card's thread approves that card — the reply names a later bubble, read from provider_ids", async () => {
  // The person replies to the bubble that carries "Reply YES <code>" — the last one out, not the first.
  const replyTo = await threadReplyTo("LM-OUT-13");
  eq(replyTo, "LM-OUT-13", "the thread's initial_message_id is the reply id the turn carries");
  const { store: s, answers } = store();
  const r = await cardTurn({ message: "yes", userId: "U1", threadId: "T1", now: 1_000_000, replyTo, replyChannel: "imessage", store: s });
  assert(r && r.status === "answered", JSON.stringify(r));
  assert(/^1 approved exactly as shown/.test(r!.reply), r!.reply);
  eq(answers, [["U1", "CARD-1", [1]]], "exactly the card those bubbles carried, exactly its items");
});

Deno.test("iMessage: a yes replied to another bubble, or to no bubble of ours, approves nothing", async () => {
  for (const id of ["LM-OUT-9", "LM-OUT-999999"]) {
    const { store: s, answers } = store();
    const r = await cardTurn({ message: "yes", userId: "U1", threadId: "T1", now: 1_000_000, replyTo: await threadReplyTo(id), replyChannel: "imessage", store: s });
    assert(r && r.status === "needs_reply", `${id}: ${JSON.stringify(r)}`);
    eq(answers, [], `${id}: nothing answered`);
  }
  const { store: s2, answers: a2 } = store();
  const bare = await cardTurn({ message: "yes", userId: "U1", threadId: "T1", now: 1_000_000, replyTo: null, replyChannel: "imessage", store: s2 });
  assert(bare && bare.status === "needs_reply", "a bare yes approves nothing either");
  eq(a2, []);
});

Deno.test("iMessage: the same bubble id under another channel's namespace approves nothing (E-15)", async () => {
  const { store: s, answers } = store();
  const r = await cardTurn({ message: "yes", userId: "U1", threadId: "T1", now: 1_000_000, replyTo: "LM-OUT-13", replyChannel: "telegram", store: s });
  assert(r && r.status === "needs_reply", JSON.stringify(r));
  eq(answers, [], "a Telegram reply id is read only against Telegram's delivered texts");
});
