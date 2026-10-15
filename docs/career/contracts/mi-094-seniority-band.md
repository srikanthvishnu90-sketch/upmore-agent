# CONTRACT — MI-094 / BUG-229: 121's seniority band does not know the seasonal-analyst internship convention

**Written:** 2026-10-15, BEFORE the fix (Crew A machinery: contract first).
**Registered:** master issue list MI-094 (Crew A, from the Ruling-2 Lane A re-run).
**Failing witness:** Lane A seed LA-0043 — Meridian Bank, title "Summer Analyst",
ground-truth band "intern", watch bands [intern]; the fidelity gate blocks the seed
(`transport_fidelity: seniority_band expected intern, actual mid`). Every other field
of the seed rebuilds exactly.

## Defect statement

121 `seniorityBand(title, jd)` recognizes the intern band only from the tokens
intern/internship/co-op in the title, or intern/internship in the JD head. The
standard investment-banking internship title — "Summer Analyst" — carries none of
those tokens, so it falls through every band check to the "mid" default. The
consequence is product-facing, not cosmetic: an intern-band watch profile (the
owner's own class) silently mismatches the single most common IB internship
posting shape, and 152 consumes the same band when a posting record lacks one.

## The rule change

One addition to `seniorityBand`, at the same precedence as the existing title
intern-token check (i.e., before the director/manager/staff/senior checks'
*band assignment for these titles*, but explicitly yielding to them — see the
guard-rail below):

- A title matching `\b(summer|winter)\s+(business\s+)?(analyst|associate)\b`
  bands **intern**, UNLESS the title also carries a seniority/management token
  (`manager|director|vp|vice president|head of|chief`), in which case the
  existing checks decide (e.g. "Summer Analyst Program Manager" stays manager).

### Titles in scope — with the evidence for each

- **Summer Analyst** — the witness. The IB summer-internship title across the
  street (the MT1 IB file documents the Summer Analyst recruiting cycle);
  Lane A corpus carries exactly one such title and its stored band is intern.
- **Summer Associate** — the MBA-level form of the same convention: BCG's own
  careers material titles it the "Summer Associate Internship"; Houlihan Lokey
  runs a "Summer Associate Program" (MBA summer internship); a Baird "Summer
  Associate" posting documented in the hired-research corpus is an MBA
  Investment Banking internship. Same defect shape: no intern token, is an
  internship.
- **Summer Business Analyst** — McKinsey's undergraduate summer internship is
  the Business Analyst track ("Summer BA"); the title form "Summer Business
  Analyst" carries no intern token.
- **Winter Analyst / Winter Associate** — included by symmetry of the season
  slot: Southern-Hemisphere banks run winter vacation programs (e.g. Macquarie
  Group South Africa's Winter Internship). Evidence for the bare title form is
  thinner than for Summer — recorded honestly — and the false-positive cost is
  nil: no full-time "Winter Analyst" convention exists, and the corpus's
  seasonal full-time titles (retail, housekeeping, customer service) never
  carry the analyst/associate noun.

### Considered and excluded — with reasons

- **A blanket seasonal rule** (any season word → intern): REFUTED by the
  corpus. Seasonal titles without an intern token in the 21,688-posting corpus
  are genuine seasonal JOBS (Seasonal Customer Service Representative, Seasonal
  Housekeeper, retail representatives) — banding them intern would manufacture
  mismatches. The analyst/associate noun is what makes the convention.
- **UK "Vacation Scheme"** (law-firm student placements — Linklaters, Eversheds
  Sutherland, Jones Day all publish them): a real sibling convention with
  evidence, but a different class (short assessment placements on the
  training-contract pipeline, not seasonal-analyst titles). NOT folded into
  this fix; recorded here so the registry can raise it as its own item.
- **UK "Spring Week" / spring insight schemes**: one-week first-year insight
  programs, not internships. Excluded.
- **"Summer Consultant"**: no sufficient title evidence found. Excluded.
- **A JD-head route** ("summer analyst program" in the JD ⇒ intern): REJECTED.
  Full-time postings routinely describe the summer program they mentor or feed
  ("you will mentor our summer analysts"); the witness's own JD is program
  prose. Title-only keeps the frozen-verdict risk at zero.

## Done-test (from the master list, MI-094)

1. LA-0043 drives and grades on the Lane A seed re-run (fidelity gate passes;
   the seed's reminder is produced and field-correct).
2. A fail-first guard (tests/career-bug229-summer-analyst-band.test.cjs) pins
   the in-scope title family to intern and pins the refuted shapes (seasonal
   jobs, program-manager titles, frozen seniority verdicts) to their current
   bands — RED before the fix, pass^3 after.
3. A mechanical flip audit over every title in the 21,688-posting corpus and
   the Lane A corpus: the only band changes are titles matching the new rule.
4. Full sweep with flips named — baseline 3,877 / 3,851 / 4, the 4 being the
   MI-048 dispositioned set; no new failures.
5. Bug law: ledger BUG-229 + register FR-387 in both copies, byte-identical;
   allocation counters advanced (next free FR-388 / BUG-230).
6. The router bundle is rebuilt (packages/domain changed) and the bundle
   check stays green.

## Results (2026-10-15, Crew A)

- **Fail-first:** the guard stood 3 pass / 2 RED on the unfixed tree — exactly the
  witness test and the title-family test red; the seasonal-job, program-manager,
  and frozen-verdict pins were green before and stayed green.
- **Post-fix:** tests/career-bug229-summer-analyst-band.test.cjs **5/5, pass^3**.
- **Flip audit (mechanical, old vs new `seniorityBand` over real titles + real
  JD text):** 21,688 corpus postings — **0 flips**; 6,600 Lane A postings —
  **exactly 1 flip**, the witness ("Summer Analyst", mid → intern,
  greenhouse:meridian-bank:S43-1142). No frozen verdict moved anywhere.
- **Lane A seed re-run** (the Ruling-2 subset: 46 seeds + the 6 corrected
  constructed = 52 scenarios; harness pointed at the fix/crew-a tree @ 849449f +
  this fix — the only harness change was the DOMAIN path; artifacts
  `results-mi094.jsonl` / `metrics-mi094.json` / `failures-mi094.jsonl`):
  harness blockers **1 → 0**; **LA-0043 drives and grades**. Per-scenario
  failure records vs the Ruling-2 run: exactly one change — LA-0043's.
  Seed-perfect 36/45 → 36/46 (LA-0043 now graded, not perfect — see the residue).
  Headline catch 1.0 → 0.9714 and scenario-perfect 42/51 → 42/52 are the same
  event, not regressions: a previously ungradeable seed entered the denominator.
- **Residue — a second mechanism the band was hiding (registered as MI-095,
  Crew B):** with the band correct, LA-0043's reminder dies at the **151 watch
  gate**: role_family Finance is not in the profile's watched families (none
  set) and the title "Summer Analyst" matches no watched occupation
  ("Investment Banking Analyst") — 151's title↔occupation matching cannot see
  that a Summer Analyst posting in an investment-banking division IS the
  watched occupation. The 9 deadline-imperfect seeds are unchanged (MI-027's
  class, Crew B). MI-094's defect — the band — is closed; the gate half is
  MI-095's.
- **Full sweep:** 3,882 / 3,856 / 4 vs baseline 3,877 / 3,851 / 4 (+5 = this
  guard; the 4 fails are exactly the MI-048 dispositioned set: BUG-076,
  R1 C11, R2 C37, R2A guard). One intermediate flip was self-inflicted and is
  recorded: the first post-fix sweep failed the career-bundle freshness check
  because the full bundle was rebuilt before the career-only one; rebuilding
  `--career-only` (2,490,670 → 2,493,374 B) closed it, bundle guard 3/3, and
  the final sweep above is the clean run.
- **Paperwork:** ledger BUG-229; register FR-387 (ENFORCED at birth) in both
  copies, byte-identical; totals 378 rules = 286 ENFORCED / 91 UNENFORCED /
  1 HARD-SHUT; allocation counters advanced to FR-388 / BUG-230.
- **Coordination note:** 152 and 142 call 121's `seniorityBand` directly, so
  the corrected band reaches assignment and routing with no consumer change.
  151 (Crew B in-flight) was not touched; its gate behavior on the witness is
  MI-095.
