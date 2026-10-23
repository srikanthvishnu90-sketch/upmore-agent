// Release pins for the 2026-10-22 candidate (parent's gate, 2026-10-23 00:4x UTC): the deployed agent-chat cannot select
// the agent brain whatever CAREER_BRAIN holds, and People Data Labs makes no request unless CAREER_PDL=on, whatever
// PDL_API_KEY holds. Enabling either is a separate, reviewed change. Run:
// deno test -A --no-check tests/architect/release-pins-20261022.test.ts
import { AGENT_BRAIN_RELEASED, chooseBrain } from "../../supabase/functions/agent-chat/career_brain.ts";
import { hiredSourceFromEnv } from "../../supabase/functions/_shared/career_hired.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
const HANDLER = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler-career.ts", import.meta.url));
const env = (o: Record<string, string>) => ({ get: (k: string) => o[k] });

Deno.test("RP-1 the agent brain is not released: the constant is false", () => {
  assert(AGENT_BRAIN_RELEASED === false, "AGENT_BRAIN_RELEASED must stay false until a reviewed change turns it on");
});

Deno.test("RP-2 the only agent-brain branch in agent-chat requires the release constant before the env read", () => {
  const n = HANDLER.split('chooseBrain(Deno.env) === "agent"').length - 1;
  assert(n === 1, `exactly one brain branch (found ${n})`);
  assert(HANDLER.includes('AGENT_BRAIN_RELEASED && chooseBrain(Deno.env) === "agent"'), "the branch is pinned by AGENT_BRAIN_RELEASED");
  const calls = HANDLER.split("agentTurn(").length - 1;
  assert(calls === 1, `agentTurn is called once, inside that branch (found ${calls})`);
  assert(HANDLER.indexOf("AGENT_BRAIN_RELEASED && chooseBrain") < HANDLER.indexOf("agentTurn("), "the call sits after the pinned branch test");
});

Deno.test("RP-3 PDL: a key without CAREER_PDL=on makes no request and reads no table", async () => {
  let fetched = false, read = false;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => { fetched = true; throw new Error("no provider request while CAREER_PDL is off"); }) as typeof fetch;
  try {
    const src = hiredSourceFromEnv(env({ PDL_API_KEY: "test-key-not-real" }), { from() { read = true; throw new Error("no table read"); } });
    const r = await src.backgrounds({ firm_id: "palantir", name: "Palantir" }, "software engineer", Date.UTC(2026, 9, 22));
    assert(r.status === "NOT_WIRED", "off means NOT_WIRED");
    assert(!fetched, "no provider request");
    assert(!read, "no table read");
  } finally { globalThis.fetch = realFetch; }
});
