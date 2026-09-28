# Plaid Security Questionnaire — Draft Answers

**Prepared:** 2026-09-27 · **For:** Vishnu Srikanth, Founder — review, then he fills the live form, checks the attestation, and submits himself.
**Rules for this draft:** answers reflect only `[IN PLACE]`/`[PARTIAL]` reality per the policy suite in this directory. Nothing aspirational is presented as fact. Items marked **YOUR DECISION** or **TO CONFIRM** need his input before the live form is touched.

> ⚠️ The questionnaire ends with an attestation checkbox ("you attest to remediate any Plaid-identified gaps…"). Only the Founder checks it and submits. This file is a draft, not a submission.

## Section 1 — Security governance

**Q1. Contact information for the resource(s) responsible for information security (name, title, email; group email if monitored).**
> **Draft answer:** Vishnu Srikanth, Founder, vishnusrikanth8@gmail.com. Upmore is a single-founder company; the Founder is the sole information-security owner (see 00-information-security-policy.md §3). A dedicated monitored group alias (security@upmore.app) will be created once the domain is live — `[TO IMPLEMENT]`.
> Status: `[IN PLACE]`

**Q2. Documented information security policy and procedures, operationalized to identify/mitigate/monitor risks?**
Options: (a) documented policy + operational program, continuously matured · (b) operational program, no documented policy/procedures · (c) neither.
> **Draft answer:** **YOUR DECISION.** If you formally adopt this policy suite (00–09) before submitting: **(a)** — documented policies exist and the quarterly/monthly/annual cadences in 02 and 05 are the operational program. If you submit before adopting: **(b)** — the practices (RLS, Vault, TLS, read-only design) are operational but the documentation isn't formally adopted yet.
> Supporting doc: 00-information-security-policy.md. Status: `[IN PLACE]` once adopted; `[PARTIAL]` until then.

## Section 2 — Access control and authentication

**Q3. Access controls limiting access to production assets and sensitive data (select all).**
Options: documented access control policy · RBAC · periodic access reviews/audits · automated de-provisioning · zero trust architecture · centralized IAM · OAuth tokens/TLS certs for non-human auth · none of the above.
> **Draft answer:** select **"Use of OAuth tokens or TLS certificates for non-human authentication"** (Supabase JWTs, Vault-referenced secrets, TLS-only service calls — 02 §1, `[IN PLACE]`). **Do not** select RBAC / periodic reviews / de-provisioning / zero trust / centralized IAM — those are not in place (02 §4 and the quarterly self-review are `[TO IMPLEMENT]`; there are no employees to de-provision). "A defined and documented access control policy is in place" becomes selectable once you adopt 02 (`[PARTIAL]` → `[IN PLACE]` on adoption).
> Supporting doc: 02-access-control.md.

**Q4. MFA for consumers on the app before Plaid Link is surfaced?**
Options: phishing-resistant MFA · non-phishing-resistant MFA · no MFA.
> **Draft answer:** **"No — we do not currently deploy MFA on our consumer-facing applications."** Honest: login is password + Google OAuth; Upmore enforces no MFA step of its own (04 §1 `[IN PLACE]`). Optional MFA (TOTP, then passkeys) is on the roadmap (04 §1 `[TO IMPLEMENT]`) — you may mention the roadmap in a notes field if the form allows, but the selection stays "No."
> Supporting doc: 04-authentication-standard.md.

**Q5. MFA on critical systems that store or process consumer financial data?**
Options: phishing-resistant MFA · non-phishing-resistant MFA · no MFA.
> **Draft answer:** **"No - We do not currently deploy MFA on our critical systems that store or process consumer data"** — verified 2026-09-27 by read-only check: Google 2-Step Verification OFF, GitHub 2FA NOT enabled, Plaid dashboard 2FA ON (SMS), Supabase/Vercel not signed in (unverified). Founder action before submit: enable 2SV on Google and 2FA on GitHub (authenticator app, ~5 min each), verify Supabase/Vercel, then re-answer honestly. Do NOT select a "Yes" option until every critical system is actually enrolled. This is the highest-risk question to get wrong — verify first, then answer.
> Supporting doc: 04-authentication-standard.md.

## Section 3 — Network and data encryption

**Q6. Encrypt data in-transit between clients and servers using TLS 1.2 or better?**
> **Draft answer:** **Yes.** HTTPS/TLS 1.2+ on all paths: app↔Supabase, Vercel hosting (HSTS), Edge Functions→Anthropic/SimpleFIN/Plaid/Stripe (03 §1 `[IN PLACE]`).
> Supporting doc: 03-encryption-standard.md.

