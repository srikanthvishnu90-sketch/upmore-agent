// Test-only preload for evals/career/run.ts (deno run --preload): replaces fetch for api.openai.com so no request leaves
// the machine. MOCK_OPENAI: "ok" (small usage), "overbill" (usage above any bound), "fail" (HTTP 500), "garbage" (200
// with unreadable JSON). Every intercepted call is appended to MOCK_OPENAI_LOG.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input.url;
  if (!String(url).startsWith("https://api.openai.com/")) return realFetch(input, init);
  const body = JSON.parse(init?.body ?? "{}");
  const log = Deno.env.get("MOCK_OPENAI_LOG");
  if (log) Deno.writeTextFileSync(log, JSON.stringify({ model: body.model, max_completion_tokens: body.max_completion_tokens, bytes: new TextEncoder().encode(JSON.stringify(body.messages)).length }) + "\n", { append: true });
  const mode = Deno.env.get("MOCK_OPENAI") || "ok";
  if (mode === "fail") return new Response(JSON.stringify({ error: { type: "server_error", message: "mock 500" } }), { status: 500 });
  if (mode === "garbage") return new Response("{not json", { status: 200 });
  const usage = mode === "overbill" ? { prompt_tokens: 10_000_000, completion_tokens: 10 } : { prompt_tokens: 900, completion_tokens: 60 };
  const content = JSON.stringify({ pass: true, failed: [], score: 5, note: "mock" });
  return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }], usage }), { status: 200 });
}) as typeof fetch;
