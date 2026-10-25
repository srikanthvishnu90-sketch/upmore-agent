// WO-022 (architect): the card of prepared applications and the one text that answers it, then the whole loop on fakes:
// prepared (the engine's dry run) -> card -> "yes but not 2" -> queue -> the person's computer runs them -> receipts.
// The database half (prepare_own, card open and answer) is proven in tests/db/career_apply_cards.test.sql.
import {
  answerText,
  CARD_CHAR_BUDGET,
  CARD_INTENT,
  cardFor,
  type CardStore,
  cardTurn,
  parseCardReply,
  type Prepared,
} from "../../supabase/functions/_shared/career_apply_cards.ts";
import { prepare, runApproved } from "../../workers/career-browser/approve-first.ts";
import { planReceipts } from "../../supabase/functions/_shared/career_apply_receipts.ts";
import { proofFor } from "./proof-fixture.ts";

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const T = Date.parse("2026-10-20T15:00:00Z");

Deno.test("WO-022/1 the answers a card takes, and what is never an answer", () => {
  eq(parseCardReply("Yes"), { kind: "yes", except: [] });
  eq(parseCardReply("yes please!"), { kind: "yes", except: [] });
  eq(parseCardReply("yes but not 2"), { kind: "yes", except: [2] });
  eq(parseCardReply("Yes except 2, 5 and 7."), { kind: "yes", except: [2, 5, 7] });
  eq(parseCardReply("yes skip #3"), { kind: "yes", except: [3] });
  eq(parseCardReply("no"), { kind: "no" });
  eq(parseCardReply("don't send them"), { kind: "no" });
  eq(parseCardReply("change 2 email to x@example.test"), { kind: "change", n: 2 });
  eq(parseCardReply("show my applications"), { kind: "show" });
  // "stop" is the carrier's opt-out word: it silences every text, so it is never a card answer.
  eq(parseCardReply("STOP"), null);
  for (const t of ["yes I want alerts for data jobs", "sure", "maybe", "yes but", "what is on 2?", "approve 2"]) {
    eq(parseCardReply(t), null, t);
  }
});

const prep = (i: number, lines = 4): Prepared => ({
  id: `P${i}`,
  company: `TEST Employer ${i}`,
  card_lines: [
    `TEST Employer ${i}`,
    ...Array.from({ length: lines - 2 }, (_, k) => `Question ${k}: answer ${i}.${k}`),
    `Sends to https://jobs.lever.co/test/${i}`,
  ],
});

Deno.test("WO-022/2 a card shows every line of every application verbatim, at most 8, under 1,600 characters with two or more", () => {
  const c = cardFor(Array.from({ length: 12 }, (_, i) => prep(i + 1)));
  assert(c && "take" in c);
  assert(c.take.length <= 8 && c.text.length <= CARD_CHAR_BUDGET, `${c.take.length} ${c.text.length}`);
  for (const p of c.take) for (const l of p.card_lines) assert(c.text.includes(l), "missing: " + l);
  assert(!c.text.includes("TEST Employer 9"), "nothing beyond the card");
  assert(/"yes but not 2"/.test(c.text) && /"no"/.test(c.text) && !/\bstop\b/i.test(c.text), c.text);
  const big = cardFor([prep(1, 40), prep(2, 40)]);
  assert(big && "take" in big && big.take.length === 1, "a long application goes alone, never cut");
  const huge = cardFor([prep(1, 200)]);
  assert(huge && "tooLong" in huge, "past the outbox's limit it is not shown by text");
});

