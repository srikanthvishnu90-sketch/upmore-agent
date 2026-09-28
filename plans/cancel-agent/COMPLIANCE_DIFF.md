# Cancel Agent — Compliance Diff

**Purpose:** the compliance spec was written for a read-only product. The cancel agent has the app log in to merchants as the user and click cancel on their behalf. This document lists exactly what changes, what stays, and what new risk is accepted. Planning only — legal review required before ship.

**Decision record:** founder blessed vaulted merchant credentials + per-action-approval agent execution on 2026-09-27 ("Cancel it for me" MAXIMIZED; see `~/MEMORY.md` "Upmore: read-only is DEAD"). That blessing is the authorization for this diff; it does not replace legal review.

## 1. What changes

### 1a. `security-policies/09-product-boundaries-regulatory.md` — Boundary 1
**Current text:** "Upmore never buys, sells, transfers, invests, withdraws, or moves user money… 'Execute' in the app means an assembled cart, a pre-filled order, or step-by-step guidance — the user performs every final tap in the merchant's own flow."

**Change:** the money-movement prohibition stands (cancellation moves no money — no transmitter licensing triggered), but the "user performs every final tap" enforcement bullet is superseded for subscription cancellation. New enforcement text:
- Product: the agent may perform taps inside a merchant's account **only** with one explicit per-action approval naming merchant + plan + amount, using a credential the user vaulted, with every run audited. Cancel-only: no plan changes, payments, or offer acceptances.
- Code: `agent-exec` refuses unverified playbooks, aborts on ToS/payment/consent/account-creation tripwires, and requires merchant-specific confirmation text + screenshot before reporting success.
- Copy: the app discloses on the approval screen that automated login may violate the merchant's terms of service.

**Rationale preserved:** the boundary's *purpose* (avoid money-transmitter licensing) is unaffected — cancelling a subscription is not money transmission. What changes is the *mechanism* of execution, not the regulatory perimeter.

### 1b. `docspecs/02-cancel.md` — "Hard nevers" #1 and #2
**Current:** "1. Never cancel, or claim to cancel, on the user's behalf. 2. Never use stored merchant credentials, ever, under any framing."

**Change:** amend, do not silently delete. Add a dated amendment block at the top of the Hard nevers section: "Amended 2026-09-27 by founder decision: nevers #1 and #2 are superseded for subscription cancellation executed through the approved agent path (per-action approval + vaulted credential + audited run + verified playbook). They remain in force for every other surface (Guide chat, earn routes, claims)."

Everything else in the docspec — the four-state confirmation rule, the ledger buckets, retention arithmetic, trap warnings, the never-count-a-claim rule — **stays and now binds the agent path too** (see ARCHITECTURE.md §5: the agent path currently violates the confirmation rule and must be unified).

