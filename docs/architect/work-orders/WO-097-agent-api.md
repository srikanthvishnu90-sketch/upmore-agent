# WO-097: other agents act for the person (the agent API, first slice)

## Why
Owner direction (2026-10-20): if the person can do a task, an agent acting for them should be able to. People already
have agents (Codex, their own AI agent). Today an outside agent cannot read the person's confirmed profile, saved
answers, resume or approved applications, so it fails or invents. Trainee holds exactly that data. It also holds the
person's approvals. This order lets another agent use the data and send what the person approved, and nothing more.

## The trust model
1. **The person grants.** From their own session they mint a token for one agent, with a label and the scopes they
   choose: `read_profile`, `read_answers`, `read_resume`, `read_approved_applications`, `report_submission`. The raw
   token is shown once. Only its SHA-256 is stored. The person can list their grants and revoke any of them, and can read
   every call their agents made. An erase ("forget my career profile") revokes all of them.
2. **The agent reads only confirmed data.** The edge function hashes the bearer token and sends only the hash to the
   database. Each database door works from that hash alone. It finds the grant, refuses a revoked token, a missing scope
   or the 61st call in a minute, and writes the call to the audit. Only then does it read that grant's person's rows. No
   door takes a user id, so no door can reach another person.
   - Facts: confirmed only. A fact waiting for the person's yes is never returned. That includes a fact confirmed once
     and later edited back to a draft (the newest copy decides).
   - Saved answers: only answered questions, each with how far its answer travels.
   - Resume: the approved file kept for the person at their current privacy epoch, or a tailored PDF stored in their own
     folder. Either way the agent gets a link valid for 5 minutes and the SHA-256.
3. **The agent submits only what the person approved.** `list_approved_applications` returns approvals that are still
   current (`career_apply_current`, approval hash equal to the payload's canonical hash). Each one carries the exact
   payload and its hash. The agent claims one with `begin_submission`, giving that hash: anything else is refused, and
   so is a stale approval. It then reports `submitted` or `blocked` with evidence, again with the hash and the claim's
   lease, using only the grant that claimed it. The outcome is recorded on the same queue row, the way the extension
   records one (`career_apply_finish`, `source = 'agent'`). A page's confirmation is evidence only: the row stays
   `submitted_unconfirmed` until the employer's email arrives. `blocked` becomes `needs_user`.
4. **No operation creates an approval or changes a fact (D-007).** Approving stays the person's act, on their card.

## What shipped
| File | What |
|---|---|
| `supabase/migrations/20261023090700_trainee_agent_api.sql` | `trainee_agent_grants` (hash only), `trainee_agent_calls` (ids only); the person's `trainee_agent_grant_mint_own`, `_revoke_own`, `trainee_agent_grants_own`, `trainee_agent_calls_own`; the agent's doors `trainee_agent_get_profile`, `_get_saved_answers`, `_get_resume`, `_resume_download`, `_list_approved`, `_begin_submission`, `_report_submission` (service role only); `career_apply_jobs.source` learns `agent`; the erase trigger |
| `supabase/functions/_shared/trainee_agent_api.ts` | The HTTP handler: `GET /tools`, `POST /call`, `GET /resume/download` (HMAC-signed, 5 minutes) |
| `supabase/functions/trainee-agent-api/index.ts` | Wiring (service client, private bucket links); `verify_jwt = false` in `supabase/config.toml` |
| `tests/db/trainee_agent_api.test.sql` | 72 checks against Postgres, wired into `tests/db/run.sh` |
| `tests/edge/trainee-agent-api.test.ts` | 8 tests of the HTTP edge, in the gate |
| `tests/architect/wo-097-agent-api.test.ts` | The trust model pinned in the shipped code |
| `scripts/launch/trainee-go-live.sh` | The migration (with its mark), the type check and the deploy (`--no-verify-jwt`), all for the owner's run |

### The interface
```
GET  /functions/v1/trainee-agent-api/tools
POST /functions/v1/trainee-agent-api/call     Authorization: Bearer tra_<64 chars>
     {"tool": "<name>", "input": {...}}       (or MCP's {"name": "<name>", "arguments": {...}})
```
| Tool | Scope | Input | Returns |
|---|---|---|---|
| `get_profile` | read_profile | — | `facts` (confirmed only) |
| `get_saved_answers` | read_answers | — | `answers` (key, label, answer, job_ids, ...) |
| `get_resume` | read_resume | `sha256`? | `resume`: sha256, filename, source, `url` (5 minutes), expires_at |
| `list_approved_applications` | read_approved_applications | — | `applications`: id, payload, payload_hash, expires_at, ... |
| `begin_submission` | report_submission | application_id, payload_hash | `lease` |
| `report_submission` | report_submission | application_id, lease, payload_hash, outcome (`submitted` or `blocked`), evidence {reason, confirmation_id, page_confirmation} | `state` |

Refusals: 401 `unauthorized`/`revoked`, 403 `scope`, 429 `rate_limited`, 400 `invalid`, 404 `not_found`, 409
`hash_mismatch`/`not_ready`/`stale`. The log line and the audit row hold ids, the tool and the outcome, never data.

## How Codex (or any agent) uses it
1. The person mints a token in their session: `supabase.rpc('trainee_agent_grant_mint_own', {p_label: 'Codex', p_scopes: [...]})`.
   They give it to Codex as a secret in Codex's environment, never in chat.
2. Codex reads `GET /tools`, then `get_profile`, `get_saved_answers` and `get_resume` to fill a form, using only those
   facts and answers. A question they do not cover goes back to the person, never guessed.
3. Codex calls `list_approved_applications`, then `begin_submission` with the payload hash, then sends exactly that
   payload. It reports `submitted` with what the page showed, or `blocked` with the reason (a verification check, a
   question with no confirmed answer). The person sees it in their tracker like any other application.

## Demo (the owner, locally; nothing live)
```
bash tests/db/run.sh                                     # ends "db tests passed"; the WO-097 block lists 72 ok lines
deno test -A --no-check tests/edge/trainee-agent-api.test.ts tests/architect/wo-097-agent-api.test.ts
```
After the owner's deploy, with a token minted in their own session:
`curl -s -H "Authorization: Bearer $TOKEN" -d '{"tool":"get_profile"}' https://<ref>.supabase.co/functions/v1/trainee-agent-api/call`.

## Not in this slice
- A screen in the app to mint, list and revoke. Today the RPCs exist; the screen comes next.
- A full MCP transport (JSON-RPC, stdio or SSE). This slice is `GET /tools` plus `POST /call`, with MCP-shaped names and
  arguments.
- The resume the extension keeps only on the person's computer. The API serves the resume the person uploaded for the
  cloud (`career_apply_cloud_resumes`) and tailored PDFs. A person who never uploaded one gets `not_found`.
- An agent preparing a new application for the person to approve (a card the agent proposes). Approving stays in
  Trainee.
- Deploy, live migration and secrets (the owner's). `TRAINEE_AGENT_LINK_KEY` is optional. Without it, the link key is
  derived from the service key.

Size: about 1,200 lines (migration about 370, handler and entry about 310, tests about 540).
