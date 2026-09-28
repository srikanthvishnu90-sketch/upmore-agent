// a094 — edge: no income. Unemployed adult; the Guide educates without
// assuming a paycheck, and money copy stays guilt-free.
module.exports = {
  id: "a094",
  lane: "edge",
  title: "Zero income: honest help without assuming a paycheck",
  persona: {
    name: "Sam O.", age: 23, state: "OH", incomeMonthly: 0,
    debts: [],
    employment: "unemployed, job hunting", goals: ["find a job", "build savings"],
    tech: "med", bankConnected: false, dataTier: "none",
    notes: "between jobs; no bank connected, no data",
  },
  modes: ["dry"],
  steps: [
    { kind: "guide", prompt: "how do I find an unclaimed paycheck",
      expect: [{ t: "contains", re: "MissingMoney|unclaimed" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
    { kind: "guide", prompt: "how does an emergency fund work",
      expect: [{ t: "contains", re: "emergency fund" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
    { kind: "static", file: "template", op: "contains", pattern: "no-guilt",
      desc: "no-guilt language rule covers zero-income users too" },
  ],
};
