Frontend Lane C's profile surfaces are now real, committed code instead of an uncommitted worktree: module 174 turns the existing career engines into the screens a user actually touches — a facts-import review where every item carries its provenance label and nothing lands confirmed, a profile editor that supersedes facts instead of overwriting them, and document links issued only as private-bucket, signed-600s descriptors after the resume parse-back gate passes. The five engines it sits on (165/167/168/169/170) are vendored byte-identical, exactly as the lane built them, so the branch is self-contained off base cea914fe. Guards prove the behavior: the profile-surfaces suite passes 11/11 (re-verified by the push sweep on 2026-10-23) with router-bundle and career-bundle neighbors at 6/6 and zero delta.

## What changed
- `packages/domain/174-career-profile-surfaces.js` — importReview/stageImport/applyImportDecisions (122 drafts only; discard pins status + quarantined flag), profileEditor + proposeEdit/confirmEdit (supersede, never overwrite), issueDocuments (169→adapter→165 parse-back gate; 168 via the real 167 reader; WO-028 descriptors: private `careers-resumes` bucket, channel_artifacts signed links, 600 s, no public URL on the surface), connectionsSkeleton with honest empty states.
- `packages/domain/165/167/168/169/170-*.js` — vendored byte-identical from their sibling lanes (hashes in `evidence/lane-transcript.txt`).
- `tests/career-profile-surfaces.test.cjs` — 11 guards: synthetic corpus parses 12 facts / 1 unparsed-with-reason; both documents READY (letter audit 2 checked / 0 violations).
- `evidence/lane-transcript.txt` — the lane's own status record (started 2026-10-21 16:40 CDT, built 17:10 CDT) plus the sweep's re-verification.

## Not in this package
- The lane's recorded next step — TEST exercise (owner corpus import on the TEST user + WO-028 live leg) — remains undone; it needs the owner's corpus.
- Nothing is deployed, no flag moved, 0 submits. This is repo-tier only.
