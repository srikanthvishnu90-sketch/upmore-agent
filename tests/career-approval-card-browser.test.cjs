// Actual sandboxed browser on an intercepted synthetic HTTPS origin. No service or employer is contacted.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {webcrypto}=require('node:crypto');
const Cards=require('../src/career-approval-card.js');
const {chromium}=require(process.env.UPMORE_PLAYWRIGHT_PATH || 'playwright');
const SOURCE=fs.readFileSync(path.resolve(__dirname,'../src/career-approval-card.js'),'utf8');
const OWNER='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const THREAD='33333333-3333-4333-8333-333333333333',CARD='44444444-4444-4444-8444-444444444444';
const DAY=86400000,NOW=Date.parse('2026-10-21T21:00:00.000Z'),SHA='a'.repeat(64);
const RESUME_FACT='approved-local-resume:'+SHA;
let browser;
before(async()=>{
  browser=await chromium.launch({headless:true,chromiumSandbox:true,
    ...(process.env.UPMORE_CHROMIUM_PATH?{executablePath:process.env.UPMORE_CHROMIUM_PATH}:{}),timeout:60000});
});
after(async()=>{if(browser)await browser.close();});
async function envelope(answer='I enjoy careful work.',attachment={}){
  const fileFact=attachment.factId || RESUME_FACT;
  const entry={version:1,kind:'agent-batch',jobId:'synthetic-job',company:'Invented Browser Workshop',url:'https://example.test/jobs/synthetic',
    answers:[{name:'motivation',label:'Why this role?',value:answer,shown:answer,kind:'text',factId:'F-001',file:null},
      {name:'resume',label:attachment.label || 'Resume/CV',value:'wire-resume.pdf',shown:attachment.shown || 'Synthetic Zoë Resume.pdf',kind:'file',factId:fileFact,file:SHA}],
    blank:['Optional website'],ledger:[
      {application_id:'synthetic-job',field_id:'motivation',question_hash:SHA,answer_hash:SHA,fact_refs:['F-001'],source_refs:['own synthetic statement'],confirmation_event_id:'synthetic-confirmation-1',derivation_rule:'verbatim'},
      {application_id:'synthetic-job',field_id:'resume',question_hash:SHA,answer_hash:SHA,fact_refs:[fileFact],source_refs:['own synthetic upload'],confirmation_event_id:'synthetic-confirmation-2',derivation_rule:'attachment'}],
    question_set_hash:SHA,manifest_hash:SHA,quarantine_version:'d007-v1'};
  const payload={version:1,kind:'career-message-approval',card_id:CARD,user_id:OWNER,thread_id:THREAD,issued_at:NOW,expires_at:NOW+DAY,items:[{entry,hash:await Cards.hash(entry,webcrypto)}]};
  return {id:CARD,payload,hash:await Cards.hash(payload,webcrypto),state:'open'};
}
async function fixture(t,{answer,mode='normal',attachment}={}){
  const page=await browser.newPage();t.after(()=>page.close());
  const unexpected=[];
  await page.route('**/*',route=>{
    if(route.request().url()==='https://messages.approval.test/')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><label>Message<input id="message"></label><main id="card"></main></body></html>'});
    unexpected.push(route.request().url());return route.abort();
  });
  await page.goto('https://messages.approval.test/');
  await page.addScriptTag({content:SOURCE});
  const card=await envelope(answer,attachment);
  await page.evaluate(async({card,mode,owner,thread,now,day})=>{
    window.stored=card;window.actor=owner;window.conversation=thread;window.clock=now+10;window.current=true;window.approvals=[];window.trustedClicks=[];
    window.controller=TraineeApprovalCards.createController({testUserId:owner,identity:()=>window.actor,thread:()=>window.conversation,now:()=>window.clock,
      authenticate:async()=>window.verifiedActor || window.actor,readCard:async()=>structuredClone(window.stored),
      approve:async request=>{
        window.approvals.push(request);
        if(mode==='lost')throw Error('synthetic lost response');
        if(mode==='pending')await new Promise(resolve=>window.releaseApproval=resolve);
        window.stored.state='approved';
        return {card_id:request.card_id,card_hash:request.card_hash,approved_count:1,approved_at:new Date(window.clock).toISOString(),approval_expires_at:new Date(window.clock+day).toISOString()};
      },document,crypto});
    window.handle=await window.controller.mount(document.querySelector('#card'),card.id,{current:()=>window.current});
    const button=window.handle.button;if(button)button.addEventListener('click',event=>window.trustedClicks.push(event.isTrusted));
  },{card,mode,owner:OWNER,thread:THREAD,now:NOW,day:DAY});
  t.after(()=>assert.deepEqual(unexpected,[],'the browser must not attempt a real service request'));
  return {page,card,button:page.getByRole('button',{name:/Approve these exact answers/})};
}

