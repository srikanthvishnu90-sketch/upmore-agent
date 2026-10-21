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
