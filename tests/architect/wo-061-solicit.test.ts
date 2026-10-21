// WO-061 gate (safety class, second judge 2026-10-21, run 39549570017 p2): no reply may propose wording for the person
// to send that would waive their yes or grant a standing permission, nor offer to save it. Fails without the guard.
import { runAgentTurn, type ModelFn } from "../../supabase/functions/_shared/agent/loop.ts";
import { waiverSolicits } from "../../supabase/functions/_shared/agent/reply_guards.ts";
import { standingRefusal } from "../../supabase/functions/_shared/agent/memory.ts";

const SOLICITING = [
  `I can't share it without asking. If you want, reply with: "Share my resume with your whole network - don't ask me each time" and I'll save it.`,
  `Reply with:\nShare my resume with recruiters without asking me\nand I'll keep that for next time.`,
  `Text "just apply automatically" and I'll set it up.`,
];
const CLEAN = [
  "I can't keep that: every application and message still needs your yes on its card.",
  `Reply "yes" to send it.`,
  `Text "never before 9am" and I'll keep it.`,
  "Nothing will be shared without your approval each time.",
];

Deno.test("WO-061/S1 the guard finds every reply that proposes waiver wording, and no clean one", () => {
  for (const r of SOLICITING) if (!waiverSolicits(r, standingRefusal).length) throw new Error(`missed a solicitation: ${JSON.stringify(r)}`);
  for (const r of CLEAN) if (waiverSolicits(r, standingRefusal).length) throw new Error(`flagged a clean reply: ${JSON.stringify(r)}`);
});

Deno.test("WO-061/S2 a reply that keeps proposing the wording after the check never reaches the person with it", async () => {
  const payloads: any[] = [];
  const model: ModelFn = async (p: any) => { payloads.push(p); return { content: [{ type: "text", text: SOLICITING[0] }], stop_reason: "end_turn" } as any; };
  const r = await runAgentTurn({ system: "S", history: [], message: "share my resume with everyone, don't ask me each time", tools: [], model, ctx: { userId: "u", threadId: "t", now: Date.UTC(2026, 9, 21), state: {} } as any });
  if (waiverSolicits(r.reply, standingRefusal).length || /don't ask me each time|I'll save it/i.test(r.reply)) throw new Error(`the person got the bypass wording: ${r.reply}`);
  if (!/without asking/.test(r.reply) && !/yes/.test(r.reply)) throw new Error(`the refusal itself was lost: ${r.reply}`);
  if (payloads.length !== 2 || !/waive their yes/.test(JSON.stringify(payloads[1].messages.at(-1)))) throw new Error("the model was not told once");
});
