# The nine gaps: specifications (2026-10-22)

The owner (2026-10-22, 10:01 CDT, relayed): "all 9 gaps must be built and tested, each to genuine depth, 10+
micro-features per spec, not minimal." This document is the specification only. It is written on branch
`arch/nine-gap-specs`, built on `348c2d4a` (the landing candidate). There is no build spend yet, and nothing here is
built, deployed or migrated.

Every micro-feature row has the same six columns:
- **#**, a stable id such as G1.3. Work orders cite it.
- **Does**, what it does, in one sentence.
- **Builds on**, the existing module it extends. Every file named exists at `348c2d4a` (checked when this was written), with these exceptions:
  - A file marked *(new)* does not exist yet.
  - Some pieces exist only on pushed, unmerged branches: `career_people_sources.ts` and `agent/reply_guards.ts` `unsourcedPeople` (`arch/networking-real-people` @4332c9c1); `career_cloud_card_chat.ts` (`arch/chat-approval-card-binding` @9568596d); the F-001 link surfacing (`arch/f001-roles-and-links` @984478d2); the F-006 band fix (`arch/f006-band-and-wrong-zero` @87bd108c); the mail Trainee-row fix (`arch/mail-trainee-row` @1ea403f9).
- **Accepted when**, the acceptance test, in one line. Each is written fail-first and lands in `tests/architect/`.
- **Depends on**, one or more of these codes:
  - `O`: the owner's decision.
  - `$`: spend.
  - `Dep`: a deploy.
  - `X`: external data or an API.
  - `L`: a live account (the person's Gmail, a calendar, a portal account).
  - `—`: repo only.
- **Offline**, whether it can be tested without live accounts. `yes` means fully, with synthetic fixtures. `part` means the logic can, but the last step needs a live account or deploy. `no` means it cannot.

## Standing rules (they bind every row below and are not repeated per row)

1. **Never automate LinkedIn or Indeed.** Trainee never scrapes, opens or fetches LinkedIn or Indeed pages, by any link or redirect. The page reader refuses them (`career_people_sources.ts` `pageRefusal`). A LinkedIn profile URL is never stored (WO-033 L1).
2. **Sending happens only through the owner's or person's tap on the exact hash-bound card.** Any send, submit or message needs the tap, and the tap is bound to the payload's SHA-256. A text "yes" never sends; it may only open the card (Option A, chosen 2026-10-22 under the owner's delegation; `career_cloud_card_chat.ts`). Where an existing flow still approves by text (outreach "send all", `career_outreach.ts` `outreachTurn`; email-apply, `career_apply_email.ts`), moving it onto the card tap is part of the gap that uses it (G3.1, G4.6).
3. **Nothing is invented: no people, no odds, no facts.**
   - People: only people a source shows (#20, `career_people_sources.ts`, the reply guard in `agent/reply_guards.ts` `unsourcedPeople`).
   - Odds: a number only from counted data with its n and its source. Nothing is shown under n=5 (D-018). Anything else is a named factor, never a percentage.
   - Facts about the person: only from confirmed facts (D-007).
4. **Submit stays OFF.** `CAREER_AGENT_SUBMIT` and `CAREER_CLOUD_APPLY` stay off, and the caps stay where they are (see `docs/architect/cap-inventory-2026-10-22.md`). No row here changes a flag or the submit path.
5. **The owner's word is needed for any deploy, migration, credential or spend.** A row whose "Depends on" includes `Dep`, `$` or `O` cannot go live without it.

---

## G1. Start from target companies

The person names companies, not job titles ("I want Stripe, Ramp, Goldman"). Trainee works backward from them: what
each company hires for, which openings fit, when to act, and what to watch.

| # | Does | Builds on | Accepted when | Depends on | Offline |
|---|---|---|---|---|---|
| G1.1 | Captures a target list from the person's words: up to their stated number of companies, each normalized to one spelling, kept per person with the words they used | `career_contacts.ts` `normalizeFirm`/`knownFirm`; `career_referrals.ts` `targetFirms` | "Goldman, GS and Goldman Sachs & Co." is stored as one target; an unknown firm is kept as typed, never guessed into a known one | — | yes |
| G1.2 | Resolves each target to its own job boards from the board directory (Greenhouse/Lever/Ashby/Workday tenant). An unknown company is named as unresolved, never matched to a lookalike | `packages/career-data/board-directory.json`; `career_ingest.ts` | 10 synthetic targets: the 7 in the directory resolve to their exact board; the 3 others are listed "no board found" | — | yes |
| G1.3 | Asks to add a missing target's board: it reads only the careers page the person pastes, and keeps a board only if the page links an ATS URL on that page | `career_people_sources.ts` `pageRefusal` + `httpPageReader` (#20); `career_ingest.ts` | A pasted page linking `boards.greenhouse.io/x` adds board x; a page without one adds nothing and says so | X, Dep | part |
| G1.4 | Shows the target's open roles that pass the person's relevance floor, newest first, each with its own link | `career_floor.ts`; `career_search.ts`; F-001's link surfacing (`arch/f001-roles-and-links`) | A target with 12 postings, 4 of which pass the floor: exactly those 4, each with its posting URL | — | yes |
| G1.5 | Gives each target's programs and timelines (internship windows, application opens), only from `firm-guide.json` rows with their URL and checked date | `packages/career-data/firm-guide.json`; `career_path.ts` | A firm without a guide row: "I don't have their program dates on record", and no date is invented | — | yes |
| G1.6 | Watches each target: a new posting at a target is alerted right away, outranking a non-target match of the same fit | `career_alerts.ts` `planProactive`; `151-career-alert-watch.js` | Two new postings of equal fit, one at a target: the target's is "now", the other waits for the report | Dep (career-proactive cron, not deployed) | part |
| G1.7 | Ranks targets by reachable openings: open fitting roles, a warm path (G2), and the deadline nearest first | `career_referrals.ts` `referralMap`; `career_floor.ts` | The ranking is stable for a fixed fixture; each rank line names its three counts and their sources | — | yes |
| G1.8 | Names lookalike companies the person did not list, as suggestions only, from `firm-sets.json` peer sets with the set's name | `packages/career-data/firm-sets.json`; `124-career-outreach.js` `firmSets` | Every suggestion carries "peer of X in set Y"; nothing is added to targets without the person's yes | — | yes |
| G1.9 | Notices a target's hiring signal change (postings up or down by a family, week over week) and says the counts | `129-career-os.js` `watchDiff`/`compBandShift`; `career_postings` history | Synthetic weeks 8→3 SWE postings: "SWE openings at X went from 8 to 3 this week"; under 2 postings, nothing is said | — | yes |
| G1.10 | Says what is not known per target: no board, no guide row, no posting in 30 days. One line each, never filled in | `career_capabilities.ts` style | A target with none of the three gets exactly three "not on record" lines | — | yes |
| G1.11 | Builds the target-first plan: per target, the next step (apply, warm path, wait for window) with its date | `career_situation.ts` | A fixture with 5 targets gives 5 plan lines, each with exactly one next step and the source of its date | — | yes |
| G1.12 | Remembers and edits the list in plain words ("drop Ramp, add Brex"), with a confirm line restating the list | `agent/memory.ts`; `career_tools.ts` pattern (`set_job_alerts`) | The edit applies only to the names in the person's message; the restatement equals the stored list | — | yes |

## G2. Find the hiring manager or referrer

For a posting or target, Trainee finds the real person to contact: the hiring manager, a recruiter, or someone who can
refer. Each is shown with their source, and a contact that cannot be sourced is not shown.

| # | Does | Builds on | Accepted when | Depends on | Offline |
|---|---|---|---|---|---|
| G2.1 | Reads named people out of the posting text itself ("reports to Jane Doe, Head of Data", "questions: recruiter Sam Lee"), keeping each only where the posting's words show the name with the role | `career_people_sources.ts` `verifyOnPage` (#20); `career_postings.jd_text` | A JD naming a recruiter: one sourced contact, quoting the JD; a JD naming nobody: "the posting names no one" | — | yes |
| G2.2 | Finds people on a public team page the person sends (firm site, school alumni page). The model proposes; code keeps only those the page shows | `career_tools.ts` `source_people_from_page` (#20) | A fixture team page with 3 people plus 1 invented by the extractor: 3 kept, 1 named as not on the page | X, Dep, O (`CAREER_SOURCE_PAGES`) | part |
| G2.3 | Picks warm paths at the target from the person's own export: 1st-degree, same school, same past employer. Each path cites its row | `career_referrals.ts` `referralMap`; `135-career-graph.js` | Fixture export: the paths at a firm, ranked, each with its "file, row N" | — | yes |
| G2.4 | Ranks candidate contacts by role fit to the posting: likely hiring manager (same function, one or two levels up), recruiter for that family, then peers. The ranking states its reason and never claims "is the hiring manager" | `121-career-jobs.js` `roleFamily`/`seniorityBand` (F-006 fix) | "Head of Data" ranks above "Data Analyst" for a Data Analyst posting; the reply says "likely", never "is" | — | yes |
| G2.5 | Corroborates a vendor (Apollo) row with a page before it can be used | `career_people_sources.ts` `mergeSourced` (#20) | An Apollo-only row is held; after a page shows them, it is usable with the page's date | X | part |
| G2.6 | Finds the work email only where a source prints it. Never pattern-guessed (first.last@) | `career_people_sources.ts` `verifyOnPage`; `career_contacts.ts` `checkAddress` | An extractor-proposed address absent from the page is dropped, and the contact is kept with "no address on record" | — | yes |
| G2.7 | Checks a found address before any draft: the free checks, then the person's Hunter check if they ask | `career_contacts.ts` `checkAddress`/`hunterPass` | Role inbox (careers@) flagged; Hunter not wired says NOT_WIRED, never "valid" | $ (Hunter), X | part |
| G2.8 | Adds aggregates of who a firm hires (schools, prior employers), never a named person, n≥5 | `career_hired.ts` (People Data Labs) | n=4 shows nothing; n=12 shows top schools with the count and the date | $ (PDL, D-018), X, Dep | part |
| G2.9 | Brokers a double-opt-in intro through the Connector network, never a cold reveal | `career_connector.ts` (WO-026) | Neither side sees the other's address until both say yes; one intro at a time | Dep, L | part |
| G2.10 | Keeps "who I know at X" answerable: every sourced contact per firm, with source, date and staleness ("read 140 days ago") | `career_contacts.ts` `contactsOf`; `career_people_sources.ts` `sourceLine` | The answer lists only sourced rows, each with a read date; nothing beyond the stored rows | — | yes |
| G2.11 | Re-checks a contact older than the person's chosen age before outreach, by re-reading its source page (never LinkedIn) | `career_people_sources.ts` `httpPageReader` | A page that no longer names them marks the contact "no longer shown at X", and it is held from drafts | X, Dep | part |
| G2.12 | The chat never names a person no source shows | `agent/reply_guards.ts` `unsourcedPeople` (#20); `agent/loop.ts` | A model reply naming "Sarah Chen, VP at Evercore" with no source is rewritten once, then the name is removed and the removal is said | — | yes |

## G3. Warm outreach with approval

Drafts to sourced people that use what both sides share. Each draft goes only on the person's tap on its exact card.

| # | Does | Builds on | Accepted when | Depends on | Offline |
|---|---|---|---|---|---|
| G3.1 | Moves outreach approval from a text reply ("send all") to a card tap bound to each draft's payload hash; text may only open the card | `career_outreach.ts` `outreachTurn`/`payloadHash`; `career_cloud_card_chat.ts` (Option A) | "send all" as text approves nothing and points to the card; only the tap with the matching hash flips a draft to approved | — | yes |
| G3.2 | Warm-first drafting: for each draft, names the shared fact (same school, same firm, the connector intro) and uses it only if it is on both sides | `career_outreach.ts` `sharedFacts`/`outreachLock` | A claim of "fellow Wharton alum" without the fact on both sides fails the lock and is not shown | — | yes |
| G3.3 | Draft types by situation: referral ask, informational chat, follow-up after applying, and thank-you, each with its own ask and length | `career_outreach.ts` `draftPayload`; `154-career-writing.js` | Each type's draft passes the fact-lock and its length rule; no type asks for a referral without a posting link | — | yes |
| G3.4 | Includes the posting link and the person's application status when the ask is about a posting | `career_apply_store.ts`; F-001 links | A referral ask carries the posting's own URL and "I applied on <date>" only if the queue row says so | — | yes |
| G3.5 | Sends from the person's own Gmail, one at a time, under the existing caps (warm-up, gap, recipient cap), only after the tap | `career_outreach.ts` `runOutreachSends`; `career_outreach_gmail.ts` | A tapped draft goes once; an untapped one never goes; caps are unchanged | O (`CAREER_OUTREACH_SEND`), Dep, L (Gmail send grant) | part |
| G3.6 | Reads the reply on the thread and classifies it (reply, stop, bounce); a stop is permanent across users | `career_outreach.ts` `classifyReply`/`recordReply` | Synthetic thread: "please stop" adds the address to everyone's do-not-contact list | L (Gmail read) | part |
| G3.7 | Suggests one follow-up after N quiet days, as a new card, never automatic | `career_outreach.ts`; `career_digest.ts` | Day 7 without a reply gives one follow-up card; after it, nothing more unless the person asks | — | yes |
| G3.8 | Edits by the person's words with a fresh hash ("make 2 shorter"); the old approval is void | `career_outreach.ts` redo/edit path | The edited draft's hash differs and needs a new tap; the old tap cannot send it | — | yes |
| G3.9 | Batches by target: one card per target with up to the batch size, each draft separately tappable | `career_outreach.ts` `batchMessages`; `career_apply_cards.ts` card shape | 15 drafts across 3 targets give 3 cards; tapping one draft approves only that draft | — | yes |
| G3.10 | Uses the person's own signature and an opt-out line; no Cc, no Bcc, one recipient per message | `career_outreach.ts` `footerOf`/`messageOf` | Every payload has exactly one "to" and the opt-out line; a Cc in an edit is refused | — | yes |
| G3.11 | Timeline: drafted, approved, sent, replied, each recallable ("who did I email at Stripe?") | `agent/timeline.ts`; `career_outreach.ts` `recordOutreach` | `recall` returns exactly the sent events for the firm and month asked | — | yes |
| G3.12 | Asks the owner's question before scale: per-recipient caps across users stay as they are; the spec flags it, code does not change it | `career_outreach.ts` `RECIPIENT_CAP` | The cap-inventory row is cited; no code change | O | n/a |

## G4. After submitting: follow-ups, recruiter replies, scheduling

What happens after "submitted": the status from the person's own mail, recruiter replies read and answered on a card,
interview times proposed and booked only on the tap.

| # | Does | Builds on | Accepted when | Depends on | Offline |
|---|---|---|---|---|---|
| G4.1 | Reads each application's status from mail (received, rejection, interview, offer) and moves the stage only on a clear signal | `career_mail.ts` `classifyMail`/`matchApplication`; `career_mail_store.ts` | 200 synthetic mails: every stage move has a rule that fired; unclear mail is "other" and moves nothing | L (Gmail read grant) | part |
| G4.2 | A model's second opinion on unsure mail, off by default | `career_mail_model.ts` (WO-051) | Off: rules alone decide; on, on the fixture set: precision is not below the rules' | O (D-025 `CAREER_MAIL_MODEL`), $ | part |
| G4.3 | A follow-up nudge N days after submit with no reply, as a card | `career_digest.ts`; `126-career-track.js` | Day 10 without a reply after a confirmed submit gives one nudge card; a received rejection gives no nudge | — | yes |
| G4.4 | Recruiter reply understood: it extracts what the recruiter asked (availability, documents, a question) and only what the mail says | `career_invite.ts` `extractInvite` | A mail asking for "3 times next week" yields ask=availability; missing fields stay empty | — | yes |
| G4.5 | Drafts the answer to the recruiter from confirmed facts and the person's stated availability | `career_outreach.ts` fact-lock; `essay_draft.ts` `factLock` | A draft stating an unconfirmed fact fails the lock and is not shown | — | yes |
| G4.6 | Sends the recruiter answer only on the card tap (reply in-thread from the person's Gmail) | `career_apply_email.ts` send path moved to card (rule 2); `career_outreach_gmail.ts` | A text "yes" does not send it; the tap with the matching hash sends it once | O, Dep, L (Gmail send) | part |
| G4.7 | Proposes interview times from availability the person states in chat (no calendar read) | `career_invite.ts` time and zone handling | "Free Tue/Thu after 2 ET" gives 3 slots in the recruiter's zone, each labeled with both zones | — | yes |
| G4.8 | Reads the person's calendar for conflicts, only with a calendar grant | none yet: `google_calendar_grant` *(new)* | No grant: says it can't see the calendar; with a fixture grant, a conflicting slot is never offered | O, Dep, L, X (Google Calendar API scope verification) | part |
| G4.9 | Books the time: a calendar invite accepted or created only on the tap | none yet *(new)* | No tap, no event; one tap, one event with the exact time shown | O, Dep, L, X | no |
| G4.10 | Interview invite to brief: an invite read from mail becomes the prep brief (G8) the same run | `career_invite.ts` `inviteBrief`; `career_brief_store.ts` | A fixture invite produces a brief keyed to the application, with no invented interviewer facts | — | yes |
| G4.11 | Rejection handling: it says what is known, offers similar open roles at the same firm, and never re-applies inside 30 days | `career_apply.ts` `COMPANY_COOLDOWN_DAYS`; `career_search.ts` | A rejection from X on day 0: no X application is queued before day 30 | — | yes |
| G4.12 | Employer-email tracking of the Trainee row (the identity fix) | `career_mail_store.ts` (`arch/mail-trainee-row` @1ea403f9) | That branch's 6 tests are green on the merged line | O (merge) | yes |

## G5. Learn from results and change strategy

What is working, counted from the person's own outcomes, and a proposed change they approve, never applied silently.

| # | Does | Builds on | Accepted when | Depends on | Offline |
|---|---|---|---|---|---|
| G5.1 | Funnel counts per person: found, applied, received, interview, offer, rejected, by role family, firm tier, source and resume persona | `career_situation.ts`; `126-career-track.js`; `agent/timeline.ts` | A fixture history gives exact counts that sum to the applications | — | yes |
| G5.2 | Response rate per segment, shown only at n≥5 per segment, with the n | D-018 n≥5 rule; `136-career-season.js` | A segment with 4 applications says "too few to tell (4)"; at 12 it gives "3 of 12 replied" | — | yes |
| G5.3 | Compares resume personas by outcome, with the n and no causal claim | `career_tailor.ts` personas | "Banking persona: 2 of 10 interviews; base: 1 of 11", and the word "because" is never used | — | yes |
| G5.4 | Time-to-response per firm tier, as medians with n | `career_mail.ts` stage dates | Medians match a hand computation on the fixture | — | yes |
| G5.5 | Detects a dead segment (n≥10, zero replies) and proposes narrowing it on a card | `career_alerts.ts` prefs; `career_floor.ts` | A 0/12 segment gives one proposal card; nothing changes until the tap | — | yes |
| G5.6 | Detects a working segment and proposes leaning in (more alerts and a higher daily share there) on a card | `152-career-assign.js`; `career_alerts.ts` | The proposal states the counts; a tap changes only the prefs shown on the card | — | yes |
| G5.7 | Weekly strategy note in the digest: what changed, the counts, and one proposal | `career_digest.ts` (WO-034) | The digest carries the note only when a proposal exists; every number in it is traceable to rows | Dep (digest cron) | part |
| G5.8 | Season retro: plan against actual, from the person's own plan | `136-career-season.js` | A fixture plan of 40 applications with 31 actual gives the exact gap lines | — | yes |
| G5.9 | Learns fit-score weights per person from their outcomes (bounded, explainable), off until enough data exists | `121-career-jobs.js` `scoreFit` feedback | Under 20 outcomes, weights are unchanged; above, each weight change is under ±0.1 and is listed | — | yes |
| G5.10 | Never claims a cause: wording rules on every learning line | `agent/reply_guards.ts`; `140-career-reply.js` | No learning line contains "because", "caused" or "due to" | — | yes |
| G5.11 | Lets the person undo a strategy change in one tap, restoring the exact previous prefs | `agent/memory.ts`; `career_alert_store.ts` | After undo, the prefs equal the snapshot taken before the change | — | yes |
| G5.12 | Cross-user learning (aggregate response rates by firm or posting age) only when anonymized and at n≥5 per cell | none yet *(new)*; D-018 | Needs the owner's privacy decision; the spec only, no code | O | n/a |

## G6. Real-odds judgment per posting

Each posting shows the evidence for and against the person's chances: ghost or repost signs, applicant volume if the
posting itself states it, sponsorship, seniority match. A probability appears only when it is counted, never guessed.

| # | Does | Builds on | Accepted when | Depends on | Offline |
|---|---|---|---|---|---|
| G6.1 | Age and staleness: days open, from the board's own posted date; stale at 60 days, aging at 30 | `121-career-jobs.js` `qualityFlags` (DISC-008) | A 65-day posting is "open 65 days"; one with no date says "posted date not stated", not 0 | — | yes |
| G6.2 | Repost detection: the same canonical key seen closed then reopened, counted from Trainee's own history | `121-career-jobs.js` `qualityFlags` `repost_count`; `career_postings` first/last seen | A fixture reopened twice gives "reposted 2 times since <date>" | — | yes |
| G6.3 | Ghost-likelihood factors (evergreen wording, no team named, repost count, age), listed as factors, not as a percentage | `131-career-discover.js` `ghostGuard` | Output lists each factor that fired with its evidence sentence; no % appears | — | yes |
| G6.4 | Applicant count: only when the posting page itself states it, quoted with its date; otherwise "not stated". Never estimated, never LinkedIn's | `career_ingest.ts` | A JD with "over 200 applicants" is quoted; any other says "not stated by the employer" | — | yes |
| G6.5 | Sponsorship from the JD's own words (no sponsorship, will sponsor, US only), against the person's confirmed status | `121-career-jobs.js` knockouts `work_authorization` | "will not sponsor" plus a confirmed needs-sponsorship fact is a hard stop, quoting the sentence | — | yes |
| G6.6 | Sponsorship history from public H-1B LCA disclosure data for the employer (counts by year, with source and date) | none yet: `career_lca` *(new)*, DOL public files | Fixture LCA rows give "filed 34 LCAs for software roles in FY2025 (DOL)"; an employer missing from the data says so | X (DOL bulk download, free), Dep | part |
| G6.7 | Seniority match: the posting's band (F-006 fix) against the person's confirmed level | `121-career-jobs.js` `seniorityBand` (`arch/f006-band-and-wrong-zero`) | A senior posting for a confirmed student shows "seniority: senior; you: intern level" | — | yes |
| G6.8 | Requirement coverage: must-haves the person's confirmed facts show, against those they don't | `123-career-tailor.js` `parseJD`; `career_floor.ts` knockouts | Exact must-have lists both ways, each mapped to a fact id or "not on record" | — | yes |
| G6.9 | Personal odds number only from the person's own similar outcomes at n≥5, with the n and the window | G5.2; D-018 | Under n=5: "too few of your own results to give odds"; at n=8 it gives "1 of 8 similar got a reply" | — | yes |
| G6.10 | One "worth applying?" line that lists the factors and leaves the decision to the person; it never says "you will" or "you won't" | `140-career-reply.js`; `agent/reply_guards.ts` | No line contains "chance", "likely to get" or "%" unless it comes from G6.9 | — | yes |
| G6.11 | Odds shown on the apply card, so the person sees them before tapping | `career_apply_cards.ts` card items | Each card item carries its factor line; the card hash covers the shown line | — | yes |
| G6.12 | Floor integration: a hard stop (sponsorship, closed, knockout) keeps the posting out of alerts and the queue, with the reason | `career_floor.ts` | A hard-stop posting never reaches `career_apply_enqueue` in the fixture run | — | yes |

## G7. Skill-gap closing plans

For a target role, Trainee says what the person's confirmed record does not yet show, and a plan to close each gap.
Every resource comes from a curated list with a URL, never invented.

| # | Does | Builds on | Accepted when | Depends on | Offline |
|---|---|---|---|---|---|
| G7.1 | Gap list per target role from postings, not from guesses: the must-haves across the target's open postings, with how often each appears | `123-career-tailor.js` `parseJD`; `153-career-kb.js` role skills | Fixture of 10 postings: "SQL in 9 of 10, Tableau in 3 of 10" | — | yes |
| G7.2 | Splits each gap: never shown in the record, against shown but not confirmed (a draft fact waiting for the person's yes) | `122-career-profile.js` facts; D-007 quarantine | An unconfirmed SQL fact is "waiting for your yes", not a gap | — | yes |
| G7.3 | Ranks gaps by how many target postings they unlock | `129-career-os.js` `skillGap` | The ranking equals the posting counts | — | yes |
| G7.4 | Plan steps from a curated resource list (official docs, free courses), each with its URL and the date it was checked | none yet: `packages/career-data/skill-resources.json` *(new)*, curated like `firm-guide.json` | A skill without a curated row: "no checked resource on record"; nothing is invented | X (the curation pass) | yes |
| G7.5 | Proof-of-skill projects: a small project per gap that, done, becomes a confirmable fact | `122-career-profile.js` fact kinds (`project`) | A finished project becomes a draft fact; it counts only after the person's yes | — | yes |
| G7.6 | Weekly time budget the person states; the plan fits inside it | `136-career-season.js` plan | A 5-hour week never gets more than 5 hours scheduled | — | yes |
| G7.7 | Check-ins: asks once a week how the plan went, and records only what the person says | `129-career-os.js` `goalsCheckin`; `career_digest.ts` | No reply means no progress recorded; nothing is assumed done | Dep (digest cron) | part |
| G7.8 | Re-scores fit when a gap closes: the postings newly cleared are named | `121-career-jobs.js` `scoreFit` | After SQL is confirmed, the 9 SQL postings move up, listed by name with link | — | yes |
| G7.9 | Certifications: shows a cert only if a target posting asks for it, with the posting count | `123-career-tailor.js` `parseJD` | A cert no target posting mentions is never suggested | — | yes |
| G7.10 | School-course mapping: maps a gap to a course the person says they can take; never claims they took it | `146-career-intake.js` | "Taking CS 186 next term" is recorded as planned, not as a skill | — | yes |
| G7.11 | Honest no-gap answer: when the record covers the must-haves, it says so and points to applying | `154-career-recommendations.js` | A full-coverage fixture gives "your record shows every must-have in these 10 postings" | — | yes |
| G7.12 | Resume update on close: the tailored resume picks up the new confirmed fact next time, with no manual step | `career_tailor.ts`; `123-career-tailor.js` truth audit | The next tailored resume for a SQL posting includes the confirmed SQL fact and passes the audit | — | yes |

## G8. Interviewer and company-specific prep

Prep for this company and these interviewers, only from what is on record: the invite, public pages, the company
record. Nothing about an interviewer is ever invented.

| # | Does | Builds on | Accepted when | Depends on | Offline |
|---|---|---|---|---|---|
| G8.1 | Who you meet: names and titles only as the invite states them | `career_invite.ts` `extractInvite`; `INTERVIEWER_NOTE` | An invite naming 2 interviewers: exactly those 2, with no added facts | — | yes |
| G8.2 | An interviewer's public background only from a page the person sends or the firm's team page, quoted, with date (no LinkedIn) | `career_people_sources.ts` (#20) | Page fixture: the background sentence is quoted; no page means "nothing on record about them" | X, Dep, O (`CAREER_SOURCE_PAGES`) | part |
| G8.3 | Company record: what the firm does, recent public news, values, each with source and date | `127-career-prep.js` CIRs; `packages/career-data/cirs/` | A firm without a CIR says so; every line in a CIR answer carries its source label | — | yes |
| G8.4 | Role-specific question bank: technical and behavioral questions for the role family and level | `career_mock.ts`; `packages/career-data/interview-banks` | A SWE intern gets SWE-intern bank questions only; the bank id is cited | — | yes |
| G8.5 | Company question patterns, only where `interview-patterns.json` has a sourced row | `packages/career-data/interview-patterns.json` | A firm without a row gets the generic set, labeled generic | — | yes |
| G8.6 | Story bank: STAR stories drafted from confirmed facts, mapped to the behavioral questions | `154-career-writing.js`; `essay_draft.ts` `factLock` | Every story sentence traces to a confirmed fact; an untraced one is not shown | — | yes |
| G8.7 | Text mock interview scored by code against the rubric, with a debrief | `career_mock.ts` (WO-025) | The fixture answers get deterministic scores; the debrief cites the rubric lines | — | yes |
| G8.8 | Voice mock interview | `career_voice.ts` (WO-035) | The token-authorized session runs on fixtures; live voice needs the provider | $, Dep, X (OpenAI realtime) | part |
| G8.9 | Questions to ask them, built from the posting and the company record only | `127-career-prep.js` | Each suggested question cites the JD line or CIR line it came from | — | yes |
| G8.10 | Logistics: time with both zones, format, link, what to bring, only as the invite states them | `career_invite.ts` `whenLine` | A missing link stays missing, with "the invite gives no link" | — | yes |
| G8.11 | Day-before and hour-before reminders | `career_proactive_run.ts`; `career_brief_store.ts` | Fixture interview at T: reminders at T−24h and T−1h exactly once each | Dep (cron) | part |
| G8.12 | Thank-you note after the interview, drafted from the interview's facts, sent only on the card tap | `career_invite.ts`; G3.1 card | Drafted the same day; it sends only on the tap; an interviewer's address is used only if sourced | O, Dep, L | part |

## G9. Staying useful after the hire

After an offer and a start date, Trainee keeps helping: the offer, the first 90 days, wins, reviews, the next move.
Everything is opt-in and pausable.

| # | Does | Builds on | Accepted when | Depends on | Offline |
|---|---|---|---|---|---|
| G9.1 | Offer benchmark against public data, numbers only from data | `career_offer.ts` (WO-036); `128-career-negotiation.js` | An offer with no matching data says "no public data for this role and city"; no number is invented | — | yes |
| G9.2 | Negotiation counter drafted from the person's facts and the benchmark; sent only on the card tap | `128-career-negotiation.js` `factScript` | Every number in the counter equals a data row or the person's own words | O, Dep, L (to send) | part |
| G9.3 | Offer deadline tracking and comparison of multiple offers on the person's stated priorities | `129-career-os.js` store `deadlines`/`offers` | Two offers compared on the stated weights; the deadline reminder fires once | — | yes |
| G9.4 | Accept and decline drafts (graceful decline keeps the relationship), on the card tap | `128-career-negotiation.js` | Neither goes without a tap; the decline names no reason the person did not give | O, Dep, L | part |
| G9.5 | Hire switches modes: job alerts pause and applications stop, after the person's yes; nothing is deleted | `career_alerts.ts`; `career_apply.ts` | After "I accepted", one card offers the pause; after the tap, no alert and no queue | — | yes |
| G9.6 | First-90-days plan for the role, from the person's goals and the role's public expectations | `129-career-os.js` `internTimeline` | Each plan line cites the person's goal or a source | — | yes |
| G9.7 | Win log in plain words, kept for reviews and the next resume | `129-career-os.js` `logWin` | A logged win becomes a draft fact; it is confirmed only on the person's yes | — | yes |
| G9.8 | Review packet: wins in the review period, assembled for self-review | `129-career-os.js` `reviewPacket` | Only wins inside the dates; each with its date | — | yes |
| G9.9 | Return-offer playbook for interns, with milestones and dates | `129-career-os.js` `returnOfferPlaybook` | Milestones derived from the stated internship dates only | — | yes |
| G9.10 | Relationship upkeep: reminders to keep in touch with people met in the search, as drafts on cards | `129-career-os.js` `networkUpkeep`; G3 | One reminder per person per chosen interval; nothing sent without a tap | — | yes |
| G9.11 | Passive market watch: comp band shifts and new roles at the person's firm and peers, monthly, opt-in | `129-career-os.js` `watchDiff`/`compBandShift` | Off by default; on, the monthly note states counts and sources only | Dep (cron) | part |
| G9.12 | Goals check-in quarterly, and a clean pause or erase at any time | `129-career-os.js` `goalsCheckin`; erase in `career_host.js` | "Pause Trainee" stops every proactive message; erase removes the career rows (existing erase path) | — | yes |

---

## Time: honest build-plus-test estimate with three builders

What the estimate counts:
- **Builder-hours** is building plus fail-first tests to the "Accepted when" line, offline, for every row.
- **Wall-clock** assumes three builders (Codex, Muse, the architect) working gaps in parallel. The architect also reviews every PR, which is counted.
- The **live** column is what must still happen after the code is done: the owner's word, a deploy, a live account or spend.
- These are estimates from this codebase's recent work-order pace (a pure-function micro-feature with tests takes 0.5–1.5 builder-hours; a chat-wired one with a store takes 2–4). They are not measured for these rows.

| Gap | Rows | Builder-hours (offline build + tests) | Wall-clock, 3 builders | Needs before live | Done by 12:30 CDT today? |
|---|---|---|---|---|---|
| G1 target companies | 12 | 16 | ~1 day | `Dep` (proactive cron), `X`/`O` for G1.3 | No. At most G1.1, G1.2 and G1.10 (pure functions) could land as branches |
| G2 hiring manager / referrer | 12 | 18 | ~1 day | `O` (`CAREER_SOURCE_PAGES`), `$` (PDL, Hunter), `Dep`, `L` (Connector) | No. G2.1, G2.6 and G2.12 build on #20 (pushed, unmerged); G2.12 already exists on `arch/networking-real-people` |
| G3 warm outreach with approval | 12 | 20 | ~1.5 days | `O` (`CAREER_OUTREACH_SEND`), `Dep`, `L` (Gmail send) | No. G3.1 (card tap for outreach) is the first build and alone is ~4 h |
| G4 follow-ups, replies, scheduling | 12 | 26 | ~2 days | `L` (Gmail), `O` (D-025), calendar: `O`+`Dep`+`L`+`X` (Google scope verification takes weeks) | No. G4.8–G4.9 (calendar) cannot finish this week |
| G5 learn and change strategy | 12 | 18 | ~1 day | `Dep` (digest cron); G5.12 needs `O` | No |
| G6 real odds per posting | 12 | 16 | ~1 day | G6.6 needs `X` (DOL LCA data, free) + `Dep` | No. G6.1–G6.3 (existing flags surfaced) are the quickest |
| G7 skill-gap plans | 12 | 18 | ~1 day | `X` (the curated resource list is a research pass) | No |
| G8 interviewer and company prep | 12 | 20 | ~1.5 days | `$`/`X` (voice), `O`/`Dep` (pages), `L` (thank-you send) | No |
| G9 after the hire | 12 | 16 | ~1 day | `O`/`Dep`/`L` for any send | No |
| **Total** | **108** | **~168** | **~56 h of parallel work: about 7 working days for 3 builders, plus review** | — | **No gap finishes by 12:30 CDT** |

**What cannot finish by 12:30 CDT (about 2 h 20 min from when this was written, 10:10 CDT), stated plainly:**
- **No gap can be built and tested to the depth asked (10+ micro-features) by then.** The best case with three builders starting at once is a handful of pure-function rows landed as branches (G1.1, G1.2, G1.10, G2.1, G2.6, G6.1–G6.3), not merged or deployed.
- **Anything marked `L`, `Dep`, `$` or `O` cannot be live today without the owner's word and actions.** That covers every send (rule 2), the calendar, PDL, Hunter, the page reader switch, and the crons.
- **Calendar booking (G4.8–G4.9) cannot finish this week.** Google's sensitive-scope verification is outside our control.

**Order recommended for the builders** (the critical path to the first real outcomes):
1. G3.1 (card-tap outreach; it closes a standing-rule gap).
2. G6.1–G6.5 and G6.7.
3. G1.1–G1.4.
4. G2.1–G2.4.
5. G4.1, G4.3 and G4.4.
6. Then the rest, gap by gap.
Each work order follows CLAUDE.md: tests first in `tests/architect/pending/`, a size cap, out of scope listed.