### 1c. In-app copy that is now false
- `CHAT_READONLY_LINE` (template, guide section): "Upmore is read-only — I can't move money, log in, or submit anything; only you do the final tap." The agent now CAN log in and submit cancellations. Rewrite to: "Upmore never moves your money. The subscription-cancel agent can log in to a merchant as you and cancel — but only after you approve that exact cancellation."
- Guide "I watch for 60 days" vs watcher reality (billing date + 2-day grace): pick one number and make copy, watcher, and server job agree. Recommendation: keep "next bill + 2 days" as the confirmation rule (it's the docspec) and "60 days" as the zombie-charge watch window; say both plainly instead of conflating them.
- Agent100 `a032.js` asserts privacy copy contains "read-only" for **bank connections** — that stays true (SimpleFIN/Plaid are read-only by protocol). No change needed, but do not let "read-only" leak into cancel-agent copy.

### 1d. `terms.html` — new sections required
1. **Authorized-agent clause:** user authorizes Upmore to access specified merchant accounts using vaulted credentials, solely to perform approved cancellations; each action requires separate approval.
2. **Merchant-ToS disclosure:** automated access may violate merchants' terms of service; user accepts that risk; Upmore is not liable for merchant account actions (suspension, etc.) resulting from automated access.
3. **Error liability cap:** if the agent cancels the wrong subscription or fails, Upmore's remedy is support + reversal assistance, not consequential damages. (Lawyer to draft; do not ship founder-drafted liability language.)
4. **Credential terms:** how merchant logins are stored (Supabase Vault, encrypted), used (only for approved actions), and deleted (revoke / account delete).
5. Version the ToS; record acceptance per version in the existing `tos_acceptance` table (already append-only — reuse).

### 1e. `consent_log` — new kind
Migration `20260927_000007_consent_and_tos.sql` records per-connection consent for `simplefin`/`plaid`. Add kind `'cancel_agent'` with its own consent-text version, recorded when the user first vaults a merchant credential. The CHECK constraint needs the new value. This mirrors the Plaid Q10 pattern: every credential-taking surface gets an explicit, versioned, append-only consent event.

### 1f. Retention policy — merchant credentials row
`security-policies/01-data-minimization-retention-deletion.md` and the v1.0 retention policy inventory table need a new row: "Merchant logins (cancel agent) | Supabase Vault (service_role only) | Approved cancellations | Until user revokes or deletes account | Deleted immediately on one-tap revoke; purged by `delete-account`." Also add run-evidence screenshots: kept 13 months (one annual cycle + 30d), then purged; row metadata kept.

### 1g. `security-policies/11-compliance-analysis.md` — new section
Document the agent as a new analyzed surface: what it does, why it is not money transmission, why it is not investment advice, the ToS-violation risk position, and the residual risks (below). This is the paper trail a diligence questionnaire will ask for.

### 1h. Change-control sign-off
`09-...md` "Change control" says features touching licensed-profession-adjacent areas need a written regulatory check by the Founder *before* build, "default answer is no." The 2026-09-27 blessing satisfies the procedure — record it in the policy file with the date and scope (subscription cancellation only), so a future reader doesn't see an undocumented exception.

## 2. What stays (non-negotiable, unchanged)

- **No money movement.** Cancel-only. Boundary 1's core prohibition stands; bill pay/investing need their own diffs later.
- **No personalized investment advice** (Boundary 2), **no guaranteed earnings** (Boundary 3), **no contests** (Boundary 4), **estimates labeled** (Boundary 5), **no credit-card recs / no affiliate steering** (Boundary 6), **tax/insurance informational only** (Boundary 7).
- **18+ gate, ToS clickwrap, consent logging** — extended (1e), not weakened.
- **No phone calls, ever.** Standing rule; the agent covers web/app flows only. Human-only merchants get scripts + tracking, never a call.
- **Never store OTPs.** Already enforced in code; keep the static assertions.
- **One explicit approval per cancellation; never bundle.** Encoded in Agent100 a023/a055 — keep those agents green.
- **Never display "cancelled" unless execution succeeded; on failure show the failure + merchant deep link.** Already the client behavior — keep.

## 3. New risks accepted (say them plainly)

1. **Merchant ToS violation.** Most subscription merchants prohibit credential sharing and automated access in their terms. The agent will routinely breach those terms as its normal operation. Consequences range from nothing (typical) to forced password resets, account suspension, or IP/ASN blocks against Browserbase. This is the known cost of the "doing layer" — it must be disclosed, not discovered.
2. **Error liability.** An agent that confidently cancels the wrong subscription (ambiguous merchant match, family plan, the "keep" flag missed) causes real harm: lost access, lost data, re-subscribe friction. Mitigations (per-action approval naming the exact merchant, ambiguous-match refusal, keep/shared/insurance/utility exclusions) reduce but do not eliminate this. The ToS liability section (1d.3) and the approval_context evidence record exist for exactly this failure.
3. **Credential-breach blast radius.** Vaulted merchant passwords are the highest-value secret Upmore will ever hold — unlike SimpleFIN/Plaid tokens, they are reusable user passwords, possibly password-reused across sites. A vault compromise is a user-identity compromise. This raises the security bar for the whole Supabase project: service_role hygiene, no secret in logs/evidence (already enforced), rotation procedure, and breach-notification plan all become load-bearing.
4. **Computer-access law exposure.** Automated login to third-party sites sits near the CFAA / state computer-crime statutes. The standing position: the user authorizes access to their own account (authorized access, their credential), which is the industry's working theory for consumer agents — but it is a theory, not a ruling, and counsel should bless the ToS language in 1d before launch.

## 4. What the lawyer reviews before ship (checklist)

- [ ] `terms.html` authorized-agent clause + ToS-violation disclosure + liability cap
- [ ] Privacy policy merchant-login section (already drafted 2026-09-27 — needs counsel pass)
- [ ] The CFAA/state-law position on credential-based agent access
- [ ] Whether any state's subscription-cancel law (e.g., click-to-cancel rules) imposes duties on Upmore as the actor
- [ ] Retention periods for credentials and run evidence
- [ ] Breach-notification obligations given vaulted passwords

Nothing in this diff authorizes bill pay or investing — those need their own compliance diffs and (for investing) a securities lawyer before build, per the founder's brief.
