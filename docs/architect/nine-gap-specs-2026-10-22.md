# Trainee at "60 in 30" depth: every feature, what exists, what it takes, and what 7 days can buy (2026-10-22)

Written for the owner, from his directions of 10:10 and 10:12 CDT (relayed): the full product at "60 in 30 minutes"
depth within 7 days, every feature to product depth, and every frontend built as fast as possible so beta testing can
start. This is documentation only. Nothing here is built, deployed, migrated or spent. Branch `arch/nine-gap-specs`;
the code base described is `348c2d4a` (the landing candidate) unless a branch is named.

## Summary

- **Where the product really is today (live, read 2026-10-22 ~10:25 CDT):**
  - Deployed: agent-chat v248 (the old router line, cea914fe), the inbound Telegram, WhatsApp and iMessage functions, the career site pages, extension-sync and gmail-oauth.
  - Not deployed: the job ingester, the proactive runner (alerts, digest, mail tracking), the voice and essay functions, and the Trainee delivery and inbound functions.
  - The live job shelf is 21,688 postings from 1,905 companies, all fetched on 2026-10-14 (8 days stale). The fresh ingest table holds 0 rows.
  - The apply queue holds 0 jobs, and 0 applications have ever been confirmed through it.
  - 54 accounts; 5,158 chat messages in the last 7 days.
  - The outreach, interview, mock and connector tables do not exist live: those migrations were never applied.
- **What is real in code:** most features in this document have code and passing offline tests at `348c2d4a`. The architect suite and the edge suite were re-run today (edge 892/0; the architect total is recorded in "Totals"). Offline the code is ahead of the live product by about 10 work orders: the gap is deploys and owner switches, not code.
- **"60 in 30" today:**
  - The machine side is measured offline: a 30-second critical path per application, with fill precision 100% and coverage 91–92% on the 17 captured forms (WO-042).
  - It has never been run live end to end: 0 real submissions through Trainee. A live run needs two things first: a submit path the owner turns on, and an apply surface that can hold several prepared postings at once.
  - The two surfaces are the extension, which works on the person's own Chrome, and a cloud browser host. The owner's report, not re-checked here, is that the current host cannot hold four Chromium instances.
- **What 7 days can honestly buy, with three builders:**
  - Every feature below can reach "built and tested offline" for most of its bullets.
  - What only the owner can unlock: switching on the submit path, deploying the not-deployed functions, applying the pending migrations, signing up for the browser host, connecting the Gmail and calendar accounts, and paying for People Data Labs and Hunter.
  - Without those, no "60 real applications in 30 minutes" result can be shown live in 7 days. Section "7 days" lists exactly what can and cannot finish.
- **The critical path, in order:**
  1. A browser host that holds 4+ Chromium instances (or the extension for beta).
  2. F-037: the approval card reaching the messaging channel (designed, not built).
  3. The deploys and migrations already built.
  4. The owner's decisions (submit switch, cloud switches, Apollo vendor rows, outreach sending, calendar scope).
  5. One live end-to-end run with a real person, measured.

**Marks used on every bullet:**
- **[V] exists, verified.** A test I re-ran today at `348c2d4a` passes and checks this bullet, or a live read I made today shows it. Each carries its test id or "live".
- **[C] exists, claimed.** The code, a work order or a recorded run says so, but I did not re-run it today, or it is on an unmerged branch whose tests I did not re-run today.
- **[A] absent.** Not built.
- A number in a bullet is the target at product depth. The mark says whether that number is shown today. When a feature exists but below the number, the bullet says both.

## Standing rules (bind every feature below)

