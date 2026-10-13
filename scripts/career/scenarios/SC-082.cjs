const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-082","captcha-handoff");
await s.user("CAPTCHA appears mid-application — hand me the tap, resume when done");
const c=Access.createHandoff({source:"portal",challenge:"captcha",screenshot_ref:"TEST-screenshot-ref/captcha-1",run_id:"TEST-RUN-082",now:Date.parse("2026-10-13T05:00:00Z")});
await s.tool("120.createHandoff",c);
await s.agent(c.text,{card:{title:"Your tap needed — CAPTCHA",source:"portal",challenge:"captcha",expires_at:c.ticket.expires_at}});
await s.user("[TEST tap] I finished the CAPTCHA step");
const r=Access.resumeHandoff(c.ticket,{resume_token:c.ticket.resume_token,now:Date.parse("2026-10-13T05:05:00Z")});
await s.tool("120.resumeHandoff",r); await s.agent(r.text);
const bad=Access.resumeHandoff(c.ticket,{resume_token:c.ticket.resume_token}); await s.tool("120.resumeHandoff-replay-refused",bad);
s.verify("ticket resumed exactly once from rail state; replay refused (already_used)",{ticket:r.ticket,replay:bad});
await s.finish({status:"COMPLETE",outcome:"CAPTCHA handed to the user as a single-use handoff ticket (no solver service), resumed on their tap, replay refused"});}
main();