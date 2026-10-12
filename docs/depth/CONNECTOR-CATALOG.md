# CONNECTOR-CATALOG: the catalog's rules and "what can you connect" (packet added for G4)

`packages/domain/52-connector-catalog.js` (`ConnectorCatalog`, Instinct spec doc 05) validates every row of
`packages/connectors/catalog.json` (126 rows): a known way to sign in (no stored passwords), capabilities that exist in
the registry by their exact id, a wave, a reliability class, a last-checked date, write actions at T3 or above that are
gated unless a live adapter exists, a live session labeled the least reliable class. It answers "what can you connect"
from the table, so the answer is never aspirational, and runs the coverage check over real financial lives.
Check: `node --test tests/depth-CONNECTOR-CATALOG.test.cjs && node evals/depth/run.cjs CONNECTOR-CATALOG`.

Where it runs today: **not reachable in production.** Only the developer CLI `scripts/connectors` (`--check`, `--list`,
`--can <surface>`) and tests (`tests/catalog.test.cjs`, this packet) load it. No edge function or app path does; the
live chat answers "connect my X" from the connector matrix (`packages/connectors/platforms.json` through
`77-brokerage-connectors.js`), and the real-world audit reads `catalog.json` directly. Every row's adapter is `none`,
an edge function not yet wrapped in the five verbs, or a reference adapter: no row is live. No person has read these
answers.

Bugs this packet pins, each written as a failing test first on the original module (logged in
`docs/playbook-drift-2026-10-12.md`):
- S11: the rule "a write action needs a gate unless a live adapter exists" tested whether the adapter state contained
  the letters "live", so an ungated money write on a row marked "not live: awaiting partner", "delivery partner
  contract pending" or "live sandbox only" passed validation. Live now means the state starts with "live" and names no
  sandbox, mock, test or paper. D11, D11b.
- S13: "a live session must be labeled the least reliable class" tested for the letters "low", so "high (follows the
  bank's own app)", "slow but steady" and "below average" passed. The label must start with "low" or say "least
  reliable". The 58 live-session rows in the catalog all still pass. D13.
