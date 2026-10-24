# Proposal: work authorization and sponsorship as two typed facts

2026-10-23. Research only: nothing here is built, merged, deployed or applied. It follows
`ROUTER-IMPACT-ASSESSMENT-WORK-AUTHORIZATION.md` (same branch). Frozen modules were loaded, never edited. No live
request was made for this proposal; the production numbers quoted are the aggregate counts from the assessment.

Acceptance tests: `tests/architect/pending/eligibility-separation.test.ts`. There are 29 tests:
- **on today's code, 28 fail.** Each fails on a wrong read named below. The 29th is a regression guard: a question
  about sponsorship writes nothing. It must keep passing.
- **on a throwaway reference implementation, 29 of 29 pass.** It was built per CLAUDE.md step 2 and is not committed.

## 1. Where the line sits

Every gate below is quoted from its source. The rules that make a change need owner input are in the repo:
CLAUDE.md:20–21 and D-026. The freeze on the router and on 141/149 is in coordinator relays, which are not in any
repo file; the relay timestamps are given.

| Tier | What the change is | Who decides | Source, verbatim |
|---|---|---|---|
| **0** | Repo-only change on a branch to a file that no frozen bundle carries: docs, `tests/architect/pending/`, a new module not yet in any bundle list, `supabase/functions/_shared/extension_sync.js`, `answer_options.ts`, `fact_schema.ts` | Architect, reviewed by the coordinator | Coordinator 2026-10-23 16:49 / 17:06: "sandbox/CI Postgres only, no deploys … no real submissions" (allowed). The owner's limits apply only at deploy (Tier 2). |
| **1** | Any edit to a `packages/domain` file in the router bundle list (`scripts/build-router-core.py:28`), which regenerates `router_core.js` / `router_core.career.js`. This covers **121, 122, 124, 125, 130, 132, 141, 142, 144, 149**, and a new module added to that list. It also covers 149 through `extension_domain.js` (`scripts/build-extension-sync.py:20`). | **Coordinator**, through an impact assessment. **The owner** whenever the change produces a different router candidate, because his pending validation spend is on 63a1233f. | Coordinator 2026-10-23 16:49: "routing frozen at 63a1233f (… frozen pending the owner's $1.58 validation approval) … the frozen router candidate and the blinded protocol do not move without an explicit impact assessment through me". 17:06: "the frozen router candidate 63a1233f and the blinded validation protocol do not move - gap 7 waits for your impact assessment through me before any change". 20:43: "The parked router modules 141/149 stay parked pending the impact assessment — do not touch them". 21:22: "frozen bundles 141/149 untouched". 22:07: "no edits to frozen modules 141/142/149/132". |
| **2** | Anything with a production effect: deploying `agent-chat` or `extension-sync`, publishing an extension build, writing stored profiles (a backfill), applying a migration | **Owner only** | CLAUDE.md:20–21: "No deploys, live migrations, credentials or spend without the owner doing it or saying yes in writing." FREEZE, 2026-10-23 18:02: "NO production releases and NO database mutations by you, Muse, or any automated executor". D-026 (DECISIONS.md:39): "A deploy is built from a trunk commit". |

**The line, precisely:**
- A *branch* that edits a bundled domain module needs the coordinator's impact assessment (Tier 1). The coordinator
  rulings are the source of that gate, not an owner rule.
- **Owner input** starts at two points:
  - when such a branch would become the router candidate that the pending $1.58 validation is meant to measure;
  - at any deploy or data write (Tier 2).
- "Frozen" is wider than the named four. Editing 121, 124 or 130, and adding a module to the router bundle list, also
  moves 63a1233f.
- The governance archive freeze (D-006, CLAUDE.md:23–24) is unrelated and untouched.

## 2. The data shape

It lives at `profile.constraints.eligibility`. It survives `createProfile`, because 122:57 merges `constraints` whole,
so 122 needs no edit.

```ts
type Provenance =
  | { kind: "person_statement"; text: string; at: string | null; via: "chat" | "chat correction" | "use N" | "onboarding" }
  | { kind: "legacy"; field: "workAuthorization" | "needsSponsorship" | "stated_fact"; writer: "router_fallback" | "unattributed"; text: string | null };
interface Fact<V> { value: V | "unknown"; confirmed: boolean; provenance: Provenance | null }
interface Eligibility {
  version: 1;
  work_authorization_us: Fact<"authorized" | "not_authorized">;   // US only; another country is "unknown"
  sponsorship: Fact<"needs" | "not_needed">;                      // now or in the future, as forms ask it
}
```

