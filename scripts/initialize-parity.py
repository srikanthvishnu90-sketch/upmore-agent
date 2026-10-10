#!/usr/bin/env python3
"""One-time conservative inventory; refuses to overwrite reviewed records."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'docs/competition'
URLS = '''https://www.similarweb.com/top-apps/google/finance/top-free/
https://cash.app/learn/getting-started/what-is-cash-app-and-how-does-it-work
https://cash.app/bank
https://cash.app/access-cash
https://support.google.com/wallet/answer/11951709?hl=en
https://wallet.google/intl/en_us/
https://www.chase.com/digital/mobile-banking
https://venmo.com/
https://venmo.com/about/crypto
https://venmo.com/about/creditcard
https://www.capitalone.com/digital/tools/mobile/
https://www.propel.app/
https://www.propel.app/frequently-asked-questions/
https://www.propel.app/snap/propel-ebt-security-features/
https://securepayments.paypal.com/us/digital-wallet
https://www.paypal.com/us/cshelp/article/what-are-the-benefits-of-paypals-apps-and-how-do-i-download-them%E2%80%AF-help379
https://info.bankofamerica.com/en/digital-banking/mobile-banking
https://freecash.com/academy/en/support/general/platform/what-is-freecash
https://freecash.com/en/cashout
https://www.wellsfargo.com/mobile-online-banking/apps/
https://www.wellsfargo.com/mobile-online-banking/financial-tools-services/
https://www.fdic.gov/consumer-resource-center/2024-06/banking-third-party-apps
https://www.sec.gov/resources-small-businesses/exempt-offerings/regulation-crowdfunding
https://robinhood.com/us/en/support/articles/investments-you-can-make-on-robinhood/
https://www.rocketmoney.com/
https://www.monarch.com/
https://sensortower.com/blog/consumer-banking-apps-and-advertising-trends-2025
https://appfigures.com/top-apps/google-play/united-states/finance?profile=product.280593180304'''.splitlines()
PUBLISHERS = ['Similarweb','Cash App','Cash App','Cash App','Google','Google','Chase','Venmo','Venmo','Venmo','Capital One','Propel','Propel','Propel','PayPal','PayPal','Bank of America','Freecash','Freecash','Wells Fargo','Wells Fargo','FDIC','SEC','Robinhood','Rocket Money','Monarch','Sensor Tower','Appfigures']
# Notes are our own observation summaries, not full page copies. Their hashes
# identify these notes, not the upstream HTML or an authenticated app session.
OBSERVED = {
 'S01': ('2026-10-06','US Google Play Finance Top Free usage table; only five rows accessible. September history not recovered.', 'Usage Rank table and update heading; five rows; narrative conflicts with change column.'),
 'S02': ('2026-05-01','Public account, funding, card, savings, investing and financing claims; eligibility varies.', 'Getting started; fees; safety; teen accounts; completed-payment refund section. Conflicting audience totals.'),
 'S05': (None,'Wallet stores passes/cards; Pay is checkout. Device and region restrictions apply.', 'About Google Wallet: Quick access; recent payment activity; data across Google; common questions.'),
 'S07': (None,'Mobile banking, bills, deposits, rewards and investing are described as distinct eligible services.', 'Mobile feature sections; common questions: pay bills, statements, balances, transfers; disclosure footnotes.'),
 'S11': (None,'Recurring charge discovery, blocking and conditional cancellation have different outcomes.', 'Subscription manager; FAQ; footnotes: blocking does not end merchant agreement; selected cancellations use Minna Technologies.'),
 'S13': (None,'Benefit viewing is state-dependent; Iowa balance access unavailable in this observation.', 'State coverage; read-only access; independent status; SSN and account deletion questions.'),
 'S20': (None,'Mobile account service includes bills, transfers, deposits, Fargo and account features.', 'Manage accounts; move money; deposit checks; FAQ functions and eligibility footnotes.'),
}

def initialize():
    if any((DIRECTORY / name).exists() for name in ('features.json','sources.json')):
        raise SystemExit('Existing reviewed inventory found; edit it instead of reinitializing.')
    sources=[]
    for number,(url,publisher) in enumerate(zip(URLS,PUBLISHERS),1):
        sid=f'S{number:02d}'
        observation=OBSERVED.get(sid)
        sources.append({'id':sid,'app':publisher,'title':f'{publisher} benchmark source {sid}',
            'url':url,'publisher':publisher,'observed_at':'2026-10-10' if observation else None,
            'visible_update_date':observation[0] if observation else None,
            'date_kind':'visible publication' if sid=='S02' else 'visible update' if sid=='S01' else 'undated or unverified',
            'page_scope':'public product/help page' if sid not in ('S01','S27','S28') else 'ranking/context',
            'claim':observation[1] if observation else None,
            'caveats':['Public claim is not exercised behavior or API authority.', 'Fee/eligibility help follow-up remains incomplete.'],
            'research_confidence':'OBSERVED-PUBLIC' if observation else 'OWNER-SEED-UNVERIFIED',
            'local_note':observation[2] if observation else None,
            'local_note_sha256':hashlib.sha256(observation[2].encode()).hexdigest() if observation else None,
            'upstream_content_hash':None})
    lines=[x for x in (DIRECTORY/'seed-inventory.txt').read_text().splitlines() if x and not x.startswith('#')]
    expected=[32,22,27,24,27,21,25,21,20,22]
    features=[];cohort=[]
    for group in range(10):
        prefix,app,refs=lines[group*2].split('|')
        outcomes=lines[group*2+1].split(';')
        assert len(outcomes)==expected[group],(prefix,len(outcomes))
        cohort.append({'id':prefix,'app':app,'baseline_position':group+1,'seed_count':len(outcomes)})
        for index,outcome in enumerate(outcomes,1):
            fid=f'{prefix}-{index:03d}'
            features.append({'id':fid,'record_type':'seed','parent_id':None,'app_ids':[prefix],
                'source_ids':refs.split(','),'source_passages':[],
                'competitor_presence':{prefix:'UNVERIFIED'},'outcome':outcome,
                'entry_points':[],'happy_path':None,'variants':[],'ui_states':[],
                'input_schema':None,'output_schema':None,'source_of_truth':None,
                'owner_scope':None,'auth_and_consent':None,'eligibility':None,
                'fees_and_limits':None,'upstream_partner':None,'dependencies':[],
                'data_freshness':None,'risk_tier':None,'implementation_files':[],
                'tests':{'unit':[],'contract':[],'integration':[],'browser':[]},
                'failure_and_recovery':None,'telemetry':None,'user_copy':None,
                'screenshots':[],'status':'DISCOVERED','delivery_mode':'UNVERIFIED',
                'evidence_ids':[],'launch_gates':[],
                'next_step':'Verify precise help/fee/eligibility passages, expand atomic variants and specify contracts before implementation.',
                'known_gaps':['Seed is not yet an atomic, verified or implemented parity claim.']})
    assert len(features)==241
    for name,data in [('sources.json',{'schema_version':1,'sources':sources}),
                      ('features.json',{'schema_version':1,'cohort':cohort,'features':features,
                       'supplemental_scope':['docs/upmore-50-scenarios.json','docs/upmore-master-plan-acceptance.md'],
                       'inventory_complete':False})]:
        (DIRECTORY/name).write_text(json.dumps(data,indent=2)+'\n')
    print('241 seed outcomes recorded. Atomic expansion and research are incomplete; no parity promoted.')

if __name__=='__main__':initialize()
