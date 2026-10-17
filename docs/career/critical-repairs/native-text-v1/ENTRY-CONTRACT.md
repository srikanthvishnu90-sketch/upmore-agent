# Native text entry contract (implemented review source)

Evaluator-facing boundary: the actual career `POST` entry accepts
`{thread_id, turn_key, message}` with a verified owner bearer token. No
`career_journey`, `career_task`, typed intent, injected verifier, model selection,
receipt or grant belongs in that request. `message` is the user's own wording.
Tests must send that JSON directly and retain the request unchanged.

Server enablement is explicit: `CAREER_MODEL_ENABLED=true`,
`CAREER_MODEL_CONTRACT=native_pair_v1`, and
`CAREER_NATIVE_PAIR_POLICY_DIGEST=<approved active policy>`, with the existing
OpenAI nano configuration. Both generation and checker configurations and
both complete cash/monthly bounds must be admitted under authoritative funding.
This lane does not seed or use real funds. The evaluator's separate allocation
is outside this implementation lane.

The real deterministic host receives the normalized chat input and produces
the canonical intent. A separate native execution record preserves the safe
original wording, its SHA-256, original-input hash, normalization/redaction
trace, canonical intent, owned proposed context and exact generator/checker
wire bytes. Safe wording retains case, punctuation and whitespace. Existing
identity/secret protections take precedence: sensitive input is redacted before
storage/provider use and that transformation is declared, never hidden.

The generator input kind is `career_native_generation_request/v1`. Its request
contains `intent`, canonical `context` (`career_journey_context/v1`), and the
grounded conversation `view`. `intent.user_text` is the same safe original text
sent at entry. The request also binds the current owner/thread/version/epoch and
the host's proposed post-turn context; a proposal is not committed memory or a
dispatch grant. Unknown or unsupported actions stay unavailable.

Generation uses prompt `career_native_generation/v1`, checking uses
`career_native_checker/v1`. Configuration digest input is sorted JSON
`{version:"career_native_pair_config/v1", purpose:"generation"|"verification",
provider,model,reasoning_effort,prompt_version}`. Paid verification is labelled
`paired_gateway_budgeted/v1`; it is never passed off as
`local_no_external_calls`. The local-only grounded-v2 verifier API stays closed.

The full rendered reply, candidate, intent, exact user wording and context are
bound to independent checker output and durable raw usage receipts. Accepted
output and owned proposed memory/context commit atomically with the user's raw
safe turn. Request retries cannot redispatch a claimed operation. Unknown
settlements retain holds and report uncertainty. Corrections, erasure, pause,
foreign ownership and stale CAS can revoke publication independently of billing.

Response remains the normal chat JSON: `reply`, `action:null`, `reminders` and
`meta`. `meta.career_model` identifies `native_pair_v1`, the operation/pair IDs,
intent/context/input hashes, confirmed provider-call count and explicit paid
verification provenance. Contract checks and controlled responses do not grade
actual model quality. No model gets memory, approval, tool or completion
authority. No external send/application/browser action is introduced.

This is a public integration contract, not an evaluator scenario set. No sealed
scenarios are requested or disclosed. The source parent can forward this exact
contract to the evaluator; this environment has no outbound cloud-thread tool.