function memoryCards(over: Partial<{ lastIntent: string | null; shownAt: number }> = {}) {
  const prepared = [prep(1), prep(2), prep(3)];
  let card: any = null, lastIntent: string | null = over.lastIntent ?? null;
  const answers: number[][] = [];
  const store: CardStore = {
    pending: async () => prepared,
    open: async (_u, ids) => {
      card = {
        id: "C1",
        items: ids.map((id, i) => ({ n: i + 1, prepared_id: id, payload_hash: "h" + id })),
        shown_at: new Date(over.shownAt ?? T).toISOString(),
      };
      lastIntent = CARD_INTENT;
      return card;
    },
    latestOpen: async () => card,
    answer: async (_u, _c, approve) => {
      answers.push(approve);
      return card.items.map((i: any) => ({
        n: i.n,
        company: `TEST Employer ${i.n}`,
        result: approve.includes(i.n) ? "queued" : "declined",
      }));
    },
    lastAssistantIntent: async () => lastIntent,
  };
  return { store, answers, setIntent: (v: string | null) => (lastIntent = v) };
}
const turn = (store: CardStore, message: string, now = T) =>
  cardTurn({ message, userId: "TEST-USER", threadId: "TH", now, store });

Deno.test("WO-022/3 a yes answers the card only while the card is the thread's last word", async () => {
  const m = memoryCards();
  eq(await turn(m.store, "yes"), null, "no card shown: a yes is someone else's");
  const shown = await turn(m.store, "show my applications");
  eq(shown?.status, "shown");
  m.setIntent("agent");
  eq(await turn(m.store, "yes"), null, "the brain spoke after the card: this yes is not the card's");
  eq(m.answers.length, 0);
});

Deno.test("WO-022/4 a text yes approves nothing (only the tap sends); a number not on the card and an old card approve nothing", async () => {
  const m = memoryCards();
  await turn(m.store, "show my applications");
  const bad = await turn(m.store, "yes but not 9");
  eq(bad?.status, "not_on_card");
  eq(m.answers.length, 0);
  const yes = await turn(m.store, "yes but not 2");
  eq(yes?.status, "needs_tap", "option A (chosen 2026-10-22 under the owner's delegation): a text yes never approves or sends; only the person's tap on the exact payload does");
  eq(m.answers.length, 0, "option A (chosen 2026-10-22 under the owner's delegation): a text yes never approves or sends; only the person's tap on the exact payload does");
  const old = memoryCards({ shownAt: T - 25 * 3600000 });
  await turn(old.store, "show my applications", T - 25 * 3600000);
  eq((await turn(old.store, "yes"))?.status, "expired");
  eq(old.answers.length, 0);
  const no = memoryCards();
  await turn(no.store, "show my applications");
  await turn(no.store, "no");
  eq(no.answers, [[]], "no approves nothing and closes the card");
  const ch = memoryCards();
  await turn(ch.store, "show my applications");
  eq((await turn(ch.store, "change 2 email to x"))?.status, "change");
  eq(ch.answers.length, 0, "a change approves nothing");
});

