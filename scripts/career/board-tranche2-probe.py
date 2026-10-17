#!/usr/bin/env python3
"""MI-034 board tranche 2 probe (tier 2 — engine under harness).

Banks-first expansion of packages/career-data/board-directory.json.
Same doctrine as board-discovery.py (BUG-096):
  live = real fetch returned the board's postings JSON this run
         (SmartRecruiters: totalFound > 0 required).
  dead = the provider's calibrated nonexistent-board signature (404).
  unverifiable = HTTP 200 but payload proves nothing (SR totalFound 0).
  error = anything else (timeout / 5xx / transport) — NEVER a verdict.
A 429 from a provider is a HARD STOP for that provider in this run.

Usage: board-tranche2-probe.py <banks|general> <out.jsonl>
Candidates already live in the directory are skipped (counted, named).
Starts are staggered (small per-worker jitter) — Window 2 showed a
synchronized fleet launch self-throttles the egress transport.
"""
import concurrent.futures, json, os, random, re, sys, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
DIR_PATH = os.path.join(HERE, "..", "..", "packages", "career-data", "board-directory.json")
MODE = sys.argv[1]
OUT = sys.argv[2]
WORKERS = int(os.environ.get("PROBE_WORKERS", "6"))
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
STOPPED = set()  # providers hard-stopped by a 429

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
    except Exception: return ("error" if status == 200 else "error", None, None)
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

