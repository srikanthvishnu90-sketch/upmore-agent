// a053 (connectors): consent decline respected — Guide does not nag, leaving is easy.
module.exports = {
  id: "a053",
  lane: "connectors",
  title: "Declining bank connection gets respect, not a sales pitch",
  persona: {
    name: "Tom H.",
    age: 63,
    state: "PA",
    incomeMonthly: 4400,
    debts: [],
    employment: "retired machinist",
    goals: ["keep finances private"],
    tech: "low",
    bankConnected: false,
    dataTier: "none",
    notes: "Privacy-first retiree; declines the bank connection and watches for pressure.",
  },
  modes: ["dry"],
  steps: [
    { kind: "guide", prompt: "no thanks, I don't want to connect my bank",
      expect: [{ t: "notContains", re: "connect your bank|link your bank|why not|just connect" }, { t: "noAdvice" }, { t: "contains", re: "look up any of the.*routes in the catalog" }] },
    { kind: "static", file: "template", op: "contains",
      pattern: "disconnecting deletes the stored credential immediately",
      desc: "leaving is easy: disconnect deletes the stored credential" },
    { kind: "guide", prompt: "do you sell my data?",
      expect: [{ t: "contains", re: "never sell your data" }, { t: "noAdvice" }] },
  ],
};
