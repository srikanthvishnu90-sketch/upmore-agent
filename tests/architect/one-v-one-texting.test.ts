// 1v1 (owner, 2026-11-01: "doesnt act the way an iMessage bot should ... try to get trainee to respond the same as you while
// providing links the same way as Instinct"). The 120-scenario 1v1 (evals/career/one-v-one) and the fixes it ranked first,
// each written failing first:
//   1. links: a link inside a sentence goes on its own line right after the sentence that says what it is (Q584, Q585,
//      Q632), and the router numbers the roles it lists so the person can answer with a digit (Q89);
//   2. bubbles: on iMessage and SMS no bubble runs past a text's length (Q77), split between sentences, never inside one;
//   3. dates: a texting channel shows "Oct 19, 2026", never the database's 2026-10-19 (Q94);
//   4. the staged brain's system prompt carries the texting rules on a texting channel (plain text, one link alone on its
//      own line, short bubbles, one question), and the channel reaches it;
// Text the person approves word for word is never reshaped (career_reply_writer.ts writable(); not this layer).
import { SCENARIOS } from "../../evals/career/one-v-one/scenarios.ts";
import { grade } from "../../evals/career/one-v-one/score.ts";
import { formatForChannel, imessageNativeRender, linksOnOwnLine, nativeRender } from "../../supabase/functions/_shared/channel_voice.ts";
import { careerSystemPrompt } from "../../supabase/functions/_shared/agent/prompt.ts";
import { findUrls } from "../../supabase/functions/_shared/channel_text.ts";

const assert = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const eq = (a: unknown, b: unknown, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}\n got ${JSON.stringify(a)}\nwant ${JSON.stringify(b)}`); };

const F = "https://job-boards.greenhouse.io/figma/jobs/7004004", B = "https://job-boards.greenhouse.io/brex/jobs/7005005", N = "https://job-boards.greenhouse.io/notion/jobs/7007007";
// The router's search reply as trunk writes it (142-career-router.js roleSentence: the link rides inside each role's sentence).
const SEARCH = `Here are 3 roles that match your search.\nData Analyst, Growth at Figma (${F}) — remote: matches your search; heads-up: SQL, Figma named in the posting and not yet on your profile. Data Analyst at Brex (${B}) — Chicago, IL: matches your search. Data Analyst at Notion (${N}) — Chicago, IL: matches your search.\nWant me to rank them against your resume?`;

Deno.test("the 1v1 set: 120 scenarios over every channel and state, and every gold reply passes its own rubric", () => {
  eq(SCENARIOS.length, 120, "scenario count");
  eq(new Set(SCENARIOS.map((s) => s.id)).size, 120, "ids are unique");
  for (const ch of ["imessage", "sms", "whatsapp", "telegram", "web"]) assert(SCENARIOS.filter((s) => s.channel === ch).length >= 10, `${ch} has at least 10`);
  for (const st of ["new", "profile", "inflight"]) assert(SCENARIOS.some((s) => s.state === st), `state ${st}`);
  const bad = SCENARIOS.map((s) => ({ id: s.id, g: grade(s.gold, s.channel, s.r, s.msg) })).filter((x) => !x.g.pass);
  eq(bad.map((b) => `${b.id}:${b.g.failed.join("+")}`), [], "gold fails its own rubric");
});

Deno.test("the rubric catches what the owner named: a link inside a sentence, markdown on iMessage, a wall of text", () => {
  const r = { links: 1 };
  assert(grade([`Data Analyst at Brex (${B}) is in Chicago.`], "imessage", r).failed.includes("link_format"), "link inside a sentence");
  assert(grade([`**Brex** Data Analyst:\n${B}`], "imessage", r).failed.includes("markdown"), "markdown on iMessage");
  assert(grade(["word ".repeat(120)], "imessage", {}).failed.includes("bubble_len"), "a wall of text");
  assert(grade([`Data Analyst at Brex:\n${B}`], "imessage", r).pass, "the Instinct way passes");
});

Deno.test("fix 1: each link alone on its own line, right after the sentence that names it", () => {
  const lines = linksOnOwnLine(SEARCH).split("\n");
  for (const u of [F, B, N]) {
    const i = lines.indexOf(u);
    assert(i > 0, `${u} alone on a line`);
    const before = lines[i - 1];
    const company = /figma/.test(u) ? "Figma" : /brex/.test(u) ? "Brex" : "Notion";
    assert(before.includes(company) && !findUrls(before).length, `the line before ${company}'s link names it: "${before}"`);
  }
  // Review of #368: every sentence kept, in order; a link-free sentence before or after stays where it was.
  eq(linksOnOwnLine(`Intro here. Data Analyst at Brex (${B}) in Chicago. Trailing words.`), `Intro here.\nData Analyst at Brex in Chicago.\n${B}\nTrailing words.`);
  eq(linksOnOwnLine(`One. Two (${B}). Three. Four (${N}). Five.`), `One.\nTwo.\n${B}\nThree.\nFour.\n${N}\nFive.`);
  // Review of #368: emphasis spanning two sentences is never split open (it stays one unit, rendered whole).
  const bold = linksOnOwnLine(`**Bold. Two** sentences ${B}. Third.`);
  assert(!bold.split("\n").some((l) => (l.match(/\*\*/g) || []).length % 2 === 1), `a line left with an open **: ${JSON.stringify(bold)}`);
  const shown = formatForChannel(`**Bold. Two** sentences ${B}. Third.`, "imessage");
  assert(!/\*/.test(shown) && shown.includes(B) && /Third\./.test(shown), `raw ** reached iMessage: ${JSON.stringify(shown)}`);
  // One sentence with one link keeps today's shape exactly.
  eq(linksOnOwnLine(`Here's the posting: ${B}`), `Here's the posting\n${B}`);
});

