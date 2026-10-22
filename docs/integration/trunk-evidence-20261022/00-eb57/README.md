# VERIFIED baseline, before merge step 1

Exact tested commit: eb57e812d58b0be8177156d0f18e1a498ab9e630.

Node gate selection: **2,743 pass / 1 fail / 110 NOT_RUN skips**. Edge **895 / 0**. Architect **1,270 / 0**. The failing name and all skipped names/reasons are in failure-names.json. Node ran for 1,210 seconds with file concurrency 2 as UID 1000; all browser assertions that executed used local synthetic pages. The Workday service worker could not load; the saved cleanup record terminates only its leaked test browser after the last test had already been skipped. These Workday cases are NOT_RUN.

The first incomplete attempt found missing jsdom. Installing the already-checked-in packages/extension/tools lock made the restored extension-sync test pass 20/20; the complete suite was then restarted. The incomplete attempt is preserved separately and is not counted as a completed run.

The one failing dry-run migration-list test is corrected by the architect's concurrent Step 0c at 72031f0d. That change is adopted from origin/trunk, not written here. Step 1 suites will compare by name to this recorded baseline, including those concurrent fixes, before any next step.

CI, hosted runtime metadata, live work, and DB suite: NOT_RUN for this baseline. $0 new spend; historical $8.573843 UNRECONCILED.
