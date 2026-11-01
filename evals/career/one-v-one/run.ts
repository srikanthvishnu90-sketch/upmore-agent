// 1v1 (2026-11-01): Trainee against the architect's gold replies on the 120 scenarios (scenarios.ts), scored by script
// (score.ts). No model and no judge: free, deterministic, runs in CI.
//
// Trainee's side runs the live path in-process: each scenario's account state is seeded (world.ts openWorld, the handler's
// order over in-memory stores: the situation read, the chat input, the apply card, the open questions, outreach, then the
// router), its prior turns run first in the same thread, and the graded reply goes through the channel's own adapter render
// (channel_registry.ts adaptersFromEnv, the one the outbox and the webhooks use), with CAREER_TEXTING_NATIVE off (the
// default) and on. Web gets the reply as the app shows it.
//
// The staged brain (CAREER_BRAIN=staged) is measured two ways without a paid model: which scenarios it would take
// (career_staged.ts stagedDecision on the scenario's real state), and whether the brain's path keeps a good reply good: a
// fake model that answers with the gold text, through agentTurn and the same render. Whether the system prompt carries the
// texting rules for the channel is reported too.
//
//   deno run -A --no-check evals/career/one-v-one/run.ts --label <label> [--only V001,V009]
//   deno run -A --no-check evals/career/one-v-one/run.ts --report <before-label> <after-label>   writes docs/architect/ONE-V-ONE-2026-11-01.md
import { SCENARIOS, type Scenario, type State } from "./scenarios.ts";
import { CHECKS, CHECK_WHAT, type Channel, type Check, grade, type Graded } from "./score.ts";
import { EXTRA_POSTINGS } from "./postings.ts";

const here = new URL(".", import.meta.url);
const WORLD = JSON.parse(Deno.readTextFileSync(new URL("../worlds/in-flight.json", here)));
const POSTINGS = [...WORLD.postings, ...EXTRA_POSTINGS];

export function seed(state: State) {
  const base = { now: WORLD.now, postings: POSTINGS };
  if (state === "new") return base;
  if (state === "profile") return { ...base, facts: WORLD.facts, standing: WORLD.standing, tracked: WORLD.tracked };
  return { ...WORLD, postings: POSTINGS };
}

export async function renderers(native: boolean) {
  const { adaptersFromEnv } = await import("../../../supabase/functions/_shared/channel_registry.ts");
  const refuse = (async () => { throw new TypeError("no network in the 1v1 run"); }) as unknown as typeof fetch;
  const env: Record<string, string> = { LOOPMESSAGE_API_KEY: "k", TELEGRAM_BOT_TOKEN: "t", WHATSAPP_TOKEN: "w", WHATSAPP_PHONE_NUMBER_ID: "1", ...(native ? { CAREER_TEXTING_NATIVE: "on" } : {}) };
  const a = adaptersFromEnv({ get: (k: string) => env[k] }, { fetch: refuse, clock: () => 0, sleep: async () => {} });
  return (ch: Channel, reply: string): string[] => ch === "web" ? [reply] : a[ch === "sms" ? "imessage" : ch]!.render(reply);
}

export interface Row {
  id: string; feature: string; channel: Channel; state: State; msg: string; gold: string[];
  handler: string; reply: string; off: { bubbles: string[]; g: Graded }; on: { bubbles: string[]; g: Graded };
  staged: { brain: boolean; reason: string; intent: string | null }; brainEcho: { bubbles: string[]; g: Graded } | null; promptRules: boolean | null;
}

