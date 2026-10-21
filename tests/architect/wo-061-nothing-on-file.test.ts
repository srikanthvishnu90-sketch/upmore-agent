// WO-061 fix (b) (owner, 2026-10-21: "when nothing is on file say so plainly instead of 'I can't read your account'").
// An account with nothing in it reads as nothing on file, and the eval harness gives the brain the situation production
// gives it (agent-chat reads it from the account every turn), so "could not be read" is never a harness artifact.
import { situationBlock, situationFrom } from "../../supabase/functions/_shared/career_situation.ts";

const EMPTY = { jobs: [], wanted: [], prepared: [], card: null, questions: [], outreach: [], mail_drafts: [], interviews: [], alerts: null, standing: [], threads: [], connections: [], cloud: null, channel: null, last_search: null, unreadable: [] };

Deno.test("WO-061/B1 an empty account's situation says none on file, in words the brain can repeat", () => {
  const b = situationBlock(situationFrom(EMPTY as any, Date.UTC(2026, 9, 21)));
  if (!/Tasks:\n- none on file: no applications/.test(b)) throw new Error(`the empty account does not say none on file:\n${b}`);
});

Deno.test("WO-061/B2 an account with an application does not say none on file", () => {
  const now = Date.UTC(2026, 9, 21);
  const b = situationBlock(situationFrom({ ...EMPTY, jobs: [{ id: "j1", job_id: "p1", company: "Acme", url: "https://example.com/j", state: "queued", reason: null, confirmation_id: null, created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(), title: "Analyst" }] } as any, now));
  if (/none on file/.test(b)) throw new Error("an account with a queued application says none on file");
});

Deno.test("WO-061/B3 the eval harness passes the agent a situation, as agent-chat does", async () => {
  const run = await Deno.readTextFile("evals/career/run.ts");
  if (!/situationFrom\(/.test(run) || !/known: \{ standing[\s\S]{0,200}?situation \}/.test(run)) throw new Error("the harness gives the agent no situation, so every records question meets 'could not be read'");
});
