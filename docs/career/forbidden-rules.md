# The Forbidden Register — Upmore Career Agent

Owner order 2026-10-14: every bug becomes a FORBIDDEN rule with permanent enforcement, so it can never happen again. This register is the single list the product is checked against. It inventories every defect in `docs/bug-ledger.md` (BUG-001…BUG-049, the finisher pass, and Registers 3–8 + the 2026-10-14 integrator wave) and in the integrator packs and lane reports named at the head of each section.

**How to read a rule.** FORBIDDEN is the thing that must never happen, in plain words. FROM is the failure it came from. ENFORCEMENT is the permanent guard that exists in the tree **today** — a test file and what it asserts (every test file cited was verified on disk by grep/`ls` during assembly; suite results quoted are the source documents' own records unless a rule says otherwise), the hard-shut path, or the literal word UNENFORCED with the enforcement that should exist. Statuses: **ENFORCED** (a guard exists and the source record shows it green) · **GUARDED-RED** (a fail-first guard exists and is currently failing — the fix is in flight) · **HARD-SHUT** (the path itself is shut down at the sink, stronger than a test) · **UNENFORCED** (no permanent guard today — these are the fix queue's top items).

**Duplicates.** Where one defect carries two ids (same mechanism, two sources), each id gets its own FR line and the lines cross-reference their twin — nothing is silently merged away.

**Maintenance.** The coordinator updates a rule's ENFORCEMENT and status in place when a fix lane lands its guard; a rule is never deleted. A fix without a register update does not count as fixed (the bug law).

## 1 · Bug ledger — main table (BUG-001…BUG-049)

Source: `docs/bug-ledger.md`, main table. FR numbers in this section match bug numbers (FR-001 = BUG-001) for easy cross-reference.

### FR-001 — Two persona fixture schemas
- **FORBIDDEN:** A test or product surface must never run on a second, divergent persona fixture; there is one canonical persona (class of 2028) and every reader uses it.
- **FROM:** BUG-001 — Two persona fixture schemas.
- **ENFORCEMENT:** tests/career-jobs.test.cjs APPE-001 adapter test + tests/career-profile.test.cjs (canonical-persona reads) — cited in the ledger replay column, files verified on disk.
- **STATUS:** ENFORCED

### FR-002 — CIR envelope schema drift
- **FORBIDDEN:** A CIR record must never ship in a hand-invented envelope shape the validator rejects; every record passes the shared schema gate before it counts as data.
- **FROM:** BUG-002 — CIR envelope schema drift.
- **ENFORCEMENT:** scripts/validate-cir.cjs over packages/career-data/cirs/*.json exits 0 (20/20 at fix time); the gate script is the permanent replay.
- **STATUS:** ENFORCED

### FR-003 — Invented reapply-cooldown rule
- **FORBIDDEN:** The product must never present a made-up firm cooldown rule as fact; with no sourced cooldown it must label the 180-day default as a default and show the computed reopen date.
- **FROM:** BUG-003 — Invented reapply-cooldown rule.
- **ENFORCEMENT:** tests/career-track.test.cjs cooldown test asserts the labeled default + reopen date. Data half still open: a sourced CIR cooldown_days field is owed.
- **STATUS:** ENFORCED

### FR-004 — Fabricated prep for a company with no CIR
- **FORBIDDEN:** Prep must never invent interview stages, bars, or comp for a company that has no CIR; it returns NO_CIR with the gaps named.
- **FROM:** BUG-004 — Fabricated prep for a company with no CIR.
- **ENFORCEMENT:** tests/career-prep.test.cjs NO_CIR assertions (composeBrief/salaryPrep/rejectionPivot). CIR authoring for the named companies is still owed.
- **STATUS:** ENFORCED

### FR-005 — CIR shape intolerance
- **FORBIDDEN:** A prep consumer must never silently break on a CIR whose fields use a different observed shape; shapes are normalized, with source labels kept.
- **FROM:** BUG-005 — CIR shape intolerance.
- **ENFORCEMENT:** tests/career-prep.test.cjs 'normalizeCir handles object-stage and claim-stage shapes'. A corpus schema validator is still owed (noted in the ledger).
- **STATUS:** ENFORCED

### FR-006 — Signing bonus parsed as annual bonus; 'undefined-year' cliff
- **FORBIDDEN:** An offer parser must never count a signing bonus as an annual bonus, and must never render a cliff as 'undefined-year'.
- **FROM:** BUG-006 — Signing bonus parsed as annual bonus; 'undefined-year' cliff.
- **ENFORCEMENT:** tests/career-negotiation.test.cjs NEGO-001 offer-B test (annual_bonus null, cliff '1-year').
- **STATUS:** ENFORCED

### FR-007 — Weekly/monthly rate read as annual pay
- **FORBIDDEN:** A weekly, monthly, or hourly figure must never be treated as an annual figure in a market estimate; period figures are excluded and shown as excluded.
- **FROM:** BUG-007 — Weekly/monthly rate read as annual pay.
- **ENFORCEMENT:** tests/career-negotiation.test.cjs BUG-003 regression (HRT $5,800/wk + D.E. Shaw $21,000/mo excluded).
- **STATUS:** ENFORCED

### FR-008 — 'Drop VPs' silently keeps every VP
- **FORBIDDEN:** A list operation must never silently keep the exact band the user said to drop; band comparison uses the raw band id, never a normalized form that rewrites it.
- **FROM:** BUG-008 — 'Drop VPs' silently keeps every VP.
- **ENFORCEMENT:** tests/career-outreach-w03.test.cjs applyListOps test (VP removed, count exact).
- **STATUS:** ENFORCED

### FR-009 — Digest reports 0 positive replies that happened
- **FORBIDDEN:** A digest or metric must never report zero positive replies when positive replies were handled; every reply path updates the same counters the digest reads.
- **FROM:** BUG-009 — Digest reports 0 positive replies that happened.
- **ENFORCEMENT:** tests/career-outreach-w03.test.cjs BUG-005 regression test (positive=4 from replayed fixture replies).
- **STATUS:** ENFORCED

### FR-010 — Outreach module assumed present when it was not
- **FORBIDDEN:** Work must never be planned on a module that is not on the branch; module 124 and firm-sets.json must be present wherever outreach work runs.
- **FROM:** BUG-010 — Outreach module assumed present when it was not.
- **ENFORCEMENT:** tests/career-outreach.test.cjs runs 28/28 on the merged tree; the stale-entry correction in the ledger confirms 124 is on pivot/career with the SEND_DISABLED sink.
- **STATUS:** ENFORCED

### FR-011 — Scenario assumes CIRs that do not exist (Ramp/Figma et al.)
- **FORBIDDEN:** A scenario or reply must never claim a 'company fact from the CIR' for a company with no CIR; a fact may come from the company's own live posting only with its source URL recorded.
- **FROM:** BUG-011 — Scenario assumes CIRs that do not exist (Ramp/Figma et al.).
- **ENFORCEMENT:** UNENFORCED — no test found that fails when a CIR is claimed for Ramp/Figma/Stripe/Datadog/Palantir. Enforcement should be: a coverage test asserting every scenario that names a CIR company finds that CIR file on disk.
- **STATUS:** UNENFORCED

### FR-012 — Apply rail missing while scenarios assumed it
- **FORBIDDEN:** The apply confirmation seam, salary rule, knockout, 15/day cap, duplicate and current-employer guards, batch card, and audit record must never be absent while apply scenarios run against them.
- **FROM:** BUG-012 — Apply rail missing while scenarios assumed it.
- **ENFORCEMENT:** tests/career-apply.test.cjs (the 132 apply-rail suite; ledger records 118/118 engine tests across the apply suites after merge).
- **STATUS:** ENFORCED

### FR-013 — Conflict markers committed; a definition dropped in a merge
- **FORBIDDEN:** A merge must never commit conflict markers, and a regex take-one-side resolution must never drop a function definition from a merged module.
- **FROM:** BUG-013 — Conflict markers committed; a definition dropped in a merge.
- **ENFORCEMENT:** tests/career-outreach.test.cjs + career-outreach-w03 + career-sc-w01 suites green after the true three-way rebuild; the adopted merge rule (empty unmerged-paths check + marker grep before any merge commit) is recorded in BUG-017's entry.
- **STATUS:** ENFORCED

### FR-014 — Prep breaks on the normalized CIR corpus
- **FORBIDDEN:** A module written against an old CIR dialect must never be merged against a normalized corpus untested; normalizeCir accepts both the old dialects and the validator schema.
- **FROM:** BUG-014 — Prep breaks on the normalized CIR corpus.
- **ENFORCEMENT:** tests/career-prep.test.cjs 15/15 on the merged corpus.
- **STATUS:** ENFORCED

### FR-015 — Bounce rate computed over successful sends only
- **FORBIDDEN:** A bounce rate must never use successful sends as its denominator (it can exceed 100% and can never trip at the true rate); the denominator is attempted = sent + bounces.
- **FROM:** BUG-015 — Bounce rate computed over successful sends only.
- **ENFORCEMENT:** tests/career-outreach-ext-w02.test.cjs monitorHealth test (100 attempted, 6 bounces → 6%, breaker tripped). The 124 evaluateBreaker denominator is flagged to its owner in the ledger.
- **STATUS:** ENFORCED

### FR-016 — Outreach module absent from the pivot branch (duplicate of BUG-010 class)
- **FORBIDDEN:** Later workers must never inherit a branch missing the outreach module its scenarios depend on. Twin of FR-010 (BUG-010) — same absence, found from the SC-021..030 setup side.
- **FROM:** BUG-016 — Outreach module absent from the pivot branch (duplicate of BUG-010 class).
- **ENFORCEMENT:** tests/career-outreach.test.cjs 28/28 in the worktree after the verbatim import; stale-entry correction confirms the module is on pivot/career today.
- **STATUS:** ENFORCED

### FR-017 — Chained merge half-ran and nested conflict markers
- **FORBIDDEN:** A merge chain must never continue after a failed step, and an already-conflicted file must never be merge-filed again; unmerged paths must be verified empty and markers grepped before any merge commit.
- **FROM:** BUG-017 — Chained merge half-ran and nested conflict markers.
- **ENFORCEMENT:** All outreach suites 47/47 after the rebuild from pristine sources; the verify-before-commit rule is recorded in this ledger entry and is the standing merge discipline.
- **STATUS:** ENFORCED

### FR-018 — Unproven skill counted as a fit match
- **FORBIDDEN:** An unproven skill (no evidence in the user's facts) must never count as a match or raise a fit score; it is named as an unproven gap instead.
- **FROM:** BUG-018 — Unproven skill counted as a fit match.
- **ENFORCEMENT:** tests/career-discover.test.cjs BUG-002 replay (score identical with/without the unproven mention).
- **STATUS:** ENFORCED

### FR-019 — Variant personas get no role-family preference
- **FORBIDDEN:** Scoring must never ignore the persona's structured role preferences; role families are derived from preferences.roles for every persona variant.
- **FROM:** BUG-019 — Variant personas get no role-family preference.
- **ENFORCEMENT:** tests/career-discover.test.cjs BUG-003 replay (nurse → Data/ML, international → SWE, canonical → SWE+Finance).
- **STATUS:** ENFORCED

### FR-020 — Company brief assembled without a CIR (Datadog)
- **FORBIDDEN:** A company brief must never be invented for a company with no CIR; the scenario reports LEARN with the missing CIR named as the exact unblock.
- **FROM:** BUG-020 — Company brief assembled without a CIR (Datadog).
- **ENFORCEMENT:** UNENFORCED — no test found; the honest state is the LEARN record itself. Enforcement should be: the same CIR-coverage test proposed for FR-011.
- **STATUS:** UNENFORCED

### FR-021 — Placeholder requisition id collapses distinct jobs
- **FORBIDDEN:** A placeholder requisition id ('See Opening ID') must never be used as a job identity; distinct postings must never share one job_id.
- **FROM:** BUG-021 — Placeholder requisition id collapses distinct jobs.
- **ENFORCEMENT:** tests/career-discover.test.cjs BUG-005 replay (3 distinct job_ids, a real REQ id still wins).
- **STATUS:** ENFORCED

### FR-022 — Composed thesis fails its own verification (unsourced numbers)
- **FORBIDDEN:** A composed thesis must never quote a number that has no claim in its own ledger; every quoted number from distribution, entry-route, and bias notes is ledgered with a source.
- **FROM:** BUG-022 — Composed thesis fails its own verification (unsourced numbers).
- **ENFORCEMENT:** tests/career-intel.test.cjs BUG-003 replay: composeThesis + verifyThesis over EVERY shipped CIR.
- **STATUS:** ENFORCED

### FR-023 — Campaign seam missing where the brief assumed module 124
- **FORBIDDEN:** A packets/campaign feature must never pretend the full outreach module exists when only a plan/record seam is built; the seam is plan/record-only with zero sends.
- **FROM:** BUG-023 — Campaign seam missing where the brief assumed module 124.
- **ENFORCEMENT:** tests/career-packets.test.cjs SC-100 test pins the plan/record-only seam. Stale-entry correction: full 124 is on the tree today.
- **STATUS:** ENFORCED

### FR-024 — ATS check flags a clean single-column render
- **FORBIDDEN:** The ATS check must never treat a legitimate ' | ' header separator as a table; only a real table row fails the check.
- **FROM:** BUG-024 — ATS check flags a clean single-column render.
- **ENFORCEMENT:** tests/career-packets.test.cjs 'SC-102 ATS check' test.
- **STATUS:** ENFORCED

### FR-025 — Thesis verification fails on 7 of 20 CIRs (second instance)
- **FORBIDDEN:** Same rule as FR-022 (BUG-022), second instance: numbers quoted from path patterns and known biases must be in the claim ledger. Twin of FR-022.
- **FROM:** BUG-025 — Thesis verification fails on 7 of 20 CIRs (second instance).
- **ENFORCEMENT:** tests/career-intel.test.cjs INTL-003 replay composing EVERY corpus CIR (20/20 verify + lint).
- **STATUS:** ENFORCED

### FR-026 — Datadog/Ramp CIRs absent from the branch (data twin of BUG-004/020)
- **FORBIDDEN:** Prep and graph work must never silently lack the Datadog/Ramp CIRs that exist on another branch. Twin class of FR-004/FR-020 (missing-CIR).
- **FROM:** BUG-026 — Datadog/Ramp CIRs absent from the branch (data twin of BUG-004/020).
- **ENFORCEMENT:** tests/career-graph.test.cjs (Datadog brief OK via the vendored CIRs). Upstream cir-b1 merge still owed per the ledger.
- **STATUS:** ENFORCED

### FR-027 — Invented referral-bonus amount
- **FORBIDDEN:** A referral-bonus figure must never be stated when no CIR carries one; the answer is NOT_IN_CIR with the sourced weight note and a null amount.
- **FROM:** BUG-027 — Invented referral-bonus amount.
- **ENFORCEMENT:** tests/career-graph.test.cjs bonus-intel test (sourced_bonus_count=0, amounts null).
- **STATUS:** ENFORCED

### FR-028 — Prep crashes on normalized CIRs (adapter workaround)
- **FORBIDDEN:** A vendored module that crashes on the canonical CIR shape must never be called with raw CIRs; every call routes through the shape adapter until the root fix lands.
- **FROM:** BUG-028 — Prep crashes on normalized CIRs (adapter workaround).
- **ENFORCEMENT:** tests/career-graph.test.cjs prep test (raw CIR throws TypeError; adapted Stripe + Datadog briefs OK). Root fix (teach 127 the normalized schema) still owed at integration.
- **STATUS:** ENFORCED

### FR-029 — 127 prep crashes on {stated, revealed} dict shapes
- **FORBIDDEN:** Same class as FR-028 (BUG-028), W11 instance: dict-shaped screening_signals must never reach a consumer that assumes lists. Twin of FR-028.
- **FROM:** BUG-029 — 127 prep crashes on {stated, revealed} dict shapes.
- **ENFORCEMENT:** tests/career-w11-ext.test.cjs 'BUG-141 adapter' (asserts the raw crash AND the adapted OK compose). Root fix in 127 normalizeCir still owed.
- **STATUS:** ENFORCED

### FR-030 — Senior-level figure quoted as a new-grad anchor
- **FORBIDDEN:** A benchmark must never present a different level's pay range as the user's anchor; a different-level figure is quoted with its level visible and labeled context, not an anchor.
- **FROM:** BUG-030 — Senior-level figure quoted as a new-grad anchor.
- **ENFORCEMENT:** tests/career-w11-ext.test.cjs SC-215 BUG-142 guard (quotes 'Senior Software Engineer' + 'NOT your anchor'). Engine-level fix in 128 still owed — see FR-201.
- **STATUS:** ENFORCED

### FR-031 — Module 126 vendored twice; dedupe unguarded
- **FORBIDDEN:** The tree must never carry two copies of module 126; when the upstream branch merges, the vendored copy is dropped and exactly one 126 remains.
- **FROM:** BUG-031 — Module 126 vendored twice; dedupe unguarded.
- **ENFORCEMENT:** UNENFORCED — tests/career-graph.test.cjs passes against the vendored copy, but no test or check found that fails if two 126 modules exist. Enforcement should be: a tree check asserting exactly one 126-career-track.js.
- **STATUS:** UNENFORCED

### FR-032 — Rejected cold applications counted as 'advanced'
- **FORBIDDEN:** A season retro must never count Rejected/Ghosted/Withdrawn applications as advanced past confirmation, and its headline must follow the log, not a preset claim.
- **FROM:** BUG-032 — Rejected cold applications counted as 'advanced'.
- **ENFORCEMENT:** tests/career-graph.test.cjs SC-145 test.
- **STATUS:** ENFORCED

### FR-033 — Duplicate protection misses log records with no jobId
- **FORBIDDEN:** Duplicate protection must never skip an existing application just because its record has no jobId; matching is by company+role with a jobId preference among hits.
- **FROM:** BUG-033 — Duplicate protection misses log records with no jobId.
- **ENFORCEMENT:** tests/career-apply.test.cjs inbox-reconciliation test (failed before, passes after).
- **STATUS:** ENFORCED

### FR-034 — Fit scores understated: structured roles ignored (twin of BUG-019)
- **FORBIDDEN:** profileFromPersona must never ignore the canonical structured preferences.roles; role-family points must be reachable. Twin of FR-019 (BUG-019), found from the apply side.
- **FROM:** BUG-034 — Fit scores understated: structured roles ignored (twin of BUG-019).
- **ENFORCEMENT:** tests/career-apply.test.cjs BUG-005 replay test + SC-068 (Match pool 0 → 63).
- **STATUS:** ENFORCED

### FR-035 — 'What accounts do I have connected?' returns nothing
- **FORBIDDEN:** A connected-accounts question in the ledger's own ordinary phrasing must never return null; the routing patterns cover what/which-accounts phrasings.
- **FROM:** BUG-035 — 'What accounts do I have connected?' returns nothing.
- **ENFORCEMENT:** tests/career-onboarding.test.cjs BUG-002/003/004 regression test + SC-002 rerun.
- **STATUS:** ENFORCED

### FR-036 — 'Disconnect all my accounts' parses its target as a name
- **FORBIDDEN:** 'Disconnect all/everything' must never be treated as a source name; it maps to source 'all' (both grants + both vault entries).
- **FROM:** BUG-036 — 'Disconnect all my accounts' parses its target as a name.
- **ENFORCEMENT:** tests/career-onboarding.test.cjs regression + SC-015 rerun.
- **STATUS:** ENFORCED

### FR-037 — 'Everything you've accessed for me' returns nothing
- **FORBIDDEN:** An audit-log question in ordinary phrasing must never return null; the accessed-for-me phrasings route to the access log.
- **FROM:** BUG-037 — 'Everything you've accessed for me' returns nothing.
- **ENFORCEMENT:** tests/career-onboarding.test.cjs regression + SC-005 rerun.
- **STATUS:** ENFORCED

### FR-038 — One dead grant produces two re-auth messages
- **FORBIDDEN:** One expired grant must never produce two re-auth messages; blocked needs are grouped by their providing grant into one message (the T8 one-message rule).
- **FROM:** BUG-038 — One dead grant produces two re-auth messages.
- **ENFORCEMENT:** tests/career-onboarding.test.cjs BUG-005 regression + ACCS-003 T8 test. (The reachability half — healthPlan having a chat caller — is FR-093, SHX-3.)
- **STATUS:** ENFORCED

### FR-039 — Triage collapses distinct Stripe roles (query string stripped)
- **FORBIDDEN:** Link triage must never strip URL query strings when a board's job id lives in them (?gh_jid=); URL identity is the full trimmed URL.
- **FROM:** BUG-039 — Triage collapses distinct Stripe roles (query string stripped).
- **ENFORCEMENT:** tests/career-apply3.test.cjs BUG-006 replay + SC-114 rerun.
- **STATUS:** ENFORCED

### FR-040 — Outreach engine absent from the integration branch (third instance)
- **FORBIDDEN:** The integration branch must never lack the outreach engine the SC-001..060 family depends on. Twin of FR-010/FR-016.
- **FROM:** BUG-040 — Outreach engine absent from the integration branch (third instance).
- **ENFORCEMENT:** tests/career-outreach.test.cjs 28/28 on the branch after the verbatim import; module confirmed on pivot/career by the stale-entry correction.
- **STATUS:** ENFORCED

### FR-041 — User-ordered warmth priority ignored by default weights
- **FORBIDDEN:** When the user names a warmth order ('same hometown first'), ranking must never silently use the default order instead; the named features lift in the named order, and default behavior is unchanged when no priority is given.
- **FROM:** BUG-041 — User-ordered warmth priority ignored by default weights.
- **ENFORCEMENT:** tests/career-sc-w01.test.cjs (3 tests: default unchanged, priority reorders score + buildList, rankContacts honors it).
- **STATUS:** ENFORCED

### FR-042 — Captcha handoff carries no screenshot of the stopped page
- **FORBIDDEN:** A captcha handoff must never leave the user with no picture of the stopped page; the driver captures the page at the stop and the blocked result carries screenshot_ref (null only when no browser ran — never fabricated).
- **FROM:** BUG-042 — Captcha handoff carries no screenshot of the stopped page.
- **ENFORCEMENT:** tests/career-portal-browser.test.cjs captcha-at-open + captcha-at-review tests assert screenshot_ref is a path to a real PNG (magic bytes).
- **STATUS:** ENFORCED

### FR-043 — Board pages unreachable without the egress relay
- **FORBIDDEN:** Real-board loads in this sandbox must never bypass the CONNECT relay pattern that is the only working egress for Chromium.
- **FROM:** BUG-043 — Board pages unreachable without the egress relay.
- **ENFORCEMENT:** tests/career-portal-browser.test.cjs — the suite's relay-configured launch is exercised on every run; board-map probes reached greenhouse.io/lever.co only with the relay.
- **STATUS:** ENFORCED

### FR-044 — Seam suite dies with ENOSPC on the shared /tmp tmpfs
- **FORBIDDEN:** Session scratch must never be forced onto the shared 512 MB /tmp; the seam honors UPMORE_SEAM_TMP and passes the same base as TMPDIR to the helper.
- **FROM:** BUG-044 — Seam suite dies with ENOSPC on the shared /tmp tmpfs.
- **ENFORCEMENT:** tests/career-portal-browser.test.cjs runs green with UPMORE_SEAM_TMP set; the relocation lives in module 150's ensureHelper code.
- **STATUS:** ENFORCED

### FR-045 — In-process fixture server deadlocks the synchronous bridge
- **FORBIDDEN:** A test suite must never serve its fixture pages from the same process the synchronous (Atomics.wait) driver blocks; fixtures are served by a separate process.
- **FROM:** BUG-045 — In-process fixture server deadlocks the synchronous bridge.
- **ENFORCEMENT:** tests/career-portal-browser.test.cjs — the five navigation tests are the permanent replay; they cannot pass with an in-process fixture server.
- **STATUS:** ENFORCED

### FR-046 — Assembler drops dates and certifications; duplicated bullet across sections
- **FORBIDDEN:** A tailored packet must never render an entry without its date range, must never print the same line in two sections, and must never drop a selected certification fact. Twin of FR-258 (human-sounding B6) and of the FV-6 rule in the four-vertical section.
- **FROM:** BUG-046 — Assembler drops dates and certifications; duplicated bullet across sections.
- **ENFORCEMENT:** tests/career-tailor-dates-dedupe.test.cjs (6 tests: dated entries, dedupe + drop record, Certifications section, parse-check duplicate FAIL, missing-dates FAIL, credentials verbatim) — 0/6 before, 6/6 after; FV-6 in tests/career-four-vertical.test.cjs flipped green by the same fix.
- **STATUS:** ENFORCED

### FR-047 — One bad form widget kills a whole doorstep run
- **FORBIDDEN:** One unresponsive non-file widget must never abort a doorstep run or destroy its evidence; the fill degrades, the failure is recorded, and required-field gaps are asked about. (The resume file fill still throws — a payload claiming an un-uploaded resume would be false.)
- **FROM:** BUG-047 — One bad form widget kills a whole doorstep run.
- **ENFORCEMENT:** tests/career-portal-browser.test.cjs stays 9/9; the live Greenhouse doorstep re-run reaching the field stage is recorded in docs/career/evidence/portal-doorstep/greenhouse/.
- **STATUS:** ENFORCED

### FR-048 — Raw sha256 digest stamped into chat text
- **FORBIDDEN:** A raw content hash (64-hex digest) must never appear in chat text the user reads; hashes live only in typed artifact/packet/doorstep records. Twin of the reply-judge hash rule in the repass section.
- **FROM:** BUG-048 — Raw sha256 digest stamped into chat text.
- **ENFORCEMENT:** tests/career-hash-leak-guard.test.cjs (9 tests: composer-seam HASH_RE rules + SC-087/090/092/093 + SC-104 replays; typed records keep their hashes) — 0/9 before, 9/9 after. Lands in the next build after flip SHA 351eef2; live v220 predates it.
- **STATUS:** ENFORCED

### FR-049 — User's stated lead replaced by a generic 'proven skills' line
- **FORBIDDEN:** When the user's tailor ask names its own lead ('lead with X'), the reply must never substitute the generic matched-skills line; it names the user's lead, and the generic line appears only when no lead was named.
- **FROM:** BUG-049 — User's stated lead replaced by a generic 'proven skills' line.
- **ENFORCEMENT:** tests/career-hash-leak-guard.test.cjs SC-087/090/092/093 replays (user's lead present AND generic substitution absent). Same landing caveat as FR-048.
- **STATUS:** ENFORCED

## 2 · Bug ledger — finisher pass 2026-10-13 (46 bugs in per-lane files)

Source: `docs/bug-ledger.md` finisher summary + `docs/finisher-bugs-a1/a2/c/d1/e/f.md`. Multi-bug lane sets that the ledger itself records as one row-set carry one rule each (FIN-A1, BUG-A2, FIN-C); the D1 and E/F sets carry one rule per bug.

### FR-050 — Prep builder defects (Lane A1, 7 bugs)
- **FORBIDDEN:** A prep builder must never ship any of the seven Lane-A1 defects again; each was fixed replay-test-first in module 127.
- **FROM:** FIN-A1-1..7 — Prep builder defects (Lane A1, 7 bugs).
- **ENFORCEMENT:** tests/career-prep.test.cjs (22/22 at fix time, per the finisher summary in the ledger).
- **STATUS:** ENFORCED

### FR-051 — Missing prep features built as bugs (10 records)
- **FORBIDDEN:** A prep surface named by the scenarios (take-home plan, final-round delta, salary-deflection scripts, questions to ask, structure drill, day-of checklist, debrief retro, failure story) must never be silently absent; the failure-story builder refuses without a setback fact rather than inventing one.
- **FROM:** BUG-A2-01..10 — Missing prep features built as bugs (10 records).
- **ENFORCEMENT:** tests/career-prep.test.cjs (22/22 at fix time, per the finisher summary in the ledger). BUG-A2-06's refusal is SC-196's LEARN (a data gap), not an open bug.
- **STATUS:** ENFORCED

### FR-052 — Dataset-read defects (Lane C, 3 bugs)
- **FORBIDDEN:** Module 134's dataset reads must never repeat the three Lane-C defects; each was fixed in-lane with a replay test written before the fix.
- **FROM:** FIN-C-001..003 — Dataset-read defects (Lane C, 3 bugs).
- **ENFORCEMENT:** Replay tests written fail-first in-lane per the finisher summary; the summary names no single test file for Lane C, so this cites the ledger's finisher table (docs/finisher-bugs-c.md) as the record.
- **STATUS:** ENFORCED

### FR-053 — Track defects (Lane D1, item 1 of 9)
- **FORBIDDEN:** A tracking behavior in the BUG-D1 set must never regress; each of the nine was fixed in-lane replay-test-first.
- **FROM:** BUG-D1-01 — Track defects (Lane D1, item 1 of 9).
- **ENFORCEMENT:** tests/career-track-d1.test.cjs (8 tests, all failed pre-fix).
- **STATUS:** ENFORCED

### FR-054 — Track defects (Lane D1, item 2 of 9)
- **FORBIDDEN:** A tracking behavior in the BUG-D1 set must never regress; each of the nine was fixed in-lane replay-test-first.
- **FROM:** BUG-D1-02 — Track defects (Lane D1, item 2 of 9).
- **ENFORCEMENT:** tests/career-track-d1.test.cjs (8 tests, all failed pre-fix).
- **STATUS:** ENFORCED

### FR-055 — Track defects (Lane D1, item 3 of 9)
- **FORBIDDEN:** A tracking behavior in the BUG-D1 set must never regress; each of the nine was fixed in-lane replay-test-first.
- **FROM:** BUG-D1-03 — Track defects (Lane D1, item 3 of 9).
- **ENFORCEMENT:** tests/career-track-d1.test.cjs (8 tests, all failed pre-fix).
- **STATUS:** ENFORCED

### FR-056 — Track defects (Lane D1, item 4 of 9)
- **FORBIDDEN:** A tracking behavior in the BUG-D1 set must never regress; each of the nine was fixed in-lane replay-test-first.
- **FROM:** BUG-D1-04 — Track defects (Lane D1, item 4 of 9).
- **ENFORCEMENT:** tests/career-track-d1.test.cjs (8 tests, all failed pre-fix).
- **STATUS:** ENFORCED

### FR-057 — Track defects (Lane D1, item 5 of 9)
- **FORBIDDEN:** A tracking behavior in the BUG-D1 set must never regress; each of the nine was fixed in-lane replay-test-first.
- **FROM:** BUG-D1-05 — Track defects (Lane D1, item 5 of 9).
- **ENFORCEMENT:** tests/career-track-d1.test.cjs (8 tests, all failed pre-fix).
- **STATUS:** ENFORCED

### FR-058 — Track defects (Lane D1, item 6 of 9)
- **FORBIDDEN:** A tracking behavior in the BUG-D1 set must never regress; each of the nine was fixed in-lane replay-test-first.
- **FROM:** BUG-D1-06 — Track defects (Lane D1, item 6 of 9).
- **ENFORCEMENT:** tests/career-track-d1.test.cjs (8 tests, all failed pre-fix).
- **STATUS:** ENFORCED

### FR-059 — Track defects (Lane D1, item 7 of 9)
- **FORBIDDEN:** A tracking behavior in the BUG-D1 set must never regress; each of the nine was fixed in-lane replay-test-first.
- **FROM:** BUG-D1-07 — Track defects (Lane D1, item 7 of 9).
- **ENFORCEMENT:** tests/career-track-d1.test.cjs (8 tests, all failed pre-fix).
- **STATUS:** ENFORCED

### FR-060 — Track defects (Lane D1, item 8 of 9)
- **FORBIDDEN:** A tracking behavior in the BUG-D1 set must never regress; each of the nine was fixed in-lane replay-test-first.
- **FROM:** BUG-D1-08 — Track defects (Lane D1, item 8 of 9).
- **ENFORCEMENT:** tests/career-track-d1.test.cjs (8 tests, all failed pre-fix).
- **STATUS:** ENFORCED

### FR-061 — Track defects (Lane D1, item 9 of 9)
- **FORBIDDEN:** A tracking behavior in the BUG-D1 set must never regress; each of the nine was fixed in-lane replay-test-first.
- **FROM:** BUG-D1-09 — Track defects (Lane D1, item 9 of 9).
- **ENFORCEMENT:** tests/career-track-d1.test.cjs (8 tests, all failed pre-fix).
- **STATUS:** ENFORCED

### FR-062 — Card renders dump raw JSON as the card's content
- **FORBIDDEN:** A card must never be presented to the user as a raw JSON dump; cards render as labeled, human-readable rows.
- **FROM:** FIN-E-001 — Card renders dump raw JSON as the card's content.
- **ENFORCEMENT:** UNENFORCED — the ledger's finisher summary credits Lane F with the fix (re-sweep PASS) but no permanent test file was found asserting readable card rendering. Enforcement should be: a render test asserting no card surface contains a JSON.stringify dump.
- **STATUS:** UNENFORCED

### FR-063 — Draft emails ungrammatical ('I saw that worked on a a…')
- **FORBIDDEN:** A draft must never prepend a fixed clause to a subject-less fact, producing broken grammar or doubled articles in text a user is asked to approve.
- **FROM:** FIN-E-002 — Draft emails ungrammatical ('I saw that worked on a a…').
- **ENFORCEMENT:** tests/career-outreach.test.cjs 'FIN-E-002 replay' (124 draftFor supplies the subject, de-conjugates, collapses doubled articles).
- **STATUS:** ENFORCED

### FR-064 — Weekly digest leaks raw kind codes and mis-pluralizes
- **FORBIDDEN:** A digest must never show raw internal kind codes (follow_up_due, assessment_deadline) or broken plurals ('1 rejections'); it uses each item's plain label. Twin class of the T-126 digest defect in Register 6.
- **FROM:** FIN-E-003 — Weekly digest leaks raw kind codes and mis-pluralizes.
- **ENFORCEMENT:** tests/career-track.test.cjs digest test assertions (126 weeklyDigest plain labels + pluralization).
- **STATUS:** ENFORCED

### FR-065 — 'What can you do' answers leak the finance domain
- **FORBIDDEN:** A career status answer must never enumerate finance capabilities, finance blocked rows, or finance file paths; the status builder filters to the career domain before rendering.
- **FROM:** FIN-E-004 — 'What can you do' answers leak the finance domain.
- **ENFORCEMENT:** UNENFORCED — ledger summary credits Lane F, but no test file was found asserting career-only filtering of the status builder. Enforcement should be: a status-answer test asserting no finance capability ids or paths appear.
- **STATUS:** UNENFORCED

### FR-066 — Approval card contradicts its own prose
- **FORBIDDEN:** An approval card must never claim fit/version for items whose fit is null, list the same role twice with different versions, or render company names un-normalized.
- **FROM:** FIN-E-005 — Approval card contradicts its own prose.
- **ENFORCEMENT:** UNENFORCED — ledger summary credits Lane F, but no test file was found pinning card/prose agreement and dedupe. Enforcement should be: a card-assembly test (null fit → 'no fit score yet'; duplicate role → one item).
- **STATUS:** UNENFORCED

### FR-067 — Raw internal identifiers presented as user copy
- **FORBIDDEN:** User copy must never embed variant UUIDs, status codes (approved_not_sent), internal ids, raw maps, repo paths, or 'PDF: null'; identifiers belong in the tool/verification record only. Sibling of FR-048 (hash in chat).
- **FROM:** FIN-E-006 — Raw internal identifiers presented as user copy.
- **ENFORCEMENT:** UNENFORCED — ledger summary credits Lane F, but no prose-scrub test was found for these identifier classes beyond the hash guard (FR-048). Enforcement should be: extend the composer lint to UUID/status-code/path tokens in bubbles.
- **STATUS:** UNENFORCED

### FR-068 — Internal vocabulary systematic in prose (CIR, § refs, tier codes, snake_case)
- **FORBIDDEN:** Agent prose must never use internal vocabulary — 'CIR', spec-section references, tier codes (T1/T3), function names, snake_case tokens — where a plain word exists.
- **FROM:** FIN-E-007 — Internal vocabulary systematic in prose (CIR, § refs, tier codes, snake_case).
- **ENFORCEMENT:** UNENFORCED — a prose-lint script exists (scripts/career/prose-lint.cjs, see FIN-F-002) but no test file was found that fails a suite on these tokens in delivered prose. Enforcement should be: wire prose-lint into a permanent test over delivered replies.
- **STATUS:** UNENFORCED

### FR-069 — Duplicated copy from two layers concatenated
- **FORBIDDEN:** A confirmation must never say the same point three times because two layers each appended their own warning; each surface speaks once.
- **FROM:** FIN-E-008 — Duplicated copy from two layers concatenated.
- **ENFORCEMENT:** UNENFORCED — open in docs/finisher-bugs-e.md (P3, owning lane). Enforcement should be: a reply test over the sensitive-answer and LinkedIn-connect flows asserting no repeated sentence.
- **STATUS:** UNENFORCED

### FR-070 — Numbers that do not agree inside one message
- **FORBIDDEN:** A single message must never carry counts that do not reconcile (2 pending vs 3 booked + 1 held; 560 − 120 ≠ 408 in reserve) without explaining the difference.
- **FROM:** FIN-E-009 — Numbers that do not agree inside one message.
- **ENFORCEMENT:** UNENFORCED — open in docs/finisher-bugs-e.md (P3). Enforcement should be: digest/yield builder tests asserting internal count reconciliation.
- **STATUS:** UNENFORCED

### FR-071 — Render shell readability (contrast, wall-of-text theses)
- **FORBIDDEN:** The render shell must never ship user text below WCAG AA contrast, 12px card text, or unbroken wall-of-text thesis answers with doubled parentheses.
- **FROM:** FIN-E-010 — Render shell readability (contrast, wall-of-text theses).
- **ENFORCEMENT:** UNENFORCED — ledger summary credits Lane F for the class, but no test was found asserting contrast/text-size/template shape. Enforcement should be: a render-shell check in the harness (contrast ratio + lint on thesis templates).
- **STATUS:** UNENFORCED

### FR-072 — Disconnect surfaces contradict themselves on one screen
- **FORBIDDEN:** A surface must never announce an action and 'nothing is connected' in the same breath; it states the actual state first, asks, then confirms — with no vault/consent-log jargon.
- **FROM:** FIN-E-011 — Disconnect surfaces contradict themselves on one screen.
- **ENFORCEMENT:** UNENFORCED — open in docs/finisher-bugs-e.md (P3). Enforcement should be: disconnect-flow reply tests asserting state-first copy (the BUG-036/038 guards cover routing, not this copy).
- **STATUS:** UNENFORCED

### FR-073 — Card anatomy inconsistent across tiers
- **FORBIDDEN:** Cards must never each invent their own title/body/action shape, and a bubble must never verbatim-repeat its card's title; one shared card anatomy applies.
- **FROM:** FIN-E-012 — Card anatomy inconsistent across tiers.
- **ENFORCEMENT:** UNENFORCED — ledger summary credits Lane F, but no test was found pinning a shared card anatomy. Enforcement should be: a renderer test asserting typed cards with the shared anatomy.
- **STATUS:** UNENFORCED

### FR-074 — Weekly digest lists the same next action twice
- **FORBIDDEN:** A digest must never render one event as two next actions (the quiet-report nudge and the deadline-radar follow-up for the same company are one event). Twin of the T-126 digest-duplication defect in Register 6.
- **FROM:** FIN-E-013 — Weekly digest lists the same next action twice.
- **ENFORCEMENT:** UNENFORCED — open in docs/finisher-bugs-e.md (P3) as a follow-on to FIN-E-003's fix. Enforcement should be: a weeklyDigest test asserting one next action per company/event.
- **STATUS:** UNENFORCED

### FR-075 — Canonical prep generators missing from the branch
- **FORBIDDEN:** A canonical render's named generator must never exist only in a tool record; casePrepPlan and coffeeChatPrep live in module 127 with plain prose (no function names, no 'CIR').
- **FROM:** FIN-F-001 — Canonical prep generators missing from the branch.
- **ENFORCEMENT:** UNENFORCED — fixed in-lane with canonical scenario runners (SC-185-canonical.cjs, SC-182-canonical.cjs) and lint-clean renders, but scenario runners are not a permanent test file. Enforcement should be: a career-prep test asserting both generators exist and emit lint-clean prose.
- **STATUS:** UNENFORCED

### FR-076 — 652 stale corpus renders still carry pre-fix prose
- **FORBIDDEN:** Stale renders must never be quoted as current product behavior; a render predating a module fix is re-run or treated as history, never as evidence.
- **FROM:** FIN-F-002 — 652 stale corpus renders still carry pre-fix prose.
- **ENFORCEMENT:** UNENFORCED — open (P3). The modules and scripts/career/prose-lint.cjs exist (652 violations corpus-wide vs 0 on the swept sample), so re-runs land clean or fail loudly, but no test pins the corpus state.
- **STATUS:** UNENFORCED

### FR-077 — Tailor diff summary identical for different roles
- **FORBIDDEN:** A tailor diff summary must never read identically ('15 added, 0 removed') for different roles; the diff must discriminate between roles. Sibling of the byte-identical-tailoring rule (SS-11 / B5).
- **FROM:** FIN-F-003 — Tailor diff summary identical for different roles.
- **ENFORCEMENT:** UNENFORCED — open (P3, tailor diff layer in 123). Enforcement should be: a tailor test asserting diff summaries differ across unlike roles.
- **STATUS:** UNENFORCED

### FR-078 — Legacy scenario runners cannot run in place
- **FORBIDDEN:** A scenario runner must never fail on its own shared-lib requires because it lives in a legacy folder; libs move or requires are fixed so every runner runs in place.
- **FROM:** FIN-F-004 — Legacy scenario runners cannot run in place.
- **ENFORCEMENT:** UNENFORCED — open (P3). Enforcement should be: a harness smoke run over legacy-*/ runners asserting they load.
- **STATUS:** UNENFORCED

