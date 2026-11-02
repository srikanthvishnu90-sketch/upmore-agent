// RELEASE CONFIG (D-035, owner 2026-11-01: "Ship staged brain"): which brain a deployed agent-chat serves is part of the
// deployed SHA, not a hand-set secret. This file is reply code (it lives under supabase/functions/agent-chat/, which
// scripts/launch/reply-code.ts lists), so changing it needs a fresh reply-quality measurement before it can deploy, and
// the deploy standard's S3 reads it at each SHA to know which brain to measure (scripts/launch/deploy-standard.ts,
// servedBrainAt): the candidate's served brain against the deployed SHA's served brain.
//
//   PRODUCTION_BRAIN = "staged"   question, advice and conversation turns to the brain (career_staged.ts); every action,
//                                 the host's controls, structured requests and a model outage stay with code and the router.
//
// The one environment override is the EMERGENCY ROLLBACK, and it can only turn the brain off:
//
//   supabase secrets set CAREER_BRAIN=router --project-ref <ref>     every turn to the router at once, no deploy
//   supabase secrets unset CAREER_BRAIN --project-ref <ref>          back to PRODUCTION_BRAIN
//
// Any value other than the release brain itself (router, agent, a typo) serves the router: an override never turns on a
// brain the committed config did not ship, and a mistyped rollback still rolls back. CAREER_BRAIN=agent stays pinned off
// (career_brain.ts AGENT_BRAIN_RELEASED). Unset, or set to the release brain: PRODUCTION_BRAIN. The rollback is temporary;
// the lasting change is a reviewed commit that sets PRODUCTION_BRAIN = "router" and passes the deploy standard (D-034).
// CAREER_BRAIN_ROUTER_INTENTS (career_staged.ts) still keeps single turn classes on the router.

type Env = { get(k: string): string | undefined };

export type ServedBrain = "router" | "staged";

// The brain this commit serves in production. Read as text by deploy-standard.ts at any SHA: keep it one line, quoted.
export const PRODUCTION_BRAIN: ServedBrain = "staged";

// The environment variable of the emergency rollback, and the only value it is documented to take.
export const ROLLBACK_ENV = "CAREER_BRAIN";
export const ROLLBACK_VALUE = "router";

// The brain served for this environment: PRODUCTION_BRAIN unless the rollback override is set.
export function servedBrain(env: Env, release: ServedBrain = PRODUCTION_BRAIN): ServedBrain {
  const v = (env.get(ROLLBACK_ENV) ?? "").trim().toLowerCase();
  if (!v || v === release) return release;
  return "router";
}

// PRODUCTION_BRAIN as written in a copy of this file (the deploy standard reads it at a SHA with git show). A SHA without
// this file predates D-035 and served the router (CAREER_BRAIN unset in production; 33f7d00, run 41233949107): null here,
// "router" at the caller. A file whose value cannot be read is an error, never a guess.
export function parseProductionBrain(text: string): ServedBrain {
  const m = /^export const PRODUCTION_BRAIN(?:\s*:\s*ServedBrain)?\s*=\s*"(router|staged)"\s*;/m.exec(text);
  if (!m) throw new Error("release_config.ts: PRODUCTION_BRAIN is not one quoted router|staged line");
  return m[1] as ServedBrain;
}
export const RELEASE_CONFIG_PATH = "supabase/functions/agent-chat/release_config.ts";

// TEXTING VOICE (owner ruling 2026-10-31: changes he is confident improve quality at scale are approved; architect order
// 2026-11-01, D-036): the channel-native texting voice (_shared/channel_voice.ts: links alone on their own line, short
// bubbles split between sentences, no markdown on SMS and iMessage, readable dates) is part of the deployed SHA too, on
// by default. The 1v1 against hand-written gold (docs/architect/ONE-V-ONE-2026-11-01.md) passes more scenarios with it on
// than off and none fewer. The one environment override is the rollback, and it can only turn the voice off:
//
//   supabase secrets set CAREER_TEXTING_NATIVE=off --project-ref <ref>     every adapter renders as before, no deploy
//   supabase secrets unset CAREER_TEXTING_NATIVE --project-ref <ref>       back to PRODUCTION_TEXTING_NATIVE
//
// Unset, "on", or any value but "off": PRODUCTION_TEXTING_NATIVE. With PRODUCTION_TEXTING_NATIVE = "off" no environment
// value turns the voice on. The lasting rollback is a reviewed commit that sets it to "off".
export type TextingVoice = "on" | "off";
export const PRODUCTION_TEXTING_NATIVE: TextingVoice = "on";
export const TEXTING_ROLLBACK_ENV = "CAREER_TEXTING_NATIVE";
export const TEXTING_ROLLBACK_VALUE = "off";

export function servedTextingVoice(env: Env, release: TextingVoice = PRODUCTION_TEXTING_NATIVE): TextingVoice {
  if (release === "off") return "off";
  const v = (env.get(TEXTING_ROLLBACK_ENV) ?? "").trim().toLowerCase();
  return v === TEXTING_ROLLBACK_VALUE ? "off" : "on";
}
