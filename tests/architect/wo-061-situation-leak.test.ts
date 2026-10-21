// WO-061 (second judge, run 39603731114 p3): "You don't have that interview on file yet: SITUATION shows nothing for ..."
// The name of the system prompt's block is internal; the leak guard finds it and code's last resort says "your account".
import { leakedWords, stripLeaks } from "../../supabase/functions/_shared/agent/reply_guards.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
const o = (typed = "when is my interview?") => ({ tools: ["get_situation", "track_application"], typed, postings: new Map() });

Deno.test("WO-061/L1 the block name SITUATION is a leak; the ordinary word situation is not", () => {
  const reply = "You don't have that interview on file yet: SITUATION shows nothing for Harbor Ridge Analytics.";
  assert(leakedWords(reply, o()).includes("SITUATION"), JSON.stringify(leakedWords(reply, o())));
  const fixed = stripLeaks(reply, o());
  assert(!/SITUATION/.test(fixed) && /your account shows nothing for Harbor Ridge Analytics/.test(fixed), fixed);
  assert(!leakedWords("Here is how I would handle your situation with the recruiter.", o()).length, "the ordinary word is not a leak");
  assert(!leakedWords("You asked what SITUATION means here.", o("what does SITUATION mean?")).length, "their own word is theirs");
});
