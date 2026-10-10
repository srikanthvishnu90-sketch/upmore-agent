#!/usr/bin/env python3
"""Optional owner-requested Claude review, with no tools or write authority.

Billing: the Claude CLI runs on the owner's subscription login. ANTHROPIC_API_KEY
and ANTHROPIC_AUTH_TOKEN are stripped so the CLI can never switch to API billing.

Sandbox: the CLI reads its login from the macOS keychain and needs network
access. Inside a Codex sandbox (workspace-write, network_access=false) it
reports "Not logged in" even though the owner is logged in. Run this script
outside the sandbox (escalated permissions) or ask the Claude session to run it.
A failed run never overwrites an earlier successful review.
"""
from pathlib import Path
import os
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
paths=['supabase/functions/_shared/workflow_service.ts',
       'supabase/functions/_shared/payment_service.ts',
       'packages/domain/36-agent-workflows.js']
prompt='''Review the following Upmore code as an independent skeptical reviewer.
You have no tools or write authority. Do not infer production access.
Find concrete financial-authority, idempotency, owner isolation, retry, stale
data and false-completion bugs. Each finding needs a path, exact code trigger,
impact and a targeted regression test. Separate actual defects from launch
prerequisites. Focus on user bill-entry retries and general bill payments.
Do not request secrets or external actions. Keep the review under 900 words.
'''
for path in paths:prompt+='\nFILE '+path+'\n'+(ROOT/path).read_text()+'\n'
env={k:v for k,v in os.environ.items() if k not in ('ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN')}
result=subprocess.run(['claude','-p','--tools','','--safe-mode','--strict-mcp-config',
                       '--mcp-config','{"mcpServers":{}}','--no-session-persistence',
                       '--max-budget-usd','3'],input=prompt,text=True,capture_output=True,cwd=ROOT,env=env)
text=result.stdout+result.stderr
output=ROOT/'docs/testing/claude-review.txt'
output.parent.mkdir(parents=True,exist_ok=True)
if result.returncode!=0 or 'Not logged in' in text or not result.stdout.strip():
    print('Claude review FAILED (exit',result.returncode,'); previous review left untouched at',output.relative_to(ROOT))
    if 'Not logged in' in text:
        print('Cause: the CLI cannot reach the keychain/network. This happens inside the Codex sandbox '
              '(network_access=false). The owner IS logged in; rerun outside the sandbox with escalated '
              'permissions, or ask the Claude session to run scripts/run-claude-review.py.')
    print(text[-2000:])
    sys.exit(result.returncode or 2)
output.write_text(text)
print('Claude review exit: 0 ; output:',output.relative_to(ROOT))
print(text[-5000:])
