#!/usr/bin/env python3
"""Add NIL Club promo routes (R9323-R9330) to upmore-data.json.
Research: research/nil-club-promos-2026-09-26.md
"""
import json, pathlib

DATA = pathlib.Path("/home/hatch/workspace/upmore/src/data/upmore-data.json")
d = json.loads(DATA.read_text())

APP = "https://nilclub.com/app"
ATHLETE_REQ = ("College student-athlete on a roster at a school in a state that permits NIL activity; "
               "complete NIL Club in-app verification; link social accounts. Under-18 athletes need parental consent. "
               "NIL earnings are taxable income; deals are typically disclosed to your school (often required over $600).")
WHOQ = "College student-athletes only (18+; under-18 with parental consent) — verified in the NIL Club app."

def base(rid, method, what, reward, requirements, payout_timing, payout_value_note,
         catches, steps, cash_or_credit="Cash", tmin=20, tmax=45, ttf="Days to first payout"):
    return {
        "id": rid, "category": "NIL Athlete Deals", "provider": "NIL Club",
        "method": method, "what": what, "reward": reward,
        "requirements": requirements, "payout_timing": payout_timing,
        "payout_min": 0, "payout_max": 0, "payout_value_note": payout_value_note,
        "catches": catches, "url": APP, "affiliate": False, "affiliate_note": "",
        "ios_url": "", "android_url": "",
        "cash_or_credit": cash_or_credit,
        "earnings_class": "Count only actual received cash",
        "lane": "Standard", "status": "researched",
        "difficulty": "Easy", "tier": "Easy", "rank": None,
        "earn_ratio": None, "numeric_basis": "Terms as stated by NIL Club (nilclub.com); per-deal payouts vary by campaign.",
        "speed": "days", "time_min_minutes": tmin, "time_max_minutes": tmax,
        "time_to_first": ttf, "retired_reason": None,
        "who_qualifies": WHOQ,
        "steps": [{"n": i + 1, "text": s, "who": "Upmore", "done_when": "", "warns": ""} for i, s in enumerate(steps)],
    }

JOIN_STEPS = [
    "Download the NIL Club app (iOS/Android) or go to nilclub.com/app and create your athlete profile (sport, school, position, social links).",
    "Join or create your team's NIL Club and complete the in-app verification; link your social accounts.",
    "Set your payout method (PayPal or Venmo). If under 18, have a parent/guardian complete consent.",
]

