# Connector consent capture — integration note (Lane B consent-capture package, 2026-10-21)

**Module:** `packages/domain/164-career-connector-capture.js` (export `CareerConnectorCapture`)
**Guard:** `tests/career-connector-capture.test.cjs` — 24/24 on this branch; fail-first recorded (suite red at `be9d3816`, module absent).
**Claim (BUILD-STATUS convention):** this package owns the module, the guard suite, and this note — all NEW files. No existing file is edited by this package; every edit below is the assembly lane's, listed exactly. This note sits alongside the gate package's note (`docs/connector/gate-integration-note-2026-10-21.md`); its sites 2–4 are prerequisites, not repeated here except where capture adds to them.

## What capture is

The deterministic chat state machine that turns a gate-allowed user into a recorded 157 opt-in: ask need → ask offer → show the exact summary → grant **only** on the exact reply `yes` (normalized: trimmed, case-folded, one trailing `.`/`!` stripped) while that summary is on screen. The grant appends 157 grants for `matched`, `introduced`, `contacted` (chain order, one timestamp, the capture surface) and creates/updates the 157 match profile; the summary's digest (`summaryDigest`) is stamped into every grant event's note, so what the person agreed to is answerable from the consent log alone. Ambiguous replies re-show the summary byte-identical and record nothing; an edit re-shows the summary and voids a prior yes (157 revocations appended first); `REVOKE`/`STOP`/`CANCEL` ends the flow from any step. No LLM calls anywhere in the path.

API: `createConnectorCapture(deps, snapshotJson?)` → `{ start(userId, opts), handle(text, opts), result(), snapshot(), step(), flow() }`. `deps = { consentApi, gateDecision, surface, now }`; per-turn `opts = { at, gateDecision }` (a fresher decision beats the construction-time one). Every turn returns `{ ok, code, step, reply }`; `reply` is the exact outbound text.

**Vendored dependency (read before merging):** this branch carries `packages/domain/157-career-connector-consent.js` **byte-identical** to the consent package's file (sha256 `2892aab776b3add0226da644c6df9ce50ccb79c7617102eccfef5d15e5b19d1d`, = `muse/2026-10-21-connector-consent` @ `0c0b71fa`) so the guard exercises the real consent arithmetic. 164 consumes 157 by injection (`deps.consentApi`), the same pattern as 158's injected `isConsented`. On assembly the duplicate is identical content — dedupe, never resolve a "conflict" by editing either copy.

## Exact integration call sites (assembly lane)

