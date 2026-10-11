import {AgentClassifiedLedger as Ledger} from "../../supabase/functions/_shared/agent_core.js";
import {classifiedLedgerReport} from "../../supabase/functions/_shared/financial_service.ts";
import {workflowAction} from "../../supabase/functions/_shared/workflow_service.ts";
import {fixture,reader,rejects,user} from "./lib/financial_fixture.ts";
const from="2026-10-01",to="2026-10-31";
function assert(value:unknown,message="ledger assertion failed"){if(!value)throw new Error(message);}
function tx(id:string,amount:number,account="a",date=from):any{return {user_id:user,account_id:account,provider_transaction_id:id,
 amount_cents:amount,currency:"USD",is_pending:false,presence:"observed",posted_on:date,merchant_key:"merchant",merchant_raw:"Merchant",fetched_at:"2026-10-10T12:00:00Z",fact_hash:(id.charCodeAt(0)%16).toString(16).repeat(64)};}
function review(row:any,kind:string,linked?:any,version=1,category="Shopping"):any{return {user_id:user,account_id:row.account_id,provider_transaction_id:row.provider_transaction_id,
 fact_hash:row.fact_hash,kind,review_revision:version,category,linked_account_id:linked?.account_id,linked_transaction_id:linked?.provider_transaction_id,linked_fact_hash:linked?.fact_hash};}
