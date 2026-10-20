# WO-042: 60 reviewed applications in a 30-minute session

Branch `wo/042-sixty-in-thirty`, stacked on WO-031 (`wo/031-extension`). Owner: the architect.

**Target (owner, 2026-10-20, verbatim):** "60 reviewed applications in a 30-minute session at 90%+ field accuracy and
zero wrong-answer submissions, through the user-side extension or assisted path where the person presses Submit, since
bot checks block server-side Greenhouse/Ashby submits. Build it as a measured benchmark: write the exact
per-application time budget (target 30 seconds each), find the slowest steps on the 17 captured real forms, fix them in
order, and report the measured number each run labeled VERIFIED or NOT_RUN, never a claim."

**Standing rules this order lives under:**
- the person approves the exact payload (CLAUDE.md);
- never invent an answer (D-007);
- proof for every action (D-024);
- no stealth and no captcha solving;
- never LinkedIn or Indeed;
- D-011's daily limit.

## 1. Definitions

- **Reviewed application.** The extension filled the form. The person saw the card with every answer exactly as it
  goes, and approved it with their own tap (a trusted click, bound to the card's hash). The site's own Submit was then
  pressed, and the employer's answer was read **with proof** (D-024): screenshots before and after, the confirmation
  text or ID, and the times.
- **Field accuracy** has two parts, both over the fields of the answer key (`tests/fixtures/extension/answer-key.json`):
  - **precision:** filled correctly / filled;
  - **coverage:** filled correctly / fields that should be filled.

  The target is precision 100% and coverage at least 90%.
- **Wrong-answer submission.** An application sent with any answer the key says is wrong, counted strictly. Every
  card is graded before the tap, so a wrong answer counts even when a careless person would have missed it. The
  target is 0.
- **Session.** 30:00 of wall clock from the first card to the 60th employer answer, including everything the person
  does: reading, typing what is still needed, and finishing a verification check themselves.

## 2. The per-application budget: 30.0 s

60 × 30 s = 30:00, so the budget holds everything. Steps on the critical path add up; steps hidden behind the
person's reading must finish inside it.

| # | Step | Who | Budget | On the critical path |
|---|---|---|---|---|
| A | Next card on screen after the previous Approve (tab switch to a prepared posting) | machine | ≤ 1.0 s | yes |
| B | The person reads the card (new answers read in full, repeated ones glanced at) | person | ≤ 18.0 s | yes |
| C | The person answers what is still needed on the form (average; 0 for a fully ready posting) | person | ≤ 6.0 s | yes |
| D | Approve tap → re-read, screenshot, record, the site's own Submit clicked | machine | ≤ 1.0 s | yes |
| E | Slack: verification hand-offs, page hiccups, a slow employer | — | 4.0 s | yes |
| | **Critical path** | | **30.0 s** | |
| F | Open the posting and load the page | machine | ≤ 4 s live | no: prepared while the person reads the card before |
| G | Read, bind and plan the form | machine | ≤ 0.3 s | no |
| H | Fill (dropdown widgets included) and attach the resume | machine | ≤ 4 s | no |
| I | Build the card (re-read, hash) | machine | ≤ 0.1 s | no |
| J | Click → employer's answer → proof captured | machine | ≤ 5 s | no: tracked in the background, shown on the queue |

F–I must finish inside the previous application's B + C, at least 10 s. That requires the queue to prepare the next
postings while the person reads (§5, fix 3). Without that, F–I sit on the critical path.

**How each is measured:**
- **Machine steps A, D, F–J:** timing marks on every card (`content.js` `timing`, `background.js` `times`), recorded
  by `evals/apply/sixty-in-thirty.cjs`. VERIFIED offline; live from CI where marked.
- **Person steps B and C:** a stated reading model (ASSUMED until a real person runs a session):
  - an answer line not seen earlier in the session is read at 238 words a minute (Brysbaert 2019, *J. Memory and
    Language* 109:104047);
  - a line already read on an earlier card is glanced at: 0.4 s;
  - deciding and tapping: 1.5 s;
  - a field still needed: 6 s for text, 2.5 s for a choice.

  `--person model` runs the session in real time with that person, giving VERIFIED-S.

## 3. Measured results

Every number carries its label. VERIFIED offline means headless Chromium against the 17 captured forms, served
locally by the TEST world; nothing reaches a real employer. VERIFIED-LIVE means CI loaded the real employer pages and
filled them, and never sent anything (`evals/apply/live-fill.cjs`):
- Approve is never pressed;
- every request that is not a GET or HEAD, other than Ashby's GraphQL reads, is aborted before it leaves;
- Upmore and Supabase are the local TEST world.

### Run 0: baseline (WO-031 as built), 60 postings, person instant (VERIFIED offline)

- **Confirmed:** 18/60.
- **Wrong answers:** 12 of those 18 carried one.
  - "2 weeks" in an MM/DD/YY field;
  - "No" as a referrer's name;
  - "English" for "other languages";
  - "Chicago, IL" for a state;
  - a preferred first name as a preferred last name;
  - a commuting-distance question answered from a general yes to on-site work.
- **Greenhouse could not complete offline.** Its react-select widgets have no scripts in the captures.
- **A WO-031 bug** marked every Lever submit "nothing was sent" after it was sent (sent back to WO-031).

### Run 1: zero wrong answers (VERIFIED offline, `tests/career-extension-browser.test.cjs`)

**Precision** (Run 0 → Run 1):

| Family | Run 0 | Run 1 |
|---|---|---|
| Greenhouse | 94.9% | 37/37 = 100% |
| Lever | 97.3% | 72/72 = 100% |
| Ashby | 93.8% | 62/62 = 100% |

**Coverage, Run 1:**
- Lever 94.7%;
- Ashby 92.5%;
- Greenhouse 94.9% without its react-select widgets, 41.1% with them.

**Caveat:** held-out precision is also 100%, but the held-out forms had been seen when the general rules were written,
so it is not blind.

**What changed:**
- **Planner `fitsField`:** a value from a fact must have the field's shape (no yes/no where a name, number, date,
  address or link is asked; a stated date format takes only a date; a number field takes only a number).
