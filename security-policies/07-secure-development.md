# Secure Development

**Owner:** Vishnu Srikanth, Founder · **Review:** annually

## 1. Secrets hygiene (binding)

1. Secrets live only in Supabase Vault and Edge Function env. Never in the repo, shell history, notes, docs, or chat. `.env` is gitignored. `[IN PLACE]`
2. **Never paste a secret into chat.** Two past exposures (Anthropic API key, Vercel token) are the reason this is rule #2 — both were rotated on discovery. `[IN PLACE]` as procedure.
3. Pre-commit check: `git diff --cached` scanned for key-like values (`sk-`, `sb_`, `eyJ`, `xox`, `ghp_`) before every push. `[PARTIAL]` — manual today; pre-commit hook `[TO IMPLEMENT]`.

## 2. Code & review

- `index.html` is **generated** (`python3 src/build-app.py` from `src/upmore-app-template.html`) — never edited directly; `sw.js` cache stamp regenerates with the build. Build outputs (`index.html`, `sw.js`, `vercel.json` with CSP hashes) ship as a set. `[IN PLACE]`
- Self-review checklist before every production push:
  - [ ] No secrets, tokens, or PII in the diff or logs.
  - [ ] RLS still enforced on any touched table; no new table ships without RLS.
  - [ ] Edge Function changes keep `verify_jwt` where user context is required.
  - [ ] No new money-movement, advisory-language, guarantee, or contest mechanics (see 09).
  - [ ] CSP hashes regenerated if inline scripts changed.
- Status: checklist practiced `[IN PLACE]`; formalize as a repo checklist file `[TO IMPLEMENT]`.

## 3. Dependencies & supply chain

- Monthly `npm audit` / dependency review per 05-vulnerability-management.md. `[TO IMPLEMENT]` cadence; `[IN PLACE]` during active dev.
- Dependencies installed from official registries only; lockfiles committed.

## 4. Logging

- No PII, tokens, secrets, or full request bodies in Edge Function logs. Error logs carry IDs and categories, not content. `[IN PLACE]` — verified in self-review.
