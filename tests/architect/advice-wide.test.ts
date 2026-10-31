// ADVICE DEPTH (2026-10-30): the 340-seed deterministic grader must stay clean, and the open-question router must catch the phrasings
// "what does it take to become X", "is X worth it", "should I major in X" while leaving company-specific asks to code.
//   deno test -A --no-check tests/architect/advice-wide.test.ts
import assertNode from "node:assert/strict";
import * as core from "../../supabase/functions/_shared/router_core.career.js";
import { CareerHost } from "../../supabase/functions/_shared/career_host.js";
import { stagedDecision } from "../../supabase/functions/agent-chat/career_staged.ts";
import { CTXS, gradeSeed, OCCS, summarize, wideSeeds } from "../../evals/career/advice-wide.ts";

const host = (CareerHost as any).createCareerHost({ CareerAccess: (core as any).CareerAccess, CareerOnboarding: (core as any).CareerOnboarding, CareerRouter: (core as any).CareerRouter, CareerDoorstep: (core as any).CareerDoorstep, CareerReply: (core as any).CareerReply, CareerContainment: (core as any).CareerContainment });
const ctx = () => host.createTurnCtx({ userId: "u-w", threadId: "t-w", now: Date.UTC(2026, 9, 30, 15), snapshot: null, accountPersistence: true });
const ON = { get: (k: string) => ({ CAREER_BRAIN: "staged", CAREER_KNOWLEDGE: "on" } as Record<string, string>)[k] };
const decide = (m: string) => stagedDecision({ env: ON, message: m, ctx: ctx(), host, structured: false });

Deno.test("AW-1 340 seeds across fields, ages and stages: every seed clean on route, field, stage, overlay, paragraph and brief", async () => {
  const seeds = wideSeeds();
  assertNode.ok(seeds.length >= 300);
  const groups = new Set(seeds.map((s) => s.group));
  for (const g of ["high school", "grad", "40+", "military to civilian", "career changer", "new grad", "student", "laid off"]) assertNode.ok(groups.has(g), g);
  assertNode.ok(OCCS.length >= 40 && CTXS.length >= 20);
  const rows = []; for (const s of seeds) rows.push(await gradeSeed(s));
  const sum = summarize(rows);
  assertNode.deepStrictEqual(sum.causes, [], JSON.stringify(sum.causes));
});

Deno.test("AW-2 open phrasings the old regex missed go to the brain", () => {
  for (const m of ["what does it take to become a nurse?", "is nursing worth it?", "should I major in computer science?", "what's the path to becoming an electrician?",
    "how long does it take to become a lawyer?", "do I need a degree to be a paralegal?", "is it too late for me to become a teacher? I'm 45", "where do I even start if I want to be a pilot?",
    "I'm a junior in high school. Is engineering a good career?", "should I go into accounting?"]) {
    const d = decide(m); assertNode.ok(d.brain && ["open_career_question", "question"].includes(d.reason), `${m}: ${d.reason}/${d.intent}`);
  }
});

Deno.test("AW-3 company-specific, posting and action asks stay with code", () => {
  for (const m of ["is Stripe worth it?", "should I go into the interview at Goldman Sachs?", "what does it take to get hired at Goldman Sachs as an analyst?", "apply to the Backend Software Engineer role at Ironstack Payments", "find me nurse jobs in Chicago", "watch data analyst roles in Austin"]) {
    const d = decide(m); assertNode.notEqual(d.reason, "open_career_question", `${m}: ${d.reason}`);
  }
});
