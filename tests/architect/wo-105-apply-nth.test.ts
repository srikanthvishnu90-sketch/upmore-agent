// WO-105: find -> "apply to the second one" -> that exact posting in the person's apply queue. On trunk 9deee4e2 (with only
// the new career_apply_pick.ts copied in) 9 of 13 fail: 1-5, 9-11, 13. 6, 7, 8 and 12 test the new module on its own.
// The chain dead-ended at "I didn't catch that"; see docs/architect/work-orders/WO-105-apply-nth.md.
// Run: deno test -A --no-check tests/architect/wo-105-apply-nth.test.ts
import { CareerAccess, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment, CareerJobs } from "../../supabase/functions/_shared/router_core.career.js";
import { CareerHost } from "../../supabase/functions/_shared/career_host.js";
import { CareerPool } from "../../supabase/functions/_shared/career_pool.js";
import { applyPickTurn, askedAbout, picksFrom, positionsIn, type LastShown } from "../../supabase/functions/_shared/career_apply_pick.ts";
import { memoryWantStore } from "../../supabase/functions/_shared/career_apply_want.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const read = (p: string) => Deno.readTextFileSync(new URL(`../../${p}`, import.meta.url));
const JOBS = { roleFamily: CareerJobs.roleFamily, seniorityBand: CareerJobs.seniorityBand, stripHtml: CareerJobs.stripHtml };
const iso = new Date().toISOString();
const row = (job_id: string, company: string, title: string, location: string, url: string, over: Record<string, unknown> = {}) =>
  ({ job_id, provider: job_id.split(":")[0], board: "b", company, title, location, url, description: "", first_seen_at: iso, last_seen_at: iso, closed_at: null, ...over });
const ROWS = [
  row("greenhouse:northwindledger:4011", "Northwind Ledger", "Senior Data Analyst", "Chicago, IL", "https://boards.greenhouse.io/northwindledger/jobs/4011"),
  row("lever:copperline:1", "Copperline Labs", "Senior Data Analyst", "Remote - US", "https://jobs.lever.co/copperline/5b1c2d3e-0000-4000-8000-000000000001"),
  row("ashby:bluefin:2", "Bluefin Health", "Data Analyst", "Chicago, IL", "https://jobs.ashbyhq.com/bluefin/7f0e0e0e-0000-4000-8000-000000000002"),
];
const host = CareerHost.createCareerHost({ CareerAccess, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment });
function turns(texts: string[], rows = ROWS) {
  const postings = rows.map((r) => CareerPool.mapLivePosting(r, JOBS));
  let snap: any = null;
  const outs: any[] = [];
  let last: any = null;
  for (const text of texts) {
    const ctx = host.createTurnCtx({ userId: "u-105", threadId: "u-105", now: Date.now(), snapshot: snap, postings });
    outs.push(host.runTurn(text, ctx));
    snap = host.extractSnapshot(ctx);
    last = ctx;
  }
  return { outs, snap, ctx: last };
}
const MAYA = "I'm a data analyst with 3 years of SQL and Tableau, based in Chicago";

