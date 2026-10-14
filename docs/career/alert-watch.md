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

## Scale wave (2026-10-14, BUG-091..097) — directory, adaptive cadence, any occupation

The watch outgrew the hardcoded 19-board registry. What changed, all in module 151
(plus one 121 fix), guarded by `tests/career-alert-watch-scale.test.cjs` (9 tests):

- **Board directory (BUG-096):** boards are product data —
  `packages/career-data/board-directory.json`, built by
  `scripts/career/board-discovery.py` (candidate assembly + per-provider
  gibberish calibration + concurrent live verification) and
  `scripts/career/build-board-directory.mjs`. An entry is `live` only if a real
  fetch returned its postings JSON in the run. `feedsFromDirectory(entries)`
  builds the feeds; detection polls are **list-first** (Greenhouse without
  `?content=true`, gap G4 — full text stays available via `{content:true}`).
  Providers discovered live but not yet normalizable by 121 (workable / breezy /
  recruitee) are recorded `discovered_unsupported`, never silently fed.
- **Adaptive cadence (BUG-091):** `runAdaptiveCycle` polls DUE boards only, one
  board per 121 `poll()` under a **per-board snapshot key**
  (`career:jobs:snapshot:board:<source>:<token>`) — a shared snapshot + subset
  polling corrupts the seen-set (unpolled boards' ids fall out and re-fire as
  new), so cadence is per-board or it is wrong. `planCadence` sets each board's
  interval from its observed new-postings/day EWMA (≥2/day → 5 min; ≥0.25 → 15;
  ≥0.02 → 60; below → 240), starred companies cap at 15, <3 observed cycles hold
  standard (unknown velocity is not zero velocity), errors back off (×2, then
  park at 240). Per-board state (last_ok_at, ewma, interval) persists in the
  store under `career:jobs:watch-state`.
- **Suppression layer (BUG-092/093):** detections collect across the cycle, then
  (a) the **repost seat rule** — same company+title+city alerted within 14 days,
  all known req ids gone, a new req appears → suppressed as a repost and its id
  absorbed into the seat's known ids, so a later *additional* req while the
  absorbed one is live still alerts; company identity comes from the board's
  directory entry, never the payload (Lever postings carry only the token);
  (b) **recovery absorption** — a candidate timestamped before its board's blind
  window (last_ok_at / first attempt, 5-min slack) is back-catalog, absorbed
  silently; (c) **cross-board dedupe** — the same seat on two boards in one
  cycle alerts once (best fit score wins).
- **Timestamp quality (BUG-094):** every alert record carries
  `posted_at_quality` — `fresh` (≤48h at first sight), `backdated` (>48h: a
  board-clock artifact — latency is recorded but must be excluded from latency
  statistics), `missing`.
- **Any-occupation gate (BUG-095):** bands come from the profile
  (`preferences.alert_bands`, default intern/new_grad — behavior unchanged for
  the student profile), and the watch leg also passes on a **watched
  occupation** title match (`preferences.watched_occupations:
  [{occupation, terms}]`), the bridge from the ~900-occupation taxonomy to
  121's family classifier.
- **G5 fix in 121 (BUG-097):** `profileFromPersona` splits a skill fact's
  parenthetical annotation into `name_note`; skill names are matchable again.

**Host scheduling under the adaptive design:** the host ticks
`runAdaptiveCycle` per user (a 60s tick is plenty — due-ness is computed from
per-board state, not from the tick), sharded by board ranges as in
`scripts/career/alert-watch-scaled-runner.mjs`. Worst-case latency is now
per-board: ~5 min on a hot board, 15 on a starred/active one, 4 h on a quiet
board that has earned quiet (the user's own watched boards never sit below
their profile's cap). The full methodology, the cadence math, and the measured
proof live in `~/workspace/your_files/upmore-instant-job-alert-methodology.md`.