Rules, which the contract tests enforce:
1. **Neither fact is ever derived from the other.** Not needing sponsorship is not authorization. Authorization is not
   "no sponsorship needed": an F-1 OPT holder is authorized now and needs sponsorship later.
2. **Only a confirmed fact answers.** "Confirmed" requires a `person_statement` provenance with the person's words
   verbatim. A malformed typed fact fails closed: wrong version, a value outside the enum, or confirmed without words.
3. **A stored value without a confirmation record is legacy.** It is offered as a draft with its words, the G2
   pattern ("use N"), and never answers by itself.
4. **One sentence reader.** The JS module's `statedValue` is a line-for-line port of G2's `eligibility_draft.ts`. A
   parity test pins it on 15 sentences, so a statement reads the same in the router bundle and the edge functions.
5. **The legacy fields stay readable.** `workAuthorization` and `needsSponsorship` are never written again with a
   fact of the other kind. The writer keeps `needsSponsorship` mirrored until every reader has moved.

The contract module is `packages/domain/156-career-eligibility.js`, in the house UMD style, loadable by Node, Deno
and the bundles. It exports `statedValue`, `classifyLegacy`, `eligibilityOf`, `answerFor`, `fromStatement` and
`ROUTER_FALLBACK_TEXTS`. A generated ES-module copy at `supabase/functions/_shared/eligibility_facts.js` serves the
edge functions.

## 3. Writers today, and what each becomes

| Writer | Today | Proposed |
|---|---|---|
| 130:81, onboarding "visa" step (one question for two facts) | raw reply into `workAuthorization`; `needsSponsorship` by regex | two questions; each answer via `fromStatement`, confirmed (the person answered that exact question) |
| 142:7896–7906 `writeSensitiveCorrection` (also calls 130's `answerCurrent` "visa") | the sponsorship **clause** (or the router's fallback text) into `workAuthorization` | `eligibility.sponsorship`, confirmed, with the person's whole message as provenance; `workAuthorization` untouched; the 130 call removed |
| 142:11366 `profileFromStatedFacts` | a stated sponsorship fact's evidence into `workAuthorization` | `eligibility.sponsorship` as an unconfirmed draft (the stated-facts table records no confirmation) |

## 4. Every reader and fallback

The "Wrong read today" column was observed on unmodified code, by the pending tests and by
`docs/architect/evidence/router-work-authorization-probe.cjs`.

| Reader | Bundle (tier) | Wrong read today | Proposed read |
|---|---|---|---|
| 141:222–225 doorstep `work_authorization` | router (1) | not needing sponsorship plus any text → `yes-authorized`; needing it → `will-need-sponsorship` as the authorization answer | `answerFor(…, "work_authorization")`: `yes-authorized` / `not-authorized`, or ask |
| 141:228 `sponsorship_detail` | router (1) | none (sponsorship text in a sponsorship field) | unchanged |
| 149:508–515, 565–567 `workAuthorizationToken` / seams | router + `extension_domain.js` (1) | "No longer needs sponsorship" → **"No"** (inverted); other sponsorship sentences served verbatim, `confirmed: true` | both seams from `answerFor`, each from its own fact |
| `_shared/extension_sync.js:75–83, 153–155` (live `extension-sync` v4) | none (0); deploy is 2 | same as 149, served to the person's extension | same, importing `_shared/eligibility_facts.js` |
| 132:113–127 `savedSponsorshipAnswer` / `savedAnswerFor` | router (1) | the raw text as the work-authorization answer | from `answerFor`; null unless confirmed |
| 130:100 `answerFromProfile` | router (1) | "Your saved work authorization: I don't need sponsorship." | each question answered from its own fact |
| 124:1444–1448 outreach `profileFactAnswers` | router (1) | "On work authorization: \<sponsorship sentence\>"; **with no text at all, "I am authorized to work in the US and do not need sponsorship." from `needsSponsorship=false` alone** | authorization from its fact; the sponsorship clause added only when that fact is confirmed too |
| 121:300–309 `evaluateRestrictions`, 793–798 `hardFilters` | router (1) | `/sponsor/` in the authorization text means "needs sponsorship". **Someone who said they don't need it is excluded from every no-sponsorship posting, "you said you need sponsorship".** | sponsorship from its fact; unconfirmed → `needs_user_input` (121's existing ask path) |
| 121:301–303 citizens-only | router (1) | citizenship read from the authorization text | out of scope: citizenship is a third fact (`fact_schema.ts` `citizenship`); noted, not changed |
| 125:464–466 intel display | router (1) | shows the sponsorship sentence labelled as authorization | display `work_authorization_us` |
| 142:270 scoring profile | router (1) | flattens to `work_authorization` / `needs_sponsorship` for 121 | adds `eligibility: eligibilityOf(constraints)` |
| `_shared/answer_options.ts:302–306` | extension bundle (0; publishing is 2) | a "Yes" to authorization alone picks the option saying "do not require sponsorship" | no single-fact pick; `career_apply.ts:351` `authorizedWithoutSponsorship` already answers combined questions from both facts |
| `_shared/fact_schema.ts:306–310` | none (0) | defines `work_authorization` as "countries where they may work without sponsorship" (one fact defined through the other) | "authorized to work in the US, yes or no; sponsorship is its own fact" |
| `career_apply.ts`, `question_map.ts`, `typed_profile_fields.ts:47–53`, `eligibility_draft.ts` (G2), `extension/src/stated_facts.ts` | edge / extension | none: already separate and US-scoped | unchanged |
| 144 guidance, 150 / fill-engine question classifiers | router / Node | none (topics and labels, no stored value) | unchanged |

