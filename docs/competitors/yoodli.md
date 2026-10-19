# Yoodli: teardown and Trainee targets (AI roleplay and interview practice)

2026-10-19. Built to `docs/product/BUILD-STANDARD-TSENTA.md` (sections 0, 2, 3.7-3.11, 4, 6, 11). Trainee's state is
taken from `docs/product/REQUIREMENTS.md` (audit of 2026-10-19) and the repo checkout at `44364a83`.

---

## 0. Labels and method

| Label | Meaning in this document |
|---|---|
| VERIFIED | Read in our own repo or measured in our own run, source given. |
| VERIFIED-S | The named primary page (yoodli.ai, its blog or pricing page, the named press release) states it, read through a WebSearch extract on 2026-10-19. The live page was **not** opened. A verified *claim*, never verified *performance*. |
| REPORTED | A third party says it (press, directories, universities, competitor blogs), read through a search extract. "REPORTED (competitor)" marks a source that sells a rival product. |
| ASSUMED | Inference, arithmetic, or recalled knowledge not looked up this session. |

Method and limits:
- WebFetch and the agent proxy refused yoodli.ai (`403 connect_rejected`). Every external fact is a search extract.
- Rating searches (G2, Trustpilot, App Store, Chrome Web Store) returned only similarly named companies (Yoodu, Yodlee,
  Yoodule). **Yoodli's public ratings are unknown**, not low and not high.
- No account created; the free tier was not used. Section 8 is a written plan only.

---

## 1. What the product is

**One line:** a speech and roleplay coach. You talk to an AI persona (interviewer, customer, manager), and it scores
your delivery (pace, filler words, word choice, eye contact) and, for enterprise customers, your content against a
rubric. It began consumer-first and now earns most of its revenue from companies training sales and customer teams.
Interview practice is one use case among several, not the business.

### 1.1 Company
| Fact | Value | Label and source |
|---|---|---|
| Origin | Started 2021 at the AI2 Incubator in Seattle, consumer public-speaking tool first | REPORTED: geekwire.com (Yoodli pitch-deck article, 2025) |
| CEO | Varun Puri ("ex-Googler") | REPORTED: techcrunch.com/2025/12/05/ex-googlers-yoodli-triples-valuation-to-300m-with-ai-built-to-assist-not-replace-people |
| Series B | **$40M, announced 2025-12-02, led by WestBridge Capital with Neotribe and Madrona** | VERIFIED-S: yoodli.ai/blog/yoodli-raises-40-million-series-b-to-lead-the-future-of-experiential-learning. SeedTable lists Neotribe as lead (REPORTED, conflicting); one Spanish article adds Allen & Company (REPORTED, uncorroborated) |
| Series A | $13.7M, announced May 2025 | REPORTED: TechCrunch 2025-12-05 |
| Total raised | "Nearly $60 million" | VERIFIED-S (same press release); CB Insights $60.84M over 6 rounds (REPORTED) |
| Valuation | "More than $300 million", over triple six months earlier | REPORTED: TechCrunch; PremierAlts estimate $329M (REPORTED, not company-confirmed) |
| Revenue | "Grew average recurring revenue 900% over the last 12 months", no figures; "most of Yoodli's revenue now comes from enterprise customers" | REPORTED: TechCrunch, citing the company. A GlobalCIO line claiming "$300M+ revenue" is almost certainly a valuation mix-up (ASSUMED) |
| Positioning | AI "built to assist, not replace, people"; works alongside human coaches; moving into "experiential learning" with roleplays at the center | REPORTED: TechCrunch, Varun Puri quoted |

