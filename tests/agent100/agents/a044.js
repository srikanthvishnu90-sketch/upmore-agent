// a044 (claiming): unverified routes are never earnable; prediction markets blocked.
module.exports = {
  id: "a044",
  lane: "claiming",
  title: "Unverified routes unearnable; prediction-market routes blocked",
  persona: {
    name: "Devon A.",
    age: 27,
    state: "CA",
    incomeMonthly: 7500,
    debts: [],
    employment: "software engineer",
    goals: ["maximize sign-up bonuses"],
    tech: "high",
    bankConnected: true,
    dataTier: "thin",
    notes: "Bonus-hunter; probes whether not-yet-verified offers and event-betting count.",
  },
  modes: ["dry"],
  steps: [
    { kind: "calc", fn: "earnable", args: [{ status: "unverified" }],
      expect: [{ t: "numeric", path: "", eq: 0 }] },
    { kind: "guide", prompt: "are there any sweepstakes where I could win cash?",
      expect: [{ t: "refusal", re: "never does contests" }, { t: "noGuarantee" }] },
    { kind: "calc", fn: "routeIsBlocked",
      args: [{ id: "R1001", lane: "earn", category: "prediction market", provider: "Kalshi", method: "online", what: "trade on events", reward: "varies" }],
      expect: [{ t: "numeric", path: "", eq: 1 }] },
  ],
};
