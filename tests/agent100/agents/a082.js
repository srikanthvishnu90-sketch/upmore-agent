// a082 — cfo: debt sequencing. Bigger balance -> more total interest; extra
// payments shrink it. Persona voice: grad student, terse.
module.exports = {
  id: "a082",
  lane: "cfo",
  title: "Bigger balances cost more interest; extra payments cut it",
  persona: {
    name: "Devon K.", age: 29, state: "CA", incomeMonthly: 3600,
    debts: [{ name: "Card balance", bal: 5000, apr: 24.99, min: 150 }],
    employment: "grad student", goals: ["get out of debt", "build credit history"],
    tech: "high", bankConnected: false, dataTier: "thin",
    notes: "terse asker; wants numbers",
  },
  modes: ["dry"],
  steps: [
    { kind: "differential", fn: "debtSim",
      baseArgs: [[{ name: "Card balance", bal: 5000, apr: 24.99, min: 150 }], "avalanche", 200],
      perturb: { argIndex: 0, path: "0.bal", set: 9000 },
      outPath: "totalInt", expect: "up" },
    { kind: "calc", fn: "debtSim",
      args: [[{ name: "Card balance", bal: 5000, apr: 24.99, min: 150 }], "snowball", 200],
      expect: [{ t: "numeric", path: "totalInt", gt: 0 }, { t: "numeric", path: "months", gt: 0 }] },
    { kind: "guide", prompt: "which debt do I pay first?",
      expect: [{ t: "contains", re: "avalanche|snowball|payoff" }, { t: "noAdvice" }] },
    { kind: "static", file: "template", op: "contains", pattern: "payoff plan",
      desc: "payoff planner entry point exists on Home" },
  ],
};
