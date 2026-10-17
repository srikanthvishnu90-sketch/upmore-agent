#!/usr/bin/env python3
"""MI-034 egress-2 probe (tier 2 — engine under harness).

Continuation of run 8 (work/mi034-board-tranche2 @ 9b2832d): resumes the
Corpus 3A untested board candidates. Corpus 3A (2026-10-14, notes at
~/workspace/your_files/hired-research/corpus/pull3-ats-directory-notes.json)
generated 3,189 candidates — employer names (priority non-tech classes:
healthcare systems, logistics/transport, industrial/manufacturing,
construction, hospitality, retail, education, government-adjacent/defense,
staffing, finance/insurance/nonprofit) -> concatenated + hyphenated slug
variants x Greenhouse/Lever/Ashby — conclusively tested only 221 (all
dead) before egress outages + a VM restart; 2,968 stayed untested and the
exact candidate list was never persisted. This run REGENERATES the pool
from the recorded methodology, using the same program's persisted employer
universe (board-discovery.py EMPLOYER_NAMES, which spans exactly those
classes) plus a supplementary priority-class name list, extends it to
SmartRecruiters per run 8's identical 4-provider standard, and EXCLUDES
every (provider, token) already live in the directory or already probed
by run 8 (banks.jsonl + general.jsonl) — what remains is the untested
pool, probed under run 8's identical doctrine:

  live = real fetch returned the board's postings JSON this run
         (SmartRecruiters: totalFound > 0 required).
  dead = the provider's calibrated nonexistent-board signature (404).
  unverifiable = HTTP 200 but payload proves nothing (SR totalFound 0).
  error = anything else (timeout / 5xx / transport) — NEVER a verdict.
A 429 from a provider is a HARD STOP for that provider in this run.
Calibration: one gibberish token per provider probed FIRST, recorded in
the output header. Starts staggered (per-worker jitter), as in run 8.

Usage: board-egress2-probe.py <out.jsonl>
"""
import concurrent.futures, json, os, random, re, sys, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
DIR_PATH = os.path.join(HERE, "..", "..", "packages", "career-data", "board-directory.json")
PROBES_DIR = os.path.join(HERE, "..", "..", "docs", "career", "board-tranche2-probes")
OUT = sys.argv[1]
WORKERS = int(os.environ.get("PROBE_WORKERS", "8"))
TIMEOUT = int(os.environ.get("PROBE_TIMEOUT", "25"))
UA = {"User-Agent": "upmore-board-discovery/1.0 (public ATS API verification)"}
PROXY = os.environ.get("https_proxy") or os.environ.get("HTTPS_PROXY")
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({"https": PROXY, "http": PROXY})) if PROXY else urllib.request.build_opener()

ENDPOINTS = {
    "greenhouse": "https://boards-api.greenhouse.io/v1/boards/{t}/jobs",
    "lever": "https://api.lever.co/v0/postings/{t}?mode=json",
    "ashby": "https://api.ashbyhq.com/posting-api/job-board/{t}",
    "smartrecruiters": "https://api.smartrecruiters.com/v1/companies/{t}/postings",
}
STOPPED = set()

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
    if status == 0: return ("error", None, None)
    if status == 429: return ("ratelimited", None, None)
    if status == 404: return ("dead", None, None)
    try: data = json.loads(body)
    except Exception: return ("error", None, None)
    if provider == "greenhouse":
        if status == 200 and isinstance(data, dict) and "jobs" in data:
            return ("live", len(data["jobs"]), data.get("name"))
        return ("error", None, None)
    if provider == "lever":
        if status == 200 and isinstance(data, list): return ("live", len(data), None)
        return ("error", None, None)
    if provider == "ashby":
        if status == 200 and isinstance(data, dict) and "jobs" in data:
            return ("live", len(data["jobs"]), data.get("name"))
        return ("error", None, None)
    if provider == "smartrecruiters":
        if status == 200 and isinstance(data, dict) and "content" in data:
            total = data.get("totalFound", 0)
            return ("live", total, None) if total > 0 else ("unverifiable", 0, None)
        return ("error", None, None)
    return ("error", None, None)

# ---- employer universe: board-discovery.py EMPLOYER_NAMES (same program,
# ---- spans 3A's priority classes) + supplementary priority-class names
# ---- not covered by run 8's banks/general lists.
def discovery_names():
    src = open(os.path.join(HERE, "board-discovery.py")).read()
    m = re.search(r"EMPLOYER_NAMES = \[(.*?)\]\n", src, re.S)
    return eval("[" + m.group(1) + "]")