routes = [
    base("R9323", "Fan subscription revenue share",
         "NIL Club: join your team's club and post exclusive content; fans pay $5–$20/month and revenue is split equally among every athlete on the roster.",
         "Equal share of your team's monthly fan subscription revenue (fans pay $5–$20/mo; split evenly across the whole roster)",
         ATHLETE_REQ,
         "Monthly, via PayPal or Venmo",
         "Varies with fan count: your share = total monthly subscriptions divided by roster athletes. No fixed per-athlete amount published.",
         ["Equal split means the star QB and the walk-on earn the same share — your payout depends on total fans, not your fame.",
          "Income depends on recruiting and keeping subscribers; clubs that post consistently keep more fans.",
          "No pay-for-play: content only, never tied to athletic performance.",
          "Must follow FTC disclosure and your school's NIL reporting rules; earnings are taxable."],
         JOIN_STEPS + [
             "Invite fans, friends, and family to subscribe to your team's club ($5/mo minimum, pay-what-you-can).",
             "Post exclusive content at your own pace (training clips, behind-the-scenes, game-day).",
             "Receive your equal share of the monthly revenue via PayPal or Venmo.",
         ], tmin=20, tmax=40, ttf="First payout after first billing cycle"),

    base("R9324", "Brand Deals: Direct-to-Athlete product signups",
         "NIL Club Brand Deals: sign up for banking/fintech products you genuinely use (SoFi, Coinbase, Acorns, Revolut ran here) and earn commission per verified conversion.",
         "Commission per verified signup/conversion (e.g., SoFi drove 47,000+ funded accounts at a 59% funding rate; Coinbase 4,100+ depositors)",
         ATHLETE_REQ + " Genuinely use the product — these deals are for real customers, not fake signups.",
         "After verified conversions; paid via PayPal or Venmo",
         "Performance-based: you earn per verified conversion. No public per-athlete rate card; campaigns set their own bounties.",
         ["Performance-based — no conversions, no pay. Only opt into products you'd actually use; fake signups get rejected.",
          "Financial products may have their own eligibility (e.g., bank account requirements) on top of NIL Club's.",
          "FTC sponsorship disclosure required on any promo content; disclose the deal to your school."],
         JOIN_STEPS + [
             "Open the Brand Deals tab and filter for Direct-to-Athlete / fintech offers.",
             "Opt into a product you genuinely want; sign up through the tracked link.",
             "Share your referral link with teammates and friends where allowed; conversions are tracked via Impact.com.",
             "Get paid per verified conversion to PayPal or Venmo.",
         ], tmin=20, tmax=45, ttf="Days to first conversion payout"),

    base("R9325", "Brand Deals: Amazon Prime Student referrals",
         "NIL Club Brand Deals: share your Amazon Prime Student referral link with roommates, teammates, and followers; earn per signup (a past campaign drove 17.4K signups and $658K revenue).",
         "Per-signup referral payout for each verified Prime Student signup through your link",
         ATHLETE_REQ,
         "After verified signups; paid via PayPal or Venmo",
         "Performance-based per-signup bounty set by the campaign; no fixed public rate.",
         ["Referral bounties only pay on verified signups — clicks alone don't pay.",
          "Don't spam: inauthentic blasting hurts conversion and can get you removed from campaigns.",
          "FTC disclosure required; disclose to your school per NIL rules."],
         JOIN_STEPS + [
             "Open the Brand Deals tab and opt into the Amazon/Prime Student referral campaign when live.",
             "Get your tracked referral link and share it with roommates, teammates, and followers.",
             "Verified signups are tracked; get paid per signup via PayPal or Venmo.",
         ], tmin=15, tmax=30, ttf="Days to first signup payout"),

    base("R9326", "Brand Deals: sponsored social content (per post)",
         "NIL Club Brand Deals: create sponsored posts/Reels for national brands (Subway, Gatorade, Ulta Beauty, LoveShackFancy) — paid per post or per campaign.",
         "Flat payment per post or per campaign (e.g., Subway's campaign: 174 athletes, 183 content pieces, 1.1M impressions)",
         ATHLETE_REQ + " An engaged social audience helps — brands pick athletes whose followers fit their customers.",
         "After deliverables are approved; paid via PayPal or Venmo",
         "Paid per post or per campaign; rates vary by brand, deliverable, and your reach. NIL Club's guide: most athletes earn $1K–$10K/year across many small deals.",
         ["Pay is per approved deliverable — follow the campaign brief exactly (format, hashtags, disclosure).",
          "Rejected or late content isn't paid; read deal requirements before opting in.",
          "FTC #ad/sponsored disclosure mandatory; no school logos/trademarks without permission; disclose to your school."],
         JOIN_STEPS + [
             "Open the Brand Deals tab; filter by content/post deals and apply with a short pitch (who you are, your audience, why you fit).",
             "If accepted, create the content per the brief (e.g., Reel, TikTok, or IG post) with required disclosure.",
             "Submit by the deadline; get paid per approved post/campaign via PayPal or Venmo.",
         ], tmin=30, tmax=90, ttf="Days to first post payout"),

    base("R9327", "Brand Deals: apparel/lifestyle content + sales commission",
         "NIL Club Brand Deals: feature apparel/lifestyle brands in authentic day-in-the-life content and earn product reimbursement plus commission per sale (Comfrt: free hoodie/sweatpants + 10% commission per sale; 2.3x expected athlete turnout).",
         "Product reimbursement + commission per sale (Comfrt paid 10% per sale on top of free apparel)",
         ATHLETE_REQ,
         "Reimbursement after posting; commissions after verified sales; paid via PayPal or Venmo",
         "Reimbursement covers the featured products; ongoing commission per verified sale (rate set per campaign, e.g., 10%).",
         ["Commission only pays on verified sales your content drives — posting alone earns just the reimbursement.",
          "Pick brands you actually wear; inauthentic posts convert poorly and brands won't rebook you.",
          "FTC disclosure required; disclose to your school per NIL rules."],
         JOIN_STEPS + [
             "Open the Brand Deals tab; opt into an apparel/lifestyle campaign and select your products.",
             "Create authentic content (e.g., an Instagram Reel from a real moment in your day) featuring the products, with disclosure.",
             "Share your tracked link/code; get reimbursed for the products and earn commission per verified sale.",
         ], tmin=30, tmax=60, ttf="Days to first commission"),

    base("R9328", "Brand Deals: food-delivery app referrals",
         "NIL Club Brand Deals: share referral links for food/grocery delivery apps (Uber Eats, Instacart ran here); earn per order or signup your network places.",
         "Per-order or per-signup referral payout for verified conversions through your link",
         ATHLETE_REQ,
         "After verified orders/signups; paid via PayPal or Venmo",
         "Performance-based bounty per verified order/signup, set per campaign; no fixed public rate.",
         ["Only verified orders/signups pay — self-referrals and fake accounts are rejected.",
          "Delivery promos are often geo-limited; check the campaign covers your campus area.",
          "FTC disclosure required; disclose to your school per NIL rules."],
         JOIN_STEPS + [
             "Open the Brand Deals tab and opt into the delivery-app referral campaign when live.",
             "Share your tracked link with teammates, friends, and followers.",
             "Get paid per verified order/signup via PayPal or Venmo.",
         ], tmin=15, tmax=30, ttf="Days to first referral payout"),

    base("R9329", "Brand Deals: product seeding (free gear)",
         "NIL Club Brand Deals: claim free products from brands — apparel, equipment, nutrition, personal care — with content sometimes required, sometimes not.",
         "Free products (apparel, equipment, nutrition, personal care); some seedings require a post, some don't",
         ATHLETE_REQ,
         "Products ship after you're accepted; paid in product, not cash",
         "Payout is product value, not cash — counted as usable value, not income toward cash goals.",
         ["This pays in free gear, not cash — don't count it as earnings.",
          "Some seedings require content in return; check whether posting is required before claiming.",
          "High-demand drops go fast; check the Brand Deals tab regularly."],
         JOIN_STEPS + [
             "Open the Brand Deals tab and filter for product-seeding offers.",
             "Claim offers that fit you; note whether a post is required.",
             "If content is required, post per the brief with disclosure; products ship to you.",
         ], cash_or_credit="Usable value", tmin=10, tmax=25, ttf="Days to delivery"),

    base("R9330", "Brand Deals: flat-fee local & national deals",
         "NIL Club Brand Deals: flat-fee campaigns and ambassador roles — paid appearances, longer-term brand ambassadorships (LaserAway: 1,894 consultations, $60K+ revenue; Tempo: 2.2K customers).",
         "Flat fee per campaign/appearance or ambassador term, set before you opt in",
         ATHLETE_REQ,
         "Per campaign terms, after deliverables; paid via PayPal or Venmo",
         "Flat fees vary by brand and scope and are stated up front in each deal — no guessing.",
         ["Flat-fee deals are competitive; brands pick athletes whose audience fits — apply with a real pitch.",
          "Ambassador roles may span weeks/months with ongoing deliverables; read the full term before accepting.",
          "Paid appearances must comply with your school's NIL appearance rules; FTC disclosure always required."],
         JOIN_STEPS + [
             "Open the Brand Deals tab; filter by flat-fee, appearance, or ambassador deals.",
             "Apply with a short pitch; if selected, confirm the fee, deliverables, and timeline up front.",
             "Complete the deliverables; get paid the flat fee via PayPal or Venmo.",
         ], tmin=20, tmax=60, ttf="Per campaign terms"),
]

existing = {r["id"] for r in d["routes"]}
new = [r for r in routes if r["id"] not in existing]
d["routes"].extend(new)

# add category entry
if not any(c["name"] == "NIL Athlete Deals" for c in d["categories"]):
    d["categories"].append({
        "name": "NIL Athlete Deals",
        "count": len(new),
        "steps": sum(len(r["steps"]) for r in new),
    })

DATA.write_text(json.dumps(d, indent=1))
print(f"added {len(new)} routes; total now {len(d['routes'])}")
