// D-MS-1 fail-closed (review of #223, 2026-10-28): anything that is not a clear answer approves nothing. Texts that mean
// "none" or "not now" never approve, a word that is not an employer's name is never taken as one, a name counts only when
// it matches a card item exactly or as that employer's leading words (never by a fragment), and a name that fits more
// than one employer on the card is asked about, not guessed. And no silent ceiling on the batch read: past what one read
// takes, the card says plainly how many more wait. Synthetic only (the in-memory card database of mass-submit-fixture.ts,
// and the service-client store over a fake client).
import assertNode from "node:assert/strict";
import * as Cards from "../../supabase/functions/_shared/career_apply_cards.ts";
const { CARD_INTENT, cardTurn, parseCardReply, supabaseCardStore } = Cards;
// The one read's size (exported with the fix; 1000 is what 06ee9e2c read, so the test runs there too and shows red).
const PENDING_READ: number = (Cards as Record<string, unknown>).PENDING_READ as number ?? 1000;
import { db, T } from "./mass-submit-fixture.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const approves = (m: string) => { const r = parseCardReply(m); return !!r && (r.kind === "yes" || r.kind === "only"); };

// The reviewer's texts (02:00Z, 02:34Z) and their kin: each would approve something on 06ee9e2c.
const NEVER_APPROVE = [
  "approve none", "send it later", "yes but wait", "yes except none", "only none", "approve all except", "send to acme",
  "approve nothing", "send none of them", "yes to none", "only no one", "yes except nobody", "yes except all",
  "send them later", "send it tomorrow", "yes tomorrow", "yes but later", "approve later", "yes, soon", "send them now",
  "only it", "approve it later", "yes except it", "yes but not now", "yes except wait", "send to them", "approve to all except",
  "yes but not the", "only the", "yes except the one", "approve all but", "send all except",
];

Deno.test("D-MS-1 fail-closed/1 the parser: none, not-now and function words never approve", () => {
  const wrong = NEVER_APPROVE.filter(approves).map((m) => `${m} -> ${JSON.stringify(parseCardReply(m))}`);
  eq(wrong, [], "these approve");
  // "none" and its kin, alone or after an approval word, are never read as the name "ne".
  for (const m of ["approve none", "yes except none", "only none"]) {
    const r = parseCardReply(m) as any;
    assert(!JSON.stringify(r).includes('"ne"'), `${m}: ${JSON.stringify(r)}`);
  }
  // Clear answers still work.
  for (const [m, kind] of [["yes", "yes"], ["yes except 3", "yes"], ["only 1, 2 and 5", "only"], ["yes but not acme", "yes"], ["only acme and beta", "only"], ["no", "no"], ["wait", "hold"]] as const) {
    eq(parseCardReply(m)?.kind, kind, m);
  }
});

Deno.test("D-MS-1 fail-closed/2 on a card of NE Group, IT and Wait (and kin), the reviewer's texts approve nothing and the card still waits; the plain yes then approves all", async () => {
  for (const m of NEVER_APPROVE) {
    const w = db({ companies: ["NE Group", "IT", "Wait", "Acme Robotics", "Later Labs", "Now Health"] });
    await w.say("show my applications");
    const r = await w.say(m);
    eq([w.answerCalls.length, w.queue.length], [0, 0], `"${m}" approved something: ${r?.status} ${r?.reply}`);
    assert(r === null || /nothing was approved|holding|Nothing was sent|Got it: not/i.test(r.reply), `"${m}": ${r?.reply}`);
    eq(w.cards[0].state, "open", `"${m}": the card still waits`);
  }
  // The reviewer's texts are answers to the card: the person is told in plain words that nothing was approved.
  for (const m of ["approve none", "send it later", "yes but wait", "yes except none", "only none", "send to acme"]) {
    const w = db({ companies: ["NE Group", "IT", "Wait", "Acme Robotics"] });
    await w.say("show my applications");
    const r = await w.say(m);
    assert(r && ["unclear", "hold"].includes(r.status) && /nothing was approved/i.test(r.reply), `"${m}": ${r?.status} ${r?.reply}`);
  }
  const w = db({ companies: ["NE Group", "IT", "Wait"] });
  await w.say("show my applications");
  await w.say("yes but wait");
  eq((await w.say("yes"))?.status, "answered");
  eq(w.queue.length, 3);
});

