# Upmore-owned browser worker — source-only local slice

Built after the bundle repair at `005aae50`. No Browserbase, model/API call,
new hosting, credentials, production database write, email, employer send,
merge or deployment. The worker permits only operator-registered loopback
HTTP portals. Employer execution remains NOT_WIRED, even for an ATS that
149/150 recognizes. A successful result means the controlled local portal
confirmed it, not that a real employer received an application.

The combined release also remains blocked on Crew A’s independent module-130
correction-cache privacy/rollback/epoch repair. That module is untouched here.
Local authority checks do not establish overall release readiness.

A separate source-only public research route now extends the worker; see
[public-research/README.md](public-research/README.md). Its explicitly registered
public origins admit only a read operation; the loopback restriction below
continues to govern application preparation/submission. This is not a claim
of a deployed research worker or completed live research outcomes.

A source-only [hosted pull-worker proposal](hosted-worker-proposal-20261017.md)
now provides packaging, bounded polling, private RPC transport and genuine-PNG
hooks. This is an Upmore-operated Linux target; a personal Mac is not a product
dependency. No host, image, secret binding or employer adapter is activated.

## Runtime blocker

The selected executor has Chromium and Playwright, but cannot start a
sandboxed Chromium. `/usr/lib/chromium/chrome-sandbox` is owned by `nobody`,
not root; Chromium aborts with its SUID sandbox configuration error. A
user-namespace probe fails because `/proc/self/uid_map` is read-only.
No system permission was changed and no sandbox-disabling flag was used.
The real-browser integration test is explicitly SKIPPED for this reason,
not counted as a passing browser flow. Deno is also unavailable here.

Playwright's sandbox option defaults off, so the helper explicitly sets
`chromiumSandbox: true` ([API](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-chromium-sandbox)).
A compatible sandbox-enabled host is required before browser verification.
There is no automatic proxy, insecure TLS override, stealth, CAPTCHA solver
or fallback to a third-party browser. CAPTCHA is a stopped/handoff outcome.

## Receive, Equip, Execute, Check

- Receive stores one task per authenticated user and operator-registered seat
  identity (the registered URL unless the operator supplies a canonical key).
  Replayed events return the existing task. A changed immutable specification
  conflicts rather than silently replacing a reviewed resume or destination.
- Equip resolves an owned artifact ID through an operator-injected resolver,
  verifies owner and actual file-byte SHA-256, and loads confirmed facts. Chat
  cannot supply a filesystem path, arbitrary profile, or worker user identity.
- Execute uses the existing 149 decision/approval engine and 150 Chromium
  board. Every scoped browser operation reserves budget before its effect and
  settles it afterwards. Checkpoints are atomically written and fsynced.
  Task deadlines bound driver waits; a timed-out helper is terminated.
- Check compares actual field readback with confirmed values. Dynamic fields
  and subsequent pages cause another bounded observation round. Unknown or
  invalid required fields stop preparation. The exact review includes payload,
  resume hash, destination, profile hash and field-to-source bindings.

The compact observation is produced from browser DOM, not an HTML regex or
an execution simulation. It includes an observation version, main-frame/origin
scope, opaque node references, required/disabled/read-only/validity state,
controls, and useful instructions/errors marked as untrusted. Cached element
handles detect detached nodes; a bounded re-observation may retry a fill only
when the field's meaning remains identical. Readback hashes the actual browser
File bytes. The approved payload is rechecked before a submit click.

## Approval and uncertain writes

An approval must name the task and exact payload hash, resume hash, destination
and approval reference, within the review's ten-minute expiry. The worker
re-prepares in a fresh isolated context and compares the confirmed profile and
payload. A change produces a fresh review and consumes no approval.

Immediately before calling 149's existing one-shot approval gate, the worker
persists an attempt fence and its approval reference. A crash or timeout from
that point leaves `unknown_outcome`; a new event or approval cannot re-click.
Only an injected authoritative readback matching task, user, destination,
payload, resume and confirmation ID can mark it completed. A page's generic
success message is captured evidence, not proof by itself. Missing or wrong
readback keeps the fence and the unknown outcome. A negative readback does not
currently authorize a retry; that conservative extension remains unbuilt.

The local fixture receives real multipart bytes, computes their hash and the
posted approved payload, and writes one receipt under an exclusive task key.
It rejects duplicates and mismatched bytes. Controlled browser requests are
limited to the registered origin/main frame, GET/HEAD during preparation and
one POST to the exact registered submission URL after authorization. Redirects
are stopped without following them, including the submission landing.

## Interfaces and ownership

`workers/career-browser/store.cjs` is a private local file store: single-host
exclusive leases, atomic replacement and fsync. A dead local process lease may
be recovered; age alone never steals a lease. A distributed deployment needs
a transactional adapter with equivalent semantics; sharing these files over
NFS is unsupported.

