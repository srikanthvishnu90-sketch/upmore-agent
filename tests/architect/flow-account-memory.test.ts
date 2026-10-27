// FEATURE 9 (DIAGNOSIS-2026-10-25 2.6, 2.7, fix F5): Trainee remembers the person across threads, through the REAL
// handler (handleChat, supabase/functions/agent-chat/handler-career.ts) on real Postgres (CI's migration order) with the
// real supabase-js client; the only seam is the HTTP hop to the Supabase project (tests/flow/postgrest.ts).
//
//   (1) A resume confirmed, an application logged, facts stated and a standing need said in thread A are all known in a
//       new thread B: the tracker, "what do you know about me" (resume entries, stated facts, the standing need), and the
//       account record itself. Each stated fact carries a fact_confirmed event with the person's own message's hash.
//   (2) "forget my career profile" forgets all of it: a new thread afterwards knows none of it.
//   (3) Two threads that loaded the same account version: the first commit wins, the second is refused (409, nothing
//       new started, nothing written) and its retry adds to the record instead of overwriting it.
//
// CAREER_ACCOUNT_MEMORY=on is set here, as the owner sets it after applying the migration.
// Run: the gate runs it with CI=true (a missing Postgres throws). Where esm.sh is unreachable, add
// --import-map=tests/flow/supabase-npm.json (the same supabase-js 2.117.1 from npm).
import assertNode from "node:assert/strict";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, type Chat, SUPABASE_URL, supabaseParity } from "../flow/handler.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const CI = Deno.env.get("CI") === "true";
const RESUME = await Deno.readTextFile(`${ROOT}/packages/career-data/fixtures/test-resume.txt`);
const PEOPLE: Record<string, string> = {
  "tok-m1": "7b0f8f8e-6a43-4a49-9d2c-0000000009a1",
  "tok-m2": "7b0f8f8e-6a43-4a49-9d2c-0000000009a2",
  "tok-m3": "7b0f8f8e-6a43-4a49-9d2c-0000000009a3",
};

let pg: Pg | null = null, handler: Awaited<ReturnType<typeof careerHandler>> | null = null;
async function world() {
  if (handler) return { pg: pg!, handler };
  pg = await startPg();
  await supabaseParity(pg);
  for (const id of Object.values(PEOPLE)) {
    await pg.sql(`insert into auth.users (id, email) values ('${id}', '${id}@example.test'); insert into public.profiles (id) values ('${id}');
      insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');`);
  }
  // The owner's switch, on once migration 20261026090009 is applied (the flow's database has it).
  Deno.env.set("CAREER_ACCOUNT_MEMORY", "on");
  handler = await careerHandler(pg, PEOPLE);
  return { pg, handler };
}
const skip = () => {
  if (pgBinDir()) return false;
  if (CI) throw Error("the account memory flow needs Postgres 16 in CI");
  console.log("NOT_RUN locally: no Postgres binaries");
  return true;
};
const say = async (c: Chat, m: string) => { const r = await c.say(m); eq(r.status, 200, `${m}: ${r.status} ${r.reply}`); return r; };
const account = async (person: string) => JSON.parse(await pg!.sql(`select coalesce(value, 'null') from public.career_watch_kv where user_id = '${person}' and key = 'career:account'`) || "null");
const num = async (q: string) => Number(await pg!.sql(q));

