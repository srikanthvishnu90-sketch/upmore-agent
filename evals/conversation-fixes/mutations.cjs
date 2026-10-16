'use strict';
// Mutate source in isolated VM modules only. Never edits product files, frozen
// tests or evidence. Each defect must be caught by its user-observable contract.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),file=path.join(root,'packages/domain/155-career-conversation.js'),hostFile=path.join(root,'supabase/functions/_shared/career_host.js');
const raw=fs.readFileSync(file,'utf8'),rawHost=fs.readFileSync(hostFile,'utf8');
const {contracts}=require('../../tests/helpers/conversation-mechanism-contracts.cjs');
const N=require('../../packages/domain/128-career-negotiation.js'),D=n=>require('../../packages/domain/'+n),deps={CareerAccess:D('120-career-access.js'),CareerOnboarding:D('130-career-onboarding.js'),CareerRouter:D('142-career-router.js'),CareerDoorstep:D('141-career-doorstep.js'),CareerReply:D('140-career-reply.js'),CareerContainment:D('143-career-containment.js')};
function load(source,filename){source=source.replace(/^export \{ CareerHost \};$/m,'module.exports={CareerHost};');const module={exports:{}};vm.runInNewContext('(function(module,exports,require){'+source+'\n})',{Date,console},{filename})(module,module.exports,createRequire(filename));return module.exports;}
const baseline=load(raw,file),Host=load(rawHost,hostFile).CareerHost;
for(const fn of Object.values(contracts))fn(baseline,N,Host,deps);
const mutants=[
 ['D01','plan review invalidation omitted','plan.needsReview=true','plan.needsReview=false'],
 ['D02','mirror geography retained','[ctx.statedFacts,ctx.trackStore?._careerThread?.facts]','[ctx.statedFacts]'],
 ['D03','withdrawal leaves active facts','record.facts.filter(f=>f.kind!=="geography")','record.facts.filter(f=>true)'],
 ['D04','unsupported erasure falsely succeeds','I have not deleted them','I have deleted them'],
 ['D05','hypothetical speech act lost','if(hypothetical(raw)||thirdParty(raw))','if(thirdParty(raw))'],
 ['D06','third-party speech act lost','if(hypothetical(raw)||thirdParty(raw))','if(hypothetical(raw))'],
 ['D07','resume invents leadership','Coursework / class project:','Led a team:'],
 ['D08','answer drops supplied outcome evidence','[st.answer,...(st.outcomes||[])]','[st.answer]'],
 ['D09','two interview questions at once','what happened?"','what happened? What else?"'],
 ['D10','feedback ignores actual answer','You described: ${answer}','You described: a generic project'],
 ['D11','draft summarizer drops body','${intro}\\n\\n${body}\\n\\n','${intro}\\n\\n${body.split(".")[0]}\\n\\n'],
 ['D12','unsupported send claims success','No browser page, upload, application or email was executed','I sent an email; browser, upload and application were executed'],
 ['D13','unknown remote geography allowed','if(get(st,"remote_only")','if(false&&get(st,"remote_only")'],
 ['D14','chosen extension date dropped','requested_deadline:st.extension.requestedDeadline||null','requested_deadline:null'],
 ['D15','conversation work lost on reload',', "conversationState"','',true],
];
const results=[];
for(const [id,defect,from,to,host]of mutants){const src=host?rawHost:raw;if(!src.includes(from))throw Error('Mutation target missing '+id);let caught=false,error;try{contracts[id](host?baseline:load(src.replace(from,to),file),N,host?load(src.replace(from,to),hostFile).CareerHost:Host,deps);}catch(e){caught=true;error=String(e.message);}results.push({id,defect,caught,error});console.log(id+' '+(caught?'CAUGHT':'MISSED')+' '+defect);}
const out=path.join(root,'docs/testing/runs/conversation-fixes-20261016/mutations.json');fs.writeFileSync(out,JSON.stringify({baseline:'15/15 contracts pass',caught:results.filter(r=>r.caught).length,total:results.length,results},null,2)+'\n');if(results.some(r=>!r.caught))process.exitCode=1;
