// The battery's calibrated judge, fixed task set and noise band (owner, 2026-10-20). Offline: no model call.
//   deno test -A --no-check evals/career/battery-judge.test.ts
import { makeCtx, summaryLines, tallyLine, type Run, type TaskDef } from "./run-tasks.ts";
import { checkConfirmsNoSend, checkNumbered, checkPayFromPosting, checkPostingTermsClaimed, checkSaysDraft, checkSaysNoApplication, combine, forJudge,
  judgeV2Prompt, moneyIn, parseItemJudge, rubricItems } from "./judge-v2.ts";
import { fillHash, resolveFixed } from "./fixed-fills.ts";
import { confusion, storedRun } from "./judge-calibrate.ts";
import { fetchShelf, type Shelf, type ShelfPosting } from "./live-shelf.ts";
import { productPool } from "./run-tasks.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }

const LONG = "You will build and own the data pipelines for our analytics platform. You will work with SQL, Python and Airflow every day, partner with product and finance, and present results to the leadership team. We are looking for someone with three years of experience and strong communication skills.";
const post = (id: string, company: string, title: string, location: string, pay: string | null = null, text = LONG): ShelfPosting =>
  ({ id: `greenhouse:${company.toLowerCase()}:${id}`, company, title, location, url: `https://job-boards.greenhouse.io/${company.toLowerCase()}/jobs/${id}`, ats: "greenhouse", posted_at: "2026-08-01T00:00:00Z", text, pay, department: "", board: company.toLowerCase() });
const SHELF: Shelf = { run_id: "t", seed: "t", fetched_at: "2026-10-20T00:00:00Z", cap: 600, per_board: 16, boards: [], postings: [
  post("1001001", "Klaviyo", "Senior Data Analyst", "Boston, MA", "$120,000–$180,000"),
  post("1001002", "Klaviyo", "Data Analyst", "Denver, CO"),
  post("2002001", "Chime", "Data Analyst", "San Francisco, CA", null),
  post("2002002", "Chime", "Product Manager", "Chicago, IL", "$142,000–$244,000"),
] };
const fills = (ids: string[] = [SHELF.postings[0].id, SHELF.postings[2].id]) => ({ company: "Klaviyo", title: "Data Analyst", location: "Boston, MA", company2: "Chime", title2: "Data Analyst", location2: "San Francisco, CA", posting_ids: ids });
const ctx = (f = fills()) => makeCtx(SHELF, f);
const run = (replies: string[], meta: any[] = replies.map(() => ({}))): Run => ({ replies, meta, state: { stores: null, alerts: { rows: {}, outbox: [] } } });

Deno.test("numbered: a numbered list passes, the same postings as prose fail, one posting needs no number", () => {
  const listed = "Two roles:\n1. Senior Data Analyst — Klaviyo — Boston, MA — https://job-boards.greenhouse.io/klaviyo/jobs/1001001\n2. Data Analyst — Chime — San Francisco, CA\nWant details?";
  assert(checkNumbered(ctx(), [listed]).pass, "numbered list");
  const prose = "Senior Data Analyst at Klaviyo — Boston: closest fit. Data Analyst at Chime — San Francisco: closest fit.";
  assert(!checkNumbered(ctx(), [prose]).pass, "prose list of two");
  assert(checkNumbered(ctx(), ["One match: Senior Data Analyst at Klaviyo, Boston."]).pass, "one posting");
  assert(checkNumbered(ctx(), ["I found none. Want me to widen the search?"]).pass, "none listed");
});

Deno.test("says_draft and says_no_application read the reply literally", () => {
  assert(checkSaysDraft(["Draft below — edit and send it yourself.\nHi [Recruiter Name], ..."]).pass);
  assert(!checkSaysDraft(["Hi [Recruiter Name],\nI'm writing about the role.\nBest, [Your Name]"]).pass);
  assert(checkSaysNoApplication(["There are no tracked applications on file yet."]).pass);
  assert(checkSaysNoApplication(["There's no record of any application to Chime on your account."]).pass);
  assert(!checkSaysNoApplication(["Chime has no company file yet. Cadence: No official application windows were on the fetched pages."]).pass, "a company file is not the person's applications");
});

Deno.test("pay_from_posting: the posting's own figures, or 'not listed' when it lists none", () => {
  eq(moneyIn("$176.4K – $243.6K and EUR 53,900 or 150k"), [176400, 243600, 53900, 150000]);
  const withPay = makeCtx(SHELF, { ...fills([SHELF.postings[0].id, SHELF.postings[2].id]) });
  assert(checkPayFromPosting(withPay, ["The posting lists $120,000 – $180,000."]).pass, "its own pay");
  assert(!checkPayFromPosting(withPay, ["The posting doesn't list pay."]).pass, "says not listed when it is");
  assert(!checkPayFromPosting(withPay, ["About $150,000."]).pass, "a figure the posting does not contain");
  const noPay = makeCtx(SHELF, { ...fills([SHELF.postings[2].id, SHELF.postings[0].id]) });
  assert(checkPayFromPosting(noPay, ["The posting doesn't list pay. I won't guess."]).pass, "none listed, says so");
  assert(!checkPayFromPosting(noPay, ["I don't have that posting on file."]).pass, "never says it is not listed");
});

