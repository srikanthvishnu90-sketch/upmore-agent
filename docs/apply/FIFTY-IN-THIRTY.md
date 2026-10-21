# 50 in 30: agent-submit throughput, measured, with its bottlenecks and a concurrency design

The owner's benchmark is to beat Tsenta's 50 applications in 30 minutes: 50 postings prepared, approved in ONE batch
(one tap, bound to the exact answers per posting, WO-101), and submitted within 30 minutes. This was measured on the
local TEST world first. Per-batch hash approval is untouched: the patch below changes when and where postings are read
and sent, never what is approved or the check of the live page against the approval (TraineeCore.batchMatch).

Labels: **VERIFIED-offline** means measured here, on the local TEST world in headless Chromium. Nothing reached a real
employer, Upmore or Supabase, and nothing cost money. **VERIFIED-LIVE-read** means taken from
evals/apply/results/live-fill.json (WO-042: real employer pages loaded and filled, never submitted). **ASSUMED** means
not measured, with the assumption stated. **NOT_RUN** means not tried.

## How it was measured

`evals/apply/fifty-in-thirty.cjs` loads a copy of extension/ with `agentSubmits` on (extension/config.js is never edited)
and, with `--patch`, applies docs/apply/fifty-in-thirty.patch to that copy only. It then does the following:
1. Discovery, in a separate browser on a separate world: it queues one clone of each of the 17 application captures,
   presses Prepare, has the TEST person answer every panel question, presses Prepare again, approves, sets
   `world.state.agentSubmit = "on"`, presses Start, and keeps the captures that the agent actually sends. 7 of 17 come
   out batch-ready. 4 of those 7 (3 Lever, 1 Ashby) go through in the TEST world: lever-cgsfederal, lever-weloglobal,
   lever-lyrahealth and ashby-harvey. The 3 Greenhouse ones are batch-ready but stop at the send as "differs" because
   the captures carry no Greenhouse script, so their dropdown widgets never open here. They do open live (live-fill:
   32 of 38 widgets correct). The other 10 are left out with their open questions, as WO-102 requires.
2. The measured session: N postings, each a distinct clone (its own company) of those 4. They are pasted into the queue
   and Prepare is pressed. The TEST person answers the panel's questions at once (no reading time). Prepare is pressed
   again, the batch is approved with one tap, the owner's switch is turned on in the world, and Start is pressed.
3. Timestamps per posting come from the extension's own marks (content.js `timing`, the card's `times.steps`, the
   queue item's `opened_at`, the proof's `finished_at`) and from the browser's navigation and tab-close events for
   Prepare's hidden tabs. A card that is ready but approved by nobody for 6 s while the queue runs counts as a stall,
   because it waits for a person forever.

Run it: `UPMORE_CHROMIUM_SANDBOX=off node evals/apply/fifty-in-thirty.cjs --n 50 --ready <ids> [--mode rounds]
[--patch docs/apply/fifty-in-thirty.patch] [--silent 10] [--seed-evidence 150]`. Without `--ready`, it runs discovery
first, which takes about 2 minutes. The output is a JSON file (report plus one row per posting) and a summary line.

## The numbers (VERIFIED-offline, TEST world, one machine)

### Before any change (the code on wo/first-real-submission at 515d48f2)

| Run | Sent | End to end | Prepare (both presses) | Send | Prepared/min | Submitted/min |
|---|---|---|---|---|---|---|
| N=10, one batch | 10/10 | 32.5 s | 2.6 s | 29.2 s | 230 | 20.5 |
| N=50, one batch | **20/50, then stalls** | stalls after 68.6 s | 4.8 s (reads only 20) | 62.5 s for 20 | 249 | 19.2 |
| N=50, three rounds of 20 (three taps) | 50/50 | 177.4 s | 13.2 s | 162.0 s | 228 | 18.5 |
| N=20, 2 silent employers | 20/20 (18 confirmed, 2 unknown) | 126.7 s | 4.9 s | 121.0 s | 246 | 9.9 |
| N=10, 150 earlier proofs on the computer (92 MB) | 10/10 | 93.8 s | 3.9 s | 89.1 s | 155 | 6.7 |

