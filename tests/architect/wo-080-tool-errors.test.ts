// WO-080: a failed tool call carries its reason. Until now TurnResult.tool_calls recorded only {name, ok, effect}, so the
// live task battery could say a tool failed but never why; every diagnosis meant reading code and guessing. The owner's
// order: the record carries the error TEXT, cleaned of secrets and personal data, but the real reason. scrubError(text)
// is pure: it removes tokens, keys, emails, phone numbers, database URLs and secret-carrying query strings, caps the text
// at 300 characters and keeps the words that say what went wrong.
import { CLAIM_UNBACKED_REPLY, runAgentTurn, scrubError, type ToolSpec } from "../../supabase/functions/_shared/agent/loop.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }

// Labelled fakes, as tests/no-secrets.test.cjs requires: an anon-role JWT and a key that says FAKE. scrubError removes
// every JWT and key whatever its role or label, so the fakes test the same paths.
const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsInJvbGUiOiJhbm9uIiwibm90ZSI6ImZha2UifQ.c2lnbmF0dXJlX2hlcmVfMTIzNDU2Nzg5MA";
const SK = "sk-proj-FAKE0000AbC123dEf456GhI789jKl012MnO345";

const tool = (name: string, effect: ToolSpec["effect"], run: ToolSpec["run"], required: string[] = []): ToolSpec => ({
  name, effect, description: name, input_schema: { type: "object", properties: {}, required }, run,
});
function scripted(steps: any[][]) {
  let i = 0;
  return async () => ({ content: steps[Math.min(i++, steps.length - 1)], stop_reason: "end_turn" });
}
const text = (t: string) => [{ type: "text", text: t }];
const use = (name: string, input: unknown = {}, id = name) => [{ type: "tool_use", id, name, input }];
const run = (tools: ToolSpec[], steps: any[][], message = "go") =>
  runAgentTurn({ system: "s", history: [], message, tools, model: scripted(steps), ctx: { userId: "u", threadId: "t", now: 0, state: {} } });

Deno.test("WO-080/1 a tool that throws: the record carries its reason, not just ok:false", async () => {
  const t = tool("queue_applications", "write_own", async () => { throw new Error("posting gh-4012 is closed: the board returned 404 Not Found"); });
  const r = await run([t], [use("queue_applications"), text("That posting is closed.")]);
  eq(r.tool_calls.length, 1);
  eq(r.tool_calls[0].ok, false);
  eq(r.tool_calls[0].error, "posting gh-4012 is closed: the board returned 404 Not Found");
});

Deno.test("WO-080/2 the loop's own failures carry their reason too: an unknown tool, a missing input", async () => {
  const t = tool("tailor_resume", "write_own", async () => ({ ok: true }), ["posting_id"]);
  const r = await run([t], [[...use("no_such_tool", {}, "a"), ...use("tailor_resume", {}, "b")], text("ok")]);
  eq(r.tool_calls.map((c) => [c.name, c.ok]), [["no_such_tool", false], ["tailor_resume", false]]);
  assert(/unknown tool/.test(r.tool_calls[0].error ?? ""), `unknown tool reason: ${r.tool_calls[0].error}`);
  assert(/missing required input: posting_id/.test(r.tool_calls[1].error ?? ""), `missing input reason: ${r.tool_calls[1].error}`);
});

Deno.test("WO-080/3 a successful call and an external call carry no error field: their records are unchanged", async () => {
  const ok = tool("get_profile", "read", async () => ({ name: "x" }));
  const ext = tool("send_email", "external", async () => { throw new Error("must never run"); });
  const r = await run([ok, ext], [[...use("get_profile", {}, "a"), ...use("send_email", { to: "a" }, "b")], text("done")]);
  eq(r.tool_calls, [{ name: "get_profile", ok: true, effect: "read" }, { name: "send_email", ok: true, effect: "external" }]);
});

Deno.test("WO-080/4 the recorded reason is scrubbed: a token, a key and an email in a thrown error never reach the record", async () => {
  const t = tool("track_application", "write_own", async () => {
    throw new Error(`insert failed for maya.r@example.com: permission denied (Authorization: Bearer ${JWT}, apikey ${SK})`);
  });
  const r = await run([t], [use("track_application"), text("I couldn't track it.")]);
  const e = r.tool_calls[0].error ?? "";
  assert(/insert failed/.test(e) && /permission denied/.test(e), `the reason words stay: ${e}`);
  for (const leak of ["maya.r@example.com", JWT, SK, "eyJ", "sk-proj"]) assert(!e.includes(leak), `leaked ${leak}: ${e}`);
});

Deno.test("WO-080/5 a thrown non-Error still records a readable reason", async () => {
  const t = tool("set_job_alerts", "write_own", async () => { throw { code: "23505", message: "duplicate key value violates unique constraint \"alerts_user_key\"" }; });
  const r = await run([t], [use("set_job_alerts"), text("ok")]);
  assert(/duplicate key value violates unique constraint/.test(r.tool_calls[0].error ?? ""), `got: ${r.tool_calls[0].error}`);
});

