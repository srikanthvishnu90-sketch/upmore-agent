# Trainee feature depth targets v2: where each one stands

Source: the owner's "TRAINEE - FEATURE DEPTH TARGETS v2" (2026-10-19). One row per target, with what the code does today and what's next. Updated 2026-10-20 after #53, #55 and #56 merged.

**Status labels**

| Label | Meaning |
|---|---|
| BUILT | In trunk, tested offline. |
| BUILT, OFF | In trunk, behind a switch the owner sets (named). |
| IN PR | On an open PR, CI named; not merged. |
| BUILDING | On a branch, with tests; no PR yet. |
| PARTIAL | Some of it is built; the rest is named. |
| NOT BUILT | Nothing yet. |
| GATED | Cannot be built or proven from here; the gate is named. |

**Number labels:** VERIFIED (measured, command named), ASSUMED, NOT_RUN.

No number in this file is live: every live number is NOT_RUN until `docs/product/TONIGHT-TEST-PLAN.md` is run on the live project.

## Apply engine
| Target | Status | What is true | Next |
|---|---|---|---|
| Extension-assisted apply: 50 per 30 min, 90%+ fields (Greenhouse, Lever, Ashby), 70%+ Workday, zero wrong submits, under 10 s each | IN PR (#62: WO-031 + WO-042) | MV3 extension over the same planner, answer keys and ask-once store. One-tap review card, bound to a hash of the exact payload. Bot checks are handed to the person. Live, on 17 real pages (never sent), run 14: field precision 100% (194/194), coverage 95.6%; Greenhouse 93.4%, Lever 94.7%, Ashby 100% (VERIFIED-LIVE). Workday 70%: GATED, its forms need the person signed in (D-013). | Merge #62; Muse runs a 20-posting session (plan 3.6) |
| 60 reviewed applications in 30 min, 90%+ fields, zero wrong-answer submissions (owner, 2026-10-20) | IN PR (#62, WO-042) | VERIFIED-S offline (session run 6, simulated person, reading model ASSUMED): Lever + Ashby 60/60 sent, **0 wrong-answer submissions**, 22.70 s each (about 79 in 30 min at that pace), precision 100%, coverage 94.3%; the person typed 24 and picked 77 (run 4: 40 and 110) since their own answers are kept from the form. VERIFIED-LIVE (CI, 17 real pages, never sent, run 19): precision 100% (195/195), coverage 96.1%; Greenhouse 93.4%, Lever 96.1%, Ashby 100%. A real person's session: NOT_RUN. **60 in one day is not allowed by D-011 (50 max).** | Owner: D-011 amendment for 60/day; a real person runs one session |
| Cloud autonomous 100-150/day | BUILDING (WO-039), locked in code; **the target is not reachable as specified** | The worker, the database gate and the opt-in are built. It unlocks per portal only at 3 hand submissions confirmed by the employer's email (D-022). Three limits, stated plainly: (1) D-011 caps a person at 50 a day, so 100-150 needs the owner to amend D-011 in writing; (2) a server can only submit forms that post to their own page: Lever, 6 of the 17 captured forms (VERIFIED, fixture count). Greenhouse and Ashby submit from page script, so the person presses Submit; (3) all 17 captured forms load an invisible bot check; how often a server browser is challenged is NOT_RUN. Compute is not the limit: about 28 people at 150 a day per VM (ASSUMED 60 s each). | Owner: D-011 decision. Plan 3.5: the hand submissions. The first Lever cloud week decides the bot-check rate |
| Answer bank 58% to 85%+ of required questions | BUILT offline | Planner fills 85.4% (A) / 83.8% (B) of required questions with a complete synthetic persona (#38, #40). VERIFIED offline. A real person's rate is NOT_RUN. | Live rate from plan 3.1 |
| Every unknown asked once over text, never again | BUILT (#45, WO-032); from the form IN PR (#62) | Ask-once over text (#45). WO-032 texts open questions without being asked: once a day at most, outside quiet hours, never after they are answered. WO-042: an answer the person gives on the form itself is kept once the page confirms the send, under the same key, so the same question at the next company is filled, not asked. Never kept: a masked value, a file, anything that names the employer, a how-heard that is not a channel, or anything from an application stopped before Submit. | Merge #62; session gain in WO-042 session run 5 |
| Essays drafted from confirmed facts | BUILT | WO-030 (#48): the employer's AI policy decides first. A fact-lock blocks invented content. Saved only on "use N". | Live draft quality NOT_RUN |
| Fully ready 13% to 40% | PARTIAL | 90/199 postings (45.2%) fully ready with a complete synthetic persona, offline (`deno run --allow-read evals/apply/email-apply-coverage.ts`, VERIFIED). Apply-by-email (WO-032) adds 0 of them: every captured posting is Greenhouse, Lever or Ashby, which have their own forms. Workday and iCIMS need the person signed in (D-013). A real person's rate is NOT_RUN. | Live rate from plan 3.1 |
| Failure rate under 2%, bot-check telemetry, auto-throttle | BUILDING (WO-039), cloud only | Every cloud outcome is recorded. A portal pauses for 6 h at 2% failures in its last 50 attempts or 2 bot checks in its last 20; a person pauses until the next day at 2. `career_apply_cloud_report(days)` gives rates with counts. Runs on the person's computer and the extension are not in this telemetry yet. | Own-computer telemetry |

## Discovery and alerts
| Target | Status | What is true | Next |
|---|---|---|---|
| 50,000+ career pages, every 6 h | PARTIAL; WO-037 BUILT (#68); scale-up BUILDING (WO-044) | First discovery run: 2,288 boards whose public ATS API answered (2,140 on providers the ingest reads), of 20,031 candidates (VERIFIED, CI). **About 4.6% of the 50,000 target.** The sharded 6-hour refresh is simulated to 50,000; live refresh at that size is NOT_RUN. | WO-044's count, whatever the run proves; no padding |
| Alert under 15 min | PARTIAL; measurement BUILDING (WO-037) | Ingest and alerts every 5 min, delivery every minute. WO-037 records first-seen to sent. | Plan 2.3 |
| Precision 90%+ on 200 labeled roles | PARTIAL; set BUILDING (WO-037) | Relevance floor 50/50 on its own set. WO-037 builds the 200-role set and a labeling tool. **Precision counts only on human labels.** | Muse labels (plan 2.5) |
| 20%+ not on LinkedIn or Indeed | NOT RUN, by design | We never automate LinkedIn or Indeed. A person checks a sample by hand. | Plan 2.6 |

## Resume and tailoring
| Target | Status | What is true | Next |
|---|---|---|---|
| Tailored PDF link under 60 s, with a changelog | BUILT (#49) | Confirmed facts only. The truth audit runs twice. A private 7-day signed link. A changelog built only from the diff. The tool call takes 8.3 ms median (VERIFIED local); the model turn is NOT_RUN. | Plan 4.2 |
| 100% pass an ATS parse harness | BUILT (#49) | Two-parser check, plus the name and email read back. A failure refuses the resume. | |
| Tailored vs untailored callback instrumentation | BUILT (#49) | Each application is tagged, only from a file Trainee stored. The report says "NOT enough data" under 30 per arm. | Outcome rows from mail tracking |
| Resume personas by one text | BUILT (#49) | Save and switch only when the person names the persona. Personas pick and order; they never add. | |
| Never invent, in code | BUILT | `auditResume` refuses any line without a confirmed fact. | |

## Networking (outbound)
| Target | Status | What is true | Next |
|---|---|---|---|
| 500-person verified-email lists in 24 h, 85%+ deliverable, under $50 | BUILT (#55); lists served to users GATED on a data licence (D-018a) | A CSV the person exports from their own Apollo account, or their own LinkedIn export, is imported. Lists served to users wait for an Apollo or PDL data licence: Apollo's standard terms allow internal use only. Every address is checked by Hunter; only `valid` counts as deliverable. Cost per list comes from the owner's real invoice. | Owner: Hunter key; data-licence quotes |
| Drafts approved 10 at a time | BUILT (#55) | A fact-lock on every claim. "send 1-7,9", "redo 3", "skip 4". Each approval binds to the exact text. On WhatsApp and Telegram the batch goes as separate messages, each whole (with #57 and #58). | |
| 20-30 sends a day from Gmail, no blast | BUILT, OFF (`CAREER_OUTREACH_SEND`) (#55) | Caps in code and SQL: 20 by default, 30 at most, 10 a day in the first week, 90 s apart, one recipient per message. **Across all users, one address gets at most 3 Trainee emails in 30 days**, and a "stop" to any user stops everyone's drafts to that address. | Needs the career Google grant with gmail.send |
| Referral map, top 20 firms | BUILT (#55) | Warm paths from the person's own exports only. No LinkedIn automation. 2,000 connections in 115-135 ms (VERIFIED). | |

## Connector (people matching)
| Target | Status | What is true | Next |
|---|---|---|---|
| Double opt-in, one match at a time, every "why" cited, 72 h follow-up, learning | BUILT (#44), launch-gated | Proposals, consent, intro, check-ins, feedback, blocks and reports. Nothing is proposed under 500 opted-in profiles. | Cold start is the real gate |

## Mock interviews
| Target | Status | What is true | Next |
|---|---|---|---|
| Text mock with a scored debrief | BUILT (#43) | 6 questions; a debrief quoting the person's words. | Plan 5.1-5.2 |
| 20-minute voice mock, sub-second feel, debrief within 2 min | BUILT, OFF (`CAREER_VOICE`) (#53) | OpenAI Realtime over WebRTC with a 60-second client secret; the key never reaches the browser. No audio stored. Hang-up to debrief 2.0-4.2 ms offline (VERIFIED). Live latency is NOT_RUN. | Plan 5.4 |
| Top-50 company question banks | PARTIAL (#53) | All 50 firms have sourced interview patterns, each citing a URL and its source type. 0 questions are attributed to a firm: no source gave a firm's exact wording, so questions stay in the role banks. 26 pattern URLs should be opened by a person before a pattern is quoted. | A person checks the 26 URLs |
| Pre-interview brief within 1 hour of the invite | BUILT, OFF (`CAREER_BRIEF_DIGEST`, and `CAREER_MAIL_TRACKING` for invites by mail) (#56) | An invite in the mail is briefed in the same run: 4 min 59 s worst case offline (VERIFIED). A pasted invite is briefed in the turn. Only what the invite states; no lookups on named interviewers. | Plan 5.3 |

## Career guidance
| Target | Status | What is true | Next |
|---|---|---|---|
| Real hired-candidate backgrounds | IN PR (#58); funded (D-018) | People Data Labs Person Search, shown as aggregates only (schools, prior employers, degrees; nothing under n=5), never a named person. Without `PDL_API_KEY`, Trainee says it has no data and never invents any. | Owner reads PDL's terms, then sets the key |
| "How do I get into X": real data, honest probability, 3 moves | IN PR (#58) | Firm programs, timelines and requirements with URLs and checked dates. A probability only with a cited base rate (Goldman and JPMorgan today). Every move cites a requirement and a fact or gap. | Firm-guide re-check on a schedule |
| Offer to benchmark and negotiation script, under 30 min | BUILT (#58) | Public filed wages (DOL LCA, FY2025 Q4, 977 cells) and survey wages (BLS OEWS May 2025, 90 metro cells) with n and year, imported by CI; never n<5 as a benchmark; never an invented competing offer. Real-model turn NOT_RUN. | Run on a live offer |

## Tracking and follow-up
| Target | Status | What is true | Next |
|---|---|---|---|
| 95%+ status changes from mail within 1 h, hand applications too | BUILT, OFF (`CAREER_MAIL_TRACKING`) (#46); generalised IN PR (#69); **below target** | On 160 sealed synthetic emails written without reading the classifier, scored once: trunk 91.3% precision / 87.5% recall, #69 94.9% / 93.3% (target 97/95), no rejection read as an interview (VERIFIED, SYNTHETIC). Interview recall is weakest (84%: calendar-invite subjects). Real inboxes NOT_RUN. Only the employer's own "received" email starts tracking a hand application, so a scam offer is never texted. WO-032 confirms applications only by the employer's email. | Merge #69; calendar-invite interviews; a fresh sealed set; live grant |
| Weekly digest, "where do I stand with X" | BUILT, OFF (`CAREER_BRIEF_DIGEST`) (#56) | The digest is built only from rows, at the person's day and hour, once a week. `where_do_i_stand` returns each stage with its date and source. | |
| Zero dropped follow-ups | BUILT (#46, #56) | Drafts at day 14, a thank-you after an interview and a nudge 7 quiet days later; never two. The person sends them. | |

## Memory
| Target | Status | What is true | Next |
|---|---|---|---|
| Never repeat yourself; everything retrievable | BUILT (#37, #41, #55) | Standing instructions, facts, alerts and pipeline go into every turn. The timeline answers recall by kind, subject and time, including outreach ("which bankers did I email in October?"). | |
| "Forget everything" forgets everything | BUILT (#59) | An erase clears the timeline, interviews, outreach drafts, tailored resumes, and mail tracking's events and drafts (DB-tested). | |
| Degrade with a one-line ask | BUILT (#41) | | |

## Channels
| Target | Status | What is true | Next |
|---|---|---|---|
| Every core action over iMessage | BUILT (#50) | Alerts, cards, receipts, questions, mocks and chat over LoopMessage. A long approval card arrives whole, a 10-posting report delivers all 10, and STOP keeps answering questions. | |
| WhatsApp and Telegram "exactly like iMessage" | IN PR (#57) | One contact per channel; replies go back on the channel they came from. Telegram /start and /stop; deep-link account linking (no code typed). Per-provider dedupe and pacing; long replies as separate messages, each whole. **WhatsApp's 24-hour rule** makes a proactive message outside the window a short template; the full text follows the person's reply. That is the one honest difference. | Owner: Meta verification, templates, tokens; Telegram bot |
| Alert to approved apply under 10 s | BUILDING (WO-031) | Approval runs on the person's computer. The extension is the fast path. | |

## Trust and safety
| Target | Status | What is true | Next |
|---|---|---|---|
| Screenshot, captured answers and employer confirmation per application | PARTIAL; confirmation BUILDING (WO-032) | The engine records evidence and masked screenshots. WO-032 marks an application confirmed only by the employer's own email (same company, the employer's domain or its ATS naming it, within 14 days); a page's "thank you" is evidence, not confirmation. | Merge WO-032 |
| No landing claim the harness can't reproduce | RULE | | |
