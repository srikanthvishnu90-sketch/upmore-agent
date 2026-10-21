# Cost per user — O5 unit economics (2026-10-21)

Owner question: what does one real application, and one active user at the 15/day cap, actually cost on the cloud-worker path — with real numbers, not the estimate given earlier today.

**Labels.** Every figure is **MEASURED** (a lane ran it), **ESTIMATE** (derived or assumed, range/source stated), or **NOT_COUNTED** (excluded by design, reason stated). Inputs live in `cost-model-inputs.json`; `refresh-cost-model.cjs` (node, no network) recomputes every table below from that file. When a better measurement lands, change the input, re-run, update this doc in the same commit.

**Correction to this morning's answer, stated plainly:** the 6,000–11,000 tokens-per-application figure quoted earlier was an estimate built on the assumption that prepare/fill call a model. Measured against the code, they do not — the composition's token count is **0**. The only model leg anywhere near an application is the optional essay-draft (below), at ~$0.0003 per drafted answer. The dominant cost is browser drive time, and it is not close.

## 1. Which legs call a model — the audit

Method: full-text + require-graph audit of the apply composition the bench-50 harness runs unmodified (the same composition the live worker runs), plus a dynamic tripwire run.

| Leg | Code | Model calls |
|---|---|---|
| Discovery (postings feed) | 121 feed fetchers + `production-sources.cjs` postingsFor over the KB | **0 — MEASURED.** HTTP to ATS public APIs only. |
| Screening (knockouts, eligibility, current-employer) | 121 rules + 132 `checkCurrentEmployer` | **0 — MEASURED.** Regex/rule engine. |
| Tailor (per posting) | 123 `tailorResume` (called at 155:223–228) | **0 — MEASURED.** Parse JD → select confirmed facts → assemble bullets, every line carrying fact IDs; truth audit is a hard gate in code. |
| Render (PDF/DOCX) | 148 via 123 | **0 — MEASURED.** Hand-built local PDF 1.4 / OOXML pipeline, no dependencies. |
| Form answers | 149 `ANSWER_KEY_SOURCES` (149:186–255) | **0 — MEASURED.** Each field maps to a stored fact-bank value. An uncovered question is a named stop (`UNCOVERED_QUESTION`), never a model fallback. |
| Fill / drive | 149 `runApply` + 150 board helper | **0 — MEASURED.** Browser automation; no model in the loop. |
| Approval | 155 `approveRun` (card-hash re-verification + mint) | **0 — MEASURED.** Cryptography and bookkeeping. |

Static proof: no model-provider endpoint, API-key read, or model client exists anywhere in `packages/domain/` or `workers/career-browser/` (the only "openai" strings in the tree are a company name in a board list). Dynamic proof: a full bench-50 run (50 postings, greenhouse, mode full) under a fetch tripwire that rejects any non-injected fetch completed with **0 external fetch attempts** — 50 prepared+approved, 5 submitted (cap-bound), exactly as the harness reports without the tripwire.

**The one model leg (not in the composition):** written-answer drafting, WO-030 — `supabase/functions/_shared/essay_draft.ts`, `draftEssay()`, the model invoked only through the injected `deps.model` (essay_draft.ts:250), wired at `career_apply_questions.ts:334`, through the model gateway (`model_gateway.ts:21` → OpenAI chat completions, default `gpt-5-nano`). Facts:

- It fires **only** when a posting carries an open-ended written question **and** the user elects a draft ("draft 2"). It is never automatic per application.
- Retry loop is hard-capped in code: `for (tries = 1; tries <= 2; tries++)` — **at most 2 calls per drafted answer** (MEASURED, code).
- The employer's own AI policy gates it first: a form that forbids AI-written answers is never drafted for.
- It is **WO-line code — not on the deployed v248 line** (cea914fe). On today's deployed product, per-application token spend is $0 by absence as well as by design. It ships with the O5 merge.
- Per-draft token counts are **ESTIMATE** (no paid call was run; the budget ledger stays $0): payload is the question + the relevant confirmed facts, answer capped in code at `HARD_CHARS = 2000` chars. Estimate: 1,000–2,500 input tokens/call, 150–500 output tokens/call, 1.5 calls expected per draft → **~$0.0003 per drafted answer** at the repo's recorded gpt-5-nano prices ($0.05/1M in, $0.40/1M out — `model_gateway.ts` PRICES, third-party tables 2026-10-11; the file itself flags these as estimates until reconciled with the provider bill).
- The metering hook that turns this estimate into a measurement is specified in `metering-hook-spec-2026-10-21.md`. Most of the machinery already exists (gateway usage parsing + `agent_model_calls` reserve/record); the missing piece is a leg/job tag.

Also present in the product, **NOT_COUNTED** per application: chat-turn model spend (metered per turn in production via `model_calls.ts`; a turn serves many tasks, so per-application attribution needs the hook) and the proactive mail second pass (`career_mail_model.ts`; a mailbox feature, not an application leg).

## 2. Inputs

