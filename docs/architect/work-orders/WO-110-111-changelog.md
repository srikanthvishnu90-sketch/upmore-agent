# WO-110 / WO-111 changelog (router path, brutal eval, 30 scenarios)

Rule used: a change is kept only when its root cause is stated and the named check/score moved for that reason. Scores are
`context / completion / params / question / factlock / natural / memory / effects`. No fixture text is special-cased.
`--brain agent` was not run (it needs OPENAI_API_KEY and spends money); the agent brain gets the same facts through the person block.

Baseline (trunk + PR 266, router): 1.6 / 2.4 / 2.0 / 4.4 / 4.7 / 3.1 / 1.6 / 3.5 (0 of 30 scenarios clean, 4 hard failures).

| Change | Root cause | Check it moves | After |
|---|---|---|---|
| Confirmed facts, standing needs and the saved alert ride the account into every thread (`career_situation.ts` `facts`, `carryFrom`; host `ctx.carry`; router `seedCarry`) | Profile facts lived only in the thread snapshot; only `stated_facts` kinds crossed threads | T08, T20, T07 (memory, context hard) | 2.0 / 2.6 / 2.0 / 4.5 / 4.7 / 3.2 / 3.1 / 4.6 |
| `locationCaveat` reads confirmed location facts and the alert's places; says nothing when no place is known | It read only `basics.location` and `preferences.locations`, so the person's own city was "outside the places on your profile" | T02.1, T15.1 (hard) | in the row above |
| "What do you know about me" and the greeting read the carried record | Both read stated facts only and answered "Nothing is on your record yet" / introduced Trainee to a returning person | T08, T20 | in the row above |
| Outreach parser: "send/show the <firm> email", "show me the message to <name>", "send it" (`career_outreach.ts`) | The parser took only "show drafts" and numbered sends | T09, T10, T23, T24 (effects) | effects 4.6 |
| Standing rules enforced on a search: remote only, pay floor, nights, no weekends, sponsorship; a saved search is used when the ask names nothing | Search ignored the person's standing instructions | T22, T15, T02 (params hard) | 2.0 -> 3.8 params |
| Catch-all replaced: a question about the person's own record is answered from it; anything else is one sentence naming the words it did not match, nothing changed | Static menu answered everything | T17 (hard), T05, T12, T14, T30 | 2.9 / 2.8 / 4.1 / 4.6 / 4.7 / 3.6 / 3.4 / 4.6 |
| Experience years read from a confirmed fact's own words ("4 years") | `experienceYearsOf` needed start/end dates, so 2+ year ICU roles were excluded | T15 params | in the row above |
| Discovery prose built from the data (no fixed headline, closer or reason) | Fixed sentences repeated across people | natural (canned) | natural 3.7 -> 4.0 |
| Sponsorship need enforced as a rule (a posting that says it does not sponsor is left out) and stated in the checked-against line | Prose-only note repeated across scenarios | T02.1, natural | 2.7 / 2.8 / 4.1 / 4.9 / 4.7 / 4.0 / 4.1 / 4.6 |
| Posting facts: "the Quill one", "the pay on the X one" answered from the board's posting and checked against the floor | Fell to "no company file" | T21.2, T26.2 | 3.0 / 3.0 / 4.1 / 4.9 / 4.9 / 4.1 / 3.8 / 4.7 |
| "apply to the Stripe one" resolves a role of the last list by company | Only ordinals resolved | T04.2 | in the row above |
| Places and "again" carry across the turns of a search; "I'm a nurse in Austin looking for night jobs" routes to jobs, not internships | Place was never part of the stored search; `looking for ... jobs` matched the internship route | T16.2, T28 (params) | 3.0 / 3.5 / 5.0 / 4.9 / 4.9 / 3.9 / 4.1 / 4.7 |
| Plain stop text for an unwired board (`155`) | `BOARD_NOT_WIRED` leaked | natural (grammar, jargon) | 3.0 / 3.5 / 5.0 / 4.9 / 4.9 / 4.1 / 4.1 / 4.7 |
| Account tasks answer status asks ("what's happening with Plaid"); the thread remembers the employer in focus ("follow up with them") | Router had no view of the queue, drafts or code-waiting applications | T13 | 3.6 / 3.7 / 5.0 / 4.9 / 4.9 / 4.1 / 4.1 / 4.7 |
| Apply-all gate; "what about Denver instead" names a place; delta runs before company intel | Bulk apply re-ran a search; a place was read as a company | T29.2, T03.3 | 3.6 / 3.9 / 5.0 / 4.9 / 4.9 / 4.2 / 4.4 / 4.9 |
| Say first that the employer already confirmed an application | Nothing told the person they had applied | T18.1 | 3.8 / 3.9 / 5.0 / 4.9 / 4.9 / 4.2 / 4.4 / 4.9 |

| Pause, remove and resume the saved alert from chat (`career_alert_control.ts`); "pause for a week" pauses and says it cannot resume by date | The alert was only reachable from the web | T05, T19 | in the row above |
| Merged trunk (billing, product audit). Catch-all is trunk's `catchAllReply` after `answerFromRecord`; it never repeats the person's words | Held-out run: my catch-all echoed the whole message, including a login (H22.1), and altered a name | held-out H22.1 (security) | 3.8 / 4.8 / 5.0 / 4.7 / 5.0 / 4.2 / 4.7 / 4.9 |
| Intent routing before the catch-all: login/password/automation refused with no credential asked; internships; hours; pay; chances; billing wired into the harness | Valid asks fell to a menu because routes were phrase-bound | held-out (a); `wo-111-general` 1, 5, 6 | in the row above |
| Reference resolution against the last shown list (ordinals, "compare them", "the X one", "that X thing"), run before company intel; unknown names are not repeated | "compare them" and "the second one" hit the company-file dossier or the Trainee menu | held-out (b); `wo-111-general` 2, 3, 4 | in the row above |
| Limits stated in chat bind the next search (hybrid, no weekends, no evenings or nights, remote); the counts say what was left out | Work mode and shift limits were enforced only from a saved profile | held-out (c); `wo-111-general` 7 | in the row above |
| No tailor offer without confirmed resume entries; first-person claims ("I have 6 years of Tableau") are recorded | The offer assumed a resume; claims were not captured | held-out (d); `wo-111-general` 8 | natural 4.3 |


Original 30 after this round (router): 3.8 / 4.8 / 5.0 / 4.7 / 5.0 / 4.2 / 4.7 / 4.9, 10 of 30 clean. Career node suite: 3041 pass / 247 fail here against trunk 3042 / 246 (the one extra was fixed after the run; the same 246 fail on trunk).

## What remains (router path)
Interview prep, cover letters and tailoring do not use confirmed facts (T06.2, T18, T25). The open-questions listing does not know the
apply questions (T11, T12). "email not connected" after a send whose hash changed (T24.2) is a fixture hash. The `canned` check counts
any 40-character sentence repeated across three scenarios of one person (the same roles), which is not removable without hiding data.
