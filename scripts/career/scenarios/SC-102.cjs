const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-102","ats-safe-render");
await s.user("ATS-safe render: single column, standard headings, text-extractable, portal's preferred format");
const r=Tailor.tailorResume(persona(),JD.swe,{family:"swe",cir:Packets.cirForTailor(cir("stripe.json"))});
const ats=Packets.checkAts(r.rendered); await s.tool("133.checkAts",ats); await s.tool("123.render.pdf-honesty",{pdf:r.rendered.pdf,note:r.rendered.pdfNote});
await s.agent("ATS-safe render verified: single column, standard headings ("+ats.headings.join(", ")+"), plain text that extracts cleanly, no tables. Honest gap: there is no PDF/DOCX renderer in the codebase (62-agent-documents is a vault), so the portal-preferred deliverable here is the ATS-safe plain text; PDF rendering stays a LEARN item for the parent to build or schedule.",{card:{title:"ATS-safe render",headings:ats.headings,singleColumn:ats.singleColumn,pdf:null}});
s.verify("render state: singleColumn=true, headings all standard, text extractable; pdf is null and labeled, never faked",{ats});
await s.finish({status:"LEARN",outcome:"ATS-safe plain-text render verified (single column, standard headings, extractable); PDF/DOCX render not produced",reason:"packages/domain/62-agent-documents.js is a document vault with no PDF/DOCX renderer and no renderer dependency exists in the repo",unblock:"parent authorizes adding a PDF renderer (e.g. a document module 134) or accepts text-only delivery for portals that accept .txt/.md"});}
main();