// WO-111: the fallback never says nothing and never contradicts the record. No model, no network.
import { parseOutreachReply } from "../../supabase/functions/_shared/career_outreach.ts";
import { openWorld, worldTurn } from "../../evals/career/world.ts";

const need = (ok: unknown, msg: string) => { if (!ok) throw new Error(msg); };
async function world(name: string) {
  const fix = JSON.parse(await Deno.readTextFile("evals/career/task-context-brutal.json"));
  return await openWorld(JSON.parse(await Deno.readTextFile(`evals/career/${fix.worlds[name]}`)), {});
}

Deno.test("WO-111/1 the person's own city is never called relocation", async () => {
  const w = await world("nurse-houston");
  const r = await worldTurn(w, { brain: "router", threadId: "A", message: "find me night shift ICU jobs", now: w.now });
  need(!/relocat|outside the places on your profile/i.test(r.reply), `Houston called relocation: ${r.reply}`);
  need(/Dallas, TX, not in Houston/.test(r.reply), `a role in another city is not flagged against the person's own city: ${r.reply}`);
});

Deno.test("WO-111/2 a question about the person's own record is answered from it, not by the menu", async () => {
  const w = await world("nurse-houston");
  const r = await worldTurn(w, { brain: "router", threadId: "A", message: "how many years of ICU experience do I have?", now: w.now });
  need(/4 years/.test(r.reply) && /Memorial Hermann/.test(r.reply), r.reply);
});

Deno.test("WO-111/3 an unmatched career turn gets one plain sentence that names it, no menu", async () => {
  const w = await world("stripe-analyst");
  const r = await worldTurn(w, { brain: "router", threadId: "A", message: "what should I put for the salary one?", now: w.now });
  need(!/here is what i can do|i did not catch/i.test(r.reply), r.reply);
  need(!/salary one/.test(r.reply), `the reply echoed the person's words: ${r.reply}`);
  need((r.reply.match(/\?/g) || []).length === 1 && /(find|track|prep)/i.test(r.reply), r.reply);
});

Deno.test("WO-111/4 remote only and a pay floor are honored in a search", async () => {
  const w = await world("teacher-to-ops");
  const r = await worldTurn(w, { brain: "router", threadId: "A", message: "find me jobs", now: w.now });
  need(!/Harbor|Austin|Quill/.test(r.reply), `a role that breaks remote-only or the floor was shown: ${r.reply}`);
  need(/Lumen/.test(r.reply) && /left out 2 that break/.test(r.reply), r.reply);
});

Deno.test("WO-111/5 the outreach parser takes a draft named by firm or person, and 'send it'", () => {
  for (const [said, who] of [["send the Plaid email", "plaid"], ["send the Plaid email to Jordan", "plaid"], ["show me the message to Dana", "dana"], ["show the Lumen draft", "lumen"]] as const) {
    const r = parseOutreachReply(said) as any;
    need(r?.kind === "one" && r.who.includes(who), `${said} -> ${JSON.stringify(r)}`);
  }
  need((parseOutreachReply("send the Plaid email") as any).send === true && (parseOutreachReply("show the Plaid email") as any).send === false, "send and show are not told apart");
  for (const said of ["send it", "ok send it", "yes send it"]) need((parseOutreachReply(said) as any)?.it === true, said);
  need((parseOutreachReply("send 1-3") as any)?.kind === "send", "numbered sends changed");
});

Deno.test("WO-111/6 naming a draft shows its exact words and asks; it approves only what this thread just showed", async () => {
  const w = await world("teacher-to-ops");
  const shown = await worldTurn(w, { brain: "router", threadId: "A", message: "show me the message to Dana", now: w.now });
  need(/Subject: Product Operations Analyst role/.test(shown.reply) && /taught high school math/.test(shown.reply) && /approve/.test(shown.reply), shown.reply);
  need(w.outreach.dump().drafts.every((d: any) => d.status === "shown" && !d.sent_at), "showing a draft changed it");
  const fresh = await worldTurn(w, { brain: "router", threadId: "B", message: "send the Lumen email", now: w.now + 1000 });
  need(/Say send 1 to approve/.test(fresh.reply), `a send in a thread that has not shown the draft did not show it first: ${fresh.reply}`);
  need(w.outreach.dump().drafts.every((d: any) => d.status === "shown"), "a send by name in a new thread approved a draft");
});