**Q7. Encrypt consumer data received from the Plaid API at-rest?**
Options: all data · only sensitive/PII · no.
> **Draft answer:** **"Yes — we encrypt ALL consumer data retrieved from the Plaid API at-rest."** Basis: Supabase Postgres encrypts at rest (AES-256) and connector tokens live in Vault (03 §2 `[IN PLACE]`); holdings are processed transiently and never persisted (01 §1). Note: Plaid integration is pending approval, so this describes the enforced platform/architecture standard the Plaid data will land in.
> Supporting doc: 03-encryption-standard.md, 01-data-minimization-retention-deletion.md.

## Section 4 — Development and vulnerability management

**Q8. Vulnerability scans against employee/contractor machines and production assets; patching practices (select all).**
Options: scans against all machines + production assets · patch within defined SLA · monitor/address EOL software · none of the above.
> **Draft answer:** **"None of the above"** — stated honestly, with context: there are no employee/contractor machines and no self-managed production assets; infrastructure is fully managed (Vercel, Supabase) and patched by the providers. The founder-operated program (monthly dependency review, 48h critical-patch SLA, EOL checks) is defined in 05 and being stood up now (`[TO IMPLEMENT]` cadence). Add this context in any free-text/notes field the form offers.
> Supporting doc: 05-vulnerability-management.md.

## Section 5 — Privacy and consumer data rights

**Q9. Privacy policy for the application where Plaid Link will be deployed? (link if available)**
Options: yes, displayed to end-users in the app · yes, will be published at go-live · no.
> **Draft answer:** **"Yes — this policy is displayed to end-users within the application."** The privacy policy ships in the production app (in-app sheet; updated 2026-09-26 for the SimpleFIN read-only connection). The canonical full text is now `10-privacy-policy.md` in the policy suite (rewritten 2026-09-27 from the actual data inventory — covers SimpleFIN, Plaid-pending, Stripe-planned, Anthropic flows, retention, and user rights); publish it at upmore.app/privacy when the domain is live and sync the in-app sheet to it (`[TO IMPLEMENT]`). Production URL for the form: https://upmore-srikanthvishnu90-sketchs-projects.vercel.app/ — **TO CONFIRM** the exact deep link/anchor to the policy text before submitting; if the form has a URL field, verify what it expects (in-app sheet vs. public page).
> Supporting doc: in-app privacy policy; 01-data-minimization-retention-deletion.md.

**Q10. Do you obtain consent from consumers for the collection, processing, and storage of their data?**
> **Draft answer:** **No** — per the Founder's explicit instruction.
> ⚠️ **EXPECT PLAID FOLLOW-UP.** Plaid expects consent flows; a "No" here will likely trigger questions or a remediation requirement (which the end-of-questionnaire attestation already anticipates: "Plaid will notify you about any remediation requirements"). Recommended remediation, already scoped: add an explicit in-app consent step before bank connect / Plaid Link surfaces (consent to collection, processing, storage + link to privacy policy) — `[TO IMPLEMENT]`, and the natural fix if Plaid asks. Note: the in-app privacy policy does disclose data practices; what is missing is the affirmative consent *step*, which is what this question asks about.
> Supporting docs: 01 §3 (deletion procedure), 09 (boundaries).

**Q11. Defined and enforced data deletion and retention policy, compliant with applicable privacy laws, reviewed periodically?**
> **Draft answer:** **Yes** — per the Founder's explicit instruction, supported by: 01-data-minimization-retention-deletion.md defines what is collected, where it lives, retention per item, and the deletion procedure; the `delete-account` Edge Function enforces deletion (`[IN PLACE]`); 00 §4 sets the annual policy review cadence. Known enforcement gaps are tagged honestly in 01 (automated 90-day `agent_usage` purge, support-inbox purge — both `[TO IMPLEMENT]` with manual process covering them meanwhile).
> Supporting doc: 01-data-minimization-retention-deletion.md.

---

## Pre-submit checklist for the Founder

- [ ] Adopt the policy suite (00–09) — or downgrade Q2 to option (b).
- [ ] Verify admin MFA everywhere (Q5) — 04 §2 checklist.
- [ ] Confirm the exact privacy-policy link for Q9.
- [ ] Read every answer above once more against the live form's exact wording.
- [ ] Check the attestation box and submit **yourself**.
