# Option near-misses: questions asked only because an option was not the fact word for word (2026-10-21)

**Answer (one line):** on the 17 captured forms the extension tests use, **0** required option questions are asked
because of a near-miss ((a) 0, (b) 0, (c) 0). A normalised-equality rule (case, punctuation, whitespace, US state
name or code, a leading "Yes,"/"No,") would remove **0 of 57** unanswered required option questions. Most of the 57
(**39**) have no supporting fact. **7** have a fact that no option equals even after normalising: they need a mapping
by meaning, which normalising cannot do.

Measurement only: no product code changed. Harness: `evals/apply/option-near-miss.cjs`.

## Method
- **Forms.** Every application form the local TEST world serves (`tests/fixtures/extension/world.cjs`, the
  captures in `tests/fixtures/forms-ci`):
  - Greenhouse 5, Lever 6, Ashby 6.
  - Each is opened at its real URL in headless Chromium on the TEST world. Every other host resolves nowhere, so
    there is no network and nothing is sent.
- **The extension's own code, unchanged.** All of it comes from the checked-in bundle `extension/lib/trainee-core.js`:
  - `dom.readForm` reads the form.
  - `trustedManifest` → `planForm` → `contractFill` (WO-102) decide the answers, as `content.js` runs them.
  - The derivation rule of each kept answer is read from `batchPlan`'s own ledger.
- **Greenhouse dropdown widgets** (react-select). Their options exist only once the menu opens on the page, so they go
  the extension's widget path:
  - The widget is "listed". The contract judges the planner's value without options.
  - Then `chooseWidgetOption` picks among the employer's own option list. The list comes from Greenhouse's public API
    capture (`tests/fixtures/forms-ci/greenhouse-options.json`).
  - A widget with no captured list (Country, Location (City), School, one End date month) is counted apart as
    *options unknown offline*.
- **Persona.** The extension tests' own complete synthetic TEST persona (`tests/fixtures/extension/persona.ts`, 64
  facts, no EEO). Every fact has provenance `owner stated (TEST)` and a `confirmation_event_id`. No fact was
  excluded from the manifest. Examples of its values:
  - `state: IL`
  - `work_authorization: Yes`
  - `school: Example State University`
- **Option question.** Any field that is not a file and not a place search, and that is one of these:
  - a select;
  - a radio, checkbox group or multi-select ("choice");
  - a lone checkbox.
- **Classes.** Every option question left unanswered falls in exactly one class:
  - **The fact behind a question** is the fact the planner answered it from. If the planner gave no answer, it is the
    fact the planner reads when the same question is a plain text box, provided that is the question's own mapped fact.
  - **policy:** never filled from a fact, by rule:
    - an EEO self-identification;
    - an attestation or consent that takes the person's own answer;
    - an identity number;
    - a label asked twice on the form.
  - **(a) exact match existed but missed (bug):** an option equals the fact under `derivation()`'s own comparison (case,
    whitespace, trailing `.`/`!`). For a lone box, the fact is a plain yes/no.
  - **(b) near-miss:** exactly one option equals the fact after normalising case, punctuation and whitespace, a US state
    name or code (`IL` = `Illinois`), and a leading `Yes,`/`No,` (`Yes, I am authorized` = `Yes`).
  - **(c) ambiguous:** that normalisation matches more than one option.
  - **(d) no fact.** Three kinds:
    - *none*: no fact maps to the question, or the mapped fact is one the person has not stated;
    - *held*: the person stated the fact, but the planner does not apply it here (work rights in another country; a
      follow-up question);
    - *inferred*: the only answer is a yes/no computed from another fact ("No" from the list of past employers). The
      person never said it.
  - **(e) off-list:** a fact is there, but no option equals it even normalised. It needs a mapping by meaning, a range
    or a list.

## Results: required option questions (what the person is asked)

