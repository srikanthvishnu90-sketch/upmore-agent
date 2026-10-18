# Unit costs (architect estimate, 2026-10-18; third-party price pages, confirm on the vendors' own pages before signing up)

| Item | Price found | Per-unit estimate | Source |
|---|---|---|---|
| Brain model, `gpt-5-mini` | $0.25 / M input, $2.00 / M output (aggregators, Sep 2026). Newer minis (gpt-5.4-mini) list $0.75 / $4.50. | One text turn ≈ 2–3 model calls ≈ 8k input + 600 output tokens ≈ **$0.003** (gpt-5-mini) to **$0.009** (gpt-5.4-mini). 100 turns per active user per month ≈ **$0.30–$0.90**. | anotherwrapper.com/llm-pricing/gpt-5-mini-2025-08-07; morphllm.com/openai-api-pricing |
| Judge for evals | same model | 50 items ≈ $0.10 per full run | — |
| Hosted browser, Browserbase | Developer $20/mo (~100 browser-hours incl., then ~$0.12/h); Startup $99/mo | One application drive ≈ 3–5 min ≈ **$0.01** | capterra.com/p/10050160/Browserbase/pricing; tinyfish.ai/blog/browserbase-pricing |
| Texting, LoopMessage | Sandbox free (5 contacts); Light $59.99/mo (300 daily contacts); ~$99.99 tier (1,000 daily contacts); cold messaging prohibited | Fine for testing and the first cohort; **does not scale to millions** — a later order adds Apple Messages for Business and SMS (Twilio, A2P 10DLC) | getapp.com/marketing-software/a/loopmessage; blooio.com/blog/best-imessage-api-2026 |
| Job data | Public ATS boards: free | Function run time only | — |

Bottom line: the model costs well under $1 per active user per month; applying costs about a cent per application; texting is the
cost and scale constraint, not intelligence.

## Applying at scale (2026-10-18)
Assume a drive takes ~4 browser-minutes and 2M people average 3 applications a week (~26M a month, ~1.7M browser-hours).
| Option | Rate | Per application | 26M a month |
|---|---|---|---|
| Browserbase Startup/Developer overage | $0.10–$0.12 per browser-hour; Scale tier "custom" | ~$0.007–$0.008 | ~$170k–$210k |
| Self-hosted (4 vCPU / 8 GB VM, ~€11/month, ~6 concurrent browsers ≈ 4,300 browser-hours/month) | ~$0.003 per browser-hour | ~$0.0002 | ~$5k (≈400 VMs) plus operations |
| Residential proxies (not used) | ~$1–5 per GB, ~3–5 MB per drive | ~$0.01 | would erase the saving |
The binding constraint is not compute: it is fill reliability, captcha / emailed-code checks (Greenhouse scores every form with
reCAPTCHA and may ask for an emailed code; employers set the strictness) and proof of submission.
Sources: docs.browserbase.com/guides/plans-and-pricing; vpsbenchmarks.com/hosters/hetzner/plans/cpx31 and bitdoze.com (Hetzner 2026
repricing, CPX32 €10.99); support.greenhouse.io/hc/en-us/articles/115005448066.
