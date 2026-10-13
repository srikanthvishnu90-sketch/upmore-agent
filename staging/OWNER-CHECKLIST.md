# Owner checklist — staging bring-up (one page)

Everything only you can do. Each line unlocks the next; the package does the
rest. Full detail: `staging/README.md`.

## Actions

- [ ] Create a new Supabase project named `upmore-staging` in your org → unlocks: a staging ref that is not production.
- [ ] Note the project ref → unlocks: the one command's only input.
- [ ] Create a staging Google OAuth client (see decision 1) with redirect URI `https://<staging-ref>.supabase.co/functions/v1/gmail-oauth` → unlocks: the career Google grant on staging.
- [ ] Confirm that client's consent screen allows Gmail read + send and Calendar free/busy + events, with the test user added if in testing mode → unlocks: the grant not failing on scopes.
- [ ] Generate the state secret (`openssl rand -hex 32`) → unlocks: `OAUTH_STATE_SECRET`.
- [ ] Set secret `OPENAI_API_KEY` on the staging project (your OpenAI key) → unlocks: model replies on staging.
- [ ] Set secrets `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` on the staging project → unlocks: the career grant flow.
- [ ] Set secret `OAUTH_STATE_SECRET` on the staging project → unlocks: signed OAuth state.
- [ ] Run the one command: `STAGING_REF=<staging-project-ref> bash staging/scripts/staging-up.sh` → unlocks: migrated, deployed, seeded staging.
- [ ] Read the last line it prints (`PASS smoke` or `FAIL smoke`) → unlocks: knowing the staging plumbing is live (not yet a career verdict).
- [ ] (Optional, for your own eyes) Build the app locally against staging per `staging/README.md` §Frontend → unlocks: clicking the staging build yourself.

## Decisions (recommended default first)

1. **Staging Google OAuth client: separate client — recommended.** Keeps the
   production client's redirect list untouched; delete staging later without
   touching production auth. Alternative: add the staging redirect URI to the
   existing client (fewer moving parts, shared blast radius).
2. **LoopMessage / iMessage number for staging: NO for v1 — recommended.**
   The graded v1 path is the app chat over HTTP; `imessage-inbound` is not in
   the staging function set, and a number costs money plus Trust Hub KYC for
   zero graded coverage. Revisit only if iMessage-channel grading is wanted.
3. **Project tier: free — recommended for v1.** The graded runs are bursty and
   human-triggered; the risk is the project pausing when idle, which costs one
   dashboard click to wake. Upgrade only if pausing bites a graded run.
4. **Region: US East — recommended.** Matches production's hemisphere; staging
   latency is not a graded axis.
5. **`MODEL_PROVIDER`: leave unset — recommended (already your ruling).**
   Unset = OpenAI, per `model_gateway.ts`; do not set an Anthropic key on
   staging.
