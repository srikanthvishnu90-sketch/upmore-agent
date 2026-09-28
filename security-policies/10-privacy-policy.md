# Upmore Privacy Policy

**Last updated:** September 27, 2026
**Company:** Upmore (sole proprietorship, founder Vishnu Srikanth)
**Contact:** vishnusrikanth8@gmail.com

## The short version

Upmore is your all-in-one finance agent. We collect the minimum needed to run your account and your money plan, we never sell your data, there are no ads and no third-party trackers. Your bank and brokerage connections are read-only — we never see your bank login, we never move your money, and your financial data is processed to show it to you, not stored. You can ask us to export or delete everything at any time.

## 1. Information we collect

**Account information.** Your name and email address, from Google sign-in or email + password. Passwords are hashed — we never see them.

**Onboarding answers.** Your name, US state, hours per week, paycheck status, and cash you can park — used to personalize your money plan.

**Your activity.** Plan progress, subscriptions, receipts, ledger entries, renewals, claims, reminders, notification preferences, saved routes, and payout proof you submit.

**Guide conversations.** Your chat messages with the Upmore Guide, kept so the conversation has continuity.

**AI usage counters.** Anonymous-ish counts of AI requests, used only to enforce the monthly usage quota (900 model calls). Raw rows are aged out after 90 days.

**Bank connection (SimpleFIN, optional).** If you connect your bank, SimpleFIN handles your bank sign-in on their site — we never see or store your bank username or password. We store a read-only access credential, encrypted, in our database vault, so the app can sync your accounts. Balances and transactions are fetched to display to you and are not persisted as records.

**Brokerage connection (Plaid Investments, optional, pending).** Works the same way once live: read-only, access token stored encrypted in our vault, holdings processed to display to you, never sold, disconnect deletes the token.

**Payments (Stripe, planned).** When subscriptions go live, billing is handled by Stripe. Your card details go to Stripe, never to Upmore — we store only customer and subscription IDs, plus any referral credits on your account.

**What we don't collect.** No payment card details, no bank logins, no location tracking, no contacts, no advertising IDs.

## 2. How we use your information

- To run your account and keep you signed in.
- To power your money plan: budgets, CFO tools, the Guide, reminders, and the earn catalog.
- To sync read-only bank/brokerage data you asked us to show you.
- To enforce usage quotas and keep the service reliable.
- To respond when you contact us.

We do not use your data for advertising. We do not sell your data — ever.

## 3. Who processes your data

Your information is processed only by the services that run Upmore, and only for the purposes above:

- **Supabase** — sign-in, database, and encrypted vault (US). Your rows are isolated to your account.
- **Vercel** — hosts the app.
- **Anthropic** — your Guide messages are sent to Claude so it can answer you. Conversations are trimmed and capped, and are not used to train models.
- **Google** — sign-in only, if you choose it.
- **SimpleFIN** — only if you connect your bank (read-only bank data).
- **Plaid** — only if you connect your brokerage (read-only investments data), once approved.
- **Stripe** — only for subscription billing, once live.

Nobody else. If we add a processor, we'll update this list.

## 4. Cookies and tracking

Your sign-in session lives in your browser's local storage so you stay signed in. That's it — no third-party analytics, no ad trackers, no advertising IDs.

## 5. How long we keep your data

- **Account and activity data:** while your account is active.
- **Bank/brokerage connection credentials:** until you disconnect — disconnecting deletes the credential immediately.
- **AI usage counters:** raw rows aged out after 90 days.
- **Support correspondence:** 1 year, then deleted.
- **Deleted accounts:** deleting your account erases your profile, chats, progress, saved items, reminders, and your bank/brokerage connections including stored credentials.

We are architected to hold as little as possible: financial figures are computed when you look at them, not stockpiled.

## 6. Your rights

At any time, email vishnusrikanth8@gmail.com from your account email to:

- **See** what data we hold about you.
- **Correct** anything inaccurate.
- **Export** your data (delivered as JSON).
- **Delete** everything — or use the in-app "Delete my data" option, which erases your account immediately.

We verify you own the account, then complete requests within 30 days — typically the same week.

## 7. Children

Upmore is not for children under 13, and we do not knowingly collect data from them. If we learn we have, we delete it.

## 8. Security

Everything moves over encrypted connections (TLS 1.2 or better). Data is encrypted at rest. Database access is restricted so users can only ever see their own rows, and secrets live in an encrypted vault, never in code or logs. Our operating principle is data minimization: the less we hold, the less there is to protect. If we ever learn of a breach affecting your data, we will tell you — within 72 hours of confirming it.

## 9. Changes to this policy

If we change this policy, we'll update the date above and post the new version where this one lives. Material changes get a notice in the app. Continued use after changes take effect means you accept the updated policy.

## 10. Consent

By creating an account and using Upmore — and separately, each time you connect a bank or brokerage account — you consent to the collection, processing, and storage described here. Connecting a financial account is always your explicit choice, is read-only, and can be revoked at any time by disconnecting.

## 11. Contact

Questions about this policy or your data: **vishnusrikanth8@gmail.com**.

---

*This policy replaces the in-app summary dated September 26, 2026. Publish at upmore.app/privacy when the domain is live; until then the in-app sheet carries this text.*