| Input | Value | Label | Source |
|---|---|---|---|
| Drive time | 164 s per drive | MEASURED | Throughput lane solo doorstep drives, production assembly, Gusto Greenhouse form: 163.3 / 157.4 / 170.7 s. Doorstep only — the live submit leg is NOT_RUN, so final submit seconds are excluded (they add seconds, not minutes, on the sandbox evidence). |
| Drives per application | 2 today; 1 with session reuse | MEASURED | 155's session map is per-process; the approve drain re-drives every posting from scratch. Reuse is the O5 fix, hence the scenario column everywhere below. |
| Host price | $30/mo per always-on worker host (2 vCPU / 8 GB class) → $0.0411 per drive-hour | ESTIMATE | Anchors checked 2026-10-21: Hetzner CX33-class 4 vCPU/8 GB €8.49/mo + €0.50 IPv4 (EU); DigitalOcean 4 vCPU/8 GB $48/mo. $30 sits between. (Today's worker runs on the Muse VM at $0 incremental; $30 is the dedicated-host planning price.) |
| Host concurrency | 1 drive at a time | MEASURED | Board service is one process, synchronous `handle()`: during a drive, an authenticated no-op probe hit p99/max 27.9 s vs 23–39 ms idle. K-parallel boards (O5 M3) change wall time and host count, not cost per application — drive-seconds are conserved. |
| Non-drive compute | 6 s per 50-batch (0.12 s/application) | MEASURED | Throughput lane test-world full cycle on the live shelf: prepare drain 5.6–5.8 s + approve drain 17–25 ms. (In-process synthetic run today: 0.65 s of leg 1–3 CPU; the 6 s live-shelf figure is the conservative one used.) |
| Supabase | — | NOT_COUNTED | Flat project plan; no per-application metering exists and writes are not priced per call on the plan. |
| Egress | — | NOT_COUNTED | The egress proxy/relay is unmetered today; per-drive page traffic has never been measured. |

## 3. Cost per application

| Scenario | Drive | Non-drive | Essay (if drafted) | **Total** |
|---|---|---|---|---|
| Headline — today's architecture (×2 drives, 328 drive-seconds) | $0.0037 | <$0.0001 | $0.0003 | **$0.0041** ($0.0037 with no drafted answer) |
| With session reuse (×1 drive, 164 drive-seconds) | $0.0019 | <$0.0001 | $0.0003 | **$0.0022** ($0.0019 with no drafted answer) |

Drive time is ≥90% of the marginal cost in every scenario. The two levers, in order: session reuse (halves it — an architecture fix already scoped in O5) and per-fill time (fills measured at 16–28 s each inside the 164 s drive; the fill-profiling work in O5 M3 attacks the same term again).

## 4. Cost per active user per month — at the 15/day cap

Cap = 15/day × 30 days = **450 applications/month at 100%**. "Marginal" assumes drive lanes pack perfectly; the "provisioned view" is an ESTIMATE scenario at 25% lane packing (drives cluster in waking hours — a serial lane cannot be packed 24/7), which multiplies the drive leg by 4.

| Utilization | Applications/mo | Marginal, headline | Marginal, session-reuse | Provisioned view (headline) |
|---|---|---|---|---|
| 10% | 45 | $0.18 | $0.10 | $0.69 |
| 30% | 135 | $0.55 | $0.30 | $2.07 |
| 100% | 450 | **$1.83** | **$0.99** | **$6.89** |

Per 1,000 active users at 100% of cap: 450,000 applications/month → **$1,832 marginal / $6,889 provisioned-view**; drive load 41,000 host-hours = 57 hosts perfectly packed, ~225 hosts at 25% packing (2 vCPU class). That host count — not unit cost — is the scale problem, and it is exactly what O5's K-parallel + bigger-host milestone addresses.

## 5. Head-to-head — Tsenta Starter (PUBLIC)

Source: `~/workspace/your_files/competitor-baseline-2026-10-21.md` (Tsenta's own pricing + AI-disclosure pages, opened 2026-10-21): **Starter $19/month for 600 applications per 30-day cycle**; Tsenta's own stated per-application cost at Starter is ~$0.03/app ($19/600 = $0.0317).

| | Per application | At 450 apps/mo (our cap) | At 600 apps/mo (their allowance) |
|---|---|---|---|
| Tsenta Starter (price to the user) | $0.0317 | $19 (flat, includes 600) | $19 |
| Trainee marginal cost, headline | $0.0041 | $1.83 | $2.44 |
| Trainee marginal cost, session-reuse | $0.0022 | $0.99 | $1.32 |
| Trainee provisioned view, headline | $0.0153 | $6.89 | $9.19 |

Tsenta's per-application **price** is 7.8× our headline marginal **cost** (14.4× the session-reuse cost), and even the pessimistic provisioned view at a full-cap user ($6.89/mo) sits at ~36% of Tsenta's $19 price. The 15/day cap is therefore not a cost necessity: at these unit costs, raising volume is a quality/abuse decision, not an economics one. (Comparison is price-vs-cost, stated as such — Tsenta's internal cost is not public.)

## 6. What would change these numbers

- **Session reuse lands** → headline becomes the reuse column (−46% per application).
- **Fill-time profiling (O5 M3)** → every 2× cut in the 164 s drive is another ~2× on the dominant leg.
- **Host price** → at the Hetzner EU anchor ($10/mo) the headline total falls to ~$0.0016/app; at the DigitalOcean anchor ($48/mo) it rises to ~$0.0063/app. The conclusion vs Tsenta survives the whole range.
- **Live submit leg** (NOT_RUN today) → adds its measured seconds to the drive input when the throughput lane can run it.
- **Token metering hook lands** → the essay ESTIMATE is replaced by per-application MEASURED token cost from `agent_model_calls`, and the refresh script reads it directly.
