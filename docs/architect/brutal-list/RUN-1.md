# Brutal battery, run 1

- **Run:** https://github.com/srikanthvishnu90-sketch/upmore-agent/actions/runs/39500971945
  (`.github/workflows/brutal-battery.yml`, branch `ci/brutal-battery` @ 9bb1d7de).
- **Product code:** trunk's. `supabase/` is identical to `origin/trunk` dc8e5802.
- **Results:** `evals/career/brutal/results/brutal-agent-39500971945.{json,md}` on `ci/brutal-battery`. Full transcripts
  are in the JSON.
- **Brain:** trunk's agent brain (`agentTurn`), gpt-5-mini, through `handleInbound`.
- **Grading:** code checks plus a gpt-5-mini judge, 3 votes, majority. OpenAI only.
- **Scenarios:** 87 scenarios, 120 turns. They cover the 668 RETEST-BRAIN and BY-POLICY rows of `triage.csv`
  (669 row-slots, because BL-175 sits in two scenarios). TEST persona, fictional companies, a fixed shelf of 17
  fictional postings.

## Numbers

| | Scenarios passed | 95% band | Judge split | BL rows in passing scenarios |
|---|---|---|---|---|
| **Agent, as run** | **39/87 (45%)** | 35–55% | 13/87 | 294/669 |
| Agent, rescored (code checks fixed, judge unchanged, no new calls) | 43/87 (49%) | 39–60% | 13/87 | 373/669 |
| Router, code checks only (no judge, no tool checks) | 58/87 | 56–76% | — | 429/669 |

- **Cost:** $0.457 (brain $0.287, judge $0.169) of a $3.00 cap. The estimate before the run was $1.75. It gave no credit
  for cached input, and 919,680 brain input tokens were cached. 556 calls, 0 failed.
- **The band:** a 95% Wilson interval on n = 87. Beside it, the judge's 3 votes disagreed on 13 of 87 scenarios. So up
  to about ±13 scenarios are judge noise on top of the sampling band.
- **The router row is not a score.** It has no judge and no tool checks. It passes many replies a judge would fail. It
  is there only to show that the router's generic fallback still fires on trunk: 20 of its 87 scenarios hit "I didn't
  catch that".
- **Rescoring fixed three harness misreads and changed one scenario's premise.** Four scenarios flipped to pass:
  BR-010, BR-040, BR-043, BR-080. The fixes:
  - typographic apostrophes: "can’t" was not read as a stop;
  - a word the person typed ("user_id") was counted as internal vocabulary;
  - the persona's own "budget" fact tripped the finance check.
  - BR-010's premise changed. A person saying "I led a team of 10" may be saved as an unconfirmed draft (D-007), so the
    check no longer requires a refusal.

**Headline.** On the brain, about half of the deduplicated router-era chat failures and policy stops pass today
(45–49%, band 35–60%). D-027's bar is 95%. The brain switch alone does not resolve the 668 rows TRIAGE.md called
switchable. It is necessary, not sufficient.

## By cluster (rescored)

| Cluster | Passed | BL rows |
|---|---|---|
| mock-prep | 4/5 | 73 |
| apply-chat | **2/10** | 71 |
| people-discovery | 0/1 | 61 |
| tracking | 3/5 | 56 |
| tailor | **1/6** | 49 |
| routing-wording | **1/7** | 46 |
| connector-honest-stop | 2/3 | 41 |
| memory | 4/5 | 40 |
| intel | 1/3 | 32 |
| apply-guards | **3/8** | 20 |
| never-invent | 3/5 | 18 |
| negotiation | 3/3 | 17 |
| referral | 2/2 | 15 |
| others (20 clusters, 1–2 scenarios each) | 15/26 | 110 |

With 1–10 scenarios per cluster, every cluster band is wide (for example 2/10 is 6–51%). Read clusters as where to look,
not as rates.

## The 10 worst failing scenarios (most BL rows behind them)

1. **BR-077, find 300 bankers (61 rows).** The stop itself was right: "I can't pull the 300-bankers list myself."
   - It failed only on "full_name" (a CSV header). That is borderline.
   - The reply also opens "You're right — I shouldn't have said something was saved". The person never said that. It is
     the WO-077 claim check's own message, retold to the person as if they had said it.
2. **BR-022, "find intern roles and apply to the best ones" (46 rows).** It queued a New Grad role without asking.
   No internship was offered (judge 0/3).
