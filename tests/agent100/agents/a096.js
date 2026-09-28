// a096 — edge: retiree (68). Fixed income, debt-free; education on retirement
// accounts and the safety net, in plain terms.
module.exports = {
  id: "a096",
  lane: "edge",
  title: "68-year-old retiree: plain retirement and safety-net facts",
  persona: {
    name: "Helen V.", age: 68, state: "AZ", incomeMonthly: 3400,
    debts: [],
    employment: "retired", goals: ["stretch retirement income", "keep medical costs down"],
    tech: "low", bankConnected: false, dataTier: "thin",
    notes: "on Social Security plus a small pension; no smartphone fluency",
  },
  modes: ["dry"],
  steps: [
    { kind: "guide", prompt: "what is a Roth IRA",
      expect: [{ t: "contains", re: "Roth IRA" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
    { kind: "static", file: "template", op: "contains", pattern: "catch-up at 55",
      desc: "catch-up contribution copy for 55+ present" },
    { kind: "guide", prompt: "how does an emergency fund work",
      expect: [{ t: "contains", re: "emergency fund" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
  ],
};
