// FEATURE 13 (owner, 2026-10-25): the staged release of the agent brain. CAREER_BRAIN=staged sends to the brain only the
// turns that are questions, advice or conversation: a turn no code-first turn in handler-career.ts claimed, and that the
// router itself would answer with no action and no code product (nothing claimed it, or it fell to an advice or
// catch-all reply). Every action stays code's: the code-first turns, the host's controls, structured task and batch
// requests, and every router turn that is not on the list below. The router still answers when the model fails, and the
// owner keeps any turn class on the router by naming it in CAREER_BRAIN_ROUTER_INTENTS (comma separated; "unclaimed"
// is the class of turns no module claimed). Unset, or CAREER_BRAIN=router (the kill switch), nothing here is true and
// the router answers every turn exactly as before. CAREER_BRAIN=agent stays pinned off by AGENT_BRAIN_RELEASED.
//
// How a turn is classed: the router runs once on a disposable copy of the turn's state (no I/O; the real state is not
// touched), and its intent decides. A turn the brain does not take runs through the router again on the real state, as
// it does today, so what the router saves is exactly what it saved before.

type Env = { get(k: string): string | undefined };
type Host = { runTurn(text: string, ctx: any): { intent: string | null; handler: string | null; contained?: boolean; result?: any }; isHostControlled(text: string, ctx: any): boolean };

export type BrainMode = "router" | "agent" | "staged";
export function brainMode(env: Env): BrainMode {
  const v = (env.get("CAREER_BRAIN") ?? "").trim().toLowerCase();
  return v === "staged" ? "staged" : v === "agent" ? "agent" : "router";
}

// The pseudo-intent of a turn that no module claimed (the router's "I didn't catch that").
export const UNCLAIMED = "unclaimed";
// The router's question, advice and conversation answers. Each is code's reply to a turn with no action in it; the
// brain answers those with the person's situation and its read tools. Actions (search, apply, watch, track, tailor,
// mock, outreach, onboarding, profile corrections, refusals, safety replies, a bare yes or no) are not here.
export const STAGED_BRAIN_INTENTS: readonly string[] = [
  UNCLAIMED,
  "career_catchall", "career_fallback", "career_out_of_scope", "career_greeting",
  "conversation_ack", "conversation_clarify",
  "career_guidance", "career_resume_guidance", "career_cover_letter_guidance", "career_field_decision", "career_offer_decision",
  "career_life_event", "career_next_step", "path_answer",
  // Taken only without a sourced record behind the answer (no company file, no benchmark, no offer on record): see
  // codeProduct. With one, the router's answer cites it and stays.
  "company_intel", "negotiation_advice",
];

// A router answer that carries a code product (a sourced company file, a benchmark with figures, the person's offer, a
// draft, a document, a plan record) is the router's: the brain would restate what code already cites, and facts about
// a company come only from a sourced record. Two intents are judged by what they carry: company_intel is the brain's
// only when no company is named and no file or library figure stands behind it (a general question the router took
// for a company ask: grad school, a certificate, a role it has no figures for); negotiation_advice only when no offer
// is on record and the benchmark found no figures.
const PRODUCT_KEYS = ["payload", "artifact", "bench", "offer", "draft", "ai_answer", "comparison", "documents", "document", "company"];
const has = (r: Record<string, unknown>, k: string) => r[k] !== undefined && r[k] !== null;
export function codeProduct(intent: string, result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const r = result as Record<string, any>;
  if (intent === "company_intel") {
    if (has(r, "company") || has(r, "comparison")) return true;
    const kind = String(r.payload?.kind ?? "");
    return !(has(r, "guidance") || /_absent$/.test(kind));
  }
  if (intent === "negotiation_advice") {
    if (has(r, "offer")) return true;
    const figures = r.bench?.figures;
    return Array.isArray(figures) ? figures.length > 0 : has(r, "bench");
  }
  return PRODUCT_KEYS.some((k) => has(r, k));
}

export function routerKept(env: Env): Set<string> {
  return new Set(String(env.get("CAREER_BRAIN_ROUTER_INTENTS") ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean));
}

