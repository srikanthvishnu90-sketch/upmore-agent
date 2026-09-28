// a058 (connectors): Plaid brokerage consent — fee check via engine before connecting.
module.exports = {
  id: "a058",
  lane: "connectors",
  title: "Brokerage consent: fee math checks out before connecting",
  persona: {
    name: "Robert D.",
    age: 55,
    state: "MN",
    incomeMonthly: 8400,
    debts: [],
    employment: "engineer",
    goals: ["understand 401k fees"],
    tech: "med",
    bankConnected: true,
    dataTier: "thin",
    notes: "Considering Plaid brokerage link for the X-ray; sanity-checks the fee engine first.",
  },
  modes: ["dry"],
  steps: [
    { kind: "calc", fn: "feeFor", args: [{ symbol: "VTI", expense_ratio: 0.03 }],
      expect: [{ t: "numeric", path: "rate", eq: 0.03 }] },
    { kind: "static", file: "template", op: "contains",
      pattern: "read-only brokerage-access credential stored encrypted",
      desc: "brokerage consent copy: credential vaulted, read-only" },
    { kind: "guide", prompt: "do you sell my data?",
      expect: [{ t: "contains", re: "never sell your data" }, { t: "noAdvice" }] },
  ],
};
