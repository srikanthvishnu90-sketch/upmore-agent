// WO-102 evidence for facts confirmed in chat: the person's plain yes (confirm_profile_fact, refused unless this turn's
// message is a plain yes to a fact shown in an earlier turn) writes the actor-bound career_events row kind "fact_confirmed"
// (user_id, at, source "chat") whose detail carries confirmation_event_id and the sha256 of the person's own message, and
// stamps the same confirmation_event_id plus an owner provenance on the fact, so the answer contract can bind to it.
// When the event cannot be recorded, the fact is still confirmed but carries no evidence: nothing is fabricated, and
// readers keep it in needs-review. Synthetic values; no network, no model.
import { CareerProfile } from "../../supabase/functions/_shared/router_core.career.js";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const NOW = Date.UTC(2026, 9, 21, 20);
const POSITIVE = /^owner (stated|confirmed|typed|answered|gave|provided|picked)\b/i; // extension/src/apply_core.ts
async function sha256Hex(s: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function setup(events: { add(e: any): Promise<void> } | null) {
  const profile = CareerProfile.createProfile({ facts: [{ id: "F-001", kind: "education", text: "BS Computer Science at TEST University", status: "draft", needs_confirmation: true }] });
  const tool = careerTools({ postings: async () => [], events } as any).find((t) => t.name === "confirm_profile_fact")!;
  return { profile, run: (message: string) => tool.run({ id: "F-001" }, { userId: "TEST-U", threadId: "TEST-T", now: NOW, state: { profile }, turn: { message, added: [] } } as any) };
}

Deno.test("chat confirmation: the person's yes is a recorded fact_confirmed event, and the fact carries its id and an owner provenance", async () => {
  const rows: any[] = [];
  const { profile, run } = setup({ add: async (e) => void rows.push(e) });
  await run("yes that's right");
  const f = profile.facts[0], e = rows.find((r) => r.kind === "fact_confirmed");
  assert(e && e.user_id === "TEST-U" && e.source === "chat", JSON.stringify(rows));
  assert(f.status === "confirmed" && !f.needs_confirmation);
  assert(typeof f.confirmation_event_id === "string" && f.confirmation_event_id.length >= 16, `id: ${f.confirmation_event_id}`);
  assert(e.detail.confirmation_event_id === f.confirmation_event_id, "the fact names the persisted event");
  assert(e.detail.id === "F-001" && e.detail.message_sha256 === await sha256Hex("yes that's right"), JSON.stringify(e.detail));
  assert(POSITIVE.test(f.provenance) && f.provenance.includes("2026-10-21T20:00:00.000Z"), `provenance: ${f.provenance}`);
});

Deno.test("chat confirmation: with no event recorded, the fact is confirmed but carries no confirmation evidence (never fabricated)", async () => {
  const none = setup(null);
  await none.run("yes");
  const failing = setup({ add: async () => { throw new Error("TEST store down"); } });
  await failing.run("yes");
  for (const { profile } of [none, failing]) {
    const f = profile.facts[0];
    assert(f.status === "confirmed", "the yes still confirms it");
    assert(f.confirmation_event_id === undefined && f.provenance === undefined, JSON.stringify(f));
  }
});

Deno.test("chat confirmation: a reply that is not a plain yes confirms nothing and stamps nothing", async () => {
  const rows: any[] = [];
  const { profile, run } = setup({ add: async (e) => void rows.push(e) });
  let refused = false;
  try { await run("no, it was State University"); } catch { refused = true; }
  const f = profile.facts[0];
  assert(refused && f.needs_confirmation && f.confirmation_event_id === undefined && !rows.length, JSON.stringify({ f, rows }));
});
