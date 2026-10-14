// One shared ledger for the entire authorized $5 campaign, across processes.
// Price basis: https://developers.openai.com/api/docs/models/gpt-5-nano,
// observed 2026-10-13 America/Chicago: $0.05 input, $0.005 cached, $0.40 output / 1M tokens.
export const AUTHORIZED_MICROS=5_000_000;
export const MODEL='gpt-5-nano';
export const BUDGET_PATH='/workspace/.upmore-tools/audit-budget/budget.json';
export class BudgetBlocked extends Error {}
export function maximumCost(payload:any){
 if(payload.model!==MODEL)throw new BudgetBlocked('Only the authorized gpt-5-nano model is allowed');
 if(payload.n!==undefined&&payload.n!==1)throw new BudgetBlocked('Only one completion per request is authorized');
 if(payload.modalities||payload.audio||payload.stream||!Array.isArray(payload.messages)||payload.messages.some((m:any)=>typeof m.content!=='string'&&m.content!==null&&m.content!==undefined))throw new BudgetBlocked('Only non-streaming text messages are authorized');
 if(JSON.stringify(payload).includes('"image_url"'))throw new BudgetBlocked('Image token cost is not bounded by this text-only campaign');
 const output=payload.max_completion_tokens??payload.max_tokens;
 if(!Number.isSafeInteger(output)||output<1||output>4096)throw new BudgetBlocked('A finite output-token cap is required');
 // Text tokens cannot outnumber UTF-8 bytes, with ample additional allowance for message/tool framing.
 const input=new TextEncoder().encode(JSON.stringify(payload)).length+1024+64*((payload.messages?.length||0)+(payload.tools?.length||0)+1);
 return {input_bound:input,output_bound:output,reserve_micros:Math.ceil(input*0.05+output*0.4)};
}
export function receiptCost(usage:any){
 const input=usage?.prompt_tokens,output=usage?.completion_tokens,cached=usage?.prompt_tokens_details?.cached_tokens??0;
 if(![input,output,cached].every(n=>Number.isSafeInteger(n)&&n>=0)||cached>input)throw new BudgetBlocked('Unknown/invalid usage; maximum reservation remains charged');
 return {input_tokens:input,output_tokens:output,cached_tokens:cached,cost_micros:Math.ceil((input-cached)*0.05+cached*0.005+output*0.4)};
}
export class AuditBudget {
 constructor(public path=BUDGET_PATH,public limit=AUTHORIZED_MICROS){if(!Number.isSafeInteger(limit)||limit<1||limit>AUTHORIZED_MICROS)throw new BudgetBlocked('Campaign limit cannot exceed the authorized $5');}
 async lock<T>(operation:(data:any)=>Promise<T>):Promise<T>{
  await Deno.mkdir(this.path.slice(0,this.path.lastIndexOf('/')),{recursive:true});
  const lockPath=this.path+'.lock',started=performance.now();let file:Deno.FsFile;
  for(;;){try{file=await Deno.open(lockPath,{createNew:true,write:true,mode:0o600});break;}catch(e){if(!(e instanceof Deno.errors.AlreadyExists))throw e;if(performance.now()-started>5000)throw new BudgetBlocked('Budget lock unavailable; no paid request sent');await new Promise(r=>setTimeout(r,20));}}
  try{
   await file.write(new TextEncoder().encode(JSON.stringify({pid:Deno.pid})));
   let data:any;try{data=JSON.parse(await Deno.readTextFile(this.path));}catch(e){if(!(e instanceof Deno.errors.NotFound))throw new BudgetBlocked('Budget ledger unreadable; no paid request sent');data={schema_version:1,model:MODEL,limit_micros:this.limit,charged_micros:0,unknown_calls:0,calls:[]};}
   if(data.model!==MODEL||data.limit_micros>this.limit||!Number.isSafeInteger(data.charged_micros)||data.charged_micros<0)throw new BudgetBlocked('Budget ledger is invalid');
   const result=await operation(data);const tmp=this.path+'.'+crypto.randomUUID()+'.tmp';
   await Deno.writeTextFile(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});await Deno.rename(tmp,this.path);return result;
  }finally{file.close();await Deno.remove(lockPath);}
 }
 async reserve(payload:any,context:string){const bound=maximumCost(payload);return await this.lock(async data=>{
  if(data.unknown_calls>=3)throw new BudgetBlocked('Three unknown usage receipts; paid calls stopped for review');
  if(data.charged_micros+bound.reserve_micros>Math.min(this.limit,data.limit_micros))throw new BudgetBlocked('Hard $5 budget reached; no paid request sent');
  const reservation={id:crypto.randomUUID(),context,model:MODEL,state:'reserved',...bound,charged_micros:bound.reserve_micros};data.calls.push(reservation);data.charged_micros+=bound.reserve_micros;return reservation;
 });}
 async settle(id:string,usage:any){return await this.lock(async data=>{
  const row=data.calls.find((r:any)=>r.id===id);if(!row||row.state!=='reserved')throw new BudgetBlocked('Missing or already settled reservation');
  let receipt;try{receipt=receiptCost(usage);}catch{row.state='unknown';data.unknown_calls++;return row;}
  if(receipt.input_tokens>row.input_bound||receipt.output_tokens>row.output_bound||receipt.cost_micros>row.reserve_micros){row.state='unknown';data.unknown_calls=3;return row;}
  data.charged_micros+=receipt.cost_micros-row.charged_micros;Object.assign(row,receipt,{state:'recorded',charged_micros:receipt.cost_micros});return row;
 });}
 async unknown(id:string){return await this.lock(async data=>{const row=data.calls.find((r:any)=>r.id===id);if(row?.state==='reserved'){row.state='unknown';data.unknown_calls++;}return row;});}
 async status(){return await this.lock(async data=>({model:MODEL,limit_usd:this.limit/1e6,charged_or_reserved_usd:data.charged_micros/1e6,remaining_usd:Math.max(0,this.limit-data.charged_micros)/1e6,calls:data.calls.length,unknown_calls:data.unknown_calls}));}
}
