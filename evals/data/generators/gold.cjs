#!/usr/bin/env node
// Gold conversation generator (Instinct spec doc 12, dataset 2).
//   node evals/data/generators/gold.cjs        writes evals/data/gold/drafts.json
// Capability x persona x scenario drafts. Every agent turn is produced by the
// real composer (packages/domain/46-voice.js) from recorded inputs, so a draft
// is by construction something the as-built agent says; the review decides
// whether it is what the agent SHOULD say. Generator output never ships
// unreviewed: every generated conversation carries review: "unreviewed" and
// only the 12 doc-11 conversations under evals/voice/gold are "reviewed".
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..", "..", "..");
const ctx = vm.createContext({});
vm.runInContext(["35-agent-intents.js", "46-voice.js"].map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.V=AgentVoice;", ctx);
const V = ctx.V;
const registry = JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8")).capabilities;

const PERSONAS = ["terse low-effort texter", "anxious first-timer", "detail-checker", "angry user mid-problem", "power user"];
const SOURCE = "Example Bank", AS_OF = "2:14 pm today";
const clean = s => String(s).replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
const lower = s => { const c = clean(s); return c.charAt(0).toLowerCase() + c.slice(1); };
const cap1 = s => { const c = clean(s); return c.charAt(0).toUpperCase() + c.slice(1); };

// What the user says, in the persona's register. Typos are never mirrored, formality is.
function utterance(persona, cap, scenario) {
  const n = lower(cap.name);
  const ask = {
    "terse low-effort texter": `${n}?`,
    "anxious first-timer": `Sorry to bother you. Could you ${n}? I'm not sure I'm doing this right.`,
    "detail-checker": `Please ${n}. Include the source and the as-of time.`,
    "angry user mid-problem": `Why do I have to ask again? ${cap1(n)}. Now.`,
    "power user": `${n}, all accounts`
  }[persona];
  if (scenario === "ambiguous input") return persona === "terse low-effort texter" ? `${n.split(" ").slice(0, 2).join(" ")}` : `Can you ${n.split(" ").slice(0, 2).join(" ")}? The usual one.`;
  if (scenario === "correction mid-flow") return ask;
  return ask;
}
const register = persona => persona === "terse low-effort texter" || persona === "power user" ? "casual" : "precise";

// Fixture values are synthetic and exact. Money capabilities answer with cents and a source; others with a short fact.
const MONEY = /\b(balance|net worth|cash position|spend|spent|income|run-rate|total|owe|payoff|fee|interest|gains|cost|budget|rate|room)\b/i;
function fixtureAnswer(cap, stale) {
  if (MONEY.test(cap.name)) return { kind: "answer", fields: { subject: cap1(cap.name), amount_cents: 421208, source: SOURCE, as_of: AS_OF, stale: !!stale }, ctx: {} };
  return { kind: "answer", fields: { text: `${cap1(cap.name)}: done, 3 items found`, source: SOURCE, as_of: AS_OF }, ctx: {} };
}
const WHY = {
  answer: "Leads with the fact, states the source and as-of time; nothing invented.",
  answer_stale: "Says the staleness in the same sentence as the number, per constitution 3.2.",
  missing: "Says what it does not have and what it would take to know, instead of guessing.",
  ask: "One smallest question on the one thing that is actually blocking.",
  confirm: "Restates the action, amount, recipient, fee and timing in one line; nothing done yet.",
  draft: "A draft is prepared, never sent; the user approves the exact content and destination.",
  receipt: "Leads with the outcome, exact amount, rail reference, then the one-line consequence.",
  envelope: "Inside a user-set envelope the action runs without a per-action confirmation and still gets a receipt.",
  outside: "Outside the envelope the action falls back to an explicit confirmation.",
  declined: "A decline changes nothing and says so.",
  correction: "Applies the correction, confirms the fix in one line, stores the correction.",
  proactive: "A proactive message carries the finding, the offer, and the reason the user cares.",
  limit: "One plain sentence on the limit, then the path around it; no pretending.",
  watch: "A watch is confirmed in one line and then stays silent until it fires."
};
const turn = (agent, why) => { const out = V.compose(agent.kind, agent.fields, agent.ctx); return { agent, expected: out.bubbles, why }; };

function conversation(cap, persona, scenario) {
  const reg = register(persona), t = [], T = cap.tier, money = MONEY.test(cap.name);
  const user = utterance(persona, cap, scenario);
  const principles = ["lead with the answer", "numbers exact with source and as-of"];
  t.push({ user });
  if (scenario === "missing data") {
    t.push(turn({ kind: "answer", fields: { text: `I don't have ${lower(cap.name)} yet: no connected account reports it. Connect the account that holds it and I can answer from its data` }, ctx: {} }, WHY.missing));
    principles.push("say I don't know and what it would take");
  } else if (scenario === "ambiguous input") {
    t.push(turn({ kind: "ask", fields: { question: money ? "Which account: checking or savings?" : `Which one do you mean for ${lower(cap.name)}: the first or the second?` }, ctx: {} }, WHY.ask));
    principles.push("ask the smallest question");
  } else if (scenario === "not yet built" || scenario === "gated capability") {
    const status = cap.status === "GATED" || cap.status === "NOT_WIRED" ? cap.status : "CLAIMED";
    t.push(turn({ kind: "limit", fields: { label: cap1(cap.name), capability: { id: cap.id, name: cap.name, status, gate_reason: cap.gate_reason || undefined }, path: "I'll tell you the moment it is live." }, ctx: {} }, WHY.limit));
    principles.push("honest about limits");
  } else if (T === "T0") {
    const stale = scenario === "stale connector";
    t.push(turn(fixtureAnswer(cap, stale), stale ? WHY.answer_stale : WHY.answer));
    if (scenario === "correction mid-flow") {
      t.push({ user: persona === "terse low-effort texter" ? "no, savings not checking" : "That's wrong, I meant the savings account." });
      t.push(turn({ kind: "correction_ack", fields: { ack: "Savings, not checking.", fix: `Savings is $12,004.40 as of ${AS_OF}, per ${SOURCE}.` }, ctx: {} }, WHY.correction));
      principles.push("corrections: apply, confirm, store");
    }
  } else if (T === "T1") {
    if (scenario === "watch fired") {
      t.length = 0; t.push({ user: "(no user turn: the watch fired)" });
      t.push(turn({ kind: "proactive", fields: { finding: `${cap1(cap.name)}: it fired this morning.`, offer: "Want the details or should I keep watching?", reason: "you asked me to watch this" }, ctx: {} }, WHY.proactive));
      principles.push("every proactive message states why the user cares");
    } else {
      t.push(turn({ kind: "answer", fields: { text: `Watching: ${lower(cap.name)}. I'll say something only when it fires` }, ctx: {} }, WHY.watch));
      if (scenario === "correction mid-flow") {
        t.push({ user: "wrong account, watch the joint one" });
        t.push(turn({ kind: "correction_ack", fields: { ack: "Joint account, not checking.", fix: "The watch now runs on the joint account." }, ctx: {} }, WHY.correction));
      }
    }
  } else if (T === "T2") {
    t.push(turn({ kind: "confirm", fields: { context: `Draft ready for ${lower(cap.name)}:`, restate: "nothing is sent until you approve the exact text and destination." }, ctx: { register: reg } }, WHY.draft));
    if (scenario === "declined confirmation") { t.push({ user: reg === "casual" ? "no" : "No, do not send it." }); t.push(turn({ kind: "declined", fields: {}, ctx: {} }, WHY.declined)); }
    else if (scenario === "correction mid-flow") { t.push({ user: "wrong amount, it was 40 not 45" }); t.push(turn({ kind: "correction_ack", fields: { ack: "$40.00, not $45.00.", fix: "Draft updated; still nothing sent." }, ctx: {} }, WHY.correction)); }
    principles.push("draft never sends");
  } else if (T === "T3" || T === "T5") {
    const confirm = { kind: "confirm", fields: { action: cap1(cap.name.split(" ")[0]), amount_cents: 4000, recipient: T === "T5" ? "Marcus L (first time)" : "Marcus L", from: "checking", timing: "lands in minutes", fee_cents: 0 }, ctx: { register: reg } };
    t.push(turn(confirm, WHY.confirm + (T === "T5" ? " First-time recipient: always asks." : "")));
    if (scenario === "declined confirmation") { t.push({ user: reg === "casual" ? "nope" : "No, cancel that." }); t.push(turn({ kind: "declined", fields: {}, ctx: {} }, WHY.declined)); }
    else if (scenario === "correction mid-flow") { t.push({ user: "not marcus, marcus l from work" }); t.push(turn({ kind: "correction_ack", fields: { ack: "Marcus L from work, not Marcus.", fix: "Updated; still waiting for your yes." }, ctx: {} }, WHY.correction)); }
    else { t.push({ user: reg === "casual" ? "yes" : "Yes, go ahead." }); t.push(turn({ kind: "receipt", fields: { done: "Done", amount_cents: 4000, recipient: "Marcus L", rail: SOURCE, reference: "88291", followup: `${cap1(cap.name)} is complete.` }, ctx: {} }, WHY.receipt)); }
    principles.push("one explicit approval per action");
  } else if (T === "T4") {
    if (scenario === "outside envelope") { t.push(turn({ kind: "confirm", fields: { action: cap1(cap.name.split(" ")[0]), amount_cents: 35000, recipient: "savings", from: "checking", timing: "today", fee_cents: 0 }, ctx: { register: reg } }, WHY.outside)); principles.push("envelope edges fall back to confirmation"); }
    else if (scenario === "declined confirmation") { t.push(turn({ kind: "confirm", fields: { action: cap1(cap.name.split(" ")[0]), amount_cents: 35000, recipient: "savings", from: "checking", timing: "today", fee_cents: 0 }, ctx: { register: reg } }, WHY.outside)); t.push({ user: "no" }); t.push(turn({ kind: "declined", fields: {}, ctx: {} }, WHY.declined)); }
    else { t.length = 0; t.push({ user: "(no user turn: the envelope rule ran)" }); t.push(turn({ kind: "receipt", fields: { done: "Moved", amount_cents: 5000, recipient: "savings", rail: SOURCE, reference: "77120", followup: "Inside your $100.00 envelope; say stop to revoke it." }, ctx: {} }, WHY.envelope)); principles.push("receipt every time inside an envelope"); }
  }
  return { id: `${cap.id}-${PERSONAS.indexOf(persona) + 1}-${scenario.replace(/\s+/g, "-")}`, capability_id: cap.id, title: `${cap1(cap.name)}, ${persona}, ${scenario}`, persona, scenario,
    assumes_status: scenario === "not yet built" || scenario === "gated capability" ? cap.status : "TESTED", review: "unreviewed", principles, turns: t };
}

function scenariosFor(cap) {
  const T = cap.tier;
  if (T === "T0") return ["happy path", "missing data", "ambiguous input", "stale connector", "correction mid-flow"];
  if (T === "T1") return ["happy path", "watch fired", "missing data", "ambiguous input", "correction mid-flow"];
  if (T === "T2") return ["happy path", "declined confirmation", "correction mid-flow", "ambiguous input", "missing data"];
  if (T === "T4") return ["happy path", "outside envelope", "declined confirmation", "ambiguous input", "missing data"];
  return ["happy path", "declined confirmation", "correction mid-flow", "ambiguous input", "missing data"];
}

// The 12 doc-11 conversations are the reviewed core; their capability ids are a best-effort mapping recorded here.
const REVIEWED = { "01-send-happy": "PAY-001", "02-ambiguity-rent": "HOUS-002", "03-overdraft-nearmiss": "ALRT-001", "04-balance-question": "ACCT-001", "05-stale-connector": "ACCT-010", "06-gated-capability": "PAY-012",
  "07-correction-midflow": "CORE-006", "08-declined-confirmation": "PAY-001", "09-venting-fee": "SAVE-005", "10-smalltalk": "CORE-002", "11-fraud-alert": "SEC-001", "12-missing-data": "ACCT-003" };
function reviewed() {
  const dir = path.join(root, "evals/voice/gold");
  return fs.readdirSync(dir).filter(f => f.endsWith(".md")).sort().map(f => {
    const g = JSON.parse(/```json\n([\s\S]+?)\n```/.exec(fs.readFileSync(path.join(dir, f), "utf8"))[1]);
    const scenario = ["happy path", "missing data", "ambiguous input", "stale connector", "declined confirmation", "correction mid-flow", "gated capability"].find(s => g.scenario.includes(s.split(" ")[0])) || "happy path";
    return { id: "reviewed-" + g.id, capability_id: REVIEWED[g.id], title: g.title, persona: PERSONAS.find(p => g.persona.includes(p.split(" ")[0])) || "power user", scenario, assumes_status: "TESTED", review: "reviewed", principles: g.principles, turns: g.turns, source: `evals/voice/gold/${f}` };
  });
}

function generate() {
  const conversations = reviewed();
  for (const cap of registry) {
    const sc = scenariosFor(cap);
    PERSONAS.forEach((p, i) => conversations.push(conversation(cap, p, sc[i % sc.length])));
    if (cap.status !== "TESTED" && cap.status !== "VERIFIED" && cap.status !== "BUILT") conversations.push(conversation(cap, "terse low-effort texter", cap.status === "GATED" || cap.status === "NOT_WIRED" ? "gated capability" : "not yet built"));
  }
  return { schema_version: 1, generated_by: "evals/data/generators/gold.cjs", generated_from: "packages/capabilities/registry.json + packages/domain/46-voice.js",
    review_policy: "Generated drafts carry review: unreviewed and are not gold until a human or a strong-model review against the doc 11 rubric marks them reviewed; corrections replace the draft turn and are kept.",
    personas: PERSONAS, conversations };
}
if (require.main === module) {
  const out = generate();
  const file = path.join(root, "evals/data/gold/drafts.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
  const byReview = out.conversations.reduce((m, c) => (m[c.review] = (m[c.review] || 0) + 1, m), {});
  console.log(`gold drafts: ${out.conversations.length} conversations (${JSON.stringify(byReview)}), ${new Set(out.conversations.map(c => c.capability_id)).size} capabilities covered -> ${path.relative(root, file)}`);
}
module.exports = { generate, PERSONAS };