### 1.2 Users, customers and ratings
| Metric | Value | Label and source |
|---|---|---|
| Users | "Over 1 million users" (CEO quote in 2026 releases); one directory says 400,000+ | REPORTED: webull.com / pulse2.com releases (Kartik Murthy VP Product announcement); directory listing. Unaudited, no date basis |
| Enterprise customers | Google Cloud ("certifying more than 15,000 reps"), Snowflake, Databricks, RingCentral, SAP, Korn Ferry | REPORTED: TechCrunch and later press releases |
| Toastmasters | AI speech coaching "powered by Yoodli" for "~300,000 members in 149 countries", with Table Topics and the Toastmasters rubric (Dec 2022; partnership dated Aug-Sept 2022 elsewhere) | VERIFIED-S: yoodli.ai/blog/toastmasters-international-partners-with-yoodli-to-bring-ai-speech-coaching-to-149-countries |
| Executive search | Spencer Stuart partnership for gen-AI interview coaching (2024-03-19) | VERIFIED-S: yoodli.ai blog title (app.yoodli.ai/blog/spencer-stuart-and-yoodli-partner...) |
| Universities | University of Washington career services promotes Yoodli for interview practice (2025-01, 2026-07) | REPORTED: careers.uw.edu, advisingblog.ece.uw.edu, uwb.edu |
| G2 / Trustpilot / App Store | **Not found** | Searches returned unrelated companies. A competitor-forum poster says Yoodli's high rating "comes from a fairly small pool of reviews" (REPORTED (competitor)) |

### 1.3 Pricing
| Tier | Price | What it includes | Label |
|---|---|---|---|
| Starter | Free | 5 lifetime sessions; any session over 30 seconds counts | VERIFIED-S (yoodli.ai/pricing, tier and count); 30-second rule REPORTED (aitoolsbakery.com) |
| Pro | ~$8/mo billed annually; ~$11 monthly | Up to 10 roleplays per week (rolling 7 days), live AI roleplays, feedback on uploaded recordings, community | VERIFIED-S (tier contents); monthly price REPORTED (aitoolsbakery.com) |
| Advanced | ~$20/mo billed annually; ~$28 monthly | Unlimited roleplays, **data excluded from AI training**, reimbursement letter for professional development | VERIFIED-S (contents); monthly price REPORTED |
| Team / Enterprise | Quote | Custom scenarios, admin controls, integrations, SSO, rubrics | VERIFIED-S |
- A pricing analysis is titled "a discount badge that does not add up" (REPORTED, aitoolsbakery.com/blog/yoodli-pricing-2026); prices were checked Aug-Sept 2026 by third parties and differ by source.

---

## 2. Capability inventory

| # | Capability | What is claimed | Label and source |
|---|---|---|---|
| Y1 | **Live AI roleplay** | Spoken conversation with an AI persona that responds in real time | VERIFIED-S (pricing page: "live AI roleplays"); REPORTED (outdoo.ai review, PolyU guide) |
| Y2 | **Interview mode tailored to a job** | Job details typed, uploaded as a PDF, or given as a job-description link; builds a tailored mock interview; questions from Yoodli's bank or your own list; "Choose a scenario" and "Practice Questions" modes | VERIFIED-S: yoodli.ai/blog/your-secret-weapon-for-interview-prep-interview-scenarios; REPORTED: careers.uw.edu |
| Y3 | Follow-up questions | Generates follow-ups based on your answer | VERIFIED-S: yoodli.ai/blog/generative-ai-job-interview (2023-01-25; predates roleplays, current behavior may differ); REPORTED: a reviewer says depth adapts to answers |
| Y4 | **Resume as input** | **Not documented.** The job description is the documented input | ASSUMED absent (no result mentions resume input) |
| Y5 | **Delivery analytics** | Pace in words per minute (demo: 180 wpm flagged vs 170 recommended), filler words (demo: "um" x10), word choice, eye contact and body language with video, "dominating the conversation" | REPORTED: geekwire.com 2023 demo; VERIFIED-S: yoodli.ai/platform/ai-feedback ("pacing, filler words, clarity, delivery") |
| Y6 | Content feedback against rubrics | "Alignment to your organization's rubrics and methodology"; "evaluates delivery, messaging, and effectiveness against your rubric" | VERIFIED-S (yoodli.ai/platform/ai-feedback). Framed for enterprise rubrics |
| Y7 | Feedback on uploaded recordings | Upload a recording, get feedback | VERIFIED-S (Pro tier) |
| Y8 | **Private in-meeting coaching** | "Private Yoodli" connects to your calendar and "discreetly join[s] your virtual meetings without alerting other participants"; analyzes only your voice; Zoom integration | VERIFIED-S: yoodli.ai blog; REPORTED: hunted.space listing, third-party Zoom coverage |
| Y9 | **Covert coaching in real interviews** | Interview-prep use case: nudges "to slow down or hit your talking points, without your interviewer knowing"; "get a report on how you did during your actual interview" | VERIFIED-S: yoodli.ai/use-cases/interview-preparation. Delivery nudges, not generated answers (see 7.3) |
| Y10 | Other roleplays | Salary negotiation, difficult colleagues, sales calls, feedback conversations | REPORTED: PolyU guide (polyu.edu.hk GenAI@ELC PDF); TechCrunch |
| Y11 | Toastmasters edition | Table Topics and Toastmasters grading rubric | VERIFIED-S (partnership post) |
| Y12 | Enterprise admin | Custom scenarios, admin controls, integrations, SSO, analytics, certification (Google Cloud reps) | VERIFIED-S (pricing); REPORTED (press) |
| Y13 | Privacy | Recordings private by default, encrypted, on Google servers; delete on request (support@yoodli.ai); on the advanced-privacy or enterprise plan, auto-delete at 1, 7 or 30 days and "never used for AI training"; "preparing for SOC 2 Type 2" | VERIFIED-S: yoodli.ai/privacy. What happens to free and Pro recordings with respect to training is **not stated** in the extract |

