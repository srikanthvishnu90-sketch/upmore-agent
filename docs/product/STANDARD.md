# The standard every Trainee feature is held to (owner, 2026-10-19)

The owner's text, kept as written. `docs/product/REQUIREMENTS.md` is the checklist against it.

================================================================
1. THE BAR, IN ONE PARAGRAPH
================================================================

Every feature must be so deep that a knowledgeable user comparing Trainee to the best competitor picks Trainee without
hesitation. That means: the feature works end to end in the real world, not against a test fixture. It is architected
and priced for tens of thousands of users from day one. It fails loudly and honestly instead of silently. And nothing
merged is placeholder, stubbed, or "good enough for now" without a written, ranked gap list that says exactly what is
missing and when it closes.

================================================================
2. THE FOUR TESTS EVERY FEATURE MUST PASS
================================================================

TEST A - DEPTH: IT WORKS IN THE REAL WORLD, END TO END. The happy path against real external systems (real job boards,
real forms, real inboxes); every failure path a real user can hit (timeouts, rate limits, captchas, changed page
layouts, expired sessions, missing data, partial completion); the recovery path (when something fails halfway the
system knows exactly what state it is in and either finishes, rolls back, or hands to the human with full context; it
never guesses); the edges that define trust (duplicates, retries, time zones, names with accents, unusual question
types). The test: write down every step between "user asks" and "outcome is real in the world and confirmed". If any
step is assumed instead of verified, the feature is not deep yet.

