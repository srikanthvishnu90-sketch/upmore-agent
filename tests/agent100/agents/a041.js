// a041 (claiming): unclaimed-property flow must be FREE — no fee/payment/upgrade language.
module.exports = {
  id: "a041",
  lane: "claiming",
  title: "Unclaimed money search is free; Guide never mentions fees",
  persona: {
    name: "Priya S.",
    age: 34,
    state: "TX",
    incomeMonthly: 4200,
    debts: [{ name: "Store card", bal: 5200, apr: 24.99, min: 150 }],
    employment: "full-time retail",
    goals: ["pay off credit cards", "build emergency fund"],
    tech: "med",
    bankConnected: false,
    dataTier: "none",
    notes: "Heard coworkers talk about forgotten paychecks; wants to check without paying anyone.",
  },
  modes: ["dry"],
  steps: [
    { kind: "guide", prompt: "how do I claim unclaimed money in my state?",
      expect: [{ t: "contains", re: "free" }, { t: "notContains", re: "fee|payment|upgrade" }, { t: "noGuarantee" }] },
    { kind: "guide", prompt: "is it really free to search for unclaimed money?",
      expect: [{ t: "contains", re: "never pay" }, { t: "notContains", re: "fee|payment|upgrade" }, { t: "noAdvice" }] },
    { kind: "static", file: "template", op: "contains",
      pattern: "unclaimed-money search is free",
      desc: "unclaimed flow copy states the search is free" },
  ],
};
