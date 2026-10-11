#!/usr/bin/env python3
"""Deterministic generator for evals/data/labeled/merchants.json (doc 12 Dataset 4: TXN-003/004).

A catalog of real-world US merchants, billers, banks and payroll providers, rendered through the
descriptor templates statement feeds actually produce (SQ *, TST*, PP*, CHECKCARD MMDD, city/state
suffixes, truncation, caps). Every row maps a raw descriptor to a clean merchant, a category and a
kind. Digit runs stay short (the privacy lint rejects account/card-shaped numbers).
Rerun: python3 evals/data/generators/merchants.py  (same seed -> byte-identical output).
"""
import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "labeled" / "merchants.json"
SEED = 20261010
TARGET = 2100

# category -> kind -> merchants
CATALOG = {
    "Groceries": ("purchase", ["Trader Joe's", "Whole Foods", "Kroger", "H-E-B", "Safeway", "Costco", "Aldi", "Publix", "Wegmans", "Sprouts", "Albertsons",
                               "Food Lion", "Giant Eagle", "Meijer", "WinCo Foods", "Stop & Shop", "ShopRite", "Hy-Vee", "Ralphs", "Fred Meyer", "Lidl", "Instacart"]),
    "Dining": ("purchase", ["Chipotle", "Sweetgreen", "Panera Bread", "Chick-fil-A", "In-N-Out", "Shake Shack", "Olive Garden", "Cheesecake Factory", "Five Guys",
                            "Wingstop", "Cava", "Dig Inn", "Jersey Mike's", "Subway", "Domino's", "Papa John's", "Taco Bell", "Wendy's", "McDonald's", "Burger King",
                            "Noodles & Co", "Qdoba", "Panda Express", "Raising Cane's", "DoorDash", "Uber Eats", "Grubhub", "Seamless"]),
    "Coffee": ("purchase", ["Starbucks", "Dunkin", "Blue Bottle Coffee", "Peet's Coffee", "Philz Coffee", "Dutch Bros", "Tim Hortons", "Caribou Coffee", "Intelligentsia",
                            "The Local Roaster", "Verve Coffee", "Stumptown"]),
    "Transport": ("purchase", ["Uber", "Lyft", "MTA", "BART", "WMATA Metro", "CTA Ventra", "Amtrak", "Caltrain", "SpotHero", "ParkMobile", "LA Metro TAP", "Bird Scooters", "Lime"]),
    "Fuel": ("purchase", ["Shell", "Chevron", "ExxonMobil", "BP", "Wawa", "Sheetz", "QuikTrip", "Circle K", "Speedway", "7-Eleven", "Marathon", "Sunoco", "Costco Gas", "Buc-ee's"]),
    "Housing/Rent": ("bill", ["Zelle to Landlord Rent", "Bilt Rent", "RentCafe", "AppFolio Rent", "Mortgage Wells Fargo Home", "Rocket Mortgage", "Mr. Cooper Mortgage",
                              "Chase Home Lending", "Greystar Rent", "Avalon Communities", "Equity Residential", "HOA Dues"]),
    "Utilities": ("bill", ["City Power & Light", "Con Edison", "PG&E", "Duke Energy", "Georgia Power", "Xcel Energy", "Southern California Edison", "National Grid",
                           "Municipal Water Utility", "Regional Gas Co", "Waste Management", "Republic Services", "Dominion Energy", "FPL Florida Power"]),
    "Telecom": ("bill", ["Verizon Wireless", "AT&T", "T-Mobile", "Comcast Xfinity", "Spectrum", "Cox Communications", "Google Fi", "Mint Mobile", "Visible", "Cricket Wireless",
                         "Optimum", "Frontier", "Starlink", "CenturyLink"]),
    "Insurance": ("bill", ["Geico", "State Farm", "Progressive", "Allstate", "Lemonade", "USAA Insurance", "Liberty Mutual", "Nationwide", "Farmers Insurance", "Root Insurance",
                           "Travelers", "Oscar Health", "Kaiser Permanente Premium", "MetLife", "ADT Security"]),
    "Subscriptions/Streaming": ("subscription", ["Netflix", "Spotify", "Apple Music", "Hulu", "Disney+", "YouTube Premium", "Max", "Paramount+", "Peacock", "Audible", "Amazon Prime",
                                                "The New York Times", "Washington Post", "Wall Street Journal", "Headspace", "Calm", "Duolingo", "Peloton App", "Planet Fitness",
                                                "Equinox", "LA Fitness", "Crunch Fitness", "Strava", "Kindle Unlimited", "Patreon", "Twitch", "Sirius XM", "Tidal", "Pandora",
                                                "Apple TV+", "Crunchyroll", "ESPN+", "Substack"]),
    "Software/Cloud": ("subscription", ["Adobe Creative Cloud", "Dropbox", "iCloud", "Google One", "Microsoft 365", "ChatGPT", "Claude", "Notion", "Slack", "Zoom", "GitHub",
                                        "1Password", "NordVPN", "ExpressVPN", "Canva", "Figma", "Grammarly", "Evernote", "Backblaze", "Squarespace", "GoDaddy", "AWS", "Google Workspace"]),
    "Shopping": ("purchase", ["Amazon", "Target", "Walmart", "Best Buy", "Home Depot", "Lowe's", "IKEA", "Apple Store", "Nike", "Zara", "H&M", "Uniqlo", "Etsy", "eBay", "Wayfair",
                              "Nordstrom", "Macy's", "TJ Maxx", "Marshalls", "REI", "Dick's Sporting Goods", "Sephora", "Ulta", "Bath & Body Works", "Shein", "Temu", "Lululemon",
                              "Costco.com", "Chewy", "Staples", "Office Depot", "Michaels", "Hobby Lobby", "Dollar Tree", "Five Below", "GameStop", "Barnes & Noble"]),
    "Health/Medical": ("purchase", ["One Medical", "Quest Diagnostics", "LabCorp", "Kaiser Permanente", "Mayo Clinic", "CityMD", "Zocdoc", "Hims", "Talkspace", "BetterHelp",
                                    "Dental Associates", "Vision Works", "Warby Parker", "Mount Sinai", "Cleveland Clinic", "Urgent Care"]),
    "Pharmacy": ("purchase", ["CVS Pharmacy", "Walgreens", "Rite Aid", "Costco Pharmacy", "Amazon Pharmacy", "GoodRx", "Capsule Pharmacy", "Duane Reade", "Walmart Pharmacy"]),
    "Travel": ("purchase", ["Delta Air Lines", "United Airlines", "American Airlines", "Southwest", "JetBlue", "Alaska Airlines", "Spirit", "Frontier Airlines", "Ryanair", "Airbnb",
                            "Vrbo", "Marriott", "Hilton", "Hyatt", "Holiday Inn", "Expedia", "Booking.com", "Hotels.com", "Hertz", "Enterprise Rent-A-Car", "Avis", "Turo",
                            "Kayak", "TSA PreCheck", "Global Entry"]),
    "Entertainment": ("purchase", ["AMC Theatres", "Regal Cinemas", "Ticketmaster", "StubHub", "Eventbrite", "Steam", "PlayStation Store", "Xbox", "Nintendo eShop", "Dave & Buster's",
                                   "Topgolf", "Bowlero", "MoMA", "Six Flags", "Disneyland", "Universal Studios", "Fandango", "Live Nation"]),
    "Education": ("purchase", ["Coursera", "Udemy", "Khan Academy", "Chegg", "Pearson", "College Board", "Kaplan", "MasterClass", "Codecademy", "Skillshare", "Nelnet Student Loan",
                               "Navient", "Mohela", "Great Lakes", "Sallie Mae"]),
    "Childcare": ("bill", ["Bright Horizons", "KinderCare", "The Learning Experience", "Care.com", "Primrose School", "Goddard School", "Little Sprouts Daycare", "Sittercity", "YMCA Camp"]),
    "Government/Taxes": ("bill", ["IRS", "US Treasury", "State Tax Payment", "DMV", "City Parking Ticket", "USPS", "Passport Services", "County Property Tax", "Toll Roads", "E-ZPass",
                                  "FasTrak", "SunPass", "Court Fees"]),
    "Fees": ("fee", ["Overdraft Fee", "NSF Fee", "Monthly Service Fee", "Monthly Maintenance Fee", "Non-Bank ATM Fee", "ATM Surcharge", "Foreign Transaction Fee", "Late Payment Fee",
                     "Annual Fee", "Wire Transfer Fee", "Paper Statement Fee", "Returned Item Fee", "Cash Advance Fee", "Stop Payment Fee", "Interest Charge Purchases"]),
    "Income": ("income", ["ACME Corp Payroll", "Gusto Pay", "ADP Payroll", "Paychex", "Northwind Payroll", "Rippling", "Justworks", "Deel", "Social Security SSA", "IRS Tax Refund",
                          "State Tax Refund", "Interest Payment", "Dividend Payment", "Upwork", "Fiverr", "DoorDash Dasher Pay", "Uber Driver Pay", "Airbnb Payout", "Etsy Payout",
                          "Venmo Cashout", "Unemployment Benefit", "Child Support Deposit"]),
    "Transfers": ("transfer", ["Online Transfer to Savings", "Transfer from Checking", "Zelle Payment", "Venmo Payment", "Cash App Payment", "PayPal Transfer", "Apple Cash",
                               "Payment to Credit Card Autopay", "Chase Card Payment", "Amex Payment", "Capital One Payment", "Discover Payment", "Robinhood Transfer",
                               "Fidelity Transfer", "Vanguard Transfer", "Wealthfront Deposit", "Acorns Round-Up", "Coinbase Transfer", "Wise Transfer", "Remitly"]),
    "Cash/ATM": ("atm", ["ATM Withdrawal Chase", "ATM Withdrawal Bank of America", "ATM Withdrawal Wells Fargo", "ATM Withdrawal 7-Eleven", "ATM Withdrawal CVS", "ATM Withdrawal Allpoint",
                         "ATM Withdrawal Citibank", "ATM Withdrawal Casino", "Cash Withdrawal Teller", "ATM Withdrawal Walgreens"]),
    "Charity": ("purchase", ["Red Cross", "GoFundMe", "St. Jude", "Doctors Without Borders", "Local Food Bank", "Planned Parenthood", "ACLU", "Wikipedia Foundation", "NPR", "PBS",
                             "Church Online Giving", "Habitat for Humanity", "UNICEF", "World Wildlife Fund"]),
    "Pets": ("purchase", ["Chewy", "Petco", "PetSmart", "Banfield Pet Hospital", "Rover", "Wag", "BarkBox", "VCA Animal Hospital", "Trupanion", "Healthy Paws"]),
    "Personal Care": ("purchase", ["Great Clips", "Supercuts", "Drybar", "Massage Envy", "European Wax Center", "Glossier", "Harry's", "Dollar Shave Club", "Sephora Salon", "SoulCycle",
                                   "Orangetheory", "ClassPass", "Barry's", "CorePower Yoga"]),
}
CITIES = [("NEW YORK", "NY"), ("LOS ANGELES", "CA"), ("CHICAGO", "IL"), ("HOUSTON", "TX"), ("PHOENIX", "AZ"), ("SEATTLE", "WA"), ("DENVER", "CO"), ("AUSTIN", "TX"),
          ("BOSTON", "MA"), ("ATLANTA", "GA"), ("MIAMI", "FL"), ("PORTLAND", "OR"), ("SAN FRANCISCO", "CA"), ("NASHVILLE", "TN"), ("MINNEAPOLIS", "MN"), ("CHARLOTTE", "NC")]
LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"


def ref(rng):
    return rng.choice(LETTERS) + rng.choice(LETTERS) + str(rng.randint(10, 999)) + rng.choice(LETTERS)


def mmdd(rng):
    return f"{rng.randint(1, 12):02d}{rng.randint(1, 28):02d}"


def caps(name):
    return name.upper().replace("'", "").replace("’", "")


def squash(name):
    return "".join(ch for ch in name.upper() if ch.isalnum())


def templates(kind):
    # Each template is a function of (rng, name) -> raw descriptor.
    common = [
        lambda r, n: f"{caps(n)} {r.choice(CITIES)[0]} {r.choice(CITIES)[1]}",
        lambda r, n: f"{caps(n)}",
        lambda r, n: f"CHECKCARD {mmdd(r)} {caps(n)} {r.choice(CITIES)[0]}{r.choice(CITIES)[1]}",
        lambda r, n: f"POS DEBIT {caps(n)} {mmdd(r)}",
        lambda r, n: f"{caps(n)[:22]}*{ref(r)}",
        lambda r, n: f"{caps(n)[:18]} {ref(r)} {r.choice(CITIES)[1]}",
        lambda r, n: f"DEBIT CARD PURCHASE {caps(n)[:20]}",
        lambda r, n: f"{squash(n)[:16]} {r.choice(CITIES)[0]}",
        lambda r, n: f"PENDING {caps(n)[:24]}",
        lambda r, n: f"{caps(n)[:25]} {mmdd(r)}",
    ]
    by_kind = {
        "purchase": [lambda r, n: f"SQ *{caps(n)[:20]}", lambda r, n: f"TST* {caps(n)[:20]}", lambda r, n: f"PP*{squash(n)[:14]}",
                     lambda r, n: f"{caps(n)[:20]} #{r.randint(100, 9999)}", lambda r, n: f"DD {caps(n)[:20]}", lambda r, n: f"{caps(n)[:16]} ONLINE {ref(r)}"],
        "subscription": [lambda r, n: f"RECURRING {caps(n)[:22]}", lambda r, n: f"{caps(n)[:20]} SUBSCR {ref(r)}", lambda r, n: f"{caps(n)[:18]}*MONTHLY",
                         lambda r, n: f"GOOGLE *{squash(n)[:14]} g.co/helppay#", lambda r, n: f"APPLE.COM/BILL {caps(n)[:16]}", lambda r, n: f"{caps(n)[:20]} {r.randint(800, 899)}-{r.randint(200, 999)}-{r.randint(1000, 9999)}"],
        "bill": [lambda r, n: f"{caps(n)[:22]} BILL PAY", lambda r, n: f"{caps(n)[:20]} AUTOPAY {mmdd(r)}", lambda r, n: f"ACH DEBIT {caps(n)[:20]}",
                 lambda r, n: f"{caps(n)[:20]} ONLINE PMT", lambda r, n: f"{caps(n)[:18]} WEB PMTS {ref(r)}", lambda r, n: f"BILL PAYMENT {caps(n)[:20]}"],
        "fee": [lambda r, n: f"{caps(n)}", lambda r, n: f"{caps(n)} {mmdd(r)}", lambda r, n: f"{caps(n)} - CHK ••{r.randint(1000, 9999)}", lambda r, n: f"{caps(n)[:20]} ASSESSED",
                lambda r, n: f"FEE: {caps(n)}", lambda r, n: f"{caps(n)} (SEE STATEMENT)"],
        "income": [lambda r, n: f"ACH CREDIT {caps(n)[:20]} PAYROLL", lambda r, n: f"DIRECT DEP {caps(n)[:20]}", lambda r, n: f"{caps(n)[:20]} DES:PAYROLL ID:{ref(r)}",
                   lambda r, n: f"DEPOSIT {caps(n)[:22]}", lambda r, n: f"{caps(n)[:22]} CREDIT", lambda r, n: f"ACH CREDIT {caps(n)[:18]} {mmdd(r)}"],
        "transfer": [lambda r, n: f"{caps(n)[:26]} ••{r.randint(1000, 9999)}", lambda r, n: f"{caps(n)[:24]} {mmdd(r)}", lambda r, n: f"ONLINE {caps(n)[:22]}",
                     lambda r, n: f"{caps(n)[:22]} CONF {ref(r)}", lambda r, n: f"MOBILE {caps(n)[:22]}", lambda r, n: f"{caps(n)[:20]} TO {r.choice(['SAV', 'CHK', 'BRK'])} ••{r.randint(1000, 9999)}"],
        "atm": [lambda r, n: f"{caps(n)[:26]} {r.choice(CITIES)[0]}", lambda r, n: f"{caps(n)[:22]} {mmdd(r)}", lambda r, n: f"{caps(n)[:22]} CARD ••{r.randint(1000, 9999)}",
                lambda r, n: f"CASH {caps(n)[:22]}", lambda r, n: f"{caps(n)[:20]} TERMINAL {ref(r)}", lambda r, n: f"{caps(n)[:24]} {r.choice(CITIES)[1]}"],
    }
    return common + by_kind.get(kind, [])