Deno.test("WO-105/1 \"show me senior data analyst jobs in chicago\" is a search (Muse scenario 5's words), not \"I didn't catch that\"", () => {
  const { outs } = turns([MAYA, "show me senior data analyst jobs in chicago"]);
  const r = outs[1].reply as string;
  assert(!/didn't catch that/i.test(r), r);
  assert(/Northwind Ledger/.test(r), r);
});

Deno.test("WO-105/2 experience the profile does not date is unknown, not zero: the senior role asked for is not excluded", () => {
  const { outs } = turns([MAYA, "show me senior data analyst jobs in chicago"]);
  const shortlist = (outs[1].result ?? outs[1]).shortlist ?? [];
  assert(shortlist.some((s: any) => s.company === "Northwind Ledger"), JSON.stringify(shortlist));
  const excluded = JSON.stringify((outs[1].result ?? outs[1]).excluded ?? []);
  assert(!/0 yrs experience|shows about 0/.test(excluded), excluded);
});

Deno.test("WO-105/3 a remote posting is said to be remote, never \"means relocating\"; a senior ask ranks senior roles above others of equal fit", () => {
  const { outs } = turns([MAYA, "show me senior data analyst jobs in chicago"]);
  const r = outs[1].reply as string;
  assert(!/relocat/i.test(r), r);
  const names = ((outs[1].result ?? outs[1]).shortlist ?? []).map((s: any) => s.company);
  assert(names.indexOf("Bluefin Health") > names.indexOf("Northwind Ledger"), names.join(", "));
});

Deno.test("WO-105/4 the router remembers the list it showed, in the order shown, with each posting's own link", () => {
  const { outs, snap } = turns([MAYA, "show me senior data analyst jobs in chicago"]);
  const shown = snap?.stores?.discovery?.lastShown;
  assert(shown && Array.isArray(shown.items), JSON.stringify(snap?.stores?.discovery ?? null));
  eq(shown.items.map((x: any) => x.company), ((outs[1].result ?? outs[1]).shortlist ?? []).map((s: any) => s.company), "same order as shown");
  const nw = shown.items.find((x: any) => x.company === "Northwind Ledger");
  eq(nw.url, "https://boards.greenhouse.io/northwindledger/jobs/4011");
  eq(nw.id, "greenhouse:northwindledger:4011");
});

Deno.test("WO-105/5 the live pool: open career_postings only, never the October snapshot", () => {
  const handler = read("supabase/functions/agent-chat/handler-career.ts");
  assert(/CareerPool\.createLivePoolLoader\(/.test(handler) && !/CareerPool\.createKbPoolLoader\(/.test(handler), "agent-chat ranks from the live table");
  assert(/f\.op === "is"\) q = q\.is\(/.test(handler), "the open-only filter reaches the query");
});

const SHOWN: LastShown = { at: iso, items: [
  { id: "lever:copperline:1", title: "Senior Data Analyst", company: "Copperline Labs", url: "https://jobs.lever.co/copperline/5b1c2d3e-0000-4000-8000-000000000001" },
  { id: "greenhouse:northwindledger:4011", title: "Senior Data Analyst", company: "Northwind Ledger", url: "https://boards.greenhouse.io/northwindledger/jobs/4011" },
  { id: "ashby:bluefin:2", title: "Data Analyst", company: "Bluefin Health", url: "https://jobs.ashbyhq.com/bluefin/7f0e0e0e-0000-4000-8000-000000000002" },
] };
const onFile = (rows: any[] = ROWS) => async (id: string) => rows.find((r) => r.job_id === id) ?? null;

Deno.test("WO-105/6 positions and names: \"the second one\", \"#2\", \"2nd\", \"1 and 3\", \"the last one\", \"apply to Bluefin\"", () => {
  eq(positionsIn("apply to the second one", 3), [2]);
  eq(positionsIn("apply to #2", 3), [2]);
  eq(positionsIn("apply to the 2nd", 3), [2]);
  eq(positionsIn("apply to 1 and 3", 3), [1, 3]);
  eq(positionsIn("apply to the last one", 3), [3]);
  eq(picksFrom("apply to Bluefin", SHOWN)?.picks.map((p) => p.company), ["Bluefin Health"]);
  eq(picksFrom("how do I apply to the second one?", SHOWN), null, "a question about applying applies to nothing");
  eq(picksFrom("tell me about the second one", SHOWN), null, "no apply ask, no queue");
});

Deno.test("WO-105/7 \"apply to the second one\" queues exactly the second posting shown, once, and says the next step", async () => {
  const wants = memoryWantStore();
  const a = await applyPickTurn({ message: "apply to the second one", userId: "u", now: Date.now(), shown: SHOWN, deps: { wants, posting: onFile() } });
  assert(a && a.status === "queued", JSON.stringify(a));
  assert(/Queued: Senior Data Analyst at Northwind Ledger/.test(a.reply), a.reply);
  assert(/Nothing is sent until you approve that card/.test(a.reply), a.reply);
  const q = await wants.list("u");
  eq(q.map((w) => w.company), ["Northwind Ledger"]);
  assert(/greenhouse\.io\/northwindledger\/jobs\/4011$/.test(q[0].url), `the posting's own form (WO-066 applyUrl may move it to Greenhouse's form host): ${q[0].url}`);
  const b = await applyPickTurn({ message: "apply to the second one", userId: "u", now: Date.now(), shown: SHOWN, deps: { wants, posting: onFile() } });
  eq(b?.status, "already");
  eq((await wants.list("u")).length, 1, "never queued twice");
});

Deno.test("WO-105/8 a closed posting, a site the extension cannot open and a number past the list are said, and nothing is queued for them", async () => {
  const wants = memoryWantStore();
  const closed = await applyPickTurn({ message: "apply to the third one", userId: "u", now: Date.now(), shown: SHOWN,
    deps: { wants, posting: onFile(ROWS.map((r) => r.job_id === "ashby:bluefin:2" ? { ...r, closed_at: iso } : r)) } });
  assert(closed && closed.status === "refused" && /no longer listed/.test(closed.reply), JSON.stringify(closed));
  const odd: LastShown = { at: iso, items: [{ id: "x:1", title: "Analyst", company: "Acme", url: "https://careers.acme.example/jobs/1" }] };
  const site = await applyPickTurn({ message: "apply to the first one", userId: "u", now: Date.now(), shown: odd,
    deps: { wants, posting: async () => ({ job_id: "x:1", company: "Acme", title: "Analyst", url: "https://careers.acme.example/jobs/1" }) } });
  assert(site && site.status === "refused" && /apply there yourself: https:\/\/careers\.acme\.example\/jobs\/1/.test(site.reply), JSON.stringify(site));
  const far = await applyPickTurn({ message: "apply to the fifth one", userId: "u", now: Date.now(), shown: SHOWN, deps: { wants, posting: onFile() } });
  assert(far && far.status === "refused" && /I showed you 3 roles, so there is no number 5/.test(far.reply), JSON.stringify(far));
  eq((await wants.list("u")).length, 0);
});

Deno.test("WO-105/9 the handler runs the pick before either brain, on the list this thread was shown, into the person's own queue", () => {
  const handler = read("supabase/functions/agent-chat/handler-career.ts");
  assert(/import \{ applyPickTurn \} from "\.\.\/_shared\/career_apply_pick\.ts"/.test(handler));
  const at = handler.indexOf("applyPickTurn({"), brain = handler.indexOf('chooseBrain(Deno.env) === "agent"');
  assert(at > 0 && brain > at, "the pick is code's, before the agent brain and the router");
  assert(/discovery\?\.lastShown/.test(handler), "it reads the list this thread was shown");
  assert(/wants: supabaseWantStore\(admin\)/.test(handler.slice(at, at + 600)), "into career_apply_wanted, the extension's queue");
});

Deno.test("WO-105/10 the whole chain in the simulator: find, then \"apply to the first one\", then the queue holds that posting with its own link", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${dir}/s.txt`, [MAYA,
      "/post Senior Data Analyst | Northwind Ledger | Chicago, IL | https://boards.greenhouse.io/northwindledger/jobs/4011",
      "/post Data Analyst | Bluefin Health | Chicago, IL | https://jobs.ashbyhq.com/bluefin/7f0e0e0e-0000-4000-8000-000000000002",
      "show me senior data analyst jobs in chicago", "apply to the first one", "/queue", "/quit"].join("\n"));
    const run = await new Deno.Command(Deno.execPath(), { args: ["run", "-A", "--no-check", "scripts/text.ts", "--fresh", "--brain", "router", "--as", "+15550010505", "--script", `${dir}/s.txt`],
      cwd: new URL("../../", import.meta.url), stdout: "piped", stderr: "piped", env: { OPENAI_API_KEY: "" } }).output();
    const text = new TextDecoder().decode(run.stdout);
    assert(/Queued: Senior Data Analyst at Northwind Ledger/.test(text), text);
    assert(/apply queue 1: Senior Data Analyst at Northwind Ledger, https:\/\/boards\.greenhouse\.io\/northwindledger\/jobs\/4011, waiting/.test(text), text);
  } finally { await Deno.remove(dir, { recursive: true }); }
});

Deno.test("WO-105/11 the list says how to apply from it: \"apply to the second one\" is in the search reply", () => {
  const { outs } = turns([MAYA, "show me senior data analyst jobs in chicago"]);
  assert(/Say "apply to the second one" \(or any number\) and I will put it in your apply queue/.test(outs[1].reply), outs[1].reply);
});

Deno.test("WO-105/12 a question is answered and queues nothing; a polite ask queues; \"apply that filter\" and a pasted link are not picks; \"it\" picks the one shown or asks which", async () => {
  const wants = memoryWantStore();
  const ask = (message: string, shown: LastShown = SHOWN) => applyPickTurn({ message, userId: "u", now: Date.now(), shown, deps: { wants, posting: onFile() } });
  const how = await ask("how do I apply to the first one?");
  assert(how && how.status === "explained" && how.queued === 0, JSON.stringify(how));
  assert(/Senior Data Analyst at Copperline Labs is number 1 of the 3 I showed you\. Say "apply to the first one"/.test(how.reply), how.reply);
  assert(/Nothing is sent until you approve that card/.test(how.reply) && /Nothing was queued yet/.test(how.reply), how.reply);
  eq(askedAbout("can I apply to both?", SHOWN)?.map((s) => s.company), ["Copperline Labs", "Northwind Ledger"]);
  eq((await wants.list("u")).length, 0, "a question queued nothing");
  const polite = await ask("can you apply to the second one?");
  assert(polite && polite.status === "queued" && /Queued: Senior Data Analyst at Northwind Ledger/.test(polite.reply), JSON.stringify(polite));
  eq(picksFrom("apply that filter to the search", SHOWN), null, "apply as in use a filter");
  eq(picksFrom("apply this to my search", SHOWN), null);
  eq(picksFrom("apply to this job https://boards.greenhouse.io/other/jobs/9", SHOWN), null, "a pasted link is its own posting");
  eq(picksFrom("don't apply to the third one", SHOWN), null);
  const which = await ask("apply to it");
  assert(which && which.status === "refused" && /^Which one\? I showed you 3 roles:/.test(which.reply) && /Nothing was queued yet/.test(which.reply), JSON.stringify(which));
  eq(picksFrom("apply to it", { at: iso, items: [SHOWN.items[2]] })?.picks.map((s) => s.company), ["Bluefin Health"]);
  eq((await wants.list("u")).length, 1, "only the polite ask queued");
});

Deno.test("WO-105/13 past applications and the day's limit are read only when a pick is queued; a failed read queues nothing and says so", async () => {
  let reads = 0;
  const wants = memoryWantStore();
  const deps = { wants, posting: onFile(), apps: async () => { reads++; return null; }, limits: async () => { reads++; return {}; } };
  for (const message of ["thanks", "tell me about the second one", "how do I apply to the first one?", "apply to the ninth one"]) {
    await applyPickTurn({ message, userId: "u", now: Date.now(), shown: SHOWN, deps });
  }
  eq(reads, 0, "no read on a turn that queues nothing");
  const r = await applyPickTurn({ message: "apply to the second one", userId: "u", now: Date.now(), shown: SHOWN, deps });
  assert(r && r.status === "refused" && /couldn't read your past applications/.test(r.reply) && /Nothing was queued/.test(r.reply), JSON.stringify(r));
  eq((await wants.list("u")).length, 0);
  const handler = read("supabase/functions/agent-chat/handler-career.ts");
  const at = handler.indexOf("applyPickTurn({");
  assert(/apps: \(\) => supabaseMailStore\(admin\)\.applications\(user\.id\)/.test(handler.slice(at, at + 800)), "the handler passes the read, not its result");
});
