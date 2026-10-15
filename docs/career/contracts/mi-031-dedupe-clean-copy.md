# CONTRACT — MI-031 / BUG-212: cross-board dedupe eats the clean (and the new) copy

**Written:** 2026-10-15, BEFORE the fix. **Done-test source:** MI-031 on the master list.

## Defect statement (mechanism)

121's dedupe merges any two postings sharing company+title+city when they come from
different boards (req ids ignored cross-board) — with no recency limit and a
first-seen-wins survivor. Two losses follow:
1. **LA-0016:** a NEW Lever posting (CarePoint Health RN, req S16B-1057) merged into an
   older record of the same role; the survivor kept the old job_id, so diffNew saw
   nothing new — no alert, no gate record ("absorbed before the gate", Lane A).
2. **The worse copy wins:** the survivor is whichever copy arrived first; only its
   jd_text/posted_at/department can be upgraded, never its identity (url, job_id).

## Fix shape (121 dedupe only)

1. **Recency split:** copies whose posted_at are both known and more than 14 days apart
   are distinct openings — they never merge. (A cross-post lands within days; a fresh
   req a month later is a new opening of a recurring role.)
2. **Quality survivor:** when copies do merge, the cleaner copy (JD substance, then
   department presence) supplies the identity; sources/urls union, earliest posted_at
   and the longest JD are kept — order-independent.

## Done-test

Twin-pair replay set surfaces the clean copy 100%; LA-0016 replays correct (the new
posting survives dedupe with its own job_id and diffNew fires); DISC-003's cross-post
collapse still holds; existing 121 suites green; full sweep no worse than the MI-048
set; bug law (BUG-212 + FR-370, both register copies byte-identical).

## Results (2026-10-15, Crew A)

- **Fail-first:** the LA-0016 replay and the clean-copy test red; the cross-post pin green.
- **Post-fix:** tests/career-dedupe-clean-copy.test.cjs **3/3, pass^3**; 121 consumer
  suites **101/101**; full sweep **3,875 / 3,841 / 12** — exactly the MI-048 set.
- **Paperwork:** ledger BUG-212; register FR-370 in both copies, byte-identical
  (370 rules = 275 ENFORCED / 94 UNENFORCED / 1 HARD-SHUT).
- **Boundary kept:** the 14-day bound and the quality rule live entirely in 121's
  dedupe; snapshot/diff semantics (DISC-004) untouched and green.
