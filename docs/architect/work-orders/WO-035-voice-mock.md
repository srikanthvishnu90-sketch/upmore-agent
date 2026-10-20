# WO-035: The voice mock interview, and interview patterns for 50 firms

Status: built, voice off until the owner turns it on · Branch `wo/035-voice-mock` · Depends on: WO-025 (the text mock,
its rubric and debrief), WO-013 (the outbox and texting thread), D-002 (OpenAI only), D-015 (nothing during a live
interview).

Owner targets:
- "Start a 20-minute role-specific voice mock with one text; sub-second response feel."
- "Scored debrief within 2 minutes of hanging up."
- "Question banks for the top 50 companies' known interview patterns."

## What it does

### 1. One text starts a voice mock
- "start a voice mock for Goldman IB", "voice mock me for data analyst at Stripe", "start a 15 minute voice mock interview
  for software engineer at Meta", "start a mock interview by voice".
- A company on file named first now works for both mocks: "for Goldman IB" is company Goldman, role IB.
- The plan is the text mock's (`career_mock.ts start`): 20 minutes is 6 questions, role-specific, a company question only
  from the company's record or sourced patterns.
- The reply is plain text with the link bare on its own line:

  ```
  Voice mock: IB mock for Goldman Sachs. About 20 minutes, 6 questions, out loud. Open this link within 10 minutes. It works once, and only for you:
  https://<app>/voice/mock#t=v1.<claims>.<signature>
  Allow the microphone when your browser asks. Audio is never stored: only the words of the call are scored, and your debrief comes back here within 2 minutes of hanging up.
  Q4 comes from Goldman Sachs' record on file.
  ```
- The link (`career_voice_link.ts`):
  - signed: HMAC-SHA256 with a key derived from the service-role key;
  - bound to the account: the claims name the session and the user, and the session row must match both;
  - 10 minutes to start, checked twice (the signed expiry and the row's `link_expires_at`);
  - single-use: `career_voice_start` records the one start;
  - the token is after `#`, so the web host never sees it. No password or code is ever in chat.
- At most 5 voice sessions a person a day (the text mock has no limit).

### 2. The call (`voice/mock.html`, `supabase/functions/career-voice`)
- The page asks for the microphone first, so a blocked microphone never uses up the link. It then posts the token to
  `career-voice` `start`.
- The function mints an OpenAI Realtime client secret with the server's `OPENAI_API_KEY`. The browser never sees the key.
  The response carries only:
  - the `ek_...` secret (it lives 60 seconds);
  - the model;
  - a call token for the debrief.
- The browser opens WebRTC to `https://api.openai.com/v1/realtime/calls` with that secret. Events flow on the
  `oai-events` data channel.
- The interviewer (`career_voice.ts interviewerInstructions`):
  - asks the same 6 questions in order, each announced as "Question N.";
  - asks at most one follow-up per answer, from the person's own words;
  - never coaches or scores during the call;
  - never asks for a password, code or ID number;
  - stops on "I'm in my real interview" (D-015).
- About the company, the interviewer may say only:
  - with a record: the record's facts, each listed with its record field (`interview_styles`, `process_stages`,
    `screening_signals`) and its source label;
  - for a firm without a record: its sourced patterns, with their URLs;
  - with neither: an explicit instruction to say nothing about the company.
- The API shape used, with sources. platform.openai.com and developers.openai.com could not be opened from the build
  sandbox (the proxy refused both), so these were read on 2026-10-20 from OpenAI's own GitHub:
  - OpenAI's published OpenAPI spec, `github.com/openai/openai-openapi`, `master/openapi.yaml`:
    - `POST /v1/realtime/client_secrets` takes `{ expires_after: { anchor: "created_at", seconds 10..7200 }, session: { type: "realtime", model, instructions, audio } }`
      and returns `{ value: "ek_...", expires_at, session }`;
    - `POST /v1/realtime/calls` takes an `application/sdp` offer with the ephemeral token and returns the SDP answer;
    - `audio.input.transcription` takes `{ model }` (`gpt-4o-mini-transcribe` is listed);
    - `audio.input.turn_detection` takes `server_vad` or `semantic_vad`;
    - the server events used: `conversation.item.input_audio_transcription.completed`,
      `response.output_audio_transcript.done`, `input_audio_buffer.speech_stopped`, and
      `output_audio_buffer.started` ("WebRTC/SIP only");
    - the model list includes `gpt-realtime` and `gpt-realtime-mini`.
  - OpenAI's reference app, `github.com/openai/openai-realtime-console`, `server.js` and `client/components/App.jsx`:
    - the token route posts `{ session: { type: "realtime", model: "gpt-realtime", audio: { output: { voice: "marin" } } } }`;
    - the browser posts the SDP to `https://api.openai.com/v1/realtime/calls?model=...` with `Bearer <value>`;
    - it uses data channel `oai-events`.
