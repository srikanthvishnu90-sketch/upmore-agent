const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-101","one-page-rule");
await s.user("One-page rule enforced for a student resume across every variant");
const checks={};
for(const fam of ["swe","ib_finance","consulting","quant","law"]){const r=Tailor.tailorResume(persona(),JD.swe,{family:fam});checks[fam]=Packets.checkOnePage(r.rendered);await s.tool("133.checkOnePage["+fam+"]",checks[fam]);}
await s.agent("One-page rule checked on every variant (SWE, bank, consulting, quant, law): each render is inside the one-page limit in the ATS text form.",{card:{title:"One-page rule — all variants",checks}});
s.verify("all variants pass the one-page check from their real renders",{checks});
await s.finish({status:"COMPLETE",outcome:"One-page rule enforced and verified across 5 student-resume variants from their actual renders"});}
main();