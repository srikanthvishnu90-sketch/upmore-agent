# Phase A — Reply-Quality Audit of 30 Career Transcripts (W-AUDIT)

Date: 2026-10-13 · Auditor: W-AUDIT (read-only; no code or repo files changed) · Evidence: `~/workspace/your_files/upmore-career-conversations/` (.md transcript + .png render + .messages.json per scenario)

## Method & definitions (read before the counts)

- **Defects are scored on user-visible AGENT bubbles** in the .md (all of them; the FIRST bubble is quoted). The `*[tool …]*` blocks and `**VERIFIED FROM RAIL STATE:**` blocks in the .md are NOT bubbles: all 30 PNGs confirm they are excluded from the chat render. That is why `tool_marker_in_bubble` is 0/30.
- **Sentence counts** were counted programmatically on the first bubble's prose (JSON code blocks excluded). `over_length` = strictly >6 prose sentences, per the brief. Walls that stay under 6 sentences are flagged in the evidence text (e.g. SC-060: 1 sentence, 2,585 chars; SC-008: 5,732 chars of JSON).
- **Severity calibration:** P0 = raw JSON / UUID-grade IDs actually visible in the PNG render, a false or inflated completion claim, or no reply. A small human-readable record label in prose (SC-206's `offer-1`) was scored P1/P2, not P0. P1 = wall of text, jargon-heavy, missing next step. P2 = stiff tone / minor leaks. P3 = cosmetic.
- **Generation** follows the brief's filename rule: filenames containing `-canonical` = finisher-canonical; everything else = run-1. Only 2 of the 30 sampled scenarios have a `-canonical` artifact (SC-182, SC-185, both Interview Prep, SC-181–200 block).
- **Screenshot check:** for all 30, the .png renders exactly the .md USER + AGENT bubbles (match = yes). What differs is the CARD renderer (see summary).

## Sampling (exactly 30)

### Stratified — 20 (family blocks from `docs/scenario-ledger.md`, 2–3 per block, spread start/middle/end; latest-generation artifact per scenario)

| Family block (ledger) | Range | Picked |
|---|---|---|
| Outreach & Networking | SC-001–060 | SC-001, SC-031, SC-060 |
| Apply Engine | SC-061–120 | SC-061, SC-090, SC-120 |
| Track & Follow-Up | SC-121–145 | SC-121, SC-145 |
| Referrals & Warm Paths | SC-146–175 | SC-146, SC-175 |
| Interview Prep | SC-176–205 | SC-185 (finisher-canonical), SC-205 |
| Negotiation | SC-206–220 | SC-206, SC-220 |
| Intelligence & Honest Advice | SC-221–270 | SC-221, SC-270 |
| Career OS | SC-271–285 | SC-271, SC-285 |
| Access, Safety & Honesty | SC-286–300 | SC-286, SC-300 |

Note on duplicates: many SC ids have two .md files (an older-numbering original and the ledger-canonical scenario). The sampled file is the one whose USER ask matches the ledger's canonical scenario text for that ID — listed per record below. `PRECANON-*` files were excluded entirely, as instructed.

### Random — 10 (deterministic, as instructed)

Method: list all canonical SC-001–SC-300 transcript .md files (one per scenario ID, the ledger-matching file; `-canonical` file where one exists), sorted by filename (zero-padded IDs make filename order = numeric order). Take every 29th starting at index 7 (0-based): indices 7, 36, 65, 94, 123, 152, 181, 210, 239, 268 → **SC-008, SC-037, SC-066, SC-095, SC-124, SC-153, SC-182 (finisher-canonical), SC-211, SC-240, SC-269**. None collided with the stratified set, so no skip/next substitutions were needed.

## Per-transcript records

### SC-001 — stratified · run-1 · severity P1 · tone: log-like
- Artifact: `SC-001-outreach-300-ny-bankers-drafted.md` (+ matching .png / .messages.json)
- User's first ask: "Find 300 top bankers in NY + a personalized coffee-chat email drafted for each"
- Agent's first reply bubble (3 prose sentences, 355 chars incl. any JSON block): "Parsed: count=300. "Top bankers in NY" is ambiguous, so here is the interpretation I will build unless you say otherwise: analysts and associates at the bulge-bracket, elite-boutique and middle-market firms in the real firm-sets file (26 firms), New York offices only. Per-firm cap is 15 per 30 da..."
  - machine-payload-in-bubble: YES — First bubble is clean prose, but later AGENT bubbles embed ```json card blocks (List review, Draft cards)
  - raw-id-leak: YES — Later draft bubbles are headed 'Sample draft (SC-001) — Tier A' — scenario ID used as a user-facing label
  - tool-marker-in-bubble: no — Tool lines sit outside AGENT bubbles and are absent from the PNG
  - over-length (>6 sentences): no — First bubble: 3 sentences
  - empty-reply: no — Replies present
  - false-or-inflated-completion: no — Drafts are called drafts; verify block backs 300 drafts
  - finance-content-in-career-reply: no — Career outreach only
  - missing-next-step: no — First bubble sets an interpretation 'unless you say otherwise'; cards carry an Approve action
  - internal-jargon: YES — First bubble opens 'Parsed: count=300' and cites 'the real firm-sets file'
- Screenshot: match=yes; card rendering: formatted — yes — PNG bubbles match .md AGENT bubbles; List-review and Draft cards render FORMATTED (labelled fields, no braces), unlike the raw-JSON cards in other scenarios

### SC-031 — stratified · run-1 · severity P0 · tone: stiff
- Artifact: `SC-031-reply-booking-tue-wed-5pm-et.md` (+ matching .png / .messages.json)
- User's first ask: "Reply handling: banker offers Tue or Wed 5pm ET — propose from my calendar, card, book it"
- Agent's first reply bubble (1 prose sentences, 244 chars incl. any JSON block): "Book this coffee chat? ```json { "type": "booking", "title": "Book this coffee chat?", "start": "2026-10-14T21:00:00.000Z", "end": "2026-10-14T21:30:00.000Z", "timezone": "America/New_York", "contact": "Banker Fixture (TEST)" } ```"
  - machine-payload-in-bubble: YES — First AGENT bubble is 'Book this coffee chat?' plus a ```json booking block
  - raw-id-leak: YES — Second bubble prose: 'event TEST-EVT-2 is on your calendar' and ISO timestamps '2026-10-14T21:00:00.000Z' throughout
  - tool-marker-in-bubble: no — Tool lines outside bubbles / absent from PNG
  - over-length (>6 sentences): no — First bubble prose: 1 sentence (plus JSON block)
  - empty-reply: no — Replies present
  - false-or-inflated-completion: no — Booking claim is backed by the VERIFIED block: TEST-EVT-2 read back from the fixture calendar
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — The booking itself is the completed ask
  - internal-jargon: no — No CIR/rail/module labels in bubbles; stiffness is from raw ISO timestamps
- Screenshot: match=yes; card rendering: raw — yes — match; the booking card renders as RAW JSON inside the card (braces and quoted keys visible)

### SC-060 — stratified · run-1 · severity P0 · tone: stiff
- Artifact: `SC-060-the-dream-50-warm-paths-ranked.md` (+ matching .png / .messages.json)
- User's first ask: "The dream 50: 50 named people across my 10 dream companies, warm paths ranked"
- Agent's first reply bubble (1 prose sentences, 2585 chars incl. any JSON block): "Your dream 50 — 5 named people at each of your 10 dream companies, warm paths ranked inside each company: Stripe: Aaron Voss (alumni + shared org/major, rank 65); Carlos Mendez (alumni + same hometown, rank 55); Bianca Reed (alumni, rank 40); Dana Whitfield (alumni, rank 40); Elias Ford (alumni, ..."
  - machine-payload-in-bubble: YES — First bubble ends with a ```json 'The dream 50' block
  - raw-id-leak: no — No IDs in bubbles; unexplained 'rank 65/55/40' scores only
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — 1 prose sentence — but it is a 2,585-char wall listing all 50 names in one bubble
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — 50 names delivered as claimed; verify block backs counts
  - finance-content-in-career-reply: no — None
  - missing-next-step: YES — Reply ends with the JSON card; no offered next step (e.g. draft to the warmest path) after a 50-person list
  - internal-jargon: no — No internal labels; 'rank 65' scores are unexplained but not internal terms
- Screenshot: match=yes; card rendering: raw — yes — match; the dream-50 card renders as RAW JSON

### SC-061 — stratified · run-1 · severity P0 · tone: stiff
- Artifact: `SC-061-adjust-resume-and-auto-apply.md` (+ matching .png / .messages.json)
- User's first ask: "Adjust my resume and auto apply"
- Agent's first reply bubble (2 prose sentences, 1114 chars incl. any JSON block): "Here's how "auto apply" works under your locked rules: I tailor your resume per role (truth audit on every version), and applications run only under a rule or batch card you approved — never silently. These 4 roles are tailored and ready:"
  - machine-payload-in-bubble: YES — First bubble contains a ```json batch_approval block ('fit': null, 'resumeVersion': 'resume-v1')
  - raw-id-leak: no — Only resume-v1..v4 version labels; APP-001..004 appear only in tool lines
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — First bubble prose: 2 sentences
  - empty-reply: no — Replies present
  - false-or-inflated-completion: no — Second bubble says 'Nothing has been submitted yet'; final bubble claims only '4 applications recorded', backed by afterYes: 4
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — Asks for approval / offers a standing rule
  - internal-jargon: YES — Second bubble references another scenario as a user-facing label: 'set a standing rule (like SC-078's)'