Deno.test("reviewed expenses and income exclude paired transfers, card payments and loan proceeds",()=>{
 const expense=tx("expense",-10000),income=tx("income",30000),loan=tx("loan",10000),a=tx("transfer-a",-5000),b=tx("transfer-b",5000,"b"),c=tx("card-a",-2000),d=tx("card-b",2000,"c");
 const result=Ledger.report([expense,income,loan,a,b,c,d],[review(expense,"expense"),review(income,"income"),review(loan,"loan_proceeds"),review(a,"internal_transfer",b),review(b,"internal_transfer",a),review(c,"credit_payment",d),review(d,"credit_payment",c)],from,to);
 assert(result.spending_cents===10000 && result.income_cents===30000 && result.loan_proceeds_cents===10000);
 assert(result.transfer_records===2 && result.credit_payment_records===2 && result.coverage_complete===false);
});
Deno.test("refund is linked to its original category and reduces current-period spending without becoming income",()=>{
 const expense=tx("expense",-10000,"a","2026-09-01"),refund=tx("refund",4000,"a","2026-10-02");
 const result=Ledger.report([expense,refund],[review(expense,"expense",undefined,1,"Housing"),review(refund,"refund",expense,1,"Old category")],from,to);
 assert(result.spending_cents===-4000 && result.income_cents===0 && result.known_refunds_cents===4000);
 assert(result.categories[0].category==="Housing");
});
Deno.test("corrected provider facts invalidate reviewed classification instead of silently preserving totals",()=>{
 const expense=tx("expense",-10000),r=review(expense,"expense"),changed={...expense,amount_cents:-9000,fact_hash:"f".repeat(64)};
 const result=Ledger.report([changed],[r],from,to);
 assert(result.spending_cents===null && result.income_cents===null && result.invalidated_reviews===1);
});
Deno.test("one reviewed transfer leg cannot erase spending or create income",()=>{
 const a=tx("a",-10000),b=tx("b",10000,"b");
 const result=Ledger.report([a,b],[review(a,"internal_transfer",b)],from,to);
 assert(result.transfer_records===0 && result.unclassified_records===2 && result.spending_cents===null);
});
Deno.test("changed or reclassified opposite leg invalidates both transfer interpretations",()=>{
 const a=tx("a",-10000),b=tx("b",10000,"b"),reviews=[review(a,"internal_transfer",b),review(b,"internal_transfer",a),review(b,"income",undefined,2)];
 const result=Ledger.report([a,b],reviews,from,to);
 assert(result.transfer_records===0 && result.unclassified_records===1 && result.spending_cents===null && result.known_income_cents===10000);
});
Deno.test("unknown records keep final totals unknown while preserving known subtotals",()=>{
 const a=tx("a",-10000),b=tx("b",-1000);const result=Ledger.report([a,b],[review(a,"expense")],from,to);
 assert(result.spending_cents===null && result.known_expenses_cents===10000 && result.unclassified_records===1);
});
Deno.test("refunds exceeding original cost are unresolved, including refunds outside the selected period",()=>{
 const original=tx("e",-10000,"a","2026-09-01"),a=tx("a",6000,"a","2026-09-05"),b=tx("b",6000,"a","2026-10-01");
 const result=Ledger.report([original,a,b],[review(original,"expense"),review(a,"refund",original),review(b,"refund",original)],from,to);
 assert(result.known_refunds_cents===0 && result.unclassified_records===1 && result.spending_cents===null);
});
Deno.test("empty history, unsupported currency, pending and removed facts never imply a zero financial picture",()=>{
 const result=Ledger.report([ {...tx("a",100),is_pending:true},{...tx("b",100),currency:"EUR"},{...tx("c",100),presence:"not_seen"}],[],from,to);
 assert(result.spending_cents===null && result.income_cents===null && result.record_count===0);
 assert(result.excluded.pending===1 && result.excluded.unavailable===1 && result.excluded.unsupported_currency===1);
});
Deno.test("latest unknown review revokes prior interpretation without falling back to older approvals",()=>{
 const a=tx("a",-100);const result=Ledger.report([a],[review(a,"expense"),review(a,"unknown",undefined,2)],from,to);
 assert(result.spending_cents===null && result.known_expenses_cents===0);
});
Deno.test("money arithmetic remains exact and overflows are unknown",()=>{
 const a=tx("a",-Number.MAX_SAFE_INTEGER),b=tx("b",-1);
 const result=Ledger.report([a,b],[review(a,"expense"),review(b,"expense")],from,to);
 assert(result.known_expenses_cents===null && result.spending_cents===null);
});
Deno.test("duplicate conflicting facts and review revisions fail instead of selecting one arbitrarily",async()=>{
 const a=tx("a",-100);await rejects(()=>Ledger.report([a,{...a,amount_cents:-200}],[],from,to),"Conflicting duplicate transaction facts");
 await rejects(()=>Ledger.report([a],[review(a,"expense"),review(a,"other")],from,to),"Conflicting duplicate transaction reviews");
});
Deno.test("service resolves owned full-history evidence beyond search-page and date boundaries",async()=>{
 const original=tx("original",-10000,"a","2026-09-01"),refund=tx("refund",4000);
 const many=Array.from({length:1200},(_,i)=>tx("expense"+i,-100,"a",from));
 const reviews=many.map(r=>review(r,"expense"));reviews.push(review(original,"expense"),review(refund,"refund",original));
 const r=reader({agent_financial_transactions:[...many,original,refund],agent_transaction_reviews:reviews});
 const result=await classifiedLedgerReport(user,r,from,to);
 assert(result.spending_cents===116000 && result.record_count===1201 && result.references.length===20 && result.references_are_sample);
 assert(r.reads.filter(q=>q.table==="agent_financial_transactions").length===3 && /^[a-f0-9]{64}$/.test(result.reference_hash));
});
Deno.test("failed or cross-owner ledger reads prevent publishing a report",async()=>{
 await rejects(()=>classifiedLedgerReport(user,reader({},"agent_transaction_reviews"),from,to),"fixture read failure");
 await rejects(()=>classifiedLedgerReport(user,reader({agent_financial_transactions:[{...tx("a",100),user_id:"other"}]},undefined,true),from,to),"ownership mismatch");
});
Deno.test("typed financial tool renders calculated classifications and cannot write a review",async()=>{
 const a=tx("a",-10000),f=fixture({agent_financial_transactions:[a],agent_transaction_reviews:[review(a,"expense")]});
 const result=await f.session.run("get_spending_income_report",{date_from:from,date_to:to});
 assert(result.facts[0].text.includes("Spending $100.00") && result.facts[0].text.includes("User classifications are assertions"));
 await rejects(()=>f.session.run("classify_transaction",{}),"not registered");
 assert(f.calls.length===0);
});
Deno.test("review action requires explicit user confirmation and uses only authenticated RPC",async()=>{
 const calls:any[]=[];const client={rpc:async(name:string,args:any)=>{calls.push({name,args});return {data:{kind:"expense"}};}};
 const body={action:"classify_transaction",request_id:user,confirmed:true,review:{account_id:"a",transaction_id:"a",fact_hash:"a".repeat(64),kind:"expense"}};
 await rejects(()=>workflowAction(user,client,{}, {...body,confirmed:false}),"explicitly confirm");
 await workflowAction(user,client,{},body);
 assert(calls.length===1 && calls[0].name==="agent_transaction_review" && !("p_user" in calls[0].args));
});
