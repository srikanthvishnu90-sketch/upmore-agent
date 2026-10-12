// The response-style corpus (corpus/, owner 2026-10-11) as the chat model's style layer: parsed completely, selected per
// message with the safety examples always in, rendered with the hard rules first, bundled into the edge functions and
// wired into the chat prompt. Check: node --test tests/style-corpus.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const S=require(path.join(root,'packages/domain/75-style-corpus.js'));
const C=require(path.join(root,'corpus/corpus.json'));

test('all 79 examples parse, with their file, turns and note; corpus.json is current with the .txt files',()=>{
  assert.match(execFileSync(process.execPath,[path.join(root,'scripts/build-style-corpus.cjs'),'--check']).toString(),/style corpus verified: 79 examples/);
  assert.equal(C.count,79);assert.equal(new Set(C.examples.map(e=>e.id)).size,79);
  assert.deepEqual([1,2,3,4,5].map(f=>C.examples.filter(e=>e.file===f).length),[15,15,16,16,17]);
  for(const e of C.examples)assert.ok(e.turns.some(t=>t.role==='assistant'),e.id);
  const e=C.examples.find(x=>x.id==='1.15');assert.deepEqual(e.turns.map(t=>t.role),['user','assistant','context','assistant']);assert.match(e.note,/nothing executed on silence/);assert.equal(e.has_card,true);
});

test('selection: the nearest examples for the message, the four safety examples always in, never more than ten',()=>{
  const pick=m=>S.select(C.examples,m).map(e=>e.id);
  for(const m of ['sned mom 100 rn','cancel netflix','should i buy apple','my dad passed','hi','']){const p=pick(m);assert.ok(p.length<=10,m);for(const id of S.SAFETY)assert.ok(p.includes(id),`${m}: ${id}`);}
  assert.equal(pick('sned mom 100 rn')[0],'1.06','a rushed, typo\'d send finds the rushed-send example');
  assert.equal(pick('cancel netflix')[0],'4.03');assert.equal(pick('should i buy apple')[0],'3.06');assert.equal(pick('my dad passed')[0],'5.10');
  assert.ok(pick('split dinner 80 with jake').slice(0,3).includes('2.01'));
});

test('the rendered block puts the hard rules above the examples and copies mannerisms, not words',()=>{
  const b=S.render(S.select(C.examples,'send mike 40'));
  assert.ok(b.indexOf('HARD RULES')===0);assert.ok(b.indexOf('STYLE EXAMPLES: copy the mannerisms, not the words')>b.indexOf('Never retry a money move'));
  for(const rule of ['Never invent balances','confirmation card','A yes covers only the latest card','Never retry a money move whose state is unknown','[price from tool]'])assert.ok(b.includes(rule),rule);
  assert.ok(b.includes('### 1.01 Pay a saved recipient, clean'));assert.ok(b.length<9000,`block is ${b.length} characters`);
});

test('bundled for the edge (STYLE_CORPUS_JSON, StyleCorpus) and wired into the chat and planner prompts per message',async()=>{
  const core=fs.readFileSync(path.join(root,'supabase/functions/_shared/router_core.js'),'utf8');
  assert.match(core,/const STYLE_CORPUS_JSON = \{"source":/);assert.match(core,/export \{[^}]*StyleCorpus, STYLE_CORPUS_JSON/);
  const h=fs.readFileSync(path.join(root,'supabase/functions/agent-chat/handler.ts'),'utf8');
  assert.match(h,/StyleCorpus\.render\(StyleCorpus\.select\(STYLE_CORPUS_JSON\.examples, message\)\)/);
  assert.ok(h.lastIndexOf('StyleCorpus.render')>h.indexOf('const systemDynamic'),'in the chat reply\'s per-message (uncached) block');
  assert.match(h,/plannerModel\([^\n]*style:StyleCorpus\.render\(StyleCorpus\.select\(STYLE_CORPUS_JSON\.examples,message\)\)/,'and in the financial planner\'s prompt');
});
