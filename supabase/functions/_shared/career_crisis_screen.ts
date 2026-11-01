// Crisis screen, two layers (re-review of #354, 2026-11-01). Every inbound chat message is read by:
//   1. the deterministic list, CareerSafety.isDistress (packages/domain/139-career-safety.js, where its policy is
//      written), the same one the router's first check and 125's screen read; and
//   2. OpenAI's moderation endpoint (omni-moderation-latest, free; OpenAI only, owner rule), its self-harm,
//      self-harm/intent and self-harm/instructions categories.
// FAIL-SAFE: if either layer flags, the crisis reply wins. Moderation never blocks the conversation: it starts as soon as
// the message is known (beside the turn's own reads), and if it errors or has not answered within MODERATION_TIMEOUT_MS
// the list's verdict stands and the failure is logged (never the message text). The second layer is on with
// CAREER_CRISIS_MODERATION=on and OPENAI_API_KEY set: scripts/launch/trainee-go-live.sh sets the switch on every
// deploy, and test environments (which fake OpenAI's chat endpoint) leave it unset, so the list answers alone there.
// A list hit answers at once: there is nothing moderation could add to it.
import { CareerSafety } from "./router_core.career.js";

export const MODERATION_URL = "https://api.openai.com/v1/moderations";
export const MODERATION_MODEL = "omni-moderation-latest";
export const MODERATION_TIMEOUT_MS = 1500;
export const SELF_HARM_CATEGORIES = ["self-harm", "self-harm/intent", "self-harm/instructions"] as const;

export interface ModerationResult { flagged: boolean; categories: string[] }
// A moderation client: resolves the self-harm reading of one text, or rejects. It must honour the signal.
export type Moderate = (text: string, signal: AbortSignal) => Promise<ModerationResult>;
export type ModerationState = "flagged" | "clear" | "timeout" | "error" | "off" | "skipped";
export interface CrisisVerdict { distress: boolean; rules: boolean; moderation: ModerationState; categories: string[] }
type Env = { get(name: string): string | undefined };

export const rulesDistress = (message: string): boolean => (CareerSafety as { isDistress: (t: string) => boolean }).isDistress(message);

// The OpenAI client. Reads only the three self-harm categories; any other category is not this screen's business.
export function openAIModeration(o: { apiKey: string; fetch?: typeof fetch }): Moderate {
  const f = o.fetch ?? fetch;
  return async (text, signal) => {
    const res = await f(MODERATION_URL, {
      method: "POST", signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${o.apiKey}` },
      body: JSON.stringify({ model: MODERATION_MODEL, input: text }),
    });
    if (!res.ok) { await res.body?.cancel(); throw new Error(`moderation HTTP ${res.status}`); }
    const body = await res.json();
    const r = body?.results?.[0];
    if (!r || typeof r.categories !== "object" || r.categories === null) throw new Error("moderation: no result");
    const categories = SELF_HARM_CATEGORIES.filter((c) => r.categories[c] === true);
    return { flagged: categories.length > 0, categories };
  };
}

// The client agent-chat uses, or null when the second layer is off.
export function moderationFromEnv(env: Env, f?: typeof fetch): Moderate | null {
  const key = env.get("OPENAI_API_KEY") || "";
  if (!key || (env.get("CAREER_CRISIS_MODERATION") || "").toLowerCase() !== "on") return null;
  return openAIModeration({ apiKey: key, fetch: f });
}

// Start the screen for one message. The returned promise always resolves (never rejects) within the timeout.
export function crisisScreen(message: string, moderate: Moderate | null, opts: { timeoutMs?: number; log?: (line: string) => void } = {}): Promise<CrisisVerdict> {
  const log = opts.log ?? ((line: string) => console.error(line));
  const rules = rulesDistress(message);
  if (rules) return Promise.resolve({ distress: true, rules, moderation: moderate ? "skipped" : "off", categories: [] });
  if (!moderate || !String(message ?? "").trim()) return Promise.resolve({ distress: false, rules, moderation: "off", categories: [] });
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
    try { call = moderate(message, ctl.signal); } catch (e) { call = Promise.reject(e); }
    call.then(
      (r) => finish({ distress: rules || !!r.flagged, rules, moderation: r.flagged ? "flagged" : "clear", categories: r.categories ?? [] }),
      (e) => {
        if (!settled) log(`crisis screen: moderation failed (${e instanceof Error ? e.message : String(e)}); the list's verdict stands`);
        finish({ distress: rules, rules, moderation: "error", categories: [] });
      },
    );
  });
}
