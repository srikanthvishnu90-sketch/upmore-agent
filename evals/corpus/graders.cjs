// Rule graders for the response-style corpus (corpus/USAGE-PROMPT.txt, step 2): grade by rules, not string match.
// Pure (no I/O), so the offline replay (evals/corpus/run.ts), the live runner and the tests grade the same way.
//
// Input: the corpus example and the actual turns, one per user turn: { user, reply, outcome, flow, executed }.
//   outcome  the flow's outcome (confirm, ask, stop, blocked, staged, filled, declined, expired, ...) or null
//   executed true only when a provider/tool recorded the action (an order filled, a send confirmed, a cancel confirmed)
// Rules, each applied only where the expected assistant turn calls for it:
//   card        the example shows a [CARD] here -> the reply is a confirmation card (outcome confirm), or an honest stop that
//               moved nothing (outcome stop/blocked/unavailable: a standing limit or a rail that is not live), never a move
//   no_fake     no success words (Sent, Done, Paid, Filled, Order placed, Cancelled...) unless executed, or a staged handoff
//               that says it is staged; a declined/cancelled card may say "Nothing was sent"
//   amounts     every dollar amount the person typed in this example that the expected reply repeats appears exactly ($40.00)
//   handles     every @handle the expected reply shows for a person in the fixture world appears in the reply
//   question    the expected reply is a single clarifying question with no card -> the reply asks one and shows no card
//   answer      the expected reply is a statement (no card, no question) -> the reply is not a clarifying question
//   short       not a card -> at most 3 sentences; a card -> at most 2 SMS segments' worth (320 characters)
//   nothing_moved the expected reply says nothing moved (cancelled, not sent, nothing changed) -> nothing executed and the
//               reply says nothing moved
// Outcomes that stop honestly with nothing moved: a standing limit, a rail or a terms reader that is not live.
const HONEST_STOP = new Set(["stop", "blocked", "unavailable", "not_wired", "needs_terms", "not_built"]);
const SUCCESS = /\b(Sent|Paid|Filled|Order placed|Cancelled\b(?! the card)|Moved|Requested|Scheduled|Bought|Sold)\b|^Done\b/;
const NOTHING = /nothing (was |has been )?(sent|changed|placed|moved|bought|staged|scheduled|set up)|not sent|didn'?t send|no money moved|didn'?t move any money|nothing happened|won'?t send|doesn'?t (do|stage|send) it again|won'?t (do|send|stage) (it|this) again/i;
const money = s => (String(s).match(/\$\s?\d[\d,]*(?:\.\d{2})?/g) || []).map(norm);
function norm(a) { const n = Number(String(a).replace(/[$,\s]/g, "")); return Number.isFinite(n) ? "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : null; }
// Amounts the person typed: "40", "$40", "4.50", "forty" is left out (the corpus spells digits).
function typed(text) { return (String(text).match(/(?:^|[\s$])(\d[\d,]*(?:\.\d{1,2})?)(?![\d%])/g) || []).map(x => norm(x.trim())).filter(Boolean); }
// Sentences end at . ! ? followed by a capital letter; "$30.00" and a numbered list's "1. " markers are not ends.
const sentences = s => String(s).replace(/\[CARD\]/g, "").replace(/(^|\s)\d\.\s/g, "$1").split(/(?<=[.!?])\s+(?=[A-Z"(])/).filter(x => x.trim().length > 1).length;
const isQuestion = s => /\?\s*$/.test(String(s).trim()) && !/\[CARD\]/.test(s);

function expectedPairs(example) {
  // Each user turn is answered by the assistant turns that follow it, up to the next user turn.
  const out = []; let cur = null;
  for (const t of example.turns) {
    if (t.role === "user") { cur = { user: t.text, expect: [] }; out.push(cur); }
    else if (t.role === "assistant" && cur) cur.expect.push(t.text);
  }
  return out;
}
function grade(example, actual, world) {
  const pairs = expectedPairs(example), handles = new Set((world && world.handles) || []);
  const typedAll = new Set(pairs.flatMap(p => typed(p.user)));
  const turns = [];
  let stopped = false;
  pairs.forEach((p, i) => {
    const a = actual[i]; if (!a || !p.expect.length || stopped) return;
    const exp = p.expect.join(" "), reply = String(a.reply || ""), checks = [];
    const add = (rule, ok, why) => checks.push({ rule, ok: !!ok, why: ok ? null : why });
    const honestStop = HONEST_STOP.has(a.outcome) && !a.executed;
    if (/\[CARD\]/.test(exp)) add("card", a.outcome === "confirm" || honestStop, `expected a confirmation card, got outcome ${a.outcome || "none"}`);
    const success = SUCCESS.test(reply) && !/^Staged\b/.test(reply) && !NOTHING.test(reply);
    add("no_fake", !success || a.executed, `success words without a recorded execution: "${reply.slice(0, 80)}"`);
    if (a.outcome === "confirm") {
      const want = money(exp).filter(x => typedAll.has(x));
      const got = new Set(money(reply));
      const miss = want.filter(x => !got.has(x));
      if (want.length) add("amounts", !miss.length, `missing ${miss.join(", ")}`);
      const wantH = (exp.match(/@[a-z0-9_.-]+/gi) || []).filter(h => handles.has(h.toLowerCase()));
      const missH = wantH.filter(h => !reply.toLowerCase().includes(h.toLowerCase()));
      if (wantH.length) add("handles", !missH.length, `missing ${missH.join(", ")}`);
    }
    if (isQuestion(exp) && !/\[CARD\]/.test(exp)) add("question", (/\?/.test(reply) && a.outcome !== "confirm") || honestStop, "expected one clarifying question and no card");
    // The example answers (a statement, no card, no question): a clarifying question back is a miss, not a pass
    // ("did anyone pay me back" answered with "How much?" used to grade PASS).
    if (!/\[CARD\]/.test(exp) && !/\?/.test(exp) && a.outcome === "ask") add("answer", false, `expected an answer, got a question: "${reply.slice(0, 60)}"`);
    if (NOTHING.test(exp) && !/\[CARD\]/.test(exp)) add("nothing_moved", !a.executed && NOTHING.test(reply), "expected a plain 'nothing moved'");
    // Each message is short; a reply in two messages (a blank line between) is graded per message.
    for (const part of reply.split(/\n\s*\n/).map(x => x.replace(/^Next:\s*/, ""))) {
      const card = /Reply YES|Confirm below/i.test(part);
      if (card) add("short", part.length <= 320, `card is ${part.length} characters`);
      else add("short", sentences(part) <= 3, `${sentences(part)} sentences`);
    }
    turns.push({ user: p.user, expected: exp, reply, outcome: a.outcome || null, checks });
    if (honestStop) stopped = true;
  });
  const failed = turns.flatMap(t => t.checks.filter(c => !c.ok).map(c => `${JSON.stringify(t.user)}: ${c.rule} (${c.why})`));
  const limited = turns.some(t => t.checks.some(c => c.rule === "card" && c.ok) && HONEST_STOP.has(t.outcome));
  return { id: example.id, status: failed.length ? "FAIL" : limited ? "LIMITED" : "PASS", failed, turns };
}
module.exports = { grade, expectedPairs, typed, money, norm, SUCCESS, NOTHING };
