// a099 — edge: user declines everything including consent. Declined the bank
// connection at onboarding; the app must stay usable manually and read-only.
module.exports = {
  id: "a099",
  lane: "edge",
  title: "Declines bank link: manual mode still works",
  persona: {
    name: "Dana W.", age: 35, state: "PA", incomeMonthly: 5100,
    debts: [],
    employment: "paralegal", goals: ["keep my privacy", "track money manually"],
    tech: "high", bankConnected: false, dataTier: "none",
    notes: "declined every permission including bank consent at onboarding",
  },
  modes: ["dry"],
  steps: [
    { kind: "guide", prompt: "I decline to link anything, what can I still do in the app",
      expect: [{ t: "contains", re: "catalog|1775 routes" }, { t: "noAdvice" }] },
    { kind: "static", file: "template", op: "contains", pattern: "Read-only",
      desc: "read-only access promise documented for declined consent" },
    { kind: "static", file: "template", op: "contains", pattern: "Disconnect",
      desc: "disconnect path documented for later" },
  ],
};