Deno.test({ name: "account memory (1): a resume, a tracker row, stated facts and a standing need from thread A are known in a new thread B", sanitizeResources: false, sanitizeOps: false, async fn() {
  if (skip()) return;
  const { handler } = await world();
  const person = PEOPLE["tok-m1"], a = handler.chat("tok-m1");
  await say(a, `here is my resume:\n${RESUME}`);
  const yes = await say(a, "yes, that's my resume");
  assert(/confirmed/i.test(yes.reply), yes.reply);
  const confirmed = await num(`select count(*) from public.career_events where user_id = '${person}' and kind = 'fact_confirmed' and detail->'upload'->>'ref' like 'agent_messages:%'`);
  assert(confirmed > 0, "the resume's entries are confirmed with their events");
  const logged = await say(a, "I applied to Stripe for the software engineering intern role");
  assert(/Added to your tracker: Stripe/.test(logged.reply), logged.reply);
  const stated = await say(a, "I am a junior majoring in computer science");
  assert(/junior/.test(stated.reply), stated.reply);
  // The stated facts carry provenance: one event each, bound to the message they were said in.
  const statedEvents = JSON.parse(await pg!.sql(`select coalesce(json_agg(detail order by id), '[]') from public.career_events where user_id = '${person}' and kind = 'fact_confirmed' and detail->>'via' = 'router: stated by the person in chat'`));
  eq(statedEvents.map((d: any) => d.kind).sort(), ["majors", "year"], JSON.stringify(statedEvents));
  const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("I am a junior majoring in computer science")))).map((b) => b.toString(16).padStart(2, "0")).join("");
  assert(statedEvents.every((d: any) => d.message_sha256 === sha && d.thread_id === a.thread()), "each event names the message and thread it was said in");
  const acct = await account(person);
  assert((acct.stated_facts?.facts ?? []).every((f: any) => typeof f.confirmation_event_id === "string" && /owner stated in chat/.test(f.provenance)), JSON.stringify(acct.stated_facts));
  const kept = await say(a, "never send me staffing agencies");
  assert(/^Kept on your account for every conversation: "Never send me staffing agencies"/.test(kept.reply), kept.reply);
  eq(await pg!.sql(`select value->'items'->0->>'said' from public.career_watch_kv where user_id = '${person}' and key = 'career:standing'`),
    "never send me staffing agencies", "the standing need is kept on the account, in their words");
  eq(await num(`select count(*) from public.career_events where user_id = '${person}' and kind = 'instruction_kept'`), 1, "with its event");

  // The account record holds the person's profile and tracker; thread A keeps only its frames beside a copy.
  const mem = (await account(person)).memory;
  eq((mem?.profile?.facts ?? []).filter((f: any) => f.status === "confirmed" && f.confirmation_event_id).length, confirmed, "the confirmed entries are on the account, with their events");
  eq((mem?.tracker?.rows ?? []).map((r: any) => r.company), ["Stripe"], "the tracker is on the account");
  assert(!("_careerThread" in (mem?.tracker ?? {})), "no thread frame on the account");

  // A new thread: B knows the tracker, the resume, the stated facts and the standing need.
  const b = handler.chat("tok-m1");
  const track = await say(b, "what does my tracker look like");
  assert(b.thread() && b.thread() !== a.thread(), "a second thread");
  assert(/Stripe/.test(track.reply) && !/no applications/i.test(track.reply), `thread B reads the tracker logged in thread A: ${track.reply}`);
  const known = await say(b, "what do you know about me");
  assert(/junior/.test(known.reply) && /computer science/.test(known.reply), `stated facts: ${known.reply}`);
  assert(new RegExp(`From your resume: ${confirmed} confirmed entries`).test(known.reply), `resume entries: ${known.reply}`);
  assert(/Your tracker: 1 application \(Stripe/.test(known.reply), `tracker: ${known.reply}`);
  assert(/Standing instructions you gave me: "Never send me staffing agencies"/.test(known.reply), `standing need: ${known.reply}`);
  // Thread B's own state carries the person's confirmed facts (what the executor and extension read).
  eq(await num(`select jsonb_array_length(coalesce(state#>'{career,stores,profile,facts}', '[]')) from public.agent_flow_state where thread_id = '${b.thread()}'`),
    (mem?.profile?.facts ?? []).length, "thread B's copy of the profile is the account's");
} });

