#!/usr/bin/env python3
"""Per-person earnings totals for the Upmore catalog, 2026-09-26.
Layered, reproducible, no invented probabilities. All figures trace to
payout_min/payout_max on live (researched+verified) routes.
"""
import json, re
from collections import defaultdict

D = json.load(open('/home/hatch/workspace/upmore/src/data/upmore-data.json'))
routes = [r for r in D['routes'] if r.get('status') in ('researched', 'verified')]

def f(x):
    try: return float(x or 0)
    except: return 0.0

def norm(s): return re.sub(r'[^a-z0-9 ]', '', (s or '').lower()).strip()

# --- dedup: same provider + category + same reward text -> keep first (verified wins)
order = {'verified': 0, 'researched': 1}
groups = defaultdict(list)
for r in routes: groups[(norm(r.get('provider')), r.get('category'), norm(r.get('reward'))[:80])].append(r)
deduped, n_dup = [], 0
for g in groups.values():
    g.sort(key=lambda r: order.get(r.get('status'), 9))
    deduped.append(g[0]); n_dup += len(g) - 1

BUYBACK = {'Buyback/Resale', 'Niche Buyback', 'Buyback', 'Gift Card Resale'}
UNUSED_CORE_CATS = {'Bank Bonus', 'Brokerage Promo', 'Fintech/Neobank', 'Signup Bonus',
             'Crypto Learn', 'Telecom Promo', 'Rebate/Incentive', 'Deposit Bonus',
             'Business Banking', 'Student Program'}

def cadence(r):
    rep = r.get('repeatable')
    return rep.get('cadence', '') if isinstance(rep, dict) else str(rep or '')

def classify(r):
    cad = cadence(r).lower()
    cat = r.get('category') or ''
    ec = r.get('earnings_class') or ''
    if isinstance(ec, dict): ec = ''
    coc = r.get('cash_or_credit') or ''
    rew = (r.get('reward') or '').lower()
    req = (str(r.get('requirements') or '') + ' ' + str(r.get('who_qualifies') or '')).lower()
    wp = str(r.get('who_pays') or '').lower()
    flags = {
        'referral': ('per successful referral' in cad or 'per referred' in cad
                     or 'referral reward' in wp),
        'bugbounty': cat == 'Code Bounties',
        'buyback': cat in BUYBACK,
        'prediction': cat == 'Prediction Market',
        'speculative': 'speculative' in str(ec).lower(),
        'restricted': coc in ('Restricted credit', 'Usable value') or 'gift reward card' in wp or 'statement credit' in rew,
        'giftcard': 'gift card' in rew,
        'inperson': cat in ('Clinical Trial', 'Government'),
        'business': cat == 'Business Banking' or bool(re.search(r'business(?! days)', req))
                      or 'business-only' in rew or 'business only' in rew
                      or bool(re.search(r'business', (r.get('provider') or ''), re.I)),
        'rebate': cat in ('Rebate/Incentive', 'Energy Switching'),
        'work_unit': bool(re.search(r'per (completed|accepted|approved|submitted|tracked|won|matched|linked|invited)', cad)),
    }
    return flags

buckets = defaultdict(list)
for r in deduped:
    fl = classify(r)
    if fl['referral']: b = 'referral'
    elif fl['bugbounty']: b = 'excluded_bugbounty'
    elif fl['prediction']: b = 'excluded_prediction'
    elif fl['buyback']: b = 'buyback'
    elif fl['speculative']: b = 'speculative'
    elif fl['restricted'] or fl['giftcard']: b = 'noncash'
    elif fl['inperson']: b = 'inperson'
    elif fl['rebate']: b = 'rebate'
    elif fl['business']: b = 'business'
    else: b = 'self'
    buckets[b].append(r)

BONUS_CATS = {'Bank Bonus', 'Brokerage Promo', 'Fintech/Neobank', 'Signup Bonus',
              'Crypto Learn', 'Telecom Promo', 'Carrier Switch', 'Deposit Bonus',
              'Student Program', 'Cashback/Shopping', 'Store Signup'}
