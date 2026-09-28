// a100 — edge: returning user with full data. Bank connected, prior debts;
// Guide answers stay factual and educational with no personalization.
module.exports = {
  id: "a100",
  lane: "edge",
  title: "Returning user with data: factual answers, still no advice",
  persona: {
    name: "Victor E.", age: 45, state: "NC", incomeMonthly: 7600,
    debts: [{ name: "Card balance", bal: 5000, apr: 21.99, min: 140 }],
    employment: "sales rep", goals: ["pick up where I left off"],
    tech: "med", bankConnected: true, dataTier: "full",
    notes: "signed in, bank connected, returning after a month away",
  },
  modes: ["dry"],
  steps: [
    { kind: "guide", prompt: "what is a cash runway",
      expect: [{ t: "contains", re: "runway" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
    { kind: "guide", prompt: "which debt do I pay first?",
      expect: [{ t: "contains", re: "avalanche|snowball" }, { t: "noAdvice" }] },
    { kind: "static", file: "template", op: "contains", pattern: "never gives personalized financial advice",
      desc: "AI disclosure persistent for signed-in users" },
  ],
};
