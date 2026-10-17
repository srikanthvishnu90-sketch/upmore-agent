# Actual-entry partial interview artifact checkpoint

Default off (`CAREER_JOURNEY_MODE=interview_v1` is a server setting). Not deployed;
the new SQL remains an owner-review proposal. B runtime is unchanged at b414b042,
composed through evidence head 325580e0. No production or paid execution occurred.

The actual staged career handler now registers B, loads a strictly validated
owned canonical context, persists B state and complete proposed action payloads
atomically with the existing turn receipt, and saves exact Markdown bytes.
Authenticated `GET /career/artifacts/<uuid>` opens fresh owned storage, verifies
current context/selections and bytes, and creates a server-owned readback receipt.
It proves server delivery, not a successful save to the person's local disk.

The frozen actual-entry oracle failed before registration (5698d750), then found
a SQL variable/column collision and a cross-runtime object boundary failure.
All three failed logs remain here. No expected outcome was weakened; test
transport error logging was added after the first implementation failure.
The repaired oracle passed its entire 8-turn journey plus authenticated download with exact UTF-8 hash and
byte comparison, restart, replay, paused state, rejected foreign open and forged
callback, and a verified **partial** artifact. Full transcripts and artifact
bytes are in `actual-entry-passed.log`; prepared-source hashes are recorded.

Reproduce only in a fresh owned, marked, network-none PostgreSQL fixture:

```sh
node scripts/career/critical-repairs/ci-node.cjs --postgres-only --sql-file=career-critical-repairs/interview-entry-postgres.test.cjs
```

The additional nine frozen adversarial cases passed (10 actual-entry tests total).
They cover disabled execution, forged proof/context/capabilities, foreign threads,
stale context, atomic rollback with a fresh same-key retry, full durable payload
retention, hypothetical-versus-actual truthfulness, oversized-input refusal, and
legacy erase revocation. Their expected outcomes were committed at 2372fcf0
before execution; `actual-entry-adversarial-10.log` retains the first run.

`event-trace-and-artifact.json` extracts the actual transcript from that TAP log;
`partial-pack.md` is the exact delivered UTF-8 artifact (5,023 bytes, SHA-256
`1243a023c6871138eebd96272fd938ba505a95a642c5fe603b75718543a5da47`).
Extraction decoded TAP escaping, then independently verified both bytes and hash.
There were eight observed command turns plus the separate authenticated download
and deliberately rejected requests. The artifact remained partial.

The first checkpoint also passed native Deno checking of the new entry module
and 10 registration/staged-size/host checks. Before adding this entry proposal,
all 161 native SQL checks across 13 files passed with the paired-budget proposal;
`../pair-budget-v2/whole-sql-summary.json` identifies that exact source.

Limits: canonical context must already exist in owned storage; missing/stale
projection fails closed. This checkpoint does not implement typed context-v3
writers or fix the separately owned module-130 issue. Generation, independent
semantic checking and research stay `not_wired`; no assessment or full coaching
completion is claimed. Paid model quality and all 15 live browser outcomes remain
NOT_RUN. The existing sandbox blocker and archived-original release gate remain.

The post-checkpoint targeted source run passed 188 checks; actual A-context
consumption by B passed 23 checks. Context negative controls killed all 12
planted defects and B controls killed all 20. These are structural contracts.
The fresh 2026-10-17 normal-sandbox browser preflight aborted before navigation:
`chrome-sandbox` is owned by nobody (uid 65534), mode 4755. The original 15 tasks
remain frozen at SHA-256 `2734e0edfcaec93f792bcfe5a3138c37bb971eeb951265013e523ed0ecc2a96c`;
all remain NOT_RUN. No helper ownership, flags, capabilities or sandbox policy
were changed. The saved preflight is separate from browser task evidence.
