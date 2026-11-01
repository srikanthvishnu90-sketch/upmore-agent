// Crisis screen, two layers (re-review of #354, 2026-11-01). Every inbound chat message is read by:
//   1. the deterministic list, CareerSafety.isDistress (packages/domain/139-career-safety.js, where its policy is
//      written), the same one the router's first check and 125's screen read; and
//   2. OpenAI's moderation endpoint (omni-moderation-latest, free; OpenAI only, owner rule), its self-harm,
//      self-harm/intent and self-harm/instructions categories, through model_gateway.ts moderate() (the one door to
//      OpenAI: the key, the kill switch and the only unreserved send live there; this module holds no URL or key).
// FAIL-SAFE: if either layer flags, the crisis reply wins. Moderation never blocks the conversation: it starts as soon as
// the message is known (beside the turn's own reads), and if it errors or has not answered within MODERATION_TIMEOUT_MS
// the list's verdict stands and the failure is logged (never the message text). The second layer is on with
// CAREER_CRISIS_MODERATION=on (the gateway needs its key too): scripts/launch/trainee-go-live.sh sets the switch on every
// deploy, and test environments (which fake OpenAI's chat endpoint) leave it unset, so the list answers alone there.
// A list hit answers at once: there is nothing moderation could add to it.
import { CareerSafety } from "./router_core.career.js";
import { moderate } from "./model_gateway.ts";

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

// The client agent-chat uses, or null when the second layer is off. On with CAREER_CRISIS_MODERATION=on, which
// scripts/launch/trainee-go-live.sh sets on every deploy. Left unset in test environments: their OpenAI fakes count every
// request to api.openai.com, so a moderation call there would read as a model call.
export function moderationFromEnv(env: { get(name: string): string | undefined }, door?: ModerateDoor): Moderate | null {
  return (env.get("CAREER_CRISIS_MODERATION") || "").toLowerCase() === "on" ? gatewayModeration(door) : null;
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
