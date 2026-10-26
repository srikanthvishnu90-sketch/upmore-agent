// WO-066 acceptance tests (architect-authored; builders make them pass, never edit them).
// From chat to applying: when the person asks Trainee to apply ("apply me to 25 data analyst jobs", "apply to the first
// two"), the brain puts real postings from search_jobs into the person's own apply queue; the Trainee extension picks
// them up, prepares each in the person's browser, and shows a card; nothing goes to an employer before they approve
// that card. Contract: docs/architect/work-orders/WO-066-chat-to-queue.md. Run: deno test -A --no-check tests/architect/
import { memoryWantStore, wantsFrom } from "../../supabase/functions/_shared/career_apply_want.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const T0 = Date.UTC(2026, 9, 20, 15);
const ctx = (now = T0) => ({ userId: "u1", threadId: "t1", now, state: {}, turn: { message: "apply me", added: [] as string[] } });
const GH = (n: number) => ({ url: `https://job-boards.greenhouse.io/acme/jobs/${4000000 + n}`, company: "Acme", title: `Data Analyst ${n}` });
const tool = (wants: any, limits?: { daily?: number }) => careerTools({ postings: async () => [], alerts: null, wants, limits } as any).find((t) => t.name === "queue_applications")!;

Deno.test("WO-066/1 wantsFrom keeps real ATS posting links, keyed like the extension, and refuses everything else with a reason", () => {
  const r = wantsFrom([
    GH(1),
    { url: "https://jobs.lever.co/acme/0b5c3a1e-1111-2222-3333-444455556666", company: "Acme", title: "Analyst" },
    { url: "https://jobs.ashbyhq.com/acme/9f0e6c2a-aaaa-bbbb-cccc-ddddeeeeffff", company: "Acme", title: "Analyst" },
    { url: "https://www.linkedin.com/jobs/view/123", company: "X", title: "Y" },
    { url: "https://www.indeed.com/viewjob?jk=abc", company: "X", title: "Y" },
    { url: "https://example.com/careers/123", company: "X", title: "Y" },
    GH(1),
  ], T0);
  eq(r.ok.map((w) => w.posting_key), ["greenhouse:acme:4000001", "lever:acme:0b5c3a1e-1111-2222-3333-444455556666", "ashby:acme:9f0e6c2a-aaaa-bbbb-cccc-ddddeeeeffff"], "the extension's own posting keys, duplicates once");
  assert(r.ok[1].url.endsWith("/apply") && r.ok[2].url.endsWith("/application"), "the application page, as the extension opens it");
  eq(r.refused.length, 3, "LinkedIn, Indeed and a non-ATS page are refused");
  assert(r.refused.every((x) => x.why.length > 10), "each refusal says why");
  assert(/never/i.test(r.refused[0].why) && /never/i.test(r.refused[1].why), "LinkedIn and Indeed: never automated (owner rule)");
});

Deno.test("WO-066/2 the tool queues for the person, says nothing is sent, and the queue holds them once", async () => {
  const wants = memoryWantStore();
  const t = tool(wants);
  assert(t, "queue_applications exists");
  eq(t.effect, "write_own", "it only changes the person's own queue: nothing leaves the account");
  assert(/approv/i.test(t.description) && /extension|browser/i.test(t.description), "the description tells the model how it goes out");
  const out: any = await t.run({ postings: [GH(1), GH(2)] }, ctx() as any);
  eq(out.queued, 2);
  assert(/nothing (is|has been) sent/i.test(out.note), "the result tells the model nothing was sent");
  const again: any = await t.run({ postings: [GH(2), GH(3)] }, ctx() as any);
  eq([again.queued, again.already], [1, 1], "the same posting is queued once");
  eq((await wants.list("u1")).map((w) => w.posting_key), ["greenhouse:acme:4000001", "greenhouse:acme:4000002", "greenhouse:acme:4000003"]);
  eq((await wants.list("u2")).length, 0, "another person's queue is untouched");
});

