const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-090","jane-street-quant");
await s.user("Tailor for Jane Street — competitions, probability coursework, research forward");
const r=Tailor.tailorResume(persona(),JD.janestreet,{family:"quant",cir:Packets.cirForTailor(cir("jane-street.json")),company:"Jane Street"});
await s.tool("123.tailorResume",{ok:r.ok,mode:r.mode,family:r.resume&&r.resume.family,conventions:r.resume&&r.resume.conventions,audit:r.audit,selectedFactIds:r.resume&&r.resume.selectedFactIds,sections:(r.resume&&r.resume.sections||[]).map(x=>x.heading),diff:r.diff&&r.diff.summary});
await s.agent("Tailored for Jane Street in the "+(r.resume?r.resume.familyLabel:"")+" variant. Every line passed the truth audit against your confirmed facts — nothing was added that your profile does not prove.",{card:{title:"Tailored — Jane Street",family:r.resume&&r.resume.family,sections:(r.resume&&r.resume.sections||[]).map(x=>x.heading),auditOk:r.audit.ok}});
s.verify("truth audit ok; every tailored line cites >=1 confirmed fact ID; variant conventions applied",{audit:r.audit,lines:r.resume.lines});
await s.finish({status:"COMPLETE",outcome:"Resume tailored for Jane Street (quant variant) from real CIR bars + profile facts; truth audit passed on every line"});}
main();