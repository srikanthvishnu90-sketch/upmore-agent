// Synthetic memory-rendering regressions. No model calls, held-out cases or live accounts.
import { goalLines, personBlock } from "../../supabase/functions/_shared/agent/memory.ts";

function ok(value: unknown, why: string): asserts value { if (!value) throw new Error(why); }
function eq(actual: unknown, expected: unknown, why: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(why + ": " + JSON.stringify(actual));
}
const block = (facts: unknown[], budget = 4500) => personBlock({ profile: { facts }, standing: [], alerts: null, pipeline: null, budget });
const fact = (id: string, text: string, status: string, needs_confirmation: boolean, kind = "skill") => ({ id, text, kind, status, needs_confirmation });

Deno.test("memory reliability: rejected facts are not offered as confirmed application facts", () => {
  const out = block([fact("TEST-R", "REJECTED-SKILL", "rejected", false), fact("TEST-C", "CONFIRMED-SKILL", "confirmed", false)]);
  ok(!out.includes("REJECTED-SKILL"), "a rejected fact was offered to the brain as usable");
  ok(out.includes("CONFIRMED-SKILL"), "the valid confirmed fact was lost");
});

Deno.test("memory reliability: rejected drafts and goals do not reappear in active context", () => {
  const profile = { facts: [fact("TEST-R", "REJECTED-GOAL", "rejected", true, "goal")] };
  eq(goalLines(profile), [], "a rejected goal still steers the next answer");
  const out = personBlock({ profile, standing: [], alerts: null, pipeline: null });
  ok(!out.includes("REJECTED-GOAL"), "a rejected goal was shown as waiting for confirmation");
});

Deno.test("memory reliability: an unknown confirmation status is never labelled confirmed", () => {
  const out = block([fact("TEST-U", "UNREVIEWED-SKILL", "imported", false)]);
  const start = out.indexOf("Confirmed facts (usable in applications):");
  const end = out.indexOf("Facts waiting for their yes");
  ok(!out.slice(start, end).includes("UNREVIEWED-SKILL"), "an unknown status was promoted by omission");
});

Deno.test("memory reliability: conflicting confirmation flags remain unconfirmed", () => {
  const out = block([fact("TEST-D", "DRAFT-SKILL", "confirmed", true)]);
  const start = out.indexOf("Confirmed facts (usable in applications):");
  const end = out.indexOf("Facts waiting for their yes");
  ok(!out.slice(start, end).includes("DRAFT-SKILL"), "a pending fact was marked confirmed");
  ok(out.slice(end).includes("DRAFT-SKILL"), "the pending fact was lost");
});

Deno.test("memory reliability: budget pruning never leaves a draft under the confirmed heading", () => {
  const facts = [fact("TEST-C", "CONFIRMED-CONTEXT", "confirmed", false), fact("TEST-D", "DRAFT-CONTEXT", "draft", true)];
  for (let budget = 0; budget <= 1600; budget++) {
    const out = block(facts, budget);
    const draft = out.indexOf("DRAFT-CONTEXT");
    if (draft < 0) continue;
    const label = out.indexOf("Facts waiting for their yes");
    ok(label >= 0 && label < draft, "draft lost its confirmation label at budget " + budget);
  }
});

Deno.test("memory reliability: malformed stored fact rows cannot break the whole memory block", () => {
  const out = block([null, "not a fact", {}, { status: "confirmed" }, { kind: "skill", text: "MISSING-IDENTITY", status: "confirmed", needs_confirmation: false }, fact("TEST-C", "CONFIRMED-CONTEXT", "confirmed", false)]);
  ok(out.includes("CONFIRMED-CONTEXT"), "valid facts must survive malformed neighbours");
  ok(!out.includes("undefined"), "malformed rows escaped as a fabricated fact");
  ok(!out.includes("MISSING-IDENTITY"), "a row with no fact identity was offered as confirmed");
});

Deno.test("memory reliability: a corrected draft stays visible in the goal but not in application facts", () => {
  const current = { ...fact("TEST-G", "a synthetic design internship", "draft", true, "goal"), corrected_from: "a synthetic analyst internship" };
  const out = block([current]);
  ok(out.includes("a synthetic design internship (said, not confirmed yet)"), "current goal is missing or incorrectly confirmed");
  ok(!out.includes("a synthetic analyst internship"), "replaced goal text reappeared");
});

Deno.test("memory reliability: budget pressure keeps the newest fact before the oldest", () => {
  const facts = [fact("TEST-O", "OLDEST-SKILL", "confirmed", false), fact("TEST-N", "NEWEST-SKILL", "confirmed", false)];
  let limited = false;
  for (let budget = 0; budget <= 1600; budget++) {
    const out = block(facts, budget);
    if (out.includes("OLDEST-SKILL") === out.includes("NEWEST-SKILL")) continue;
    limited = true;
    ok(out.includes("NEWEST-SKILL"), "budget kept the oldest fact instead of the newest at " + budget);
  }
  ok(limited, "fixture must exercise a one-fact budget");
});

Deno.test("memory reliability: rendering never changes stored fact state or order", () => {
  const facts = [fact("TEST-O", "OLDEST-SKILL", "confirmed", false), fact("TEST-N", "NEWEST-SKILL", "draft", true)];
  const before = JSON.stringify(facts);
  block(facts);
  eq(JSON.stringify(facts), before, "memory rendering changed stored state");
});
