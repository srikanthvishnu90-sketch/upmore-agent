# Mass apply: measured time and cost per application (2026-11-01)

Source: `tests/architect/flow-mass-apply-telegram.test.ts`, run with `MASS_TIMING`.

**What the run covered.** The run used the production path a phone-only person takes:
- The Telegram webhook, then agent-chat.
- One message: "apply to the top 12 frontend internships in Chicago".
- The hosted preparation, which runs the engine's dry run on each form.
- Questions asked one at a time over Telegram.
- One card, one tap.
- The cloud dispatcher with its send sandboxes. Each sandbox runs `scripts/apply.ts --submit --approved`.

**What it ran against.** The employers were 12 postings on local Greenhouse, Lever and Ashby form servers (`tests/helpers/ats_world.ts`):
- one captcha;
- one required question added after the approval;
- one posting closed after the approval.

**Where it ran.** One shared build container with a load average of about 18 from other sessions. Treat the times as upper bounds. Nothing reached a real employer, and no model was called.

## Measured (N = 12)

| What | Measured |
|---|---|
| Ask: "top 12 … in Chicago" to 12 queued | 0.27 s |
| Preparation, from the ask to every application prepared | 147 s wall. This includes the 21 questions the TEST person answered over Telegram, every shared fact asked once. |
| Preparation sandboxes | 2 sandboxes, 139.6 s in all. That is **11.6 s of sandbox time per posting**, almost all of it the browser dry run that reads the form. |
| Send sandboxes | 11 sandboxes, 125.7 s in all. That is **11.4 s per application**, one sandbox each. |
| Sends in flight at once | 2. The dispatcher started 2 per tick in this configuration. |
| Model calls, preparation and send | **0**. Answers come only from confirmed facts and the person's own answers. |
| End to end, 12 applications including the cap step | 259 s |
| Outcomes | Submitted with the page's confirmation: 7 (1 confirmation id read). Captcha: needs_user, nothing sent. Question added after approval: not_submitted / needs_answers, nothing sent. Closed posting: not sent. Held by a portal pause: 2, nothing sent. No employer received a second application. |

**N = 10:** about 3.6 min wall, by the same per-application figures.

**N = 50: not measured.** In this harness the portal gate waiver allows at most 5 sends per portal. The projection from the measured per-application figures, at 2 sandboxes each for preparation and send:
- preparation: 50 × 11.6 s / 2, about 4.8 min;
- sending: 50 × 11.4 s / 2, about 4.8 min;
- total: about **10 min wall**, plus the person's answers.

## Cost per application

Rates: Vercel Sandbox, Pro, iad1, from https://vercel.com/docs/sandbox/pricing (fetched 2026-11-01):
- Active CPU: $0.128 per hour.
- Memory: $0.0212 per GB-hour, with a 1-minute minimum per sandbox.
- Creations: $0.60 per million.

The sandbox is 2 vCPU and 4 GB, as `supabase/functions/_shared/cloud_runner.ts` creates it.

| Item | Per application |
|---|---|
| CPU, upper bound (assumes 100% busy): (11.6 + 11.4) s × 2 vCPU | $0.0016 |
| Memory: preparation 4 GB × 11.6 s, plus the send billed at the 1-minute minimum (4 GB × 60 s) | $0.0017 |
| Sandbox creations (about 1.2 per application) | ≈ $0.000001 |
| Model tokens | $0 |
| **Total, upper bound** | **≈ $0.0033** |

**For 120 applications in one hour:**
- Cost: about **$0.40**.
- Sandbox time needed: 120 × 23 s, about 46 sandbox-minutes per hour. That is about one sandbox busy on average, so 2–4 concurrent is enough.
- Host rate: across the three ATS hosts, 120 per hour is 40 per host per hour, one every 90 s per host. That is a sane per-host rate.

**Making it cheaper:**
- Batch a person's sends into one sandbox per host round instead of one sandbox per send. That removes the 1-minute memory minimum and lowers the cost to about $0.002 per application.
- Read the form schema from the public board APIs instead of the browser dry run (design item 1, below). That removes the 11.6 s preparation sandbox per posting, leaving about $0.0015 per application.

## What stands between this and 60–120 per hour (found by this run)

1. **One failure pauses a whole ATS.**
   - The cloud throttle (`career_apply_cloud_events`) paused Lever after a single failure, a posting that closed after approval.
   - The rest of that person's Lever applications were held (`portal_paused`), or refused before Submit (`CARD_CLOUD_AUTH_REFUSED`). Nothing was sent wrongly, but 2 of 12 did not go.
   - A closed posting should not count as a portal failure.
2. **Portal gate.**
   - Until a portal has proven sends, each person needs a waiver: `career_apply_cloud_gate_waivers`, with `max_sends` from 1 to 5.
   - At most 5 per ATS per waiver blocks a 50-application batch.
3. **Dispatch rate.** The dispatcher started 2 sends per tick. With the production tick once a minute, the ceiling is 120 per hour. Starts per tick need room above 2.
4. **Two cards for one batch.**
   - A 1-item card reached the chat while the other 11 were still being prepared. Then the 12-item card came, sent 3 times as the same card.
   - Tapping the old card approves nothing, which the test checks. It is still noise. The card should wait until the batch is prepared.
5. **Preparation is a browser per posting.** This is the 11.6 s and the main compute cost. Greenhouse's boards API (`?questions=true`) already describes the form; see `scripts/career/capture-greenhouse-questions.cjs`. The Lever and Ashby posting APIs do the same. Reading the schema from them, cached, would need no browser.
6. **Confirmation ids.** The page's confirmation was recorded for every send, but the id was read only on Ashby's page (1 of 7). The Greenhouse and Lever confirmation texts are not parsed into an id.
7. **The person's own browser (extension, tier a).** Not measured here. It costs us zero compute. It is the cheapest tier for people whose computer is on.

## The design to build toward (coordinator, 2026-11-01), checked against the code

| Design | Today in the code | Gap |
|---|---|---|
| Form schemas from the public board APIs, cached | The browser dry run reads every form (`prepare-runner.ts` → `approve-first.ts prepare`) | Not built. The board readers exist only for discovery (`packages/domain/121-career-jobs.js`) and question capture (`scripts/career/capture-greenhouse-questions.cjs`). |
| Answers deterministic from confirmed facts and an answer bank, asked once | Built: 21 questions for 12 applications, no question twice, 0 model calls | Ashby's per-posting essay ("something you've built") is asked once per posting |
| Model only for genuinely new free text, cheapest model, cached by question | Cover letters only, opt-in (`prepare-ahead.ts --draft-cover-letters`, gpt-5-nano default in `model_gateway.ts`) | No cache by normalized question for essays |
| Tailoring per role cluster | Per posting (`career_tailor.ts`) | Not built |
| One batch card, one yes | Built (one tap approved 12, bound to each hash) | The early 1-item card (gap 4 above) |
| Tiers: extension, then cloud, then needs_user | Cloud built and measured here; needs_user for captcha proven; extension person-submits proven on captured forms | Extension submit for Ashby untested (RAMP-APPLY-TRACE) |
