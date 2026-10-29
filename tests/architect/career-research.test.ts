// Open career questions (flag CAREER_KNOWLEDGE): understand -> ground -> write -> guard. Search is mocked; deterministic; no key, no network.
//   deno test -A --no-check tests/architect/career-research.test.ts
import assertNode from "node:assert/strict";
import { FIELDS, GK_TERMS, OVERLAYS } from "../../supabase/functions/_shared/agent/research/fields.ts";
import { acceptFacts, specifics, unsupported } from "../../supabase/functions/_shared/agent/research/guard.ts";
import { groundFor, cacheKey, memoryGroundCache, openAiGroundSearch, type GroundSearch } from "../../supabase/functions/_shared/agent/research/ground.ts";
import { researchCareerQuestion } from "../../supabase/functions/_shared/agent/research/index.ts";
import { lintChat, CHAT_MAX_WORDS } from "../../supabase/functions/_shared/agent/research/chat.ts";
import { buildContextPack } from "../../supabase/functions/_shared/agent/knowledge/context_pack.ts";
import { understand } from "../../supabase/functions/_shared/agent/research/understand.ts";
import { memoryBudgetGate } from "../../supabase/functions/_shared/model_budget.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { DEFAULT_SEARCH_MODEL } from "../../supabase/functions/_shared/career_people_provider.ts";
import { LINK, mockSearch, PERSONAS } from "../../evals/career/advice/fixtures.ts";
import { NOW, profileOf, runPersona, scorePersona } from "../../evals/career/advice/run-fixtures.ts";
import { CRITERIA, scoreBrief, table } from "../../evals/career/advice/score.ts";
import { gate, judgeRequest, loadSeeds, summarize, validateSeeds } from "../../evals/career/advice-seeds.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ok = (v: unknown, m?: string) => assertNode.ok(v, m);
const P = (id: string) => PERSONAS.find((p) => p.id === id)!;

Deno.test("general knowledge: no number, no named employer or program in any field or overlay line", () => {
  const lines: string[] = [];
  for (const f of FIELDS) lines.push(f.now, f.later, ...Object.values(f.slots), ...f.targets, ...f.credentials, ...f.who, ...f.asks, ...f.verify);
  for (const v of OVERLAYS) lines.push(v.read, v.stage ?? "", v.network ?? "", v.verify ?? "");
  for (const l of lines) { const bad = unsupported(l, ""); eq(bad, [], `"${l.slice(0, 60)}" has specifics: ${bad}`); }
  ok(FIELDS.length >= 10 && ["ib", "consulting", "swe", "data", "nursing", "trades", "teaching", "pm_ops", "eng", "lnd"].every((id) => FIELDS.some((f) => f.id === id)));
  ok([...GK_TERMS].every((t) => !/goldman|lazard|mckinsey|google|meta/.test(t)));
});

Deno.test("investment banking freshman: realistic now vs later, boutique/middle-market/small PE path, programs and timeline only from the source, no named people", async () => {
  const p = P("ib-freshman"), res = await runPersona(p), md = res.brief_markdown;
  ok(/\*\*Realistic now\.\*\*/.test(md) && /\*\*Realistic later\.\*\*/.test(md));
  for (const w of ["Boutique", "Middle-market", "private equity"]) ok(md.includes(w), w);
  ok(md.includes("early-insight programs") && md.includes("summer analyst applications"), "from the fixture source");
  ok(md.includes("Northfield Advisory Partners"), "a named firm appears because a source named it");
  for (const x of p.poison) ok(!md.includes(x), `poison ${x}`);
  const net = md.split("## Networking plan")[1].split("## Skills")[0];
  ok(/fifteen-minute/.test(net) && /not a job/.test(net));
  eq(specifics(net.replace(/\[[^\]]*\]/g, "")).names.filter((n) => !GK_TERMS.has(n.toLowerCase())), [], "no named individual in networking");
  ok(/## Sources\n\n1\. S1: https:\/\/fixtures\.example\/ib\/timeline/.test(md));
  eq(res.unsourced, []);
  ok(res.dropped.length === 0 && /dropped because I could not trace/.test(md), "the injected unsourced claim was rejected and said so");
});

