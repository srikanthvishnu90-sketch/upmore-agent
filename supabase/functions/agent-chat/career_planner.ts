// Task intelligence at the handler (TASK-INTELLIGENCE-SPEC-2026-10-27 §5, P1 behind a flag): with CAREER_PLANNER=on (and,
// when CAREER_PLANNER_USERS is set, only for those accounts), a turn goes to the planner on the agent brain before the
// code-first chain; a turn it does not claim (conversation, advice, a model outage, an answer to a code-first prompt that
// is this thread's last word, anything today's router owns) falls through to today's handler unchanged. Off (the
// default), nothing here runs and no turn changes. The planner's facts are worded by the reply writer (V1); until V1 is on
// trunk, by the interim writer in _shared/task/writer.ts.
// deno-lint-ignore-file no-explicit-any
import { plannerTurn, PLAN_CARD_INTENT, PLAN_INTENT, type PlannerIO } from "../_shared/task/planner.ts";
import { registry, type TaskDeps } from "../_shared/task/registry.ts";
import { supabasePlanStore } from "../_shared/task/store.ts";
import { grantsConnector } from "../_shared/task/connectors.ts";
import { interimModelWriter, type ReplyWriter } from "../_shared/task/writer.ts";
import type { FactKey } from "../_shared/task/contract.ts";
import { CARD_INTENT } from "../_shared/career_apply_cards.ts";
import { MOCK_INTENT } from "../_shared/career_mock.ts";
import { QUESTIONS_INTENT } from "../_shared/career_apply_questions.ts";
import { CONFIRM_INTENT } from "../_shared/career_apply_confirm.ts";
import { EMAIL_INTENT } from "../_shared/career_apply_email.ts";
import { OUTREACH_INTENT, type OutreachStore } from "../_shared/career_outreach.ts";
import { CLOUD_CARD_INTENT } from "../_shared/career_cloud_card_chat.ts";
import { EMPLOYER_ASK_INTENT } from "../_shared/career_apply_chat.ts";
import { FOLLOWUP_CARD_INTENT } from "../_shared/career_inbox_followups.ts";
import { supabaseWantStore } from "../_shared/career_apply_want.ts";
import { supabaseApplications } from "../_shared/career_apply_status.ts";
import { supabasePostingsDb } from "../_shared/career_ingest.ts";
import { contactsOf } from "../_shared/career_contacts.ts";
import { hasConfirmedResume, resumeOnFileReader } from "../_shared/career_apply_from_chat.ts";
import type { Situation } from "../_shared/career_situation.ts";

export { PLAN_CARD_INTENT, PLAN_INTENT };
type Env = { get(k: string): string | undefined };

// The switch: per person and reversible (spec §5).
export function plannerOn(env: Env, userId: string): boolean {
  if (String(env.get("CAREER_PLANNER") ?? "").trim().toLowerCase() !== "on") return false;
  const allow = String(env.get("CAREER_PLANNER_USERS") ?? "").split(/[\s,]+/).filter(Boolean);
  return !allow.length || allow.includes(userId);
}
// Today's code-first prompts that wait for the person's answer: while one is this thread's last word, the answer is theirs.
export const DEFER_INTENTS: readonly string[] = [CARD_INTENT, MOCK_INTENT, QUESTIONS_INTENT, CONFIRM_INTENT, EMAIL_INTENT, OUTREACH_INTENT, CLOUD_CARD_INTENT, EMPLOYER_ASK_INTENT, FOLLOWUP_CARD_INTENT];

