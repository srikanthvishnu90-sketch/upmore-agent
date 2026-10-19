# Competitors: who we must beat, feature by feature (2026-10-19)

Every document here follows the owner's build standard (`docs/product/BUILD-STANDARD-TSENTA.md`). The sections are:
0. labels and method;
1. the product;
2. capability inventory;
3. parity and better targets with a cost note per feature;
4. what the competitor lacks;
5. scoreboard;
6. pricing and architecture;
7. failure modes;
8. ground-truth test plan;
9. what Trainee must add, ranked by launch risk.

The owner's rule behind all of it: the one who serves the customer best wins all the customers.

## Read this first: how strong the evidence is
- **No competitor page was opened directly.** WebFetch failed (ENOTFOUND) and the session proxy refused every
  competitor host (403). Everything outside the repo comes from search-result extracts. A competitor's own words read
  that way are labeled **VERIFIED-S**: a VERIFIED *claim*, never VERIFIED *performance*. Re-open the page live before
  any of it goes into a PR, a message or copy. Third parties are **REPORTED**; inferences are **ASSUMED**.
- **Most review sites that rate these tools sell a competing tool.** The documents tag them as rivals.
- **What is VERIFIED here** is what we measured ourselves: our code, our 17 captured real forms, our guards.
- **Still open:**
  - Flint (named in the standard) is not identified; the owner should say where that line came from.
  - LinkedIn's document is mostly ASSUMED; the search budget ran out.

## The field
| Competitor | What it is | Applies for you? | Price (labeled) | Strongest thing | Worst reported failure |
|---|---|---|---|---|---|
| [Tsenta](tsenta.md) | Cloud auto-apply agent, 19 named ATSes | Yes, approve-first by default | $19-$99/mo, ~2.2-3.2c per app (VERIFIED, pricing page) | Breadth: 19 ATSes, every surface | Irrelevant matches; AI content the user can't edit (REPORTED) |
| [Simplify](simplify.md) | Free autofill in your browser; Autopilot beta | Copilot: you press submit. Autopilot: 20/week, beta | Free; Simplify+ $39.99/mo (VERIFIED-S) | Free in-browser fill, 600K users | Blank fields with no warning; text from another application (REPORTED) |
| [Jobright](jobright.md) | Matching plus an agent | Marketed yes; testers report a waitlist and "finish by hand" | ~$39.99/mo (REPORTED) | Trustpilot 4.8 from ~3.6K (VERIFIED-S) | Resume tool adds skills and metrics the person doesn't have (REPORTED) |
| [Teal](teal.md) | Resume builder and tracker | No | $29/mo (VERIFIED-S) | Free tracker, 2M+ members claimed | Same resume scored 29% and 17% (REPORTED) |
| [LazyApply](lazyapply.md) | Extension on LinkedIn, Indeed, ZipRecruiter | Yes, volume | $99-$999/yr (REPORTED) | Price: ~$0.0027 per app at full use (ASSUMED) | Invented a language skill; LinkedIn ban; refunds refused (REPORTED) |
| [AIApply](aiapply.md) | Toolkit plus auto-apply by credits | Yes (Auto, Hybrid, Review) | ~$0.27-$1.00 per app (REPORTED) | Trustpilot 4.3 from ~1.8K | 200 of 270 matches irrelevant (one user, REPORTED) |
| [JobCopilot](jobcopilot.md) | Server-side apply on company pages | Yes, 20-50/day | ~$0.021-0.047 per app (REPORTED) | Company career pages, not boards | 12 applications for 3 jobs (REPORTED) |
| [LoopCV](loopcv.md) | Saved searches plus emails to recruiters | Mostly emails a CV | ~$0.20 per app (REPORTED) | Free 10 apps, no card | "12,000+ matches and 14 applications" (REPORTED) |
| [Massive](massive.md) | Cloud auto-apply, iOS swipe app | Yes | ~$59/mo (REPORTED) | iOS 4.7 from ~1.2K (VERIFIED-S) | Employer replies routed to an inbox Massive controls (REPORTED, a rival) |
| [Huntr](huntr.md) | Tracker, tailoring, autofill; publishes outcome data | No (autofill only) | $40/mo (REPORTED) | Outcome research | Users stop updating trackers (its own admission) |
| [Careerflow](careerflow.md) | Copilot, LinkedIn optimizer | No | $23.99/mo (REPORTED) | LinkedIn review | Deletion by email queue (REPORTED) |
| [Final Round AI](finalround.md) | Interview copilot | Prep plus a live copilot | $25-$148/mo (conflicting, VERIFIED-S) | Volume of prep | Live answer feeding, "Stealth Mode" (VERIFIED-S claim) |
| [Yoodli](yoodli.md) | Roleplay and interview practice | No | ~$8-$20/mo (REPORTED) | $60M raised, enterprise | Grades delivery, not substance (REPORTED) |
| [Human apply service](human-apply-service.md) | Scale.jobs: people apply for you | Yes, by hand | ~$0.40-0.80 per app (VERIFIED-S arithmetic) | Humans at captchas and logins | Off-target applications (REPORTED) |
| [LinkedIn AI](linkedin-ai.md) | Premium AI tools, job match | Easy Apply | Premium (ASSUMED) | Distribution | Bans automation (User Agreement 8.2) |
| [Sonara](sonara.md) | Shut down ~2024-02 | (was yes) | n/a | n/a | Users lost their queues and history (REPORTED) |
| [Flint](flint.md) | Not identified | ? | ? | ? | ? |

