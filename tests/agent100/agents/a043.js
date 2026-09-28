// a043 (claiming): retired routes are never earnable; contrast with a live route.
module.exports = {
  id: "a043",
  lane: "claiming",
  title: "Retired routes stay unearnable; researched routes earn",
  persona: {
    name: "Dorothy K.",
    age: 58,
    state: "OH",
    incomeMonthly: 6100,
    debts: [{ name: "Mortgage", bal: 142000, apr: 6.1, min: 980 }],
    employment: "retired teacher",
    goals: ["find forgotten money from old jobs"],
    tech: "low",
    bankConnected: false,
    dataTier: "none",
    notes: "Low-tech; asks plainly whether an old offer she heard about still counts.",
  },
  modes: ["dry"],
  steps: [
    { kind: "calc", fn: "earnable", args: [{ status: "retired" }],
      expect: [{ t: "numeric", path: "", eq: 0 }] },
    { kind: "calc", fn: "earnable", args: [{ status: "researched" }],
      expect: [{ t: "numeric", path: "", eq: 1 }] },
    { kind: "guide", prompt: "is it really free to search for unclaimed money?",
      expect: [{ t: "contains", re: "free" }, { t: "notContains", re: "fee|payment|upgrade" }] },
  ],
};
