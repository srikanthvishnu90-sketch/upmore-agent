# Trainee feature depth targets v2: where each one stands

Source: the owner's "TRAINEE - FEATURE DEPTH TARGETS v2" (2026-10-19). One row per target, with what the code does today and what's next.

**Status labels**

| Label | Meaning |
|---|---|
| BUILT | In trunk, tested offline. |
| BUILDING | On a branch or PR, with tests; not merged. |
| PARTIAL | Some of it is built; the rest is named. |
| NOT BUILT | Nothing yet. |
| GATED | Cannot be built or proven from here; the gate is named. |

**Number labels:** VERIFIED (measured, command named), ASSUMED, NOT_RUN.

No number in this file is live: every live number is NOT_RUN until `docs/product/TONIGHT-TEST-PLAN.md` is run on the live project.

## Apply engine
| Target | Status | What is true | Next |
|---|---|---|---|
| Extension-assisted apply: 50 per 30 min, 90%+ fields (Greenhouse, Lever, Ashby), 70%+ Workday, zero wrong submits, under 10 s each | BUILDING (WO-031) | MV3 extension over the same planner, answer keys and ask-once store. One-tap review card, bound to a hash of the exact payload. Bot checks are handed to the person. Measured on captured forms. | Merge; Muse runs a 20-posting session (plan 3.6) |
| Cloud autonomous 100-150/day | GATED | PR #16 gate: 3 hand submissions per portal, each confirmed by the employer's email. Zero recorded. | Plan 3.5 tonight |
| Answer bank 58% to 85%+ of required questions | BUILT offline | Planner fills 85.4% (A) / 83.8% (B) of required questions with a complete synthetic persona (#38, #40). VERIFIED offline. A real person's rate is NOT_RUN. | Live rate from plan 3.1 |
| Every unknown asked once over text, never again | BUILT | Ask-once (#45): questions stored by meaning, asked by text, answers checked against the form's choices, read back at the next preparation. | Push the questions without being asked (WO-032) |
| Essays drafted from confirmed facts | BUILT | WO-030 (#48): the employer's AI policy decides first. A fact-lock blocks invented content. Saved only on "use N". | Live draft quality NOT_RUN |
| Fully ready 13% to 40% | PARTIAL | 42/99 and 48/100 postings fully ready with a complete persona (offline). Workday and iCIMS need the person signed in (D-013). | Apply-by-email fallback (WO-032) |
| Failure rate under 2%, bot-check telemetry, auto-throttle | NOT BUILT | Stop codes are recorded per run. No roll-up and no throttle. | WO-032 |

## Discovery and alerts
| Target | Status | What is true | Next |
|---|---|---|---|
| 50,000+ career pages, every 6 h | PARTIAL; scale-up BUILDING (WO-037) | 2,179 live boards. WO-037 adds discovery from public ATS APIs (only boards whose API answers count), sharded 6-hour refresh, and a CI discovery workflow. | The verified count is whatever the run proves; no padding |
| Alert under 15 min | PARTIAL; measurement BUILDING (WO-037) | Ingest and alerts every 5 min, delivery every minute. WO-037 records first-seen to sent. | Plan 2.3 |
| Precision 90%+ on 200 labeled roles | PARTIAL; set BUILDING (WO-037) | Relevance floor 50/50 on its own set. WO-037 builds the 200-role set and a labeling tool. **Precision counts only on human labels.** | Muse labels (plan 2.5) |
| 20%+ not on LinkedIn or Indeed | NOT RUN, by design | We never automate LinkedIn or Indeed. A person checks a sample by hand. | Plan 2.6 |

## Resume and tailoring
| Target | Status | What is true | Next |
|---|---|---|---|
| Tailored PDF link under 60 s, with a changelog | BUILDING (PR #49) | Confirmed facts only. The truth audit runs twice. A private 7-day signed link. A changelog built only from the diff. The tool call takes 8.3 ms median (VERIFIED local); the model turn is NOT_RUN. | Merge; plan 4.2 |
| 100% pass an ATS parse harness | BUILDING (PR #49) | Two-parser check, plus the name and email read back. A failure refuses the resume. | |
| Tailored vs untailored callback instrumentation | BUILDING (PR #49) | Each application is tagged, only from a file Trainee stored. The report says "NOT enough data" under 30 per arm. | Outcome rows from mail tracking |
| Resume personas by one text | BUILDING (PR #49) | Save and switch only when the person names the persona. Personas pick and order; they never add. | |
| Never invent, in code | BUILT | `auditResume` refuses any line without a confirmed fact. | |

## Networking (outbound)
| Target | Status | What is true | Next |
|---|---|---|---|
| 500-person verified-email lists in 24 h, 85%+ deliverable, under $50 | GATED (data vendor); pipeline BUILDING (WO-033) | Import, verification (syntax, MX, role and disposable flags) and cost behind a vendor seam. A vendor comparison with sources. | Owner picks and funds a vendor |
| Drafts approved 10 at a time | BUILDING (WO-033) | A fact-lock on every claim. "send 1-7,9", "redo 3", "skip 4". The approval binds to the exact text. | |
| 20-30 sends a day from Gmail, no blast | BUILDING (WO-033) | Caps in code: 20 by default, 30 at most, 10 a day during the first-week warm-up, one recipient per message. Stop and unsubscribe go to a do-not-contact list. | Needs the career Google grant |
| Referral map, top 20 firms | BUILDING (WO-033) | Warm paths from the person's own exports only. No LinkedIn automation. | |

## Connector (people matching)
| Target | Status | What is true | Next |
|---|---|---|---|
| Double opt-in, one match at a time, every "why" cited, 72 h follow-up, learning | BUILT (#44), launch-gated | Proposals, consent, intro, check-ins, feedback, blocks and reports. Nothing is proposed under 500 opted-in profiles. | Cold start is the real gate |

## Mock interviews
| Target | Status | What is true | Next |
|---|---|---|---|
| Text mock with a scored debrief | BUILT (#43) | 6 questions; a debrief quoting the person's words. | Plan 5.1-5.2 |
| 20-minute voice mock, sub-second feel, debrief within 2 min | BUILDING (WO-035) | OpenAI Realtime over WebRTC with an ephemeral key. No audio stored. Latency instrumented (NOT_RUN). | Owner's OpenAI key; plan 5.4 |
| Top-50 company question banks | PARTIAL; BUILDING (WO-035) | 33 records today. Each pattern must cite a public source, or it goes to the role bank. | |
| Pre-interview brief within 1 hour of the invite | PARTIAL | Brief on request (#43). The invite intake from mail is WO-034. | |

## Career guidance
| Target | Status | What is true | Next |
|---|---|---|---|
| Real hired-candidate backgrounds | GATED | No licensed data. Trainee says so in one line and never invents it. | Owner decision on Revelio, PDL or Coresignal |
| "How do I get into X": real data, honest probability, 3 moves | BUILDING (WO-036) | Firm programs, timelines and requirements with URLs and checked dates. A probability only with a cited base rate. Every move cites a requirement and a fact or gap. | |
| Offer to benchmark and negotiation script, under 30 min | BUILDING (WO-036) | Public filed wages (DOL LCA, BLS OEWS) with n and year. Never n<5 as a benchmark. Never an invented competing offer. | |

## Tracking and follow-up
| Target | Status | What is true | Next |
|---|---|---|---|
| 95%+ status changes from mail within 1 h, hand applications too | BUILDING (PR #46), below target | Holdout precision 88.6%, recall 75.6% (target 97/95). Only the employer's own "received" email starts tracking a hand application, so a scam offer is never texted. | Model second pass; live grant |
| Weekly digest, "where do I stand with X" | PARTIAL | `where_do_i_stand` in #46. The digest is WO-034. | |
| Zero dropped follow-ups | BUILDING (PR #46) | Drafts at day 14, and 7 days after an interview. The person sends them. | |

## Memory
| Target | Status | What is true | Next |
|---|---|---|---|
| Never repeat yourself; everything retrievable | BUILT (#37, #41) | Standing instructions, facts, alerts and pipeline go into every turn. The timeline answers recall by kind, subject and time. A code-written summary covers anything past 40 messages. | Outreach and intro events with WO-033 |
| Degrade with a one-line ask | BUILT (#41) | | |

## Channels
| Target | Status | What is true | Next |
|---|---|---|---|
| Every core action over iMessage | PARTIAL | Alerts, cards, receipts, questions, mocks and chat over LoopMessage. **Fixed in PR #50:** a long approval card was cut in delivery and still approved whole; a 10-posting report delivered 2; STOP silenced replies. | Merge #50 |
| WhatsApp and Telegram "exactly like iMessage" | BUILDING (WO-038) | Today no WhatsApp or Telegram code exists, and replies would go out on iMessage only. WO-038 adds a channel field, adapters, Telegram /start and /stop, deep-link account linking (no code typed), per-provider dedupe and pacing. **WhatsApp's 24-hour rule** makes a proactive message outside the window a short template; the full text follows the person's reply. That is the one honest difference. | Owner registers templates and sets tokens |
| Alert to approved apply under 10 s | BUILDING (WO-031) | Approval runs on the person's computer. The extension is the fast path. | |

## Trust and safety
| Target | Status | What is true | Next |
|---|---|---|---|
| Screenshot, captured answers and employer confirmation per application | PARTIAL | The engine records evidence and masked screenshots. Employer confirmation from mail is in #46; the upgrade to "confirmed" is WO-032. | |
| No landing claim the harness can't reproduce | RULE | | |
