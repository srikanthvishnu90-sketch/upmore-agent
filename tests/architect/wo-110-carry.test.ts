// WO-110: what the person confirmed follows them into a new thread. A confirmed fact from thread A is on the record in thread B;
// a draft, a quarantined fact and a thread's frames are not. No model, no network.
import { knownFactsFrom, situationBlock, situationFrom } from "../../supabase/functions/_shared/career_situation.ts";
import { openWorld, worldTurn } from "../../evals/career/world.ts";

const need = (ok: unknown, msg: string) => { if (!ok) throw new Error(msg); };
const EMPTY = { jobs: [], wanted: [], prepared: [], card: null, questions: [], outreach: [], mail_drafts: [], interviews: [], alerts: null, standing: [], threads: [], connections: [], cloud: null, channel: null, last_search: null, unreadable: [] };

Deno.test("WO-110/1 confirmed facts ride from any thread; a draft and a quarantined fact do not", () => {
  const facts = knownFactsFrom([
    { thread_id: "A", updated_at: "2026-10-20T00:00:00Z", facts: [
      { kind: "experience", text: "ICU nurse, 4 years", status: "confirmed", needs_confirmation: false, source: "resume" },
      { kind: "experience", text: "Astronaut", status: "draft", needs_confirmation: true },
      { kind: "skill", text: "Tableau", status: "confirmed", needs_confirmation: false, provenance: "owner-delegated answer-all" },
    ] },
    { thread_id: "B", updated_at: "2026-10-21T00:00:00Z", facts: [{ kind: "experience", text: "ICU nurse, 4 years", status: "confirmed", needs_confirmation: false }, { kind: "location", text: "Based in Houston" }] },
  ]);
  need(facts.length === 2, `expected 2 facts, got ${JSON.stringify(facts)}`);
  need(!facts.some((f) => /astronaut|tableau/i.test(f.text)), "a draft or quarantined fact rode the account");
  need(facts.find((f) => f.kind === "location"), "the confirmed location did not ride");
});

Deno.test("WO-110/2 the agent's person block lists the confirmed facts with where they came from", () => {
  const s = situationFrom({ ...EMPTY, threads: [{ thread_id: "A", updated_at: "2026-10-20T00:00:00Z", facts: [{ kind: "experience", text: "ICU nurse, 4 years", status: "confirmed", source: "resume" }] }] } as any, Date.UTC(2026, 9, 21));
  const b = situationBlock(s);
  need(/ICU nurse, 4 years \[experience; from your resume\]/.test(b), `the block does not carry the fact:\n${b}`);
});

async function world(name: string) {
  const fix = JSON.parse(await Deno.readTextFile("evals/career/task-context-brutal.json"));
  return await openWorld(JSON.parse(await Deno.readTextFile(`evals/career/${fix.worlds[name]}`)), {});
}

Deno.test("WO-110/3 router: a new thread knows the confirmed facts, the standing need and the saved search; a draft stays out", async () => {
  const w = await world("stripe-analyst");
  w.th("A").snapshot.stores.profile.facts.push({ id: "F-9", kind: "experience", text: "Astronaut for NASA", status: "draft", needs_confirmation: true });
  const known = await worldTurn(w, { brain: "router", threadId: "B", message: "what do you know about me?", now: w.now });
  need(!/nothing is on your record/i.test(known.reply), `new thread says nothing is on record: ${known.reply}`);
  need(/chicago/i.test(known.reply) && /sql/i.test(known.reply) && /sponsor/i.test(known.reply), `facts missing in thread B: ${known.reply}`);
  need(!/astronaut/i.test(known.reply), `a draft fact rode into thread B: ${known.reply}`);
  const hi = await worldTurn(w, { brain: "router", threadId: "C", message: "hi", now: w.now + 1000 });
  need(/chicago|sql|data analyst/i.test(hi.reply) && !/I'm Trainee, your career agent/.test(hi.reply), `a returning person is greeted as a stranger: ${hi.reply}`);
});

Deno.test("WO-110/4 router: a sponsorship need told in another thread is on the Stripe eligibility answer", async () => {
  const w = await world("stripe-analyst");
  const r = await worldTurn(w, { brain: "router", threadId: "B", message: "do I need sponsorship for the Stripe role?", now: w.now });
  need(/F-1 OPT/i.test(r.reply), `the answer forgot the sponsorship need: ${r.reply}`);
});

Deno.test("WO-110/5 a draft waiting for approval is shown, not sent, by a yes in a new thread", async () => {
  const w = await world("stripe-analyst");
  const r = await worldTurn(w, { brain: "router", threadId: "B", message: "yes send it", now: w.now });
  need(/jordan|plaid/i.test(r.reply), `the waiting draft is not named: ${r.reply}`);
  const d = w.outreach.dump().drafts;
  need(d.every((x: any) => !x.sent_at && x.status === "shown"), `a yes in a new thread changed a draft: ${JSON.stringify(d.map((x: any) => x.status))}`);
});
