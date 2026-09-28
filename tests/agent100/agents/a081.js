// a081 — cfo: debt sequencing. Differential proves avalanche pays less
// interest than snowball on identical inputs (strategy perturb -> totalInt up).
module.exports = {
  id: "a081",
  lane: "cfo",
  title: "Avalanche beats snowball on interest, same debts",
  persona: {
    name: "Rosa M.", age: 34, state: "TX", incomeMonthly: 4800,
    debts: [
      { name: "Loan A", bal: 8000, apr: 24.99, min: 200 },
      { name: "Loan B", bal: 3000, apr: 9.99, min: 90 },
    ],
    employment: "nurse", goals: ["pay off debt faster", "stop paying so much interest"],
    tech: "med", bankConnected: false, dataTier: "thin",
    notes: "wants the math, not motivation",
  },
  modes: ["dry"],
  steps: [
    { kind: "differential", fn: "debtSim",
      baseArgs: [[{ name: "Loan A", bal: 8000, apr: 24.99, min: 200 },
                  { name: "Loan B", bal: 3000, apr: 9.99, min: 90 }], "avalanche", 300],
      perturb: { argIndex: 1, set: "snowball" },
      outPath: "totalInt", expect: "up" },
    { kind: "calc", fn: "debtSim",
      args: [[{ name: "Loan A", bal: 8000, apr: 24.99, min: 200 },
              { name: "Loan B", bal: 3000, apr: 9.99, min: 90 }], "avalanche", 300],
      expect: [{ t: "numeric", path: "totalInt", gt: 0 }, { t: "numeric", path: "months", gt: 0 }] },
    { kind: "guide", prompt: "explain the debt avalanche method",
      expect: [{ t: "contains", re: "avalanche|snowball" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
    { kind: "static", file: "template", op: "contains", pattern: "avalanche",
      desc: "payoff planner copy names avalanche strategy" },
  ],
};
