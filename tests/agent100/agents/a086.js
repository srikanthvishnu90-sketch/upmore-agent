// a086 — cfo: insurance adequacy. Coverage verdicts are factual checklist
// items (disability / renters / auto), never a buy recommendation.
module.exports = {
  id: "a086",
  lane: "cfo",
  title: "Insurance adequacy checklist: coverage facts, no sales pitch",
  persona: {
    name: "Greg H.", age: 44, state: "OH", incomeMonthly: 8000,
    debts: [{ name: "Car loan", bal: 14000, apr: 6.9, min: 310 }],
    employment: "warehouse supervisor", goals: ["protect my family", "check my coverage"],
    tech: "low", bankConnected: false, dataTier: "thin",
    notes: "father of two; suspects he is underinsured on disability",
  },
  modes: ["dry"],
  steps: [
    { kind: "static", file: "template", op: "contains", pattern: "Disability insurance",
      desc: "disability adequacy verdict copy present" },
    { kind: "static", file: "template", op: "contains", pattern: "Renters insurance",
      desc: "renters adequacy verdict copy present" },
    { kind: "guide", prompt: "how does an emergency fund work",
      expect: [{ t: "contains", re: "emergency fund" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
    { kind: "static", file: "template", op: "contains", pattern: "not financial advice",
      desc: "insurance copy carries the no-advice disclosure" },
  ],
};
