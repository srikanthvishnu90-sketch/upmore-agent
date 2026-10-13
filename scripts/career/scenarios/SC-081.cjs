const {H,Access,Jobs,Profile,Tailor,Packets,persona,cir,JD}=require("./_w05.cjs");
async function main(){const s=H.session("SC-081","workday-portal-account");
await s.user("Workday portal needs an account — create alias email + vault password, disclose it to me");
const r=Packets.createPortalAccount({company:"TEST Systems Inc",alias_email:"alex.testcase+testsystems@example.test",password_vault_ref:"vault/career/portal/test-systems-inc",now:Date.parse("2026-10-13T05:00:00Z")});
await s.tool("133.createPortalAccount",r);
await s.agent(r.disclosure,{card:{title:"Portal account — TEST Systems Inc",alias_email:r.record.alias_email,password:"stored in vault only (ref: "+r.record.password_vault_ref+")",created_at:r.record.created_at}});
const list=Access.portalList([r.record]); await s.tool("120.portalList",list);
s.verify("portal record exists in rail state; no secret value anywhere in the record",{record:r.record,portalList:list,audit:r.audit,secretScan:JSON.stringify(r).includes("vault/career")&&!r.record.password});
await s.finish({status:"COMPLETE",outcome:"Workday-style portal account record created for TEST Systems Inc with alias email + vault-only password reference, disclosed to the user; no password value in any record"});}
main();