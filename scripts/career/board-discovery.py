#!/usr/bin/env python3
"""Board discovery run (BUG-096): find and VERIFY public ATS boards for US employers.

Candidates come from three sources, all labeled in the output:
  (a) the hired-research corpus candidate lists (~/workspace/your_files/hired-research/corpus/pull_corpus.py),
  (b) employer-name -> slug derivation over a built-in list of large US employers,
  (c) the existing 121 BOARD_REGISTRY tokens.
A candidate is a (provider, token) pair. Verification is a REAL fetch of the
provider's public list endpoint through this machine's egress proxy:
  live   = HTTP 200, parseable, and the payload proves a real board
           (Greenhouse/Lever/Ashby: 200 is enough - a gibberish token 404s;
            SmartRecruiters: totalFound > 0 required, because SR answers
            200/totalFound 0 for gibberish too - the registry's own doctrine).
  dead   = the provider's calibrated nonexistent-board signature.
  error  = anything else (timeout, 5xx, unparseable) - never silently "dead".
Calibration: one gibberish token per provider is probed FIRST and its signature
recorded in the summary, so "dead" means "looks exactly like a board that does
not exist", measured this run, not assumed.
Output: JSONL, one line per probe; plus up to 3 payload samples per provider for
normalizer fitting. Nothing here writes product data - the directory build step
(scripts/career/build-board-directory.mjs) consumes this file.
"""
import concurrent.futures, json, os, re, sys, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/board-discovery-results.jsonl"
SAMPLES = OUT + ".samples.json"
WORKERS = int(os.environ.get("DISCOVERY_WORKERS", "16"))
TIMEOUT = int(os.environ.get("DISCOVERY_TIMEOUT", "45"))
UA = {"User-Agent": "upmore-board-discovery/1.0 (public ATS API verification)"}
PROXY = os.environ.get("https_proxy") or os.environ.get("HTTPS_PROXY")
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({"https": PROXY, "http": PROXY})) if PROXY else urllib.request.build_opener()

ENDPOINTS = {
    "greenhouse": "https://boards-api.greenhouse.io/v1/boards/{t}/jobs",
    "lever": "https://api.lever.co/v0/postings/{t}?mode=json",
    "ashby": "https://api.ashbyhq.com/posting-api/job-board/{t}",
    "smartrecruiters": "https://api.smartrecruiters.com/v1/companies/{t}/postings",
    "workable": "https://apply.workable.com/api/v1/widget/accounts/{t}/jobs",
    "breezy": "https://{t}.breezy.hr/json",
    "recruitee": "https://{t}.recruitee.com/api/offers/",
}
SUPPORTED = {"greenhouse", "lever", "ashby", "smartrecruiters"}  # providers 121 can normalize today

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    try:
        with OPENER.open(req, timeout=TIMEOUT) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try: return e.code, e.read().decode("utf-8", "replace")
        except Exception: return e.code, ""
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"

def classify(provider, status, body):
    """-> (verdict, postings_count_or_None, company_name_or_None)"""
    if status == 0: return ("error", None, None)
    # Status-first: several providers answer a nonexistent board with an HTML
    # 404 page, which must read as "dead" (the calibrated signature), not as a
    # JSON parse error.
    if status == 404 and provider in ("greenhouse", "lever", "ashby", "recruitee", "workable", "smartrecruiters"):
        return ("dead", None, None)
    if provider == "breezy" and status in (404, 502): return ("dead", None, None)
    try: data = json.loads(body)
    except Exception: return ("error" if status != 200 else "dead", None, None)
    if provider == "greenhouse":
        if status == 404: return ("dead", None, None)
        if status == 200 and isinstance(data, dict) and "jobs" in data:
            return ("live", len(data["jobs"]), data.get("name"))
        return ("error", None, None)
    if provider == "lever":
        if status == 404: return ("dead", None, None)
        if status == 200 and isinstance(data, list): return ("live", len(data), None)
        return ("error", None, None)
    if provider == "ashby":
        if status == 404: return ("dead", None, None)
        if status == 200 and isinstance(data, dict) and "jobs" in data:
            return ("live", len(data["jobs"]), data.get("name"))
        return ("error", None, None)
    if provider == "smartrecruiters":
        if status == 200 and isinstance(data, dict) and "content" in data:
            total = data.get("totalFound", 0)
            return ("live", total, None) if total > 0 else ("unverifiable", 0, None)
        if status == 404: return ("dead", None, None)
        return ("error", None, None)
    if provider == "workable":
        if status == 404: return ("dead", None, None)
        if status == 200 and isinstance(data, dict) and "jobs" in data: return ("live", len(data["jobs"]), data.get("name"))
        return ("error", None, None)
    if provider == "breezy":
        if status == 200 and isinstance(data, list): return ("live", len(data), None)
        return ("dead" if status in (404, 502) else "error", None, None)
    if provider == "recruitee":
        if status == 200 and isinstance(data, dict) and "offers" in data: return ("live", len(data["offers"]), None)
        return ("dead" if status == 404 else "error", None, None)
    return ("error", None, None)