Deno.test("fix 1 on the wire: the router's search reply grades clean for links on iMessage, SMS, WhatsApp and Telegram", () => {
  for (const ch of ["imessage", "whatsapp", "telegram"] as const) {
    const bubbles = ch === "imessage" ? imessageNativeRender(SEARCH) : nativeRender(ch, ch === "telegram" ? 4000 : 1500)(SEARCH);
    const g = grade(bubbles, ch, { links: 3, maxBubbles: 6, maxChars: 2000 });
    for (const c of ["link_format", "links_present", "markdown"] as const) assert(!g.failed.includes(c), `${ch}: ${c} ${g.why[c]}\n${JSON.stringify(bubbles)}`);
  }
});

Deno.test("fix 2: no iMessage or SMS bubble runs past a text's length; splits fall between sentences", () => {
  const long = Array.from({ length: 9 }, (_, i) => `This is sentence number ${i + 1}, and it says one plain thing about the role.`).join(" ");
  const b = imessageNativeRender(long);
  assert(b.length > 1, "split");
  for (const x of b) assert(x.length <= 320, `a ${x.length}-char bubble`);
  for (const x of b) assert(/[.!?]$/.test(x), `cut inside a sentence: "${x}"`);
  eq(b.join(" "), long, "nothing lost");
});

Deno.test("fix 3: a texting channel shows a date as a person writes it, never 2026-10-19; links keep theirs", () => {
  const t = formatForChannel("Plaid: applied 2026-10-19.\nhttps://x.example.test/2026-10-19/a", "imessage");
  assert(/Oct 19, 2026/.test(t) && !/applied 2026-10-19/.test(t), t);
  assert(t.includes("https://x.example.test/2026-10-19/a"), "a link is never rewritten");
  assert(formatForChannel("on 2026-10-19", "web").includes("2026-10-19"), "web is unchanged");
  // Review of #368: code is the person's or the employer's text, never rewritten.
  const code = formatForChannel("Set `d='2026-10-19'` then run:\n```\nstart = 2026-10-19\n```\nDue 2026-10-20.", "telegram");
  assert(code.includes("d='2026-10-19'") && code.includes("start = 2026-10-19") && /Oct 20, 2026/.test(code), code);
});

Deno.test("fix 4: the brain's system prompt carries the texting rules on a texting channel, and only there", () => {
  for (const ch of ["imessage", "sms", "whatsapp", "telegram"]) {
    const p = careerSystemPrompt("2026-11-01", { channel: ch });
    assert(/no markdown/i.test(p) && /alone on its own line/i.test(p) && /one question/i.test(p), `${ch} rules missing`);
  }
  assert(!/HOW THIS TEXT LOOKS/.test(careerSystemPrompt("2026-11-01", { channel: "web" })), "web keeps the app's prompt");
  assert(!/HOW THIS TEXT LOOKS/.test(careerSystemPrompt("2026-11-01")), "no channel: unchanged");
});

Deno.test("fix 4 on the path: agentTurn passes the channel to the prompt the model sees", async () => {
  const { agentTurn } = await import("../../supabase/functions/agent-chat/career_brain.ts");
  let system = "";
  const model = async (p: any) => { system = p.system; return { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" }; };
  await agentTurn({ message: "hi", history: [], stores: {}, userId: "U", threadId: "T", now: Date.UTC(2026, 10, 1), model, channel: "imessage" } as any);
  assert(/HOW THIS TEXT LOOKS \(iMessage\)/.test(system), "the iMessage rules reach the model");
});

Deno.test("fix 1 at the source: the router numbers the roles it lists, and each link lands under its own role", async () => {
  const { openWorld, worldTurn } = await import("../../evals/career/world.ts");
  const world = JSON.parse(Deno.readTextFileSync(new URL("../../evals/career/worlds/in-flight.json", import.meta.url)));
  const w = await openWorld({ now: world.now, postings: world.postings });
  const r = await worldTurn(w, { brain: "router", threadId: "A", message: "find me data analyst jobs in chicago", now: w.now });
  assert(r.intent === "career_discovery", r.intent ?? "no intent");
  assert(/(^|\s)1\) \S/.test(r.reply) && /\s2\) \S/.test(r.reply), `numbered: ${r.reply}`);
  const lines = linksOnOwnLine(r.reply).split("\n");
  for (const [i, l] of lines.entries()) if (findUrls(l).length) assert(findUrls(l)[0].url === l.trim() && /^\d\) /.test(lines[i - 1]), `link under its role: ${lines[i - 1]} / ${l}`);
});

Deno.test("grammar at the source: one role found reads 'Here is 1 role that matches your search', not 'that match'", async () => {
  const { openWorld, worldTurn } = await import("../../evals/career/world.ts");
  const { EXTRA_POSTINGS } = await import("../../evals/career/one-v-one/postings.ts");
  const world = JSON.parse(Deno.readTextFileSync(new URL("../../evals/career/worlds/in-flight.json", import.meta.url)));
  const w = await openWorld({ now: world.now, postings: [...world.postings, ...EXTRA_POSTINGS] });
  const r = await worldTurn(w, { brain: "router", threadId: "A", message: "marketing jobs remote", now: w.now });
  assert(/Here is 1 role that matches your search\./.test(r.reply) && !/role that match your/.test(r.reply), r.reply);
});
