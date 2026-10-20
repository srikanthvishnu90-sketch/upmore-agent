// WO-036 demo: the two brain tools as the person would read them, without a model and without the network.
//   deno run -A scripts/career/wo036-demo.ts offer "JPM offered 110k base, 15k signing, NYC, analyst"
//   deno run -A scripts/career/wo036-demo.ts path Palantir "software engineer" "BS Economics, graduating May 2027"
// The offer prints every message the person gets and the time from the offer text to the reply (code only; the
// model's own time is not in this number). The path answer takes the firm, an optional role and optional facts, which
// stand in for confirmed facts here. Hired-candidate backgrounds come from People Data Labs only with PDL_API_KEY and
// the database; this demo always shows the honest NOT_WIRED line.
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";

const [mode, ...rest] = Deno.args;
const tools = Object.fromEntries(careerTools({ postings: async () => [] }).map((t) => [t.name, t]));
const state: Record<string, any> = {};
const print = (messages: string[]) => messages.forEach((m, i) => console.log(`--- message ${i + 1} (${m.length} characters)\n${m}`));

if (mode === "offer") {
  const words = rest.join(" ") || "JPM offered 110k base, 15k signing, NYC, analyst";
  const t0 = performance.now();
  const r = await tools.offer_benchmark.run({}, { userId: "demo", threadId: "demo", now: Date.now(), state, turn: { message: words, added: [] } }) as any;
  const ms = performance.now() - t0;
  print(r.messages);
  console.log(`\nstatus ${r.status}; offer text to reply ${ms.toFixed(1)} ms (code only, measured here)`);
  if (r.status === "ask") console.log("Run it again with the answer to see the benchmark (the state is per run here).");
} else if (mode === "path") {
  const [firm, role = "", ...facts] = rest;
  for (const [i, text] of facts.entries()) {
    const c = { userId: "demo", threadId: "demo", now: Date.now(), state, turn: { message: "x", added: [] as string[] } };
    const added = await tools.add_profile_fact.run({ kind: /graduat|degree|university|college|bs|ba|major/i.test(text) ? "education" : "other", text }, c) as any;
    await tools.confirm_profile_fact.run({ id: added.fact.id }, { ...c, turn: { message: "yes", added: [] } });
    void i;
  }
  const r = await tools.career_path_answer.run({ firm: firm || "Palantir", role }, { userId: "demo", threadId: "demo", now: Date.now(), state, turn: { message: "x", added: [] } }) as any;
  print(r.messages);
} else {
  console.log('usage: deno run -A scripts/career/wo036-demo.ts offer "<offer words>" | path <firm> [role] [fact ...]');
}
