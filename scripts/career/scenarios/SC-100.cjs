const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-100","mini-campaign-instead");
await s.user("No warm path at a dream company — launch a 5–10 person mini outreach campaign instead");
const people=[{name:"TEST Alum One",warmth:"alumni",sharedFact:"TEST University (TEST)"},{name:"TEST Club Two",warmth:"club",sharedFact:"Investing Club (TEST)"},{name:"TEST Major Three",warmth:"major",sharedFact:"Computer Science (TEST)"},{name:"TEST Hometown Four",warmth:"hometown",sharedFact:"Chicago (TEST)"},{name:"TEST Engineer Five",warmth:"cold",sharedFact:null},{name:"TEST Engineer Six",warmth:"cold",sharedFact:null}];
const r=Packets.miniCampaign({company:"Northwind (TEST dream company)",people});
await s.tool("133.miniCampaign",r); await s.agent(r.text,{card:{title:"Mini-campaign — Northwind (TEST)",count:r.count,sequence:r.sequenced.map(p=>p.seq+". "+p.name+" ("+p.warmth+")"),sends:r.sends}});
s.verify("campaign record exists: 6 people sequenced warm-to-cold, every entry 'awaiting approval', sends = 0 (nothing sent without approval)",{campaign:r});
await s.finish({status:"COMPLETE",outcome:"No warm path at the dream company, so a 6-person mini outreach campaign was built and sequenced warm-to-cold instead of a cold application; all drafts held for approval, zero sends"});}
main();