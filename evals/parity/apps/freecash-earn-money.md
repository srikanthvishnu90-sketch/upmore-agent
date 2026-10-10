# Freecash: Earn Money: parity checklist (FC)

Audit source for doc 03, generated from the catalog and the registry; edit docs/competition/features.json or evals/parity/registry-map.json, then regenerate.

28 outcomes, 100% accounted, 35.7% performed.

| Outcome | Upmore | Status | Note |
| --- | --- | --- | --- |
| FC-001 Signup | CORE-003 | CLAIMED | Earn-app signup is the app's own onboarding; Upmore's nearest capability is its onboarding interview. |
| FC-002 Social sign-in | CORE-003 | CLAIMED | Social sign-in is the app's own auth; no registry capability covers third-party login. |
| FC-003 Earning offer discovery | EARN-013 | CLAIMED |  |
| FC-004 Surveys | EARN-013 | CLAIMED | Paid surveys are a side-income surface (doc 03 Propel row). |
| FC-005 App testing | EARN-013 | CLAIMED | App testing offers are a side-income surface. |
| FC-006 Product reviews | EARN-013 | CLAIMED | Paid product reviews are a side-income surface. |
| FC-007 Game offers | EARN-002 | TESTED | Doc 03: game and app offers with milestone tracking are the EARN-002 pattern. |
| FC-008 Supported videos and downloads | EARN-013 | CLAIMED | Video and download offers are a side-income surface. |
| FC-009 Inspect offer requirements | EARN-002 | TESTED |  |
| FC-010 Completion and provider attribution | EARN-002 | TESTED | Completion and provider attribution are requirement tracking outcomes. |
| FC-011 Rewards accounting | EARN-011 | TESTED | Earn-app rewards accounting has no dedicated ledger capability; rewards valuation across programs is closest. |
| FC-012 Withdrawal thresholds | ALRT-010 | CLAIMED | Doc 03: cash-out threshold alerts are a T1 watch. |
| FC-013 PayPal cashout | PAY-015 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| FC-014 Bank cashout | PAY-010 | GATED | no money-movement partner (Dwolla, Modern Treasury, Unit, Column class) with KYC; the send lifecycle is proven against a fake rail in tests/money.test.cjs |
| FC-015 Crypto cashout | non-parity: investment-platform | n/a | Crypto-denominated payout puts earnings into a crypto custody surface; investment-platform feature excluded per doc 09. |
| FC-016 Gift-card redemption | EARN-011 | TESTED | Gift-card redemption is valued against other cash-out rails; no gift-card redemption capability exists. |
| FC-017 Payout eligibility | EARN-002 | TESTED | Payout eligibility is requirement tracking toward the cash-out threshold. |
| FC-018 Pending versus payable earnings | TXN-011 | TESTED | Pending vs payable earnings is the pending vs posted explanation. |
| FC-019 Attribution disputes | EARN-017 | CLAIMED | Attribution disputes are drafted like service complaint credits; no earn-app dispute capability exists. |
| FC-020 Non-guaranteed side-income expectations | EARN-013 | CLAIMED | Doc 03 agent edge: Upmore computes the effective hourly rate and frames income as non-guaranteed. |
| FC-X01 Before first withdrawal, user completes identity verification with Veriff (government ID photo + selfie); no alternative method. | SEC-012 | TESTED | Veriff ID verification is the app's KYC; Upmore's nearest capability is verification of sensitive commands. |
| FC-X02 User enables email-code two-factor authentication; risk-based codes for new devices/IPs. | SEC-012 | TESTED | Email-code two-factor maps to verification challenges on sensitive commands. |
| FC-X03 User earns shopping cashback via tracked partner-shop links; cashback Pending until shop confirms. | EARN-009 | CLAIMED |  |
| FC-X04 User deletes their account in Settings; separate GDPR data-deletion request processed within 30 days. | CORE-014 | CLAIMED |  |
| FC-X05 New user receives a $10 welcome bonus tied to signup/first offer. | EARN-001 | CLAIMED | A welcome bonus is surfaced by the signup bonus finder. |
| FC-X06 Gamified engagement features: weekly leagues, weekly lottery tickets, streaks, daily bonus ladder, open-case rewards, reward multipliers. | non-parity: gamification | n/a | Leagues, lotteries, streaks and bonus ladders farm attention; doc 03 and doc 11 say Upmore deliberately does not gamify and only tracks the money. |
| FC-X07 Referral/affiliate program and bonus codes. | EARN-003 | TESTED |  |
| FC-X08 Payout processing is outsourced to Tremendous (current) / Tango (legacy), who send claim emails and handle some payout support. | ALRT-007 | CLAIMED | Outsourced payout claim emails are handled by watching for the payout to land; no payout-processor capability exists. |
