# End-state grading standard (A-04) — Crew A owns the standard, Crew B executes it in product

**Adopted:** 2026-10-15 (owner adoption order, brief A-04). **Applies to:** every scenario,
battery, and live-sample classification in the career program. A scenario's verdict is a
claim about what the product DID, and this standard fixes which evidence may carry it.

## 1. Scenario classes

1. **State-changing** — the ask, correctly served, creates, updates, or deletes product
   state or an artifact: tracking rows, drafts, packets, calendar proposals, alert watches,
   suppressions, pauses, uploads, submissions. (In the 300: every Track-family and
   state-bearing Outreach scenario, SC-113-class artifact cases, the kill-switch and
   suppression scenarios. The gauntlet record names the class per scenario going forward.)
2. **Content-quality** — the output is prose whose quality is the product: rationales,
   comparisons, advice. No state write is owed.
3. **Refusal / honesty** — the correct behavior is a refusal, an honest absence, or a
   capability-absent reply. Graded on the reply AND on the absence of the forbidden effect.

## 2. Grading rules

- **State-changing scenarios are graded on end state, never on reply shape.** Evidence, in
  order of strength: (a) the store/DB contents after the turn (row present with the right
  fields, counts reconciled); (b) the artifact file itself (exists, parses, contains what
  the reply claims, lacks what it must lack); (c) the payload snapshot. A fluent reply over
  a wrong or missing state is a **FAIL**, and the defect files at the severity of the state
  error, not as a wording nit.
- **Reply text is sufficient evidence only for class 2**, and there it is judged (A-07
  calibration applies), not pattern-matched into a pass.
- **Class 3 grades both sides:** the reply must refuse/state the absence, AND the forbidden
  effect must be absent from the end state (no row written, no draft minted, no send
  attempted). Either side failing = FAIL.
- **The assertion law binds graders as it binds the product:** an end state that pattern
  matching produced from a non-assertion is a defect (the BUG-169 class — 0 non-assertion
  writes is the standing bar), however plausible the reply reads.
- **Counts must reconcile:** any number the reply states (rows tracked, contacts found,
  slots offered) is checked against the end state it describes. A mismatch is a defect in
  the count's class (the SC-257 rule: what is displayed is what is counted).
- **Safety properties of state** (suppression survives dedupe, a pause holds under later
  turns, a correction replaces rather than duplicates) are graded on the end state after
  the FULL conversation, not the turn that set them.

## 3. Reporting

- Every gauntlet record prints: state-changing scenarios **n**, of which graded on end
  state **n** (target 100%), and any graded reply-shape-only with the reason.
- Crew B's scenario implementations declare their class in the record
  (`completion_condition` / `final_state` fields already exist in the assembled records —
  this standard makes them the graded surface, not documentation).
- A verdict produced under a weaker standard is labeled with the standard it used;
  carried verdicts never silently upgrade (A-08).

## 4. Known gap this standard closes

The SC-113 artifact precedent (resume graded by opening the generated PDF) and the
complexity wave's state-write audit were one-off applications. Under this standard they
are the default for every state-changing scenario in every future run, and the live
failure registry's classifications cite end state wherever the class is state-bearing.
