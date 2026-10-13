const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-095","big-law-summer-associate");
await s.user("Tailor for Big Law summer associate — CV conventions, school and journal signals");
const p=persona("persona-biglaw.json");
const r=Tailor.tailorResume(p,JD.law,{family:"law",company:"TEST Law LLP"});
await s.tool("123.tailorResume[law]",{ok:r.ok,family:r.resume&&r.resume.family,conventions:r.resume&&r.resume.conventions,audit:r.audit,sections:(r.resume&&r.resume.sections||[]).map(x=>x.heading)});
await s.agent("Big Law CV built in law conventions: education first with school and Law Review signals, then legal experience and moot court leadership. Every line traces to a fact on the TEST Big Law persona.",{card:{title:"Big Law CV (TEST persona)",sections:(r.resume&&r.resume.sections||[]).map(x=>x.heading)}});
s.verify("law family used; Education is the first section; audit passes on the Big Law fixture",{firstSection:r.resume.sections[0].heading,audit:r.audit});
await s.finish({status:"COMPLETE",outcome:"Big Law summer-associate CV tailored from the TEST law persona (school, journal, moot court signals forward), truth audit passed"});}
main();