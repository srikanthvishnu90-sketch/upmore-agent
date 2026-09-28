#!/usr/bin/env python3
"""Server eval runner - tests agent-chat with authenticated user."""
import json, subprocess, sys, os, time

EVAL_PATH = os.path.join(os.path.dirname(__file__), 'server_eval.json')
SUPABASE_URL = "https://mrwngntwmnaqrqhupvlt.supabase.co"
ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

def sb_query(sql):
    """Run SQL via sb.py"""
    result = subprocess.run(
        ["python3", os.path.expanduser("~/workspace/skills/supabase/bin/sb.py"), "query", sql],
        capture_output=True, text=True, env={**os.environ, "SUPABASE_REF": "mrwngntwmnaqrqhupvlt"},
        timeout=30
    )
    return result.stdout

def create_user():
    email = f"evaltmp_{int(time.time())}@example.com"
    pw = "TempPass123!"
    # Use GoTrue admin API via sb.py? Simpler: use signup via curl
    import urllib.request, urllib.parse
    data = json.dumps({"email": email, "password": pw}).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/auth/v1/signup",
        data=data,
        headers={"apikey": ANON_KEY, "Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.load(r)
            return email, pw, resp.get("access_token")
    except Exception as e:
        print(f"Signup failed: {e}")
        return None, None, None

def chat(token, message):
    import urllib.request
    data = json.dumps({"message": message}).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/functions/v1/agent-chat",
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "apikey": ANON_KEY,
            "Content-Type": "application/json"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            resp = json.load(r)
            return resp.get("reply", "")
    except Exception as e:
        return f"ERROR: {e}"

def delete_user(email):
    # Get user id via query, then delete via admin API
    # Simplified: just log
    print(f"Note: delete {email} manually if needed")

def main():
    if not ANON_KEY:
        print("Set SUPABASE_ANON_KEY env var")
        sys.exit(1)
    
    eval_data = json.load(open(EVAL_PATH))
    questions = []
    for cat, items in eval_data.items():
        for item in items:
            questions.append((cat, item["q"], item["must"]))
    
    print(f"Testing {len(questions)} questions...")
    email, pw, token = create_user()
    if not token:
        print("Failed to create user")
        sys.exit(1)
    
    passed = 0
    failed = []
    for i, (cat, q, must) in enumerate(questions):
        reply = chat(token, q)
        reply_lower = reply.lower()
        missing = [m for m in must if m.lower() not in reply_lower]
        if not missing:
            passed += 1
            print(f"  PASS [{cat}] {q[:50]}")
        else:
            failed.append((q, missing, reply[:200]))
            print(f"  FAIL [{cat}] {q[:50]} missing={missing}")
    
    print(f"\n{passed}/{len(questions)} = {passed/len(questions)*100:.1f}%")
    if failed:
        print(f"\n{len(failed)} failures:")
        for q, missing, reply in failed[:10]:
            print(f"  Q: {q}")
            print(f"  Missing: {missing}")
            print(f"  Reply: {reply[:150]}")
    
    delete_user(email)

if __name__ == "__main__":
    main()