SUPPLEMENTARY = [
 # healthcare systems / hospitals
 "Trinity Health","Dignity Health","Community Health Systems","Universal Health Services","Prime Healthcare","ProMedica","OhioHealth","Nationwide Children's Hospital","St. Jude Children's Research Hospital","Shriners Hospitals","DaVita Kidney Care","Fresenius Medical Care","Ensign Group","Genesis HealthCare","Kindred Healthcare","Select Medical Holdings","Hanger","Apria Healthcare","Lincare","Rotech Healthcare","Aveanna Healthcare","Addus HomeCare","LHC Group Inc","Chemed","BrightSpring Health","Modivcare","Oak Street Health Inc","ChenMed","Cano Health"," agilon health","Signify Health","Accolade Inc","Hims Hers","Ro Health","Nomi Health","Cityblock","Devoted Health",
 # logistics / transport / industrial / manufacturing
 "Estes Express Lines","Saia Inc","ArcBest Corporation","Yellow Corporation","Knight-Swift Transportation","Werner Enterprises","Heartland Express","Marten Transport","Covenant Logistics","PAM Transportation","CRST International","Prime Inc","KLLM Transport","Stevens Transport","Hirschbach Motor Lines","Crete Carrier","Roehl Transport","TMC Transportation","Melton Truck Lines","Boyd Bros Transportation","Anderson Trucking Service","Decker Truck Line","KB Transportation","Fremont Contract Carriers","Ruan Transportation","NFI Industries","Ryder System","Penske Truck Leasing","JB Hunt Transport","Schneider","Landstar System","GXO Logistics","RXO Inc","Flock Freight","Convoy","Flexport","project44","FourKites","Blue Yonder","Manhattan Associates","Descartes Systems","WiseTech Global","Trimble","Samsara","Motive","Netradyne","Lytx","Geotab",
 "Arconic","Howmet Aerospace","Timken","Regal Rexnord","Dover Corporation","IDEX Corporation","Nordson","Graco","Lincoln Electric","Kennametal","Snap-on Incorporated","Masco","Fortune Brands","Leggett Platt","Steelcase","Herman Miller","MillerKnoll","Kimball International","HNI Corporation","Tempur Sealy","La-Z-Boy","Flexsteel","Hooker Furnishings","Ethan Allen","Arhaus","Williams Sonoma","RH","Sleep Number","Purple Innovation","Casper Sleep","Tuft Needle",
 # construction / engineering
 "Turner Construction","Skanska","AECOM Technology","Tutor Perini","Granite Construction","MasTec","Quanta Services","EMCOR Group","Comfort Systems USA","ABM Industries Inc","Argan","Great Lakes Dredge","Orion Group","Primoris Services","MYR Group","Argan Inc","Sterling Infrastructure","Construction Partners","Knife River","Summit Materials","Martin Marietta","Vulcan Materials","Eagle Materials","Heidelberg Materials","CRH Americas","Oldcastle","Lehigh Hanson","Ash Grove Cement","CalPortland","Cemex USA",
 # hospitality / restaurants / retail (beyond run-8 general)
 "Bloomin Brands","Brinker International","Dine Brands","Cracker Barrel","Denny's Corporation","Red Robin Gourmet","BJ's Restaurants","Cheesecake Factory","P F Chang's","Ruth's Hospitality","Del Frisco's Restaurant Group","Fogo de Chao","Gen Korean BBQ","Kura Sushi","Portillo's","Dutch Bros Coffee","Black Rifle Coffee Company","Scooter's Coffee","Caribou Coffee","Peet's Coffee","Blue Bottle Coffee","Philz Coffee","Gregorys Coffee","Blank Street","Joe The Juice","Sweetgreen Inc","CAVA Group","Wingstop Inc","Shake Shack Inc","First Watch","Another Broken Egg","IHOP Restaurants","Applebee's","Chili's Grill","Olive Garden","LongHorn","Texas Roadhouse Inc","Outback Steakhouse","Carrabba's Italian","Bonefish Grill","Fleming's","Morton's Steakhouse","Eddie V's","Seasons 52","Bahama Breeze","Cheddar's Scratch Kitchen","Red Lobster","Buffalo Wild Wings","Twin Peaks Restaurants","Dave Buster's","Topgolf Callaway","Puttshack","Drive Shack","Main Event Entertainment","Bowlero Corp","Lucky Strike","Pinstripes","WhirlyBall","Andretti Indoor Karting","K1 Speed","Urban Air Adventure","Sky Zone","DEFY Trampoline","Big Air Trampoline",
 "Signet Jewelers","Tapestry Inc","Capri Holdings","Movado Group","G-III Apparel","Oxford Industries","Urban Outfitters","American Eagle Outfitters","Abercrombie Fitch","Buckle Inc","Zumiez","Genesco","Foot Locker","Hibbett","Sally Beauty","Ulta Beauty Inc","e.l.f. Beauty","Olaplex","Coty Inc","Revlon","Inter Parfums","Bath Body Works","Victoria's Secret","Torrid","Express Inc","Chico's FAS","Urban Outfitters Inc","Free People","Anthropologie","J.Jill","Lands End","Duluth Trading","Boot Barn","Academy Sports","Hibbett Sports","Genesco Inc","Caleres","Designer Brands","Shoe Carnival","Famous Footwear",
 # education
 "Stratasys Education","2U Inc","Instructure","PowerSchool","Blackbaud","Ellucian","Anthology","D2L","Udacity","MasterClass Inc","Outschool Inc","Varsity Tutors","Chegg Inc","Course Hero","Quizlet","Duolingo Inc","Babbel","Rosetta Stone","Cambly","Preply","italki","VIPKid","GoStudent","BYJU'S","Unacademy","upGrad","Simplilearn","Great Learning","Emeritus","Section","Reforge","Maven","On Deck","Product School","General Assembly","Flatiron School","Springboard","Career Karma","App Academy","Hack Reactor","Galvanize","Kenzie Academy","BloomTech","Lambda School",
 # defense / government-adjacent
 "V2X Inc","Amentum Holdings","KBR Inc","Fluor Corporation","Jacobs Solutions","Parsons Corporation","Mantech","DynCorp","PAE Inc","Vectrus","Engility","Perspecta","SOS International","Caliburn International","Acuity International","Constellis","GardaWorld","Allied Universal Security","Securitas Security Services","G4S Secure Solutions","Brink's Company","Loomis Armored","Dunbar Armored","Prosegur","ADT Inc","Vivint Smart Home","SimpliSafe Inc","Arlo Technologies","Wyze Labs","Eufy Security","Blink Home","Abode Systems","Frontpoint Security","Cove Smart","Scout Alarm","Abode","Ring LLC","Nest Labs",
 # staffing / HR services
 "Allegis Group","Aerotek Inc","Actalent Inc","Insight Global Inc","TEKsystems Inc","Apex Systems Inc","Beacon Hill Staffing","Vaco LLC","Korn Ferry International","Heidrick Struggles","Spencer Stuart","Russell Reynolds Associates","Egon Zehnder","Boyden Global","WittKieffer","FurstPerson","HireVue Inc","Modern Hire","SHL Group","DDI Inc","Gallup Inc","Hogan Assessments","Criteria Corp","Wonderlic","Berke Assessments","Pymetrics","Hireology","ApplicantPro","JazzHR","Workable Software","Breezy HR","Recruitee","iCIMS Inc","Taleo","SAP SuccessFactors","UKG Inc","ADP Inc","Paycom Software","Paylocity","BambooHR LLC","Gusto Inc","Rippling","Deel Inc","Remote Technology","Oyster HR","Papaya Global","Multiplier Technologies","Velocity Global","Globalization Partners","Safeguard Global","Atlas Technology","Skuad","Playroll","Boundless HQ","Omnipresent Group","Turing.com","Toptal LLC","Braintrust","Gun.io","Lemon.io","Contra Inc","Fiverr","Upwork Inc","Freelancer Limited","PeoplePerHour","Guru.com","99designs","DesignCrowd","Dribbble","Behance",
 # nonprofits / associations
 "American Red Cross","United Way","Salvation Army","Feeding America","Habitat for Humanity","Boys Girls Clubs","YMCA","YWCA","Goodwill Industries","Catholic Charities","Lutheran Services","World Vision","Save the Children","CARE USA","Mercy Corps","Oxfam America","Doctors Without Borders","Amnesty International","Human Rights Watch","ACLU","Planned Parenthood","Sierra Club","Nature Conservancy","World Wildlife Fund","Greenpeace","Ocean Conservancy","National Geographic Society","Smithsonian Institution","Metropolitan Museum","Art Institute Chicago","Field Museum","Shedd Aquarium","Lincoln Park Zoo","Brookfield Zoo","Chicago Botanic Garden",
 # Tyson Foods — the corpus's own partial-pull employer, on the four
 # SUPPORTED providers only (its Workday board stays NOT_WIRED; see the
 # completion entry's Tyson record).
 "Tyson Foods",
]
SUPPLEMENTARY = [s.strip() for s in SUPPLEMENTARY if s.strip()]

