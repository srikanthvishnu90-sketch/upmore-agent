# WO-037 labeled set: public-only re-collection plan (SERIAL-1540, 2026-10-26)

Status: a plan, not run. Nothing here spends money, opens an account, logs in anywhere or writes to a live system.

## Why
The 200-row labeled set (`evals/career/alert-labels/candidates.json`) was collected on 2026-10-20 under the alert gate of
that day. SERIAL-1530 changed the gate: a remote posting limited to a country is screened against the persona's stated
location and held when none is on record. Read by today's gate, 15 of the 200 rows change answer and the per-persona
quota (gate_pass 8, each near miss 3) is short for P01, P07, P08, P09 (added by the change) and P04, P05, P06 (short at
collection). The re-read file (`candidates.reread-2026-10-26.json`) records this; it is not a measurement.

## What is read, and from where
- Only what the product's own ingest already reads: the public JSON feeds of the boards in
  `packages/career-data/board-directory.json` (Greenhouse, Lever, Ashby, SmartRecruiters job-board endpoints), through
  `boardFetchFeed` in `supabase/functions/_shared/career_ingest.ts`, with the collector's own user agent string and a
  20-second timeout. These endpoints need no account, no token and no login; they are the same reads the scheduled ingest
  makes. No LinkedIn, no Indeed, no scraping of a site that is not a board's own public feed (owner rule).
- The collector is `evals/career/alert-labels/collect-pool.ts`, unchanged in what it reads. It runs where it already runs
  in CI (`.github/workflows/board-discovery.yml`, job `label-pool`) or on the owner's machine; this sandbox blocks the
  hosts, so it was not run here.

## What changes before the run
1. Personas: each persona states a location where its description implies one, as a persona attribute the gate reads
   (an `interests[].home` the same way a real person's stated location rides the bridge). P02 New York, P03 SF Bay Area,
   P04 Texas, P05 Chicago, P10 Seattle follow from their descriptions; P01 and P06 ("anywhere in the US") state a US
   city the owner picks; P07 and P09 ("remote only") either state a location or stay location-less on purpose, in
   which case their gate_pass quota must come from open remote postings only (a country-limited one is held for them,
   by rule). The owner decides which; the file says which was chosen and why. No persona is given an attribute its
   description does not support.
2. Strata: `label_set.ts` already classes a held country-limited remote posting as a place near miss (SERIAL-1530).
   The quota stays 8 / 3 / 3 / 3 / 3 per persona; a persona whose boards cannot fill a stratum is reported short, not
   padded from another stratum silently (the builder's fill-from-others step is kept but the written strata table
   shows the fill).
3. Versioning: the run writes `candidates.<date>.json` beside the original; the original and its re-read stay as they
   are. `labels.human.json` (empty today) and `labels.assumed.json` are keyed by row id and belong to the set they were
   written against; a new set starts with an empty human file.

## The run
- `deno run -A evals/career/alert-labels/collect-pool.ts --out-dir label-pool-out` (CI or the owner's machine; reads only).
- Output: the new candidates file, the strata table per persona, boards read / failed, postings seen — the same fields
  the 2026-10-20 run wrote. Descriptions clipped to 3,000 characters as before.
- Cost: network reads of public feeds only (the 2026-10-20 run read 2,170 boards, 166,193 postings, 9 failures). No
  provider fee, no API key, no database write, no message to anyone.

## What the set is for, and what it is not
It is the candidate pool for a HUMAN to label (`scripts/career/label-alerts.ts`); precision is scored only over rows a
person labeled (`evals/career/alert-precision.ts`, NOT_RUN until then). Neither the original, the re-read nor a fresh
collection is a quality claim by itself.

## Owner decisions
- Whether to run the collection (CI job or local), and when.
- The stated location per persona (item 1), or none for the remote-only personas.
- Who labels, and the labeling rubric to use (the assumed file carries a proposed one, marked ASSUMED).
