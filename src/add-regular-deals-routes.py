#!/usr/bin/env python3
"""Add regular-people brand-deal routes (R9331-R9338) + retire stale R0345.
Research: research/regular-brand-deals-bitcoin-2026-09-26.md
"""
import json, pathlib

DATA = pathlib.Path("/home/hatch/workspace/upmore/src/data/upmore-data.json")
d = json.loads(DATA.read_text())

def base(rid, category, provider, method, what, reward, requirements, payout_timing,
         pmin, pmax, payout_value_note, catches, url, steps, cash_or_credit="Cash",
         tmin=20, tmax=60, ttf="Days to first payout"):
    return {
        "id": rid, "category": category, "provider": provider,
        "method": method, "what": what, "reward": reward,
        "requirements": requirements, "payout_timing": payout_timing,
        "payout_min": pmin, "payout_max": pmax, "payout_value_note": payout_value_note,
        "catches": catches, "url": url, "affiliate": False, "affiliate_note": "",
        "ios_url": "", "android_url": "",
        "cash_or_credit": cash_or_credit,
        "earnings_class": "Count only actual received cash",
        "lane": "Standard", "status": "researched",
        "difficulty": "Easy", "tier": "Easy", "rank": None,
        "earn_ratio": None, "numeric_basis": "Terms as stated by the provider; per-job pay varies.",
        "speed": "days", "time_min_minutes": tmin, "time_max_minutes": tmax,
        "time_to_first": ttf, "retired_reason": None,
        "who_qualifies": "Any adult who can film a phone video and follow a brief — no followers required unless noted.",
        "steps": [{"n": i + 1, "text": s, "who": "Upmore", "done_when": "", "warns": ""} for i, s in enumerate(steps)],
    }

