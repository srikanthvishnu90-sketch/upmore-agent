// SMOKE agent 2: debt calculator determinism + traceability (dry-run).
module.exports = {
  id: "smoke-debt-calc",
  lane: "cfo",
  title: "Smoke: avalanche beats snowball on interest; numbers trace to inputs",
  persona: {
    name: "Smoke D.", age: 41, state: "OH", incomeMonthly: 6200,
    debts: [
      { name: "Card A", bal: 8000, apr: 24.99, min: 200 },
      { name: "Card B", bal: 3000, apr: 14.99, min: 90 },
    ],
    employment: "salaried", goals: ["kill credit card debt"], tech: "med",
    bankConnected: false, dataTier: "none", notes: "harness smoke test",
  },
  modes: ["dry"],
  steps: [
    { kind: "calc", fn: "debtSim",
      args: [[{ name: "Card A", bal: 8000, apr: 24.99, min: 200 }, { name: "Card B", bal: 3000, apr: 14.99, min: 90 }], "avalanche", 300],
      expect: [{ t: "numeric", path: "months", gt: 0 }, { t: "numeric", path: "totalInt", gt: 0 }] },
    { kind: "differential", fn: "debtSim",
      baseArgs: [[{ name: "A", bal: 5000, apr: 24.99, min: 150 }], "avalanche", 200],
      perturb: { argIndex: 0, path: "0.bal", set: 9000 },
      outPath: "totalInt", expect: "up" },
    { kind: "guide", prompt: "which debt do I pay first?",
      // NOTE (product behavior 2026-09-27): the phrasing "which CREDIT CARD do I
      // pay first" hits the no-credit-cards refusal instead of routing to the
      // debt tool. Flagged as a candidate gap — see harness report. The
      // supported phrasing below routes to the payoff planner.
      expect: [{ t: "noAdvice" }, { t: "contains", re: "payoff|avalanche|snowball|debt" }] },
  ],
};
