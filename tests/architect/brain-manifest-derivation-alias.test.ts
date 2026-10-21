// Synthetic sources only; lineage must survive every normalization before an answer can fill a form.
import { trustedManifest, planForm, contractFill } from '../../extension/src/apply_core.ts';
import { payloadTrust } from '../../workers/career-browser/approve-first.ts';
const OWNER='SYN-MANIFEST-ALIASES';
const assert=(ok:unknown,why='assertion failed')=>{if(!ok)throw Error(why)};
const own=(factId:string,value:string,extra:any={})=>({factId,value,confirmed:true,provenance:'owner stated synthetic source',confirmation_event_id:'SYN-EVT-'+factId,...extra});
const field={name:'phone',label:'Phone',type:'tel',required:true,options:[]};
function canonical(metadata:any={},extra:any={}){return trustedManifest({owner:OWNER,file:{user_id:OWNER,answers:{root:own('F-033','invented'),good:own('SYN-GOOD','independent own source'),phone:own('SYN-PHONE','+1 202 555 0147',metadata),...extra},saved:{}},rows:[],resume:null});}
function replay(m:any){const p=planForm({userId:OWNER,jobId:'lever:synthetic:7',company:'Synthetic',family:'lever',schema:[field],answers:m.answers,saved:m.saved,now:0});return contractFill({schema:[field],plan:p,manifest:m,resume:null});}
Deno.test('manifest aliases: camel lineage and empty-snake masking cannot fill a quarantined derivation',()=>{
 for(const metadata of [{derivedFrom:['F-033']},{derived_from:[],derivedFrom:['F-033']},{derived_from:['SYN-GOOD'],derivedFrom:['F-033']}]){const m=canonical(metadata);assert(!m.answers.phone,'camel lineage was discarded');assert(!replay(m).fill.length,'quarantined derived phone reached actual contract');}
});
Deno.test('manifest aliases: any malformed present alias is excluded even when the other is valid',()=>{
 for(const metadata of [{derivedFrom:'F-033'},{derived_from:[],derivedFrom:null},{derived_from:{id:'F-033'},derivedFrom:[]},{derivedFrom:['']},{derivedFrom:[33]},{derivedFrom:['   ']}]){const m=canonical(metadata);assert(!m.answers.phone,'malformed alias laundered as direct own fact');assert(m.excluded.some(x=>x.factId==='SYN-PHONE'&&/malformed/.test(x.why)),'missing malformed lineage reason');}
});
Deno.test('manifest aliases: transitive camel and snake union excludes descendants of a quarantined source',()=>{
 const m=canonical({derivedFrom:['SYN-MIDDLE']},{middle:own('SYN-MIDDLE','derived source',{derived_from:['SYN-GOOD'],derivedFrom:['F-033']})});assert(!m.byFactId['SYN-MIDDLE']&&!m.byFactId['SYN-PHONE'],'graph closure retained poisoned descendants');
});
Deno.test('manifest aliases: directly stated and both-alias independent source controls remain usable',()=>{
 for(const metadata of [{},{derived_from:['SYN-GOOD'],derivedFrom:['SYN-GOOD']}]){const m=canonical(metadata);assert(m.answers.phone?.value==='+1 202 555 0147','safe own source was dropped');assert(replay(m).fill[0]?.value==='+1 202 555 0147','safe own source did not reach actual contract');}
});
Deno.test('manifest aliases: raw typed profile preserves union through the actual application path',()=>{
 const fact=(id:string,text:string,extra:any={})=>({id,text,kind:'other',source:'user',status:'confirmed',needs_confirmation:false,user_id:OWNER,provenance:'owner stated synthetic source',confirmation_event_id:'SYN-EVT-'+id,...extra});
 for(const unsafe of [false,true]){const file={user_id:OWNER,facts:[fact('SYN-PHONE','My phone is +1 202 555 0147.',unsafe?{derived_from:[],derivedFrom:['F-033']}:{})]},before=JSON.stringify(file),m=trustedManifest({owner:OWNER,file,rows:[],resume:null});assert(JSON.stringify(file)===before,'stored profile changed');assert(Boolean(m.answers.phone)===!unsafe,'raw projection lost lineage');assert(Boolean(replay(m).fill.length)===!unsafe,'raw projection changed application safety');}
});
Deno.test('manifest aliases: worker refuses camel quarantined or malformed dependency metadata',()=>{
 for(const metadata of [{derivedFrom:['F-033']},{derived_from:[],derivedFrom:['F-033']},{derivedFrom:null}])assert(payloadTrust({fields:[{factId:'SYN-PHONE',label:'Phone',...metadata}]}).length>0,'worker dropped dependency alias');
 assert(payloadTrust({fields:[{factId:'SYN-PHONE',label:'Phone',derived_from:[],derivedFrom:[]}]}).length===0,'direct own dependency control blocked');
});