- S15: a row whose adapter exists but is not live (Plaid: "edge function exists (plaid, plaid-sync); not yet wrapped in
  the five verbs"; SimpleFIN; Gmail) was answered "yes, via aggregator (high)" with nothing more, while a row with no
  adapter said "adapter not built yet". It now adds "adapter not live yet (<the row's state>)". D15.
- S16: a service not in the catalog was answered "CSV import always works as the floor", but the CSV adapter is a
  reference adapter in `51-connectors.js` that no app or edge path loads: there is no CSV import a person can use. The
  floor sentence now comes from the table and is said only when the `manual-csv` row is live. `tests/catalog.test.cjs`
  pinned the old sentence and is corrected (the old value promised a connector that is not live). D16.
- S17: a blank question matched every row (`"".includes` is always true), so "can you connect" with nothing after it
  answered yes for all 126 rows. It now asks "Which service? Name the bank, app or company you want to connect." D17.

Fixed after merge (each red first in this file, logged in `docs/playbook-drift-2026-10-12.md`):
- S21 (and S14, S15): every covered answer opened with "yes" even when the adapter was not built. It opens "not yet; it
  would connect via ..." unless the row is live ("yes, via ..." then); all 126 rows answer "not yet" today. `covered`
  still means the row is in the catalog, so the coverage check is unchanged. `tests/catalog.test.cjs` is corrected. D21.
- S06: `last_checked` accepted an impossible date like 2026-02-30 or 2026-13-45. It is refused: "last_checked
  2026-02-30 is not a real date". D06b.

Noted, not changed (for the owner): `last_checked` never goes stale; matching is substring-based, so a short question ("bank") matches
many rows and "Chase Bank" matches no row named "Chase"; the Zelle row reads "yes, via aggregator (high)" for what is a
handoff inside the person's own bank (catalog data, not this module).

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | The registry is the list of capabilities | the real catalog validates clean | `S01` in tests/depth-CONNECTOR-CATALOG.test.cjs | registry ids are read from the wrong field, so every row's capabilities are unknown | proven (also fails S02, S03, S04, S05, S06, S08, S09, S10, S11, S12, S13) |
| S02 | No stored passwords | VAULTED_CREDENTIALS is refused | `S02` in tests/depth-CONNECTOR-CATALOG.test.cjs | the removed vaulted-credentials method is accepted again | proven |
| S03 | One row per provider | a second mock-bank row is refused | `S03` in tests/depth-CONNECTOR-CATALOG.test.cjs | duplicates are not tracked | proven |
| S04 | Three waves | wave 4 and "1" are refused | `S04` in tests/depth-CONNECTOR-CATALOG.test.cjs | any number counts as a wave | proven |
| S05 | Reliability is stated | an empty reliability class is refused | `S05` in tests/depth-CONNECTOR-CATALOG.test.cjs | the reliability check is dropped | proven |
| S06 | A checked date is a date | "2026-10-1" and "Oct 10" are refused | `S06` in tests/depth-CONNECTOR-CATALOG.test.cjs | any text counts as a checked date | proven |
| S06 | A checked date is on the calendar | "2026-02-30" is refused | `S06` in tests/depth-CONNECTOR-CATALOG.test.cjs | any date of the right shape passes (the bug fixed after merge) | proven |
| S07 | At least one capability | an empty list is refused | `S07` in tests/depth-CONNECTOR-CATALOG.test.cjs | an empty list passes | proven |
| S08 | Capabilities by their exact id | ZZZ-999 and acct-001 are refused | `S08` in tests/depth-CONNECTOR-CATALOG.test.cjs | an id that looks right passes without the registry | proven |
| S09 | Write actions cite a real capability | PAY-999 is refused | `S09` in tests/depth-CONNECTOR-CATALOG.test.cjs | only a missing capability is refused | proven |
| S10 | Writes are T3 and up | a T2 write is refused | `S10` in tests/depth-CONNECTOR-CATALOG.test.cjs | T2 counts as a write tier | proven |
| S11 | "not live" is not live | an ungated write on "not live: awaiting partner" is refused | `S11` in tests/depth-CONNECTOR-CATALOG.test.cjs | any state containing the letters "live" counts as a live adapter (the bug found building this packet) | proven |
| S11 | A sandbox is not live | "live sandbox only" is refused | `S11` in tests/depth-CONNECTOR-CATALOG.test.cjs | a sandbox counts as live | proven (also fails S21) |
| S12 | A gate says why | an empty gated reason is refused | `S12` in tests/depth-CONNECTOR-CATALOG.test.cjs | the empty-reason check is dropped | proven |
| S13 | "follows" is not "low" | "high (follows the bank's own app)" is refused for a live session | `S13` in tests/depth-CONNECTOR-CATALOG.test.cjs | the letters "low" anywhere pass (the bug found building this packet) | proven |
| S14 | No adapter, said | Gusto says adapter not built yet | `S14` in tests/depth-CONNECTOR-CATALOG.test.cjs | the missing adapter is not said | proven (also fails S21) |
| S15 | Not live, said | Plaid says adapter not live yet | `S15` in tests/depth-CONNECTOR-CATALOG.test.cjs | an existing but unwired adapter reads as a plain yes (the bug found building this packet) | proven (also fails S21) |
| S16 | No CSV promise without a live CSV adapter | the gap answer stops at the catalog | `S16` in tests/depth-CONNECTOR-CATALOG.test.cjs | CSV import is promised whatever its adapter state (the bug found building this packet) | proven |
| S17 | A blank question asks which | an empty question covers nothing | `S17` in tests/depth-CONNECTOR-CATALOG.test.cjs | a blank question matches every row (the bug found building this packet) | proven |
| S18 | Every gap named | Chime and the mock wallet are both gaps | `S18` in tests/depth-CONNECTOR-CATALOG.test.cjs | only the first gap per life is kept | proven |
| S19 | Each in its own wave | wave 3 holds mock-b only | `S19` in tests/depth-CONNECTOR-CATALOG.test.cjs | a wave also collects the rows before it | proven |
| S20 | "cash app" finds cash-app | spaces in a question match a hyphenated id | `S20` in tests/depth-CONNECTOR-CATALOG.test.cjs | spaces are not turned into hyphens for the id | proven |
| S21 | "yes" only when live | no row with an adapter that is not live opens "yes" | `S21` in tests/depth-CONNECTOR-CATALOG.test.cjs | every row in the catalog opens "yes" (the bug fixed after merge) | proven (also fails S14, S15) |
<!-- results:end -->