Per posting, with N=50 in rounds (p50 / p90):
- the queue opening to the card: 1.13 / 1.27 s. Of that, the fill is 0.87 / 1.03 s, mostly the Lever place search
  (0.56-0.60 s, its own 500 ms lookup delay). Page load is 0.05 s, the context RPCs 0.06 s, the read and plan 0.05 s.
- card to approval (code, batchMatch): 0.06 / 0.07 s.
- unchanged-form check: 0.01 s. Screenshot: 0.13 / 0.15 s. Begin (facts revalidation and begin RPC): 0.08 / 0.12 s.
- click to the employer's outcome: 0.73 / 0.81 s (the TEST employer answers at once).
- total, open to outcome: 2.13 / 2.33 s. Then the gap to the next posting: 1.16 / 1.36 s.

### After the patch (docs/apply/fifty-in-thirty.patch applied to the copy)

| Run | Sent | End to end | Prepare | Send | Prepared/min | Submitted/min |
|---|---|---|---|---|---|---|
| N=10, one batch | 10/10 | 15.2 s | 2.2 s | 12.3 s | 280 | 48.8 |
| **N=50, ONE batch, one tap** | **50/50** | **65.3 s** | 5.6 s (4.8 s read + 0.8 s re-plan) | 58.3 s | 536 | **51.5** |
| N=50, ONE batch, without the panel change (item 6) | 50/50 | 101.8 s | 8.1 s | 92.1 s | 372 | 32.6 |
| N=20, 2 silent employers | 20/20 (18 confirmed, 2 unknown) | 59.1 s | 3.4 s | 54.9 s | 359 | 21.9 |
| N=10, 150 earlier proofs (92 MB) | 10/10 | 22.6 s | 2.0 s | 19.9 s | 297 | 30.2 |

The N=10, silent and seeded rows after the patch were run before items 6 and 7 were added. Item 6 only speeds things up.
Item 7 changes nothing while the agent sends, and every run here has the agent sending.

Wall clock, end to end in the TEST world:
- **N=10:** 32.5 s before, 15.2 s after.
- **N=50 in one batch:** impossible before (stalls at posting 21; three rounds take 177.4 s and three taps). After the
  patch: 65.3 s with one tap.

Wrong or double sends: 0. Each posting reached its TEST employer exactly once in every run.

## Bottlenecks, each with its measured cost

1. **PREPARE_MAX = 20.** A batch of 50 cannot be prepared or approved in one go. Prepare reads 20 and says "Only the
   next 20 postings are read ahead (30 more wait)". After Start, the queue sends those 20, opens posting 21, which has
   no approval, and **waits there forever** (measured: 20/50 sent, then the stall). The only way around it today is
   three rounds, each with Prepare, answers and approval: three taps instead of one, 177.4 s in all. Live, every round
   also repeats the person's reading and their tap.
2. **One queue tab (serial send).** Every application waits for the previous one: 162.0 s of send for 50, which is
   2.13 s of work plus 1.16 s of gap per posting. Live, the work per posting is longer: open to card is 1.8 s p50 and
   4.1 s p90 (VERIFIED-LIVE-read; Greenhouse p50 3.8 s), and the employer's own answer is NOT measured live (ASSUMED
   1-5 s). That makes about 6-11 s per posting serially, or 5-9 minutes for 50 when nothing waits.
3. **The 900 ms queue gap.** Measured at 0.95-1.36 s per posting (the timer plus bookkeeping), which comes to 66.3 s,
   or 41%, of the 162 s send for 50.
