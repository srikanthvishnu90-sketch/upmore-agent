# Career gauntlet — Quality Spec Pack personas (P2–P4) + the P1 mapping

Fixture files for the personas in `docs/quality-spec/04-GRADER-AND-ADVERSARIAL.md`
Part 5. **All personas here are fictional-but-plausible fixtures, labeled as
fixtures everywhere. No real person's data.** Reserved example domains
(`.test` / `example.test`) only, exactly like the F1 fixtures.

**Status: awaiting owner approval.** Per the review-queue standing order, the
facts of P2/P3/P4 are listed for the owner's approval in
`~/workspace/your_files/review/persona-fixtures-p2-p4.md` **before** these
personas are used in any scored run.

## Pack ↔ F1 mapping (read this first — the numbers collide)

The Quality Spec Pack (04 Part 5) and the existing F1 gauntlet fixtures
(`packages/career-data/fixtures/gauntlet/profiles/`, GAUNTLET-P1..P6) number
personas **independently**. Only P1 is the same slot in both systems:

| Pack ID (04 Part 5) | Who | Fixture on disk | F1 collision warning |
|---|---|---|---|
| **P1** | CS junior, SWE target (Python, SQL) | **F1 `GAUNTLET-P1`** — `packages/career-data/fixtures/gauntlet/profiles/p1-early-career-swe/` (Maya Rivera (TEST), StudyBoard project, graduating May 2027). **Referenced, not duplicated — there is deliberately no `persona-p1.json` here.** | Same slot, same persona. Note: the pack's one-line shorthand ("dashboard used by 200 people, DeployBoard project") does not match the F1 fixture's recorded details (StudyBoard, used by 24 classmates). The F1 fixture file is the ground truth for the persona's facts; the shorthand discrepancy is flagged in the review doc for the owner. |
| **P2** | Finance & accounting sophomore, IB → VC target, non-target Chicago school | `persona-p2.json` in this directory (persona_id `PACK-P2`, Alex Carter (TEST)) | **NOT** F1 `GAUNTLET-P2` (`p2-international-graduate`) and **NOT** the form-fixture P2 in `forms/profiles.json` (Priya Nair (TEST)). |
| **P3** | Career switcher, 32, ICU nurse → data analyst | `persona-p3.json` in this directory (persona_id `PACK-P3`, Katie Donnelly (TEST)) | **NOT** F1 `GAUNTLET-P3` (`p3-career-switcher`, operations → data engineering). |
| **P4** | International MS CS student, F-1, needs sponsorship, graduating May 2027 | `persona-p4.json` in this directory (persona_id `PACK-P4`, Hana Kim (TEST)) | **NOT** F1 `GAUNTLET-P4` (`p4-experienced-product`) and **NOT** F1 `GAUNTLET-P2` (`p2-international-graduate`, M.S. CS completed May 2026). Similar archetype to the form-fixture P2 — different fixture, never merge them. |

To keep the systems un-confusable, the pack fixtures use persona ids
`PACK-P2/PACK-P3/PACK-P4` and fact ids `PACK-P2-F-001…`, distinct from every
F1 id (`P1-F-001…` etc.).

## Schema (the F1 schema, in one file per persona)

Each `persona-p*.json` combines the two F1 files (`profile.json` +
`manifest.json`) into a single file with the same fields and meanings:

- Profile shape: `persona_id`, `fixture_version: "gauntlet-v1"`, `label`,
  `fixture: true`, `isTestFixture: true`, `basics`, `constraints`,
  `defaults`, `preferences`, `facts[]`.
- Each fact: `id`, `kind`, `text`, `evidence[]`, `needs_confirmation`,
  `source: "gauntlet-fixture"`, plus a `source_class` naming how the fact is
  sourced (`candidate-stated` / `resume-document` / `fixture-evidence`) and,
  where the F1 facts carry them, `title`, `org`, `start`, `end`, `skills`,
  `metrics`, or `name` (skill facts).
- Manifest shape: `known_facts[]` (fact_id + summary, mirroring `facts[]`),
  `unknown_facts[]` (`topic`, `status: "unknown_by_design"`, `note`,
  `agent_must: "Ask the candidate. Never infer, fill, or assume this."`),
  `exclusions[]` (claim + reason), `allowed_effects[]`,
  `forbidden_effects[]`, `expected_end_states[]`.

## Runner parameterization note

The existing runners select F1 profiles by hardcoded directory name
(`pilot-lib.cjs` `gauntletProfile(dirName)`; `PROFILE_DIRS`/`PDIR` maps in the
`run-c-var-*.cjs` runners). There was no by-persona selection for pack
personas, so the minimal support was added **in the gauntlet tooling only**
(`scripts/career/gauntlet/persona-loader.cjs`, new file; no product code and
no existing runner was changed):

- `resolvePersonaId(x)` — accepts `P1..P4` / `PACK-P1..PACK-P4`;
  `GAUNTLET-P1` maps to pack P1 (same slot); `GAUNTLET-P2..P4` **throw**
  (they are F1 ids, not pack ids — no silent aliasing).
- `loadRawPackPersona(id)` — the unified raw fixture record, from the F1
  profile dir for P1 or from `persona-p*.json` for P2–P4.
- `loadPackProfile(id)` — loads through the harness's existing profile loader
  path (`122-career-profile.js` `profileFromData`, the same call
  `pilot-lib.gauntletProfile` makes), returning the profile object runners
  already pass as `ctx.profile`.
- `assemblePersonaContext(id, ask)` — deterministic persona-context string
  for one ask; the swap-test surface.

A runner parameterizes by persona with
`GAUNTLET_PERSONA=P2 node scripts/career/gauntlet/<runner>.cjs` and
`Personas.loadPackProfile(process.env.GAUNTLET_PERSONA || "P1")` — see the
header of `persona-loader.cjs`.

## Swap test (04 Part 5, S1 rule)

`tests/career-quality-personas.test.cjs` proves: the fixtures parse and
conform to the schema above; all four pack personas load through
`persona-loader` / `profileFromData`; and for the **same ask**, the assembled
persona contexts for P1/P2/P3/P4 are pairwise different and
persona-appropriate (each contains its own exclusive markers and none of the
others'). Identical context across personas = test failure, mirroring the S1
rule for identical replies.

Run: `node --test tests/career-quality-personas.test.cjs`