# ---------------- candidates ----------------
def corpus_tokens():
    """Parse the token lists out of the corpus puller without executing it."""
    path = os.path.expanduser("~/workspace/your_files/hired-research/corpus/pull_corpus.py")
    src = open(path).read()
    out = []
    for var, provider in (("GREENHOUSE", "greenhouse"), ("LEVER", "lever"), ("ASHBY", "ashby")):
        m = re.search(var + r'\s*=\s*"""(.*?)"""', src, re.S)
        if m:
            for tok in m.group(1).split():
                if all(ord(c) < 128 for c in tok):
                    out.append((provider, tok, "corpus-list"))
    return out

EMPLOYER_NAMES = ['Walmart', 'Amazon', 'Apple', 'Microsoft', 'Alphabet', 'UnitedHealth Group', 'CVS Health', 'ExxonMobil', 'JPMorgan Chase', 'Bank of America', 'Costco', 'AT&T', 'Cardinal Health', 'Elevance Health', 'Citigroup', 'Verizon', 'Ford', 'General Motors', 'Valero Energy', 'Marathon Petroleum', 'Kroger', 'Home Depot', 'Chevron', 'Phillips 66', 'Humana', 'Centene', 'Target', "Lowe's", 'Kaiser Permanente', 'HCA Healthcare', 'Trinity Health', 'CommonSpirit Health', 'Providence', 'Ascension', 'AdventHealth', 'Mayo Clinic', 'Cleveland Clinic', 'Tenet Healthcare', 'Sutter Health', 'Northwell Health', 'UPMC', 'Mass General Brigham', 'Intermountain Healthcare', 'Geisinger', 'Atrium Health', 'Banner Health', 'HonorHealth', 'Wells Fargo', 'Goldman Sachs', 'Morgan Stanley', 'American Express', 'Capital One', 'U.S. Bancorp', 'PNC Financial', 'Truist', 'Fifth Third Bank', 'Citizens Financial', 'M&T Bank', 'Regions Financial', 'KeyCorp', 'Fidelity Investments', 'Charles Schwab', 'BlackRock', 'State Street', 'Northern Trust', 'T. Rowe Price', 'Aflac', 'MetLife', 'Prudential', 'Northwestern Mutual', 'Nationwide', 'Progressive', 'Allstate', 'Travelers', 'The Hartford', 'Chubb', 'Liberty Mutual', 'USAA', 'TIAA', 'Cigna', 'United Airlines', 'Delta Air Lines', 'American Airlines', 'Southwest Airlines', 'FedEx', 'UPS', 'CSX', 'Union Pacific', 'Norfolk Southern', 'Marriott International', 'Hilton', 'Hyatt', 'Wyndham Hotels', 'MGM Resorts', 'Caesars Entertainment', 'Wynn Resorts', 'Starbucks', "McDonald's", 'Yum Brands', 'Chipotle', 'Darden Restaurants', "Domino's Pizza", 'Shake Shack', 'Texas Roadhouse', 'Lockheed Martin', 'RTX', 'Northrop Grumman', 'General Dynamics', 'Boeing', 'L3Harris', 'Leidos', 'Booz Allen Hamilton', 'SAIC', 'CACI', 'Peraton', 'SpaceX', 'Blue Origin', 'Rocket Lab', 'Relativity Space', 'Anduril', 'Palantir', 'Snowflake', 'Databricks', 'OpenAI', 'Anthropic', 'Salesforce', 'Oracle', 'Adobe', 'Intuit', 'ServiceNow', 'Workday', 'PayPal', 'Block', 'Stripe', 'Coinbase', 'Robinhood', 'Airbnb', 'DoorDash', 'Uber', 'Lyft', 'Pinterest', 'Snap', 'Roblox', 'Unity', 'Twilio', 'Cloudflare', 'Datadog', 'MongoDB', 'Elastic', 'Okta', 'Zscaler', 'CrowdStrike', 'Palo Alto Networks', 'Fortinet', 'Atlassian', 'Zoom', 'DocuSign', 'Dropbox', 'Box', 'Asana', 'Smartsheet', 'HubSpot', 'Zendesk', 'Shopify', 'Etsy', 'eBay', 'Wayfair', 'Chewy', 'Petco', 'Tractor Supply', 'Dollar General', 'Dollar Tree', 'Five Below', 'Burlington', 'Ross Stores', 'TJX Companies', 'Gap Inc', 'Nordstrom', "Macy's", "Kohl's", 'Best Buy', 'Nike', 'Lululemon', 'Under Armour', 'Ralph Lauren', 'Estee Lauder', 'Procter & Gamble', 'Colgate-Palmolive', 'Kimberly-Clark', 'Clorox', 'General Mills', 'Kellogg', 'Campbell Soup', 'Hormel Foods', 'Tyson Foods', 'Cargill', 'Coca-Cola', 'PepsiCo', 'Keurig Dr Pepper', 'Constellation Brands', 'Altria', 'ConocoPhillips', 'Occidental Petroleum', 'EOG Resources', 'Schlumberger', 'Halliburton', 'Baker Hughes', 'Kinder Morgan', 'Duke Energy', 'Southern Company', 'Exelon', 'NextEra Energy', 'Sempra', 'Xcel Energy', 'Dominion Energy', 'Caterpillar', 'Deere & Company', 'Cummins', 'PACCAR', 'Honeywell', '3M', 'Emerson Electric', 'Illinois Tool Works', 'Parker Hannifin', 'Eaton', 'Carrier Global', 'Johnson Controls', 'Trane Technologies', 'Stanley Black & Decker', 'Snap-on', 'Rockwell Automation', 'Waste Management', 'Republic Services', 'Clean Harbors', 'XPO', 'J.B. Hunt', 'Schneider National', 'Old Dominion Freight Line', 'C.H. Robinson', 'Expeditors', 'DaVita', 'Encompass Health', 'Select Medical', 'LHC Group', 'Amedisys', 'Bayada Home Health', 'Maxim Healthcare Services', 'Accenture', 'Deloitte', 'PwC', 'EY', 'KPMG', 'McKinsey & Company', 'Boston Consulting Group', 'Bain & Company', 'ZS Associates', 'Guidehouse', 'Slalom', 'Protiviti', 'Robert Half', 'Kforce', 'ManpowerGroup', 'Kelly Services', 'Randstad', 'Allegis Group', 'Aerotek', 'Actalent', 'Insight Global', 'TEKsystems', 'Apex Systems', 'Beacon Hill Staffing', 'Grand Canyon Education', 'Pearson', 'Kaplan', 'Chegg', 'Coursera', 'Udemy', 'Southern New Hampshire University', 'Western Governors University', 'Liberty University', 'Arizona State University', 'New York University', 'Columbia University', 'Harvard University', 'MIT', 'Stanford University', 'Yale University', 'Duke University', 'Vanderbilt University', 'Rice University', 'Emory University', 'Northwestern University', 'University of Chicago', 'University of Notre Dame', 'Georgetown University', 'Boston University', 'Northeastern University', 'Georgia Tech', 'Virginia Tech', 'Purdue University', 'University of Illinois', 'University of Wisconsin', 'University of Minnesota', 'University of Washington', 'University of Colorado Boulder', 'University of Utah', 'University of Arizona', 'Michigan State University', 'Indiana University', 'Ohio State University', 'Penn State University', 'Texas A&M University', 'University of Florida', 'University of Michigan', 'University of Texas at Austin']
SUFFIXES = {"inc", "corp", "corporation", "company", "co", "llc", "ltd", "group", "holdings", "the", "and", "&"}
def slugs_for(name):
    words = re.sub(r"[^a-z0-9 ]", " ", name.lower()).split()
    core = [w for w in words if w not in SUFFIXES]
    if not core: core = words
    out = {"".join(core), "-".join(core), "".join(words)}
    if len(core) > 1: out.add(core[0])
    return sorted(x for x in out if len(x) >= 3)

