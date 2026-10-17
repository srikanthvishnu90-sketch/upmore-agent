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
The repaired oracle passed its entire 9-event journey with exact UTF-8 hash and
byte comparison, restart, replay, paused state, rejected foreign open and forged
callback, and a verified **partial** artifact. Full transcripts and artifact
bytes are in `actual-entry-passed.log`; prepared-source hashes are recorded.

Reproduce only in a fresh owned, marked, network-none PostgreSQL fixture:

```sh
node scripts/career/critical-repairs/ci-node.cjs --postgres-only --sql-file=career-critical-repairs/interview-entry-postgres.test.cjs
```

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
