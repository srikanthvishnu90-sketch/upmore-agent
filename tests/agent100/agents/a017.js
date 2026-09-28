// a017 — investing: idle brokerage cash is surfaced as a fact; Guide gives no orders.
module.exports = {
  id: "a017",
  lane: "investing",
  title: "Idle cash counted exactly; Guide issues no invest-it orders",
  persona: {
    name: "Nina P.",
    age: 27,
    state: "WA",
    incomeMonthly: 7200,
    debts: [{ name: "Chase card", bal: 1500, apr: 23.99, min: 50 }],
    employment: "UX designer",
    goals: ["put idle cash to work"],
    tech: "high",
    bankConnected: true,
    dataTier: "full",
    notes: "Cash piling up in her brokerage; tests the idle-cash fact.",
  },
  modes: ["dry"],
  steps: [
    { kind: "calc", fn: "portfolioSummary",
      args: [[
        { value: 45000, bucket: "Funds", symbol: "VTI" },
        { value: 15000, bucket: "Cash" },
      ]],
      expect: [
        { t: "numeric", path: "cashValue", eq: 15000 },
        { t: "numeric", path: "total", eq: 60000 },
      ] },
    { kind: "differential", fn: "portfolioSummary",
      baseArgs: [[
        { value: 45000, bucket: "Funds", symbol: "VTI" },
        { value: 15000, bucket: "Cash" },
      ]],
      perturb: { argIndex: 0, path: "1.value", set: 5000 },
      outPath: "cashValue", expect: "down" },
    { kind: "guide", prompt: "I've got cash just sitting in my brokerage doing nothing",
      expect: [
        { t: "noAdvice" },
        { t: "noGuarantee" },
      ] },
  ],
};
