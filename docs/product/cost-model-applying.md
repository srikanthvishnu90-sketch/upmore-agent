# What one application costs: Trainee vs Tsenta (cost model, STANDARD Test C)

2026-10-19. Unit prices are from vendor pages as indexed by search on 2026-10-19 (pages could not be opened live from
this environment: WebFetch ENOTFOUND, proxy 403); each is labelled. Everything computed from them is ASSUMED
arithmetic, with the assumption written next to it. Raw research: the architect's notes, sources inline below.

## Unit prices (sourced)
| Item | Price | Source | Status |
|---|---|---|---|
| gpt-5-mini | $0.25 in / $0.025 cached / $2.00 out per 1M tokens | developers.openai.com/api/docs/models/gpt-5-mini | VERIFIED (indexed) |
| gpt-5-nano | $0.05 / $0.005 / $0.40 per 1M | developers.openai.com/api/docs/models/gpt-5-nano | VERIFIED (indexed); both models shown "Deprecated" in a snippet: UNVERIFIED, a model-change risk |
| OpenAI Batch | 50% off, within 24 h | developers.openai.com/api/docs/guides/batch | VERIFIED (indexed) |
| Server browser | $0.10-0.12 per browser-hour, per-minute billing | docs.browserbase.com/account/billing/plans; docs.hyperbrowser.ai/reference/pricing | VERIFIED (indexed) |
| Residential proxy | $8/GB pay-as-you-go, ~$3.50/GB at volume | brightdata.com/pricing/proxy-network/residential-proxies | VERIFIED (indexed; promos change) |
| Supabase Pro | $25/month per org; disk $0.125/GB-month past 8 GB | supabase.com/docs/guides/platform/... | VERIFIED (indexed) |
| LoopMessage | $59.99/month per sender (300 active contacts a day), $99.99 (1,000 a day) | loopmessage.com/pricing | VERIFIED (indexed) |
| Tsenta consumer | $19/600, $39/1,500, $99/4,500 applications per 30 days ($0.022-0.032 each) | tsenta.com/pricing | VERIFIED (indexed) |
| Tsenta API | $0.09 per submitted application, failures not charged | tsenta.com/developers | VERIFIED (indexed) |
| Tsenta runs applications in its own cloud | "continue running even after you close your browser tab" | Chrome Web Store listing | VERIFIED (indexed) |

## Cost of one submitted application (ASSUMED arithmetic)
Assumptions: 5 minutes of browser per application; 3-5 MB through a residential proxy when a server browser is used;
the question map (WO-020) asks the model about ~2 unanswered questions per posting (today's median left is 2-3), 1,500
tokens in and 200 out each, cached by the question's wording across all users; an essay on 24% of postings (3,000 in,
600 out); one job-description read per posting (4,000 in, 500 out), shared by everyone applying to that posting.

| Part | Tsenta (its own cloud, per user) | Trainee, in the person's own browser | Trainee, server browser (paid tier) |
|---|---|---|---|
| Browser time | ~$0.008 | $0 | ~$0.008 |
| Residential proxy | $0.024-0.04 if used (UNVERIFIED whether Tsenta uses one) | $0 (the person's own connection) | $0.012-0.04 |
| Model: question mapping | not public | ~$0.0016 (2 x (1,500 x $0.25 + 200 x $2.00) per 1M), falling toward $0 as the shared cache fills | same |
| Model: essay (24% of postings) | not public | ~$0.0005 (0.24 x (3,000 x $0.25 + 600 x $2.00) per 1M) | same |
| Model: posting read | not public | ~$0.002 per posting (4,000 x $0.25 + 500 x $2.00 per 1M), divided by everyone who applies to it | same |
| **Total** | **~$0.01-0.05 (estimate)** | **~$0.004, falling with scale** | **~$0.025-0.05** |

Tsenta sells at $0.022-0.032 per application on its plans and $0.09 on its API, so its margin per application is thin
on the consumer plans. That is the opening.

## Where the competitor has to subsidize (the efficiency attack)
1. **Run in the person's browser.** Our cost per application (~$0.004) is about a tenth of a server-browser model (~$0.025-0.05) and needs no
   proxy, and the person's own connection is not a datacenter address. Tsenta's product promise (it keeps applying
   after you close the tab) is built on its own cloud. To match a free tier it pays browser time on every application.
2. **Shared, compounding caches.** The question-meaning map and the posting read are paid once and reused by every
   user, so our model cost per application falls as we grow. A per-user tailoring pipeline does not get cheaper.
3. **Price the outcome, not the application.** With applications nearly free to us, they can be free to the person up
   to the 15-a-day cap, and the paid plan can sell what Tsenta does not do (interview prep from the submitted resume,
   offers, warm paths). To copy free applications a cloud-browser competitor pays for every one of them.
4. **Better applications, measured per person (corrected 2026-10-19).** Huntr's Q1 2026 data: people sending 11-20
   applications interviewed at 9.25% per application, against 2.58% for 100+ (VERIFIED-S search extract;
   huntr.co/research/job-search-trends-q1-2026). Huntr itself says this does not show the effect of sending fewer
   applications. Per person, the high-volume group still had more interviews (about 1.4 vs 3.9 a quarter, ASSUMED from
   bucket midpoints; `docs/competitors/huntr.md`). The earlier claim here, "a 3-4x higher interview rate is a 3-4x lower
   cost per interview", treated a correlation as an effect and is withdrawn. Tailored resumes: 5.71% vs 3.09% (Q2 2026,
   1.85x, association, 13,037 tailored resumes linked to applications). What we may say: interviews per person and per
   verified submission are the numbers we optimise and measure on our own users, from the first real run. Not before.

## At 100 / 1,000 / 10,000 / 100,000 users (ASSUMED: 5 applications per user per day, in-browser path)
| Users | Applications a month | Model | Database | Messaging (iMessage lines) | Total a month | Per user |
|---|---|---|---|---|---|---|
| 100 | 15,000 | ~$60 ($0.004 each) | $25 | $60 (1 line) | ~$145 | ~$1.45 |
| 1,000 | 150,000 | ~$525 (~$0.0035 each, cache share rising) | ~$50 | $100 (1 line, 1,000 contacts a day) | ~$675 | ~$0.68 |
| 10,000 | 1.5M | ~$3,750 (~$0.0025 each) | ~$200 | ~$1,000 (10 lines) | ~$4,950 | ~$0.50 |
| 100,000 | 15M | ~$22,500 (~$0.0015 each) | ~$1,500 | ~$10,000 (100 lines) | ~$34,000 | ~$0.34 |

The server-browser path at 100,000 users and the same volume would add about $0.03 per application (~$450,000 a
month): it is a paid-tier option, never the default. Not yet counted: inbox reading (Gmail and Graph show quotas, no
per-call price: UNVERIFIED as free), interview practice (model cost per session), support. The numbers are a model
until the first 1,000 real applications measure them; the cost per submitted application is logged per run from day
one (STANDARD Stage 8, gate 4).
