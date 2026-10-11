// scripts/launch/go-live.sh in dry-run mode: the plan, in order, with nothing touched and no secret printed.
// Check: node --test tests/go-live.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const run=env=>execFileSync('bash',[path.join(root,'scripts/launch/go-live.sh')],{cwd:root,encoding:'utf8',env:Object.assign({PATH:process.env.PATH,HOME:process.env.HOME||'/tmp'},{GO_LIVE_DRY_RUN:'1'},env||{})});

test('dry run: preflight, only pending migrations (ledger), deploys incl. model-health, a live model call that stops the run when it fails, deploys with the callback public, smoke, gauntlet, rollback, in that order',()=>{
  const out=run();
  const order=['== 0. preflight','== 1. migrations','DRY: bash scripts/launch/apply-rails-and-seed.sh --pending','== 2. secrets','== 3. deploy','DRY: supabase functions deploy agent-chat --project-ref mrwngntwmnaqrqhupvlt','DRY: supabase functions deploy broker-oauth-start --project-ref mrwngntwmnaqrqhupvlt','DRY: supabase functions deploy broker-oauth-callback --project-ref mrwngntwmnaqrqhupvlt --no-verify-jwt','DRY: supabase functions deploy model-health --project-ref mrwngntwmnaqrqhupvlt --no-verify-jwt','== 4. smoke','GET model-health?probe=1','or STOP with the provider\'s error','== 5. live gauntlet','== 6. rollback'];
  let at=-1;for(const step of order){const i=out.indexOf(step);assert.ok(i>at,`${step} comes next`);at=i;}
  assert.match(out,/skipped: no Alpaca OAuth pair given; Connect will say it isn't switched on yet/);
  assert.doesNotMatch(out,/supabase db push/,'never a replay of all 59 migrations');
  // The agent speaks first: the scheduler is deployed public (its own secret), scheduled hourly from Vault, and smoke-tested.
  const p=['DRY: supabase functions deploy agent-proactive --project-ref mrwngntwmnaqrqhupvlt --no-verify-jwt','DRY: psql <SUPABASE_DB_URL> -v url=https://mrwngntwmnaqrqhupvlt.supabase.co/functions/v1/agent-proactive -f scripts/launch/schedule-proactive.sql','POST agent-proactive with no secret -> 401'];
  let j=out.indexOf('== 3. deploy');for(const step of p){const i=out.indexOf(step);assert.ok(i>j,`${step} comes next`);j=i;}
  const sql=require('node:fs').readFileSync(path.join(root,'scripts/launch/schedule-proactive.sql'),'utf8');
  assert.match(sql,/decrypted_secrets where name = 'upmore_proactive_secret'/,'the job reads the secret from Vault at call time');
  assert.match(sql,/cron\.unschedule\('upmore-proactive'\)/,'a re-run replaces the job instead of adding a second one');
});

test('dry run with the OpenAI key, the health token and the Alpaca pair: names only, the values are never printed',()=>{
  const out=run({ALPACA_OAUTH_CLIENT_ID:'cid-should-not-print',ALPACA_OAUTH_CLIENT_SECRET:'secret-should-not-print',OPENAI_API_KEY:'sk-proj-should-not-print',HEALTH_CHECK_TOKEN:'token-should-not-print-0123456789',PROACTIVE_SECRET:'proactive-should-not-print-0123456789',SUPABASE_DB_URL:'postgresql://u:dbpass-should-not-print@h/db'});
  assert.match(out,/supabase secrets set --project-ref mrwngntwmnaqrqhupvlt --env-file <0600 temp file: OPENAI_API_KEY MODEL_PROVIDER ALPACA_OAUTH_CLIENT_ID ALPACA_OAUTH_CLIENT_SECRET HEALTH_CHECK_TOKEN PROACTIVE_SECRET>/);
  assert.doesNotMatch(out,/should-not-print/);
});

test('dry run without an OpenAI key: an already-set secret is left alone, and a fresh run never replays applied migrations',()=>{
  const out=run({HOME:require('node:os').tmpdir()+'/upmore-go-live-test-home'});
  assert.match(out,/skipped: no OPENAI_API_KEY given \(an already-set secret stays as it is\)/);
  assert.match(out,/apply-rails-and-seed\.sh --pending/);assert.doesNotMatch(out,/--all/);
});
