// LLM-as-judge for agent100. Sample-only, budgeted, off by default.
//
// The judge is used ONLY for subjective quality (tone, clarity, no-guilt
// framing) with the written rubric in rubric.md. Every deterministic fact —
// refusals, numbers, disclosures, advice violations — is asserted in code
// in steps.js, never by the judge.
//
// Cost control: each judge step = 1 Anthropic API call. Runner counts it
// against the per-agent cap (12) and the suite budget. Requires
// ANTHROPIC_API_KEY. Model default: claude-haiku-4-5 (cheapest capable;
// override with ANTHROPIC_MODEL).
const fs = require("fs");
const path = require("path");

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const RUBRIC = fs.readFileSync(path.join(__dirname, "rubric.md"), "utf8");

async function judgeReply({ prompt, reply, personaNote }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set (judge requires it)");
  const user = [
    `Rubric:\n${RUBRIC}`,
    `User persona: ${personaNote || "adult US user"}`,
    `User prompt: ${prompt}`,
    `Guide reply to grade:\n${reply}`,
  ].join("\n\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      system: "You are a strict grader. Output strict JSON only, no other text.",
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`judge API ${res.status}`);
  const j = await res.json();
  const text = (j.content || []).map((b) => b.text || "").join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("judge returned non-JSON");
  const verdict = JSON.parse(m[0]);
  return { verdict, model: MODEL };
}

module.exports = { judgeReply, MODEL };
