// Which brain answers a career turn (WO-002, D-008): the CareerHost router unless CAREER_BRAIN=agent, and the agent turn
// itself (model + tools over the person's career state).
import type { LinkCheck } from "../_shared/link_check.ts";
import { runAgentTurn, type ModelFn, type TurnResult } from "../_shared/agent/loop.ts";
import { careerTools, type OutreachDeps, type TailorTools } from "../_shared/agent/career_tools.ts";
import { importContactsFile, MX_NOT_WIRED, type MxResolver, type Verifier } from "../_shared/career_contacts.ts";
import { careerSystemPrompt } from "../_shared/agent/prompt.ts";
import { type MemoryStore, type Pipeline, personBlock, type Standing } from "../_shared/agent/memory.ts";
import { styleBlock } from "../_shared/agent/style.ts";
import type { AlertStore } from "../_shared/career_alert_store.ts";
import type { HiredSource } from "../_shared/career_hired.ts";
import type { WantStore } from "../_shared/career_apply_want.ts";
import type { Limits } from "../_shared/career_apply.ts";
import type { MailStore } from "../_shared/career_mail_store.ts";
import type { DigestStore, InterviewStore } from "../_shared/career_brief_store.ts";
import type { AlertPrefs } from "../_shared/career_alerts.ts";
import type { Situation } from "../_shared/career_situation.ts";
import { type CareerEvent, type EventStore, SUMMARY_UNREADABLE, threadSummary } from "../_shared/agent/timeline.ts";

// Release pin (2026-10-22 candidate, the parent's gate): the deployed agent-chat cannot select the agent brain, whatever
// CAREER_BRAIN holds. The brain stays off until it meets the 95% two-judge held-out bar; turning this on is a separate,
// reviewed change, never a secret flip. chooseBrain still states the rule the switch would follow.
// FEATURE 13 (owner, 2026-10-25): the staged release is the reviewed path past this pin. CAREER_BRAIN=staged sends only
// question, advice and conversation turns to the brain, with the tool policy in career_staged.ts; every action stays
// code's. The full brain (CAREER_BRAIN=agent, every turn) stays pinned off here.
export const AGENT_BRAIN_RELEASED = false;

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

export async function agentTurn(o: {
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
  // WO-100: the situation (every task in flight, the next steps, what Trainee can do), read once per turn by the handler;
  // it is in the block and behind get_situation, list_applications and where_do_i_stand.
  known?: { standing: Standing[]; alerts: { prefs: AlertPrefs; tz: string } | null; pipeline: Pipeline | null; situation?: Situation | null };
  memory?: MemoryStore | null;
  // WO-024: applications and the status events found in the person's mail, for where_do_i_stand.
  mail?: Pick<MailStore, "applications" | "events"> | null;
  // WO-027: the account's timeline (written by the tools, read by recall), and the summary of what the window cut.
  events?: EventStore | null;
  summary?: string | null;
  // WO-034: a pasted invite is kept here (brief_from_invite), and the weekly digest's settings (set_weekly_digest).
  interviews?: InterviewStore | null;
  digest?: DigestStore | null;
  // WO-033: outreach drafts and settings, and the files the person attached. A contacts CSV is imported and checked by
  // code before the model runs (a 2,000-row export never goes through the model); the model is told what was imported.
  outreach?: OutreachDeps | null;
  conversations?: import("../_shared/career_outreach_replies.ts").RepliesStore | null; // MASS NETWORKING M5
  attachments?: { name: string; mime: string; text: string | null }[];
  mx?: MxResolver;
  verifier?: Verifier | null; // the paid independent check (Hunter), run by verify_contacts; absent: NOT_WIRED
  // WO-028: the posting by id, personas, the private resume store and the PDF renderer.
  tailor?: TailorTools | null;
  // WO-036: who a firm hired, from People Data Labs aggregates (NOT_WIRED without the owner's PDL_API_KEY).
  hired?: HiredSource | null;
  // WO-066: the person's own apply queue (the extension takes it) and their daily application limit.
  wants?: WantStore | null;
  limits?: Limits;
  // WO-068: one posting in full by job_id (get_posting); absent, the tailor's own posting reader.
  posting?: ((jobId: string) => Promise<any | null>) | null;
  // WO-106 (F4): every job link checked just before it is shown.
  linkCheck?: LinkCheck | null;
  billing?: import("../_shared/trainee_billing.ts").BillingDeps | null;
  exporter?: import("../_shared/data_export.ts").ExportDeps | null;
  // FEATURE 13: the staged release's tool policy: tools withheld by name, and a note on what code does instead.
  toolPolicy?: { withhold: readonly string[]; note: string } | null;
}): Promise<TurnResult> {
  const block = o.known ? personBlock({ profile: o.stores.profile, ...o.known }) : null;
  const notes: string[] = [];
  for (const f of o.attachments ?? []) {
    const csv = /\.csv$/i.test(f.name) || /csv/.test(f.mime);
    notes.push(csv ? `[Attached file: ${(await importContactsFile(o.stores, f, o.mx ?? MX_NOT_WIRED)).note}]` : f.text !== null ? `[Attached file: ${f.name}]\n${f.text}` : `[Attached file: ${f.name} (${f.mime}): this file type can't be read yet]`);
  }
  return runAgentTurn({
    system: careerSystemPrompt(localDay(o.now, o.tz)) + "\n\n" + styleBlock(o.message) + (block ? "\n\n" + block : "") + (o.summary ? "\n\n" + o.summary : "") + (o.toolPolicy ? "\n\n" + o.toolPolicy.note : ""),
    history: o.history.slice(-HISTORY_WINDOW).map((m) => ({ role: m.role, content: String(m.content ?? "") })),
    message: [o.message, ...notes].filter(Boolean).join("\n\n"),
    tools: withheld(o.toolPolicy?.withhold, careerTools({ postings: o.postings ?? (async () => []), alerts: o.alerts ?? null, memory: o.memory ?? null, events: o.events ?? null, tz: o.tz, mail: o.mail ?? null, interviews: o.interviews ?? null, digest: o.digest ?? null, outreach: o.outreach ?? null, verifier: o.verifier ?? null, tailor: o.tailor ?? null, hired: o.hired ?? null, wants: o.wants ?? null, limits: o.limits, posting: o.posting ?? null, situation: o.known?.situation ?? null, linkCheck: o.linkCheck ?? null, billing: o.billing ?? null, exporter: o.exporter ?? null, conversations: o.conversations ?? null })),
    model: o.model,
    ctx: { userId: o.userId, threadId: o.threadId, now: o.now, state: o.stores },
  });
}

// FEATURE 13: the tools left after a policy withholds some by name (none withheld: every tool).
export function withheld<T extends { name: string }>(names: readonly string[] | undefined, tools: T[]): T[] {
  return names && names.length ? tools.filter((t) => !names.includes(t.name)) : tools;
}
