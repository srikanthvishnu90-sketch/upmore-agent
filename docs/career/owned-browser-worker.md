# Upmore-owned browser worker — source-only local slice

Built after the bundle repair at `005aae50`. No Browserbase, model/API call,
new hosting, credentials, production database write, email, employer send,
merge or deployment. The worker permits only operator-registered loopback
HTTP portals. Employer execution remains NOT_WIRED, even for an ATS that
149/150 recognizes. A successful result means the controlled local portal
confirmed it, not that a real employer received an application.

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

`createWorker` requires synchronous trusted `resolveEquipment(userId,
artifactId)` and an injected store. Optional `readReceipt(task)` must read the
controlled destination's authoritative record; client-supplied receipts are
never accepted. The resolver returns `{userId, profile, resumePath,
attestations?}` with the user's confirmed facts/explicit attestations. It must
resolve existing user-owned uploads; this patch creates no upload service.

`http.cjs` requires the existing user-JWT verifier as `authenticate`; it has no
default bypass or newly minted secret. Body `userId` never determines ownership.
Service-role bridge sessions are refused. `run.cjs` accepts an operator-owned
configuration module, binds loopback only and processes queued preparations.
It does not deploy itself or provision a public endpoint.

The Edge-only `career_task_bridge.js` is imported by `handler-career.ts`.
The handler continues to load/save through Muse's CareerHost unchanged; tasks
are not added to its snapshot or memory keys. Crew A's alerts, shared-store
adapter and memory are untouched. No Node driver/store enters the Edge graph.

The chat request's optional `career_task` object supports:

| action | fields | effect |
| --- | --- | --- |
| `prepare` | `eventId`, `artifactId`, `resumeSha256` | enqueue using the host's currently selected `ctx.posting` |
| `status` | `taskId` | read owned task/review/result |
| `approve` | `taskId`, `eventId`, `payloadSha256`, `resumeSha256`, `destination` | explicit message `Approve browser task <id>` plus bound review fields |
| `reconcile` | `taskId` | authoritative readback, never another click |

The response carries the structured `task` review/result. A messaging client
must render that review and return its original binding fields with approval;
a bare yes authorizes nothing. `UPMORE_CAREER_WORKER_URL` is configuration only
and has not been set anywhere. The bridge forwards only the existing user JWT,
refuses redirects, bounds its wait, and treats transport failure as uncertain.
Without an endpoint it reports NOT_WIRED. No production worker, artifact
resolver, readback adapter or credential configuration was installed.

## Checks

`node --test tests/career-owned-worker.test.cjs` covers durable checkpoints,
timeout/budget stops, duplicate webhooks/approvals, profile and resume changes,
wrong users, conditional fields, observation/action schemas, actual local
multipart bytes, and real worker-process death after a simulated click.

`node --experimental-vm-modules --test tests/career-bundle-reachability.test.cjs`
executes the actual staged index -> handler -> generated bundle and the task
bridge with in-memory remote-service stand-ins. It verifies that CareerHost
stores survive unchanged and a duplicate approval cannot submit twice.

`node --test tests/career-owned-worker-browser.test.cjs` is the real Chromium
test over the controlled multipart portal. Set `UPMORE_PLAYWRIGHT_PATH` to an
already installed Playwright module and optionally `UPMORE_CHROMIUM_PATH` to
the installed Chromium. It never downloads a browser or disables sandboxing.
It is blocked in the selected executor as recorded above. No runtime screenshot
or applicant record is committed or saved to Library.
