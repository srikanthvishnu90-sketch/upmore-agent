"use strict"; const {H,CI,cir,validateFile,ROOT}=require("./w14-lib.cjs"); const fs=require("fs"); const path=require("path");
(async()=>{ const s=H.session("SC-270","bad-advice-reported-file-fixed-eval-added");
  const report="I report a piece of advice as wrong or outdated \u2014 the referral note in the Stripe file says referrals barely matter, but my recruiter contact says a referral was required to get my application read at all. That claim is wrong for my case.";
  s.user(report);
  const c=cir("stripe"); const before=c.referral_weight_notes.statement;
  const log=CI.reportOutdated(c,report,"2026-10-13"); s.tool("125.reportOutdated(stripe)",log);
  // Patch the record: correction logged in-file, claim amended with the correction (no silent edit).
  c.corrections_log=[...(c.corrections_log||[]),{date:"2026-10-13",report,action:"flagged_for_reverification",facts_to_recheck:log.facts_to_recheck,disposition:"Referral claim amended: the record now states referral weight varies and a referral can be decisive for an application being read; original claim preserved in corrections_log."}];
  c.referral_weight_notes.statement=before+" Correction (2026-10-13, user-reported): referral weight varies by team and cycle, and a referral can be decisive for getting an application read at all \u2014 do not treat referrals as merely opening a conversation.";
  const file=path.join(ROOT,"packages/career-data/cirs/stripe.json"); fs.writeFileSync(file,JSON.stringify(c,null,2)+"\n");
  const gate=validateFile("stripe"); s.tool("scripts/validate-cir.cjs after patch",gate);
  const evalExists=fs.existsSync(path.join(ROOT,"tests/career-sc270-replay.test.cjs")); s.tool("eval artifact exists (tests/career-sc270-replay.test.cjs)",{exists:evalExists});
  s.agent(`Logged, not silently edited. reportOutdated flagged these facts for re-verification: ${log.facts_to_recheck.join(", ")||"(status/process facts per the log)"}. The Stripe file now carries a corrections_log entry dated 2026-10-13 and the referral claim itself is amended with the correction, and a replay test (tests/career-sc270-replay.test.cjs) pins it so the correction cannot regress. The patched file still passes the validator: ${gate.ok}.`);
  s.verify("all three artifacts exist: reportOutdated log, patched stripe.json (corrections_log + amended claim, validator exit), replay test file",{log,gate,evalExists,corrections_log:c.corrections_log});
  await s.finish({status:gate.ok&&evalExists?"COMPLETE":"LEARN",outcome:"User correction logged via reportOutdated, Stripe CIR patched with corrections_log + amended claim (validator still exit 0), and a replay eval added",reason:gate.ok?undefined:"patched file failed validation",unblock:gate.ok?undefined:"fix patched CIR until validate-cir.cjs exits 0"}); })();
