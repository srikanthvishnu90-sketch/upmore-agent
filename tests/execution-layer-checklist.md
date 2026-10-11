# Agentic App Execution-Layer Checklist & Torture Tests

As of 2026-10-04

For Ring and Upmore. Every item is a thing that breaks in production agentic apps, written as a check plus the test that catches it.

---

## The two bugs you named

Both are symptoms of the same root defect: the UI treats an intent as a fact. "Saved" is rendered from local state rather than from a server-confirmed write, and "logged in" is rendered from a variable that resets on remount.

### "I save a connector and it doesn't save" — 14 causes, in order of likelihood

1. The POST fired but the response was never awaited; the modal closed on click, not on 200.
2. The write succeeded but the list reads from a cache that was never invalidated.
3. The write succeeded server-side but RLS silently filtered the row back out on read (`user_id` mismatch, or a service-role write with an anon-key read).
4. Optimistic update applied, request failed, no rollback, so the UI shows a row that does not exist.
5. The OAuth popup/redirect returned to a fresh page load, and the in-memory "pending connector" object was lost.
6. Token stored in memory or `sessionStorage` instead of the database, so it dies with the tab.
7. Upsert without a unique constraint, so a second save inserts a duplicate and reads return the stale row.
8. Upsert with a unique constraint but no `on_conflict`, so the write 409s and the error is swallowed.
9. The save ran on an unauthenticated request and landed under a fallback user id (`local`, `demo`, `anon`).
10. Two components own the same state; one re-fetches and overwrites the other's write.
11. The serverless function returned before the async write resolved (no `await`, fire-and-forget).
12. `useEffect` with a changing dependency re-ran the fetch after the save and raced it.
13. The response shape changed (snake_case vs camelCase) so the UI reads `undefined` and renders empty.
14. The write went to a different environment than the read (preview deployment vs production database).

**The test that catches all 14:** save a connector, then — without touching the UI — query the database directly for that row. If the row is there but the UI is wrong, it is a read/cache bug (2, 3, 10, 13). If the row is absent, it is a write bug (1, 4, 7, 8, 9, 11). Then hard-refresh, then kill the app and cold-start, then open on a second device. A save that survives all four is real.

### "The splash screen reopens" — 12 causes

1. The root component remounts because its `key` or its parent re-renders, restarting the boot animation.
2. Auth state starts as `undefined`, renders splash, resolves to a user, then a token refresh sets it back to `undefined` for one frame.
3. The splash is gated on a loading flag that multiple fetches each toggle, so the last one to finish re-raises it.
4. Navigation remounts the stack instead of pushing onto it.
5. The app resumes from background and re-runs the full boot sequence rather than a lightweight resume.
6. A failed request triggers a global error boundary that resets to the root route.
7. The session is read from `localStorage` asynchronously, so the first paint has no user.
8. A service worker update activates mid-session and reloads the page.
9. Deep link handling pushes the root route before the target route.
10. React Strict Mode double-invokes effects in development only, masking or creating the symptom.
11. The splash is rendered whenever a query is `isLoading`, and background refetches set `isLoading` instead of `isFetching`.
12. An auth redirect loop: protected route sends to login, login sees a session, sends back, repeat.

**The test:** instrument the splash component to log every mount with a timestamp and a stack trace. Then use the app normally for 10 minutes. Any mount after the first is a bug. Separately, log every change of the auth state value; any `user → undefined → user` transition is cause 2.

---

## Write path: saves, optimistic UI, idempotency, caching

The rule: nothing renders as done until the server says so, and every write is safe to repeat.

