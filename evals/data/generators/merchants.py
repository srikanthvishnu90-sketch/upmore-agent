#!/usr/bin/env python3
"""Labeled merchant strings (Instinct spec doc 12, dataset 4; powers TXN-003/004).

Synthetic by construction: a curated merchant list (name, category, kind) is
rendered through the descriptor patterns card processors and banks actually
emit (processor prefixes, store numbers, city/state suffixes, truncation,
pending markers). Labels are therefore exact, and no row is a real user's
transaction. Hand-labeled production strings can be merged in later under
source "labeled"; until then every row carries source "synthetic".
Run: python3 evals/data/generators/merchants.py  ->  evals/data/labeled/merchants.json
"""
import json, random
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "labeled" / "merchants.json"
CATEGORIES = ["groceries", "dining", "coffee", "transport", "fuel", "streaming", "software", "utilities", "telecom", "housing",
              "insurance", "health", "fitness", "shopping", "travel", "fees", "income", "transfer", "education", "entertainment",
              "pets", "childcare", "charity", "government", "cash", "personal care", "home"]
# (clean merchant, category, kind, descriptor stems)
M = [
 ("Whole Foods", "groceries", "purchase", ["WHOLEFDS", "WHOLE FOODS MKT"]), ("Trader Joe's", "groceries", "purchase", ["TRADER JOE S", "TRADER JOES"]),
 ("Kroger", "groceries", "purchase", ["KROGER"]), ("Safeway", "groceries", "purchase", ["SAFEWAY"]), ("Aldi", "groceries", "purchase", ["ALDI"]),
 ("H-E-B", "groceries", "purchase", ["H-E-B", "HEB ONLINE"]), ("Publix", "groceries", "purchase", ["PUBLIX SUPER MAR"]), ("Costco", "groceries", "purchase", ["COSTCO WHSE", "COSTCO.COM"]),
 ("Wegmans", "groceries", "purchase", ["WEGMANS"]), ("Instacart", "groceries", "purchase", ["INSTACART", "INSTACART*ORDER"]), ("Sprouts", "groceries", "purchase", ["SPROUTS FARMERS MKT"]),
 ("Chipotle", "dining", "purchase", ["CHIPOTLE"]), ("Sweetgreen", "dining", "purchase", ["SWEETGREEN"]), ("Chick-fil-A", "dining", "purchase", ["CHICK-FIL-A"]),
 ("McDonald's", "dining", "purchase", ["MCDONALD S", "MCDONALDS F"]), ("Taco Bell", "dining", "purchase", ["TACO BELL"]), ("Panera", "dining", "purchase", ["PANERA BREAD"]),
 ("Shake Shack", "dining", "purchase", ["SHAKE SHACK"]), ("DoorDash", "dining", "purchase", ["DOORDASH", "DD *DOORDASH"]), ("Uber Eats", "dining", "purchase", ["UBER EATS", "UBER *EATS"]),
 ("Grubhub", "dining", "purchase", ["GRUBHUB"]), ("Domino's", "dining", "purchase", ["DOMINO S", "DOMINOS"]), ("Olive Garden", "dining", "purchase", ["OLIVE GARDEN"]),
 ("Starbucks", "coffee", "purchase", ["STARBUCKS", "STARBUCKS STORE"]), ("Dunkin'", "coffee", "purchase", ["DUNKIN", "DUNKIN #"]), ("Blue Bottle", "coffee", "purchase", ["BLUE BOTTLE COFFEE"]),
 ("Peet's", "coffee", "purchase", ["PEET S COFFEE", "PEETS"]), ("Philz", "coffee", "purchase", ["PHILZ COFFEE"]),
 ("Uber", "transport", "purchase", ["UBER", "UBER *TRIP"]), ("Lyft", "transport", "purchase", ["LYFT", "LYFT *RIDE"]), ("MTA", "transport", "purchase", ["MTA*NYCT PAYGO", "MTA NYCT"]),
 ("BART", "transport", "purchase", ["BART CLIPPER"]), ("Amtrak", "transport", "purchase", ["AMTRAK"]), ("SpotHero", "transport", "purchase", ["SPOTHERO"]),
 ("ParkMobile", "transport", "purchase", ["PARKMOBILE"]), ("E-ZPass", "transport", "purchase", ["E-ZPASS", "EZPASS REBILL"]),
 ("Shell", "fuel", "purchase", ["SHELL OIL", "SHELL SERVICE"]), ("Chevron", "fuel", "purchase", ["CHEVRON"]), ("Exxon", "fuel", "purchase", ["EXXONMOBIL"]),
 ("BP", "fuel", "purchase", ["BP#"]), ("Costco Gas", "fuel", "purchase", ["COSTCO GAS"]), ("Wawa", "fuel", "purchase", ["WAWA"]),
 ("Netflix", "streaming", "subscription", ["NETFLIX.COM", "NETFLIX"]), ("Spotify", "streaming", "subscription", ["SPOTIFY", "SPOTIFY USA"]), ("Hulu", "streaming", "subscription", ["HULU", "HLU*HULU"]),
 ("Disney+", "streaming", "subscription", ["DISNEY PLUS", "DISNEYPLUS"]), ("Max", "streaming", "subscription", ["MAX.COM", "HBO MAX"]), ("YouTube Premium", "streaming", "subscription", ["GOOGLE *YOUTUBEPREMIUM", "YOUTUBE PREMIUM"]),
 ("Apple TV+", "streaming", "subscription", ["APPLE.COM/BILL"]), ("Paramount+", "streaming", "subscription", ["PARAMOUNT+", "PARAMOUNTPLUS"]), ("Peacock", "streaming", "subscription", ["PEACOCK"]),
 ("Audible", "streaming", "subscription", ["AUDIBLE", "AMZN AUDIBLE"]), ("SiriusXM", "streaming", "subscription", ["SIRIUSXM"]), ("Amazon Prime", "streaming", "subscription", ["AMAZON PRIME", "AMZN PRIME"]),
 ("Microsoft 365", "software", "subscription", ["MICROSOFT*365", "MSFT * 365"]), ("Adobe", "software", "subscription", ["ADOBE *CREATIVE", "ADOBE INC"]), ("Dropbox", "software", "subscription", ["DROPBOX"]),
 ("Google One", "software", "subscription", ["GOOGLE *ONE", "GOOGLE STORAGE"]), ("iCloud+", "software", "subscription", ["APPLE.COM/BILL ICLOUD"]), ("Notion", "software", "subscription", ["NOTION LABS"]),
 ("ChatGPT", "software", "subscription", ["OPENAI *CHATGPT", "OPENAI"]), ("1Password", "software", "subscription", ["1PASSWORD", "AGILEBITS"]), ("NordVPN", "software", "subscription", ["NORDVPN"]),
 ("Zoom", "software", "subscription", ["ZOOM.US", "ZOOM VIDEO"]), ("GitHub", "software", "subscription", ["GITHUB"]), ("Canva", "software", "subscription", ["CANVA"]),
 ("ComEd", "utilities", "bill", ["COMED", "COMMONWEALTH EDISON"]), ("PG&E", "utilities", "bill", ["PG&E", "PGANDE"]), ("Con Edison", "utilities", "bill", ["CON ED", "CONEDISON"]),
 ("Duke Energy", "utilities", "bill", ["DUKE ENERGY"]), ("National Grid", "utilities", "bill", ["NATIONAL GRID"]), ("City Water", "utilities", "bill", ["CITY OF AUSTIN UTIL", "WATER DEPT"]),
 ("Xfinity", "telecom", "bill", ["COMCAST", "XFINITY"]), ("Spectrum", "telecom", "bill", ["SPECTRUM", "CHARTER COMM"]), ("Verizon", "telecom", "bill", ["VERIZON WRLS", "VZWRLSS"]),
 ("AT&T", "telecom", "bill", ["AT&T", "ATT*BILL"]), ("T-Mobile", "telecom", "bill", ["T-MOBILE", "TMOBILE"]), ("Mint Mobile", "telecom", "bill", ["MINT MOBILE"]),
 ("Google Fi", "telecom", "bill", ["GOOGLE *FI"]), ("Visible", "telecom", "bill", ["VISIBLE"]),
 ("Rent", "housing", "bill", ["RENT PAYMENT", "PROPERTY MGMT RENT"]), ("Mortgage", "housing", "bill", ["MORTGAGE PMT", "ROCKET MTG"]), ("HOA", "housing", "bill", ["HOA DUES"]),
 ("Bilt Rent", "housing", "bill", ["BILT RENT"]), ("Zillow Rent", "housing", "bill", ["ZILLOW RENTALS"]),
 ("Geico", "insurance", "bill", ["GEICO"]), ("State Farm", "insurance", "bill", ["STATE FARM"]), ("Progressive", "insurance", "bill", ["PROGRESSIVE INS"]),
 ("Lemonade", "insurance", "bill", ["LEMONADE INS"]), ("Allstate", "insurance", "bill", ["ALLSTATE"]), ("Blue Cross", "insurance", "bill", ["BCBS PREMIUM"]),
 ("CVS", "health", "purchase", ["CVS/PHARMACY", "CVS PHARMACY"]), ("Walgreens", "health", "purchase", ["WALGREENS"]), ("One Medical", "health", "purchase", ["ONE MEDICAL"]),
 ("Quest Diagnostics", "health", "purchase", ["QUEST DIAGNOSTICS"]), ("Dentist", "health", "purchase", ["SMILE DENTAL"]), ("GoodRx", "health", "purchase", ["GOODRX"]),
 ("Planet Fitness", "fitness", "subscription", ["PLANET FIT", "PLANET FITNESS"]), ("Equinox", "fitness", "subscription", ["EQUINOX"]), ("Peloton", "fitness", "subscription", ["PELOTON"]),
 ("ClassPass", "fitness", "subscription", ["CLASSPASS"]), ("LA Fitness", "fitness", "subscription", ["LA FITNESS"]), ("Strava", "fitness", "subscription", ["STRAVA"]),
 ("Amazon", "shopping", "purchase", ["AMZN MKTP US", "AMAZON.COM", "AMZN Mktp US"]), ("Target", "shopping", "purchase", ["TARGET", "TARGET.COM"]), ("Walmart", "shopping", "purchase", ["WAL-MART", "WALMART.COM"]),
 ("Best Buy", "shopping", "purchase", ["BEST BUY"]), ("Home Depot", "home", "purchase", ["THE HOME DEPOT", "HOMEDEPOT.COM"]), ("Lowe's", "home", "purchase", ["LOWES"]),
 ("IKEA", "home", "purchase", ["IKEA"]), ("Wayfair", "home", "purchase", ["WAYFAIR"]), ("Apple Store", "shopping", "purchase", ["APPLE STORE", "APPLE.COM"]),
 ("Nike", "shopping", "purchase", ["NIKE.COM", "NIKE"]), ("Zara", "shopping", "purchase", ["ZARA"]), ("Etsy", "shopping", "purchase", ["ETSY.COM", "ETSY"]),
 ("eBay", "shopping", "purchase", ["EBAY", "EBAY O*"]), ("Shein", "shopping", "purchase", ["SHEIN"]), ("Temu", "shopping", "purchase", ["TEMU.COM"]),
 ("Sephora", "personal care", "purchase", ["SEPHORA"]), ("Ulta", "personal care", "purchase", ["ULTA"]), ("Great Clips", "personal care", "purchase", ["GREAT CLIPS"]),
 ("Delta", "travel", "purchase", ["DELTA AIR", "DELTA AIR LINES"]), ("United", "travel", "purchase", ["UNITED AIRLINES", "UNITED"]), ("American Airlines", "travel", "purchase", ["AMERICAN AIR", "AMERICAN AIRLINES"]),
 ("Southwest", "travel", "purchase", ["SOUTHWEST AIR", "SOUTHWES"]), ("Airbnb", "travel", "purchase", ["AIRBNB", "AIRBNB *HM"]), ("Marriott", "travel", "purchase", ["MARRIOTT"]),
 ("Hilton", "travel", "purchase", ["HILTON HOTELS"]), ("Expedia", "travel", "purchase", ["EXPEDIA"]), ("Hertz", "travel", "purchase", ["HERTZ RENT A CAR"]),
 ("Overdraft fee", "fees", "fee", ["OVERDRAFT ITEM FEE", "OD FEE"]), ("NSF fee", "fees", "fee", ["NSF RETURNED ITEM FEE", "INSUFFICIENT FUNDS FEE"]),
 ("Monthly maintenance fee", "fees", "fee", ["MONTHLY MAINTENANCE FEE", "MONTHLY SERVICE FEE"]), ("ATM fee", "fees", "fee", ["NON-NETWORK ATM FEE", "ATM FEE"]),
 ("Foreign transaction fee", "fees", "fee", ["FOREIGN TRANSACTION FEE", "INTL TRANSACTION FEE"]), ("Late payment fee", "fees", "fee", ["LATE PAYMENT FEE", "LATE FEE"]),
 ("Wire fee", "fees", "fee", ["WIRE TRANSFER FEE", "OUTGOING WIRE FEE"]), ("Paper statement fee", "fees", "fee", ["PAPER STATEMENT FEE"]),
 ("Payroll", "income", "income", ["PAYROLL", "DIRECT DEP PAYROLL", "ADP PAYROLL"]), ("Gusto payroll", "income", "income", ["GUSTO PAY"]), ("Venmo cash in", "income", "income", ["VENMO CASHOUT"]),
 ("Interest paid", "income", "income", ["INTEREST PAID", "INTEREST PAYMENT"]), ("Tax refund", "income", "income", ["IRS TREAS 310 TAX REF", "US TREASURY TAX REF"]),
 ("Zelle", "transfer", "transfer", ["ZELLE PAYMENT TO", "ZELLE FROM"]), ("Venmo", "transfer", "transfer", ["VENMO PAYMENT", "VENMO"]), ("Cash App", "transfer", "transfer", ["CASH APP", "SQC*CASH APP"]),
 ("PayPal transfer", "transfer", "transfer", ["PAYPAL TRANSFER", "PAYPAL INST XFER"]), ("Savings transfer", "transfer", "transfer", ["ONLINE TRANSFER TO SAV", "TRANSFER TO SAVINGS"]),
 ("Credit card payment", "transfer", "transfer", ["CHASE CREDIT CRD AUTOPAY", "AMEX EPAYMENT", "CAPITAL ONE CRCARDPMT"]), ("Brokerage transfer", "transfer", "transfer", ["ROBINHOOD", "FIDELITY TRANSFER"]),
 ("ATM withdrawal", "cash", "atm", ["ATM WITHDRAWAL", "ATM CASH WITHDRAWAL"]), ("Cash deposit", "cash", "income", ["CASH DEPOSIT"]),
 ("Coursera", "education", "subscription", ["COURSERA"]), ("Udemy", "education", "purchase", ["UDEMY"]), ("Tuition", "education", "bill", ["UNIVERSITY TUITION", "STATE UNIV BURSAR"]),
 ("Student loan", "education", "bill", ["NELNET", "MOHELA", "SALLIE MAE"]), ("Chegg", "education", "subscription", ["CHEGG"]),
 ("AMC", "entertainment", "purchase", ["AMC THEATRES", "AMC ONLINE"]), ("Ticketmaster", "entertainment", "purchase", ["TICKETMASTER"]), ("Steam", "entertainment", "purchase", ["STEAMGAMES.COM"]),
 ("Xbox Game Pass", "entertainment", "subscription", ["MICROSOFT*XBOX", "XBOX GAME PASS"]), ("PlayStation Plus", "entertainment", "subscription", ["PLAYSTATION NETWORK"]), ("Nintendo", "entertainment", "purchase", ["NINTENDO"]),
 ("Kindle", "entertainment", "purchase", ["AMZN DIGITAL", "KINDLE SVCS"]), ("Bowlero", "entertainment", "purchase", ["BOWLERO"]),
 ("Chewy", "pets", "purchase", ["CHEWY.COM", "CHEWY"]), ("Petco", "pets", "purchase", ["PETCO"]), ("Vet", "pets", "purchase", ["BANFIELD PET", "VCA ANIMAL HOSP"]), ("Rover", "pets", "purchase", ["ROVER.COM"]),
 ("Daycare", "childcare", "bill", ["BRIGHT HORIZONS", "KINDERCARE"]), ("Care.com", "childcare", "subscription", ["CARE.COM"]),
 ("Red Cross", "charity", "purchase", ["AMERICAN RED CROSS"]), ("GoFundMe", "charity", "purchase", ["GOFUNDME"]), ("Church", "charity", "purchase", ["TITHE.LY", "PUSHPAY"]),
 ("DMV", "government", "bill", ["DMV", "CA DMV"]), ("IRS payment", "government", "bill", ["IRS USATAXPYMT"]), ("Parking ticket", "government", "bill", ["CITY PARKING VIOL"]), ("USPS", "government", "purchase", ["USPS PO", "USPS.COM"]),
 ("Walgreens Photo", "shopping", "purchase", ["WALGREENS PHOTO"]), ("7-Eleven", "shopping", "purchase", ["7-ELEVEN"]), ("Dollar General", "shopping", "purchase", ["DOLLAR GENERAL"]), ("CVS ExtraCare", "health", "subscription", ["CVS CAREPASS"]),
 ("Lululemon", "shopping", "purchase", ["LULULEMON"]), ("REI", "shopping", "purchase", ["REI"]), ("Patagonia", "shopping", "purchase", ["PATAGONIA"]), ("Crate & Barrel", "home", "purchase", ["CRATE & BARREL", "CRATE AND BARREL"]),
 ("Cheesecake Factory", "dining", "purchase", ["CHEESECAKE FACTORY"]), ("In-N-Out", "dining", "purchase", ["IN-N-OUT BURGER"]), ("Five Guys", "dining", "purchase", ["FIVE GUYS"]), ("Wendy's", "dining", "purchase", ["WENDYS"]),
 ("Subway", "dining", "purchase", ["SUBWAY"]), ("Popeyes", "dining", "purchase", ["POPEYES"]), ("Raising Cane's", "dining", "purchase", ["RAISING CANES"]), ("Cava", "dining", "purchase", ["CAVA"]),
 ("Dutch Bros", "coffee", "purchase", ["DUTCH BROS"]), ("Tim Hortons", "coffee", "purchase", ["TIM HORTONS"]), ("Caribou", "coffee", "purchase", ["CARIBOU COFFEE"]),
 ("Turo", "travel", "purchase", ["TURO"]), ("Vrbo", "travel", "purchase", ["VRBO"]), ("JetBlue", "travel", "purchase", ["JETBLUE"]), ("Alaska Airlines", "travel", "purchase", ["ALASKA AIR"]),
 ("Frontier", "travel", "purchase", ["FRONTIER AIRLINES"]), ("Spirit", "travel", "purchase", ["SPIRIT AIRL"]), ("Hyatt", "travel", "purchase", ["HYATT"]),
 ("Headspace", "health", "subscription", ["HEADSPACE"]), ("Calm", "health", "subscription", ["CALM.COM"]), ("Hims", "health", "subscription", ["HIMS"]), ("Talkspace", "health", "subscription", ["TALKSPACE"]),
 ("Wix", "software", "subscription", ["WIX.COM"]), ("Squarespace", "software", "subscription", ["SQUARESPACE"]), ("Slack", "software", "subscription", ["SLACK TECHNOLOGIES"]), ("Figma", "software", "subscription", ["FIGMA"]),
 ("Ring", "home", "subscription", ["RING MONTHLY", "RING.COM"]), ("ADT", "home", "bill", ["ADT SECURITY"]), ("SimpliSafe", "home", "subscription", ["SIMPLISAFE"]), ("Terminix", "home", "bill", ["TERMINIX"]),
 ("Lawn service", "home", "bill", ["GREEN LAWN CARE"]), ("Waste Management", "utilities", "bill", ["WASTE MGMT", "WM CORPORATE"]), ("Propane", "utilities", "bill", ["AMERIGAS"]),
 ("Refund Amazon", "shopping", "refund", ["AMZN MKTP US REFUND", "AMAZON.COM REFUND"]), ("Refund Target", "shopping", "refund", ["TARGET REFUND"]), ("Refund airline", "travel", "refund", ["DELTA AIR REFUND", "UNITED REFUND"]),
 ("Fee refund", "fees", "refund", ["OVERDRAFT FEE REFUND", "FEE REVERSAL", "COURTESY CREDIT"]), ("Merchant credit", "shopping", "refund", ["UBER CREDIT", "DOORDASH REFUND"]),
 ("Unknown merchant", "shopping", "unknown", ["POS PURCHASE", "DEBIT CARD PURCHASE", "CHECK CARD PURCHASE"]), ("Unknown online", "shopping", "unknown", ["ONLINE PAYMENT", "WEB PMT"]),
]
assert len({m[0] for m in M}) == len(M), "duplicate merchant"
CITIES = ["AUSTIN TX", "CHICAGO IL", "NEW YORK NY", "SAN FRANCISCO CA", "SEATTLE WA", "DENVER CO", "MIAMI FL", "ATLANTA GA", "BOSTON MA", "PHOENIX AZ", "PORTLAND OR", "NASHVILLE TN"]
PROC = ["SQ *", "TST*", "PP*", "PAYPAL *", "SP *", "AMZN*", "IC *", "CKE*", "PY *", "WL *"]
# Each pattern renders a stem into one descriptor shape banks emit.
PATTERNS = [
 lambda s, r: s,
 lambda s, r: f"{s} {r.choice(CITIES)}",
 lambda s, r: f"{s} #{r.randint(100, 9999)} {r.choice(CITIES)}",
 lambda s, r: f"{r.choice(PROC)}{s}",
 lambda s, r: f"{r.choice(PROC)}{s} {r.choice(CITIES).split()[0]}",
 lambda s, r: f"POS DEBIT {s} {r.choice(CITIES)}",
 lambda s, r: f"PENDING {s}",
 lambda s, r: f"{s} RECURRING",
 lambda s, r: f"{s[:11]}",
 lambda s, r: f"CHECKCARD {r.randint(1,12):02d}{r.randint(1,28):02d} {s} {r.choice(CITIES).split()[-1]}",
 lambda s, r: f"{s} {r.randint(1,12):02d}/{r.randint(1,28):02d} PURCHASE",
 lambda s, r: f"{s} ONLINE",
 lambda s, r: f"{s.lower()}",
 lambda s, r: f"{s} {r.choice(CITIES)} US",
 lambda s, r: f"DDA PURCHASE {s}",
]
def build():
    r = random.Random(12)
    rows, seen = [], set()
    for merchant, category, kind, stems in M:
        for stem in stems:
            for i, pat in enumerate(PATTERNS):
                raw = pat(stem, r)
                if raw in seen: continue
                seen.add(raw); rows.append({"raw": raw, "merchant": merchant, "category": category, "kind": kind, "source": "synthetic"})
    rows.sort(key=lambda x: (x["merchant"], x["raw"]))
    return {"schema_version": 1, "generated_by": "evals/data/generators/merchants.py",
            "source": "synthetic descriptor variants of a curated merchant list; not production strings. Merge hand-labeled rows with source 'labeled' as they are collected.",
            "categories": CATEGORIES, "rows": rows}
if __name__ == "__main__":
    out = build(); OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"merchants: {len(out['rows'])} rows, {len(M)} merchants, {len(CATEGORIES)} categories -> {OUT.relative_to(OUT.parents[3])}")