SUFFIXES = {"inc", "corp", "corporation", "company", "co", "llc", "ltd", "group", "holdings", "the", "and", "&"}

def slugs_for(name):
    """Corpus 3A rule: concatenated + hyphenated variants."""
    words = re.sub(r"[^a-z0-9 ]", " ", name.lower()).split()
    core = [w for w in words if w not in SUFFIXES] or words
    out = {"".join(core), "-".join(core)}
    return sorted(x for x in out if len(x) >= 3)

def camel(name):
    return "".join(w.capitalize() for w in re.sub(r"[^a-z0-9 ]", " ", name.lower()).split())

def build_candidates():
    live, probed_before = set(), set()
    d = json.load(open(DIR_PATH))
    for b in d.get("boards", []):
        if b["status"] == "live":
            live.add((b["provider"], str(b["board_token"]).lower()))
    for fn in ("banks.jsonl", "general.jsonl"):
        p = os.path.join(PROBES_DIR, fn)
        if os.path.exists(p):
            for line in open(p):
                try: r = json.loads(line)
                except Exception: continue
                if "provider" in r: probed_before.add((r["provider"], str(r["token"]).lower()))
    seen, out, skipped = set(), [], []
    def add(provider, token, source, company):
        key = (provider, token.lower())
        if key in seen: return
        seen.add(key)
        if key in live:
            skipped.append({"provider": provider, "token": token, "company_hint": company, "reason": "already_live_in_directory"})
            return
        if key in probed_before:
            skipped.append({"provider": provider, "token": token, "company_hint": company, "reason": "already_probed_run8"})
            return
        out.append({"provider": provider, "token": token, "source": source, "company_hint": company})
    names = [(n, "corpus3a-regen") for n in discovery_names()] + [(n, "corpus3a-supp") for n in SUPPLEMENTARY]
    for name, source in names:
        for s in slugs_for(name):
            for p in ("greenhouse", "lever", "ashby"):
                add(p, s, source, name)
            add("smartrecruiters", camel(name), source, name)
            add("smartrecruiters", s, source, name)
    # Tyson explicit tokens (supported providers only)
    for t in ("tysonfoods", "tyson"):
        for p in ("greenhouse", "lever", "ashby", "smartrecruiters"):
            add(p, t, "tyson-supported-providers", "Tyson Foods")
    return out, skipped