- [ ] Every mutation awaits its response before the UI changes state.
- [ ] Success is determined by the response body, not just a 200 status.
- [ ] The server returns the written row, and the client renders that row, not its local copy.
- [ ] Optimistic updates always have a rollback path on failure.
- [ ] Rollback restores the exact prior value, not a refetch that may race.
- [ ] Every failed write surfaces a visible error; no silent catch blocks.
- [ ] Every catch block either re-throws, reports to telemetry, or shows the user something.
- [ ] Save buttons disable on first click and re-enable only on settle.
- [ ] Double submit is blocked client-side AND deduped server-side by idempotency key.
- [ ] Idempotency key = hash of (user, entity, normalized payload, time bucket), stored with a unique constraint.
- [ ] Replaying the same request returns the original result rather than creating a duplicate.
- [ ] Every upsert names its conflict target explicitly.
- [ ] Every unique business key has a database unique index, not just application logic.
- [ ] Writes that touch two tables run in a transaction or an RPC, never two sequential client calls.
- [ ] Partial failure of a multi-step write leaves no half-created entity.
- [ ] Cache invalidation is explicit for every mutation; list queries are invalidated by key.
- [ ] Invalidation covers derived views (counts, badges, dashboards), not just the edited list.
- [ ] Background refetch sets a "refreshing" flag, never the initial "loading" flag.
- [ ] Stale-while-revalidate never shows stale data as if it were fresh after a user's own edit.
- [ ] The same entity rendered in two places updates in both after an edit.
- [ ] Concurrent edits are guarded with a version or `updated_at` check; last-write-wins is a deliberate choice, not an accident.
- [ ] A version conflict produces a readable message, not a silent overwrite.
- [ ] Deletes are confirmed, reversible where possible, and remove the row from every cached list.
- [ ] Deleting an entity cascades or blocks cleanly; no orphaned child rows.
- [ ] Writes are scoped by user id on both write and read paths.
- [ ] RLS policies are tested with a real anon-key client, not only the service role.
- [ ] Nothing reaches the database under a fallback identity like `local`, `demo`, or `anon`.
- [ ] Field names are consistent end to end; one casing convention, enforced by types.
- [ ] Dates are stored as UTC timestamps and rendered in the user's zone.
- [ ] Numbers that represent money are integers in minor units, never floats.
- [ ] Empty string, null, and undefined are distinguished deliberately in every form field.
- [ ] Long text fields have server-enforced length limits that match client validation.
- [ ] The client never trusts its own validation; the server validates every field again.
- [ ] A save that times out is distinguishable from a save that failed; the UI says which.
- [ ] On timeout, the client re-reads before offering a retry, so it doesn't duplicate a write that actually landed.

**Torture tests for this section**

1. Click save 20 times in one second. Exactly one row exists.
2. Save, then kill the process mid-flight (airplane mode at 200ms). Re-open. The state is either clearly saved or clearly not, never a ghost row.
3. Save with the network throttled to 3G and 2s latency. The button stays disabled the whole time.
4. Save in two browser tabs simultaneously with different values. The result is deterministic and the loser is told.
5. Save, then immediately navigate away. The write completes and is visible on return.
6. Run the same save with an expired token. It fails loudly, refreshes, and retries once.

---

## Boot, splash, lifecycle, navigation

The rule: the app boots once per launch, and every screen can be entered directly from a cold start.

- [ ] Splash renders exactly once per cold start, never on resume, navigation, or refetch.
- [ ] Boot has an explicit state machine: `booting → authenticating → ready`, with no state able to go backwards.
- [ ] Auth state has three values, not two: unknown, signed-out, signed-in. Unknown renders splash; signed-out renders login.
- [ ] A token refresh never sets auth state back to unknown.
- [ ] The root component is mounted once; its `key` never changes.
- [ ] Navigation pushes and replaces routes; it never remounts the navigator.
- [ ] Returning from the background resumes in place, restoring scroll position and in-progress input.
- [ ] Resume revalidates the session quietly in the background without blocking the UI.
- [ ] Every route is directly linkable and loads correctly from a cold start.
- [ ] A deep link while signed out goes to login, then to the originally requested route, not home.
- [ ] An OAuth redirect returns to the exact screen the user left, with its in-progress state intact.
- [ ] In-progress state that must survive a redirect is persisted before the redirect, not held in memory.
- [ ] The back button never leaves the user on a blank or already-dismissed screen.
- [ ] The back button from a success screen does not re-submit the action.
- [ ] Browser back and in-app back behave identically.
- [ ] Modals close on back/escape and do not leave the body scroll-locked.
- [ ] Closing a modal mid-request either cancels the request or still applies the result correctly.
- [ ] Two modals can never stack invisibly on top of each other.
- [ ] Error boundaries catch render errors at the screen level, not just the app root.
- [ ] An error boundary offers a retry that re-mounts the screen, not the whole app.
- [ ] Service worker updates prompt the user instead of silently reloading mid-task.
- [ ] Route transitions cancel in-flight requests from the screen being left.
- [ ] A cancelled request never sets state on an unmounted component.
- [ ] Effects clean up subscriptions, timers, listeners and media streams on unmount.
- [ ] Strict Mode double-invocation is tested for explicitly; effects are idempotent.
- [ ] The app renders a usable first screen in under 2 seconds on a cold start over 4G.
- [ ] Splash has a maximum duration; if boot exceeds it, the user sees an explanation and a retry.
- [ ] A failed boot (no network, API down) shows a retry screen, not an infinite spinner.
- [ ] Launching offline reaches a usable screen with cached data.
- [ ] Rotating the device or resizing the window never resets screen state.
- [ ] Scroll position is preserved when navigating back to a list.
- [ ] The app survives being backgrounded for 24 hours and resumed.

