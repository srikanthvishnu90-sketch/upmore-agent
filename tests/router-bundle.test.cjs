// The Deno chat handler imports the router and the three flows from a generated bundle; a stale bundle would run old
// code in production while the node tests pass on the new code. Check: node --test tests/router-bundle.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('supabase/functions/_shared/router_core.js is current with packages/domain and the registry',()=>{
  const r=spawnSync('python3',[path.join(root,'scripts/build-router-core.py'),'--check'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stdout+r.stderr);
});
test('the bundle loads as an ES module and exports the career seam modules and the reference JSON consts',async()=>{
  // Replay for the Gate 0 bundle defects: 130/141/143 travelled outside the bundle, PAYROLL_REF_JSON and
  // GOVERNMENT_JSON were exported but never defined (the bundle failed ESM linking in Node and Deno), and
  // 134-career-paths had an unguarded top-level require that broke ESM execution.
  const {pathToFileURL}=require('node:url');
  const m=await import(pathToFileURL(path.join(root,'supabase/functions/_shared/router_core.js')).href);
  for(const k of ['CareerOnboarding','CareerDoorstep','CareerContainment','CareerRouter']) assert.equal(typeof m[k],'object',k);
  assert.equal(typeof m.PAYROLL_REF_JSON,'object','PAYROLL_REF_JSON is defined');
  assert.equal(typeof m.GOVERNMENT_JSON,'object','GOVERNMENT_JSON is defined');
});
test('the handler routes flows ahead of the finance path and returns route data; a one-time code is never stored',()=>{
  const h=fs.readFileSync(path.join(root,'supabase/functions/agent-chat/handler.ts'),'utf8');
  const i=h.indexOf('await routeFlows(message'),j=h.indexOf('if (personalFinance) {');
  assert.ok(i>0&&j>i,'routeFlows runs before the personal finance path');
  assert.match(h,/return json\(cors, \{ thread_id: tid, reply: flow\.reply, action: null, route: flow\.route \}\)/);
  assert.match(h,/flow\.withhold_user_text \? "\[one-time code withheld\]" : userContent/);
  const f=fs.readFileSync(path.join(root,'supabase/functions/_shared/flow_router.ts'),'utf8');
  assert.match(f,/export const LIVE_PARTNERS: Record<string, unknown> = Object\.freeze\(\{\}\);/,'no rail can be configured to look live');
  assert.match(f,/tool_choice: \{ type: "tool", name: AgentRouter\.TOOL\.name \}/,'the model call is a forced tool call');
});
