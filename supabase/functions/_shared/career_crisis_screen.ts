// Crisis screen, two layers (re-review of #354, 2026-11-01). Every inbound chat message is read by:
//   1. the deterministic list, CareerSafety.isDistress (packages/domain/139-career-safety.js, where its policy is
//      written), the same one the router's first check and 125's screen read; and
//   2. OpenAI's moderation endpoint (omni-moderation-latest, free; OpenAI only, owner rule), its self-harm,
//      self-harm/intent and self-harm/instructions categories, through model_gateway.ts moderate() (the one door to
//      OpenAI: the key, the kill switch and the only unreserved send live there; this module holds no URL or key).
// FAIL-SAFE: if either layer flags, the crisis reply wins. Moderation never blocks the conversation: it starts as soon as
// the message is known (beside the turn's own reads), and if it errors or has not answered within MODERATION_TIMEOUT_MS
// the list's verdict stands and the failure is logged (never the message text). A list hit answers at once.
//
// ARCHITECT DECISION (2026-11-02): moderation is the PRIMARY layer; a word list overfits to the phrasings it has seen
// (evals/crisis/: the sealed corpus measures both layers). It is ON BY DEFAULT from this committed release constant, not
// from a deploy script; the one environment override is the EMERGENCY DISABLE, CAREER_CRISIS_MODERATION=off. (This
// constant moves into agent-chat/release_config.ts once that file lands, #371.) With no OpenAI key the list answers
// alone and one loud error line says so per cold start.
import { CareerSafety } from "./router_core.career.js";
import { moderate, moderationConfigured } from "./model_gateway.ts";

export const MODERATION_TIMEOUT_MS = 1500;
export const SELF_HARM_CATEGORIES = ["self-harm", "self-harm/intent", "self-harm/instructions"] as const;

export interface ModerationResult { flagged: boolean; categories: string[] }
// A moderation client: resolves the self-harm reading of one text, or rejects. It must honour the signal.
export type Moderate = (text: string, signal: AbortSignal) => Promise<ModerationResult>;
export type ModerationState = "flagged" | "clear" | "timeout" | "error" | "off" | "skipped";
export interface CrisisVerdict { distress: boolean; rules: boolean; moderation: ModerationState; categories: string[] }
type Env = { get(name: string): string | undefined };

export const rulesDistress = (message: string): boolean => (CareerSafety as { isDistress: (t: string) => boolean }).isDistress(message);

// A moderation response body (OpenAI's shape: results[0].categories) read for the three self-harm categories only; any
// other category is not this screen's business. Throws on a body with no result, so the caller falls back to the list.
export function readModeration(body: unknown): ModerationResult {
  const r = (body as { results?: { categories?: Record<string, unknown> }[] } | null)?.results?.[0];
  if (!r || typeof r.categories !== "object" || r.categories === null) throw new Error("moderation: no result");
  const categories = SELF_HARM_CATEGORIES.filter((c) => r.categories![c] === true);
  return { flagged: categories.length > 0, categories };
}

// The client: model_gateway.ts's moderation door (the one door to OpenAI; it reads the key and honours the kill switch).
export type ModerateDoor = (text: string, o: { signal?: AbortSignal; timeoutMs?: number }) => Promise<unknown>;
export function gatewayModeration(door: ModerateDoor = moderate): Moderate {
  return async (text, signal) => readModeration(await door(text, { signal, timeoutMs: MODERATION_TIMEOUT_MS }));
}

// The release: moderation on. Read as text by tests; keep it one quoted line.
export const PRODUCTION_CRISIS_MODERATION: "on" | "off" = "on";
export const CRISIS_MODERATION_DISABLE_ENV = "CAREER_CRISIS_MODERATION";
let warnedNoKey = false;
// THE ONE READ of the release flag. When the release-flags PR lands, this body becomes
//   return releaseFlagOn(env, "CAREER_CRISIS_MODERATION");   (import from ../agent-chat/release_config.ts)
// and this file goes into RELEASE_FLAG_PATHS in scripts/launch/reply-code.ts. Same meaning: on unless rolled back (=off).
export function moderationReleaseOn(env: Env, release: "on" | "off" = PRODUCTION_CRISIS_MODERATION): boolean {
  return release === "on" && (env.get(CRISIS_MODERATION_DISABLE_ENV) || "").trim().toLowerCase() !== "off";
}
// The client agent-chat uses, or null when the second layer is off: the release constant, unless the emergency disable is
// set (CAREER_CRISIS_MODERATION=off); without a key it is off and says so loudly, once per cold start.
export function moderationFromEnv(env: Env, door?: ModerateDoor, o: { release?: "on" | "off"; log?: (line: string) => void } = {}): Moderate | null {
  if (!moderationReleaseOn(env, o.release)) return null;
  if (!door && !moderationConfigured(env)) {
    if (!warnedNoKey) { warnedNoKey = true; (o.log ?? ((l: string) => console.error(l)))("CRISIS SCREEN DEGRADED: no OpenAI key, so the moderation layer is OFF and the word list alone screens for crisis messages. Set the key."); }
    return null;
  }
  return gatewayModeration(door);
}

// Start the screen for one message. The returned promise always resolves (never rejects) within the timeout.
export function crisisScreen(message: string, client: Moderate | null, opts: { timeoutMs?: number; log?: (line: string) => void } = {}): Promise<CrisisVerdict> {
  const log = opts.log ?? ((line: string) => console.error(line));
  const rules = rulesDistress(message);
  if (rules) return Promise.resolve({ distress: true, rules, moderation: client ? "skipped" : "off", categories: [] });
  if (!client || !String(message ?? "").trim()) return Promise.resolve({ distress: false, rules, moderation: "off", categories: [] });
  const ctl = new AbortController();
  return new Promise<CrisisVerdict>((resolve) => {
    let settled = false;
    const finish = (v: CrisisVerdict) => { if (settled) return; settled = true; clearTimeout(timer); resolve(v); };
    const timer = setTimeout(() => {
      log(`crisis screen: moderation timed out after ${opts.timeoutMs ?? MODERATION_TIMEOUT_MS} ms; the list's verdict stands`);
      ctl.abort();
      finish({ distress: rules, rules, moderation: "timeout", categories: [] });
    }, opts.timeoutMs ?? MODERATION_TIMEOUT_MS);
    let call: Promise<ModerationResult>;
    try { call = client(message, ctl.signal); } catch (e) { call = Promise.reject(e); }
    call.then(
      (r) => finish({ distress: rules || !!r.flagged, rules, moderation: r.flagged ? "flagged" : "clear", categories: r.categories ?? [] }),
      (e) => {
        if (!settled) log(`crisis screen: moderation failed (${e instanceof Error ? e.message : String(e)}); the list's verdict stands`);
        finish({ distress: rules, rules, moderation: "error", categories: [] });
      },
    );
  });
}
