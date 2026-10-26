# Invite waves (GB-01, ON-01), 2026-10-26

The owner asked for this on 2026-10-26: "not 100 people, as many people as much, just pushing the wave to see how much we can achieve". The waitlist gets in through widening waves. Each wave is gated by live health, and the owner approves each opening and each send.

## 1. Where the waitlist is (read-only, counts only, measured 2026-10-26)

| Place | What was found | How it was measured |
|---|---|---|
| `public.site_waitlist`, production `mrwngntwmnaqrqhupvlt` | **0 rows.** It has had 2 inserts since the stats reset of 2026-08-25, and both were deleted. | `count(*)`; `pg_stat_user_tables.n_tup_ins` / `n_tup_del` |
| `public.finance_waitlist` (Upmore, same project) | 1 row; the last insert was 2026-09-24 | `count(*)` |
| `site-signup` edge function (deployed v13, updated 2026-10-26 03:13 UTC) | It writes to `site_waitlist` in the same project, and it has had no calls in the last 24 hours | function source; `function_edge_logs` |
| Supabase `sporv` (`aveqjeafghmwafkbbnor`), `ring` (`kjwvqwkuprfhftmfflnu`) | No waitlist-like table. The largest tables there are 60 rows (sporv) and 7,284 rows (`ring_messages`). | `pg_class.reltuples` |
| Vercel project `trainee` | Production last READY 2026-10-20 from `main` (2026-10-22 build CANCELED). SSO protection is on every `*.vercel.app` domain and there is no custom domain, so the public can't reach it. It has no env vars. | Vercel API (read-only) |
| `trainee-six.vercel.app` (named in `site-signup`'s header) | There's no project of that name in the team this connector sees | Vercel `get_project` returned 404 |

**The ~98k people are not in any system this build can reach.** None of these places holds them: the three Supabase projects, the one Trainee Vercel project and the repo. The site's capture writes to `site_waitlist`, and that table has never held more than 2 rows. The list must come from somewhere else. Candidates are a different Vercel account behind `trainee-six.vercel.app`, a form or CRM tool, or a spreadsheet. Only the owner knows which one it is.

### Import steps (the owner; not run here)
1. Export the list as CSV with one row per signup and these columns:
   - `name`
   - `phone` in E.164 format, like `+13125550100`
   - `consent`: true only if the person checked the SMS box
   - `consent_text`: the exact words they agreed to
   - `consent_at`
   - `source`
   - `created_at`: the original signup time. This sets the invite order.

   A row without its consent words is never texted. TCPA's prior express written consent needs the wording on record.
2. Load it with psql, as the owner and in one transaction:
   ```sql
   begin;
   create temp table wl (name text, phone text, consent boolean, consent_text text, consent_at timestamptz, source text, created_at timestamptz);
   \copy wl from 'waitlist.csv' csv header
   insert into public.site_waitlist (name, phone, consent, consent_text, consent_at, source, created_at)
   select name, phone, consent, consent_text, consent_at, coalesce(source, 'import-2026-10'), created_at from wl
   where phone ~ '^\+[1-9][0-9]{7,14}$';
   select count(*) as loaded, (select count(*) from wl) as in_file from public.site_waitlist where source like 'import-%';
   commit;
   ```
   Duplicate numbers can stay. A wave takes the earliest signup for each number.

## 2. Wave mechanics (migration `20261026233017_career_invite_waves.sql`)
- **Open** (`career_wave_open(size, key, override_reason, now)`): takes the next N eligible people in signup order and makes them invites (`ready`), each with its own 32-character token. Nothing is sent.
  - Eligible means:
    - consent is given and its words are on record;
    - the number is valid;
    - it's the earliest signup for that number;
    - the number has no invite yet;
    - it's not opted out;
    - it has no account yet.
  - The same key is a no-op. Only one wave can be in progress at a time.
  - Opening is refused while a gate fails, or when the size is over the recommendation, unless the owner gives a reason. The reason is kept on the wave.
- **Review**: `career_wave_invite_list(wave)`, written to a local CSV by the script.
- **Approve** (`career_wave_approve_send(wave, text, sha256, count, now)`): the owner approves the exact template and the exact count. The template must:
  - name Trainee;
  - say STOP;
  - carry `{link}` (the web sign-up) and/or `{telegram}` (Telegram's Start), and no other placeholder;
  - be 600 characters or fewer.
- **Send** (`sendWave`, run by the owner with `scripts/launch/invite-wave.ts send`):
  - The sender claims one invite at a time.
  - Each person's text is the approved template with their own links, and the hash is checked again before the send.
  - Every result is recorded: sent (with the provider id, the token dropped, 14 days to use it) or failed (with the error).
  - A number that opted out is skipped.
  - Sending happens only 16:00–01:00 UTC, which is inside 8 am–9 pm in every continental US time zone. Numbers in area codes 808, 907, 671, 670 and 684, and numbers outside +1, are held.
  - The gates are checked first and every 50 sends. A failing gate closes the wave and holds whatever is unsent.
  - The channel is iMessage through LoopMessage (`channel = 'imessage'`). An `sms` invite is held as NOT_WIRED.
- **Redeem** (once per invite):
  - **Telegram**: `/start inv_<token>` makes the account for that chat (`career_invite_redeem_for`, then `createPerson`, then `career_invite_bind`). The turn then runs as `/start`, so the first reply is the 18+ question, sent through the outbox.
  - **iMessage**: the invited number's first text does the same (`career_invite_redeem_phone`).
  - **Web**: the first message carries `invite`, and it's redeemed as the signed-in person (`career_invite_redeem_own`).
  - What is refused:
    - A second chat with the same invite: "used".
    - A chat that already has an account: the invite isn't used up.
    - An expired, unknown or stopped invite.
  - `TRAINEE_ALLOWED_CONTACTS` stays the fallback for people who weren't invited.
- **Sign-up steps** (`career_signup.ts`, the first block in `handleChat`; only for accounts that came in by invite):
  - The first step is "Are you 18 or older?".
  - The second is the Terms of Service and Privacy Policy, each with its version and link.
  - Each acceptance becomes a `career_consents` row with:
    - the version;
    - the sha256 of the exact text shown;
    - the sha256 of the person's answer;
    - the channel.
  - The waitlist's SMS consent is recorded with its exact text.
  - STOP and "stop everything" always reach the existing account controls.

## 3. Gates (`career_wave_gate_rows(now)`, view `career_wave_gates`)
Every threshold is a column of `career_wave_policy`. **Every value is PROPOSED** and the owner sets them.

| Gate | Measure | Pass | Warn | Fail |
|---|---|---|---|---|
| signup_completion | Of the latest wave's invites sent 24 h or more ago, the share that finished sign-up | >= 0.20 | >= 0.10, or fewer than 20 to judge | < 0.10 |
| error_rate | The invited people's messages in 24 h: failed sends plus chat-down replies, over delivered plus failed. Web replies aren't in the outbox, so they aren't counted. | <= 2% | <= 5%, or fewer than 20 messages | > 5% |
| reply_truth | The newest `career_reply_truth_samples` row within 24 h (the live verification suite, PR #193, or the owner's own review) | >= 0.95 | >= 0.90, or no sample | < 0.90 |
| silent_outcomes | Invited people's applications that finished with no receipt, or have been stuck driving over 30 min | 0 | — | >= 1 |
| cost_per_active_usd | `agent_turn_costs` over 24 h, divided by the number of active people | <= $0.50 | <= $1.00, or unpriced calls, or nobody active | > $1.00 |
| telegram_429 | Telegram sends refused with 429 in 24 h | 0 | 1–19 | >= 20 |
| telegram_peak_per_min | The busiest minute of delivered Telegram messages | < 900 | >= 900 | — |
| openai_429 | `agent_provider_events` rows with status 429 in 24 h | 0 | 1–19 | >= 20 |
| cloud_site_pauses | Sites the cloud sender has paused right now | 0 | 1–2 | >= 3 |

The recommendation (`career_wave_recommendation(now)`) follows these rules:
- The first wave is `first_wave_size` (PROPOSED: 100).
- If every gate passes, the size doubles.
- If any gate warns, the size holds.
- If any gate fails, the recommendation is close (0).
- It is never more than the number of people still eligible.

Starting at 100, ten doublings reach 102,400, which is more than 98k.

## 4. Owner steps and decisions
1. **Find the 98k and import them** (section 1). Until then, a wave opens with 0 people.
2. Apply the migration `20261026233017_career_invite_waves.sql`. It's listed in go-live with its mark. Then redeploy `agent-chat`, `trainee-telegram` and `trainee-inbound`. All of this waits on the owner's hold on launch.
3. Set these environment variables:
   - `TRAINEE_TERMS_URL`, `TRAINEE_TERMS_VERSION`, `TRAINEE_PRIVACY_URL` and `TRAINEE_PRIVACY_VERSION`. Until they're set, sign-up stops at the terms step and says so.
   - `TRAINEE_APP_URL` and/or `TELEGRAM_BOT_USERNAME` for the links.
4. **Decision: people under 18.** The default is to block them (`TRAINEE_UNDER18_POLICY` unset). `allow` records the answer and goes on.
5. **Decision: the thresholds and the first wave size** in `career_wave_policy`.
6. **Decision: non-iPhone numbers.** LoopMessage sends iMessage. An SMS provider needs its own A2P 10DLC registration, and none is wired.
7. **Decision: web sign-up.** The web stays open to anyone signed in, as it is today. Only invited accounts go through the sign-up steps.
8. For each wave, run `invite-wave.ts` in this order: `gates`, `open`, `list` (review the list), `approve` (the exact text and count), `send`.

## 5. Not done
- **Telegram accounts**: on trunk, `createPerson` asks Supabase Auth for a user with neither an email nor a phone. Real Supabase refuses that. PR #194 fixes it. The flow test fakes GoTrue's create, so a live Telegram redemption needs #194.
- **The unsubscribe page**: the database side is `career_invite_stop(token)`, which anyone with the token can call. No web page calls it yet.
- **Failed sends**: they stay `failed`. There's no retry command.
- **Reply-truth samples**: nothing writes `career_reply_truth_samples` until #193's suite (or the owner) does. Until then the gate warns and the size holds.
