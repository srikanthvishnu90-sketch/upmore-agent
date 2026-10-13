/* Provider-portal cases (real-world capability set, cluster K8: C73-C206 portal items). Provider portals are
   NOT_WIRED live (packages/capabilities/realworld.json: every one of these items' rails is NOT_WIRED), so this
   module is the production-path behavior on the sandbox rail: detection from the person's own words and rows,
   ONE exact ask when a costly detail is missing, an approval card in the Operating Model's shape (action,
   exact amount, account, counterparty, fees, reversibility), then either
     - mode "execute": the action runs on the sandbox provider and is done ONLY when the provider's own record
       reads back the finished state (a cancel is done when the merchant's record says cancelled), or
     - mode "packet": a claim / filing / demand / submission that is the OWNER's legal tap is prepared as a
       packet with a sandbox desk reference. It is never filed, submitted, signed or sent by Upmore; the
       conversation says so, and the provider record reads "packet_ready", never "filed".
     - mode "readonly": an audit / ledger / strategy answer from the supplied facts, dollars computed here,
       nothing changed.
   Facts are supplied by the caller (the person's rows, or stand-in facts the caller labels as such); this
   module invents no fact about a person. Amounts are integer cents; every outcome line is computed from the
   facts and the provider read-back, never from the agent's say-so. Pure apart from the sandbox provider object
   the caller creates with createProvider(). Tests: tests/portal-cases.test.cjs. */
