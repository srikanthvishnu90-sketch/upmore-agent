# Connector gate — integration note (Lane B package 4, 2026-10-21)

**Module:** `packages/domain/156-career-connector-gate.js` (export `CareerConnectorGate`)
**Guard:** `tests/career-connector-gate.test.cjs` — 15/15 on this branch; fail-first recorded (suite red before the module existed).
**Claim (BUILD-STATUS convention):** this package owns the three NEW files above plus this note. No existing file is edited by this package; every edit below is the integration lane's, listed exactly.

## What the gate is

A pure, fail-closed allowlist decision for the people-matching Connector, modeled on the channel bridge's allowlist seam (`supabase/functions/_shared/channel_bridge.ts`: `parseAllowlist` + `resolveTestUser`, lines 41–56; `EnvGetter` type at line 17).

Config (env-shaped, read through a getter):

| Env var | Meaning |
|---|---|
| `CONNECTOR_ENABLED` | Master switch. Only `true` or `1` (trimmed, case-insensitive) is ON. Unset/empty/anything else = OFF. |
| `CONNECTOR_ALLOWLIST` | Comma-separated user ids. Entries trimmed, lowercased, deduped. An entry with internal whitespace or >256 chars is malformed: dropped, never matchable, never fatal. |

API: `decide(env, userId) -> { allowed, reason, userId }` (frozen), plus `parseConnectorConfig(env)` and `isAllowed(env, userId)`. `env` is an `EnvGetter`-shaped function `(name) => string | undefined` or a plain object map. A throwing getter reads as unset. No state, no cache, no I/O — same inputs, same decision.

Reasons (the full enum, `CareerConnectorGate.REASONS`):

| reason | when |
|---|---|
| `disabled` | master switch off — checked FIRST, so switching off closes the Connector for everyone at once, listed or not |
| `not_listed` | switch on, but the id is missing/empty/non-string or not on the list |
| `allowed` | switch on AND the (lowercase-normalized) id is on the list |

Default posture: a fresh deploy with neither env var set decides `disabled` for every user — production behavior is byte-identical to today until the owner sets both vars.

## Exact integration call sites (integration lane)

**1. Bundle membership — `scripts/build-router-core.py`.** Add `"156-career-connector-gate.js"` to the `names` list (after `"155-career-batch-apply.js"`) and `"CareerConnectorGate"` to the `exports` list. Regenerate BOTH bundles and verify:
`python3 scripts/build-router-core.py && python3 scripts/build-router-core.py --career-only && python3 scripts/build-router-core.py --check && python3 scripts/build-router-core.py --career-only --check`
The module is edge-safe (no Node APIs; its `module.exports` line is `typeof`-guarded like every other domain module).

**2. Decision — `supabase/functions/agent-chat/handler-career.ts`, at turn setup.** Immediately before the existing line 266 (`const ctx = host.createTurnCtx({ userId: user.id, ... })`), compute the decision ONCE per turn from the authenticated request's user id:

```ts
const connectorGate = CareerConnectorGate.decide((name) => Deno.env.get(name), user.id);
```

and pass it through in the same `createTurnCtx` opts object (`connectorGate,`).

**3. Ctx carriage — `supabase/functions/_shared/career_host.js`, `createTurnCtx` (line 270).** One line in the ctx literal beside `userId: o.userId || null` (line 274):

```js
connectorGate: o.connectorGate || null,
```

**4. Consumption — `packages/domain/142-career-router.js`, dispatch, immediately BEFORE line 8445** (`const pmStop = handlePeopleMatchingStop(text, c);`):

```js
// Lane B Connector: an allowlisted user routes to the connector
// flow; everyone else reaches the honest stop below, unmodified.
if (c.connectorGate && c.connectorGate.allowed) {
  const conn = handleConnector(text, c); // sibling packages' entry point
  if (conn) return conn;
}
```

`handlePeopleMatchingStop` itself (142:1265–1307, returns at 1283–1304) is NOT modified — its text, intents (`people_matching_stop`, `sends: 0`), and internal stand-downs (named-recipient and 135-graph carve-outs) stay byte-identical. For any turn whose decision is absent or not `allowed`, the inserted block is inert and the stop fires exactly as today.

## Identity rule (load-bearing — read before wiring)

The gate keys on the **real authenticated user id**: `user.id` in handler-career.ts, from the verified request. Each side of a future match acts as themselves, under their own id.

It must **never** be fed the channel test bridge's resolved identity. `channel_bridge.ts`'s `resolveTestUser` collapses every allowlisted channel sender onto the single shared `CHANNEL_TEST_USER_ID` — a gate fed that id would wave every bridged sender through as one person, and double opt-in would be meaningless. Consequences, stated plainly:

- Do NOT consult this gate inside `channel_bridge.ts`, `telegram.ts`, or `whatsapp_twilio.ts`, and do NOT pass a `resolveTestUser` result into it.
- While channel identity still resolves through the shared test bridge, bridged turns carry the test user's id; the gate therefore stays closed for real people on those surfaces until per-user channel identity exists. That is the intended Lane B posture (channels closed to real users until identity is per-person), not a gap in this module.
- handler-career.ts lines 64–91 hold the first-party `as_user_id` test override: on that seam the effective `user.id` IS the overridden id, so the gate evaluates the overridden id. That is a first-party test path only; the override must never ship enabled for real traffic without revisiting this note.

## What the gate does not do

No consent capture, no matching, no intros, no sends, no state. It answers one question — may the Connector flow run for this user, on this turn — and its `disabled`/`not_listed` answers leave the product exactly as it is today.

## Owner-side step at integration (not this package)

Setting the vars is a deploy action: `sb.py secrets-set CONNECTOR_ENABLED=true CONNECTOR_ALLOWLIST=<user-id>[,...]` on the upmore project, followed by the staged agent-chat deploy carrying sites 1–4. Until then the gate is inert in production by construction.
