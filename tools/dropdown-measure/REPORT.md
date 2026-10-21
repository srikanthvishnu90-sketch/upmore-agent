# DROPDOWN MEASURE — results (LANE D, 2026-10-21)

Interactions recorded: **50** across **8** forms. Doorstep only — no submit was armed or fired on any run.

## Per-form run outcomes (production path, module 149 runApply)

| form | runApply result | code | dropdowns measured |
|---|---|---|---|
| affirm — Manager, Software Engineering (Marketing and | awaiting_user |  | 1 |
| cultureamp — Senior Customer Success Manager (Enterprise- | awaiting_user |  | 16 |
| grafanalabs — Senior Partner Solutions Engineer | East Coa | blocked | ANSWER_OBSERVATION_MISMATCH | 5 |
| greenhouse — Growth Account Executive | blocked | ANSWER_OBSERVATION_MISMATCH | 9 |
| gusto — AI/IT Controls Engineer, Enterprise Applicat | blocked | ANSWER_OBSERVATION_MISMATCH | 7 |
| intercom — Relationship Manager, Sr MidMarket | blocked | ANSWER_OBSERVATION_MISMATCH | 5 |
| robinhood — Senior Software Engineer, International | blocked | ANSWER_OBSERVATION_MISMATCH | 3 |
| twilio — Sales Development Representative | blocked | ANSWER_OBSERVATION_MISMATCH | 4 |

## Results by widget type

| widget type | attempted | observed-correct | correct-as-rendered | mismatched (wrong value) | vanished after verified fill | not observed (fill failed) | median fill | p90 fill |
|---|---|---|---|---|---|---|---|---|
| react-select | 50 | 4 | 20 | 0 | 0 | 26 | 13383 ms | 23119 ms |

## Every non-correct interaction

| form | field | type | phase | intended | observed | fill | ms | ~poll depth | root cause |
|---|---|---|---|---|---|---|---|---|---|
| affirm | Pronouns | react-select | runApply | Decline to self-identify | I prefer not to say | ok | 13045 | 19 (cleared-search zone) | value-format |
| cultureamp | Gender identity | react-select | runApply | Decline to self-identify | (nothing) | FAILED | 23467 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| cultureamp | Do you identify as transgender? | react-select | runApply | Decline to self-identify | (nothing) | FAILED | 22934 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| cultureamp | Do you identify as Hispanic or Latinx (“Hi | react-select | runApply | Decline to self-identify | (nothing) | FAILED | 24499 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| cultureamp | Race / Ethnicity (Select all that apply) | react-select | runApply | Decline to self-identify | (nothing) | FAILED | 23017 | 34 (ladder exhausted) | widget-behavior (multi-select driven by the single-value widget drive) |
| cultureamp | Do you identify as LGBTQIA? | react-select | runApply | Decline to self-identify | (nothing) | FAILED | 23053 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| cultureamp | Disability | react-select | runApply | Decline to self-identify | (nothing) | FAILED | 22948 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| cultureamp | Veteran Status | react-select | runApply | Decline to self-identify | (nothing) | FAILED | 22726 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| cultureamp | Gender identity | react-select | probe | Decline to self-identify | (nothing) | FAILED | 22809 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| cultureamp | Do you identify as transgender? | react-select | probe | Decline to self-identify | (nothing) | FAILED | 22652 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| cultureamp | Do you identify as Hispanic or Latinx (“Hi | react-select | probe | Decline to self-identify | (nothing) | FAILED | 23144 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| cultureamp | Race / Ethnicity (Select all that apply) | react-select | probe | Decline to self-identify | (nothing) | FAILED | 22609 | 34 (ladder exhausted) | widget-behavior (multi-select driven by the single-value widget drive) |
| cultureamp | Do you identify as LGBTQIA? | react-select | probe | Decline to self-identify | (nothing) | FAILED | 22689 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| cultureamp | Disability | react-select | probe | Decline to self-identify | (nothing) | FAILED | 23119 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| cultureamp | Veteran Status | react-select | probe | Decline to self-identify | (nothing) | FAILED | 22987 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| grafanalabs | What gender identity do you most closely i | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 12004 | 18 (cleared-search zone) | value-format |
| grafanalabs | Are you a person of transgender experience | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 11133 | 16 (word-retype zone) | value-format |
| grafanalabs | Which race and ethnicity group or groups d | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 11204 | 16 (word-retype zone) | value-format |
| grafanalabs | Do you have a visible or non-visible disab | react-select | runApply | Decline to self-identify | (nothing) | FAILED | 21145 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| grafanalabs | Do you have a visible or non-visible disab | react-select | probe | Decline to self-identify | (nothing) | FAILED | 20184 | 32 (cleared-search zone) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| greenhouse | I identify my gender as: | react-select | runApply | Decline to self-identify | (nothing) | FAILED | 22578 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| greenhouse | I identify as transgender: | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 11608 | 17 (cleared-search zone) | value-format |
| greenhouse | I identify my sexual orientation as: | react-select | runApply | Decline to self-identify | (nothing) | FAILED | 20929 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| greenhouse | I identify my ethnicity as (mark all that  | react-select | runApply | Decline to self-identify | (nothing) | FAILED | 21080 | 34 (ladder exhausted) | widget-behavior (multi-select driven by the single-value widget drive) |
| greenhouse | I have a physical disability: | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 11523 | 17 (cleared-search zone) | value-format |
| greenhouse | I identify my gender as: | react-select | probe | Decline to self-identify | (nothing) | FAILED | 21135 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| greenhouse | I identify my sexual orientation as: | react-select | probe | Decline to self-identify | (nothing) | FAILED | 21750 | 34 (ladder exhausted) | poll-ladder exhausted (no option matched in 34 polls — widget variant) |
| greenhouse | I identify my ethnicity as (mark all that  | react-select | probe | Decline to self-identify | (nothing) | FAILED | 21464 | 34 (ladder exhausted) | widget-behavior (multi-select driven by the single-value widget drive) |
| greenhouse | I identify my nationality as | react-select | probe | Decline to self-identify | I don't wish to answer | ok | 12152 | 18 (cleared-search zone) | harness probe mis-target (EEO default sent to a non-EEO screening widget) — not product evidence |
| gusto | How would you describe your gender identit | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 13383 | 20 (cleared-search zone) | value-format |
| gusto | I identify as transgender (please select o | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 11857 | 17 (cleared-search zone) | value-format |
| gusto | I identify my sexual orientation as (pleas | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 11369 | 16 (word-retype zone) | value-format |
| gusto | I identify my race/ethnicity as (mark all  | react-select | runApply | Decline to self-identify | (nothing) | FAILED | 21201 | 34 (ladder exhausted) | widget-behavior (multi-select driven by the single-value widget drive) |
| gusto | Veteran Status (please select one): | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 11689 | 17 (cleared-search zone) | value-format |
| gusto | I have a disability (please select one): | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 11745 | 17 (cleared-search zone) | value-format |
| gusto | I identify my race/ethnicity as (mark all  | react-select | probe | Decline to self-identify | (nothing) | FAILED | 24943 | 34 (ladder exhausted) | widget-behavior (multi-select driven by the single-value widget drive) |
| intercom | Veteran Status | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 11386 | 16 (word-retype zone) | value-format |
| intercom | US Export Control laws 2026: Do you hold a | react-select | probe | Decline to self-identify | (nothing) | FAILED:WORKER_UNREACHABLE | 7843 | 10 (segment-retype zone) | harness probe mis-target (EEO default sent to a non-EEO screening widget) — not product evidence |
| intercom | US Export Control laws 2026: In which coun | react-select | probe | Decline to self-identify | (nothing) | FAILED:WORKER_UNREACHABLE | 0 | 0 (initial poll (pre-retype)) | harness probe mis-target (EEO default sent to a non-EEO screening widget) — not product evidence |
| robinhood | What is your race or ethnicity? | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 12481 | 18 (cleared-search zone) | value-format |
| robinhood | What is your disability status? | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 12444 | 18 (cleared-search zone) | value-format |
| robinhood | Do you identify as part of the LGBTQ+ comm | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 11126 | 16 (word-retype zone) | value-format |
| twilio | Voluntary Self-Identification of Gender | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 12972 | 19 (cleared-search zone) | value-format |
| twilio | Voluntary Self-Identification of Race/Ethn | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 11559 | 17 (cleared-search zone) | value-format |
| twilio | Protected Veteran Status | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 11677 | 17 (cleared-search zone) | value-format |
| twilio | Voluntary Self-Identification of Sexual Or | react-select | runApply | Decline to self-identify | I don't wish to answer | ok | 12221 | 18 (cleared-search zone) | value-format |

## Correct interactions (for the record)

- affirm · Pronouns · react-select · runApply · intended "Decline to self-identify" · observed "I prefer not to say" · 13045 ms · ~poll 19 · rendered-form
- cultureamp · Gender · react-select · runApply · intended "Decline to self-identify" · observed "Decline To Self Identify" · 7831 ms · ~poll 10
- cultureamp · Are you Hispanic/Latino? · react-select · runApply · intended "Decline to self-identify" · observed "Decline To Self Identify" · 7977 ms · ~poll 10
- grafanalabs · What gender identity do you most closely i · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 12004 ms · ~poll 18 · rendered-form
- grafanalabs · Are you a person of transgender experience · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 11133 ms · ~poll 16 · rendered-form
- grafanalabs · Which race and ethnicity group or groups d · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 11204 ms · ~poll 16 · rendered-form
- greenhouse · I identify as transgender: · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 11608 ms · ~poll 17 · rendered-form
- greenhouse · I have a physical disability: · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 11523 ms · ~poll 17 · rendered-form
- greenhouse · I identify my nationality as · react-select · probe · intended "Decline to self-identify" · observed "I don't wish to answer" · 12152 ms · ~poll 18 · rendered-form
- gusto · How would you describe your gender identit · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 13383 ms · ~poll 20 · rendered-form
- gusto · I identify as transgender (please select o · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 11857 ms · ~poll 17 · rendered-form
- gusto · I identify my sexual orientation as (pleas · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 11369 ms · ~poll 16 · rendered-form
- gusto · Veteran Status (please select one): · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 11689 ms · ~poll 17 · rendered-form
- gusto · I have a disability (please select one): · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 11745 ms · ~poll 17 · rendered-form
- intercom · Gender · react-select · runApply · intended "Decline to self-identify" · observed "Decline To Self Identify" · 9859 ms · ~poll 14
- intercom · Are you Hispanic/Latino? · react-select · runApply · intended "Decline to self-identify" · observed "Decline To Self Identify" · 8823 ms · ~poll 12
- intercom · Veteran Status · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 11386 ms · ~poll 16 · rendered-form
- robinhood · What is your race or ethnicity? · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 12481 ms · ~poll 18 · rendered-form
- robinhood · What is your disability status? · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 12444 ms · ~poll 18 · rendered-form
- robinhood · Do you identify as part of the LGBTQ+ comm · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 11126 ms · ~poll 16 · rendered-form
- twilio · Voluntary Self-Identification of Gender · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 12972 ms · ~poll 19 · rendered-form
- twilio · Voluntary Self-Identification of Race/Ethn · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 11559 ms · ~poll 17 · rendered-form
- twilio · Protected Veteran Status · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 11677 ms · ~poll 17 · rendered-form
- twilio · Voluntary Self-Identification of Sexual Or · react-select · runApply · intended "Decline to self-identify" · observed "I don't wish to answer" · 12221 ms · ~poll 18 · rendered-form

## Root-cause tally (non-correct interactions)

- value-format: 19
- poll-ladder exhausted (no option matched in 34 polls — widget variant): 18
- widget-behavior (multi-select driven by the single-value widget drive): 6
- harness probe mis-target (EEO default sent to a non-EEO screening widget) — not product evidence: 3

Poll-ladder depth (derived, react-select fills): median ~20, p90 ~34, max ~34 of 34.

## Root-cause readout (lane narrative — every claim traces to the records above)

**Headline: in 50 dropdown interactions the widget drive never picked a wrong value and never lost a verified fill (0 wrong picks, 0 vanished). The wall is three other things:**

1. **Value-format at module 149's observation gate — the largest class (19 of 50).** Every helper-verified EEO fill landed on the board's decline option. What the board renders for that option varies per field: "I don't wish to answer" ×19, "Decline To Self Identify" ×4, "I prefer not to say" ×1. Simulating 149's own acceptance logic on the 24 verified fills: **accept 5, reject 19** — every rejection is the "I don't wish to answer" rendering, which matches none of 149's EEO-decline patterns (`decline | prefer not | not (to )?answer | not (to )?disclose` — the "wish" forms are absent). The FR-395 escape hatch (compare against `board.renderedValues`) cannot fire on the production path: the board-service protocol returns only fill's return value, so `renderedValues` never crosses from module 150's server-side state to the executor-side 149. The helper's own decline vocabulary (driveWidget's isDecline: *do not wish / don't wish / not answer / not disclose*) is broader than 149's regex — the two layers disagree about what counts as the same answer. Consequence, observed 6 times: the production run blocks with ANSWER_OBSERVATION_MISMATCH at the first "I don't wish to answer" field (gusto 605, intercom veteran_status, twilio 75375, robinhood 1258, grafanalabs 4000713004, greenhouse 29666) even though every fill up to that point was correct. The two runs that did NOT block (affirm, cultureamp) are exactly the ones whose rendered texts fall inside 149's regex.
2. **Poll-ladder exhaustion on widget variants the matcher never sees (22 of 50).** Failed fills cluster at 20–25 s = the full 34-poll ladder (derived depth ~34). Culture Amp carries TWO EEO blocks: the standard Greenhouse pair filled in ~7.9 s each, while the employer-custom block (7 fields) failed all 14 attempts (runApply + probe) at ~23 s — on the same form, same page, same intended value. Greenhouse's gender/sexual-orientation and Grafana's disability widgets exhausted the ladder too (6 attempts); Greenhouse 29665 is the same field the throughput-infra drive filled hours earlier, so success on these variants is not deterministic run-to-run.
3. **Multi-select widgets driven by single-value machinery (6 of 50).** Every "mark/select all that apply" field (gusto 608, greenhouse ethnicity, cultureamp 142 — each tried twice) failed with nothing observed. driveWidget and the readback (fnWidgetValue) are built around one single-value node; a multi-select can never satisfy them.
4. **Why even successes are slow (the timing mechanism under the "~80% fixed poll-wait" finding).** Verified fills: median 11.6 s, p90 13.0 s; derived poll depth median ~17–20 of 34. The wanted text "Decline to self-identify" shares NO token with the board's option "I don't wish to answer", so every filtered option poll returns an empty list until the ladder's cleared-search rung (i=16, ≥8 s of polls) renders the full list and the matcher can judge it. The wait is the ladder's own design, not the network or the option service.
5. **Coverage limits, stated plainly.** Native `<select>`: **n=0** — all 8 censused forms render every dropdown as react-select (101 react-select fields censused; 50 measured). Radio groups: n=0 measured. Lever: **not measured** — the live board service's familyVerdicts are `{greenhouse: true}` only; enabling Lever is O5's step, not this lane's. Non-EEO react-selects (country, location, screening) could not be probe-filled under the no-invention rule because the derived gauntlet profile currently exposes only `answers` (profileFor returned profileKeys=["answers"] on all 8 drives — the standard identity facts are absent from the pack), so this evidence base is EEO-heavy by necessity; the constraint is recorded here rather than worked around. Two intercom probe records are a harness mis-target plus one WORKER_UNREACHABLE transport event (the same event class the throughput lane observed once; root cause NOT_RUN in both lanes) and are excluded from the product tallies above.
6. **Method limits.** Poll-ladder depth is DERIVED from fill wall time (the helper returns no depth across the board-service protocol; attempts/rendered stay server-side for the same reason). The derivation (fixed prefix ≈ click+clear+type ≈ 900 ms + 30 ms/char, settle+readback ≈ 750 ms, then ≈550 ms per poll rung) is stated so the numbers can be re-derived or challenged; the exhausted-vs-landed distinction does not depend on its precision (failed fills at 20–25 s vs verified at 8–13 s are separated by ~10 s under any plausible constants).

**What this says to whoever rewrites the widget drive:** the cheapest large win is not in the drive at all — it is aligning 149's observation acceptance with the helper's decline vocabulary (or returning `rendered` across the board-service protocol so FR-395 can fire). The drive-side wins, in order: make the decline-class option reachable without waiting for the cleared-search rung when the wanted value is decline-class; add option-pool coverage (or a census) for the employer-custom EEO block variant; give multi-select widgets their own drive + readback shape.
