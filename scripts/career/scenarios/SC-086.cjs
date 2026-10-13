const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-086","cover-letters-voice");
await s.user("Cover letters only where the portal asks; startup voice vs bank voice per company");
const startup=Packets.assemblePacket({profile:persona(),company:"TEST YC Startup",jdText:JD.yc,cir:cir("stripe.json"),portal:"greenhouse",portalAsksCoverLetter:true,companyKind:"YC startup",jobId:"TEST-086-A"});
const bank=Packets.assemblePacket({profile:persona(),company:"Goldman Sachs",jdText:JD.goldman,cir:cir("goldman-sachs-ibd.json"),portal:"portal",portalAsksCoverLetter:true,companyKind:"bank",jobId:"TEST-086-B"});
const none=Packets.assemblePacket({profile:persona(),company:"Stripe",jdText:JD.stripe,cir:cir("stripe.json"),portal:"greenhouse",portalAsksCoverLetter:false,jobId:"TEST-086-C"});
for(const [n,pk] of [["startup",startup],["bank",bank],["no-ask",none]]) await s.tool("packet["+n+"]",{ok:pk.ok,voice:pk.voice,coverLetterOk:pk.coverLetter&&pk.coverLetter.ok,words:pk.coverLetter&&pk.coverLetter.wordCount,skipped:pk.coverLetterSkippedReason});
await s.agent("Two portals asked — two letters, in the right voices: builder/startup voice for the YC startup, formal bank voice for Goldman. The third portal did not ask, so no letter was generated for it.",{card:{title:"Cover letters",startupVoice:startup.voice,bankVoice:bank.voice,notAsked:"no letter generated"}});
s.verify("letters exist only where the portal asked; both pass the 150-250 word + banned-phrase gates in 123",{startup:{ok:startup.coverLetter.ok,words:startup.coverLetter.wordCount},bank:{ok:bank.coverLetter.ok,words:bank.coverLetter.wordCount},none:none.coverLetter});
await s.finish({status:"COMPLETE",outcome:"Cover letters generated only for the 2 portals that asked, voice-labeled startup vs bank per company; the non-asking portal got no letter"});}
main();