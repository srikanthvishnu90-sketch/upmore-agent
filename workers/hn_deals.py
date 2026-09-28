#!/usr/bin/env python3
"""Upmore live-deals scraper v1 — Hacker News "Who is hiring?" threads.

Polls the official HN APIs (Firebase + Algolia, both TOS-friendly and free)
for the latest monthly "Who is hiring?" thread, extracts paid gig/contract
posts, dedupes against live_opportunities, and marks stale ones expired.

This is Category A1 of the 100bp rubric: minute-by-minute is the goal;
v1 polls every 10 minutes via cron (HN threads move slowly anyway).

Run: cron */10 * * * *
"""
import html
import json
import re
import subprocess
import sys
import time
import urllib.request

SB = ["python3", "/home/hatch/workspace/skills/supabase/bin/sb.py", "query"]
ALGOLIA = "https://hn.algolia.com/api/v1/search?query=Who%20is%20hiring%3F&tags=story&hitsPerPage=25&numericFilters=created_at_i%3E__SINCE__"
FB = "https://hacker-news.firebaseio.com/v0/item/%s.json"

# Scored gig detection: gig signals early in the post count most; a bare
# "contract" buried among "Full-time/Contract/Intern" doesn't qualify.
STRONG_GIG = re.compile(r"\b(freelance|freelancer|gig|1099|contractor|per.?hour|hourly)\b", re.I)
WEAK_GIG = re.compile(r"\b(contract|part.?time|project.?based|short.?term)\b", re.I)
FULLTIME = re.compile(r"\b(full.?time|FTE|W-?2)\b", re.I)
# Hard rejects: scams, crypto-pay, "DM me" vagueness
REJECT = re.compile(
    r"\b(crypto|bitcoin|usdt|forex|betting|casino|adult|escort)\b", re.I
)
PAY = re.compile(r"\$\s?[\d,]+(?:\s?[-–]\s?\$?\s?[\d,]+)?(?:\s?/\s?(hr|hour|mo|month|project))?", re.I)


def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "UpmoreDealsBot/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def q(sql):
    r = subprocess.run(SB + [sql], capture_output=True, text=True, timeout=120)
    try:
        return json.loads(r.stdout)["result"]
    except Exception:
        print("SB QUERY FAILED:", r.stdout[:200])
        return None


def esc(s):
    return (s or "").replace("'", "''")


def main():
    # 1. Latest "Who is hiring?" thread (retry on flaky reads)
    threads = []
    since = int(time.time()) - 86400 * 90  # last 90 days only
    for attempt in range(3):
        try:
            res = get(ALGOLIA.replace("__SINCE__", str(since)))
            threads = [h for h in res.get("hits", [])
                       if (h.get("title") or "").startswith("Ask HN: Who is hiring")]
            if threads:
                break
        except Exception as e:
            print("algolia attempt", attempt + 1, "failed:", e)
            time.sleep(2)
    if not threads:
        print("no hiring thread found")
        return
    # Pick the newest by creation date, not the first hit
    threads.sort(key=lambda h: h.get("created_at_i", 0), reverse=True)
    # Freshness guard (beta fix 2026-09-24): on 2026-09-23 the scraper picked
    # stale thread 22665398 instead of the current month's 49522897. Never
    # scrape a thread older than 35 days or one whose title doesn't match the
    # current month/year — a stale "live" lane is worse than an empty one.
    now = time.time()
    best = threads[0]
    age_days = (now - best.get("created_at_i", 0)) / 86400
    title = best.get("title") or ""
    import datetime as _dt
    cur = _dt.datetime.now(_dt.timezone.utc)
    month_ok = cur.strftime("%B %Y") in title  # e.g. "September 2026"
    if age_days > 35 or not month_ok:
        print(f"STALE THREAD REJECTED: {best['objectID']} {title!r} "
              f"({age_days:.0f}d old, month_ok={month_ok}) — skipping run")
        return
    story_id = best["objectID"]
    print("thread:", story_id, title)

    # 2. Existing source_ids (dedupe)
    seen = set()
    rows = q("SELECT source_id FROM live_opportunities WHERE source='hackernews'")
    if rows:
        seen = {r["source_id"] for r in rows}

    # 3. Fetch kids
    try:
        story = get(FB % story_id)
    except Exception as e:
        print("story fetch failed:", e)
        return
    kids = (story.get("kids") or [])[:150]
    print("kids to scan:", len(kids))

    added, skipped = 0, 0
    for kid in kids:
        sid = str(kid)
        if sid in seen:
            skipped += 1
            continue
        try:
            item = get(FB % sid)
        except Exception:
            continue
        text = html.unescape(re.sub(r"<[^>]+>", " ", item.get("text") or ""))
        if not text or len(text) < 60:
            continue
        if REJECT.search(text):
            continue
        head, tail = text[:200], text[200:]
        score = (2 if STRONG_GIG.search(head) else 0) + (1 if WEAK_GIG.search(head) else 0) \
            + (1 if STRONG_GIG.search(tail) else 0) - (2 if FULLTIME.search(head) and not STRONG_GIG.search(head) else 0)
        if score <= 0:
            continue
        pay = PAY.search(text)
        title = text[:140].strip().rsplit(" ", 1)[0] + "…"
        url = "https://news.ycombinator.com/item?id=%s" % sid
        posted = item.get("time")
        q(
            "INSERT INTO live_opportunities "
            "(source, source_id, title, url, snippet, pay_hint, posted_at) VALUES "
            "('hackernews', '%s', '%s', '%s', '%s', %s, %s) "
            "ON CONFLICT (source, source_id) DO NOTHING" % (
                sid, esc(title), esc(url), esc(text[:600]),
                ("'%s'" % esc(pay.group(0))) if pay else "NULL",
                ("to_timestamp(%d)" % posted) if posted else "NULL",
            )
        )
        added += 1
        seen.add(sid)

    # 4. Expire anything not seen in 14 days
    q("UPDATE live_opportunities SET status='expired' "
      "WHERE source='hackernews' AND status='live' "
      "AND last_verified_at < now() - interval '14 days'")
    # 5. Touch verified timestamp on the thread's live items
    if seen:
        q("UPDATE live_opportunities SET last_verified_at=now() "
          "WHERE source='hackernews' AND status='live'")
    print("added: %d, skipped: %d" % (added, skipped))


if __name__ == "__main__":
    main()
