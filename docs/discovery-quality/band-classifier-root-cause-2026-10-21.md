# Root cause — the band classifier silently drops "internships" (and its whole morphological family)

**Package:** DISCO-QUALITY (O4 — a correct reply) · **Date:** 2026-10-21 · **Base:** cea914fe
**Scope of this note:** root cause + fix DESIGN for the code owner. No product code is edited here.
**Reproduction:** `docs/discovery-quality/repro-band-matrix.cjs` (run: `node docs/discovery-quality/repro-band-matrix.cjs`; exits 1 today — that is the repro).

## The measured fact

Direct calls into the production classifier (`packages/domain/121-career-jobs.js`, `seniorityBand`),
the same call shape the throughput lane measured on 2026-10-21 — 30 cells
(7 band phrases × 3 families ask-shaped, 7 realistic titles, 2 JD-shaped):

**15/30 cells bind as expected; 15 FAIL.** Every failure returns `mid`. The failures are
identical across SWE / Data/ML / Finance — this is not a family-rules bug.

| phrase (as typed) | expected | got | binds? |
|---|---|---|---|
| intern | intern | intern | yes |
| internship | intern | intern | yes |
| **internships** | intern | **mid** | **NO** |
| entry level | new_grad | new_grad | yes |
| **entry-level** | new_grad | **mid** | **NO** |
| early career | new_grad | new_grad | yes |
| **early careers** | new_grad | **mid** | **NO** |

Title-shaped failures include `Software Engineering Internships`, `Data Analyst Internships`,
`Finance Internships, Summer 2027`, `Entry-Level Software Engineer`, `Early Careers — Data Analyst`.
JD-shaped: a JD head saying "internships" also fails; "an intern" binds.

## The exact code path

`packages/domain/121-career-jobs.js`, `seniorityBand(title, jd)`:

- **Line 145 (title rule):** `/\b(intern|internship|co-op)\b/.test(t)`. The trailing `\b`
  requires a non-word character immediately after the token. In "internships" the next
  character after "internship" is `s` — a word character — so `internship` cannot match;
  `intern` fails the same way inside the longer word. The plural form falls through every
  later rule and lands on the default.
- **Line 164 (JD-head rule):** `/\b(intern|internship)\b/.test(j.slice(0, 300))` — the identical
  pattern, the identical failure. (Note the drift: line 145 knows `co-op`, line 164 does not —
  the two sites are already diverging copies of one idea.)
- **Line 162 (new_grad rule):** `/\b(new grad|early career|entry level|graduate program|rotational|university)\b/`.
  Two failures here: "entry level" is spelled with a literal space, so the hyphenated form
  users and titles actually carry ("entry-level") never matches; and the group's trailing
  `\b` kills the plural "early careers" exactly as at line 145.
- **Line 167 (fallthrough):** `return "mid"` — with **no signal**. A posting whose band failed
  to bind is indistinguishable from a genuinely mid-level posting everywhere downstream.
  The seasonal-analyst rescue (line 155) does not fire for these titles: it requires an
  analyst/associate noun, so "Finance Internships, Summer 2027" still falls to `mid`.

Consumers inherit the stamp silently: the shelf is band-stamped at load
(`supabase/functions/_shared/career_pool.js:116`, and 142 normalization at
`packages/domain/142-career-router.js:293`), so a plural-titled internship already on the
shelf is a "mid" posting for every later filter. Ask-side, the same function is the band
authority for the user's own words — which is how "find data analyst **internships** in
Chicago" (MUSE-F-006's input) can lose the band the user plainly stated, compounding
MUSE-F-005's window problem.

## Why this is a class, not a typo

Band binding is done by exact-token regexes with hard word boundaries on both sides.
Any morphological variant of a band token — plural (`internships`, `co-ops`, `fellowships`),
hyphenation (`entry-level`), or derived form (`traineeship`) — fails to bind, silently,
and the default `mid` then actively misleads filters, watches, and the assistant's own
answers. Appending "internships" to the alternations fixes one word and leaves the class.

## Fix design (for the code owner — a general band-binding rule)

1. **One canonical band lexicon.** Each band is defined by STEMS, not surface tokens
   (intern → {intern}, new_grad → {new grad, early career, entry level, graduate program,
   rotational, university}, etc.). Matching normalizes the text first: lowercase, hyphens
   and slashes become spaces, then each candidate token is reduced by a small morphological
   rule (trailing plural `-s`/`-es`/`-ies` stripped on the band token only) before stem
   comparison. "internships" → stem `intern`; "early careers" → `early career`;
   "entry-level" → `entry level`. One normalization, every variant binds.
2. **One matcher, all sites.** Title rule, JD-head rule, and ask-side band parsing call the
   same `bandOf(text)` helper. The line-145/line-164 drift (co-op) is the proof that
   per-site regex copies diverge; the fix removes the copies, not just the symptom.
3. **Fail visible, never silent.** When text carries a near-band token that still does not
   bind (stem-prefix or edit-distance-1 watch), the parse stamps `band_signal: "unbound"`
   alongside the default instead of returning a clean `mid`. The ask path can then widen
   or clarify rather than assert a confident wrong zero (the MUSE-F-006 doctrine), and the
   load path can count unbound stamps per source so the next variant is found in data, not
   by a user.
4. **Precedence unchanged.** Intern → seasonal-analyst → director → manager → staff →
   senior → new_grad → junior → mid, exactly as today; only the token matching changes.
5. **The matrix becomes the permanent guard.** The 30-cell matrix in
   `repro-band-matrix.cjs` should land as `tests/career-band-matrix.test.cjs` with the fix,
   extended with each newly found variant (co-ops, traineeships, fellowships) as a regression
   cell — fail-first, per bug law.

**Explicitly not the fix:** adding `internships` (or any single surface form) to the
existing alternations. That is a phrase patch; the next plural or hyphenated title
re-opens the same failure under a new word.