- Screenshot: match=yes; card rendering: raw — yes — match; the batch-approval card renders as RAW JSON

### SC-090 — stratified · run-1 · severity P0 · tone: stiff
- Artifact: `SC-090-jane-street-quant.md` (+ matching .png / .messages.json)
- User's first ask: "Tailor for Jane Street — competitions, probability coursework, research forward"
- Agent's first reply bubble (2 prose sentences, 366 chars incl. any JSON block): "Tailored for Jane Street in the Quant/trader variant. Every line passed the truth audit against your confirmed facts — nothing was added that your profile does not prove."
  - machine-payload-in-bubble: YES — First bubble contains a ```json block ('auditOk': true)
  - raw-id-leak: no — F-001..F-019 appear only in tool/VERIFIED blocks, not in bubbles
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — First bubble prose: 2 sentences
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Tailoring claim backed by audit in VERIFIED block
  - finance-content-in-career-reply: no — Resume content mentions DCF only inside tool payload, not the bubble
  - missing-next-step: no — Tailoring was the whole ask; deliverable complete
  - internal-jargon: no — 'Truth audit' is product language, no module/CIR/rail terms
- Screenshot: match=yes; card rendering: raw — yes — match; the Tailored card renders as RAW JSON

### SC-120 — stratified · run-1 · severity P1 · tone: stiff
- Artifact: `SC-120-batch-approval-card.md` (+ matching .png / .messages.json)
- User's first ask: "Apply to these 8 roles?"
- Agent's first reply bubble (4 prose sentences, 3283 chars incl. any JSON block): "Approval card — nothing goes out until your yes. 8 roles, each with its fit and the exact resume version that would be attached: Ramp — Backend Engineer, Ops Engineering: fit 65 (Match), resume checked (audit passed); Stripe — Forward Deployed Engineer, Privy: fit 63 (Match), resume checked (audi..."
  - machine-payload-in-bubble: YES — First bubble appends a full ```json roles block after the prose
  - raw-id-leak: YES — Bubble JSON carries variant UUIDs, e.g. 'VAR-ashby:ramp:7bfa613e-151c-469b-9973-c89ee3d14838' — present in the .md bubble; the PNG renderer drops variant_id, so it is not visible in the screenshot
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — 4 prose sentences — but one is a ~200-word semicolon list of all 8 roles; total first bubble 3,283 chars
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Explicitly 'nothing goes out until your yes'; 'submitted': false
  - finance-content-in-career-reply: no — One role is 'Associate, Strategic Finance' — a job title, not finance content
  - missing-next-step: no — Ends 'Say yes to the card (or name the ones to drop)'
  - internal-jargon: YES — Prose: 'only then do doorstep submissions begin' and 'wrong-company attach guard' — internal terms
