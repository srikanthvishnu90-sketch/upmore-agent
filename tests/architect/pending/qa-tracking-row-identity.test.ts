// Review-only pending regressions. Entirely invented applications; no corpus, model, provider, DB, or network.
// Reproduce against immutable 1ec88f3cca4b21200be5c4f16ba2a948a72614b0. Product writer remains architect-owned.
import { careerTools } from "../../../supabase/functions/_shared/agent/career_tools.ts";
import { CareerTrack } from "../../../supabase/functions/_shared/router_core.career.js";
import { AskPerson } from "../../../supabase/functions/_shared/agent/loop.ts";
import { memoryEventStore } from "../../../supabase/functions/_shared/agent/timeline.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`); }
const NOW = Date.UTC(2030, 0, 2, 12);
const COMPANY = "Invented Lantern Loom";
function fixture(roles: string[]) {
  const store = CareerTrack.createMemoryStore([]);
  roles.forEach((role, index) => CareerTrack.addApplication(store, {
    app_id: `invented-app-${index + 1}`, company: COMPANY, role, stage: "Submitted",
    url: `https://invented.invalid/jobs/${index + 1}`, resume_version: `invented-resume-${index + 1}`,
    applied_at: "2030-01-01T12:00:00Z", source: "cold",
  }, { now: NOW }));
  const state = { trackStore: store }, events = memoryEventStore();
  const tool = careerTools({ postings: async () => [], events }).find((t) => t.name === "track_application")!;
  const context = (message: string) => ({ userId: "invented-user", threadId: "invented-thread", now: NOW, state, turn: { message, added: [] as string[] } });
  return { store, events, tool, context };
}
async function refusesWithoutMutation(f: ReturnType<typeof fixture>, input: Record<string, unknown>, message: string) {
  const before = JSON.stringify(f.store);
  let refused = false;
  try { await f.tool.run(input, f.context(message)); } catch (error) {
    refused = error instanceof AskPerson || /ask|which|ambiguous|not found|no application|unknown application/i.test(String((error as Error).message));
  }
  assert(refused, "ask the person which existing row they mean; never silently select or create a row");
  eq(JSON.stringify(f.store), before, "refusal changes no row or tracker event");
  eq(f.events.dump(), [], "refusal emits no status-change receipt");
}

Deno.test("tracking identity CONTROL: a new application receipt is the actual stored row", async () => {
  const f = fixture([]);
  const result: any = await f.tool.run({ company: COMPANY, role: "Paper Systems Engineer", stage: "Submitted" }, f.context(`I applied to ${COMPANY} as a Paper Systems Engineer.`));
  eq(f.store.rows.length, 1, "one row created");
  assert(result.application === f.store.rows[0], "receipt is the actual row");
  eq([result.application.company, result.application.role, result.application.stage], [COMPANY, "Paper Systems Engineer", "Submitted"], "stated fields kept");
});

Deno.test("tracking identity CONTROL: unique-company stage update preserves role and row id", async () => {
  const f = fixture(["Paper Systems Engineer"]);
  const result: any = await f.tool.run({ company: COMPANY, stage: "Interview" }, f.context(`${COMPANY} invited me to interview.`));
  eq([f.store.rows.length, result.application.app_id, result.application.role, result.application.stage], [1, "invented-app-1", "Paper Systems Engineer", "Interview rounds"], "existing behavior preserved");
  eq(f.store.rows[0].events.at(-1).source, "user-reported", "user provenance preserved");
});

Deno.test("tracking identity PENDING: schema exposes the existing row app_id selector", () => {
  const f = fixture([]);
  assert("app_id" in f.tool.input_schema.properties, "the model must be able to select the app_id that list_applications returned");
});

Deno.test("tracking identity PENDING: explicit existing-row role correction changes the permitted field", async () => {
  const f = fixture(["Paper Systems Engineer"]);
  const result: any = await f.tool.run({ app_id: "invented-app-1", company: COMPANY, role: "Ribbon Infrastructure Engineer", stage: "Submitted" }, f.context(`Correct application invented-app-1: my role at ${COMPANY} is Ribbon Infrastructure Engineer, not Paper Systems Engineer.`));
  eq(f.store.rows.length, 1, "correction creates no second application");
  eq(f.store.rows[0].role, "Ribbon Infrastructure Engineer", "role correction must reach the selected persisted row");
  assert(result.application === f.store.rows[0], "receipt comes from the persisted row");
  eq(result.application.role, "Ribbon Infrastructure Engineer", "receipt verifies the requested correction");
  const unique = fixture(["Paper Systems Engineer"]);
  const uniqueResult: any = await unique.tool.run({ company: COMPANY, role: "Ribbon Infrastructure Engineer", stage: "Submitted" }, unique.context(`Correct my only application at ${COMPANY}: my role is Ribbon Infrastructure Engineer.`));
  eq(unique.store.rows[0].role, "Ribbon Infrastructure Engineer", "an explicitly requested role correction on one existing row is allowed");
  assert(uniqueResult.application === unique.store.rows[0], "unique-row correction receipt is actual row");
});