## 3 · Bug ledger — Register 3: deep-dive defects (DD / SHX / SHD / MID / CODEX-MI / APD / FC / NWD / CGD)

Source: `docs/bug-ledger.md` Register 3 (ported from the bug-law audit). The audit's GUARD-ONLY class is ENFORCED here (a verified test guard exists; this register now supplies the missing ledger half). Rows the audit marked PARTIAL are UNENFORCED on their unguarded half.

### FR-079 — Submission proceeds after the job closed
- **FORBIDDEN:** A submission must never proceed without a job-availability recheck at submit time; a closed job stops the submission.
- **FROM:** DD-1 (AP08) — Submission proceeds after the job closed.
- **ENFORCEMENT:** tests/career-gauntlet-r2-integration.test.cjs (job_closed guard bridge) + tests/career-doorstep-safety-regression.test.cjs SAFETY-3.
- **STATUS:** ENFORCED

### FR-080 — Queue control answers only three exact phrases
- **FORBIDDEN:** Queue control must never depend on three exact phrases; the intent is owned across ordinary phrasings.
- **FROM:** DD-2 (AP17/NW18) — Queue control answers only three exact phrases.
- **ENFORCEMENT:** Round-2 intent ownership in 142, guarded by the r2 suites (tests/career-gauntlet-r2-integration.test.cjs and the r2 family).
- **STATUS:** ENFORCED

### FR-081 — Cancelled submission later executed on approve
- **FORBIDDEN:** A cancelled prepared submission must never execute on a later approve; cancellation is a state the approval path checks.
- **FROM:** DD-3 (AP18) — Cancelled submission later executed on approve.
- **ENFORCEMENT:** tests/career-gauntlet-r2-integration.test.cjs (approval_cancelled bridge) + tests/career-doorstep-safety-regression.test.cjs SAFETY-2.
- **STATUS:** ENFORCED

### FR-082 — No prior-application duplicate guard
- **FORBIDDEN:** A second application to the same role must never be prepared without the prior-application duplicate guard firing.
- **FROM:** DD-4 (AP20) — No prior-application duplicate guard.
- **ENFORCEMENT:** tests/career-gauntlet-r2-integration.test.cjs (duplicate bridge) + tests/career-doorstep-safety-regression.test.cjs SAFETY-4.
- **STATUS:** ENFORCED

### FR-083 — Missing receipt reported as confirmed (false completion)
- **FORBIDDEN:** A missing receipt must never be reported as a confirmed outcome; reconciliation over memory alone yields unknown_outcome, never confirmed.
- **FROM:** DD-5 (AP22) — Missing receipt reported as confirmed (false completion).
- **ENFORCEMENT:** r2 suites + tests/career-doorstep-safety-regression.test.cjs (deleted receipt → unknown_outcome leg).
- **STATUS:** ENFORCED

### FR-084 — Stale sensitive answer submitted after a fact edit
- **FORBIDDEN:** Editing a sensitive fact must never leave a prepared packet valid; packets are bound to fact versions and a correction invalidates the stale payload.
- **FROM:** DD-6 (AP23) — Stale sensitive answer submitted after a fact edit.
- **ENFORCEMENT:** tests/career-gauntlet-r2-integration.test.cjs (fact-correction invalidation bridge) + tests/career-doorstep-safety-regression.test.cjs SAFETY-1.
- **STATUS:** ENFORCED

### FR-085 — Recipient changed after the approval gate, unowned
- **FORBIDDEN:** Changing a draft's recipient after approval must never ride the old approval; the draft supersedes and needs its own gate.
- **FROM:** DD-7 (NW13) — Recipient changed after the approval gate, unowned.
- **ENFORCEMENT:** r2 suites (draft supersede path).
- **STATUS:** ENFORCED

### FR-086 — Opt-out from chat never recorded as suppression
- **FORBIDDEN:** An opt-out expressed in chat must never go unrecorded; the chat route records suppression. (The drafting half is guarded; durable cross-turn persistence is FR-089, DD-11.)
- **FROM:** DD-8 (NW17) — Opt-out from chat never recorded as suppression.
- **ENFORCEMENT:** tests/career-gauntlet-g4.test.cjs (processInboxEvent ×9, refused_suppressed).
- **STATUS:** ENFORCED

### FR-087 — Packet-validity question prepares a NEW packet
- **FORBIDDEN:** Asking whether a packet is valid must never trigger preparing a new packet; validity is answered from state.
- **FROM:** DD-9 (SH03) — Packet-validity question prepares a NEW packet.
- **ENFORCEMENT:** r2 intent ownership (validity answered from state), in the r2 suites.
- **STATUS:** ENFORCED

### FR-088 — Halt reply asserts 'Nothing was sent' unconditionally
- **FORBIDDEN:** A halt reply must never assert 'Nothing was sent' unconditionally; it reports what was halted and what is unverified, from state.
- **FROM:** DD-10 (NW18) — Halt reply asserts 'Nothing was sent' unconditionally.
- **ENFORCEMENT:** tests/career-killswitch-ra4.test.cjs (honest halted-vs-unverified reporting; Lane A SC-300 fix).
- **STATUS:** ENFORCED

### FR-089 — Suppression lost across turns; 'added to the list' claimed while the store reads false
- **FORBIDDEN:** A suppression recorded in one turn must never silently vanish in the next, and the product must never claim 'added to the suppression list' while the store probe reads false. SAFETY.
- **FROM:** DD-11 = NWD-01 — Suppression lost across turns; 'added to the list' claimed while the store reads false.
- **ENFORCEMENT:** UNENFORCED — the drafting half is guarded (tests/career-gauntlet-g4.test.cjs: all four draft entry points read suppression), but the cross-turn persistence half has no fix and no guard; a durable owner-scoped store is an owner/Codex decision. Also ledgered as BUG-2026-10-14-DD11-PERSIST (FR-218).
- **STATUS:** UNENFORCED

### FR-090 — Post-gate draft edit/retrieval unowned in chat
- **FORBIDDEN:** A post-gate edit or retrieval of a draft must never fall through to the unmatched fallback in chat; the versioned draft store's edits invalidate prior approvals on every route that reaches them.
- **FROM:** DD-12 = NWD-02 — Post-gate draft edit/retrieval unowned in chat.
- **ENFORCEMENT:** UNENFORCED — the engine half is guarded (tests/career-gauntlet-g4.test.cjs: versioned draft store, edits invalidate approvals), but the chat-route half is un-landed (Codex's lane) and the probe still falls back.
- **STATUS:** UNENFORCED

### FR-091 — Ordinary recall questions hit the fallback ('what's my' prefix gate)
- **FORBIDDEN:** A recall question must never depend on a 'what's my' prefix; ordinary recall phrasings reach module 130's recall.
- **FROM:** SHX-1 (SH02/SH10) — Ordinary recall questions hit the fallback ('what's my' prefix gate).
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH in the audit; FOR-CODEX, open). Enforcement should be: chat-route replay tests for prefix-less recall questions.
- **STATUS:** UNENFORCED

### FR-092 — Account guard is count-only; no authorization refusal
- **FORBIDDEN:** An account action must never be guarded by count alone; an unauthorized action gets an authorization refusal, not just a safe-by-accident no-op.
- **FROM:** SHX-2 (SH04) — Account guard is count-only; no authorization refusal.
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH; FOR-CODEX, open). Enforcement should be: a chat test asserting an explicit authorization refusal.
- **STATUS:** UNENFORCED

