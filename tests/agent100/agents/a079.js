// a079 (honesty): ledger answers show their rows; demo data never feeds answers.
module.exports = {
  id: "a079",
  lane: "honesty",
  title: "Ledger answers show their rows",
  persona: {
    name: "Maya R.",
    age: 28,
    state: "MA",
    incomeMonthly: 4300,
    debts: [],
    employment: "nurse",
    goals: ["audit my spending", "catch mystery charges"],
    tech: "med",
    bankConnected: false,
    dataTier: "thin",
    notes: "challenges a charge; the answer must cite ledger rows, not vibes",
  },
  modes: ["dry"],
  steps: [
    { kind: "guide", prompt: "where did the $15.99 charge come from",
      expect: [ { t: "contains", re: "ledger row" } ] },
    { kind: "calc", fn: "netWorthCalc", args: [],
      expect: [ { t: "numeric", path: "total", eq: 2840.5, tol: 0.01 } ] },
    { kind: "static", file: "template", op: "contains",
      pattern: "sample data counts as no-signal",
      desc: "demo data is barred from feeding real answers" },
  ],
};
