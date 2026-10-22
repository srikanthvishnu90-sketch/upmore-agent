"use strict";
// Independent producer -> renderer ABI QA. Node Event/DOM stand-ins, not actual physical browser taps.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const path=require('node:path'),fs=require('node:fs');
const source=path.resolve(process.env.CLOUD_CARD_RENDER_SOURCE_ROOT||path.join(__dirname,'..'));
const Cards=require(path.join(source,'src/career-approval-card.js'));
const input=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/card-cloud-render-20261022/actual-producer-item.json'),'utf8'));
const clone=v=>JSON.parse(JSON.stringify(v));
const CARD='00000000-0000-4000-8000-00000000ccff',DAY=86400000,NOW=1800000000100;
class Element {
  constructor(tag = 'div') { this.isConnected = true; this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.style = {}; this._text = ''; this.disabled = false; this.hidden = false; this.parentNode = null; this.onclick = null; }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this._text = ''; this.append(...nodes); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  querySelectorAll(tag) { return this.children.flatMap(child => [child, ...child.querySelectorAll(tag)]).filter(child => tag === '*' || child.tagName === tag.toUpperCase()); }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  getClientRects() { return [{ width: 100, height: 20 }]; }
  cloneNode(deep) { const node = new Element(this.tagName); node.attributes = { ...this.attributes }; node.style = { ...this.style }; node.hidden = this.hidden; node._text = this._text; if (deep) node.append(...this.children.map(child => child.cloneNode(true))); return node; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this._text = String(value); }
  get outerHTML() { return JSON.stringify([this.tagName, this.attributes, this.style, this.hidden, this._text, this.children.map(child => child.outerHTML)]); }
}
const brandedEvents = new WeakSet();
class FixtureClick {
  constructor(button, trusted = true) { this.type = 'click'; this.isTrusted = trusted; this.target = button; this.currentTarget = button; brandedEvents.add(this); }
  composedPath() { if (!brandedEvents.has(this)) throw Error('Invalid Event brand'); return [this.target]; }
}
const document = { createElement: tag => new Element(tag), defaultView: { Event: FixtureClick, getComputedStyle: node => ({ display: node.style.display || 'block', visibility: node.style.visibility || 'visible', opacity: node.style.opacity ?? '1', contentVisibility: node.style.contentVisibility || 'visible' }) } };
// This is an explicit Node fixture brand, not proof of an actual browser/user event.
const tap = handle => handle.button ? handle.button.onclick(new FixtureClick(handle.button)) : handle.approve();
function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }


async function fixture(change=()=>{},options={}){
 const items=clone(input.items);change(items);
 for(const i of items)i.hash=await Cards.hash(i.payload,webcrypto);
 const payload={version:2,kind:'career-message-approval',card_id:CARD,user_id:input.owner,thread_id:input.thread,
  issued_at:NOW-100,expires_at:NOW-100+DAY,execution_mode:'cloud',items};
 const stored={id:CARD,payload,hash:await Cards.hash(payload,webcrypto),state:'open'};
 let eligible=true,clock=NOW;const calls=[];
 const controller=Cards.createController({testUserId:'',identity:()=>input.owner,thread:()=>input.thread,
 authenticate:async()=>input.owner,cloudEnabled:async()=>eligible,readCard:async()=>clone(stored),
 approve:async req=>{calls.push(req);return{card_id:CARD,card_hash:stored.hash,approved_count:items.length,
 approved_at:new Date(clock).toISOString(),approval_expires_at:new Date(clock+DAY).toISOString(),
 jobs:items.map((i,n)=>({id:'00000000-0000-4000-8000-'+String(n+1).padStart(12,'0'),
 approval_id:'00000000-0000-4000-8000-'+String(n+21).padStart(12,'0'),payload_hash:i.hash,
 expires_at:new Date(Math.min(Date.parse(i.payload.expires_at),clock+DAY)).toISOString()}))};},
 document,crypto:webcrypto,now:()=>clock,...options});
 const el=new Element(),h=await controller.mount(el,CARD);
 return{el,h,calls,stored,setEligible:v=>eligible=v,setClock:v=>clock=v};
}
test('NEW REGRESSION actual full producer P/R with nonempty employer string names renders and approves exact Hc',async()=>{
 assert.equal(input.producer_source,'c5aa1d226b8df1d401a4e0003cd33ebdfc9f1cb4');
 const f=await fixture();
 assert.ok(input.items.every(i=>i.payload.approved_snapshot&&i.payload.replay_sources.length>0));
 assert.ok(input.items.every(i=>i.readback.employer_fields.length>0&&i.readback.employer_fields.every(x=>typeof x==='string')));
 assert.equal(f.h.getState(),'open');
 for(const i of input.items){for(const a of i.readback.answers)assert.ok(f.el.textContent.includes(a.shown));
 for(const n of i.readback.employer_fields)assert.ok(f.el.textContent.includes(n));
 assert.ok(f.el.textContent.includes(i.hash));assert.ok(f.el.textContent.includes(i.payload.resume_sha256));}
 await tap(f.h);assert.equal(f.h.getState(),'approved');
 assert.deepEqual(f.calls,[{card_id:CARD,card_hash:f.stored.hash}]);
 await tap(f.h);assert.equal(f.calls.length,1);
});
test('NEW REGRESSION object-shaped employer values cannot replace actual string-array ABI even when card is rehashed',async()=>{
 const f=await fixture(items=>{for(const i of items)i.readback.employer_fields=i.payload.page_field_names.map(name=>({name,value:'invented'}));});
 assert.notEqual(f.h.getState(),'open');await tap(f.h);assert.equal(f.calls.length,0);
});
for(const kind of ['unlisted','omitted','duplicate','answer-value','answer-missing','answer-extra'])test('CONTROL refuses malformed producer disclosure '+kind,async()=>{
 const f=await fixture(items=>{const i=items[0];if(kind==='unlisted')i.readback.employer_fields[0]='never_listed';
 if(kind==='omitted')i.readback.employer_fields=[];if(kind==='duplicate')i.readback.employer_fields.push(i.readback.employer_fields[0]);
 if(kind==='answer-value')i.readback.answers[0].value='invented';if(kind==='answer-missing')i.readback.answers.pop();
 if(kind==='answer-extra')i.readback.answers.push({...i.readback.answers[0],name:'extra'});});
 assert.notEqual(f.h.getState(),'open');await tap(f.h);assert.equal(f.calls.length,0);
});
test('CONTROL send deadline overrides current card and zero RPCs',async()=>{
 const f=await fixture(items=>items[0].payload.expires_at=new Date(NOW).toISOString());
 assert.equal(f.h.getState(),'expired');await tap(f.h);assert.equal(f.calls.length,0);
});
test('CONTROL explicit cloud eligibility lost before tap blocks exact actual producer item',async()=>{
 const f=await fixture();if(f.h.getState()==='open'){f.setEligible(false);await tap(f.h);}
 assert.equal(f.calls.length,0);
});
