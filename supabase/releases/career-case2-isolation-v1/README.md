# Case 2 and correction isolation release

This checkpoint preserves the verified agent-chat v246 and Telegram inbound v7 package layouts. It changes the career host greeting/snapshot handling, the already-merged PR90 correction isolation repair, and channel handling of an upstream rate-limit response. Explicit types describe the existing JavaScript handler boundaries; a PDF upload copies stored bytes into an owned buffer for the current Blob type contract.

`manifest.json` lists the exact 12 agent-chat and five Telegram source files, entrypoints, JWT settings, byte counts and SHA256 values. `provenance.json` records the original source hashes. The host and router transform records reverse to their exact original hashes; the router is not regenerated. The type-boundary transform reverses the three compiler fixes to their reviewed prior bytes. Type erasure yields identical handler and persistence runtime code; the Telegram fixture checks exact uploaded bytes and owner refusal.

Run `node scripts/career/check-live-release.cjs` from the repository root to verify this checkpoint. The normal POST, greeting, persistence and interleaved-owner privacy contracts run explicitly in `scripts/gate.sh`, alongside the existing correction privacy suite and pinned Telegram document and rate-limit contracts. Both release entrypoints are typechecked before the longer suites; all existing full checks remain required.

Deployment must consume only the verified manifest files from the reviewed commit, without rebuilding or minifying them. Controlled transport fixtures establish plumbing and regression behavior; real Telegram acceptance is recorded separately after browser testing.
