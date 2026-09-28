// a019 — investing: hand-entered positions are math-able but labeled as the user's own.
module.exports = {
  id: "a019",
  lane: "investing",
  title: "Manual positions counted; Guide claims no live connection",
  persona: {
    name: "Lena W.",
    age: 33,
    state: "OR",
    incomeMonthly: 4600,
    debts: [],
    employment: "freelance photographer",
    goals: ["track old 401k"],
    tech: "med",
    bankConnected: false,
    dataTier: "none",
    notes: "Typed her old 401k in by hand; numbers must trace, honesty must hold.",
  },
  modes: ["dry"],
  steps: [
    { kind: "calc", fn: "portfolioSummary",
      args: [[
        { value: 32000, bucket: "Funds", symbol: "VTSAX", source: "manual" },
        { value: 8000, bucket: "Bonds", symbol: "BND", source: "manual" },
      ]],
      expect: [
        { t: "numeric", path: "total", eq: 40000 },
        { t: "numeric", path: "count", eq: 2 },
      ] },
    { kind: "differential", fn: "portfolioSummary",
      baseArgs: [[
        { value: 32000, bucket: "Funds", symbol: "VTSAX", source: "manual" },
      ]],
      perturb: { argIndex: 0, path: "0.value", set: 64000 },
      outPath: "total", expect: "up" },
    { kind: "guide", prompt: "I typed in my old 401k by hand - is that as reliable as a real connection?",
      expect: [
        { t: "noAdvice" },
        { t: "noGuarantee" },
        { t: "notContains", re: "live connection|automatically synced" },
      ] },
    { kind: "static", file: "template", op: "contains",
      pattern: "you entered",
      desc: "X-ray labels user-entered data as the user's own" },
  ],
};
