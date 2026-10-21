// Actual contract boundary with the legacy byFactId-only manifest shape. No browser/provider or captured fixture.
import { trustedManifest,planForm,contractFill,batchPlan } from '../../extension/src/apply_core.ts';
const OWNER='SYN-LEGACY-LEGAL',JOB='SYN-LEGACY-JOB',assert=(v:unknown,m:string)=>{if(!v)throw Error(m)};
function fixture(){
 const schema=[{name:'legal',label:'Legal name',type:'input_text',required:true,options:[]}];
 const answer={value:'Test Legal',factId:'SYN-LEGAL',confirmed:true,user_id:OWNER,provenance:'owner stated exact synthetic answer',confirmation_event_id:'SYN-EVENT'};
 const manifest=trustedManifest({owner:OWNER,file:{user_id:OWNER,answers:{legal_name:answer},saved:{}},rows:[],resume:null});
 const plan=planForm({userId:OWNER,jobId:JOB,company:'Synthetic',family:'ashby',schema,answers:manifest.answers,saved:manifest.saved,now:0});
 return{schema,manifest,plan};
}
Deno.test('legacy legal manifest: absent answer map asks without throwing or inventing proof',()=>{
 const r=fixture(),manifest:any={...r.manifest};delete manifest.answers;
 const result=contractFill({schema:r.schema,plan:r.plan,manifest,resume:null,jobId:JOB});
 assert(!result.fill.length&&result.asks.length===1,'missing source map must remain an explicit question');
});
Deno.test('legacy legal manifest: batch validation refuses missing source map without crashing',()=>{
 const r=fixture(),manifest:any={...r.manifest};delete manifest.answers;
 const result=batchPlan({jobId:JOB,company:'Synthetic',url:'https://example.invalid/job',family:'ashby',schema:r.schema,plan:r.plan,challenge:false,resume:null,manifest});
 assert(!result.ok,'unbound legacy legal source must not become an approved payload');
});
Deno.test('legacy legal manifest control: complete canonical source still fills the exact stated legal name',()=>{
 const r=fixture(),result=contractFill({schema:r.schema,plan:r.plan,manifest:r.manifest,resume:null,jobId:JOB});
 assert(result.fill.length===1&&result.fill[0].value==='Test Legal'&&!result.asks.length,'canonical legal source was rejected');
});