### FR-093 — healthPlan has no chat caller; expiry turn unowned
- **FORBIDDEN:** An account-expiry turn must never be unowned because the health plan has no chat caller; 120's healthPlan is reachable from chat. (BUG-038 fixed healthPlan's internals, not its reachability.)
- **FROM:** SHX-3 (SH06) — healthPlan has no chat caller; expiry turn unowned.
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH; FOR-CODEX, open). Enforcement should be: a chat replay driving an expiry turn to the health plan.
- **STATUS:** UNENFORCED

### FR-094 — Source outage answered with the healthy no-match sentence
- **FORBIDDEN:** A source outage must never be answered with the healthy 'no match' sentence; source-health states are distinct from empty results.
- **FROM:** SHD-1 (SH07) — Source outage answered with the healthy no-match sentence.
- **ENFORCEMENT:** tests/career-gauntlet-g5.test.cjs (SHD-1 ×4).
- **STATUS:** ENFORCED

### FR-095 — Render lacks viewport/lang attributes
- **FORBIDDEN:** A rendered document must never ship without viewport and lang attributes.
- **FROM:** SHD-2 (SH12) — Render lacks viewport/lang attributes.
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH; no landing in the record). Enforcement should be: a render test asserting viewport + lang on emitted HTML.
- **STATUS:** UNENFORCED

### FR-096 — Export text promises a deletion that has no handler
- **FORBIDDEN:** Export copy must never promise 'delete my stored profile' unless a real deletion handler stands behind it.
- **FROM:** SHD-3 (SH11) — Export text promises a deletion that has no handler.
- **ENFORCEMENT:** tests/career-gauntlet-g5.test.cjs (SHD-3 ×5; 122 real deletion + retention declaration). The chat route to it is still Codex's.
- **STATUS:** ENFORCED

### FR-097 — Prep scoring defect (MID-1 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class)
- **FORBIDDEN:** A prep scorer must never award form points for fluent wrong content, penalize a correct answer for brevity alone, tie-break on the weakest dimension, false-flag a contradiction, or mishandle confidential material (MID-1..8 classes).
- **FROM:** MID-1 — Prep scoring defect (MID-1 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class).
- **ENFORCEMENT:** tests/career-gauntlet-g3.test.cjs (MID-1…8 all present).
- **STATUS:** ENFORCED

### FR-098 — Prep scoring defect (MID-2 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class)
- **FORBIDDEN:** A prep scorer must never award form points for fluent wrong content, penalize a correct answer for brevity alone, tie-break on the weakest dimension, false-flag a contradiction, or mishandle confidential material (MID-1..8 classes).
- **FROM:** MID-2 — Prep scoring defect (MID-2 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class).
- **ENFORCEMENT:** tests/career-gauntlet-g3.test.cjs (MID-1…8 all present).
- **STATUS:** ENFORCED

### FR-099 — Prep scoring defect (MID-3 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class)
- **FORBIDDEN:** A prep scorer must never award form points for fluent wrong content, penalize a correct answer for brevity alone, tie-break on the weakest dimension, false-flag a contradiction, or mishandle confidential material (MID-1..8 classes).
- **FROM:** MID-3 — Prep scoring defect (MID-3 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class).
- **ENFORCEMENT:** tests/career-gauntlet-g3.test.cjs (MID-1…8 all present).
- **STATUS:** ENFORCED

### FR-100 — Prep scoring defect (MID-4 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class)
- **FORBIDDEN:** A prep scorer must never award form points for fluent wrong content, penalize a correct answer for brevity alone, tie-break on the weakest dimension, false-flag a contradiction, or mishandle confidential material (MID-1..8 classes).
- **FROM:** MID-4 — Prep scoring defect (MID-4 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class).
- **ENFORCEMENT:** tests/career-gauntlet-g3.test.cjs (MID-1…8 all present).
- **STATUS:** ENFORCED

### FR-101 — Prep scoring defect (MID-5 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class)
- **FORBIDDEN:** A prep scorer must never award form points for fluent wrong content, penalize a correct answer for brevity alone, tie-break on the weakest dimension, false-flag a contradiction, or mishandle confidential material (MID-1..8 classes).
- **FROM:** MID-5 — Prep scoring defect (MID-5 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class).
- **ENFORCEMENT:** tests/career-gauntlet-g3.test.cjs (MID-1…8 all present). Residual: the false-flagging detectContradiction still lives in 142; 127 exports the corrected version and the chat path changes only when 142 swaps to it (FOR-CODEX).
- **STATUS:** ENFORCED

### FR-102 — Prep scoring defect (MID-6 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class)
- **FORBIDDEN:** A prep scorer must never award form points for fluent wrong content, penalize a correct answer for brevity alone, tie-break on the weakest dimension, false-flag a contradiction, or mishandle confidential material (MID-1..8 classes).
- **FROM:** MID-6 — Prep scoring defect (MID-6 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class).
- **ENFORCEMENT:** tests/career-gauntlet-g3.test.cjs (MID-1…8 all present).
- **STATUS:** ENFORCED

### FR-103 — Prep scoring defect (MID-7 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class)
- **FORBIDDEN:** A prep scorer must never award form points for fluent wrong content, penalize a correct answer for brevity alone, tie-break on the weakest dimension, false-flag a contradiction, or mishandle confidential material (MID-1..8 classes).
- **FROM:** MID-7 — Prep scoring defect (MID-7 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class).
- **ENFORCEMENT:** tests/career-gauntlet-g3.test.cjs (MID-1…8 all present).
- **STATUS:** ENFORCED

### FR-104 — Prep scoring defect (MID-8 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class)
- **FORBIDDEN:** A prep scorer must never award form points for fluent wrong content, penalize a correct answer for brevity alone, tie-break on the weakest dimension, false-flag a contradiction, or mishandle confidential material (MID-1..8 classes).
- **FROM:** MID-8 — Prep scoring defect (MID-8 of 8: domain-blind scoring / brevity penalty / tie-break / contradiction / confidentiality class).
- **ENFORCEMENT:** tests/career-gauntlet-g3.test.cjs (MID-1…8 all present).
- **STATUS:** ENFORCED

### FR-105 — Prep surface unreachable from chat (CODEX-MI-1 of 6)
- **FORBIDDEN:** A prep surface must never exist only at module level with no chat route; mock answer capture must never swallow a correction turn, and a word-boundary exclusion must never eject an answer into a job shortlist (the \bfind\b class).
- **FROM:** CODEX-MI-1 — Prep surface unreachable from chat (CODEX-MI-1 of 6).
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH ×6; FOR-CODEX, open). Enforcement should be: chat-route replays for each 127 prep surface + a correction-turn capture test.
- **STATUS:** UNENFORCED

### FR-106 — Prep surface unreachable from chat (CODEX-MI-2 of 6)
- **FORBIDDEN:** A prep surface must never exist only at module level with no chat route; mock answer capture must never swallow a correction turn, and a word-boundary exclusion must never eject an answer into a job shortlist (the \bfind\b class).
- **FROM:** CODEX-MI-2 — Prep surface unreachable from chat (CODEX-MI-2 of 6).
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH ×6; FOR-CODEX, open). Enforcement should be: chat-route replays for each 127 prep surface + a correction-turn capture test.
- **STATUS:** UNENFORCED

### FR-107 — Prep surface unreachable from chat (CODEX-MI-3 of 6)
- **FORBIDDEN:** A prep surface must never exist only at module level with no chat route; mock answer capture must never swallow a correction turn, and a word-boundary exclusion must never eject an answer into a job shortlist (the \bfind\b class).
- **FROM:** CODEX-MI-3 — Prep surface unreachable from chat (CODEX-MI-3 of 6).
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH ×6; FOR-CODEX, open). Enforcement should be: chat-route replays for each 127 prep surface + a correction-turn capture test.
- **STATUS:** UNENFORCED

### FR-108 — Prep surface unreachable from chat (CODEX-MI-4 of 6)
- **FORBIDDEN:** A prep surface must never exist only at module level with no chat route; mock answer capture must never swallow a correction turn, and a word-boundary exclusion must never eject an answer into a job shortlist (the \bfind\b class).
- **FROM:** CODEX-MI-4 — Prep surface unreachable from chat (CODEX-MI-4 of 6).
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH ×6; FOR-CODEX, open). Enforcement should be: chat-route replays for each 127 prep surface + a correction-turn capture test.
- **STATUS:** UNENFORCED

### FR-109 — Prep surface unreachable from chat (CODEX-MI-5 of 6)
- **FORBIDDEN:** A prep surface must never exist only at module level with no chat route; mock answer capture must never swallow a correction turn, and a word-boundary exclusion must never eject an answer into a job shortlist (the \bfind\b class).
- **FROM:** CODEX-MI-5 — Prep surface unreachable from chat (CODEX-MI-5 of 6).
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH ×6; FOR-CODEX, open). Enforcement should be: chat-route replays for each 127 prep surface + a correction-turn capture test.
- **STATUS:** UNENFORCED

### FR-110 — Prep surface unreachable from chat (CODEX-MI-6 of 6)
- **FORBIDDEN:** A prep surface must never exist only at module level with no chat route; mock answer capture must never swallow a correction turn, and a word-boundary exclusion must never eject an answer into a job shortlist (the \bfind\b class).
- **FROM:** CODEX-MI-6 — Prep surface unreachable from chat (CODEX-MI-6 of 6).
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH ×6; FOR-CODEX, open). Enforcement should be: chat-route replays for each 127 prep surface + a correction-turn capture test.
- **STATUS:** UNENFORCED

### FR-111 — Late-material question surfaces as a raw code at submit
- **FORBIDDEN:** The user must never meet a raw LATE_MATERIAL_QUESTION code at submit; the late-material question is surfaced in plain words by the blocker state machine before submit.
- **FROM:** APD-1 (AP13) — Late-material question surfaces as a raw code at submit.
- **ENFORCEMENT:** tests/career-gauntlet-g2.test.cjs (blocker state machine; LATE_MATERIAL assertions).
- **STATUS:** ENFORCED

### FR-112 — State-residency restrictions on postings read by no module
- **FORBIDDEN:** A posting's state-residency restriction must never be ignored by every module; it is read and enforced. Residual: 142's scoringProfile strips residence, so through the router it surfaces as needs_user_input until 142 passes it through (FOR-CODEX).
- **FROM:** APD-2 (AP05) — State-residency restrictions on postings read by no module.
- **ENFORCEMENT:** tests/career-gauntlet-g5.test.cjs (APD-2 ×8).
- **STATUS:** ENFORCED

### FR-113 — Upload-ingest route absent (= U12)
- **FORBIDDEN:** An uploaded document must never have no ingest route; ingest failures are typed, never silent.
- **FROM:** APD-3 — Upload-ingest route absent (= U12).
- **ENFORCEMENT:** UNENFORCED — the engine half is guarded (tests/career-gauntlet-g5.test.cjs APD-3 ×6, typed ingest failures in 122), but the chat ingest route is still absent (Codex).
- **STATUS:** UNENFORCED

### FR-114 — No route owns a DOCX ask; honest alternative never delivered
- **FORBIDDEN:** A DOCX ask must never dead-end; the route delivers the document or the honest alternative.
- **FROM:** APD-4 — No route owns a DOCX ask; honest alternative never delivered.
- **ENFORCEMENT:** tests/career-render.test.cjs 25/25 + the 142 artifact passthrough (gauntlet C11 test); substantially resolved by the CA-02 build (module 148).
- **STATUS:** ENFORCED

### FR-115 — Employer AI-authorship bans unread by any module
- **FORBIDDEN:** An employer's AI-authorship ban must never go unread; ban flags travel with the application-prep data.
- **FROM:** APD-5 — Employer AI-authorship bans unread by any module.
- **ENFORCEMENT:** tests/career-gauntlet-g5.test.cjs (APD-5 ×4).
- **STATUS:** ENFORCED

### FR-116 — Approvals survive only via process-local context (no session-expiry seam)
- **FORBIDDEN:** Approvals must never depend silently on process-local context with no session-expiry seam; the durable-memory boundary is explicit, not accidental.
- **FROM:** APD-6 — Approvals survive only via process-local context (no session-expiry seam).
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH; open architecture item, Codex's durable-memory lane). Enforcement should be: a session-expiry test asserting approval state across a process boundary.
- **STATUS:** UNENFORCED

### FR-117 — Shortlist never surfaces recorded exclusion reasons
- **FORBIDDEN:** A shortlist must never hide a recorded exclusion reason from the user whose list it is.
- **FROM:** FC-AP-1 — Shortlist never surfaces recorded exclusion reasons.
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH; FOR-CODEX, open). Enforcement should be: a 142 shortlist replay asserting exclusion reasons surface.
- **STATUS:** UNENFORCED

### FR-118 — Recall reports found=true while the bubble says 'nothing solid'
- **FORBIDDEN:** A recall reply must never contradict its own typed state (found=true in the record, 'nothing solid' in the bubble), and sponsorship unknowns must be stated, not skipped.
- **FROM:** FC-AP-2 — Recall reports found=true while the bubble says 'nothing solid'.
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH; FOR-CODEX, open). Enforcement should be: a recall replay asserting bubble/record agreement + stated unknowns.
- **STATUS:** UNENFORCED

### FR-119 — Packet review names only one of two attachments
- **FORBIDDEN:** A packet review must never name only one of the two attachments the packet carries.
- **FROM:** FC-AP-3 — Packet review names only one of two attachments.
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH; FOR-CODEX, open). Enforcement should be: a packet-review replay asserting both attachments are named.
- **STATUS:** UNENFORCED

### FR-120 — Outreach candidate drops every judgment field before drafting
- **FORBIDDEN:** A candidate handed to drafting must never lose its judgment fields (relationship, title_stale, permission scope, channel verification); one defect here fails five surfaces at once.
- **FROM:** NWD-04 — Outreach candidate drops every judgment field before drafting.
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH; FOR-CODEX, open). IB-1's verified wiring contract (Register 7) carries these fields in recipientSpec — landing IB-1 to that contract closes the shape.
- **STATUS:** UNENFORCED

### FR-121 — Status handler reports a provider_accepted item as 'stopped'
- **FORBIDDEN:** A delivery status must never be reported from memory against the provider's record; a provider_accepted item is never 'stopped'.
- **FROM:** NWD-05 (NW20) — Status handler reports a provider_accepted item as 'stopped'.
- **ENFORCEMENT:** tests/career-gauntlet-g4.test.cjs (delivery status re-read).
- **STATUS:** ENFORCED

### FR-122 — §7 reply workflow unrouted except opt-out
- **FORBIDDEN:** Every §7 reply class (interested / not-now / OOO / bounce / suspicious) must never be unrouted while only opt-out works; each class has its route.
- **FROM:** NWD-06 — §7 reply workflow unrouted except opt-out.
- **ENFORCEMENT:** tests/career-gauntlet-g4.test.cjs processInboxEvent (engine built in G4; chat reachability rides the same routing program).
- **STATUS:** ENFORCED

### FR-123 — No guidance capability in the chat path (13 cases, one fallback)
- **FORBIDDEN:** Guidance asks must never all collapse into one identical fallback; the guidance module's intents are reachable from chat.
- **FROM:** CGD-1 — No guidance capability in the chat path (13 cases, one fallback).
- **ENFORCEMENT:** UNENFORCED — the engine is guarded (tests/career-gauntlet-g1.test.cjs, module 144 + guardReply), but its chat route (16 intents specified) is Codex's un-landed hookup.
- **STATUS:** UNENFORCED

### FR-124 — Guidance/discovery failure (FC-CG-1 of 5)
- **FORBIDDEN:** Guidance must never ignore a stated constraint (FC-CG4: remote-only), and a corrected fact (FC-CG2: graduation year) must never leave later shortlists byte-identical on the stale fact; corrections are recorded and propagated (FC-CG-1..5 classes).
- **FROM:** FC-CG-1 — Guidance/discovery failure (FC-CG-1 of 5).
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH ×5; FOR-CODEX, open). Enforcement should be: chat replays for constraint honoring + correction propagation.
- **STATUS:** UNENFORCED

### FR-125 — Guidance/discovery failure (FC-CG-2 of 5)
- **FORBIDDEN:** Guidance must never ignore a stated constraint (FC-CG4: remote-only), and a corrected fact (FC-CG2: graduation year) must never leave later shortlists byte-identical on the stale fact; corrections are recorded and propagated (FC-CG-1..5 classes).
- **FROM:** FC-CG-2 — Guidance/discovery failure (FC-CG-2 of 5).
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH ×5; FOR-CODEX, open). Enforcement should be: chat replays for constraint honoring + correction propagation.
- **STATUS:** UNENFORCED

### FR-126 — Guidance/discovery failure (FC-CG-3 of 5)
- **FORBIDDEN:** Guidance must never ignore a stated constraint (FC-CG4: remote-only), and a corrected fact (FC-CG2: graduation year) must never leave later shortlists byte-identical on the stale fact; corrections are recorded and propagated (FC-CG-1..5 classes).
- **FROM:** FC-CG-3 — Guidance/discovery failure (FC-CG-3 of 5).
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH ×5; FOR-CODEX, open). Enforcement should be: chat replays for constraint honoring + correction propagation.
- **STATUS:** UNENFORCED

### FR-127 — Guidance/discovery failure (FC-CG-4 of 5)
- **FORBIDDEN:** Guidance must never ignore a stated constraint (FC-CG4: remote-only), and a corrected fact (FC-CG2: graduation year) must never leave later shortlists byte-identical on the stale fact; corrections are recorded and propagated (FC-CG-1..5 classes).
- **FROM:** FC-CG-4 — Guidance/discovery failure (FC-CG-4 of 5).
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH ×5; FOR-CODEX, open). Enforcement should be: chat replays for constraint honoring + correction propagation.
- **STATUS:** UNENFORCED

### FR-128 — Guidance/discovery failure (FC-CG-5 of 5)
- **FORBIDDEN:** Guidance must never ignore a stated constraint (FC-CG4: remote-only), and a corrected fact (FC-CG2: graduation year) must never leave later shortlists byte-identical on the stale fact; corrections are recorded and propagated (FC-CG-1..5 classes).
- **FROM:** FC-CG-5 — Guidance/discovery failure (FC-CG-5 of 5).
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH ×5; FOR-CODEX, open). Enforcement should be: chat replays for constraint honoring + correction propagation.
- **STATUS:** UNENFORCED

## 4 · Bug ledger — Register 4: pilot-era defects

Source: `docs/bug-ledger.md` Register 4.

### FR-129 — No chat route from chat to the career domain modules
- **FORBIDDEN:** The chat must never lack a route to the career domain modules (the 13 NOT IMPLEMENTED state).
- **FROM:** R1 root — No chat route from chat to the career domain modules.
- **ENFORCEMENT:** tests/career-gauntlet-r1.test.cjs 9/9 (module 142 built).
- **STATUS:** ENFORCED

### FR-130 — Throws/nulls become silence (27 empty replies)
- **FORBIDDEN:** A handler throw or null must never become an empty reply; containment speaks, typed and honest.
- **FROM:** R2 root — Throws/nulls become silence (27 empty replies).
- **ENFORCEMENT:** tests/career-gauntlet-r2.test.cjs + r2a + r2b suites (module 143 wrapper).
- **STATUS:** ENFORCED

### FR-131 — No write/action seams through chat
- **FORBIDDEN:** Profile writes, doorstep actions, and queue control must never be unreachable through chat.
- **FROM:** R3 root — No write/action seams through chat.
- **ENFORCEMENT:** tests/career-gauntlet-r3.test.cjs 7/7 (module 141 + the 130 write path).
- **STATUS:** ENFORCED

### FR-132 — Grading verdicts written as literal constants
- **FORBIDDEN:** A grader must never print verdicts it did not compute; printed verdicts must be able to change on a re-run. (Ancestor of the grader-v2 false-PASS fix, Register 6.)
- **FROM:** Pilot runner — Grading verdicts written as literal constants.
- **ENFORCEMENT:** tests/career-gauntlet-rerun.test.cjs (computed grading) + the grader-v2 mutation lineage.
- **STATUS:** ENFORCED

### FR-133 — Reply instructs LinkedIn sign-in; locked path is the data EXPORT
- **FORBIDDEN:** A reply must never instruct LinkedIn sign-in; the locked path is the user's own LinkedIn data export.
- **FROM:** SC-287 R-B11 (S0) — Reply instructs LinkedIn sign-in; locked path is the data EXPORT.
- **ENFORCEMENT:** tests/career-router-wedge.test.cjs 'A4 SC-287…' + tests/career-quality-contracts.test.cjs SC-287 replay.
- **STATUS:** ENFORCED

### FR-134 — 'Send my resume from my Gmail' creates a contact named 'my'
- **FORBIDDEN:** Recipient-name parsing must never harvest a function word ('my') as a contact name.
- **FROM:** Router name parsing — 'Send my resume from my Gmail' creates a contact named 'my'.
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH; recorded at Stage 3 and again as a U12 leg). Enforcement should be: a router parsing test over possessive phrasings.
- **STATUS:** UNENFORCED

### FR-135 — Forms-fixture 'P1' is a different person than profile 'P1'
- **FORBIDDEN:** Two fixtures must never bind the same persona id to different people (Casey Nguyen vs Maya Rivera).
- **FROM:** Fixture inconsistency — Forms-fixture 'P1' is a different person than profile 'P1'.
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH; fixture data defect, mitigated by design because seam fills trace to the profile in context). Enforcement should be: a fixture-consistency test asserting one person per persona id.
- **STATUS:** UNENFORCED

### FR-136 — Shortlist carries no source/board attribution
- **FORBIDDEN:** A shortlist item must never appear without its source/board attribution.
- **FROM:** U02 — Shortlist carries no source/board attribution.
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH; carried forward at Stage 4 as a 'small surface fix' with no landing). Enforcement should be: a shortlist replay asserting attribution on every item.
- **STATUS:** UNENFORCED

## 5 · Bug ledger — Register 5: Lane A census classes + briefs A1–A6

Source: `docs/bug-ledger.md` Register 5. The gauntlet-ledger twins of these briefs are in §18.