Deno.test("WO-022/5 the answer's words: what was approved, what was not and why", () => {
  const t = answerText([
    { n: 1, company: "A", result: "queued" },
    { n: 2, company: "B", result: "daily_cap" },
    { n: 3, company: "C", result: "company_cooldown" },
  ]);
  assert(/^1 approved exactly as shown/.test(t) && /today's daily limit is already used/.test(t) && /last 30 days/.test(t), t);
  assert(
    /^Nothing was approved\. Nothing went to an employer\./.test(
      answerText([{ n: 1, company: "A", result: "declined" }]),
    ),
  );
});

Deno.test("WO-022/6 the loop: prepared on the computer, card, a text yes sends nothing, the tap approves 1 and 3, queued, run, receipts", async () => {
  // 1. The engine's dry run on three postings (a fake engine; the real one is in tests/career-approve-first.test.cjs).
  const prepared: { id: string; payload: any; card: string[]; hash: string }[] = [];
  for (const i of [1, 2, 3]) {
    const r = await prepare({
      url: `https://jobs.lever.co/test/${i}`,
      factsPath: "f",
      resumePath: "r",
      account: { epoch: 1, version: 1 },
      now: T,
      runEngine: async () => ({
        result: { state: "not_submitted", reason: "dry_run" },
        evidence: {
          approval_hash: String(i).repeat(64).slice(0, 64),
          readback: { email: "t@example.test" },
          fields: [{ name: "email", label: "Email", value: "t@example.test", factId: "TEST-1" }],
          payload: {
            user_id: "TEST-USER",
            posting: `lever:test:${i}`,
            company: `TEST Employer ${i}`,
            destination: `https://jobs.lever.co/test/${i}/apply`,
            resume: { filename: "r.pdf", sha256: "b".repeat(64) },
          },
        },
      }),
    });
    assert(r.ready);
    prepared.push({ id: `P${i}`, payload: r.payload, card: r.card, hash: r.hash });
  }
  // 2. The card and its answer, against a store that queues exactly what was shown.
  const queue: any[] = [];
  let card: any = null, last: string | null = null;
  const store: CardStore = {
    pending: async () => prepared.map((p) => ({ id: p.id, company: p.payload.company, card_lines: p.card })),
    open: async (_u, ids) => {
      card = {
        id: "C1",
        items: ids.map((id, i) => ({
          n: i + 1,
          prepared_id: id,
          payload_hash: prepared.find((p) => p.id === id)!.hash,
        })),
        shown_at: new Date(T).toISOString(),
      };
      last = CARD_INTENT;
      return card;
    },
    latestOpen: async () => card,
    answer: async (_u, _c, approve) =>
      card.items.map((it: any) => {
        const p = prepared.find((x) => x.id === it.prepared_id)!;
        if (approve.includes(it.n)) {
          queue.push({
            id: `00000000-0000-4000-8000-${String(it.n).padStart(12, "0")}`, // a uuid, as the queue makes them
            lease_token: `L${it.n}`,
            url: p.payload.url,
            payload: p.payload,
            approval: it.payload_hash,
          });
        }
        return { n: it.n, company: p.payload.company, result: approve.includes(it.n) ? "queued" : "declined" };
      }),
    lastAssistantIntent: async () => last,
  };
  const shown = await turn(store, "show my applications");
  for (const p of prepared) for (const l of p.card) assert(shown!.reply.includes(l), "card line missing: " + l);
  eq((await turn(store, "yes but not 2"))?.status, "needs_tap", "option A (chosen 2026-10-22 under the owner's delegation): a text yes never approves or sends; only the person's tap on the exact payload does");
  eq(queue.length, 0, "a text yes queued nothing");
  await store.answer("TEST-USER", "C1", [1, 3]); // the person's tap on the card (career_apply_card_answer_own)
  eq(queue.map((j) => j.payload.company), ["TEST Employer 1", "TEST Employer 3"]);
  eq(queue.map((j) => j.approval), [prepared[0].hash, prepared[2].hash], "approved by the hash that was shown");
  // 3. The person's computer runs them with the engine's own approval; 4. each ends in one receipt.
  const finished: any[] = [];
  const ran: string[][] = [];
  await runApproved({
    claim: async () => queue,
    finish: async (id, _l, state, ev) => {
      finished.push({
        id,
        user_id: "TEST-USER",
        company: queue.find((j) => j.id === id).payload.company,
        url: queue.find((j) => j.id === id).url,
        state,
        reason: ev.reason,
        confirmation_id: ev.confirmation_id,
      });
    },
    resumeFor: async () => ({ path: "/r.pdf", sha256: "b".repeat(64) }),
    writeFacts: async () => "/facts.json",
    runEngine: async (args) => {
      ran.push(args);
      return {
        result: { state: "confirmed", reason: "employer confirmation on the page", confirmation_id: "TEST-C", proof: proofFor(args) },
        evidence: {},
      };
    },
  });
  eq(
    ran.map((a) => a[a.indexOf("--approved") + 1]),
    ["1".repeat(64), "3".repeat(64)],
    "each run carries the engine's approval from its dry run",
  );
  const receipts = planReceipts(finished, T);
  eq(receipts.length, 2);
  assert(
    receipts.every((r) => /the employer confirmed it on their page \(confirmation TEST-C\)/.test(r.text)),
    JSON.stringify(receipts),
  );
});
