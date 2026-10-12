// A watch the person sets records the day it was set (in their time zone), so a charge watch reads charges from then on
// and never surprises them with older ones (packages/domain/59-agent-alerts.js evaluateWatches; overnight 2026-10-12).
import { assertEquals, assert } from "jsr:@std/assert@1";
import { parseCommand } from "../../supabase/functions/_shared/proactive.ts";

Deno.test("a new watch carries created_on, the local date it was set", () => {
  const now = Date.UTC(2026, 9, 13, 2, 30); // 10:30 p.m. Oct 12 in New York
  const r = parseCommand("alert me if a charge over $200 posts", { time_zone: "America/New_York", watches: [] } as any, now)!;
  const w = (r.settings as any).watches[0];
  assert(w && w.kind === "amount_over", JSON.stringify(r));
  assertEquals(w.created_on, "2026-10-12");
});
