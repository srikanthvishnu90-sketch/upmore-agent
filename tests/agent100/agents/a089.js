// a089 — cfo: income side. Unclaimed money flow is free and state-specific;
// static check pins the "never pay" honesty rule.
module.exports = {
  id: "a089",
  lane: "cfo",
  title: "Unclaimed money flow is free; state-specific search path",
  persona: {
    name: "Aisha D.", age: 26, state: "WA", incomeMonthly: 2900,
    debts: [{ name: "Store balance", bal: 1200, apr: 19.99, min: 35 }],
    employment: "barista", goals: ["find extra income", "claim old money"],
    tech: "med", bankConnected: false, dataTier: "none",
    notes: "old job may owe a final paycheck",
  },
  modes: ["dry"],
  steps: [
    { kind: "guide", prompt: "how do I find an unclaimed paycheck",
      expect: [{ t: "contains", re: "MissingMoney|unclaimed" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
    { kind: "static", file: "template", op: "contains", pattern: "unclaimed\\.org",
      desc: "official NAUPA directory linked, not a paid service" },
    { kind: "static", file: "template", op: "contains", pattern: "never pay",
      desc: "never-pay-anyone honesty rule on the unclaimed flow" },
  ],
};