Deno.test("D-MS-1 fail-closed/3 a name counts only by an exact match or the employer's leading words; a fragment or an ambiguous name approves nothing", async () => {
  const cards = ["Acme Robotics", "Acme Health", "Beta Labs", "NE Group"];
  const cases: [string, string, number[] | null][] = [
    ["yes but not beta labs", "answered", [1, 2, 4]], // exact
    ["yes but not beta", "answered", [1, 2, 4]], // the employer's leading word
    ["yes except acme robotics", "answered", [2, 3, 4]],
    ["yes but not acme", "answered", [3, 4]], // leaving out every Acme is safe
    ["only acme", "unclear", null], // two Acmes: which? never guessed
    ["only robotics", "not_named", null], // not the leading words: a fragment
    ["yes except ne", "not_named", null], // two letters: never a name
    ["yes except labs", "not_named", null],
  ];
  for (const [m, status, approved] of cases) {
    const w = db({ companies: cards });
    await w.say("show my applications");
    const r = await w.say(m);
    eq(r?.status, status, `${m}: ${r?.reply}`);
    eq(w.answerCalls.map((c) => c.approve), approved ? [approved] : [], m);
  }
});

// A fake service client over prepared rows: the reads supabaseCardStore makes for "show my applications".
function fakeAdmin(rows: number) {
  const prepared = Array.from({ length: rows }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, company: `Bulk Employer ${i + 1}`,
    card_lines: [`Bulk Employer ${i + 1}: TEST Analyst`], created_at: new Date(T + i * 1000).toISOString(), resume_sha256: "a".repeat(64) }));
  const reads: { limit: number | null; count: boolean }[] = [];
  let opened: string[] = [];
  return {
    reads, opened: () => opened,
    from(table: string) {
      if (table !== "career_apply_prepared") throw new Error(`unexpected table ${table}`);
      let lim: number | null = null, count = false, head = false;
      const q: any = {
        select(_c: string, o?: { count?: string; head?: boolean }) { count = !!o?.count; head = !!o?.head; return q; },
        eq() { return q; }, in() { return q; }, order() { return q; }, gt() { return q; },
        limit(n: number) { lim = n; return q; },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
          reads.push({ limit: lim, count });
          const data = head ? null : prepared.slice(0, lim ?? prepared.length);
          return Promise.resolve({ data, count: count ? prepared.length : null, error: null }).then(res, rej);
        },
      };
      return q;
    },
    rpc(name: string, args: any) {
      if (name !== "career_apply_card_open_as") throw new Error(`unexpected rpc ${name}`);
      opened = args.p_ids;
      return Promise.resolve({ data: { id: "C-BULK", items: args.p_ids.map((id: string, i: number) => ({ n: i + 1, prepared_id: id, payload_hash: "h" })), shown_at: new Date(T).toISOString() }, error: null });
    },
  };
}

Deno.test("NO LIMITS fail-closed/4 past one read (limit+1 rows) the card says plainly how many more wait; nothing is dropped silently", async () => {
  for (const [rows, more] of [[PENDING_READ + 1, 1], [PENDING_READ + 37, 37], [PENDING_READ, 0]] as const) {
    const admin = fakeAdmin(rows);
    const r = await cardTurn({ message: "show my applications", userId: "U", threadId: "TH", now: T, store: supabaseCardStore(admin) });
    eq(r?.status, "shown", `${rows}`);
    eq(admin.opened().length, PENDING_READ <= rows ? Math.min(rows, PENDING_READ) : rows, `${rows}: the card holds what was read`);
    const said = more === 1 ? /1 more is ready; it comes on the next card after you answer this one\./ : new RegExp(`${more} more are ready; they come on the next card after you answer this one\\.`);
    if (more) assert(said.test(r!.reply), `${rows} rows: the card says ${more} more wait: ${r!.reply.slice(-400)}`);
    else assert(!/more (?:is|are) ready/.test(r!.reply), `${rows} rows: nothing more is claimed`);
    assert(admin.reads.every((x) => x.count || (x.limit !== null && x.limit <= PENDING_READ + 1)), `every read is bounded: ${JSON.stringify(admin.reads)}`);
  }
});

Deno.test("fail-closed/5 a turn after the card is closed by another reply is not the card's (control)", async () => {
  const w = db({ companies: ["NE Group", "IT"] });
  await w.say("show my applications");
  w.otherReply();
  eq(await w.say("approve none"), null);
  eq(w.queue.length, 0);
  void CARD_INTENT;
});