- Screenshot: match=yes; card rendering: formatted — yes — match; card renders FORMATTED and omits variant_id (the .md JSON's UUIDs do not reach the screenshot)

### SC-121 — stratified · run-1 · severity P1 · tone: log-like
- Artifact: `SC-121-where-do-i-stand.md` (+ matching .png / .messages.json)
- User's first ask: "Where do I stand?"
- Agent's first reply bubble (1 prose sentences, 1762 chars incl. any JSON block): "Here is the true stage of everything, straight from your application log (12 applications, 7 open): • Stripe — Software Engineering Intern: Offer (applied 2026-09-20, 2d quiet, resume swe-v2, referred) • Ramp — Software Engineering Intern: Confirmed (applied 2026-10-02, 9d quiet, resume swe-v2, c..."
  - machine-payload-in-bubble: YES — First bubble ends with a ```json 'Where you stand' block
  - raw-id-leak: no — TEST-app-* IDs appear only in the tool payload
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — 1 intro sentence + 12 bullet lines (1,762 chars) — a log dump, counted as a wall in the note, not >6 sentences
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Stages match the tool payload rows
  - finance-content-in-career-reply: no — None
  - missing-next-step: YES — Ends with the JSON card (generic 'Action: Continue' in the render); no suggested action despite a live Offer and an OA/assessment pending
  - internal-jargon: no — Stage names are user-facing tracker terms
- Screenshot: match=yes; card rendering: formatted — yes — match; card renders FORMATTED (Total/Open/By stage)

### SC-145 — stratified · run-1 · severity P3 · tone: human
- Artifact: `SC-145-season-retro.md` (+ matching .png / .messages.json)
- User's first ask: "Season retro: what converted, what didn't, next season's plan"
- Agent's first reply bubble (5 prose sentences, 509 chars incl. any JSON block): "Retro from your own log (12 applications): • Converted: Referred applications advanced at 50% vs cold at 12.5% — in your own log, referrals are the converting channel. • Didn't: Cold Reach applications and resume version fin-v1 converted worst (0/4 advanced). • Next season: Lead with warm paths: ..."
  - machine-payload-in-bubble: no — Single AGENT bubble, plain bullets, no JSON anywhere in the bubble
  - raw-id-leak: no — No IDs; 'fin-v1' is a resume-version label
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — 5 sentences
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Numbers match the tool payload (50% vs 12.5%)
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — Ends with a 3-point next-season plan
  - internal-jargon: no — No internal terms
- Screenshot: match=yes; card rendering: none — yes — exact match; no card in this transcript

### SC-146 — stratified · run-1 · severity P0 · tone: log-like
- Artifact: `SC-146-who-do-i-know-at-stripe.md` (+ matching .png / .messages.json)
- User's first ask: ""Who do I know at Stripe?" — warm paths from my LinkedIn export"
- Agent's first reply bubble (2 prose sentences, 2903 chars incl. any JSON block): "From your LinkedIn export, 7 people at Stripe. Warmest: Maya Alumni (TEST) (alumni — Both TEST University); Nina Newhire (TEST) (alumni — Both TEST University); Ben Clubmate (TEST) (club — Shared club: Pi Kappa Phi (TEST chapter))."
  - machine-payload-in-bubble: YES — First bubble appends a ~2,600-char ```json paths block
  - raw-id-leak: YES — JSON card exposes 'person_id': 'P-001', 'P-009', 'P-002'… and renders raw in the PNG
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — Prose: 2 sentences (plus the JSON wall)
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — 7 people at Stripe as the tool payload lists
  - finance-content-in-career-reply: no — None
  - missing-next-step: YES — Ends with the raw JSON card; no offered next step (e.g. draft an intro ask to the warmest path)
  - internal-jargon: no — Prose is plain; internal keys (warmth_tier, shared_fact) are counted under machine payload
- Screenshot: match=yes; card rendering: raw — yes — match; card renders as RAW JSON including person_id values

### SC-175 — stratified · run-1 · severity P0 · tone: stiff
- Artifact: `SC-175-referred-at-datadog-end-to-end.md` (+ matching .png / .messages.json)
- User's first ask: "Get me referred at Datadog"
- Agent's first reply bubble (11 prose sentences, 1121 chars incl. any JSON block): "End to end, here's the Datadog referral: PATH: Priya Nair (TEST) (warmth 85 — alumni:TEST University, shared club, 1st-degree), chosen over Sam Ortiz, who stays held and unburned. Your Oct 10 coffee chat is on record — Priya offered to refer, so the ask is legitimate, and it goes AFTER the chat, ..."
  - machine-payload-in-bubble: YES — First bubble ends with a ```json approval-card block
  - raw-id-leak: YES — Card shows 'referral_id': 'ref-87900ada' — visible in the PNG as 'Referral id: ref-87900ada', with 'Status: draft_on_card'
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): YES — 11 prose sentences — the bubble embeds the full referral email plus framing
  - empty-reply: no — Replies present
  - false-or-inflated-completion: no — First bubble is honestly a draft on a card; second bubble's 'Sent on your approval (TEST rail — no real person contacted)' is immediately qualified by 'Your referral is approved and not yet submitted' — confusing, but not an unqualified false claim
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — Card asks for approval
  - internal-jargon: YES — Second bubble: '(TEST rail — no real person contacted)' — 'rail' used to the user
- Screenshot: match=yes; card rendering: formatted — yes — match; approval card renders FORMATTED but still displays 'Referral id: ref-87900ada' and 'Status: draft_on_card'

### SC-185 — stratified · finisher-canonical · severity P1 · tone: stiff
- Artifact: `SC-185-canonical-mbb-case-prep-plan.md` (+ matching .png / .messages.json)
- User's first ask: "Case prep plan for MBB: the 30–50 case norm, labeled community-reported, scheduled."
- Agent's first reply bubble (9 prose sentences, 1922 chars incl. any JSON block): "Your MBB case prep plan (McKinsey company file on file; BCG/Bain company files use the same rail): THE NORM — LABELED HONESTLY: 30–50 full practice cases before interviews [label: community-reported; official: false]. This count is community-reported preparation folklore passed on by candidates a..."
  - machine-payload-in-bubble: no — No JSON block in the bubble — but machine-style labels are pasted into prose: '[label: community-reported; official: false]' and 'inside the norm: true'
  - raw-id-leak: no — No IDs in the bubble
  - tool-marker-in-bubble: no — Tool lines outside bubbles; the internal function name scoreCaseResponse appears in prose — counted under jargon
  - over-length (>6 sentences): YES — 9 prose sentences; 1,922-char single bubble
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Norm honestly labelled community-reported / not official
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — Ends with a practice case 'ready when you are'
  - internal-jargon: YES — Internal function name 'scoreCaseResponse' repeated 7 times; 'BCG/Bain company files use the same rail'
- Screenshot: match=yes; card rendering: none — yes — exact match; no card

### SC-205 — stratified · run-1 · severity P1 · tone: stiff
- Artifact: `SC-205-bar-raiser-panel-prep.md` (+ matching .png / .messages.json)
- User's first ask: "Panel with a bar-raiser-style interviewer: prep for the hardest questioner"
- Agent's first reply bubble (16 prose sentences, 1481 chars incl. any JSON block): "Bar-raiser panel prep. FIRST, THE HONEST GROUNDING: No CIR for this employer exists in the merged corpus, so no company process, bar or comp claim is made. 'Bar-raiser-style' is YOUR description of the panel; prep below targets the hardest-questioner dynamic generically. THE HARDEST QUESTIONS (re..."
  - machine-payload-in-bubble: no — No JSON block in the bubble
  - raw-id-leak: no — mock-92c053fb appears only in the tool payload
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): YES — 16 prose sentences in one bubble
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Mock results match the tool payload (2 answered, weakest: structure)
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — Ends 'weakest dimension: structure — drill that first'
  - internal-jargon: YES — 'No CIR for this employer exists in the merged corpus' and 'rubric (127 scoreAnswer)' — CIR + module number as user-facing text
- Screenshot: match=yes; card rendering: none — yes — exact match; no card

### SC-206 — stratified · run-1 · severity P1 · tone: log-like
- Artifact: `SC-206-offer-intake.md` (+ matching .png / .messages.json)
- User's first ask: "Offer intake: my offer letter parsed into the log — base, equity, bonus, benefits, start, expiry"
- Agent's first reply bubble (1 prose sentences, 508 chars incl. any JSON block): "Parsed into the log as offer-1: • Company: Airbnb — Software Engineer, New Grad (San Francisco, CA) • Base: $132,000 • Signing bonus: $15,000 • Annual bonus: target 10% of base • Equity: $80,000 RSU grant, vesting over 4 years, 1-year cliff • Benefits: health insurance (as stated in letter); dent..."
  - machine-payload-in-bubble: no — No JSON in the bubble; plain bullet list
  - raw-id-leak: YES — Prose opens 'Parsed into the log as offer-1:' — internal record ID as the headline
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — 1 intro line + bullets
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — All figures match the pasted letter / stored row
  - finance-content-in-career-reply: no — Offer comp figures are the career negotiation subject, not finance-product content
  - missing-next-step: YES — Ends 'Missing fields: none' — no next step offered although the same bubble says the 2026-10-30 'expiry clock is running'
  - internal-jargon: no — No CIR/rail/module terms
- Screenshot: match=yes; card rendering: none — yes — exact match; no card

### SC-220 — stratified · run-1 · severity P2 · tone: stiff
- Artifact: `SC-220-tax-legal-referred-out.md` (+ matching .png / .messages.json)
- User's first ask: "Tax and legal questions in an offer — referred out; advice labeled as advice"
- Agent's first reply bubble (6 prose sentences, 1432 chars incl. any JSON block): "This is a tax/legal question about your offer. It is REFERRED OUT — the agent does not answer tax or legal specifics, and anything below is logistics, not advice. WHO TAKES WHAT: • Employment lawyer (licensed in the state where you'll work) — non-compete / non-solicit, IP assignment, arbitration,..."
  - machine-payload-in-bubble: no — No JSON in the bubble
  - raw-id-leak: no — No IDs
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — 6 prose sentences (at, not over, the >6 threshold) — but a 1,432-char structured wall
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Correctly refuses to answer tax/legal specifics
  - finance-content-in-career-reply: no — Tax/legal questions are referred out unanswered — no finance advice given
  - missing-next-step: no — Ends with what it CAN do: benchmark, total-comp math, draft the extension
  - internal-jargon: YES — 'send the card-gated extension request' — internal mechanism as user language
- Screenshot: match=yes; card rendering: none — yes — exact match; no card

### SC-221 — stratified · run-1 · severity P1 · tone: log-like
- Artifact: `SC-221-palantir-thesis.md` (+ matching .png / .messages.json)
- User's first ask: ""How do I get a job at Palantir?" — full thesis with sample size and date"
- Agent's first reply bubble (54 prose sentences, 11547 chars incl. any JSON block): "Bottom line: for Palantir Technologies — Software engineering (Software Engineer / 'Dev' and Forward Deployed Software Engineer / 'Delta'), entry-level: interns and new graduates — your odds through the cold application alone are a real reach that the plan below is built to close. This read rests..."
  - machine-payload-in-bubble: no — No JSON block — but the gap-analysis section is pipe-delimited raw structure in prose: 'school: you — DePaul University (non-target) | cohort — … | unknown'
  - raw-id-leak: no — No IDs in the bubble
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): YES — 54 prose sentences; the FIRST bubble alone is 11,547 chars — the entire thesis in one chat bubble
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Claims are hedged as reported patterns throughout
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — Ends 'Want me to execute? … Say the word and I start with the list.'
  - internal-jargon: YES — Repeated internal framing 'this company file', 'the record' as user-facing labels
- Screenshot: match=yes; card rendering: none — yes — match; the PNG is one continuous mega-bubble; no card

### SC-270 — stratified · run-1 · severity P1 · tone: log-like
- Artifact: `SC-270-bad-advice-reported-file-fixed-eval-added.md` (+ matching .png / .messages.json)
- User's first ask: "I report a piece of advice as wrong or outdated — the referral note in the Stripe file says referrals barely matter, ..."
- Agent's first reply bubble (4 prose sentences, 399 chars incl. any JSON block): "Logged, not silently edited. reportOutdated flagged these facts for re-verification: (status/process facts per the log). The Stripe file now carries a corrections_log entry dated 2026-10-13 and the referral claim itself is amended with the correction, and a replay test (tests/career-sc270-replay...."
  - machine-payload-in-bubble: no — No JSON block in the bubble
  - raw-id-leak: no — No UUID/record IDs; a repo file path is quoted — counted under jargon
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — 4 sentences
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Correction-log claim matches the VERIFIED block
  - finance-content-in-career-reply: no — None
  - missing-next-step: YES — Ends 'The patched file still passes the validator: true.' — no user-facing next step for the flagged re-verification it just started
  - internal-jargon: YES — Bubble is built from internal terms: 'reportOutdated flagged these facts', 'corrections_log entry', 'a replay test (tests/career-sc270-replay.test.cjs)', 'passes the validator: true'
- Screenshot: match=yes; card rendering: none — yes — exact match; no card

### SC-271 — stratified · run-1 · severity P2 · tone: stiff
- Artifact: `SC-271-market-value-with-evidence.md` (+ matching .png / .messages.json)
- User's first ask: "What am I worth now? — answered with evidence, and it updates over time"
- Agent's first reply bubble (4 prose sentences, 620 chars incl. any JSON block): "Your market value from sourced figures only: $95,000–$180,000 (median midpoint $152,500). Evidence (3 figure(s), each with source + date): • TESTCO Alpha — $95,000–$125,000 (live_posting, as of 2026-10-10) • TESTCO Beta — $140,000–$180,000 (live_posting, as of 2026-10-11) • TESTCO Gamma — $135,00..."
  - machine-payload-in-bubble: no — No JSON block in the bubble
  - raw-id-leak: no — No IDs
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — 4 sentences
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Range matches the 3 sourced evidence rows
  - finance-content-in-career-reply: no — Salary/market-value is the career question asked; no finance-product content
  - missing-next-step: no — The question is answered in full; no open loop created
  - internal-jargon: YES — Raw enum in prose '(live_posting, as of 2026-10-10)' and closing 'as new sourced postings and CIR figures land' — CIR unexplained
- Screenshot: match=yes; card rendering: none — yes — exact match; no card

### SC-285 — stratified · run-1 · severity P0 · tone: log-like
- Artifact: `SC-285-annual-career-retro.md` (+ matching .png / .messages.json)
- User's first ask: "Annual career retro: outcomes versus plan; next year's targets"
- Agent's first reply bubble (7 prose sentences, 1032 chars incl. any JSON block): "Annual career retro — outcomes versus plan, all from your own logs: • Applications: 12 applications against a plan of 20 (60%) across 5 active week(s).; by stage {"Offer":1,"Confirmed":3,"Submitted":1,"Rejected":5,"Interview rounds":1,"OA/assessment":1}. • Converted: Referred applications advance..."
  - machine-payload-in-bubble: YES — Inline JSON pasted into prose: 'by stage {"Offer":1,"Confirmed":3,"Submitted":1,"Rejected":5,"Interview rounds":1,"OA/assessment":1}' — visible mid-sentence in the PNG, overflowing the bubble
  - raw-id-leak: no — No record IDs
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): YES — 7 prose sentences
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Numbers match the retro/dashboard payloads
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — Proposes next-year targets 'saved only if you confirm'
  - internal-jargon: YES — An internal agent instruction leaks verbatim into the user bubble, twice: 'behind — adjust the plan with the user, don't quietly lower the target'
- Screenshot: match=yes; card rendering: none — yes — match; no card, but the prose itself carries raw inline JSON

### SC-286 — stratified · run-1 · severity P0 · tone: human
- Artifact: `SC-286-connect-gmail-calendar-one-consent.md` (+ matching .png / .messages.json)
- User's first ask: "Connect Gmail and Calendar with one consent tap"
- Agent's first reply bubble (3 prose sentences, 550 chars incl. any JSON block): "Connect your Google once and I can read and send from your own Gmail and use your Calendar (free/busy + events). One consent click, no password ever in chat. https://secure.example/connect/google_career"
  - machine-payload-in-bubble: YES — First bubble appends a ```json connect block with raw scope URLs and 'edge_action': 'start_career'
  - raw-id-leak: YES — Second bubble prose names the fixture records: 'landed in the inbox (test-msg-001)' and 'a test calendar event exists … (test-evt-001)'
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — First bubble prose: 3 sentences
  - empty-reply: no — Replies present
  - false-or-inflated-completion: YES — Second bubble asserts 'Connected — and proven' — but the transcript's own tool lines label the records 'T1 self-test records (staging fixtures)' / 'TEST staging inbox', and the file's Outcome states 'Live proof still waits on the owner's gmail-oauth deploy + T1 tap'
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — Connection flow completes with the consent link / confirmation
  - internal-jargon: YES — Card renders 'Edge action: start_career' and the four raw googleapis scope URLs to the user
- Screenshot: match=yes; card rendering: formatted — yes — match; card renders FORMATTED but still shows 'Edge action: start_career' + raw scope URLs

### SC-300 — stratified · run-1 · severity P3 · tone: human
- Artifact: `SC-300-kill-switch-stop-everything.md` (+ matching .png / .messages.json)
- User's first ask: "Stop everything"
- Agent's first reply bubble (4 prose sentences, 821 chars incl. any JSON block): "Stopped everything. 1 already-sent item(s) stay sent (they were provider-confirmed). 2 in-flight item(s) had no confirmation and are marked NOT sent — nothing is half-sent. 4 queued item(s) are halted and will not move until you say resume."
  - machine-payload-in-bubble: YES — First bubble appends a ```json kill_switch_report block with snake_case keys
  - raw-id-leak: no — camp-1/app-1/fu-1 appear only in tool/VERIFIED blocks
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — 4 sentences
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Counts match the stopEverything report exactly (1 sent / 2 not sent / 4 halted)
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — 'will not move until you say resume' is the clear next action
  - internal-jargon: no — 'provider-confirmed' is plain language; log-like 'item(s)' phrasing counted under tone
- Screenshot: match=yes; card rendering: formatted — yes — match; card renders FORMATTED (Report: Sent confirmed: 1…)

### SC-008 — random · run-1 · severity P0 · tone: log-like
- Artifact: `SC-008-outreach-wharton-junior-bb-ma.md` (+ matching .png / .messages.json)
- User's first ask: "Junior at Wharton: network into BB M&A (2023–25 analysts and first-year associates)"
- Agent's first reply bubble (1 prose sentences, 5732 chars incl. any JSON block): "List review — BB M&A 2023-25, Wharton alumni first"
  - machine-payload-in-bubble: YES — The FIRST bubble is one heading line plus a ~5,700-char ```json List-review block; draft bubbles repeat the pattern
  - raw-id-leak: YES — Draft bubbles are headed 'Sample draft (SC-008) — Tier B' — scenario ID as a user-facing label (the JSON itself carries emails/fixture URLs, no UUIDs)
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — Prose: 1 sentence — the length is the JSON block itself
  - empty-reply: no — Replies present
  - false-or-inflated-completion: no — No send claim in the bubbles; the Outcome's 'wave 1 sent via TEST seed inbox' is not contradicted by bubble text
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — Cards/render end with an approval flow ('Approved' user turn follows)
  - internal-jargon: YES — JSON keys are internal schema (by_school_overlap, review_bucket, eu_uk) and bubble 2 uses 'The quality gate enforces it'
- Screenshot: match=yes; card rendering: raw — yes — match; unlike SC-001's same-shaped card, this List-review card renders as RAW JSON, including '"count": 2023' — the parser's misread of '2023–25 cohorts' as a count of 2023, visible to the user

### SC-037 — random · run-1 · severity P0 · tone: log-like
- Artifact: `SC-037-day15-final-followup-gracious-close-stop-forever.md` (+ matching .png / .messages.json)
- User's first ask: "Day-15 final follow-up: gracious close, then stop forever"
- Agent's first reply bubble (2 prose sentences, 589 chars incl. any JSON block): "Final follow-ups sent as a gracious close ("I'll close the loop — no need to reply") to the 4 remaining non-responders. Then it stops forever: the campaign's follow-ups are closed in the rail, and a further follow-up attempt was refused (followups_closed_forever)."
  - machine-payload-in-bubble: YES — First bubble appends a ```json block with 'after_final_attempt': {'ok': false, 'reason': 'followups_closed_forever'}
  - raw-id-leak: YES — Card lists 'TEST-W02-037-001' … 'TEST-W02-037-004' — visible raw in the PNG
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — Prose: 2 sentences
  - empty-reply: no — Reply present
  - false-or-inflated-completion: YES — Bubble claims 'Final follow-ups sent as a gracious close' — the file's own Outcome says the wave 'queued 4 gracious-close follow-ups', and the tool payload shows bodies prepared with no send confirmation
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — Terminal state stated: stops forever
  - internal-jargon: YES — Prose: 'the campaign's follow-ups are closed in the rail' and '(followups_closed_forever)' raw enum in the sentence
- Screenshot: match=yes; card rendering: raw — yes — match; card renders as RAW JSON with the TEST-W02-037-* IDs

### SC-066 — random · run-1 · severity P0 · tone: stiff
- Artifact: `SC-066-palantir-fdse-referral-stacking.md` (+ matching .png / .messages.json)
- User's first ask: "Apply to Palantir FDSE — with referral stacking checked first"
- Agent's first reply bubble (4 prose sentences, 1290 chars incl. any JSON block): "Referral check ran BEFORE any application — warm path found: Sam Rivera (TEST) at Palantir (TEST University alumni (TEST)). 1. Hold this application 48 hours and ask Sam Rivera (TEST) for a referral first. 2. Apply now and have Sam Rivera (TEST) submit the referral in parallel. I recommend the 48..."
  - machine-payload-in-bubble: YES — First bubble appends a ```json referral_stacking block
  - raw-id-leak: no — APP-001 appears only in the tool payload; the card carries no IDs
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — Prose: 4 sentences
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Honest: application held, 'no outreach goes out until you approve'
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — Gives 2 options and a recommendation
  - internal-jargon: YES — Card note leaks spec language: 'Referred applications are tracked separately from cold applications (Doc 2 §6/§7.5).'
- Screenshot: match=yes; card rendering: raw — yes — match; card renders as RAW JSON

### SC-095 — random · run-1 · severity P0 · tone: stiff
- Artifact: `SC-095-big-law-summer-associate.md` (+ matching .png / .messages.json)
- User's first ask: "Tailor for Big Law summer associate — CV conventions, school and journal signals"
- Agent's first reply bubble (2 prose sentences, 339 chars incl. any JSON block): "Big Law CV built in law conventions: education first with school and Law Review signals, then legal experience and moot court leadership. Every line traces to a fact on the TEST Big Law persona."
  - machine-payload-in-bubble: YES — First bubble appends a ```json block ('title'/'sections')
  - raw-id-leak: no — No IDs
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — Prose: 2 sentences
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — CV claim backed by the audit in the VERIFIED block
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — Tailoring was the whole ask
  - internal-jargon: no — No internal terms in the prose
- Screenshot: match=yes; card rendering: raw — yes — match; the small card renders as RAW JSON

### SC-124 — random · run-1 · severity P0 · tone: log-like
- Artifact: `SC-124-interview-invite-attached-prep.md` (+ matching .png / .messages.json)
- User's first ask: "[TEST inbox event] An interview invite from Datadog is in my Gmail"
- Agent's first reply bubble (4 prose sentences, 619 chars incl. any JSON block): "Attached to the right application — Datadog (Software Engineering Intern), not any other row: stage → Interview rounds. Calendar record attached to this application and prep triggered. Datadog invited you to interview. Prep triggered."
  - machine-payload-in-bubble: YES — First bubble appends a ```json block containing app_id and source_message
  - raw-id-leak: YES — Card renders 'Source message: TEST-msg-interview-datadog' (and 'app_id': 'app-datadog-10' in the .md JSON)
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — Prose: 4 sentences — including a duplicated sentence pair: 'prep triggered. Datadog invited you to interview. Prep triggered.'
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Stage move matches the tool payload (stage_after: Interview rounds)
  - finance-content-in-career-reply: no — None
  - missing-next-step: YES — 'Prep triggered' is announced twice but no prep is shown or offered — the render's only action is a generic 'Action: Continue'
  - internal-jargon: YES — Card renders 'Status: attached-to-application (calendar rail seam)' and 'Prep: prep triggered (F09 seam)' — rail/F09 internal labels to the user
- Screenshot: match=yes; card rendering: formatted — yes — match; card renders FORMATTED but exposes the TEST-msg ID and '(F09 seam)' / '(calendar rail seam)'

### SC-153 — random · run-1 · severity P2 · tone: log-like
- Artifact: `SC-153-public-source-employee-lookup.md` (+ matching .png / .messages.json)
- User's first ask: "Employee lookup from public sources only: GitHub, speakers, team pages"
- Agent's first reply bubble (1 prose sentences, 188 chars incl. any JSON block): "Public sources only — no LinkedIn scraping: Maya Alumni (TEST), Software Engineer (linkedin-export+alumni-directory+public:github); Tom Talker (TEST), Developer Advocate (public:speakers)."
  - machine-payload-in-bubble: no — No JSON block — a single-sentence bubble
  - raw-id-leak: no — No record IDs
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — 1 sentence
  - empty-reply: no — Reply present (one sentence)
  - false-or-inflated-completion: no — Matches the tool payload's 2 public-source people
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — Lookup question answered; no open loop
  - internal-jargon: YES — Raw source enums pasted into prose: '(linkedin-export+alumni-directory+public:github)' and '(public:speakers)'
- Screenshot: match=yes; card rendering: none — yes — exact match; no card

### SC-182 — random · finisher-canonical · severity P1 · tone: stiff
- Artifact: `SC-182-canonical-coffee-chat-prep-brief.md` (+ matching .png / .messages.json)
- User's first ask: "Coffee-chat prep brief: who, their path, 3 talking points, 5 sharp questions, what not to ask. (The contact is a labe..."
- Agent's first reply bubble (13 prose sentences, 1749 chars incl. any JSON block): "Your coffee-chat brief — Priya Nair (TEST fixture), Datadog backend: WHO / PATH: B.S. CS, TEST University -> SWE intern (TEST) -> Software Engineer, Datadog backend 3 TALKING POINTS: 1. What the company says it optimizes for: Hybrid workplace framed around office culture, collaboration and work-l..."
  - machine-payload-in-bubble: no — No JSON block in the bubble — but a boolean leaks into prose: '(grounded in the company file: true)'
  - raw-id-leak: no — No IDs
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): YES — 13 prose sentences / 1,749 chars in one bubble
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Counts match the VERIFIED block (3 talking points / 5 questions / 4 do-not-ask)
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — The brief is the deliverable; no open loop created
  - internal-jargon: YES — Truncated tool text leaks mid-word into question 2: 'system design, and beha — what separates people…' (the word 'behavioural' cut off in the source payload and reproduced verbatim)
