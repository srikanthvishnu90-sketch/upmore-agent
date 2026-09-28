#!/usr/bin/env python3
"""Full server eval runner - 117 questions, fresh user per batch"""
import json, subprocess, sys, os, uuid

EVAL_PATH = os.path.join(os.path.dirname(__file__), 'server_eval_full.json')
REF = "mrwngntwmnaqrqhupvlt"
PROJECT_URL = f"https://{REF}.supabase.co"

def get_keys():
    sys.path.insert(0, os.path.expanduser("~/workspace/skills/supabase/bin"))
    import sb
    status, keys = sb.req("GET", f"/projects/{REF}/api-keys")
    byname = {k["name"]: k["api_key"] for k in keys}
    return byname["service_role"], byname["anon"]

def curl(method, path, body=None, token=None, key=None):
    cmd = ["curl", "-s", "--max-time", "120", "-X", method,
           "-H", "apikey: " + key,
           "-H", "Authorization: Bearer " + (token or key),
           "-H", "Content-Type: application/json",
           PROJECT_URL + path]
    if body is not None:
        cmd += ["-d", json.dumps(body)]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=130).stdout
    try:
        return json.loads(out)
    except:
        return {"_raw": out[:500]}

def test_batch(questions, svc, anon, batch_name):
    email = f"evaltmp_{uuid.uuid4().hex[:8]}@example.com"
    user = curl("POST", "/auth/v1/admin/users",
                {"email": email, "password": "TmpEval123!x", "email_confirm": True},
                key=svc)
    uid = user.get("id")
    if not uid:
        print(f"Failed to create user for {batch_name}")
        return 0, []
    
    sess = curl("POST", "/auth/v1/token?grant_type=password",
                {"email": email, "password": "TmpEval123!x"}, key=anon)
    token = sess.get("access_token")
    if not token:
        curl("DELETE", f"/auth/v1/admin/users/{uid}", key=svc)
        return 0, []
    
    passed = 0
    failed = []
    for cat, q, must in questions:
        resp = curl("POST", "/functions/v1/agent-chat", {"message": q}, token=token, key=anon)
        reply = resp.get("reply", "")
        reply_lower = reply.lower()
        missing = [m for m in must if m.lower() not in reply_lower]
        if not missing:
            passed += 1
        else:
            failed.append({"q": q, "cat": cat, "missing": missing, "reply": reply[:300]})
    
    curl("DELETE", f"/auth/v1/admin/users/{uid}", key=svc)
    return passed, failed

def main():
    svc, anon = get_keys()
    eval_data = json.load(open(EVAL_PATH))
    
    batches = []
    for cat in ['refusals', 'adversarial', 'complex']:
        qs = [(cat, item['q'], item['must']) for item in eval_data.get(cat, [])]
        batches.append((cat, qs))
    
    total_passed = 0
    total_failed = []
    total_count = 0
    
    for batch_name, questions in batches:
        print(f"Testing {batch_name}: {len(questions)}...", flush=True)
        passed, failed = test_batch(questions, svc, anon, batch_name)
        print(f"  {batch_name}: {passed}/{len(questions)}", flush=True)
        total_passed += passed
        total_failed.extend(failed)
        total_count += len(questions)
    
    print("USER_DELETED", flush=True)
    print(f"\nSERVER: {total_passed}/{total_count} = {total_passed/total_count*100:.1f}%", flush=True)
    
    with open(os.path.join(os.path.dirname(__file__), 'server_eval_results.json'), 'w') as f:
        json.dump({"passed": total_passed, "total": total_count, "failed": total_failed}, f, indent=2)
    
    if total_failed:
        print(f"\n{len(total_failed)} failures:", flush=True)
        for x in total_failed[:25]:
            print(f"  [{x['cat']}] {x['q'][:60]}", flush=True)
            print(f"    missing: {x['missing']}", flush=True)

if __name__ == "__main__":
    main()
