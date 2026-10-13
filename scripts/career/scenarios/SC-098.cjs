const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-098","cir-gap-callout");
await s.user("Gap callout before applying: \"their interns mostly have X\" — my odds stated, proceed or not, my call");
const p=persona(); const posting={job_id:"TEST-098",company:"Stripe",title:"Software Engineer Intern",location:"New York, NY",jd_text:JD.stripe,posted_at:"2026-10-10T00:00:00Z"};
const fit=Jobs.scoreFit(posting,Jobs.profileFromPersona(JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'..','..','..','packages/career-data/fixtures/test-persona.json'),'utf8'))),Packets.cirForTailor(cir("stripe.json")));
const gap=Packets.gapCallout(p,cir("stripe.json"),fit); await s.tool("133.gapCallout",gap); await s.tool("121.scoreFit",fit);
await s.agent(gap.text,{card:{title:"Gap callout — Stripe",bucket:fit.bucket,score:fit.score,gaps:gap.gaps.map(g=>g.skill)}});
await s.user("Proceed anyway — my call");
s.verify("gap + fit bucket computed from the real CIR and the real scoring module before any application; the proceed decision is the user's, recorded verbatim",{gap,fit});
await s.finish({status:"COMPLETE",outcome:"CIR gap callout stated before applying (named skills not evidenced on the profile + fit bucket), odds not hidden, proceed decision left to and made by the user"});}
main();