- Configuration:
  - Model: `CAREER_VOICE_MODEL`, default `gpt-realtime-mini` (in the spec's list; cheaper than `gpt-realtime`).
  - Voice: `marin`.
  - Turn detection: `semantic_vad`, eagerness `auto`.
- Without the key: `start` answers `NOT_WIRED` (HTTP 200) and the link stays unused. The same holds without the owner's
  switch, `CAREER_VOICE=on`. The page says "Voice isn't on yet." and shows a one-tap "Do the text mock instead". The chat
  side says the same and gives the text-mock command. The OpenAI key is already set for the chat's model, so the key
  alone never starts spending on calls.
- Fallback: when the microphone is blocked, there is no WebRTC, the connection fails or OpenAI does not answer, the page
  says which and offers the text mock in one tap. `career_voice_fallback` then, once:
  - starts the same role and company as a text mock in the person's thread;
  - makes its first question the thread's last word, so the next text answers it;
  - texts it.

### 3. Transcript and debrief
- On hang-up, the page sends `{ who, text }` turns built only from the two transcript events, plus the latency samples.
  A turn with any other field (for example `audio`) is refused.
- `voiceDebrief` (`career_mock.ts`):
  - maps the person's turns to the planned questions by the "Question N." markers, or by the planned words;
  - scores each with 127's `scoreAnswer`, the text mock's rubric;
  - writes the WO-025 debrief, which quotes only the person's words. The interviewer's words are never scored or quoted.
  - Questions the call never reached are left out. Words about a real interview are never scored.
- `career_voice_finish` runs once, within the call window, in one transaction:
  - writes the debrief into the thread as Upmore's last word;
  - queues it once in the outbox (kind `mock`, key `mock:<session>`) when that thread is the texting thread;
  - the function then sends it at once when LoopMessage is wired. Otherwise the per-minute delivery run sends it.
- Audio is never stored:
  - the page never records or uploads it;
  - the transcript is scored in memory and dropped;
  - only the debrief text is kept;
  - the session row holds the plan and timestamps.
  The privacy text on the page says so.

### 4. Latency harness (NOT_RUN: Muse runs it tonight)
The sub-second feel is the Realtime API's own latency. It cannot be measured offline.

What the page measures, for every reply:
- `quiet->first audio`: from the person going quiet (last time the local microphone level was above 0.02 RMS) to
  `output_audio_buffer.started`. This is the "feel" number.
- `end-of-speech event->first audio`: from `input_audio_buffer.speech_stopped` to `output_audio_buffer.started`, the
  server's share.

Where the numbers go:
- the console, one `[voice-latency]` line per reply;
- the page's "Reply delay (for testing)" panel;
- the finish request, as `latency`. The function logs n, median and p90 of both: `career-voice: debrief posted in ...;
  reply delay after silence n=.. median=.. p90=..; after VAD ...`. Nothing is stored.

Steps for Muse:
1. The owner, from his own shell:
   - `bash scripts/launch/trainee-go-live.sh` (applies `20261021020000_career_voice_mock.sql` and deploys the staged
     agent-chat);
   - `supabase functions deploy career-voice --project-ref <ref> --no-verify-jwt`;
   - `supabase secrets set CAREER_VOICE=on --project-ref <ref>` (OPENAI_API_KEY is already set);
   - deploy the app to Vercel so `/voice/mock` is live.
2. From the test account's texting thread, text `start a voice mock for Goldman IB`.
3. Open the link in desktop Chrome with DevTools open (Console). Tap "Start the call" and allow the microphone.
4. Do the whole call: at least 10 answers, natural pauses, one deliberate "uhm" pause mid-answer. Note the clock time,
   then tap "Hang up".
5. Record:
   - every `[voice-latency]` line;
   - the panel's medians;
   - the `career-voice` log line (Supabase dashboard → Edge Functions → career-voice → Logs);
   - browser, device and network;
   - the time the debrief text arrived.
6. Pass:
   - the median of `quiet->first audio` is under 1,000 ms;
   - the debrief arrives within 2 minutes of hang-up.
7. If the median is over 1,000 ms: set turn detection to `{ type: "semantic_vad", eagerness: "high" }` (or `server_vad`
   with `silence_duration_ms: 500`) in `realtimeSecretRequest`, then run steps 2 to 6 again.
8. Also try a blocked microphone (deny the prompt) and airplane mode after start. Each must offer the text mock, and the
   tap must put its first question in the thread.

### 5. Interview patterns for 50 firms (`packages/career-data/interview-patterns.json`)
- The 50 are ASSUMED: the owner has not named them (WO-025). They are:
  - the 33 companies with a full record;
  - 17 more in the same four groups:
    - big tech: Meta, Apple, NVIDIA, Netflix, Salesforce;
    - banks: Bank of America, Citi, Barclays, Centerview Partners, Moelis & Company;
    - consulting: Accenture, Oliver Wyman, Kearney;
    - quant: Optiver, IMC Trading, Susquehanna (SIG), Citadel.
- Every pattern and every firm question carries a public `source_url`, a `source_type` (official, posting, reported,
  anecdotal) and a `checked` date. `patternProblems` enforces this, and WO-035/10 fails on any violation.
- **50 of 50 have sourced patterns.** Every one of them gets a sourced company question in a mock (WO-035/10):
  - 30 from their record, as before;
  - 3 records gained one sourced `interview_styles` fact each, because their usable fact was missing:
    - BCG: the record's own official style, restated as the statement;
    - Hudson River Trading: reported, tradermath.org;
    - Millennium: official, mlp.com/careers/students;
  - 17 from the new file:
    - 10 with at least one official or posting source: Meta (a 2022 Meta Careers post), NVIDIA, Salesforce, Citi,
      Moelis, Accenture, Optiver, IMC, SIG (a posting), Citadel (a 2022 Citadel article);
    - 7 on reported or anecdotal sources only: Apple, Netflix, Bank of America, Barclays, Centerview, Oliver Wyman,
      Kearney.
- **Firm-attributed questions: 0.** No source gave a question's exact wording attributed to one of these firms. That
  includes Accenture's official example topics, which are kept as a pattern, not as questions. So every question stays
  in the role banks. Nothing claims what a firm asked in the last 12 months.
- Caveat: firm pages could not be opened from the build sandbox. Each pattern restates a web-search summary of the cited
  page, and the file says so (`basis`, `method`). Before quoting a pattern as a firm's words, someone should open each
  URL. That is 26 patterns over 17 firms, plus the 2 new record facts from a fresh source.
- Matching is exact, as for records:
  - "Citadel" is the Citadel firm, never Citadel Securities (which has its own record);
  - "Meta Financial", "Apple Bank" and "Bain Capital" are nobody.

## Tests and how to run
- `deno test -A --no-check tests/architect/wo-035-voice-mock.test.ts` (11 tests):
  1. The voice commands; the text mock and the carrier words are unchanged.
  2. The start link: signed, bound to the account, 10 minutes, plain text and alone on its own line. The same plan as
     the text mock. Not wired without the key or `CAREER_VOICE=on`.
  3. The ephemeral-token function: never returns the real key, refuses without a valid signed link, and sends the key
     only to OpenAI.
  4. An expired or reused link is refused, including one signed by another key or for another person.
  5. NOT_WIRED without the key: the link is not used up. The text mock is one tap: same role and company, once. The page
     handles NOT_WIRED, a blocked microphone and WebRTC failure.
  6. The interviewer: the same plan in order, the record's facts each with its field, and nothing about a company with
     no record.
  7. The debrief: the rubric, scored per question over only the person's words. The interviewer's words are never
     quoted. A hang-up part way through, and a real interview, are handled.
  8. No audio is persisted: a grep of the handler, the function, the page and the migration, and every storage call of a
     whole call recorded. The only writes are the start and the debrief.
  9. The 2-minute path, timed offline on a 20-minute synthetic call, and once only.
  10. The 50 firms' sources: a firm question with no URL fails. 50 of 50 get a sourced company question. Exact matching.
  11. Wiring: `verify_jwt = false` with the link as the gate, app-only CORS, OpenAI only, and the migration's rules.
- `tests/db/career_voice_mock.test.sql`, run by `tests/db/run.sh` after the ledger, with the migration applied a second
  time. It covers:
  - own thread only;
  - 5 a day;
  - one start in 10 minutes, by the owner only;
  - one debrief, within the window, as the thread's last word and once in the outbox;
  - the text mock once;
  - service role only;
  - no audio field;
  - deleting the account removes the sessions.
- WO-025's 15 tests pass unchanged. The record count is still 33: the 17 new firms are in their own file, not new
  records.

## Planted defects (each a one-line change, each caught, each reverted)

| # | Defect | Failing test(s) |
|---|---|---|
| D1 | the start response carries the real OpenAI key (`client_secret: key`) | WO-035/3 |
| D2 | an expired link still verifies (expiry check off in `verifyToken`) | WO-035/2, WO-035/4, WO-035/9 |
| D3 | the OpenAI key alone turns voice on (no `CAREER_VOICE=on`) | WO-035/2, WO-035/5 |
| D4 | a transcript turn may carry more than words (an `audio` field accepted) | WO-035/8 |
| D5 | the interviewer's words are scored as the person's (`continue` removed in `answersFromTranscript`) | WO-035/7 |
| D6 | the link is put inline in a sentence instead of alone on its line | WO-035/2 |
| D7 | a firm question with no URL passes the source check | WO-035/10 |
| D8 | the page uses the link before asking for the microphone | WO-035/5 |

Command: the script plants each, runs `deno test -A --no-check tests/architect/wo-035-voice-mock.test.ts` and restores the
file. Each run exited 1 with the tests above failing.

## Measured numbers
- Hang-up to debrief posted, on a 20-minute synthetic call (6 questions, 2,827 words of the person's speech):
  - 2.0 ms in total, of which scoring was 1.4 ms;
  - 3.5 ms in total, of which scoring was 2.5 ms, on another run;
  - VERIFIED: `deno test -A --no-check tests/architect/wo-035-voice-mock.test.ts`, the line "WO-035 timing".
  - The rest of the 2 minutes is delivery. When LoopMessage is wired the function sends at once. Otherwise the
    per-minute delivery run sends it: at most about 60 s plus the run (ASSUMED from the every-minute schedule in
    `schedule-trainee-deliver.sql`).
  - Live hang-up to text arrival: NOT_RUN.
- Reply latency ("sub-second feel"): NOT_RUN (Muse, tonight, steps above).
- Staged career artifact: 3,991,526 B against the 4,200,000 B ceiling. VERIFIED, raw upper bound:
  `node scripts/career/stage-career.cjs <dir> --json` (esbuild unavailable here).
- Career bundle: 3,609,043 B. Full bundle: 6,549,748 B. VERIFIED: `python3 scripts/build-router-core.py`
  (`--career-only`); the patterns file adds about 22 KB.
- Cost per voice mock: NOT_RUN. No price was checked (the OpenAI pricing page was unreachable). Read the usage of the
  first test call on the OpenAI dashboard before turning voice on for anyone. A voice minute costs far more than a text
  turn, which is why `CAREER_VOICE=on` is a separate owner switch, and there is a 5-a-day limit.

## What is NOT built, and why
- **Live verification.** No call has been made: no deploy, no key, no spend (owner rule). Latency, live debrief arrival
  and cost are NOT_RUN.
- **The DB test was not run here.** This session's isolation guard refused `su tester` and `runuser`, so
  `tests/db/run.sh` could not be run as a non-root user. The migration and the test were parsed by the real Postgres
  parser (pglast/libpg_query; every statement and the four PL/pgSQL bodies parse). Run
  `su tester -c 'cd <worktree> && PGBIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1) bash tests/db/run.sh'` before
  merging.
- **The go-live script does not deploy `career-voice`.** Turning voice on is the owner's decision (spend). Step 1 of the
  Muse steps has the commands.
- **The firm pages were not opened** (sandbox). Patterns restate search summaries of the cited pages, and the file says
  so. Spot-check the URLs.
- **Firm question banks.** No question could be sourced verbatim to a firm, so the firms' `questions` lists are empty.
  The mock uses each firm's sourced pattern instead.
- **The pre-interview brief** (`interview_brief`) still reads records only. It does not read the new patterns file.
- **Old text left as it was.** 127's `voiceMockAvailability()` still reports no voice rail (the router path's text), and
  the text mock's opening line still says "(voice comes later)", which WO-025/2 pins. The fallback text drops that phrase.
- **The 50.** The list is ASSUMED. The owner should name it, for example by frequency in `career_postings` for our users.
- **Sessions in two places.** A voice session started from the web app's thread posts its debrief there. It is texted
  only when that thread is the person's texting thread.