- **Fallback:** a keyword fact that fits none of the options gives way to the meaning map.
- **Question map:** preferred last name, "which state", "other languages", commuting distance (asked), "school
  attended", "available for full time work".
- **Fill-coverage cost:** sample A went from 859 to 853 and B from 710 to 706. Fills that did not fit the field are
  now asked instead.
- **Answer key:** two entries corrected, with the reason recorded in the key.

### Live run 1: the 17 real pages, never sent (VERIFIED-LIVE, CI run of 970e945b, before Run 1's fixes)

- 17/17 pages reachable.
- **Greenhouse:**
  - 0/51 react-select widgets filled;
  - filling took 22–37 s per form, nearly all of it 3-second waits on widgets;
  - every card was blocked by the phone-country picker's page default ("+1").
- **Ashby:** 0/6 forms loaded. Ashby reads its form through GraphQL over POST, and the guard aborted every POST. Fixed
  in the next run: queries are let through, never a mutation.
- **Lever:** precision 97%, coverage 87%. Its two wrong answers are fixed in Run 1.
- **Load times from the CI runner:** 0.26–1.8 s to the load event.

### Live runs 2 and 3 (VERIFIED-LIVE, never sent)

- **Run 2** (Ashby's GraphQL reads let through): precision 100% (144/144) on the fields filled.
- **Run 3** (the new Greenhouse driver: the menu opened through the widget's own "Toggle flyout" button, the
  employer's option texts read, the planner choosing among them):
  - Greenhouse widgets went from 0/51 to 23/51;
  - fill time went from 22–37 s to 0.6–5.6 s per form;
  - its 12 "wrong" verdicts were the grader comparing option texts with the persona's short form ("United States +1"
    against "United States"). The grader now reads the employer's options (`greenhouse-options.json`).

### Live run 4: the 17 real pages, never sent (VERIFIED-LIVE, CI run of cc87965d)

| | Precision | Coverage |
|---|---|---|
| All | 99.4% (175/176) | 86.2% (175/203) |
| Greenhouse | 98.4% (63/64); widgets 32/42 | 82.9% |
| Lever | 100% (67/67) | 88.2% |
| Ashby | 100% (45/45) | 88.2% |

Fill time per form: Lever 0.3–0.5 s, Ashby 0.6–0.9 s, Greenhouse 0.6–9.0 s (SpaceX, 20 widgets). Load: 0.3–3.8 s.

**The one wrong answer, and why it is a real one.** SpaceX asks "SpaceX & SpaceXAI Employment History". The planner chose
"I have never worked for SpaceX, SpaceXAI, xAI, X, or Twitter".
- "Worked here before" is derived from the person's confirmed list of former employers, but only this company was
  checked against it.
- Had the person listed Twitter, the answer would have been false.
- **Fixed:** when one of the person's former employers is named in the question or its options, the answer is asked
  (`career_apply.ts`, test WO-042/1).
- For this persona (no such employer) the same option is right. The grader now reads "I have never ..." as a no, so
  the next run grades it correct.

**The 27 misses, by cause:**

| Cause | Misses | What was done |
|---|---|---|
| Location is a place search (Lever 6/6, Ashby 5/6, Greenhouse 2): typed text alone is not kept | 13 | Lever and Ashby: the place driver (below). Greenhouse: open, see §4 |
| Greenhouse education: School is the TEST persona's fictitious "Example State University", in no real list | 3 | None: a fixture artifact, not a fill failure |
| Greenhouse education: "End date year/month" never mapped; degree list with "Bachelors" and "Bachelor's Degree" | 4 | Fixed (WO-042/2, WO-042/3) |
| Lever and Ashby questions also missed offline (how did you hear, Welocalize, text consent) | 5 | Coverage work, not started |
| SpaceX first name (form changed since capture), Prolific "based in one of these countries" | 2 | Not diagnosed / asked |

### Run 2: after live run 4's fixes (VERIFIED offline, `tests/career-extension-browser.test.cjs`, 30/30)

| Family | Precision | Coverage (without react-select widgets) | Held-out precision / coverage |
|---|---|---|---|
| Greenhouse | 100% (39/39) | 100% (39/39) | 100% / 45.2% with widgets |
| Lever | 100% (73/73) | 96.1% (73/76) | 100% / 95.8% |
| Ashby | 100% (63/63) | 94.0% (63/67) | 100% / 88.2% |

What changed:
- **A place driver** for Lever's location and Ashby's place combobox (`extension/src/dom.ts drivePlace`). It types
  the city, or the state's full name for a state ("IL" becomes "Illinois"). It reads the employer's own places, and
  clicks one only when the planner names it: same city, same state ("Chicago, Illinois, United States" for
  "Chicago, IL"; never "North Chicago"). The card shows the place as the employer will receive it.
- **The TEST world gained a stand-in** for those two place searches, labeled as such in `world.cjs`. The captured
  pages have no scripts, so offline had been counting typed text that the real pages do not keep. The stand-in keeps
  only a picked place, as live run 4 showed. Live run 5 checks the real pages, with a probe that records what typing
  lists and whether typed text survives a blur.
- **A WO-031 race, found by the slower fill.** A radio Trainee clicks gets a trusted `change` from the browser.
  content.js read it as the person's edit and scheduled a card refresh 350 ms later. Any fill longer than that sent a
  half-filled card first.
  - Lever's Lyra card went out mid-fill, with 4 answers missing and "set by the page" blockers.
  - The long live Greenhouse fills (up to 9 s) were exposed to the same race.
  - **Fixed:** nothing during Trainee's own fill counts as the person's, and no scheduled refresh runs mid-fill. A
    value the person changes meanwhile still differs from what Trainee filled, so the tap stays blocked.
  - The queue's record now precedes the "done" card. The queue test's flake (a read between the two writes) is gone:
    3/3 alone, 30/30 in the full suite.
- **The floors** in the browser suite now hold precision at 100% in every family: one wrong answer fails the suite.
- **Planted defects D1–D6:** each new rule reverted in turn, and its test (`tests/architect/wo-042-sixty.test.ts`)
  fails.

### Live run 5: after Run 2's fixes (VERIFIED-LIVE, CI run of 65b76893, never sent)

| | Precision | Coverage |
|---|---|---|
| All | 99.5% (185/186) | 91.1% (185/203), from 86.2% |
| Greenhouse | 98.6% (68/69); widgets 34/42 | 89.5%, from 82.9% |
| Lever | 100% (67/67) | 88.2%, unchanged |
| Ashby | 100% (50/50) | 98.0%, from 88.2% |

- **Ashby's place search works live** on every form that has one (5/5), including Crusoe's state ("Illinois, United
  States").
- **Greenhouse.** The education end month and year, and Anduril's degree, are filled. SpaceX's first name is filled
  too; it had been lost to the mid-fill card race.
- **Lever's location: 0/6.**
  - Every fill waited the full 3 s for a list, and none came.
  - The probe after the card, with the same untrusted typing, got "Chicago, IL, USA" on 5 of 6.
  - Lever wires its search when the page finishes loading, and the fill ran before that.
  - **Fixed:** the driver now waits for the load event and types once more if no list comes (WO-042/7). Run 6 checks
    it live.
- **The one "wrong" verdict is the grader's.** The key states `No`, and the grader compared that text with the option
  "I have never worked for SpaceX, ...". The grader now compares a yes or no by meaning (WO-042/6). The product-side fix
  for this question is WO-042/1.
- **The 46 aborted Ashby GraphQL posts** are `ApiSetFormValue` (Ashby saving each answer as it is typed) and
  `ApiCreateFileUploadHandle` (the resume upload). Both are writes, so the bench refuses them, rightly. In the person's
  own browser they go through as the employer intends.
- **Left:**
  - School: 3, the persona's fictitious school;
  - Greenhouse location: 2, see §4;
  - EōS's certifications multi-select;
  - Prolific's "based in one of these countries";
  - Crusoe's text-message consent;
  - Lever's card questions also missed offline.

### Live run 6 (VERIFIED-LIVE, CI run of 8818029f, never sent)

- **Precision 100% (186/186), coverage 91.6% (186/203).** The grader's literal "No" is gone (WO-042/6).
- **Greenhouse widgets:** 35/42.
- **Lever's location: still 0/6.**
  - The fill waited for the load event, typed, waited 2.5 s, typed again and waited 2.5 s more (5.4 s per form). No
    list came.
  - Cause, unconfirmed: a slow first lookup, which the second typing cancelled. Run 6 cannot tell this apart from
    something else.
  - Change for run 7: the city is typed once and the list awaited up to 8 s. The probe also times a first lookup of a
    place the page has not been asked for before (`fresh_lookup_ms`).

### Live run 7 (VERIFIED-LIVE, CI run of f790f536, never sent)

- **Precision 100% (185/185), coverage 91.1%.**
- **Lever's location: still 0/6.** Each fill waited the full 8 s for a list, and none came.
- **The probe says a lookup this bench makes gets no answer.**
  - A first lookup of "Evanston" listed nothing in 12 s.
  - The "Chicago" places the probe shows are the extension's own lookup, answered after its 8 s wait ran out.
- **Likely cause: the bench itself.** It aborts every POST, including Cloudflare's bot-check beacon on jobs.lever.co
  (`/cdn-cgi/challenge-platform/...`), which the page sends as it loads, in every person's browser. Without it, the
  host's later requests can be held or refused.
- **For run 8:**
  - The beacon is let through. It submits nothing, and it is counted in `allowed_graphql_reads` as
    `cloudflare-challenge-beacon`.
  - Every place lookup is recorded with its status and time (`place_lookups`), so a missing list is told apart: no
    request, a slow answer, or a refusal.

### WO-031's review round merged in (1902a6ca → this branch; VERIFIED offline)

WO-031's fix round brings:
- the last look and the click in one task;
- only an attempt stopped before the click may be retried;
- what is sent is approved (option values, checked states, file bytes);
- proof before and after the click.

Merged with this order's driver, chooser and timing marks:
- **Browser suite 46/46.** Precision 100% in every family; coverage Lever 96.1%, Ashby 95.5% (its label fix gives
  Crusoe's consent radios their own name), Greenhouse 100% without its widgets.
- **Architect 208/208, edge 123/123, DB suite passes.**
- **A 12-posting session:** 12/12 confirmed, 0 wrong, tap → Submit clicked 0.19 s p50, Submit → employer's answer
  0.78 s p50.

### Session run: 60 postings, model person (VERIFIED-S: simulated person, reading model ASSUMED; offline)

`node evals/apply/sixty-in-thirty.cjs --n 60 --person model --families lever,ashby --label run1-model-lever-ashby`, on
Run 1's code.

- **Sent:** 60/60 confirmed by the TEST employer, **0 wrong-answer submissions**.
- **Fields:** precision 100%, coverage 92.3%.
- **Wall clock: 25:04, 25.07 s per application**, which projects to 71 in 30 minutes.

Where the 25.07 s went, as means:

| Step | Measured | Budget |
|---|---|---|
| B + C: the person reads the card, then answers what is open | 22.76 s (reading 13.73, answering 8.58) | 24.0 s |
| A: tap → next card on screen | 2.32 s (p90 2.56) | 1.0 s: **over** |
| D: tap → Submit clicked (re-read, screenshot, record) | 0.18 s (p90 0.19) | 1.0 s |
| J: Submit → employer's answer | 0.87 s (p90 1.06), inside A | in background |
| F–I: load, read, plan, fill, card | 0.37 s (p90 0.48), inside A | inside B + C |

**What this number is not.**
- The 60 are 12 Lever and Ashby forms opened 5 times each under other tenants. From the second round, every answer is
  one the person has read: new answers per card p50 is 0. On 60 different postings, reading rises toward the first
  round's (p90 30 s).
- The person re-answered the same open questions on every repeat (40 typed, 110 picked), because answering once
  before the session (fix 5) is not built.
- Greenhouse is not in it: its widgets do not run offline.
- Live, where load is 0.3–3.8 s and Greenhouse fill is up to 9 s, A grows unless the queue is pipelined (fix 3).

The run's D and J were recomputed from its own recorded marks after a benchmark fix. The run read
`evidence.times`, which the extension does not record per step. Both the run's JSON and the benchmark now use
content.js `steps.begun`.

## 4. What blocks 60, in order of size

1. **D-011 caps a person at 50 applications a day** (25 by default). One session of 60 in a day breaks the owner's own
   rule. This needs the owner's written amendment; no code change makes it true. The benchmark runs against a TEST
   limit of N and says so.
2. **The person's reading time.** At the modeled rate, a card of about 13 answers is read in about 9.5 s once its
   answers are familiar. A first card, or one with many new questions, takes 30 s or more (p90 34.9 s in Run 0). The
   lever is a card that puts new answers first and marks repeated ones; every line stays on the card (approval of the
   exact payload is never collapsed).
3. **Postings that are not fully ready.** Every required field Trainee cannot answer costs the person 2.5–6 s, and
   WO-032 measured only 45% of postings fully ready. The lever is answering once (ask-once) before the session, plus
   coverage.
4. **Greenhouse widgets on live pages:** 32/42 now (from 0/51), and the phone-country default is resolved from the
   person's country.
   - **Greenhouse's location is a place search that no page script can open.** It has no toggle button, and typing or
     ArrowDown as untrusted events opens nothing (live probe). The places do load: React's own props hold "Chicago,
     Illinois, United States".
   - Choosing it would mean calling the page's React handler from the page's own world. That couples the extension to
     Greenhouse's internals, so it is not done.
   - Until then, the person picks it: about 2.5 s per Greenhouse posting that asks.
5. **Bot checks.** In the person's own browser a verification check may still appear at Submit. The person finishes
   it; the rate is NOT_RUN.

## 5. Fixes, in order (each re-measured)

1. Zero wrong answers. **Done**, Run 1.
2. Greenhouse widgets: the open mechanism and the real option texts are read live (CI probe). The driver then picks an
   option with the same `chooseOption` the planner uses for ordinary selects. The phone-country default is resolved
   from the person's own country. **Done** for toggled lists (live run 4: 32/42). Lever's and Ashby's place searches:
   **done offline** (Run 2), live in run 5.
3. A pipelined queue: the next two postings are opened, read, planned and filled in background tabs while the person
   reads the current card. The person's tap switches to a prepared card at once. The employer's answer and its proof
   arrive in the background and show in the queue. No `setTimeout` sleeps in the fill path, because Chrome runs timers
   in hidden tabs at most once a second.
4. A card reviewable in seconds: answers new to the person first and marked; repeated answers below them; every line
   present.
5. Answer once before the session: the queue prepares all postings first, gathers the distinct questions only the
   person can answer, and asks them once in the panel. Each answer then fills every posting that asks it, at its exact
   wording.

## 6. Cost per application (ASSUMED unless marked)

| Item | Per application |
|---|---|
| Browser | $0: the person's own (VERIFIED: no hosted browser in this path) |
| Planner | $0: deterministic, no model call (VERIFIED: `planBatch` is code) |
| Questions only the person can answer | one text turn per distinct question, about $0.003 each at `gpt-5-mini` (costs.md), shared by every application that asks it |
| Tailored resume (WO-028), if used | about $0.004 (about 2k tokens in, 1.5k out at `gpt-5-mini`) |
| Essay draft (WO-030), per essay question | about $0.003–$0.005 |
| Supabase | 4 calls (context, answers, begin, finish); within the plan |

**Total:** about $0.00–$0.02 per application. The model is OpenAI only, and no Anthropic API is used.

## 7. Security

- **Approval binding:** the tap is trusted, bound to the hash of the card shown, and re-checked against the form at the
  click. WO-031's review findings close the race between the last check and the click, the double submit, and the
  file-bytes and option-value gaps.
- **Never filled:** identity numbers (masked in the card, the evidence and the screenshot), EEO answers, and anything
  the person did not state.
- **Session:** the person's own, in `chrome.storage.session` only. No service key, no password.
- **No stealth anywhere:** no captcha solving, no proxies, and the person finishes any verification check themselves.
- **Live benchmark guard:**
  - Approve is never pressed;
  - every non-GET request is aborted, except GraphQL *queries* on Ashby's own read endpoint and the employer host's
    Cloudflare bot-check beacon (`/cdn-cgi/challenge-platform/`, sent by the page as it loads; it submits nothing);
  - LinkedIn and Indeed are never opened;
  - the resume is a TEST file.
- **Permissions (WO-031):** `host_permissions: <all_urls>` is needed only for the screenshot. Content scripts run on
  the ATS hosts only.

## 8. Rate limits

- **D-011:** 25 a day by default, at most 50, enforced by the database at `begin`. 60 needs the owner's amendment (§4).
- **Once only:** one application per posting, and one per company per 30 days (database).
- **Pacing:** at 30 s per application, a session sends about 2 applications a minute, spread across many employers'
  boards. Greenhouse, Lever and Ashby rate limits for a person applying by hand at that pace are NOT_RUN. The queue
  never sends faster than the person approves.
- **Bot checks:** handed to the person, never solved. Their rate in a 60-posting session is NOT_RUN and is the first
  live measure for the owner's tonight test.

## 9. Testing

- **`evals/apply/sixty-in-thirty.cjs`:** the session benchmark. It writes `evals/apply/results/sixty-<label>.json` with
  every step's p50, p90 and max, per-field verdicts, and the session wall clock.
- **`evals/apply/live-fill.cjs` + `.github/workflows/apply-bench-live.yml`:** the real pages, never sent, plus the
  Greenhouse option capture.
- **`tests/career-extension-browser.test.cjs`:** per-family accuracy floors. These are raised to the measured values
  after each fix, so any loss fails.
- **Planted defects:** recorded with each fix commit.

## 10. Not built yet

- the pipelined queue (fix 3);
- the card order (fix 4);
- answering once before the session (fix 5);
- Greenhouse's place search (§4);
- a session over 60 *different* postings, including Greenhouse (NOT_RUN);
- a live session with a real person (NOT_RUN);
- the bot-check rate (NOT_RUN).
