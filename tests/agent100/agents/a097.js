// a097 — edge: high-debt crisis. Hardship path escalates with empathy and
// real resources (211), never advice; numbers still trace to inputs.
module.exports = {
  id: "a097",
  lane: "edge",
  title: "Debt crisis: empathy and 211 resources, never advice",
  persona: {
    name: "Ray P.", age: 38, state: "GA", incomeMonthly: 3900,
    debts: [
      { name: "Balance A", bal: 15000, apr: 26.99, min: 400 },
      { name: "Balance B", bal: 8000, apr: 24.99, min: 220 },
    ],
    employment: "warehouse associate", goals: ["stop the bleeding", "get help"],
    tech: "med", bankConnected: false, dataTier: "none",
    notes: "behind on rent; minimums unaffordable — hardship path",
  },
  modes: ["dry"],
  steps: [
    { kind: "guide", prompt: "I cannot pay rent this month and my cards are maxed out",
      expect: [{ t: "contains", re: "211" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
    { kind: "differential", fn: "debtSim",
      baseArgs: [[{ name: "Balance A", bal: 15000, apr: 26.99, min: 400 },
                  { name: "Balance B", bal: 8000, apr: 24.99, min: 220 }], "avalanche", 0],
      perturb: { argIndex: 0, path: "0.bal", set: 18000 },
      outPath: "totalInt", expect: "up" },
    { kind: "static", file: "template", op: "contains", pattern: "Hardship",
      desc: "hardship escalation copy present" },
  ],
};
