// Which brain answers a career turn (WO-002, D-008): the CareerHost router unless CAREER_BRAIN=agent, and the agent turn
// itself (model + tools over the person's career state).
import { runAgentTurn, type ModelFn, type TurnResult } from "../_shared/agent/loop.ts";
import { careerTools } from "../_shared/agent/career_tools.ts";
import { careerSystemPrompt } from "../_shared/agent/prompt.ts";

export function chooseBrain(env: { get(k: string): string | undefined }): "agent" | "router" {
  return env.get("CAREER_BRAIN") === "agent" ? "agent" : "router";
}

export function localDay(now: number, tz = "America/New_York"): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now)); }
  catch { return new Date(now).toISOString().slice(0, 10); }
}

export function agentTurn(o: {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  stores: Record<string, unknown>;
  userId: string; threadId: string; now: number;
  model: ModelFn;
  postings?: () => Promise<any[]>;
  tz?: string;
}): Promise<TurnResult> {
  return runAgentTurn({
    system: careerSystemPrompt(localDay(o.now, o.tz)),
    history: o.history.slice(-20).map((m) => ({ role: m.role, content: String(m.content ?? "") })),
    message: o.message,
    tools: careerTools({ postings: o.postings ?? (async () => []) }),
    model: o.model,
    ctx: { userId: o.userId, threadId: o.threadId, now: o.now, state: o.stores },
  });
}
