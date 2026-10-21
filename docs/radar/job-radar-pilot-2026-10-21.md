# Job Radar — pilot design (2026-10-21)

**Named outcome:** a user states a career goal once and receives live,
matching new postings in chat — felt the first morning after a watch
is set, and every morning a matching role appears.
**State today: NOT-LIVE.** This doc is the pilot build spec; the two
foundation findings it stands on are
[freshness-audit-2026-10-21.md](freshness-audit-2026-10-21.md) (the
shelf is a single 2026-10-14 bulk load, 21,688 rows, nothing ingested
since) and
[scheduler-root-cause-2026-10-21.md](scheduler-root-cause-2026-10-21.md)
(the existing alerts host crashes intermittently on a fence conflict
the closure did not touch).

## Pilot scope (narrow by design)

- **Families:** Greenhouse / Lever / Ashby boards only — 15,355 of
  21,688 shelf rows (70.8%), the same three families the apply path
  can drive, and the families queue-feed's targeted read was proven
  on.
- **Users:** allowlisted identities only (the gauntlet test user
  first; the owner second). Nobody else can set a watch during the
  pilot — the same fail-closed posture as the connector gate.
- **Watch definition:** one watch = the user's recorded goal (kind
  `goal`, verbatim, from the F-017 spine) + family/band derived from
  it. No keyword forms, no per-user board lists in the pilot.
- **Alert content:** postings that are (a) new to the user's seen-set,
  (b) family/band-eligible via queue-feed's targeted read, and
  (c) link-verified live before the alert is composed. An alert is a
  short digest (title, company, location, link, one line of match
  basis) — never a raw feed dump.

## How it runs (composition of existing parts)

1. The existing scheduler host (systemd timer, q15min,
   `scripts/career/alerts-scheduler.mjs` → `alerts-host.mjs`,
   modules 151/152) keeps its cadence split: starred boards every
   15 min, default digest hourly — the pilot consumes its cycle, it
   does not add a second scheduler.
2. The feed for a cycle is built by queue-feed's targeted read
   (`workers/career-browser/queue-feed.cjs`, branch
   `muse/2026-10-21-queue-feed` @ ea986344 — proven 0 → 50/50
   family-eligible, median 2.26s local compute) merged at its named
   integration point (`production-sources.cjs` `postingsFor`, ahead
   of module 155's unchanged filter), instead of the 600-row recency
   window that provably holds zero in-band postings (F-005).
3. Before any alert is enqueued, each candidate URL passes the
   link-liveness check (the PR #146 module: over the audit's 60 URLs
   it kept 31/31 live, dropped 3/3 dead, kept 26/26 uncheckable). A
   dead link never reaches a user; an uncheckable link is kept but
   never upgraded to "verified."
4. Delivery is the product's own path: the reminder lands in
   `career_reminder_outbox` (status `delivered`) and is read back in
   chat through the existing unseen-reminders read (limit 5). The
   messaging surfaces (Telegram) stay as they are today — allowlisted
   senders resolve to the test identity — so the pilot's delivery
   proof is the in-product inbox; real per-user channel delivery is
   post-pilot scope (O5-era rails), not pilot scope.

## Caps and quiet hours (pilot settings)

- **Volume:** at most 1 digest per user per day on the default
  cadence; starred-board alerts ride the same digest in the pilot
  (no real-time pings). Per-digest cap: 5 postings, best match basis
  first — 152's fatigue/digest machinery (units/digested/held) is the
  enforcement point.
- **Quiet hours:** no delivery 22:00–07:00 user-local; a digest that
  comes due inside quiet hours is held to 07:00, never dropped and
  never stacked (two held digests merge into one).
- **Seen-set discipline:** a posting alerts at most once per user,
  ever (per-user-per-board snapshot keys, BUG-091 scheme). Re-posts
  under a new posting key are new alerts only if the liveness check
  passes and the posting is not a near-duplicate of an alerted one.

## Build list (exact, with effort)

| # | Piece | What it is | Effort |
|---|---|---|---|
| 1 | Scheduler repair | Retry-on-stale-fence (one retry, fresh fence, never on pause) + un-collapse the `rpc()` error so the log names the real cause + fail-first regression test. Spec: scheduler-root-cause note. Files: `scripts/career/alerts-host.mjs`, `alerts-scheduler.mjs`, one new test. | 0.5–1 day |
| 2 | Ingestion refresh | A recurring refresh for GH/Lever/Ashby boards writing `career_kb_postings` in the loader's shape (`fetched_on` = run date, `content_hash` idempotence), run on the scheduler host's timer — the shelf's first non-manual writer. Fixes the lever `posted_at` misparse on the way in. Boards: the 65 GH + 8 Lever + 41 Ashby boards already in the shelf's directory. | 1–2 days |
| 3 | Queue-feed wiring | Merge queue-feed.cjs at `production-sources.cjs` `postingsFor` + the supabase-transport `ilike` binding it requires (its integration note names both). Band filter unchanged. | 0.5 day |
| 4 | Liveness gate in the cycle | Wire the PR #146 liveness module into `runUserAlertCycle` between candidate selection and enqueue; dead → dropped + counted in the cycle log; uncheckable → kept, labeled. | 0.5 day |
| 5 | Watch-set surface (pilot form) | A host-side watch-set tool that writes the 152 watch profile from the user's recorded goal (allowlist-checked), so the pilot needs no new chat intent. The in-chat "watch this for me" intent is brain-lane work and is a named dependency, not pilot scope. | 0.5 day |
| 6 | Caps/quiet-hours config | Digest cap (1/day, 5 postings), quiet-hours hold + merge, wired into 152's fatigue path with pilot values; cycle log gains `held_quiet_hours` and `dropped_dead_link` counters. | 0.5 day |
| 7 | Proof run | One scripted end-to-end pilot run (below) with all artifacts captured. | 0.5 day |

**Total: ~3.5–5 working days**, items 1–2 on the critical path;
3–6 parallelizable after 1. Owners: items 1–7 this lane (host/tools);
the chat watch intent and any router change stay with the brain lane.

## The proof artifact that ends the pilot

One real alert, delivered and read back, with all three records
agreeing:

1. the scheduler cycle log line showing the alert composed
   (candidates → eligible → liveness-kept counts, digest of 1–5),
2. the `career_reminder_outbox` row for that alert with
   `status = delivered` for the pilot user, and
3. a chat transcript in which the pilot user asks what is new and the
   product returns that alert — posting title, company, and the same
   live link the liveness check passed.

Until all three exist for the same alert, Job Radar reports
NOT-LIVE, however green the pieces are individually.

## Out of scope for the pilot (named, not forgotten)

- Real per-user messaging delivery (channel identity is still the
  shared test identity — see the Lane B v2 channel rule).
- Sources beyond GH/Lever/Ashby; salary/location filters beyond the
  goal-derived family/band; alert → apply one-tap handoff (that is
  O5's surface once its rails land).
- Any change to application caps or approval gates: Radar only
  informs; it never applies.