bonus_rs = [r for r in buckets['self'] if (r.get('category') or '') in BONUS_CATS]
work_rs = [r for r in buckets['self'] if (r.get('category') or '') not in BONUS_CATS]

def total(rs, key):
    return round(sum(f(r.get(key)) for r in rs), 2)

def cat_breakdown(rs, key):
    c = defaultdict(float)
    for r in rs: c[r.get('category') or '?'] += f(r.get(key))
    return sorted(((round(v, 2), k) for k, v in c.items()), reverse=True)

self_rs = buckets['self']

time_min = sum(f(r.get('time_min_minutes')) for r in self_rs)
verified_share = total([r for r in self_rs if r.get('status') == 'verified'], 'payout_min')

# referral scenario: one successful referral per program (floor), and top-10 x5
ref_rs = buckets['referral']
ref_one = total(ref_rs, 'payout_min')
top10 = sorted(ref_rs, key=lambda r: f(r.get('payout_min')), reverse=True)[:10]
ref_5x = round(sum(min(f(r.get('payout_min')) * 5, f(r.get('payout_max')) or f(r.get('payout_min')) * 5) for r in top10), 2)

report = {
    'as_of': '2026-09-26',
    'live_routes': len(routes),
    'deduped': len(deduped),
    'duplicates_removed': n_dup,
    'self_floor_min': total(self_rs, 'payout_min'),
    'self_max_max': total(self_rs, 'payout_max'),
    'self_n': len(self_rs),
    'bonus_floor_min': total(bonus_rs, 'payout_min'),
    'bonus_max_max': total(bonus_rs, 'payout_max'),
    'bonus_n': len(bonus_rs),
    'work_floor_min': total(work_rs, 'payout_min'),
    'work_n': len(work_rs),
    'rebate_floor_min': total(buckets['rebate'], 'payout_min'),
    'rebate_n': len(buckets['rebate']),
    'business_floor_min': total(buckets['business'], 'payout_min'),
    'business_n': len(buckets['business']),
    'floor_by_category_min': cat_breakdown(self_rs, 'payout_min'),
    'max_by_category_max': cat_breakdown(self_rs, 'payout_max'),
    'verified_share_of_floor': verified_share,
    'work_unit_routes': len(work_rs),
    'time_hours_min': round(time_min / 60, 1),
    'referral_one_each_floor': ref_one,
    'referral_n': len(ref_rs),
    'referral_top10_x5_scenario': ref_5x,
    'referral_top10': [(r['id'], r.get('provider'), f(r.get('payout_min')), f(r.get('payout_max'))) for r in top10],
    'buyback_floor': total(buckets['buyback'], 'payout_min'),
    'buyback_n': len(buckets['buyback']),
    'noncash_floor': total(buckets['noncash'], 'payout_min'),
    'noncash_n': len(buckets['noncash']),
    'speculative_n': len(buckets['speculative']),
    'inperson_n': len(buckets['inperson']),
    'excluded_bugbounty_max': total(buckets['excluded_bugbounty'], 'payout_max'),
    'excluded_prediction_max': total(buckets['excluded_prediction'], 'payout_max'),
    'top_floor_contributors': [(r['id'], r.get('provider'), r.get('category'), f(r.get('payout_min'))) for r in sorted(self_rs, key=lambda r: f(r.get('payout_min')), reverse=True)[:15]],
    'top_max_contributors': [(r['id'], r.get('provider'), r.get('category'), f(r.get('payout_max'))) for r in sorted(self_rs, key=lambda r: f(r.get('payout_max')), reverse=True)[:15]],
    'zero_min_self': sum(1 for r in self_rs if f(r.get('payout_min')) == 0),
}
json.dump(report, open('/home/hatch/workspace/upmore/research/per-person-totals-2026-09-26.json', 'w'), indent=1)
print(json.dumps({k: v for k, v in report.items() if k not in ('top_floor_contributors', 'top_max_contributors', 'referral_top10')}, indent=1))
print('\nTOP FLOOR CONTRIBUTORS (min):')
for x in report['top_floor_contributors']: print(' ', x)
print('\nTOP MAX CONTRIBUTORS (max):')
for x in report['top_max_contributors']: print(' ', x)
