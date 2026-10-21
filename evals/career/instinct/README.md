# Instinct's verdicts (WO-061, D-030)

Instinct, the owner-appointed independent second judge, re-scores every held-out run. One file per CI run:
`<run id>.json` = `{ "run": "<ci run id>", "items": [{ "id": "H001", "pass": true, "note": "..." }] }`.
`deno run -A evals/career/both-pass.ts evals/career/results/heldout-agent-<run>.json evals/career/instinct/<run>.json`
appends the both-pass line to SCORE-LOG.md: an item passes only when gpt-5-mini and Instinct both pass it; an item
Instinct has not scored is not a pass. The builder never writes these files.

Run 39538248995 (brain 111d0542), as the owner reported it: Instinct 24/38, gpt-5-mini 26/38, both-pass 22/38 (58%).
Per-item verdicts for that run are not in the repo.
