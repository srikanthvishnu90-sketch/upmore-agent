# Approved application worker

`pull.cjs` consumes the WO-009b service-role queue. It uses the existing terminal
driver in a separate Deno process per drive, with sandboxed Chromium. Default
parallelism is 3; the constructor accepts 1–6. Each employer host has one active
drive within that process. Run one worker process for this queue on the owner's
first VM; host serialization is process-local, so concurrent workers on multiple
VMs are not supported. The operator entry point takes an exclusive local lock.
A surviving lock after an interrupted process requires operator inspection,
not automatic removal.

The operator supplies the existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
and `UPMORE_ARTIFACT_ROOT` through the VM environment. Never put values in commands
or source. `node workers/career-browser/pull.cjs --check` checks names only, makes
no requests and reports `NOT_WIRED` when any are absent. `--once` drains one claim
batch; `--run` polls until SIGINT/SIGTERM. These runtime commands perform approved
external effects and require an operator-reviewed, ready installation.

Artifacts live at `<artifact root>/<sha256(user_id)>/<resume sha256>`, inside
private owner directories (0700), with private files (0600). A queued version-1
payload carries `user_id`, `job_id`, `company`, `url`, exact approved `fields`
(`name`, `label`, `value`, `factId`), `resume` (`filename`, `sha256`), privacy/account
versions, expiry, and `destination` when the final form action differs from `url`.
Its canonical hash must match both queue hashes. No answer is generated: the child
receives only those approved facts and the byte-verified artifact. Its complete
printed plan must match before it receives `yes`. Fresh account authority is
checked before the drive and again at approval. Synthetic packets require the
explicit test constructor option and localhost; the operator entry point rejects them.

The CLI preserves its journal and screenshots/readback under the private worker
state directory. Employer evidence, rather than the driver's asserted id, decides
confirmation. A crash after approval or missing proof yields `unknown_outcome`.
Claims are never requeued. A lost outcome acknowledgement is reconciled by reading
the same owner/hash/lease-bound row; the drive is not repeated. Dead claims become
unknown after 15 minutes. Final rows without an outbox record are selected by
`career_apply_notifications`; an idempotent insert uses `apply:<job id>`, kind
`apply`. Notification retries do not repeat applications. This queues a message;
the separate delivery worker owns actual delivery.

The current CLI supports bound native multipart forms. Real-form capture and
coverage remain blocked at 0/24 snapshots in this environment. Captcha/code stops
are recorded as `needs_user`; a live same-tab handoff is not integrated. Fixture
contracts prove plumbing only. No live worker, employer submission or deployment
has been demonstrated by this work.