# ---------------- banks / financial tranche (explicit) ----------------
# (display name, [plausible ATS tokens]) — a token is a GUESS until a real
# fetch proves it; nothing here is a claim.
BANKS = [
 ("JPMorgan Chase", ["jpmorganchase", "jpmorgan", "chase"]),
 ("Goldman Sachs", ["goldmansachs", "goldman"]),
 ("Morgan Stanley", ["morganstanley"]),
 ("Bank of America", ["bankofamerica", "bofa"]),
 ("Citigroup", ["citi", "citigroup", "citibank"]),
 ("Wells Fargo", ["wellsfargo"]),
 ("Barclays", ["barclays"]),
 ("Deutsche Bank", ["deutschebank"]),
 ("UBS", ["ubs"]),
 ("HSBC", ["hsbc"]),
 ("BNP Paribas", ["bnpparibas"]),
 ("Santander", ["santander", "bancosantander"]),
 ("BBVA", ["bbva"]),
 ("Lloyds Banking Group", ["lloydsbankinggroup", "lloyds"]),
 ("NatWest", ["natwest"]),
 ("Standard Chartered", ["standardchartered"]),
 ("Nomura", ["nomura"]),
 ("Mizuho", ["mizuho"]),
 ("MUFG", ["mufg"]),
 ("SMBC", ["smbc"]),
 ("RBC", ["rbc", "royalbankofcanada"]),
 ("TD Bank", ["tdbank", "td"]),
 ("Scotiabank", ["scotiabank"]),
 ("BMO", ["bmo"]),
 ("CIBC", ["cibc"]),
 ("Macquarie", ["macquarie", "macquariegroup"]),
 ("Truist", ["truist"]),
 ("PNC Financial", ["pnc", "pnffinancial"]),
 ("U.S. Bank", ["usbank", "usbancorp"]),
 ("Capital One", ["capitalone"]),
 ("Fifth Third Bank", ["fifththird", "fifththirdbank", "53"]),
 ("Citizens Financial", ["citizens", "citizensbank", "citizensfinancial"]),
 ("M&T Bank", ["mtbank", "mtb", "mandtbank"]),
 ("Regions Financial", ["regions", "regionsbank"]),
 ("KeyBank", ["keybank", "keycorp"]),
 ("Huntington Bank", ["huntington", "huntingtonbank", "huntington-national-bank"]),
 ("Ally Financial", ["ally", "allyfinancial"]),
 ("Discover Financial", ["discover", "discoverfinancial"]),
 ("Synchrony Financial", ["synchrony", "synchronyfinancial"]),
 ("American Express", ["americanexpress", "amex"]),
 ("Mastercard", ["mastercard"]),
 ("Visa", ["visa"]),
 ("PayPal", ["paypal"]),
 ("Fiserv", ["fiserv"]),
 ("FIS", ["fis", "fidelitynationalinformationservices"]),
 ("Global Payments", ["globalpayments"]),
 ("Jack Henry", ["jackhenry"]),
 ("Northern Trust", ["northerntrust"]),
 ("State Street", ["statestreet"]),
 ("BNY", ["bny", "bnymellon"]),
 ("BlackRock", ["blackrock"]),
 ("Vanguard", ["vanguard"]),
 ("Fidelity Investments", ["fidelity", "fidelityinvestments"]),
 ("Charles Schwab", ["schwab", "charlesschwab"]),
 ("T. Rowe Price", ["troweprice"]),
 ("Franklin Templeton", ["franklintempleton"]),
 ("Invesco", ["invesco"]),
 ("Prudential Financial", ["prudential", "pgim"]),
 ("Aflac", ["aflac"]),
 ("Travelers", ["travelers"]),
 ("The Hartford", ["thehartford", "hartford"]),
 ("Chubb", ["chubb"]),
 ("Progressive", ["progressive"]),
 ("Allstate", ["allstate"]),
 ("Nationwide", ["nationwide"]),
 ("Liberty Mutual", ["libertymutual"]),
 ("USAA", ["usaa"]),
 ("TIAA", ["tiaa"]),
 ("Northwestern Mutual", ["northwesternmutual"]),
 ("MassMutual", ["massmutual"]),
 ("New York Life", ["newyorklife"]),
 ("Principal Financial", ["principal", "principalfinancial"]),
 ("Lincoln Financial", ["lincolnfinancial"]),
 ("Unum", ["unum"]),
 ("AIG", ["aig"]),
 ("Manulife", ["manulife"]),
 ("Raymond James", ["raymondjames"]),
 ("Edward Jones", ["edwardjones"]),
 ("LPL Financial", ["lpl", "lplfinancial"]),
 ("Ameriprise", ["ameriprise"]),
 ("Stifel", ["stifel"]),
 ("Piper Sandler", ["pipersandler"]),
 ("Jefferies", ["jefferies"]),
 ("Evercore", ["evercore"]),
 ("Lazard", ["lazard"]),
 ("Moelis & Company", ["moelis"]),
 ("Perella Weinberg", ["perellaweinberg"]),
 ("PJT Partners", ["pjtpartners"]),
 ("Houlihan Lokey", ["houlihanlokey"]),
 ("Centerview Partners", ["centerview", "centerviewpartners"]),
 ("Guggenheim Partners", ["guggenheim", "guggenheimpartners"]),
 ("Baird", ["baird", "robertwbaird"]),
 ("William Blair", ["williamblair"]),
 ("Lincoln International", ["lincolninternational"]),
 ("Harris Williams", ["harriswilliams"]),
 ("Rothschild & Co", ["rothschild", "rothschildco"]),
 ("Cowen", ["cowen", "tdcowen"]),
 ("Canaccord Genuity", ["canaccord", "canaccordgenuity"]),
 ("Stephens Inc", ["stephens", "stephensinc"]),
 ("Oppenheimer", ["oppenheimer"]),
 ("B. Riley", ["briley", "brileyfinancial"]),
 ("Needham & Company", ["needham"]),
 ("Western Alliance Bank", ["westernalliance"]),
 ("Zions Bank", ["zions", "zionsbank", "zionsbancorporation"]),
 ("Comerica", ["comerica"]),
 ("Frost Bank", ["frostbank", "cullenfrost"]),
 ("First Citizens Bank", ["firstcitizens", "firstcitizensbank"]),
 ("Flagstar Bank", ["flagstar", "flagstarbank"]),
 ("Webster Bank", ["websterbank", "webster"]),
 ("East West Bank", ["eastwestbank"]),
 ("BankUnited", ["bankunited"]),
 ("BOK Financial", ["bokfinancial"]),
 ("Hancock Whitney", ["hancockwhitney"]),
 ("Synovus", ["synovus"]),
 ("First National Corp", ["fnb", "fnbcorp"]),
 ("Pinnacle Financial", ["pinnaclefinancial", "pinnaclebank"]),
 ("Old National Bank", ["oldnational", "oldnationalbank"]),
 ("Wintrust", ["wintrust"]),
 ("Associated Bank", ["associatedbank"]),
 ("Umpqua Bank", ["umpqua", "columbiabank"]),
 ("Texas Capital Bank", ["texascapitalbank", "texascapital"]),
 ("United Bank", ["unitedbank"]),
 ("Atlantic Union Bank", ["atlanticunion"]),
 ("WSFS Bank", ["wsfs", "wsfsbank"]),
 ("Fulton Bank", ["fultonbank"]),
 ("Customers Bank", ["customersbank"]),
 ("Axos Bank", ["axos", "axosbank"]),
 ("Green Dot", ["greendot"]),
 ("Pathward", ["pathward"]),
 ("LendingClub", ["lendingclub"]),
 ("Upstart", ["upstart"]),
 ("KKR", ["kkr"]),
 ("Blackstone", ["blackstone"]),
 ("Apollo Global", ["apolloglobal", "apollo"]),
 ("Carlyle", ["carlyle", "thecarlylegroup"]),
 ("Bain Capital", ["baincapital"]),
 ("TPG", ["tpg", "tpgcapital"]),
 ("Warburg Pincus", ["warburgpincus"]),
 ("General Atlantic", ["generalatlantic"]),
 ("Silver Lake", ["silverlake"]),
 ("Vista Equity", ["vistaequitypartners", "vistaequity"]),
 ("Thoma Bravo", ["thomabravo"]),
 ("Advent International", ["adventinternational"]),
 ("EQT", ["eqt", "eqtgroup"]),
 ("Permira", ["permira"]),
 ("Hellman & Friedman", ["hellmanfriedman"]),
 ("Leonard Green", ["leonardgreen"]),
 ("Ares Management", ["aresmanagement", "ares"]),
 ("Blue Owl Capital", ["blueowl", "blueowlcapital"]),
 ("Hamilton Lane", ["hamiltonlane"]),
 ("StepStone Group", ["stepstone", "stepstonegroup"]),
 ("Partners Group", ["partnersgroup"]),
 ("Brookfield", ["brookfield"]),
 ("Oaktree Capital", ["oaktreecapital", "oaktree"]),
 ("Sixth Street", ["sixthstreet"]),
 ("Golub Capital", ["golubcapital"]),
 ("Antares Capital", ["antarescapital"]),
 ("Monroe Capital", ["monroecapital"]),
 ("Sequoia Capital", ["sequoia", "sequoiacap"]),
 ("Andreessen Horowitz", ["a16z", "andreessenhorowitz"]),
 ("Benchmark", ["benchmark", "benchmarkcapital"]),
 ("Founders Fund", ["foundersfund"]),
 ("Lightspeed Venture", ["lightspeed", "lightspeedvp"]),
 ("Bessemer Venture", ["bessemer", "bvp"]),
 ("Index Ventures", ["indexventures"]),
 ("Accel", ["accel"]),
 ("Kleiner Perkins", ["kleinerperkins"]),
 ("Tiger Global", ["tigerglobal"]),
 ("Coatue", ["coatue"]),
 ("Insight Partners", ["insightpartners"]),
 ("General Catalyst", ["generalcatalyst"]),
 ("NEA", ["nea"]),
 ("Khosla Ventures", ["khoslaventures"]),
 ("Ribbit Capital", ["ribbitcapital"]),
 ("Paradigm", ["paradigm"]),
 ("Pantera Capital", ["panteracapital"]),
 ("Galaxy Digital", ["galaxydigital", "galaxy"]),
 ("Jump Trading", ["jumptrading", "jumpcrypto"]),
 ("Citadel", ["citadel"]),
 ("Citadel Securities", ["citadelsecurities"]),
 ("Two Sigma", ["twosigma"]),
 ("DE Shaw", ["deshaw", "deshawgroup"]),
 ("Millennium Management", ["millennium", "mlp"]),
 ("Point72", ["point72"]),
 ("Balyasny", ["balyasny", "bamfunds"]),
 ("Bridgewater", ["bridgewater"]),
 ("AQR Capital", ["aqrcapital", "aqr"]),
 ("Man Group", ["mangroup"]),
 ("Susquehanna", ["sig", "susquehanna", "susquehannainternationalgroup"]),
 ("DRW", ["drw", "drwholdings"]),
 ("Optiver", ["optiver"]),
 ("IMC", ["imc", "imctrading"]),
 ("Flow Traders", ["flowtraders"]),
 ("Tower Research", ["towerresearch", "towerresearchcapital"]),
 ("Hudson River Trading", ["hudsonrivertrading", "hrt"]),
 ("Akuna Capital", ["akunacapital", "akuna"]),
 ("Five Rings", ["fiverings", "fiveringscapital"]),
 ("Peak6", ["peak6"]),
 ("Belvedere Trading", ["belvederetrading"]),
 ("Wolverine Trading", ["wolverinetrading"]),
 ("Maven Securities", ["mavensecurities"]),
 ("XTX Markets", ["xtxmarkets"]),
 ("Tradeweb", ["tradeweb"]),
 ("MarketAxess", ["marketaxess"]),
 ("ICE", ["ice", "intercontinentalexchange"]),
 ("CME Group", ["cmegroup", "cme"]),
 ("Nasdaq", ["nasdaq"]),
 ("Cboe", ["cboe"]),
 ("LSEG", ["lseg"]),
 ("S&P Global", ["spglobal"]),
 ("Moody's", ["moodys"]),
 ("MSCI", ["msci"]),
 ("FactSet", ["factset"]),
 ("Morningstar", ["morningstar"]),
 ("Adyen", ["adyen"]),
 ("Checkout.com", ["checkout", "checkoutcom"]),
 ("Revolut", ["revolut"]),
 ("Wise", ["wise", "transferwise"]),
 ("Klarna", ["klarna"]),
 ("Toast", ["toast", "toasttab"]),
 ("Shift4", ["shift4", "shift4payments"]),
 ("Nuvei", ["nuvei"]),
 ("dLocal", ["dlocal"]),
 ("Airwallex", ["airwallex"]),
 ("Varo Bank", ["varo", "varobank"]),
 ("Current", ["current"]),
 ("Dave", ["dave", "daveinc"]),
 ("MoneyLion", ["moneylion"]),
 ("Chainalysis", ["chainalysis"]),
 ("Fireblocks", ["fireblocks"]),
 ("Circle", ["circle"]),
 ("Ripple", ["ripple"]),
 ("Consensys", ["consensys"]),
 ("Alchemy", ["alchemy"]),
 ("Paxos", ["paxos"]),
 ("BitGo", ["bitgo"]),
 ("NYDIG", ["nydig"]),
 ("Grayscale", ["grayscale"]),
 ("Wintermute", ["wintermute"]),
 ("FalconX", ["falconx"]),
 ("Talos", ["talos"]),
 ("ZeroHash", ["zerohash"]),
 ("Plaid", ["plaid"]),
 ("Marqeta", ["marqeta"]),
 ("Lithic", ["lithic"]),
 ("Unit", ["unit", "unitfinance"]),
 ("Treasury Prime", ["treasuryprime"]),
 ("Synctera", ["synctera"]),
 ("Highnote", ["highnote"]),
 ("Column", ["column"]),
 ("Lead Bank", ["leadbank"]),
 ("Cross River", ["crossriver", "crossriverbank"]),
 ("WebBank", ["webbank"]),
 ("Deloitte", ["deloitte"]),
 ("PwC", ["pwc"]),
 ("EY", ["ey"]),
 ("KPMG", ["kpmg"]),
 ("BDO", ["bdo", "bdousa"]),
 ("RSM", ["rsm", "rsmus"]),
 ("Grant Thornton", ["grantthornton"]),
 ("Baker Tilly", ["bakertilly"]),
 ("Crowe", ["crowe"]),
 ("CLA", ["claconnect", "cliftonlarsonallen"]),
 ("CohnReznick", ["cohnreznick"]),
 ("Plante Moran", ["plantemoran"]),
 ("Moss Adams", ["mossadams"]),
 ("Eide Bailly", ["eidebailly"]),
 ("Wipfli", ["wipfli"]),
 ("Cherry Bekaert", ["cherrybekaert"]),
 ("Forvis Mazars", ["forvis", "forvismazars"]),
 ("EisnerAmper", ["eisneramper"]),
 ("Citrin Cooperman", ["citrincooperman"]),
 ("Armanino", ["armanino"]),
 ("BPM", ["bpm", "bpminc"]),
 ("Withum", ["withum"]),
 ("Aprio", ["aprio"]),
 ("Lemonade", ["lemonade"]),
 ("Root Insurance", ["rootinsurance", "root"]),
 ("Oscar Health", ["oscarhealth", "oscar"]),
 ("Hippo Insurance", ["hippo", "hippoinsurance"]),
 ("Next Insurance", ["nextinsurance"]),
 ("Coalition", ["coalitioninc", "coalition"]),
 ("Pie Insurance", ["pieinsurance"]),
 ("Corvus Insurance", ["corvus", "corvusinsurance"]),
]