| Family | Forms | Option questions | Filled | (a) exact missed | (b) near-miss | (c) ambiguous | (d) no fact (none / held / inferred) | (e) off-list | policy | options unknown offline |
|---|---|---|---|---|---|---|---|---|---|---|
| Greenhouse | 5 | 53 | 24 | 0 | 0 | 0 | 16 (9 / 2 / 5) | 4 | 0 | 9 |
| Lever | 6 | 25 | 10 | 0 | 0 | 0 | 12 (11 / 0 / 1) | 2 | 1 | 0 |
| Ashby | 6 | 21 | 8 | 0 | 0 | 0 | 11 (5 / 2 / 4) | 1 | 1 | 0 |
| **Total** | 17 | **99** | **42** | **0** | **0** | **0** | **39 (25 / 4 / 10)** | **7** | **2** | **9** |

With the optional ones, which are left empty and never asked:

| Family | Option questions | Filled | (a) | (b) | (c) | (d) | (e) | policy | unknown |
|---|---|---|---|---|---|---|---|---|---|
| Greenhouse | 76 | 25 | 0 | 0 | 0 | 23 | 5 | 12 | 11 |
| Lever | 58 | 13 | 0 | 0 | 0 | 22 | 2 | 21 | 0 |
| Ashby | 28 | 8 | 0 | 0 | 0 | 11 | 1 | 8 | 0 |
| **Total** | **162** | **46** | **0** | **0** | **0** | **56** | **8** | **41** | **11** |

### Derivation rules used by the filled required option questions

| Family | option-exact | option-yes-no | checkbox-yes-no | verbatim (widget path) |
|---|---|---|---|---|
| Greenhouse | 0 | 0 | 0 | 24 |
| Lever | 10 | 0 | 0 | 0 |
| Ashby | 0 | 1 | 7 | 0 |

How each filled option relates to the fact behind it:
- **Lever:** 10 of 10 are the fact exactly: `Yes`, `No`, `United States`, `English`. One of these differs only in
  trailing punctuation: `No` → `No.`.
- **Ashby:** 7 are yes/no on a box. 1 is `option-yes-no`: `No` → `No, I do not require sponsorship to work in the
  country where this role is located`.
- **Greenhouse:** 13 of 24 are exact. 11 are mapped by meaning in the widget path (see the second finding below).

## Examples
**(a), (b), (c): none on any family.** Nothing on these forms looks like `IL`/`Illinois`, `DePaul`/`DePaul University -
Chicago` or `Yes`/`Yes, I am authorized`:
- The yes/no-with-words shape is already filled by `option-yes-no`, for example Harvey's sponsorship question above.
- No select on these forms asks for a state.
- School is a Greenhouse widget whose list is not captured: it is in *options unknown offline*.

**(d) no fact**

| Family | Label | Fact | Options |
|---|---|---|---|
| Greenhouse | Have you worked at EōS Fitness before? | inferred: `No` from former_employers `Example Analytics; Sample Retail` | Yes / No |
| Greenhouse | Are you lawfully authorized to work in the country where this job is located? (WPP, London) | held: work_authorization `Yes` (stated for the US) | Yes / No |
| Greenhouse | What is your top location preference? (Anduril) | none (job_location_choice) | Costa Mesa, CA / Fort Collins, CO |
| Lever | Which location are you applying for? (CGS Federal) | none (job_location_choice) | Atlanta, GA / Hybrid / Remote / Charlotte, NC |
| Lever | Do you have a PC or laptop? (Welocalize) | none (no fact maps) | Yes / No |
| Lever | Are you an employee of Lyra, Bend or an affiliated company? | inferred: `No` from former_employers | Yes / No |
| Ashby | Are you able to work from our US office three days per week? (OpenAI) | none (job_onsite) | lone box |
| Ashby | A "U.S. person" is a citizen, legal permanent resident ... (Snowflake) | held: us_person `Yes` | I am a U.S. person / I am a citizen of Cuba, Iran, ... / None of the above ... |
| Ashby | Are you a native Basque translator? (Lilt) | inferred: `no` from languages `English` | lone box |