**Torture tests**

1. Instrument the splash to log mounts. Use the app for 10 minutes across 30 navigations, 5 backgrounds and 3 resumes. Exactly one mount.
2. Cold start directly into every single route via deep link, signed in and signed out.
3. Start an OAuth connect, then background the app for 5 minutes mid-flow before returning.
4. Kill the app during boot, 10 times at random moments. No corrupted state on next launch.
5. Navigate rapidly between 5 screens for 60 seconds. Memory stays flat; no duplicate listeners.
6. Toggle airplane mode on and off repeatedly during boot.

---

## Auth, session, tokens

The rule: the session is one source of truth, refreshed in one place, and every screen behaves correctly at the moment it expires.

- [ ] One auth provider owns session state; no component reads the token from storage directly.
- [ ] Token refresh is serialized; ten concurrent 401s trigger one refresh, not ten.
- [ ] Requests that 401 mid-flight are retried once after refresh, then fail cleanly.
- [ ] A failed refresh signs the user out and routes to login with a reason.
- [ ] Refresh happens before expiry (at ~75% of lifetime), not only on failure.
- [ ] The app handles a token that expires while the device is asleep.
- [ ] Signing out clears every cache, query client, in-memory store and persisted draft.
- [ ] After sign-out, the back button cannot reveal the previous user's data.
- [ ] Signing in as a second user shows none of the first user's cached data.
- [ ] Multi-tab: signing out in one tab signs out the others.
- [ ] Multi-tab: refreshing in one tab does not invalidate the others' tokens.
- [ ] Session is restored synchronously enough that protected routes never flash login.
- [ ] Protected routes redirect to login only after auth state resolves, never while unknown.
- [ ] The login → protected → login redirect loop is impossible by construction (a redirect counter or a resolved-state guard).
- [ ] Email verification, password reset and magic-link flows all return to the right screen.
- [ ] Tokens are never logged, never in URLs, never in telemetry payloads.
- [ ] Access tokens live in memory; refresh tokens in httpOnly cookies or secure device storage.
- [ ] The user id used for writes comes from the verified token server-side, never from the request body.
- [ ] Account deletion removes or anonymizes every row the user owns, including connector tokens.
- [ ] Session revocation from another device takes effect within one refresh cycle.
- [ ] Clock skew on the device does not cause premature expiry (validate server-side, not by local clock alone).

**Torture tests**

1. Set the access token lifetime to 60 seconds and use the app for 30 minutes. Zero visible interruptions.
2. Manually corrupt the stored token and reload. Clean sign-out, not a crash loop.
3. Open 5 tabs, sign out in tab 3. All tabs reach a signed-out state within seconds.
4. Sign in as user A, sign out, sign in as user B. Inspect every cached list for A's data.
5. Fire 10 parallel requests at the moment the token expires. Exactly one refresh in the network log.
6. Revoke the session server-side while a long agent run is in progress.

---

## Connectors and OAuth lifecycle

The rule: a connector has a real state machine, and the UI shows the connector's true state, never the last thing the user clicked.

States: `not_connected → connecting → connected → degraded (needs reconnect) → revoked`. Every state has a screen.

**Connect**

- [ ] The connect button disables the moment it is pressed and shows progress.
- [ ] OAuth state parameter is random, single-use, stored server-side and verified on callback.
- [ ] PKCE is used for every public-client flow.
- [ ] The callback writes tokens to the database before returning any UI.
- [ ] The UI confirms connection by re-reading from the server, not by assuming success.
- [ ] The granted scopes are compared against the requested scopes; partial grants are detected and shown.
- [ ] The connected account identity (email, workspace) is fetched and displayed, so the user knows which account is linked.
- [ ] Connecting a second account of the same provider is supported or explicitly blocked with a message.
- [ ] Re-connecting an already-connected account updates in place, never creating a duplicate row.
- [ ] Abandoning the OAuth flow (closing the popup, hitting back) returns the UI to `not_connected`, not a stuck spinner.
- [ ] An OAuth error (`access_denied`, `invalid_scope`) renders a specific message, not a generic failure.
- [ ] The flow works in an in-app webview, a popup blocker scenario, and a redirect-only fallback.
- [ ] Provider-side cancellation mid-flow leaves no partial row.

**Hold and refresh**

