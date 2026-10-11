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
