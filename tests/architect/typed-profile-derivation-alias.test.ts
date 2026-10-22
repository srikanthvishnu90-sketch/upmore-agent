// Invented source-bound records only. Exercise projection into the real canonical application allowlist.
import { typedProfileFile } from '../../supabase/functions/_shared/typed_profile_fields.ts';
import { trustedManifest } from '../../extension/src/apply_core.ts';
const OWNER='SYN-TYPED-ALIASES';
const assert=(v:unknown,m:string)=>{if(!v)throw Error(m);};
const eq=(a:unknown,b:unknown,m:string)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(m+': '+JSON.stringify(a));};
const fact=(id:string,text:string,extra:any={})=>({id,kind:'other',text,source:'user',user_id:OWNER,status:'confirmed',needs_confirmation:false,provenance:'owner stated the exact invented clause',confirmation_event_id:'SYN-EVENT-'+id,...extra});
function project(metadata:any={}, dependencies:any[]=[]){
 const source=fact('SYN-PHONE','My phone is +1 202 555 0147.',metadata),profile={user_id:OWNER,facts:[...dependencies,source]},before=JSON.stringify(profile);
 const projected=typedProfileFile({owner:OWNER,profile});
 const manifest=trustedManifest({owner:OWNER,file:projected.file,rows:[],resume:null});
 eq(JSON.stringify(profile),before,'projection/manifest mutated stored metadata');
 return{source,projected,manifest};
}
for(const [label,metadata] of [
 ['camel-only quarantine',{derivedFrom:['F-033']}],
 ['snake-only quarantine',{derived_from:['F-033']}],
 ['empty snake cannot mask camel quarantine',{derived_from:[],derivedFrom:['F-033']}],
 ['valid snake cannot mask camel quarantine',{derived_from:['SYN-COUNTRY'],derivedFrom:['F-033']}],
] as const)Deno.test('typed derivation aliases: '+label+' stays excluded after projection',()=>{
 const{projected,manifest}=project(metadata,[fact('SYN-COUNTRY','My country is United States.')]);
 assert(projected.file.answers.phone?.derived_from?.includes('F-033'),'projection lost quarantine lineage');
 assert(!manifest.answers.phone,'projection laundered a quarantined dependency into a usable answer');
 assert(manifest.excluded.some(x=>x.factId==='SYN-PHONE'),'excluded source must retain its reason');
});
Deno.test('typed derivation aliases: valid own dependencies are unioned without changing source or confirmation',()=>{
 const{source,projected,manifest}=project({derived_from:['SYN-COUNTRY'],derivedFrom:['SYN-COUNTRY','SYN-AUTH']},[
  fact('SYN-COUNTRY','My country is United States.'),fact('SYN-AUTH','I am authorized to work in the US.'),
 ]);
 eq(projected.file.answers.phone?.derived_from,['SYN-COUNTRY','SYN-AUTH'],'both aliases must contribute every exact dependency ID');
 eq(manifest.answers.phone?.value,'+1 202 555 0147','independent owned confirmed dependency control was lost');
 eq(projected.file.answers.phone?.provenance,source.provenance,'projection invented provenance');
 eq(projected.file.answers.phone?.confirmation_event_id,source.confirmation_event_id,'projection invented confirmation event');
});
Deno.test('typed derivation aliases: no lineage metadata retains a directly confirmed source',()=>{
 const{manifest}=project();eq(manifest.answers.phone?.value,'+1 202 555 0147','direct source was turned into a dependency');
});
for(const [label,metadata] of [
 ['camel string',{derivedFrom:'F-033'}],['snake string',{derived_from:'F-033'}],
 ['camel null with valid snake',{derived_from:[],derivedFrom:null}],
 ['snake object with valid camel',{derived_from:{id:'F-033'},derivedFrom:[]}],
 ['non-string member',{derivedFrom:['SYN-COUNTRY',33]}],['empty member',{derived_from:['']}],
 ['whitespace member',{derivedFrom:['   ']}],
] as const)Deno.test('typed derivation aliases: malformed '+label+' requires review',()=>{
 const{projected,manifest}=project(metadata,[fact('SYN-COUNTRY','My country is United States.')]);
 assert(!projected.file.answers.phone,'malformed derivation field was silently discarded');
 assert(!manifest.answers.phone,'malformed lineage became a usable application answer');
 assert(projected.needs.some(x=>x.factId==='SYN-PHONE'&&/deriv|depend|lineage/i.test(x.reason)),'malformed source needs an explicit review reason');
});
