# Minimal hosted browser worker — approval-ready source proposal

**STRUCTURAL ONLY; NOT BUILT AS AN IMAGE, PROVISIONED, DEPLOYED OR LIVE VERIFIED.**
The product runs on an Upmore-operated cloud Linux worker. A personal desktop
is not required. The existing Supabase chat/SQL path remains the authenticated
control plane; a long-lived Node/Chromium process runs outside Edge Functions.
There is no browser-lane spending allocation: **$0**. The total $7 cap and the
parent's evaluator/reserved allocations do not authorize this deployment.

## Concrete source pieces

| File | Implemented behavior / limit |
| --- | --- |
| `scripts/career/build-owned-worker.cjs` | Deterministic allowlisted source tarball + per-file SHA manifest. No `.git`, credentials, operator config, uploaded resumes, dependencies or browser binary. |
| `workers/career-browser/run.cjs` | `mode: pull_only` runs unprivileged and creates no public HTTP listener. Existing local HTTP mode is preserved. |
| `pull-runner.cjs` | One task per pilot process, at most 15 minutes, 5-second polls, stop after three consecutive errors. It reports persisted interrupted/unknown checkpoints but never resets them to queued. |
| `rpc-client.cjs`, `rpc-helper.cjs`, `rpc-transport.cjs` | Bounded HTTPS RPC calls to the owner-configured project only, nine explicit task RPC names, 10-second network timeout, bounded 2 MiB bodies, no redirects or write retries. Private 0700 IPC directory bridges asynchronous HTTPS to the existing synchronous engine; key is not in argv/files/logs. |
| `authority.cjs`, existing task SQL | Existing server-side owner/version/epoch/pause locks, claims and one-use effect tokens remain authoritative. No second account store or permissive offline fallback. |
| `store.cjs` | Existing fsynced task state and local exclusive leases on a private persistent POSIX disk; one replica only, no shared NFS or multi-writer deployment. |
| `evidence.cjs` and worker hooks | Actual board screenshot calls only; private PNGs with opaque refs and hashes. Max 10 MiB/frame, 64 MiB/task. Required pre-submit form/read and review evidence can stop an application; missing receipt evidence never permits resubmission. Active evidence is removed on the next observed epoch revocation. |
| `receipt.cjs` | Type and consistency checks on trusted controlled-destination readback; employer verification remains NOT_WIRED. |
| `deploy/operator-config.example.cjs` | Owner-mounted config binding existing authority credential, approved equipment/readback module, state paths, pilot limits and controlled loopback registrations only. |
| `deploy/Dockerfile.proposal` | Requires an owner-approved browser base image; copies only source and controlled preflight fixtures; UID 1000. No package installation, sandbox flag, capability addition, chmod/chown or security relaxation. |

## Target resource and separate owner actions

Prefer an **already owned compatible Linux host**, with no incremental spend.
If none exists, prefer a dedicated VM running an unprivileged service. A
container is usable only if its normal sandbox works without added privileges
or security-option changes; the Dockerfile alone cannot prove that. The
candidate minimum pilot is one compatible Linux host with:

- 1 vCPU, 2 GiB RAM, one replica/one active browser, at least 10 GiB private
  persistent encrypted POSIX storage. This size is a proposed starting point,
  not benchmarked here; no automatic upgrade or extra spend is authorized.
- Node 24 and a digest-pinned, tested Playwright/Chromium pair already baked
  into the approved image. The OS/browser sandbox must work under the
  unprivileged service user. No privileged container, extra capabilities,
  sandbox-disabling flag, sysctl/seccomp relaxation or host-security change.
  If the platform cannot support this normally, choose a compatible host.
- Private outbound HTTPS to the existing task database and the one reviewed
  portal's observed destinations. No public worker port is needed. Do not
  broaden network permissions on the current platform as a workaround.
- Existing approved server identity for the task RPCs, bound as a provider
  secret, and an owner-approved artifact resolver. This source creates no
  credential and grants no new role. The included transport expects the
  existing project's supported Bearer-authenticated service credential; A
  must verify its suitability/expiry. It is not authorization to copy or
  rotate keys. No key is available/configured in this contribution.
- A private operator-only evidence readback/retention arrangement. Logs contain
  task/intent IDs, phase/status/error code and counters, not applicant facts,
  answers, resume paths, keys or PNG contents. Detailed checkpoints and frames
  remain private. Backups/history need a separately reviewed privacy policy.