Deno.test("tracking identity PENDING: explicit app_id targets the second same-company application", async () => {
  const f = fixture(["Paper Systems Engineer", "Ribbon Infrastructure Engineer"]);
  const beforeFirst = JSON.stringify(f.store.rows[0]);
  const result: any = await f.tool.run({ app_id: "invented-app-2", company: COMPANY, stage: "Offer" }, f.context(`Application invented-app-2, Ribbon Infrastructure Engineer at ${COMPANY}, received an offer.`));
  eq(result.application.app_id, "invented-app-2", "receipt identifies selected row");
  eq(f.store.rows[1].stage, "Offer", "second application updated");
  eq(JSON.stringify(f.store.rows[0]), beforeFirst, "first same-company application unchanged");
  assert(result.application === f.store.rows[1], "receipt is selected actual row");
});

Deno.test("tracking identity PENDING: company-only ambiguity asks before any write", async () => {
  const f = fixture(["Paper Systems Engineer", "Ribbon Infrastructure Engineer"]);
  await refusesWithoutMutation(f, { company: COMPANY, stage: "Offer" }, `${COMPANY} sent an offer.`);
});

Deno.test("tracking identity PENDING: unknown or mismatched explicit app_id cannot fall back to company", async () => {
  const f = fixture(["Paper Systems Engineer"]);
  await refusesWithoutMutation(f, { app_id: "invented-app-missing", company: COMPANY, stage: "Rejected" }, `Update application invented-app-missing at ${COMPANY} to rejected.`);
  const mismatch = fixture(["Paper Systems Engineer"]);
  await refusesWithoutMutation(mismatch, { app_id: "invented-app-1", company: "Invented Amber Kites", stage: "Rejected" }, "Update invented-app-1 at Invented Amber Kites to rejected.");
  const duplicate = fixture(["Paper Systems Engineer", "Ribbon Infrastructure Engineer"]);
  duplicate.store.rows[1].app_id = "invented-app-1";
  await refusesWithoutMutation(duplicate, { app_id: "invented-app-1", company: COMPANY, stage: "Offer" }, `Application invented-app-1 at ${COMPANY} received an offer.`);
});

Deno.test("tracking identity CONTROL: extra fields cannot rewrite row identity or provenance", async () => {
  const f = fixture(["Paper Systems Engineer"]), row = f.store.rows[0];
  const protectedBefore = [row.app_id, row.company, row.url, row.applied_at, row.resume_version, row.source];
  await f.tool.run({ app_id: row.app_id, company: COMPANY, stage: "Interview", url: "https://replacement.invalid", applied_at: "2040-01-01T00:00:00Z", resume_version: "replacement", source: "referred", events: [] }, f.context(`${COMPANY} invited me to interview.`));
  eq([row.app_id, row.company, row.url, row.applied_at, row.resume_version, row.source], protectedBefore, "only permitted update fields change");
  eq(row.events.length, 2, "event history appended, never replaced");
});

Deno.test("tracking identity CONTROL: stated next-step time is kept on actual row", async () => {
  const f = fixture(["Paper Systems Engineer"]);
  const result: any = await f.tool.run({ company: COMPANY, stage: "Interview", when: "Tuesday 2pm" }, f.context(`${COMPANY} interviews me Tuesday 2pm.`));
  eq(f.store.rows[0].next_when, "Tuesday 2pm", "person's time kept");
  assert(result.application === f.store.rows[0], "time receipt is persisted row");
});

Deno.test("tracking identity CONTROL: unstated next-step time cannot be saved", async () => {
  const f = fixture(["Paper Systems Engineer"]);
  const result: any = await f.tool.run({ company: COMPANY, stage: "Interview", when: "Tuesday 2pm" }, f.context(`${COMPANY} invited me to interview.`));
  assert(!f.store.rows[0].next_when, "time cannot be invented");
  assert(result.when_not_kept, "receipt states omitted time");
});
