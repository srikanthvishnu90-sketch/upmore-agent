// a016 — investing: fee drag in dollars per year from known expense ratios.
module.exports = {
  id: "a016",
  lane: "investing",
  title: "Fee drag in dollars traces to expense ratios",
  persona: {
    name: "Tom R.",
    age: 61,
    state: "PA",
    incomeMonthly: 5800,
    debts: [],
    employment: "factory supervisor",
    goals: ["stop paying high fees"],
    tech: "low",
    bankConnected: true,
    dataTier: "thin",
    notes: "Suspects his funds are expensive; wants the dollar cost.",
  },
  modes: ["dry"],
  steps: [
    { kind: "calc", fn: "feeFor",
      args: [{ symbol: "QQQ" }],
      expect: [
        { t: "numeric", path: "rate", eq: 0.002 },
        { t: "defined", path: "rate" },
      ] },
    { kind: "calc", fn: "portfolioSummary",
      args: [[
        { value: 50000, bucket: "Funds", symbol: "QQQ" },
        { value: 50000, bucket: "Funds", symbol: "VTI" },
      ]],
      expect: [
        { t: "numeric", path: "feeYearly", eq: 115 },
      ] },
    { kind: "static", file: "template", op: "contains",
      pattern: "expense_ratio",
      desc: "Fee engine reads expense ratios" },
  ],
};
