const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-099","referral-hold-decision");
await s.user("Referral hold decision: hold the app 48 hours for Priya's referral, or apply now and refer after");
const d=Packets.referralHoldDecision({referralExpected:true,referralEtaHours:24,hoursToDeadline:240,contactName:"Priya"});
await s.tool("133.referralHoldDecision",d);
await s.agent(d.reason+" Decision: HOLD the application 48 hours; the packet is assembled and ready so applying the moment the referral lands takes one tap.",{card:{title:"Referral hold",decision:d.decision,holdHours:d.holdHours}});
s.verify("hold decision derived from deadline (240h) vs referral ETA (24h) by the deterministic rule in 133",{decision:d});
await s.finish({status:"COMPLETE",outcome:"Referral hold decided: HOLD 48h for Priya's referral — ETA is well inside the deadline window, so the referral attaches without deadline risk"});}
main();