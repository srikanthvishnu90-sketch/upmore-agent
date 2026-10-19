// Which brain answers a career turn (WO-002, D-008): the CareerHost router unless CAREER_BRAIN=agent, and the agent turn
// itself (model + tools over the person's career state).
import { runAgentTurn, type ModelFn, type TurnResult } from "../_shared/agent/loop.ts";
import { careerTools } from "../_shared/agent/career_tools.ts";
import { careerSystemPrompt } from "../_shared/agent/prompt.ts";
import { type MemoryStore, type Pipeline, personBlock, type Standing } from "../_shared/agent/memory.ts";
import type { AlertStore } from "../_shared/career_alert_store.ts";
import type { AlertPrefs } from "../_shared/career_alerts.ts";

export function chooseBrain(env: { get(k: string): string | undefined }): "agent" | "router" {
  return env.get("CAREER_BRAIN") === "agent" ? "agent" : "router";
}

// What a person erased never reaches the model again: newest-first rows are cut at the latest erase confirmation (the
// host's career_profile_erased turn), which is itself left out.
export function afterErase<T extends { meta?: unknown }>(newestFirst: T[]): T[] {
  const i = newestFirst.findIndex((m) => (m.meta as any)?.intent === "career_profile_erased");
  return i < 0 ? newestFirst : newestFirst.slice(0, i);
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
  postings?: (query: string) => Promise<any[]>;
  alerts?: AlertStore | null;
  tz?: string;
  // WO-023: what is known about the person, put in the system prompt every turn (built in code, never by the model),
  // and where standing instructions are kept.
  known?: { standing: Standing[]; alerts: { prefs: AlertPrefs; tz: string } | null; pipeline: Pipeline | null };
  memory?: MemoryStore | null;
}): Promise<TurnResult> {
  const block = o.known ? personBlock({ profile: o.stores.profile, ...o.known }) : null;
  return runAgentTurn({
    system: careerSystemPrompt(localDay(o.now, o.tz)) + (block ? "\n\n" + block : ""),
    history: o.history.slice(-20).map((m) => ({ role: m.role, content: String(m.content ?? "") })),
    message: o.message,
    tools: careerTools({ postings: o.postings ?? (async () => []), alerts: o.alerts ?? null, memory: o.memory ?? null }),
    model: o.model,
    ctx: { userId: o.userId, threadId: o.threadId, now: o.now, state: o.stores },
  });
}