## 5. Provenance for values already stored

Stored values carry no record of confirmation, so none can be confirmed retroactively. `classifyLegacy` reads them:

- **The router's own text** ("No longer needs sponsorship", "Will need sponsorship in the future"; 142:7888, 7890)
  is marked `writer: "router_fallback"`. It is never shown as the person's words. Its sponsorship polarity, taken from
  `needsSponsorship`, is kept as an unconfirmed value with no words.
- **Any other text** is read by G2's reader for each fact separately: authorization only from a first-person US
  authorization statement; sponsorship only from a first-person statement about sponsorship. Each becomes an
  unconfirmed draft carrying the stored words. Citizenship, another country, a hedge or a question reads as `unknown`.
- **If the text and the flag disagree**, sponsorship is `unknown`. If there is no text, the flag gives an unconfirmed
  sponsorship value with no words.
- **Attribution is available, for a later decision.** A 142 correction also left `profile.profile_corrections[]`:
  `{ at, instruction, changes: [{ field, from, to }] }`, where `instruction` is the person's whole message. A
  backfill could attach that message as the words; an onboarding answer has no such record. Either way, raising a
  draft to confirmed is the person's "use N", never a backfill.
- **No backfill is proposed.** `eligibilityOf` reads legacy values at read time, so nothing stored needs rewriting.
  Live shape from the assessment's counts: 1,275 profiles, 2 with authorization text (1 a sponsorship sentence);
  the number with `needsSponsorship` set is unmeasured and not requested.

## 6. Unknown and unset

`unknown` means asked, never guessed, for every reader:
- 141 asks;
- 149 and `extension-sync` serve nothing, and the extension asks;
- 132 returns null;
- 130 says it is not stored;
- 124 lists it as unknown;
- 121 puts the posting in `needs_user_input` ("Do you need sponsorship …?"), its existing path, instead of excluding
  or admitting it.

An unconfirmed legacy value surfaces only as a G2-style draft ("You told me …; say use N").

## 7. Candidate branches, by tier

| Branch | Contents | Pending tests it turns green | Tier |
|---|---|---|---|
| **A** | new `156-career-eligibility.js` (not added to any bundle list), generated `_shared/eligibility_facts.js`, `extension_sync.js` seam, `answer_options.ts`, `fact_schema.ts` note | 9 of 29: contract ×4, extension-sync ×3 (**closes the live inversion path**), answer_options, the regression guard | 0 to build; 2 to deploy `extension-sync` and to publish the extension |
| **B** | 121, 124, 125, 130, 132, 141, 142, 149 read and write through 156; 156 added to both bundle lists; bundles regenerated | the other 20 | 1 (moves 63a1233f); its release is 2 |
| **C** | onboarding asks the two questions separately (130) | — (product change) | 1 + the owner's product call |

Measured cost of B on the existing suites, today versus the reference: see §8.

## 8. Blast radius (existing suites, today's tree versus the reference)

### 8.1 Branch B blast radius — measured addendum (Branch A lane, 2026-10-23)

