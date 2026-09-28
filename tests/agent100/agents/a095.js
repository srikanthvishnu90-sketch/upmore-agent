// a095 — edge: gig worker, irregular income. Freelancer tax education is
// factual (self-employment rate, quarterly cadence), never personalized.
module.exports = {
  id: "a095",
  lane: "edge",
  title: "Gig worker: irregular income and quarterly tax facts",
  persona: {
    name: "Darius J.", age: 27, state: "NV", incomeMonthly: 3100,
    debts: [{ name: "Card balance", bal: 2500, apr: 22.99, min: 75 }],
    employment: "delivery driver, gig apps", goals: ["handle irregular pay", "get quarterly taxes right"],
    tech: "med", bankConnected: false, dataTier: "thin",
    notes: "income swings $2k-$4.5k/mo; new to estimated taxes",
  },
  modes: ["dry"],
  steps: [
    { kind: "guide", prompt: "how do quarterly estimated taxes work for freelancers",
      expect: [{ t: "contains", re: "15\\.3|quarterly" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
    { kind: "static", file: "template", op: "contains", pattern: "1099",
      desc: "gig/1099 income copy present" },
    { kind: "calc", fn: "debtSim",
      args: [[{ name: "Card balance", bal: 2500, apr: 22.99, min: 75 }], "avalanche", 100],
      expect: [{ t: "numeric", path: "months", gt: 0 }, { t: "numeric", path: "totalInt", gt: 0 }] },
  ],
};
