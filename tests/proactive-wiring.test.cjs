// The agent speaks first (capability list section 2): the chat handler hears settings commands after the safety guards
// and before the money flows; the scheduler function exists, is type-checked in CI and is deployed and scheduled by
// go-live. Behaviour is tested in tests/edge/proactive.test.ts and tests/db/proactive.test.sql.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('chat handler: settings commands run after the safety guards and before the flow router, with no model call',()=>{
  const h=read('supabase/functions/agent-chat/handler.ts');
  const guard=h.indexOf('if (earlyGuard)'),offer=h.indexOf('if (mayAnswerOffer(message))'),settings=h.indexOf('await settingsMessage(message, supabaseSettingsDb(supabase, user.id)'),flows=h.indexOf('flow = await routeFlows(');
  assert.ok(guard>0&&offer>guard&&settings>offer&&flows>settings,'guards, then the answer to an offer, then settings, then flows');
  assert.ok(h.includes('liveCard: async () => { try { return hasLiveCard(await flowDb.loadState()); } catch { return true; } }'),'an unreadable flow state counts as a live card: the offer never steals a card\'s yes');
  assert.match(h,/import \{ settingsMessage, supabaseSettingsDb, mayAnswerOffer, readOffer, offerMessage, supabaseOfferDeps \} from "\.\.\/_shared\/proactive\.ts";/);
});
test('scheduler: the function exists, CI type-checks it, go-live deploys and schedules it',()=>{
  assert.match(read('supabase/functions/agent-proactive/index.ts'),/handleProactive\(req, \{ env: Deno\.env, store: supabaseProactiveStore\(/);
  assert.match(read('.github/workflows/ci.yml'),/deno check [^\n]*supabase\/functions\/agent-proactive\/index\.ts/);
  const g=read('scripts/launch/go-live.sh');assert.match(g,/deploy agent-proactive --project-ref "\$REF" --no-verify-jwt/);assert.match(g,/schedule-proactive\.sql/);
});