// The lanes' interfaces, from this request's service client. What is not on this build stays null (NOT_WIRED).
export function handlerDeps(admin: any, o: { userId: string; ctx: Record<string, unknown>; model: PlannerIO["model"]; outreach: OutreachStore; situation: Situation | null }): TaskDeps {
  const store = supabasePlanStore(admin);
  return {
    profile: () => (o.ctx as any).profile ?? {},
    situation: () => o.situation,
    postings: supabasePostingsDb(admin),
    wants: supabaseWantStore(admin),
    applications: supabaseApplications(admin),
    applyCards: {
      async prepared(userId, jobIds) {
        if (!jobIds.length) return [];
        const r = await admin.from("career_apply_prepared").select("id,job_id,company,url,payload_hash,card_lines,state").eq("user_id", userId).in("job_id", jobIds);
        if (r.error) throw new Error(`read prepared applications: ${r.error.message}`);
        return r.data ?? [];
      },
      // The database's own hash-bound approval (lane B's card RPCs): a card of this one prepared application, approved.
      async approve(userId, preparedId) {
        const c = await admin.rpc("career_apply_card_open_as", { p_user: userId, p_ids: [preparedId] });
        if (c.error) return { result: "refused" };
        const a = await admin.rpc("career_apply_card_answer_as", { p_user: userId, p_card: c.data?.id, p_approve: [1] });
        if (a.error) return { result: "refused" };
        return { result: String((Array.isArray(a.data) ? a.data[0] : null)?.result ?? "refused") };
      },
      async jobs(userId, jobIds) {
        const r = await admin.from("career_apply_jobs").select("job_id,state,approval_hash").eq("user_id", userId).in("job_id", jobIds);
        if (r.error) throw new Error(`read applications: ${r.error.message}`);
        return r.data ?? [];
      },
    },
    contacts: () => contactsOf(o.ctx),
    discover: null, // M2/N1: web search + public pages (D-MN-3 replaced) — not on this build
    outreach: { store: o.outreach, model: o.model },
    mail: null, // M1/M4: the send rail (PR #226 mailRail) — not on this build
    compose: o.model,
    threads: null, // M5: the conversation reader — not on this build
    calendar: null, // M5: free/busy and invites — not on this build
    connectors: { require: grantsConnector(admin), disconnect: null }, // K1's requireConnector when it lands
    plans: async () => (await store.openPlans(o.userId, 5)).map((p) => ({ goal: p.plan.goal, status: p.plan.status, steps: p.steps.map((s) => ({ capability: s.capability, status: s.status })) })),
  };
}

// Code's read of the person's record for each requirement (never the model's).
export function handlerFacts(admin: any, o: { userId: string; ctx: Record<string, unknown>; outreach: OutreachStore }): PlannerIO["facts"] {
  const onFile = resumeOnFileReader(admin, o.userId);
  return {
    async has(k: FactKey) {
      const profile = (o.ctx as any).profile ?? {};
      if (k === "resume.confirmed") return hasConfirmedResume(profile) ? true : await onFile();
      if (k === "profile.facts") return (Array.isArray(profile.facts) && profile.facts.some((f: any) => f?.status === "confirmed")) ? true : await onFile();
      if (k === "outreach.signature") return !!String((await o.outreach.prefs(o.userId).catch(() => ({ signature: null })))?.signature ?? "").trim();
      return null;
    },
  };
}

export async function plannerHandlerTurn(o: {
  admin: any; userId: string; threadId: string; channel: string; message: string; attachments: { name: string }[];
  ctx: Record<string, unknown>; model: PlannerIO["model"]; outreach: OutreachStore; situation: Situation | null; writer?: ReplyWriter | null;
}): Promise<{ reply: string; parts?: string[]; intent: string; resultStatus: string; meta: Record<string, unknown> } | null> {
  const io: PlannerIO = {
    store: supabasePlanStore(o.admin), registry: registry(), model: o.model,
    deps: handlerDeps(o.admin, { userId: o.userId, ctx: o.ctx, model: o.model, outreach: o.outreach, situation: o.situation }),
    userId: o.userId, threadId: o.threadId, channel: o.channel, now: Date.now, worker: `chat:${crypto.randomUUID()}`,
    lastIntent: async () => {
      const r = await o.admin.from("agent_messages").select("meta").eq("thread_id", o.threadId).eq("role", "assistant").order("id", { ascending: false }).limit(1);
      return r.error ? null : ((r.data?.[0]?.meta as any)?.intent ?? null);
    },
    facts: handlerFacts(o.admin, { userId: o.userId, ctx: o.ctx, outreach: o.outreach }),
    defer: DEFER_INTENTS,
  };
  const r = await plannerTurn(io, o.message, { attachments: o.attachments });
  if (!r.claimed) return null;
  const said = await (o.writer ?? interimModelWriter(o.model))(r.facts, { message: o.message, channel: o.channel });
  return { reply: said.text, ...(said.parts ? { parts: said.parts } : {}), intent: r.intent, resultStatus: r.facts.plan?.status ?? r.facts.kind,
    meta: { planner: { plan_id: r.facts.plan?.id ?? null, steps: r.facts.steps.map((s) => `${s.capability}:${s.status}`), card: r.facts.card?.items.length ?? 0, not_wired: r.facts.not_wired.map((n) => n.capability) } } };
}