- [ ] Tokens are stored per user, encrypted, and never returned to the client.
- [ ] Refresh tokens are updated in place; a refresh never overwrites another user's row.
- [ ] A refresh failure flips the connector to `degraded` and shows a reconnect prompt in the UI.
- [ ] Expired or revoked tokens are detected on use and surfaced immediately, not swallowed.
- [ ] Token refresh is single-flight per user per provider.
- [ ] Provider rate limits are caught and retried with backoff, and sustained limiting is shown as degraded.

**Display and management**

- [ ] The connector list is read from the server on every mount of that screen.
- [ ] The list shows last-verified time, not just a boolean.
- [ ] A "test connection" action exists and makes a real API call.
- [ ] Disconnect revokes the token at the provider, deletes the row, and purges any cached data derived from it.
- [ ] After disconnect, the agent immediately loses access; no indexed copies keep working.
- [ ] Permissions granted per connector are listed in plain language, with read and write distinguished.
- [ ] The user can downgrade permissions (for example read-only) without a full reconnect, where the provider allows it.
- [ ] Every connector-dependent agent action checks connector state first and fails with "reconnect Gmail", not a generic error.

**Torture tests**

1. Connect, then immediately kill the app during the callback. Reopen: state is `not_connected` or `connected`, never `connecting`.
2. Connect, then revoke access in the provider's own security settings. The app shows `degraded` on the next use and prompts reconnect.
3. Connect the same provider twice with two different accounts. No duplicate rows, correct identities shown.
4. Deny consent at the provider. The UI explains and offers a retry.
5. Connect on phone, open on desktop. The connector appears there without a manual refresh.
6. Expire the token manually in the database, then run an agent action that needs it.
7. Disconnect while an agent run using that connector is mid-flight. The run fails cleanly with a specific message.

---

## Agent UI: streaming, tool calls, approvals, cancellation

The rule: the user can always tell what the agent is doing, what it has already done, and what it is about to do — and can stop it.

**Streaming**

- [ ] A dropped stream is detected within seconds and reconnects, resuming from the last token rather than restarting.
- [ ] A partial message is marked as incomplete, never left looking finished.
- [ ] Closing the screen mid-stream does not kill the server-side run.
- [ ] Reopening the screen mid-run re-attaches to the live stream.
- [ ] Two devices watching the same run both receive updates.
- [ ] Streamed markdown renders safely while incomplete (unterminated code fences, half tables).
- [ ] Auto-scroll follows the stream but releases the moment the user scrolls up.
- [ ] Stream errors render inline in the message, not as a toast that disappears.
- [ ] Token-by-token rendering does not re-render the whole list on every token.

**Tool calls**

- [ ] Every tool call is visible with its name and its real parameters, before and after execution.
- [ ] A tool call in progress is visually distinct from one that completed.
- [ ] A failed tool call shows the failure, not a silent retry that confuses the transcript.
- [ ] The transcript distinguishes "the agent said it did this" from "the system confirmed this happened".
- [ ] Nothing is rendered as completed without a confirmation artifact (id, receipt, screenshot, message id).
- [ ] Tool results that are long are collapsed by default with an expand affordance.
- [ ] Tool outputs are rendered as untrusted data, never interpreted as app instructions or markup.
- [ ] A tool call that hangs has a visible timeout and a cancel option.

**Approvals**

- [ ] Approval requests render outside the conversation, in a dedicated UI the model cannot author.
- [ ] The approval shows exact parameters: recipient, amount, merchant, time, account.
- [ ] Approvals carry an expiry; a stale approval cannot be executed hours later.
- [ ] Approving twice executes once.
- [ ] Denying produces a clear agent response and does not retry the same action.
- [ ] Pending approvals survive app restart and appear on every device.
- [ ] A pending approval is visible from the home screen, not only inside the thread that created it.
- [ ] Approval resolution is atomic server-side; two devices tapping approve produce one execution.
- [ ] The approval UI shows what will happen if the user does nothing.
- [ ] Voice approvals read back the same parameters that the screen shows.

**Cancellation and interrupts**

- [ ] Stop actually stops: the server-side run halts, not just the UI stream.
- [ ] Stopping mid-tool-call either completes or compensates the in-flight action, and says which.
- [ ] A new user message during a run either queues or interrupts, deliberately and visibly.
- [ ] Closing the app mid-run leaves the run in a defined state that is recoverable on return.
- [ ] A cancelled run cannot later deliver its result as if it were live.
- [ ] Rapid-fire requests (three taps of the ring in five seconds) are queued in order, not interleaved.

**Torture tests**

