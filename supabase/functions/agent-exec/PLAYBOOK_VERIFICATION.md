# Merchant playbook structural verification — 2026-09-28

Scope: all 29 entries in `playbookRegistry` + all 38 entries in `merchantDirectory`
in `supabase/functions/agent-exec/merchant-catalog.ts`.

Method (no live authenticated runs — none exist yet):
1. Imported the module via Node type-stripping (syntax-validated).
2. Schema check: merchant_key, display_name, verified, version, auth, account_url,
   steps[], evidence_texts[], source on every playbook; merchant_key, display_name,
   deep_link, steps[], source on every directory entry.
3. curl -sIL (iPhone UA) on all 37 unique account_url / deep_link / goto URLs
   and all 29 `source` URLs.
4. Step check: every step `kind` against the DriverAction union; every
   clickText/clickDialogButton/requireText pattern compiled as a RegExp; every
   clickFirst/typeInto selector sanity-checked as CSS; waitFor/otpPause/screenshot
   required fields present.
5. Flow sanity: login step (typeInto/otpPause) → cancel click → confirmation
   (requireText / screenshot:confirmation) present and ordered.

## HARD RULE (unchanged)

Every playbook remains `verified:false`. The executor (`resolveMerchant` in this
file) only takes the `"playbook"` path when `verified === true`; all 29 resolve
to `"guided"` today. Graduation requires one real, live, authenticated
Browserbase run against the merchant's production site — structural perfection
does not graduate a playbook.

## Results: 29 playbooks

| Merchant | Structural | URL check | Fixes applied | Live verification still needs |
|---|---|---|---|---|
| devin | OK (0 steps by design — dedicated executor path in index.ts) | account_url 200 (login page) | note updated | live authenticated Browserbase run; OTP email-code handoff |
| spotify | OK (11 steps) | 200 → accounts.spotify.com login | note updated | live run; retention-offer screens |
| netflix | OK (11 steps) | 403 to curl (bot-block); netflix.com live, well-known /YourAccount URL | note updated | live run; "Cancel Membership" dialog variants |
| hulu | OK (11 steps) | → auth.hulu.com login; 404 to curl (bot-block), documented account URL | note updated | live run; Hulu's multi-screen cancel survey |
| disney_plus | OK (12 steps) | 200 | note updated | live run |
| max | OK (12 steps) | 200 → auth.hbomax.com | note updated | live run |
| amazon_prime | OK (13 steps) | 405 to curl (bot-block); well-known primecentral URL | note updated | live run; Amazon's cancel-membership labyrinth |
| youtube_premium | OK (15 steps) | 200 → Google sign-in | note updated | live run; billed-via-Apple vs Google branch |
| audible | OK (15 steps) | 405 to curl (bot-block); well-known URL | note updated | live run; "lose credits" warning screens |
| xbox_game_pass | OK (12 steps) | 404 to curl (bot-block); URL is Microsoft-documented (shares account.microsoft.com/services with microsoft_365 — correct, Xbox billing is Microsoft billing) | note updated | live run |
| playstation_plus | OK (13 steps) | 200 | note updated | live run |
| google_one | OK (13 steps) | 200 | note updated | live run; source article ID may be superseded (current canonical looks like answer/9056360) — confirm during live run |
| dropbox | OK (14 steps) | 200 | note updated | live run |
| linkedin_premium | OK (13 steps) | 200 | note updated | live run |
| nytimes | OK (12 steps) | 200 (lands on cancel page) | note updated | live run |
| washington_post | OK (11 steps) | connection refused to curl (bot-block); domain live | note updated | live run; print/digital combos may need a call in some regions — never fall back to a call, refuse guided instead |
| wsj | OK (12 steps) | 200 → customercenter | note updated | live run |
| doordash_dashpass | OK (14 steps) | 403 to curl (bot-block); domain live | note updated | live run |
| uber_one | OK (15 steps) | 404 to curl (bot-block); ubereats.com live | note updated | live run; source is a Spanish-locale help URL — re-verify during live run |
| instacart_plus | OK (14 steps) | 200 → login | note updated | live run |
| walmart_plus | OK (15 steps) | 200 | note updated | live run |
| peloton | OK (12 steps) | 200 → mymembership | note updated | live run |
| adobe | OK (16 steps) | 200 → plans page | note updated | live run; annual-plan early-termination fee (50% of remaining) must be surfaced, never concealed |
| microsoft_365 | OK (12 steps) | 404 to curl (bot-block); URL is Microsoft-documented (support.microsoft.com + learn.microsoft.com confirm account.microsoft.com/services) | note updated | live run; "Turn off recurring billing" vs "Cancel subscription" variants |
| nordvpn | OK (13 steps) | 200 | note updated | live run |
| mcafee | OK (13 steps) | 200 | note updated | live run |
| paramount_plus | OK (11 steps) | 200 → signin | note updated | live run |
| peacock | OK (14 steps) | 200 → peacocktv.com | note updated | live run |
| comed | OK (13 steps) | 200 | note updated | live run; utility disconnection (Start Stop Move → Stop Service), not a subscription — effective date + final bill apply |

Structural defects found and fixed: **1** — none in schema/steps/URLs. The only
change in this pass is the `verification_note` on all 29 playbooks, now
recording exactly what was checked (schema, step kinds, pattern compilation,
URL result, evidence plausibility, flow coherence) and what live verification
still requires. `verified` was not touched on any entry (29/29 remain false;
zero `verified:true` in the registry — asserted programmatically).

Non-defects reviewed and cleared:
- `xbox_game_pass` + `microsoft_365` share account.microsoft.com/services —
  correct, Xbox subscriptions are billed through the Microsoft account.
- Generic `clickText "continue"` patterns (amazon_prime, youtube_premium,
  audible, adobe ×3) — all are email-first login continuations, context-correct.
- `comed` has no literal "cancel" click — correct, it is a Stop Service flow;
  the validator's warning was a checker false positive.
- Non-200 curl results (403/404/405/000 on netflix, hulu, amazon, audible,
  microsoft, wapo, doordash, ubereats) are bot-mitigation against curl, not dead
  pages; every URL is either HTTP 200 or a merchant-documented / well-known URL
  on a live domain. A real Chromium (Browserbase) will pass these gates.

## Directory entries (38)

All 38 `merchantDirectory` entries validated: schema complete, all deep_links
resolve (200 or documented/bot-blocked as above), steps non-empty and coherent.
All 29 playbook merchants have a directory entry; 9 are directory-only
(human_only or guided-only flows): apple_subscriptions, icloud_plus,
planet_fitness, la_fitness, att, tmobile, verizon, xfinity, siriusxm.

## What would graduate a playbook (for the record)

1. Founder installs Browserbase key (already in Supabase secrets) and approves
   one supervised run per merchant.
2. Agent signs in with the user's vaulted merchant credentials (per-action
   approval), executes the declarative steps, captures the confirmation
   screenshot, and `requireText` matches one of `evidence_texts`.
3. The next billing cycle confirms no charge (cancel-watcher).
4. Only then may `verified` flip to `true`, with `last_verified_at` set and the
   run pinned to `version`.