Deno.test("nothing retrieved: no off-cycle, early-insight, sophomore program or timeline appears; the brief says it quoted none", async () => {
  const none: GroundSearch = async () => ({ status: "ok", facts: [], urls: [], cost_usd: 0 });
  const res = await researchCareerQuestion({ message: "how do I get hired as an investment banker", profile: profileOf(P("ib-freshman")), deps: { search: none }, now: NOW });
  if (res.status !== "ok") throw new Error("expected ok");
  const md = res.brief_markdown;
  for (const w of ["early-insight", "off-cycle", "sophomore program", "summer analyst applications", "$"]) ok(!md.toLowerCase().includes(w.toLowerCase()), w);
  ok(/quoting none/.test(md) && /No retrieved source for current pay figures/.test(md) && /No sources were retrieved/.test(md));
  const failed: GroundSearch = async () => ({ status: "error", detail: "HTTP 500" });
  const r2 = await researchCareerQuestion({ message: "how do I get hired as an investment banker", deps: { search: failed }, now: NOW });
  ok(r2.status === "ok" && /search was not completed/.test(r2.brief_markdown));
});

Deno.test("eleven personas: understanding, field-appropriate content, no software default, no invented specifics, chat cap, 18+/20", async () => {
  const want: Record<string, [string, string]> = { "ib-freshman": ["ib", "early_student"], "nurse-new-grad": ["nursing", "new_grad"], "electrician-apprentice": ["trades", "experienced"], "teacher-switcher": ["lnd", "switcher"], "laid-off-52-pm": ["pm_ops", "displaced"], "f1-data": ["data", "grad_student"], "veteran-trades": ["trades", "switcher"], "cc-transfer-eng": ["eng", "early_student"], "bootcamp-swe": ["swe", "new_grad"], "mba-consulting": ["consulting", "grad_student"], "firstgen-swe-small": ["swe", "early_student"] };
  eq(PERSONAS.length, 11);
  const rows = [];
  for (const p of PERSONAS) {
    const pack = buildContextPack({ profile: profileOf(p), message: p.message });
    const u = understand({ pack, message: p.message });
    eq([u.field?.id, u.stage], want[p.id], `${p.id} understood as ${u.field?.id}/${u.stage}`);
    const res = await runPersona(p);
    for (const x of p.poison) ok(!res.brief_markdown.includes(x), `${p.id}: poison ${x}`);
    ok(res.ask === null || (res.ask.match(/\?/g) ?? []).length === 1, `${p.id}: at most one question`);
    const r = await scorePersona(p, res);
    ok(r.chat.length === 0, `${p.id} chat: ${r.chat}`);
    ok(p.chat.replace(LINK, "").trim().split(/\s+/).length <= CHAT_MAX_WORDS);
    ok(r.total >= 18 && r.unsourced.length === 0 && r.pass, `${p.id}: ${r.total}/20 ${r.notes} ${r.unsourced}`);
    rows.push({ id: p.id, r });
  }
  console.log("\n" + table(rows));
  for (const f of ["nursing", "trades", "pm_ops", "eng", "lnd", "consulting", "ib"]) {
    const md = (await runPersona(PERSONAS.find((p) => p.field === f)!)).brief_markdown;
    ok(!/\b(leetcode|github|software|python|coding)\b/i.test(md), `${f}: no software default`);
  }
  eq(CRITERIA.length, 10);
});

Deno.test("the scorer is brutal: the 6/10 answer, a poison line, an unsourced figure and a foreign-field word each fail", async () => {
  const p = P("ib-freshman"), res = await runPersona(p), base = { brief: res.brief_markdown, chat: p.chat, link: LINK, facts: res.facts, person: res.person, message: p.message, must: p.must, foreign: p.foreign, poison: p.poison, ask: res.ask };
  ok(scoreBrief(base).pass);
  const six = "It'd be tough to get an internship at banks like Goldman or Lazard as a freshman, however to prepare you'd like a boutique internship at a small investment bank, a small PE shop, and others; you'd also need to network with industry professionals.";
  const lint = lintChat(six, { link: null, facts: res.facts, person: res.person, message: p.message });
  ok(lint.length >= 3, `6/10 answer lints: ${lint}`);
  ok(!scoreBrief({ ...base, brief: res.brief_markdown + "\n- First-year analysts earn $250,000 at Goldman Sachs.\n" }).pass, "unsourced specifics fail");
  ok(!scoreBrief({ ...base, brief: res.brief_markdown.replace("## Networking plan", "## Notes") }).pass, "a missing section fails");
  ok(!scoreBrief({ ...base, brief: res.brief_markdown + "\nLearn python and leetcode.\n", foreign: /\b(leetcode|python)\b/i }).pass, "software default fails");
  ok(!scoreBrief({ ...base, chat: p.chat.replace("Right now", "Great question! Right now") }).pass, "canned opener fails");
  ok(!scoreBrief({ ...base, chat: p.chat + " Also let me know if you have questions." }).pass, "filler fails");
  const longChat = p.chat.replace(LINK, "") + "More words ".repeat(40) + LINK;
  ok(lintChat(longChat, { link: LINK, facts: res.facts, person: res.person, message: p.message }).some((x) => /too long/.test(x)));
  ok(lintChat("Right now it is hard. Later it is easier. $999 pay at Acme. " + LINK, { link: LINK, facts: [], person: [], message: "x" }).some((x) => /no source/.test(x)));
});