### FR-137 — Contained turn owned by no intent (227 scenarios)
- **FORBIDDEN:** A contained turn must never be left ownerless — answered by containment with no handler owning the intent.
- **FROM:** A1 — Contained turn owned by no intent (227 scenarios).
- **ENFORCEMENT:** GUARD: tests/career-quality-routing.test.cjs + the routing-expectations set + the fresh-300 routing axis (266/300 correct-tool, didn't-catch 0) — root fixed in the routing fix (acd9b39). Twin of the gauntlet A1 rule in the last section.
- **STATUS:** ENFORCED

### FR-138 — Fallback-intent class (39 scenarios)
- **FORBIDDEN:** A turn must never be answered with the containment text via career_fallback when a real handler owns it.
- **FROM:** A2 — Fallback-intent class (39 scenarios).
- **ENFORCEMENT:** GUARD: tests/career-quality-routing.test.cjs + the routing-expectations set + the fresh-300 routing axis (266/300 correct-tool, didn't-catch 0) — fixed in the routing fix. Twin of the gauntlet A2 rule.
- **STATUS:** ENFORCED

### FR-139 — '/find/' catch-all routes people/guidance/apply asks into job discovery (24 scenarios)
- **FORBIDDEN:** A catch-all must never route people, guidance, or apply asks into job discovery.
- **FROM:** A3 (= GG-1) — '/find/' catch-all routes people/guidance/apply asks into job discovery (24 scenarios).
- **ENFORCEMENT:** tests/career-router-wedge.test.cjs + tests/career-gauntlet-regressions.test.cjs ACID tests. Twin of the gauntlet A3 rule.
- **STATUS:** ENFORCED

### FR-140 — Return-offer playbook answered with internship discovery
- **FORBIDDEN:** A return-offer playbook ask must never be answered with internship discovery.
- **FROM:** A4 single: SC-277 — Return-offer playbook answered with internship discovery.
- **ENFORCEMENT:** tests/career-router-wedge.test.cjs 'A4 SC-277…' + tests/career-quality-contracts.test.cjs SC-277. Part of the gauntlet A4 rule.
- **STATUS:** ENFORCED

### FR-141 — Tailor ask stops at tailor_needs_posting instead of chaining
- **FORBIDDEN:** A tailor-for-a-role ask must never dead-end at 'needs a posting'; it chains discovery → tailor.
- **FROM:** A4 single: SC-062 — Tailor ask stops at tailor_needs_posting instead of chaining.
- **ENFORCEMENT:** tests/career-router-wedge.test.cjs 'A4 SC-062…'. Part of the gauntlet A4 rule.
- **STATUS:** ENFORCED

### FR-142 — Design-packet ask served a backend resume packet (also the false-PASS artifact)
- **FORBIDDEN:** An ask must never be served an artifact of the wrong kind (a backend resume packet for a design ask), and a grader must never PASS it for merely existing.
- **FROM:** A4 single: SC-111 — Design-packet ask served a backend resume packet (also the false-PASS artifact).
- **ENFORCEMENT:** tests/career-router-wedge.test.cjs 'A4 SC-111…' + grader ARTIFACT_MATCH with mutant M-16 in tests/career-quality-grader.test.cjs. Part of the gauntlet A4 rule.
- **STATUS:** ENFORCED

### FR-143 — Module 120 returns no typed result / no doorstep payload for connect_google
- **FORBIDDEN:** connect_google must never return a null/ untyped result; it returns a typed result with a doorstep payload. (Full completion stays owner-gated: deploy + Google connect.)
- **FROM:** A5: SC-286 — Module 120 returns no typed result / no doorstep payload for connect_google.
- **ENFORCEMENT:** tests/career-router-wedge.test.cjs 'A5 SC-286…' + tests/career-quality-contracts.test.cjs SC-286.
- **STATUS:** ENFORCED

### FR-144 — Canned SWE fixture roles served for a PM ask (no family filter)
- **FORBIDDEN:** Discovery must never serve canned roles from the wrong family for a family ask; an SWE-only pool answers a PM ask with an honest empty.
- **FROM:** A6: SC-065 engine leg — Canned SWE fixture roles served for a PM ask (no family filter).
- **ENFORCEMENT:** tests/career-jobs-domain.test.cjs 8/8 ('PM ask over an SWE-only pool: honest empty…'). The 142 chaining leg has no dedicated replay — see IB-AP-9 (Register 7). Twin of the gauntlet A6 rule.
- **STATUS:** ENFORCED

## 6 · Bug ledger — Register 6: 2026-10-13 gate/lane defects + the SEND-DISABLED shutdown

Source: `docs/bug-ledger.md` Register 6, including its closing note on the SEND-DISABLED shutdown (the one HARD-SHUT rule).

### FR-145 — Zero-result poll marks every known job closed (mass-close hazard)
- **FORBIDDEN:** A zero-result or collapsed poll must never mark every known job closed.
- **FROM:** Spec 2 §2.3 — Zero-result poll marks every known job closed (mass-close hazard).
- **ENFORCEMENT:** tests/career-spec-gates.test.cjs mass-close ×2 (the gate is the replay; fail-before recorded).
- **STATUS:** ENFORCED

### FR-146 — Resume truth audit passes an employer/title swap
- **FORBIDDEN:** The truth audit must never pass a resume line whose employer or title was swapped.
- **FROM:** Spec 3 H3 — Resume truth audit passes an employer/title swap.
- **ENFORCEMENT:** tests/career-spec-gates.test.cjs H3 (named-entity rule).
- **STATUS:** ENFORCED

### FR-147 — Silent verification upgrade escapes the risky cap
- **FORBIDDEN:** An unknown/accept_all/stale/generic/disposable verification string must never pass through as an ordinary sendable; verification normalizes fail-closed under the 10% risky cap. SAFETY (send integrity).
- **FROM:** 124 verification — Silent verification upgrade escapes the risky cap.
- **ENFORCEMENT:** tests/career-spec1-gates.test.cjs (#6/#7/#8 legs; normVerification, fail-closed).
- **STATUS:** ENFORCED

### FR-148 — Negation-blind status parsing ('UNVERIFIED' → verified)
- **FORBIDDEN:** Status parsing must never drop a negation: 'UNVERIFIED', 'not verified', and 'not published' must never normalize to verified/published. SAFETY (silent upgrade at intake).
- **FROM:** 146 negation — Negation-blind status parsing ('UNVERIFIED' → verified).
- **ENFORCEMENT:** tests/career-spec1-gates.test.cjs (146 negation).
- **STATUS:** ENFORCED

### FR-149 — Intake silently drops the Relationship column
- **FORBIDDEN:** Intake must never discard the Relationship column; alumni/prior-relationship bridges must survive intake.
- **FROM:** 146 relationship — Intake silently drops the Relationship column.
- **ENFORCEMENT:** tests/career-spec1-gates.test.cjs (146 relationship).
- **STATUS:** ENFORCED

### FR-150 — Intake discards Currency columns and certifies stale people current
- **FORBIDDEN:** Intake must never discard a pasted Currency column and then certify staleness-flagged people as current/ready.
- **FROM:** 146 currency — Intake discards Currency columns and certifies stale people current.
- **ENFORCEMENT:** tests/career-intake-real-data.test.cjs 6/6 (4/6 red pre-fix).
- **STATUS:** ENFORCED

### FR-151 — Intake stores INFERRED-HELD addresses as bare emails
- **FORBIDDEN:** An INFERRED-HELD email-status label must never be dropped at intake, leaving the address stored as a bare (apparently verified) email.
- **FROM:** 146 email status — Intake stores INFERRED-HELD addresses as bare emails.
- **ENFORCEMENT:** tests/career-intake-real-data.test.cjs (31/31 labels preserved post-fix).
- **STATUS:** ENFORCED

### FR-152 — Parse-check misses MM/YYYY dates; refusal return has no rendered field; parsers disagree on punctuation spacing
- **FORBIDDEN:** Parse-check must never miss an MM/YYYY date, an audit-refusal return must never lack its rendered field, and parser agreement must never hinge on poppler punctuation spacing.
- **FROM:** Render trio (Lane B) — Parse-check misses MM/YYYY dates; refusal return has no rendered field; parsers disagree on punctuation spacing.
- **ENFORCEMENT:** tests/career-render.test.cjs 25/25 (the R7 test is the date replay).
- **STATUS:** ENFORCED

### FR-153 — Secret scan cannot tell a planted fixture JWT from a real secret
- **FORBIDDEN:** The secret scan must never be weakened by allowlisting to accommodate fixtures; fixtures are re-encoded, and a real-shaped JWT is still caught.
- **FROM:** Secret scan — Secret scan cannot tell a planted fixture JWT from a real secret.
- **ENFORCEMENT:** tests/no-secrets.test.cjs control test (runtime-assembled real-shaped JWT still caught; full tracked-file scan 0 findings).
- **STATUS:** ENFORCED

### FR-154 — Draft defects: placeholder content reaches approval; generic facts reach Tier A; departed contacts drafted; relative dates; one shared skeleton
- **FORBIDDEN:** A draft must never reach approval carrying placeholders (brackets / 'BLURB' / fact IDs / '(TEST)'), a subject over 60 chars, a generic fact dressed as Tier A, a departed recipient, a relative-date phrase, or the same skeleton as every other draft.
- **FROM:** W3 draft set — Draft defects: placeholder content reaches approval; generic facts reach Tier A; departed contacts drafted; relative dates; one shared skeleton.
- **ENFORCEMENT:** tests/career-outreach.test.cjs replay tests + the QA gate itself (placeholder_content HARD BLOCK, fact_body_mismatch, recipient_departed, relative_date_phrase).
- **STATUS:** ENFORCED

### FR-155 — Grader false PASS: SC-111 passes on a packet-exists check
- **FORBIDDEN:** A grader must never PASS a scenario on mere artifact existence when the artifact is the wrong kind; ARTIFACT_MATCH is required. (The defect that invalidated the first baseline.)
- **FROM:** Grader-v1 — Grader false PASS: SC-111 passes on a packet-exists check.
- **ENFORCEMENT:** tests/career-quality-grader.test.cjs + mutants M-16 (SC-111-shaped) / M-17 (HONEST_YIELD) in the mutation suite; corrected baseline 0/300 published.
- **STATUS:** ENFORCED

### FR-156 — Kill switch is a no-op: haltQueue halts nothing, no global pause flag
- **FORBIDDEN:** The kill switch must never be a no-op; a halt sets a global pause that every path honors. SAFETY.
- **FROM:** SC-300 / R-A4 — Kill switch is a no-op: haltQueue halts nothing, no global pause flag.
- **ENFORCEMENT:** tests/career-killswitch-ra4.test.cjs (R-A4 legs). Ledger note: the suite ran 5/6 at audit time — the red leg is the pre-existing 'still sends' sanity test re-pointed by the SEND_DISABLED ruling (test debt, Register 7 note), not this guard.
- **STATUS:** ENFORCED

### FR-157 — emitTrackingLog rejects real 126 work products
- **FORBIDDEN:** The tracking emitter must never reject real work products (thank-you/nudge drafts, verdicts, analytics, status summaries, {application,event} shapes).
- **FROM:** Track T-141 — emitTrackingLog rejects real 126 work products.
- **ENFORCEMENT:** tests/career-track-negotiation-fix.test.cjs FIX-T1…T6.
- **STATUS:** ENFORCED

### FR-158 — Marketing-noise rules swallow real signals; digest leaks codes and duplicates
- **FORBIDDEN:** A classifier must never let an 'unsubscribe' footer or '%' line swallow a real offer/rejection/interview signal; a digest must never leak raw kind codes or duplicate an item, and recruiter_other signals must never be dropped.
- **FROM:** Track T-126 — Marketing-noise rules swallow real signals; digest leaks codes and duplicates.
- **ENFORCEMENT:** tests/career-track-negotiation-fix.test.cjs FIX-T8 / FIX-T10 / FIX-T11 (+ FIX-T9 class). The digest half is a sibling of FIN-E-003/013, counted once there.
- **STATUS:** ENFORCED

### FR-159 — parseOffer reads '$128k' as $128; benchmark speaks 'undefined'
- **FORBIDDEN:** An offer parser must never read '$128k' as $128 or miss a bare 'Salary:' line or expiry phrasings; a benchmark must always carry its text (never 'undefined') and must never label reported figures as measured.
- **FROM:** Track T-128 — parseOffer reads '$128k' as $128; benchmark speaks 'undefined'.
- **ENFORCEMENT:** tests/career-track-negotiation-fix.test.cjs (17 tests, 15 red before).
- **STATUS:** ENFORCED

### FR-160 — Departed people returned as LIVE warm paths; addresses in a stray field
- **FORBIDDEN:** A departed person must never be returned as a live warm path, and an address must never land in a stray field (work_email: null).
- **FROM:** Outreach O-146 — Departed people returned as LIVE warm paths; addresses in a stray field.
- **ENFORCEMENT:** tests/career-outreach-referrals-wave.test.cjs 'D2 replay: intake records are graph-ready…'. Ledger caveat: the wave left its files uncommitted at close — commit state to confirm.
- **STATUS:** ENFORCED

### FR-161 — normalizeCandidate drops the email/sources dialect; drafts addressed to NULL
- **FORBIDDEN:** A doorstep draft must never come out addressed to NULL because candidate normalization dropped the email/sources dialect.
- **FROM:** Outreach O-124a — normalizeCandidate drops the email/sources dialect; drafts addressed to NULL.
- **ENFORCEMENT:** tests/career-outreach-referrals-wave.test.cjs 'D1 replay…' + 'D1 contract: 141 emitOutreachDraft…'. Same commit caveat as FR-160.
- **STATUS:** ENFORCED

### FR-162 — parseTarget has no designer role / no 'LA'; school filter exact-matches; refusal lacks the alternative shape; relative dates unflagged
- **FORBIDDEN:** Target parsing must never silently inherit the IB default for a designer/'LA' ask, a school filter must never exact-match away every same-school candidate, a refusal must carry the required alternative shape, and supplied relative dates must never echo unflagged.
- **FROM:** Outreach O-124b — parseTarget has no designer role / no 'LA'; school filter exact-matches; refusal lacks the alternative shape; relative dates unflagged.
- **ENFORCEMENT:** tests/career-outreach-referrals-wave.test.cjs (SC-019 replay + 8/8). Same commit caveat as FR-160.
- **STATUS:** ENFORCED

### FR-163 — Career OAuth grant still requests gmail.send
- **FORBIDDEN:** The career grant must never keep requesting gmail.send while email is drafts-only; it is the one remaining grant by which a future sender could transmit. SAFETY.
- **FROM:** OAuth scope — Career OAuth grant still requests gmail.send.
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH). Not a transmission path today (the sink is disabled, FR-165), but scope removal needs owner approval because it changes the connect surface. Also ledgered as BUG-2026-10-14-GMAIL-SCOPE (FR-202).
- **STATUS:** UNENFORCED

### FR-164 — Connect copy claims 'read and send from your own Gmail'
- **FORBIDDEN:** Career connect copy must never claim sending is possible under the drafts-only ruling.
- **FROM:** 120 connect copy — Connect copy claims 'read and send from your own Gmail'.
- **ENFORCEMENT:** UNENFORCED — no guard found (MISSING BOTH; the string lives in module 120, briefed as a 142 copy item). Enforcement should be: a copy test asserting no send claim in career connect text.
- **STATUS:** UNENFORCED

### FR-165 — The product sends email
- **FORBIDDEN:** Upmore's career build must never send email — not 'unused', disabled at the sink: module 124's transmission path refuses with a typed SEND_DISABLED, and every draft stops at the doorstep for the owner's own action. This is the model every UNENFORCED safety item in this register should end in.
- **FROM:** SEND-DISABLED (owner ruling 2026-10-13 ~19:45) — The product sends email.
- **ENFORCEMENT:** HARD-SHUT at the sink in module 124 (commit 3d0ecd1) + tests/career-send-disabled.test.cjs (8 tests asserting the SEND_DISABLED refusal and zero transport calls; fail-first proven against the pre-fix 124). Status HARD-SHUT, not merely ENFORCED.
- **STATUS:** HARD-SHUT

## 7 · Bug ledger — Register 7: integrator briefs (IB-TN / IB-1..3 / IB-AP)

Source: `docs/bug-ledger.md` Register 7. All 24 rows are MISSING BOTH under the bug law — even the 8 whose fix landed — because no dedicated replay test exists yet; they are therefore UNENFORCED until a fix lane adds one.

### FR-166 — H-7 S0: 'Applications you sent yourself…' with no send event
- **FORBIDDEN:** A reply must never claim a sending that has no send event behind it.
- **FROM:** IB-TN-2 — H-7 S0: 'Applications you sent yourself…' with no send event.
- **ENFORCEMENT:** fix landed (Wave A scrub, 32c86ce; Track re-grade confirms the S0 no longer fires). UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-167 — SC-137 withdrawal claimed with no withdrawal state event
- **FORBIDDEN:** A withdrawal must never be claimed without a withdrawal state event.
- **FROM:** IB-TN-3 — SC-137 withdrawal claimed with no withdrawal state event.
- **ENFORCEMENT:** fix landed (245a6e1, claim de-claimed). UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-168 — SC-132/133 funnel refusal without the alternative shape
- **FORBIDDEN:** A refusal must never ship without the alternative shape (what I will do instead).
- **FROM:** IB-TN-4 — SC-132/133 funnel refusal without the alternative shape.
- **ENFORCEMENT:** fix landed (245a6e1, alternative in the headline). UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-169 — H-12 endings missing on SC-129/130/131
- **FORBIDDEN:** A reply must never end bare where a next step is owed (H-12).
- **FROM:** IB-TN-5 — H-12 endings missing on SC-129/130/131.
- **ENFORCEMENT:** fix landed (245a6e1 + the Wave B router-boundary H-12 guarantee). UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-170 — SC-209 roleplay ask misrouted to mock prep; roleplayTurn never invoked
- **FORBIDDEN:** A roleplay ask must never be routed to mock prep while 128.roleplayTurn exists uninvoked.
- **FROM:** IB-TN-9 — SC-209 roleplay ask misrouted to mock prep; roleplayTurn never invoked.
- **ENFORCEMENT:** fix landed (SC-209 verified PASS on fresh records at 245a6e1). UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-171 — Named-company tailor cannot resolve postings outside 142's pool path
- **FORBIDDEN:** A tailor ask naming a company whose postings exist in fixtures must never fail to resolve them because they sit outside the pool path 142 reads.
- **FROM:** IB-AP-3 — Named-company tailor cannot resolve postings outside 142's pool path.
- **ENFORCEMENT:** fix landed (ce2529b; SC-093 PASS fresh, SC-087/090/092 honest board answers). UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-172 — H-12 reply endings — 23 of 49 Apply fails
- **FORBIDDEN:** Apply replies must never end bare where a next step is owed (H-12).
- **FROM:** IB-AP-6 — H-12 reply endings — 23 of 49 Apply fails.
- **ENFORCEMENT:** fix landed (245a6e1, H-12 ending guarantee at the router boundary). UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-173 — H-7 claim-verb copy on SC-078/SC-080
- **FORBIDDEN:** Copy must never use bare claim verbs (autopilot/cooldown claims) the state does not cover.
- **FROM:** IB-AP-7 — H-7 claim-verb copy on SC-078/SC-080.
- **ENFORCEMENT:** fix landed (ce2529b; SC-078/080 H-7 clear). UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-174 — 142 never calls emitTrackingLog (root wiring, 40 scenarios)
- **FORBIDDEN:** Track/negotiation turns must never produce work with no doorstep payload because 142 never calls the generalized 141.emitTrackingLog.
- **FROM:** IB-TN-1 — 142 never calls emitTrackingLog (root wiring, 40 scenarios).
- **ENFORCEMENT:** UNENFORCED — fix still owed. UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-175 — SC-142 comp-expectation ask misrouted to the outreach plan
- **FORBIDDEN:** A comp-expectation ask must never be answered with the outreach plan; SC-208's twin reply also lacks the as-of token (R-C5).
- **FROM:** IB-TN-6 — SC-142 comp-expectation ask misrouted to the outreach plan.
- **ENFORCEMENT:** UNENFORCED — fix still owed. UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-176 — SC-143 calendar proposals carry no doorstep payload
- **FORBIDDEN:** A calendar proposal must never ship without its doorstep payload when 141.emitCalendarProposal exists.
- **FROM:** IB-TN-7 — SC-143 calendar proposals carry no doorstep payload.
- **ENFORCEMENT:** UNENFORCED — fix still owed. UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-177 — handleNegotiation falls back on unplumbed ctx; hard-coded 'as of October 2026'
- **FORBIDDEN:** Negotiation must never speak a hard-coded as-of date instead of 128's CIR-specific sentence, and its fallback must never fire because ctx.offerText/ctx.cir were never plumbed.
- **FROM:** IB-TN-8 — handleNegotiation falls back on unplumbed ctx; hard-coded 'as of October 2026'.
- **ENFORCEMENT:** UNENFORCED — fix still owed. UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-178 — 141 record completes yet A4 still fails (grader-side candidate)
- **FORBIDDEN:** A completed doorstep record must never fail completion on a mapping nobody examined; completion eligibility for tracking_log turns is decided explicitly. Companion to IB-TN-1.
- **FROM:** SC-129 A4 nuance — 141 record completes yet A4 still fails (grader-side candidate).
- **ENFORCEMENT:** UNENFORCED — grader-side defect candidate, unexamined. UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-179 — 142 never calls emitOutreachDraft (binding constraint, 81 scenarios)
- **FORBIDDEN:** Outreach handlers must never return outreach_clarification with draft: null while 141.emitOutreachDraft exists uncalled; the cap_per_day 30-vs-12 labeling must agree.
- **FROM:** IB-1 — 142 never calls emitOutreachDraft (binding constraint, 81 scenarios).
- **ENFORCEMENT:** UNENFORCED — fix still owed (the Outreach+Referrals binding constraint). UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-180 — handleIntake never writes 146's records where graph intents read
- **FORBIDDEN:** Intake must never run 146 and then leave the referral graph reading an empty store.
- **FROM:** IB-2 — handleIntake never writes 146's records where graph intents read.
- **ENFORCEMENT:** UNENFORCED — fix still owed at the ledger's writing; the integrator-wave GRAPH-SHAPE fix (FR-192) is the adjacent shape fix, not this store write. UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-181 — 142 copy/routing set: OOO matcher fires before OOO dispatch; yield regex drops thousands separators; miniCampaign never called; company parsed as 'one'
- **FORBIDDEN:** An out-of-office ask must never get a calendar reply because a bare reschedul\w* matcher fired first; a quoted yield must never lose its thousands separator ('1,140 found' → '140 found'); a named company must never parse as 'one'; Graph.miniCampaign must be called where the ask names it (SC-038/049/170/025/050/044/146/156/175/151/168/040 classes).
- **FROM:** IB-3 — 142 copy/routing set: OOO matcher fires before OOO dispatch; yield regex drops thousands separators; miniCampaign never called; company parsed as 'one'.
- **ENFORCEMENT:** UNENFORCED — fix still owed. UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-182 — Apply intent produces no doorstep payload (blocks all 49 Apply fails)
- **FORBIDDEN:** An Apply intent must never end at intent while the 132/133/149 producers exist undriven from its branches.
- **FROM:** IB-AP-1 — Apply intent produces no doorstep payload (blocks all 49 Apply fails).
- **ENFORCEMENT:** UNENFORCED — fix still owed (the doorstep seam). UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-183 — 142 never calls 132's typed-state producers or 149's portal rules
- **FORBIDDEN:** Apply must never bypass the typed-state producers and portal rules (attestation, EEO default) that already pass at engine tier (118/118).
- **FROM:** IB-AP-2 — 142 never calls 132's typed-state producers or 149's portal rules.
- **ENFORCEMENT:** UNENFORCED — fix still owed. UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-184 — Packet asks answered with canned 'packet rules' text
- **FORBIDDEN:** A packet ask must never be answered with identical canned rules text while 133 produces the real packet doorstep record.
- **FROM:** IB-AP-4 — Packet asks answered with canned 'packet rules' text.
- **ENFORCEMENT:** UNENFORCED — fix still owed. UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-185 — Generic five-role SWE shortlist served for application-artifact asks
- **FORBIDDEN:** An application-artifact ask must never be served a generic five-role SWE shortlist (H-2+H-4, 11 scenarios). Partially addressed by Wave B; the class is not closed.
- **FROM:** IB-AP-5 — Generic five-role SWE shortlist served for application-artifact asks.
- **ENFORCEMENT:** UNENFORCED — fix still owed. UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-186 — Named singles: autopsy exists but reply pleads no data; Workday account ask gets the outreach plan; empty-graph paths; CIR intel answered while the log holds real status
- **FORBIDDEN:** A reply must never plead insufficient data where its producer holds the answer (SC-116), answer a Workday account-creation ask with the outreach plan verbatim (SC-081), draw graph paths from an empty graph (SC-100), give generic guidance for path_plan (SC-112), or answer CIR intel while the log+inbox producer holds real status (SC-115); SC-085 answer-bank H-5.
- **FROM:** IB-AP-8 — Named singles: autopsy exists but reply pleads no data; Workday account ask gets the outreach plan; empty-graph paths; CIR intel answered while the log holds real status.
- **ENFORCEMENT:** UNENFORCED — fix still owed. UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-187 — SC-065 blocked by a served-pool data gap; SC-113 gets finance honest-empty instead of the refusal + path product
- **FORBIDDEN:** A family ask must never be silently blocked by a served pool with zero postings of that family, and a refusal-class ask must never receive the finance honest-empty instead of the refusal + path product.
- **FROM:** IB-AP-9 — SC-065 blocked by a served-pool data gap; SC-113 gets finance honest-empty instead of the refusal + path product.
- **ENFORCEMENT:** UNENFORCED — fix still owed at the ledger's writing; the integrator-wave POOL-DATA fix (FR-198) addresses the PM-postings half for opt-in scenarios. UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-188 — SC-082: captcha_handoff words correct, no doorstep payload (120/141 seam)
- **FORBIDDEN:** A captcha handoff must never be words-only where 149's CAPTCHA_HANDOFF machinery is proven at engine tier; the 120/141 seam carries the payload.
- **FROM:** IB-AP-10 — SC-082: captcha_handoff words correct, no doorstep payload (120/141 seam).
- **ENFORCEMENT:** UNENFORCED — fix still owed (gray zone in the brief: report only, not forced). UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

### FR-189 — H-7 checker flags a QUOTED job title ('Applied Science Intern') as a claim
- **FORBIDDEN:** A claim checker must never flag a quoted job title as the product's own claim. Grader-precision defect — explicitly not to be copy-gamed.
- **FROM:** H-7 checker FP — H-7 checker flags a QUOTED job title ('Applied Science Intern') as a claim.
- **ENFORCEMENT:** UNENFORCED — checker-side fix + replay owed. UNENFORCED — the ledger's Register 7 states no dedicated replay test exists yet for any Register 7 row; the guard will be the fresh scenario record plus a replay added when the fix lands. 
- **STATUS:** UNENFORCED

## 8 · Bug ledger — Register 8: data defects

Source: `docs/bug-ledger.md` Register 8.

### FR-190 — Real-people research headline undercounts its own staleness flags (17 claimed, 19 carried)
- **FORBIDDEN:** A research file's headline count must never undercount the flags its own records carry; per-record flags are the truth.
- **FROM:** Data: research headline — Real-people research headline undercounts its own staleness flags (17 claimed, 19 carried).
- **ENFORCEMENT:** tests/career-intake-real-data.test.cjs ground-truth assertions (per-record flags treated as truth).
- **STATUS:** ENFORCED

### FR-191 — Banker list v1 states stale/inferred titles as current fact
- **FORBIDDEN:** A people list must never state a stale title as current (Braksiek), an inferred rank as a title (Marshall), or a confirmed departure as 'possibly stale' (Garrett, registration ended 07/2026).
- **FROM:** Data: banker list v1 — Banker list v1 states stale/inferred titles as current fact.
- **ENFORCEMENT:** UNENFORCED — no automated guard; the guard is the FINRA re-verification process itself, and the v2 file is the corrected record (LEDGER-ONLY in the audit). Enforcement should be: a re-verification pass whose output is checked before any list version is used.
- **STATUS:** UNENFORCED

## 9 · Bug ledger — integrator wave 2026-10-14

Source: `docs/bug-ledger.md`, 'Integrator wave 2026-10-14' table.

### FR-192 — Graph handlers read a nested row shape 135 never produced
- **FORBIDDEN:** Graph handlers must never read p.person.* against 135's flat rows (p.name/p.firm/p.why); a non-empty graph result must never throw into the empty-graph reply.
- **FROM:** BUG-2026-10-14-GRAPH-SHAPE — Graph handlers read a nested row shape 135 never produced.
- **ENFORCEMENT:** tests/career-ib-outreach-integration.test.cjs IB-2 test.
- **STATUS:** ENFORCED

### FR-193 — Canned SWE shortlist served to everything (295/300 routing fails)
- **FORBIDDEN:** A catch-all discovery route must never serve a canned SWE shortlist to every ask; contained turns are owned by real intents. Twin class of Register 5 (FR-154..161).
- **FROM:** BUG-2026-10-14-ROUTING-COLLAPSE — Canned SWE shortlist served to everything (295/300 routing fails).
- **ENFORCEMENT:** tests/career-router-wedge.test.cjs (canonical 30/30, paraphrases 120/120); routing fix acd9b39 + Waves A/B + IB landings.
- **STATUS:** ENFORCED

### FR-194 — H-12 guarantee tests the whole reply; 120/130/141 replies outside the guarantee
- **FORBIDDEN:** The next-step guarantee must never test the whole reply instead of its last sentence, and must never exist only inside one module; it applies at the delivery seam to every module's replies. Twin of the composer §1a/§1b rules (last section).
- **FROM:** BUG-2026-10-14-H12-LAST-SENTENCE — H-12 guarantee tests the whole reply; 120/130/141 replies outside the guarantee.
- **ENFORCEMENT:** tests/career-router-wedge.test.cjs + final-run H-12 counts; pilot-lib chatTurn applies the guarantee to 120/130/141 results (fallback/honest_unavailable exclusions preserved).
- **STATUS:** ENFORCED

### FR-195 — Halt reply claims 'already sent' on bookkeeping alone (H-7 S0)
- **FORBIDDEN:** A halt reply must never use a claim verb for queue bookkeeping ('already sent' at count 0 included); it states the facts ('already out' / 'Nothing went out…').
- **FROM:** BUG-2026-10-14-HALT-CLAIM — Halt reply claims 'already sent' on bookkeeping alone (H-7 S0).
- **ENFORCEMENT:** tests/career-ibtn-integration.test.cjs guards + the composer-table re-measurement.
- **STATUS:** ENFORCED

### FR-196 — 'I sent the submission once' — an email-class claim for a submit event
- **FORBIDDEN:** A timeout reply must never say 'I sent' for a submission; it says 'I submitted the form once…' with receipt-state wording.
- **FROM:** BUG-2026-10-14-SUBMIT-CLAIM — 'I sent the submission once' — an email-class claim for a submit event.
- **ENFORCEMENT:** Composer-table re-measurement (rows 21/22 same class) — a measurement record, not a test file: UNENFORCED as a permanent test. Enforcement should be: a doorstep-timeout replay in tests/career-portal-apply.test.cjs asserting the submitted-form wording.
- **STATUS:** UNENFORCED

### FR-197 — Kill-switch reply claims more than the mechanism proves (SC-300)
- **FORBIDDEN:** A kill-switch reply must never assert an absolute ('no outreach can start or continue from any queue') stronger than the scoped state behind it; it says 'blocks every send path this product controls'.
- **FROM:** BUG-2026-10-14-TOTAL-STOP-CLAIM — Kill-switch reply claims more than the mechanism proves (SC-300).
- **ENFORCEMENT:** UNENFORCED as a test — the guard of record is the reply-judge re-pass on changed replies, not a test file. Enforcement should be: a kill-switch reply test asserting the scoped wording.
- **STATUS:** UNENFORCED

### FR-198 — Zero PM postings in the fixture corpus; family asks pad or answer empty
- **FORBIDDEN:** The served pool must never silently contain zero postings for a family the scenarios ask about; the extension corpus is labeled (fictional + ground truth) and merged only for opt-in scenarios, with the pinned corpus untouched.
- **FROM:** BUG-2026-10-14-POOL-DATA — Zero PM postings in the fixture corpus; family asks pad or answer empty.
- **ENFORCEMENT:** tests/career-pool-coverage.test.cjs (merged pool ≥2 PM + ≥2 Data/ML; pinned corpus still 0 PM).
- **STATUS:** ENFORCED

### FR-199 — Company-less canonical asks vs 141's company-required log write (spec conflict)
- **FORBIDDEN:** A company must never be fabricated to satisfy a log write, and 141's typed missing_company refusal must never be edited away; the five company-less canonical asks stay red until the TN lane rules (asks gain companies, or tests accept the blocked shape).
- **FROM:** BUG-2026-10-14-TN1A-CONFLICT — Company-less canonical asks vs 141's company-required log write (spec conflict).
- **ENFORCEMENT:** GUARDED-RED — tests/career-ibtn-integration.test.cjs: 5 tests red by design as the standing record, pending the TN lane's ruling.
- **STATUS:** GUARDED-RED

### FR-200 — Cross-turn suppression persistence has no fix and no guard (standing safety gap)
- **FORBIDDEN:** A suppression recorded in one session must never be assumed durable across sessions when no durable store exists; the gap is named, never papered over. Twin of FR-089 (DD-11). Within tonight's build the exposure is bounded: G4 drafting reads suppression within the turn and FR-165 hard-shuts sending.
- **FROM:** BUG-2026-10-14-DD11-PERSIST — Cross-turn suppression persistence has no fix and no guard (standing safety gap).
- **ENFORCEMENT:** UNENFORCED — standing safety gap; the documented-behavior note lives in tests/career-send-disabled.test.cjs, but persistence itself has no guard. A durable owner-scoped store is owed.
- **STATUS:** UNENFORCED

### FR-201 — 128 benchmark extraction is level-blind at engine level (wrapper-only mitigation)
- **FORBIDDEN:** The engine-level benchmark must never stay level-blind behind a wrapper-only mitigation presented as a full fix. Twin of FR-030 (BUG-030).
- **FROM:** BUG-2026-10-14-BUG030-WRAP — 128 benchmark extraction is level-blind at engine level (wrapper-only mitigation).
- **ENFORCEMENT:** UNENFORCED at engine level — tests/career-ibtn-integration.test.cjs TN-8 guards cover the advice half via the 142 wrapper; the 128 engine fix is owed by its owner.
- **STATUS:** UNENFORCED

### FR-202 — gmail.send scope remains granted while email is hard-disabled
- **FORBIDDEN:** The gmail.send grant must never be quietly forgotten while it remains the one re-enable path for sending. Twin of FR-163 (Register 6 OAuth scope).
- **FROM:** BUG-2026-10-14-GMAIL-SCOPE — gmail.send scope remains granted while email is hard-disabled.
- **ENFORCEMENT:** UNENFORCED — owner-flagged safety item, deliberately NOT dropped tonight (an owner decision; it also gates the owner's own future re-enable). No test applies; the enforcement is the owner's ruling.
- **STATUS:** UNENFORCED

### FR-203 — Copy waves land without re-running the pinning suites (process)
- **FORBIDDEN:** A copy fix must never land without re-running the suites that pin the surrounding behavior; over-scrubs that remove honest negations get reverted.
- **FROM:** BUG-2026-10-14-OVERSCRUB — Copy waves land without re-running the pinning suites (process).
- **ENFORCEMENT:** tests/career-gauntlet-r1.test.cjs + tests/career-gauntlet-r2.test.cjs are the pinning suites the adopted rule requires every copy wave to re-run.
- **STATUS:** ENFORCED

### FR-204 — Runner PASS vs grader FAIL on refusal scenarios (classification disagreement)
- **FORBIDDEN:** A refusal scenario must never be simultaneously PASS and FAIL because the grader classifies its family from a description word ('schedule') while the runner uses completion semantics; one classification wins, by the owner's choice.
- **FROM:** BUG-2026-10-14-SC294-CLASS — Runner PASS vs grader FAIL on refusal scenarios (classification disagreement).
- **ENFORCEMENT:** UNENFORCED — open, recorded as an owner-choice note; no unilateral change to either grader. Enforcement should follow the owner's ruling (grader-side exemption or product-side payload).
- **STATUS:** UNENFORCED

### FR-205 — No product path performs watch → diff → alert end to end
- **FORBIDDEN:** The product must never claim job alerting it cannot perform: nothing schedules 121's poll/diff, stores a per-user snapshot, or delivers an alert through the product. Twin of the alert-speed G1/G2 rules (FR-244/245).
- **FROM:** GAP-2026-10-14-JOB-ALERTING — No product path performs watch → diff → alert end to end.
- **ENFORCEMENT:** ENFORCED — tests/career-alert-watch.test.cjs 10/10 (W7, BUG-090): module 151 runs 121's real poll -> diff -> gated alert record end to end; live runner proof 2026-10-14: 13 boards, 3,228 postings, one real cycle, status ok.
- **STATUS:** ENFORCED

## 10 · Four-vertical briefs (FV-1…FV-11 + keep-guards FV-G1/G2)

Source: `~/workspace/your_files/integrator-packs/four-vertical-briefs.md`. Guards are in `tests/career-four-vertical.test.cjs`: a red guard is GUARDED-RED (the test exists and currently fails — the fix is in flight today).

### FR-206 — 121 has no Medicine family
- **FORBIDDEN:** Discovery must never classify clinical postings as Other — or as SWE via company boilerplate — because no Medicine family exists; title-first Medicine patterns outrank the JD-text fallback.
- **FROM:** FV-1 — 121 has no Medicine family.
- **ENFORCEMENT:** ENFORCED — tests/career-four-vertical.test.cjs FV-1 (6 clinical titles → 'Medicine'). Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-051).
- **STATUS:** ENFORCED

### FR-207 — 121 has no Law family
- **FORBIDDEN:** Discovery must never shelve legal postings as Operations/Marketing/Other because no Law family exists; Law patterns take title priority over the JD fallback.
- **FROM:** FV-2 — 121 has no Law family.
- **ENFORCEMENT:** ENFORCED — tests/career-four-vertical.test.cjs FV-2 (5 legal titles → 'Law'). Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-051).
- **STATUS:** ENFORCED

### FR-208 — Location hard-filter excludes multi-office postings listing the user's city
- **FORBIDDEN:** A location filter must never treat a multi-office location string as one place and exclude a posting that lists the user's own city (including 'Hybrid - ' prefixes).
- **FROM:** FV-3 — Location hard-filter excludes multi-office postings listing the user's city.
- **ENFORCEMENT:** ENFORCED — tests/career-four-vertical.test.cjs FV-3. Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-052).
- **STATUS:** ENFORCED

