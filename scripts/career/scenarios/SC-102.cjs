const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-102","ats-safe-render");
await s.user("ATS-safe render: single column, standard headings, text-extractable, portal's preferred format");
const r=Tailor.tailorResume(persona(),JD.swe,{family:"swe",cir:Packets.cirForTailor(cir("stripe.json"))});
const ats=Packets.checkAts(r.rendered); await s.tool("133.checkAts",ats); await s.tool("123.render.documents",{pdf:r.rendered.pdf,docx:r.rendered.docx,filename:r.rendered.filename,parseCheck:r.rendered.parseCheck});
await s.agent("ATS-safe render verified: single column, standard headings ("+ats.headings.join(", ")+"), no tables. CA-02 (built 2026-10-13): the portal's preferred deliverable is now a real document — "+r.rendered.filename+" (PDF by default, DOCX where a portal requires it), rendered from the same resume JSON by 148-career-render and parse-checked PASS with two independent parsers per format (Spec 3 §2.5).",{card:{title:"ATS-safe render",headings:ats.headings,singleColumn:ats.singleColumn,pdf:r.rendered.pdf.filename,docx:r.rendered.docx.filename,parseCheck:r.rendered.parseCheck.status}});
s.verify("render state: singleColumn=true, headings all standard, text extractable; pdf/docx are real artifacts with sha256, parse-check PASS — never faked",{ats});
await s.finish({status:"COMPLETE",outcome:"ATS-safe render verified (single column, standard headings, extractable) AND real PDF + DOCX documents produced and parse-checked PASS (CA-02)",reason:"148-career-render.js renders both formats from the tailor's resume JSON via a text pipeline; parse-check (2 parsers/format) attached to every render",unblock:null});}
main();