def probe(c):
    if c["provider"] in STOPPED:
        return dict(c, http=0, verdict="error", postings=None, board_name=None, seconds=0, note="provider_hard_stopped_429")
    time.sleep(random.uniform(0, 0.35))
    url = ENDPOINTS[c["provider"]].format(t=c["token"])
    t = time.time()
    status, body = fetch(url)
    verdict, count, name = classify(c["provider"], status, body)
    if verdict == "ratelimited":
        STOPPED.add(c["provider"])
        return dict(c, url=url, http=status, verdict="error", postings=None, board_name=None, seconds=round(time.time()-t, 1), note="HTTP_429_hard_stop")
    return dict(c, url=url, http=status, verdict=verdict, postings=count, board_name=name, seconds=round(time.time()-t, 1))

def main():
    cands, skipped = build_candidates()
    print(f"egress2: {len(cands)} candidates to probe, {len(skipped)} skipped (live/probed)", flush=True)
    calib = {}
    for p in ENDPOINTS:
        rec = probe({"provider": p, "token": "zz-nonexistent-board-918273", "source": "calibration", "company_hint": None})
        calib[p] = {"http": rec["http"], "verdict": rec["verdict"]}
        STOPPED.clear()
    print("calibration:", json.dumps(calib), flush=True)
    done = 0
    with open(OUT, "w") as fh:
        fh.write(json.dumps({"calibration": calib, "mode": "egress2-corpus3a", "skipped": skipped}) + "\n"); fh.flush()
        with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = {ex.submit(probe, c): c for c in cands}
            for fut in concurrent.futures.as_completed(futs):
                rec = fut.result()
                fh.write(json.dumps(rec) + "\n"); fh.flush()
                done += 1
                if done % 200 == 0: print(f"{done}/{len(cands)} stopped={sorted(STOPPED)}", flush=True)
    print("done", done, "stopped_providers", sorted(STOPPED), flush=True)

if __name__ == "__main__":
    main()
