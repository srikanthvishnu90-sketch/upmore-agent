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