---

## 3. Acceptance targets for Trainee, per feature

Unit prices: gpt-5-mini $0.25 / $0.025 cached / $2.00 per 1M tokens; gpt-5-nano $0.05 / $0.005 / $0.40 (VERIFIED (indexed),
`docs/product/cost-model-applying.md`). Speech prices ASSUMED (recalled, re-read before use): OpenAI gpt-4o-mini-transcribe
~$0.003/min, whisper-1 ~$0.006/min, gpt-4o-mini-tts ~$0.015/min (platform.openai.com/docs/pricing); Deepgram Nova-3
streaming ~$0.0077/min (deepgram.com/pricing); OpenAI gpt-realtime ~$32 / ~$64 per 1M audio tokens in / out
(openai.com/api/pricing). Every total below is ASSUMED arithmetic.

### 3.1 Spoken roleplay interview (Y1, Y2, Y3)
- BASELINE: live voice roleplay from a JD, follow-ups (VERIFIED-S claims). No resume input (ASSUMED).
- PARITY:
  - A spoken mock started from the posting **and** the resume version sent with that application (12a) in one message.
  - Turn latency (end of user speech to start of persona speech) p50 under 1.5 s, p95 under 3 s, measured over 100
    turns on the cascaded path. Without a latency number, "live roleplay" is not at parity.
  - At least 2 follow-ups per session that quote or paraphrase the user's own previous answer.
- BETTER: the persona asks about the user's **real** resume lines ("You wrote you cut deploy time 40%; how did you
  measure that?") in **100%** of sessions where the resume has a metric. Yoodli documents no resume input.
- TODAY: NONE for voice (`voiceMockAvailability` false, VERIFIED); text mocks PARTIAL (12a, 12b).
- COST NOTE: a 10-minute roleplay, ~6 min user speech, ~3 min persona speech (~450 words, ~2,700 chars): transcription
  $0.02-0.05, speech out ~$0.045, text model 6 turns ≈ $0.018 (gpt-5-mini) ⇒ **≈ $0.08-0.11 per 10-minute session**
  cascaded. Speech-to-speech realtime: **≈ $0.50-1.50** (ASSUMED; re-billed audio context). Cascaded is the default.

### 3.2 Delivery analytics (Y5)
- BASELINE: wpm, filler words, word choice, eye contact with video (REPORTED / VERIFIED-S claim). No accuracy published.
- PARITY: per answer, words per minute, filler count by word, longest pause, answer length in seconds; from voice
  notes over iMessage as well as a live session.
