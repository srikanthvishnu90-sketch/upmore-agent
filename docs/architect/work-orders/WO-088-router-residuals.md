# WO-088: router residuals from the brutal list

## Why
The owner's brutal list (2026-10-20, 953 rows) was measured on the old live line (v221–v242). The router still answers
live chat until `CAREER_BRAIN=agent` passes D-027, so every list thread was re-run on **trunk's** router to separate
what is already fixed from what is still wrong:
- 41 threads, 78 turns, the list's own words: complexity battery c01–c42, probes P1/P3/P4/P5/P7/P8, Telegram TG;
- runner: `tests/career-brutal-residuals.test.cjs` harness, the same host as production (`CareerHost` + modules
  120/130/140/141/142/143);
- before this order: **8 of 78 turns fell back, and 6 more answered wrong**;
- after: **0 of 78 fall back**, and each wrong answer below is fixed with a test that failed first.

## Fixed here (each failed first; each case stays in the suite)
| Brutal row | Thread | What trunk did | Fix (`packages/domain/142-career-router.js`) |
|---|---|---|---|
| BL-641 | "I got an offer…" | "Noted — a offer landed." | Article per event: an offer, an interview, a rejection, an assessment |
| BL-632 / BL-606 | c16: "never email her again" after "take Maya off…" | Put **"her again"** on the never-contact list | The name patterns are case-insensitive, so a captured name is cut at its first non-name word ("her", "again"…); a bare pronoun resolves to the last suppressed name |
| BL-673 | TG: "my target firm is Northwind Ledger and my recruiter contact there is Dana" | Keyed the contact to "northwind ledger **and**" | A company name is its leading run of capitalised words |
| BL-669 | TG: "What firm did I say I'm targeting, and who is my contact there?" | Fallback | New recall branch (e): a "did I say / did I tell you" question is answered for every fact kind it names, from the record; a kind with nothing on record is named as empty. The firm keeps the person's casing |
| BL-633 / BL-607 | c17: "actually it was two days ago" | Fallback; the row kept the wrong date | A correction cue plus a date phrase moves the applied date on the thread's latest row, with the old date on its history. Number words ("two days ago") parse |
| BL-627 | c41: "I want investment banking" | Fallback | New `target_field` fact ("you want investment banking"), for statements only: a turn that also asks for something keeps its route |
| BL-602 | c12: "actually data science" | Fallback | The search delta takes a short "actually <role>" with no question word |
| BL-624 | c38: "ok also New York" | Fallback | The search delta takes "also/and/plus <Place>" and widens the map |
| BL-594 | c04: "actually what's a good salary for a data analyst in Chicago?" then "ok back to the internships" | Both fell back | New `handleMarketPay`: answered **only** from postings on the list that state pay, with the count and the range; with none it says so and quotes no figure (D-007). "Back to the internships / roles / search" recaps the standing search |
| BL-599 | c09: "here's the posting: Data Analyst Intern, Acme Analytics. Requirements: …" then "do I fit?" | Misread as an outreach list of "interns"; then fallback | An unquoted "here's the posting:" paste is staged (`posting_staged`), and nothing is applied or sent. "Do I fit?" against a staged posting is the eligibility ask. With no record on file it says it has the posting and needs the record; it never says "no posting" |
| BL-610 | c21: "switch to market sizing" in a prep thread | Answered as a **career switch** ("Switching careers — your transferable map") | A drill switch (market sizing, DCF, case, behavioral…) is excluded from the career-switch intent and routed to the prep question |

## Already right on trunk (verified by the same run; no change)
These rows describe the old live line; trunk's router answers them correctly today:
- **Kill switch, including the typo'd one:** c07, c42, c14 (BL-597/630/628/636/604/631). Pause, scope, lift, and "is it stopped??".
- **Suppression:** c16 turn 2 (Maya).
- **Tracker:** c18 (BL-608) and P4 (BL-883) — log, status, interview, and rejection in free words.
- **Offer decline:** c32 (BL-619/635), drafted for the named firm.
- **Facts and plan:** c41, apart from BL-627 above.
- **Refusals that speak:**
  - c26, c08 (BL-613/598): mass apply;
  - c27, c28 (BL-614/615): fabrication.
- **Prep:** c21 turn 1, c22 (BL-611: nervous and typo'd), P3 (BL-897: Career OS).
- **Guidance:** c13, c06, c02, c39 (BL-603/596/592/625).
- **Company intel:** c30, c31, P5 — honest when there is no company file.
- **Tailoring:** c33, c34 (BL-620/621).
- **Product rules:** c40 (BL-626).
- **Multi-intent:** c01 (BL-591), c10 (BL-600, the finance half named).
- **Networking:** c03 (BL-593/629: named firm, no artifact), P7 (BL-885: healthcare consulting, not banks).
- **Negotiation:** P1 (BL-893).
- **Watches:** P8 (BL-871).

Each of these is VERIFIED on trunk's router in the harness. It is **not** VERIFIED-LIVE until the owner deploys trunk:
production still runs the old line.

## Evidence
- `tests/career-brutal-residuals.test.cjs`: 13 tests, all failing first (9 of the first 11; 2 added for the c09 and
  BL-669 follow-ups). Now 13/13.
- The 78-turn probe: fallbacks 8 → 0.
- Architect suite: 629/0.
- Router bundles rebuilt and `--check` verified.
- Node lists (174 career + 10 shared files): 61 failures. Each one is on trunk's own baseline (the engine, form dry-run
  and WO-039 tests that need a browser and network this sandbox lacks), except one, which this order caused and then
  fixed:
  - `career-bundle-reachability`'s staged chat. "I want to break into investment banking — where do I start?" was saved
    as a `target_field` fact, and the plan reply replaced the guidance answer.
  - The fact capture now refuses any turn with a question mark or a question word. c41 guards it.
  - After the fix, that file and the residuals pass (14/14).
- Edge list: 135 passed, 0 failed.

## Not in this order
- The router is the old architecture. The real fix for wording fragility is the agent brain (D-027). These fixes keep
  the live router honest until the switch.
- Rows that need building (people data, voice, receipts UI, board coverage) are triaged in `docs/architect/brutal-list/`.