Deno.test("WO-066/3 no product daily ceiling (CAPS-1390): a day's queue takes them all; a pace the person set is the only room, named when it refuses", async () => {
  const wants = memoryWantStore();
  const many = Array.from({ length: 30 }, (_, i) => GH(i + 10));
  const out: any = await tool(wants).run({ postings: many }, ctx() as any);
  eq([out.queued, out.refused.length], [30, 0], "nothing refused for volume when no pace is set");
  const paced = memoryWantStore();
  const own: any = await tool(paced, { daily: 25 }).run({ postings: many }, ctx() as any);
  eq([own.queued, own.refused.length], [25, 5], "their own pace of 25 holds");
  assert(own.refused.every((r: any) => /25 a day/.test(r.why)), "their pace is named");
  const next: any = await tool(paced, { daily: 25 }).run({ postings: [GH(99)] }, ctx(T0 + 26 * 3600_000) as any);
  eq(next.queued, 1, "a new day has room again");
});

Deno.test("WO-066/4 without a queue the tool says applying from chat is not connected, and never pretends", async () => {
  const t = tool(null);
  let err = "";
  try { await t.run({ postings: [GH(1)] }, ctx() as any); } catch (e) { err = String((e as Error).message); }
  assert(/not connected/i.test(err), `honest error, got: ${err}`);
});

Deno.test("WO-066/5 the migration: the person reads their own queue; only the service writes it; the extension takes its own", async () => {
  const dir = "supabase/migrations";
  let sql = "";
  for await (const e of Deno.readDir(dir)) if (/career_apply_wanted\.sql$/.test(e.name)) sql = await Deno.readTextFile(`${dir}/${e.name}`);
  assert(sql, "a migration named *_career_apply_wanted.sql");
  assert(/create table if not exists public\.career_apply_wanted/i.test(sql));
  assert(/enable row level security/i.test(sql), "RLS on");
  assert(/for select[\s\S]{0,120}auth\.uid\(\)\s*=\s*user_id/i.test(sql), "the person selects only their own rows");
  assert(!/for (insert|update|delete|all)[\s\S]{0,80}to authenticated/i.test(sql), "no direct client writes");
  assert(/unique\s*\(\s*user_id\s*,\s*posting_key\s*\)/i.test(sql), "one row per posting per person");
  assert(/function public\.career_apply_want_put_for\(/i.test(sql) && /revoke[\s\S]{0,120}career_apply_want_put_for[\s\S]{0,80}(anon|authenticated|public)/i.test(sql), "put_for is the service's alone");
  assert(/function public\.career_apply_want_take_own\(/i.test(sql) && /auth\.uid\(\)/.test(sql.slice(sql.search(/career_apply_want_take_own\(/i))), "take_own acts for the signed-in person only");
});

Deno.test("WO-066/6 the extension takes Trainee's picks into its queue, through the person's own session", async () => {
  const bg = await Deno.readTextFile("extension/background.js");
  assert(/case "queue-from-trainee"/.test(bg), "a queue-from-trainee message");
  const at = bg.indexOf('case "queue-from-trainee"');
  const body = bg.slice(at, at + 1500);
  assert(/career_apply_wanted/.test(body) && /selectOwn\(/.test(body), "reads the person's own rows with their session");
  assert(/career_apply_want_take_own/.test(body), "marks them taken");
  assert(/queue-set/.test(body), "into the same queue the person's pasted links go");
  const panel = await Deno.readTextFile("extension/panel.html");
  assert(/queue-from-trainee|Trainee's picks/i.test(panel + await Deno.readTextFile("extension/panel.js")), "the panel offers it");
});

Deno.test("WO-066/7 the agent-chat handler gives the brain the queue (supabaseWantStore) when the agent brain answers", async () => {
  const brain = await Deno.readTextFile("supabase/functions/agent-chat/career_brain.ts");
  assert(/wants\??:/.test(brain), "agentTurn takes a want store");
  let wired = false;
  for await (const e of Deno.readDir("supabase/functions/agent-chat")) {
    if (!e.name.endsWith(".ts")) continue;
    if (/supabaseWantStore\(/.test(await Deno.readTextFile(`supabase/functions/agent-chat/${e.name}`))) wired = true;
  }
  assert(wired, "a handler passes supabaseWantStore(admin)");
});
