# OpenAI key rotation — 2026-10-26 (Muse, owner-ordered)

For the launch team / Claude. No secret values in this note — none were ever in chat, the repo, or any file.

## What changed

- A NEW OpenAI API key was created today on the **sporve123@gmail.com** account, org **"Sporve"** (org-3HlAaI7VAtc2jdbzO1Nrsj8a): key name **`trainee-live-2026-10-26`**, Active, never expires, Default project, all permissions.
- It was installed value-blind (browser tab to browser tab) as the Supabase function secret **`OPENAI_API_KEY`** in project **mrwngntwmnaqrqhupvlt**. The secrets list shows it updated **26 Oct 2026 21:15:02 UTC**, replacing the previous value dated 12 Oct 2026.
- Credit: a one-time **$25.00** purchase was added to that account today (owner-approved, paid with the card on file). Balance after: **$49.98**. Auto-reload is OFF.

## What did NOT change

- **GitHub secrets: untouched by this rotation.** The only GitHub changes today were the Production environment's three deploy secrets (`SUPABASE_ACCESS_TOKEN` — later swapped for a 4-month token expiring Feb 26, 2027, the 7-day original revoked — `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`). The sealed 162-question test keyed to the GitHub `OPENAI_API_KEY` secret is therefore **unaffected**.
- **No existing OpenAI key was revoked, deleted, or edited.** The same account also serves Ring and the existing keys are unattributed, so all of them still work.
- **Vercel: untouched.** A repo/Vercel scan from the review side found no key in code and no env vars in the trainee Vercel project — consistent with this note: the key lives only in Supabase function secrets.

## Open verification

- The practice set has not yet been run against the new key from this side. If it passes on your run, the live OpenAI path (Supabase functions) is unblocked; record the result against this note.

## Same-day related items (owner's today-list)

- Supabase **"Confirm email" verified ALREADY ON** (dashboard toggle + GoTrue settings read agree) — the audit's "looks off" was wrong; no change made.
- Vault cleanup done: `exec_cred_<owner>_cluely` and `exec_cred_<owner>_myclaw` secrets **deleted** from Supabase Vault (verified; `exec_credential_refs` rows were already 0).
