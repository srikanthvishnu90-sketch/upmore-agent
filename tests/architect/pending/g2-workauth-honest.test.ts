// Backend gap map G2 (owner, 2026-10-23: the work-authorization defect is a safety defect; every fact carries its
// source or stays unwritten). PENDING: the fix is in 142-career-router.js, the frozen router candidate, and waits for
// the coordinator's impact assessment; this file is excluded from the gate until it lands (tests/architect/pending).
//
// Found on trunk 63a1233f with the product's chat harness (CareerHost):
//  1. Polarity: "I do not require sponsorship" is stored needsSponsorship=false on trunk (WO-095). The 10-20 live
//     inversion predates that fix, which is not deployed. Kept here as a guard.
//  2. Honesty: for a person with no profile yet, "I'm authorized to work in the US and don't need visa sponsorship"
//     replies "Updated — I saved your corrected sponsorship answer to your profile" and "The prepared packet still
//     carries the old answer", while nothing is stored and no packet exists.
//  3. Provenance: the sponsorship clause is stored under constraints.workAuthorization; a statement about work
//     authorization itself is never captured as its own fact.
import assertNode from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const D = (n: string) => require(`../../../packages/domain/${n}`);
const { CareerHost } = require("../../../supabase/functions/_shared/career_host.js");
const host = CareerHost.createCareerHost({ CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"), CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"), CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js") });
let n = 0;
function turn(text: string) {
  n += 1;
  const ctx = host.createTurnCtx({ userId: `g2-${n}`, threadId: `g2-${n}`, now: Date.parse("2026-10-23T15:00:00Z"), snapshot: null, postings: [] });
  const out = host.runTurn(text, ctx);
  return { out, constraints: (ctx.profile || {}).constraints || null };
}

Deno.test("G2 guard: 'I do not require sponsorship' is never stored as needing sponsorship", () => {
  for (const t of ["I am a US citizen and I am authorized to work in the United States. I do not require sponsorship.", "I will not require sponsorship now or in the future", "I don't need visa sponsorship"]) {
    const { constraints } = turn(t);
    assertNode.notEqual(constraints?.needsSponsorship, true, t);
  }
});

Deno.test("G2: a reply never says an answer was saved when nothing was stored", () => {
  const { out, constraints } = turn("I'm authorized to work in the US and don't need visa sponsorship");
  if (constraints?.needsSponsorship !== false) assertNode.doesNotMatch(String(out.reply), /\bsaved\b/i, String(out.reply));
});

Deno.test("G2: a reply never mentions a prepared packet the person does not have", () => {
  const { out } = turn("I don't need visa sponsorship");
  assertNode.doesNotMatch(String(out.reply), /prepared packet still carries/i, String(out.reply));
});

Deno.test("G2: a sponsorship statement is not stored as the work-authorization answer", () => {
  const { constraints } = turn("I don't need visa sponsorship");
  assertNode.notEqual(constraints?.workAuthorization, "I don't need visa sponsorship");
});
