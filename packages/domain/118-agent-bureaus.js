  /* Credit bureaus (K9: C139 freeze, C140 report dispute, C151 identity theft, C205 minor freeze):
     the guided flows for the three bureaus' real processes. The identity steps and every submission
     are the person's own taps at each bureau — Upmore prepares, guides, tracks and records; it never
     submits, never holds a PIN or an identity number, and says so in the conversation. Bureau facts
     (links, phones, mail addresses, clocks) checked 2026-10-12 against the bureaus' own pages, the
     FTC's IdentityTheft.gov recovery booklet and FCRA §605A/§611: freezes are free, an online or
     phone freeze lands within one business day and lifts within one hour; a fraud alert placed at ONE
     bureau must be passed to the other two (one year initial, seven years extended with an Identity
     Theft Report); a bureau dispute investigation runs about 30 days; a protected-consumer (minor)
     freeze is free for a child under 16 and runs by mail with documents. Pure. */
  const AgentBureaus = (() => {
    const DAY = 86400000;
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const ymd = s => String(s || "").slice(0, 10);
    const dayMs = s => Date.parse(ymd(s) + "T00:00:00Z");
    const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / DAY);
    const addDays = (s, n) => new Date(dayMs(s) + n * DAY).toISOString().slice(0, 10);
    const pretty = s => { const d = new Date(dayMs(s)); return isNaN(d) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); };
    // Identity digits the person typed (an SSN, spaced or not; a long card/account number) never travel onward.
    const IDNUM = /\b\d{3}[- ]\d{2}[- ]\d{4}\b|\b\d(?:[ -]?\d){8,18}\b/g;
    const redact = s => String(s == null ? "" : s).replace(IDNUM, "[number removed]");
    const hasIdNum = s => new RegExp(IDNUM.source).test(String(s || ""));

    const CHECKED = "2026-10-12";
    const BUREAUS = [
      { bureau: "Equifax", key: "equifax", freeze_url: "https://www.equifax.com/personal/credit-report-services/credit-freeze/", freeze_phone: "1-888-298-0045", fraud_phone: "1-800-525-6285", account_name: "a free myEquifax account", freeze_mail: "Equifax Information Services LLC, P.O. Box 105788, Atlanta, GA 30348-5788", dispute_mail: "Equifax Information Services LLC, P.O. Box 105069, Atlanta, GA 30348-5069", minor_mail: "Equifax Information Services LLC, P.O. Box 105788, Atlanta, GA 30348-5788", minor_form: "the Equifax Minor Security Freeze Request Form" },
      { bureau: "Experian", key: "experian", freeze_url: "https://www.experian.com/freeze/center.html", freeze_phone: "1-888-397-3742", fraud_phone: "1-888-397-3742", account_name: "a free Experian account", freeze_mail: "Experian Security Freeze, P.O. Box 9554, Allen, TX 75013", dispute_mail: null, minor_mail: "Experian, P.O. Box 9554, Allen, TX 75013", minor_form: "Experian's minor freeze request form" },
      { bureau: "TransUnion", key: "transunion", freeze_url: "https://www.transunion.com/credit-freeze", freeze_phone: "1-800-916-8800", fraud_phone: "1-800-680-7289", account_name: "a free TransUnion Service Center account", freeze_mail: "TransUnion, P.O. Box 160, Woodlyn, PA 19094", dispute_mail: null, minor_mail: "TransUnion, P.O. Box 380, Woodlyn, PA 19094", minor_form: "a letter asking TransUnion to add a protected consumer freeze" }
    ];
    const bureauByKey = k => BUREAUS.find(b => b.key === k) || null;
    const keyOf = name => { const t = String(name || "").toLowerCase(); return t.includes("equifax") ? "equifax" : t.includes("experian") ? "experian" : t.includes("transunion") || t.includes("trans union") ? "transunion" : null; };

    // A PIN or password the person pastes is never accepted, echoed or stored: the reply names where it belongs instead.
    function secretIn(text) {
      const t = String(text || "");
      if (hasIdNum(t)) return "identity number";
      if (/\b(?:pin|password|passcode)\b[^.]{0,24}?\b\d{3,}\b/i.test(t) || /\b\d{4,8}\b[^.]{0,16}?\b(?:pin|password)\b/i.test(t)) return "PIN";
      return null;
    }

    // Which bureaus a message says are done. A bureau named next to a failure or a "not yet" does not count.
    function bureausMarkedDone(text) {
      const t = " " + String(text || "").toLowerCase() + " ";
      const done = [];
      for (const b of BUREAUS) {
        const names = b.key === "transunion" ? ["transunion", "trans union"] : [b.key];
        for (const n of names) {
          let i = t.indexOf(n);
          while (i >= 0) {
            const around = t.slice(Math.max(0, i - 30), i + n.length + 40);
            if (/\b(not|n't|failed|fail|couldn|could not|unable|error|mistake|locked out|trying|try|will|going to|tomorrow)\b/.test(around)) { /* not done */ }
            else if (/\b(frozen|froze|freeze is (on|placed)|done|finished|placed|set|confirmed|complete)\b/.test(around)) done.push(b.key);
            i = t.indexOf(n, i + 1);
          }
        }
      }
      return [...new Set(done)];
    }
    const allDoneText = t => /\ball (three|3) (are |is )?(frozen|done|frozen now)\b|\bfroze all\b|\ball frozen\b|\bfinished all\b/.test(String(t || "").toLowerCase());

    function freezeSteps(b, doneFlag) {
      return `${b.bureau}${doneFlag ? " — done" : ""}: ${b.freeze_url} (or ${b.freeze_phone}). Sign in with ${b.account_name}, answer the identity questions from your own history, and place the free security freeze — skip any paid lock or monitoring offer on the page; the freeze is the free one. If the bureau issues a PIN or password, it goes in your password manager, never here. Online or by phone it is in place within one business day.`;
    }

    // C139: the three-bureau freeze walkthrough, progress-aware. state = { bureaus: [{bureau, state, recorded_at, confirmation_ref}] }.
    function freezePlan(state, opts) {
      const o = opts || {}, done = new Set(((state || {}).bureaus || []).filter(b => String(b.state || "").toLowerCase() === "frozen").map(b => keyOf(b.bureau)).filter(Boolean));
      if (o.extra_done) for (const k of o.extra_done) done.add(k);
      const remaining = BUREAUS.filter(b => !done.has(b.key));
      const lines = [];
      if (!done.size) lines.push("Here is the freeze, all three bureaus. It is free, it does not touch your existing accounts or your score, and it blocks new accounts opened in your name until you lift it. I will walk you through each bureau and keep the checklist — the identity steps and the final tap at each bureau are yours, because each bureau has to verify you itself.");
      else if (remaining.length) lines.push(`Recorded. ${BUREAUS.filter(b => done.has(b.key)).map(b => b.bureau).join(", ")} frozen; ${remaining.map(b => b.bureau).join(", ")} to go. A freeze at one bureau does not cover the others — a lender can pull any of the three.`);
      else lines.push("That is all three. Equifax, Experian and TransUnion are frozen and recorded, with the date for each. Nothing new can be opened in your name until you lift a freeze; when you need to apply for something, tell me and I will walk the thaw — online or by phone a lift lands within one hour, and you can set it to re-freeze automatically.");
      for (const b of BUREAUS) lines.push(done.has(b.key) ? `${b.bureau} — frozen and recorded.` : freezeSteps(b, false));
      if (remaining.length) lines.push("As each one confirms, tell me \"Equifax is frozen\" and I will record it with the date — the confirmation screen is your proof, and the PIN (where one is issued) stays with you, never in this chat.");
      return { done: [...done], remaining: remaining.map(b => b.bureau), all_frozen: !remaining.length, text: lines.join("\n"), checked: CHECKED };
    }

    // C139 thaw: the same walkthrough in reverse, with the statutory timing.
    function thawPlan(state) {
      const g = freezePlan(state);
      const lines = ["Lifting a freeze is yours at each bureau too, the same sign-in you froze with. Online or by phone the lift must land within one hour; by mail, within three business days. You can lift for one creditor or a date window and let it re-freeze on its own — that is the safer default."];
      for (const b of BUREAUS) lines.push(`${b.bureau}: ${b.freeze_url} (or ${b.freeze_phone}) — sign in, choose the temporary lift, set the window.`);
      const frozenNames = g.done.map(k => bureauByKey(k).bureau).join(", ");
      lines.push(`Right now my record says: ${g.all_frozen ? "all three frozen" : frozenNames ? `frozen so far: ${frozenNames}` : "no freeze recorded yet"}. Tell me which bureau you lifted and for how long, and I will record the window so I can remind you when it closes.`);
      return { text: lines.join("\n"), checked: CHECKED };
    }

    // The record that goes to the vault-shaped store: bureau, state, date, and where the PIN lives — never the PIN.
    function freezeRecord(bureauName, now, confirmationRef, pinLocation) {
      const b = bureauByKey(keyOf(bureauName)); if (!b) return null;
      if (pinLocation && /\d{3,}/.test(pinLocation)) throw new Error("Never store a freeze PIN; store where it is kept.");
      const rec = { bureau: b.bureau, state: "frozen", recorded_at: now || null, confirmation_ref: confirmationRef ? redact(confirmationRef) : null, pin_location_hint: pinLocation || null };
      if (hasIdNum(JSON.stringify(rec))) throw new Error("Identity number refused.");
      return rec;
    }

    // C140: the dispute packet. The error is documented from the report rows the person has (or, with no
    // report connected, from what they describe), the letter names the item by furnisher and amount —
    // never an identity number — and the filing channels and the 30-day clock come with it.
    function disputeLetter(report, item, reason) {
      const name = item.name ? redact(item.name) : "the item below", why = redact(reason || "This item is not mine / is incorrect.").replace(/\.\s*$/, "");
      const text = `To ${report.bureau || "[bureau]"}: I dispute the following item on my credit report${report.as_of ? ` as of ${report.as_of}` : ""}: ${name}${item.opened_on ? `, opened ${item.opened_on}` : ""}${item.amount_cents != null ? `, reported balance ${money(item.amount_cents)}` : ""}. Reason: ${why}. Please investigate, correct or remove the item, and send me the result in writing, as the Fair Credit Reporting Act requires. Enclosed: ${(item.evidence || ["a copy of my ID", "the supporting documents"]).map(redact).join(", ")}.`;
      return { text, contains_identity_numbers: hasIdNum(text) };
    }
    function disputePacket(report, item, reason) {
      const letter = disputeLetter(report, item, reason);
      const channels = BUREAUS.map(b => `${b.bureau}: online through its dispute center (start from ${b.freeze_url.replace(/credit-freeze\/?$/, "")} and choose Disputes)${b.dispute_mail ? `, or by mail to ${b.dispute_mail}` : ""}, or ${b.freeze_phone}`).join("\n");
      const lines = [
        `The error, documented: ${item.name || "the account"}${item.amount_cents != null ? `, ${money(item.amount_cents)}` : ""}${item.opened_on ? `, opened ${item.opened_on}` : ""}${report.as_of ? `, on your ${report.bureau || "credit"} report as of ${report.as_of}` : ""}. ${redact(reason || "")}`,
        "The dispute letter, ready to file (it names the account by furnisher and amount — no identity number is in it; add yours only on the bureau's own form):",
        letter.text,
        "File it with each bureau that shows the item — a dispute at one does not reach the others. Channels:",
        channels,
        "Evidence to attach: a copy of your government ID, and anything that shows the error (the FTC Identity Theft Report if it is not yours, statements showing the real balance or that the account was paid/closed). Keep the confirmation number the bureau gives you and tell me the date you filed — I track the clock from there: the bureau has about 30 days to investigate (45 if you send more information mid-investigation), then it must send you the result in writing. If the deadline passes or the item is still there, I draft the escalation — a re-dispute with the new evidence and a complaint to the Consumer Financial Protection Bureau (consumerfinance.gov/complaint)."
      ];
      return { letter: letter.text, contains_identity_numbers: letter.contains_identity_numbers, text: lines.join("\n"), checked: CHECKED };
    }
    // The 30-day investigation clock (FCRA §611: 30 days; 45 when the consumer adds information or the
    // dispute follows a free annual report — the packet states both).
    function disputeClock(filedOn, today) {
      const due30 = addDays(filedOn, 30), due45 = addDays(filedOn, 45), left = daysBetween(today, due30);
      let status, line;
      if (left > 5) { status = "investigating"; line = `Filed ${pretty(filedOn)}. The bureau's 30 days run to ${pretty(due30)} — ${left} days left. It must send the result in writing; if you send more evidence the clock can stretch to ${pretty(due45)}.`; }
      else if (left >= 0) { status = "due_soon"; line = `Filed ${pretty(filedOn)}; the 30-day deadline is ${pretty(due30)} — ${left} day${left === 1 ? "" : "s"} left. If nothing has arrived in writing, that deadline is the bureau's, not yours.`; }
      else { status = "overdue"; line = `Filed ${pretty(filedOn)}; the 30 days ran out on ${pretty(due30)}, ${-left} day${left === -1 ? "" : "s"} ago. That is escalation time: I will draft the re-dispute with any new evidence and the CFPB complaint (consumerfinance.gov/complaint) — a bureau that misses its deadline has to answer for the item, and an item it cannot verify has to come off.`; }
      return { filed_on: filedOn, due_on: due30, due_45_on: due45, days_left: left, status, text: line };
    }

    // C151: identity theft recovery — the FTC report, the fraud alerts, the freeze, per-account
    // disputes and the verification pass, in the order the FTC's own recovery plan runs them.
    function identityTheftPlan(input) {
      const in2 = input || {}, accounts = in2.accounts || [], total = accounts.reduce((s, a) => s + (a.amount_cents || 0), 0);
      const acctLines = accounts.length ? accounts.map(a => `- ${redact(a.name || "account")}${a.amount_cents != null ? `, ${money(a.amount_cents)}` : ""}${a.opened_on ? `, opened ${a.opened_on}` : ""} — dispute with the issuer's fraud department and ask for the account to be closed and removed; the letter is in your packet.`) : ["- Every account you do not recognize goes on the list — tell me each one as it shows on the report and I add its issuer dispute to the packet."];
      const lines = [
        "Here is the recovery, in order. The filings where you swear to the facts are your taps — the FTC and the bureaus have to hear from you — and I prepare everything around them.",
        "1. The FTC report: go to https://www.identitytheft.gov — it walks you through what happened and produces your Identity Theft Report with the affidavit, plus a personal recovery plan. That report is the key document: it is what makes bureaus block fraudulent information and makes issuers take the disputes seriously. Filing a police report is optional and helps if a creditor asks for one.",
        "2. Fraud alerts: call ONE bureau — Equifax " + BUREAUS[0].fraud_phone + ", Experian " + BUREAUS[1].fraud_phone + ", TransUnion " + BUREAUS[2].fraud_phone + ". By law that bureau must pass the alert to the other two. The first alert lasts one year and entitles you to free copies of all three reports; with your Identity Theft Report you can ask for the extended alert — seven years, and creditors must contact you before issuing credit.",
        "3. Freeze all three reports (stronger than an alert — it blocks the report entirely). I will walk it bureau by bureau, the C139 checklist.",
        "4. The fraudulent accounts — dispute each one with its issuer and ask each bureau to block it (send the bureau your Identity Theft Report, a copy of your ID, and the list of what is fraudulent; the bureau must block it and tell the creditor):",
        ...acctLines,
        accounts.length ? `Total showing on the fraudulent accounts: ${money(total)}. You do not owe it — a fraudulent debt cannot be sent to collections once the issuer and bureaus have the report.` : "You do not owe fraudulent debts — once the issuer and bureaus have the report, they cannot send them to collections.",
        "5. Verify: when the bureaus send their results, pull the three reports again (free at https://www.annualcreditreport.com, and free with the fraud alert) and we check every fraudulent item is gone. Anything still standing gets the escalation — re-dispute with the FTC report and a CFPB complaint.",
        "Tell me as each step lands — \"FTC report filed\", \"fraud alert set\", \"the card company confirmed\" — and I keep the case record: dates, references, what is still open. Never send me an SSN or a bureau PIN here."
      ];
      return { steps: 5, fraudulent_total_cents: total, text: lines.join("\n"), checked: CHECKED };
    }

    // C205: the protected-consumer (minor) freeze. Under 16 runs by mail at all three bureaus with the
    // parent's ID and the child's documents; if the bureau has no file it creates one and freezes it —
    // that empty frozen file is the point.
    function minorFreezePlan(child, state) {
      const c = child || {}, name = c.first_name ? redact(c.first_name) : "your child";
      const done = new Set(((state || {}).bureaus || []).filter(b => String(b.state || "").toLowerCase() === "frozen").map(b => keyOf(b.bureau)).filter(Boolean));
      const docs = "your government photo ID; proof of your address (a utility bill, bank or insurance statement); your child's birth certificate; your child's Social Security card; and, if you are a guardian rather than a parent, the court order showing it";
      const teen = c.age != null && c.age >= 16;
      const lines = [
        teen ? `${name} is 16 or older: in most states a 16- or 17-year-old places the freeze directly, the adult way — online at each bureau (the C139 walkthrough) — because the parent mail process below is the under-16 one. If a bureau will not take it online at that age, the mail process below is the fallback.` : `Freezing ${name}'s credit is a protected consumer freeze: federal law makes it free for a child under 16, and you request it separately at each bureau — it is done by mail, with documents, because the bureau has to be sure you are the parent. If a bureau has no file on ${name}, it creates one and freezes it; that empty, frozen file is exactly what stops a thief building credit on the number.`,
        `Gather one set of copies per bureau: ${docs}. Never send me the Social Security number or a photo of the card here — the copies go in the envelopes, to the bureaus.`,
        ...BUREAUS.map(b => `${b.bureau}${done.has(b.key) ? " — confirmation recorded" : ""}: complete ${b.minor_form} and mail it with the copies to ${b.minor_mail}.`),
        "Each bureau mails back a confirmation — tell me as each arrives (\"Equifax confirmed\") and I record it with the date; the PIN or reference the bureau issues stays in your password manager, not in this chat.",
        `Milestones I will re-check with you: at 16 (in many states ${name} can then manage the freeze directly) and at 18, when the file becomes a regular adult file — the freeze stays on until it is lifted, so we confirm it carried over.`
      ];
      return { text: lines.join("\n"), remaining: BUREAUS.filter(b => !done.has(b.key)).map(b => b.bureau), checked: CHECKED };
    }

    // Doorsteps (owner addendum, 2026-10-12): for every flow that runs through a logged-in service,
    // the guided session drives to the last screen before the executing tap — sign-in page opened,
    // the person signed in by their own hand (any code is typed by them in their own window; a code
    // never enters chat, a log or a screenshot), the action page loaded with the action ready — and
    // STOPs. The final tap is the person's, at every bureau, every time. These descriptors are what
    // the guided session follows and what the sandbox doorstep renderings are built from; the live
    // session itself runs in the person's own browser lane.
    const DOORSTEPS = {
      C139: BUREAUS.map(b => ({ capability: "C139", service: b.bureau, login_url: b.freeze_url, screens: [
        { name: "login", what: `${b.bureau}'s sign-in page (${b.account_name}). The person signs in themselves; an identity check or code is completed by them in their own window.` },
        { name: "ready", what: `${b.bureau}'s freeze page loaded, signed in, with "Place a security freeze" (the free freeze, not a paid lock) selected and ready. Stop here: the place-freeze tap is the person's.` } ] })),
      C140: [{ capability: "C140", service: "Experian (the bureau showing the error)", login_url: "https://www.experian.com/freeze/center.html", screens: [
        { name: "login", what: "Experian's sign-in page. The person signs in themselves and completes any identity check in their own window." },
        { name: "ready", what: "Experian's dispute center with the dispute filled in: the documented error (furnisher, $ amount, opened date), the reason, and the evidence attached — the packet from disputePacket. Stop here: the submit tap is the person's." } ] }],
      C151: [{ capability: "C151", service: "FTC IdentityTheft.gov", login_url: "https://www.identitytheft.gov", screens: [
        { name: "ready", what: "IdentityTheft.gov's report flow filled in with what happened (the fraudulent accounts, from the person's own words) and the affidavit ready. There is no account login at the FTC — and no login screen to photograph. Stop here: the submit tap, which swears to the facts, is the person's." } ],
        note: "The fraud-alert step has no login either: it is the person's own phone call to one bureau (numbers in identityTheftPlan). The bureau freeze doorsteps are the C139 ones." }],
      C205: [{ capability: "C205", service: "All three bureaus (minor freeze)", login_url: null, screens: [],
        note: "No authenticated session exists in the minor-freeze process: it runs by mail at all three bureaus. The doorstep is the assembled mail packet — forms, document copies, addressed envelopes — ready to send; minorFreezePlan is that packet's checklist, and its surface photo is the ready-action evidence." }]
    };
    function doorstepPlan(capability) { return DOORSTEPS[capability] || []; }

    // ---- Chat entry: classify and answer. ctx = { today, freeze_state, minor_state, report, minor } ----
    const MINOR = /\b(child|kid|son|daughter|minor|teen)\b|child'?s|kid'?s/i;
    function classify(text) {
      const t = String(text || "").toLowerCase();
      // A how/what question is information, not a request — unless it carries a first-person action
      // ("can you freeze my credit", "how do I unfreeze my credit" are requests; "does a credit
      // freeze hurt my score" is a question).
      if (/^(what|how|does|do|is|are|can|should|why|explain|tell me about)\b/.test(t) && !/(freeze|unfreeze|thaw|lift|dispute|fix|block|remove) (my|up my)\b|\bin my name\b|\bon my report\b|\bmy report\b|\bmy credit\b/.test(t)) return null;
      if (/\b(unfreeze|thaw|lift|temporarily remove|remove the freeze)\b/.test(t) && /\b(credit|freeze|bureau)\b/.test(t)) return "thaw";
      if (MINOR.test(t) && /\bfreez/.test(t)) return "minor_freeze";
      if (/\bidentity theft\b|opened (a )?(card|account|credit card) in my name|someone (opened|used my)|fix my identity|fraudulent account/.test(t)) return "identity_theft";
      // "Freeze my credit card" is an issuer card freeze, not a bureau freeze — unless a bureau or the report is named.
      if (/\bfreez/.test(t) && /\b(credit|bureau|equifax|experian|transunion)\b/.test(t) && !(/\bcredit card\b/.test(t) && !/\b(report|bureau|equifax|experian|transunion)\b/.test(t)) && !/\b(bank account|rent)\b/.test(t)) return "freeze";
      if (/\b(dispute|error|wrong|not mine|isn'?t mine|doesn'?t belong)\b/.test(t) && /\b(credit report|my report|bureau|collections?)\b/.test(t)) return "dispute";
      if (/\bcollections?\b/.test(t) && /\b(report|mine)\b/.test(t)) return "dispute";
      return null;
    }
    function isBureauAsk(text) { return classify(text) != null || bureausMarkedDone(text).length > 0 || allDoneText(text); }

    function answer(text, ctx) {
      const c = ctx || {}, today = c.today || new Date().toISOString().slice(0, 10), raw = String(text || ""), t = raw.toLowerCase();
      const secret = secretIn(raw);
      // A pasted PIN/SSN is refused before anything else, and never echoed (redact strips the digits).
      if (secret && (classify(raw) || bureausMarkedDone(raw).length || /\b(freez|bureau|equifax|experian|transunion|pin|credit)\b/.test(t))) {
        return { kind: "secret_refused", capability: null, text: `Stop there — do not send a ${secret} in this chat. I never store one, and nothing you pasted was kept. A bureau PIN belongs in your password manager; an identity number belongs only on the bureau's own secure form. Tell me just which bureau confirmed ("Equifax is frozen") and I will record the freeze and the date.` };
      }
      // Dispute-clock follow-ups.
      if (/\bfiled (the |my )?dispute\b|\bdispute (is |was )?filed\b/.test(t) && c.dispute_filed_on == null) {
        const clock = disputeClock(today, today);
        return { kind: "dispute_clock", capability: "C140", clock, text: `Recorded: dispute filed today, ${pretty(today)}. The bureau's 30 days run to ${pretty(clock.due_on)}; it must send the result in writing, and if you send more evidence the clock can stretch to ${pretty(clock.due_45_on)}. Tell me the bureau's confirmation number when it arrives and I will attach it to the case.` };
      }
      if ((c.dispute_filed_on || c.dispute_filed_on === "") && /\b(still (on|there)|not removed|still shows|deadline|30 days|overdue)\b/.test(t)) {
        const clock = disputeClock(c.dispute_filed_on || today, today);
        return { kind: "dispute_clock", capability: "C140", clock, text: clock.text };
      }
      if (/\b(collections?|account|item) (is )?(gone|removed|deleted|off my report)\b|dispute worked|they removed it/.test(t)) {
        return { kind: "dispute_outcome", capability: "C140", text: "Recorded as a verified correction. Two checks remain: pull the other two bureaus' reports (free at https://www.annualcreditreport.com) — an item removed at one bureau can still sit on another — and keep the bureau's result letter with the packet. If it reappears, that is a reinsertion the bureau has to notify you about within five business days, and I will draft the response." };
      }
      // C151 case follow-ups: each landed step is recorded and the next one named.
      if (/\bftc\b[^.]*\b(filed|done|finished|complete)\b|\bfiled\b[^.]*\bftc\b|\bidentity theft report\b[^.]*\b(filed|done)\b/.test(t)) {
        return { kind: "identity_theft_step", capability: "C151", step: "ftc_filed", text: "Recorded: FTC Identity Theft Report filed, " + pretty(today) + ". That report is now the key to steps 2 and 4 — keep the affidavit the site gave you. Next: the fraud alert. Call ONE bureau (Equifax " + BUREAUS[0].fraud_phone + ", Experian " + BUREAUS[1].fraud_phone + ", TransUnion " + BUREAUS[2].fraud_phone + ") — it must pass the alert to the other two — and because you now hold the Identity Theft Report, ask for the extended alert: seven years, and creditors must contact you before issuing credit. Tell me when it is set." };
      }
      if (/\bfraud alert\b[^.]*\b(set|placed|done|confirmed|active)\b/.test(t)) {
        return { kind: "identity_theft_step", capability: "C151", step: "alert_set", text: "Recorded: fraud alert set, " + pretty(today) + " — the bureau you called owes the other two the same alert, and you are owed free copies of all three reports; pull them at https://www.annualcreditreport.com and we will list every account that is not yours. Next: freeze all three reports (the alert warns creditors; the freeze blocks the report itself), then the issuer disputes for each fraudulent account. Say \"freeze my credit\" when you are ready and I will walk it." };
      }
      // Freeze confirmations recorded from follow-ups.
      const marked = bureausMarkedDone(raw);
      if (c.minor && marked.length && /\b(confirm\w*|frozen|froze|done|mailed|received)\b/.test(t)) {
        const prior = ((c.minor_state || {}).bureaus || []).filter(b => String(b.state || "").toLowerCase() === "frozen").map(b => keyOf(b.bureau));
        const nowState = { bureaus: [...new Set([...prior, ...marked])].map(k => ({ bureau: bureauByKey(k).bureau, state: "frozen" })) };
        const p = minorFreezePlan(c.minor, nowState);
        const records = marked.map(k => freezeRecord(k, today));
        return { kind: "minor_freeze_record", capability: "C205", records, text: `Recorded for ${c.minor.first_name ? redact(c.minor.first_name) : "your child"}: ${marked.map(k => bureauByKey(k).bureau).join(", ")} confirmed frozen, ${pretty(today)}.\n${p.text}` };
      }
      if ((marked.length || allDoneText(raw)) && /\b(freez|frozen|froze|bureau|equifax|experian|transunion|all three)\b/.test(t)) {
        const extra = allDoneText(raw) ? BUREAUS.map(b => b.key) : marked;
        const plan = freezePlan(c.freeze_state, { extra_done: extra });
        const records = extra.map(k => freezeRecord(k, today));
        return { kind: "freeze_record", capability: "C139", records, text: plan.text };
      }
      const kind = classify(raw);
      if (!kind) return null;
      if (kind === "freeze") { const p = freezePlan(c.freeze_state); return { kind, capability: "C139", text: p.text, remaining: p.remaining }; }
      if (kind === "thaw") { const p = thawPlan(c.freeze_state); return { kind, capability: "C139", text: p.text }; }
      if (kind === "minor_freeze") { const p = minorFreezePlan(c.minor, c.minor_state); return { kind, capability: "C205", text: p.text, remaining: p.remaining }; }
      if (kind === "identity_theft") { const p = identityTheftPlan({ accounts: c.fraud_accounts || [] }); return { kind, capability: "C151", text: p.text, fraudulent_total_cents: p.fraudulent_total_cents }; }
      if (kind === "dispute") {
        const report = c.report || null;
        if (!report) return { kind, capability: "C140", text: "I can build that dispute — first the report itself. No bureau is connected here, so pull your free reports at https://www.annualcreditreport.com (the federally authorized site; the reports are free weekly) and tell me exactly what the error shows: the creditor or collector's name, the amount, and the date it says the account opened. With that I document the error and draft the dispute letter with the evidence list and the 30-day clock. If there is a collections account that is not yours, say its name and amount as they appear — do not send any account or identity number." };
        const item = c.dispute_item || (report.collections || [])[0] || (report.accounts || [])[0] || { name: "the item" };
        const p = disputePacket(report, item, c.dispute_reason || "This account is not mine; I did not open it and I do not owe it.");
        return { kind, capability: "C140", text: p.text, contains_identity_numbers: p.contains_identity_numbers };
      }
      return null;
    }

    return { BUREAUS, CHECKED, DOORSTEPS, doorstepPlan, classify, isBureauAsk, answer, freezePlan, thawPlan, freezeRecord, bureausMarkedDone, disputeLetter, disputePacket, disputeClock, identityTheftPlan, minorFreezePlan, secretIn, money };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentBureaus;
