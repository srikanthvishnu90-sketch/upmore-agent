# Plaid security questionnaire — approved answers (record)

Date: 2026-09-27. Approved by Vishnu Srikanth (Founder) in chat before entry.
Final status: ALL 5 sections filled and saved 2026-09-27 (incl. 5 approved free-text
follow-ups, privacy policy link, retention policy .txt upload, and Vercel 2FA screenshot
upload). Attestation checkbox + Submit are Vishnu's own taps — NOT done by Muse.
Nothing submitted yet as of 21:44 UTC.

## Section 1 — Security governance
1. Contact: Vishnu Srikanth, Founder, vishnusrikanth8@gmail.com
2. Documented security program: "Yes - We have an operational information security program, but no documented policy or procedures"
   Basis: operational practices verified in code 2026-09-27 (MFA on Google/GitHub/Supabase/Vercel;
   Supabase Vault credential storage; versioned append-only consent_log; delete-account/disconnect
   credential purge). No formal published policy doc.

## Section 2 — Access control and authentication
3. Access controls (multi): "None of the above"
   Basis: solo founder — no RBAC, periodic reviews, deprovisioning, zero-trust, or centralized IAM.
   Access enforced via Supabase RLS + JWT-verified edge functions (not among Plaid's listed options).
4. Consumer MFA before Plaid Link: "No - We do not currently deploy MFA on our consumer-facing applications"
   Basis: zero MFA/2FA matches in src/upmore-app-template.html (verified 2026-09-27).
5. MFA on critical systems: "Yes - Non-phishing-resistant multi-factor authentication is performed (e.g., SMS, email, question and answer pairs, etc.)"
   Basis: Google 2SV on, GitHub 2FA via SMS, Supabase TOTP, Vercel TOTP — all verified 2026-09-27.

## Section 3 — Network and data encryption
6. TLS 1.2+ in transit: Yes
   Basis: all endpoints HTTPS-only (app, Supabase REST, Plaid API hosts); TLS 1.2+ floor from
   Vercel/Supabase platform defaults; privacy policy states TLS in transit.
7. Plaid data encrypted at rest: "Yes - We encrypt ALL consumer data retrieved from the Plaid API at-rest"
   Basis: Plaid tokens in Supabase Vault (pgsodium-backed); all data on Supabase AES-256 encrypted
   Postgres (platform default).

## Section 4 — Development and vulnerability management
8. Vuln scans / patch SLA / EOL monitoring (multi): "None of the above"
   Basis: no scanning program in place (honest).

## Section 5 — Privacy and consumer data rights
9. Privacy policy: "Yes - This policy is displayed to end-users within the application"
   Basis: /privacy live in production (HTTP 200, verified 2026-09-27).
10. Consent for collection/processing/storage: Yes
    Basis: public.consent_log (append-only, versioned v1.0); connection blocked until consent
    recorded (fail-closed); verified in code 2026-09-27.
11. Deletion/retention policy: Yes
    Basis: defined in privacy policy section 5; enforced by delete-account edge function
    (purges SimpleFIN/Plaid/merchant credentials) and disconnect flows; verified in code 2026-09-27.
    Note: "reviewed periodically" is intent; policy is days old.

## Known honest weak spots visible to Plaid
- No consumer MFA (Q4); no vulnerability scanning program (Q8). True for pre-launch solo founder.
- Attestation commits to remediating Plaid-identified gaps; it does not auto-fail the application.
