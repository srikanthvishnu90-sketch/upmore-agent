import { corsFor } from "../../supabase/functions/agent-chat/_shared/chat_cors.ts";
function assert(condition: boolean) { if (!condition) throw new Error("CORS assertion failed"); }
Deno.test("verified production alias can read authenticated chat responses", () => {
  const result = corsFor(new Request("https://example.invalid", {headers:{Origin:"https://upmore-topaz.vercel.app"}}));
  assert(result["Access-Control-Allow-Origin"] === "https://upmore-topaz.vercel.app");
  assert(result.Vary === "Origin");
  assert(result["Access-Control-Allow-Methods"] === "POST, OPTIONS");
});
Deno.test("untrusted and lookalike origins receive no CORS grant", () => {
  for (const origin of ["https://evil.invalid", "https://upmore-topaz.vercel.app.evil.invalid", "https://other.vercel.app", "null", ""]) {
    const result = corsFor(new Request("https://example.invalid", {headers:{Origin:origin}}));
    assert(!("Access-Control-Allow-Origin" in result));
  }
});
