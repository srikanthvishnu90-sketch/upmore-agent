# Runtime portability proof — repo only

Base: `eb57e812d58b0be8177156d0f18e1a498ab9e630` (trunk Step 0). New spend: **$0**; historical $8.573843 remains UNRECONCILED.

- VERIFIED: four deadline lifetime checks are **1 pass / 3 fail on the base**, **4 / 0 on the fix**. They run the actual module with injected timer handles, covering resolution, rejection, synchronous failure and timeout fallback. The timeout budget/default and routing decisions are unchanged.
- VERIFIED: Deno **2.1.4** Edge execution progressed from a base text-import loader error, through **856 / 39**, to **895 / 0**. Source text reads use Deno.readTextFileSync instead of the newer import-attributes feature. All assertions remain unchanged. The document journey now imports the actual deployed ESM bundle. Its parsing oracle has explicit local CommonJS bindings; the Buffer-shadowed production-render test still passes.
- VERIFIED: router/send/proactive/timezone neighbor selection: base **51 / 1**, fix plus four new guards **55 / 1**. The existing scheduler wiring assertion still expects an inline CI command that the base lacks; it was not edited.
- VERIFIED: both canonical router bundle checks pass. The full bundle is regenerated from source; the career bundle is unchanged.
- NOT_RUN: CI, complete Node gate on this branch, hosted runtime metadata, and any live work. No migration, submit path, flag, deploy or live action changed.

The full environment pin remains a separate unfinished change on this branch: production SDK graph locking and architect-owned text-import compatibility are still unresolved. This evidence does not claim the environment outcome is complete.

Commands used (Node 22.23.3, Python 3.12.14):

```sh
PIN_ENV_TEST_ROOT=<base-worktree> node --test tests/career-runtime-portability.test.cjs
node --test tests/career-runtime-portability.test.cjs
DENO_DIR=/tmp/pin-env-deno-cache deno test --cached-only --import-map=/tmp/f009-deps/import-map.json --allow-read --allow-write=/tmp --allow-run --allow-env --allow-net=127.0.0.1,localhost --no-check tests/edge
node --test tests/career-runtime-portability.test.cjs tests/router.test.cjs tests/send-balance.test.cjs tests/proactive.test.cjs tests/proactive-wiring.test.cjs tests/career-deadline-timezone.test.cjs
python3 scripts/build-router-core.py --check
python3 scripts/build-router-core.py --career-only --check
```

The read-only compatibility import map used unchanged std/assert and deno-dom upstream sources, not test doubles. The in-progress checked-in lock/config will replace this local prerequisite; it is not represented here as already complete.
