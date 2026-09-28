// a011 — investing: dividend income is computed facts; Guide never invents payouts.
module.exports = {
  id: "a011",
  lane: "investing",
  title: "Dividend math traces to yields; Guide invents no payouts",
  persona: {
    name: "Grace L.",
    age: 56,
    state: "VA",
    incomeMonthly: 3800,
    debts: [],
    employment: "part-time bookkeeper",
    goals: ["steady dividend income"],
    tech: "low",
    bankConnected: true,
    dataTier: "thin",
    notes: "Dividend-focused; asks what her dividends pay.",
  },
  modes: ["dry"],
  steps: [
    { kind: "calc", fn: "portfolioSummary",
      args: [[
        { value: 40000, bucket: "Stocks", symbol: "SCHD", dividend_yield: 0.035 },
        { value: 60000, bucket: "Funds", symbol: "VTI" },
      ]],
      expect: [
        { t: "numeric", path: "divAnnual", eq: 1400 },
        { t: "numeric", path: "divKnown", eq: 1 },
      ] },
    { kind: "guide", prompt: "how much are my dividends paying me this year?",
      expect: [
        { t: "noAdvice" },
        { t: "noGuarantee" },
        { t: "notContains", re: "your dividends are|you're earning" },
      ] },
    { kind: "static", file: "template", op: "contains",
      pattern: "never buy/sell advice",
      desc: "X-ray stays facts-only on payouts" },
  ],
};
