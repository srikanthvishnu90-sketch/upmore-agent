# Final fresh 300 — classification companion (build range bb68f87..93c4430)

Official count (grader-v2 rescore WITH capability-absent v2): **PASS 116 / FAIL 182 / NOT IMPLEMENTED 2 / BLOCKED 0. S0 scenarios: none.**
Finishable set (278): PASS 102 / FAIL 176. Judge: NOT_RUN in this environment — every verdict is deterministic-only.
Records: `~/workspace/your_files/upmore-career-gauntlet-final-300` (300/300, incl. subset re-runs: the 87 outreach-send IDs on the campaign-plan build f1b91f6, 38 on the A4 campaign branch 93c4430, and 16 records restored after the first rescore silently dropped them — see the ledger).
Baseline `upmore-career-gauntlet-300` untouched; the c72a3cc report (PASS 13) is superseded by this run.

## The 182 FAILs, classified

- **My lane — completion/doorstep remainder (the work continues):**
  - 158 fails carry a SCEN-A4 completion miss. Largest blocks: Apply (the SC-063..119 band — batch/discovery-vs-apply routing and packet products not carried on every branch), Negotiation (the SC-206..270 band — 128 products returned at top level, not under the payload keys the F6 validator reads), Prep/Intel (SC-146..187 band), Career OS (SC-271..285 band — 130's front-door intents vs 142's `capability_status` returns).
  - 95 fails carry STATE_doorstep_gap: application 37 (auto-apply/packet branches that end without a packet/artifact when a posting or portal session is absent — the honest-empty shapes need their own element-keyed completion branches or typed blockers), outreach-send 49 (draft/list/follow-up handlers that return products under keys the derivation does not read, incl. SC-157 whose harness-persona half — interaction rows — is gauntlet-owner work), tracking-write 5 (SC-122/123/124/126/127 — the TN-1a spec conflict, ledgered: the asks name no company and 141 refuses company-less log writes), calendar 3 (SC-038/181/294), profile-update 1 (SC-247).
  - 34 fails carry R-C5 (reply names no source class / as-of) — concentrated in Intelligence + Negotiation template fallbacks.
  - Tails: H-4 ×8, H-2 ×7, H-5 ×5, REFUSAL_NO_ALTERNATIVE ×4, H-7 ×2.
- **Owner-gated (named, not silently parked):** SC-084 (needs a named referral confirmer — the owner's), SC-196 (needs one real setback fact — the owner's). Both sit inside the FAIL count above, not the NI line.
- **CA-listed NI (honest, by the owner-approved list v2):** SC-105, SC-179 — 2 only.
- **Grader-table gap (owner's choice, ledgered):** SC-294 — run-grand's recorded verdict is PASS (pre-declared refusal) while grader-v2 says FAIL (its family classifies 'calendar' from the word "schedule" in the ask's description). SC-035's refusal shape passes both graders; its remaining miss is the doorstep class above.
- **Dispositioned, not chased:** SC-111 — honest FAIL by the owner's ruling (no portfolio-packet capability exists; it sits in the ambiguous 8, outside the 278).

## What flipped tonight (evidence in the run report)

Interim build (3d0ecd1) PASS 19 → final PASS 116; S0 scenarios 0 at every stage after Wave A; the outreach-send doorstep-gap class fell 87 → 49 via the campaign-plan doorstep (124 campaign + safety card as the plan's artifact) and the element-keyed A4 campaign branch; 16 records the first rescore dropped were restored and re-graded (all PASS).

## Tier statement (owner's strict rule)

All 300 scenarios executed through Upmore's own chat code path (module 142 dispatch, chain 120 → 130 → 142 → 141) via the test harness — tier 1, the strongest proof available while no career agent is deployed (CA-08). No engine-direct or research artifact is presented anywhere in the pack as a product-chat result.
