// Categorization queue: grad student puzzled by "uncategorized" transactions.
module.exports = {
  id: "a033",
  lane: "tracking",
  title: "Grad student works through her uncategorized transaction queue",
  persona: {
    name: "Nina V.",
    age: 23,
    state: "MA",
    incomeMonthly: 1800,
    debts: [],
    employment: "grad student + TA stipend",
    goals: ["understand my spending", "keep it simple"],
    tech: "high",
    bankConnected: true,
    dataTier: "thin",
    notes: "only connected one account; lots of transactions land in 'uncategorized'",
  },
  modes: ["dry", "live"],
  steps: [
    { kind: "backend", prompt: "a bunch of my transactions say 'uncategorized'. what am i supposed to do with those?",
      expect: [{ t: "contains", re: "categor" }] },
    { kind: "backend", prompt: "why did you put my whole market run under groceries when half of it was gifts?",
      expect: [{ t: "contains", re: "recategorize|fix|correct" },
               { t: "notContains", re: "wasted|bad habit|shame|guilty" }] },
    { kind: "static", file: "template", op: "contains", pattern: "Transaction",
      desc: "transaction review surface present in the template" },
  ],
};