routes = [
    base("R9331", "Creator Brand Deals", "Billo",
         "UGC videos for brands (no followers needed)",
         "Billo: film short product videos on your phone for brands' ads — payouts start at $30/video for new creators, $70+ for premium; market rates run $50–$150+ per video.",
         "$30–$150 per video starting out (platform rates from $30 new / $70 premium; experienced creators $150–$350+)",
         "18+; US, UK, Canada, or Australia; smartphone; able to follow a creative brief. No followers required.",
         "Every 2 weeks via PayPal", 30, 150,
         "Per approved video. Add-ons (hooks, longer cuts, whitelisting) raise pay.",
         ["Low-end tasks ($25–45/video) exist — check the payout before accepting a brief.",
          "Applications are competitive; new profiles get picked less often until they build ratings.",
          "You usually don't control where the content runs — expect it in paid ads.",
          "Revisions are part of the job; unpaid redo rounds eat your hourly rate."],
         "https://billo.app",
         ["Sign up at billo.app and build a small portfolio (3–5 sample clips shot on your phone).",
          "Browse brand briefs; apply to ones matching your style, noting the fixed payout.",
          "Film per the brief (usually 15–60 seconds), submit, handle any revision requests.",
          "Get paid per approved video, every two weeks via PayPal."], tmin=30, tmax=90),

    base("R9332", "Creator Brand Deals", "JoinBrands",
         "UGC marketplace: fixed-fee content + TikTok Shop affiliate commissions",
         "JoinBrands: 250,000+ creators, no follower minimum. Earn fixed fees per UGC photo/video, or do TikTok Shop affiliate (flat fee per video + 15–30% commission per sale + bonuses), or land monthly retainers.",
         "$50–$150+ per video; TikTok Shop affiliate adds 15–30% commission per sale on top",
         "18+; smartphone; no follower minimum. TikTok Shop affiliate needs a TikTok account.",
         "On content approval, to in-app wallet; cash out to bank or PayPal anytime", 50, 150,
         "Fixed per-piece fees shown up front; affiliate commissions 15–30% per verified sale; retainers vary.",
         ["Not every job pays cash — some are product-only; check the pay type before applying.",
          "Affiliate earnings are $0 until your content actually drives sales.",
          "Level/certification gating: premium jobs unlock as you climb levels 1–5."],
         "https://joinbrands.com",
         ["Create your free JoinBrands profile and connect your socials.",
          "Browse the marketplace — pay, product value, and commission are shown up front.",
          "Apply for fixed-fee UGC jobs and/or TikTok Shop affiliate deals; product ships free.",
          "Create, submit, get approved; cash out to bank/PayPal anytime."], tmin=20, tmax=60),

    base("R9333", "Creator Brand Deals", "Collabstr",
         "Fixed-price sponsored content bookings",
         "Collabstr: list fixed-price packages for posts/UGC across Instagram, TikTok, YouTube, Twitch, X, Amazon; 530,000+ brands browse and book you. Payment is held until the brand approves your work.",
         "$100–$500 per booking (you set your packages; brands choose)",
         "18+; an active social account on at least one supported platform. No hard follower minimum, but brands filter by audience size.",
         "After brand approves deliverables; held in escrow until then", 100, 500,
         "Per booking, priced by your packages. New profiles typically book at the low end.",
         ["You set prices but brands choose — new profiles with no reviews book slowly.",
          "Niche demand varies a lot; some categories are saturated.",
          "Scope creep: lock deliverables and revision rounds in the order before starting."],
         "https://collabstr.com",
         ["Sign up at collabstr.com, verify, and build your profile with packages and pricing.",
          "Add portfolio samples so brands can see your style.",
          "Accept bookings or apply to brand campaigns; payment is held in escrow.",
          "Deliver per the brief; funds release when the brand approves."], tmin=30, tmax=90),

    base("R9334", "Creator Brand Deals", "Insense",
         "UGC + ad-whitelisting campaigns",
         "Insense: create UGC for brands' paid ads, including whitelisting (brands run ads through your account). Pay is negotiated per campaign; earnings land in your wallet, then PayPal or bank.",
         "Negotiated per campaign (no public rate card)",
         "18+; content creation ability; whitelisting requires granting ad-account access to brands.",
         "Per campaign terms; wallet to PayPal or bank", 0, 0,
         "Negotiated per campaign — whitelisting deals typically pay more than plain UGC.",
         ["Pay is negotiated, not fixed — weaker negotiators earn less for the same work.",
          "Whitelisting gives brands ad access via your account; understand the permissions before granting.",
          "Steeper learning curve than fixed-price marketplaces."],
         "https://insense.pro",
         ["Sign up and complete your creator profile with samples.",
          "Apply to campaigns; negotiate scope and pay per campaign.",
          "Create content and grant whitelisting access only as agreed.",
          "Get paid per campaign terms to PayPal or bank."], tmin=30, tmax=90),

    base("R9335", "Creator Brand Deals", "Influenster",
         "Free VoxBoxes for honest reviews",
         "Influenster: get free VoxBoxes — often full-size products (some boxes worth $100+) — in exchange for honest reviews. Matched by profile, not follower count.",
         "Free products (often full-size); $0 cash",
         "13+ (with parent permission under 18 in some regions); complete your profile and surveys. Selection is competitive — offers go fast.",
         "Products ship after selection; paid in product", 0, 0,
         "Payout is product value, not cash — offsets spending rather than creating income.",
         ["Pays in product, not cash — don't count it as earnings.",
          "Selection isn't guaranteed; stay active and respond to surveys fast.",
          "Reviews must be honest; incentivized-review rules apply on some retailers."],
         "https://influenster.com",
         ["Sign up at influenster.com and complete your profile + surveys.",
          "Turn on notifications — VoxBox offers are claimed quickly.",
          "If selected, receive the box and post honest reviews on Influenster and linked socials."],
         cash_or_credit="Usable value", tmin=15, tmax=30, ttf="Days to first box"),

    base("R9336", "Creator Brand Deals", "BzzAgent",
         "Free BzzKits for reviews",
         "BzzAgent: try free products (BzzKits — full-size items plus samples) and share honest reviews; your BzzScore rises with activity and unlocks more campaigns.",
         "Free products; $0 cash",
         "18+ (or with parental consent); complete profile surveys; US and several European countries.",
         "Kits ship after you're matched; paid in product", 0, 0,
         "Payout is product value, not cash.",
         ["Pays in product, not cash.",
          "Campaign matching depends on profile fit and BzzScore — new members wait longer.",
          "Some campaigns require follow-up surveys or photos."],
         "https://bzzagent.com",
         ["Sign up at bzzagent.com and answer the profiling surveys.",
          "Link social accounts to raise your BzzScore.",
          "Accept matched campaigns; receive the BzzKit and complete the review tasks."],
         cash_or_credit="Usable value", tmin=15, tmax=30, ttf="Weeks to first kit"),

    base("R9337", "Crypto Reward", "Fold",
         "Earn bitcoin on gift cards + debit spend (withdrawable)",
         "Fold (NASDAQ: FLD): buy gift cards for hundreds of brands (Amazon, Apple, Nike, DoorDash, Home Depot, Uber) and earn 1–20% back in sats; or use the Fold debit card for flat 1% sats-back (no credit check, no annual fee). Withdraw real BTC to your own wallet.",
         "1–20% of gift-card spend back in BTC; debit card flat 1% or spin-the-wheel rates",
         "18+, US resident. Identity verification for withdrawals.",
         "Rewards credit after purchase; withdraw to your personal Bitcoin wallet", 0, 0,
         "Not income from nothing — it converts spending you already do into BTC. $1,000/mo routed spend at ~2% ≈ ~$20/mo in BTC.",
         ["BTC is volatile — your rewards' dollar value swings with the market.",
          "You must route spending through Fold's gift cards to earn — don't buy things you wouldn't otherwise.",
          "Rewards program terms can change; rates vary by retailer."],
         "https://foldapp.com",
         ["Download the Fold app (iOS/Android) or use foldapp.com; create your account.",
          "Before shopping, buy the retailer's gift card in the app (rate shown up front in sats).",
          "Pay with the gift card as usual; sats land in your Fold rewards account.",
          "Withdraw the BTC to your own wallet whenever you like — you hold the keys after withdrawal."], tmin=15, tmax=30),

    base("R9338", "Crypto Reward", "Lolli",
         "Bitcoin cashback on online shopping (withdrawable)",
         "Lolli: browser extension/app that pays BTC cashback when you shop partner retailers online. Transfer to any bitcoin address or cash out to a USD bank account once you hit $15.",
         "Varies by retailer (typically low-single-digit %; promos higher)",
         "18+, US only. No wallet needed to start (custodial until you withdraw).",
         "Rewards confirm ~90 days after purchase; withdraw at $15+ to BTC address or bank", 0, 0,
         "Same honest math as Fold: monetizes existing spend. $1,000/mo at ~2% ≈ ~$20/mo in BTC.",
         ["90-day confirmation wait — rewards aren't available instantly (retailer return windows).",
          "Using other cashback extensions or coupon codes on the same purchase can void rewards.",
          "BTC volatility applies; US-only."],
         "https://lolli.com",
         ["Install the Lolli extension (Chrome/Firefox/Safari/Edge) or the mobile app; sign up free.",
          "Click through Lolli before checking out at a partner store — the extension confirms tracking.",
          "Shop as usual; BTC credits to your Lolli wallet.",
          "At $15+, transfer to your own bitcoin address or withdraw USD to your bank."], tmin=10, tmax=20),
]

existing = {r["id"] for r in d["routes"]}
new = [r for r in routes if r["id"] not in existing]
d["routes"].extend(new)

if not any(c["name"] == "Creator Brand Deals" for c in d["categories"]):
    d["categories"].append({
        "name": "Creator Brand Deals",
        "count": 6,
        "steps": sum(len(r["steps"]) for r in new if r["category"] == "Creator Brand Deals"),
    })

# retire stale Coinbase Earn quiz route (program ended May 27, 2025)
for r in d["routes"]:
    if r["id"] == "R0345":
        r["status"] = "retired"
        r["retired_reason"] = ("Coinbase ended quiz-based Learning Rewards on 2026-05-27 "
                               "(verified 2026-09-26 via coinbase.com/earn). Current Earn = "
                               "staking/lending/USDC rewards requiring capital, not learn-and-earn.")

DATA.write_text(json.dumps(d, indent=1))
print(f"added {len(new)} routes; total now {len(d['routes'])}; R0345 retired")
