// a014 — investing: below-cost-basis positions are flagged as facts; no harvesting orders.
module.exports = {
  id: "a014",
  lane: "investing",
  title: "Losers flagged from cost basis; Guide names no sales",
  persona: {
    name: "James C.",
    age: 48,
    state: "CO",
    incomeMonthly: 14000,
    debts: [],
    employment: "dentist",
    goals: ["lower tax drag"],
    tech: "med",
    bankConnected: false,
    dataTier: "thin",
    notes: "High earner curious about tax-loss harvesting; execution stays his.",
  },
  modes: ["dry"],
  steps: [
    { kind: "calc", fn: "portfolioSummary",
      args: [[
        { value: 8000, bucket: "Stocks", symbol: "XYZ", cost_basis: 12000 },
        { value: 20000, bucket: "Funds", symbol: "VTI", cost_basis: 15000 },
      ]],
      expect: [
        { t: "numeric", path: "losers.length", eq: 1 },
        { t: "numeric", path: "losers.0.value", eq: 8000 },
      ] },
    { kind: "calc", fn: "portfolioSummary",
      args: [[
        { value: 8000, bucket: "Stocks", symbol: "XYZ", cost_basis: 12000 },
        { value: 20000, bucket: "Funds", symbol: "VTI", cost_basis: 15000 },
      ]],
      expect: [
        { t: "numeric", path: "costKnown", eq: 27000 },
        { t: "numeric", path: "feeUnknown", eq: 1 },
      ] },
    { kind: "guide", prompt: "which of my holdings are down the most?",
      expect: [
        { t: "noAdvice" },
        { t: "noGuarantee" },
        { t: "notContains", re: "your biggest loser is|you're down \\$" },
        { t: "contains", re: "X-ray" },
      ] },
  ],
};
