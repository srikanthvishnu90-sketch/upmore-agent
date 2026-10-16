# Bounded gateway response lifecycle

MOCK_CONTRACT evidence through the actual staged gateway, using injected
transport and synthetic keys only. No actual provider was called.

Frozen source `52bae709` retains eight oracles and the original raw result:
one pass and seven failures. A transport ignoring abort, stalled success/error
bodies, parent cancellation, multibyte size and stream-drain limits exposed
the previous unbounded response-body lifecycle.

The gateway now keeps one referenced deadline through headers and body reads,
accepts a parent abort signal, cancels an active reader on abort and rejects
after 200,000 raw bytes without draining the remaining stream. Error bodies
use the same limit and deadline. Late headers from an abort-ignoring transport
are discarded and their body cancelled. No retry or provider fallback is added.
Provider configuration and strict raw usage validation are preserved.

All eight new checks pass. The gateway/flexible/staged compatibility run passes
92/92; native Deno gateway, usage and error suites pass 18/18 and typecheck.
Synthetic provider error text in the retained Deno log is a test fixture,
not a real failed provider call. Earlier red logs remain alongside fixed logs.

This is a prerequisite only. It does not implement paired accounting,
production semantic checking, context v3 or interview registration. Actual
provider quality and 15 live-browser outcomes remain NOT_RUN. Shared release,
production, account credentials and paid allowances remain untouched.
