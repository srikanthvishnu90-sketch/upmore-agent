# Propel EBT & SNAP Benefits: parity checklist (PR)

Audit source for doc 03, generated from the catalog and the registry; edit docs/competition/features.json or evals/parity/registry-map.json, then regenerate.

23 outcomes, 100% accounted, 21.7% performed.

| Outcome | Upmore | Status | Note |
| --- | --- | --- | --- |
| PR-001 Permissioned state-portal connection | ACCT-006 | CLAIMED | Permissioned state-portal connection is an aggregator-style account add. |
| PR-002 Supported EBT balances | ACCT-001 | CLAIMED |  |
| PR-003 SNAP balances | ACCT-001 | CLAIMED |  |
| PR-004 Supported WIC and TANF balances | ACCT-001 | CLAIMED |  |
| PR-005 EBT transaction history | TXN-001 | CLAIMED |  |
| PR-006 Merchant and online details | TXN-004 | CLAIMED | Merchant and online purchase details are merchant normalization on EBT transactions. |
| PR-007 Estimated benefit deposits | ANL-006 | CLAIMED | Estimated benefit deposit dates feed the cashflow forecast; arrival is ALRT-007. |
| PR-008 Benefit policy alerts | ALRT-010 | CLAIMED | Benefit policy change alerts are a user-defined watch; no benefits-policy capability exists. |
| PR-009 Supported EBT card lock | CARD-011 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| PR-010 Supported out-of-state block | CARD-011 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| PR-011 Supported online block | CARD-011 | GATED | Spec doc 02 marks this capability as needing a partner or license. |
| PR-012 Suspicious activity monitoring | SEC-001 | CLAIMED |  |
| PR-013 Confirm or dispute suspicious activity | TXN-010 | CLAIMED |  |
| PR-014 State-specific protections | SEC-004 | TESTED | State-specific benefit-theft protections are surfaced through the breach response playbook. |
| PR-015 Essential discounts | SAVE-013 | CLAIMED |  |
| PR-016 Phone and internet offers | SAVE-009 | CLAIMED | Phone and internet offers are utility plan optimization. |
| PR-017 Job and gig discovery | EARN-013 | CLAIMED |  |
| PR-018 State and territory availability | CORE-002 | TESTED | State availability is an honest capability-status answer. |
| PR-019 Sensitive-identifier minimization | SEC-009 | TESTED | Sensitive-identifier minimization is a data-handling policy; the closest capability is the user-inspectable audit log. |
| PR-020 Independent non-government disclosure | CORE-002 | TESTED | Non-government disclosure is an honest status statement about what the agent is. |
| PR-021 Benefit-theft assistance | SEC-004 | TESTED | Benefit-theft assistance is the breach response playbook. |
| PR-X01 App available in English and Spanish. | CORE-003 | CLAIMED | Language preference is captured at onboarding; no localization capability exists in the registry. |
| PR-X02 Child Tax Credit tracking alongside EBT benefits. | TAX-012 | CLAIMED | Child Tax Credit tracking is refund tracking. |