REFUND_TEMPLATES = [lambda r, n: f"{caps(n)[:20]} REFUND", lambda r, n: f"RETURN {caps(n)[:20]}", lambda r, n: f"{caps(n)[:18]} CREDIT {ref(r)}",
                    lambda r, n: f"REFUND: {caps(n)[:20]} {mmdd(r)}", lambda r, n: f"{caps(n)[:20]} RETURN CREDIT"]
UNKNOWN = ["POS PURCHASE", "MISC DEBIT", "CARD PURCHASE", "DEBIT", "PURCHASE AUTHORIZED", "VISA DDA PUR", "ELECTRONIC WITHDRAWAL", "EFT DEBIT", "CHECK", "PAYMENT",
           "ONLINE PAYMENT", "WITHDRAWAL", "ADJUSTMENT", "MEMO POST", "SERVICE", "TRANSACTION", "ACH DEBIT", "POS", "CHK CARD PUR", "DEBIT MEMO"]


def main():
    rng = random.Random(SEED)
    rows, seen = [], set()

    def add(raw, merchant, category, kind):
        raw = " ".join(raw.split())[:34]
        if raw in seen:
            return False
        seen.add(raw)
        rows.append({"raw": raw, "merchant": merchant, "category": category, "kind": kind})
        return True

    merchants = [(cat, kind, name) for cat, (kind, names) in CATALOG.items() for name in names]
    # Every merchant gets its clean form plus several rendered variants; refunds come from purchase/subscription merchants.
    for cat, kind, name in merchants:
        add(caps(name), name, cat, kind)
        for t in rng.sample(templates(kind), 4):
            add(t(rng, name), name, cat, kind)
        if kind in ("purchase", "subscription") and rng.random() < 0.35:
            add(rng.choice(REFUND_TEMPLATES)(rng, name), name, cat, "refund")
    while len(rows) < TARGET - 60:
        cat, kind, name = rng.choice(merchants)
        add(rng.choice(templates(kind))(rng, name), name, cat, kind)
    for i in range(60):
        base = rng.choice(UNKNOWN)
        raw = base + " " + rng.choice([mmdd(rng), ref(rng), str(rng.randint(100, 9999)), f"{rng.choice(CITIES)[0]} {rng.choice(CITIES)[1]}"])
        while not add(raw, "Unknown", "Unknown", "unknown"):
            raw = base + " " + ref(rng) + " " + mmdd(rng)
    rows.sort(key=lambda r: (r["category"], r["merchant"], r["raw"]))
    categories = sorted({r["category"] for r in rows})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"schema_version": 1, "categories": categories, "rows": rows}, indent=1) + "\n")
    from collections import Counter
    print(f"wrote {OUT}: {len(rows)} rows, {len(categories)} categories, {len(merchants)} merchants")
    print(dict(Counter(r["kind"] for r in rows)))


if __name__ == "__main__":
    main()
