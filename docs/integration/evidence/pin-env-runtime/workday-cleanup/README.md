# Workday setup cleanup — 2026-10-22, environment/P2

Root cause: launchPersistentContext creates a temporary browser/profile before waiting for the extension worker. If worker setup throws, the caller receives no browser handle, so its after-hook cannot close that context; closing the local fixture server hangs behind it. The prepare/fill/approval/submit routines are untouched.

VERIFIED: new lifecycle guards **1/4 on base, 4/4 on fix**. They cover worker timeout, cleanup throwing without replacing the original error, launch failure before a context exists, and successful handoff to the caller. The 26 native-field/key-schema neighbors remain **26/26**; combined selection **30/30**, zero skips. The first neighbor invocation lacked the required esbuild/Playwright paths and failed 16 setup hooks; its raw log is retained. The corrected invocation uses exactly the gate's tool paths; no assertion or product code was changed for that invocation error.

VERIFIED: unchanged career-extension-workday suite exits in **16.816 seconds**, with no external cleanup watcher. Functional coverage is **0/17**, all **17/17 NOT_RUN** because the installed browser does not load the extension; this is not a Workday capability pass. The existing CI rule refusing a missing extension remains unchanged. The current full-trunk verification still uses its older source and records its cleanup workaround separately.

NOT_RUN: full gate and CI on this cleanup commit; live employer, paid call, approval or submit. No flags, caps, test skips or assertions changed. Ledger: **$0 new; $8.573843 recorded, UNRECONCILED**.