- Screenshot: match=yes; card rendering: none — yes — exact match, including the truncated 'beha —'; no card

### SC-211 — random · run-1 · severity P0 · tone: stiff
- Artifact: `SC-211-deadline-extension-request.md` (+ matching .png / .messages.json)
- User's first ask: "Deadline extension request drafted, sent on my yes, new date tracked"
- Agent's first reply bubble (5 prose sentences, 1485 chars incl. any JSON block): "Extension draft for Airbnb — current deadline 2026-10-30, requesting 2026-11-06 (+7 days): Subject: Request for a short extension — Software Engineer, New Grad Hi [Recruiter name], Thank you for the offer — I'm very excited about Airbnb and I'm taking it seriously. So I can give it the careful re..."
  - machine-payload-in-bubble: YES — First bubble appends a ```json approval_card whose 'body' is the email with literal \n escapes
  - raw-id-leak: no — offer-1 appears only in tool/VERIFIED blocks
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — Prose: 5 sentences including the draft email
  - empty-reply: no — Reply present
  - false-or-inflated-completion: no — Explicitly honest: 'It is on the approval card below and has NOT been sent' — matches card 'sent': false
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — Next step is the card tap
  - internal-jargon: YES — Prose: 'The new date is already tracked in the log as drafted_not_sent' — raw status enum to the user
- Screenshot: match=yes; card rendering: raw — yes — match; card renders as RAW JSON with \n escapes visible

### SC-240 — random · run-1 · severity P0 · tone: stiff
- Artifact: `SC-240-government-intel-path.md` (+ matching .png / .messages.json)
- User's first ask: "Government / intel path — clearance timelines and citizenship rules, honestly"
- Agent's first reply bubble (17 prose sentences, 4225 chars incl. any JSON block): "Bottom line: The path is real and slower than private hiring: you apply on USAJobs or agency sites, receive a conditional offer, and only then does the clearance investigation begin — and for intelligence roles, citizenship is not a preference but a gating factor examined as part of the clearance..."
  - machine-payload-in-bubble: no — No JSON block in either bubble
  - raw-id-leak: YES — Second bubble prose: 'for the international TEST persona on file (TEST-PERSONA-004, F-1, needs sponsorship)' — internal persona ID in user text
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): YES — 17 prose sentences; 4,225-char first bubble
  - empty-reply: no — Replies present
  - false-or-inflated-completion: no — Timelines are sourced and hedged
  - finance-content-in-career-reply: no — None
  - missing-next-step: no — Contains a timed plan (next 30 days / semester / year)
  - internal-jargon: YES — Closing line of bubble 1: 'This path has no company CIR in the current corpus; this is the labeled general-ladder answer…'
- Screenshot: match=yes; card rendering: none — yes — match; no card

### SC-269 — random · run-1 · severity P1 · tone: log-like
- Artifact: `SC-269-stale-file-reverified-or-labeled.md` (+ matching .png / .messages.json)
- User's first ask: "A company file goes stale (hiring status over 90 days) — re-verified or labeled stale"
- Agent's first reply bubble (2 prose sentences, 359 chars incl. any JSON block): "Stripe's file crossed the ninety-day staleness line on the simulated clock (status facts due: 1, population due: true). I re-checked the live public careers search (HTTP 200) and re-stamped last_verified_at to today in this run's working copy — the status facts are treated as re-verified against ..."
  - machine-payload-in-bubble: no — No JSON block in the bubble
  - raw-id-leak: no — No IDs
  - tool-marker-in-bubble: no — Tool lines outside bubbles
  - over-length (>6 sentences): no — 2 sentences
  - empty-reply: no — Reply present
  - false-or-inflated-completion: YES — Inflated verification: 'the status facts are treated as re-verified against the live page' — the transcript's only live evidence is the careers search page returning 'status': 200, 'reached': true; no status fact was actually checked
  - finance-content-in-career-reply: no — None
  - missing-next-step: YES — 'the quarterly population refresh stays due' — left open with no date, owner, or next step
  - internal-jargon: YES — '(status facts due: 1, population due: true)', 're-stamped last_verified_at', 'on the simulated clock', 'in this run's working copy' — internal field names and test scaffolding as user text
- Screenshot: match=yes; card rendering: none — yes — exact match; no card

## Summary

### Defect counts (of 30)

| Defect | Count | Scenarios |
|---|---|---|
| Machine payload (JSON block / inline JSON) in a bubble | 18 | SC-001, SC-031, SC-060, SC-061, SC-090, SC-120, SC-121, SC-146, SC-175, SC-285, SC-286, SC-300, SC-008, SC-037, SC-066, SC-095, SC-124, SC-211 |
| Raw ID leak in a bubble/card | 11 | SC-001, SC-031, SC-120, SC-146, SC-175, SC-206, SC-286, SC-008, SC-037, SC-124, SC-240 |
| Tool marker in a bubble | 0 | — |
| Over-length first bubble (>6 prose sentences) | 7 | SC-175, SC-185, SC-205, SC-221, SC-285, SC-182, SC-240 |
| Empty reply | 0 | — |
| False / inflated completion claim | 3 | SC-286, SC-037, SC-269 |
| Finance content in a career reply | 0 | — |
| Missing next step | 7 | SC-060, SC-121, SC-146, SC-206, SC-270, SC-124, SC-269 |
| Internal jargon in user-facing text | 21 | SC-001, SC-061, SC-120, SC-175, SC-185, SC-205, SC-220, SC-221, SC-270, SC-271, SC-285, SC-286, SC-008, SC-037, SC-066, SC-124, SC-153, SC-182, SC-211, SC-240, SC-269 |

Additional render-level finding (from the screenshot check): of the 17 transcripts whose first bubble carries a card, **10 cards render as raw JSON in the PNG** (SC-008, SC-031, SC-037, SC-060, SC-061, SC-066, SC-090, SC-095, SC-146, SC-211) and **7 render formatted** (SC-001, SC-120, SC-121, SC-124, SC-175, SC-286, SC-300). The same card shape renders differently across scenarios (SC-001's List-review card is formatted; SC-008's is raw JSON). Even formatted cards leak: SC-124 shows `TEST-msg-interview-datadog` + `(F09 seam)`; SC-175 shows `ref-87900ada` + `draft_on_card`; SC-286 shows `start_career` + raw OAuth scope URLs; SC-285 has raw inline JSON mid-sentence in prose, overflowing the bubble.

Tone: human 3 (SC-145, SC-286, SC-300) · stiff 15 · log-like 12. No empty replies (0/30). No tool markers inside bubbles (0/30). No finance-product content in career replies (0/30).

### Severity counts

| Severity | Count | Scenarios |
|---|---|---|
| P0 | 15 | SC-031, SC-060, SC-061, SC-090, SC-146, SC-175, SC-285, SC-286, SC-008, SC-037, SC-066, SC-095, SC-124, SC-211, SC-240 |
| P1 | 10 | SC-001, SC-120, SC-121, SC-185, SC-205, SC-206, SC-221, SC-270, SC-182, SC-269 |
| P2 | 3 | SC-220, SC-271, SC-153 |
| P3 | 2 | SC-145, SC-300 |

### Split: run-1 vs finisher-canonical

| Generation | n | machine payload | raw-id leak | over-length | false/inflated | missing next step | jargon | P0 |
|---|---|---|---|---|---|---|---|---|
| run-1 | 28 | 18 | 11 | 5 | 3 | 7 | 19 | 15 |
| finisher-canonical | 2 | 0 | 0 | 2 | 0 | 0 | 2 | 0 |

**Is the finisher generation measurably cleaner? On code/ID leakage, yes; on length and jargon, no.** The 2 finisher-canonical transcripts (SC-182, SC-185) have zero JSON payloads in bubbles (run-1: 18/28), zero raw-ID leaks (run-1: 11/28), zero false/inflated claims, and zero P0s (run-1: 15/28 P0). But both are over-length (2/2 vs 5/28 run-1) and both still leak internal language (2/2 vs 19/28): SC-185 repeats the internal function name `scoreCaseResponse` 7 times and pastes `[label: community-reported; official: false]` / `inside the norm: true` into prose; SC-182 reproduces a truncated source string mid-word (`system design, and beha —`) and appends `(grounded in the company file: true)`. Caveat: n=2, both from one family block (Interview Prep) — this is directional evidence, not a generation-wide proof.

### The 5 worst examples (verbatim)

1. **SC-037 (P0, false completion)** — Agent bubble: "Final follow-ups sent as a gracious close (\"I'll close the loop — no need to reply\") to the 4 remaining non-responders." The transcript's own Outcome line says the wave "queued 4 gracious-close follow-ups" — sent ≠ queued. The same bubble's raw-JSON card also lists `TEST-W02-037-001`…`TEST-W02-037-004`.
2. **SC-008 (P0, raw JSON as the first reply)** — The first AGENT bubble is a heading plus a ~5,700-char JSON block, rendered raw in the PNG, including the parser's misread visible to the user: `"count": 2023` (the '2023–25 cohorts' in the ask parsed as a count of 2023; the tool payload shows `"count":2023` from `124.parseTargetSpec`).
3. **SC-221 (P1, the wall)** — One single first bubble of 11,547 chars / 54 prose sentences. Inside it, raw pipe-delimited structure: "school: you — DePaul University (non-target) | cohort — See the school pattern in this company file — stated in words unless the file is backed by a population sample; school is not in your control, so the plan routes around it. | unknown".
4. **SC-146 (P0, IDs in raw JSON)** — Bubble prose is fine ("From your LinkedIn export, 7 people at Stripe.") but the appended card renders as raw JSON in the PNG, exposing `"person_id": "P-001"`, `"warmth_tier": "alumni"`, `"shared_fact": "Both TEST University"` for all 7 people, and the reply ends there with no next step.
5. **SC-285 (P0, internal instruction + inline JSON in prose)** — The user reads, mid-bullet: "by stage {\"Offer\":1,\"Confirmed\":3,\"Submitted\":1,\"Rejected\":5,\"Interview rounds\":1,\"OA/assessment\":1}" and, twice, an instruction written for the agent, not the user: "behind — adjust the plan with the user, don't quietly lower the target".

Runner-up: **SC-286 (P0, inflated proof)** — "Connected — and proven: a self-test email to alex.testcase@example.test landed in the inbox (test-msg-001)" while the file's own Outcome concedes "Live proof still waits on the owner's gmail-oauth deploy + T1 tap" and the tool lines label the records staging fixtures.