GENERAL_NAMES = [
 "Adobe","Oracle","Salesforce","Intuit","Workday","ServiceNow","Snowflake","Databricks","Palantir","CrowdStrike","Palo Alto Networks","Fortinet","Atlassian","Zoom","DocuSign","Box","HubSpot","Zendesk","Shopify","Etsy","eBay","Wayfair","Chewy","DoorDash","Uber","Snap","Unity","AppLovin","Duolingo","Coursera","Udemy","Chegg","2U","Khan Academy","MasterClass","Outschool","Noodle","Guild Education","Degreed","BetterUp","Spring Health","Lyra Health","Headspace","Calm","Noom","Hims & Hers","Ro","Teladoc","Amwell","One Medical","Carbon Health","Cityblock Health","Devoted Health","Oak Street Health","VillageMD","CVS Health","Walgreens","Rite Aid","GoodRx","Capsule","Alto Pharmacy","Truepill","Ro Health","Tempus","Recursion","Insitro","Benchling","Veeva","Flatiron Health","Veracyte","Guardant Health","Natera","Invitae","23andMe","Color Health","Freenome","Grail","Exact Sciences","Hologic","Dexcom","Insulet","Tandem Diabetes","Masimo","ResMed","Stryker","Medtronic","Abbott","Boston Scientific","Edwards Lifesciences","Intuitive Surgical","Zimmer Biomet","Baxter","Becton Dickinson","Thermo Fisher","Danaher","Agilent","Illumina","Bio-Rad","Charles River","ICON","IQVIA","Labcorp","Quest Diagnostics","UnitedHealth Group","Elevance Health","Cigna","Humana","Centene","Molina Healthcare","Alignment Healthcare","Bright Health","Clover Health","Accolade","Transcarent","Included Health","Hinge Health","Sword Health","Omada Health","Livongo","Virta Health","DayTwo","Levels Health","January AI","Nutrisense","Signos","Ultrahuman","Whoop","Oura","Fitbit","Garmin","Peloton","Tonal","Hydrow","Mirror","Echelon","iFit","NordicTrack","Bowflex","Nautilus","Life Time","Planet Fitness","Equinox","SoulCycle","Barry's","Orangetheory","F45","Anytime Fitness","Snap Fitness","Gold's Gym","LA Fitness","24 Hour Fitness","Crunch Fitness","Blink Fitness","Chuze Fitness","Vasa Fitness","EOS Fitness","YouFit","Retro Fitness","Workout Anytime","Snap Fitness Inc",
 "Marriott International","Hilton","Hyatt","Wyndham Hotels","Choice Hotels","Best Western","IHG","Accor","Four Seasons","Ritz-Carlton","Wynn Resorts","MGM Resorts","Caesars Entertainment","Las Vegas Sands","Penn Entertainment","DraftKings","FanDuel","BetMGM","Rush Street","PointsBet","Barstool","ESPN Bet","Hard Rock","Boyd Gaming","Red Rock Resorts","Churchill Downs","Golden Entertainment","Century Casinos","Monarch Casino","Full House Resorts","Bally's","Mohegan","Foxwoods","Seminole Gaming","Wind Creek","Choctaw Casinos","Cherokee Nation","Mystic Lake","Treasure Island","Canterbury Park",
 "Starbucks","Chipotle","Darden Restaurants","Yum Brands","Domino's","Papa John's","Little Caesars","Jimmy John's","Subway","Dunkin","Baskin Robbins","Tim Hortons","Burger King","Wendy's","McDonald's","Chick-fil-A","Taco Bell","KFC","Pizza Hut","Panera Bread","Shake Shack","Sweetgreen","Cava","Wingstop","Dutch Bros","Scooter's Coffee","Black Rifle Coffee","First Watch","Denny's","IHOP","Applebee's","Chili's","Olive Garden","LongHorn Steakhouse","Texas Roadhouse","Outback Steakhouse","Carrabba's","Bonefish Grill","Ruth's Chris","Morton's","Del Frisco's","The Capital Grille","Eddie V's","Seasons 52","Bahama Breeze","Cheddar's","Red Lobster","Red Robin","Buffalo Wild Wings","Hooters","Twin Peaks","Dave & Buster's","Topgolf","Puttshack","Drive Shack","Main Event","Bowlero","Lucky Strike","Pinstripes","WhirlyBall","Andretti","K1 Speed","Urban Air","Sky Zone","DEFY","Big Air"," trampoline",
 "Delta Air Lines","United Airlines","American Airlines","Southwest Airlines","JetBlue","Alaska Airlines","Spirit Airlines","Frontier Airlines","Hawaiian Airlines","Allegiant Air","Sun Country","Avelo Airlines","Breeze Airways","FedEx","UPS","XPO","Old Dominion","ArcBest","Saia","Yellow","Estes","FedEx Freight","Schneider National","J.B. Hunt","Knight-Swift","Werner Enterprises","Heartland Express","Marten Transport","Covenant Logistics","USA Truck","PAM Transport","Western Express","CRST","Prime Inc","KLLM","Stevens Transport","Hirschbach","Crete Carrier","Shaffer Trucking","Hunt Transport","Roehl Transport","Maverick Transportation","TMC Transportation","Melton Truck Lines","Jordan Carriers","Boyd Bros","Anderson Trucking","Decker Truck Line","K&B Transportation","Grand Island Express","Fremont Contract Carriers",
 "Lockheed Martin","RTX","Northrop Grumman","General Dynamics","Boeing","L3Harris","Leidos","Booz Allen","SAIC","CACI","Peraton","ManTech","V2X","Amentum","Jacobs","KBR","Fluor","AECOM","Tetra Tech","Parsons","Mantech International","DynCorp","PAE","Vectrus","Engility","Perspecta","SOSi","Caliburn","Acuity International","Constellis","GardaWorld","Allied Universal","Securitas","G4S","Brink's","Loomis","Dunbar Armored","Garda Cash","Prosegur","ADT","Vivint","SimpliSafe","Ring","Nest","Arlo","Wyze","Eufy","Blink","Abode","Frontpoint","Cove","Scout Alarm",
 "Accenture","Deloitte Consulting","McKinsey","Boston Consulting","Bain","ZS Associates","Guidehouse","Slalom","Protiviti","Robert Half","Kforce","ManpowerGroup","Kelly Services","Randstad","Allegis","Aerotek","Actalent","Insight Global","TEKsystems","Apex Systems","Beacon Hill","Vaco","Korn Ferry","Heidrick Struggles","Spencer Stuart","Russell Reynolds","Egon Zehnder","Boyden","WittKieffer","FurstPerson","HireVue","Modern Hire","SHL","Korn Ferry Assess","DDI","Gallup","Hogan Assessments","Criteria Corp","Wonderlic","Berke","Pymetrics","Hireology","ApplicantPro","JazzHR","Workable","Breezy HR","Recruitee","Greenhouse","Lever","Ashby","SmartRecruiters","iCIMS","Taleo","Workday","SAP SuccessFactors","UKG","ADP","Paycom","Paylocity","BambooHR","Gusto","Rippling","Deel","Remote","Oyster","Papaya Global","Multiplier","Velocity Global","Globalization Partners","Safeguard Global","Atlas","Skuad","Playroll","Boundless","Omnipresent","RemoteOk","We Work Remotely","FlexJobs","RemoteCo","ArcDev","Turing","Toptal","Braintrust","A.Team","Yoco Labs","Gun.io","Lemon.io","Contra","Fiverr","Upwork","Freelancer","PeoplePerHour","Guru","99designs","DesignCrowd","Dribbble","Behance",
]
# clean accidental whitespace entries
GENERAL_NAMES = [g.strip() for g in GENERAL_NAMES if g.strip()]