1. **Never automate LinkedIn or Indeed.** No scraping, no fetch, no stored profile URL (WO-033 L1, WO-037/D7).
2. **Sends and submits only through the person's tap on the exact hash-bound card.** A text "yes" never sends; it may only open the card (Option A, chosen 2026-10-22 under the owner's delegation).
3. **Nothing is invented: no people, no odds, no facts.** No people a source does not show (#20). No odds without counted data and n≥5 (D-018). Facts about the person come only from confirmed facts (D-007).
4. **Submit stays OFF.** `CAREER_AGENT_SUBMIT` and `CAREER_CLOUD_APPLY` stay off, and the caps stay where they are (`docs/architect/cap-inventory-2026-10-22.md`) until the owner says otherwise in writing.
5. **No deploy, migration, credential or spend without the owner.**

---

## Part A. Every feature, at product depth

### A1. Mass apply ("60 in 30")
1. 60 applications reviewed and approved by one person in a 30-minute session (WO-042 target). **[A]** never run live; the offline critical path is modeled at 30 s per application. The 60 also exceeds the caps: 25 a day by default, 50 at most, D-011.
2. Next card on screen within 1.0 s of the previous Approve tap. **[C]** WO-042 step A, measured offline by `evals/apply/sixty-in-thirty.cjs`, not re-run today.
3. Each next posting prepared (open, plan, fill, card) within 8.4 s, while the person reads the current card (≥10 s). **[C]** WO-042 steps F–I.
4. Fill precision 100% and coverage ≥90% across Greenhouse, Lever and Ashby. **[C]** live run 6: 186/186 precision, 91.6% coverage (CI 8818029f, recorded, never sent, not re-run today). Offline guard: **[V]** WO-042/1–12 pass.
5. The queue holds a day's picks and refuses past the daily limit, naming it. **[V]** WO-066/3.
6. One application per company per 30 days. **[V]** WO-009/9, WO-091b/5; owner rule D-011.
7. A batch from one message ("apply to 15 SWE intern roles"): found, deduplicated, screened, tailored, and stopped at the card. **[C]** module 155 (`tests/career-loop-acceptance.test.cjs`, node suite, not individually re-checked). Live: delegate mode is not started on the live line. **[A]** live.
8. Live queue throughput: 0 jobs and 0 confirmed. **[V]** live (career_apply_jobs = 0).
9. A receipt per finished application: confirmed only with the employer's own confirmation, unknown stays unknown, never resent. **[V]** WO-021/R (wo-021-receipts) passes.
10. Parallel preparation of 4 postings at once in the cloud. **[C]** WO-039/3 (N engine processes, default 3, max 6) passes offline; the live host capacity is the blocker (owner report, not re-checked).
- **To build and run:**
  - The submit switch from the owner (rule 4).
  - Either the extension on the person's Chrome ($0), or a cloud browser host. A self-hosted 4 vCPU / 8 GB VM is about €11/month for about 6 concurrent browsers (docs/architect/costs.md, ASSUMED prices). Browserbase is about $0.01 per application.
  - Raising or keeping the 25/50 daily caps for a 60-in-30 session: the owner's call, plus a SQL migration.

### A2. Approval cards and approval binding
1. The tap approves the exact payload: SHA-256 of every answer, the resume and the posting. Any change after the tap stops it. **[V]** WO-031/8, WO-031/9, WO-039/4.
2. A card shows every line of every application, at most 8 applications and under 1,600 characters. **[V]** WO-022/2.
3. A text "yes" never approves or sends; it only opens the card. **[C]** `arch/chat-approval-card-binding` @9568596d. Its 9 tests and the architect suite (1273/0) were re-run today on that branch; it is not merged. On base, WO-022's text "yes but not 2" still approves: **[V]** WO-022/4 on base.
4. "yes but not 2" approves exactly 1 and 3; a number not on the card approves nothing. **[V]** WO-022/4.
5. A queue that refuses the card's authorization sends nothing, before the engine or at the effect. **[V]** WO-039/card.
6. The card reaches the person's messaging channel (Telegram, WhatsApp) after a prepare finishes. **[A]** F-037: no path exists. Live: channel_pending_approvals = 0 rows. **[V]** live.
7. The cloud card bridge (tap mints the binding; claim refuses untapped work). **[C]** migration 20261024130000, not applied live; held package rehearsed on PG16 earlier.
8. Card latency: card shown within 1 s of the prepare finishing. **[A]** not measured.
9. Each certification text is shown verbatim and signed per application by the tap. **[C]** module 155 speakSummary (WO-094); node suite not individually checked.
10. 1 approval per card per person open at a time; a new card is pushed only after an answer or 24 h. **[C]** cap inventory rows (career_apply_cards.ts).
- **To build and run:** F-037 bridge work (about 1 builder-day, design below); deploy agent-chat; apply 20261024130000 (owner).

### A3. Cloud browser apply (WO-039)
1. N parallel engine processes per worker, one per job, nothing shared between people: default 3, max 6. **[V]** WO-039/3.
2. The person's facts and resume are written privately for one job and removed even on a crash. **[V]** WO-039/2.
3. A bot check at open or Submit goes back to the person with its link and is never counted as sent. **[V]** WO-039/1.
4. Evidence per application (captured answers, the response, masked screenshots by hash, time), under 64 KB. **[V]** WO-039/5, WO-031/11.
5. The worker refuses to start without the gate function, with a non-service key, or with a readable env file. **[V]** WO-039/6.
6. Cloud opt-in in chat: the exact terms, a yes only within 30 minutes, one text turns it off. **[V]** WO-039/7, WO-039/8.
7. The gate: 3 confirmed hand submissions per portal family before the cloud may submit there. **[C]** cap inventory; SQL not applied live.
8. Auto-pause: 6 h after 2% failures per portal. **[C]** cap inventory.
9. A live cloud host running 4 Chromium instances. **[A]** owner reports the current host cannot (not re-checked here).
10. Cloud applications sent live: 0. **[V]** live (0 jobs).
- **To build and run:** a host with ≥8 GB RAM and 4 vCPU per 4–6 browsers (Hetzner CPX31-class, ~€11/month, ASSUMED); the worker deploy; `CAREER_CLOUD_APPLY` (owner); the bridge migration (owner).

### A4. Browser extension (apply on the person's own Chrome)
1. Recognizes Greenhouse (hosted, EU, embedded), Lever and Ashby; Workday basic contact fields only, and says so. **[V]** WO-031/2, WO-031/5.
2. Fills only what the person stated: never an identity number, EEO answer or attestation they did not give. **[V]** WO-031/3, WO-031/15.
3. MV3, forms only, no remote code, no password field, never a verification token. **[V]** WO-031/12.
4. After the click: confirmed only with the picture after; never "not sent". **[V]** WO-031/17.
5. Takes Trainee's picks into its queue through the person's own session. **[V]** WO-066/6.
6. Prepares 100 postings per session, 8 at a time. **[C]** cap inventory (extension source).
7. Published in the Chrome Web Store. **[A]** a package exists (`extension/`, v0.2.0); store submission not done (needs the owner's developer account, $5 once).
8. Installed by ≥1 real person and used live: 0 recorded queue jobs. **[V]** live (0 jobs).
9. Per-tab submit on 1 tab by default (max 3). **[C]** cap inventory.
10. Proof screenshot permission kept (`<all_urls>` with captureVisibleTab). **[V]** WO-063/1.
- **To build and run:** a Chrome Web Store developer account (owner, $5); store review takes days (outside our control); extension-sync is deployed (live).

### A5. Form answers (answer bank, ask once)
1. Saved answers fill only their exact question, with a ledger row. **[V]** at 348c2d4a: F-007 consumer present; answer-map suite 12/12 re-run today (`tests/career-portal-answer-map.test.cjs`).
2. Ask once: the person's answer to a question this posting raised is kept and reused. **[V]** WO-042/11, wo-054-answer-once.
3. Grad year is never auto-filled from an assumption (2029 is not a fact). **[C]** `arch/grad-year-ask` @3a45191a (pushed earlier, not re-run today).
4. Degree synonyms are one answer; a degree in progress is not "completed". **[V]** WO-042/2.
5. Place search: the city or state is typed and picked from the employer's list. **[V]** WO-042/4, /7, /8, /10.
6. Ashby yes/no and location asks. **[V]** ashby-yesno, ashby-location-ask.
7. Precision 100% on held-out sample E: 97.7% right. **[C]** WO-056 record.
8. Coverage ≥95% of required fields without a question. **[A]** at 91–92% (WO-042 live runs, recorded).
9. Questions still open are asked in one message, never guessed. **[V]** ask-never-guess, wo-029-ask-once.
10. Attestations are only the person's own, signed per application. **[V]** WO-031/3; D-007 tests (d007-quarantine) pass.
- **To build and run:** none beyond deploys; the 95% coverage target needs about 2 builder-days on the Greenhouse widgets and Lever location (WO-042 notes).

### A6. Resume tailoring
1. A resume tailored to one posting from confirmed facts only, passing the truth audit twice. **[V]** wo-028-tailor.
2. One PDF that passes the ATS parse harness before it may be offered. **[V]** wo-028-tailor; edge-pdf-renderer.
3. Stored privately per person (`career-resumes/<user_id>/`). **[C]** career_tailor.ts; live bucket not checked today.
4. Named resume personas ("banking version"), with only those facts. **[V]** wo-061-named-resume.
5. Tailoring asks when facts are missing instead of padding. **[V]** wo-079-tailor-ask.
6. Tailored in under 10 s per posting. **[A]** not measured.
7. A/B arms per persona, compared at ≥30 per arm (MIN_PER_ARM 30). **[C]** career_tailor.ts; never reached live.
8. Cover letter only from confirmed facts. **[V]** frs-cover-letter.
9. The tailored resume rides the approval card hash. **[V]** WO-021/5.
10. Tailored resumes made live: no live record read today. **[C]**.
- **To build and run:** deploy agent-chat with the agent brain; the storage bucket (exists per migrations, not re-checked).

### A7. Written answers (essays, short answers)
1. Drafted on the extension's card from confirmed facts, on the person's tap. **[V]** wo-049-essay-card.
2. The employer's own AI policy decides first (refuses where AI is barred). **[V]** wo-049-essay-card, wo-030-essay-drafts.
3. Every claim traces to a confirmed fact (fact-lock). **[V]** wo-030-essay-drafts.
4. Short answers for 1,849 open questions on 574 postings (WO-064 census). **[C]** WO-064 record.
5. "use 2" saves a draft; nothing saves without the person's word. **[V]** wo-030-essay-drafts.
6. Length rule per question (word or character limit from the form). **[V]** wo-030-essay-drafts.
7. A drafted answer within 15 s. **[A]** not measured live.
8. The career-essay-draft function deployed. **[A]** live: not deployed.
9. Drafts are never sent to the employer without the card tap. **[V]** WO-031/9.
10. Model spend about $0.003 per turn with gpt-5-mini. **[C]** costs.md estimate.
- **To build and run:** deploy career-essay-draft (owner); OpenAI key (set per go-live doc, not re-checked).

### A8. Job ingestion and freshness
1. Every board in the directory read at least once every 6 hours (2,179 boards on one lane; 50,000 boards on 8 lanes with 10% of runs lost). **[V]** WO-037/R1, WO-037/R2.
2. ETag 304: nothing re-read, nothing written. **[V]** WO-037/R4.
3. Only a 200 in the provider's own shape counts as a board; robots.txt obeyed; one host paced. **[V]** WO-037/D1–D4.
4. No LinkedIn or Indeed host in any fetch code. **[V]** WO-037/D7.
5. Freshness: a posting is shown within 6 h of the board publishing it. **[A]** live: the ingester is not deployed. The shelf was last fetched 2026-10-14 (8 days). **[V]** live.
6. Live shelf: 21,688 postings, 1,905 companies, every one with a URL. **[V]** live.
7. Closed postings drop out within one cycle. **[V]** wo-006-ingest.
8. Staffing agencies are flagged from their own page, with the quote and date. **[C]** career_staffing_agencies.ts.
9. Source freshness labels on every fact. **[V]** wo-041-source-freshness.
10. 8 boards in parallel, 100 s per run. **[C]** cap inventory #97.
- **To build and run:** deploy career-ingest plus its cron (owner); applying the ingest migrations (check the live ledger). Data source: public ATS APIs, $0.

### A9. Discovery and search
1. Search filters by words, ranks by fit to confirmed facts, newest first. **[V]** wo-073-title-search, wo-037-discovery.
2. Relevance floor: hard filters before anything is suggested, alerted or queued. **[V]** c04-relevance-floor.
3. Every role named with its posting's own link. **[C]** `arch/f001-roles-and-links` @984478d2 (3/3 re-run today on the branch); on base: **[A]**.
4. Band words bind in every form ("internships", "entry-level"): 30/30 cells. **[C]** `arch/f006-band-and-wrong-zero` @87bd108c (5/5 re-run today); base 15/30. **[V]** base failure re-run today.
5. No wrong zero: an empty answer names the filter that emptied it, with counts. **[C]** F-006 branch.
6. Ghost and stale flags (60 days stale, 30 aging). **[C]** 121 qualityFlags; not individually re-run.
7. 5 best roles per ask in under 3 s on the 21,688-posting shelf. **[A]** not measured.
8. Discovery from target companies. **[A]** G1 below.
9. Honest empty when the shelf holds nothing. **[V]** wo-037-discovery.
10. Posting details on request ("tell me more about #2") with stated pay only. **[V]** wo-068-posting-details.
- **To build and run:** merge F-001/F-006 (owner); deploy agent-chat; fresh ingest (A8).

### A10. Alerts and daily report
1. A new match becomes one instant alert with company, title, place, minutes since posted and the link. **[V]** WO-007/2.
2. Only postings first seen since the last check. **[V]** WO-007/3.
3. A daily instant cap; the rest wait for the report, never dropped. **[V]** WO-007/4.
4. Quiet hours respected in the person's zone. **[V]** WO-007/5.
5. Daily report at the person's hour. **[V]** WO-007/6.
6. Zero alerts below the person's own threshold. **[V]** WO-037/A1.
7. First seen to delivered within 15 minutes. **[C]** WO-037/R7 latency math (offline arithmetic); live: no proactive runner. **[A]**.
8. Alerts delivered live: the runner is not deployed and has no cron. **[V]** live (function absent).
9. "stop alerts" stops everything at once. **[V]** WO-007/7.
10. Target-company priority. **[A]** G1.6.
- **To build and run:** deploy career-proactive plus its cron (owner); a texting channel (A20).

### A11. Networking: contacts, referral map, real people
1. Imports the person's own LinkedIn export or an Apollo CSV (never the API), up to 3,000 contacts. **[V]** wo-033-outreach C1/C2.
2. Free address checks (syntax, MX, role, disposable); Hunter only on the person's word. **[V]** wo-033-outreach.
3. Referral map: up to 20 target firms, 5 paths each, every path citing its row. **[V]** wo-033-outreach R1/R2 (2,000 rows in under 5 s).
4. Sourced people only (file and row, or a page read with the link, date and quote). **[C]** `arch/networking-real-people` @4332c9c1 (7/7 re-run today on the branch).
5. Chat never names a person no source shows. **[C]** same branch.
6. People from a page the person sends (never LinkedIn). **[C]** same branch; off unless `CAREER_SOURCE_PAGES=on`.
7. Hiring-manager finding. **[A]** G2.
8. PDL aggregates of who a firm hires, n≥5. **[V]** wo-036-hired (offline); live needs `PDL_API_KEY` ($98/month, D-018).
9. Live contacts: the outreach tables are absent live. **[V]** live.
10. No profile URL stored, ever. **[V]** wo-033-outreach L1.
- **To build and run:** apply the outreach migration (owner); `HUNTER_API_KEY`, `PDL_API_KEY` (owner, spend).

### A12. Outreach
1. Up to 10 drafts per batch, each from confirmed facts plus that person's row, fact-locked. **[V]** wo-033-outreach.
2. Caps: 20 a day by default, 30 at most, 10 a day in the first week, 90 s between sends. **[V]** wo-033-outreach S2.
3. One recipient gets at most 3 Trainee emails in 30 days from all users together. **[V]** wo-033-outreach X1.
4. A "stop" to any user stops everyone's drafts to that address. **[V]** wo-033-outreach X2.
5. Approval by card tap bound to the hash. **[A]** today approval is by text "send all" (rule 2 gap; G3.1).
6. Sending from the person's own Gmail. **[C]** code exists; `CAREER_OUTREACH_SEND` is off (owner), the Gmail send grant is not wired, and the table is absent live.
7. Replies read and classified (reply, stop, bounce). **[V]** wo-033-outreach O1.
8. Drafts only to sourced people. **[C]** #20 branch.
9. Follow-up suggestion after 7 quiet days. **[A]** G3.7.
10. Live sends: 0. **[V]** live (table absent).
- **To build and run:** G3.1 card tap (~4 h); apply the outreach migration; Gmail send scope (owner; Google verification for a sensitive scope takes weeks); `CAREER_OUTREACH_SEND` (owner).

### A13. Connector (double-opt-in warm intros)
1. Brokers intros one at a time, career reasons only, both sides opt in. **[V]** wo-026-connector.
2. Neither side sees the other's contact until both say yes. **[V]** wo-026-connector.
3. Opted-in mentors, alumni and recruiters. **[V]** wo-026-connector.
4. Blocks are honored both ways. **[V]** wo-026-connector.
5. Live network: connector tables absent. **[V]** live.
6. 100 opted-in profiles before matching is useful. **[A]** no live users in it.
7. Match quality measured. **[A]**.
8. Intro latency under 24 h. **[A]**.
9. Abuse reporting. **[C]** in code (blocks); reporting flow not checked.
10. A matching UI on the web. **[A]**.
- **To build and run:** the connector migration (owner); seeding with real opted-in users (owner, recruiting).

### A14. Tracking (status from mail, "where do I stand")
1. Rejection, interview and offer read from the employer's words; anything unclear is "other". **[V]** WO-024/M1, M2.
2. Never by guess: scams, look-alike offers and DocuSign offers are flagged, never moved. **[V]** WO-040/S1–S3, WO-024/M16.
3. Stages only move forward. **[V]** WO-024/M6.
4. Metadata only (From, Subject, snippet); never a body. **[V]** WO-024/M12, WO-040/W3.
5. "Where do I stand with JPMorgan?" answered from records with dates and sources. **[V]** WO-024/M15, WO-034/B15.
6. Model second opinion off by default, OpenAI only, capped calls. **[V]** WO-040/M5–M7 (D-025 pending).
7. English plus 6 other languages (rejections, interviews, look-alikes per language). **[V]** WO-046/L1–L5.
8. Live mail read: 0 career Gmail grants live (read earlier today); the runner is not deployed. **[V]** live.
9. The Trainee row matched to employer email. **[C]** `arch/mail-trainee-row` @1ea403f9.
10. Status within 15 minutes of the mail arriving. **[A]** live (no runner).
- **To build and run:** deploy career-proactive; Gmail read grant per person (live account, OAuth consent screen verification for the restricted scope: owner, weeks).

### A15. Interview prep: brief, text mock, voice mock
1. An invite becomes a brief: only what the invite states, never a guessed date or name. **[V]** WO-034/B1, B2, B3.
2. No interviewer is ever looked up, even with a PDL key. **[V]** WO-034/B7.
3. Questions asked in the last 12 months, sourced and dated. **[V]** WO-034/B4.
4. Text mock: start, 6 answers, a nudge after each, the debrief quoting only the person's words. **[V]** WO-025/2, WO-025/3.
5. Voice mock, 5–30 min (SQL allows 60). **[V]** wo-035-voice-mock (offline); live: the career-voice function is not deployed and the tables are absent. **[A]** live.
6. Thank-you drafted 90 minutes after the start, never sent. **[V]** WO-034/B9, B11.
7. Interviewer-specific prep from public pages. **[A]** G8.2.
8. Company record with sources (CIRs). **[C]** 127-career-prep; not individually re-run.
9. Brief within 5 minutes of the invite arriving. **[V]** WO-034/B6 (offline worst case); live **[A]**.
10. Day-before reminder. **[A]** G8.11.
- **To build and run:** deploy career-voice (OpenAI realtime spend) and career-proactive; the interviews migration (owner).

### A16. Offers, negotiation, career guidance
1. The offer read from the person's words, with one ask for what is missing. **[V]** wo-036-offer-guidance.
2. Placed against public data; the model never supplies a number. **[V]** wo-036-offer-guidance.
3. Counter drafted from 128's fact script, never sent. **[V]** wo-036-offer-guidance.
4. "How do I get into X" only from repo data with URL and checked date. **[V]** wo-036-offer-guidance, wo-102-paths.
5. Who a firm hired: aggregates only, n≥5. **[V]** wo-036-hired.
6. Multiple-offer comparison on stated priorities. **[C]** 129-career-os.
7. Deadline tracking. **[C]** 129-career-os.
8. Benchmarks for 100+ role and city pairs. **[A]** coverage not measured.
9. Negotiation send on the card tap. **[A]**.
10. After-hire features (first 90 days, wins, review packet). **[C]** 129-career-os functions exist; no product flow (G9).
- **To build and run:** PDL key (spend); otherwise deploys.

### A17. Chat brain and reply guards
1. The agent brain decides; code enforces the tool effects. **[V]** wo-002-agent-loop, wo-002-career-tools.
2. A claim no tool backs is put to the model once, then removed. **[V]** wo-077-claims, wo-091a-reply-guards.
3. A fact about the person that traces to nothing is bracketed. **[V]** wo-091a-reply-guards.
4. Internal words (tool names, ids) never reach the person. **[V]** wo-091a-reply-guards.
5. Pay figures only from a tool or the person. **[V]** WO-106/B4 (wo-106-agent-slice).
6. Invented people removed. **[C]** #20 branch.
7. Eval: brain reliability 320 cases. **[C]** run 39675214823: 257/320 completed, $6.24. The 63-case finish is not run (awaiting the relaying agent's pick).
8. Live brain: agent-chat v248 runs the old router line unless `CAREER_BRAIN=agent` is set (not readable today). **[C]**.
9. Reply in under 5 s at p50. **[A]** not measured live today.
10. Cost about $0.003 per turn. **[C]** costs.md.
- **To build and run:** deploy agent-chat from the landing line (owner); `CAREER_BRAIN=agent` (owner).

### A18. Memory and standing instructions
1. Standing instructions kept only from the person's own words, quoted. **[V]** wo-023-memory.
2. A waiver of the yes is refused and never saved. **[V]** WO-061 solicit (wo-061-solicit).
3. Style learned per person. **[V]** wo-023-style.
4. Durable memory across threads. **[V]** brain-memory-depth, brain-memory-reliability.
5. The situation (every task in flight across about 15 places) built every turn. **[V]** wo-100-situation.
6. "What do you know about me" readback. **[C]** get_memory tool; not individually re-run.
7. Forget on request, one item. **[V]** wo-023-memory.
8. 100 instructions per person without slowdown. **[A]** not measured.
9. Memory shown on the web. **[A]**.
10. Erase removes memory. **[C]** erase path (A22).
- **To build and run:** deploys only.

### A19. Onboarding and profile
1. A pasted resume read by code into draft facts. **[C]** read_resume (WO-106); not individually re-run.
2. Facts count only after the person confirms them (D-007). **[V]** d007-quarantine, d007-drafters.
3. Typed profile fields (name, contact, work authorization). **[V]** typed-profile-fields.
4. Legal name from its own source. **[V]** qa-legal-name-source.
5. Stated facts captured in chat. **[V]** frs-stated-facts.
6. Onboarding to first useful result in under 5 minutes. **[A]** not measured.
7. Site signup (site-signup function). **[V]** live (deployed).
8. A grad year is never assumed. **[C]** grad-year branch.
9. 47 owner-delegated answers (MI-038). **[C]** ledger.
10. Profile editing on the web. **[A]**.
- **To build and run:** deploys only.

### A20. Messaging channels (Telegram, WhatsApp, iMessage/SMS)
1. Telegram inbound live. **[V]** live (telegram-inbound v7 deployed).
2. WhatsApp inbound live. **[V]** live (whatsapp-inbound v6).
3. iMessage inbound live. **[V]** live (imessage-inbound v35).
4. Channel delivery with integrity checks. **[V]** channel-delivery, channel-integrity (edge).
5. Documents (resume PDF) over Telegram and WhatsApp. **[V]** telegram-documents, whatsapp-documents.
6. Batch parts sent whole (one draft never split). **[V]** WO-038 (wo-038-channels).
7. The approval card on a channel. **[A]** F-037.
8. STOP/START carrier words. **[V]** wo-013a-channel.
9. Trainee delivery and inbound functions (LoopMessage). **[A]** live: not deployed.
10. LoopMessage at 300 contacts a day (Light, $59.99/month). **[C]** costs.md; at scale it does not fit (costs.md).
- **To build and run:** F-037; deploy the Trainee channel functions; channel tokens (owner).

### A21. Weekly digest and proactive messages
1. The digest is built only from rows: counts by source, status changes, interviews, drafts, alerts, the response rate. **[V]** WO-034/B12.
2. Sent once a week at the person's day and hour, never when off. **[V]** WO-034/B13.
3. Set in chat ("Sundays at 6"). **[V]** WO-034/B14.
4. A nudge 7 quiet days after an interview. **[V]** WO-034/B10.
5. Follow-up drafted at day 14, not 13, offered, never sent. **[V]** WO-024/M10.
6. Live: the proactive runner is not deployed and has no cron. **[V]** live.
7. Strategy note in the digest. **[A]** G5.7.
8. Read-rate tracking. **[A]**.
9. Opt-out in one word. **[V]** WO-034/B13.
10. Under 1,500 characters per message part. **[C]** MESSAGE_MAX in career_outreach.ts; digest length not separately tested.
- **To build and run:** deploy career-proactive plus its cron (owner).

### A22. Privacy, deletion, pause, export
1. Pause stops every proactive message and keeps the approvals until resume, at most 7 days. **[V]** control-state (edge) C2b.
2. Erase removes career rows, tailored resumes and memory. **[V]** WO-034/B16 (erase migration); delete-account v40 deployed: **[V]** live.
3. No identity number is ever kept. **[V]** WO-031/15.
4. Mail evidence holds no long number (codes, IDs). **[V]** WO-024/M3.
5. Identity redaction in logs. **[V]** identity-redact (edge).
6. A snapshot owned by another account is refused. **[C]** career_host.js owner check; F-002/3 checks it on its branch.
7. Export of all career data in one file. **[C]** export coverage test exists (node); not individually checked.
8. Privacy policy published. **[C]** privacy.html in the repo (not a legal review).
9. Erase within 1 minute, verified across every career table. **[A]** not measured live.
10. Data retention schedule (auto-delete after N months). **[A]**.
- **To build and run:** deploys only; a retention policy is the owner's decision.

### A23. Email sign-in codes (portal verification)
1. Reads an emailed code only from mail at most 15 minutes old (D-021). **[V]** wo-096-email-code, gmail-code-window (edge).
2. The code is never shown in chat or stored. **[V]** wo-096-email-code.
3. Only the portal's own sender. **[V]** wo-096-email-code.
4. Live: the career-email-code function is not deployed. **[V]** live.
5. Code to form within 30 s. **[A]** not measured.
6. Works for Greenhouse's emailed check. **[C]** WO-096 design.
7. Needs the Gmail read grant. **[A]** live (0 grants).
8. A wrong code is never retried blindly. **[C]**.
9. One code per application. **[C]**.
10. A user can turn it off. **[C]**.
- **To build and run:** deploy career-email-code; the Gmail grant (owner, verification).

### A24. Apply by email
1. "Apply by email to Acme" prepares the email card from confirmed facts. **[V]** wo-032-apply-ops.
2. The apply_email is found in ingestion. **[C]** apply_email.ts.
3. Sending on a text "yes" when `CAREER_EMAIL_SEND=on`. **[C]** flagged against rule 2; it must move to the card (G4.6). `CAREER_EMAIL_SEND` is off.
4. Live sends: 0. **[V]** live (no outreach or email tables in use).
5. Attaches the tailored PDF (one file, under 5 MB). **[C]** career_apply_email.ts.
6. One recipient, no Cc or Bcc. **[C]** career_apply_email.ts.
7. A receipt on the timeline per sent application. **[C]** timeline events.
8. A follow-up offered at day 14. **[A]** for email-apply specifically.
9. Recall ("which did I email?"). **[C]** recall tool over timeline events.
10. 10 email applications in 10 minutes. **[A]** not measured.
- **To build and run:** the card-tap change; the Gmail send scope (owner).

### A25. Measurement (evals, live checks)
1. The architect suite re-run today on `348c2d4a`: 1,264 pass / 0 fail. **[V]**
2. The edge suite: 892/892 today. **[V]**.
3. The career node suite: a known set of failing tests from the environment, identical on base and on every fix. **[V]** today at 348c2d4a: 2,276 pass / 202 fail on the gate selection.
4. Brain eval 320 cases, two judges. **[C]** run 39675214823.
5. WO-042 live fill runs (never send). **[C]** live runs 5–10 recorded.
6. One live end-to-end application with a real person. **[A]**.
7. Weekly outcome report from live data. **[A]**.
8. A beta cohort's funnel. **[A]**.
9. Cost per active user tracked (D-002's $1). **[A]** not enforced in career code (cap inventory).
10. Deploy provenance (which commit is live). **[C]** deploy-provenance test exists; live v248 = cea914fe per the audit.

---

## Part B. Frontends and the fastest path to a beta-testable build

### What exists today
1. **Web app (`index.html`, `src/upmore-app.html`):** the Upmore app shell, with 28 career references and the Messages approval card renderer (`src/career-approval-card.js`). The renderer draws a hash-bound card; the database owns expiry and single use. **[V]** `tests/career-approval-card-render.test.cjs` passes today. The browser tap integration test ("the built Messages history adapter reaches the own RPC only through a bound native card tap") fails in this sandbox (environment-class): **[C]**.
2. **Career site pages (site-careers, site-signup):** both deployed. **[V]** live (both ACTIVE).
3. **Lane B approval and ask UI** (`muse/2026-10-21-fe-approval-ui` @5ffab100, modules 173 and 175): **[C]**
   - The Messages card is the cloud worker's approval; the tap mints the hash-bound record, and the claim refuses untapped or drifted work.
   - Ask cards per field type (two-option, stepper, month picker).
   - **[C]** unmerged; its own guards report 5/5 and neighbors 18/18, 11/11, 26/26. Not re-run today.
4. **Telegram:** inbound deployed (v7); documents and presentation tested. **[V]** live and edge suite. The approval card cannot reach it (F-037). **[A]** card.
5. **WhatsApp:** inbound deployed (v6); tested. **[V]** live and edge. The card **[A]**, as for Telegram.
6. **iMessage:** inbound deployed (v35). **[V]** live. Trainee's LoopMessage delivery (`trainee-deliver`, `trainee-inbound`) is not deployed. **[A]** live.
7. **Chrome extension** (`extension/`, MV3, v0.2.0): **[V]** WO-031/* pass today; the store listing is **[A]**.
   - Panel, card and queue are built; extension-sync is deployed. **[V]** WO-031/* and live.
   - Not in the Chrome Web Store. **[A]** store listing.
8. **Chat in the web app** (agent-chat v248): **[V]** live; 5,158 messages in 7 days. It runs the old router line unless `CAREER_BRAIN=agent` is set. **[C]**.
9. **A web dashboard for the queue, tracker, outreach and memory:** **[A]**. Only chat and cards exist.
10. **A voice mock page** (career-voice): **[A]** live (function not deployed).

### F-037: card delivery to a messaging channel (design; Codex owns the build now)
- **The defect** (Muse's code read at cea914fe, addendum 6f774edf): the channel bridge offers the approval keyboard only off an agent-chat response carrying `batch.kind === "batch_run"` with status `awaiting_approval`. That object is produced only by the structured `career_batch` status request, which only `runChannelApproval` sends. Text turns never send it, and nothing pushes the card when the worker finishes. Live `channel_pending_approvals` = 0 rows. **[V]** live.
- **The fix**, read side, from the addendum, unchanged:
  1. The bridge remembers the pending run id from any turn whose response carries `batch.kind === "pending_batch_intent"`, per (channel, sender).
  2. On a later turn for that thread, it issues the structured status request for that run.
  3. The response is rendered through the existing `detectBatchCard` and `offerApproval` path.
  4. The approval still resolves through the hash-bound `runChannelApproval`.
- **The fix**, push side, added here: when the worker finishes a prepare, the proactive runner sends one message to the thread carrying the same card, keyed once per run.
- **Guards** (from the addendum):
  1. After a completed prepare, a text turn offers the approval with a keyboard token bound to the stored card hash.
  2. Any other run status offers nothing.
  3. Another user's run offers nothing and leaks nothing.
  4. With no pending run, the turn is byte-identical to today.
  5. Added here: a text "yes" never approves.
- **Effort:** read side about 1 builder-day with tests; push side about 0.5 day.
- **Blocked by:** an agent-chat deploy, the proactive runner deploy, the owner's word.

### What a beta tester must be able to do, end to end (the beta bar)
1. Sign up on the site and connect one channel (web chat, Telegram or WhatsApp). Today: web and channel inbound **[V]**; Trainee onboarding for a channel **[C]**.
2. Give a resume and confirm facts in under 10 minutes. **[C]** read_resume and confirm exist; not measured.
3. Ask for roles and get 5 fresh, relevant roles with links. **[A]** live: the shelf is 8 days stale and links are on the F-001 branch.
4. Ask "apply to 10" and receive a card on the same surface. **[A]** on channels (F-037); **[C]** on the web (Lane B unmerged).
5. Tap Approve and see 10 applications go, each with the employer's confirmation. **[A]** live (submit off, host).
6. Ask "what's the status?" and get the true state. **[C]** F-002 branch.
7. Get an alert for a new matching role within the hour. **[A]** live (runner not deployed).
8. See mail-based status updates. **[A]** live (Gmail grant, runner).
9. Run a mock interview. **[C]** text mock in code; tables absent live.
10. Pause or erase everything in one message. **[V]** control-state and erase tests; delete-account live.

### Build order for the fastest beta (each item = merge + deploy + one live check)
1. Deploy agent-chat from the landing line with F-001, F-002 and F-006 merged, plus `CAREER_BRAIN=agent`. About 0.5 day, then the owner's deploy.
2. Deploy career-ingest and its cron, so the shelf is fresh. About 0.5 day, plus the owner (ingest migrations).
3. F-037 card to channel, read and push. About 1.5 days, plus the deploy.
4. Merge Lane B's web approval card (5ffab100) after review. About 1 day (review and conflict resolution against the bridge migration).
5. Extension to the Chrome Web Store, as the beta's apply surface (no cloud host needed). About 0.5 day of packaging; store review takes 1–7 days and is outside our control.
6. Deploy career-proactive and its cron: alerts, digest, mail. About 0.5 day, plus Gmail OAuth verification (weeks for restricted scopes; testers can be added as test users under 100).
7. A cloud browser host with 4+ Chromium instances, for the cloud path: about 1 day of setup, plus the owner's signup (around €11–40/month, ASSUMED).
8. A web dashboard (queue, tracker): about 2 days. Not needed for the first beta.

**What blocks the beta, plainly:**
- The owner's deploys and migrations, items 1, 2, 3 and 6.
- The submit switch, for item 5 to actually submit.
- A Chrome Web Store account, for item 5.
- Gmail OAuth test users, for item 6.
- A host signup, for item 7.
- Without the submit switch, a beta can still test everything up to the card, with nothing sent.

---

## Part C. The nine gaps: micro-feature specifications (written 10:10 CDT, unchanged except headings)

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

### Standing rules (they bind every row below and are not repeated per row)

1. **Never automate LinkedIn or Indeed.** Trainee never scrapes, opens or fetches LinkedIn or Indeed pages, by any link or redirect. The page reader refuses them (`career_people_sources.ts` `pageRefusal`). A LinkedIn profile URL is never stored (WO-033 L1).
2. **Sending happens only through the owner's or person's tap on the exact hash-bound card.** Any send, submit or message needs the tap, and the tap is bound to the payload's SHA-256. A text "yes" never sends; it may only open the card (Option A, chosen 2026-10-22 under the owner's delegation; `career_cloud_card_chat.ts`). Where an existing flow still approves by text (outreach "send all", `career_outreach.ts` `outreachTurn`; email-apply, `career_apply_email.ts`), moving it onto the card tap is part of the gap that uses it (G3.1, G4.6).
3. **Nothing is invented: no people, no odds, no facts.**
   - People: only people a source shows (#20, `career_people_sources.ts`, the reply guard in `agent/reply_guards.ts` `unsourcedPeople`).
   - Odds: a number only from counted data with its n and its source. Nothing is shown under n=5 (D-018). Anything else is a named factor, never a percentage.
   - Facts about the person: only from confirmed facts (D-007).
4. **Submit stays OFF.** `CAREER_AGENT_SUBMIT` and `CAREER_CLOUD_APPLY` stay off, and the caps stay where they are (see `docs/architect/cap-inventory-2026-10-22.md`). No row here changes a flag or the submit path.
5. **The owner's word is needed for any deploy, migration, credential or spend.** A row whose "Depends on" includes `Dep`, `$` or `O` cannot go live without it.

---

### G1. Start from target companies

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

### G2. Find the hiring manager or referrer

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

### G3. Warm outreach with approval

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

### G4. After submitting: follow-ups, recruiter replies, scheduling

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

### G5. Learn from results and change strategy

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

### G6. Real-odds judgment per posting

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

### G7. Skill-gap closing plans

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

### G8. Interviewer and company-specific prep

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

### G9. Staying useful after the hire

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

### Time: honest build-plus-test estimate with three builders

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

---

## Part D. Seven days: what is achievable and what is not

All of this assumes three builders (Codex, Muse, the architect reviewing) starting now. "Done" means built, fail-first tested and pushed. "Live" additionally needs the owner.

**Achievable in 7 days, offline (repo and tests):**
- F-037 read and push side, F-013, F-005 and the remaining audit rows (Codex owns them).
- Merge-ready packages for F-001, F-002, F-006, #20, Option A, the waiver package and the bridge package.
- G3.1: outreach approval moved to the card tap.
- About 60–70% of the 108 nine-gap micro-features. The pure functions and the chat-wired ones are about 110–120 of the ~168 builder-hours in Part C's table.
- Lane B's web card, reviewed and merged.

**Achievable in 7 days, live, only if the owner acts on days 1–2:**
- Deploys: agent-chat from the landing line, career-ingest and its cron, career-proactive and its cron.
- Migrations: ingest, outreach, interviews, the card bridge.
- Switches: `CAREER_BRAIN=agent`, and the submit switch for one supervised run.
- The extension in the Chrome Web Store, if review is fast.
- One supervised live session: one real person, the extension, 10–20 real applications, measured.

**Not achievable in 7 days, whatever happens:**
- **"60 applications in 30 minutes", live and repeatable for many testers.** It needs the submit path on, the caps raised above 50 a day, a host for 4+ browsers or the extension at scale, and measured live runs. One supervised session of 10–20 is the honest ceiling this week.
- **Calendar booking.** Google's sensitive-scope verification is outside our control.
- **Gmail sending at scale.** The restricted scope needs verification and a security assessment; test users under 100 are possible.
- **Hiring-manager discovery at scale.** It needs PDL or licensed data (D-018a); per-lookup pricing does not fit 2M users.
- **Outcome learning (G5) with real numbers.** It needs weeks of outcomes at n≥5 per segment.
- **The Connector's network effect.** It needs real opted-in users.

**Critical path (in order):**
1. **A browser host that can hold 4+ Chromium instances.** The owner reports the current one cannot (not re-checked here). Until it exists, the extension on the tester's own Chrome is the only apply surface. Decision: the owner chooses a host and signs up (Hetzner-class VM, ~€11/month per 4–6 browsers, or Browserbase ~$0.01 per application; ASSUMED prices).
2. **F-037 card delivery.** Without it no channel tester can approve anything. About 1.5 builder-days, then a deploy.
3. **Deploys and migrations already built:** agent-chat (landing line), career-ingest and its cron, career-proactive and its cron, and the pending migrations (outreach, interviews, card bridge, waiver). Each one is the owner's word.
4. **The owner's decisions:**
   - the submit switch (`CAREER_AGENT_SUBMIT`, `CAREER_CLOUD_APPLY`);
   - the daily caps for a 60-in-30 session (25 default and 50 max today);
   - `CAREER_BRAIN=agent`;
   - Apollo rows as a source (#20);
   - `CAREER_OUTREACH_SEND` and `CAREER_SOURCE_PAGES`;
   - D-025 (the mail model);
   - Google OAuth verification;
   - the PDL and Hunter keys.
5. **One measured live run with a real person.** Until then, nothing in this document is live-proven.

---

## Totals (marks in Part A and Part B)

| Part | Bullets | Verified | Claimed | Absent |
|---|---|---|---|---|
| A. Features (25 × 10) | 250 | 141 | 65 | 44 |
| B. Frontends and the beta bar | 20 | 9 | 4 | 7 |
| **Total** | **270** | **150** | **69** | **51** |

**Read this carefully: verified mostly means offline, not live.**
- Of the 150 verified bullets, 21 rest on a live read today. Most of those confirm a state, often an absence: 0 jobs, a function not deployed, a stale shelf.
- The other 129 rest on offline tests re-run today.
- Not one bullet shows a live application sent through Trainee: there are 0 such applications.

Counting rule: each numbered bullet counts once, by its first mark. A bullet that is built but not live is counted by its first mark, and its second mark is visible in the text.
- Verified (V): a test re-run today at `348c2d4a` (architect 1,264/0, edge 892/0, career node gate selection 2,276/202 with an environment-identical failing set), or a live read today.
- Claimed (C): exists in code, a branch or a record, not re-checked today.
- Absent (A): not built.
- Part C rows are specifications to build and carry no marks.