4. **The proof list rewritten whole after every application.** (This one was not on the starting list; the measurement
   found it.) `keepEvidence` reads and writes the entire chrome.storage.local "evidence" list, up to 300 entries with
   both pictures inline. In the TEST world the gap grows from 0.95 s to 1.36 s over 50 applications: about 8.5 ms per
   earlier proof, with pictures averaging 118 KB per application. With 150 earlier proofs (92 MB) the gap is 6.8 s p50
   per application: **+5.9 s each**, and 89 s instead of 29 s for 10. A real page's pictures are larger than the
   TEST page's, so a person with a few hundred stored proofs pays this on every send.
5. **The 30 s outcome wait on a slow or silent employer.** Click to outcome p90 is 30.4 s. Each silent employer blocks
   the one tab for 30.4 s (121 s for 20 with 2 silent, against 62.5 s with none). Both are kept as `unknown_outcome`,
   counted as applied, never resent. That is correct and stays.
6. **The emailed code (WO-096).** Up to 180 s of Gmail polling (CODE_MAX_WAIT_MS) and then 120 s of waiting for the
   person's press, all in the one tab. That is up to 5 minutes for each Greenhouse posting that asks for a code. Taken
   from code constants; NOT measured, because the TEST world has no code page.
7. **AGENT_SETTLE_MS = 2.5 s.** This costs time only on a posting whose live card differs from the approval, and that
   posting waits for the person anyway. The cost is 2.5 s plus its fill (measured on the Greenhouse captures here:
   fill 1.9-11.8 s, because each widget that never opens times out after about 0.67 s, 16 times on SpaceX).
8. **The screenshot needs the tab in front.** It takes 0.13 s per picture serially, but it forces one sending tab per
   window. Chrome also allows only 2 `captureVisibleTab` calls a second, which matters once there are lanes: with 3
   lanes the screenshot step rises to 0.44 s p50 because pictures queue. At TEST speed the cap is the binding limit:
   100 pictures at 0.52 s is 52 s of the 58.3 s send for 50.
9. **4 surveys at once.** In the TEST world a survey read takes 0.33 s, so 20 postings read in 2.5 s and the cap does
   not show. Live, a survey read is about one page load plus form-ready (ASSUMED 2-4 s, from live open-to-card times).
   That makes 50 reads at 4 at once about 25-50 s, and today the second Prepare after the person's answers reads every
   page again (measured: the second press costs as much as the first, 2.3-2.4 s for 20 here).
10. **The per-application begin RPC.** 0.06-0.12 s here, against the local stand-in: one facts read and one begin
    call. Live latency is ASSUMED at 0.3-0.6 s. The database serialises begins per person
    (`pg_advisory_xact_lock` in career_apply_enqueue), which is harmless at 50.
11. **The panel re-renders on every storage change.** (This was also found by the measurement.) Each change to any
    key re-renders the panel, and each render asks the worker for the whole status, including the batch of 50
    postings with every answer. With 3 lanes this slowed the worker: begin p50 0.68 s and context 0.46 s, against
    0.18 s and 0.09 s with renders capped at 4 a second. That is 92.1 s against 58.3 s of send for 50.
12. **The person.** This is not measured here, because the TEST person answers instantly. For 50 postings of these
    forms the panel asked 73 questions. At WO-042's reading model (ASSUMED: 2.5 s per choice, 6 s per typed answer)
    that is about 3-7 minutes. Reading every answer of 50 postings before the one tap (ASSUMED: about 15 answers per
    posting, mostly the same lines, read at 238 words a minute or glanced at in 0.4 s when already seen) is about 5-9
    minutes. Live, this is the largest item in the 30 minutes.

## The patch (docs/apply/fifty-in-thirty.patch: extension/background.js, content.js, panel.js) and the gain of each item