def camel(name):
    return "".join(w.capitalize() for w in re.sub(r"[^a-z0-9 ]", " ", name.lower()).split())

def slugs_for(name):
    words = re.sub(r"[^a-z0-9 ]", " ", name.lower()).split()
    suffix = {"inc", "corp", "corporation", "company", "co", "llc", "ltd", "group", "holdings", "the", "and"}
    core = [w for w in words if w not in suffix] or words
    out = {"".join(core)}
    if len(core) > 1: out.add("-".join(core))
    return sorted(x for x in out if len(x) >= 3)

def build_candidates():
    existing = set()
    try:
        d = json.load(open(DIR_PATH))
        for b in d.get("boards", []):
            existing.add((b["provider"], str(b["board_token"]).lower()))
    except Exception as e:
        print(f"WARN directory read: {e}", flush=True)
    seen, out, skipped = set(), [], []
    def add(provider, token, source, company):
        key = (provider, token.lower())
        if key in seen: return
        seen.add(key)
        if key in existing:
            skipped.append({"provider": provider, "token": token, "company_hint": company, "reason": "already_live_in_directory"})
            return
        out.append({"provider": provider, "token": token, "source": source, "company_hint": company})
    if MODE == "banks":
        for name, tokens in BANKS:
            for t in tokens:
                for p in ("greenhouse", "lever", "ashby"):
                    add(p, t, "banks-tranche", name)
                add("smartrecruiters", camel(name), "banks-tranche", name)
                add("smartrecruiters", t, "banks-tranche", name)
    else:
        for name in GENERAL_NAMES:
            for s in slugs_for(name):
                for p in ("greenhouse", "lever", "ashby", "smartrecruiters"):
                    add(p, s if p != "smartrecruiters" else camel(name), "general-tranche2", name)
    return out, skipped

