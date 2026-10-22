import { journalProgress } from "../../evals/brain-reliability/progress.ts";
import { BudgetJournal } from "../../evals/brain-reliability/run-comparison.ts";
const assert = (ok: unknown, why = "assertion failed") => { if (!ok) throw Error(why); };
const SECRET = "SEALED_CASE_PROMPT_REPLY_RUBRIC_MUST_NEVER_APPEAR";
const model = "gpt-5-mini", judges = ["gpt-5-mini", "gpt-4.1-mini"];
const header = () => ({ type: "arm", model, approval: { cap_usd: 5, comparison_spent_usd: 0 }, identity: { secret: SECRET } });
function fixture() {
  const events: any[] = [header(), { type: "preflight", status: "available" }], j = new BudgetJournal(5000000, e => events.push(e));
  return { events, j, raw: () => events.map(e => JSON.stringify(e)).join("\n") + "\n" };
}
function call(f: ReturnType<typeof fixture>, role = "brain", selected = model, id = SECRET) {
  const meta: any = { case_id: id, category: "help_scope", model: selected, role, turn: 0 }, call_id = f.j.reserve(meta, 1000);
  return { settle: (usage: any = { input_tokens: 100, output_tokens: 10 }) => f.j.settle(call_id, meta, usage, 1) };
}
function completeItem(f: ReturnType<typeof fixture>, id = SECRET) {
  call(f, "brain", model, id).settle(); for (const judge of judges) call(f, "judge", judge, id).settle();
  const usd = f.j.settled.filter(c => c.case_id === id).reduce((sum, c) => sum + c.usd_micros!, 0);
  f.events.push({ type: "item", item: { id, pass: true, usd_micros: usd, judges: judges.map(model => ({ model, pass: true })),
    replies: [SECRET], judging_packet: SECRET, trace: [{ secret: SECRET }], state: { secret: SECRET } } });
}
Deno.test("eval progress: an empty journal is waiting, never a final zero spend", () => {
  const p = journalProgress(""); assert(p.status === "WAITING" && p.known_cost_usd === 0 && !p.total_cost_final);
});
Deno.test("eval progress: running reservations and settled costs reconcile through actual budget events", () => {
  const f = fixture(), a = call(f); call(f); a.settle(); const p = journalProgress(f.raw());
  assert(p.status === "RUNNING" && p.settled_calls === 1 && p.completed_cases === 0 && p.known_cost_usd === .000045 && p.held_reservations_usd === .001 && p.unsettled_calls === 1 && !p.total_cost_final);
});
Deno.test("eval progress: completed cases require both distinct fixed judge settlements", () => {
  const f = fixture(); completeItem(f); const p = journalProgress(f.raw()); assert(p.completed_cases === 1 && p.processed_cases === 1 && p.settled_calls === 3 && !p.total_cost_final);
  f.events.at(-1).item.judges.pop(); assert(journalProgress(f.raw()).status === "INVALID_SNAPSHOT");
});
Deno.test("eval progress: sealed content is excluded by a stable public whitelist", () => {
  const f = fixture(); completeItem(f); const p = journalProgress(f.raw()), output = JSON.stringify(p);
  assert(!output.includes(SECRET)); assert(Object.keys(p).sort().join() === "completed_cases,held_reservations_usd,known_cost_usd,processed_cases,settled_calls,status,total_cost_final,unknown_charges,unsettled_calls");
});
Deno.test("eval progress: a torn final event asks for a new snapshot and accepts no prefix totals", () => {
  const f = fixture(); call(f).settle(); const p = journalProgress(f.raw().slice(0, -8));
  assert(p.status === "RETRY_SNAPSHOT" && p.known_cost_usd === null && p.settled_calls === null && !p.total_cost_final);
  assert(!JSON.stringify(p).includes(SECRET));
});
Deno.test("eval progress: malformed complete lines return no parser text or private bytes", () => {
  const p = journalProgress('{"type":"arm","private":"' + SECRET + '"}\nINVALID' + SECRET + '\n'); assert(p.status === "INVALID_SNAPSHOT" && !JSON.stringify(p).includes(SECRET));
});
Deno.test("eval progress: unknown charges keep their reservations and halt further dispatch", () => {
  const f = fixture(); call(f).settle(null); const p = journalProgress(f.raw());
  assert(p.status === "HALTED" && p.settled_calls === 0 && p.unknown_charges === 1 && p.unsettled_calls === 1 && p.held_reservations_usd === .001 && p.known_cost_usd === 0 && !p.total_cost_final);
  f.events.push({ type: "reserved", call_id: 2, case_id: SECRET, category: "help_scope", model, role: "brain", turn: 0, reserve_micros: 1000 });
  assert(journalProgress(f.raw()).status === "INVALID_SNAPSHOT");
});
Deno.test("eval progress: cost tampering, duplicate IDs and changed source metadata are refused", () => {
  for (const mutate of [(e:any[])=>e.at(-1).usd_micros++, (e:any[])=>e.push(e.at(-1)), (e:any[])=>e.at(-1).case_id='different']) {
    const f = fixture(); call(f).settle(); mutate(f.events); assert(journalProgress(f.raw()).status === "INVALID_SNAPSHOT");
  }
});
Deno.test("eval progress: negative/fractional usage and unpriced model claims are refused", () => {
  for (const mutate of [(e:any[])=>e.at(-1).usage.input_tokens=-1, (e:any[])=>e.at(-1).usage.output_tokens=.5,
    (e:any[])=>{e[2].model='unpriced';e[3].model='unpriced'}]) { const f = fixture();call(f).settle();mutate(f.events);assert(journalProgress(f.raw()).status === "INVALID_SNAPSHOT"); }
});
Deno.test("eval progress: reservations above the approved mini or shared pool caps are refused", () => {
  const f = fixture();call(f);f.events[2].reserve_micros=5000001;assert(journalProgress(f.raw()).status === "INVALID_SNAPSHOT");
  f.events[0].approval.cap_usd=6;assert(journalProgress(f.raw()).status === "INVALID_SNAPSHOT");
});
Deno.test("eval progress: a failed arm can finish with known costs without claiming a score", () => {
  const f=fixture();completeItem(f);f.events.push({type:'complete',summary:{status:'NOT_SCORED',completed:1,ledger:f.j.snapshot()}});
  const p=journalProgress(f.raw());assert(p.status==='HALTED'&&p.total_cost_final&&p.completed_cases===1&&p.unknown_charges===0);
});
Deno.test("eval progress: full320 completion is aggregate-only and final; fake early completion refuses", () => {
  const f=fixture();for(let i=0;i<320;i++)completeItem(f,SECRET+i);f.events.push({type:'complete',summary:{status:'SCORED',completed:320,ledger:f.j.snapshot()}});
  const p=journalProgress(f.raw());assert(p.status==='COMPLETE'&&p.completed_cases===320&&p.settled_calls===960&&p.total_cost_final&&!JSON.stringify(p).includes(SECRET));
  const g=fixture();completeItem(g);g.events.push({type:'complete',summary:{status:'SCORED',completed:1,ledger:g.j.snapshot()}});assert(journalProgress(g.raw()).status==='INVALID_SNAPSHOT');
});
Deno.test("eval progress: a cached usage settlement is repriced by the same canonical rate card", () => {
  const f=fixture();call(f).settle({input_tokens:100,cache_read_input_tokens:100,output_tokens:10});
  assert(journalProgress(f.raw()).known_cost_usd===.000048);
});
Deno.test("eval progress: real CLI stdout and stderr never reveal sealed journal bytes", async () => {
  const folder=await Deno.makeTempDir({prefix:'brain-progress-test-'}),path=folder+'/journal.jsonl',source=new URL('../../evals/brain-reliability/progress.ts',import.meta.url).pathname;
  try { const f=fixture();completeItem(f);
    for(const raw of [f.raw(),f.raw().slice(0,-8)]){
      await Deno.writeTextFile(path,raw);
      const out=await new Deno.Command(Deno.execPath(),{args:['run','--cached-only','--no-remote','--allow-read','--deny-net','--no-prompt',source,path],stdout:'piped',stderr:'piped'}).output();
      const stdout=new TextDecoder().decode(out.stdout),stderr=new TextDecoder().decode(out.stderr);
      assert(!stdout.includes(SECRET)&&!stderr.includes(SECRET),'CLI leaked sealed content');
      const p=JSON.parse(stdout);assert(['RUNNING','RETRY_SNAPSHOT'].includes(p.status)&&stdout.trim().split('\n').length===1,'CLI did not return one safe aggregate');
    }
  }finally{await Deno.remove(folder,{recursive:true})}
});
