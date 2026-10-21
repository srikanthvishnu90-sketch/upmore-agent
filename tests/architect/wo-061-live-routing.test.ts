// WO-061 (live test of v246, 2026-10-21): "I didn't catch that" for account-state, preference, emotion and settings asks.
// Claim checked here, for the owner's independent judge to reproduce from the repo: with CAREER_BRAIN=agent, none of
// the tester's messages is host-controlled, so each reaches the agent brain (agent-chat/handler-career.ts sends a turn to
// the router only when career_task or career_batch is set, which come from structured request fields, never from text,
// or when the host controls it). Free: no model, no network.
//   deno test -A --no-check tests/architect/wo-061-live-routing.test.ts
import * as core from "../../supabase/functions/_shared/router_core.career.js";
import { CareerHost } from "../../supabase/functions/_shared/career_host.js";
import { chooseBrain } from "../../supabase/functions/agent-chat/career_brain.ts";

// QUOTED: the tester's exact words as the owner relayed them. STAND-IN: the owner described the ask without quoting
// it ("the overwhelmed message", "quiet-hours asks"); the builder wrote these stand-ins.
export const TESTER_INPUTS: { text: string; source: "quoted" | "stand-in" }[] = [
  { text: "what do you have on file for me?", source: "quoted" },
  { text: "forget my resume", source: "quoted" },
  { text: "where is my batch", source: "quoted" },
  { text: "show me job links", source: "quoted" },
  { text: "stop asking me for approval each time - just apply automatically", source: "quoted" },
  { text: "I'm so overwhelmed with all of this", source: "stand-in" },
  { text: "only text me between 9am and 6pm", source: "stand-in" },
  { text: "don't text me after 10pm", source: "stand-in" },
];

Deno.test("WO-061/L1 with CAREER_BRAIN=agent every tester message reaches the agent brain, none the router", () => {
  const env = { get: (k: string) => (k === "CAREER_BRAIN" ? "agent" : undefined) };
  if (chooseBrain(env as any) !== "agent") throw new Error("CAREER_BRAIN=agent does not choose the agent");
  const host = (CareerHost as any).createCareerHost({ CareerAccess: (core as any).CareerAccess, CareerOnboarding: (core as any).CareerOnboarding, CareerRouter: (core as any).CareerRouter, CareerDoorstep: (core as any).CareerDoorstep, CareerReply: (core as any).CareerReply, CareerContainment: (core as any).CareerContainment });
  for (const m of TESTER_INPUTS) {
    const ctx = host.createTurnCtx({ userId: "u1", threadId: "t1", now: Date.UTC(2026, 9, 21), snapshot: null });
    if (host.isHostControlled(m.text, ctx)) throw new Error(`host-controlled (goes to the router): "${m.text}"`);
  }
});

Deno.test("WO-061/L2 without CAREER_BRAIN=agent the router answers every turn (the live v246 state)", () => {
  if (chooseBrain({ get: () => undefined } as any) !== "router") throw new Error("an unset CAREER_BRAIN must choose the router");
});