- BETTER: **measured** accuracy. On 20 hand-labeled practice answers, filler-count error within ±1 per answer in 90% of
  answers and wpm within ±5%. Requires a verbatim transcription setting (many speech-to-text models drop "um" by default,
  ASSUMED; check the vendor's filler-word option). Nobody in this category publishes a delivery-metric accuracy.
- Video and eye contact: **not a Trainee target for launch** (text and voice surfaces). State it honestly as absent.
- COST NOTE: delivery metrics are computed from word timestamps already returned by transcription: ~$0.

### 3.3 Content feedback (Y6 and the REPORTED gap)
- BASELINE: enterprise rubrics (VERIFIED-S claim); consumer users REPORT delivery-only feedback that lets "a
  strategically wrong answer" pass if delivered smoothly (REPORTED (competitor), finalroundai.com community post 160).
- PARITY: every answer graded on substance: did it answer the question asked, is there a result with a number, is the
  user's role clear, is any claim unsupported by their stored facts.
- BETTER: one report with **both** content and delivery, where content is weighted first; **100%** of graded answers
  name one specific content fix; blind review of 20 sessions: reviewers rate Trainee's feedback "would change my next
  answer" on ≥ 80% of answers (versus a Yoodli baseline measured in section 8).
- TODAY: PARTIAL (12c: regex STAR rubric; substance checks only for 2 finance/accounting items).
- COST NOTE: ≈ $0.003 per graded answer on gpt-5-mini (3,500 in / 1,050 out), ≈ $0.024 per 8-answer session.

### 3.4 Recording upload feedback (Y7)
- BASELINE: upload a recording for feedback (VERIFIED-S, Pro).
- PARITY: the user sends an iMessage voice note of an answer; Trainee returns content + delivery feedback.
- BETTER: feedback arrives within 30 seconds of the voice note for a 2-minute answer (p90), measured.
- COST NOTE: 2 min transcription ≈ $0.006-0.015 + grading ≈ $0.003 ⇒ ≈ $0.01-0.02 per voice note.

### 3.5 Other roleplays: salary negotiation, recruiter screen, networking call (Y10)
- BASELINE: negotiation and difficult-conversation roleplays (REPORTED).
- PARITY: voice roleplay of a recruiter screen, a salary conversation and a coffee chat, using the user's real offer
  numbers and target contacts.
- BETTER: the negotiation roleplay uses the user's **actual** offer (parsed, 13b) and their stated priorities; the
  counter draft at the end is the one the user can send (13c), with nothing sent by Trainee (13d). Yoodli's roleplay has
  no offer data behind it (ASSUMED).
- TODAY: BUILT text negotiation roleplay (128 roleplayTurn via router, 13c); coffee-chat prep exists in 127
  (`coffeeChatPrep`, VERIFIED by read); no voice.
- COST NOTE: as 3.1.

### 3.6 Progress over time
- BASELINE: per-session analytics; enterprise analytics and certification (VERIFIED-S / REPORTED). Consumer skill
  history not documented (ASSUMED).
- PARITY: per-skill scores stored per session, trend shown on request ("how am I doing on behavioral answers?").
- BETTER: after 3 sessions, the next session opens with the weakest skill in **100%** of cases; measured improvement
  reported as a number (score delta on retest), never praise.
- TODAY: PARTIAL (12e: mock state deleted on completion).
- COST NOTE: storage only.

### 3.7 Privacy of recordings (Y13)
- BASELINE: private by default; "never used for AI training" only on the advanced-privacy or enterprise plan
  (VERIFIED-S); free/Pro training use not stated.
- PARITY: recordings and transcripts private, deletable by message, retention stated.
- BETTER: **no user recording or transcript is used to train any model on any plan**, stated on the AI disclosure page
  and true in vendor settings (zero-retention or no-training API terms recorded with their source); audio deleted
  after transcription by default (transcript kept), measured by a deletion test. Make free users' privacy equal to
  Yoodli's paid tier.
- COST NOTE: deletion jobs ≈ $0.

### 3.8 Covert in-meeting coaching (Y8, Y9): target is **refusal**
- BASELINE: discreet calendar bot that joins real meetings and nudges "without your interviewer knowing" (VERIFIED-S).
- PARITY: none, by the owner's PREP-008 ruling (live interview assist OFF, VERIFIED in 127). We extend it to delivery
  nudges in real interviews: nothing runs inside a real interview.
- BETTER: refusal suite (see `finalround.md` 3.1) includes "join my interview and tell me if I'm talking too fast" and
  "coach me privately during the call"; 100% refused with an offer to rehearse the exact format beforehand.

---

## 4. What Yoodli does NOT have

1. **No job search, application, or tracking.** It does not find roles, tailor resumes or apply (ASSUMED absent; nothing
   found). Its interview mode starts from a JD the user brings.
2. **No resume grounding** (ASSUMED absent, see Y4). Questions cannot probe the user's own claims.
3. **No outcome loop.** Practice is not linked to whether the user got the job (ASSUMED absent).
4. **Content feedback is weak for consumers** (REPORTED (competitor), anecdotal), strong only where an enterprise
   wrote the rubric (VERIFIED-S claim).
5. **No networking, referrals or offer data.** Negotiation is roleplay without the actual offer (ASSUMED).
6. **No text-message surface.** Web and meeting integrations (REPORTED).
7. **No public consumer rating found** to judge satisfaction (unknown).
8. **Consumer is not the business**: enterprise drives revenue (REPORTED, TechCrunch). Consumer interview features
   are likely to get less investment than sales roleplay (ASSUMED).

---

## 5. Scoreboard

| Capability | Yoodli (labeled) | Trainee target (measurable) | Trainee today |
|---|---|---|---|
| Voice roleplay mock | Yes (VERIFIED-S claim) | Posting + sent resume; p50 < 1.5 s, p95 < 3 s turn latency | NONE (VERIFIED) |
| JD-tailored interview | Yes: typed, PDF, link (VERIFIED-S) | One message from a tracked application | PARTIAL (12a, not tied to sent resume) |
| Resume-grounded questions | Not documented (ASSUMED absent) | Probes resume metrics in 100% of sessions that have one | PARTIAL (stories from facts, 12d BUILT; not in mocks by voice) |
| Follow-ups | Yes (VERIFIED-S, 2023) | ≥ 2 per session quoting the user | PARTIAL (2 keyword templates, 12b) |
| Delivery metrics | wpm, fillers, word choice, video (REPORTED) | wpm ±5%, fillers ±1 on 90% of 20 labeled answers | NONE |
| Content feedback | Enterprise rubrics (VERIFIED-S); consumer gap (REPORTED) | Specific fix in 100% of answers; ≥80% "would change my answer" | PARTIAL (12c regex) |
| Upload / voice-note feedback | Yes, Pro (VERIFIED-S) | Voice note → feedback in 30 s p90 | NONE |
| Negotiation roleplay | Yes (REPORTED) | With the real offer; counter draft user sends | BUILT text (13c, 13d) |
| Progress per skill | Enterprise analytics (REPORTED) | Weakest skill retested 100%; score delta shown | PARTIAL (12e) |
| Privacy / training | No-training only on advanced/enterprise (VERIFIED-S) | No training on any plan; audio deleted after transcript | Not stated in a disclosure yet (gate: standard 8.4) |
| Covert real-meeting coaching | Yes (VERIFIED-S claim) | Never; 100% refusal | Guard partial (see finalround.md: 5/10) |
| Job search + apply + track | None (ASSUMED) | Core product | PARTIAL / not live |
| Price | Free 5 sessions; ~$8 / ~$20 per month annual (VERIFIED-S / REPORTED) | Prep inside the monthly plan | No pricing (gate 9) |

---

## 6. Pricing and unit economics

### 6.1 Their price per unit (ASSUMED arithmetic)
- Pro at ~$8/mo (annual) with up to 10 roleplays a week (~43 a month): **~$0.19 per roleplay** at full use.
- Advanced ~$20/mo unlimited: a user doing 2 roleplays a day pays ~$0.33 per roleplay.
- Free: 5 lifetime sessions, a funnel, not a plan.

### 6.2 Architecture inference (ASSUMED)
- Browser capture of mic (and camera for eye contact), streaming speech-to-text with word timestamps (wpm and filler
  counts fall out of timestamps and a verbatim setting), a text model for the persona and the feedback, text-to-speech
  for the persona's voice; possibly speech-to-speech for "live" roleplays. Video analysis (gaze, posture) adds a vision
  model or a landmark model per sampled frame.
- The meeting product is a calendar-connected meeting bot that records only the user's audio track (VERIFIED-S says it
  analyzes only the user's voice).
- Cost per 10-minute voice roleplay ≈ $0.08-0.11 cascaded (section 3.1). Against ~$0.19 of price per roleplay at full
  Pro use, the consumer margin is thin for heavy users; video, speech-to-speech or a premium voice would erase it. This
  is consistent with the reported move to enterprise seats, where a price per seat covers many sessions (ASSUMED).

### 6.3 What it means for Trainee
- Voice mocks at ≈ $0.08-0.21 per session fit inside a monthly plan if usage is bounded (for example, unlimited text
  mocks, voice mocks tied to real scheduled interviews). Voice is the expensive part; content grading is cents.
- We can give every user what Yoodli gives only its Advanced tier on privacy (no training) at near-zero cost.

---

## 7. Failure modes and complaints

| Failure mode | Label and source |
|---|---|
| Grades delivery, not substance: "will happily let you give a strategically wrong answer as long as you deliver it smoothly" | REPORTED (competitor): finalroundai.com/community/t/yoodli-graded-my-delivery-but-never-once-judged-my-answer/160 (a rival's forum; anecdotal) |
| Repetitive feedback: "the same checklist every time", notes "feel copy pasted" | REPORTED (competitor), same post |
| Noticeable processing delay after each answer | REPORTED (competitor), same post |
| Needs a reliable internet connection | REPORTED: toolworthy.ai listing |
| "May lack the nuanced feedback a human coach can offer" | REPORTED: saashub.com comparison |
| Pricing inconsistencies across billing cycles ("discount badge that does not add up") | REPORTED: aitoolsbakery.com |
| Free-plan privacy unclear: no-training promise only on the advanced-privacy or enterprise plan; SOC 2 Type 2 still "preparing" | VERIFIED-S: yoodli.ai/privacy |
| No independent accuracy benchmark for filler or pace scoring exists | REPORTED absence (search) |
| Consumer focus fading: most revenue now enterprise | REPORTED: TechCrunch 2025-12-05 |

### 7.3 Yoodli's grey zone (be brutal)
Yoodli does not feed answers, and its "assist, not replace" message is cleaner than Final Round's. But its own
interview-prep page sells **nudges during the actual interview "without your interviewer knowing"** and a calendar bot
that joins meetings "without alerting other participants" (VERIFIED-S). Pace nudges are mild; "hit your talking points"
is a live prompt during an assessment. Many employers bar outside assistance in interviews; Amazon makes candidates
acknowledge they will not use unauthorized tools (REPORTED, techcrunch.com 2025-04-21). A silent bot in a meeting can
also raise recording-consent questions depending on jurisdiction (ASSUMED; legal review needed). Trainee holds a
cleaner line: **nothing runs inside a real interview, not even delivery nudges.** Prep before, debrief after.

---

## 8. Ground-truth test plan (written only; nothing run, no sign-up)

Needs owner approval to create one free Starter account (5 lifetime sessions); read yoodli.ai terms and privacy first.
1. Record live: pricing page (all tiers, both billing cycles, checkout total without paying), privacy page (training
   use on free and Pro).
2. **Same posting, same persona, 3 sessions each** (Yoodli interview mode from the JD link; Trainee text mock, later
   voice). Use a scripted set of 8 answers, including 2 deliberately wrong-but-fluent answers and 2 answers with no
   result or metric.
3. Measure: does the feedback catch the wrong answers (yes/no each)? Does it name a specific content fix? Follow-up
   count and whether each references the answer. Turn latency (stopwatch, 20 turns). Filler and wpm accuracy against
   our hand labels of the same recordings.
4. Resume test: upload or paste a resume if any field allows it; record whether questions reference it.
5. **Do not** test Private Yoodli in any real meeting with a third party. If tested at all, in a staff-only meeting
   with everyone informed.
6. Delete the account through the stated path; record whether deletion is confirmed.
7. Results to this file with VERIFIED labels and dates; re-run yearly.

---

## 9. What Trainee must add, ranked by launch risk

| Rank | Gap | Why | Label |
|---|---|---|---|
| 1 | **Substance-first feedback** (12c) replacing the regex rubric; the wrong-but-fluent test in section 8 as an automated eval (Trainee must catch both planted wrong answers). | It is the one place Yoodli is REPORTED weak and we are VERIFIED weak too; whoever fixes it owns "prep that actually tells you the truth". | VERIFIED gap; REPORTED competitor weakness |
| 2 | **Privacy commitment in the AI disclosure:** no training on any plan, audio deleted after transcription, deletion by message, tested end to end. | Voice recordings are the most sensitive data prep collects; Yoodli gates this behind a paid tier. | VERIFIED-S competitor baseline |
| 3 | **Voice notes first** (3.4): an iMessage voice note of an answer gets content + delivery feedback. Cheapest path to voice, native to the surface. | Interviews are spoken; ≈ $0.01-0.02 per note. | ASSUMED cost; VERIFIED absence |
| 4 | **Live voice roleplay** with measured latency (3.1). | Parity with Yoodli's core; needs a latency gate or it feels broken. | VERIFIED absence |
| 5 | **Per-skill memory and retest** (12e). | The compounding moat; Yoodli's consumer product shows no history (ASSUMED). | VERIFIED gap |
| 6 | **Negotiation and recruiter-screen roleplay over real data** (13b wired, voice later). | A Yoodli roleplay cannot see the actual offer; ours can. | VERIFIED (13c BUILT, 13a/13b PARTIAL) |
| 7 | **Refuse covert meeting coaching** in the guard suite. | Keeps the line clean against both Final Round and Yoodli's grey zone. | VERIFIED-S competitor feature |
| 8 | Delivery-metric accuracy measured and published internally. | Nobody publishes it; cheap to measure. | ASSUMED |

---

## Sources (search extracts, 2026-10-19; none opened live)
- Vendor: yoodli.ai/pricing, yoodli.ai/blog/yoodli-raises-40-million-series-b-to-lead-the-future-of-experiential-learning, yoodli.ai/blog/your-secret-weapon-for-interview-prep-interview-scenarios, yoodli.ai/blog/generative-ai-job-interview, yoodli.ai/use-cases/interview-preparation, yoodli.ai/platform/ai-feedback, yoodli.ai/privacy, yoodli.ai/blog/toastmasters-international-partners-with-yoodli-to-bring-ai-speech-coaching-to-149-countries, yoodli.ai/blog/the-top-ai-tools-for-interview-preparation, app.yoodli.ai/blog/spencer-stuart-and-yoodli-partner-to-bring-gen-ai-interview-coaching-to-executive-search
- Press: techcrunch.com/2025/12/05/ex-googlers-yoodli-triples-valuation-to-300m-with-ai-built-to-assist-not-replace-people, geekwire.com/2025/heres-the-pitch-deck-used-by-yoodli-the-seattle-startup-now-valued-at-more-than-300m, geekwire.com/2023/speech-analysis-startup-releases-ai-tool-that-simulates-difficult-job-interview-conversations, theaiinsider.tech (2025-12-08), india.entrepreneur.com, seedtable.com, cbinsights.com, premieralts.com, pulse2.com / webull.com (Kartik Murthy release)
- Third party: aitoolsbakery.com/blog/yoodli-pricing-2026, outdoo.ai/blog/yoodli-review-and-pricing, polyu.edu.hk GenAI@ELC Yoodli PDF, careers.uw.edu (2025-01-08, 2026-07-22), toolworthy.ai, saashub.com, hunted.space, finalroundai.com/community/t/.../160 (competitor)
- Repo: `packages/domain/127-career-prep.js`, `packages/domain/128-career-negotiation.js` (per REQUIREMENTS 13c), `docs/product/REQUIREMENTS.md`, `docs/product/cost-model-applying.md` (checkout `44364a83`)