def candidates():
    seen, out = set(), []
    def add(provider, token, source, company=None):
        key = (provider, token.lower())
        if key in seen or not token: return
        seen.add(key); out.append({"provider": provider, "token": token, "source": source, "company_hint": company})
    for provider, tok, src in corpus_tokens(): add(provider, tok, src)
    registry = [("greenhouse","stripe"),("greenhouse","robinhood"),("greenhouse","airbnb"),("greenhouse","datadog"),
        ("greenhouse","coinbase"),("greenhouse","figma"),("greenhouse","janestreet"),("lever","leverdemo"),
        ("ashby","ashby"),("ashby","ramp"),("ashby","openai"),("ashby","linear"),("greenhouse","gusto"),
        ("greenhouse","gemini"),("greenhouse","virtu"),("greenhouse","scaleai"),("ashby","notion"),
        ("greenhouse","oldmissioncapital"),("smartrecruiters","BoschGroup")]
    for p, t in registry: add(p, t, "registry-121")
    for name in EMPLOYER_NAMES:
        sl = slugs_for(name)
        if not sl: continue
        for s in sl[:2]: add("greenhouse", s, "employer-slug", name)
        base = sl[0]
        for p in ("lever", "ashby", "smartrecruiters", "workable", "recruitee", "breezy"):
            add(p, base, "employer-slug", name)
    return out

