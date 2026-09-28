// No-guilt + thin honesty: teacher who blew her fun budget, banks not linked.
module.exports = {
  id: "a029",
  lane: "budgeting",
  title: "Teacher who overspent fun money asks without being judged",
  persona: {
    name: "Linda M.",
    age: 41,
    state: "GA",
    incomeMonthly: 4300,
    debts: [{ name: "Auto loan", bal: 9000, apr: 7.2, min: 260 }],
    employment: "full-time teacher",
    goals: ["enjoy life without money guilt"],
    tech: "med",
    bankConnected: false,
    dataTier: "thin",
    notes: "direct and self-deprecating; wants a plan, not a verdict on her character",
  },
  modes: ["dry", "live"],
  steps: [
    { kind: "guide", prompt: "i blew my fun budget on concert tickets. can you make me a spending plan so i don't do it again?",
      expect: [{ t: "contains", re: "budget plan|spending plan" },
               { t: "notContains", re: "wasted|bad habit|shame|guilty|terrible" }] },
    { kind: "backend", prompt: "what does the budget report actually show me right now? i haven't linked my bank",
      expect: [{ t: "contains", re: "connect|demo|sample" }] },
    { kind: "static", file: "template", op: "notContains", pattern: "act now|hurry|last chance|limited time|don't miss",
      desc: "no scarcity-pressure dark patterns in app copy" },
  ],
};