export async function runAll(list: Scenario[]): Promise<Row[]> {
  const { openWorld, worldTurn, USER } = await import("../world.ts");
  const { stagedDecision } = await import("../../../supabase/functions/agent-chat/career_staged.ts");
  const off = await renderers(false), on = await renderers(true);
  const rows: Row[] = [];
  for (const s of list) {
    const w = await openWorld(seed(s.state));
    let now = w.now;
    for (const p of s.prior ?? []) { await worldTurn(w, { brain: "router", threadId: "A", message: p, now }); now += 90000; }
    // The staged decision on the real state, before the graded turn (the probe works on a copy).
    const t = w.th("A");
    const ctx: any = w.H.createTurnCtx({ userId: USER, threadId: "A", now, accountPersistence: true, snapshot: t.snapshot, account: w.account, postings: w.kb });
    const d = stagedDecision({ env: { get: (k: string) => ({ CAREER_BRAIN: "staged" } as Record<string, string>)[k] }, message: s.msg, ctx, host: w.H, structured: false });
    // The brain's path with a model that answers with the gold text: does the reply survive the path and the render?
    let brainEcho: Row["brainEcho"] = null, promptRules: boolean | null = null;
    if (d.brain) {
      const w2 = await openWorld(seed(s.state));
      let n2 = w2.now;
      for (const p of s.prior ?? []) { await worldTurn(w2, { brain: "router", threadId: "A", message: p, now: n2 }); n2 += 90000; }
      let system = "";
      const model = async (p: any) => { system ||= p.system; return { content: [{ type: "text", text: s.gold.join("\n\n") }], stop_reason: "end_turn" }; };
      const r2 = await worldTurn(w2, { brain: "agent", threadId: "A", message: s.msg, now: n2, model, channel: s.channel } as any);
      const b = on(s.channel, r2.reply);
      brainEcho = { bubbles: b, g: grade(b, s.channel, s.r, s.msg) };
      promptRules = /alone on its own line/i.test(system) && /no markdown|never markdown|plain text/i.test(system);
    }
    const r = await worldTurn(w, { brain: "router", threadId: "A", message: s.msg, now });
    const bOff = off(s.channel, r.reply), bOn = on(s.channel, r.reply);
    rows.push({ id: s.id, feature: s.feature, channel: s.channel, state: s.state, msg: s.msg, gold: s.gold, handler: r.handler, reply: r.reply,
      off: { bubbles: bOff, g: grade(bOff, s.channel, s.r, s.msg) }, on: { bubbles: bOn, g: grade(bOn, s.channel, s.r, s.msg) },
      staged: { brain: d.brain, reason: d.reason, intent: d.intent }, brainEcho, promptRules });
  }
  return rows;
}

export function goldGrades(list: Scenario[]) { return list.map((s) => ({ id: s.id, g: grade(s.gold, s.channel, s.r, s.msg) })); }

export function tally(rows: Row[], key: "off" | "on") {
  const by: Record<string, number> = Object.fromEntries(CHECKS.map((c) => [c, 0]));
  const checksPassed = rows.reduce((n, r) => n + (CHECKS.length - r[key].g.failed.length), 0);
  for (const r of rows) for (const c of r[key].g.failed) by[c]++;
  return { pass: rows.filter((r) => r[key].g.pass).length, total: rows.length, checksPassed, checks: rows.length * CHECKS.length, by };
}

// ---------------------------------------------------------------------------------------------------------- report
const pct = (a: number, b: number) => b ? `${(100 * a / b).toFixed(1)}%` : "n/a";
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ⏎ ");
function sideBySide(r: Row, key: "off" | "on"): string {
  const g = r[key].g;
  const marks = CHECKS.map((c) => g.failed.includes(c) ? `✗${c}` : null).filter(Boolean).join(" ") || "all pass";
  return `| ${r.id} | ${r.feature} | ${r.channel} | ${r.state} | ${cell(r.msg)} | ${cell(r.gold.join(" ‖ "))} | ${cell(r[key].bubbles.join(" ‖ ").slice(0, 400))} | ${r.handler} | ${marks} |`;
}

