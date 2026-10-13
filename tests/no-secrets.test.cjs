// No secrets in the repo, ever (CLAUDE.md). Found 2026-10-11: a test-user JWT committed in docs/claude-code-keys-checklist.md
// (public repo). This scans every tracked file on every run. The only JWT allowed is the Supabase anon key (role "anon",
// public by design, protected by RLS); test fixtures that look like keys must say they are fake.
// Check: node --test tests/no-secrets.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');

const PATTERNS=[
  ['jwt',/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['anthropic key',/sk-ant-[A-Za-z0-9_-]{20,}/g],
  ['openai key',/sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{40,}/g],
  ['aws key',/\bAKIA[0-9A-Z]{16}\b/g],
  ['github token',/\bgh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/g],
  ['slack token',/\bxox[baprs]-[A-Za-z0-9-]{10,}/g],
  ['supabase secret',/\bsbp_[a-f0-9]{30,}|\bsb_secret_[A-Za-z0-9_-]{20,}/g],
  ['stripe live key',/\b[rs]k_live_[A-Za-z0-9]{20,}/g],
  ['google key',/\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['private key',/-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['password in a URL',/\b(?:postgres(?:ql)?|mysql|https?):\/\/[^\s:@'"/]+:(?![^@\s]*[<{$])[^\s@'"/]{6,}@[A-Za-z0-9.-]+/g],
];
// A fixture is allowed only when it says it is fake.
const FAKE=/test|fake|dummy|example|should-never|should-not|placeholder|redacted|0000/i;
function jwtRole(t){try{return JSON.parse(Buffer.from(t.split('.')[1],'base64url').toString()).role||null;}catch(_){return null;}}
function findings(text,file){
  const out=[];
  for(const [kind,re] of PATTERNS){
    re.lastIndex=0;let m;
    while((m=re.exec(text))){
      const v=m[0];
      if(kind==='jwt'&&jwtRole(v)==='anon')continue;
      if(kind!=='jwt'&&kind!=='private key'&&FAKE.test(v))continue;
      out.push({file,kind,line:text.slice(0,m.index).split('\n').length,preview:v.slice(0,6)+'…'});
    }
  }
  return out;
}

test('the scanner itself catches each kind and lets the anon key and labelled fakes through',()=>{
  const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const user=`eyJhbGciOiJIUzI1NiJ9.${b({role:'authenticated',sub:'u'})}.c2lnbmF0dXJlLXNpZ25hdHVyZQ`;
  const anon=`eyJhbGciOiJIUzI1NiJ9.${b({role:'anon',ref:'x'})}.c2lnbmF0dXJlLXNpZ25hdHVyZQ`;
  const real='sk-proj-'+'Ab3Cd5Ef7Gh9Ij1Kl3Mn5Op7Qr9St1Uv';
  assert.equal(findings(`token: ${user}`,'x').length,1,'a user JWT is caught');
  assert.equal(findings(`const ANON = "${anon}"`,'x').length,0,'the anon key is public by design');
  assert.equal(findings(`key=${real}`,'x')[0].kind,'openai key');
  assert.equal(findings('const KEY="sk-proj-TESTKEY-should-never-appear-anywhere-0000"','x').length,0,'a labelled fake passes');
  assert.equal(findings('postgresql://postgres:'+'hunter2pass@db.acme-prod.co:5432/postgres','x').length,1,'a password in a URL is caught');
  assert.equal(findings("SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres'",'x').length,0,'a template is not a secret');
  assert.equal(findings('-----BEGIN RSA '+'PRIVATE KEY-----','x').length,1);
});

test('no tracked file holds a key, a user or service JWT, a private key or a password',()=>{
  const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean)
    .filter(f=>!/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip|gz)$/i.test(f));
  const hits=[];
  for(const f of files){
    let text;try{const st=fs.statSync(path.join(root,f));if(!st.isFile()||st.size>8e6)continue;text=fs.readFileSync(path.join(root,f),'utf8');}catch(_){continue;}
    hits.push(...findings(text,f));
  }
  assert.deepEqual(hits,[],`secrets in tracked files:\n${hits.map(h=>`${h.file}:${h.line} ${h.kind} ${h.preview}`).join('\n')}`);
});

test('control: the scanner still catches a real planted JWT, and the re-encoded fixtures still decode to live tripwires',()=>{
  // A real-shaped authenticated JWT, assembled from parts so this file
  // itself stays scanner-clean. If the patterns above are ever weakened,
  // this goes red.
  const planted=['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9','eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ','dozjgNryP4J3jVmNHl0w5N_XgL0n3AAA'].join('.');
  assert.equal(findings(`session token: ${planted}`,'control').filter(f=>f.kind==='jwt').length,1,'a real planted JWT is caught');
  // The Gate-0 hygiene fix (2026-10-13) re-encoded the planted fixture
  // JWTs in mutants.json (M-10) and tests/career-quality-grader.test.cjs
  // with one dot written as an escape, so raw text no longer matches.
  // The DECODED strings must still be full JWTs that this scanner catches —
  // otherwise the fixtures would silently stop tripping the grader's H-9.
  const mutants=JSON.parse(fs.readFileSync(path.join(root,'scripts/career/gauntlet/fixtures/mutants.json'),'utf8'));
  const m10=mutants.find(m=>m.id==='M-10');
  assert.ok(m10,'M-10 mutant exists');
  const msg=(m10.record.delivered_messages||[]).join(' ');
  assert.ok(findings(msg,'mutants.json').some(f=>f.kind==='jwt'),'M-10 still decodes to a JWT this scanner catches');
});
