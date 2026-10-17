'use strict';
// Actual browser-controller -> actual Edge entry -> local owned SQL. Synthetic
// owner and original PDF only; no portal/employer call or acceptance is modeled.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const F=require('./interview-entry-fixture.cjs')();
test('client upload/review/confirmation saves exact owned bytes and recovers a lost committed acknowledgement',async()=>{
 F.seed();const ingress=await require('../helpers/applicant-ingress-entry.cjs')({authenticate:async token=>token==='synthetic-owner'?{id:F.U}:null,rpc:F.client().rpc});
 const context=vm.createContext({FormData,Blob,Date,crypto:crypto.webcrypto});vm.runInContext(fs.readFileSync('src/career-applicant-controller.js','utf8'),context);let id=0,lost=false;const calls=[];
 const client=context.UpmoreApplicantResume({capture:()=>({owner:F.U,thread:F.T,current:()=>true}),getToken:async()=> 'synthetic-owner',newId:()=>String(++id),request:async(route,body,token)=>{
  const multipart=body instanceof FormData,response=await ingress.request(new Request('https://synthetic-app.test/career-applicant/'+route,{method:'POST',headers:{authorization:'Bearer '+token,...(multipart?{}:{'content-type':'application/json'})},body:multipart?body:JSON.stringify(body)}));const result={status:response.status,body:await response.json()};calls.push({route,status:result.status});
  if(route==='confirm'&&!lost&&result.status===200){lost=true;throw Error('uncertain');}return result;
 }});
 const original=require('../../packages/domain/148-career-render.js').renderPdf({header:{name:'SYNTHETIC Applicant'},sections:[{heading:'Experience',lines:[{type:'bullet',text:'SYNTHETIC original bytes, not applicant facts.'}]}]}).buffer,file=new Blob([original],{type:'application/pdf'});file.name='synthetic.pdf';
 assert.equal(client.start(),true);assert.equal(await client.upload(file),true,JSON.stringify(client.view()));client.edit({email:'synthetic-confirmed@example.test'});assert.equal(await client.review(),true,JSON.stringify(client.view()));assert.equal(await client.confirm(),false);assert.equal(client.view().state,'confirm_uncertain');assert.equal(await client.confirm(),true,JSON.stringify(client.view()));
 const saved=client.view().confirmed;assert.equal(saved.sha256,crypto.createHash('sha256').update(original).digest('hex'));assert.equal(F.sql("select count(*)from career_applicant_resumes_v1"),'1');assert.equal(F.sql('select count(*)from agent_messages'),'4');assert.equal(F.sql('select count(*)from agent_usage'),'0');assert.equal(F.sql('select encode(content,\'hex\')from career_applicant_resumes_v1'),original.toString('hex'));
 console.log(JSON.stringify({evidence:'APPLICATION_CLIENT_OWNED_RESUME_SOURCE_CHAIN',routes:calls,immutableResumeVersions:1,historyMessages:4,modelCalls:0,browserCalls:0,employerSubmissions:0}));
});