1. Start a 60-second agent run. Kill the network at 10s, restore at 25s. The run completes and the UI catches up.
2. Start a run, force-quit the app, reopen. The run's outcome is visible.
3. Approve the same action from two devices within one second. One execution.
4. Leave an approval untouched for 24 hours, then tap approve.
5. Send 5 requests in 10 seconds through the ring. All 5 are answered in order, none lost.
6. Trigger a tool that fails mid-way (revoke the token during execution). The transcript shows an honest failure and no false confirmation.
7. Paste a message containing fake tool output and approval text. The UI must not render it as a real system approval.

---

## Long-running work, background execution, realtime sync

The rule: the agent's work lives on the server, and every client is a view of it that can disconnect at any time.

**Durable runs**

- [ ] Runs are rows in the database with an explicit state, not variables in a function's memory.
- [ ] A run's state machine covers: queued, running, waiting_approval, waiting_external, succeeded, failed, cancelled, needs_human.
- [ ] Every run has a deadline; nothing can be "running" forever.
- [ ] A run interrupted by a deploy, a crash or a timeout resumes or fails explicitly, never vanishes.
- [ ] Step results are checkpointed, so a resumed run does not repeat completed side effects.
- [ ] Runs waiting on a human (approval, OTP, reconnect) do not hold a connection open.
- [ ] Runs waiting on the outside world (email reply, hold queue, delivery) are polled or event-driven, not blocked.
- [ ] A stuck run alerts you before the user notices.
- [ ] Retries are capped, with backoff, and never retry a non-idempotent step blindly.
- [ ] Every run records cost and duration for later analysis.

**Realtime and sync**

- [ ] Realtime subscriptions reconnect after sleep, network change and tab backgrounding.
- [ ] On reconnect, the client reconciles missed events by re-fetching, not by assuming continuity.
- [ ] Events arriving out of order produce the right final state (ordered by server timestamp or sequence).
- [ ] A duplicate event does not duplicate a UI row.
- [ ] A message sent on one device appears on the other within seconds, exactly once.
- [ ] The unread/badge count is derived from the server and matches reality after sync.
- [ ] Local drafts survive app restart and are not clobbered by a server update.
- [ ] Offline edits queue and replay in order when connectivity returns.
- [ ] Replayed offline writes are idempotent and conflict-checked.
- [ ] A long-offline device (24h) reconciles without duplicating or losing anything.
- [ ] Push notifications for completed runs deep-link to the right screen and mark themselves read.
- [ ] A notification for a run that was already seen on another device does not re-alert.
- [ ] Scheduled and recurring runs are not double-fired by overlapping cron invocations.
- [ ] Timezone changes (travel, DST) do not shift scheduled runs by an hour.

**Torture tests**

1. Start a run, deploy a new version mid-run. The run completes or fails cleanly.
2. Start a run on wifi, walk out to cellular, lock the phone for 10 minutes, reopen.
3. Force two cron invocations of the same scheduled job in the same minute. One execution.
4. Put the device offline, perform 10 edits, come back online. All 10 land, in order, once each.
5. Set the device clock forward 3 hours. Nothing double-fires or expires early.
6. Disconnect the realtime socket at the exact moment a run finishes. The UI still updates within one refresh.

---

## Forms, voice capture, lists, empty and error states

**Forms and input**

- [ ] Every field validates on blur and on submit, with the error next to the field.
- [ ] Server validation errors map back to specific fields, not a generic banner.
- [ ] Submitting with Enter and with the button behave identically.
- [ ] A form in progress survives backgrounding, rotation and keyboard open/close.
- [ ] Navigating away from a dirty form warns, or autosaves as a draft.
- [ ] Autofill, password managers and paste all work; nothing blocks paste.
- [ ] Numeric fields use numeric keyboards and reject non-numeric input gracefully.
- [ ] Trimmed whitespace, normalized casing and unicode names are handled.
- [ ] Very long input (10,000 characters) is truncated with a visible limit, not silently cut.
- [ ] Emoji, RTL text and accented characters round-trip correctly through save and display.

**Voice capture (Ring-specific)**

- [ ] Microphone permission denial is handled with a recovery path, not a crash.
- [ ] Permission revoked mid-session is detected on the next capture.
- [ ] A capture started while another is still processing is queued, not dropped.
- [ ] Bluetooth disconnect mid-capture ends the capture cleanly and tells the user.
- [ ] A phone call, alarm or other app grabbing the audio session is recovered from.
- [ ] Audio routing changes (earbuds removed) are handled without losing the recording.
- [ ] Silent or empty audio produces "I didn't catch that", not an empty agent request.
- [ ] Transcription failure is distinguishable from agent failure in the UI.
- [ ] The user can see and correct the transcript before a high-risk action executes.
- [ ] Background audio streaming survives screen lock on iOS and Doze on Android.
- [ ] Battery-level and connection-state of the ring are shown and refreshed.
- [ ] A double-tap while the app is force-quit still reaches the agent, or fails visibly.

