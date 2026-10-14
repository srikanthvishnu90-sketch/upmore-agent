# Alert watch — the standing loop (G1, BUG-090)

**What exists now (code):** `packages/domain/151-career-alert-watch.js` — the watch
cycle as product code at harness/host tier. One `runWatchCycle({ feeds?, fetch,
profile, store, sink, now, snapshotKey?, boardDeadlineMs?, watchedFamilies?,
alertOnSeed? })` call:

1. loads the prior snapshot/seen-set from the injected store (121's KV contract),
2. calls 121's real `poll()` (fetch → dedupe → `diffNew` against the stored snapshot;
   poll persists the new snapshot itself),
3. gates each genuinely-new posting (G6): `seniority_band ∈ {intern, new_grad}` AND
   `role_family` in the profile's watched families AND 121 `scoreFit` does not
   hard-exclude it,
4. composes a typed alert record — `{ type: "career_job_alert", job_id, company,
   title, url, location, role_family, seniority_band, source, posted_at, detected_at,
   latency_seconds, fit_lines, matched_fact_ids, fit }`, where fit lines are sourced
   only from the profile's **proven** facts, each citing its fact ID — and hands it to
   the injected sink,
5. counts removals silently (a closed posting never alerts; a mass-close-suspect
   cycle counts none),
6. returns a typed cycle result `{ type, status, seeded, snapshot_key, detected_at,
   polled, feeds_polled, new_seen, alerts_emitted, alerts, gated_out, gated, removed,
   errors[], source_health, mass_close_suspect }`. A failing board appears in
   `errors[]` by name and degrades that board only.

**Seeding:** the first cycle against an empty store establishes the baseline and
alerts on nothing (`seeded: true`) — those postings are new to us, not new to the
world. `alertOnSeed: true` overrides.

**G7 deadline:** the watch wraps the injected fetch in a per-board wall-clock
deadline (default 100 s, `boardDeadlineMs`) — a drip-feeding board is cut off and
named in `errors[]` instead of holding the cycle hostage.

**Guard:** `tests/career-alert-watch.test.cjs` (10 tests) drives 121's real code
path over fixture Greenhouse/Lever feeds via its `opts.fetch` seam — new-posting
alert + latency math, G6 senior/manager + cross-family + hard-excluded rejections,
no duplicates on a repeat cycle, silent removals, per-board failure, G7 deadline.

**Host-tier runner:** `scripts/career/alert-watch-runner.mjs` wires real fetch +
a file-backed store + a JSONL recording sink so the cycle runs end-to-end outside
the edge host. It runs ONE cycle per invocation.

## How the deployed host schedules it (NOT built here)

- **Cadence:** 121's `POLL_MINUTES` is the product's chosen cadence — **starred
  companies every 15 minutes, all others every 60**. The host scheduler (cron,
  systemd timer, or the edge host's scheduled trigger — owner's/host's choice)
  invokes one cycle per user per interval: two feed sets per user (starred boards
  on the 15-minute tick, the rest hourly), one snapshot key per user.
- **Worst-case alert latency** is therefore ~15 min (starred) / ~60 min (default)
  after a posting goes live, plus one cycle's fetch time. The public ATS APIs offer
  no webhook/push, so polling is the mechanism.
- **Delivery channel:** the sink is injected. The runner records to JSONL; the
  deployed host must wire the sink to the product's delivery path (the 142 alert
  branch / chat surface) — that wiring, the scheduler itself, and any deploy are
  host-side work, deliberately not in module 151.
- **Bundle note:** 151 is a new domain module; it joins the router bundle at the
  coordinator's central rebuild (`scripts/build-router-core.py`), not in this change.
