// Cost model + LIVE-mode gating for agent100.
//
// Founder constraint: Anthropic API credits are TESTING-ONLY. The harness is
// designed so a full dry-run costs $0 (no network, no model calls). Live mode
// calls the real agent-chat backend and optionally the LLM judge; both are
// hard-capped and the harness prints the projected worst-case cost BEFORE
// anything runs, then requires explicit founder confirmation.
//
// Pricing assumptions (configurable via env, defaults below). They are
// deliberately conservative (upper-bound) so the projection is a ceiling.
//   ANTHROPIC_IN_PER_MTOK  default 3.00 USD (Sonnet-class input)
//   ANTHROPIC_OUT_PER_MTOK default 15.00 USD (Sonnet-class output)
// Worst-case tokens per backend call: 6000 in / 1500 out.
// Worst-case tokens per judge call:   4000 in / 800 out.

const readline = require("readline");

const IN_PER_MTOK = parseFloat(process.env.ANTHROPIC_IN_PER_MTOK || "3.00");
const OUT_PER_MTOK = parseFloat(process.env.ANTHROPIC_OUT_PER_MTOK || "15.00");
const BACKEND_CALLS_PER_AGENT = 12; // hard cap
const WC_BACKEND = { inTok: 6000, outTok: 1500 };
const WC_JUDGE = { inTok: 4000, outTok: 800 };

const callCost = (w) => (w.inTok / 1e6) * IN_PER_MTOK + (w.outTok / 1e6) * OUT_PER_MTOK;

function projection(agentCount, judgeCalls) {
  const backendCalls = agentCount * BACKEND_CALLS_PER_AGENT;
  const backendCost = backendCalls * callCost(WC_BACKEND);
  const judgeCost = judgeCalls * callCost(WC_JUDGE);
  return {
    agentCount,
    backendCallsMax: backendCalls,
    judgeCalls,
    perBackendCall: callCost(WC_BACKEND),
    perJudgeCall: callCost(WC_JUDGE),
    totalWorst: backendCost + judgeCost,
    assumptions: `in $${IN_PER_MTOK}/MTok, out $${OUT_PER_MTOK}/MTok; worst-case ${WC_BACKEND.inTok}/${WC_BACKEND.outTok} tok per backend call, ${WC_JUDGE.inTok}/${WC_JUDGE.outTok} per judge call`,
  };
}

function printProjection(agentCount, judgeCalls) {
  const p = projection(agentCount, judgeCalls);
  const lines = [
    "=== agent100 projected worst-case cost (LIVE) ===",
    `agents:                 ${p.agentCount}`,
    `backend calls (max):    ${p.backendCallsMax}  (${BACKEND_CALLS_PER_AGENT}/agent hard cap)`,
    `judge calls:            ${p.judgeCalls}`,
    `cost per backend call:  $${p.perBackendCall.toFixed(4)} (worst case)`,
    `cost per judge call:    $${p.perJudgeCall.toFixed(4)} (worst case)`,
    `TOTAL WORST CASE:       $${p.totalWorst.toFixed(2)}`,
    `pricing: ${p.assumptions}`,
    "dry-run cost: $0.00 (no network, no model calls)",
  ];
  console.log(lines.join("\n"));
  return p;
}

// LIVE gate: refuses unless BOTH (a) --mode=live and (b) explicit founder
// confirmation are present. The founder must type the confirmation phrase;
// --yes skips the interactive prompt only when the phrase was also passed.
async function gateLive({ founderConfirm, yes, agentCount, judgeCalls }) {
  const need = "APPROVE LIVE";
  if (founderConfirm !== need) {
    console.error(
      `\nLIVE RUN REFUSED.\n` +
      `Live mode executes real backend calls (Anthropic spend) and, with liveBrowser\n` +
      `steps, real browser sessions. It requires BOTH:\n` +
      `  1. --mode=live\n` +
      `  2. --founder-confirm "${need}"\n` +
      `Re-run with both flags. Nothing was executed.\n`
    );
    process.exit(3);
  }
  const p = printProjection(agentCount, judgeCalls);
  console.log(`\nProjected worst-case spend: $${p.totalWorst.toFixed(2)} (testing-only credits).`);
  if (!yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await new Promise((res) => rl.question(`Type "${need}" to confirm and start: `, res));
    rl.close();
    if (ans.trim() !== need) {
      console.error("Confirmation phrase mismatch. Aborting — nothing was executed.");
      process.exit(3);
    }
  }
  return p;
}

module.exports = { projection, printProjection, gateLive, BACKEND_CALLS_PER_AGENT };
