// WO-107 (F3), found at the real handler: the person's tracker (what they told Trainee: "I applied to X") is saved by the
// commit (career_host_commit) at agent_flow_state.state -> career -> stores -> trackStore -> rows, the same shape the
// prepare-ahead SQL reads the profile from (state->'career'->'stores'->'profile'). The situation model (WO-100), the mail
// run's application read (WO-024) and the brief store (WO-034) selected state->career->trackStore->rows, a path that
// never exists, so none of them ever saw a tracker row in production. Every server-side reader of the tracker now names
// the saved path, and this pins them to the SQL that writes it.
import assertNode from "node:assert/strict";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const READERS = ["career_situation.ts", "career_mail_store.ts", "career_brief_store.ts", "career_standing.ts"];

Deno.test("every server-side reader of the tracker selects the path the commit writes", async () => {
  const commit = await Deno.readTextFile(`${ROOT}/supabase/migrations/20261021050000_career_brief_digest.sql`);
  assertNode.match(commit, /jsonb_build_object\('career',next_snapshot\)/, "the commit writes the snapshot under career");
  assertNode.match(commit, /'stores'/, "and the snapshot keeps its stores under 'stores'");
  const prepare = await Deno.readTextFile(`${ROOT}/supabase/migrations/20261025120000_career_apply_prepare_ahead.sql`);
  assertNode.match(prepare, /state->'career'->'stores'->'profile'/, "the prepare-ahead read uses the same shape");
  for (const f of READERS) {
    const src = await Deno.readTextFile(`${ROOT}/supabase/functions/_shared/${f}`);
    const selects = [...src.matchAll(/state->career(?:->[a-zA-Z_]+)*->trackStore->rows/g)].map((m) => m[0]);
    assertNode.ok(selects.length >= 1, `${f} reads the tracker from agent_flow_state`);
    for (const s of selects) assertNode.equal(s, "state->career->stores->trackStore->rows", `${f}: ${s}`);
  }
});