**Lists and data display**

- [ ] Pagination has no duplicate or skipped items at page boundaries.
- [ ] Infinite scroll stops cleanly at the end with an end-of-list indicator.
- [ ] Pull-to-refresh does not duplicate rows.
- [ ] A newly created item appears in the right sort position, not pinned at the top arbitrarily.
- [ ] A deleted item disappears from every list and every cached view.
- [ ] Filters and sorts survive navigation away and back.
- [ ] Large lists (1,000+ items) scroll at 60fps with virtualization.
- [ ] Every list has a distinct loading, empty, error and "no results for this filter" state.
- [ ] Empty states explain what to do next, not just "nothing here".

**Errors and offline**

- [ ] Every error message says what happened, whether it was saved, and what to do.
- [ ] Error codes are shown or logged so you can trace a user report to a log line.
- [ ] 4xx and 5xx are handled differently; 5xx offers retry, 4xx explains.
- [ ] Rate limiting shows a wait time, not a generic failure.
- [ ] Offline is detected and shown persistently, not as a disappearing toast.
- [ ] Actions unavailable offline are visibly disabled with a reason.
- [ ] Returning online automatically retries what is safe to retry.
- [ ] A crash reporter captures unhandled rejections and native crashes with user context.

**Torture tests**

1. Fill a long form, background the app for 10 minutes, return. Everything intact.
2. Record a 60-second voice note while walking in and out of signal.
3. Deny mic permission, then grant it, mid-session, without restarting.
4. Scroll a 2,000-item list to the bottom, then create a new item.
5. Turn airplane mode on mid-submit, off 30 seconds later.
6. Paste a 20,000-character string into every text field in the app.

---

## Mobile, PWA, performance, accessibility

**iOS and mobile web traps**

- [ ] Safari's `100vh` is handled with `dvh` or a measured height; the keyboard does not push content off screen.
- [ ] Safe-area insets are respected top and bottom, including on fixed headers and footers.
- [ ] Rubber-band scrolling does not reveal a mis-coloured background behind the app.
- [ ] Tap targets are at least 44x44pt; nothing important sits under the home indicator.
- [ ] Autoplay and audio require a user gesture; audio playback is tested after a silent-switch toggle.
- [ ] Background suspension on iOS is handled; the app recovers state on resume rather than reloading.
- [ ] `localStorage` eviction under storage pressure is survivable; nothing critical lives only there.
- [ ] In-app browsers (Instagram, LinkedIn) can complete the OAuth flow or are detected and redirected out.
- [ ] Android back-gesture, split-screen and font-scale settings do not break layout.
- [ ] Low Power Mode and Doze do not silently kill background work the user was promised.
- [ ] Push permission is requested in context, after explaining why, not on first launch.
- [ ] The PWA install prompt does not interrupt an in-progress task.

**Performance budgets**

- [ ] First contentful paint under 1.5s on 4G; interactive under 3s.
- [ ] Main bundle under 300KB gzipped; routes are code-split.
- [ ] No layout shift after load (CLS under 0.1); skeletons reserve real dimensions.
- [ ] Images are sized, lazy-loaded and served in modern formats.
- [ ] No request waterfall deeper than 2 on any screen's critical path.
- [ ] Lists re-render only changed rows; verified with a profiler, not by assumption.
- [ ] Memory after 30 minutes of heavy use is flat, not climbing.
- [ ] No listener, interval or subscription leaks after 50 navigations.
- [ ] Animations run at 60fps on a mid-range Android device, not just the simulator.
- [ ] Agent streaming does not drop frames in the rest of the UI.

**Accessibility**

- [ ] Every interactive element is reachable and operable by keyboard.
- [ ] Focus is trapped in modals and returned on close.
- [ ] Focus moves to new content after navigation, so screen readers announce it.
- [ ] Streaming agent output is announced politely, not read character by character.
- [ ] Approval dialogs are announced as alerts and are fully readable by screen reader.
- [ ] Colour is never the only signal for state (connected, failed, pending).
- [ ] Contrast meets 4.5:1 for text; test in both light and dark mode.
- [ ] The app works at 200% font scale without clipping.
- [ ] Reduced-motion preference disables non-essential animation.
- [ ] Form errors are programmatically associated with their inputs.

**Torture tests**

1. Run the whole app on a 3-year-old Android mid-ranger on 3G.
2. Use the app for 30 minutes with the memory profiler attached; check for growth.
3. Complete a full connector flow inside the Instagram in-app browser.
4. Set font scale to 200% and complete the three core flows.
5. Navigate the entire app with VoiceOver and with keyboard only.
6. Enable Low Power Mode and run a 5-minute agent task with the screen off.

