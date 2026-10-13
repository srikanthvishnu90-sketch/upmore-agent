"use strict";
const L = require("./_w02-lib.cjs"); const { H, M, USER } = L;
(async () => {
  const s = H.session("SC-032", "reply-referral-to-priya");
  s.user("Reply handling: \"talk to Priya instead\" — thank them, draft intro ask, add Priya as warm");
  const banker = { person_id: "TEST-W02-032", full_name: "Banker Fixture (TEST)", current_firm: "Fixture Bank (TEST)", title: "Associate", work_email: "banker.fixture@fixturebank.test" };
  const reply = { subject: "Re: coffee chat", body: "Thanks for reaching out — I'm swamped this quarter. You should talk to Priya instead, she sits on the team you'd actually want." };
  s.tool("TEST fixture reply inbox", reply);
  const camp = M.createCampaign({ id: "TEST-CAMP-032", userId: "TEST-USER", approved: true });
  const supp = M.createSuppressionStore();
  const handled = M.handleReply(camp, reply, banker, { suppression: supp });
  s.tool("CareerOutreach.handleReply", handled);
  const priya = handled.new_candidate ? Object.assign({}, handled.new_candidate, { person_id: "TEST-W02-032-PRIYA", current_firm: banker.current_firm, title: "Associate", work_email: "priya.fixture@fixturebank.test" }) : null;
  const thanks = M.thankYouDraft({ contact: banker, user: USER, note: "You pointed me to Priya on your team — I appreciate the redirect." });
  s.tool("CareerOutreach.thankYouDraft", thanks);
  const intro = M.draftIntroRequest(banker, priya || {}, USER, "Alex Testcase, junior at TEST University, exploring restructuring; two modeling projects and a finance-intern summer (TEST profile facts only).");
  s.tool("CareerOutreach.draftIntroRequest", intro);
  const warmList = priya ? [priya] : [];
  s.agent(`Thank-you drafted to Banker Fixture (TEST) and an intro ask drafted for your approval — nothing sent. Priya was added as a warm, Tier A contact (she came from a live referral, the warmest source there is).`, { card: { title: "Referral: Priya added as warm (Tier A)", new_candidate: priya, thank_you_draft: thanks.draft, intro_ask_draft: intro.draft } });
  const ok = handled.classification.classification === "referral-to-other" && handled.classification.referral_name === "Priya" && !!priya && priya.tier === "A" && warmList.length === 1 && thanks.ok && intro.ok;
  s.verify("rail state: classifier output + handleReply.new_candidate (tier A) + warm list contents + both drafts exist", { classification: handled.classification, new_candidate: priya, warm_list_size: warmList.length, thanks_ok: thanks.ok, intro_ok: intro.ok });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Referral reply classified referral-to-other (Priya); thank-you and intro-ask drafted (unsent, card-gated); Priya added as a warm Tier A candidate in the rail state." }
    : { status: "LEARN", outcome: "Referral handling did not verify.", reason: `handled=${JSON.stringify(handled).slice(0, 400)}`, unblock: "Fix classifyReply/handleReply referral extraction and rerun SC-032." });
})().catch((e) => { console.error(e); process.exit(1); });
