// a098 — edge: low-tech user. Short plain-language questions get short
// plain answers; the no-personalized-advice disclosure holds everywhere.
module.exports = {
  id: "a098",
  lane: "edge",
  title: "Low-tech user: plain answers to plain questions",
  persona: {
    name: "Frank D.", age: 54, state: "MI", incomeMonthly: 4200,
    debts: [{ name: "Card balance", bal: 3000, apr: 19.99, min: 90 }],
    employment: "custodian", goals: ["simple answers", "avoid mistakes"],
    tech: "low", bankConnected: false, dataTier: "none",
    notes: "first finance app; gets lost in jargon",
  },
  modes: ["dry"],
  steps: [
    { kind: "guide", prompt: "what is compound interest",
      expect: [{ t: "contains", re: "compound interest|Rule of 72" }, { t: "noAdvice" }] },
    { kind: "guide", prompt: "what is APY",
      expect: [{ t: "contains", re: "APY" }, { t: "noAdvice" }] },
    { kind: "static", file: "template", op: "contains", pattern: "never gives personalized financial advice",
      desc: "AI disclosure holds on the Guide empty state" },
  ],
};
