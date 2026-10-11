// Structural build evidence only: does not exercise a browser or accessibility tree.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
test('generated finance app scripts compile and every inline script is CSP-bound',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const blocks=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
 const policy=html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
 assert.equal(blocks.length,6);
 for(const block of blocks){assert.doesNotThrow(()=>new Function(block));const hash=crypto.createHash('sha256').update(block).digest('base64');assert.ok(policy.includes("'sha256-"+hash+"'"));}
 assert.ok(!policy.match(/script-src[^;]*unsafe-inline/));
 assert.ok(!html.includes('/*__BILL_WORKFLOW_UI__*/'));assert.ok(!html.includes('<!--__BILL_CONTROLLER__-->'));
});
test('generated bills entry points are unique and generated outputs agree',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const id of ['bills','billOpen','billEditor','billCreditor','billAmount','billDue','billKind','billAutopay','billConfirmed','billSave','billDismiss','billAssessment']){
  assert.equal([...html.matchAll(new RegExp('<[^>]+\\bid="'+id+'"','g'))].length,1,id);
 }
 for(const id of ['recoveryreview','recoveryOpen','recoveryStatus','recoveryCoverage','recoveryRows','recoveryAccount','recoveryReload','recoveryMore','recoveryCases','recoveryCaseStatus','recoveryCaseMore','recoveryCaseReload']){
  assert.equal([...html.matchAll(new RegExp('<[^>]+\\bid="'+id+'"','g'))].length,1,id);
 }
 assert.ok(html.includes("if (id === \"recoveryreview\") renderRecoveryReview()"));
 assert.ok(!html.includes('/*__RECOVERY_UI__*/'));
 assert.equal(html,fs.readFileSync(path.join(root,'src/upmore-app.html'),'utf8'));
 const swSource=fs.readFileSync(path.join(root,'src/sw.js'));
 const build=crypto.createHash('sha256').update(Buffer.concat([Buffer.from(html),swSource])).digest('hex').slice(0,16);
 assert.equal(fs.readFileSync(path.join(root,'sw.js'),'utf8'),swSource.toString().replaceAll('__BUILD__',build));
});
