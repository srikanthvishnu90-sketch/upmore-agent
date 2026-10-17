'use strict';
// Server-owned source adapter for the UNAPPLIED applicant-resume proposal.
// Uses the existing private RPC transport + account authority, never chat data,
// fixture records, Storage URLs, filesystem guesses, or a new credential path.
const {fail}=require('./store.cjs');
const {createOwnedEquipmentResolver}=require('./equipment.cjs');
const Applications=require('../../packages/domain/156-career-applications.js');
function createApplicantStoreEquipment({call,authority,root,...options}){
 if(typeof call!=='function')throw fail('APPLICANT_STORE_NOT_WIRED');
 function read(userId,artifactId,scope,includeBytes){
  if(!scope||!Number.isSafeInteger(scope.accountVersion)||!Number.isSafeInteger(scope.privacyEpoch)||!/^[a-f0-9]{32}$/.test(scope.taskId||'')||!/^[a-f0-9]{64}$/.test(scope.intentId||'')||!/^[a-f0-9-]{36}$/.test(scope.leaseToken||'')||!/^[a-f0-9]{64}$/.test(scope.resumeSha256||''))throw fail('APPLICANT_TASK_SCOPE_REQUIRED');
  let out;try{out=call('career_applicant_equipment_resolve_v1',{p_user:userId,p_artifact:artifactId,p_version:scope.accountVersion,p_epoch:scope.privacyEpoch,p_task:scope.taskId,p_intent:scope.intentId,p_lease:scope.leaseToken,p_posting:scope.postingKey,p_sha:scope.resumeSha256,p_include_bytes:includeBytes});}catch(_){throw fail('APPLICANT_STORE_UNAVAILABLE');}
  if(out?.then)throw fail('SYNC_EQUIPMENT_ADAPTER_REQUIRED');
  if(out?.error==='CONFIRMED_RESUME_NOT_STORED')throw fail('CONFIRMED_RESUME_NOT_STORED');
  if(!out?.records||out.error)throw fail('APPLICANT_STORE_UNAVAILABLE');return out;
 }
 const resolver=createOwnedEquipmentResolver({...options,maxBytes:1048576,authority,root,
  loadOwnedRecords:(user,id,scope)=>read(user,id,scope,false).records,
  readOwnedBytes(user,artifact,scope){
   const out=read(user,artifact.id,scope,true),b=out.blob,r=out.records;
   if(r.userId!==user||r.accountVersion!==scope.accountVersion||r.privacyEpoch!==scope.privacyEpoch||r.artifact?.versionId!==artifact.versionId||r.artifact?.sha256!==artifact.sha256||r.latestConfirmedArtifact?.versionId!==artifact.versionId||r.latestConfirmedArtifact?.sha256!==artifact.sha256||typeof b?.base64!=='string'||b.base64.length>1398104||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.base64))throw fail('APPLICANT_STORE_BINDING_MISMATCH');
   const bytes=Buffer.from(b.base64,'base64');if(bytes.toString('base64')!==b.base64)throw fail('APPLICANT_STORE_BYTES_INVALID');
   return {userId:b.userId,artifactId:b.artifactId,versionId:b.versionId,bytes};
  }
 });
 return {...resolver,resolveEquipment(user,id,scope){
  const e=resolver.resolveEquipment(user,id,scope);
  if(!scope.batchId)return e;
  try{
   // This RPC is lease/current-account scoped. Legacy tasks have no search
   // context and retain their existing equipment contract unchanged.
   const out=call('career_application_task_context_v1',{p_user:user,p_intent:scope.intentId,p_lease:scope.leaseToken,p_task:scope.taskId});
   if(out?.then||!out||out.error)throw fail('APPLICATION_CONTEXT_UNAVAILABLE');const c=out.context;if(c===null)return e;
   if(c?.userId!==user||c.accountVersion!==scope.accountVersion||c.privacyEpoch!==scope.privacyEpoch||c.taskId!==scope.taskId||c.currentPosting?.posting?.canonicalKey!==scope.postingKey||!c.careerProfile||!Array.isArray(c.roleInterests))throw fail('APPLICATION_CONTEXT_BINDING_MISMATCH');
   return {...e,careerProfile:c.careerProfile,scoringProfile:Applications.scoringProfile(c.careerProfile),roleInterests:c.roleInterests,currentPosting:c.currentPosting};
  }catch(error){try{e.release();}catch(_){}throw error;}
 }};
}
module.exports={createApplicantStoreEquipment};
