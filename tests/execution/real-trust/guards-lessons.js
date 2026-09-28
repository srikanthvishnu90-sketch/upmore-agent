// Fixture 5 — learning from mistakes.
//
// Drives the REAL pure learning functions — categorizeExecFailure,
// shouldSkipRetryExec, execLessonTitle (from the shared production module
// supabase/functions/agent-exec/execution-guards.ts) and lessonRelevant,
// detectUserCorrection, renderLessonsBlock (from
// supabase/functions/agent-chat/_shared/lessons.ts) — the same functions
// the deployed agent-exec and agent-chat call.
//
// Proves the loop's logic: failures are categorized deterministically,
// repeats are skipped instead of retried, corrections are detected, and
// relevant lessons render into the prompt block.

import {
  categorizeExecFailure,
  shouldSkipRetryExec,
  execLessonTitle,
  REPEAT_FAILURE_SKIP_THRESHOLD,
  REPEAT_FAILURE_REVERIFY_THRESHOLD,
} from "../../../supabase/functions/agent-exec/execution-guards.ts";
import {
  lessonRelevant,
  detectUserCorrection,
  renderLessonsBlock,
} from "../../../supabase/functions/agent-chat/_shared/lessons.ts";
import { check, section } from "./assert.js";

export async function run() {
  section("learning: categorizeExecFailure maps real executor errors to categories");

  const cases = [
    ["Stopped: the page asked for account creation — the agent never proceeds through that. Nothing was changed.",
     "tripwire_stop", false],
    ["Timed out waiting for the cancel button — the site layout may have changed. Nothing was changed.",
     "layout_changed", true],
    ['Could not find a control matching "Cancel plan" — the site layout may have changed. Nothing was changed.',
     "layout_changed", true],
    ["The verification window expired (30 minutes). Nothing was changed — start again if you still want this cancelled.",
     "otp_expired", true],
    ["Clicked cancel but no confirmation text appeared — check the merchant account before retrying.",
     "no_confirmation", true],
    ["Could not find the sign-in field — the site layout may have changed. Nothing was changed.",
     "auth_failed", true],
    ["Resume failed: session not found",
     "session_died", true],
    ["Something completely unprecedented exploded",
     "other", true],
  ];
  for (const [err, wantCat, wantRetryable] of cases) {
    const a = categorizeExecFailure(err);
    check(`"${err.slice(0, 48)}…" → ${wantCat}`, a.category === wantCat, `got ${a.category}`);
    check(`  retryable=${wantRetryable}`, a.retryable === wantRetryable);
    check(`  has a fix instruction`, typeof a.what_to_do_instead === "string" && a.what_to_do_instead.length > 40);
  }

  // Tripwire kind travels in evidence too (stopped_at_tripwire).
  const tw = categorizeExecFailure("Stopped.", { stopped_at_tripwire: "payment_details" });
  check("evidence stopped_at_tripwire → tripwire_stop", tw.category === "tripwire_stop");
  check("tripwire fix names the kind", tw.what_to_do_instead.includes("payment details"));

  section("learning: shouldSkipRetryExec stops repeating doomed runs");

  const mk = (category, times_seen, title = `${category} lesson`) =>
    ({ id: "l1", category, title, times_seen, what_to_do_instead: "fix" });
  // A by-design stop is never retried — one sighting is enough.
  let d = shouldSkipRetryExec([mk("tripwire_stop", 1)]);
  check("tripwire_stop x1 → skip", d.skip === true);
  check("skip reason is honest about learning", /learned/i.test(d.reason ?? ""));
  // Layout failures: one sighting still retryable, two is learned.
  d = shouldSkipRetryExec([mk("layout_changed", 1)]);
  check("layout_changed x1 → no skip (one retry allowed)", d.skip === false);
  d = shouldSkipRetryExec([mk("layout_changed", REPEAT_FAILURE_SKIP_THRESHOLD)]);
  check(`layout_changed x${REPEAT_FAILURE_SKIP_THRESHOLD} → skip`, d.skip === true);
  check("skip names the repeat count", (d.reason ?? "").includes(String(REPEAT_FAILURE_SKIP_THRESHOLD)));
  // "other" never triggers a skip.
  d = shouldSkipRetryExec([mk("other", 9)]);
  check("other x9 → no skip", d.skip === false);
  // Empty memory → proceed.
  d = shouldSkipRetryExec([]);
  check("no lessons → no skip", d.skip === false);
  // Thresholds are sane.
  check("skip threshold is 2", REPEAT_FAILURE_SKIP_THRESHOLD === 2);
  check("reverify threshold is 3", REPEAT_FAILURE_REVERIFY_THRESHOLD === 3);

  section("learning: execLessonTitle is human-readable per category");
  check("layout title names merchant + problem",
    execLessonTitle("layout_changed", "Netflix").includes("Netflix") &&
    /layout/i.test(execLessonTitle("layout_changed", "Netflix")));

  section("learning: lessonRelevant matches lessons to messages");
  check("route scope matches route id in message",
    lessonRelevant({ scope: "route:R1234", title: "whatever" }, "tell me about R1234 again") === true);
  check("route scope ignores unrelated message",
    lessonRelevant({ scope: "route:R1234", title: "whatever" }, "how do I save money") === false);
  check("merchant scope matches merchant word",
    lessonRelevant({ scope: "merchant:netflix", title: "whatever" }, "cancel my netflix") === true);
  check("title keywords match topic",
    lessonRelevant({ scope: "global", title: "Claimed no verified route for bank bonuses" }, "any bank bonuses?") === true);
  check("title keywords ignore unrelated",
    lessonRelevant({ scope: "global", title: "Claimed no verified route for bank bonuses" }, "how do I meditate") === false);

  section("learning: detectUserCorrection catches corrections, not answers");
  const hist = [
    { role: "user", content: "what bank bonuses are there" },
    { role: "assistant", content: "I don't have any verified bank bonuses right now." },
  ];
  const c1 = detectUserCorrection("that's wrong, you told me about Chase yesterday", hist);
  check("'that's wrong' with prior assistant reply → correction", c1 !== null);
  check("correction keeps the user's words", (c1?.correction ?? "").includes("that's wrong"));
  check("correction keeps the previous reply", (c1?.prevReply ?? "").includes("don't have any verified"));
  check("'you misunderstood me' → correction",
    detectUserCorrection("you misunderstood me", hist) !== null);
  check("bare 'no' is NOT a correction (answers yes/no)",
    detectUserCorrection("no", hist) === null);
  check("'nope' is NOT a correction",
    detectUserCorrection("nope", hist) === null);
  check("plain question is NOT a correction",
    detectUserCorrection("what about Chase?", hist) === null);
  check("correction with no assistant history → null",
    detectUserCorrection("that's wrong", [{ role: "user", content: "hi" }]) === null);

  section("learning: renderLessonsBlock builds the prompt injection");
  const block = renderLessonsBlock([{
    id: "x", category: "false_no_route", scope: "route:R1234",
    title: "Claimed no verified route for bank bonuses",
    what_to_do_instead: "Check the catalog first.",
    times_seen: 2,
  }]);
  check("block names the category", block.includes("false_no_route"));
  check("block carries the fix", block.includes("Check the catalog first."));
  check("block tells the model to acknowledge", /learned from last time/i.test(block));
  check("empty lessons → empty block", renderLessonsBlock([]) === "");
}
