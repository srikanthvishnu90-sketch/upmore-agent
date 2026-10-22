import { mockTurn, MOCK_INTENT, type MockState, type MockStore } from "../supabase/functions/_shared/career_mock.ts";

const T = Date.parse("2026-10-22T12:00:00Z");
function equal(a: unknown, b: unknown, reason = "") {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${reason}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
function world() {
  let state: MockState | null = null;
  let last: string | null = null;
  let turn = 0;
  const store: MockStore = {
    get: async () => structuredClone(state),
    save: async (_u, _t, value) => { state = structuredClone(value); },
    clear: async () => { state = null; },
    lastAssistantIntent: async () => last,
  };
  return {
    state: () => structuredClone(state),
    async say(message: string) {
      const result = await mockTurn({ message, userId: "synthetic-f004", threadId: "synthetic-old", now: T + ++turn * 1000, store });
      last = result?.intent || "career_goal_record";
      return result;
    },
  };
}

for (const text of [
  "My career goal is a data analyst internship for summer 2027.",
  "I want a software engineering internship.",
  "I am aiming for a product design internship.",
  "I'm aiming for a healthcare operations role.",
]) Deno.test(`F004 live hook: own target reaches the downstream goal owner: ${text}`, async () => {
  const w = world();
  equal((await w.say("start a mock interview for synthetic backend engineer"))?.intent, MOCK_INTENT);
  const before = w.state();
  equal(await w.say(text), null, "the handler must continue to the goal owner");
  equal(w.state(), before, "the mock must not save a rubric score or advance its question");
});

for (const text of [
  "My answer: I want a software engineering internship.",
  "My answer: I built the fixture tracker. I want a software engineering internship.",
  "I built the synthetic tracker and reduced review time from ten minutes to five.",
  "If I want a software engineering internship, what should I do?",
  "My friend said, \"I want a software engineering internship.\"",
  "I want a software engineering internship?",
]) Deno.test(`F004 live control: contextual interview content stays an answer: ${text}`, async () => {
  const w = world(); await w.say("start a mock interview for synthetic backend engineer");
  equal((await w.say(text))?.status, "answered");
  equal(w.state()?.answers.length, 1);
});

Deno.test("F004 live control: discovery task already passes through without saving a mock answer", async () => {
  const w = world(); await w.say("start a mock interview for synthetic backend engineer");
  const before = w.state(); equal(await w.say("Find me software engineering internships."), null); equal(w.state(), before);
});