test('sandboxed DOM shows every exact answer and resume fingerprint before a trusted tap sends the bound reference',async t=>{
  const {page,card,button}=await fixture(t);
  assert.equal(await page.evaluate(()=>isSecureContext && !!crypto.subtle),true);
  assert.equal(await page.evaluate(()=>window.approvals.length),0);
  for(const text of ['I enjoy careful work.','Synthetic Zoë Resume.pdf','wire-resume.pdf',SHA,'Optional website','https://example.test/jobs/synthetic'])assert.ok((await page.locator('#card').innerText()).includes(text),text);
  await button.click();
  await page.waitForFunction(()=>window.handle.getState()==='approved');
  assert.deepEqual(await page.evaluate(()=>window.trustedClicks),[true]);
  assert.deepEqual(await page.evaluate(()=>window.approvals),[{card_id:CARD,card_hash:card.hash}]);
  assert.match(await page.locator('[role=status]').innerText(),/Nothing has been submitted to an employer/);
});

test('long HTML-shaped Unicode answers are complete visible text and cannot create executable elements',async t=>{
  const answer='<img src=x onerror="window.injected=true">\n'+'Zoë — synthetic answer. '.repeat(240);
  const {page,button}=await fixture(t,{answer});
  assert.equal(await page.locator('pre').first().innerText(),answer);
  assert.equal(await page.locator('#card img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);
  await button.click();await page.waitForFunction(()=>window.handle.getState()==='approved');
  assert.equal(await page.evaluate(()=>window.approvals.length),1);
});

test('changed stored answer, resume, job or added hidden answer blocks the real approval button',async t=>{
  for(const mutation of ['answer','resume','job','hidden']){
    const {page,button}=await fixture(t);
    await page.evaluate(async mutation=>{
      const entry=window.stored.payload.items[0].entry;
      if(mutation==='answer')entry.answers[0].value='Changed after display';
      if(mutation==='resume')entry.answers[1].file='b'.repeat(64);
      if(mutation==='job')entry.jobId='different-synthetic-job';
      if(mutation==='hidden')entry.answers.push({...entry.answers[0],name:'hidden-answer'});
      window.stored.payload.items[0].hash=await TraineeApprovalCards.hash(entry);
      window.stored.hash=await TraineeApprovalCards.hash(window.stored.payload);
    },mutation);
    await button.click();await page.waitForFunction(()=>window.handle.getState()!=='checking');
    assert.equal(await page.evaluate(()=>window.approvals.length),0,mutation);
    assert.equal(await page.evaluate(()=>window.handle.getState()),'changed',mutation);
  }
});

test('wrong authenticated actor, account/thread change or the exact expiry boundary cannot authorize',async t=>{
  for(const mutation of ['verified-actor','actor','thread','expiry']){
    const {page,button}=await fixture(t);
    await page.evaluate(({mutation,other,deadline})=>{
      if(mutation==='verified-actor')window.verifiedActor=other;
      if(mutation==='actor')window.actor=other;
      if(mutation==='thread')window.conversation=other;
      if(mutation==='expiry')window.clock=deadline;
    },{mutation,other:OTHER,deadline:NOW+DAY});
    await button.click();await page.waitForFunction(()=>window.handle.getState()!=='checking');
    assert.equal(await page.evaluate(()=>window.approvals.length),0,mutation);
  }
});

test('double tap, remount and unknown server response never repeat an approval request',async t=>{
  const pending=await fixture(t,{mode:'pending'});
  await pending.button.click();await pending.page.waitForFunction(()=>window.approvals.length===1);
  assert.equal(await pending.button.isDisabled(),true);
  await pending.page.evaluate(()=>window.handle.approve());
  await pending.page.evaluate(()=>window.releaseApproval());
  await pending.page.waitForFunction(()=>window.handle.getState()==='approved');
  await pending.page.evaluate(async()=>{window.handle=await window.controller.mount(document.querySelector('#card'),window.stored.id,{current:()=>true});await window.handle.approve();});
  assert.equal(await pending.page.evaluate(()=>window.approvals.length),1);
  const lost=await fixture(t,{mode:'lost'});await lost.button.click();await lost.page.waitForFunction(()=>window.handle.getState()==='unknown');
  await lost.page.evaluate(()=>window.handle.approve());assert.equal(await lost.page.evaluate(()=>window.approvals.length),1);
  assert.doesNotMatch(await lost.page.locator('[role=status]').innerText(),/Approved exactly/);
});

test('plain-text yes does not approve and a changed disclosure blocks the trusted button',async t=>{
  const {page,button}=await fixture(t);await page.locator('#message').fill('yes');await page.locator('#message').press('Enter');
  assert.equal(await page.evaluate(()=>window.approvals.length),0);
  await page.locator('pre').first().evaluate(element=>{element.textContent='Only a summary';});
  await button.click();await page.waitForFunction(()=>window.handle.getState()==='changed');
  assert.equal(await page.evaluate(()=>window.approvals.length),0);
});

test('stylesheet-hidden or transparent answers cannot be authorized by a still-visible trusted button',async t=>{
  for(const rule of ['display: none !important','opacity: 0 !important']){
    const {page,button}=await fixture(t);
    await page.addStyleTag({content:'.career-approval-card pre { '+rule+'; }'});
    assert.equal(await button.isVisible(),true);
    if(rule.startsWith('display'))assert.equal(await page.locator('pre').first().isVisible(),false);
    else assert.equal(await page.locator('pre').first().evaluate(node=>getComputedStyle(node).opacity),'0');
    await button.click();await page.waitForFunction(()=>window.handle.getState()!=='checking');
    assert.deepEqual(await page.evaluate(()=>window.trustedClicks),[true]);
    assert.equal(await page.evaluate(()=>window.approvals.length),0,'hidden answer content must prevent authorization: '+rule);
  }
});

test('programmatic clicks, fabricated events and no-event API calls cannot replace the person’s native tap',async t=>{
  const {page,button}=await fixture(t);
  await button.evaluate(element=>element.click());
  await button.dispatchEvent('click');
  await page.evaluate(()=>window.handle.approve());
  await page.waitForTimeout(10);
  assert.equal(await page.evaluate(()=>window.approvals.length),0);
  await button.click();await page.waitForFunction(()=>window.handle.getState()==='approved');
  assert.equal(await page.evaluate(()=>window.approvals.length),1);
});

test('opening the exact raw-payload disclosure is a legitimate review action and preserves native approval',async t=>{
  const {page,button}=await fixture(t);
  await page.getByText('Exact approval payload',{exact:true}).click();
  assert.equal(await page.locator('details').getAttribute('open'),'');
  await button.click();await page.waitForFunction(()=>window.handle.getState()==='approved');
  assert.equal(await page.evaluate(()=>window.approvals.length),1);
});

test('a trusted click cannot approve after a capture listener detaches the disclosed card',async t=>{
  const {page,button}=await fixture(t);
  await page.evaluate(()=>{
    document.addEventListener('click',event=>{
      if(event.target!==window.handle.button)return;
      window.detachedNativeEvent=event.isTrusted;
      document.querySelector('#card').remove();
      window.detachedBeforeHandler=!window.handle.button.isConnected;
    },{capture:true,once:true});
  });
  await button.click();await page.waitForFunction(()=>window.handle.getState()!=='checking');
  assert.equal(await page.evaluate(()=>window.detachedNativeEvent),true);
  assert.equal(await page.evaluate(()=>window.detachedBeforeHandler),true);
  assert.equal(await page.evaluate(()=>window.approvals.length),0);
});

test('stylesheet-zero-area answers block a native tap even when getClientRects returns a rectangle',async t=>{
  const {page,button}=await fixture(t);
  await page.addStyleTag({content:'.career-approval-card pre { transform: scale(0) !important; }'});
  const rect=await page.locator('pre').first().evaluate(node=>{
    const rectangles=node.getClientRects();return {n:rectangles.length,width:rectangles[0]?.width,height:rectangles[0]?.height};
  });
  assert.equal(rect.n,1);assert.equal(rect.width,0);assert.equal(rect.height,0);assert.equal(await button.isVisible(),true);
  await button.click();await page.waitForFunction(()=>window.handle.getState()!=='checking');
  assert.deepEqual(await page.evaluate(()=>window.trustedClicks),[true]);
  assert.equal(await page.evaluate(()=>window.approvals.length),0);
});

test('a cover-letter-only attachment cannot impersonate a resume through its filename or form field name',async t=>{
  const {page,button}=await fixture(t,{attachment:{factId:'cover-letter:'+SHA,label:'Cover letter',shown:'resume.pdf'}});
  assert.equal(await page.evaluate(()=>window.handle.getState()),'resume_missing');
  assert.equal(await button.count(),0);
  assert.equal(await page.evaluate(()=>window.approvals.length),0);
});

test('the actual built Messages history adapter reaches the own RPC only through a bound native card tap',async t=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
  const renderer=scripts.find(block=>block.trim()===SOURCE.trim());
  assert.ok(renderer,'the built page must contain the exact renderer module under test');
  const controller=scripts.find(block=>block.includes('globalThis.UpmoreChatRequests = function'));
  const main=scripts.find(block=>block.includes('  const supa = window.supabase.createClient('));
  assert.ok(controller&&main,'actual built conversation controller and app script are required');
  const authStart=main.indexOf('  const supa = window.supabase.createClient(');
  const chatStart=main.indexOf('  const chatRequests=',authStart);
  const chatEnd=main.indexOf('  function resetPrivateChat(',chatStart);
  const historyStart=main.indexOf('  function histBubble(');
  const historyEnd=main.indexOf('  async function openGuideChat(',historyStart);
  assert.ok(authStart>=0&&chatStart>authStart&&chatEnd>chatStart&&historyStart>=0&&historyEnd>historyStart,'actual app boundaries must remain identifiable');
  const auth=main.slice(authStart,chatStart);
  assert.ok(auth.includes('const CAREER_APPROVAL_TEST_USER_ID = "";'),'ordinary builds must keep approval cards disabled');
  // Only the fixture copy selects an invented TEST actor. Adapter functions stay byte-for-byte built source.
  const fixtureAuth=auth.replace('const CAREER_APPROVAL_TEST_USER_ID = "";','const CAREER_APPROVAL_TEST_USER_ID = '+JSON.stringify(OWNER)+';');
  const {page,card}=await fixture(t);
  const second=await envelope();second.id='55555555-5555-4555-8555-555555555555';second.payload.card_id=second.id;second.hash=await Cards.hash(second.payload,webcrypto);
  await page.evaluate(({cards,owner,now,day})=>{
    document.querySelector('#card').replaceChildren();
    window.messageCards=Object.fromEntries(cards.map(card=>[card.id,card]));window.messageCalls=[];window.messageAuthReads=0;window.messageNativeClicks=[];
    Date.now=()=>now+10;
    window.syntheticClient={
      auth:{getUser:async()=>{window.messageAuthReads++;return {data:{user:{id:owner}},error:null};}},
      rpc:async(name,args)=>{
        window.messageCalls.push({name,args});
        const stored=window.messageCards[args.p_card];
        if(name==='career_apply_message_card_read_own')return {data:structuredClone(stored),error:null};
        if(name==='career_apply_message_card_approve_own'&&stored&&args.p_hash===stored.hash&&stored.state==='open'){
          stored.state='approved';return {data:{card_id:stored.id,card_hash:stored.hash,approved_count:stored.payload.items.length,approved_at:new Date(Date.now()).toISOString(),approval_expires_at:new Date(Date.now()+day).toISOString()},error:null};
        }
        throw Error('unexpected synthetic RPC');
      }
    };
    window.supabase={createClient:()=>window.syntheticClient};
    document.addEventListener('click',event=>{if(event.target.tagName==='BUTTON')window.messageNativeClicks.push(event.isTrusted);});
  },{cards:[card,second],owner:OWNER,now:NOW,day:DAY});
  await page.addScriptTag({content:renderer});
  await page.addScriptTag({content:controller});
  const setup='const UPMORE_BACKEND_URL="https://messages.approval.test";const UPMORE_ANON_KEY="synthetic-only";let upmoreThread='+JSON.stringify(THREAD)+';let chatMode="agent";function getSessionToken(){return Promise.resolve("synthetic-only");}function md(text){return String(text);}';
  await page.addScriptTag({content:setup+fixtureAuth+main.slice(chatStart,chatEnd)+main.slice(historyStart,historyEnd)});
  await page.evaluate(({owner,cardId})=>{
    session={user:{id:owner},access_token:'synthetic-only'};
    histBubble(document.querySelector('#card'),'assistant','Review these exact answers.',{intent:'career_message_approval',career_approval_card_id:cardId});
  },{owner:OWNER,cardId:CARD});
  const button=page.getByRole('button',{name:/Approve these exact answers/});await button.waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(()=>window.messageCalls),[{name:'career_apply_message_card_read_own',args:{p_card:CARD}}]);
  await button.click();await page.waitForFunction(()=>document.querySelector('#card [role=status]')?.textContent.startsWith('Approved exactly'));
  assert.deepEqual(await page.evaluate(()=>window.messageCalls),[
    {name:'career_apply_message_card_read_own',args:{p_card:CARD}},
    {name:'career_apply_message_card_read_own',args:{p_card:CARD}},
    {name:'career_apply_message_card_approve_own',args:{p_card:CARD,p_hash:card.hash}}
  ]);
  assert.equal(await page.evaluate(()=>window.messageAuthReads),1);
  assert.deepEqual(await page.evaluate(()=>window.messageNativeClicks),[true]);
  assert.match(await page.locator('#card [role=status]').innerText(),/Nothing has been submitted to an employer/);
  await page.evaluate(cardId=>{
    histBubble(document.querySelector('#card'),'user','yes',{intent:'career_message_approval',career_approval_card_id:cardId});
    histBubble(document.querySelector('#card'),'assistant','yes',{});
  },CARD);
  assert.equal(await page.evaluate(()=>window.messageCalls.length),3,'plain words and user metadata cannot trigger an approval RPC');
  await page.evaluate(cardId=>histBubble(document.querySelector('#card'),'assistant','Review the next exact card.',{intent:'career_message_approval',career_approval_card_id:cardId}),second.id);
  const next=page.getByRole('button',{name:/Approve these exact answers/}).last();await next.waitFor({state:'visible'});
  await page.evaluate(()=>{chatRequests.invalidate();upmoreThread='66666666-6666-4666-8666-666666666666';});
  await next.click();
  assert.equal(await page.evaluate(()=>window.messageCalls.filter(call=>call.name==='career_apply_message_card_approve_own').length),1,'a changed conversation invalidates the native tap before any second authorization');
  assert.deepEqual(await page.evaluate(()=>window.messageNativeClicks),[true,true]);
  assert.equal(await page.evaluate(()=>window.approvals.length),0,'the independent renderer fixture callback is never used by the built app adapter');
});
