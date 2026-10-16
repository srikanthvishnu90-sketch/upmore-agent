/* Conversation workbench: bounded, source-based conversation state and delivered
   text artifacts. Pure/sync, no provider, execution, authority or module-130 cache.
   This handles explicit conversation speech acts; the existing domain router
   keeps job discovery, approvals, onboarding, tracking and operational work. */
const CareerConversation = (() => {
  const string = v => String(v == null ? "" : v).trim();
  const low = v => string(v).toLowerCase();
  const now = ctx => { const value=typeof ctx.now === "function" ? ctx.now() : ctx.now; const ms=typeof value === "number" ? value : Date.parse(value); return Number.isFinite(ms) ? ms : Date.now(); };
  const quoted = t => string(t).replace(/"[^"]*"|“[^”]*”/g," ");
  const plain = t => quoted(t).replace(/\s+/g," ").trim();
  const hypothetical = t => /^(?:suppose|imagine|if\b|what if|let.s say)/i.test(plain(t));
  const thirdParty = t => /\bmy (?:friend|roommate|cousin|sibling|brother|sister|classmate)\b/i.test(plain(t));
  const assertion = t => !/\b(?:posting|job description)\s*:/i.test(t) && !hypothetical(t) && !thirdParty(t) && !/\?\s*$/.test(t) && !/^(?:what|which|how|why|could|can|would|should|tell|write|draft|show|give|keep|make|rewrite|repeat|recap|summari[sz]e)\b/i.test(plain(t));
  function box(ctx) {
    const mirror=ctx.trackStore && ctx.trackStore._careerThread;
    if (!ctx.conversationState && mirror && mirror.conversation) ctx.conversationState=mirror.conversation;
    return ctx.conversationState || null;
  }
  function write(ctx) {
    const st=box(ctx) || (ctx.conversationState={v:1,facts:{},sources:[],hypotheticals:[],mode:null});
    st.facts ||= {}; st.sources ||= []; st.hypotheticals ||= [];
    return st;
  }
  function mirror(ctx) { if(ctx.trackStore?._careerThread && ctx.conversationState) ctx.trackStore._careerThread.conversation=ctx.conversationState; }
  function remember(st,key,value,text) {
    if(value===undefined||value===null||value==="")return;
    st.facts[key]={value,source:string(text).slice(0,1000),status:"user_reported"};
  }
  function get(st,key) { return st?.facts?.[key]?.value; }
  function lines(ctx) {
    const st=box(ctx),facts=st?.facts||{},out=[];
    const labels={paid:"paid work required",remote_only:"remote work only",part_time:"part-time work",no_relocation:"cannot relocate",exclude_senior:"exclude senior and director roles",sponsorship:"employer sponsorship required"};
    for(const [key,record] of Object.entries(facts)) if(record?.value!=null) out.push(record.value===true&&labels[key]?labels[key]:`${key.replaceAll('_',' ')}: ${Array.isArray(record.value)?record.value.join(', '):record.value}`);
    const thread=ctx.statedFacts?.facts||[];
    for(const f of thread)if(f&&!(f.kind==="geography"&&st?.locationWithdrawn))out.push(`${({target_firm:"target firm",geography:"target city",majors:"field of study",year:"school year"})[f.kind]||f.kind.replaceAll("_"," ")}: ${f.value}`);
    if(ctx.profile?.constraints?.needsSponsorship===true)out.push("needs employer sponsorship: yes, from your saved answer");
    const offer=activeOffer(ctx);if(offer.company)out.push(`offer: ${offer.company}${offer.base_salary?`, $${Number(offer.base_salary).toLocaleString()} base`:""}${offer.deadline?`, decision due ${offer.deadline}`:""}; extension/acceptance remains a separate decision`);
    return [...new Set(out)];
  }
  // Single active location projection, including the shallow-runner mirror.
  // Historical messages, approved payloads, watch records and privacy caches
  // are deliberately not rewritten. Derived unapproved work is invalidated.
  function reconcileLocation(ctx,location,source="user location correction") {
    const city=string(location)||null;
    const st=box(ctx)||(city?write(ctx):null);
    for(const record of [ctx.statedFacts,ctx.trackStore?._careerThread?.facts]) {
      if(!record||!Array.isArray(record.facts))continue;
      record.facts=record.facts.filter(f=>f.kind!=="geography");
      if(city)record.facts.push({kind:"geography",value:city,evidence:source,at:new Date(now(ctx)).toISOString()});
    }
    for(const plan of [ctx.plan,ctx.trackStore?._careerThread?.plan])if(plan&&typeof plan==="object") {
      plan.geography=city;
      if(plan.target&&typeof plan.target==="object")plan.target.geography=city;
      plan.needsReview=true;
      // A previously produced list/draft is not silently reused for a new city.
      if(plan.drafts)plan.drafts=[];
      if(plan.contacts)plan.contacts=[];
    }
    if(ctx.profile&&city)ctx.profile.preferences={...(ctx.profile.preferences||{}),locations:[city]};
    if(st){if(city){remember(st,"target_city",city,source);delete st.locationWithdrawn;}else{delete st.facts.target_city;st.locationWithdrawn=true;}}
    if(ctx.discovery)ctx.discovery.invalidatedBy="location_changed";
    mirror(ctx);
  }
  function withdrawLocation(ctx) {
    const st=write(ctx);st.locationWithdrawn=true;delete st.facts.target_city;
    reconcileLocation(ctx,null,"location withdrawn from active conversation");
    if(ctx.profile?.preferences)ctx.profile.preferences.locations=[];
    // Do not retain an active duplicate inside our conversation evidence.
    st.sources=st.sources.filter(s=>s.kind!=="target_city");
    mirror(ctx);
  }
  function result(intent,reply,extra) { return {intent,reply,resultStatus:"prepared",sends:0,...extra}; }
  function artifact(ctx,kind,body,sources) {
    const st=write(ctx);const rec={kind,format:"text",text:body,status:"draft_not_sent",sourceQuotes:[...new Set(sources.filter(Boolean))]};
    st.artifact=rec;return rec;
  }
  function deliverDraft(ctx,body,kind="email_draft",sources=[],intro="Draft for your review; nothing has been sent.") {
    const rec=artifact(ctx,kind,body,sources);
    return result("conversation_draft",`${intro}\n\n${body}\n\nTell me what to change; no message or application was sent.`,{artifact:rec});
  }
  function activeOffer(ctx) {
    const t=ctx.negotiationThread||ctx.trackStore?._careerThread?.negotiation||{},o=ctx.offer&&typeof ctx.offer==="object"?ctx.offer:{};
    return {company:t.firm||o.company||null,role:t.role||o.role||"role",base_salary:t.amount||o.base_salary||(o.stated_figure ? Number(String(o.stated_figure).replace(/[$,]/g,"")) : null),expiry_date:o.expiry_date||null,deadline:t.deadline||null};
  }
  function profileIntro(ctx) {
    const st=box(ctx),ownFacts=(ctx.statedFacts?.facts||[]).filter(f=>["year","majors","school"].includes(f.kind));
    const year=ownFacts.find(f=>f.kind==="year")?.value,major=ownFacts.find(f=>f.kind==="majors")?.value,school=ownFacts.find(f=>f.kind==="school")?.value;
    const facts=[];if(year||major||school)facts.push(`${year?`I am a ${year}`:"I am a student"}${major?`, studying ${major}`:""}${school?` at ${school}`:""}`);
    if(get(st,"background"))facts.push(get(st,"background"));
    if(get(st,"disputed_experience"))facts.push(get(st,"disputed_experience"));
    if(!facts.length)for(const f of ctx.profile?.facts||[])if(["education","project","skill"].includes(f.kind)&&!f.unproven)facts.push(f.text||f.name||f.title);
    return facts.length?facts.join('; '):null;
  }
  function projectText(ctx) {
    const st=box(ctx);if(st?.project)return st.project;
    const f=(ctx.profile?.facts||[]).find(f=>!f.unproven&&["project","experience"].includes(f.kind));return f&&(f.text||f.title)||null;
  }
  function resumeBullet(ctx) {
    const st=write(ctx),project=projectText(ctx);
    if(!project)return result("conversation_resume_needs_source","I need a confirmed project or experience before writing a resume bullet. What did you do, and in what setting?");
    const body=`Coursework / class project: ${project.replace(/^(?:my (?:only )?(?:technical )?experience is|my only technical experience is|the project was)\s+/i,"").replace(/\.\s*I (?:have )?never[\s\S]*$/i,"").replace(/[.!]+$/,"")}.`;
    const rec=artifact(ctx,"resume_bullet",body,[project]);st.mode="resume";
    return result("conversation_resume",`${body}\n\nSource: your stated class project; this is user-reported, not independently verified employment. No leadership, revenue or unconfirmed skill was added.`,{artifact:rec});
  }
  function interviewRewrite(ctx) {
    const st=write(ctx);const evidence=[st.answer,...(st.outcomes||[])].filter(Boolean);
    if(!evidence.length)return result("conversation_coaching","I need your actual project story before rewriting an interview answer. What happened, and what did you do?");
    return deliverDraft(ctx,evidence.join(' '),"interview_answer",evidence,"Your interview answer, using only the facts you supplied:");
  }
  function feedback(ctx) {
    const st=write(ctx),answer=st.answer||st.project;
    if(!answer)return result("conversation_coaching","Tell me a real project example first. What did you personally do?");
    const numeric=/\b\d+\b|\b(?:one|two|three|four|five) hours?\b/i.test([answer,...(st.outcomes||[])].join(' '));
    const weakness=/\b(?:guess|did not|didn.t|never)\b.*\b(?:validat|check|test)|\bedge cases\b/i.test(st.lastAnswer||answer)
      ?"The validation is the weakness: a guessed rule can silently damage data. Test an ordinary case, an empty value and an ambiguous case, then explain what each result proves."
      :numeric?"The next improvement is ownership and validation: distinguish what you did from the team's work and explain how you checked the result. Don't invent a metric to strengthen it."
      :"The single biggest weakness is the result: explain who benefited and how you observed the impact. A truthful qualitative result is useful if you did not measure a number.";
    return result("conversation_coaching",`You described: ${answer}${st.outcomes?.length ? `\nRecorded result: ${st.outcomes.join(" ")}` : ""}\n${weakness}\n${numeric ? "How did you check that the result followed from your change?" : "What evidence can you add from the actual project?"}`);
  }
  function interviewStart(ctx,text) {
    const st=write(ctx);st.mode="interview";st.question="Tell me about a class or work project where something went wrong: what did you do, and what happened?";
    return result("conversation_interview",`Let's practice one answer at a time. ${st.question}`);
  }
  function nextMove(ctx) {
    const st=box(ctx),city=st?.locationWithdrawn?null:(get(st,"target_city")||(ctx.statedFacts?.facts||[]).find(f=>f.kind==="geography")?.value);
    const firm=(ctx.statedFacts?.facts||[]).find(f=>f.kind==="target_firm")?.value;
    const time=get(st,"availability"),interest=get(st,"interest"),paid=get(st,"paid")?"paid ":"";
    const context=[time?`Within ${time}`:null,firm?`for ${firm}`:null,city?`in ${city}`:null].filter(Boolean).join(', ');
    return result("conversation_next_step",`${context?context+': ':"One next step: "}${firm?`review one sourced analyst profile at ${firm}`:`review one real ${paid}${interest&&/pattern|explain/i.test(interest)?"data analyst ":""}posting or class-project example`}. Write one sentence about why the work fits you; nothing needs to be submitted. ${city?'':st?.locationWithdrawn?'The target city is unknown in this active conversation. ':''}Paste what you find and we can work on it together.`);
  }
  function matchesPosting(posting,st,profile) {
    const t=low([posting.title,posting.location,posting.remote_terms,posting.remote,posting.employment_type,posting.salary].join(' '));
    if(get(st,"exclude_senior")&&/director|senior|head of|manager|principal/.test(t))return false;
    if(get(st,"remote_only")&&(!/\bremote\b/.test(low(posting.remote_terms||posting.remote||posting.location))||/unknown|uncertain|not specified|not remote|hybrid/.test(low(posting.remote_terms||posting.remote||posting.location))))return false;
    if(get(st,"paid")){const pay=posting.salary;const text=low(typeof pay === "object" ? pay?.raw : pay);const positive=typeof pay === "number" ? pay>0 : typeof pay === "object" && (pay?.min>0||pay?.max>0) || /\$\s*\d|\bpaid\b|\bstipend\b/.test(text);if(!positive||/unpaid|unknown|not specified/.test(text))return false;}
    if(get(st,"part_time")&&!/part.time/.test(t))return false;
    if((get(st,"sponsorship")||profile?.constraints?.needsSponsorship===true)&&posting.sponsorship!==true)return false;
    return true;
  }
  function handle(text,ctx,deps={}) {
    const raw=string(text),t=low(raw),prior=box(ctx),offer=activeOffer(ctx);
    // Explicit erasure requests are never silently generalized. This narrow
    // operation withdraws one field from active conversation use, not storage.
    if(/\b(?:forget|erase|delete|remove|stop using)\b/.test(t)&&!/\bduplicate (?:rows|records)\b/.test(t)) {
      if(/\b(?:target (?:city|location)|my (?:target )?city)\b/.test(t)&&!/everywhere|backup|recordings/.test(t)) {
        withdrawLocation(ctx);
        return result("conversation_location_withdrawn","I cannot selectively erase that city from saved account records, earlier chats or backups. I have stopped using the target city in this active conversation and cleared it from this thread's plan and facts. Your education and firm stay on record. This is not account-wide deletion; which city, if any, should this conversation use next?");
      }
      if(/\b(?:forget|erase|delete)\b/.test(t))return result("conversation_forgetting_unsupported","Selective erasure of those saved records or backups is not supported here. I have not deleted them and cannot report that they are gone. The existing full-profile deletion control has its own stated scope; which record are you trying to stop using?");
    }
    if(/\b(?:backups|recordings)\b/.test(t)&&/\b(?:deleted|gone|erased)\b/.test(t))return result("conversation_forgetting_unsupported","No: I cannot confirm deletion of those records or backups. No selective erasure was performed. You can review the full-profile deletion control's scope before using it.");
    // Exact statement-shaped city updates; a hypothetical/question cannot mutate.
    const city=plain(raw).match(/^(?:(?:actually|correction)[,:]?\s*)?(?:(?:use|set)\s+(.+?)\s+as (?:my |the )?(?:target )?city(?: now)?|(?:actually )?(?:use|make it)\s+(.+?)\s+as the city going forward)[.!]*$/i);
    if(city&&!hypothetical(raw)){const value=string(city[1]||city[2]);reconcileLocation(ctx,value,raw);return result("conversation_location_corrected",`The active target city is ${value}. The firm and education are unchanged; existing approvals and saved watches require separate review. What should we review next?`);}
    if(/\b(?:what|which) city\b/.test(t)&&prior?.locationWithdrawn)return result("conversation_location_unknown","The target city is unknown for this active conversation: I stopped using it here. Earlier records were not selectively erased. What city should the plan use, if any?");
    if(/\b(?:new conversation|new thread|this thread)\b/.test(t)&&/\b(?:what did i tell|not shared|ask before assuming)\b/.test(t)&&!(ctx.statedFacts?.facts||[]).length&&!prior)return result("conversation_fresh_thread","I don't have that earlier conversation's plan or target in this thread. I won't assume it from a company name in your question. What would you like me to know here?");
    if(hypothetical(raw)||thirdParty(raw)) {
      const st=write(ctx);st.hypotheticals.push({scope:thirdParty(raw)?"third_party":"hypothetical"});st.hypotheticals=st.hypotheticals.slice(-12);
      return result("conversation_nonactual","That is hypothetical or about another person, not a fact about your experience. It won't become a resume claim or a relocation commitment. We can discuss what would change while keeping your actual constraints in place. Which part would you like to explore?");
    }
    let changed=[];let st=prior;
    const put=(k,v)=>{st=write(ctx);remember(st,k,v,raw);changed.push(k.replaceAll('_',' '));};
    if(assertion(raw)) {
      let m=raw.match(/\b(?:i have|i can spend|i only have)\s+(.{1,65}?(?:minutes?|hours?|afternoons?|mornings?)(?:\s+(?:a|per|each)\s+\w+)?(?:\s+(?:free|daily))?)/i);
      if(m)put("availability",m[1]);
      if(/\b(?:i (?:like|enjoy|prefer)|i.m interested in)\b/.test(t))put("interest",raw.replace(/^[^.]*?\b(?:like|enjoy|prefer|interested in)\s+/i,"").replace(/[.!]+$/,""));
      if(/\b(?:need|require|must be)\b[^.]*\bpaid\b|\brent\b[^.]*\bdue\b/.test(t))put("paid",true);
      if(/\bremote only|\bremote-only/.test(t))put("remote_only",true);
      if(/\bpart.time\b/.test(t))put("part_time",true);
      if(/\b(?:cannot|can.t|won.t) relocate\b/.test(t))put("no_relocation",true);
      if(/\b(?:exclude|skip|not|no)\b[^.]*\b(?:director|senior management)\b/.test(t))put("exclude_senior",true);
      if(/\b(?:i need|require)\b[^.]*\bsponsor/.test(t))put("sponsorship",true);
      if(/\bi (?:do not|don.t) know\b|\bi have never\b/.test(t))put("disputed_experience",raw);
      if(/\b(?:entry.level|junior)\b.*\b(?:role|work|analyst)\b/.test(t))put("role",raw.split(/[.!]/)[0]);
      if(/\b(?:i am|i'm|in reality)\b/.test(t)&&/\b(?:class|major|study|junior|sophomore|senior|freshman)\b/.test(t))put("background",raw.replace(/^.*?in reality\s*/i,""));
      if(/\b(?:my (?:only )?(?:technical )?experience is|in (?:my|our|a|the) [^.]*project|the project was|i (?:built|created|cleaned) [^.]*project)\b/i.test(raw)) {
        st=write(ctx);st.project=raw;st.projectSource=raw;
        if(st.mode==="interview"){st.answer=raw;st.lastAnswer=raw;}else if(/experience/.test(t))st.mode="resume";
        changed.push("class project");
      }
      if(st?.mode==="interview"&&/^(?:in (?:my|our)|i |we |the project)/i.test(raw)&&!changed.includes("class project")) {
        if(/\b(?:rows|records|hours?|minutes?)\b/.test(t)&&/\d|\bone\b|\btwo\b|\bthree\b/.test(t)) {st.outcomes||=[];st.outcomes.push(raw);}else{st.answer||=raw;st.lastAnswer=raw;}
        changed.push("interview evidence");
      }
    }
    if(/\b(?:exhausted|discouraged|overwhelmed|feeling behind|not ready for an application plan)\b/.test(t)) {st=write(ctx);st.mode="reflection";return result("conversation_support",`That sounds exhausting, especially when you feel behind other people.${get(st,"availability") ? ` We can work within ${get(st,"availability")}.` : ""} We can talk it through without turning it into an application plan. What part of the search feels hardest right now?`);}
    if((/\b(?:mock|practice)\b[^.]*\b(?:interview|behavioral)\b/.test(t)||/\b(?:run|practice)\b.*\bbehavioral interview\b/.test(t))&&!(/\b(?:choose|compare|decide)\b/.test(t)&&/\b(?:data|research)\b/.test(t)&&/\b(?:software|backend)\b/.test(t)))return interviewStart(ctx,raw);
    if(/\b(?:ask|one question)\b.*\bone (?:question )?at a time\b|\bask one question at a time\b/.test(t)&&st?.mode==="reflection")return result("conversation_reflection","We can take it one question at a time. Which kind of work leaves you interested enough to keep going, even when it is difficult?");
    if(/\b(?:choose|compare|choice|decide)\b/.test(t)&&/\b(?:data|research)\b/.test(t)&&/\b(?:software|backend)\b/.test(t)) {st=write(ctx);st.mode="choice";st.pendingInterview=/interview/.test(t);return result("conversation_choice","We can compare data or research analysis with software engineering, then take the interview answer as the second task. Analysis often centers on explaining patterns; engineering often centers on building and maintaining systems. Which kind of work do you enjoy doing, rather than only hearing about?");}
    if(/\b(?:second ask|second task|interview part)\b/.test(t)&&st?.pendingInterview){st.pendingInterview=false;return interviewStart(ctx,raw);}
    if(st?.mode==="choice"&&/\b(?:comparison|choice|return|back|start)\b/.test(t))return result("conversation_choice",`Your preference is ${get(st,"interest")||"not yet clear"}. That may point toward data or research analysis, but it is a hypothesis, not a verdict. Try explaining one real data pattern and one small coding change, then compare which work you wanted to improve. We can prepare the interview answer next.`);
    if(/\bwhat (?:does|is)\b.*\b(?:data )?analyst\b/.test(t))return result("conversation_explanation","A data analyst checks data quality, investigates a question, explains patterns and communicates the limits of the evidence. The exact mix depends on the role; a title alone cannot prove the day-to-day work. Which part would you like to try?");
    if(/\b(?:base|salary)\b/.test(t)&&/\b(?:bonus|difference|what is)\b/.test(t))return result("conversation_explanation","Base salary is the fixed salary component stated in an offer. A bonus is additional compensation whose conditions and amount depend on the actual terms; it should not be treated as guaranteed base pay. What does your letter say about the bonus conditions?");
    if(offer.company&&!/\boffered me\b|\b(?:got|received) (?:an? )?offer\b/.test(t)&&/\b(?:ask|request|extend|extension|decide)\b/.test(t)) {
      const date=raw.match(/\b(?:until|through|to|by)\s+((?:next\s+)?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|\d{4}-\d{2}-\d{2})\b/i);
      if(date){st=write(ctx);st.extension={...(st.extension||{}),requestedDeadline:date[1],source:raw};return result("conversation_extension",`You can request a decision-deadline extension until ${date[1]}, while thanking ${offer.company} and making clear you are still considering the offer. An extension is a request, not a promise or acceptance. Want the actual email drafted for review?`);}
    }
    if(offer.company&&/\b(?:push|extend|extension|more time)\b/.test(t)&&!st?.extension){st=write(ctx);st.extension={source:raw};}
    if(offer.company&&(st?.extension||/\bextension\b/.test(t))&&(/\b(?:compose|draft|write)\b.*\b(?:extension|email|letter)\b/.test(t)||(st?.extension?.draft&&/\b(?:shorter|shorten|warmer|friendly|tone)\b/.test(t)))) {
      st=write(ctx);st.extension||={};const ext=deps.Negotiation?.extensionDraft?.(offer,{requested_deadline:st.extension.requestedDeadline||null});
      if(ext?.draft){let body=ext.draft;if(!st.extension.requestedDeadline)body=`Subject: Decision deadline — ${offer.company}\n\nHi [Recruiter name],\n\nThank you for the offer from ${offer.company}. Would it be possible to extend my decision deadline to [requested date — please confirm]? I would appreciate the time to review the offer carefully.\n\nThank you,\n[Your name]`;if(/shorter|shorten|warmer|friendly/.test(t))body=`Subject: Decision deadline — ${offer.company}\n\nHi [Recruiter name],\n\nThank you again for the offer from ${offer.company}. Would you be able to extend my decision deadline to ${st.extension.requestedDeadline||"[requested date — please confirm]"}? I appreciate the time to consider it carefully.\n\nThank you,\n[Your name]`;st.extension.draft=body;return deliverDraft(ctx,body,"extension_email",[st.extension.source,offer.company], `Draft for ${offer.company}${offer.base_salary ? `, $${Number(offer.base_salary).toLocaleString()} base` : ""}; nothing has been sent.`);}
    }
    if(offer.company&&/\b(?:not accepting|undecided|have i accepted|remains undecided)\b/.test(t))return result("conversation_offer_status",`Your decision on the ${offer.company} offer remains undecided; no acceptance is on record here. ${st?.extension?.requestedDeadline?`The proposed extension asks for ${st.extension.requestedDeadline}, but no employer agreement is recorded.`:"No new deadline is confirmed."} Nothing was sent by this handler. What would you like to review before deciding?`);
    if(/\b(?:uploaded|submitted|sent|leave my account|email.*leave|browser.*open|website.*open|website.*opened)\b/.test(t)&&/\b(?:did|have|has|was|are we|can you prove)\b/.test(t))return result("conversation_execution_status","No browser page, upload, application or email was executed by this conversation handler. Drafts here are held for review; earlier work elsewhere would need its own authoritative delivery record. What would you like to review in this chat?");
    if(/\b(?:no cost|zero cost|unavailable|integration|live.verified|guesses|current .*careers page)\b/.test(t)||/\bwhat.*paste\b/.test(t))return result("conversation_capability","I can review pasted postings, discuss your profile, coach an answer and draft text at no cost here. Public browser execution and external sends are not connected, so current openings are unverified unless you supply a source. Paste the posting, its URL, location and requirements; I will distinguish that supplied source from a live check.");
    if(/\b(?:introduction|intro)\b/.test(t)&&/\b(?:write|draft|compose)\b/.test(t)){const background=profileIntro(ctx);if(!background)return result("conversation_intro_unknown","I need your actual education or project background before writing an introduction. What would you like to confirm?");return deliverDraft(ctx,`My background: ${background}.\nI am describing my own coursework and experience; anything not confirmed here remains unknown.`,"introduction",[background]);}
    if(/\b(?:date|deadline)\b/.test(t)&&/\b(?:do not invent|placeholder|not chosen)\b/.test(t))return result("conversation_extension_date_unknown","The requested extension date is unknown. The draft must retain a date placeholder until you choose it; no date was promised or sent. What date would you like to request?");
    if(/\b(?:hypothetical|verified|actual|those details|statements)\b/.test(t)&&/\b(?:which|tell me|keep .* off)\b/.test(t))return result("conversation_evidence",`Actual user-reported background: ${profileIntro(ctx)||"not supplied"}. Hypothetical and third-party achievements remain unverified and excluded from your resume. None of these statements is independently verified. What would you like to confirm next?`);
    if(/\b(?:never|not|no|none)\b.*\b(?:lead|managed|production|experience)|\b(?:lead|managed|production|experience)\b.*\b(?:none|never|did not)\b/.test(t)&&/\b(?:make it sound|add .*experience)\b/.test(t))return result("conversation_truth_guard","I won't invent leadership or work experience. We can write a truthful class-project bullet from the work you actually described. Would you like that version?");
    if(st?.mode==="interview") {
      if(/\b(?:rewrite|actual answer|write my .*answer)\b/.test(t))return interviewRewrite(ctx);
      if(/\b(?:follow.up|ask).*\b(?:delimiter|validation|decision)\b/.test(t)){const topic=raw.match(/\b(?:delimiter|validation|decision)\b/i)?.[0]||"approach";return result("conversation_interview",`How did you choose your ${topic} approach, and what test would show that it handles an ambiguous case correctly?`);}
      if(/\b(?:weakness|missing|feedback|improve|biggest)\b/.test(t)||changed.includes("interview evidence"))return feedback(ctx);
      if(changed.includes("class project"))return feedback(ctx);
    }
    const pastedPosting=raw.match(/\b(?:posting|job description)\s*:\s*([\s\S]+)/i);
    if(pastedPosting&&/\btailor\b[^.]*\bresume\b/.test(t)&&deps.tailor&&ctx.profile){
      ctx.posting={source:"user_pasted",jd_text:pastedPosting[1],pasted_at:new Date(now(ctx)).toISOString()};
      const tailored=deps.tailor(raw,ctx);
      if(tailored?.artifact?.text){const saved=artifact(ctx,"tailored_resume",tailored.artifact.text,(ctx.profile.facts||[]).filter(f=>!f.unproven).map(f=>f.text||f.name||f.title));tailored.reply+=`\n\nThe actual resume text for review:\n${saved.text}`;}
      return tailored;
    }
    if(/\b(?:resume|bullet|coursework|class project)\b/.test(t)&&/\b(?:tailor|draft|write|show|revised|use only|truthful|keep it truthful|label)\b/.test(t))return resumeBullet(ctx);
    if(st?.artifact&&/\b(?:source|supports|prove|evidence)\b/.test(t))return result("conversation_artifact_source",`The source is your stated experience: ${st.artifact.sourceQuotes.join(' ')}. The text uses those user-reported facts only; it is not independent verification. What needs correcting?`);
    if(/\b(?:director|senior)\b/.test(t)&&/\b(?:posting|role|pass|match)\b/.test(t)&&get(st,"exclude_senior"))return result("conversation_constraints","Exclude that director or senior role: a keyword match cannot override your seniority constraint. Unknown eligibility is also not a verified fit. Paste an entry-level posting and we can check each stated requirement.");
    if(/\b(?:recap|summari[sz]e|repeat .*constraints|what.*retain|what.*kept|what.*changed)\b/.test(t)&&st) {
      const summary=lines(ctx);const scope=st.locationWithdrawn?" The active target city is unknown; earlier account records were not erased.":"";
      return result("conversation_recap",`From this conversation's user-reported record: ${summary.length?summary.join('; '):"no personal facts have been supplied"}.${scope} Experience or constraints not stated remain unknown. Existing approvals and watches still require separate review after a correction. What should we work on next?`);
    }
    if(/\b(?:one .*next step|one small step|single next|next .*move|next networking move|opening move|next step|one networking move)\b/.test(t)&&st)return nextMove(ctx);
    if(changed.length&&/\b(?:network|find|watch|track|send|apply)\b/.test(t))return null;
    if(changed.length){mirror(ctx);return result("conversation_facts",`Recorded from your words: ${lines(ctx).join('; ')}. These are user-reported constraints, not independently verified credentials. ${st?.mode==="reflection"?"We can keep this small and talk it through. ":""}What should we work on next?`);}
    return null;
  }
  return {handle,reconcileLocation,deliverDraft,matchesPosting,box};
})();
if(typeof module!=="undefined"&&module.exports)module.exports=CareerConversation;