### FR-209 — 123 detectFamily mislabels real JDs (silent 'swe' fallback)
- **FORBIDDEN:** Tailoring must never silently fall back to 'swe' or let one token ('strategy', 'analyst') outrank the JD's actual family; a wrong family means wrong section order and wrong conventions.
- **FROM:** FV-4 — 123 detectFamily mislabels real JDs (silent 'swe' fallback).
- **ENFORCEMENT:** ENFORCED — tests/career-four-vertical.test.cjs FV-4. SS-7 is the consulting instance (FR-227). Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-055).
- **STATUS:** ENFORCED

### FR-210 — 123 parseJD invents must-have skills from boilerplate and dates
- **FORBIDDEN:** Requirement extraction must never promote boilerplate or a graduation season ('Spring') or a culture phrase ('spark innovation') into a must-have skill.
- **FROM:** FV-5 — 123 parseJD invents must-have skills from boilerplate and dates.
- **ENFORCEMENT:** ENFORCED — tests/career-four-vertical.test.cjs FV-5. SS-8 is the consulting instance (FR-228). Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-057).
- **STATUS:** ENFORCED

### FR-211 — 123 assemble() silently drops every certification fact
- **FORBIDDEN:** The assembler must never drop a selected certification fact so a credential renders nowhere. Twin of FR-046 (BUG-046) and FR-258 (B6).
- **FROM:** FV-6 — 123 assemble() silently drops every certification fact.
- **ENFORCEMENT:** tests/career-tailor-dates-dedupe.test.cjs Certifications-section test + FV-6 in tests/career-four-vertical.test.cjs, flipped green by the BUG-046 fix.
- **STATUS:** ENFORCED

### FR-212 — Eligibility never checks credential/degree knockouts (RN license, JD, MA cert) — SAFETY
- **FORBIDDEN:** Eligibility must never return 'submit' for a candidate who lacks a posting's required license, degree, or certification (an unlicensed nursing student on RN roles; an undergraduate on a JD-required role). SAFETY.
- **FROM:** FV-7 — Eligibility never checks credential/degree knockouts (RN license, JD, MA cert) — SAFETY.
- **ENFORCEMENT:** ENFORCED — tests/career-four-vertical.test.cjs FV-7. SS-4 (real estate) and SS-5 (experience/degree) are its sibling instances (FR-219/220). Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-050).
- **STATUS:** ENFORCED

### FR-213 — 121 fit matching is substring-based ('Go' matches inside other words)
- **FORBIDDEN:** Skill matching must never be raw substring matching; 'Go' must never match inside 'going'/'governance' and be quoted to the user as a skill match.
- **FROM:** FV-8 — 121 fit matching is substring-based ('Go' matches inside other words).
- **ENFORCEMENT:** ENFORCED — tests/career-four-vertical.test.cjs FV-8. SS-13 is the second instance (FR-231). Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-053).
- **STATUS:** ENFORCED

### FR-214 — 123's medicine family is a med-school ADMISSION variant
- **FORBIDDEN:** A healthcare-employment user must never be served a med-school-admissions family variant (MCAT/shadowing conventions) for a CNA/RN job.
- **FROM:** FV-9 — 123's medicine family is a med-school ADMISSION variant.
- **ENFORCEMENT:** ENFORCED — tests/career-four-vertical.test.cjs FV-9 (family label must not be the admissions variant). Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-055).
- **STATUS:** ENFORCED

### FR-215 — 123's SKILL_LEXICON has no healthcare or legal skills
- **FORBIDDEN:** Requirement extraction must never run blind in a vertical because the lexicon holds none of its skills (Epic/EHR, BLS, phlebotomy; Westlaw, LexisNexis, e-filing).
- **FROM:** FV-10 — 123's SKILL_LEXICON has no healthcare or legal skills.
- **ENFORCEMENT:** ENFORCED — tests/career-four-vertical.test.cjs FV-10. SS-3/SS-9 are the real-estate/consulting instances (FR-225/229). Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-056).
- **STATUS:** ENFORCED

### FR-216 — 123's consulting bullet style mangles polished bullets into broken grammar
- **FORBIDDEN:** A bullet style must never discard a fact's polished bullet text and concatenate action/method/result fields without conjugation ('Accomplished built a… resulting in prepared…').
- **FROM:** FV-11 — 123's consulting bullet style mangles polished bullets into broken grammar.
- **ENFORCEMENT:** ENFORCED — tests/career-four-vertical.test.cjs FV-11. SS-12 is the consulting instance (FR-230). Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-058).
- **STATUS:** ENFORCED

### FR-217 — Truth audit upgrades a credential in a regulated field
- **FORBIDDEN:** A tailored resume must never upgrade a credential the persona does not hold (a CNA student is never written up as an RN; a pre-law student is never given a JD). Keep-guard: this held in the battery and must keep holding.
- **FROM:** FV-G1 (keep-guard) — Truth audit upgrades a credential in a regulated field.
- **ENFORCEMENT:** tests/career-four-vertical.test.cjs FV-G1 — green at measurement (15/15 battery runs, zero invented or upgraded credentials).
- **STATUS:** ENFORCED

### FR-218 — Render + parse-check strength slips in a vertical
- **FORBIDDEN:** Every tailored document must render (PDF + DOCX) and pass parse-check in every vertical. Keep-guard: this held (15/15) and must keep holding.
- **FROM:** FV-G2 (keep-guard) — Render + parse-check strength slips in a vertical.
- **ENFORCEMENT:** tests/career-four-vertical.test.cjs FV-G2 — green at measurement (PDF+DOCX on all 15 runs, parse-check PASS 15/15).
- **STATUS:** ENFORCED

## 11 · Six-sector briefs (SS-1…SS-13 + keep-guards SS-G1/G2)

Source: `~/workspace/your_files/integrator-packs/six-sector-briefs.md`. Guards are in `tests/career-six-sector.test.cjs` (13 red / 2 green at measurement).

### FR-219 — Eligibility waves an unlicensed candidate through a license-required role (real-estate instance of FV-7)
- **FORBIDDEN:** Eligibility must never return 'submit/eligible' with empty missing lists for an unlicensed candidate on a license-required role, stopped only by luck (the location filter). Twin of FR-212 (FV-7).
- **FROM:** SS-4 — Eligibility waves an unlicensed candidate through a license-required role (real-estate instance of FV-7).
- **ENFORCEMENT:** ENFORCED — tests/career-six-sector.test.cjs SS-4. Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-050).
- **STATUS:** ENFORCED

### FR-220 — Stated minimum-experience and degree requirements never extracted or checked
- **FORBIDDEN:** Eligibility must never wave a candidate through a posting's stated minimum-years or degree-required lines (Capco 5 years; Pariveda 3+ years; Northmarq 1–3 years + degree) with an empty missing list; an in-progress degree must never read as conferred. Sibling of FV-7.
- **FROM:** SS-5 — Stated minimum-experience and degree requirements never extracted or checked.
- **ENFORCEMENT:** ENFORCED — tests/career-six-sector.test.cjs SS-5 (Capco BA instance). Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-050).
- **STATUS:** ENFORCED

### FR-221 — scoreFit's verdict depends on the caller's input shape
- **FORBIDDEN:** A fit verdict must never depend on which internal profile shape the caller happened to build (score 0 / no matches vs score 40 / 4 matches for the same user and posting); scoreFit normalizes its input.
- **FROM:** SS-10 — scoreFit's verdict depends on the caller's input shape.
- **ENFORCEMENT:** ENFORCED — tests/career-six-sector.test.cjs SS-10 (matched_skills identical for both profile shapes). Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-054).
- **STATUS:** ENFORCED

### FR-222 — Tailor produces byte-identical documents for different jobs
- **FORBIDDEN:** 'Tailored' packets for different jobs must never render byte-identical; if selection receives no per-job signal, the documents must not be called tailored. Product form of HS-9 — twin of FR-257 (B5).
- **FROM:** SS-11 — Tailor produces byte-identical documents for different jobs.
- **ENFORCEMENT:** ENFORCED — tests/career-six-sector.test.cjs SS-11 (Northmarq-analyst vs Orchard packets must differ). Flipped ENFORCED 2026-10-14 — the guard is green as a consequence of BUG-055's family system (no separate ledger row; the guard itself is the enforcement).
- **STATUS:** ENFORCED

### FR-223 — 121 has no Real Estate family
- **FORBIDDEN:** Discovery must never classify real-estate analyst titles as Finance via the analyst fallback, or a licensed-agent title as Other, because no Real Estate family exists. Sibling of FV-1/FV-2 (FR-206/207).
- **FROM:** SS-1 — 121 has no Real Estate family.
- **ENFORCEMENT:** ENFORCED — tests/career-six-sector.test.cjs SS-1. Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-051).
- **STATUS:** ENFORCED

### FR-224 — 123 has no real_estate family
- **FORBIDDEN:** Tailoring must never write every real-estate document with investment-banking conventions because detectFamily has no real-estate trigger and FAMILIES has no real_estate entry. Sibling of FV-4/FV-9.
- **FROM:** SS-2 — 123 has no real_estate family.
- **ENFORCEMENT:** ENFORCED — tests/career-six-sector.test.cjs SS-2. Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-055).
- **STATUS:** ENFORCED

### FR-225 — 123's skill lexicon is blind to real-estate vocabulary
- **FORBIDDEN:** Requirement extraction must never extract nothing of a posting's named tools and measures (Argus, NOI, DSC, IRR, Salesforce, underwriting) because the lexicon holds no real-estate terms. FV-10 extension — twin of FR-215.
- **FROM:** SS-3 — 123's skill lexicon is blind to real-estate vocabulary.
- **ENFORCEMENT:** ENFORCED — tests/career-six-sector.test.cjs SS-3 (Argus must be extracted). Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-056).
- **STATUS:** ENFORCED

### FR-226 — 121 consulting detection misses real consultancy postings
- **FORBIDDEN:** Consulting detection must never miss a consultancy's own postings because 'consultancy' does not match /\bconsulting/ or because practice-name tokens outvote the firm's identity (1 of 3 correct at measurement).
- **FROM:** SS-6 — 121 consulting detection misses real consultancy postings.
- **ENFORCEMENT:** ENFORCED — tests/career-six-sector.test.cjs SS-6. Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-051).
- **STATUS:** ENFORCED

### FR-227 — 123 detectFamily misses consulting on 2 of 3 real JDs
- **FORBIDDEN:** A consulting JD must never be tailored as SWE because sample-project tech tokens outvoted it, nor as IB finance because of a bare 'analyst' token. FV-4 extension — twin of FR-209.
- **FROM:** SS-7 — 123 detectFamily misses consulting on 2 of 3 real JDs.
- **ENFORCEMENT:** ENFORCED — tests/career-six-sector.test.cjs SS-7. Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-055).
- **STATUS:** ENFORCED

### FR-228 — parseJD invents must-haves from non-requirement prose
- **FORBIDDEN:** Must-have extraction must never promote a graduation season ('Spring') or a sample project's stack (Java/Angular mentioned once) into enforced requirements. FV-5 extension — twin of FR-210.
- **FROM:** SS-8 — parseJD invents must-haves from non-requirement prose.
- **ENFORCEMENT:** ENFORCED — tests/career-six-sector.test.cjs SS-8. Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-057).
- **STATUS:** ENFORCED

### FR-229 — Zero must-haves extracted from explicit requirements sections
- **FORBIDDEN:** An explicit requirements section must never extract zero must-haves because the lexicon lacks that market's vocabulary; the resulting silence is what enables the SS-4/SS-5 wave-throughs. FV-10 mechanism — twin of FR-215.
- **FROM:** SS-9 — Zero must-haves extracted from explicit requirements sections.
- **ENFORCEMENT:** ENFORCED — tests/career-six-sector.test.cjs SS-9 (all three JDs must extract ≥1). Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-056).
- **STATUS:** ENFORCED

### FR-230 — Consulting bullet style mangles polished bullets — correct classification is the trigger
- **FORBIDDEN:** The consulting bullet style must never rewrite all of a user's polished bullets ungrammatically ('Accomplished built… resulting in cut…'). FV-11 instance — twin of FR-216.
- **FROM:** SS-12 — Consulting bullet style mangles polished bullets — correct classification is the trigger.
- **ENFORCEMENT:** ENFORCED — tests/career-six-sector.test.cjs SS-12. Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-058).
- **STATUS:** ENFORCED

### FR-231 — 'Go' claimed as a matched skill on a JD with zero occurrences
- **FORBIDDEN:** A skill must never be claimed as matched — and quoted by eligibility reasons — when it occurs zero times as a word in the JD. FV-8 second instance — twin of FR-213.
- **FROM:** SS-13 — 'Go' claimed as a matched skill on a JD with zero occurrences.
- **ENFORCEMENT:** ENFORCED — tests/career-six-sector.test.cjs SS-13 (location-neutralized conditions). Flipped ENFORCED 2026-10-14 — guard green standalone in the W3 fix wave (BUG-053).
- **STATUS:** ENFORCED

