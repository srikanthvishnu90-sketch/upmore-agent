// Which brain answers a career turn (WO-002, D-008): the CareerHost router unless CAREER_BRAIN=agent, and the agent turn
// itself (model + tools over the person's career state).
import { runAgentTurn, type ModelFn, type TurnResult } from "../_shared/agent/loop.ts";
import { careerTools } from "../_shared/agent/career_tools.ts";
import { careerSystemPrompt } from "../_shared/agent/prompt.ts";
import { type MemoryStore, type Pipeline, personBlock, type Standing } from "../_shared/agent/memory.ts";
import { styleBlock } from "../_shared/agent/style.ts";
import type { AlertStore } from "../_shared/career_alert_store.ts";
import type { MailStore } from "../_shared/career_mail_store.ts";
import type { DigestStore, InterviewStore } from "../_shared/career_brief_store.ts";
import type { AlertPrefs } from "../_shared/career_alerts.ts";
import { type CareerEvent, type EventStore, SUMMARY_UNREADABLE, threadSummary } from "../_shared/agent/timeline.ts";

export function chooseBrain(env: { get(k: string): string | undefined }): "agent" | "router" {
  return env.get("CAREER_BRAIN") === "agent" ? "agent" : "router";
}

// What a person erased never reaches the model again: newest-first rows are cut at the latest erase confirmation (the
// host's career_profile_erased turn), which is itself left out.
export function afterErase<T extends { meta?: unknown }>(newestFirst: T[]): T[] {
  const i = newestFirst.findIndex((m) => (m.meta as any)?.intent === "career_profile_erased");
  return i < 0 ? newestFirst : newestFirst.slice(0, i);
}

// WO-023 B5 / WO-027: the model sees the last 40 messages. The handler reads 41 rows newest first; past the latest erase
// nothing is kept (afterErase), and when more than 40 remain the thread is longer than the window, so a summary written
// in code from the account's events goes into the system prompt after the person block.
export const HISTORY_WINDOW = 40;
export function historyWindow(newestFirst: { role: string; content: unknown; meta?: unknown }[]): { history: { role: "user" | "assistant"; content: string }[]; cut: boolean } {
  const kept = afterErase(newestFirst);
  return {
    cut: kept.length > HISTORY_WINDOW,
    history: kept.slice(0, HISTORY_WINDOW).reverse()
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content as string })),
  };
}
// The summary when the window cut the thread, from the account's events (null: they could not be read, which is said).
export function summaryFor(cut: boolean, events: CareerEvent[] | null, now: number, tz?: string): string | null {
  if (!cut) return null;
  return events ? threadSummary(events, now, tz) : SUMMARY_UNREADABLE;
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
  // WO-024: applications and the status events found in the person's mail, for where_do_i_stand.
  mail?: Pick<MailStore, "applications" | "events"> | null;
  // WO-027: the account's timeline (written by the tools, read by recall), and the summary of what the window cut.
  events?: EventStore | null;
  summary?: string | null;
  // WO-034: a pasted invite is kept here (brief_from_invite), and the weekly digest's settings (set_weekly_digest).
  interviews?: InterviewStore | null;
  digest?: DigestStore | null;
}): Promise<TurnResult> {
  const block = o.known ? personBlock({ profile: o.stores.profile, ...o.known }) : null;
  return runAgentTurn({
    system: careerSystemPrompt(localDay(o.now, o.tz)) + "\n\n" + styleBlock(o.message) + (block ? "\n\n" + block : "") + (o.summary ? "\n\n" + o.summary : ""),
    history: o.history.slice(-HISTORY_WINDOW).map((m) => ({ role: m.role, content: String(m.content ?? "") })),
    message: o.message,
    tools: careerTools({ postings: o.postings ?? (async () => []), alerts: o.alerts ?? null, memory: o.memory ?? null, events: o.events ?? null, tz: o.tz, mail: o.mail ?? null, interviews: o.interviews ?? null, digest: o.digest ?? null }),
    model: o.model,
    ctx: { userId: o.userId, threadId: o.threadId, now: o.now, state: o.stores },
  });
}