Deno.test("guard: a fact needs a returned https URL, a quote, and every number and name in the quote", () => {
  const f = (o: any) => ({ id: "", kind: "pay", text: "The median wage was $99,010.", quote: "The median wage was $99,010 last year.", url: "https://a.example/x?utm_source=z", label: "a.example", ...o });
  eq(acceptFacts([f({})], ["https://a.example/x"]).kept.length, 1);
  eq(acceptFacts([f({ url: "https://b.example/x" })], ["https://a.example/x"]).kept.length, 0, "URL not returned");
  eq(acceptFacts([f({ url: "http://a.example/x" })], ["http://a.example/x"]).kept.length, 0, "not https");
  eq(acceptFacts([f({ text: "The median wage was $120,000." })], ["https://a.example/x"]).kept.length, 0, "number not in quote");
  eq(acceptFacts([f({ text: "Acme Capital pays $99,010." })], ["https://a.example/x"]).kept.length, 0, "name not in quote");
  eq(acceptFacts([f({ quote: "" })], ["https://a.example/x"]).kept.length, 0, "no quote");
});

Deno.test("ground: cache by (field, stage, geography) with TTL, one in-flight run, per-answer cost cap", async () => {
  const p = P("nurse-new-grad"), cache = memoryGroundCache(), calls = { n: 0 };
  const u = (m: string) => understand({ pack: buildContextPack({ profile: profileOf(p), message: m }), message: m });
  const a = await groundFor({ u: u(p.message), search: mockSearch(p, calls), cache, now: NOW });
  eq([a.from_cache, a.searches, calls.n], [false, 4, 4]);
  const b = await groundFor({ u: u("what should a new grad nurse in Texas do first?"), search: mockSearch(p, calls), cache, now: NOW + 3600_000 });
  eq([b.from_cache, b.searches, calls.n, b.facts.length], [true, 0, 4, a.facts.length], "100k similar questions share one set of searches");
  const c = await groundFor({ u: u("I'm a new grad nurse in Ohio, how do I get hired?"), search: mockSearch(p, calls), cache, now: NOW + 3600_000 });
  eq(c.from_cache, false, "a different geography is a different key");
  const d = await groundFor({ u: u(p.message), search: mockSearch(p, calls), cache, now: NOW + 15 * 24 * 3600_000 });
  eq(d.from_cache, false, "past the TTL it searches again");
  eq(cacheKey("nursing", "new_grad", "texas"), "nursing|new_grad|texas");
  const k = { n: 0 }, c2 = memoryGroundCache();
  const [x, y] = await Promise.all([groundFor({ u: u(p.message), search: mockSearch(p, k), cache: c2, now: NOW }), groundFor({ u: u(p.message), search: mockSearch(p, k), cache: c2, now: NOW })]);
  eq([k.n, [x.from_cache, y.from_cache].sort()], [4, [false, true]], "concurrent identical misses run once");
  const cap = { n: 0 };
  const e = await groundFor({ u: u(p.message), search: mockSearch(p, cap), now: NOW, costCapUsd: 0.1 });
  eq([e.searches, cap.n], [1, 1], "the cost cap counts the worst case per search");
  ok(e.notes.some((n) => /cost cap/.test(n)));
  const bad = memoryGroundCache();
  await groundFor({ u: u(p.message), search: async () => ({ status: "error", detail: "x" }), cache: bad, now: NOW });
  eq(bad.size(), 0, "a failed search is never cached");
});