`createWorker` requires a synchronous trusted account/task authority and
`resolveEquipment(userId, artifactId)`, plus an injected private task store.
`authority.cjs` executes the task RPCs using an operator-injected trusted SQL
transport. Missing, asynchronous or unavailable authority stops work. There is
no production file-backed account authority or cached permission fallback.
Test fixtures use an explicitly MOCK authority only in standalone engine tests.

Equipment must be resolved from current owned artifacts and confirmed facts,
and return `{userId, profile, resumePath, accountVersion, privacyEpoch,
attestations?}`. The version and epoch must match the claimed intent. Existing
uploads must remain owner/epoch scoped; this contribution creates no uploader.
`readReceipt(task)` reads the controlled destination's authoritative record;
client-supplied receipts never establish completion.

`http.cjs` requires the existing user-JWT verifier as `authenticate`; it has no
default bypass or newly minted secret. Body identity never determines ownership.
`run.cjs` accepts an operator-owned configuration, binds loopback only and
processes committed intents separately. It provisions no public endpoint.

The staged `index-career.ts -> handler-career.ts -> router_core.career.js`
graph stays Edge safe. Its task bridge only plans immutable intents. The forward
proposal `20261015234000_career_task_intents_v1.sql` calls the existing memory
repair's `career_host_commit` in the same transaction as intent insertion.
Failure rolls back the turn pair, snapshot, receipt and intent together. Chat
never calls the worker. There is no worker URL/JWT-forwarding dispatch path.
Tasks stay outside CareerHost's version-1 snapshot and stores whitelist.

The `career_task_intent/v1` contract uses the existing
`career_watch_kv(user_id, 'career:account')` row and exactly its
`pg_advisory_xact_lock(hashtextextended(user_id::text,0))` lock. Account version,
privacy epoch and pause are checked when claiming and when reserving and
consuming each one-use effect token. Every ordinary account version change is
conservatively stale; the worker never refreshes an old intent or approval.
A new explicit turn may authorize new work, but never a second admitted submit.
Event tombstones reject replays under a different turn key, including after erase.

STOP/erase revoke queued work and the next operation of running work. An effect
already admitted before a control wins the lock cannot be recalled. Started or
uncertain effects retain a no-retry fence; reconciliation admits destination
readback only. Epoch changes scrub the central task input/result/bindings. The
worker scrubs its active local profile/review/result copies when it next checks
the epoch, before equipment or browser work. This is not a claim of immediate
full erasure of historical messages, uploads, logs, backups or all local files.
Direct service-role writers remain outside these semantic gates.

The optional chat request supports:

| action | fields | effect |
| --- | --- | --- |
| `prepare` | `eventId`, `artifactId`, `resumeSha256` | atomically enqueue using the host's selected posting |
| `status` | `taskId` or `intentId` | read saved owned evidence, with no new browser action |
| `approve` | `taskId`, `eventId`, `payloadSha256`, `resumeSha256`, `destination`, optional `profileSha256` | exact message `Approve browser task <id>` plus bound review fields |
| `reconcile` | `taskId`, `eventId` | enqueue authoritative readback, never another click |

A pending response contains an immutable intent reference and bindings. A
preparation's task ID is null until claimed. Status returns the saved typed
`career_task/v1` review/result; the receipt preserves structured evidence on
replay. Changed accepted task fields under the same turn key conflict. A
client must render the review and return its original binding fields. A bare
yes authorizes nothing. No production authority transport, worker, artifact
resolver, readback adapter or credential configuration was installed.

## Checks

`node --test tests/career-owned-worker.test.cjs` covers durable checkpoints,
timeout/budget stops, duplicate webhooks/approvals, profile and resume changes,
wrong users, conditional fields, observation/action schemas, actual local
multipart bytes, and real worker-process death after a simulated click.

`node --experimental-vm-modules --test tests/career-bundle-reachability.test.cjs`
executes the actual staged index -> handler -> generated bundle and the task
bridge with in-memory remote-service stand-ins. It verifies that CareerHost
stores retain their normal host behavior and task evidence is owner checked.
The frozen four-test integration probe is unchanged and passes.

`tests/career-task-authority-postgres.test.cjs` exercises the forward proposal
on an explicitly isolated local PostgreSQL database. It covers rollback,
replay, role/owner isolation, committed controls, concurrent owner-lock races,
per-operation revocation, uncertainty fences, lost acknowledgements and the
actual staged chat through SQL and a separate MOCK browser worker. The
unchanged standalone account probe does not commit its host control patch;
it still observes the disconnected MOCK path and is not a durable-control test.

`node --test tests/career-owned-worker-browser.test.cjs` is the real Chromium
test over the controlled multipart portal. Set `UPMORE_PLAYWRIGHT_PATH` to an
already installed Playwright module and optionally `UPMORE_CHROMIUM_PATH` to
the installed Chromium. It never downloads a browser or disables sandboxing.
It is blocked in the selected executor as recorded above. No runtime screenshot
or applicant record is committed or saved to Library.
