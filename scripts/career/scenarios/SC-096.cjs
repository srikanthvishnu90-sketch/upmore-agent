const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-096","med-school-essays");
await s.user("Tailor med-school application essays from my real clinical and research experiences");
const p=persona("persona-premed.json");
const r=Packets.medEssayPacket(p,["Personal statement","Most meaningful: clinical experience","Most meaningful: research"]);
await s.tool("133.medEssayPacket",r);
await s.agent("Essay packet built only from your real record: 200 hours of hospital volunteering, 60 hours of physician shadowing, and your cell-signaling research poster. Each outline point cites its fact — you write the prose, nothing is invented.",{card:{title:"Med-school essay packet (TEST persona)",essays:r.essays.map(e=>e.prompt)}});
s.verify("every essay outline point carries a fact ID from the TEST pre-med persona; no uncited claims",{essays:r.essays});
await s.finish({status:"COMPLETE",outcome:"Med-school essay packet assembled from the TEST pre-med persona's real clinical, shadowing and research facts, every point fact-cited"});}
main();