**(e) off-list.** All 7 required ones:

| Family | Label | Fact | Options |
|---|---|---|---|
| Greenhouse | Are you currently based in and can verify right to work from one of the following countries? (Prolific) | location `Chicago, IL` | 37 countries incl. `United States` |
| Greenhouse | Please select the certifications you currently have ... (EōS) | certifications `None` | 25 certifications, no "None" |
| Greenhouse | Active Security Clearance(s) (SpaceX) | security_clearance `None` | Top Secret SCI with Polygraph / ... / Secret (8, no "None") |
| Greenhouse | What is your current notice period? (WPP) | notice_period `2 weeks` | Immediately Available / 1 Month / 2 Months / 3 Months / 3+ Months |
| Lever | What's your citizenship / employment eligibility? (CGS Federal) | citizenship `United States`; the planner chose `I am a U.S Citizen / Permanent Resident.`, which the contract refused | 4 eligibility statements |
| Lever | How did you hear about us? (Shield AI) | how_heard `Company website` | Campus visit / LinkedIn Post / ... / Referral / Handshake / Other |
| Ashby | We encourage you to use AI tools ... (Airwallex) | ai_policy_ack `I agree`; the planner checked the box, which the contract refused | lone box |

## What this says
1. **A normalised-equality rule would not remove any question on this set: 0 of 57.** It would add no ambiguity,
   because (c) is 0, but there is nothing for it to catch.
   - The questions the person is asked are mostly ones with no fact: 39 of 57.
   - The rest are a policy rule (2), a list unknown offline (9), or a fact that needs a mapping by meaning (7). Every
     one of those 7 is a different wording or a range: `None` against a list with no "None", `2 weeks` against months,
     `United States` against an eligibility statement. No string normalisation turns one into the other.
   - The `Yes,`/`No,` shape is already handled by `option-yes-no`.
   - Prolific's country list holds `United States`, the person's `country` fact, word for word. But the planner reads
     the question as `location` (`Chicago, IL`). That is a fact-choice miss, not an option near-miss, and normalising
     would not fix it.
2. **The widget path does not hold Greenhouse to the option rules the select path holds Lever and Ashby to.**
   - A Greenhouse widget is judged `verbatim` on the planner's value without options. `chooseWidgetOption` then puts it
     on any option the planner names.
   - So 11 required Greenhouse answers reach the page mapped by meaning. Examples:
     - `Yes` → `I am authorized to work in the United States for any employer`;
     - `United States` → `(a) U.S. citizen or national of the United States`;
     - `None` → `No` for "Personal Training certification up to date?";
     - `Company website` → `Careers site`;
     - `3.6` → `3.6 out of 4.0`.
   - The same kind of mapping on a Lever select is refused and asked. Example: CGS Federal's `United States` → `I am a
     U.S Citizen / Permanent Resident.`
   - This is a finding for the contract (WO-102), not a near-miss. This measurement changes nothing.
3. **Limits.**
   - One persona on 17 forms.
   - The 9 required Greenhouse widgets with no captured list are where `IL`- and `DePaul`-style near-misses could live:
     Country ×4, Location (City) ×2, School ×2, End date month ×1. They are not measured here. A live run that reads
     their opened menus is needed for those.

## Run it
Chromium refuses to run as root. Copy the tracked files to a directory the ordinary user owns, then run:
```
setpriv --reuid=pgtest --regid=pgtest --init-groups env HOME=<pgtest-owned dir> \
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers UPMORE_PLAYWRIGHT_PATH=/opt/node-tools/node_modules/playwright \
  NODE_PATH=/opt/node-tools/node_modules node <copy>/evals/apply/option-near-miss.cjs --out <file.json>
```
Each run prints the per-family tallies. `--out` writes every option question with these fields:
- label, fact and options;
- what the planner planned and what the widget chose;
- the contract's reason;
- the class.