### FR-232 — Truth audit invents a credential or license in the new sectors
- **FORBIDDEN:** A tailored document must never upgrade a credential or claim a license the persona does not hold, in consulting or real estate either. Keep-guard.
- **FROM:** SS-G1 (keep-guard) — Truth audit invents a credential or license in the new sectors.
- **ENFORCEMENT:** tests/career-six-sector.test.cjs SS-G1 — green at measurement.
- **STATUS:** ENFORCED

### FR-233 — Render + parse-check strength slips in the new sectors
- **FORBIDDEN:** Tailored documents in the new sectors must render (PDF+DOCX) and pass parse-check. Keep-guard.
- **FROM:** SS-G2 (keep-guard) — Render + parse-check strength slips in the new sectors.
- **ENFORCEMENT:** tests/career-six-sector.test.cjs SS-G2 — green at measurement.
- **STATUS:** ENFORCED

## 12 · Real-apply submissions report (D1–D10)

Source: `~/workspace/your_files/real-apply/submissions/submissions-report.md`, 'Product defects found' (near line 411).

### FR-234 — Redirect escapes the host gate
- **FORBIDDEN:** The board driver must never follow a redirect off the allowlisted host and keep driving; the §6.3 host gate applies to every hop, not only the initial URL (HRT → hudsonrivertrading.com; Coinbase/Stripe/Akuna → employer sites).
- **FROM:** D1 — Redirect escapes the host gate.
- **ENFORCEMENT:** ENFORCED — tests/career-portal-submit-path.test.cjs + tests/career-portal-browser.test.cjs (W4, BUG-060): redirect chains recorded and re-gated; an off-allowlist landing stops as HOST_REDIRECT_REFUSED with zero form access.
- **STATUS:** ENFORCED

### FR-235 — Doorstep declared over an empty form
- **FORBIDDEN:** An empty form must never be declared a doorstep: zero fields exposed means a stop, never 'prepared' with a payload holding only the resume hash — and it must never be spoken in chat as 'ready to submit'.
- **FROM:** D2 — Doorstep declared over an empty form.
- **ENFORCEMENT:** ENFORCED — tests/career-portal-submit-path.test.cjs (W4, BUG-061): EMPTY_FORM blocks the doorstep at discovery and at the doorstep payload; zero doorsteps recorded over answerless forms.
- **STATUS:** ENFORCED

### FR-236 — The submit leg does not exist (approval gate can never transmit)
- **FORBIDDEN:** An approval gate must never be presented as able to complete a submission while module 150's submit() throws REAL_SUBMIT_DISABLED; the gap is named as the blocker, proven live at the Arc doorstep. (Known CA-03 gap.)
- **FROM:** D3 — The submit leg does not exist (approval gate can never transmit).
- **ENFORCEMENT:** ENFORCED — tests/career-portal-submit-path.test.cjs (W4, BUG-063): a sandbox board is submitted exactly once under a named approvalRef; no-ref and unarmed controls stay REAL_SUBMIT_DISABLED.
- **STATUS:** ENFORCED

### FR-237 — No education/country profile keys
- **FORBIDDEN:** Form filling must never strand answers that exist in the fact bank (school, degree, discipline, dates, GPA, graduation year, country — all in fact F-001) because modules 149/150 have no keys to carry them; Labelbox stopped on 'Country' alone.
- **FROM:** D4 — No education/country profile keys.
- **ENFORCEMENT:** ENFORCED — tests/career-portal-submit-path.test.cjs (W4, BUG-062): education_*/country keys resolve from the fact-bank-shaped profile; a missing value stays a no_confirmed_fact ask, never invented.
- **STATUS:** ENFORCED

### FR-238 — Navigation gaps by board family
- **FORBIDDEN:** The driver must never silently fail a whole board family (Ashby 10 of 10 unreachable; SmartRecruiters 0 of 1; Lever 1 form of 5 boards); an unreachable family is a named gap per board, and Greenhouse-only reliability is not presented as general.
- **FROM:** D5 — Navigation gaps by board family.
- **ENFORCEMENT:** UNENFORCED — no guard found for D1–D10 (per the assignment brief, verified by grep of tests/ for D-numbered or equivalent assertions). Enforcement should be: a fail-first driver/doorstep test per defect in tests/career-portal-browser.test.cjs / tests/career-portal-apply.test.cjs before the fix lands.
- **STATUS:** UNENFORCED

### FR-239 — Duplicate field definitions double the asks
- **FORBIDDEN:** A board emitting the same question twice (Gusto nearly every question ×2; Discord EEO ×3) must never double the owner's asks; field definitions are deduped before asking.
- **FROM:** D6 — Duplicate field definitions double the asks.
- **ENFORCEMENT:** ENFORCED — tests/career-portal-submit-path.test.cjs (W4, BUG-064): semantic-key dedupe keeps one definition per question (live re-drive: Aquatic 34 -> 25 fields).
- **STATUS:** ENFORCED

### FR-240 — Value misbinding: profile values guessed into unrelated fields
- **FORBIDDEN:** A profile value must never be bound into an unrelated field by guessing (Chicago, IL attempted into 'have you worked at Gusto', an office-preference, and a New-York attestation), and preferred_name must never be filled with the full legal name where no preferred-name fact exists.
- **FROM:** D7 — Value misbinding: profile values guessed into unrelated fields.
- **ENFORCEMENT:** ENFORCED — tests/career-portal-submit-path.test.cjs (W4, BUG-065): label-first binding; preferred_name stays empty without a fact; no value guessed into an unrelated field.
- **STATUS:** ENFORCED

### FR-241 — EEO decline default is unreliable
- **FORBIDDEN:** The §6.1 'Decline to self-identify' default must never depend on brittle option-text matching that fails on most boards; it filled cleanly on only 4 boards at measurement.
- **FROM:** D8 — EEO decline default is unreliable.
- **ENFORCEMENT:** ENFORCED — tests/career-portal-submit-path.test.cjs (W4, BUG-067): decline-class option matching in the board helper (exact -> class -> contains).
- **STATUS:** ENFORCED

### FR-242 — Lever custom-card labels don't resolve to human questions
- **FORBIDDEN:** A required custom-card question must never reach the record as a machine field name (cards_…_field); the exact owner ask must be quotable for every required field.
- **FROM:** D9 — Lever custom-card labels don't resolve to human questions.
- **ENFORCEMENT:** ENFORCED — tests/career-portal-submit-path.test.cjs (W4, BUG-066): group/card headings carried as human labels, so owner asks quote the real question.
- **STATUS:** ENFORCED

