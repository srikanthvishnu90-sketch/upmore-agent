// a084 — cfo: tax positioning via HSA facts. 2026 limits are IRS-verified
// figures; Guide states them, never tells the user to contribute.
module.exports = {
  id: "a084",
  lane: "cfo",
  title: "HSA facts for 2026; no contribution recommendation",
  persona: {
    name: "Priya S.", age: 36, state: "IL", incomeMonthly: 6100,
    debts: [],
    employment: "teacher", goals: ["save for medical costs", "understand my taxes"],
    tech: "med", bankConnected: false, dataTier: "thin",
    notes: "has an HDHP option at work; comparing factually",
  },
  modes: ["dry"],
  steps: [
    { kind: "calc", fn: "marginalRate2026",
      args: [85000, "married"],
      expect: [{ t: "numeric", path: "value", eq: 22 }] },
    { kind: "guide", prompt: "what is an HSA",
      expect: [{ t: "contains", re: "HSA|Triple tax" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
    { kind: "guide", prompt: "should I contribute to an HSA",
      expect: [{ t: "contains", re: "HSA|triple tax" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
    { kind: "static", file: "template", op: "contains", pattern: "catch-up at 55",
      desc: "HSA catch-up copy present in tax module" },
  ],
};
