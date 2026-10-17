'use strict';
// v2 owned-store contract fixture: SYNTHETIC candidate, real rendered bytes.
const {hash}=require('../../../workers/career-browser/store.cjs');
const {createOwnedEquipmentResolver}=require('../../../workers/career-browser/equipment.cjs');
const Render=require('../../../packages/domain/148-career-render.js');
function equipment(root,authority,type='pdf'){
 const userId='synthetic-native-user',artifactId='synthetic-resume',versionId='synthetic-version-1';
 const rendered=Render[type==='pdf'?'renderPdf':'renderDocx']({header:{name:'SYNTHETIC Native Test',email:'synthetic@example.test'},sections:[{heading:'Experience',lines:[{text:'SYNTHETIC LOOPBACK FIXTURE ONLY',type:'bullet'}]}]});
 if(!rendered.ok)throw Error('Synthetic renderer failed');const bytes=rendered.buffer,sha256=hash(bytes),filename='synthetic-resume.'+type,contentType=type==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
 const account=authority.current(userId),confirmation={confirmed:true,userId,ref:'synthetic-confirmation-1',at:'2026-10-15T12:00:00Z'};
 const artifact={id:artifactId,userId,versionId,privacyEpoch:account.epoch,confirmation,filename,contentType,sha256,bytes:bytes.length};
 const facts=[['first_name','Synthetic'],['last_name','Native Test'],['email','synthetic@example.test']].map(([key,value])=>({kind:'fact',key,value,userId,privacyEpoch:account.epoch,confirmation}));facts.push({kind:'answer',key:'sponsorship',value:'No',postingKey:'modeled:greenhouse-native:123',userId,privacyEpoch:account.epoch,confirmation});
 const records={version:'career_owned_equipment/v2',userId,accountVersion:account.version,privacyEpoch:account.epoch,artifact,facts,latestConfirmedArtifact:{userId,privacyEpoch:account.epoch,id:artifactId,versionId,sha256,confirmationRef:confirmation.ref}};
 let reads=0;const resolver=createOwnedEquipmentResolver({root,authority,loadOwnedRecords:()=>records,readOwnedBytes:(user,a)=>{reads++;return {userId:user,artifactId:a.id,versionId:a.versionId,bytes};}});
 return {userId,artifactId,bytes,sha256,records,resolver,reads:()=>reads};
}
module.exports={equipment};
