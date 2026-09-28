// a088 — cfo: monthly close. Static checks pin the Monthly close screen and
// the no-guilt rule; Guide stays educational on a basics question.
module.exports = {
  id: "a088",
  lane: "cfo",
  title: "Monthly close screen exists; no guilt language anywhere",
  persona: {
    name: "Tom B.", age: 52, state: "GA", incomeMonthly: 9200,
    debts: [],
    employment: "operations manager", goals: ["do a monthly money review", "stay organized"],
    tech: "low", bankConnected: true, dataTier: "full",
    notes: "connected bank; wants a simple end-of-month routine",
  },
  modes: ["dry"],
  steps: [
    { kind: "static", file: "template", op: "contains", pattern: "Monthly close",
      desc: "Monthly close CFO screen copy present" },
    { kind: "static", file: "template", op: "contains", pattern: "no-guilt",
      desc: "no-guilt rule copy present on money screens" },
    { kind: "guide", prompt: "what is compound interest",
      expect: [{ t: "contains", re: "Rule of 72|compound" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
  ],
};
