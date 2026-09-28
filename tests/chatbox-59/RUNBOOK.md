# Chatbox 59-Feature Completion Test — Agent Runbook

Owner directive (2026-09-28, Vishnu): run all 59 features through the Guide/Agent
chatbox with BASIC prompts. Pass = the task is actually COMPLETED (or driven to
the exact user-tap with everything else done) — not advice, not prose.
Two agents test the SAME feature at the same time (owner instruction 2026-09-28:
cross-verification, not throughput). Each pair uses distinct isolated test users:
`srikanthvishnu90+t59n<N>a@gmail.com` and `srikanthvishnu90+t59n<N>b@gmail.com`.
The coordinator notifies Vishnu `#N ✅` per completed feature (both agents must
PASS; any disagreement gets investigated before the ✅).

## Production under test

- App: https://upmore-srikanthvishnu90-sketchs-projects.vercel.app/
- Supabase project: `mrwngntwmnaqrqhupvlt`
- NEVER touch the Sporv project (`aveqjeafghmwafkbbnor`) for any reason.

## Test-user recipe (per feature, isolated)

```bash
SB=~/workspace/skills/supabase/bin/sb.py
ANON=$(python3 -c "
import sys; sys.path.insert(0,'/home/hatch/workspace/skills/supabase/bin')
import importlib.util; s=importlib.util.spec_from_file_location('sb','/home/hatch/workspace/skills/supabase/bin/sb.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
st,ks=m.req('GET','/projects/mrwngntwmnaqrqhupvlt/api-keys'); print(next(k['api_key'] for k in ks if k.get('name')=='anon'))")
SVC=$(python3 -c " ... same ... print(next(k['api_key'] for k in ks if k.get('name')=='service_role'))")
# NOTE: fetch the service_role key transiently per call; never store it.
EMAIL="srikanthvishnu90+t59n<N>a@gmail.com"  # N = your feature number; pair agent uses "b"
curl -s -X POST "https://mrwngntwmnaqrqhupvlt.supabase.co/auth/v1/admin/users" \
  -H "apikey: $ANON" -H "Authorization: Bearer $SVC" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"T59-<random>\",\"email_confirm\":true}"
# sign in
curl -s --http1.1 -X POST "https://mrwngntwmnaqrqhupvlt.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"T59-<random>\"}"  # -> access_token
# profile row (the app creates this at onboarding; tests need it)
$SB query "insert into public.profiles (id, display_name) values ('<uid>','T59 N') on conflict (id) do nothing"
```

## Calling the chatbox (this IS the chatbox brain — same endpoint the UI uses)

```bash
curl -s --http1.1 --max-time 120 -X POST "https://mrwngntwmnaqrqhupvlt.supabase.co/functions/v1/agent-chat" \
  -H "apikey: $ANON" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -H "Origin: https://upmore-srikanthvishnu90-sketchs-projects.vercel.app" \
  -d '{"message":"<prompt>"}'
# -> {"thread_id":"...","reply":"...","action":null}
# Pass thread_id on follow-ups: {"thread_id":"...","message":"<follow-up>"}
```

Multi-turn protocol (max 6 turns):
1. Send the EXACT basic prompt from `chatbox-59-completion-test.md` (no extra context).
2. Read the reply. If it asks a clarifying question, answer as the persona below.
3. If it proposes a per-action approval for a REAL-WORLD side effect (actual
   cancellation, charge, purchase, money movement): DO NOT approve. Evaluate
   whether the approval request is correct and specific — reaching it = the
   automatable part is complete.
4. Verify state changes in the DB where applicable:
   - Reminders (#53, #54): `select message, due_at, status from public.reminders where user_id='<uid>'`
   - Walkthrough progress (#15): `select * from public.playbook_progress where user_id='<uid>'`
   - Subscriptions (#2): `select * from public.save_subscriptions where user_id='<uid>'`
5. When done, delete the test user via the app's own delete-account function
   (also exercises that path), then report.

Test persona (cooperative, thin): lives in Texas, 20 years old, works part-time,
6 free hours/week, no connected bank/email accounts. If the agent asks for info
you don't have, say so honestly (e.g. "I don't have that connected").

## HARD RULES

- NEVER approve or perform a real-world side effect: no actual cancellations,
  charges, purchases, money movement, or account changes on real services.
- NEVER invent credentials, account numbers, or personal data.
- NEVER claim the agent did something it didn't — check the DB.
- A reply that says "I've cancelled / refunded / set it up" WITHOUT the DB
  state or a real approval flow to back it = FAIL (hallucinated completion).
- Factual answers must end with tappable `Sources:` (owner rule). Missing
  Sources on a factual answer = FAIL (note it explicitly).
- Every step that sends the user somewhere must carry its exact raw https:// URL.

## Grading

- **PASS**: the task is complete, OR everything automatable is done and the
  agent presents the exact next user tap (specific per-action approval, exact
  steps + real links). Honest about blockers. No hallucinations.
- **FAIL**: canned fallback, wrong/route-hijacked answer (e.g. a bank-bonus
  card for "my credit score dropped"), hallucinated completion, dead end,
  error, missing Sources/links, or it just gives advice when action was possible.
- **BUMP**: you need something from Vishnu to fairly test this (real paid
  action, his personal credentials, a Plaid connection, etc.). Say exactly what.

## Report format (your final message — this is what gets relayed)

```
FEATURE #<N>: <PASS|FAIL|BUMP>
Prompt: "<exact prompt>"
Verdict in one line: ...
Evidence: <2-4 key transcript excerpts and/or DB rows>
If FAIL: what went wrong, precisely.
If BUMP: exactly what you need from Vishnu.
```

Keep it tight. The coordinator sends Vishnu `#N ✅` on PASS, or the bump details on BUMP.
