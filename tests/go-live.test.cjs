// scripts/launch/go-live.sh in dry-run mode: the plan, in order, with nothing touched and no secret printed.
// Check: node --test tests/go-live.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const run=env=>execFileSync('bash',[path.join(root,'scripts/launch/go-live.sh')],{cwd:root,encoding:'utf8',env:Object.assign({PATH:process.env.PATH,HOME:process.env.HOME||'/tmp'},{GO_LIVE_DRY_RUN:'1'},env||{})});

test('dry run: preflight, migrations in one transaction, deploys with the callback public, smoke, gauntlet, rollback, in that order',()=>{
  const out=run();
  const order=['== 0. preflight','== 1. migrations','DRY: bash scripts/launch/apply-rails-and-seed.sh --all','== 2. secrets','== 3. deploy','DRY: supabase functions deploy agent-chat --project-ref mrwngntwmnaqrqhupvlt','DRY: supabase functions deploy broker-oauth-start --project-ref mrwngntwmnaqrqhupvlt','DRY: supabase functions deploy broker-oauth-callback --project-ref mrwngntwmnaqrqhupvlt --no-verify-jwt','== 4. smoke','== 5. live gauntlet','== 6. rollback'];
  let at=-1;for(const step of order){const i=out.indexOf(step);assert.ok(i>at,`${step} comes next`);at=i;}
  assert.match(out,/skipped: no Alpaca OAuth pair given; Connect will say it isn't switched on yet/);
  assert.doesNotMatch(out,/supabase db push/,'never a replay of all 59 migrations');
});

test('dry run with the Alpaca pair: the secret values are never printed',()=>{
  const out=run({ALPACA_OAUTH_CLIENT_ID:'cid-should-not-print',ALPACA_OAUTH_CLIENT_SECRET:'secret-should-not-print'});
  assert.match(out,/supabase secrets set --project-ref mrwngntwmnaqrqhupvlt --env-file/);
  assert.doesNotMatch(out,/should-not-print/);
});
