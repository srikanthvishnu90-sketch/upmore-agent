const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-083","greenhouse-5-confirmations");
await s.user("Submit 5 Greenhouse applications — every employer confirmation captured or flagged unconfirmed");
const companies=[["Stripe","stripe.json"],["Datadog (TEST board)","stripe.json"],["Ramp (TEST board)","stripe.json"],["Palantir","palantir.json"],["Jane Street","jane-street.json"]];
const recs=[];
for(let i=0;i<5;i++){const [co,cf]=companies[i];const pk=Packets.assemblePacket({profile:persona(),company:co,jdText:JD.swe,cir:cir(cf),portal:"greenhouse (TEST board)",portalAsksCoverLetter:false,jobId:"TEST-GH-"+(i+1)});
if(!pk.ok){await s.tool("packet-failed",pk);continue;}
const board=Packets.makeTestBoard({company:co,silent:i===3}); // 4th board issues no confirmation -> must be flagged
const rec=Packets.submitToTestBoard(board,pk,{now:"2026-10-13T05:0"+i+":00Z"});recs.push(rec);await s.tool("133.submitToTestBoard["+co+"]",rec);}
await s.agent("Submitted 5 applications on TEST Greenhouse boards. 4 confirmations captured; 1 flagged UNCONFIRMED (no confirmation issued) — I never claim that one as confirmed.",{card:{title:"Greenhouse submits — confirmations",confirmed:recs.filter(r=>r.confirmation).length,unconfirmed:recs.filter(r=>!r.confirmation).map(r=>r.company)}});
s.verify("5 submission records exist as data; confirmation artifact present for 4, explicit UNCONFIRMED flag for 1",{records:recs});
await s.finish({status:"COMPLETE",outcome:"5 Greenhouse applications submitted on labeled TEST boards; 4 employer confirmations captured as data records, 1 flagged UNCONFIRMED — doorstep rule honored (no real employer submission)"});}
main();