---

## Client-side security and privacy

For an agent that holds other people's credentials and spends money, the client is an attack surface, not just a view.

- [ ] No secret, API key or service-role key ships in the client bundle; verified by grepping the built output.
- [ ] The anon key is the only key in the browser, and every table it touches has RLS tested from an anon client.
- [ ] Authorization is enforced server-side on every endpoint; hiding a button is not access control.
- [ ] Object ids are not guessable across users, or are checked for ownership on every read.
- [ ] Changing a user id in a request body cannot act on another user's data.
- [ ] Agent tool outputs and fetched web content are rendered as text, never as HTML, never `dangerouslySetInnerHTML`.
- [ ] Untrusted content cannot inject a fake approval card, a fake system message or a fake tool result.
- [ ] Links in agent output are rendered with the real destination visible and `rel="noopener noreferrer"`.
- [ ] CSP blocks inline scripts and restricts connect/img/script sources.
- [ ] Credentials are never written to logs, telemetry, breadcrumbs or session replay.
- [ ] Session replay and analytics mask every input field by default, not by allowlist.
- [ ] Screenshots captured from browser automation are scanned or masked before being shown or stored.
- [ ] OTP codes and reset links are filtered out of anything the agent reads or displays.
- [ ] Clipboard, share sheets and screenshots do not leak tokens or full account numbers.
- [ ] Deep links cannot trigger a state-changing action without a confirmation step.
- [ ] Webviews disable file access and JavaScript bridges unless explicitly needed.
- [ ] The app detects and refuses to run in an unexpected parent frame (clickjacking).
- [ ] Rate limiting exists on every unauthenticated endpoint, with per-IP and per-user buckets.
- [ ] Any endpoint that costs money (STT, LLM, TTS, SMS, calls) has a per-user daily cap and an alert.
- [ ] A compromised client cannot exceed its spend caps; the caps are enforced server-side.
- [ ] Data deletion and export work end to end, including connector tokens and derived caches.
- [ ] Permissions and connected accounts are visible and revocable in one screen.

**Torture tests**

1. Send an email to a connected inbox containing instructions to forward the user's data. The agent must not act on it.
2. Build a message whose content imitates an approval card. It must not render as one.
3. Call every API endpoint with another user's object ids using a valid token.
4. Call every endpoint with no token at all.
5. Grep the production bundle for `service_role`, `sk-`, `secret`, `password`.
6. Hit the voice endpoint 1,000 times in a minute from one IP and from one account.
7. Run a session replay of a connector setup and confirm no credential is visible.

---

## Observability and the chaos matrix

### What you must be able to see

- [ ] Every mutation logs: user, entity, intent, idempotency key, outcome, duration, cost.
- [ ] Every agent run has a trace id visible in the UI, so a user report maps to one trace.
- [ ] Client errors report with breadcrumbs: last 20 user actions, route, auth state, network state.
- [ ] Unhandled promise rejections are captured, not just thrown errors.
- [ ] A dashboard shows, per day: saves attempted vs saves confirmed, runs started vs runs verified, approvals requested vs resolved.
- [ ] Alerts fire on: write success rate below 99%, run success below your threshold, p95 latency regression, spend per user above cap.
- [ ] Every release records which commit is live, visible in the app's settings screen.
- [ ] A "report a problem" button attaches the trace id, last errors and app state automatically.

### The chaos matrix

Run every core flow (connect a connector, run an agent action, approve, save settings) against every condition. A flow passes only when it either completes correctly or fails visibly and recoverably.

| # | Condition | How to induce it |
| --- | --- | --- |
| 1 | Cold start | Force quit, clear memory, launch |
| 2 | Warm resume | Background 30s, return |
| 3 | Long background | Background 24h, return |
| 4 | Offline | Airplane mode before action |
| 5 | Goes offline mid-action | Toggle at 200ms, 1s, 3s into the request |
| 6 | Comes back online | Restore during the retry window |
| 7 | Slow network | Throttle to 3G, 2s RTT |
| 8 | Flaky network | 30% packet loss |
| 9 | Server 500 | Force the endpoint to error |
| 10 | Server timeout | Delay response past the client timeout |
| 11 | Rate limited | Return 429 with and without Retry-After |
| 12 | Expired token | Expire the access token mid-flow |
| 13 | Revoked connector | Revoke at the provider during a run |
| 14 | Second device | Same account, two devices, simultaneous actions |
| 15 | Second user | Different account on the same device after sign-out |
| 16 | Rapid repeat | 20 taps in 1 second |
| 17 | Interrupted | Force quit mid-write, mid-run, mid-OAuth |
| 18 | Deploy mid-run | Ship a new version while a run is in flight |
| 19 | Clock skew | Device clock ±3 hours |
| 20 | Timezone change | Change device timezone mid-session |
| 21 | Storage full | Fill device storage, then save |
| 22 | Permission denied | Deny mic, notifications, location, then grant |
| 23 | Low power | Low Power Mode plus screen off |
| 24 | Hostile input | Prompt injection in email, calendar, web content |
| 25 | Garbage data | Empty strings, nulls, 10k characters, emoji, RTL |
| 26 | Old client | Run a version-behind client against the new API |