Apply it with `git apply docs/apply/fifty-in-thirty.patch`. Nothing in extension/** was edited on this branch.

1. **Prepare: PREPARE_MAX 20 -> 100** (the queue's and the batch approval's own limit), **PREPARE_AT_ONCE 4 -> 8**.
   Gain: 50 in one batch with one tap (20/50 stalled, 177 s in 3 rounds -> 50/50 in 65 s). First read of 50: 4.8 s.
   Live estimate: about 13-25 s instead of 25-50 s.
2. **Re-plan instead of re-reading.** The survey also returns the form's schema and its page-listed fields. When
   Prepare is pressed again within 10 minutes, the background plans those postings again from what was read
   (`planSurveyed`: the same planForm, contractFill and batchPlan calls content.js makes) instead of loading each
   employer's page again. Gain: the second press for 50 takes 0.77 s instead of about 6 s here (a second full read),
   and saves 50 page loads live (about 13-25 s). Safety is unchanged: the send still re-plans on the live page and
   batchMatch compares it with the approval, so a form changed since then waits for the person (A4).
3. **Send lanes: SEND_LANES = 3**, each lane the only tab of its own window, so each is "in front" (active) for its own
   pictures. The queue gets one lock (`withQueue`). Each item records its lane. Two lanes never hold the same company
   at once. The queue gap becomes 150 ms (QUEUE_GAP_MS). There is only one lane unless the agent sends: a card the
   person taps is read in the panel beside its one tab. Gain: send 162 s -> 58 s for 50 (2.8x). With 2 silent
   employers in 20: 121 s -> 55 s, because a 30 s wait now blocks one lane, not the whole queue.
4. **Pictures paced: one at a time, at least 520 ms apart** (Chrome's limit of 2 a second). Without this, a refused
   capture with lanes would stop a ready application ("The picture of the filled form could not be taken"). Cost: the
   screenshot step goes from 0.13 s to 0.44 s p50 under 3 lanes, which is still far below a live page's time.
5. **The proof list: only the newest 10 proofs keep their pictures inline;** older pictures move to `shot:<id>` keys,
   which "proof" reads back and "Clear proof" removes. The newest proof keeps its pictures inline, which the browser
   suite reads. Gain with 150 earlier proofs (92 MB): 89.1 s -> 19.9 s of send for 10. After the patch the first
   application still pays a one-time move of the old pictures (one 7.2 s gap), and every later one is bounded.
6. **The panel renders at most every 250 ms** on storage changes. Gain: 92.1 s -> 58.3 s of send for 50 under 3 lanes.
7. **Queue-start stores `running` before it opens lane windows,** so nothing reads a half-started queue.

Checked against the existing suites, on a scratch copy of the repo with the patch applied: the agent-submits, browser,
person-submits and Workday extension suites. The result is in the report back. An earlier draft that opened lanes even
with the flag off failed 3 queue and answer-once tests, which expect one tab; item 3's flag gate fixed that.

## Design for 50 in 30 minutes, live

| Step | Who | Concurrency | Expected time for 50 |
|---|---|---|---|
| Prepare (read every posting) | machine | 8 hidden tabs; propose at most 4 per ATS host | 13-25 s (ASSUMED from live open-to-card 1.8 s p50, 4.1 s p90) |
| Answer the panel's questions | person | - | 3-7 min (ASSUMED model; 73 questions for these 50) |
| Prepare again | machine | re-plan, no page loads | about 1 s (measured 0.77 s) |
| Read the batch, one tap | person | - | 5-9 min (ASSUMED model) |
| Send | machine | 3 lanes (windows) | 50 x 6-11 s / 3, about 2-3 min; plus 30 s of one lane for each silent employer |
| **Total** | | | **about 11-20 min**, of which the machine is 3-4 min |

**Per application, live:** about 6-11 s of lane time. That is open to card (1.8-4.1 s), check plus picture plus begin
(about 0.5-1 s live, ASSUMED), the employer's answer (1-5 s, ASSUMED) and the 150 ms gap. That gives about 2-4 s of
wall clock per application across 3 lanes.

**Why 3 lanes, not more:**
- Pictures cap any number of lanes at 1 application a second (2 pictures each).
- Each lane is a real employer page (about 100-300 MB) in a visible window.
- More parallel loads from one IP against the same ATS raise bot-check scores.
- Once the person's 8-16 minutes are counted, the send is no longer the critical path: 3 lanes take it from 5-9
  minutes to 2-3.

**What stays serial, and why:**
- **The one batch tap.** It is the person's approval of the exact answers (the rule that never moves).
- **Each application's begin.** The database checks the daily limit and the company cooldown under the person's lock,
  and uses the batch approval once.
- **Pictures.** Chrome allows 2 a second.
- **One company at a time across lanes.** The cooldown allows one application per company per 30 days.
- **"Stop applying".** It stops every lane before its next check: the patch sends `agent-stop` to every lane and
  revokes every approval, as today.
- **Each tab stays in front of its own window** while its pictures are taken.

**Without the patch, live:** 50 cannot be approved in one batch. It takes 3 rounds, so 3 reads of the batch and 3 taps,
and the serial send is about 5-9 minutes plus 30 s for each silent employer and up to 5 minutes for each emailed code,
plus the growing proof-list cost.

## Risks

- **Daily limit.** `career_apply_daily_limit` defaults to 25, with at most 50 a day (D-011, migration 20261020050000).
  The count covers queued, driving, confirmed, submitted_unconfirmed, needs_user and unknown_outcome applications from
  the last 24 hours, so a silent employer's unknown_outcome counts. 50 in one batch needs the person's own daily_limit
  set to 50 and nothing else sent in the past 24 hours. Anything above 50 a day needs the owner's written amendment.
  Without it, the 26th begin of a default account is refused ("You reached today's application limit"). The posting
  then waits for the person, nothing is sent, and the queue goes on to refuse the rest one by one.
- **Company cooldown.** One application per company (normalized name) per 30 days, enforced at begin. A batch must hold
  50 distinct companies. The lane guard stops two of the same company running at once, but a second posting at a
  company is still filled and then refused at begin. Proposed, not in the patch: Prepare leaves same-company postings
  out of the batch, with the reason.
- **Batch approvals.** Live for 24 hours, at most 100 per approval call (migration 20261024090000). This fits 50.
- **Bot checks.** Ashby sits behind Cloudflare and hCaptcha (live-fill saw hcaptcha hosts), and Greenhouse runs
  invisible reCAPTCHA. A burst of 8 survey tabs plus 3 lanes from one browser on the same ATS host can raise challenge
  rates. A challenge is never solved: the posting stops and waits for the person, which lowers yield and does not break
  anything. Mitigations: a per-host cap (proposed), jitter, and the existing stop.
- **Rate limits.** ATS APIs (Ashby GraphQL, Lever's location lookup) may answer 429. The extension has no backoff for
  that. It shows up as a fill that differs, so the posting waits for the person.
- **Lane windows on a real desktop.** NOT_RUN. In headless Chromium every window renders. On a desktop, Chrome may
  throttle an occluded or minimized window's timers and paint, and `captureVisibleTab` of such a window may fail.
  Lanes should be tiled visibly, or run as one window group the person leaves open. This must be checked on the
  owner's machine before the patch is turned on.
- **The re-plan uses the form as read up to 10 minutes earlier.** The approval's safety does not rely on it (the live
  page is checked at the send), but a posting whose form changed in between now shows "differs" at the send rather
  than at Prepare.
- **TEST-world limits.** The captures carry no employer scripts, so Greenhouse widgets cannot be sent here, which
  leaves 3 Lever forms and 1 Ashby form. The employer answers at once, and the RPCs are local. Live load, answer and
  RPC times are taken from live-fill where it exists and ASSUMED elsewhere. No live submission was made.

## Not done here

- Turning on any flag.
- A live run.
- The per-ATS-host cap and the same-company filter (proposed above).
- Any change to extension/** (the patch is a file).
- Any test edit.