def probe(c):
    if c["provider"] in STOPPED:
        return dict(c, http=0, verdict="error", postings=None, board_name=None, seconds=0, note="provider_hard_stopped_429"), None
    time.sleep(random.uniform(0, 0.35))  # stagger
    url = ENDPOINTS[c["provider"]].format(t=c["token"])
    t = time.time()
    status, body = fetch(url)
    verdict, count, name = classify(c["provider"], status, body)
    if verdict == "ratelimited":
        STOPPED.add(c["provider"])
        verdict = "error"
        return dict(c, url=url, http=status, verdict=verdict, postings=None, board_name=None, seconds=round(time.time()-t, 1), note="HTTP_429_hard_stop"), None
    return dict(c, url=url, http=status, verdict=verdict, postings=count, board_name=name, seconds=round(time.time()-t, 1)), None

def main():
    cands, skipped = build_candidates()
    print(f"{MODE}: {len(cands)} candidates to probe, {len(skipped)} skipped already-live", flush=True)
    calib = {}
    for p in ENDPOINTS:
        rec, _ = probe({"provider": p, "token": "zz-nonexistent-board-918273", "source": "calibration", "company_hint": None})
        calib[p] = {"http": rec["http"], "verdict": rec["verdict"]}
        STOPPED.clear()
    print("calibration:", json.dumps(calib), flush=True)
    done = 0
    with open(OUT, "w") as fh:
        fh.write(json.dumps({"calibration": calib, "mode": MODE, "skipped_already_live": skipped}) + "\n"); fh.flush()
        with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = {ex.submit(probe, c): c for c in cands}
            for fut in concurrent.futures.as_completed(futs):
                rec, _ = fut.result()
                fh.write(json.dumps(rec) + "\n"); fh.flush()
                done += 1
                if done % 100 == 0: print(f"{done}/{len(cands)} stopped={sorted(STOPPED)}", flush=True)
    print("done", done, "stopped_providers", sorted(STOPPED), flush=True)

if __name__ == "__main__":
    main()