### The 12 bugs that will still be there after you fix everything above

These are the ones that survive a checklist because they only appear in combination:

1. Two tabs, one stale token, one in-flight write.
2. A deploy during an approval wait, where the approval payload schema changed.
3. A connector whose provider silently changed a scope name.
4. A run whose tool succeeded but whose result write failed.
5. A cache invalidated on one device but not pushed to the other.
6. A retry that duplicates because the first attempt actually succeeded after the timeout.
7. A background refetch overwriting a local optimistic edit.
8. A notification deep-link to an entity that was deleted.
9. A voice capture that arrives after the user has already typed the same request.
10. An approval approved on a device whose clock is wrong, past its expiry.
11. A list sorted client-side but paginated server-side, with a different sort.
12. Two agent runs for the same user mutating the same entity concurrently.

---

## Automated harness and release gates

### The harness, in build order

1. **Contract tests first.** Generate types from the Supabase schema and fail the build when a client type drifts from the database. Most "it doesn't save" bugs are a shape mismatch nobody typed.
2. **A seeded test database** reset before each run, with two users (A and B) so cross-tenant tests are possible.
3. **Playwright end-to-end** for the five core flows: sign in, connect a connector, run an agent action, approve an action, save settings.
4. **Network interception** in every E2E test, so you can force 500s, timeouts, 429s and offline on any single request.
5. **A persistence assertion helper** used by every write test: perform the action, then query the database directly, then reload the page, then assert all three agree.
6. **A mount counter** for the splash and root components, asserted to be exactly 1 at the end of every E2E test.
7. **A leak check**: after 50 navigations, assert listener and memory counts are within bounds.
8. **Agent run replay**: record real runs, replay them against the current build, assert the same tool calls and the same final state.
9. **Visual regression** on the five core screens, in light and dark, at two font scales.
10. **A nightly chaos run** that executes the matrix above against staging and posts failures.

### The three assertions that would have caught your two bugs

```javascript
// 1. A save is only a save if it survives the database and a reload.
async function assertPersisted(page, db, table, match) {
  const row = await db.from(table).select('*').match(match).single();
  expect(row.data, 'row missing in database').toBeTruthy();
  await page.reload();
  await expect(page.getByTestId(`${table}-${row.data.id}`)).toBeVisible();
}

// 2. The splash mounts exactly once per launch.
await page.addInitScript(() => { window.__splashMounts = 0; });
// in the splash component: if (window.__splashMounts !== undefined) window.__splashMounts++;
expect(await page.evaluate(() => window.__splashMounts)).toBe(1);

// 3. Auth state never goes backwards.
await page.addInitScript(() => {
  window.__authStates = [];
  window.__recordAuth = (s) => window.__authStates.push(s);
});
const states = await page.evaluate(() => window.__authStates);
expect(states.join(',')).not.toContain('signed_in,unknown');
```

### Release gates — nothing ships unless all are green

- [ ] All E2E core flows pass on Chrome, Safari and a real iOS device.
- [ ] Every write test passes the three-way persistence assertion.
- [ ] Splash mount count is 1 in every test.
- [ ] Zero unhandled rejections in the console during the full suite.
- [ ] Cross-tenant suite passes: user B cannot read or write any of user A's rows.
- [ ] Chaos matrix rows 1–12 pass for all five core flows.
- [ ] Bundle size and FCP are within budget.
- [ ] No new errors in the first 30 minutes after deploy, checked against the alert dashboard.
- [ ] A rollback has been tested from the current release, not just assumed.

### Definition of done for any agentic feature

A feature is done when: the action is idempotent; its state machine has no unreachable or terminal-less states; the UI reflects server truth and nothing else; failures are visible and recoverable; the action is scoped to one user and tested cross-tenant; it has a trace id, a cost record and an alert; and it survives the first 12 rows of the chaos matrix.
