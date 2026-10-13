const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-097","resume-diff-review");
await s.user("Resume diff review: \"changed 4 bullets, moved Projects up, added Kubernetes (Project X)\" — I approve the diff");
const p=persona(); const base=Tailor.render(Tailor.tailorResume(p,JD.swe,{family:"swe"}).resume).text.split("\n").filter(Boolean);
const r=Tailor.tailorResume(p,JD.datadog,{family:"swe",cir:Packets.cirForTailor(cir("stripe.json")),baseLines:Tailor.tailorResume(p,JD.swe,{family:"swe"}).resume.lines.map(l=>l.text)});
await s.tool("123.diffResume",r.diff);
await s.agent("Here is the exact diff before anything is used: "+r.diff.summary+". Added lines carry their evidence — e.g. Kubernetes is supported by Project DeployBoard's fact record. Approve or reject it.",{card:{title:"Resume diff — your approval",summary:r.diff.summary,added:r.diff.added,moved:r.diff.moved,removed:r.diff.removed}});
await s.user("Approved — use that diff");
s.verify("diff computed from rail state vs the base resume; user approval recorded in the transcript before use",{diff:r.diff});
await s.finish({status:"COMPLETE",outcome:"Resume diff (added/moved/removed with fact-cited reasons, incl. the Kubernetes evidence line) presented and approved by the user before use"});}
main();