TEST B - COMPETITOR: a living `docs/competitors/<feature>.md` per feature: at least 5 named competitors verified on
their live sites with the date checked (re-verify old notes, including this repo's); for each, what it does, price,
limits, known failure modes, what users complain about (reviews and forums), what it does better than us today and
what we do better; and the three things its user would miss most on switching to Trainee, with the plan to close each.
Starting lists: auto-apply (Tsenta, LazyApply, Simplify Copilot, Teal, Sonara: Sonara shut down, find out why and
write it down); alerts and tracking (Teal, Huntr, Simplify, LinkedIn alerts, Google job alerts); networking (the
contact-sourcing tools already researched; Apollo and Hunter terms bar product use, which stands; LinkedIn's own);
mock interviewing (question quality, feedback specificity, voice); conversation and memory (the bar is the best
assistant the user has ever texted). Feature by feature, beat each row or write down why it does not matter.

TEST C - SCALE: design target 100,000 users. Per feature, in writing: per-user resource cost (storage per month, LLM
tokens per day, external API calls per day, queue work per day); cost per user per month at 100 / 1,000 / 10,000 /
100,000 users from real vendor pricing with every assumption written next to the number (reference: server-side
browsers at 75K active users run about $37K/month through one vendor before proxies; the cheap path is work in the
user's own browser and company-portal forms, server browsers for paid tiers); rate limits of every external service
and exactly what the product does when each is hit ("it errors" is not an answer); what breaks first at 10x and the
plan; per-user isolation; storage growth with a retention and pruning policy before launch (173K open postings
measured about 564M characters, over the free-plan limit on first ingest). A design that only works because usage is
small says so in the PR and goes in the ranked gap list.

TEST D - PERFECTION: no placeholder code, TODOs or temporary shortcuts in merged paths (an incompleteness is a named,
ranked gap-list entry, never a code comment); every error caught, categorized and surfaced where a human or the user
can see it (the worst bug is the silent one: the application that never sent while the UI said it did); every
background job observable (what ran, succeeded, failed, why) with an alarm that fires when it stops (the alert timers
already died quietly once); copy written like a person wrote it: short, plain, no filler.

================================================================
3. DEFINITION OF DONE: REQUIRED ARTIFACTS PER FEATURE
================================================================

1. Feature spec: user stories including failure and edge stories, in plain language.
2. Competitor matrix at docs/competitors/<feature>.md, current within 30 days.
3. Scale and cost model: the Test C numbers, with assumptions.
4. Security and privacy: what user data it touches, where it lives, per-user isolation, credential storage, deletion.
5. Reliability design: idempotent queue and retry, dead-letter handling, crash-recovery states, the metrics, logs and
   alerts that catch silent failure.
6. Testing: unit, integration against real captured artifacts (for applying: the 17 real forms in trunk), full suite
   green on CI before every push; acceptance tests never weakened; an impossible acceptance test is escalated.
7. Launch readiness: runbook (operate, roll back, kill), rollout plan (beta cohort, waitlist, general), the metrics
   that define "working" with alert thresholds.

================================================================
4. HONESTY RULES (NON-NEGOTIABLE)
================================================================

- Label every result VERIFIED, ASSUMED or NOT_RUN and say what it was verified against.
- Never round results up. 0/24 is 0/24. 5/99 ready is 5/99 ready.
- Never weaken a test, a gate or a fixture to make it green.
- Commit messages and PR text are claims; running behavior on real systems is proof. Report the difference.
- When blocked, report the blocker with what was tried and the plausible paths. Never route around it quietly.
- If something already merged does not actually work, say so in the next PR, prominently.

================================================================
5. THE FEATURES AND THE DEPTH EACH ONE REQUIRES
================================================================

5.1 Conversation and memory (the core): structured, retrievable memory (say so and ask when missing, never
confabulate); quality measured (the 300-scenario suite and the multi-turn conversation eval in the gate); proactivity
with judgment; the alarm for silent job death is part of this feature; retrieval fast at 100K users, bounded storage.
5.2 Job discovery and alerts: long-tail career pages on a stated cadence with dead postings removed; matching against
the profile with a reason; dedupe, no repeats, quiet hours, feedback that measurably changes alerts; the freshness
metric (median minutes from posting live to user alerted) is the feature; send pipeline within the messaging
provider's limits.
5.3 Mass applying: section 6.
5.4 Networking and outreach: sourcing within legal terms (Apollo and Hunter excluded); drafts the user would send
unedited; approval always required, nothing auto-sends, ever; follow-ups without double-emailing; deliverability that
protects the user's own email reputation.
5.5 Mock interviewing: question banks from the actual posting and company; multi-turn probing; feedback naming the
specific weakness; progress per skill across sessions; text first, voice later.
5.6 Career guidance: grounded in the user's history and in real harvested postings; honest counsel; every market claim
points to the postings it read.
5.7 Resumes and proof-of-work: truthful tailoring that never invents; the anti-slop bar; the 14 researched project
briefs; formatting verified against actual ATS parsers.
5.8 Connections layer: a heartbeat per connected account and one clear message with the fix when it breaks; fallback
with what it has; least privilege; honest degradation where LinkedIn and Handshake offer no full connection.
5.9 Channel and onboarding: Apple Messages for Business pursued in parallel with the managed line, plus a web
fallback; daily-contact caps drive the invite cadence (20-50 new users per day on the entry tier); every invite path
tested end to end on real phones; onboarding asks only what each feature needs, when it needs it.

================================================================
6. WORKED EXAMPLE: MASS APPLYING AT THE REQUIRED DEPTH
================================================================

Stage 1 Discover: every relevant posting found within minutes, deduplicated, matched with a reason. Gaps: long-tail
pages, refresh cadence, dead-posting detection, match-quality measurement.
Stage 2 Answer (ask-once): a per-user answer bank; ask only what is genuinely missing, once, remembered forever. Gate:
WO-020 acceptance must hold on both independent samples.
Stage 3 Fill: readback-verified fill on the 17 real captured forms, including rendered readback for dynamic widgets;
the captcha detector's empty-container defect fixed.
Stage 4 Submit: within the rules; bot checks handled honestly, never defeated. The owner personally makes the first 3
real submissions per job site, each confirmed by the employer's email, before any automated applying on that site.
This gate does not move. The worker model: runs only when started by hand with credentials (else "not wired"); sends
only the exact approved answers; never resends a claimed application; crash after approval or missing proof is
UNKNOWN, never a retry or a claimed success; a captcha or email code stops and hands back to the human; its notes say
plainly that no live submission has been shown.
Stage 5 Prove: SUBMITTED (with the employer's confirmation email parsed and stored), UNKNOWN or FAILED (with reason);
no confirmation within a stated window flips to UNKNOWN and the user hears about it.
Stage 6 Recover and hand off: a short message with exactly what is needed, then resume from where it stopped.
Stage 7 Operate at scale: cost per submitted application (LLM + browser/infra + messaging) at 100 / 1,000 / 10,000 /
100,000 users; the user's-own-context option preserved; rate limits per ATS per day and queue behavior; throughput
and workers for 100K submissions per day; anti-abuse (daily caps, relevance floors).
Stage 8 Launch gates (all at once before beta): (1) the owner gate complete for the launch ATS set; (2) readback-
verified fill passes on all 17 captured forms in CI and the captcha-detector defect is fixed; (3) outcome states with
proof parsing, messages never claim more than the proof; (4) the cost model at 1,000 and 10,000 users with real vendor
numbers and a price that covers it; (5) kill switch and rollback runbook exercised once; (6) metrics live (submission
success, confirmation, handoff rate, time-to-apply, cost per application) with alert thresholds.