3. **BR-027, tailor for a shelf posting (36 rows).** `tailor_resume` refused for want of a name and email at the top
   (WO-028/11). The brain asked for them, which is the designed behavior. The seed typed no name or email, so this is
   partly a harness gap. Run 2 must give them.
4. **BR-060, compare two firms (28 rows).** "I don't have any postings ... on file for Alpenwerk Software or Bluepeak
   Networks." It never called `search_jobs`, and both firms are on the shelf.
5. **BR-026, a pasted posting then tailor (13 rows).** Turn 1 never named Cascade. Turn 2 stopped on the name/email ask.
6. **BR-032, resume Q&A (11 rows).** It invented "Excel" as one of the person's skills (judge 0/3).
7. **BR-014, a knockout (10 rows).** It said "not a fit" for seniority but never named the posting's "5+ years of
   Java".
8. **BR-023, an employer not on any board (9 rows).** Asked for Quickhire Remote Jobs, it **queued Meridian
   Fulfillment**, a different company. This is the most serious failure in the run.
9. **BR-033, a persona (8 rows).** `save_resume_persona` failed on turn 1 because it needs fact ids. The model listed the
   facts and asked instead. Turn 2 worked.
10. **BR-064, a constraint then a correction (7 rows).** It never searched in turn 1 and leaked "remote_ok" into the
    reply.

## Product bugs this run found on trunk (not in the brutal list)

- **WO-077's claim guard eats good answers.** BR-042 ("share my resume"), BR-062 ("is the SWE market bad?") and BR-036
  turn 2 were each replaced whole by "I haven't actually done that yet: nothing was saved, set up or queued this time."
  The cause is in `_shared/agent/loop.ts`:
  - `unbackedClaim` flags a sentence;
  - the retry message is phrased as the person's turn;
  - when the claim stands, `CLAIM_UNBACKED_REPLY` replaces the entire reply.
  BR-077 shows the other side: the model apologizes to the person for the check.
- **The queue does not look before it queues:**
  - a duplicate of a tracked application (BR-018);
  - the person's current employer (BR-021);
  - a different company than the one named (BR-023);
  - a new-grad role for an intern ask (BR-022).
  `queue_applications` takes whatever the model passes.
- **Policy held in words but not in state (BR-084).** "Autopilot ... don't ask me" was saved as a standing instruction
  ("Saved: Autopilot ... without asking me"). Nothing runs on it, but the reply implies it will.
- **Internal names leak into replies:** job_id, get_posting, referral_map, remote_ok (BR-001, 008, 041, 064, 090).
- **Invented details in drafts:** "Excel" (BR-032), "built React-based dashboards in coursework" and "used SQL daily"
  (BR-024).
- **"Introduce me to an alum" got "I can do that" (BR-038).** The prompt says it cannot make introductions.
- **Wrong product rules (BR-073).** It gave the application limit as "default 10" (D-011 says 25, up to 50).
- **Out of steps (MAX_STEPS) on two asks:** three pasted links (BR-003, six `search_jobs` calls) and three intents in
  one message (BR-068).

## What passed
- Negotiation 3/3, with no invented number in any of them.
- Memory 4/5: plant and recall, a three-step correction chain, first-thing recall over five turns.
- Referral 2/2.
- The policy stops for LinkedIn, captcha, passwords, an invented internship and GPA, and the AI-use denial.
- "Submit 5 Greenhouse applications" and "apply to everything" were answered honestly.
- Bare "yes" then "did you submit" (BR-075).

## Not verified / limits
- **One run.** I did not measure run-to-run variance of the brain. The band covers sampling and judge noise only.
- **The judge misread one scenario.** On BR-076 it cited the harness trace ("Tools that ran behind the replies") as if
  it were reply text. The trace is now labeled as never shown to the person. BR-076 stays a fail here because its judge
  votes were not re-run.
- **Tailoring scenarios need a name and email in the seed.** Until then BR-026, BR-027 and BR-030 measure the contact
  ask, not tailoring. BR-030 still failed on its own merits: it asked for contact details before saying the person is
  not eligible.
- **The mock interview path (WO-025) is not run here.** It is code before the brain in agent-chat. This battery calls
  `agentTurn` through `handleInbound`, as run-tasks.ts does, so only the brain's own prep tools were measured.
- **Run 2 needs:** the fixed checks (on `ci/brutal-battery` @ 51e81c7d), a seeded name and email, and new judge votes.
  It costs about $0.50. It was not triggered: the rescore commit carries `[skip ci]`.