Deno.test("confirms_no_send: a confirmation passes; one resting on a save that did not happen fails (WO-077)", () => {
  assert(checkConfirmsNoSend(["list", "I will not apply to anything for you unless you ask me to."], [{}, { tool_calls: [{ name: "remember_instruction", ok: false, effect: "write_own", error: "store down" }] }]).pass);
  assert(!checkConfirmsNoSend(["list", "Kept for good: \"don't apply to anything\". Saved exactly as you wrote it."], [{}, { tool_calls: [{ name: "get_memory", ok: true, effect: "read" }] }]).pass);
  assert(checkConfirmsNoSend(["list", "Kept for good: \"Never apply to anything on my behalf.\""], [{}, { tool_calls: [{ name: "remember_instruction", ok: true, effect: "write_own" }] }]).pass);
  assert(!checkConfirmsNoSend(["list", "I didn't catch that. Try naming the job, company, or person."], [{}, {}]).pass);
});

Deno.test("posting_terms_claimed: a term the reply says the posting names must be in its text", () => {
  assert(!checkPostingTermsClaimed(ctx(), ["I used the posting (Senior Data Analyst) which mentions python, sql, rust."]).pass, "rust is not in the text");
  assert(checkPostingTermsClaimed(ctx(), ["The posting mentions SQL, Python and Airflow."]).pass);
});

