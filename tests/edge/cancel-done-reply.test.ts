// A finished cancellation run is a claim until the merchant's own confirmation is in hand (BUILD-STATUS rule 4; found
// overnight 2026-10-12: the legacy execution path said "your Netflix subscription is cancelled" whether or not the run
// captured the merchant's confirmation, while the executor itself records the run only as cancel_claimed).
import { assert, assertMatch } from "jsr:@std/assert@1";
import { cancelDoneReply } from "../../supabase/functions/agent-chat/_shared/capabilities.ts";

Deno.test("with the merchant's confirmation: said as cancelled, the confirmation quoted, the next bill checked", () => {
  const r = cancelDoneReply("Netflix", "  Your membership has been cancelled. You can still watch until Nov 3.  ");
  assertMatch(r, /^Done — Netflix shows the cancellation\. Their confirmation: "Your membership has been cancelled\. You can still watch until Nov 3\."/);
  assertMatch(r, /I'll check your next bill/);
});

Deno.test("without it: never called cancelled, said as not confirmed yet", () => {
  for (const c of [undefined, "", "   ", null, 42]) {
    const r = cancelDoneReply("Hulu", c as unknown, true);
    assertMatch(r, /^The cancellation run for Hulu finished without needing a code, but I didn't capture Hulu's confirmation, so I'm not calling it cancelled yet\./);
    assert(!/subscription is cancelled|^Done/.test(r), r);
  }
});

Deno.test("no execution reply in the module says a subscription is cancelled on its own", () => {
  const src = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/_shared/capabilities.ts", import.meta.url));
  assert(!/subscription is cancelled/.test(src), "every done reply goes through cancelDoneReply");
});
