const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-084","current-employer-refusal");
await s.user("Role at my current employer — refuse by default; require my knowing override");
const p=persona(); Profile.getFact(p,"F-002").end=undefined; // TEST setup: the TEST Systems role is the user's CURRENT role
const g=Packets.guardEmployer(p,"TEST Systems Inc",{});
await s.tool("133.guardEmployer",g); await s.agent(g.text,{card:{title:"Refused — current employer",company:"TEST Systems Inc",factIds:g.check.factIds}});
s.verify("refusal from rail state: profile fact F-002 names TEST Systems Inc as a current (no end date) experience",{check:g.check});
await s.finish({status:"COMPLETE",outcome:"Application to the user's current employer refused by default, with the knowing-override path stated and recorded as required"});}
main();