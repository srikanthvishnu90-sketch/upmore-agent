// JOIN-1215: the submission cases that need the router's replies to change (Muse's lane, SPLIT-1146), through the
// production agent-chat handler on a real Postgres, as tests/architect/handler-submit-path.test.ts runs it. PENDING:
// excluded from the gate (tests/architect/pending) and expected RED until the router renders:
//   (c)  a sponsorship statement from a person with no profile: no "saved" unless the profile was written, and no
//        "prepared packet" when none exists. At 49364988 the reply says "Correction noted — I am not calling it saved"
//        (good) and then "The prepared packet built on the old answer is invalid now and will not be submitted" when the
//        person has no packet.
// (a1) and (a3) moved to tests/architect/handler-submit-path.test.ts once the router showed the entries (e0aad64b).
// Move this file out of pending/ once it is green on the joined head; never weaken an assertion to get there.
import assertNode from "node:assert/strict";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, supabaseParity } from "../flow/handler.ts";
import { storedProfile, trustedProfile } from "../../workers/career-browser/prepare-ahead.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const RESUME = await Deno.readTextFile(`${ROOT}/packages/career-data/fixtures/test-resume.txt`);
const PEOPLE: Record<string, string> = { "tok-r3": "7b0f8f8e-6a43-4a49-9d2c-00000000e003" };
const words = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

let pg: Pg | null = null, handler: Awaited<ReturnType<typeof careerHandler>> | null = null;
async function world() {
  if (handler) return handler;
  pg = await startPg();
  await supabaseParity(pg);
  for (const id of Object.values(PEOPLE)) {
    await pg.sql(`insert into auth.users (id, email) values ('${id}', '${id}@example.test'); insert into public.profiles (id) values ('${id}');
      insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');`);
  }
  return handler = await careerHandler(pg, PEOPLE);
}
const draftsOf = async (person: string) =>
  JSON.parse(await pg!.sql(`select coalesce(state->'career'->'stores'->'profile'->'facts', '[]') from public.agent_flow_state where user_id = '${person}' order by updated_at desc limit 1`));

Deno.test({ name: "router (c): a sponsorship statement claims no save it did not make and no packet that does not exist", sanitizeResources: false, sanitizeOps: false, async fn() {
  if (!pgBinDir()) throw Error("needs Postgres 16");
  const h = await world(), chat = h.chat("tok-r3");
  const r = await chat.say("I'm a US citizen, I don't need sponsorship");
  assert(r.status === 200, r.reply);
  assert(!/prepared packet/i.test(r.reply), `no packet exists: ${r.reply}`);
  const profile = await storedProfile(pg!.asService())(PEOPLE["tok-r3"]);
  if (profile?.constraints?.needsSponsorship !== false) assert(!/\bsaved\b/i.test(r.reply.replace(/not calling it saved/i, "")), `nothing was saved: ${r.reply}`);
} });

Deno.test({ name: "router: teardown", sanitizeResources: false, sanitizeOps: false, async fn() {
  handler?.restore();
  if (pg) await pg.stop();
} });
