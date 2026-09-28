# Upmore Agent — Build Plan

How fast everything in `SPEC.md` can actually be built, and what gates each step. Estimates assume Claude Code engineering in a loop with Vishnu reviewing and tapping where only he can.

The honest headline: **the spec's day-120 list (the core money-in / money-out / money-managed spine) is ~6 months of engineering, gated mostly by partner approvals, not code.** The full ~260-capability catalog is 12+ months. The 10x test becomes runnable after Wave 3 — that's the first moment "the agent does things" is measurable against ChatGPT Finances.

## Wave 0 — Foundation (week 1)

Buildable today. No partner, no license, no waiting.

- **Module extraction.** The app is one 11,000-line template file; two agents can't work in it concurrently. Split JS into `src/modules/*` concatenated by the existing build script. 2–3 days. This unblocks everything else.
- **Permission tiers (T0–T4).** Per-capability tier settings, dollar caps, monthly autonomous cap, match tolerance, quiet hours, merchant allow/block lists. Supabase tables + Settings UI. 3–4 days.
- **Action ledger.** Every action writes one immutable record (what, when, rail, partner, amount, evidence, tier, approver, outcome). Feed in Profile. 2–3 days.
- **Stop everything.** One tap: all capabilities to T0, revoke partner tokens, cancel scheduled actions, confirm on one screen. 1–2 days.
- **Partner applications kicked off** (Vishnu taps): Alpaca, Visa Intelligent Commerce / Mastercard Agent Pay, Plaid Transfer or bank partner. Diligence takes weeks — starting now is what makes Wave 5 possible on time.

**Needs from Vishnu:** partner application forms, entity paperwork if requested.

## Wave 1 — Data spine + proactive loop (weeks 2–3)

- **Plaid production.** Approval submitted 2026-09-27 (~2–3 business days). Then: install production credentials, verify link-token creation, connect a real account, verify exchange/holdings/refresh/disconnect. 2–3 days after approval lands.
- **Proactive loop.** Nightly deterministic monitors over connected accounts (new subscriptions, price rises, trials converting, duplicate charges, low-balance-ahead, claim matches, deadline windows) → findings become Home cards + Due tab reminders, each with evidence and a Do-this-for-me handoff. ~1 week. No partner needed.

**Needs from Vishnu:** Plaid production approval (waiting), connect one real account.

## Wave 2 — Cancel agent live (weeks 3–6)

The first "wow". No money moves, no license needed. Architecture is ~80% built (agent-exec, Browserbase/CDP path, vault, approval sheet, OTP handoff, guided fallback); 67 merchant playbooks exist, 0 verified.

- **Browserbase API key + project ID** (Vishnu tap, 10 minutes) → flip the merchant allowlist past Devin.
- **Supervised verification runs**, top 10 merchants by user value first — not all 67. Each playbook needs watched runs before it's trusted. This is the long pole: ~2–3 weeks.
- **Confirmation watcher** (billing-date + 2 days, not instant "cancelled"), audit-log UI, one-tap revoke. ~1 week.
- Stop-guards (new terms, payments, plan changes), OTP session TTL, kill the stale "I can't log in" copy.

**Needs from Vishnu:** Browserbase key, watching verification runs, per-cancellation approvals (standing rule: one explicit approval per cancellation).

## Wave 3 — Disputes + fee reversals (weeks 6–8)

Same browser rail as cancel, new playbooks: duplicate-charge disputes (60-day window, file by day 45), bank fee reversals, price adjustments, travel compensation claims. ~2 weeks. **After this wave, run the 10x test** — 10 real tasks through Upmore vs ChatGPT Finances.

## Wave 4 — Unclaimed property loop (weeks 8–9)

Quarterly search across states lived in + federal sources; claim prep with documents gathered; user signs and submits (sworn forms stay T2/user-signs forever). Must stay free, "claim this yourself for free" on every screen. The claim flow already exists in-app. ~1 week.

## Wave 5 — Bill pay (weeks 9–16)

- **UX now (2 weeks):** bill calendar, pre-flight check (balance after payment stays above buffer), T3 rules (recurring payees only, within 10% match tolerance, under cap, never earlier than 3 days before due).
- **Execution when approved:** Visa Intelligent Commerce / Mastercard Agent Pay integration. Applied in Wave 0; realistic approval + integration is 4–12 weeks. Bank-account bills (rent, utilities) via the user's own bank bill pay or licensed partner — never an Upmore account.

**Gate:** partner approval. This is the schedule's biggest variance.

## Wave 6 — Sweeps + debt payments (weeks 14–20)

Same rails as Wave 5, higher trust needed: spare-cash sweeps to the user's own savings ("anything over $500 on payday", never below buffer), extra debt payments on user rules. Gated on the payments partner from Wave 5.

## Wave 7 — Brokerage Layer 2 (weeks 18–26)

"Buy $50 of VOO" — the user names the security and amount; the agent executes via Alpaca (broker of record, handles custody). **Securities lawyer reviews before this ships** — non-negotiable. First trade in any security is T2; recurring investments run T3 inside caps. Never invests money needed for bills; never below buffer.

**Gates:** Alpaca approval (applied Wave 0), lawyer sign-off.

## After that (2–4 weeks each)

Negotiation calls (AI disclosure, all-party consent — Illinois), buy/returns, credit report view (bureau partner, permissible purpose), insurance reshop (licensed quote partner). Each ships after the one before is reliable.

## Later (6+ months, separate company milestone)

**Layer 3 — agent-managed investing** ("invest $500 for me"). That's discretionary advice: requires a registered investment adviser (own Illinois registration or a partner), fiduciary program, disclosures, compliance owner. Do not scope this into the 6-month plan.

## What bounds the speed

1. **Vishnu's taps.** Browserbase key, Plaid approval + real account, partner applications, per-cancellation approvals, watching verification runs. Every one of these is a day-1 item he can do now.
2. **Partner diligence.** 4–12 weeks, mostly waiting. Applied early = waiting in parallel with building.
3. **Playbook verification.** Supervised runs per merchant. Top 10 first; the tail of 67 is a maintenance program, not a launch gate.
4. **Review bandwidth.** A well-scoped loop task (one capability, tests, prod verify) is 0.5–2 days of engineering; throughput is bounded by review, not code generation.

## The 10x test (after Wave 3)

Same accounts through Upmore and ChatGPT Finances. 10 real tasks (cancel, dispute, claim, pay). Measures: tasks actually completed, time from problem to done, accuracy on 100 seeded questions, confirmed dollars recovered in 30 days, deadlines caught, harm (must be zero — one wrong payment/cancellation/trade is stop-ship). A real 10x shows in 10–20 people.
