# Upmore Agent Program — the full app + the doing layer

The doing layer. Upmore's agent finds, prepares and **completes** money tasks end to end — cancelling, paying, claiming, investing — on licensed partner rails, under limits the user sets.

ChatGPT Finances connects accounts for analysis. Upmore connects accounts to **act**.

This repo is self-contained: the **complete current app** (every feature, the full agentic layer) plus the program docs (spec, build plan, loop, Claude Code prompt). Clone this one repo and build.

## What's here

**The app (production code):**
- `src/upmore-app-template.html` — the app. Edit this, never `index.html`.
- `src/build-app.py` — regenerates `index.html` + `sw.js` from the template. Run after every template change, commit the generated files too.
- `supabase/functions/` — the agentic layer: `agent-exec` (Browserbase CDP driver, OTP handoff, atomic approval claims, verified-playbook gate, merchant catalog), `agent-chat`, `exec-vault-store` (encrypted credential vault), `plaid`, `simplefin-*`, `stripe-*`.
- `tests/agent100/` — the Agent100 harness. Dry run must stay 103/103.
- `plans/cancel-agent/` — cancel agent architecture, compliance diff, build plan.
- `index.html`, `sw.js`, `vercel.json`, `manifest.webmanifest`, `icons/`, `fonts/`, `img/` — the deployed PWA.
- `UPMORE-APP-README.md` — the app's own readme.

**The program (what to build and in what order):**
- `SPEC.md` — the full agent capabilities spec (permission tiers T0–T4, ~260-capability catalog, execution methods, partners & licensing, build order, the 10x test, the never list). The source of truth.
- `BUILD_PLAN.md` — the build order as engineering waves with honest speed estimates, what each wave needs from Vishnu, and what gates it.
- `LOOP.md` — the engineering loop design: how Claude Code works through the plan task by task, definition of done, where human taps are required.
- `PROMPT.md` — the master prompt. Paste into Claude Code to start the Oct 1 v1 build.

**Deliberately excluded:** `qa/` (64MB of screenshots/scratch), `tests/agent100/results/` (run logs), `research/` (old notes). Nothing Claude Code needs to build is missing.

## Relationship to the Upmore app repo

Production deploys from `srikanthvishnu90-sketch/Upmore` (Vercel). Until Vishnu says otherwise: build here, then sync the changed files back to the Upmore repo for deploy. Paths mirror the app repo 1:1, so sync is a straight copy.

## The one architectural rule

**Upmore never becomes the bank, the broker, or the adviser. It drives the companies that already are.** Money never sits in an Upmore account. Every rail that moves money belongs to a licensed partner.

## Status

- [x] Repo created on GitHub (private)
- [x] Full app + agentic layer mirrored in
- [ ] Wave 0: foundation (tiers, ledger, Stop everything, module extraction)
- [ ] Wave 1: data spine + proactive loop
- [ ] Wave 2: cancel agent live
- [ ] 10x test vs ChatGPT Finances
