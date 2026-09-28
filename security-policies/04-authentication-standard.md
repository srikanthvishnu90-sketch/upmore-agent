# Authentication Standard

**Owner:** Vishnu Srikanth, Founder · **Review:** annually

## 1. Consumer authentication (the app's users) `[IN PLACE]`

- **Password login** (Supabase Auth, bcrypt-hashed, rate-limited) and **Google OAuth sign-in**. Both live in production.
- Sessions persist via Supabase Auth; sign-out revokes the session.
- **MFA is NOT currently enforced on consumer accounts before Plaid Link or anything else.** `[IN PLACE]` — stated honestly.
- **Roadmap `[TO IMPLEMENT]`:** offer optional MFA (TOTP authenticator, then passkeys) in account settings; evaluate making MFA mandatory before any connector (bank/brokerage) is linked. No timeline committed — tracked on the founder checklist.

## 2. Founder/admin authentication — TO CONFIRM, do not guess

The following must each have MFA enabled; current status is **unverified — founder to confirm**:

- [ ] Supabase dashboard (`srikanthvishnu90@gmail.com`)
- [ ] Vercel account
- [ ] GitHub (`srikanthvishnu90-sketch`)
- [ ] Google account(s)
- [ ] Plaid dashboard
- [ ] Stripe dashboard (when created)
- [ ] Anthropic Console

**Standard `[TO IMPLEMENT]`:** phishing-resistant MFA (passkey / hardware key) preferred; authenticator-app TOTP acceptable; SMS-only MFA is not acceptable for admin accounts holding financial-data access. Quarterly access review (02) re-verifies this list.

## 3. Rules

1. No shared admin credentials — ever. (Currently trivially true: one human.)
2. Service_role and API keys are never typed into chat, email, or docs. If it happens, it's an incident (see 06).
3. Password requirements for consumer accounts follow Supabase Auth defaults; we do not weaken them.