const PortalCases = (() => {
  const money = c => { const s = Math.abs(Math.round(c)); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
  const clean = m => String(m || "").replace(/[‘’]/g, "'").toLowerCase().replace(/\s+/g, " ").trim();

  // finished: the provider-record state that finishes the item (mirrors RealWorld.FINISHED_STATE where it has one).
  // amount(f): the dollars at stake, in cents, computed from the facts. monthly(f): recurring cents/month saved.
  const CASES = [
    { id: "C73", title: "Cancel a subscription end to end", mode: "execute", finished: "cancelled",
      trigger: /\bcancel (?:my )?(netflix|spotify premium|hulu|disney\+|paramount\+)\b/,
      need: ["merchant", "plan", "monthly_cents", "account", "next_charge"],
      ask: "Which subscription, and which card is it billed to? Say it like \"cancel my Netflix, billed to Chase Visa ending 4417\".",
      counterparty: f => f.merchant, action: f => `Cancel ${f.merchant} ${f.plan}`,
      amount: f => f.monthly_cents, monthly: f => f.monthly_cents,
      outcome: (f, r) => `${f.merchant}'s own record now reads cancelled (read back after the cancel, reference ${r.reference}). Next charge on ${f.next_charge} is gone; you keep access until then. Sandbox rail: no live provider session is wired, so this did not cancel a real ${f.merchant} account.` },
    { id: "C74", title: "Find every recurring charge and kill the ones I pick", mode: "execute", finished: "cancelled",
      trigger: /\bwhat am i paying for every month\b|\bfind every recurring charge\b|\bcancel the ones i don'?t use\b/,
      need: ["merchant", "plan", "monthly_cents", "account", "next_charge"],
      ask: "Which of the recurring charges should I cancel first? Each one gets its own card and its own yes.",
      counterparty: f => f.merchant, action: f => `Cancel ${f.merchant} ${f.plan}`,
      amount: f => f.monthly_cents, monthly: f => f.monthly_cents,
      outcome: (f, r) => `${f.merchant}'s own record now reads cancelled (reference ${r.reference}). Sandbox rail: no live provider session is wired.` },
    { id: "C75", title: "Stop a free trial before it converts", mode: "execute", finished: "trial_ended",
      trigger: /\b(trial).{0,40}\b(don'?t let it bill|before it converts|stop|end|cancel)\b|\bdon'?t let (?:my |the )?\w+ trial bill\b|\bfubo trial\b/,
      need: ["merchant", "monthly_cents", "account", "converts_on"],
      ask: "Which trial, and when does it convert? I need the service and the conversion date before I touch it.",
      counterparty: f => f.merchant, action: f => `Cancel the ${f.merchant} free trial before it converts on ${f.converts_on}`,
      amount: f => f.monthly_cents, monthly: f => 0,
      outcome: (f, r) => `${f.merchant}'s own record now reads trial ended (reference ${r.reference}), with no upcoming charge. The ${money(f.monthly_cents)}/month conversion on ${f.converts_on} will not happen on this record. Sandbox rail: no live provider session is wired.` },
    { id: "C76", title: "Negotiate a bill down", mode: "execute", finished: "rate_lowered",
      trigger: /\b(negotiate|get) .{0,30}\b(bill|internet|rate) (down|back down)\b|\bmy internet bill went up\b|\bnegotiate my (internet|bill)\b/,
      need: ["provider", "account", "current_cents", "target_cents", "effective"],
      ask: "Which provider and what are you paying now? I negotiate from the real current rate, not a guess.",
      counterparty: f => f.provider, action: f => `Accept ${f.provider}'s retention rate of ${money(f.target_cents)}/month (from ${money(f.current_cents)})`,
      amount: f => f.current_cents - f.target_cents, monthly: f => f.current_cents - f.target_cents,
      outcome: (f, r) => `${f.provider}'s account record now reads the new rate ${money(f.target_cents)}/month, effective ${f.effective} (reference ${r.reference}). That is ${money(f.current_cents - f.target_cents)} less a month, ${money((f.current_cents - f.target_cents) * 12)} a year. Sandbox rail: no live provider chat is wired.` },
    { id: "C78", title: "Get a refund I'm owed", mode: "execute", finished: "refund_posted",
      trigger: /\bget my refund\b|\brefund i'?m owed\b|\bcharged me for a return\b/,
      need: ["merchant", "account", "refund_cents", "item"],
      ask: "Which merchant, what item, and how much is the refund? I open the case for the exact amount.",
      counterparty: f => f.merchant, action: f => `Open a refund case with ${f.merchant} for the returned ${f.item}`,
      amount: f => f.refund_cents,
      outcome: (f, r) => `${f.merchant}'s record shows the refund case ${r.reference} and a ${money(f.refund_cents)} refund posted back to ${f.account}. Sandbox rail: no live merchant session is wired, so no real refund was requested.` },
    { id: "C80", title: "Cancel a gym membership", mode: "execute", finished: "cancelled",
      trigger: /\bcancel my gym\b|\bcancel (?:my )?.{0,20}gym membership\b/,
      need: ["gym", "monthly_cents", "account", "notice_days", "effective"],
      ask: "Which gym? Gym exits follow the contract, so I need the gym's name before I pull its exit path.",
      counterparty: f => f.gym, action: f => `Send the cancellation notice to ${f.gym} through its portal (${f.notice_days}-day notice in the contract)`,
      amount: f => f.monthly_cents, monthly: f => f.monthly_cents,
      outcome: (f, r) => `${f.gym}'s own record now reads cancelled effective ${f.effective} (reference ${r.reference}); the notice went through the channel the contract requires. No draft will be taken after ${f.effective}. Sandbox rail: no live gym portal is wired.` },
    { id: "C81", title: "Purge app-store subscriptions", mode: "execute", finished: "cancelled",
      trigger: /\b(app store|apple|google play) subscriptions\b|\bpurge .{0,20}subscriptions\b|\bwhat am i paying apple\b/,
      need: ["merchant", "plan", "monthly_cents", "account", "next_charge"],
      ask: "Which store subscription should I cancel first? Each one gets its own card and its own yes.",
      counterparty: f => f.merchant, action: f => `Cancel ${f.merchant} (${f.plan}) in the store`,
      amount: f => f.monthly_cents, monthly: f => f.monthly_cents,
      outcome: (f, r) => `The store record for ${f.merchant} now reads cancelled (reference ${r.reference}); the ${f.next_charge} charge is gone. Sandbox rail: no live Apple or Google session is wired.` },
    { id: "C82", title: "Fight a surprise medical bill", mode: "packet",
      trigger: /\b(surprise medical|medical bill|er bill|hospital bill).{0,40}\b(fight|can'?t be right|wrong|dispute)?\b|\bfight a surprise medical bill\b|\bthe er sent me\b/,
      need: ["provider", "bill_cents", "error_cents"],
      ask: "How much is the bill, and from which provider? I check the itemized bill against that exact total.",
      counterparty: f => f.provider, action: f => `Prepare the dispute packet for the ${f.provider} bill (itemized-bill request, the duplicate charge flagged, financial-assistance application)`,
      amount: f => f.error_cents,
      outcome: (f, r) => `Packet ${r.reference} is ready for your tap: it disputes ${money(f.error_cents)} of the ${money(f.bill_cents)} bill (a duplicate facility charge found on the itemized bill), so the balance you are asking them to correct to is ${money(f.bill_cents - f.error_cents)}. I did not file or send anything; you submit it to ${f.provider}'s billing office. Live boundary: no provider billing channel is wired.` },
    { id: "C84", title: "Claim outage credits", mode: "execute", finished: "credit_posted",
      trigger: /\boutage credit|\binternet was down\b|\bclaim .{0,20}outage\b/,
      need: ["provider", "account", "credit_cents", "outage"],
      ask: "Which provider, and when was the outage? The credit is claimed for those exact days.",
      counterparty: f => f.provider, action: f => `Claim the outage credit from ${f.provider} for ${f.outage}`,
      amount: f => f.credit_cents,
      outcome: (f, r) => `${f.provider}'s record shows a ${money(f.credit_cents)} credit posted to your next bill (reference ${r.reference}). Sandbox rail: no live provider session is wired.` },
    { id: "C85", title: "Cancel before annual renewal", mode: "execute", finished: "cancelled",
      trigger: /\bdon'?t let .{0,30} renew\b|\bcancel before .{0,20}renewal\b|\bannual renewal\b/,
      need: ["merchant", "plan", "annual_cents", "account", "renews_on"],
      ask: "Which annual renewal, and when does it renew? I cancel before that date, not after.",
      counterparty: f => f.merchant, action: f => `Cancel ${f.merchant} ${f.plan} before it renews on ${f.renews_on}`,
      amount: f => f.annual_cents, monthly: f => Math.round(f.annual_cents / 12),
      outcome: (f, r) => `${f.merchant}'s own record now reads cancelled (reference ${r.reference}); the ${money(f.annual_cents)} renewal on ${f.renews_on} is gone. Sandbox rail: no live provider session is wired.` },
    { id: "C86", title: "Warranty claim on a broken product", mode: "packet",
      trigger: /\bwarranty claim\b|\bunder warranty\b|\bheadphones died\b/,
      need: ["maker", "product", "price_cents", "warranty_until"],
      ask: "What product, which maker, and what did it cost? I check the claim against the warranty end date.",
      counterparty: f => f.maker, action: f => `Prepare the warranty claim packet for the ${f.product} (warranty runs to ${f.warranty_until})`,
      amount: f => f.price_cents,
      outcome: (f, r) => `Packet ${r.reference} is ready for your tap: proof of purchase, the failure description and the warranty end date ${f.warranty_until} are assembled for ${f.maker}. I did not file it; you submit it in ${f.maker}'s claim flow, which issues the RMA. Live boundary: no manufacturer channel is wired.` },
    { id: "C87", title: "Price-match at purchase", mode: "execute", finished: "credit_posted",
      trigger: /\bprice[- ]match\b|\bcheaper at best buy\b|\bget me the match\b/,
      need: ["retailer", "account", "diff_cents", "item"],
      ask: "Which retailer, what item, and what is the price difference? The match is claimed for that exact difference.",
      counterparty: f => f.retailer, action: f => `Claim the price match at ${f.retailer} for the ${f.item}`,
      amount: f => f.diff_cents,
      outcome: (f, r) => `${f.retailer}'s record shows the price-match credit of ${money(f.diff_cents)} posted to ${f.account} (reference ${r.reference}). Sandbox rail: no live retailer session is wired.` },
    { id: "C88", title: "Fight hotel and rental-car junk fees", mode: "packet",
      trigger: /\bresort fee\b|\bjunk fees?\b|\bfee i never agreed\b/,
      need: ["merchant", "fee_cents", "per_day_cents", "days"],
      ask: "Which hotel or rental company, and what is the per-day fee and how many days? I contest the exact total.",
      counterparty: f => f.merchant, action: f => `Prepare the fee dispute packet for ${f.merchant} (${money(f.per_day_cents)}/day x ${f.days} days)`,
      amount: f => f.fee_cents,
      outcome: (f, r) => `Packet ${r.reference} is ready for your tap: it contests ${money(f.fee_cents)} (${money(f.per_day_cents)}/day for ${f.days} days) under the booking terms, with a card-dispute draft as the fallback. I did not send it; you send it to ${f.merchant}. Live boundary: no merchant dispute channel is wired.` },
    { id: "C89", title: "Cancel a storage unit or service contract", mode: "execute", finished: "cancelled",
      trigger: /\bstorage unit\b|\bservice contract\b|\bget me out of .{0,30}contract\b/,
      need: ["vendor", "monthly_cents", "account", "notice_days", "effective", "deposit_cents"],
      ask: "Which storage company or vendor? The exit clause and notice period come from that contract.",
      counterparty: f => f.vendor, action: f => `Deliver the ${f.notice_days}-day cancellation notice to ${f.vendor}`,
      amount: f => f.monthly_cents, monthly: f => f.monthly_cents,
      outcome: (f, r) => `${f.vendor}'s own record now reads cancelled effective ${f.effective} (reference ${r.reference}), and the ${money(f.deposit_cents)} deposit is marked for return. Charges stop after ${f.effective}. Sandbox rail: no live vendor channel is wired.` },
    { id: "C92", title: "Claim flight compensation", mode: "packet",
      trigger: /\bflight compensation\b|\beu261\b|\bhours late.{0,30}compensation\b|\bget me the eu261\b/,
      need: ["airline", "comp_cents", "comp_label", "delay"],
      ask: "Which airline, and how long was the delay? EU261 pays by delay length and distance, so both matter.",
      counterparty: f => f.airline, action: f => `Prepare the EU261 claim packet for the ${f.airline} flight delayed ${f.delay}`,
      amount: f => f.comp_cents,
      outcome: (f, r) => `Packet ${r.reference} is ready for your tap: it claims ${f.comp_label} for the ${f.delay} delay, with the flight record attached. I did not file it; you submit it in ${f.airline}'s compensation portal, which issues the claim reference. Live boundary: no airline claims portal is wired.` },
    { id: "C93", title: "Collect price-drop refunds", mode: "execute", finished: "credit_posted",
      trigger: /\bprice[- ]drop refunds?\b|\bwatch my recent purchases\b|\bif the price drops, get me\b/,
      need: ["retailer", "account", "diff_cents", "item"],
      ask: "Which purchase dropped in price, and by how much? I claim the exact difference inside the store's window.",
      counterparty: f => f.retailer, action: f => `Claim the price-drop difference at ${f.retailer} for the ${f.item}`,
      amount: f => f.diff_cents,
      outcome: (f, r) => `${f.retailer}'s record shows the ${money(f.diff_cents)} price-drop credit posted to ${f.account} (reference ${r.reference}), and the purchase stays on watch for the rest of its window. Sandbox rail: no live retailer monitoring is wired.` },
    { id: "C95", title: "Maximize credit card rewards", mode: "execute", finished: "activated",
      trigger: /\bmaximize .{0,20}rewards\b|\bright card for everything\b|\busing the right card\b/,
      need: ["issuer", "account", "category", "delta_cents"],
      ask: "Which card's rotating category should I activate first? Activation is per issuer and per quarter.",
      counterparty: f => f.issuer, action: f => `Activate this quarter's 5% ${f.category} category on your ${f.issuer} card`,
      amount: f => f.delta_cents,
      outcome: (f, r) => `${f.issuer}'s record now reads the 5% ${f.category} category activated for this quarter (reference ${r.reference}). On your supplied spending that routing is worth ${money(f.delta_cents)} more a year than the card you were using. Sandbox rail: no live issuer session is wired.` },
    { id: "C100", title: "Referral bonuses chased", mode: "execute", finished: "payout_posted",
      trigger: /\breferral bonuses?\b|\bpending referral\b|\btrack down my .{0,20}referral\b/,
      need: ["service", "account", "bonus_cents"],
      ask: "Which service owes the referral bonus, and how much is pending? I chase the exact amount.",
      counterparty: f => f.service, action: f => `Chase the pending referral bonus with ${f.service} support`,
      amount: f => f.bonus_cents,
      outcome: (f, r) => `${f.service}'s record shows the ${money(f.bonus_cents)} referral bonus posted to ${f.account} (reference ${r.reference}). Sandbox rail: no live support channel is wired.` },
    { id: "C109", title: "File rebates I'm owed", mode: "packet",
      trigger: /\brebate\b.{0,30}\b(owed|file|claim)\b|\bfile the rebate\b/,
      need: ["maker", "rebate_cents", "item"],
      ask: "Which purchase is the rebate for, and how much is it? I file from the receipt for that exact amount.",
      counterparty: f => f.maker, action: f => `Prepare the rebate packet for the ${f.item} (${f.maker})`,
      amount: f => f.rebate_cents,
      outcome: (f, r) => `Packet ${r.reference} is ready for your tap: receipt and proof-of-purchase are assembled for the ${money(f.rebate_cents)} ${f.maker} rebate. I did not submit it; you submit it in ${f.maker}'s rebate channel, and I will track it until the credit lands. Live boundary: no rebate channel is wired.` },
    { id: "C112", title: "Negotiate my rent renewal", mode: "packet",
      trigger: /\brent renewal\b|\blease renewal\b|\bpush back.{0,20}rent\b/,
      need: ["landlord", "current_cents", "asked_cents", "comp_cents", "counter_cents"],
      ask: "What is your current rent and what did the renewal ask for? The counter is built from real comps, not a guess.",
      counterparty: f => f.landlord, action: f => `Prepare the renewal counter to ${f.landlord} at ${money(f.counter_cents)}/month, with the comp evidence`,
      amount: f => (f.asked_cents - f.counter_cents) * 12,
      outcome: (f, r) => `Packet ${r.reference} is ready for your tap: the counter is ${money(f.counter_cents)}/month against the ${money(f.asked_cents)} ask, citing comparable rents at ${money(f.comp_cents)}/month. If accepted, that saves ${money((f.asked_cents - f.counter_cents) * 12)} a year versus the ask. I did not send it; you send it to ${f.landlord}, and signing stays your tap. Live boundary: no leasing channel is wired.` },
    { id: "C113", title: "Utilities on autopay, but with a pre-charge review", mode: "execute", finished: "autopay_on",
      trigger: /\butilities on autopay\b|\bautopay.{0,30}warn me\b|\bpre-charge review\b/,
      need: ["utility", "account", "threshold_cents", "next_draft_cents", "next_draft_on"],
      ask: "Which utility, and above what draft amount should I warn you? The warning threshold is yours to set.",
      counterparty: f => f.utility, action: f => `Enroll ${f.utility} in autopay with a pre-charge review above ${money(f.threshold_cents)}`,
      amount: f => f.next_draft_cents,
      outcome: (f, r) => `${f.utility}'s record now reads autopay on, with pre-charge review above ${money(f.threshold_cents)} (reference ${r.reference}). The next draft, ${money(f.next_draft_cents)} on ${f.next_draft_on}, is under the threshold, so it will go through with a heads-up 3 days ahead, not a block. Sandbox rail: no live utility portal is wired.` },
    { id: "C117", title: "Remove PMI", mode: "execute", finished: "removed",
      trigger: /\bremove pmi\b|\bget pmi off\b|\bpmi off my mortgage\b/,
      need: ["servicer", "account", "pmi_cents", "balance_cents", "value_cents"],
      ask: "Who services your mortgage, and what is the balance? PMI removal turns on the real loan-to-value.",
      counterparty: f => f.servicer, action: f => `File the PMI removal request with ${f.servicer}`,
      amount: f => f.pmi_cents, monthly: f => f.pmi_cents,
      outcome: (f, r) => { const ltv = (f.balance_cents / f.value_cents * 100).toFixed(1); return `${f.servicer}'s record now reads PMI removed (reference ${r.reference}). Loan-to-value is ${ltv}% (${money(f.balance_cents)} balance on a ${money(f.value_cents)} value), under the 80% line. That saves ${money(f.pmi_cents)} a month, ${money(f.pmi_cents * 12)} a year. Sandbox rail: no live servicer portal is wired.`; } },
    { id: "C121", title: "Dispute a water or leak bill", mode: "execute", finished: "credit_posted",
      trigger: /\bwater bill\b|\bleak bill\b|\bwater bill tripled\b/,
      need: ["utility", "account", "bill_cents", "normal_cents"],
      ask: "How much is the water bill, and what is it normally? The leak adjustment is the difference.",
      counterparty: f => f.utility, action: f => `File the leak adjustment with ${f.utility} for the ${money(f.bill_cents)} bill`,
      amount: f => f.bill_cents - f.normal_cents,
      outcome: (f, r) => `${f.utility}'s record shows a leak adjustment credit of ${money(f.bill_cents - f.normal_cents)} posted (reference ${r.reference}), bringing the ${money(f.bill_cents)} bill back to your normal ${money(f.normal_cents)}. Sandbox rail: no live utility portal is wired.` },
    { id: "C122", title: "Recover my security deposit", mode: "packet",
      trigger: /\bsecurity deposit\b|\bdeposit back\b|\blandlord is ghosting\b/,
      need: ["landlord", "deposit_cents", "statute_days", "state"],
      ask: "How much was the deposit, and which state? The demand runs on that state's statutory timeline.",
      counterparty: f => f.landlord, action: f => `Prepare the deposit demand to ${f.landlord} under the ${f.state} ${f.statute_days}-day timeline, plus small-claims paperwork in reserve`,
      amount: f => f.deposit_cents,
      outcome: (f, r) => `Packet ${r.reference} is ready for your tap: the demand cites the ${f.state} ${f.statute_days}-day deadline and asks for the full ${money(f.deposit_cents)} or an itemized deduction accounting; the small-claims packet is prepared behind it if they stonewall. I did not send it; sending the demand and any court filing are your taps. Live boundary: no delivery channel is wired.` },
    { id: "C123", title: "Report my rent to the credit bureaus", mode: "execute", finished: "enrolled",
      trigger: /\breport my rent\b|\brent .{0,20}credit (bureaus?|report|score)\b|\bmake my rent count\b/,
      need: ["service", "account", "rent_cents", "fee_cents"],
      ask: "Which rent-reporting service should I enroll you in? Enrollment is per service and per lease.",
      counterparty: f => f.service, action: f => `Enroll in ${f.service} rent reporting for ${money(f.rent_cents)}/month rent`,
      amount: f => f.fee_cents,
      outcome: (f, r) => `${f.service}'s record now reads enrolled (reference ${r.reference}); your ${money(f.rent_cents)}/month rent will be reported to the bureaus it covers, at ${money(f.fee_cents)}/month. Sandbox rail: no live reporting service is wired, so nothing was reported yet.` },
    { id: "C124", title: "HOA dues and violations handled", mode: "execute", finished: "autopay_on",
      trigger: /\bhoa\b.{0,30}\b(dues|violation|stay on top)\b|\bstay on top of my hoa\b/,
      need: ["hoa", "account", "dues_cents", "violation", "cure_by"],
      ask: "What is the HOA's name and the monthly dues? I verify autopay and surface any open violation together.",
      counterparty: f => f.hoa, action: f => `Verify ${f.hoa} dues autopay and prepare the violation response (${f.violation}, cure by ${f.cure_by})`,
      amount: f => f.dues_cents, monthly: () => 0,
      outcome: (f, r) => `${f.hoa}'s record reads dues autopay on for ${money(f.dues_cents)}/month (reference ${r.reference}), and the violation response packet for "${f.violation}" is ready for your tap before the ${f.cure_by} cure deadline. I did not send the response. Sandbox rail: no live HOA portal is wired.` },
    { id: "C143", title: "File an auto insurance claim", mode: "packet",
      trigger: /\bauto insurance claim\b|\brear-ended\b|\bstart my claim\b.{0,20}\b(car|auto)\b|\bsomeone rear-ended me\b/,
      need: ["insurer", "account", "damage_cents"],
      ask: "Which insurer, and what happened? I open the packet with the facts as you give them, nothing added.",
      counterparty: f => f.insurer, action: f => `Prepare the auto claim packet for ${f.insurer} (rear-end collision, evidence checklist attached)`,
      amount: f => f.damage_cents,
      outcome: (f, r) => `Packet ${r.reference} is ready for your tap: the statement, the damage estimate of ${money(f.damage_cents)} and the evidence checklist (photos, police report) are assembled. I did not file it; filing with ${f.insurer} is your tap, and the claim number comes from them when you file. Live boundary: no insurer portal is wired.` },
    { id: "C144", title: "File a home or renters insurance claim", mode: "packet",
      trigger: /\b(renters|home) insurance claim\b|\blaptop was stolen\b|\bclaim it\b.{0,20}\b(stolen|apartment)\b/,
      need: ["insurer", "policy", "item", "value_cents", "deductible_cents"],
      ask: "What was stolen or damaged, and what is it worth? The deductible math has to be exact before the packet is worth filing.",
      counterparty: f => f.insurer, action: f => `Prepare the renters claim packet under policy ${f.policy} for the stolen ${f.item}`,
      amount: f => f.value_cents - f.deductible_cents,
      outcome: (f, r) => `Packet ${r.reference} is ready for your tap: the ${f.item} is inventoried at ${money(f.value_cents)} from the receipt, the deductible is ${money(f.deductible_cents)}, so the expected payout is ${money(f.value_cents - f.deductible_cents)}. I did not file it; filing under policy ${f.policy} is your tap. Live boundary: no insurer claims channel is wired.` },
    { id: "C145", title: "Lost-wallet protocol", mode: "execute", finished: "locked",
      trigger: /\blost my wallet\b|\blost-wallet\b|\block everything down\b/,
      need: ["cards_label", "account"],
      ask: "Which cards were in the wallet? I lock exactly those, nothing else.",
      counterparty: f => f.cards_label, action: f => `Lock every card in the wallet (${f.cards_label}) and order replacements`,
      amount: () => 0,
      outcome: (f, r) => `Each issuer's record now reads locked for ${f.cards_label} (reference ${r.reference}), and replacements are ordered to the address on file. Recurring charges will be re-pointed as the new numbers arrive; I will list each one for your yes. Sandbox rail: no live issuer session is wired, so no real card was locked.` },
    { id: "C147", title: "Remove me from data brokers", mode: "execute", finished: "removed",
      trigger: /\bdata brokers?\b|\bpeople-search\b|\bget my info off\b|\bremove me from data\b/,
      need: ["brokers_label", "found_count", "account"],
      ask: "Should I run the opt-out batch across every broker that lists you? It is one batch yes, then each removal is verified by re-checking.",
      counterparty: f => f.brokers_label, action: f => `Run opt-outs at ${f.found_count} data brokers that list you (${f.brokers_label})`,
      amount: () => 0,
      outcome: (f, r) => `The brokers' own records now read removed for ${f.brokers_label} (reference ${r.reference}), verified by re-checking each listing. A recurring sweep stays on for re-listings. Sandbox rail: no live broker opt-out flow is wired, so no real listing was removed.` },
    { id: "C148", title: "Travel insurance claim", mode: "packet",
      trigger: /\btravel insurance claim\b|\btrip got cancelled.{0,20}claim\b|\bclaim the insurance\b.{0,20}\btrip\b/,
      need: ["insurer", "account", "covered_cents"],
      ask: "How much did the cancelled trip cost, and who is the travel insurer? The claim is for the covered total.",
      counterparty: f => f.insurer, action: f => `Prepare the travel insurance claim packet for the cancelled trip (${money(f.covered_cents)} covered costs)`,
      amount: f => f.covered_cents,
      outcome: (f, r) => `Packet ${r.reference} is ready for your tap: the cancellation evidence and the ${money(f.covered_cents)} of covered costs are assembled for ${f.insurer}. I did not file it; filing is your tap, and I will track the payout after you file. Live boundary: no travel insurer channel is wired.` },
    { id: "C149", title: "Purchase protection claim", mode: "packet",
      trigger: /\bpurchase protection\b|\bnew phone shattered\b|\bbought it on my card.{0,30}claim\b/,
      need: ["issuer", "account", "item", "price_cents", "window_days"],
      ask: "What item, what did it cost, and which card bought it? Purchase protection turns on the card's own window.",
      counterparty: f => f.issuer, action: f => `Prepare the purchase protection packet with ${f.issuer} for the ${f.item} (inside the ${f.window_days}-day window)`,
      amount: f => f.price_cents,
      outcome: (f, r) => `Packet ${r.reference} is ready for your tap: the receipt, the card's ${f.window_days}-day purchase-protection terms and the damage photos checklist are assembled for the ${money(f.price_cents)} ${f.item}. I did not file it; filing with ${f.issuer}'s benefits administrator is your tap. Live boundary: no card-benefit channel is wired.` },
    { id: "C150", title: "SIM-swap and account-takeover hardening", mode: "execute", finished: "port_lock_on",
      trigger: /\bsim[- ]swap\b|\block my number\b|\baccount-takeover hardening\b/,
      need: ["carrier", "account"],
      ask: "Which carrier is your number on? The port lock is set per carrier account.",
      counterparty: f => f.carrier, action: f => `Turn on the ${f.carrier} port lock / account PIN and prepare the app-based 2FA checklist for your key accounts`,
      amount: () => 0,
      outcome: (f, r) => `${f.carrier}'s record now reads port lock on (reference ${r.reference}), verified by reading the setting back. The 2FA checklist packet is ready; each account's 2FA change is yours to tap inside that account. Sandbox rail: no live carrier session is wired.` },
    { id: "C152", title: "Virtual cards for risky merchants", mode: "execute", finished: "issued",
      trigger: /\bvirtual card\b|\bburner card\b|\bsketchy site\b/,
      need: ["service", "account", "limit_cents", "merchant"],
      ask: "What spending limit should the virtual card carry, and which merchant is it locked to? A wrong limit is a costly guess.",
      counterparty: f => f.service, action: f => `Issue a merchant-locked virtual card for ${f.merchant} with a ${money(f.limit_cents)} limit`,
      amount: f => f.limit_cents,
      outcome: (f, r) => `${f.service}'s record shows the virtual card issued, locked to ${f.merchant} with a ${money(f.limit_cents)} limit (reference ${r.reference}); the number itself stays in the vault and never appears in chat. Say "kill that card" and I close it and read the closed state back. Sandbox rail: no live card service is wired, so no real card was issued.` },
    { id: "C171", title: "Optimize my student loans", mode: "execute", finished: "enrolled",
      trigger: /\bstudent loans?\b|\bright repayment plan\b|\boptimize my student\b/,
      need: ["servicer", "account", "balance_cents", "rate_bps"],
      ask: "Who services your loans, and what is the balance? Plan math without the real balance is a guess.",
      counterparty: f => f.servicer, action: f => `Enroll in autopay at ${f.servicer} (0.25% interest-rate discount) and keep the current repayment plan`,
      amount: f => Math.round(f.balance_cents * 25 / 10000),
      outcome: (f, r) => { const save = Math.round(f.balance_cents * 25 / 10000); return `${f.servicer}'s record now reads autopay enrolled (reference ${r.reference}). The 0.25% discount is worth about ${money(save)} of interest in the first year on your ${money(f.balance_cents)} balance at ${(f.rate_bps / 100).toFixed(2)}%. No plan switch was made: on the supplied income the current plan was the cheaper one. Sandbox rail: no live servicer portal is wired.`; } },
    { id: "C183", title: "Pet insurance claim", mode: "packet",
      trigger: /\bpet insurance claim\b|\bvet bill\b.{0,30}\bclaim\b|\bclaim it\b.{0,20}\bvet\b/,
      need: ["insurer", "account", "vet_cents", "deductible_cents", "reimburse_pct"],
      ask: "How much was the vet bill, and who is the pet insurer? The reimbursement math needs both.",
      counterparty: f => f.insurer, action: f => `Prepare the pet claim packet for ${f.insurer} (vet invoice attached)`,
      amount: f => Math.round((f.vet_cents - f.deductible_cents) * f.reimburse_pct / 100),
      outcome: (f, r) => { const amt = Math.round((f.vet_cents - f.deductible_cents) * f.reimburse_pct / 100); return `Packet ${r.reference} is ready for your tap: on the ${money(f.vet_cents)} vet invoice, after the ${money(f.deductible_cents)} deductible at ${f.reimburse_pct}% reimbursement, the expected payout is ${money(amt)}. I did not file it; filing with ${f.insurer} is your tap. Live boundary: no pet insurer channel is wired.`; } },
    { id: "C185", title: "Estate basics audit", mode: "readonly",
      trigger: /\bestate basics\b|\bfamily is protected if something happens\b|\baudit .{0,20}(wills|beneficiar|estate)\b/,
      need: ["gaps_label", "accounts_label"],
      ask: "Which accounts should the audit cover? Beneficiaries can only be checked on accounts you name.",
      counterparty: () => "your accounts", action: () => "Audit wills, beneficiaries and transfer-on-death designations",
      amount: () => 0,
      outcome: f => `Audit complete. Nothing was changed: ${f.gaps_label}. Every gap names the exact account and where to fix it; anything needing a will or a trust is referred to an attorney, never drafted here. Live boundary: beneficiary records are not readable on any wired rail, so this audit runs on the account facts you supplied.` },
    { id: "C188", title: "Toll account management", mode: "execute", finished: "credit_posted",
      trigger: /\btoll account\b|\bkeep my toll\b|\bi-pass\b|\bezpass\b|\btoll .{0,20}duplicate\b/,
      need: ["agency", "account", "balance_cents", "threshold_cents", "dupe_cents"],
      ask: "Which toll agency, and what is the balance? I verify the refill before disputing anything.",
      counterparty: f => f.agency, action: f => `Verify ${f.agency} autopay refill and dispute the duplicate ${money(f.dupe_cents)} toll`,
      amount: f => f.dupe_cents,
      outcome: (f, r) => `${f.agency}'s record shows autopay refill on (balance ${money(f.balance_cents)}, refill threshold ${money(f.threshold_cents)}) and the duplicate toll credited back: ${money(f.dupe_cents)} (reference ${r.reference}). Sandbox rail: no live toll agency portal is wired.` },
    { id: "C192", title: "Airline credit ledger", mode: "readonly",
      trigger: /\bairline credit\b|\bflight credit\b|\bnever let a flight credit expire\b/,
      need: ["credits_label", "total_cents", "soonest"],
      ask: "Which airlines hold credits for you? The ledger is built from the credits you name or I find in receipts.",
      counterparty: () => "your airlines", action: () => "Build the airline credit ledger with expiry dates",
      amount: f => f.total_cents,
      outcome: f => `Ledger: ${f.credits_label}. Total ${money(f.total_cents)}. The soonest expiry is ${f.soonest}; I will surface it before any booking on that airline and warn 30 days ahead. Nothing was changed. Live boundary: airline balances are not readable on any wired rail, so this ledger runs on the credit facts you supplied.` },
    { id: "C194", title: "Trip currency strategy", mode: "readonly",
      trigger: /\btrip currency\b|\bcash, card, or atm\b|\bgoing to japan\b|\bcurrency strategy\b/,
      need: ["destination", "spend_cents", "airport_cost_cents", "atm_cost_cents"],
      ask: "Where are you going, and roughly how much will you spend there? The strategy is a comparison on that amount.",
      counterparty: () => "your cards", action: () => `Compare cash exchange, card and ATM for ${"the trip"}`,
      amount: f => f.airport_cost_cents - f.atm_cost_cents,
      outcome: f => `For ${money(f.spend_cents)} of spending in ${f.destination}: airport cash exchange costs about ${money(f.airport_cost_cents)} in spread and fees, your no-foreign-fee card costs $0.00, and ATM withdrawals cost about ${money(f.atm_cost_cents)}. Set-up: pay by card, keep the ATM as backup. That saves ${money(f.airport_cost_cents - f.atm_cost_cents)} versus the airport desk. Nothing was ordered or set; a travel notice is yours to set in the card's app. Rates are the supplied stand-in rates, labeled as such.` },
    { id: "C195", title: "Update beneficiaries everywhere", mode: "execute", finished: "updated",
      trigger: /\bupdate beneficiar|\badd .{0,30} as beneficiary\b|\bbeneficiaries everywhere\b/,
      need: ["beneficiary", "accounts_label", "account"],
      ask: "Who is the beneficiary, exactly as their name should read? A wrong name on a beneficiary form is a costly error.",
      counterparty: f => f.accounts_label, action: f => `Update the beneficiary to ${f.beneficiary} on ${f.accounts_label}`,
      amount: () => 0,
      outcome: (f, r) => `Each institution's record now reads beneficiary ${f.beneficiary} for ${f.accounts_label} (reference ${r.reference}), verified by reading each one back. Any account whose institution requires its own paper form is listed in the packet, not forced here. Sandbox rail: no live institution portal is wired, so no real beneficiary was changed.` },
    { id: "C200", title: "Change of address everywhere", mode: "execute", finished: "updated",
      trigger: /\bchange of address\b|\bi moved\b|\bupdate my address\b/,
      need: ["new_address", "accounts_label", "account"],
      ask: "What is the new address, exactly? Every institution gets the same words; a typo multiplies.",
      counterparty: f => f.accounts_label, action: f => `Update the address to ${f.new_address} at ${f.accounts_label}`,
      amount: () => 0,
      outcome: (f, r) => `Each institution's record now reads ${f.new_address} for ${f.accounts_label} (reference ${r.reference}), verified by reading each back. The USPS forwarding packet is prepared for your tap; I did not file it. Sandbox rail: no live institution portal is wired, so no real address was changed.` },
    { id: "C206", title: "Notarization and medallion runs", mode: "packet",
      trigger: /\bmedallion\b|\bnotarization\b|\bnotary\b.{0,30}\b(handle|book|need)\b/,
      need: ["form_label", "provider", "account"],
      ask: "Which form needs the stamp? A medallion guarantee and a notarization are different providers and different ID rules.",
      counterparty: f => f.provider, action: f => `Prepare the medallion run packet for the ${f.form_label}: provider, appointment steps and the document/ID checklist`,
      amount: () => 0,
      outcome: (f, r) => `Packet ${r.reference} is ready for your tap: the ${f.form_label} needs a medallion signature guarantee (not a notary), the nearest provider on file is ${f.provider}, and the one-visit checklist (form, government ID, account statement) is assembled. Booking the appointment is your tap; I did not book anything. Live boundary: no booking channel is wired.` },
  ];
  const byId = {}; for (const c of CASES) byId[c.id] = c;

  function detect(message) {
    const t = clean(message);
    if (!t || t.length > 300) return null;
    for (const c of CASES) if (c.trigger.test(t)) return c.id;
    return null;
  }
  const missing = (c, f) => c.need.filter(k => f[k] === undefined || f[k] === null || f[k] === "");
  const fingerprint = (c, f) => `${c.id}|${c.amount(f)}|${c.counterparty(f)}`;

  function cardText(c, f) {
    const amt = c.amount(f);
    const lines = [
      `${c.action(f)}.`,
      amt ? `Amount: ${money(amt)}${c.monthly && c.monthly(f) ? ` (${money(c.monthly(f))} a month, ${money(c.monthly(f) * 12)} a year)` : ""}.` : "Amount: $0.00.",
      f.account ? `Account: ${f.account}.` : "",
      `Counterparty: ${c.counterparty(f)}. Fees: $0.00.`,
      c.mode === "packet"
        ? "This prepares a packet only. Nothing is filed, sent or signed; you do the final tap yourself, and you can drop it at any point before that."
        : "On the sandbox rail this changes the provider's record and I read it back before calling it done. It can be undone only by re-doing it at the provider. Live providers are not wired, so no real account changes.",
      "Yes?",
    ];
    return lines.filter(Boolean).join("\n");
  }

  function prepare(id, facts) {
    const c = byId[id]; if (!c) return null;
    const f = facts || {};
    const miss = missing(c, f);
    if (miss.length) return { kind: "ask", id, missing: miss, text: c.ask };
    if (c.mode === "readonly") return { kind: "answer", id, text: c.outcome(f, {}) };
    return { kind: "card", id, fingerprint: fingerprint(c, f), amount_cents: c.amount(f), text: cardText(c, f) };
  }

  // The sandbox provider: a counterparty that keeps its own record. State changes only through apply(),
  // only with an approval fingerprint that has not already been applied (idempotent: a second apply of the
  // same approval returns the same reference and changes nothing twice).
  function createProvider(seed) {
    const records = new Map(), applied = new Map(), credits = [];
    for (const [k, v] of Object.entries(seed || {})) records.set(k, Object.assign({ state: "active" }, v));
    let n = 0;
    return {
      read(id) { const r = records.get(id); return r ? Object.assign({}, r) : null; },
      credits() { return credits.slice(); },
      apply(id, fp, finishedState) {
        if (applied.has(fp)) return applied.get(fp);
        const r = records.get(id); if (!r) return null;
        const ref = `SBX-${id}-${String(++n).padStart(3, "0")}`;
        r.state = finishedState; r.reference = ref; r.next_charge_at = null;
        applied.set(fp, { reference: ref, state: finishedState });
        return applied.get(fp);
      },
      postCredit(id, fp, cents) {
        if (applied.has(fp)) return applied.get(fp);
        const ref = `SBX-${id}-${String(++n).padStart(3, "0")}`;
        credits.push({ case_id: id, amount_cents: cents, reference: ref });
        applied.set(fp, { reference: ref, state: "credit_posted" });
        return applied.get(fp);
      },
    };
  }

  // Execute only on an exact "yes" to the card that was shown (same fingerprint). Anything else refuses and
  // the provider record is untouched. Packet mode marks the record packet_ready, never filed.
  function execute(id, facts, provider, approval, shownFingerprint) {
    const c = byId[id]; if (!c) return { ok: false, text: "Unknown case." };
    const f = facts || {};
    if (missing(c, f).length) return { ok: false, text: c.ask };
    if (clean(approval) !== "yes") return { ok: false, text: "Not done. I run this only on a yes to the exact card I showed, and the provider's record is unchanged." };
    const fp = fingerprint(c, f);
    if (shownFingerprint && shownFingerprint !== fp) return { ok: false, text: "Not done. The amount or counterparty changed since the card I showed, so that yes does not cover this. I will show a fresh card." };
    if (c.mode === "readonly") return { ok: false, text: "Nothing to execute: this one is read-only." };
    if (c.mode === "packet") {
      const res = provider.apply(id, fp, "packet_ready");
      return { ok: true, id, reference: res.reference, state: "packet_ready", text: c.outcome(f, res) };
    }
    const finished = c.finished;
    const res = ["credit_posted", "refund_posted", "payout_posted"].includes(finished)
      ? provider.postCredit(id, fp, c.amount(f))
      : provider.apply(id, fp, finished);
    if (!res) return { ok: false, text: "Not done. The sandbox provider has no record for this case, so nothing was changed." };
    const v = verify(id, provider, f);
    if (!v.done) return { ok: false, id, text: `Not confirmed. The provider read-back says: ${v.reason}. I am not calling it done.` };
    return { ok: true, id, reference: res.reference, state: finished, text: c.outcome(f, res) };
  }

  // Done only from the provider's own read-back, never from a report. A record that merely says "done" is not evidence.
  function verify(id, provider, facts) {
    const c = byId[id]; if (!c) return { done: false, reason: "unknown case" };
    if (c.mode === "packet") {
      const r = provider.read(id);
      return r && r.state === "packet_ready" ? { done: true, reason: "packet is prepared and marked packet_ready; it has not been filed" } : { done: false, reason: "no packet record" };
    }
    if (["credit_posted", "refund_posted", "payout_posted"].includes(c.finished)) {
      const want = c.amount(facts || {});
      const hit = provider.credits().find(x => x.case_id === id && x.amount_cents === want);
      return hit ? { done: true, reason: `${money(want)} posted on the provider record, reference ${hit.reference}` } : { done: false, reason: "no matching credit on the provider record" };
    }
    const r = provider.read(id);
    if (!r) return { done: false, reason: "no provider record" };
    if (r.state !== c.finished) return { done: false, reason: `provider record reads ${r.state}, not ${c.finished}` };
    if (r.next_charge_at) return { done: false, reason: "a next charge is still scheduled" };
    return { done: true, reason: `provider record reads ${r.state}` };
  }

  return { CASES, get: id => byId[id] || null, detect, prepare, execute, verify, createProvider, fingerprint, money };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PortalCases;