// A disposable copy of a turn's state for the probe: every plain value deep-copied, so nothing the router writes during
// the probe reaches the real turn. A value that cannot be copied (an object holding a function, such as the batch
// board seam) is copied one level. The probe's containment records are its own.
export function probeCtx<T extends Record<string, unknown>>(ctx: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (k === "containmentRecords") { out[k] = []; continue; }
    try { out[k] = structuredClone(v); } catch { out[k] = v && typeof v === "object" ? (Array.isArray(v) ? [...v] : { ...(v as object) }) : v; }
  }
  return out as T;
}

export type StagedDecision = { brain: boolean; mode: BrainMode; intent: string | null; reason: string };

// Whether this turn goes to the brain in staged mode. Called only after every code-first turn has passed on it.
export function stagedDecision(o: { env: Env; message: string; ctx: Record<string, unknown>; host: Host; structured: boolean }): StagedDecision {
  const mode = brainMode(o.env);
  if (mode !== "staged") return { brain: false, mode, intent: null, reason: "not_staged" };
  if (o.structured) return { brain: false, mode, intent: null, reason: "structured_request" };
  if (o.host.isHostControlled(o.message, o.ctx)) return { brain: false, mode, intent: null, reason: "host_control" };
  let probe, records: any[] = [];
  try { const copy = probeCtx(o.ctx); probe = o.host.runTurn(o.message, copy); records = Array.isArray(copy.containmentRecords) ? copy.containmentRecords as any[] : []; }
  catch { return { brain: false, mode, intent: null, reason: "probe_failed" }; }
  let intent: string | null;
  if (probe.contained) {
    // Containment answers two ways: no module claimed the turn (null_result, the router's "I didn't catch that"), which
    // is the brain's; or a module claimed it and crashed, which stays the router's contained reply.
    if (records.at(-1)?.boundary !== "null_result") return { brain: false, mode, intent: null, reason: "router_contained" };
    intent = UNCLAIMED;
  } else intent = probe.intent ?? null;
  if (!intent) return { brain: false, mode, intent: null, reason: "router_claimed" };
  if (routerKept(o.env).has(intent)) return { brain: false, mode, intent, reason: "kept_on_router" };
  if (!STAGED_BRAIN_INTENTS.includes(intent)) return { brain: false, mode, intent, reason: "action" };
  if (codeProduct(intent, probe.result)) return { brain: false, mode, intent, reason: "code_product" };
  return { brain: true, mode, intent, reason: "question" };
}

// Tool policy for the staged brain, at the boundary. No tool has an external effect (the loop never runs one). Withheld:
// the tools whose action has a code-first owner on the live path, so there is one writer each, and a paid check.
//   queue_applications  "apply to ..." is code's (applyTurn: the employer guard and the person's own pace).
//   set_job_alerts, stop_job_alerts  the watch bridge is the one writer of career_alert_prefs (D-032).
//   verify_contacts     a paid provider check (Hunter): no new spend without the owner.
export const STAGED_WITHHELD_TOOLS: readonly string[] = ["queue_applications", "set_job_alerts", "stop_job_alerts", "verify_contacts"];
export const STAGED_PROMPT_NOTE = "In this conversation you answer questions and give advice. Applying to a posting, starting or stopping job alerts, " +
  "and checking contacts are done by code when the person asks for them in their own words, for example \"apply to the <role> role at <company>\" " +
  "or \"watch <role> roles in <city>\". You cannot do those here; say so plainly when asked, and never say they were done.";
export const STAGED_TOOL_POLICY = { withhold: STAGED_WITHHELD_TOOLS, note: STAGED_PROMPT_NOTE } as const;

// Lazy and memoized: the probe runs only when the handler reaches the brain test, at most once a turn.
export function stagedRoute(o: { env: Env; message: string; ctx: Record<string, unknown>; host: Host; structured: boolean }) {
  let d: StagedDecision | null = null;
  return {
    toBrain(): boolean { d ??= stagedDecision(o); return d.brain; },
    get decision(): StagedDecision | null { return d; },
    get chosen(): boolean { return !!d?.brain; },
  };
}
