# Incident Response

**Owner:** Vishnu Srikanth, Founder (sole responder) · **Review:** annually and after every incident
**Why this matters legally:** all 50 states have breach-notification laws. This procedure is how a one-person company meets them without a legal department.

## 1. What counts as an incident

- Suspected unauthorized access to Supabase, Vercel, GitHub, Vault, or any admin console.
- Any secret (API key, token, service_role) appearing outside Vault/env — **including pasted in chat, email, or docs. This has happened before** (Anthropic API key, Vercel token) and is treated as exposure on sight.
- User report of account compromise or data anomaly.
- Provider notification (Supabase, Vercel, Anthropic, Plaid, Stripe) of suspicious activity.

## 2. Response procedure (founder runs all steps)

**Detect & triage (hours):**
1. Confirm scope: which systems, which data types, which users. Check Supabase Auth logs, Edge Function logs, and provider dashboards.
2. Classify: does it involve personal data (names, emails, chats, financial data) or only Upmore's own secrets? This drives notification duty.

**Contain (same day):**
3. Rotate/revoke every exposed or suspected credential immediately — secrets first, forensics second.
4. Revoke affected user sessions if user accounts are implicated.
5. Disconnect compromised integrations (SimpleFIN/Plaid token revocation) if connector data is in scope.

**Assess & notify:**
6. Determine whose personal data was accessed or exfiltrated, if any. Because of the near-zero-retention design (01), the answer is often "none beyond account profile data" — document the reasoning.
7. If personal data was compromised: notify affected users **without unreasonable delay and within 72 hours**, describing what happened, what data, and what they should do. State AG notification duties apply at scale thresholds — with a sub-threshold user base this is unlikely, but the founder checks thresholds if an incident ever qualifies.
8. If Plaid data is in scope: notify Plaid per the security attestation commitment.

**Recover & learn:**
9. Restore from clean state, re-verify RLS/Vault/secret scoping, confirm no persistence mechanism remains.
10. Write a one-page post-mortem: timeline, root cause, data impact, fixes. File it in this directory. Update the relevant policy so it can't recur.

Status: procedure defined `[IN PLACE]`; no incidents requiring user notification to date.

## 3. Secret-exposure playbook (the known failure mode)

1. **Rotate first.** Generate a new key, install it, verify the app works, then revoke the old one.
2. Check provider usage dashboards for unauthorized activity during the exposure window.
3. Remove the secret from wherever it leaked (chat history can't be unsent — hence rotation, not deletion, is the control).
4. Post-mortem: how did it leak, what process change prevents repeat (e.g., never paste secrets into chat — use Vault/env install flows only).
5. Standing rule: **any secret seen outside Vault/env is burned on sight.** `[IN PLACE]`

## 4. Contact list

| Who | How |
|---|---|
| Founder (all roles) | vishnusrikanth8@gmail.com |
| Users | in-app notice + email from the founder address |
| Plaid (if in scope) | Plaid dashboard support |
| Law enforcement | only if criminal activity is evident |

## 5. Testing

Annual tabletop: founder walks through a hypothetical (e.g., "service_role key leaked in a public repo") against this procedure and notes gaps. First tabletop due with the annual policy review. `[TO IMPLEMENT]`
