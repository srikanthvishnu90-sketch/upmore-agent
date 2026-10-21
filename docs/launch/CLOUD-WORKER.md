# The cloud worker (WO-039): owner runbook

The cloud worker sends approved applications for people who turned it on in chat. It runs on the D-010 VM (Hetzner
CPX32-class, 4 vCPU / 8 GB), which holds only this worker and its service key. It is off until you turn it on, and on
each portal family (Greenhouse, Lever, Ashby) it sends nothing until the database's gate opens.

The gate opens for a portal family only after 3 applications there meet all of these:
- they were sent by hand (your own computer or the extension);
- they were sent by someone you list as a gate tester (`gate_user_ids`, section 5);
- each was confirmed by the employer's own email, through WO-032's confirmation path.

`career_apply_cloud_open('lever')` says whether it is open. Cloud submissions never count toward it, and nobody
outside your list ever does. With no list, the gate is closed.

What it can do today, plainly:
- **Lever only.** Greenhouse's and Ashby's forms submit from page script, so they need the person to press Submit, and
  the cloud never claims them.
- **At most 50 a day per person** (D-011: 25 by default). 100 to 150 a day needs your written amendment of D-011.
- **The bot-check rate is not measured** (NOT_RUN). Every captured form loads a check scored at Submit, and only real
  submissions show how often it challenges a server. The throttle pauses a portal at the first failures.

What the worker never does:
- send anything the person did not approve on a card (the engine checks the approval hash before the click);
- solve or get around a verification check (the job goes back to the person with its link);
- run for a person who did not say yes to the exact terms in chat;
- go over the person's daily limit (25 by default, 50 at most), or send to the same company twice within 30 days.

## Captured Lever handoff before a live application

The delivery path is `workers/career-browser/approve-first.ts` (`prepare`), the approved `career_apply_jobs` queue,
`workers/career-cloud/worker.ts` (`cloudLoop`), and `scripts/apply.ts --submit --approved <engine approval>`.
Preparation shows every answer and its source on the card. The later drive reconstructs those approved sources,
checks the queued owner, posting, schema and approval, and reads back the employer's form before its one submission.
A changed application stops. A required answer without support goes back as a question, never a guess.

For a retained handoff proof using the captured Veeva Lever form, an invented TEST person, and a loopback employer:

```sh
deno run -A evals/apply/lever-driver-readiness.ts --out /tmp/lever-readiness-proof
```

Use the same sandboxed Chromium and Playwright environment as the gate. The output folder must be new. The command
accepts no employer URL, account, credential or person's facts. It runs the canonical engine twice: preparation without
`--submit`, then one approved submission through the cloud loop. The in-memory queue is only a local stand-in for the
already-gated database queue; it cannot open or exercise the production gate.
The `Captured Lever driver receipt` workflow runs the same command in CI and retains its synthetic artifact for seven
days. It has read-only repository access and receives no application or provider credentials.