Deno.test("no field: one question, no search; a state-licensed field with no state asks one question and still answers", async () => {
  let n = 0;
  const s: GroundSearch = async () => { n++; return { status: "ok", facts: [], urls: [], cost_usd: 0 }; };
  const r = await researchCareerQuestion({ message: "what should I do with my career?", deps: { search: s }, now: NOW });
  eq([r.status, n], ["need_field", 0]);
  ok(r.status === "need_field" && (r.ask.match(/\?/g) ?? []).length === 1);
  const v = await runPersona(P("veteran-trades"));
  ok(v.ask && /Which state/.test(v.ask) && v.brief_markdown.includes("Assuming you're in the US"));
  const e = await runPersona(P("electrician-apprentice"));
  eq(e.ask, null, "the person said Ohio: nothing to ask");
});

Deno.test("OpenAI search path: reserved in the day's budget at the worst case first; parsed facts carry the returned URLs; a spent budget sends nothing", async () => {
  const body = { output: [{ type: "web_search_call", action: { sources: [{ url: "https://www.bls.gov/ooh/x.htm" }] } }, { type: "message", content: [{ text: JSON.stringify({ facts: [{ kind: "pay", text: "The median wage was $61,590.", quote: "The median annual wage was $61,590.", url: "https://www.bls.gov/ooh/x.htm" }, { kind: "pay", text: "x", quote: "y", url: "https://elsewhere.example/" }] }), annotations: [] }] }], usage: { input_tokens: 9000, output_tokens: 300 } };
  let sent = 0, reqBody: any = null;
  const fetchOk = (async (_u: string, init: any) => { sent++; reqBody = JSON.parse(init.body); return new Response(JSON.stringify(body), { status: 200 }); }) as unknown as typeof fetch;
  const gate = memoryBudgetGate(20_000_000);
  const out = await openAiGroundSearch({ apiKey: "k", model: DEFAULT_SEARCH_MODEL, fetch: fetchOk, budget: gate })({ q: "electricians pay", kinds: ["pay"] }, { field: "trades", stage: "x", geo: "us" });
  ok(out.status === "ok" && out.facts.length === 2 && out.cost_usd! > 0.025);
  eq(reqBody.max_tool_calls, 1); ok(reqBody.tools[0].filters.blocked_domains.length >= 3, "LinkedIn and Indeed stay blocked");
  const snap = gate.snapshot(); ok(snap.spent > 0 && snap.reserved === 0, "settled");
  if (out.status === "ok") eq(acceptFacts(out.facts, out.urls).kept.length, 1, "the fact whose URL the search did not return is dropped");
  const tiny = memoryBudgetGate(1000);
  const blocked = await openAiGroundSearch({ apiKey: "k", model: DEFAULT_SEARCH_MODEL, fetch: fetchOk, budget: tiny })({ q: "x", kinds: ["pay"] }, { field: "trades", stage: "x", geo: "us" });
  eq([blocked.status, sent], ["blocked", 1], "the budget refused before any request");
});

Deno.test("tool wiring: research_career_question exists only when research is configured", () => {
  const names = (research: any) => careerTools({ postings: async () => [], research }).map((t) => t.name);
  ok(!names(null).includes("research_career_question"));
  ok(names({ search: mockSearch(P("ib-freshman")) }).includes("research_career_question"));
});

Deno.test("advice seeds: 135 valid seeds, the judge request carries the sources, and the pass rule needs all three gates", async () => {
  const seeds = loadSeeds();
  eq(validateSeeds(seeds), []);
  const p = P("nurse-new-grad"), res = await runPersona(p);
  const rec = { message: p.message, chat: p.chat, brief: res.brief_markdown, facts: res.facts, person: res.person, link: LINK };
  const tpl = Deno.readTextFileSync(new URL("../../evals/career/advice-judge-prompt.md", import.meta.url));
  const req = judgeRequest(seeds[0], rec, tpl);
  ok(req.prompt.includes(res.facts[0].url) && !req.prompt.includes("{{"));
  const full = Object.fromEntries(CRITERIA.map((c) => [c, { score: 2 }])) as any;
  ok(gate(full, rec).pass);
  ok(!gate({ ...full, networking: { score: 0 }, unverified: { score: 0 } }, rec).pass, "17 of 20 fails");
  ok(!gate(full, { ...rec, brief: rec.brief + "\n- Pay at Mayo Clinic is $120,000.\n" }).pass, "judge cannot override the code check");
  ok(!gate(full, { ...rec, chat: "Great question! " + rec.chat }).pass);
  ok(summarize([{ id: "S001", g: gate({}, rec) }]).includes("weakest"));
});
