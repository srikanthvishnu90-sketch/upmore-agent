// a068 (tabs): Guide routes debt questions to the Home debt simulator, and the
// simulator's numbers trace to their inputs.
module.exports = {
  id: "a068",
  lane: "tabs",
  title: "Guide routes payoff questions to the Home debt simulator",
  persona: {
    name: "James W.",
    age: 45,
    state: "AZ",
    incomeMonthly: 5900,
    debts: [
      { name: "CapOne", bal: 6200, apr: 26.99, min: 180 },
      { name: "Store card", bal: 1800, apr: 29.99, min: 60 },
    ],
    employment: "electrician",
    goals: ["kill the card debt"],
    tech: "med",
    bankConnected: false,
    dataTier: "none",
    notes: "two cards, asks the Guide which to hit first",
  },
  modes: ["dry"],
  steps: [
    { kind: "guide", prompt: "which card do i pay first?",
      expect: [ { t: "contains", re: "Debt payoff plan" } ] },
    { kind: "differential", fn: "debtSim",
      baseArgs: [ [{ name: "A", bal: 5000, apr: 24.99, min: 150 }], "avalanche", 200 ],
      perturb: { argIndex: 0, path: "0.bal", set: 9000 },
      outPath: "totalInt", expect: "up" },
    { kind: "calc", fn: "debtSim",
      args: [ [{ name: "CapOne", bal: 6200, apr: 26.99, min: 180 }], "avalanche", 200 ],
      expect: [ { t: "numeric", path: "months", gt: 0 }, { t: "numeric", path: "totalInt", gt: 0 } ] },
  ],
};