The private folder retains `prepared.json` (card and exact payload), `approval.json` (the invented owner's approval),
the engine's masked screenshots and evidence, and `receipt.json`. The receipt includes the source revision, captured
fixture hash, approval hashes, received multipart fields and resume hash, worker result, screenshot hashes and timing.
Every check must be true: one engine submission, one employer POST, one final record, exactly the approved nonempty
answers and resume, a captured page confirmation, retained screenshots, and removal of the worker's temporary files.
This command supplies the clean handoff artifact. The captured-form negative controls remain in
`tests/career-cloud-worker-lever.test.cjs` for QA: quarantined, changed, cross-owner and unsupported answers must stop,
and unsupported answers must return their questions. Both judge approvals and green CI remain release requirements.

Lever's scripts and Submit-time hCaptcha are absent in the local capture; the button is wired only to its existing
form. A local success therefore proves the approved application and receipt path, not live acceptance or challenge rate.
The receipt uses the canonical `receiptText` and says the page reported receipt while the employer's email is pending.
Production `career_apply_cloud_finish` similarly stores a page confirmation as `submitted_unconfirmed`; only the
employer-email matcher changes it to `confirmed`.

The next live gate remains three approved hand submissions by listed gate testers on Lever, each matched to the
employer's confirmation email (section 6). Real submissions need the owner's approval of each exact payload. The owner
then controls the cloud kill switch and each person's explicit cloud opt-in. A local artifact changes none of these.

## 1. Set up the VM (once)

As root on a fresh Ubuntu 24.04 VM:

```
apt-get update && apt-get install -y git unzip ca-certificates fonts-liberation libnss3 libatk-bridge2.0-0 \
  libgtk-3-0 libgbm1 libasound2t64 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libpango-1.0-0 libcups2
useradd --create-home --shell /bin/bash trainee
```

As the `trainee` user (`su - trainee`):

```
curl -fsSL https://deno.land/install.sh | sh -s v2.9.6        # Deno, pinned
curl -fsSL https://fnm.vercel.app/install | bash && fnm install 22   # Node, for Playwright
git clone https://github.com/srikanthvishnu90-sketch/upmore-agent.git ~/upmore-agent
cd ~/upmore-agent && git checkout trunk
npm install --prefix ~/pw playwright@1.64.1 && ~/pw/node_modules/.bin/playwright install chromium
mkdir -m 700 ~/trainee-evidence
```

Chromium runs with its sandbox on. Never set `UPMORE_CHROMIUM_SANDBOX=off`, and never run the worker as root.

## 2. The secrets: an env file with 0600 permissions, never in the repo

As root:

```
install -d -m 700 -o trainee -g trainee /etc/trainee
install -m 600 -o trainee -g trainee /dev/null /etc/trainee/cloud.env
nano /etc/trainee/cloud.env
```

Its contents (type the key yourself; it never goes in chat, a commit or a log):

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<the service role key>
UPMORE_CLOUD_ENV_FILE=/etc/trainee/cloud.env
UPMORE_PLAYWRIGHT_PATH=/home/trainee/pw/node_modules/playwright
CLOUD_CONTEXTS=3
CLOUD_EVIDENCE_DIR=/home/trainee/trainee-evidence
```

The worker refuses to start when this file is readable by anyone but its owner, when the key is not the service key,
or when the gate function is not in the database.

## 3. The systemd unit

`/etc/systemd/system/trainee-cloud.service`:

```
[Unit]
Description=Trainee cloud worker (WO-039)
After=network-online.target
Wants=network-online.target

[Service]
User=trainee
Group=trainee
EnvironmentFile=/etc/trainee/cloud.env
WorkingDirectory=/home/trainee/upmore-agent
ExecStart=/home/trainee/.deno/bin/deno run -A workers/career-cloud/worker.ts
Restart=on-failure
RestartSec=30
# A stop signals the worker only (KillMode=mixed). It stops claiming, and the engine runs in flight finish and are
# recorded (each is at most 10 minutes). Only after TimeoutStopSec is anything killed. A run killed by a stop is
# recorded "interrupted", which the throttle never counts as a failure.
KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=660
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```

## 4. Start, stop, watch

```
systemctl daemon-reload
systemctl enable --now trainee-cloud     # start, and start again after a reboot
systemctl stop trainee-cloud             # stop: no new claims; the ones in flight finish and are recorded (up to 11 min)
systemctl status trainee-cloud
journalctl -u trainee-cloud -f           # one line per application: its id, state, outcome; never an answer
```

Before the first start, apply the migration `20261021080000_career_apply_cloud.sql` (go-live does, in order). Without
it the worker prints `GATE_FUNCTION_MISSING` and exits.

## 5. The kill switch

The worker reads the switch from the database on every claim. It is off until you turn it on.

In the Supabase SQL editor:

```
-- On (after the VM is set up and you have read the report below):
insert into career_cloud_settings(key, value) values ('CAREER_CLOUD_APPLY', 'on')
  on conflict (key) do update set value = 'on', updated_at = now();
-- Off, at once, for everyone (applications in flight finish; nothing new is claimed):
update career_cloud_settings set value = 'off', updated_at = now() where key = 'CAREER_CLOUD_APPLY';
-- Who is told when a portal or a person is paused (your own Upmore user id):
insert into career_cloud_settings(key, value) values ('owner_user_id', '<your user id>')
  on conflict (key) do update set value = excluded.value, updated_at = now();
-- The gate testers: the only people whose hand submissions count toward the gate (a Postgres array of user ids).
-- Empty, missing or unreadable: the gate stays closed for everyone.
insert into career_cloud_settings(key, value) values ('gate_user_ids', '{<your user id>}')
  on conflict (key) do update set value = excluded.value, updated_at = now();
```

The other stop is `systemctl stop trainee-cloud` on the VM. Either one alone stops new submissions.

## 6. The gate and your hand submissions

Each of your first real applications per site is sent from your own computer (`docs/apply/owner-first-trials.md`).
Record each one so its confirmation email can count:

```
deno run -A workers/career-browser/approve-first.ts record <evidence folder apply.ts printed>
```

Everything recorded comes from the engine's own evidence: the posting, the employer, and the page it was sent from.
Nothing is typed on the command line.

When the employer's "we received your application" email arrives, the mail tracking run (WO-024) records it. WO-032's
matcher (`career_apply_confirm_as`) then marks the application confirmed; it checks the sender is the ATS or the
employer's own domain. That path is the only way a row is confirmed. A page's "thank you" alone never confirms one. Check
the gate:

```
select career_apply_cloud_open('greenhouse'), career_apply_cloud_open('lever'), career_apply_cloud_open('ashby');
```

Each person who turns the cloud on uploads the resume it may send, from their own computer. An erase ("forget my career
profile") deletes it and the opt-in at once, whether or not the cloud is on:

```
deno run -A workers/career-browser/approve-first.ts cloud-resume <resume.pdf>
```

## 7. Reading the telemetry report

```
select jsonb_pretty(career_apply_cloud_report(7));
```

For each portal family it gives:
- `gate_open`, and `paused_until` if paused;
- `window_attempts`, `window_failures` and `window_failure_rate`: the last 50 attempts since the last pause, with their
  counts;
- `bot_checks_last_20`;
- `counts`: submitted, confirmed (by the employer's email), bot_check, error, not_sent, interrupted (a deliberate stop, never a
  failure), over the last 7 days;
- `errors`: each error by its code.

`people` gives the same counts per person, and their pause. `kill_switch_on` says whether the switch is on.

The throttle, automatic:
- A portal pauses for the cloud for 6 hours when 2% of its window failed (a bot check or an error; with 50 attempts that
  is one failure), or at 2 bot checks in its last 20 attempts.
- A person's cloud runs pause until the next UTC day after 2 bot checks in one day.
- The person and you are each told once per pause. Their own computer is never paused by this.
- Not sent by design (an application that changed after approval, a question never answered) is not a failure.

## 8. Evidence on the VM

Each application leaves a private folder under `CLOUD_EVIDENCE_DIR`:
- `evidence.json`: the answers, the employer's response, the time;
- `before-review.png` and `after-submit.png`, with every form field masked.

The queue row keeps the answers, the response, the screenshot hashes and the time. The employer's confirmation comes
later, from the person's mail. Delete folders older than 30 days:

```
find /home/trainee/trainee-evidence -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
```
