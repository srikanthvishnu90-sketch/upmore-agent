# CLAUDE CODE — MASTER PROMPT (Upmore agent v1, Oct 1 target)

Paste everything below the line into Claude Code. Run it with both repos cloned.

---

You are building the doing layer of **Upmore** ("your all-in-one finance agent") — the part where the app stops just showing money and starts acting on it: cancelling subscriptions, disputing charges, finding unclaimed money, paying bills. ChatGPT Finances is read-only analysis. Upmore acts. That difference is the entire product.

## The two repos

1. **App repo** (the code you change): `srikanthvishnu90-sketch/Upmore`
   Clone it, work on `main`, push small commits often, `git pull` before starting work.
2. **Program repo** (the source of truth — spec, plan, this prompt): `srikanthvishnu90-sketch/upmore-agent`
   Read `SPEC.md` (the full capability spec, ~260 capabilities, permission tiers T0–T4, the never list) and `BUILD_PLAN.md` (waves + speed estimates) before writing any code. When the spec and your instincts disagree, the spec wins. When the spec and Vishnu disagree, Vishnu wins.

## Build system — read this twice

- `python3 src/build-app.py` **regenerates** `index.html` + `sw.js` from `src/upmore-app-template.html`. **Never edit `index.html` directly** — your edits get wiped on the next build. Always edit the template, then rebuild, then commit all generated files.
- After every build: `git status` and commit the template + generated files together.
- Push to `main`. Vercel auto-deploys. Production URL: `https://upmore-srikanthvishnu90-sketchs-projects.vercel.app/`

## What "v1 by Oct 1" means — build in this order, no skipping

0. **Module extraction (do first).** The template is one ~11,000-line file; two agents can't work in it concurrently. Split the JS into `src/modules/*` concatenated by the existing build script. Behavior must not change. Verify with the existing Agent100 dry run (`tests/agent100/`, must stay 103/103).
1. **Permission tiers (T0–T4).** Per-capability tier setting, per-action dollar cap (default $25 for T3), monthly autonomous cap (default $200), bill match tolerance (10%), quiet hours (22:00–07:00 local), merchant allow/block lists. Supabase tables + Settings UI. Every capability starts at T2. Nothing reaches T3 until the user enables it for that capability.
2. **Action ledger.** Every action at any tier writes one immutable record: what, when, rail, partner, amount, triggering evidence, tier, approver, outcome. Plain feed in Profile. This is the audit file — treat it as load-bearing as the feature itself.
3. **Stop everything.** One tap in Profile: every capability to T0, revoke partner tokens, kill in-flight browser sessions, cancel scheduled actions, one confirmation screen. Must work in under five seconds.
4. **Cancel agent live (top 10 merchants by user value first, not all 67).** The execution stack is ~80% built: `supabase/functions/agent-exec` (Browserbase CDP driver, OTP handoff, atomic approval claims, verified-playbook gate), encrypted vault, 67 merchant playbooks (0 verified). Your job: wire the Browserbase env (Vishnu provides the key), run supervised verification per playbook, flip the merchant allowlist past Devin as each playbook passes. A playbook is "verified" only after watched runs succeed end to end.
5. **Proactive loop.** Nightly deterministic monitors over connected accounts (new subscriptions, price rises, trials converting, duplicate charges, low-balance-ahead, deadline windows) → findings become Home cards + Due tab reminders, each with evidence and a **Do this for me** button. T3 items the user pre-approved run automatically and appear in the ledger.
6. **Unclaimed property search loop.** Quarterly search across states lived in + federal sources. Claim prep with documents gathered; **the user signs and submits** (sworn forms stay T2/user-signs forever). Must stay free — "claim this yourself for free" on every screen.

Do NOT build in v1: bill pay execution, sweeps, brokerage/trading, negotiation calls, credit report, insurance reshop, tax filing, managed investing. Those are later waves in BUILD_PLAN.md. If you're tempted, re-read the build order.

## Non-negotiable rules (Vishnu's standing orders — violating these is a failed task)

- **Be very critical and never rush.** A wrong action in the doing layer costs real money and real trust. If something feels shaky, stop and say so instead of shipping it.
- **One explicit approval per cancellation.** Never bundle approvals, never pre-approve. This rule survives everything in the spec — the spec's "T3 cancel" means autonomous *retries within an already-approved attempt*, not approval-free cancels.
- **Phone calls never work.** The spec mentions negotiation calls — do not implement calling. Ever.
- **Never store OTPs, passwords, or identity digits.** OTP is single-use for the current step. Credentials live in the encrypted vault, used only for the approved action, never in logs.
- **Never mark "cancelled" until billing-cycle confirmation** (billing date + 2 days with no charge). On failure: show the failure + the merchant deep link. Never show success that didn't happen.
- **Every number traces to source rows.** Estimates never masquerade as calculations. The model explains numbers; it never produces them — every figure comes from a function over real data.
- **No mock data in prod paths.** Demo figures must never render as the user's money.
- **Unclaimed property stays free and unbundled forever.**
- **No credit-card recommendations, no contests, no affiliate steering** (disclose any affiliate relationship on the card itself; always show the cheapest option even if unpaid).
- **No personalized securities advice.** No stock picks, no "top picks" lists.
- **Upmore never holds user money, never signs under oath for the user, never becomes the bank/broker/adviser.** It drives licensed partners.

## Definition of done (every task, no exceptions)

1. Implements exactly the spec section it claims — no more, no less.
2. `tests/agent100` dry run passes (103/103 or better — never regress it).
3. Production-verified at 390px mobile where UI is involved: no clipping, no horizontal overflow, tab bar never covers content.
4. Numbers traceable to source rows; no invented figures.
5. No new violations of the never list (SPEC.md, "The permanent never list").
6. Action capabilities write to the action ledger.
7. Small commit, pushed to `main`, production deploy confirmed live.

## Working agreement with Muse (the other agent)

- Muse owns: mainline integration, builds/deploys, Agent100, production verification, Supabase/Vercel ops, long-running merchant verification.
- You own: fast local iteration, UI polish loops, isolated implementation spikes.
- Module ownership (from task 0) decides who touches what. Never edit a file another agent has claimed — `git pull` before starting, push when done.
- If you're blocked on something only Vishnu can do (keys, approvals, partner forms, watching a verification run), say exactly what's needed and move to the next unblocked task. Never idle on a gate.

## What "perfect" means here

Vishnu audits everything. He will tap every flow himself, read the ledger, and check that every number traces to a row. Perfect means: the happy path works, the failure paths are honest (plain-language failure + next step, never a fake success), the tiers hold under adversarial use, and the code reads like it was written by someone who knew the next person would read it. When in doubt, choose the boring, verifiable implementation over the clever one.

Start with task 0 (module extraction). Report back when each task meets the definition of done.
