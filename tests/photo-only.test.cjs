// Spec 16 item 12 is a photo with no words. Live finding 2026-10-11: the app's Send stayed disabled and chatSubmit
// returned on empty text, so a photo alone could not be sent at all (and the handler answered 400). These run the
// template's own chatSendReady and chatSubmit against stub elements. Check: node --test tests/photo-only.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','src/upmore-app-template.html'),'utf8');
const cut=(head)=>{const s=src.indexOf(head);assert.ok(s>0,head);return src.slice(s,src.indexOf('\n}\n',s)+2);};
function world(mode,text,images){
  const els={chatInput:{value:text,style:{}},chatSend:{disabled:true}};const sent=[];
  const ctx=vm.createContext({$:id=>els[id]||null,busy:false,chatMode:mode,chatImages:images.slice(),renderChatImages(){},
    agentChat:(t,i)=>sent.push(['agent',t,i.length]),guideAsk:(t,i)=>sent.push(['ask',t,i.length])});
  vm.runInContext(cut('function chatSendReady()')+cut('function chatSubmit()')+'\nthis.ready=chatSendReady;this.submit=chatSubmit;',ctx);
  return {els,sent,ctx};
}
const PHOTO=[{data:'AAAA',media_type:'image/jpeg'}];
test('a photo alone, agent mode: Send is enabled and the photo goes to the agent with empty text',()=>{
  const w=world('agent','',PHOTO);w.ctx.ready();assert.equal(w.els.chatSend.disabled,false);
  w.ctx.submit();assert.deepEqual(w.sent,[['agent','',1]]);
});
test('nothing typed and no photo: Send stays disabled and nothing is sent; Ask mode still needs words',()=>{
  const none=world('agent','',[]);none.ctx.ready();assert.equal(none.els.chatSend.disabled,true);none.ctx.submit();assert.equal(none.sent.length,0);
  const ask=world('ask','',PHOTO);ask.ctx.ready();assert.equal(ask.els.chatSend.disabled,true);ask.ctx.submit();assert.equal(ask.sent.length,0);
  const words=world('agent','is this a scam',PHOTO);words.ctx.submit();assert.deepEqual(words.sent,[['agent','is this a scam',1]]);
});
