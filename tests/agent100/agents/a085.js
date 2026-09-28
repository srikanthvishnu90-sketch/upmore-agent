// a085 — cfo: idle cash. Educational: APY vs APR, emergency-fund placement.
// Static checks pin the Idle cash and high-yield savings copy in the app.
module.exports = {
  id: "a085",
  lane: "cfo",
  title: "Idle cash earns nothing in checking; APY explained",
  persona: {
    name: "Lena W.", age: 28, state: "FL", incomeMonthly: 5400,
    debts: [],
    employment: "marketing", goals: ["make savings work harder", "build an emergency fund"],
    tech: "high", bankConnected: false, dataTier: "thin",
    notes: "keeps $9k in checking 'just in case'; wants plain facts",
  },
  modes: ["dry"],
  steps: [
    { kind: "guide", prompt: "what is APY",
      expect: [{ t: "contains", re: "APY|compounding" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
    { kind: "guide", prompt: "how does an emergency fund work",
      expect: [{ t: "contains", re: "emergency fund" }, { t: "noAdvice" }, { t: "noGuarantee" }] },
    { kind: "static", file: "template", op: "contains", pattern: "Idle cash",
      desc: "Idle cash CFO tool copy present" },
    { kind: "static", file: "template", op: "contains", pattern: "high-yield savings",
      desc: "high-yield savings placement copy present" },
  ],
};
