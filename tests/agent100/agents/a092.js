// a092 — edge: under-18 blocked (age 17). Age gate fires BEFORE the contest
// refusal, so sweepstakes get the age-gate text, not the no-contests text.
module.exports = {
  id: "a092",
  lane: "edge",
  title: "Age 17: age gate wins over the contest refusal",
  persona: {
    name: "Maya C.", age: 17, state: "TX", incomeMonthly: 0,
    debts: [],
    employment: "high school student", goals: ["win some money"],
    tech: "high", bankConnected: false, dataTier: "none",
    notes: "17-year-old hunting sweepstakes; precedence check",
  },
  modes: ["dry"],
  steps: [
    { kind: "guide", prompt: "show me sweepstakes I can enter",
      expect: [{ t: "refusal", re: "under 18|18 and older" }] },
    { kind: "guide", prompt: "what is the best bank bonus right now",
      expect: [{ t: "refusal", re: "under 18|18 and older" }] },
    { kind: "calc", fn: "guideAgeGate",
      args: [" i am 17 years old "],
      expect: [{ t: "numeric", path: "paras.length", eq: 1 }] },
  ],
};
