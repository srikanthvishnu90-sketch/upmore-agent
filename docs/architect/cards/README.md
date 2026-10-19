# Task cards: how the architect hands Codex one exact job

Owner, 2026-10-19: Codex works best when it is guided almost exactly. A work order says *what* and *why*; a task card
says exactly *how*, so nothing is left to interpret. Cards override the work order where they are more specific.

## What every card contains
1. **Base**: the branch to start from and the command to bring it up to date.
2. **Files**: the only files the card may change. Anything else: stop and write `BLOCKED: <file> because <one line>`.
3. **Steps**: numbered, in order, with the code to write when the architect already knows it.
4. **Proof**: the exact commands to run and the exact lines of output to paste (pass counts, pinned tables).
5. **Commit and PR**: the commit message and the PR title, verbatim.
6. **Done**: one sentence that is either true or false.

## Rules while working a card
- Work the lowest-numbered card marked `ready` in this folder's table. One card at a time, to `Done`.
- Every card is completable with no network, no API key and no private file. Anything that needs the internet runs in
  CI or is done by the architect; anything that needs the owner is the owner's.
- Never wait silently. If a step cannot be done, push what is done, open the PR with `BLOCKED: <one line>` at the top,
  and start the next ready card. The architect answers in the PR or in a new card, the same day.
- Never edit a test the card does not list, never weaken one, never edit an architect test (`tests/architect/`).
- Chromium will not start as root: run browser tests as a normal user (CI is not root, so CI is the referee).
- Before you start: `git fetch origin && git merge origin/trunk` on your branch. If trunk is red on a test the card does
  not touch, say so in the PR in one line and carry on; the architect fixes trunk.

## Cards

| Card | Status | What | Unblocks |
|---|---|---|---|
| [C-01](C-01-150-precision.md) | ready | Module 150 never puts the person's contact facts into a question that is not asking for them | the 009b-3 acceptance PR |
| [C-02](C-02-apply-cli-pr.md) | ready (after C-01) | The apply command and the queue as one reviewable PR into trunk | the owner's first real application |
