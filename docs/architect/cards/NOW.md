# NOW: what Codex works on next (the architect updates this; newest first)

Read this first, every time you start or finish something. The cards are in this folder; the full requirement list
and build order are in `docs/product/REQUIREMENTS.md`.

## 2026-10-19 18:45 UTC
1. **Read `docs/product/STANDARD.md` once** (the owner's bar: real-world depth, competitor, scale, no placeholders).
   From now on every result you report is labelled VERIFIED (and against what), ASSUMED or NOT_RUN. Your 0/24 and
   CONNECT 403 reports are the model.
2. Trunk is green again (PR #19 merged at 852ea88d). Merge trunk into your branch before C-01's proofs.
3. C-01 is still the job. Then C-02 when the engine PR opens.

## 2026-10-19 17:00 UTC
1. **C-01, now.** On your branch `wo/009b-3-acceptance`: merge trunk, apply the code in C-01 exactly, run the proofs,
   open the PR. The architect ran this exact code on your branch: 22/22, portal 92/92 unchanged.
2. **Stop work on `scripts/apply.ts` and `workers/career-browser/`.** They moved to the architect (branch
   `wo/009b-4-engine`). Your `wo/009b-4-apply-cli` and `wo/009b-5-worker-pull` stay as they are; do not push to them.
3. **C-02 when the architect's engine PR opens** (title starts `WO-009b-4 engine:`): the seven-rule review.
4. **Not now:** `wo/009b-6-coverage` waits (redirected in WO-009b to read `evals/apply/questions-ci*.json`; a card
   will say exactly how). Nothing on networking, interview or offers until P0 is proven.
5. Trunk was red from 12:01 UTC today on `career-ingest` B9 (a clock bug, the architect's): PR #19 fixes it. If your
   CI shows that one failure before #19 merges, it is not yours; say so in one line and carry on.
