/* Application conversation orchestration. Scoring, eligibility, role matching,
   citations and profile facts remain in121/122/131/132/151/152. No I/O or model. */
const CareerApplications=(()=>{
 const load=(name,fallback)=>typeof require!=='undefined'?require('./'+name):fallback;
 const Jobs=load('121-career-jobs.js',typeof CareerJobs!=='undefined'?CareerJobs:null);
 const Profile=load('122-career-profile.js',typeof CareerProfile!=='undefined'?CareerProfile:null);
 const Apply=load('132-career-apply.js',typeof CareerApply!=='undefined'?CareerApply:null);
 const Watch=load('151-career-alert-watch.js',typeof CareerAlertWatch!=='undefined'?CareerAlertWatch:null);
 const Assign=load('152-career-assign.js',typeof CareerAssign!=='undefined'?CareerAssign:null);
 const copy=x=>JSON.parse(JSON.stringify(x)),text=x=>typeof x==='string'?x.trim():'';
 const SPLITS=['Investment Banking Analyst','Private Equity Analyst','Equity Research Analyst'];
 function command(message){
  const m=text(message);let r;
  if((r=/^Approve batch ([a-f0-9]{64})$/.exec(m)))return {action:'approve',reviewHash:r[1]};
  if((r=/^Reconcile batch role ([a-f0-9]{32})$/.exec(m)))return {action:'reconcile',taskId:r[1]};
  if((r=/^Confirm application facts ([a-f0-9]{64})$/.exec(m)))return {action:'facts_confirm',reviewHash:r[1]};
  if(/^(?:Approve batch|Reconcile batch role|Confirm application facts)\b/i.test(m))return {action:'invalid',code:'EXACT_APPLICATION_CONFIRMATION_REQUIRED'};
  if(/^(?:review|prepare (?:a |the )?review (?:of|for)) (?:my |the )?(?:application )?batch[.!]?$/i.test(m))return {action:'review'};
  if(/^(?:show|check|refresh|status(?: of)?) (?:my |the )?(?:application )?batch(?: status)?[.!]?$/i.test(m))return {action:'status'};
  if(!/\b(?:find|show|search|look for|want|need|recommend)\b/i.test(m)||!(/\b(?:investment|private equity|equity research)\b/i.test(m))||!(/\b(?:intern(?:ship)?s?|summer analyst)\b/i.test(m)))return null;
  const n=/\b(\d{1,3}|ten|hundred)\b/i.exec(m),limit=n?(n[1].toLowerCase()==='ten'?10:n[1].toLowerCase()==='hundred'?100:Number(n[1])):10;
  if(limit<1||limit>100)return {action:'invalid',code:'APPLICATION_COUNT_RANGE'};
  return {action:'discover',limit,ask:m};
 }
 function workCountry(profile){
  const c=profile?.constraints||{},explicit=text(c.workCountry).toUpperCase();if(/^[A-Z]{2}$/.test(explicit))return explicit==='UK'?'GB':explicit;
  const auth=text(c.workAuthorization);if(/\b(?:US|U\.S\.|United States)\b/i.test(auth))return 'US';if(/\b(?:UK|United Kingdom)\b/i.test(auth))return 'GB';if(/\bCanada\b/i.test(auth))return 'CA';return null;
 }
 function postingCountry(posting){
  const explicit=text(posting.country).toUpperCase();if(/^[A-Z]{2}$/.test(explicit))return explicit==='UK'?'GB':explicit;
  const loc=text(posting.location);if(/\b(?:USA|United States|US)\b/.test(loc)||Jobs.profileResidence({residence:loc}).states.length)return 'US';
  if(/\b(?:UK|United Kingdom|England|Scotland|Wales|Northern Ireland)\b/i.test(loc))return 'GB';if(/\bCanada\b/i.test(loc))return 'CA';return null;
 }
 function interests(ask,profile){
  const precise=/investment banking/i.test(ask)?[SPLITS[0]]:/private equity/i.test(ask)?[SPLITS[1]]:/equity research/i.test(ask)?[SPLITS[2]]:SPLITS;
  const locations=Array.isArray(profile?.preferences?.locations)?profile.preferences.locations.filter(x=>typeof x==='string'&&x):[];
  return precise.map((split,i)=>({interest_id:'application_intern_'+i,role:Assign.roleSpecFor({split}),filters:{bands:['intern'],locations,remote_ok:locations.length?profile?.preferences?.remote!==false:false}}));
 }
 function scoringProfile(profile){
  const p=profile||{},c=p.constraints||{},facts=(p.facts||[]).filter(f=>f.status==='confirmed'&&!f.needs_confirmation),education=facts.find(f=>f.kind==='education');
  const out={skills:facts.filter(f=>f.kind==='skill').map(f=>({name:f.name||f.title,proven:!f.unproven&&Array.isArray(f.evidence)&&f.evidence.length>0,fact_id:f.id||f.fact_id,evidence:f.evidence||[]})),
   degree:education?.text||'',level:c.level||p.level||'',experience_text:facts.filter(f=>['experience','project','leadership'].includes(f.kind)).map(f=>f.text||'').join(' '),
   constraints:{work_authorization:c.workAuthorization||'',clearance:c.securityClearance||null,graduation_date:c.graduationDate||null,locations:[]},
   preferences:{role_families:['Finance'],locations:[],starred_companies:p.preferences?.targetCompanies||[],excluded_companies:p.preferences?.excludedCompanies||[]}};
  if(typeof c.needsSponsorship==='boolean')out.constraints.needs_sponsorship=c.needsSponsorship;
  if(typeof c.experienceYears==='number'&&Number.isFinite(c.experienceYears))out.experience_years=c.experienceYears;
  if(p.basics?.location)out.residence=p.basics.location;
  return out;
 }
 function missingFacts(profile){
  const out=[],p=profile||{};if(!workCountry(p))out.push('country where you are authorized to work');if(!text(p.constraints?.workAuthorization))out.push('your actual work authorization');
  if(!text(p.constraints?.graduationDate)||!(p.facts||[]).some(f=>f.kind==='education'&&f.status==='confirmed'&&!f.needs_confirmation))out.push('confirmed education and expected graduation date');
  if(!scoringProfile(p).skills.some(s=>s.proven))out.push('confirmed skills with actual supporting evidence');return out;
 }
 function confirmedProfile(profile,input,ref){
  const p=Profile.createProfile(profile||{});p.constraints={...p.constraints,workCountry:input.workCountry,workAuthorization:input.workAuthorization,needsSponsorship:input.needsSponsorship,graduationDate:input.graduationDate,level:input.level};
  if(input.experienceYears!==undefined)p.constraints.experienceYears=input.experienceYears;
  if(input.location)p.basics.location=input.location;
  if(input.education){const existing=p.facts.find(f=>f.kind==='education'&&f.status==='confirmed');const value={kind:'education',text:input.education,title:input.education,status:'confirmed',needs_confirmation:false,source:ref};if(existing)Profile.updateFact(p,existing.id,value);else Profile.addFact(p,value);}
  for(const s of input.skills||[]){const existing=p.facts.find(f=>f.kind==='skill'&&text(f.name||f.title).toLowerCase()===s.name.trim().toLowerCase());const value={kind:'skill',name:s.name,title:s.name,text:s.name,evidence:[s.evidence],status:'confirmed',needs_confirmation:false,source:ref};if(existing)Profile.updateFact(p,existing.id,value);else Profile.addFact(p,value);}return p;
 }
 function factDefaults(profile){const p=profile||{},c=p.constraints||{},facts=(p.facts||[]).filter(f=>f.status==='confirmed'&&!f.needs_confirmation);return {workCountry:workCountry(p)||'',workAuthorization:c.workAuthorization||'',...(typeof c.needsSponsorship==='boolean'?{needsSponsorship:c.needsSponsorship}:{}),graduationDate:c.graduationDate||'',level:c.level||p.level||'',education:facts.find(f=>f.kind==='education')?.text||'',location:p.basics?.location||'',skills:facts.filter(f=>f.kind==='skill'&&!f.unproven&&typeof f.evidence?.[0]==='string').map(f=>({name:f.name||f.title,evidence:f.evidence[0]}))};}
 function assess(posting,careerProfile,scoring,roleInterests,log){
  const families=scoring?.preferences?.role_families;
  if(!Array.isArray(roleInterests)||!roleInterests.length||!Array.isArray(families)||!families.length)return {status:'blocked',code:'ROLE_INTEREST_CONTEXT_REQUIRED'};
  const matched=roleInterests.filter(i=>i?.role&&Array.isArray(i.filters?.bands)&&i.filters.bands.length&&Assign.matchInterest(posting,i,null).matched);
  if(!families.includes(posting.role_family)||!matched.length)return {status:'blocked',code:'ROLE_TARGET_MISMATCH'};
  const row=Apply.triageBatch([posting],{profile:careerProfile,scoringProfile:scoring,log})[0];
  if(row.decision!=='apply')return {status:row.decision==='ask'?'awaiting_user':'blocked',code:'ELIGIBILITY_REVIEW_REQUIRED',asks:row.needs_user_input||[{type:'manual_review',reason:(row.reasons||[]).join('; ')}],reasons:row.reasons};
  const fit=Jobs.scoreFit(posting,scoring),cited=Watch.composeAlert(posting,fit,scoring,0),facts=careerProfile?.facts||[];
  if(!fit.matched_skills.length||!cited.matched_fact_ids.length||cited.matched_fact_ids.length<fit.matched_skills.length||cited.matched_fact_ids.some(id=>!facts.some(f=>(f.id||f.fact_id)===id&&f.kind==='skill'&&f.status==='confirmed'&&!f.needs_confirmation&&!f.unproven&&Array.isArray(f.evidence)&&f.evidence.length)))return {status:'blocked',code:'CONFIRMED_FIT_EVIDENCE_REQUIRED'};
  if(fit.bucket==='Reach')return {status:'blocked',code:'MEANINGFUL_FIT_REQUIRED',reasons:fit.reasons,gaps:fit.gaps};
  return {status:'eligible',roleInterests:matched.map(i=>({id:i.interest_id,role:i.role,filters:i.filters})),fit:{score:fit.score,bucket:fit.bucket,reasons:fit.reasons,gaps:fit.gaps,fitLines:cited.fit_lines,factIds:cited.matched_fact_ids}};
 }
 return {command,workCountry,postingCountry,interests,scoringProfile,missingFacts,confirmedProfile,factDefaults,assess};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=CareerApplications;