def probe(c):
    url = ENDPOINTS[c["provider"]].format(t=c["token"])
    t = time.time()
    status, body = fetch(url)
    verdict, count, name = classify(c["provider"], status, body)
    rec = dict(c, url=url, http=status, verdict=verdict, postings=count, board_name=name,
               seconds=round(time.time() - t, 1))
    sample = None
    if verdict == "live" and count:
        try:
            data = json.loads(body)
            items = data if isinstance(data, list) else data.get("jobs") or data.get("content") or data.get("offers") or []
            if items: sample = items[0]
        except Exception: pass
    return rec, sample

def main():
    cands = candidates()
    print(f"{len(cands)} candidates", flush=True)
    samples = {}
    # calibration probes first
    calib = {}
    for p in ENDPOINTS:
        rec, _ = probe({"provider": p, "token": "zz-nonexistent-board-918273", "source": "calibration", "company_hint": None})
        calib[p] = {"http": rec["http"], "verdict": rec["verdict"]}
    print("calibration:", json.dumps(calib), flush=True)
    done = 0
    with open(OUT, "w") as fh, concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        fh.write(json.dumps({"calibration": calib}) + "\n")
        futs = {ex.submit(probe, c): c for c in cands}
        for fut in concurrent.futures.as_completed(futs):
            rec, sample = fut.result()
            fh.write(json.dumps(rec) + "\n"); fh.flush()
            if sample is not None and rec["provider"] not in samples:
                samples[rec["provider"]] = sample
            done += 1
            if done % 100 == 0: print(f"{done}/{len(cands)}", flush=True)
    json.dump(samples, open(SAMPLES, "w"), indent=1)
    print("done", done, flush=True)

if __name__ == "__main__":
    main()