Deno.test("WO-080/6 scrubError: JWTs, bearer tokens and API keys are removed", () => {
  const s = scrubError(`auth failed: Bearer ${JWT}; key=${SK}; jwt ${JWT}`);
  assert(/auth failed/.test(s), s);
  assert(!s.includes("eyJ") && !s.includes(SK) && !s.includes("AbC123"), s);
  const s2 = scrubError("upstream 401: invalid api key sk-AbCdEf0123456789AbCdEf0123456789 provided");
  assert(/upstream 401: invalid api key/.test(s2) && /provided/.test(s2) && !/sk-AbCdEf/.test(s2), s2);
  const s3 = scrubError("supabase rejected sb_secret_FAKE0000N7x9QqLz2Kp4Vw8Rt1 for this project");
  assert(!/FAKE0000N7x9QqLz2Kp4Vw8Rt1/.test(s3) && /supabase rejected/.test(s3), s3);
  const s4 = scrubError("board api: Authorization: Basic dXNlcjpwYXNzd29yZA== was refused (401)");
  assert(!/dXNlcjpw/.test(s4) && /was refused \(401\)/.test(s4), s4);
});

Deno.test("WO-080/7 scrubError: long hex and base64 secrets (24+ chars) are removed; short ids and status codes stay", () => {
  const hex = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
  const b64 = "dGhpcyBpcyBhIHNlY3JldCB0b2tlbiAxMjM0NTY3ODkw==";
  const s = scrubError(`signature ${hex} mismatch; secret ${b64} rejected; HTTP 429 for posting gh-4012`);
  assert(!s.includes(hex) && !s.includes(b64), s);
  assert(/signature/.test(s) && /mismatch/.test(s) && /rejected/.test(s), s);
  assert(/HTTP 429/.test(s) && /gh-4012/.test(s), `short ids and codes are reason words: ${s}`);
});

Deno.test("WO-080/8 scrubError: emails and phone numbers are removed", () => {
  const s = scrubError("could not reach maya.rao+jobs@gmail.com or +1 (312) 555-0199 or 312-555-0199 or 3125550199: mailbox full");
  for (const leak of ["maya.rao", "gmail.com", "555-0199", "3125550199", "(312)"]) assert(!s.includes(leak), `leaked ${leak}: ${s}`);
  assert(/could not reach/.test(s) && /mailbox full/.test(s), s);
});

Deno.test("WO-080/9 scrubError: postgres URLs and secret-carrying query strings are removed; the rest of a URL stays", () => {
  const s = scrubError("connect failed postgres://postgres:fake0000pass@db.abcd.supabase.co:5432/postgres (timeout)");
  assert(!/fake0000pass/.test(s) && !/db\.abcd\.supabase\.co/.test(s), s);
  assert(/connect failed/.test(s) && /timeout/.test(s), s);
  const s2 = scrubError("GET https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true&token=abc123XYZ&api_key=k9&secret=s3cr3t&page=2 returned 503");
  assert(!/abc123XYZ/.test(s2) && !/k9\b/.test(s2.replace(/\[[^\]]*\]/g, "")) && !/s3cr3t/.test(s2), s2);
  assert(/boards-api\.greenhouse\.io\/v1\/boards\/acme\/jobs/.test(s2) && /content=true/.test(s2) && /page=2/.test(s2) && /returned 503/.test(s2), s2);
  const s3 = scrubError("postgresql://user:pw@localhost/db refused");
  assert(!/user:pw/.test(s3) && /refused/.test(s3), s3);
});

Deno.test("WO-080/10 scrubError: password=/token: pairs are removed", () => {
  const s = scrubError('login rejected password=Tr0ub4dor&3 token: "abc.def" for this board');
  assert(!/Tr0ub4dor/.test(s) && !/abc\.def/.test(s), s);
  assert(/login rejected/.test(s) && /for this board/.test(s), s);
});

Deno.test("WO-080/11 scrubError: capped at 300 characters, whitespace collapsed, non-strings tolerated", () => {
  const long = "the board form has a required field we have no confirmed answer for ".repeat(20);
  const s = scrubError(long);
  assert(s.length <= 300, `length ${s.length}`);
  assert(s.startsWith("the board form has a required field"), s);
  eq(scrubError("  two\n\n lines\t here  "), "two lines here");
  eq(scrubError(""), "");
  eq(typeof scrubError(undefined as unknown as string), "string");
  eq(typeof scrubError({ a: 1 } as unknown as string), "string");
});

Deno.test("WO-080/12 scrubError is pure: the same text gives the same result every time", () => {
  const t = `x Bearer ${JWT} y maya@example.com z`;
  eq(scrubError(t), scrubError(t));
});

Deno.test("WO-080/14 scrubError keeps what a diagnosis needs: record ids (UUIDs), dates, times, file paths, constraint names", () => {
  const t = 'posting 7c9e6679-7425-40de-944b-e07fc1f90ae7 not found at 2026-10-20T12:00:00Z (HTTP 404) in _shared/career/tools.ts:123; violates "career_wants_user_id_posting_id_key"; retry after 1729425600';
  eq(scrubError(t), t);
});

Deno.test("WO-080/13 WO-077 still holds: a failed save, now carrying its reason, still backs no claim", async () => {
  const t = tool("remember_instruction", "write_own", async () => { throw new Error("memory store unavailable"); });
  const r = await run([t], [use("remember_instruction"), text("I saved that."), text("I saved that.")], "remember this");
  eq(r.reply, CLAIM_UNBACKED_REPLY);
  eq(r.tool_calls[0].error, "memory store unavailable");
});