export function report(before: Row[], after: Row[], meta: { before: string; after: string }): string {
  const tb = tally(before, "off"), tbn = tally(before, "on"), ta = tally(after, "off"), tan = tally(after, "on");
  const gold = goldGrades(SCENARIOS);
  const ranked = (t: ReturnType<typeof tally>) => CHECKS.map((c) => [c, t.by[c]] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const staged = after.filter((r) => r.staged.brain);
  const echoPass = staged.filter((r) => r.brainEcho?.g.pass).length;
  const textingStaged = (rows: Row[]) => rows.filter((r) => r.staged.brain && r.channel !== "web");
  const rulesB = textingStaged(before).filter((r) => r.promptRules).length, rulesA = textingStaged(after).filter((r) => r.promptRules).length;
  const echoFails = staged.filter((r) => r.brainEcho && !r.brainEcho.g.pass).map((r) => r.id);
  const L: string[] = [];
  L.push("# 1v1: Trainee vs the architect's gold replies (2026-11-01)", "");
  L.push("Owner, 2026-11-01: \"theres alot wrong with the way it outputs info, sends poor information, doesnt act the way an iMessage bot should in terms of response, design... generate a 1v1 comparison between yourself and trainee, and try to get trainee to respond the same as you while providing links the same way as Instinct.\"", "");
  L.push("120 first-week scenarios (`evals/career/one-v-one/scenarios.ts`) across every feature, each with a channel (iMessage, SMS, WhatsApp, Telegram, web) and an account state (new, profile on file, tasks in flight). The gold reply for each was written by hand by the architect (Claude, in session; no model call, no Anthropic API spend). Every scenario carries a rubric a script checks (`score.ts`): bubble count and length, markdown, links present / alone on their own line after the line that says what they are / only real links, question count, numbered options, required facts, forbidden claims, and voice (filler, banned phrases, emoji, internal jargon). The link and formatting rules follow the owner's requirement docs Q73-Q95, Q581-Q587 and Q632-Q633 (cited by number only).", "");
  L.push("Trainee's side: trunk's live path in-process (`run.ts`): the scenario's state seeded, prior turns run, then the turn through the handler's code-first turns and the router (`evals/career/world.ts`), rendered by each channel's own adapter (`channel_registry.ts`). `CAREER_TEXTING_NATIVE` off is what ships by default; on is the texting voice the owner can switch on. Free, deterministic: `deno run -A --no-check evals/career/one-v-one/run.ts --label <label>`.", "");
  L.push("## Pass rates", "");
  L.push(`Gold passes its own rubric: ${gold.filter((g) => g.g.pass).length}/${gold.length}.`, "");
  L.push("| | scenarios passing every check | checks passing |", "|---|---|---|");
  L.push(`| before (trunk 321708d2e), texting voice off (default) | ${tb.pass}/${tb.total} (${pct(tb.pass, tb.total)}) | ${tb.checksPassed}/${tb.checks} (${pct(tb.checksPassed, tb.checks)}) |`);
  L.push(`| before (trunk 321708d2e), texting voice on | ${tbn.pass}/${tbn.total} (${pct(tbn.pass, tbn.total)}) | ${tbn.checksPassed}/${tbn.checks} (${pct(tbn.checksPassed, tbn.checks)}) |`);
  L.push(`| after (this branch), texting voice off (default) | ${ta.pass}/${ta.total} (${pct(ta.pass, ta.total)}) | ${ta.checksPassed}/${ta.checks} (${pct(ta.checksPassed, ta.checks)}) |`);
  L.push(`| after (this branch), texting voice on | ${tan.pass}/${tan.total} (${pct(tan.pass, tan.total)}) | ${tan.checksPassed}/${tan.checks} (${pct(tan.checksPassed, tan.checks)}) |`, "");
  L.push(`Staged brain (\`CAREER_BRAIN=staged\`, fake model, no spend): it would take ${staged.length}/120 of these turns (the rest stay with code and the router). With a model that answers with the gold text, the delivered reply still passes its rubric in ${echoPass}/${staged.length}. The ${echoFails.length} that do not (${echoFails.join(", ")}) lose a pay figure or a posting the fake model stated without calling a tool: the fact guard dropping an unsourced number, as it should (a real turn calls search_jobs first). On the ${textingStaged(after).length} of those turns that go out on a texting channel, the system prompt carries the texting rules (plain text, each link alone on its own line, short bubbles, one question) in ${rulesB}/${textingStaged(before).length} before and ${rulesA}/${textingStaged(after).length} after.`, "");
  L.push("## Failure categories, ranked (scenarios failing each check)", "");
  L.push("| check | what it means | before, voice off | before, voice on | after, voice off | after, voice on |", "|---|---|---|---|---|---|");
  for (const [c] of ranked(tb).concat(ranked(tbn).filter(([c]) => !tb.by[c]))) L.push(`| ${c} | ${CHECK_WHAT[c as Check]} | ${tb.by[c]} | ${tbn.by[c]} | ${ta.by[c]} | ${tan.by[c]} |`);
  L.push("");
  L.push("## What this branch changed (each with a fail-first test in `tests/architect/one-v-one-texting.test.ts`)", "");
  L.push("1. Links: a link inside a sentence now goes on its own line right after the sentence that names it (`channel_voice.ts` linksOnOwnLine reads a line sentence by sentence, never splitting open bold, italics or code). Before, the three postings' sentences came first and their three links after, so no link sat under its posting.");
  L.push("2. Numbered roles: the router's search list numbers its roles 1), 2), 3) (`142-career-router.js` roleSentence; \")\" because the composer reads \"1.\" as a sentence end), so the person can answer with a digit.");
  L.push("3. Bubble length: on iMessage and SMS a reply is split between paragraphs, lines and sentences into bubbles of at most 320 characters (a single sentence longer than that stays whole, in the 700-character bubbles as before) (`channel_voice.ts` imessageNativeRender).");
  L.push("4. Dates: texting channels show \"Oct 19, 2026\", never 2026-10-19; links and code untouched (`channel_voice.ts` humanDates).");
  L.push("5. Staged brain: on a texting channel the system prompt carries the texting rules (`prompt.ts` textingRulesFor), and the channel reaches it (`career_brain.ts` channel, one line in `handler-career.ts`, `world.ts`). Web and no-channel prompts are byte-identical to before.");
  L.push("");
  L.push("Fixes 1, 3 and 4 are in the texting voice, which ships only with `CAREER_TEXTING_NATIVE=on` (an owner secret; off keeps the delivery tests' \"unchanged\" contract). Fix 5 matters only with `CAREER_BRAIN=staged`. Fix 2 is live on every path. (A crisis-phrase change was taken out on review: #354 owns the shared detector; V120 is left to it.) No reply prose was added to make a check pass; the words stay the router's or the model's.", "");
  const groups: [string, RegExp, string][] = [
    ["router dead ends (career_catchall, unclaimed)", /router:(career_catchall|null)$/, "#350 (router dead ends) owns these; not touched here"],
    ["application status and follow-through (tracking_status, reminders)", /router:(tracking_status|tracking_log|conversation_recall)$/, "#355 (status and reminders by code) owns these"],
    ["outreach list-building replies (outreach_clarification, company_intel people)", /router:(outreach_clarification|company_intel)$/, "#361 (personalized outreach) owns the outreach turns"],
    ["advice the router answers from templates (negotiation, prep, resume guidance, os plan)", /router:(negotiation_\w+|prep_\w+|career_resume_guidance|career_os_plan|career_recommendations)$/, "long template prose with internal words (\"source class\", \"company file\"); existing tests pin that wording, so the cure is the staged brain on these turns (it takes them) with the texting rules above"],
    ["tailoring (career_tailor)", /router:career_tailor$/, "the tailor picks the wrong posting (V039: asked for Stripe, tailored Figma): next work order"],
  ];
  L.push("## Not fixed here, and why (after, voice on: failing scenarios by owner)", "", "| group | failing | why not here |", "|---|---|---|");
  for (const [g, re, why] of groups) L.push(`| ${g} | ${after.filter((r) => !r.on.g.pass && re.test(r.handler)).length} | ${why} |`);
  L.push("", "## Overlap with open PRs", "");
  L.push("- #350 (router dead ends) edits `142-career-router.js` and both bundles; this branch edits 142 only in roleSentence (lines 437-447), outside #350's hunks, plus 125 and 139, which #350 does not touch. The bundles are generated: whichever merges second reruns `python3 scripts/build-router-core.py` and `--career-only`.");
  L.push("- #354, #355, #353, #360, #362, #365 edit `handler-career.ts`; this branch adds one line at the agentTurn call (after `shape:`), outside every one of their hunks.");
  L.push("- #361 (outreach) and the results-page builder (#356): no shared files. #364 changes two bundle lines (rebuild as above).", "");
  const byFeature = new Map<string, { n: number; b: number; a: number }>();
  for (const [i, r] of after.entries()) { const f = byFeature.get(r.feature) ?? { n: 0, b: 0, a: 0 }; f.n++; if (before[i].off.g.pass) f.b++; if (r.on.g.pass) f.a++; byFeature.set(r.feature, f); }
  L.push("## By feature (before voice off → after voice on)", "", "| feature | scenarios | before | after |", "|---|---|---|---|");
  for (const [f, v] of byFeature) L.push(`| ${f} | ${v.n} | ${v.b} | ${v.a} |`);
  L.push("");
  const handlers = new Map<string, number>();
  for (const r of after) if (!r.on.g.pass) handlers.set(r.handler, (handlers.get(r.handler) ?? 0) + 1);
  L.push("## Where the remaining failures come from (after, voice on: failing scenarios by the handler that answered)", "", "| handler | failing |", "|---|---|");
  for (const [h, n] of [...handlers].sort((a, b) => b[1] - a[1])) L.push(`| ${h} | ${n} |`);
  L.push("");
  L.push("## Side by side, before (trunk, voice off as shipped)", "", "Bubbles are separated by ‖ and lines by ⏎. Trainee's reply is cut at 400 characters here; the full text is in the results JSON.", "");
  L.push("| id | feature | channel | state | person | gold | Trainee | handler | checks |", "|---|---|---|---|---|---|---|---|---|");
  for (const r of before) L.push(sideBySide(r, "off"));
  L.push("", "## Side by side, after (this branch, voice on)", "");
  L.push("| id | feature | channel | state | person | gold | Trainee | handler | checks |", "|---|---|---|---|---|---|---|---|---|");
  for (const r of after) L.push(sideBySide(r, "on"));
  L.push("");
  return L.join("\n");
}

if (import.meta.main) {
  const args = Deno.args, opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] ?? null : null; };
  const out = new URL("./results/", here);
  if (args[0] === "--report") {
    const [b, a] = [args[1], args[2]];
    const before = JSON.parse(Deno.readTextFileSync(new URL(`${b}.json`, out))), after = JSON.parse(Deno.readTextFileSync(new URL(`${a}.json`, out)));
    Deno.writeTextFileSync(new URL("../../../docs/architect/ONE-V-ONE-2026-11-01.md", here), report(before, after, { before: b, after: a }));
    console.log("wrote docs/architect/ONE-V-ONE-2026-11-01.md");
  } else {
    const label = opt("--label") ?? "run";
    const only = opt("--only")?.split(",");
    const rows = await runAll(only ? SCENARIOS.filter((s) => only.includes(s.id)) : SCENARIOS);
    Deno.mkdirSync(out, { recursive: true });
    Deno.writeTextFileSync(new URL(`${label}.json`, out), JSON.stringify(rows, null, 1) + "\n");
    const off = tally(rows, "off"), on = tally(rows, "on");
    const gold = goldGrades(SCENARIOS).filter((g) => !g.g.pass);
    console.log(`gold failing its own rubric: ${gold.length}${gold.length ? " " + gold.map((g) => `${g.id}:${g.g.failed.join("+")}`).join(" ") : ""}`);
    console.log(`voice off: ${off.pass}/${off.total} scenarios, ${off.checksPassed}/${off.checks} checks; by check ${JSON.stringify(off.by)}`);
    console.log(`voice on:  ${on.pass}/${on.total} scenarios, ${on.checksPassed}/${on.checks} checks; by check ${JSON.stringify(on.by)}`);
    const st = rows.filter((r) => r.staged.brain);
    console.log(`staged brain takes ${st.length}; echo passes ${st.filter((r) => r.brainEcho?.g.pass).length}; prompt rules ${st.filter((r) => r.promptRules).length}`);
  }
}
