# Loop-completion lane — the approve → SBX leg, exercised honestly (2026-10-20)

Lane: LOOP-COMPLETION (Muse subagent), following the worker flip
(`docs/gauntlet/worker-flip-2026-10-20.md` @ 047e781e), whose §5 left one
leg unexercised: a run whose selected applications reach doorsteps, so a
user approval can drive the sandbox (SBX) board to employer-shaped
confirmations. Authorization: the owner's blanket approval of
2026-10-20 (everything on the supply list, including the deploy of fix
lane 3's commit 9143889e and work on this machine as the worker host).

HARD LIMITS HONORED: the TEST user only
(`gauntlet-test@upmore.test`); worker traffic only to the sandbox board
(:8472) inside a bounded window, restored afterwards; zero real
employer traffic (the :8471 board service was never driven by this
lane); every fact entered only through product chat turns — no database
writes of facts (the only SQL writes were the test user's rate-limit
reset, the lanes' standing practice).

Driver: `~/workspace/prune-lane/loop-completion/probe.py` (magic-link
JWT, fresh turn_key per attempt, stored-message recovery — the flip
driver's pattern); full turn-by-turn results in
`~/workspace/prune-lane/loop-completion/loop-results.json`.

## §1 — fix lane 3's 9143889e: NOT live at lane start; DEPLOYED; guard verified in the deployed bytes

- Live agent-chat at lane start was **v245** (the router-line
  redeploys). The deployed body, downloaded via the Management API
  (3,828,264 bytes), was read directly: its
  `handleResumeIngestConfirm` runs the post-confirmation tailor leg
  UNGUARDED (`let chained=null; const named=...; if(named)
  chained=handleTailor(...)`; `catch{chained=null}` count 0). **The
  fix was not in the live build**, despite 9143889e being an ancestor
  of the owner-worded trunk commit ea365d5a — those redeploys were not
  built from that lineage's committed bundles.
- Deploy: cherry-pick of 9143889e onto `integration/v2-candidate` →
  **8410e9cb** (clean; parent ab94e44e is a candidate ancestor).
  Staged with the prune-lane recipe (entry `agent-chat/index-career.ts`,
  all-js minify) → 12 files. Surgical proof: every staged file is
  byte-identical to the v242 stage (`stage-4b4e7981`) EXCEPT
  `_shared/router_core.career.js`, whose common prefix/suffix against
  the v242 stage isolate the ONLY delta to the try/catch hunk inside
  `handleResumeIngestConfirm` (+24 bytes).
- Deployed agent-chat ONLY (sb.py /tmp copy, entrypoint
  `agent-chat/index.ts`) → **agent-chat v246 ACTIVE**. Re-downloaded
  body (3,828,288 bytes, +24): the tailor leg now reads
  `try{const named=...; if(named)chained=handleTailor(...); ...}
  catch{chained=null}`. **9143889e is live.**
- Behavioral note (from §2, step S3): the guard now WORKS live — and
  the underlying tailor-leg throw STILL occurs in the edge runtime
  (the confirmation turn degraded to the Confirmed reply instead of
  producing the tailored artifact). The fix's promise was exactly
  this degradation; the throw's root cause remains unisolated
  (defect TAILOR-LEG-EDGE-THROW below).

## §2 — seeding the test user through the product's own path: every surface driven; the executor's four inputs have NO product writer

Baseline (the executor's own selection rule — freshest profile row
with basics/facts, `workers/career-browser/production-sources.cjs`):
the Telegram battery's stated-facts bridge (basics all null except
location "SF", 7 stated facts, answers NULL, attestations NULL,
constraints all null, resume NULL). This — not an attestation-only
gap — is what the flip's §5.2 executor read (its run's asks, §3).

The canonical journey (fix lane 3's §5 script, verbatim):

| step | turn | result |
|---|---|---|
| S1 | "Tailor my resume for the Product Manager role at Natera and send me the PDF as a file in this chat." | PASS — `career_tailor`, needs-facts, target set |
| S2 | verbatim `packages/career-data/fixtures/test-resume.txt` paste | PASS — `career_resume_ingest`, exactly 15 draft facts |
| S3 | "Yes, that's my resume." | **PARTIAL (by lane 3's own grading)** — intent `career_resume_ingest`, the guard's Confirmed fallthrough ("Confirmed — your resume facts are on your record. 15 facts…"), NOT contained, no "nothing changed" denial. SQL: 15 facts confirmed (0 unconfirmed); `channel_artifacts` still 0 — the tailor leg threw and the guard caught it |
| S4 | "Send me the PDF as a file in this chat." | honest no-document reply (`career_document_delivery`) — no artifact exists to send |

Profile after the journey (executor's view): 15 confirmed facts
(education/experience/leadership/project/skill) — **basics still all
null, resume still NULL, answers NULL, attestations NULL.** The
resume's own header line (name, email, phone, location) becomes
neither basics nor facts.

Attestation/identity surfaces then driven one by one (seed thread
unless noted), each followed by a stored-profile check:

| surface | outcome |
|---|---|
| Identity assertions ("My name is Alex Testcase. My email is…, my phone is…, I live in Chicago, IL.") | `profile_correction`; captured only as keyed stated facts (geography SF→Chicago). Basics untouched |
| Work-auth assertions ("I am a US citizen and I am authorized to work in the United States. I do not require sponsorship.") | `intent_sensitive_correction` — wrote **constraints**, with the polarity INVERTED: `needsSponsorship: true`, `workAuthorization: "Will need sponsorship in the future"`. Corrected through the same path ("I do not need sponsorship. I will not require sponsorship now or in the future.") → `needsSponsorship: false`. **The executor never reads constraints, and the values never become `profile.answers`** |
| Certification statement ("I certify that the information in my job applications is true and accurate.") | `career_fallback` — no capture route exists |
| "Hi, I'm new here. Help me get set up…" (fresh thread) | discovery reply on the existing profile — no onboarding interview engages, no name/visa questions asked |
| "What do you still need from me before you can submit applications for me?" | contained generic fallback — the product cannot enumerate its own missing application answers |

Structural root (code, candidate @ 8410e9cb): the executor builds the
portal profile ONLY from `master.basics` + `master.answers` (verbatim)
+ `master.resume` (only with a sha256), and attestations ONLY from
`master.attestations` (verbatim) — `production-sources.cjs`
(`p
...[truncated 7518 chars]