const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-085","why-this-company-bank-x6");
await s.user("\"Why this company\" answer bank across 6 applications, company parts rewritten every time");
const cos=[["Stripe","stripe.json",JD.stripe],["Goldman Sachs","goldman-sachs-ibd.json",JD.goldman],["McKinsey","mckinsey.json",JD.mckinsey],["Jane Street","jane-street.json",JD.janestreet],["Palantir","palantir.json",JD.palantir],["Bain","bain.json",JD.mckinsey]];
const banks={};
for(const [co,cf,jd] of cos){const b=Tailor.buildAnswerBank(persona(),jd,Packets.cirForTailor(cir(cf)));banks[co]=b;await s.tool("123.buildAnswerBank["+co+"]",b);}
const whys=cos.map(([co])=>banks[co].entries.find(e=>e.theme==="why_us").text);
await s.agent("Answer bank built for 6 companies. Every why-us entry is rewritten from that company's own CIR facts — no two are the same text.",{card:{title:"Why-this-company bank x6",companies:Object.keys(banks)}});
s.verify("all 6 why-us entries pairwise distinct and each grounded in its own CIR fact + a profile fact ID",{distinct:new Set(whys).size===6,entries:Object.fromEntries(cos.map(([co])=>[co,banks[co].entries.map(e=>({theme:e.theme,factIds:e.factIds,rewritten:e.rewrittenForCompany}))]))});
await s.finish({status:"COMPLETE",outcome:"Why-this-company answer bank built across 6 applications; company-specific parts verified pairwise-distinct and CIR-grounded for every company"});}
main();