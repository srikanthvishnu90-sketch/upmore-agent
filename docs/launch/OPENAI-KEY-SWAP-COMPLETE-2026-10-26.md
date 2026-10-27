# OpenAI key consolidation — COMPLETE (2026-10-26, evening)

Option B is finished end to end. The product's OpenAI key now comes from the
funded account (sporve123@gmail.com / org "Sporve", balance $49.98) in every
place the product reads one. No key value appears in this note, by design.

## The chain, in order

1. HELDOUT_SEAL_KEY placed in both GitHub stores (repo Actions secrets +
   Production environment), 2026-10-26 16:27 CDT.
2. Rewrap ran GREEN: Actions run 40441866552, dispatched manually by the
   owner account from trunk @ 9d4226fc, 2026-10-26 22:02 CDT. Both proof
   lines present in the log: "Value-blind original recipient compatibility
   verified" and "Verified: encrypted payload unchanged; held-out recipient
   decrypts; no model calls." Commit 77d625f on
   fix/seal-multi-recipient-20261026 (payload untouched; held-out key added
   as a recipient). The sealed set now opens with HELDOUT_SEAL_KEY alone.
   (Enabling step: the workflow file, identical to trunk's, was also placed
   on the default branch @ 7a8a8ab8 so GitHub would offer the dispatch.)
3. Swap done 2026-10-26 22:09 CDT: GitHub repository secret OPENAI_API_KEY
   now holds a fresh dedicated key from the funded account, named
   "trainee-github-2026-10-26" (list shows Last updated Oct 26, 2026,
   10:09 PM CDT; previously Oct 20). The Production environment holds NO
   OPENAI_API_KEY (only HELDOUT_SEAL_KEY + the three Supabase secrets), so
   the repository secret was the only GitHub store. No existing key was
   revoked or deleted.

## Other surfaces

- Supabase (project mrwngntwmnaqrqhupvlt): function secret OPENAI_API_KEY =
  key "trainee-live-2026-10-26" from the same funded account, updated
  26 Oct 2026 21:15:02 UTC. Ready for your one small live confirmation call.
- Vercel: checked directly — the "trainee" and "upmore" projects hold ZERO
  environment variables. No key is stored there; nothing to rotate.
- exec_cred: both Vault secrets (Cluely, MyClaw) were deleted today and the
  delete verified (only simplefin_access_url and upmore_proactive_secret
  remain). The entries held an email and an EMPTY password, so there was no
  password to rotate; exec_credential_refs rows for both were already 0.

## Owner decision recorded here

- Vercel Sandbox for phone-only sending: YES (owner, 2026-10-26, within
  #202 caps).

The evals can start: the GitHub key now draws on the funded account, and the
sealed set is openable via HELDOUT_SEAL_KEY.
