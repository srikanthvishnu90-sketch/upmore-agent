import { costMicros, toOpenAI } from "../../supabase/functions/_shared/model_gateway.ts";
import { armSummary, BudgetJournal, canonical, CATEGORY_COUNTS, compareArms, completeJudgment, fixtureBrain, independentSummary, modelPreflight, recoverJournal, reservationMicros, runArm, sha256, strictVerdict, validateApproval, verifyFirstArm, validateCorpus, VERSION, type ArmResult, type CallMeta, type Corpus } from "../../evals/brain-reliability/run-comparison.ts";

function assert(ok: unknown, why = "assertion failed"): asserts ok { if (!ok) throw new Error(why); }
Deno.test("comparison: higher brain model has explicit uncached, cached and output prices", () => {
  assert(costMicros("gpt-5", { input_tokens: 1000000, cache_read_input_tokens: 1000000, output_tokens: 1000000 }) === 11375000,
    "gpt-5 is unpriced or its public token prices are wrong");
});
Deno.test("comparison: GPT-5 adapter retains reasoning token headroom and omits temperature", () => {
  const body = toOpenAI({ max_tokens: 1000, temperature: 0, messages: [{ role: "user", content: "fixture" }] },
    { provider: "openai", model: "gpt-5", apiKey: "not-a-key", reasoningEffort: "minimal" });
  assert(body.max_completion_tokens === 1512 && body.reasoning_effort === "minimal" && !("temperature" in body));
});
const meta: CallMeta = { case_id: "fixture-1", category: "help_scope", model: "gpt-5-mini", role: "brain", turn: 0 };
function throws(fn: () => unknown, needle = "") { try { fn(); } catch (e) { assert(String(e).includes(needle)); return; } throw new Error("expected failure"); }
async function rejects(fn: () => Promise<unknown>, needle = "") { try { await fn(); } catch (e) { assert(String(e).includes(needle)); return; } throw new Error("expected failure"); }
function corpus(): Corpus { let id = 0; return { version: VERSION, seed: "fixture-seed", clock_utc: "2026-10-21T12:00:00Z", items: Object.entries(CATEGORY_COUNTS).flatMap(([category, n]) => Array.from({ length: n }, () => ({ id: `fixture-${++id}`, task_type: `distinct-${id}`, category, persona: "synthetic unit fixture", turns: [`unit-only task ${id}`], must: ["unit-only rubric"], must_not: [], development_overlap: false }))) }; }
async function validated(c: Corpus) { const raw = JSON.stringify(c); return validateCorpus(raw, { version: "brain-reliability-320-manifest-v1", sha256: await sha256(raw), item_count: 320, category_counts: CATEGORY_COUNTS, synthetic_only: true }); }
Deno.test("comparison: corpus validates fixed count, categories, uniqueness and aligned threads", async () => {
  assert((await validated(corpus())).items.length === 320);
  const repeated = corpus(); repeated.items[1].id = repeated.items[0].id;
  await rejects(() => validated(repeated), "IDs");
  const misaligned = corpus(); misaligned.items[0].turn_contexts = [];
  await rejects(() => validated(misaligned), "align");
});
Deno.test("comparison: corpus rejects tampered bytes, non-synthetic data and injected tool outputs", async () => {
  const c = corpus(), raw = JSON.stringify(c), m = { version: "brain-reliability-320-manifest-v1", sha256: await sha256(raw), item_count: 320, category_counts: CATEGORY_COUNTS, synthetic_only: true };
  await rejects(() => validateCorpus(raw + " ", m), "bytes");
  await rejects(() => validateCorpus(raw, { ...m, synthetic_only: false }), "synthetic");
  c.items[0].fixture = { tool_outcomes: { magical_success: true } };
  await rejects(() => validated(c), "unsupported fixture");
});
Deno.test("comparison: synchronous reservations prevent concurrent workers exceeding a shared cap", () => {
  const events: any[] = [], journal = new BudgetJournal(100, (e) => events.push(e));
  const a = journal.reserve(meta, 60); throws(() => journal.reserve(meta, 50), "exhausted");
  journal.settle(a, meta, { input_tokens: 40, output_tokens: 0 }, 8);
  journal.reserve(meta, 90); assert(events.length === 3 && journal.snapshot().usd_micros === 10);
});
Deno.test("comparison: reservation is durable before a call can start and append failures fail closed", () => {
  const journal = new BudgetJournal(100, () => { throw new Error("disk full"); });
  throws(() => journal.reserve(meta, 60), "disk full"); assert(journal.snapshot().reserved_micros === 0);
});
Deno.test("comparison: lost response stays UNKNOWN, holds its reservation and poisons further calls", () => {
  const events: any[] = [], journal = new BudgetJournal(100, (e) => events.push(e));
  journal.settle(journal.reserve(meta, 60), meta, null, 15);
  assert(journal.snapshot().unknown_charges === 1 && journal.snapshot().reserved_micros === 60);
  throws(() => journal.reserve(meta, 1), "unresolved");
  const recovered = recoverJournal(events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  assert(!recovered.score_valid && recovered.unknown_charges === 1 && recovered.reserved_micros === 60);
});
Deno.test("comparison: crash recovery retains dispatched reservation and rejects torn journal records", () => {
  const events: any[] = [], journal = new BudgetJournal(100, (e) => events.push(e)); journal.reserve(meta, 60);
  const raw = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  assert(recoverJournal(raw).unsettled_calls === 1); throws(() => recoverJournal(raw + '{"type":'));
});
Deno.test("comparison: metered cost over reservation is recorded and invalidates the arm", () => {
  const journal = new BudgetJournal(10, () => {}), call = journal.reserve(meta, 5);
  throws(() => journal.settle(call, meta, { input_tokens: 100, output_tokens: 0 }, 2), "exceeded");
  assert(journal.snapshot().usd_micros === 25 && journal.snapshot().stopped);
});
Deno.test("comparison: cost bound includes input, framing and reasoning output; media and unknown models fail", () => {
  const cfg = { provider: "openai" as const, model: "gpt-5", apiKey: "fixture", reasoningEffort: "minimal" };
  const payload = { messages: [{ role: "user", content: "unit" }], max_tokens: 1000 };
  assert(reservationMicros(cfg, payload) > 1512 * 10 + 4096 * 1.25);
  throws(() => reservationMicros({ ...cfg, model: "unpriced" }, payload), "unpriced");
  throws(() => reservationMicros(cfg, { ...payload, messages: [{ role: "user", content: [{ type: "image", source: { media_type: "image/png", data: "abc" } }] }] }), "non-text");
});
Deno.test("comparison: both fixed judges are required and contradictory verdicts are errors", () => {
  assert(!completeJudgment([{ model: "gpt-5-mini", pass: true }, { model: "gpt-4.1-mini", pass: false }]));
  throws(() => completeJudgment([{ model: "gpt-5-mini", pass: true }, { model: "gpt-5-mini", pass: true }]), "distinct");
  throws(() => strictVerdict(JSON.stringify({ pass: true, failed: ["required task"], score: 5, note: "contradiction" })), "contradicts");
});
function arm(model = "gpt-5-mini"): ArmResult {
  const items = corpus().items.map((i) => ({ id: i.id, category: i.category, development_overlap: false, pass: true, latency_ms: 10, input_tokens: 4, output_tokens: 1, cached_tokens: 0, usd_micros: model === "gpt-5" ? 15 : 3, judges: [{ model: "gpt-5-mini", pass: true }, { model: "gpt-4.1-mini", pass: true }] }));
  const calls = items.flatMap((i, n) => [ { ...meta, call_id: n * 3 + 1, case_id: i.id, category: i.category, model, role: "brain" as const, reserve_micros: 100, latency_ms: 1, usage: {input_tokens:4,output_tokens:1}, usd_micros:i.usd_micros, status:"settled" as const }, ...["gpt-5-mini","gpt-4.1-mini"].map((m,k)=>({ ...meta, call_id:n*3+k+2, case_id:i.id, category:i.category,model:m,role:"judge" as const,reserve_micros:100,latency_ms:1,usage:{input_tokens:0,output_tokens:0},usd_micros:0,status:"settled" as const })) ]);
  return { model, identity: { source_commit: "a".repeat(40), corpus_sha256: "b".repeat(64), rubric_sha256: "c".repeat(64), clock_utc: "2026-10-21T12:00:00Z", seed: "fixed", concurrency: 4, params: { reasoning_effort: "minimal" } }, status: "SCORED", planned: 320, ledger: { ...new BudgetJournal(100000, () => {}).snapshot(),usd_micros:items.reduce((s,i)=>s+i.usd_micros,0) },items,calls };
}
Deno.test("comparison: stopped or judge-incomplete arms never produce a score", () => {
  const a = arm(); a.items[0].judges.pop(); assert(armSummary(a).full === null);
  const b = arm(); b.status = "NOT_SCORED"; assert(armSummary(b).full === null);
});
Deno.test("comparison: paired comparison checks identity and uses case-paired deltas with denominators", () => {
  const a = arm(), b = arm("gpt-5"); b.items[0].pass = false; b.items[0].judges[1].pass = false; b.items[0].latency_ms = 330;
  const r = compareArms(a, b); assert(r.paired.n === 320 && r.paired.score_delta === -1 / 320 && r.paired.mean_latency_delta_ms === 1);
  assert(r.categories.search_refinement.n === 56 && r.categories.search_refinement.discordant_regressed === 1);
  b.identity.source_commit = "d".repeat(40); throws(() => compareArms(a, b), "differ");
});
Deno.test("comparison: canonical identity ignores object-key ordering only", () => {
  assert(canonical({ z: 1, a: [2, 1] }) === '{"a":[2,1],"z":1}'); assert(canonical([1, 2]) !== canonical([2, 1]));
});
Deno.test("comparison: availability preflight uses read-only model GET and fails closed", async () => {
  let calls = 0;
  await modelPreflight("fixture-key", ["gpt-5"], (async (url: string | URL | Request, init?: RequestInit) => { calls++; assert(String(url).endsWith("/models/gpt-5") && !init?.method && !init?.body); return Response.json({ id: "gpt-5" }); }) as typeof fetch);
  assert(calls === 1); await rejects(() => modelPreflight("fixture-key", ["gpt-5"], (async () => new Response("", { status: 404 })) as typeof fetch), "preflight failed");
});
Deno.test("comparison: repeated task labels are allowed but identical scenario content is rejected", async () => {
  const c = corpus(); c.items[1].task_type = c.items[0].task_type; await validated(c);
  c.items[1].turns = c.items[0].turns; await rejects(() => validated(c), "duplicate scenario content");
});
Deno.test("comparison: duplicate result IDs, wrong categories and ledger mismatches are NOT_SCORED", () => {
  const duplicate = arm(); duplicate.items[1].id = duplicate.items[0].id; assert(armSummary(duplicate).status === "NOT_SCORED");
  const category = arm(); category.items[0].category = "memory_goals"; assert(armSummary(category).status === "NOT_SCORED");
  const ledger = arm(); ledger.ledger.usd_micros++; assert(armSummary(ledger).status === "NOT_SCORED");
  const call = arm(); call.calls[0].usd_micros = call.calls[0].usd_micros! + 1; assert(armSummary(call).status === "NOT_SCORED");
  const usage = arm(); usage.items[0].input_tokens++; assert(armSummary(usage).status === "NOT_SCORED");
});
Deno.test("comparison: self-consistent negative or fractional token artifacts are not metered evidence", () => {
  for (const input of [-4, .5]) {
    const bad = arm(), call = bad.calls[0], item = bad.items[0], previous = call.usd_micros!;
    call.usage!.input_tokens = input; call.usd_micros = costMicros(call.model, call.usage)!;
    item.input_tokens = input; item.usd_micros += call.usd_micros - previous;
    bad.ledger.usd_micros += call.usd_micros - previous;
    assert(armSummary(bad).status === "NOT_SCORED", "arithmetic consistency promoted invalid provider usage to a score");
  }
  assert(armSummary(arm()).status === "SCORED", "valid integer metering must remain accepted");
});
Deno.test("comparison: no score transfers to independent third judge or mismatched judging packet", () => {
  const a = arm(); assert(armSummary(a).score_kind === "CI_INTERSECTION" && armSummary(a).final_acceptance.startsWith("NOT_RUN"));
  for (const i of a.items) i.judging_packet_sha256 = "a".repeat(64);
  const third = { judge_id: "Instinct" as const, owner_appointment_ref: "unit-only fixture", model: a.model, identity: a.identity, items: a.items.map((i) => ({id:i.id,judging_packet_sha256:i.judging_packet_sha256!,pass:true,note:"unit"})) };
  assert(independentSummary(a, third).clean_heldout_threshold_met);
  third.items[0].judging_packet_sha256 = "b".repeat(64); throws(() => independentSummary(a, third), "packet");
});
Deno.test("comparison: owner approval binds model, candidate, corpus and new-money headroom", () => {
  const a = { owner_approval_ref: "unit-only owner fixture", model:"gpt-5",source_commit:"a".repeat(40),corpus_sha256:"b".repeat(64),cap_usd:8,new_budget_spent_usd:.139984,other_reserved_usd:0,ledger_snapshot_at:"2026-10-21T12:00:00Z",comparison_cap_usd:20,comparison_spent_usd:0,first_arm_evidence:{result_path:"unit-only",sha256:"c".repeat(64),verified_by:"unit",verification_ref:"unit"} };
  validateApproval(a, a.model, a.source_commit, a.corpus_sha256,Date.parse(a.ledger_snapshot_at));
  throws(() => validateApproval(a,"gpt-5-mini",a.source_commit,a.corpus_sha256,Date.parse(a.ledger_snapshot_at)), "bound");
  throws(() => validateApproval({...a,cap_usd:12},a.model,a.source_commit,a.corpus_sha256,Date.parse(a.ledger_snapshot_at)), "over-$10");
  throws(() => validateApproval({...a,cap_usd:8,other_reserved_usd:30},a.model,a.source_commit,a.corpus_sha256,Date.parse(a.ledger_snapshot_at)), "$35");
});
Deno.test("comparison: fixture passes own account facts, never the judge-only persona, into the real brain", async () => {
  const it = corpus().items[0]; it.persona = "JUDGE_ONLY_SENTINEL"; it.turns = ["What do you know about me?", "What do you know about me?"]; it.turn_contexts=[{thread_id:"old"},{thread_id:"new"}];
  it.initial_state = { profile:{id:"profile-1",basics:{},constraints:{},preferences:{},facts:[{id:"F-001",kind:"skill",text:"I use SQL",status:"confirmed",needs_confirmation:false}]} };
  let calls=0;
  const result = await fixtureBrain(it,"2026-10-21T12:00:00Z",async(payload)=>{calls++;assert(!JSON.stringify(payload).includes("JUDGE_ONLY_SENTINEL"));assert(payload.system.includes("I use SQL"));return {content:[{type:"text",text:"Your confirmed skill is SQL. What would you like to do next?"}],stop_reason:"end_turn"};});
  assert(calls===2 && result.replies.length===2 && Object.keys(result.state.threads).length===2);
});
Deno.test("comparison: fixture executes real standing-memory writes and carries them into a fresh thread", async () => {
  const it = corpus().items[0]; it.turns=["I need visa sponsorship.","What is my standing instruction?"];it.turn_contexts=[{thread_id:"old"},{thread_id:"new"}];let first=true;
  const result=await fixtureBrain(it,"2026-10-21T12:00:00Z",async(payload,turn)=>{
    if(turn===0 && first){first=false;return {content:[{type:"tool_use",id:"fixture-tool",name:"remember_instruction",input:{instruction:"Needs visa sponsorship",quote:"I need visa sponsorship"}}],stop_reason:"tool_use"};}
    if(turn===1)assert(payload.system.includes("Needs visa sponsorship"));
    return {content:[{type:"text",text:turn===0?"I saved your sponsorship instruction. What kind of role are you looking for?":"You need visa sponsorship. What kind of role are you looking for?"}],stop_reason:"end_turn"};
  });
  assert(result.state.standing[`synthetic-${it.id}`].length===1 && result.state.standing[`synthetic-${it.id}`][0].said==="I need visa sponsorship");
});
Deno.test("comparison: judges see an earlier nonanswer even when the last reply answers correctly", async () => {
  const it = corpus().items[0]; it.turns=["What is my confirmed skill?","Please answer the skill question now."];
  it.initial_state={profile:{id:"profile-1",basics:{},constraints:{},preferences:{},facts:[{id:"F-001",kind:"skill",text:"I use SQL",status:"confirmed",needs_confirmation:false}]}};
  const c={...corpus(),items:[it]}, events:any[]=[], journal=new BudgetJournal(1000000,e=>events.push(e));let brainCalls=0,judgeCalls=0;
  const fake=(async(_url:unknown,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body));let content:string;
    if(body.messages[0].content==="Grade strictly. Return only the requested JSON object."){
      const prompt=body.messages[1].content;assert(prompt.includes("Which role would you like to focus on next?") && prompt.includes("Your confirmed skill is SQL.") && prompt.includes("EVERY assistant turn"));judgeCalls++;
      content=JSON.stringify({pass:false,failed:["earlier skill question was not answered"],score:2,note:"The final correct answer did not erase the earlier nonanswer."});
    }else{brainCalls++;content=brainCalls===1?"Which role would you like to focus on next?":"Your confirmed skill is SQL. Which role would you like to focus on next?";}
    return Response.json({model:body.model,choices:[{message:{content},finish_reason:"stop"}],usage:{prompt_tokens:100,completion_tokens:10}});
  }) as typeof fetch;
  const result=await runArm(c,{...arm().identity,concurrency:1},"gpt-5-mini",journal,e=>events.push(e),"unit-key",fake);
  assert(brainCalls===2 && judgeCalls===2 && result.items[0].pass===false && result.calls.length===4);
  assert(result.items[0].judging_packet_sha256?.length===64 && result.items[0].latency_ms<=result.items[0].evaluation_latency_ms!);
});
Deno.test("comparison: lost provider usage remains unknown and invalidates arm without hidden retry", async () => {
  const it=corpus().items[0],c={...corpus(),items:[it]},journal=new BudgetJournal(1000000,()=>{});let calls=0;
  const fake=(async()=>{calls++;return Response.json({choices:[{message:{content:"unit"},finish_reason:"stop"}]});}) as typeof fetch;
  const result=await runArm(c,{...arm().identity,concurrency:1},"gpt-5-mini",journal,()=>{},"unit-key",fake);
  assert(calls===1 && result.status==="NOT_SCORED" && result.items[0].pass===null && result.ledger.unknown_charges===1 && result.ledger.reserved_micros>0);
});
Deno.test("comparison: judge parse failure preserves known charge and is NOT_SCORED", async () => {
  const it=corpus().items[0];it.turns=["What is my confirmed skill?"];it.initial_state={profile:{id:"profile-1",basics:{},constraints:{},preferences:{},facts:[{id:"F-001",kind:"skill",text:"I use SQL",status:"confirmed",needs_confirmation:false}]}};
  const c={...corpus(),items:[it]},journal=new BudgetJournal(1000000,()=>{});let calls=0;
  const fake=(async(_url:unknown,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));calls++;return Response.json({model:body.model,choices:[{message:{content:calls===1?"Your confirmed skill is SQL. Which role would you like next?":"invalid verdict"},finish_reason:"stop"}],usage:{prompt_tokens:100,completion_tokens:10}});}) as typeof fetch;
  const result=await runArm(c,{...arm().identity,concurrency:1},"gpt-5-mini",journal,()=>{},"unit-key",fake);
  assert(calls===2 && result.status==="NOT_SCORED" && result.items[0].pass===null && result.ledger.usd_micros===90 && result.ledger.unknown_charges===0);
});
Deno.test("comparison: an incomplete product answer is failed while later cases still execute", async () => {
  const a=corpus().items[0],b=corpus().items[1];a.turns=["What is my confirmed skill?"];b.turns=["What is my confirmed skill?"];
  for(const it of [a,b])it.initial_state={profile:{id:"profile-1",basics:{},constraints:{},preferences:{},facts:[{id:"F-001",kind:"skill",text:"I use SQL",status:"confirmed",needs_confirmation:false}]}};
  const c={...corpus(),items:[a,b]},journal=new BudgetJournal(1000000,()=>{});let brainCalls=0,judgeCalls=0;
  const fake=(async(_url:unknown,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));let content:string;
    if(body.messages[0].content==="Grade strictly. Return only the requested JSON object."){judgeCalls++;content=JSON.stringify({pass:true,failed:[],score:5,note:"unit judge, product stop must still force failure"});}
    else{brainCalls++;content=brainCalls<=2?"Is that right?":"Your confirmed skill is SQL. Which role would you like next?";}
    return Response.json({model:body.model,choices:[{message:{content},finish_reason:"stop"}],usage:{prompt_tokens:100,completion_tokens:10}});
  }) as typeof fetch;
  const result=await runArm(c,{...arm().identity,concurrency:1},"gpt-5-mini",journal,()=>{},"unit-key",fake);
  assert(result.items.length===2 && result.items[0].pass===false && result.items[1].pass===true && judgeCalls===4 && result.status==="SCORED");
});
Deno.test("comparison: passing overlap cases cannot lift sub95 clean heldout performance into acceptance", () => {
  const a=arm();for(let n=0;n<a.items.length;n++)a.items[n].development_overlap=n<9;
  for(const i of a.items)i.judging_packet_sha256="a".repeat(64);
  const third={judge_id:"Instinct" as const,owner_appointment_ref:"unit-only fixture",model:a.model,identity:a.identity,items:a.items.map((i,n)=>({id:i.id,judging_packet_sha256:i.judging_packet_sha256!,pass:n<304,note:"unit"}))};
  const r=independentSummary(a,third);assert(r.full.n===320 && r.full.passed===304 && r.full_descriptive_threshold_met);
  assert(r.clean.n===311 && r.clean.passed===295 && !r.clean_heldout_threshold_met);
});
Deno.test("comparison: stale or future owner ledger snapshots fail before provider dispatch", () => {
  const now=Date.parse("2026-10-21T17:00:00Z"), a={owner_approval_ref:"unit-only fixture",model:"gpt-5-mini",source_commit:"a".repeat(40),corpus_sha256:"b".repeat(64),cap_usd:5,new_budget_spent_usd:.139984,other_reserved_usd:0,ledger_snapshot_at:new Date(now).toISOString(),comparison_cap_usd:20,comparison_spent_usd:0};
  validateApproval(a,a.model,a.source_commit,a.corpus_sha256,now);
  throws(()=>validateApproval({...a,ledger_snapshot_at:new Date(now-1800001).toISOString()},a.model,a.source_commit,a.corpus_sha256,now),"no older");
  throws(()=>validateApproval({...a,ledger_snapshot_at:new Date(now+300001).toISOString()},a.model,a.source_commit,a.corpus_sha256,now),"future");
});
Deno.test("comparison: mini allocation and total comparison cap cannot exceed the owner's word", () => {
  const now=Date.parse("2026-10-21T17:00:00Z"),a={owner_approval_ref:"unit-only fixture",model:"gpt-5-mini",source_commit:"a".repeat(40),corpus_sha256:"b".repeat(64),cap_usd:5,new_budget_spent_usd:.139984,other_reserved_usd:0,ledger_snapshot_at:new Date(now).toISOString(),comparison_cap_usd:20,comparison_spent_usd:0};
  validateApproval(a,a.model,a.source_commit,a.corpus_sha256,now);
  throws(()=>validateApproval({...a,cap_usd:5.000001},a.model,a.source_commit,a.corpus_sha256,now),"mini arm");
  throws(()=>validateApproval({...a,comparison_cap_usd:21},a.model,a.source_commit,a.corpus_sha256,now),"$20");
  throws(()=>validateApproval({...a,comparison_spent_usd:16},a.model,a.source_commit,a.corpus_sha256,now),"$20");
});
async function higherApproval(first:ArmResult) {
  for (const it of first.items) {
    it.judging_packet ??= `Original synthetic judging packet for ${it.id}`;
    it.judging_packet_sha256 ??= await sha256(it.judging_packet);
  }
  const raw=JSON.stringify(first),spent=first.ledger.usd_micros/1000000;
  return {raw,a:{owner_approval_ref:"unit-only owner allocation",owner_allocated_pool_ref:"unit-only approved $20 pool",model:"gpt-5",source_commit:first.identity.source_commit,corpus_sha256:first.identity.corpus_sha256,
    cap_usd:Math.round((20-spent)*1000000)/1000000,approved_over_ten:true,new_budget_spent_usd:null,other_reserved_usd:null,ledger_snapshot_at:null,comparison_cap_usd:20,comparison_spent_usd:spent,
    first_arm_evidence:{result_path:"private-unit-fixture.json",sha256:await sha256(raw),verified_by:"unit judge",verification_ref:"unit verified artifact"}}};
}
Deno.test("comparison: higher arm uses only20 minus complete verified same-identity mini cost", async () => {
  const first=arm(),{raw,a}=await higherApproval(first);
  validateApproval(a,a.model,a.source_commit,a.corpus_sha256);
  const proof=await verifyFirstArm(a,first.identity,raw);
  assert(proof.exact_metered_usd===.00096 && proof.comparison_remaining_usd===19.99904);
  throws(()=>validateApproval({...a,cap_usd:20},a.model,a.source_commit,a.corpus_sha256),"$20");
  await rejects(()=>verifyFirstArm({...a,comparison_spent_usd:.000959},first.identity,raw),"differs from verified");
});
Deno.test("comparison: higher rejects missing, tampered, incomplete or different-source first-arm proof", async () => {
  const first=arm(),{raw,a}=await higherApproval(first);
  throws(()=>validateApproval({...a,first_arm_evidence:undefined},a.model,a.source_commit,a.corpus_sha256),"first-arm");
  await rejects(()=>verifyFirstArm(a,first.identity,raw+" "),"byte hash");
  await rejects(()=>verifyFirstArm(a,{...first.identity,source_commit:"d".repeat(40)},raw),"parameters differ");
  await rejects(()=>verifyFirstArm(a,{...first.identity,corpus_sha256:"d".repeat(64)},raw),"parameters differ");
  const incomplete=arm();incomplete.status="NOT_SCORED";const missing=await higherApproval(incomplete);
  await rejects(()=>verifyFirstArm(missing.a,incomplete.identity,missing.raw),"complete, reconciled");
  const wrong=arm("gpt-5"),bad=await higherApproval(wrong);
  await rejects(()=>verifyFirstArm(bad.a,wrong.identity,bad.raw),"mini result");
});
Deno.test("comparison: higher verifies embedded judging packet bytes rather than trusting hash labels", async () => {
  const first = arm();
  first.items[0].judging_packet = "Original synthetic judging packet";
  first.items[0].judging_packet_sha256 = await sha256("A different synthetic judging packet");
  const altered = await higherApproval(first);
  await rejects(() => verifyFirstArm(altered.a, first.identity, altered.raw), "packet");
  const missing = arm(), complete = await higherApproval(missing);
  delete missing.items[0].judging_packet;
  const raw = JSON.stringify(missing), digest = await sha256(raw);
  await rejects(() => verifyFirstArm({ ...complete.a, first_arm_evidence: { ...complete.a.first_arm_evidence, sha256: digest } }, missing.identity, raw), "packet");
});
Deno.test("comparison: mini over central estimate requires explicit owner recheck without changing candidate", async () => {
  const first=arm();let callId=0;
  first.calls=first.items.flatMap(i=>{
    i.input_tokens=8;i.output_tokens=3400;i.usd_micros=6802;
    return [0,1,2,3].map(n=>({...meta,call_id:++callId,case_id:i.id,category:i.category,model:n<2?"gpt-5-mini":n===2?"gpt-5-mini":"gpt-4.1-mini",role:n<2?"brain" as const:"judge" as const,
      reserve_micros:10000,latency_ms:1,usage:{input_tokens:n<2?4:0,output_tokens:n<2?1700:0},usd_micros:n<2?3401:0,status:"settled" as const}));
  });
  first.ledger.usd_micros=first.items.reduce((n,i)=>n+i.usd_micros,0);
  const {raw,a}=await higherApproval(first);validateApproval(a,a.model,a.source_commit,a.corpus_sha256);
  await rejects(()=>verifyFirstArm(a,first.identity,raw),"explicit owner re-check");
  const proof=await verifyFirstArm({...a,mini_over_estimate_recheck_ref:"unit-only explicit owner message"},first.identity,raw);
  assert(proof.exact_metered_usd===2.17664 && proof.comparison_remaining_usd===17.82336);
});
Deno.test("comparison: an estimate recheck cannot approve a first arm above the mini hard cap", async () => {
  const first = arm(); let next = 0;
  first.calls = first.items.flatMap((i) => {
    i.input_tokens = 20; i.output_tokens = 8500; i.usd_micros = 17005;
    return Array.from({ length: 7 }, (_, n) => ({ ...meta, call_id: ++next, case_id: i.id, category: i.category,
      model: n < 6 ? "gpt-5-mini" : "gpt-4.1-mini", role: n < 5 ? "brain" as const : "judge" as const,
      reserve_micros: 10000, latency_ms: 1, usage: { input_tokens: n < 5 ? 4 : 0, output_tokens: n < 5 ? 1700 : 0 },
      usd_micros: n < 5 ? 3401 : 0, status: "settled" as const }));
  });
  first.ledger.usd_micros = first.items.reduce((n, i) => n + i.usd_micros, 0);
  assert(armSummary(first).status === "SCORED", "fixture must isolate the mini-cap proof check");
  const { raw, a } = await higherApproval(first);
  await rejects(() => verifyFirstArm({ ...a, mini_over_estimate_recheck_ref: "unit-only owner estimate recheck" }, first.identity, raw), "mini hard cap");
});
Deno.test("comparison: owner-allocated pool accepts unknown global balances without inventing zeros", () => {
  const a={owner_approval_ref:"unit-only approval",owner_allocated_pool_ref:"unit-only allocated $20",model:"gpt-5-mini",source_commit:"a".repeat(40),corpus_sha256:"b".repeat(64),cap_usd:5,new_budget_spent_usd:null,other_reserved_usd:null,ledger_snapshot_at:null,comparison_cap_usd:20,comparison_spent_usd:0};
  validateApproval(a,a.model,a.source_commit,a.corpus_sha256);
  throws(()=>validateApproval({...a,owner_allocated_pool_ref:undefined},a.model,a.source_commit,a.corpus_sha256),"allocated $20 pool");
  assert(a.new_budget_spent_usd===null && a.other_reserved_usd===null);
});
