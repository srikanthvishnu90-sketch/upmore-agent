// WO-013a acceptance tests (architect-authored; builders make them pass, never edit them).
// The texting channel's two non-negotiables, before any provider: STOP means nothing more is ever sent until START, and
// every message goes out at most once, never silently dropped, within the provider's daily contact cap.
// Contract: docs/architect/work-orders/WO-013-texting-channel.md. Run: deno test -A --no-check tests/architect/
import { channelCommand, CHANNEL_REPLIES, deliverDue, memoryChannel } from "../../../supabase/functions/_shared/channel.ts";
import { handleInbound, memoryStore, toBubbles, type Brain } from "../../../supabase/functions/_shared/conversation.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const NOW = Date.UTC(2026, 9, 19, 15), MIN = 60000;
const row = (id: string, contact: string, at = NOW, text = `Message ${id}`) => ({ id, userId: `u-${contact}`, contact, key: `alert:${id}`, text, deliver_at: at, attempts: 0 });
function sender(results: Record<string, any> = {}) {
  const calls: { contact: string; bubbles: string[] }[] = [];
  const send = async (contact: string, bubbles: string[]) => { calls.push({ contact, bubbles }); return results[contact] ?? { ok: true, id: `m${calls.length}` }; };
  return { send, calls };
}

Deno.test("WO-013a/1 STOP and its synonyms, alone and in any case, are commands; a sentence with 'stop' in it is not", () => {
  for (const s of ["STOP", "stop", "Stop.", "STOPALL", "unsubscribe", "Cancel", "END", "quit!"]) eq(channelCommand(s), "stop", s);
  for (const s of ["START", "unstop"]) eq(channelCommand(s), "start", s);
  for (const s of ["HELP", "info"]) eq(channelCommand(s), "help", s);
  for (const s of ["stop sending me sales jobs", "can you stop?", "yes", "cancel my Stripe application", "start a mock interview"]) eq(channelCommand(s), null, s);
  assert(/START/.test(CHANNEL_REPLIES.stop) && /STOP/.test(CHANNEL_REPLIES.start) && /STOP/.test(CHANNEL_REPLIES.help), "each reply says how to undo or stop");
});

Deno.test("WO-013a/2 a channel command never reaches the brain and gets its fixed reply", async () => {
  const store = memoryStore(), calls: string[] = [];
  const brain: Brain = async (a) => { calls.push(a.message); return { reply: "brain", stores: a.stores }; };
  const channel = memoryChannel();
  const out = await handleInbound({ contact: "+15550001111", text: "STOP", at: NOW }, { brain, store, channel });
  eq(out.bubbles, toBubbles(CHANNEL_REPLIES.stop));
  eq(calls, [], "the brain never saw it");
  assert(await channel.optedOut("+15550001111"), "the contact is opted out");
  await handleInbound({ contact: "+15550001111", text: "start", at: NOW + MIN }, { brain, store, channel });
  assert(!(await channel.optedOut("+15550001111")), "START opts back in");
  await handleInbound({ contact: "+15550001111", text: "stop sending me sales jobs", at: NOW + 2 * MIN }, { brain, store, channel });
  eq(calls, ["stop sending me sales jobs"], "an ordinary sentence is the brain's");
});

Deno.test("WO-013a/3 after STOP nothing queued is ever sent; it is marked skipped, not left to send later", async () => {
  const channel = memoryChannel([row("1", "+15550002222"), row("2", "+15550003333")]);
  await channel.setOptOut("+15550002222", true, NOW - MIN);
  const s = sender();
  const r = await deliverDue({ store: channel, send: s.send, now: NOW });
  eq([r.delivered, r.skipped_opt_out], [1, 1]);
  eq(s.calls.map((c) => c.contact), ["+15550003333"]);
  await channel.setOptOut("+15550002222", false, NOW + MIN);
  const again = await deliverDue({ store: channel, send: s.send, now: NOW + 2 * MIN });
  eq([again.delivered, s.calls.length], [0, 1], "opting back in never revives what was skipped");
});

Deno.test("WO-013a/4 each message goes out once; a retryable failure is retried with backoff, then failed", async () => {
  const channel = memoryChannel([row("1", "+15550004444")]);
  const flaky = sender({ "+15550004444": { ok: false, error: "HTTP 503", retryable: true } });
  const a = await deliverDue({ store: channel, send: flaky.send, now: NOW });
  eq([a.retried, a.failed], [1, 0]);
  eq((await deliverDue({ store: channel, send: flaky.send, now: NOW + 30000 })).retried, 0, "not before its backoff");
  await deliverDue({ store: channel, send: flaky.send, now: NOW + 2 * MIN });
  const last = await deliverDue({ store: channel, send: flaky.send, now: NOW + 40 * MIN });
  eq(last.failed, 1, "3 attempts, then failed");
  eq(flaky.calls.length, 3);
  const ok = memoryChannel([row("2", "+15550005555")]), s = sender();
  await deliverDue({ store: ok, send: s.send, now: NOW });
  await deliverDue({ store: ok, send: s.send, now: NOW + MIN });
  eq(s.calls.length, 1, "a delivered message is never sent again");
  const bad = memoryChannel([row("3", "+15550006666")]);
  eq((await deliverDue({ store: bad, send: sender({ "+15550006666": { ok: false, error: "invalid recipient", retryable: false } }).send, now: NOW })).failed, 1, "not retryable: failed at once");
});

Deno.test("WO-013a/5 the daily contact cap holds: new contacts past it wait (never dropped); known contacts still get theirs", async () => {
  const channel = memoryChannel([row("1", "+15550000001"), row("2", "+15550000002"), row("3", "+15550000003"), row("4", "+15550000001", NOW, "second for the same person")]);
  const s = sender();
  const r = await deliverDue({ store: channel, send: s.send, now: NOW, dailyContactCap: 2 });
  eq([r.delivered, r.capped], [3, 1]);
  eq(s.calls.map((c) => c.contact), ["+15550000001", "+15550000002", "+15550000001"]);
  const tomorrow = await deliverDue({ store: channel, send: s.send, now: Date.UTC(2026, 9, 20, 1), dailyContactCap: 2 });
  eq(tomorrow.delivered, 1, "the capped one goes the next day");
});

Deno.test("WO-013a/6 what goes out is the message as texting bubbles", async () => {
  const text = "New match: Data Analyst at Stripe (Remote - US), first seen 4 min ago.\nhttps://jobs.lever.co/stripe/1";
  const channel = memoryChannel([row("1", "+15550007777", NOW, text)]), s = sender();
  await deliverDue({ store: channel, send: s.send, now: NOW });
  eq(s.calls[0].bubbles, toBubbles(text));
});