Research only: nothing in this section is implemented, and no Branch B code
exists on the Branch A branch. The numbers below were measured on the base
commit `9f5b46d5` (this proposal) by the Branch A implementation lane, to
price section 7's Branch B before anyone schedules it.

Method. (1) Enumerated every file under `tests/` whose contents name a
module Branch B edits (121, 124, 125, 130, 132, 141, 142, 149) or a bundle
Branch B regenerates (`extension_domain.js`, `router_core.js`,
`router_core.career.js`), by content grep over `*.ts` / `*.cjs` / `*.js`.
(2) Counted test definitions in those files by grep for `Deno.test(` and
`test(` occurrences (a definition count, not a run count). (3) Counted the
existing assertions that pin today's legacy behavior by grepping for the
exact factIds, entry points and writer texts those pins use. (4) Ran the
gate's architect step (`deno test -A --no-check
--ignore=tests/architect/pending tests/architect/`) on the base commit for
today's baseline, and the acceptance file for the red set Branch B owns.

Measured surface.

- 199 test files sit in Branch B's blast radius: 145 load one of the eight
  modules directly, and 54 load a regenerated bundle (the two sets
  overlap; the union is 199). Together they hold 1,162 test definitions.
- Per module, test files loading it (overlaps expected): 141 — 60 files,
  142 — 57, 130 — 54, 149 — 46, 121 — 31, 124 — 17, 132 — 9, 125 — 6.
- Bundle regeneration is the multiplier: `extension_domain.js` is built by
  `scripts/build-extension-sync.py` and `router_core*.js` by
  `scripts/build-router-core.py`, both from `packages/domain`. Adding 156
  to both bundle lists changes the bundle bytes under all 54 bundle-loading
  files at once, so Branch B's regression surface is the whole 199-file
  set, not the files naming the module a given edit touches. (Seven
  further files load only `extension/lib/trainee-core.js`, which embeds no
  domain modules and is not regenerated by Branch B; they are excluded
  from the 199.)
- Baseline on the base commit: the full architect suite is green —
  1300 passed / 0 failed across 138 files — so every red Branch B
  introduces is attributable to Branch B.

Pins on today's legacy behavior that Branch B must re-pin or retire
deliberately (counts from grep over `tests/`).

- 10 references to the legacy seam factIds
  `profile.constraints.workAuthorization` / `profile.constraints.needsSponsorship`
  across 4 suites (`career-assertion-gate`, `career-extension-sync`,
  `career-gauntlet-r2a`, `career-gauntlet-r2b`): these assert exactly the
  servings Branch B deletes, including one fixture pair whose stored text
  is "US citizen (TEST)" with `needsSponsorship: false`, served today as
  work_authorization "Yes" + sponsorship "No".
- `savedAnswerFor` (132's reader) is referenced by tests 3 times;
  `hardFilters` (142's sponsorship test) is exercised by 2 test files;
  `authorizedWithoutSponsorship` (124's combined-question claim in
  `_shared/career_apply.ts`) is referenced 2 times from tests and the
  shared module.
- The router fallback texts themselves — "No longer needs sponsorship",
  "Will need sponsorship in the future" — are pinned by no existing suite,
  only by this proposal's acceptance file. Retiring the writer breaks no
  pin directly; the behaviors built on its tokenization (the seam servings
  above) are the pinned part.

The acceptance set prices Branch B independently: of the 29 fail-first
tests, 20 stay red until Branch B lands (writer/142 ×1, reader/141 ×3,
reader/149 ×3, reader/132 ×3, reader/130 ×3, reader/124 ×4, reader/121 ×1,
typed/readers ×2) — measured on the base (1 passed / 28 failed) and on the
Branch A branch (9 passed / 20 failed, the 9 being exactly Branch A's set
in section 7).

## 9. The narrow decision (only now that the proposal is grounded)

**Decision for the coordinator:** may branch A be built now as a Tier-0 branch?
- **What it touches:** new module, `extension_sync.js`, `answer_options.ts`, the `fact_schema.ts` note, the pending
  tests promoted. It touches no frozen module and no frozen bundle, and nothing is deployed.
- **What it fixes:** it removes the live path that would serve an inverted "No".
- **What it costs:** `extension-sync` stops serving a sponsorship answer from the legacy flag and asks the person
  instead. That is one extra confirmation per person who has one, consistent with D-007.
- **What B needs:** branch B waits for the Tier-1 impact assessment and the owner's view on the router candidate.
