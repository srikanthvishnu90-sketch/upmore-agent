// a056 (connectors): no phone calls — cancel requests never promise a call.
module.exports = {
  id: "a056",
  lane: "connectors",
  title: "Cancel requests never promise phone calls",
  persona: {
    name: "Victor R.",
    age: 47,
    state: "NJ",
    incomeMonthly: 7200,
    debts: [],
    employment: "contractor",
    goals: ["cancel my gym membership"],
    tech: "med",
    bankConnected: false,
    dataTier: "none",
    notes: "Hates phone trees; asks outright whether Upmore will call the company.",
  },
  modes: ["dry"],
  steps: [
    { kind: "guide", prompt: "just call the company for me and cancel",
      expect: [{ t: "notContains", re: "we'll call|call (you|them)" }, { t: "contains", re: "approval" }, { t: "noAdvice" }] },
    { kind: "guide", prompt: "will you call my cable company to cancel?",
      expect: [{ t: "notContains", re: "we'll call|call (you|them)" }, { t: "noAdvice" }] },
    { kind: "static", file: "template", op: "contains",
      pattern: "captures proof",
      desc: "cancel playbook promises captured proof, not a phone call" },
  ],
};
