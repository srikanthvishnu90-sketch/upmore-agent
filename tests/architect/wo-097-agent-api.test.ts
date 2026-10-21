// WO-097 (architect): the trust model of the agent API, held in the code that ships. The person grants (their own
// session mints and revokes; only the token's hash is stored); the agent reads only confirmed data and submits only what
// the person approved (every agent door is keyed by the token's hash, never a user id, and none of them can approve,
// enqueue, answer a question or write a fact). The behaviour is proven in tests/db/trainee_agent_api.test.sql and
// tests/edge/trainee-agent-api.test.ts; this file pins the shape so a later change cannot quietly widen it.
import { TOOLS } from "../../supabase/functions/_shared/trainee_agent_api.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (p: string) => Deno.readTextFileSync(new URL(p, ROOT));
function ok(c: unknown, m: string) { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }

const MIG = "supabase/migrations/20261023090700_trainee_agent_api.sql";
const sql = read(MIG);
// Each function's text, from its create to its end $$.
const fns = new Map<string, { args: string; body: string }>();
for (const m of sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)([\s\S]*?)\n(?:end )?\$\$;/g)) fns.set(m[1], { args: m[2], body: m[3] });
const DOORS = ["trainee_agent_get_profile", "trainee_agent_get_saved_answers", "trainee_agent_get_resume", "trainee_agent_resume_download",
  "trainee_agent_list_approved", "trainee_agent_begin_submission", "trainee_agent_report_submission"];

Deno.test("WO-097/A every agent door is keyed by the token's hash (or the signed link's grant), never by a user id", () => {
  for (const d of DOORS) {
    const f = fns.get(d);
    ok(f, `${d} is defined in ${MIG}`);
    ok(/^p_token_hash text|^p_grant uuid/.test(f!.args), `${d} takes the token hash or the grant first: (${f!.args})`);
    ok(!/p_user\b/.test(f!.args), `${d} takes no user id`);
    ok(/trainee_agent_enter(_grant)?\(/.test(f!.body), `${d} goes through the gate (revocation, scope, rate, audit) first`);
  }
});

Deno.test("WO-097/B no agent door approves, enqueues, prepares, answers or writes a fact (D-007)", () => {
  const forbidden = /career_apply_enqueue|career_apply_card_answer|career_apply_prepare|career_apply_extension_begin|career_apply_question_answer|questions_answer_from_form|career_host_commit|career_watch_write|insert into public\.career_apply_jobs|update public\.career_apply_questions|agent_flow_state set/;
  for (const d of DOORS) ok(!forbidden.test(fns.get(d)!.body), `${d} must not create an approval or change a fact`);
  // The only writes to career_apply_jobs are the claim and the finish of an approved row, by its approved hash.
  ok(/p_payload_hash is distinct from j\.payload_hash/.test(fns.get("trainee_agent_begin_submission")!.body), "begin checks the approved hash");
  ok(/p_payload_hash is distinct from j\.payload_hash/.test(fns.get("trainee_agent_report_submission")!.body), "report checks the approved hash");
  ok(/career_apply_current\(/.test(fns.get("trainee_agent_begin_submission")!.body), "begin needs a current approval");
  ok(/career_apply_current\(/.test(fns.get("trainee_agent_list_approved")!.body), "the list shows current approvals only");
  ok(/needs_confirmation/.test(fns.get("trainee_agent_get_profile")!.body), "the profile filters out facts waiting for confirmation");
  // Never LinkedIn or Indeed (owner rule): one host rule, applied to the list and to the claim.
  ok(fns.has("trainee_agent_host_forbidden"), "the host rule is defined once, in SQL");
  ok(/trainee_agent_job_forbidden\(/.test(fns.get("trainee_agent_list_approved")!.body), "the list leaves out LinkedIn and Indeed");
  ok(/trainee_agent_job_forbidden\([\s\S]*'forbidden_host'/.test(fns.get("trainee_agent_begin_submission")!.body), "the claim refuses them");
});

Deno.test("WO-097/C only the hash is stored; the person mints and revokes; the agent doors are the service role's only", () => {
  ok(/token_hash text not null unique check \(token_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/.test(sql), "the grant stores a SHA-256 hex");
  ok(!/\n\s+token text/.test(sql), "no column holds a raw token");
  ok(/u uuid := auth\.uid\(\)/.test(fns.get("trainee_agent_grant_mint_own")!.body), "mint takes the person from the session");
  ok(/user_id = u/.test(fns.get("trainee_agent_grant_revoke_own")!.body), "revoke only the person's own grant");
  const stmts = sql.split(";").map((x) => x.trim()).filter((x) => x.startsWith("grant execute on function"));
  const grantSvc = stmts.filter((x) => x.endsWith("to service_role")).join("\n");
  const grantAuth = stmts.filter((x) => x.endsWith("to authenticated")).join("\n");
  for (const d of DOORS) ok(grantSvc.includes(`public.${d}(`) && !grantAuth.includes(`public.${d}(`), `${d}: service role only`);
  for (const o of ["trainee_agent_grant_mint_own", "trainee_agent_grant_revoke_own", "trainee_agent_grants_own", "trainee_agent_calls_own"]) {
    ok(grantAuth.includes(`public.${o}(`) && !grantSvc.includes(`public.${o}(`), `${o}: the signed-in person only`);
  }
  ok(/revoke all on public\.trainee_agent_grants, public\.trainee_agent_calls from public, anon, authenticated;/.test(sql), "nobody reads the tables directly");
});

Deno.test("WO-097/D the tools are the six operations of the order; it ships through the gate, the config and go-live", () => {
  eq(TOOLS.map((t) => t.name), ["get_profile", "get_saved_answers", "get_resume", "list_approved_applications", "begin_submission", "report_submission"]);
  const gate = read("scripts/gate.sh");
  ok(gate.includes("tests/edge/trainee-agent-api.test.ts") && gate.includes("supabase/functions/trainee-agent-api/index.ts"), "the gate runs the edge test and type-checks the entry");
  ok(/\[functions\.trainee-agent-api\]\nverify_jwt = false/.test(read("supabase/config.toml")), "an agent token is not a JWT; the handler checks it");
  const live = read("scripts/launch/trainee-go-live.sh");
  ok(live.includes("20261023090700_trainee_agent_api.sql") && live.includes("to_regclass('public.trainee_agent_grants') is not null"), "go-live applies the migration, with its mark");
  ok(/"\$\{CHANNEL_FNS\[@\]\}" trainee-agent-api; do/.test(live), "go-live deploys the function (the owner's run)");
  ok(read("tests/db/run.sh").includes("trainee_agent_api.test.sql"), "the database suite runs the order's test");
});