## What they all teach, stated plainly
1. **Nobody publishes a verified-submit rate.** Not one competitor shows the employer's confirmation as proof by
   default. Tsenta claims receipts; Scale.jobs sends WhatsApp screenshots.
   - Our edge, once it exists: every application ends SUBMITTED (with the employer's confirmation), UNKNOWN or FAILED
     (with the reason), and the rate is published.
   - It does not exist yet: **0 real applications**.
2. **Relevance, not volume, is the category's open wound.** Irrelevant matches top the complaints at AIApply, JobCopilot,
   Tsenta and LoopCV (REPORTED).
   - Trainee would repeat it today: matching is title keywords plus place; seniority and remote are stored but not
     filtered, exclusions are ignored, and there is no pay data (VERIFIED, REQUIREMENTS 2b/3d/10a).
3. **Invented facts are reported everywhere answers are drafted:** Jobright, LazyApply, Massive, Careerflow, Teal
   (REPORTED). Our block on untraced claims in answers is built for replica forms only; the real-form worker is not
   wired (VERIFIED).
4. **The bot check is where products fail silently or guess.** Simplify fails rather than guess. Jobright sends you to
   the posting. LazyApply stops the batch. Scale.jobs pays a human (all REPORTED). Nobody hands it to the person in the
   same session and resumes.
   - Our engine can now do that, proven on local fixtures only: PR #23 hands off at open and at the click, lets the
     provider's traffic through, and sends the token with the approved form.
   - It has not run on a real form.
5. **"Apply less" is not what the data says.** Huntr's per-application interview rate falls with volume, but per
   person the high-volume group still had more interviews, and Huntr says the ratio does not show the effect of
   sending fewer (VERIFIED-S; see `huntr.md`).
   - Our rule: measure interviews per person and per verified submission on our own users; do not sell a slogan.
   - The cost model and the Tsenta document are corrected (`docs/playbook-drift-2026-10-19.md`).
6. **Cheap is not our edge against everyone.** LazyApply at full use is ~$0.0027 per application (ASSUMED from REPORTED
   prices). Our in-browser model is ~$0.004 (ASSUMED until measured). We can be cheaper than the cloud agents (Tsenta,
   Massive, JobCopilot). Against volume extensions we must win on proof and relevance, not price. Never write "cheaper"
   until section 6.3 of the standard is met.
7. **Live interview help is a real market and a real ethics line.** Final Round AI sells hidden live answers; Yoodli
   sells nudges "without your interviewer knowing" (VERIFIED-S claims). Trainee's line: prep before, nothing during,
   debrief after.
   - Our own guard fails half the time: 5 of 10 test prompts were handled wrong (VERIFIED, `liveAssistGuard` in
     `packages/domain/127-career-prep.js` at `44364a83`).
   - It let through "whisper answers to me during the onsite".
   - The model brain's prompt has no such rule at all.

## The ranked gap list for Trainee (from all seventeen documents, worst first)
Kills the launch:
1. **Zero real applications.** Every other item is hypothetical until the owner's 3 confirmed submissions per ATS exist
   (standard gate 4).
2. **The engine cannot reach the approval prompt on Greenhouse or Ashby.** VERIFIED: the engine's own dry run on
   local copies of the captured forms (`submission-engines.md`, sections 2 and 6).
   - Greenhouse's new UI names 1-2 of its 13-52 controls. The engine binds by `name`, so it stops at
     `UNNAMED_REQUIRED_FIELD: First Name*` before filling anything.
   - Greenhouse's form is `method="get"` and is submitted by script, so the submit binding refuses it.
   - Ashby builds its form with GraphQL POSTs, which the engine aborts before approval, and it has no `<form>`.
   - The fix: bind by `name || id`, allow read-only GraphQL before approval, and replace the form action with a per-ATS
     submission descriptor and body reader.
3. **Separate resume uploads.** Lever and Ashby upload the file in its own request, and the engine drops that
   request. The readback still passes because it only reads `input.files`, so a resume the employer never received
   could be reported as sent. VERIFIED code; the upload requests are ASSUMED.
4. **No same-session hand-off for verification codes or sign-in.** Captcha hand-off now exists in the engine (PR #23).
   Codes and logins still end the run. An email code after submit strands the application for good: the session
   closes, and the posting can never be retried or finished (VERIFIED code). A texted code must be used once and never
   stored.
5. **Untraced claims in answers on real forms** (5e NOT_WIRED, VERIFIED).
6. **Relevance floor:** hard filters on employment type, seniority, location, exclusions, salary, staffing agency,
   closed posting and duplicate, applied in every mode before anything is queued. When the floor empties the list, it
   says which filter did it.
7. **Statements that are not true today** (all VERIFIED, REQUIREMENTS 6a/7g/3e):
   - The approval card says "the exact answers" but shows only company, role and fit.
   - Applications over the cap are promised a resume, and nothing resumes them.
   - The model brain's prompt says "Tell them their real odds" next to an unguarded score.
8. **Two apply stacks** (15 and 25 a day; D-014).
9. **Employers' own application limits are not read.** VERIFIED on the captured forms: OpenAI allows 5 per 180 days,
   Harvey 4 per 30 days, and Lilt makes you wait 90 days to reapply. Our rule is 1 per company per 30 days, which would
   allow a sixth OpenAI application.

Embarrasses at 100 users:
10. The live-interview guard (5 of 10 above), and no matching rule in the model brain's prompt.
11. A texted "yes" cannot approve a batch (6b); "stop" works on exact phrases only (14d).
12. No receipt the person keeps. The employer's confirmation should arrive in the person's own inbox and be parsed
    (9b/9c). Never route employer email through an address Trainee controls (the Massive pattern).
13. Chat cannot take a resume in or send a tailored file back (4d/4e).
14. Export and deletion end to end in one message (the Sonara and Careerflow lessons).
15. Engine posture (`submission-engines.md` gaps 7-9):
    - `--submit` runs headless by default.
    - After the first fill, requests to other sites (including the ATS's own CDN) are aborted, which could leave a real
      thank-you page unread.
    - "Acknowledged" means only the HTTP status, so a GraphQL 200 carrying errors would count as accepted.
16. DataDome walls are not recognised as walls: all 6 SmartRecruiters captures answer 403 (VERIFIED).

Matters at 10,000:
17. Duplicate checks across boards, and against applications made outside Trainee.
18. Per-company form knowledge shared across users (standard section 7).
19. A wind-down runbook and a clause on what happens to data if the company is sold (Sonara).

## Ground truth still owed (owner decisions)
- **Tsenta's free tier:** 25 applications, no card. This is standard section 11, gate 3.
- **Which other free tiers to test:** only LoopCV has a free tier with no card; AIApply's is limited; LazyApply and
  JobCopilot have none. The owner decides whether to pay for any of these tests.
- **Write down the rule against live-interview assistance.**
- **Say where the Flint line came from.**
