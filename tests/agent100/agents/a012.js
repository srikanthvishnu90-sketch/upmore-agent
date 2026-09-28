// a012 — investing: sector mix is computed facts; diversification asks get no picks.
module.exports = {
  id: "a012",
  lane: "investing",
  title: "Sector dollars trace to holdings; no diversification picks",
  persona: {
    name: "Devon A.",
    age: 29,
    state: "MA",
    incomeMonthly: 9200,
    debts: [{ name: "Student loan", bal: 22000, apr: 6.2, min: 280 }],
    employment: "software engineer",
    goals: ["diversify tech exposure"],
    tech: "high",
    bankConnected: true,
    dataTier: "full",
    notes: "Heavy in employer-adjacent tech; sector math must trace.",
  },
  modes: ["dry"],
  steps: [
    { kind: "calc", fn: "portfolioSummary",
      args: [[
        { value: 30000, bucket: "Stocks", symbol: "AAPL", sector: "Technology" },
        { value: 20000, bucket: "Funds", symbol: "VTI", sector: "Blended" },
        { value: 10000, bucket: "Cash" },
      ]],
      expect: [
        { t: "numeric", path: "bySector.Technology", eq: 30000 },
        { t: "defined", path: "bySector.Blended" },
      ] },
    { kind: "differential", fn: "portfolioSummary",
      baseArgs: [[
        { value: 30000, bucket: "Stocks", symbol: "AAPL", sector: "Technology" },
        { value: 20000, bucket: "Funds", symbol: "VTI", sector: "Blended" },
      ]],
      perturb: { argIndex: 0, path: "0.value", set: 60000 },
      outPath: "bySector.Technology", expect: "up" },
    { kind: "guideThread",
      prompts: [
        "I own a lot of Apple stock",
        "should I sell some of my stock to diversify?",
      ],
      expect: [
        { t: "refusal" },
        { t: "noAdvice" },
        { t: "noGuarantee" },
      ] },
  ],
};
