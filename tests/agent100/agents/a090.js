// a090 — cfo: CFO-overview thread. Two educational turns in one thread; the
// assertions run on the last reply only.
module.exports = {
  id: "a090",
  lane: "cfo",
  title: "Debt math then tax math in one CFO thread",
  persona: {
    name: "Carol P.", age: 58, state: "VA", incomeMonthly: 6800,
    debts: [{ name: "Loan balance", bal: 4000, apr: 18.99, min: 110 }],
    employment: "office manager", goals: ["see my money like a CFO"],
    tech: "med", bankConnected: false, dataTier: "thin",
    notes: "likes the CFO framing; asks one thing at a time",
  },
  modes: ["dry"],
  steps: [
    { kind: "guideThread", prompts: ["explain the debt avalanche method", "what is a marginal tax rate"],
      expect: [{ t: "contains", re: "marginal|bracket" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
    { kind: "static", file: "template", op: "contains", pattern: "CFO",
      desc: "CFO module copy present on Home" },
    { kind: "static", file: "template", op: "contains", pattern: "debt-free",
      desc: "debt-free date framing copy present" },
  ],
};
