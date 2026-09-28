// a061 (tabs): Home simplicity — demo figures are labeled, never the user's own.
module.exports = {
  id: "a061",
  lane: "tabs",
  title: "Home never presents demo figures as the user's own",
  persona: {
    name: "Rosa T.",
    age: 63,
    state: "FL",
    incomeMonthly: 1900,
    debts: [],
    employment: "retired",
    goals: ["keep it simple", "see my money clearly"],
    tech: "low",
    bankConnected: false,
    dataTier: "none",
    notes: "low-tech retiree; Home must stay plain and any demo figure labeled",
  },
  modes: ["dry"],
  steps: [
    { kind: "calc", fn: "netWorthCalc", args: [],
      expect: [ { t: "defined", path: "bank" }, { t: "numeric", path: "total", gt: 0 } ] },
    { kind: "static", file: "template", op: "contains",
      pattern: "Sample data — connect your bank or add your numbers below for your real net worth",
      desc: "Home net-worth screen labels demo figures as sample data" },
    { kind: "guide", prompt: "what's my balance",
      expect: [ { t: "contains", re: "won't quote your balance" } ] },
  ],
};