**1. Bundle membership — `scripts/build-router-core.py`.** Add `"157-career-connector-consent.js"` and `"164-career-connector-capture.js"` to the `names` list (after `"156-career-connector-gate.js"`, keeping numeric order) and `"CareerConnectorConsent"`, `"CareerConnectorCapture"` to the `exports` list. (If the consent package's own assembly already registered 157, add only 164.) Regenerate BOTH bundles and verify, exactly as the gate note's site 1:
`python3 scripts/build-router-core.py && python3 scripts/build-router-core.py --career-only && python3 scripts/build-router-core.py --check && python3 scripts/build-router-core.py --career-only --check`
Both modules are edge-safe (no Node APIs; `module.exports` is `typeof`-guarded).

**2. Gate decision — `supabase/functions/agent-chat/handler-career.ts` + `supabase/functions/_shared/career_host.js`.** No new work: the gate note's sites 2–3 already compute `CareerConnectorGate.decide(...)` once per turn in handler-career.ts (immediately before line 266, `createTurnCtx`) and carry it on the ctx as `ctx.connectorGate`. Capture consumes that decision — the router-side constructor passes it as `deps.gateDecision`, and each `handle` call passes it again in `opts.gateDecision` so a switch flipped mid-conversation closes the very next turn (the guard suite pins this). Never construct a decision inside 142, and never feed the machine a `resolveTestUser` result — the gate note's identity rule applies unchanged: the machine's `userId` is the real authenticated `user.id`, and a decision naming any other id refuses with `GATE_USER_MISMATCH`.

**3. Flow-state carriage — `supabase/functions/_shared/career_host.js`, `STATE_KEYS` (line 35).** Capture is a multi-turn conversation, so its snapshot rides the host's existing per-thread snapshot mechanism (the `snapshot.stores` restore in `createTurnCtx`, lines ~269–290; `extractSnapshot` on the way out). Add one entry to `STATE_KEYS`: `"connectorCapture"`. The host then restores `ctx.connectorCapture` (the snapshot JSON string from `machine.snapshot()`, or absent) at turn setup and carries back whatever the router leaves in `ctx.connectorCapture` at turn end. No other host change: `ctx.profile` already arrives via `createTurnCtx` (line 290) and `ctx.now` is already on the ctx.

**4. Dispatch — `packages/domain/142-career-router.js`, at the gate note's site 4** (immediately BEFORE line 8445, the `handlePeopleMatchingStop` call; `handlePeopleMatchingStop` itself stays byte-identical). Inside the `c.connectorGate && c.connectorGate.allowed` branch, before the sibling packages' match/intro entry points, route capture turns to a `handleConnectorCapture(text, c)` helper living beside them:

```js
function handleConnectorCapture(text, c) {
  const snap = typeof c.connectorCapture === "string" ? c.connectorCapture : null;
  const m = CareerConnectorCapture.createConnectorCapture({
    consentApi: CareerConnectorConsent,
    gateDecision: c.connectorGate,
    surface: c.connectorSurface,          // see surface rule below
    now: () => c.now,
  }, snap || undefined);
  const turn = snap
    ? m.handle(text, { at: c.now, gateDecision: c.connectorGate })
    : m.start(c.userId, { at: c.now, gateDecision: c.connectorGate,
        existing: CareerConnectorConsent.readFromProfile(c.profile) });
  if (!turn.ok && !snap && turn.code !== "GATE_CLOSED" && turn.code !== "GATE_USER_MISMATCH") return null; // not a capture turn after all
  persistConnectorCapture(m, c);           // write rule, below
  c.connectorCapture = turn.step === "declined" || turn.step === "revoked" ? undefined : (m.snapshot() || undefined);
  return { intent: "connector_capture", text: turn.reply, sends: 0 };
}
```

Entry condition (the router's call, capture does not second-guess it): start a machine when there is no snapshot AND the turn is a connector opt-in intent (the same turns that today reach `handlePeopleMatchingStop` for an allowed user, or an explicit opt-in ask). Once a snapshot exists, every turn in that thread goes to `handle` until the flow ends. Keep the snapshot on `done` — do NOT clear it — so a same-thread `EDIT NEED` / `REVOKE` still reaches the live machine; clear it on `declined` / `revoked` as sketched. A later opt-in ask in a fresh thread starts a new machine, which reads the standing records through `existing` (site 5).

Surface rule: `c.connectorSurface` is the turn's surface in 157's vocabulary (`imessage`, `email`, `telegram`, `whatsapp`, `app`, `web`) — the host maps its channel to one of those before dispatch; the constructor throws on anything else, by design. Bridged channel turns remain closed to real people under the gate note's identity rule, so in practice capture first runs on first-party surfaces (`app` / `web`).

## Profile carriage read/write points (`profile._careerConnector`, per 157)

**Read — once, at machine start (site 4's `start` call).** `CareerConnectorConsent.readFromProfile(c.profile)` returns `{ match_profile, consent }` (either may be null; malformed records already read as null there). Pass it straight through as `opts.existing`. Capture validates a non-null record again and refuses a malformed one with `BAD_EXISTING` rather than repairing it; valid records are continued, never duplicated — grants append to the person's real log with continuing `seq`, and an existing profile is updated in place.

**Write — at the end of any turn where the machine's records may have changed**, via a `persistConnectorCapture(m, c)` helper the assembly lane adds beside the dispatch helper. The rule is exact:

- Let `res = m.result()` and `stored = c.profile && c.profile._careerConnector`.
- If `res.match_profile` is non-null (a grant stands): `c.profile = CareerConnectorConsent.attachToProfile(c.profile, { match_profile: res.match_profile, consent: res.consent }).profile` — the wholesale 157 carriage write.
- Else if `res.consent` is non-null AND `res.consent.events.length > 0` AND `stored` already carries a bundle (void / revoke-after-grant: the audit history MUST survive, but no grant stands, so `attachToProfile`'s both-records shape does not apply): replace only the consent half — `c.profile = Object.assign({}, c.profile, { _careerConnector: Object.assign({}, stored, { consent: res.consent }) })`.
- Otherwise (declined, revoked-before-grant, mid-flow): write nothing. The person was told "nothing was recorded"; an empty consent state is not persisted, and mid-flow state lives only in the thread snapshot (site 3).

The host's existing profile persistence carries `c.profile` from there, exactly as it already carries `prof._careerGraphPeople` — no new store, no migration. `result().match_profile === null` means "no standing grant", never "delete the stored profile": the stored match profile stays in the bundle (it is the record the person can re-grant against), and only the consent log decides standing.

## What capture does not do

No matching (158), no intros (159), no booking, no sends, no router/host edits on this branch, no deploy. The gate stays the only opener: with the gate note's env unset, `ctx.connectorGate` decides `disabled`, every start refuses with `TEXTS.GATE_CLOSED`, and production behavior is byte-identical to today.
