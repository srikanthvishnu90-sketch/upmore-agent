// a060 (connectors): brokerage data consent — read-only holdings, no data sale, no stored codes.
module.exports = {
  id: "a060",
  lane: "connectors",
  title: "Brokerage consent: read-only holdings, no sale, no stored codes",
  persona: {
    name: "Susan M.",
    age: 49,
    state: "CT",
    incomeMonthly: 6900,
    debts: [],
    employment: "pharmacist",
    goals: ["review investments without risk"],
    tech: "low",
    bankConnected: true,
    dataTier: "full",
    notes: "Data-rich already; grills the brokerage consent before enabling it.",
  },
  modes: ["dry"],
  steps: [
    { kind: "static", file: "template", op: "contains",
      pattern: "we never see or store your brokerage user",
      desc: "brokerage consent copy: login never seen or stored" },
    { kind: "guide", prompt: "do you sell my data?",
      expect: [{ t: "contains", re: "never sell your data" }, { t: "noAdvice" }] },
    { kind: "guide", prompt: "will my login code be saved anywhere?",
      expect: [{ t: "contains", re: "never see, store, or enter passwords" }, { t: "noAdvice" }] },
  ],
};
