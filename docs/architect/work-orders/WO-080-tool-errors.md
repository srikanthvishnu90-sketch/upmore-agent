# WO-080: a failed tool call carries its reason

## Why: the owner's order, and the battery's records
> "The record carries the error TEXT, not just 'failed' — cleaned of secrets and personal data, but the real reason, so
> the next diagnosis comes from the record and not from reading code."

`TurnResult.tool_calls` recorded `{name, ok, effect}` only. Across the eight live task battery runs on
`ci/trainee-tasks` (runs 39460033310 … 39489840065), the agent made 227 tool calls and 27 of them failed:
`get_posting` 10, `remember_instruction` 5, `tailor_resume` 5, `add_profile_fact` 4, `confirm_profile_fact` 2,
`recall` 1. Not one record says why. WO-079 (`tailor_resume` refusing drafts) was found by reading code and replaying the
turn; the reason was already in the thrown error and was dropped at the loop.

## What changed (`supabase/functions/_shared/agent/loop.ts`)
- A failed call's record carries `error`: the reason, cleaned by `scrubError`. This covers a tool that throws, an unknown
  tool and a missing required input. A call that ran, and an external call held for approval, carry no `error` field;
  their records are unchanged.
- `scrubError(text)`, pure and exported. It replaces these with bracketed placeholders:

  | Removed | Placeholder |
  |---|---|
  | `postgres://` and `postgresql://` URLs | `[db-url]` |
  | JWTs | `[jwt]` |
  | Authorization header values; Bearer and Basic credentials | `Authorization: [redacted]`, `Bearer [token]` |
  | `sk-`/`pk-`/`rk-` keys and `sb_secret_`/`sb_publishable_` keys | `[key]` |
  | query values whose name carries secret, token, key, password, sig, auth or code | `name=[redacted]` |
  | `password=`, `token:`, `api_key=`, `authorization:` and similar pairs | `name=[redacted]` |
  | emails | `[email]` |
  | phone numbers (`+` international, and US 10-digit with or without separators) | `[phone]` |
  | hex secrets of 24+ characters, and base64-like secrets of 24+ characters that mix letters and digits | `[secret]` |

  It then collapses whitespace and caps the text at 300 characters.
- What stays: the reason words, status codes, short ids, record UUIDs, dates and times, file paths and constraint names.
- A thrown non-Error, such as a database error object, is recorded by its `message`.
- What the model is told about a failure is unchanged. The WO-077 claim check is unchanged: a failed call still backs no
  claim.

## Evidence
- `tests/architect/wo-080-tool-errors.test.ts`, 14 tests, written first:
  - With `scrubError` stubbed as the identity, 11 of the first 13 failed. The 2 that passed are guards that must hold
    before and after: an unchanged success record, and purity.
  - Test 14 was added after implementation. It keeps diagnosis material (UUIDs, timestamps, constraint names) from being
    over-redacted.
- Suites:
  - Architect: `deno test -A --no-check --ignore=tests/architect/pending tests/architect/`, 643 passed, 0 failed.
  - Edge list: 135 passed, 0 failed.
  - `node --test tests/no-secrets.test.cjs`: 3 passed.
- The battery harness (`evals/career/run-tasks.ts` on `ci/trainee-tasks`) already stores `agentTurn`'s `tool_calls` in
  `meta[]`. After this merges, every failed call in a result file carries its cleaned reason. Until then the harness
  reads `error` when it is present.

## Demo
`deno test -A --no-check tests/architect/wo-080-tool-errors.test.ts`, then read test 4: an error that carries an email,
a bearer JWT and an API key is recorded as
`insert failed for [email]: permission denied (Authorization: [redacted], apikey [key])`.

## Not covered
- A 10-digit US-shaped number is read as a phone number and removed, even when it is an id: privacy wins over the id.
  Unix timestamps (leading 1) and UUIDs are kept.
- The text the model sees for a failed tool is not cleaned (unchanged behavior). That text already went to the model
  provider before this order.