**Cost reference, not a purchase or allocation:** DigitalOcean lists its
1-vCPU/2-GiB/50-GiB Basic Droplet at $0.01786/hour ($12 monthly cap), with a
minimum of 60 seconds or $0.01. A two-hour compute-only pilot is approximately
$0.03572 before tax, transfers or extras. An existing host may add $0. We
have not verified an account, region, browser-compatible image or final quote.
[Official pricing, checked 2026-10-17](https://www.digitalocean.com/pricing/droplets).

Before any provisioning, the parent/owner must **explicitly allocate a browser
pilot amount within the existing total cap** (for example, at most $0.10 if the
provider's final estimate fits), approve the provider/resource and auto-destroy
deadline, approve the existing credential/artifact binding, and authorize Muse
to deploy. These are distinct approvals; none has been given here. Do not use
the evaluator's $1, reserved $5 or unused $1 implicitly. Stopping Node does not
stop VM billing: owner/provider must enforce the host's time/cost ceiling.
Do not enable autoscaling, automatic process restarts for the pilot, paid
observability, backups, extra disks, a public load balancer or account creation.

## Build and verify, once the owner supplies the resource

Build the source tarball locally (already structurally tested):

```
node scripts/career/build-owned-worker.cjs /tmp/upmore-worker-source.tgz
```

The package's `worker-manifest.json` binds all shipped files to a code SHA.
The Dockerfile is a proposal and needs the approved base **digest**; there is
no default image or hidden download. Building/launching that image is NOT_RUN.
Mount owner config and the private state directory; bind existing secrets
through the provider, never an image layer, CLI argument or chat message.

On that target, first run the included controlled test with the normal sandbox:

```
UPMORE_PLAYWRIGHT_PATH=/approved/image/playwright-core \
UPMORE_CHROMIUM_PATH=/approved/image/chromium \
UPMORE_CONTROLLED_EVIDENCE_DIR=/private/evidence \
UPMORE_CONTROLLED_REPORT=/private/controlled-report.json \
UPMORE_CODE_SHA=<exact-reviewed-source-sha> \
node --test tests/career-owned-worker-browser.test.cjs
```

This test records genuine browser frames only when the browser actually runs,
plus exact synthetic inputs/outputs and the local server's submitted receipt.
It is explicitly controlled-local/MOCK authority, never an employer outcome.
Then verify the actual authenticated chat/outbox/worker chain and the one
Greenhouse vertical slice in the [handoff](greenhouse-one-application-handoff-20261017.md).
Current screenshots and genuine application outcomes remain **NOT_RUN / zero**.

## Recovery and scaling boundary

Persistent task state and SQL leases survive a worker process restart. Browser
contexts/cookies are not checkpointed or transferred; restoring a checkpoint
does not mean restoring a live session. Interrupted preparation, an admitted
uncertain effect, or a submit fence requires review/readback. Only explicit
reconciliation may resolve an unknown write; no automatic re-click or lease
stealing. A replacement host needs the same authorized private state or an
explicit recovery procedure; lost files do not override the SQL submit fence.

Single-process limits do not enforce lifetime spend across arbitrary restarts;
the pilot has one approved job and owner-controlled host TTL. Graceful shutdown
must allow the 120-second job deadline plus RPC settlement (recommend at least
180 seconds); killing earlier leaves uncertainty to reconcile. Helper processes
must remain in the service's process group for supervisor cleanup.

Mass text-to-application comes after one verified employer outcome: derive
each application from confirmed memory, ask only missing required facts, show
the exact per-application approval bindings, preserve independent budgets and
fences, and return proof per application. Do not turn a broad text request into
unbounded submissions or auto-refresh changed approvals. Multi-host execution,
multi-tenant session persistence and employer receipt semantics are not proven
by this structural-only branch.

## Recorded source verification

At source `3f073d7f2c54a906ac4515ce0b99f719ef0ee217`, 247 structural
tests pass, including 58 real isolated PostgreSQL contracts. The four frozen
entry assertions remain unchanged. Deterministic packaging produced 21 source
files, archive SHA-256
`994b77a273cf8b43794e1ac08f73bc49f5b88c4c136c15a7a16ecb5e6a8a1159`.
The hosted image, target process, real browser frames and employer outcome
remain NOT_RUN. Exact commands, source digests, test names, log hashes and
remaining authorizations are in
`docs/testing/runs/career-hosted-worker-20261017/results.json`.
Local test container and wire listener were removed afterward.
