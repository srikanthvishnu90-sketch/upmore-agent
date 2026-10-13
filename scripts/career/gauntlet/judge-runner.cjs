// judge-runner.cjs — 04 Part 2 judge harness for grader-v2.
//
// REAL vs STUBBED (stated plainly, per the M2 brief):
//   REAL: the full Part 2 contract — input assembly (ask, persona summary,
//   family contract, rubric, reply, state summary; never the expected
//   answer), JSON-only output validation, verbatim-quote enforcement
//   (a score without a quote that appears in the reply is invalid),
//   temperature-0 config, up-to-2 re-runs then BLOCKED, and the calibration
//   agreement calculator (>=90% PASS/FAIL, >=80% within ±1 per dimension).
//   STUBBED: the judge MODEL call itself. No different-lineage model
//   endpoint is configured in this environment, so `callJudgeModel` is an
//   injectable interface whose default implementation throws
//   JudgeNotConfigured. Plug a real model in by passing `modelFn` (async
//   (prompt, config) => rawText) or setting JUDGE_MODEL_ENDPOINT +
//   JUDGE_MODEL_NAME for an OpenAI-compatible endpoint. Until then every
//   judge attempt resolves to BLOCKED — never to a fabricated score.
"use strict";

const JUDGE_CONFIG = {
  // Placeholder for a DIFFERENT model / prompt lineage than the agent's
  // composer (04 Part 2). Owner/coordinator fills this in before Gate 1's
  // judge gate can count.
  model: process.env.JUDGE_MODEL_NAME || "PLACEHOLDER_DIFFERENT_LINEAGE_MODEL",
  endpoint: process.env.JUDGE_MODEL_ENDPOINT || null,
  temperature: 0,
  responseFormat: "json_only",
};
const DIMENSIONS = ["D1", "D2", "D3", "D4", "D5", "D6", "D7"]; // + W1 when distress present
const RUBRIC_REF = "docs/quality-spec/02-RESPONSE-STANDARD.md Part 2 (D1-D7, W1)";

class JudgeNotConfigured extends Error {}

function buildJudgePrompt(input) {
  // The judge never receives the expected answer text (04 Part 2).
  return {
    system: `You are a strict grading judge. Score each dimension 0-3 per this rubric: ${RUBRIC_REF}. ` +
      `Return JSON ONLY: {"D1":{"score":0-3,"quote":"verbatim reply text","reason":"..."}, ...}. ` +
      `Every score MUST carry a verbatim quote from the reply. No other text.`,
    user: JSON.stringify({
      ask: input.ask, persona: input.persona || null, family: input.family,
      familyContract: input.familyContract || `Family: ${input.family} (see docs/quality-spec/03-FAMILY-CONTRACTS.md)`,
      rubric: RUBRIC_REF, reply: input.reply, stateSummary: input.stateSummary || null,
      dimensions: input.distress ? DIMENSIONS.concat(["W1"]) : DIMENSIONS,
    }),
    config: JUDGE_CONFIG,
  };
}

async function callJudgeModel(prompt, modelFn) {
  if (typeof modelFn === "function") return modelFn(prompt, JUDGE_CONFIG);
  if (JUDGE_CONFIG.endpoint) {
    const res = await fetch(JUDGE_CONFIG.endpoint, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: JUDGE_CONFIG.model, temperature: 0, messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }] }),
    });
    if (!res.ok) throw new Error(`judge endpoint HTTP ${res.status}`);
    const data = await res.json();
    return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  }
  throw new JudgeNotConfigured("no judge model configured: pass modelFn or set JUDGE_MODEL_ENDPOINT + JUDGE_MODEL_NAME (different lineage than the composer, temperature 0)");
}

