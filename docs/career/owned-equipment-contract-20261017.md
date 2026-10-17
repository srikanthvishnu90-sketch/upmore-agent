# Confirmed owned equipment — source checkpoint

`workers/career-browser/equipment.cjs` now supplies the missing resolver and
private byte materializer. It uses injected synchronous adapters over the
existing account and owned artifact store; it creates no database, account,
credential or network connection. It must never receive records from chat.

The operator supplies `authority.current(userId)`,
`loadOwnedRecords(userId, artifactId, scope)`, and
`readOwnedBytes(userId, validatedArtifact, scope)`, plus a private cache root.
Scope binds current account version/privacy epoch, posting key and resume hash.
The records contract is `career_owned_equipment/v2` with the same owner,
version/epoch, an immutable owned artifact version, and explicit confirmed fact
records. `latestConfirmedArtifact` from that same authoritative snapshot must match owner, privacy epoch, artifact ID, immutable version, digest and confirmation reference. Historical confirmed bytes alone are refused. Each confirmation names the user, reference and timestamp. The byte
reader independently returns owner, artifact/version IDs and a Buffer.

Only supported confirmed fields enter the profile. Unconfirmed, foreign and
stale facts remain absent so module 149 asks for missing required answers.
Conflicting confirmed facts block. Answers bind a posting; attestations also
require a matching observed wording hash. The ordinary worker does not yet
provide those wording bindings, so this resolver does not auto-attest consent.
It never extracts candidate facts from a resume or private transcript.

Actual size/hash/type signature and ownership are checked before materializing
bytes. The account is read again after retrieval and after persistence. Files
are private and bounded to 10 MiB, with a 15-minute maximum TTL. The worker
re-resolves on preparation and approval, verifies actual bytes again, and
releases each temporary copy after closing the page or on validation failure.
The template also closes equipment resources during shutdown. Abrupt host loss
still needs the previously documented owner-approved volume retention policy.

Twenty focused tests cover real local text/PDF/DOCX bytes, ownership, correction
during reads, omitted facts, posting/wording scope, cleanup, TTL and composition
through the actual worker. All candidate data is explicitly synthetic and local.
No browser or employer submission is represented by these tests.

The production store-to-contract mapping remains A/Muse integration work: no
existing resume storage schema, access credential or applicant record has been
guessed or bound. The native Greenhouse multipart/readback adapter is the next
source step. Real form/network observation and a compatible authorized runtime
remain live gates; prior access denials remain intact.


Recovery lifecycle repair: young inherited copies receive their remaining TTL timer on restart; explicit close removes inherited copies as well as tracked ones. Deletion failures remain tracked, are contained in timer callbacks, and retry at bounded backoffs (at most five attempts per cleanup chain). `cleanupStatus()` exposes pending/error counts without private paths. Explicit release/close reports `EQUIPMENT_CLEANUP_PENDING` until successful. A persistent filesystem deletion failure still needs operator repair; it is not represented as successful erasure. After retries exhaust, explicit close/release can retry. Local root is exclusively owned by one worker process; concurrent workers must use separate roots.

These tests use synthetic store records and local bytes. The v2 contract does not implement the production account store mapping; A/Muse must return the actual latest-confirmed pointer from existing owned storage. No browser proof or applicant binding in production is claimed.
