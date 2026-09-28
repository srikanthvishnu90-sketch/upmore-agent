# Upmore Agent Program

The doing layer. Upmore's agent finds, prepares and **completes** money tasks end to end — cancelling, paying, claiming, investing — on licensed partner rails, under limits the user sets.

ChatGPT Finances connects accounts for analysis. Upmore connects accounts to **act**.

## What's here

- `SPEC.md` — the full agent capabilities spec (permission tiers T0–T4, capability map, ~260-capability catalog, execution methods, partners & licensing, build order, the 10x test, the never list). The source of truth.
- `BUILD_PLAN.md` — the build order translated into engineering waves with honest speed estimates, what each wave needs from Vishnu, and what gates it.
- `LOOP.md` — the engineering loop design (written when Vishnu says ready): how Claude Code works through the plan task by task, definition of done, and where human taps are required.

## Relationship to the app repo

The app itself lives in `srikanthvishnu90-sketch/Upmore` (single-file web app, Supabase backend). This repo is the program around it: the spec, the plan, and the loop that builds it. Code changes land in the app repo; this repo tracks what gets built and in what order.

## The one architectural rule

**Upmore never becomes the bank, the broker, or the adviser. It drives the companies that already are.** Money never sits in an Upmore account. Every rail that moves money belongs to a licensed partner.

## Status

- [ ] Repo created on GitHub (needs Vishnu — see below)
- [ ] Wave 0: foundation (tiers, ledger, Stop everything, module extraction)
- [ ] Wave 1: data spine + proactive loop
- [ ] Wave 2: cancel agent live
- [ ] 10x test vs ChatGPT Finances

## Creating the GitHub repo

Muse's GitHub access can't create repos (token lacks the scope). Create it in ~30 seconds:

1. Go to https://github.com/new
2. Name: `upmore-agent`, visibility: **Private**
3. Don't initialize with anything (no README — this repo has one)
4. Tell Muse "repo's up" and everything here gets pushed
