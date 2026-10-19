// WO-013a builder tests: the channel rules on the edges a real provider produces (a send that throws, padding and
// punctuation around STOP, HELP changing nothing, the cap counting people, not messages).
// Run: deno test --no-check tests/edge/channel.test.ts
import { channelCommand, deliverDue, memoryChannel } from "../../supabase/functions/_shared/channel.ts";

function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const NOW = Date.UTC(2026, 9, 19, 15);
const row = (id: string, contact: string) => ({ id, userId: "u", contact, key: `alert:${id}`, text: `m${id}`, deliver_at: NOW, attempts: 0 });

Deno.test("WO-013a/B1 padding and end punctuation around a command still count; inner punctuation does not", () => {
  eq(["  stop  ", "STOP!!", "Stop?", "s.t.o.p", "stop-it"].map(channelCommand), ["stop", "stop", "stop", null, null]);
});

Deno.test("WO-013a/B2 a send that throws is a retryable failure, never a crash and never 'delivered'", async () => {
  const ch = memoryChannel([row("1", "+15550001111")]);
  const r = await deliverDue({ store: ch, now: NOW, send: async () => { throw new Error("socket hang up"); } });
  eq([r.delivered, r.retried], [0, 1]);
  eq(ch.rows()[0].error, "socket hang up");
});

Deno.test("WO-013a/B3 HELP changes nothing; the cap counts people, not messages", async () => {
  const ch = memoryChannel([row("1", "+15550001111"), row("2", "+15550001111"), row("3", "+15550002222")]);
  const r = await deliverDue({ store: ch, now: NOW, dailyContactCap: 1, send: async () => ({ ok: true, id: null }) });
  eq([r.delivered, r.capped], [2, 1], "two messages to the one person allowed today, the new person waits");
});