Deno.test({ name: "account memory (2): forget my career profile forgets the profile, tracker, stated facts and standing needs in every thread", sanitizeResources: false, sanitizeOps: false, async fn() {
  if (skip()) return;
  const { handler } = await world();
  const person = PEOPLE["tok-m2"], a = handler.chat("tok-m2");
  await say(a, `here is my resume:\n${RESUME}`);
  await say(a, "yes, that's my resume");
  await say(a, "I applied to Stripe for the software engineering intern role");
  await say(a, "I am a junior majoring in computer science");
  await say(a, "never send me staffing agencies");
  assert((await account(person)).memory?.tracker?.rows?.length === 1, "precondition: the account holds the tracker");
  const erased = await say(a, "forget my career profile");
  assert(/removed your saved career profile/.test(erased.reply), erased.reply);
  const acct = await account(person);
  assert(!acct.memory && !acct.stated_facts, `the account holds no memory: ${JSON.stringify(acct)}`);
  eq(await num(`select count(*) from public.career_watch_kv where user_id = '${person}' and key = 'career:standing'`), 0, "no standing need");
  const c = handler.chat("tok-m2");
  await say(c, "resume career work");
  const track = await say(c, "what does my tracker look like");
  assert(!/Stripe/.test(track.reply), `a new thread after the erase has no tracker: ${track.reply}`);
  const known = await say(c, "what do you know about me");
  assert(!/junior|computer science|From your resume|Your tracker|staffing/i.test(known.reply), `nothing is remembered: ${known.reply}`);
} });

Deno.test({ name: "account memory (3): two threads from the same account version: the second commit is refused, its retry adds to the record", sanitizeResources: false, sanitizeOps: false, async fn() {
  if (skip()) return;
  const { handler } = await world();
  const person = PEOPLE["tok-m3"], a = handler.chat("tok-m3"), b = handler.chat("tok-m3");
  await say(a, "I applied to Stripe for the software engineering intern role");
  await say(b, "I applied to Figma for the product design intern role");
  eq(((await account(person)).memory?.tracker?.rows ?? []).map((r: any) => r.company), ["Stripe", "Figma"], "both threads add to the one tracker");
  // Hold thread A's commit until thread B's turn has loaded and committed: A's load is then a version behind.
  const inner = globalThis.fetch;
  let release!: () => void, reached!: () => void;
  const gate = new Promise<void>((r) => release = r), atCommit = new Promise<void>((r) => reached = r);
  let held = false;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!held && url.startsWith(SUPABASE_URL) && url.includes("/rpc/career_host_commit")) { held = true; reached(); await gate; }
    return inner(input as any, init);
  }) as typeof fetch;
  try {
    const first = a.say("I applied to Notion for the data analyst intern role");
    await atCommit;
    const second = await b.say("I applied to Ramp for the finance intern role");
    eq(second.status, 200, second.reply);
    release();
    const late = await first;
    eq(late.status, 409, `the stale commit is refused: ${late.status} ${late.reply}`);
    // The refused turn says plainly that nothing from it was saved or started (CONFLICT_REPLY); the rows below prove it is true.
    assert(/nothing from this message was saved or started/.test(late.reply), late.reply);
  } finally { globalThis.fetch = inner; }
  eq(((await account(person)).memory?.tracker?.rows ?? []).map((r: any) => r.company), ["Stripe", "Figma", "Ramp"], "the refused turn wrote nothing");
  eq(await num(`select count(*) from public.agent_messages where content = 'I applied to Notion for the data analyst intern role'`), 0, "its messages were not stored");
  const retry = await say(a, "I applied to Notion for the data analyst intern role");
  assert(/Added to your tracker: Notion/.test(retry.reply), retry.reply);
  eq(((await account(person)).memory?.tracker?.rows ?? []).map((r: any) => r.company), ["Stripe", "Figma", "Ramp", "Notion"], "the retry adds to the record the other thread wrote");
  await handler.restore();
  Deno.env.delete("CAREER_ACCOUNT_MEMORY");
  await pg!.stop();
} });