function validateJudgeOutput(raw, reply, dims) {
  let obj = raw;
  if (typeof raw === "string") { try { obj = JSON.parse(raw); } catch { return { valid: false, reason: "output is not JSON" }; } }
  if (!obj || typeof obj !== "object") return { valid: false, reason: "output is not a JSON object" };
  const scores = {};
  for (const d of dims) {
    const e = obj[d];
    if (!e || typeof e.score !== "number" || e.score < 0 || e.score > 3) return { valid: false, reason: `${d}: missing or out-of-range score` };
    if (!e.quote || typeof e.quote !== "string" || !reply.includes(e.quote)) return { valid: false, reason: `${d}: quote missing or not verbatim in the reply` };
    if (!e.reason) return { valid: false, reason: `${d}: missing reason` };
    scores[d] = { score: e.score, quote: e.quote, reason: e.reason };
  }
  return { valid: true, scores };
}

// runJudge(input, { modelFn }) -> { scores } | { blocked: true, reason, attempts }
async function runJudge(input, opts = {}) {
  const dims = input.distress ? DIMENSIONS.concat(["W1"]) : DIMENSIONS;
  const prompt = buildJudgePrompt(input);
  let lastReason = "unknown";
  for (let attempt = 1; attempt <= 3; attempt++) { // 1 try + up to 2 re-runs (04 Part 2)
    try {
      const raw = await callJudgeModel(prompt, opts.modelFn);
      const v = validateJudgeOutput(raw, input.reply, dims);
      if (v.valid) return { scores: v.scores, attempts: attempt, model: JUDGE_CONFIG.model, temperature: 0 };
      lastReason = v.reason;
    } catch (e) {
      if (e instanceof JudgeNotConfigured) return { blocked: true, reason: e.message, attempts: attempt };
      lastReason = e.message;
    }
  }
  return { blocked: true, reason: `judge output invalid after 2 re-runs: ${lastReason}`, attempts: 3 };
}

// Calibration agreement (04 Part 2): labels = [{id, label, dimensions:{D1..}}],
// judgements = [{id, label, dimensions:{D1: score-or-{score}}}]
function agreement(labels, judgements) {
  const byId = new Map(judgements.map((j) => [j.id, j]));
  let n = 0, verdictAgree = 0;
  const perDim = {};
  for (const l of labels) {
    const j = byId.get(l.id); if (!j) continue; n++;
    if (l.label === j.label) verdictAgree++;
    for (const d of DIMENSIONS) {
      const ls = l.dimensions && l.dimensions[d], js = j.dimensions && (typeof j.dimensions[d] === "object" ? j.dimensions[d].score : j.dimensions[d]);
      if (typeof ls === "number" && typeof js === "number") { perDim[d] = perDim[d] || { n: 0, within1: 0 }; perDim[d].n++; if (Math.abs(ls - js) <= 1) perDim[d].within1++; }
    }
  }
  const dimRates = Object.fromEntries(Object.entries(perDim).map(([d, v]) => [d, v.n ? v.within1 / v.n : null]));
  const minDim = Math.min(...Object.values(dimRates).filter((x) => x != null));
  return {
    n, verdictAgreement: n ? verdictAgree / n : 0, perDimensionWithin1: dimRates,
    gate: { verdictPass: n > 0 && verdictAgree / n >= 0.90, dimensionPass: Number.isFinite(minDim) && minDim >= 0.80 },
    note: "Gate 1 judge gate needs >=90% PASS/FAIL agreement and >=80% within ±1 per dimension, measured on the full 120-reply calibration set (80 agent-labeled + the owner's 40). Until the owner's 40 land, this gate is UNMEASURED, not passed.",
  };
}

if (require.main === module) {
  const fs = require("fs");
  const args = process.argv.slice(2);
  if (args[0] === "agreement") {
    const li = args.indexOf("--labels"), ji = args.indexOf("--judgements");
    const labels = fs.readFileSync(args[li + 1], "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const judgements = fs.readFileSync(args[ji + 1], "utf8").trim().split("\n").map((l) => JSON.parse(l));
    console.log(JSON.stringify(agreement(labels, judgements), null, 2));
  } else console.log("Usage: node judge-runner.cjs agreement --labels labels.jsonl --judgements judgements.jsonl");
}

module.exports = { runJudge, buildJudgePrompt, validateJudgeOutput, agreement, JUDGE_CONFIG, DIMENSIONS, JudgeNotConfigured };