Deno.test("rubric items: code decides its items, the judge gets the rest with the shelf facts and the notes", () => {
  const tasks: Record<string, TaskDef> = Object.fromEntries(JSON.parse(Deno.readTextFileSync(new URL("./tasks-live.json", import.meta.url))).tasks.map((t: TaskDef) => [t.id, t]));
  const r = run(["1. Senior Data Analyst — Klaviyo — Boston, MA\n2. Data Analyst — Chime — San Francisco, CA", "Queued both for your approval; nothing was sent."]);
  const items = rubricItems(tasks.T02, ctx(), r);
  eq(items.map((i) => i.rule.kind), ["judge", "code", "judge"]);
  const prompt = judgeV2Prompt(tasks.T02, ctx(), ["find me Data Analyst roles", "apply to the first two"], r, items);
  assert(/The first two postings of A1's numbered list: 1\) Klaviyo \| Senior Data Analyst/.test(prompt), "the first two are resolved");
  assert(/either A, or B" is met when A or B is met/.test(prompt), "either/or rule");
  assert(!/2\. \[forbidden\] claims an application/.test(prompt), "a code item is not asked of the judge");
  const t11 = rubricItems(tasks.T11, ctx(), run(["The posting lists $120,000 – $180,000."]));
  eq(forJudge(t11).length, 0, "T11 is decided by code alone");
});

Deno.test("combine: majority of votes per item; code items as code decided; a tie fails", () => {
  const tasks: Record<string, TaskDef> = Object.fromEntries(JSON.parse(Deno.readTextFileSync(new URL("./tasks-live.json", import.meta.url))).tasks.map((t: TaskDef) => [t.id, t]));
  const r = run(["1. Senior Data Analyst — Klaviyo\n2. Data Analyst — Chime", "Queued both."]);
  const items = rubricItems(tasks.T02, ctx(), r);
  const v = (a: boolean, b: boolean) => parseItemJudge(JSON.stringify({ items: [{ n: 1, ok: a, evidence: "x" }, { n: 3, ok: b, evidence: "y" }], score: 4, note: "n" }));
  assert(combine(items, [v(true, true), v(true, false), v(true, true)]).pass, "2 of 3 votes");
  assert(!combine(items, [v(true, true), v(false, true)]).pass, "a tie fails");
  assert(!combine(items, []).pass, "no vote, no pass on a judge item");
});

Deno.test("fixed fills: frozen postings used as frozen; a closed one is replaced by its twin and recorded; the hash changes only then", async () => {
  const tasks: Record<string, TaskDef> = Object.fromEntries(JSON.parse(Deno.readTextFileSync(new URL("./tasks-live.json", import.meta.url))).tasks.map((t: TaskDef) => [t.id, t]));
  const frozen = { ...fills([SHELF.postings[1].id, SHELF.postings[2].id]), location: "Denver, CO", boards: ["greenhouse:klaviyo", "greenhouse:chime"] };
  const pool = productPool(SHELF);
  const same = resolveFixed(tasks.T12, frozen, SHELF, pool, "s");
  eq(same.substitution, null);
  eq(same.fills.posting_ids, frozen.posting_ids);
  const twin = post("1001099", "Klaviyo", "Data Analyst", "Denver, CO");
  const later: Shelf = { ...SHELF, postings: [...SHELF.postings.filter((p) => p.id !== frozen.posting_ids[0]), twin] };
  const swapped = resolveFixed(tasks.T12, frozen, later, productPool(later), "s");
  assert(/closed; same words on greenhouse:klaviyo:1001099/.test(swapped.substitution || ""), String(swapped.substitution));
  eq([swapped.fills.company, swapped.fills.title, swapped.fills.location], [frozen.company, frozen.title, frozen.location], "the person's words do not change");
  assert(await fillHash({ T12: same.fills }) !== await fillHash({ T12: swapped.fills }), "the hash shows the swap");
  eq(await fillHash({ T12: same.fills }), await fillHash({ T12: resolveFixed(tasks.T12, frozen, SHELF, pool, "s").fills }), "same fills, same hash");
});

Deno.test("the shelf keeps the fixed postings and samples the rest by a stable rank", async () => {
  const feed = { jobs: Array.from({ length: 40 }, (_, i) => ({ id: 5000 + i, title: `Data Analyst ${i}`, absolute_url: `https://job-boards.greenhouse.io/acme/jobs/${5000 + i}`, location: { name: "Boston, MA" }, content: "x", updated_at: "2026-10-01T00:00:00Z" })) };
  const fetchFn = (async () => new Response(JSON.stringify(feed), { status: 200 })) as unknown as typeof fetch;
  const boards = [{ provider: "greenhouse" as const, board: "acme", company: "Acme", field: "x" }];
  const pins = new Set(["greenhouse:acme:5039"]);
  const a = await fetchShelf({ runId: "1", seed: "fixed", cap: 10, boards, fetchFn, pins });
  assert(a.postings.some((p) => p.id === "greenhouse:acme:5039"), "the pinned posting is kept");
  eq(a.selection, "hash-rank");
  eq(a.pins_missing, []);
  const smaller = { jobs: feed.jobs.filter((j) => j.id !== 5003) };
  const b = await fetchShelf({ runId: "2", seed: "fixed", cap: 10, boards, fetchFn: (async () => new Response(JSON.stringify(smaller))) as unknown as typeof fetch, pins });
  const kept = new Set(b.postings.map((p) => p.id));
  const overlap = a.postings.filter((p) => kept.has(p.id)).length;
  assert(overlap >= a.postings.length - 1, `one closed posting changes at most one pick (overlap ${overlap}/${a.postings.length})`);
});

Deno.test("reports: a pass rate is printed with its judge-noise band, or says the noise is not measured", () => {
  const result = { brain: "agent", label: "tasks-agent-1", passed: 10, total: 15, cost_usd: { brain: 0.1, judge: 0.1 }, items: [], judge: { fingerprint: "abc" }, fill_set: { hash: "0123456789abcdef", substitutions: [] } };
  const cal = { kind: "judge-calibration", fingerprint: "abc", code_only: false, stopped: null, run_at: "2026-10-20T00:00:00Z", label: "judge-calibration-1", noise: { heldout_disagreement_agent: 1 / 30, heldout_disagreement_both: 2 / 60 } };
  const line = summaryLines([result], [cal])[0];
  assert(/10\/15 tasks passed ±1 \(judge noise: held-out disagreement 3\.3%\)/.test(line), line);
  assert(/± \? \(judge noise not measured/.test(summaryLines([result], [])[0]), "no calibration: said so");
  assert(/± \? \(judge noise not measured/.test(summaryLines([{ ...result, judge: { fingerprint: "other" } }], [cal])[0]), "a calibration of another judge is not used");
  eq(tallyLine([result], [cal]), "AGENT 10/15 ±1 judge-noise; fills 01234567");
});

Deno.test("calibration: the confusion matrix counts each cell", () => {
  eq(confusion([{ label: true, judge: true }, { label: false, judge: true }, { label: false, judge: false }, { label: true, judge: false }]),
    { n: 4, agree: 2, rate: 0.5, label_pass_judge_pass: 1, label_fail_judge_fail: 1, label_fail_judge_pass: 1, label_pass_judge_fail: 1 });
  const r = storedRun({ replies: ["a"], meta: [{}], end_state: { tracker: [{ company: "Chime" }], alerts: { rows: {} } } });
  eq((r.state as any).stores.trackStore.rows, [{ company: "Chime" }]);
});
