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
4. **Greenhouse widgets on live pages** (0/51), and the phone-country page default that blocks every live Greenhouse
   card.
5. **Bot checks.** In the person's own browser a verification check may still appear at Submit. The person finishes
   it; the rate is NOT_RUN.

## 5. Fixes, in order (each re-measured)

1. Zero wrong answers. **Done**, Run 1.
2. Greenhouse widgets: the open mechanism and the real option texts are read live (CI probe). The driver then picks an
   option with the same `chooseOption` the planner uses for ordinary selects. The phone-country default is resolved
   from the person's own country.
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
  - every non-GET request is aborted, except GraphQL *queries* on Ashby's own read endpoint;
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

The pipelined queue, the card order, answering once before the session, the Greenhouse widget driver, a live session
with a real person (NOT_RUN), and the bot-check rate (NOT_RUN).
