// a083 — cfo: tax positioning. Marginal rate math is factual and educational;
// Guide explains brackets without personalizing.
module.exports = {
  id: "a083",
  lane: "cfo",
  title: "Marginal rates rise with income; brackets explained, not advised",
  persona: {
    name: "Marcus T.", age: 41, state: "NY", incomeMonthly: 7200,
    debts: [],
    employment: "contractor", goals: ["understand my tax bracket", "plan quarterly payments"],
    tech: "med", bankConnected: false, dataTier: "thin",
    notes: "1099 contractor; wants concepts, not a recommendation",
  },
  modes: ["dry"],
  steps: [
    { kind: "calc", fn: "marginalRate2026",
      args: [60000, "single"],
      expect: [{ t: "numeric", path: "value", eq: 12 }] },
    { kind: "calc", fn: "marginalRate2026",
      args: [120000, "single"],
      expect: [{ t: "numeric", path: "value", eq: 22 }] },
    { kind: "guide", prompt: "what is a marginal tax rate",
      expect: [{ t: "contains", re: "marginal|bracket" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
    { kind: "static", file: "template", op: "contains", pattern: "not financial advice",
      desc: "tax copy carries the no-advice disclosure" },
  ],
};
