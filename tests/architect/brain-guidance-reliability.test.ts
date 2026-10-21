// Original invented guidance cases. Real requirement checking and tool output; no provider calls.
import { check, movesFor, type Requirement } from "../../supabase/functions/_shared/career_path.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";

function eq(got: unknown, want: unknown, why: string) {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`${why}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
}
function ok(value: unknown, why: string): asserts value { if (!value) throw new Error(why); }
const NOW = Date.UTC(2026, 9, 21, 15);
const req = (kind = "skill", any = ["Python"], count = 1): Requirement => ({
  id: "SYNTHETIC-REQUIREMENT", program: "Synthetic Program", kind, text: `Required ${kind}: ${any.join(" or ")}`,
  source_url: "https://careers.example.test/program", checked_at: "2026-10-21", any, count,
});
const fact = (text: string, id = "SYNTHETIC-FACT") => ({ id, kind: "skill", text });

Deno.test("guidance: a confirmed negative statement cannot satisfy a skill or clearance", () => {
  for (const [kind, word, text] of [
    ["skill", "Python", "I have never used Python."],
    ["skill", "Python", "Python is not a skill I have."],
    ["experience", "management", "I do not have management experience."],
    ["clearance", "security clearance", "I have no security clearance."],
  ]) ok(check(req(kind, [word]), [fact(text)]).status !== "met", `${kind} promoted denied evidence`);
});

Deno.test("guidance: a denied member of a two-skill list is not counted", () => {
  const result = check(req("skill", ["SQL", "Python"], 2), [fact("I use SQL but I have never used Python.")]);
  eq(result.status, "unmet", "only one of the two skills is affirmed");
  ok(result.gap?.includes("SQL"), "the real skill remains evidence");
});

Deno.test("guidance: conflicting affirmative and negative facts require reconciliation", () => {
  const result = check(req(), [fact("I use Python.", "SYNTHETIC-YES"), fact("I have never used Python.", "SYNTHETIC-NO")]);
  eq(result.status, "unknown", "conflicting evidence is not a qualification");
});

Deno.test("guidance: a sufficient unambiguous alternative does not need unrelated clarification", () => {
  const result = check(req("skill", ["Python", "SQL"], 1), [
    fact("I use Python and SQL.", "SYNTHETIC-YES"), fact("I have never used Python.", "SYNTHETIC-NO"),
  ]);
  eq(result.status, "met", "uncontested SQL satisfies the one-skill alternative");
  eq(result.fact?.id, "SYNTHETIC-YES", "the positive fact is retained");
});

Deno.test("guidance: negative evidence cannot produce a lead-with-this move", () => {
  const firm = { firm_id: "synthetic", name: "Synthetic Firm", requirements: [req()] };
  const moves = movesFor(firm, [{ name: "Synthetic Program" }], [fact("I don't know Python.")], [], NOW);
  eq(moves.length, 1, "the sourced requirement still gets a next move");
  ok(moves[0].status !== "met", "denied knowledge was called a match");
  ok(!moves[0].action.startsWith("Lead with this"), "the user was told to sell a skill they denied");
});

Deno.test("guidance: clear affirmative skill evidence and not-only wording remain usable", () => {
  eq(check(req(), [fact("Python from two class projects")]).status, "met", "positive evidence survives");
  eq(check(req("skill", ["Python", "SQL"], 2), [fact("I use not only Python but also SQL.")]).status, "met", "not only is affirmative");
  eq(check(req("skill", ["NoSQL"]), [fact("I use NoSQL databases.")]).status, "met", "NoSQL is not a negation");
});

Deno.test("guidance: negative words about help or difficulty do not deny an affirmed skill", () => {
  for (const text of ["I use Python without help.", "Without a doubt, Python is my strongest language.", "I have no trouble using Python."]) {
    eq(check(req(), [fact(text)]).status, "met", `affirmed skill was denied: ${text}`);
  }
});

Deno.test("guidance: negation stays in its own clause and skill list", () => {
  for (const text of ["I do not know Python; I use SQL.", "SQL, not Python.", "I do not know Python and I use SQL."]) {
    eq(check(req("skill", ["SQL"]), [fact(text)]).status, "met", `positive clause lost: ${text}`);
    ok(check(req("skill", ["Python"]), [fact(text)]).status !== "met", `negative clause promoted: ${text}`);
  }
});

Deno.test("guidance: the actual career-path tool does not advertise a denied skill as a fit", async () => {
  const tool = careerTools({ postings: async () => [] }).find((t) => t.name === "career_path_answer")!;
  const state = { profile: { id: "SYNTHETIC-PROFILE", basics: {}, constraints: {}, preferences: {}, facts: [
    { ...fact("I have no active security clearance."), status: "confirmed", needs_confirmation: false },
  ] } };
  const result = await tool.run({ firm: "Palantir", role: "intel" }, { userId: "SYNTHETIC-GUIDANCE", threadId: "SYNTHETIC-THREAD", now: NOW, state });
  const moves = (result as any).moves;
  ok(moves.some((move: any) => move.fact?.id === "SYNTHETIC-FACT"), "fixture must exercise the sourced clearance requirement");
  for (const move of moves) {
    if (move.fact?.id === "SYNTHETIC-FACT") ok(move.status !== "met", "real tool promoted negated code knowledge");
  }
});

Deno.test("guidance: a coordinated affirmative predicate has its own qualification scope", () => {
  for (const text of ["I have never used Python and use Java every day.", "I do not know Python but use Java every day."]) {
    eq(check(req("skill", ["Java"]), [fact(text)]).status, "met", text);
    ok(check(req("skill", ["Python"]), [fact(text)]).status !== "met", text);
  }
  ok(check(req("skill", ["Python", "Java"]), [fact("I have never used Python and Java.")]).status !== "met", "a bare coordinated list retains its denial");
});

Deno.test("guidance: a negative modifier on a different object does not negate the qualification", () => {
  for (const text of ["I use no external libraries for my Java projects.", "I build Java projects without external libraries."]) {
    eq(check(req("skill", ["Java"]), [fact(text)]).status, "met", text);
  }
  ok(check(req("skill", ["Java"]), [fact("I have no experience with my Java projects.")]).status !== "met", "a denied evidence noun remains negative");
});

Deno.test("guidance: contracted suffixes and neither-nor deny the qualification", () => {
  for (const text of ["Python isn't a language I know.", "Neither Python nor Java is a language I know.", "I know neither Python nor Java."]) {
    ok(check(req("skill", ["Python", "Java"]), [fact(text)]).status !== "met", text);
  }
});

Deno.test("guidance: a temporal cessation does not erase completed prior experience", () => {
  eq(check(req("experience", ["research", "real-world data"]), [fact("I haven't done research since I completed my 2024 thesis examining real-world data.")]).status, "met", "completed research survives a later cessation");
});

Deno.test("guidance: expired and explicitly ended clearances do not meet an active requirement", () => {
  const active = { ...req("clearance", ["Full Scope Poly"]), text: "An active Full Scope Poly clearance is required" };
  for (const text of ["My Full Scope Poly clearance expired in 2024.", "I held a Full Scope Poly clearance until 2024.", "My expired Full Scope Poly clearance was issued in 2020."]) {
    ok(check(active, [fact(text)], NOW).status !== "met", text);
    ok(check({ ...active, any: ["Full Scope Poly clearance"] }, [fact(text)], NOW).status !== "met", `full qualification phrase: ${text}`);
  }
});

Deno.test("guidance: current clearance survives an unrelated expired credential", () => {
  const active = { ...req("clearance", ["Full Scope Poly"]), text: "An active Full Scope Poly clearance is required" };
  for (const text of ["I hold an active Full Scope Poly clearance.", "My safety training expired, but I hold an active Full Scope Poly clearance.", "I hold an active Full Scope Poly clearance valid until 2028."]) {
    eq(check(active, [fact(text)], NOW).status, "met", text);
  }
});

const activeClearance = { ...req("clearance", ["Orion clearance"]), text: "A current Orion clearance is required" };
Deno.test("guidance: historical possession asks for current validity instead of qualifying", () => {
  const text = "I held an Orion clearance in 2021.";
  eq(check(activeClearance, [fact(text)], NOW).status, "unknown", "past possession does not establish current validity");
  eq(check({ ...activeClearance, text: "Prior Orion clearance experience is relevant" }, [fact(text)], NOW).status, "met", "prior experience remains usable");
});

Deno.test("guidance: exact clearance dates are compared to the supplied turn day", () => {
  for (const [date, expected] of [["2026-02-01", "unmet"], ["2026-12-01", "met"]]) {
    eq(check(activeClearance, [fact(`I hold an Orion clearance valid until ${date}.`)], NOW).status, expected, date);
  }
  eq(check(activeClearance, [fact("My Orion clearance expires on 2025-12-31.")], NOW).status, "unmet", "scheduled expiry is evaluated against this turn");
});

Deno.test("guidance: ambiguous or invalid clearance dates require clarification", () => {
  for (const date of ["03/04/2026", "2026-02-30", "2026-13-01", "2026"]) {
    eq(check(activeClearance, [fact(`I hold an active Orion clearance valid until ${date}.`)], NOW).status, "unknown", `do not infer validity from ${date}`);
  }
  eq(check(activeClearance, [fact("I hold an active Orion clearance valid through 2026-10.")], Date.UTC(2026, 9, 1, 12)).status, "unknown", "a month alone does not invent a first-day expiry time");
  eq(check(activeClearance, [fact("I hold an active Orion clearance valid through 2026.")], Date.UTC(2026, 0, 1, 12)).status, "unknown", "a year alone does not invent a first-day expiry time");
});

Deno.test("guidance: expiry attaches to the clearance noun phrase rather than another credential", () => {
  eq(check(activeClearance, [fact("My training expired before my current Orion clearance was renewed.")], NOW).status, "met", "the current clearance was not the expired training");
  eq(check(activeClearance, [fact("My expired Orion clearance was renewed in 2021.")], NOW).status, "unmet", "expired modifier on the clearance still counts");
});

Deno.test("guidance: clearance validity uses the turn clock across domain and tool boundaries", async () => {
  const text = "I hold an active Full Scope Poly clearance valid until 2028.";
  const tool = careerTools({ postings: async () => [] }).find((t) => t.name === "career_path_answer")!;
  for (const [year, expected] of [[2023, "met"], [2030, "unmet"]] as const) {
    const now = Date.UTC(year, 9, 21), state = { profile: { id: "SYN-PROFILE", basics: {}, preferences: {}, constraints: {}, facts: [{ ...fact(text), kind: "experience", status: "confirmed", needs_confirmation: false }] } };
    const r: any = await tool.run({ firm: "Palantir", role: "intel" }, { userId: "SYN-OWNER", threadId: "SYN-THREAD", now, state });
    eq(r.moves.find((m: any) => m.requirement.id === "palantir-r4")?.status, expected, `tool clock ${year}`);
  }
});