### FR-243 — Optional attestation-class questions don't block the doorstep
- **FORBIDDEN:** An attestation-class question must never be walked past to the doorstep just because the form marks it optional. (Policy decision pending with the owner; this lane's recommendation: block.)
- **FROM:** D10 — Optional attestation-class questions don't block the doorstep.
- **ENFORCEMENT:** UNENFORCED — no guard found for D1–D10 (per the assignment brief, verified by grep of tests/ for D-numbered or equivalent assertions). Enforcement should be: a fail-first driver/doorstep test per defect in tests/career-portal-browser.test.cjs / tests/career-portal-apply.test.cjs before the fix lands.
- **STATUS:** UNENFORCED

## 13 · Alert-speed report (G1–G7)

Source: `~/workspace/your_files/upmore-alert-speed-report.md`, 'Product gaps — the build brief'.

### FR-244 — No standing scheduler calls poll()
- **FORBIDDEN:** Detection must never exist only on demand: without a scheduled host job calling 121.poll() on the POLL_MINUTES cadence (starred 15 min / default 60 min), the product must not claim users hear about postings when they post. Twin of FR-222 (GAP-JOB-ALERTING).
- **FROM:** G1 — No standing scheduler calls poll().
- **ENFORCEMENT:** ENFORCED (the loop) — tests/career-alert-watch.test.cjs 10/10 (W7, BUG-090): 151's runWatchCycle is the product-code watch loop (stored snapshot -> 121 poll -> diff -> gated alert). Per-user host scheduling and delivery wiring remain host work (docs/career/alert-watch.md).
- **STATUS:** ENFORCED

### FR-245 — No alert composer or alert record
- **FORBIDDEN:** A detected new posting must never dead-end in poll()'s return value; an alert artifact (role, company, fit reasons, deadline, doorstep next step, posted_at → detected_at latency) is composed through module 140. Twin of FR-222.
- **FROM:** G2 — No alert composer or alert record.
- **ENFORCEMENT:** ENFORCED — tests/career-alert-watch.test.cjs (W7, BUG-090): composeAlert emits the typed alert record and fit lines cite proven facts only; sink delivery is host wiring.
- **STATUS:** ENFORCED

### FR-246 — Canonical board registry missing six live-verified boards
- **FORBIDDEN:** Boards verified live (Gusto, Gemini, Virtu Financial, Scale AI, Notion, Old Mission Capital) must never stay invisible to boardFeeds()/131 discovery planning because the registry was not updated with the verification evidence.
- **FROM:** G3 — Canonical board registry missing six live-verified boards.
- **ENFORCEMENT:** ENFORCED — tests/career-jobs.test.cjs (W3, BUG-059): the six boards verified live 2026-10-13/14 (Gusto, Gemini, Virtu, Scale AI, Notion, Old Mission) are entries in 121's BOARD_REGISTRY.
- **STATUS:** ENFORCED

### FR-247 — Greenhouse feed pulls full content for every posting on every poll
- **FORBIDDEN:** Polling must never pull ?content=true for an entire board every cycle when a list-first poll (content only for diffNew-flagged postings) sustains the cadence at ~1/100 the payload.
- **FROM:** G4 — Greenhouse feed pulls full content for every posting on every poll.
- **ENFORCEMENT:** UNENFORCED — no guard found. Enforcement should be: the fail-first poll→diff→alert wiring test named in FR-222 (for G1/G2/G6), a registry test for G3, and fetch-layer tests for G4/G7; G5 should be pinned by a profileFromPersona test asserting clean skill names.
- **STATUS:** UNENFORCED

### FR-248 — Unproven skill names carry fact-bank annotations
- **FORBIDDEN:** A skill name must never carry its fact-bank annotation ('SQL (listed in the resume's Skills line; …)') into matching, where it can never be detected in a JD and the honest unproven-skill gap line silently never fires; annotations travel in a separate field.
- **FROM:** G5 — Unproven skill names carry fact-bank annotations.
- **ENFORCEMENT:** UNENFORCED — no guard found. Enforcement should be: the fail-first poll→diff→alert wiring test named in FR-222 (for G1/G2/G6), a registry test for G3, and fetch-layer tests for G4/G7; G5 should be pinned by a profileFromPersona test asserting clean skill names.
- **STATUS:** UNENFORCED

### FR-249 — No level/family gate on the poll path (manager role scored a fit)
- **FORBIDDEN:** An unattended alert must never call a manager-band posting a fit for a student profile; the alert emitter gates on seniority_band ∈ {intern, new_grad} plus the profile's role families before composing.
- **FROM:** G6 — No level/family gate on the poll path (manager role scored a fit).
- **ENFORCEMENT:** ENFORCED — tests/career-alert-watch.test.cjs (W7, BUG-090): gatePosting rejects off-band, off-watch, and hard-excluded postings before any alert (3 of 5 controlled fixtures rejected).
- **STATUS:** ENFORCED

### FR-250 — No per-board hard deadline on a poll cycle
- **FORBIDDEN:** One sick board must never hold a whole watch cycle hostage (a slow trickle defeats a socket timeout); the fetch layer imposes a per-feed wall-clock deadline and treats a blown deadline as that feed's degraded cycle.
- **FROM:** G7 — No per-board hard deadline on a poll cycle.
- **ENFORCEMENT:** ENFORCED — tests/career-alert-watch.test.cjs (W7, BUG-090): fetchWithDeadline bounds every board fetch (default 100000 ms); a stalled board degrades alone and the cycle still answers.
- **STATUS:** ENFORCED

## 14 · Interview-intel briefs — the never-again items only

Source: `~/workspace/your_files/integrator-packs/interview-intel-briefs.md`. Only IB-INTEL-1 and IB-INTEL-9 state a never-again (label/flag preservation; medicine guardrails). IB-INTEL-2…8, 10, 11 are content/method gap briefs — real work, inventoried in the ledger's closing section, but they forbid nothing, so they carry no FR rule; they belong on the build queue, not the forbidden register.

### FR-251 — Bank UNVERIFIED flags taught as fact / bank items stripped of sources
- **FORBIDDEN:** Prep content adopted from the question banks must never lose its sources, as-of labels, or UNVERIFIED flags; an UNVERIFIED item must never be taught as fact.
- **FROM:** IB-INTEL-1 — Bank UNVERIFIED flags taught as fact / bank items stripped of sources.
- **ENFORCEMENT:** UNENFORCED — the banks are not yet adopted as the prep data layer and no test was found asserting label preservation. Enforcement should be: a bank-loading test asserting sources + UNVERIFIED flags survive into 127's data.
- **STATUS:** UNENFORCED

### FR-252 — Prep material violates medicine guardrails (credentials altered, PHI, unverified format numbers)
- **FORBIDDEN:** Medicine prep must never alter a credential fact (copied exactly, Spec 3 §8B), must never contain PHI anywhere in prep material, and must never teach one CASPer format number as settled when the bank flags sources disagreeing (14 vs 11 scenarios) — verify per cycle first.
- **FROM:** IB-INTEL-9 — Prep material violates medicine guardrails (credentials altered, PHI, unverified format numbers).
- **ENFORCEMENT:** UNENFORCED — the medicine family does not exist in 127/144 yet (0 of 30), so there is no behavior to guard. Enforcement should be: the family build lands with guardrail tests (exact-credential, no-PHI, per-cycle format verification) from the start.
- **STATUS:** UNENFORCED

## 15 · Human-sounding briefs (B1–B8 — the prohibitions)

Source: `~/workspace/your_files/integrator-packs/human-sounding-briefs.md`. Each brief is a generator-level prohibition with a specified acceptance test.

### FR-253 — Batch drafts repeat the same sentences across the wave
- **FORBIDDEN:** A batch must never repeat a sentence or a non-fact 6-gram in more than 25% of drafts (the Lombard sender sentence, the bridge clause, and the logistics window each ran 12/12), and a sender-fact sentence must never be emitted from a constant — it is composed per draft.
- **FROM:** B1 (HS-1/2/6) — Batch drafts repeat the same sentences across the wave.
- **ENFORCEMENT:** UNENFORCED — the batchGate (sentence/phrase-frequency) is specified in the brief but no test was found implementing it. Enforcement should be: a batch-gate test failing a 12-draft fixture built like the measured wave on all three checks.
- **STATUS:** UNENFORCED

### FR-254 — Subjects generated from one slot frame; duplicates per firm; firm name truncated away
- **FORBIDDEN:** Two drafts to the same firm must never share a subject, no subject frame may cover >50% of a batch, and truncation must never drop the firm name (switch to the short form instead).
- **FROM:** B2 (HS-3) — Subjects generated from one slot frame; duplicates per firm; firm name truncated away.
- **ENFORCEMENT:** UNENFORCED — no test found. Enforcement should be: a subject-generation test (0 duplicate subjects per firm, ≤50% any frame, firm name in every subject).
- **STATUS:** UNENFORCED

### FR-255 — Every draft personalizes from the same fact type
- **FORBIDDEN:** A wave must never personalize 12/12 drafts from one fact kind (FINRA start-dates) when stronger fact types exist; registry_date facts cap at 50% of a wave when alternatives exist, and a registry-only wave reports its monotony count instead of hiding it.
- **FROM:** B3 (HS-5) — Every draft personalizes from the same fact type.
- **ENFORCEMENT:** UNENFORCED — no test found. Enforcement should be: a draft-selection test over mixed-fact-type records asserting the ≤50% cap + the reported count.
- **STATUS:** UNENFORCED

### FR-256 — Draft lengths metronome-uniform (92–109 words, ratio 1.18)
- **FORBIDDEN:** Templates must never impose an implicit length band; structure specifies shape, not word counts, and a uniform batch (max/min < 1.5 over ≥8 drafts) warns a human.
- **FROM:** B4 (HS-4) — Draft lengths metronome-uniform (92–109 words, ratio 1.18).
- **ENFORCEMENT:** UNENFORCED — no test found. Enforcement should be: a batch-gate warn test firing on a synthetic uniform batch.
- **STATUS:** UNENFORCED

### FR-257 — 'Tailored' packet is a re-sort: 15/15 bullets byte-identical across packets
- **FORBIDDEN:** A packet must never be called tailored when its bullets are a re-sort (15/15 identical across four packets); tailoring re-anchors each bullet from the fact's own fields, and >80% bullet identity vs the batch is labeled 'selection only — not re-anchored' in the review doc. Twin of FR-222 (SS-11).
- **FROM:** B5 (HS-9) — 'Tailored' packet is a re-sort: 15/15 bullets byte-identical across packets.
- **ENFORCEMENT:** UNENFORCED as its own guard — its product-form twin SS-11 is GUARDED-RED (tests/career-six-sector.test.cjs SS-11). Enforcement should be: a batch-tailor test asserting <80% bullet identity for unlike postings + the label when the threshold is crossed.
- **STATUS:** UNENFORCED

### FR-258 — Rendered packet duplicates a bullet across sections and carries zero dates
- **FORBIDDEN:** A rendered packet must never print the same line in two sections and must never render a dateless experience entry silently; a dateless entry flags the packet INCOMPLETE. Twin of FR-046 (BUG-046) and FR-211 (FV-6).
- **FROM:** B6 (HS-10/11) — Rendered packet duplicates a bullet across sections and carries zero dates.
- **ENFORCEMENT:** tests/career-tailor-dates-dedupe.test.cjs (dedupe + drop record; parse-check duplicate_line and missing_dates FAIL rules) — the BUG-046 fix is this brief's enforcement.
- **STATUS:** ENFORCED

### FR-259 — Source-artifact text renders verbatim with no surfacing
- **FORBIDDEN:** A source artifact ('6000$+', 'GPA: 3.9/ 4.0', a missing apostrophe) must never render into a packet silently OR be silently rewritten; it is listed verbatim in the packet's change ledger and the source fix stays the owner's.
- **FROM:** B7 (HS-12) — Source-artifact text renders verbatim with no surfacing.
- **ENFORCEMENT:** UNENFORCED — no test found. Enforcement should be: a render test planting '6000$+' and asserting the ledger names it while the rendered text is unchanged.
- **STATUS:** UNENFORCED

### FR-260 — Reply voice: doctrine-first openings, fixed 2-bubble shape, stacked tricolons, slot-fill evidence
- **FORBIDDEN:** A reply must never lead with doctrine over the work product (budget: at most one policy formulation, after user-specific content, refusals excepted), must never keep a fixed bubble count with a reflexive closing question, must never stack more than one tricolon, and a ranked list must never repeat one evidence sentence across items. A run where >70% of replies share one (bubble-count × final-bubble-type) shape fails the voice axis.
- **FROM:** B8 (HS-13..16) — Reply voice: doctrine-first openings, fixed 2-bubble shape, stacked tricolons, slot-fill evidence.
- **ENFORCEMENT:** UNENFORCED — no test found implementing the doctrine/tricolon/list-evidence rules or the run-level distribution check. Enforcement should be: composer style tests + the reply-judge harness distribution check specified in the brief.
- **STATUS:** UNENFORCED

## 16 · Composer fix table — the two systemic items (§1a, §1b)

Source: `~/workspace/your_files/integrator-packs/composer-fix-table.md` §1. (The table's 59 per-string rows are copy instances of rules already carried above — H-12 endings, H-7 claim verbs, refusal shapes; its two halt/submit S0 string classes are FR-195/196 in §9.)

### FR-261 — ensureNextStepText tests the whole reply instead of the last sentence
- **FORBIDDEN:** The H-12 guarantee must never test the whole reply for a next-step token — a mid-text 'tell me' must never suppress the append while delivery regrouping leaves the final bubble bare. Twin of FR-194 (BUG-2026-10-14-H12-LAST-SENTENCE).
- **FROM:** Composer §1a — ensureNextStepText tests the whole reply instead of the last sentence.
- **ENFORCEMENT:** tests/career-router-wedge.test.cjs + the integrator-wave fix (the predicate now tests the LAST SENTENCE; see FR-211).
- **STATUS:** ENFORCED

### FR-262 — The ending guarantee does not exist outside module 142
- **FORBIDDEN:** No reply path (120, 130, 141) must ever sit outside the next-step guarantee because dispatch returns before 142 runs; the guarantee lives at the delivery seam every reply crosses. Twin of FR-211.
- **FROM:** Composer §1b — The ending guarantee does not exist outside module 142.
- **ENFORCEMENT:** pilot-lib chatTurn applies the guarantee to 120/130/141 results (integrator-wave fix, FR-194), guarded by tests/career-router-wedge.test.cjs + final-run H-12 counts.
- **STATUS:** ENFORCED

## 17 · Reply-judge re-pass — systemic rows

Source: `~/workspace/your_files/integrator-packs/reply-judge-repass.md`. Only the three systemic rows are carried here; the per-scenario rows are instances of rules above.

### FR-263 — Reply names a stock role/template instead of what the user asked
- **FORBIDDEN:** A reply must never substitute a stock template for the ask — one generic tailor/shortlist/non-answer pasted over unlike asks (Goldman, Big Law, med school, Palantir alike), never naming the firm, format, event, or evidence the user actually asked for. The re-pass calls this the product's biggest remaining wording disease in Apply, Track, and Intelligence.
- **FROM:** Repass: template substitution — Reply names a stock role/template instead of what the user asked.
- **ENFORCEMENT:** ENFORCED (carriage bands) — tests/career-a4-carriage-w5.test.cjs 28/28 (W5, BUG-070..079): in the Apply / Negotiation / Intelligence / Career-OS bands a handler's real product must ride its result or the guard fails; family re-runs 2026-10-14 (fixwave2-* dirs) are the measured evidence. Wording-level rows in the Outreach/Referrals bands remain as measured by the reply judge.
- **STATUS:** ENFORCED

### FR-264 — Generic 'Tell me what you'd like to do next.' closer appended to replies
- **FORBIDDEN:** A generic closer must never be appended over a reply that already ends properly (143 replies at the re-pass; it competed with an in-character instruction and regressed SC-209). Closers are emitted only when the next step genuinely needs the user (see FR-260, B8).
- **FROM:** Repass: generic closer — Generic 'Tell me what you'd like to do next.' closer appended to replies.
- **ENFORCEMENT:** ENFORCED — tests/career-generic-closer-guard.test.cjs 31/31 (W6+W5, BUG-080): the ending rule lives once in 140 (CareerReply.ensureNextStep); 142 delegates to it, pilot-lib delegates to it, and the production host seam (career_host.js) passes 120/130/141 results through it. A specific next step always wins; the generic closer appears only when a reply carries no next step at all.
- **STATUS:** ENFORCED

### FR-265 — Raw sha256 hash stamped into chat (repass instance)
- **FORBIDDEN:** A raw content hash must never be stamped into a delivered tailor/packet reply. Twin of FR-048 (BUG-048) — same defect, measured by the re-pass in 14 final-run records + SC-283.
- **FROM:** Repass: hash-in-chat — Raw sha256 hash stamped into chat (repass instance).
- **ENFORCEMENT:** tests/career-hash-leak-guard.test.cjs — see FR-048.
- **STATUS:** ENFORCED

## 18 · Gauntlet ledger — Codex defect briefs A1–A6

Source: `docs/career/gauntlet-ledger.md`. Checked against Registers 5/6 first: all six briefs duplicate Register 5 rows, so each carries its own FR line here with a cross-reference to its twin, per the register's duplicate rule. No gauntlet defect was found that is not already carried in §§3/5/7.

### FR-266 — Contained-no-intent class (227) — gauntlet-brief twin of Register 5 A1
- **FORBIDDEN:** Same rule as FR-137 (A1): a contained turn is owned by a real intent, never left handler-less.
- **FROM:** Gauntlet A1 — Contained-no-intent class (227) — gauntlet-brief twin of Register 5 A1.
- **ENFORCEMENT:** tests/career-quality-routing.test.cjs + fresh-300 routing axis — see FR-137.
- **STATUS:** ENFORCED

### FR-267 — Fallback-intent class (39) — twin of Register 5 A2
- **FORBIDDEN:** Same rule as FR-138 (A2): containment text is never delivered via career_fallback where a handler owns the turn.
- **FROM:** Gauntlet A2 — Fallback-intent class (39) — twin of Register 5 A2.
- **ENFORCEMENT:** tests/career-quality-routing.test.cjs — see FR-138.
- **STATUS:** ENFORCED

### FR-268 — Wrong-intent career_discovery catch-all (24) — twin of Register 5 A3
- **FORBIDDEN:** Same rule as FR-139 (A3): the discovery catch-all never swallows people/guidance/apply asks.
- **FROM:** Gauntlet A3 — Wrong-intent career_discovery catch-all (24) — twin of Register 5 A3.
- **ENFORCEMENT:** tests/career-router-wedge.test.cjs + tests/career-gauntlet-regressions.test.cjs ACID tests — see FR-139.
- **STATUS:** ENFORCED

### FR-269 — Wrong-intent singles (SC-287/277/062/111) — twin of Register 5 A4
- **FORBIDDEN:** Same rules as FR-140/141/142 (the A4 singles): a named ask is never answered by the wrong intent.
- **FROM:** Gauntlet A4 — Wrong-intent singles (SC-287/277/062/111) — twin of Register 5 A4.
- **ENFORCEMENT:** tests/career-router-wedge.test.cjs A4 tests + tests/career-quality-contracts.test.cjs — see FR-140..142.
- **STATUS:** ENFORCED

### FR-270 — SC-286 module-120 no-typed-result — twin of Register 5 A5
- **FORBIDDEN:** Same rule as FR-143 (A5): connect_google returns a typed result with a doorstep payload, never null.
- **FROM:** Gauntlet A5 — SC-286 module-120 no-typed-result — twin of Register 5 A5.
- **ENFORCEMENT:** tests/career-router-wedge.test.cjs 'A5 SC-286…' — see FR-143.
- **STATUS:** ENFORCED

### FR-271 — SC-065 chaining leg — twin of Register 5 A6
- **FORBIDDEN:** Same rule as FR-144 (A6): a PM ask over an SWE-only pool answers honest-empty at engine tier, and the discovery→tailor→apply chaining leg is not claimed until it lands.
- **FROM:** Gauntlet A6 — SC-065 chaining leg — twin of Register 5 A6.
- **ENFORCEMENT:** tests/career-jobs-domain.test.cjs 8/8 (engine leg) — see FR-144; the chaining leg's missing replay is FR-187 (IB-AP-9).
- **STATUS:** ENFORCED

### FR-272 — One template may never answer two different graph ask classes (BUG-098)
- **FORBIDDEN:** A graph-family handler answering more than one ask class from a single prose template, or answering a class without running its named 135 producer. Every referral ask class runs its producer and composes its reply from the producer's record.
- **FROM:** Residual lane 2026-10-14 — Referrals 0/30: handleGraphCatch's single template served ~16 ask classes (one reply naming the company as "one").
- **ENFORCEMENT:** tests/career-referrals-completion.test.cjs BUG-098 tests (per-class producer record on the payload).
- **STATUS:** ENFORCED

### FR-273 — A prepared card is never dropped on a field-name misread (BUG-099)
- **FORBIDDEN:** Reading a producer's result under a field the producer does not return (planReferralAsk returns `draft`, never `draft_card`). A seam that needs a field verifies the producer's actual return shape; a prepared referral card may never silently fall through to a generic answer.
- **FROM:** Residual lane 2026-10-14 — handleGraphReferral's `r.draft_card` test made the named-referral branch dead code.
- **ENFORCEMENT:** tests/career-referrals-completion.test.cjs populated referral test (named ask after a held chat surfaces the draft).
- **STATUS:** ENFORCED

### FR-274 — Producer calls match a documented producer signature (BUG-100)
- **FORBIDDEN:** Calling a dual-shape producer with a mixed argument shape that matches NONE of its documented signatures (forwardableBlurb takes (graphStore, profile122) or (profile, facts) — never (profile) alone). A polite refusal from a wrong-shape call is still a defect.
- **FROM:** Residual lane 2026-10-14 — the blurb refused "no_real_profile_facts" on a fact-rich profile because the call matched no shape.
- **ENFORCEMENT:** tests/career-referrals-completion.test.cjs SC-150/SC-162 tests (blurb ok:true with fact_ids on the real profile).
- **STATUS:** ENFORCED

### FR-275 — Every graph-family result carries its typed record (BUG-101)
- **FORBIDDEN:** A graph-family turn returning prose without its typed record under `payload`. Adapters must also supply every profile field the engine reads (graphProfileOf supplies current_employer, derived only from an open-ended experience fact — an ended role is never promoted to current).
- **FROM:** Residual lane 2026-10-14 — alumni/memory/intro/departed/keep-warm/timing turns carried prose or unread keys only; all 30 records failed STATE_doorstep_gap.
- **ENFORCEMENT:** tests/career-referrals-completion.test.cjs (30 per-scenario payload tests + populated keep-warm held-card test).
- **STATUS:** ENFORCED

### FR-276 — Completion branches key on record elements, never intent or reply text (BUG-102)
- **FORBIDDEN:** A grader completion branch that fires on an intent label alone or on reply text. Family branches key on the producer record's own typed elements (kind + arrays/counters); contract additions are flagged CONTRACT in source. For the graph family, the carried record IS the doorstep artifact in the A4.4 derivation.
- **FROM:** Residual lane 2026-10-14 — the graph family's honest terminal records (empty-graph envelope, timing decision, intel/merge/conversion records, blurb, memory, intro card) had no branch and could never complete; the F4 populated case still validates first.
- **ENFORCEMENT:** run-grand.cjs BUG-102 branches (flagged in source) + the Referrals family re-run at grader-v2 30/30 (records: upmore-career-gauntlet-referrals-fix, index referrals-fix-index.json).
- **STATUS:** ENFORCED

### FR-277 — Every ranked path row states its basis (BUG-103)
- **FORBIDDEN:** A path row reaching the record with no stated ground, and the two failure modes around it: silently dropping a bare connection (it IS a live path — IB-2) or silently promoting it to fact-backed warmth. Each row carries basis "shared_fact" (fact in why[]) or basis "connection" (why[] states the connection ground; the row is also listed under `cold`).
- **FROM:** Residual lane 2026-10-14 — F4's stated-ground law and IB-2's live-path law meet on the zero-fact findPaths row.
- **ENFORCEMENT:** tests/career-referrals-completion.test.cjs populated SC-146 test (record validates F4; both bases present) + tests/career-ib-outreach-integration.test.cjs IB-2/IB-2b.
- **STATUS:** ENFORCED

### FR-278 — Built producers get routes; essay material comes only from confirmed facts (BUG-104)
- **FORBIDDEN:** An ask class with a built producer (133 medEssayPacket) falling through to another family's answer for lack of a route; and essay material built from anything but confirmed profile facts, or presented without naming which asked-for experience themes the profile lacks.
- **FROM:** Residual lane 2026-10-14 — SC-096's essay ask fell to discovery (fixed build) after being canned-text "answered" in the earlier build.
- **ENFORCEMENT:** tests/career-essay-tailor.test.cjs (5 tests incl. clinical-persona themes, empty-profile typed blocker, non-essay negative).
- **STATUS:** ENFORCED

### FR-279 — Outreach plan/state turns carry their typed record (BUG-108)
- **FORBIDDEN:** An outreach plan/state turn returning prose alone, or carrying its product only under a handler-private key no reader consumes; every no-campaign branch carries its typed plan/state record as payload + artifact (zeroed/empty records for empty states, never estimated numbers).
- **FROM:** Residual lane 2026-10-14 — 19 Outreach scenarios failed doorstep + A4 in the true-score run because the no-campaign branches never carried their product where the completion chain reads.
- **ENFORCEMENT:** tests/career-outreach-completion.test.cjs (39 tests: record kind + elements + artifact per canonical ask) + run-grand.cjs BUG-108 element-keyed branches + Outreach re-run grader-v2 20/20 (outreach-fix-index.json).
- **STATUS:** ENFORCED

### FR-280 — Ask counts parse tolerantly where honesty sentences depend on them (BUG-106)
- **FORBIDDEN:** A count pattern that requires the number to touch its noun, so a modified count ("175 middle-market bankers") parses as no count and the shortfall/honesty sentence silently never fires.
- **FROM:** Residual lane 2026-10-14 — SC-025 failed H-5 because handleTierMix's regex missed the ask's own count.
- **ENFORCEMENT:** tests/career-outreach-completion.test.cjs SC-025 test (record requested_total=175 + reply states 175 and the true 0).
- **STATUS:** ENFORCED

### FR-281 — Empty-state answers never open as bare refusals (BUG-107)
- **FORBIDDEN:** An honest empty-state answer opening with a bare "No …" refusal shape; it leads with the state and offers the alternative as a readable next step.
- **FROM:** Residual lane 2026-10-14 — SC-044's empty digest tripped REFUSAL_NO_ALTERNATIVE on an honest answer.
- **ENFORCEMENT:** tests/career-outreach-completion.test.cjs SC-044 test (digest record + no bare-refusal opening).
- **STATUS:** ENFORCED

### FR-285 — A company-file reply is composed from that file's sections, picked by the ask's angle (BUG-087)
- **FORBIDDEN:** Serving one framed summary text for multiple company-file asks, or claiming a file is "thin" without reading the fields the file actually carries (hiring_bar_summary / compensation_notes / cadence / routes / thesis prose lives under `statement`).
- **FROM:** Template-breakup lane 2026-10-14 — 23 Intelligence asks shared one text; the "thin file" sentence was false for all 38 files on disk because the field reader never read `statement`.
- **ENFORCEMENT:** tests/career-template-breakup-guard.test.cjs BUG-087 (pairwise non-identity across the 23 asks + grounding + each reply must carry a 6-word run from its own file's sections).
- **STATUS:** ENFORCED

### FR-286 — Negotiation advice is composed per ask shape from the shape's own product (BUG-088)
- **FORBIDDEN:** One advice paragraph (method + benchmark sentence + "paste the offer letter") serving materially different negotiation asks — intake, benchmark, comparison, extension, below-floor, equity, script, return offer, expectation, exploding offer, leverage, withdrawal, referral-out.
- **FROM:** Template-breakup lane 2026-10-14 — 13 asks byte-identical; 128's per-shape products existed and were never consulted by the fallback.
- **ENFORCEMENT:** tests/career-template-breakup-guard.test.cjs BUG-088 (pairwise non-identity + per-shape answer markers + the bench product still carried on every branch).
- **STATUS:** ENFORCED

### FR-287 — A reply names a set as the set, never as one member (BUG-089)
- **FORBIDDEN:** Attributing a plan, answer, or artifact to a single member of a set the user asked about (an MBB-wide ask answered as a plan "for Bain & Company"); naming any entity the ask did not name and typed product state does not carry.
- **FROM:** Template-breakup lane 2026-10-14 — SC-185 flipped PASS→FAIL in the re-judge: 127's casePrepPlan text was built from the set's first file while its own record named the set.
- **ENFORCEMENT:** tests/career-template-breakup-guard.test.cjs BUG-089 (set text names the set; single-firm control; SC-185 through the chat path + reply grounding across all six template groups).
- **STATUS:** ENFORCED

### FR-288 — No shared fallback paragraph may serve two different referral asks (BUG-109)
- **FORBIDDEN:** A graph/referral fallback composition (ranked-paths paragraph, mini-campaign text) delivered for more than one ask shape; a mini-campaign sized by a default when the ask stated its own size or range.
- **FROM:** Template-breakup lane 2026-10-14 — 17 asks byte-identical at the true-score build (breakup branches landed as BUG-098; the residual SC-100/SC-170 pair shared the mini-campaign composition, both sized to a default 8 neither ask stated).
- **ENFORCEMENT:** tests/career-template-breakup-guard.test.cjs BUG-109 (pairwise non-identity + grounding across all 19 warm-path asks).
- **STATUS:** ENFORCED

### FR-289 — A campaign plan names the firms the user named; a default set is spoken only as a proposal (BUG-110)
- **FORBIDDEN:** Expanding a named firm into its firm set in the spoken plan (a Google ask planned for Meta/Apple/Amazon/Netflix); presenting a vague ask's default firm set as the user's chosen target; letting a default overwrite the ask's own role or industry.
- **FROM:** Template-breakup lane 2026-10-14 — 124's first-alias expansion replaced named firms, the vague default assigned bulge-bracket firms as if chosen, and a seed-founder ask was re-dressed as "120 investment bankers".
- **ENFORCEMENT:** tests/career-template-breakup-guard.test.cjs BUG-110 (32 plan asks pairwise distinct + named-firm and proposal assertions + parseTarget recognizer units: full name / unique token / abbreviation / raw-capital short names; "follow-ups" never yields UPS, "Chicago" never yields Chicago Ventures).
- **STATUS:** ENFORCED

### FR-290 — A tailor ask's named target is resolved or honestly stopped; the closing is composed per chain context (BUG-111)
- **FORBIDDEN:** Tailoring a substitute role under a named firm's ask (the pool's top role tailored for Goldman/McKinsey/Palantir/Big Law asks); one identical closing block (saved line + grounded line + next step) across batch, variant, discovery, and direct tailor chains.
- **FROM:** Template-breakup lane 2026-10-14 — the chain resolved companies only by "at X"/full-name matching, so named-firm asks fell into discovery and wore a substitute artifact; 14 asks shared one skeleton.
- **ENFORCEMENT:** tests/career-template-breakup-guard.test.cjs BUG-111 (15 asks pairwise distinct; artifacts preserved where they existed; named firm with no posting stops as tailor_needs_posting carrying that firm's file fact and typed company/payload; a category is stopped as a category).
- **STATUS:** ENFORCED

## Summary (machine-checkable)

Counts: ENFORCED 194 · GUARDED-RED 1 · HARD-SHUT 1 · UNENFORCED 91 · TOTAL 287

| rule | status | enforcement |
|---|---|---|
| FR-001 (BUG-001) | ENFORCED | tests/career-jobs.test.cjs APPE-001 adapter test + tests/career-profile.test.cjs (canonical-persona reads) |
| FR-002 (BUG-002) | ENFORCED | scripts/validate-cir.cjs over packages/career-data/cirs/*.json exits 0 (20/20 at fix time); the gate script is the permanent replay. |
| FR-003 (BUG-003) | ENFORCED | tests/career-track.test.cjs cooldown test asserts the labeled default + reopen date |
| FR-004 (BUG-004) | ENFORCED | tests/career-prep.test.cjs NO_CIR assertions (composeBrief/salaryPrep/rejectionPivot) |
| FR-005 (BUG-005) | ENFORCED | tests/career-prep.test.cjs 'normalizeCir handles object-stage and claim-stage shapes' |
| FR-006 (BUG-006) | ENFORCED | tests/career-negotiation.test.cjs NEGO-001 offer-B test (annual_bonus null, cliff '1-year'). |
| FR-007 (BUG-007) | ENFORCED | tests/career-negotiation.test.cjs BUG-003 regression (HRT $5,800/wk + D.E |
| FR-008 (BUG-008) | ENFORCED | tests/career-outreach-w03.test.cjs applyListOps test (VP removed, count exact). |
| FR-009 (BUG-009) | ENFORCED | tests/career-outreach-w03.test.cjs BUG-005 regression test (positive=4 from replayed fixture replies). |
| FR-010 (BUG-010) | ENFORCED | tests/career-outreach.test.cjs runs 28/28 on the merged tree; the stale-entry correction in the ledger confirms 124 is on pivot/career wi… |
| FR-011 (BUG-011) | UNENFORCED | UNENFORCED |
| FR-012 (BUG-012) | ENFORCED | tests/career-apply.test.cjs (the 132 apply-rail suite; ledger records 118/118 engine tests across the apply suites after merge). |
| FR-013 (BUG-013) | ENFORCED | tests/career-outreach.test.cjs + career-outreach-w03 + career-sc-w01 suites green after the true three-way rebuild; the adopted merge rul… |
| FR-014 (BUG-014) | ENFORCED | tests/career-prep.test.cjs 15/15 on the merged corpus. |
| FR-015 (BUG-015) | ENFORCED | tests/career-outreach-ext-w02.test.cjs monitorHealth test (100 attempted, 6 bounces → 6%, breaker tripped) |
| FR-016 (BUG-016) | ENFORCED | tests/career-outreach.test.cjs 28/28 in the worktree after the verbatim import; stale-entry correction confirms the module is on pivot/ca… |
| FR-017 (BUG-017) | ENFORCED | All outreach suites 47/47 after the rebuild from pristine sources; the verify-before-commit rule is recorded in this ledger entry and is … |
| FR-018 (BUG-018) | ENFORCED | tests/career-discover.test.cjs BUG-002 replay (score identical with/without the unproven mention). |
| FR-019 (BUG-019) | ENFORCED | tests/career-discover.test.cjs BUG-003 replay (nurse → Data/ML, international → SWE, canonical → SWE+Finance). |
| FR-020 (BUG-020) | UNENFORCED | UNENFORCED |
| FR-021 (BUG-021) | ENFORCED | tests/career-discover.test.cjs BUG-005 replay (3 distinct job_ids, a real REQ id still wins). |
| FR-022 (BUG-022) | ENFORCED | tests/career-intel.test.cjs BUG-003 replay: composeThesis + verifyThesis over EVERY shipped CIR. |
| FR-023 (BUG-023) | ENFORCED | tests/career-packets.test.cjs SC-100 test pins the plan/record-only seam |
| FR-024 (BUG-024) | ENFORCED | tests/career-packets.test.cjs 'SC-102 ATS check' test. |
| FR-025 (BUG-025) | ENFORCED | tests/career-intel.test.cjs INTL-003 replay composing EVERY corpus CIR (20/20 verify + lint). |
| FR-026 (BUG-026) | ENFORCED | tests/career-graph.test.cjs (Datadog brief OK via the vendored CIRs) |
| FR-027 (BUG-027) | ENFORCED | tests/career-graph.test.cjs bonus-intel test (sourced_bonus_count=0, amounts null). |
| FR-028 (BUG-028) | ENFORCED | tests/career-graph.test.cjs prep test (raw CIR throws TypeError; adapted Stripe + Datadog briefs OK) |
| FR-029 (BUG-029) | ENFORCED | tests/career-w11-ext.test.cjs 'BUG-141 adapter' (asserts the raw crash AND the adapted OK compose) |
| FR-030 (BUG-030) | ENFORCED | tests/career-w11-ext.test.cjs SC-215 BUG-142 guard (quotes 'Senior Software Engineer' + 'NOT your anchor') |
| FR-031 (BUG-031) | UNENFORCED | UNENFORCED |
| FR-032 (BUG-032) | ENFORCED | tests/career-graph.test.cjs SC-145 test. |
| FR-033 (BUG-033) | ENFORCED | tests/career-apply.test.cjs inbox-reconciliation test (failed before, passes after). |
| FR-034 (BUG-034) | ENFORCED | tests/career-apply.test.cjs BUG-005 replay test + SC-068 (Match pool 0 → 63). |
| FR-035 (BUG-035) | ENFORCED | tests/career-onboarding.test.cjs BUG-002/003/004 regression test + SC-002 rerun. |
| FR-036 (BUG-036) | ENFORCED | tests/career-onboarding.test.cjs regression + SC-015 rerun. |
| FR-037 (BUG-037) | ENFORCED | tests/career-onboarding.test.cjs regression + SC-005 rerun. |
| FR-038 (BUG-038) | ENFORCED | tests/career-onboarding.test.cjs BUG-005 regression + ACCS-003 T8 test |
| FR-039 (BUG-039) | ENFORCED | tests/career-apply3.test.cjs BUG-006 replay + SC-114 rerun. |
| FR-040 (BUG-040) | ENFORCED | tests/career-outreach.test.cjs 28/28 on the branch after the verbatim import; module confirmed on pivot/career by the stale-entry correct… |
| FR-041 (BUG-041) | ENFORCED | tests/career-sc-w01.test.cjs (3 tests: default unchanged, priority reorders score + buildList, rankContacts honors it). |
| FR-042 (BUG-042) | ENFORCED | tests/career-portal-browser.test.cjs captcha-at-open + captcha-at-review tests assert screenshot_ref is a path to a real PNG (magic bytes). |
| FR-043 (BUG-043) | ENFORCED | tests/career-portal-browser.test.cjs |
| FR-044 (BUG-044) | ENFORCED | tests/career-portal-browser.test.cjs runs green with UPMORE_SEAM_TMP set; the relocation lives in module 150's ensureHelper code. |
| FR-045 (BUG-045) | ENFORCED | tests/career-portal-browser.test.cjs |
| FR-046 (BUG-046) | ENFORCED | tests/career-tailor-dates-dedupe.test.cjs (6 tests: dated entries, dedupe + drop record, Certifications section, parse-check duplicate FA… |
| FR-047 (BUG-047) | ENFORCED | tests/career-portal-browser.test.cjs stays 9/9; the live Greenhouse doorstep re-run reaching the field stage is recorded in docs/career/e… |
| FR-048 (BUG-048) | ENFORCED | tests/career-hash-leak-guard.test.cjs (9 tests: composer-seam HASH_RE rules + SC-087/090/092/093 + SC-104 replays; typed records keep the… |
| FR-049 (BUG-049) | ENFORCED | tests/career-hash-leak-guard.test.cjs SC-087/090/092/093 replays (user's lead present AND generic substitution absent) |
| FR-050 (FIN-A1-1..7) | ENFORCED | tests/career-prep.test.cjs (22/22 at fix time, per the finisher summary in the ledger). |
| FR-051 (BUG-A2-01..10) | ENFORCED | tests/career-prep.test.cjs (22/22 at fix time, per the finisher summary in the ledger) |
| FR-052 (FIN-C-001..003) | ENFORCED | Replay tests written fail-first in-lane per the finisher summary; the summary names no single test file for Lane C, so this cites the led… |
| FR-053 (BUG-D1-01) | ENFORCED | tests/career-track-d1.test.cjs (8 tests, all failed pre-fix). |
| FR-054 (BUG-D1-02) | ENFORCED | tests/career-track-d1.test.cjs (8 tests, all failed pre-fix). |
| FR-055 (BUG-D1-03) | ENFORCED | tests/career-track-d1.test.cjs (8 tests, all failed pre-fix). |
| FR-056 (BUG-D1-04) | ENFORCED | tests/career-track-d1.test.cjs (8 tests, all failed pre-fix). |
| FR-057 (BUG-D1-05) | ENFORCED | tests/career-track-d1.test.cjs (8 tests, all failed pre-fix). |
| FR-058 (BUG-D1-06) | ENFORCED | tests/career-track-d1.test.cjs (8 tests, all failed pre-fix). |
| FR-059 (BUG-D1-07) | ENFORCED | tests/career-track-d1.test.cjs (8 tests, all failed pre-fix). |
| FR-060 (BUG-D1-08) | ENFORCED | tests/career-track-d1.test.cjs (8 tests, all failed pre-fix). |
| FR-061 (BUG-D1-09) | ENFORCED | tests/career-track-d1.test.cjs (8 tests, all failed pre-fix). |
| FR-062 (FIN-E-001) | UNENFORCED | UNENFORCED |
| FR-063 (FIN-E-002) | ENFORCED | tests/career-outreach.test.cjs 'FIN-E-002 replay' (124 draftFor supplies the subject, de-conjugates, collapses doubled articles). |
| FR-064 (FIN-E-003) | ENFORCED | tests/career-track.test.cjs digest test assertions (126 weeklyDigest plain labels + pluralization). |
| FR-065 (FIN-E-004) | UNENFORCED | UNENFORCED |
| FR-066 (FIN-E-005) | UNENFORCED | UNENFORCED |
| FR-067 (FIN-E-006) | UNENFORCED | UNENFORCED |
| FR-068 (FIN-E-007) | UNENFORCED | UNENFORCED |
| FR-069 (FIN-E-008) | UNENFORCED | UNENFORCED |
| FR-070 (FIN-E-009) | UNENFORCED | UNENFORCED |
| FR-071 (FIN-E-010) | UNENFORCED | UNENFORCED |
| FR-072 (FIN-E-011) | UNENFORCED | UNENFORCED |
| FR-073 (FIN-E-012) | UNENFORCED | UNENFORCED |
| FR-074 (FIN-E-013) | UNENFORCED | UNENFORCED |
| FR-075 (FIN-F-001) | UNENFORCED | UNENFORCED |
| FR-076 (FIN-F-002) | UNENFORCED | UNENFORCED |
| FR-077 (FIN-F-003) | UNENFORCED | UNENFORCED |
| FR-078 (FIN-F-004) | UNENFORCED | UNENFORCED |
| FR-079 (DD-1 (AP08)) | ENFORCED | tests/career-gauntlet-r2-integration.test.cjs (job_closed guard bridge) + tests/career-doorstep-safety-regression.test.cjs SAFETY-3. |
| FR-080 (DD-2 (AP17/NW18)) | ENFORCED | Round-2 intent ownership in 142, guarded by the r2 suites (tests/career-gauntlet-r2-integration.test.cjs and the r2 family). |
| FR-081 (DD-3 (AP18)) | ENFORCED | tests/career-gauntlet-r2-integration.test.cjs (approval_cancelled bridge) + tests/career-doorstep-safety-regression.test.cjs SAFETY-2. |
| FR-082 (DD-4 (AP20)) | ENFORCED | tests/career-gauntlet-r2-integration.test.cjs (duplicate bridge) + tests/career-doorstep-safety-regression.test.cjs SAFETY-4. |
| FR-083 (DD-5 (AP22)) | ENFORCED | r2 suites + tests/career-doorstep-safety-regression.test.cjs (deleted receipt → unknown_outcome leg). |
| FR-084 (DD-6 (AP23)) | ENFORCED | tests/career-gauntlet-r2-integration.test.cjs (fact-correction invalidation bridge) + tests/career-doorstep-safety-regression.test.cjs SA… |
| FR-085 (DD-7 (NW13)) | ENFORCED | r2 suites (draft supersede path). |
| FR-086 (DD-8 (NW17)) | ENFORCED | tests/career-gauntlet-g4.test.cjs (processInboxEvent ×9, refused_suppressed). |
| FR-087 (DD-9 (SH03)) | ENFORCED | r2 intent ownership (validity answered from state), in the r2 suites. |
| FR-088 (DD-10 (NW18)) | ENFORCED | tests/career-killswitch-ra4.test.cjs (honest halted-vs-unverified reporting; Lane A SC-300 fix). |
| FR-089 (DD-11 = NWD-01) | UNENFORCED | UNENFORCED |
| FR-090 (DD-12 = NWD-02) | UNENFORCED | UNENFORCED |
| FR-091 (SHX-1 (SH02/SH10)) | UNENFORCED | UNENFORCED |
| FR-092 (SHX-2 (SH04)) | UNENFORCED | UNENFORCED |
| FR-093 (SHX-3 (SH06)) | UNENFORCED | UNENFORCED |
| FR-094 (SHD-1 (SH07)) | ENFORCED | tests/career-gauntlet-g5.test.cjs (SHD-1 ×4). |
| FR-095 (SHD-2 (SH12)) | UNENFORCED | UNENFORCED |
| FR-096 (SHD-3 (SH11)) | ENFORCED | tests/career-gauntlet-g5.test.cjs (SHD-3 ×5; 122 real deletion + retention declaration) |
| FR-097 (MID-1) | ENFORCED | tests/career-gauntlet-g3.test.cjs (MID-1…8 all present). |
| FR-098 (MID-2) | ENFORCED | tests/career-gauntlet-g3.test.cjs (MID-1…8 all present). |
| FR-099 (MID-3) | ENFORCED | tests/career-gauntlet-g3.test.cjs (MID-1…8 all present). |
| FR-100 (MID-4) | ENFORCED | tests/career-gauntlet-g3.test.cjs (MID-1…8 all present). |
| FR-101 (MID-5) | ENFORCED | tests/career-gauntlet-g3.test.cjs (MID-1…8 all present) |
| FR-102 (MID-6) | ENFORCED | tests/career-gauntlet-g3.test.cjs (MID-1…8 all present). |
| FR-103 (MID-7) | ENFORCED | tests/career-gauntlet-g3.test.cjs (MID-1…8 all present). |
| FR-104 (MID-8) | ENFORCED | tests/career-gauntlet-g3.test.cjs (MID-1…8 all present). |
| FR-105 (CODEX-MI-1) | UNENFORCED | UNENFORCED |
| FR-106 (CODEX-MI-2) | UNENFORCED | UNENFORCED |
| FR-107 (CODEX-MI-3) | UNENFORCED | UNENFORCED |
| FR-108 (CODEX-MI-4) | UNENFORCED | UNENFORCED |
| FR-109 (CODEX-MI-5) | UNENFORCED | UNENFORCED |
| FR-110 (CODEX-MI-6) | UNENFORCED | UNENFORCED |
| FR-111 (APD-1 (AP13)) | ENFORCED | tests/career-gauntlet-g2.test.cjs (blocker state machine; LATE_MATERIAL assertions). |
| FR-112 (APD-2 (AP05)) | ENFORCED | tests/career-gauntlet-g5.test.cjs (APD-2 ×8). |
| FR-113 (APD-3) | UNENFORCED | UNENFORCED |
| FR-114 (APD-4) | ENFORCED | tests/career-render.test.cjs 25/25 + the 142 artifact passthrough (gauntlet C11 test); substantially resolved by the CA-02 build (module … |
| FR-115 (APD-5) | ENFORCED | tests/career-gauntlet-g5.test.cjs (APD-5 ×4). |
| FR-116 (APD-6) | UNENFORCED | UNENFORCED |
| FR-117 (FC-AP-1) | UNENFORCED | UNENFORCED |
| FR-118 (FC-AP-2) | UNENFORCED | UNENFORCED |
| FR-119 (FC-AP-3) | UNENFORCED | UNENFORCED |
| FR-120 (NWD-04) | UNENFORCED | UNENFORCED |
| FR-121 (NWD-05 (NW20)) | ENFORCED | tests/career-gauntlet-g4.test.cjs (delivery status re-read). |
| FR-122 (NWD-06) | ENFORCED | tests/career-gauntlet-g4.test.cjs processInboxEvent (engine built in G4; chat reachability rides the same routing program). |
| FR-123 (CGD-1) | UNENFORCED | UNENFORCED |
| FR-124 (FC-CG-1) | UNENFORCED | UNENFORCED |
| FR-125 (FC-CG-2) | UNENFORCED | UNENFORCED |
| FR-126 (FC-CG-3) | UNENFORCED | UNENFORCED |
| FR-127 (FC-CG-4) | UNENFORCED | UNENFORCED |
| FR-128 (FC-CG-5) | UNENFORCED | UNENFORCED |
| FR-129 (R1 root) | ENFORCED | tests/career-gauntlet-r1.test.cjs 9/9 (module 142 built). |
| FR-130 (R2 root) | ENFORCED | tests/career-gauntlet-r2.test.cjs + r2a + r2b suites (module 143 wrapper). |
| FR-131 (R3 root) | ENFORCED | tests/career-gauntlet-r3.test.cjs 7/7 (module 141 + the 130 write path). |
| FR-132 (Pilot runner) | ENFORCED | tests/career-gauntlet-rerun.test.cjs (computed grading) + the grader-v2 mutation lineage. |
| FR-133 (SC-287 R-B11 (S0)) | ENFORCED | tests/career-router-wedge.test.cjs 'A4 SC-287…' + tests/career-quality-contracts.test.cjs SC-287 replay. |
| FR-134 (Router name parsing) | UNENFORCED | UNENFORCED |
| FR-135 (Fixture inconsistency) | UNENFORCED | UNENFORCED |
| FR-136 (U02) | UNENFORCED | UNENFORCED |
| FR-137 (A1) | ENFORCED | GUARD: tests/career-quality-routing.test.cjs + the routing-expectations set + the fresh-300 routing axis (266/300 correct-tool, didn't-ca… |
| FR-138 (A2) | ENFORCED | GUARD: tests/career-quality-routing.test.cjs + the routing-expectations set + the fresh-300 routing axis (266/300 correct-tool, didn't-ca… |
| FR-139 (A3 (= GG-1)) | ENFORCED | tests/career-router-wedge.test.cjs + tests/career-gauntlet-regressions.test.cjs ACID tests |
| FR-140 (A4 single: SC-277) | ENFORCED | tests/career-router-wedge.test.cjs 'A4 SC-277…' + tests/career-quality-contracts.test.cjs SC-277 |
| FR-141 (A4 single: SC-062) | ENFORCED | tests/career-router-wedge.test.cjs 'A4 SC-062…' |
| FR-142 (A4 single: SC-111) | ENFORCED | tests/career-router-wedge.test.cjs 'A4 SC-111…' + grader ARTIFACT_MATCH with mutant M-16 in tests/career-quality-grader.test.cjs |
| FR-143 (A5: SC-286) | ENFORCED | tests/career-router-wedge.test.cjs 'A5 SC-286…' + tests/career-quality-contracts.test.cjs SC-286. |
| FR-144 (A6: SC-065 engine leg) | ENFORCED | tests/career-jobs-domain.test.cjs 8/8 ('PM ask over an SWE-only pool: honest empty…') |
| FR-145 (Spec 2 §2.3) | ENFORCED | tests/career-spec-gates.test.cjs mass-close ×2 (the gate is the replay; fail-before recorded). |
| FR-146 (Spec 3 H3) | ENFORCED | tests/career-spec-gates.test.cjs H3 (named-entity rule). |
| FR-147 (124 verification) | ENFORCED | tests/career-spec1-gates.test.cjs (#6/#7/#8 legs; normVerification, fail-closed). |
| FR-148 (146 negation) | ENFORCED | tests/career-spec1-gates.test.cjs (146 negation). |
| FR-149 (146 relationship) | ENFORCED | tests/career-spec1-gates.test.cjs (146 relationship). |
| FR-150 (146 currency) | ENFORCED | tests/career-intake-real-data.test.cjs 6/6 (4/6 red pre-fix). |
| FR-151 (146 email status) | ENFORCED | tests/career-intake-real-data.test.cjs (31/31 labels preserved post-fix). |
| FR-152 (Render trio (Lane B)) | ENFORCED | tests/career-render.test.cjs 25/25 (the R7 test is the date replay). |
| FR-153 (Secret scan) | ENFORCED | tests/no-secrets.test.cjs control test (runtime-assembled real-shaped JWT still caught; full tracked-file scan 0 findings). |
| FR-154 (W3 draft set) | ENFORCED | tests/career-outreach.test.cjs replay tests + the QA gate itself (placeholder_content HARD BLOCK, fact_body_mismatch, recipient_departed,… |
| FR-155 (Grader-v1) | ENFORCED | tests/career-quality-grader.test.cjs + mutants M-16 (SC-111-shaped) / M-17 (HONEST_YIELD) in the mutation suite; corrected baseline 0/300… |
| FR-156 (SC-300 / R-A4) | ENFORCED | tests/career-killswitch-ra4.test.cjs (R-A4 legs) |
| FR-157 (Track T-141) | ENFORCED | tests/career-track-negotiation-fix.test.cjs FIX-T1…T6. |
| FR-158 (Track T-126) | ENFORCED | tests/career-track-negotiation-fix.test.cjs FIX-T8 / FIX-T10 / FIX-T11 (+ FIX-T9 class) |
| FR-159 (Track T-128) | ENFORCED | tests/career-track-negotiation-fix.test.cjs (17 tests, 15 red before). |
| FR-160 (Outreach O-146) | ENFORCED | tests/career-outreach-referrals-wave.test.cjs 'D2 replay: intake records are graph-ready…' |
| FR-161 (Outreach O-124a) | ENFORCED | tests/career-outreach-referrals-wave.test.cjs 'D1 replay…' + 'D1 contract: 141 emitOutreachDraft…' |
| FR-162 (Outreach O-124b) | ENFORCED | tests/career-outreach-referrals-wave.test.cjs (SC-019 replay + 8/8) |
| FR-163 (OAuth scope) | UNENFORCED | UNENFORCED |
| FR-164 (120 connect copy) | UNENFORCED | UNENFORCED |
| FR-165 (SEND-DISABLED (owner ruling 2026-10-13 ~19:45)) | HARD-SHUT | HARD-SHUT at the sink in module 124 (commit 3d0ecd1) + tests/career-send-disabled.test.cjs (8 tests asserting the SEND_DISABLED refusal a… |
| FR-166 (IB-TN-2) | UNENFORCED | fix landed (Wave A scrub, 32c86ce; Track re-grade confirms the S0 no longer fires) |
| FR-167 (IB-TN-3) | UNENFORCED | fix landed (245a6e1, claim de-claimed) |
| FR-168 (IB-TN-4) | UNENFORCED | fix landed (245a6e1, alternative in the headline) |
| FR-169 (IB-TN-5) | UNENFORCED | fix landed (245a6e1 + the Wave B router-boundary H-12 guarantee) |
| FR-170 (IB-TN-9) | UNENFORCED | fix landed (SC-209 verified PASS on fresh records at 245a6e1) |
| FR-171 (IB-AP-3) | UNENFORCED | fix landed (ce2529b; SC-093 PASS fresh, SC-087/090/092 honest board answers) |
| FR-172 (IB-AP-6) | UNENFORCED | fix landed (245a6e1, H-12 ending guarantee at the router boundary) |
| FR-173 (IB-AP-7) | UNENFORCED | fix landed (ce2529b; SC-078/080 H-7 clear) |
| FR-174 (IB-TN-1) | UNENFORCED | UNENFORCED |
| FR-175 (IB-TN-6) | UNENFORCED | UNENFORCED |
| FR-176 (IB-TN-7) | UNENFORCED | UNENFORCED |
| FR-177 (IB-TN-8) | UNENFORCED | UNENFORCED |
| FR-178 (SC-129 A4 nuance) | UNENFORCED | UNENFORCED |
| FR-179 (IB-1) | UNENFORCED | UNENFORCED |
| FR-180 (IB-2) | UNENFORCED | UNENFORCED |
| FR-181 (IB-3) | UNENFORCED | UNENFORCED |
| FR-182 (IB-AP-1) | UNENFORCED | UNENFORCED |
| FR-183 (IB-AP-2) | UNENFORCED | UNENFORCED |
| FR-184 (IB-AP-4) | UNENFORCED | UNENFORCED |
| FR-185 (IB-AP-5) | UNENFORCED | UNENFORCED |
| FR-186 (IB-AP-8) | UNENFORCED | UNENFORCED |
| FR-187 (IB-AP-9) | UNENFORCED | UNENFORCED |
| FR-188 (IB-AP-10) | UNENFORCED | UNENFORCED |
| FR-189 (H-7 checker FP) | UNENFORCED | UNENFORCED |
| FR-190 (Data: research headline) | ENFORCED | tests/career-intake-real-data.test.cjs ground-truth assertions (per-record flags treated as truth). |
| FR-191 (Data: banker list v1) | UNENFORCED | UNENFORCED |
| FR-192 (BUG-2026-10-14-GRAPH-SHAPE) | ENFORCED | tests/career-ib-outreach-integration.test.cjs IB-2 test. |
| FR-193 (BUG-2026-10-14-ROUTING-COLLAPSE) | ENFORCED | tests/career-router-wedge.test.cjs (canonical 30/30, paraphrases 120/120); routing fix acd9b39 + Waves A/B + IB landings. |
| FR-194 (BUG-2026-10-14-H12-LAST-SENTENCE) | ENFORCED | tests/career-router-wedge.test.cjs + final-run H-12 counts; pilot-lib chatTurn applies the guarantee to 120/130/141 results (fallback/hon… |
| FR-195 (BUG-2026-10-14-HALT-CLAIM) | ENFORCED | tests/career-ibtn-integration.test.cjs guards + the composer-table re-measurement. |
| FR-196 (BUG-2026-10-14-SUBMIT-CLAIM) | UNENFORCED | Composer-table re-measurement (rows 21/22 same class) |
| FR-197 (BUG-2026-10-14-TOTAL-STOP-CLAIM) | UNENFORCED | UNENFORCED as a test |
| FR-198 (BUG-2026-10-14-POOL-DATA) | ENFORCED | tests/career-pool-coverage.test.cjs (merged pool ≥2 PM + ≥2 Data/ML; pinned corpus still 0 PM). |
| FR-199 (BUG-2026-10-14-TN1A-CONFLICT) | GUARDED-RED | GUARDED-RED |
| FR-200 (BUG-2026-10-14-DD11-PERSIST) | UNENFORCED | UNENFORCED |
| FR-201 (BUG-2026-10-14-BUG030-WRAP) | UNENFORCED | UNENFORCED at engine level |
| FR-202 (BUG-2026-10-14-GMAIL-SCOPE) | UNENFORCED | UNENFORCED |
| FR-203 (BUG-2026-10-14-OVERSCRUB) | ENFORCED | tests/career-gauntlet-r1.test.cjs + tests/career-gauntlet-r2.test.cjs are the pinning suites the adopted rule requires every copy wave to… |
| FR-204 (BUG-2026-10-14-SC294-CLASS) | UNENFORCED | UNENFORCED |
| FR-205 (GAP-2026-10-14-JOB-ALERTING) | ENFORCED | UNENFORCED |
| FR-206 (FV-1) | ENFORCED | GUARDED-RED |
| FR-207 (FV-2) | ENFORCED | GUARDED-RED |
| FR-208 (FV-3) | ENFORCED | GUARDED-RED |
| FR-209 (FV-4) | ENFORCED | GUARDED-RED |
| FR-210 (FV-5) | ENFORCED | GUARDED-RED |
| FR-211 (FV-6) | ENFORCED | tests/career-tailor-dates-dedupe.test.cjs Certifications-section test + FV-6 in tests/career-four-vertical.test.cjs, flipped green by the… |
| FR-212 (FV-7) | ENFORCED | GUARDED-RED |
| FR-213 (FV-8) | ENFORCED | GUARDED-RED |
| FR-214 (FV-9) | ENFORCED | GUARDED-RED |
| FR-215 (FV-10) | ENFORCED | GUARDED-RED |
| FR-216 (FV-11) | ENFORCED | GUARDED-RED |
| FR-217 (FV-G1 (keep-guard)) | ENFORCED | tests/career-four-vertical.test.cjs FV-G1 |
| FR-218 (FV-G2 (keep-guard)) | ENFORCED | tests/career-four-vertical.test.cjs FV-G2 |
| FR-219 (SS-4) | ENFORCED | GUARDED-RED |
| FR-220 (SS-5) | ENFORCED | GUARDED-RED |
| FR-221 (SS-10) | ENFORCED | GUARDED-RED |
| FR-222 (SS-11) | ENFORCED | GUARDED-RED |
| FR-223 (SS-1) | ENFORCED | GUARDED-RED |
| FR-224 (SS-2) | ENFORCED | GUARDED-RED |
| FR-225 (SS-3) | ENFORCED | GUARDED-RED |
| FR-226 (SS-6) | ENFORCED | GUARDED-RED |
| FR-227 (SS-7) | ENFORCED | GUARDED-RED |
| FR-228 (SS-8) | ENFORCED | GUARDED-RED |
| FR-229 (SS-9) | ENFORCED | GUARDED-RED |
| FR-230 (SS-12) | ENFORCED | GUARDED-RED |
| FR-231 (SS-13) | ENFORCED | GUARDED-RED |
| FR-232 (SS-G1 (keep-guard)) | ENFORCED | tests/career-six-sector.test.cjs SS-G1 |
| FR-233 (SS-G2 (keep-guard)) | ENFORCED | tests/career-six-sector.test.cjs SS-G2 |
| FR-234 (D1) | ENFORCED | UNENFORCED |
| FR-235 (D2) | ENFORCED | UNENFORCED |
| FR-236 (D3) | ENFORCED | UNENFORCED |
| FR-237 (D4) | ENFORCED | UNENFORCED |
| FR-238 (D5) | UNENFORCED | UNENFORCED |
| FR-239 (D6) | ENFORCED | UNENFORCED |
| FR-240 (D7) | ENFORCED | UNENFORCED |
| FR-241 (D8) | ENFORCED | UNENFORCED |
| FR-242 (D9) | ENFORCED | UNENFORCED |
| FR-243 (D10) | UNENFORCED | UNENFORCED |
| FR-244 (G1) | ENFORCED | UNENFORCED |
| FR-245 (G2) | ENFORCED | UNENFORCED |
| FR-246 (G3) | ENFORCED | UNENFORCED |
| FR-247 (G4) | UNENFORCED | UNENFORCED |
| FR-248 (G5) | UNENFORCED | UNENFORCED |
| FR-249 (G6) | ENFORCED | UNENFORCED |
| FR-250 (G7) | ENFORCED | UNENFORCED |
| FR-251 (IB-INTEL-1) | UNENFORCED | UNENFORCED |
| FR-252 (IB-INTEL-9) | UNENFORCED | UNENFORCED |
| FR-253 (B1 (HS-1/2/6)) | UNENFORCED | UNENFORCED |
| FR-254 (B2 (HS-3)) | UNENFORCED | UNENFORCED |
| FR-255 (B3 (HS-5)) | UNENFORCED | UNENFORCED |
| FR-256 (B4 (HS-4)) | UNENFORCED | UNENFORCED |
| FR-257 (B5 (HS-9)) | UNENFORCED | UNENFORCED as its own guard |
| FR-258 (B6 (HS-10/11)) | ENFORCED | tests/career-tailor-dates-dedupe.test.cjs (dedupe + drop record; parse-check duplicate_line and missing_dates FAIL rules) |
| FR-259 (B7 (HS-12)) | UNENFORCED | UNENFORCED |
| FR-260 (B8 (HS-13..16)) | UNENFORCED | UNENFORCED |
| FR-261 (Composer §1a) | ENFORCED | tests/career-router-wedge.test.cjs + the integrator-wave fix (the predicate now tests the LAST SENTENCE; see FR-211). |
| FR-262 (Composer §1b) | ENFORCED | pilot-lib chatTurn applies the guarantee to 120/130/141 results (integrator-wave fix, FR-194), guarded by tests/career-router-wedge.test.… |
| FR-263 (Repass: template substitution) | ENFORCED | UNENFORCED |
| FR-264 (Repass: generic closer) | ENFORCED | UNENFORCED |
| FR-265 (Repass: hash-in-chat) | ENFORCED | tests/career-hash-leak-guard.test.cjs |
| FR-266 (Gauntlet A1) | ENFORCED | tests/career-quality-routing.test.cjs + fresh-300 routing axis |
| FR-267 (Gauntlet A2) | ENFORCED | tests/career-quality-routing.test.cjs |
| FR-268 (Gauntlet A3) | ENFORCED | tests/career-router-wedge.test.cjs + tests/career-gauntlet-regressions.test.cjs ACID tests |
| FR-269 (Gauntlet A4) | ENFORCED | tests/career-router-wedge.test.cjs A4 tests + tests/career-quality-contracts.test.cjs |
| FR-270 (Gauntlet A5) | ENFORCED | tests/career-router-wedge.test.cjs 'A5 SC-286…' |
| FR-271 (Gauntlet A6) | ENFORCED | tests/career-jobs-domain.test.cjs 8/8 (engine leg) |
| FR-272 (BUG-098) | ENFORCED | tests/career-referrals-completion.test.cjs BUG-098 per-class producer-record tests |
| FR-273 (BUG-099) | ENFORCED | tests/career-referrals-completion.test.cjs populated referral test |
| FR-274 (BUG-100) | ENFORCED | tests/career-referrals-completion.test.cjs SC-150/SC-162 tests |
| FR-275 (BUG-101) | ENFORCED | tests/career-referrals-completion.test.cjs (30 payload tests + populated keep-warm) |
| FR-276 (BUG-102) | ENFORCED | run-grand.cjs BUG-102 branches + Referrals re-run grader-v2 30/30 (referrals-fix-index.json) |
| FR-277 (BUG-103) | ENFORCED | tests/career-referrals-completion.test.cjs populated SC-146 + tests/career-ib-outreach-integration.test.cjs IB-2/IB-2b |
| FR-278 (BUG-104) | ENFORCED | tests/career-essay-tailor.test.cjs (5 tests) |
| FR-279 (BUG-108) | ENFORCED | tests/career-outreach-completion.test.cjs (39 tests) + run-grand BUG-108 branches + outreach re-run 20/20 |
| FR-280 (BUG-106) | ENFORCED | tests/career-outreach-completion.test.cjs SC-025 test |
| FR-281 (BUG-107) | ENFORCED | tests/career-outreach-completion.test.cjs SC-044 test |
| FR-285 (BUG-087) | ENFORCED | tests/career-template-breakup-guard.test.cjs BUG-087 |
| FR-286 (BUG-088) | ENFORCED | tests/career-template-breakup-guard.test.cjs BUG-088 |
| FR-287 (BUG-089) | ENFORCED | tests/career-template-breakup-guard.test.cjs BUG-089 |
| FR-288 (BUG-109) | ENFORCED | tests/career-template-breakup-guard.test.cjs BUG-109 |
| FR-289 (BUG-110) | ENFORCED | tests/career-template-breakup-guard.test.cjs BUG-110 |
| FR-290 (BUG-111) | ENFORCED | tests/career-template-breakup-guard.test.cjs BUG-111 |

<!-- totals: total=287 enforced=194 guarded_red=1 hard_shut=1 unenforced=91 -->
