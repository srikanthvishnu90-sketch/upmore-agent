// The direct answers count days in the person's own day, not UTC's (overnight 2026-10-12): the handler reads their time
// zone from their settings (the brief's default when none is set) and derives "today" from it, and the money answers get
// the same zone. A 9 p.m. question in New York on Oct 11 is Oct 11 (UTC already says Oct 12).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { localClock } from "../../supabase/functions/_shared/proactive.ts";
import HANDLER from "../../supabase/functions/agent-chat/handler.ts" with { type: "text" };

Deno.test("the handler's today is the person's local date, and the money answers get their zone", () => {
  assert(HANDLER.includes('supabase.from("agent_proactive_settings").select("time_zone").eq("user_id", user.id)'), "reads the person's zone");
  assert(HANDLER.includes("const today = localClock(Date.now(), tz).date;"), "today is the local date");
  assert(!HANDLER.includes("const today = new Date().toISOString().slice(0, 10);"), "never the UTC date");
  assert(/previous: readPrevious,\s*\}, \{ tz \}\);/.test(HANDLER), "moneyReply gets the zone");
});

Deno.test("9 p.m. in New York on Oct 11 is still Oct 11 there", () => {
  assertEquals(localClock(Date.UTC(2026, 9, 12, 1, 0), "America/New_York").date, "2026-10-11");
  assertEquals(new Date(Date.UTC(2026, 9, 12, 1, 0)).toISOString().slice(0, 10), "2026-10-12");
});
