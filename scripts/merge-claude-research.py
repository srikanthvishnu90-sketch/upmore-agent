#!/usr/bin/env python3
"""Conservative, repeatable import of the fixed Claude research handoff.

Imported public claims remain UNVERIFIED: claimed dates/passages are retained,
but never become observed research or implementation proof through import.
"""
import copy
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
FILES = {'bofa':'BA','capital-one-mobile':'CO','cash-app':'CA','chase-mobile':'CH',
         'freecash':'FC','google-wallet':'GW','paypal':'PP','propel':'PR','venmo':'VE','wellsfargo':'WF'}
COUNTS = {'CA':32,'GW':22,'CH':27,'VE':24,'CO':27,'PR':21,'PP':25,'BA':21,'FC':20,'WF':22}
RISK = {'read-only':'R1','money-movement':'R4','account-change':'R3','notify':'R1','credit':'R4','securities':'R4'}
FIELDS = ('entry_points','happy_path','variants','ui_states','input_schema','output_schema','source_of_truth',
          'owner_scope','auth_and_consent','eligibility','fees_and_limits','upstream_partner','dependencies',
          'data_freshness','failure_and_recovery','telemetry','user_copy')
LIST_FIELDS = {'entry_points','variants','ui_states','dependencies'}

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def index(rows, label):
    out = {}
    for row in rows:
        if not isinstance(row,dict) or not isinstance(row.get('id'),str) or not re.fullmatch(r'[A-Za-z0-9_.-]+',row['id']):
            raise ValueError(f'{label}: invalid ID')
        if row['id'] in out: raise ValueError(f'{label}: duplicate ID {row["id"]}')
        out[row['id']] = row
    return out

def merge(catalog, sources, bundles):
    """Pure validation/transformation. No writes occur until every input passes."""
    catalog,sources = copy.deepcopy(catalog),copy.deepcopy(sources)
    existing = index(catalog['features'],'existing features')
    existing_sources = index(sources['sources'],'existing sources')
    seeds = {r['id']:r for r in catalog['features'] if r.get('record_type')=='seed'}
    expected = {f'{app}-{n:03}' for app,count in COUNTS.items() for n in range(1,count+1)}
    if set(seeds)!=expected or any(seeds[s]['app_ids']!=[s.split('-')[0]] for s in seeds):
        raise ValueError('fixed 241-seed cohort altered')
    incoming_f,incoming_s = [],[]
    for stem,app,feature_doc,source_doc in bundles:
        if FILES.get(stem)!=app: raise ValueError('unknown handoff file/cohort alias')
        if feature_doc.get('schema_version')!=1 or source_doc.get('schema_version')!=1:
            raise ValueError('unsupported handoff schema')
        for collection,key,target in ((feature_doc,'features',incoming_f),(source_doc,'sources',incoming_s)):
            if not isinstance(collection.get(key),list): raise ValueError(f'invalid {key} collection')
            for raw in collection[key]:
                if not isinstance(raw,dict): raise ValueError('non-object handoff row')
                target.append((stem,app,copy.deepcopy(raw)))
    index([r for _,_,r in incoming_f],'incoming features')
    index([r for _,_,r in incoming_s],'incoming sources')
    known_sources = set(existing_sources)|{r['id'] for _,_,r in incoming_s}
    report = {'schema_version':1,'input_feature_count':len(incoming_f),'input_source_count':len(incoming_s),
              'added_features':0,'added_sources':0,'discovery_count':0,'atomic_count':0,'fallback_source_lineage':[],
              'normalized_character_arrays':[],'preserved_seed_count':len(seeds),'feature_id_map':{},'source_id_map':{},
              'verification':'Imported claims only; no observations, software, sandbox or live promotion.'}
    for stem,app,row in incoming_s:
        original = copy.deepcopy(row)
        parsed = urlsplit(row.get('url',''))
        if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError(f'{row["id"]}: unsafe source URL')
        note = row.get('local_note')
        if note and hashlib.sha256(note.encode()).hexdigest()!=row.get('local_note_sha256'):
            raise ValueError(f'{row["id"]}: claimed note hash mismatch')
        row.update(app_ids=[app],observed_at=None,research_confidence='UNVERIFIED',upstream_content_hash=None,
                   claimed_observed_at=original.get('observed_at'),claimed_research_confidence=original.get('research_confidence'),
                   import_provenance={'file':f'docs/competition/_claude-research/sources-{stem}.json','row_sha256':digest(original),
                                      'researcher':'Claude handoff','independently_verified':False})
        row['caveats'] = list(row.get('caveats') or [])+['Imported researcher claim; source and authenticated behavior not independently verified by this merge.']
        report['source_id_map'][row['id']]=row['id']
        if row['id'] in existing_sources:
            if row!=existing_sources[row['id']]: raise ValueError(f'source ID collision: {row["id"]}')
        else:
            sources['sources'].append(row);report['added_sources']+=1
    for stem,app,raw in incoming_f:
        fid=raw['id'];parent=raw.get('parent_id')
        if raw.get('app_ids')!=[app] or not fid.startswith(app+'-'): raise ValueError(f'{fid}: incorrect cohort binding')
        if parent is not None and (parent not in seeds or seeds[parent]['app_ids']!=[app]):
            raise ValueError(f'{fid}: missing or foreign seed parent')
        refs=raw.get('source_ids',[])
        if not isinstance(refs,list) or len(refs)!=len(set(refs)) or any(s not in known_sources for s in refs):
            raise ValueError(f'{fid}: duplicate or missing source reference')
        passages=raw.get('source_passages',[])
        if not isinstance(passages,list) or any(not isinstance(p,dict) or p.get('source_id') not in refs for p in passages):
            raise ValueError(f'{fid}: missing passage reference')
        # This handoff must not smuggle arbitrary file paths or implementation evidence.
        if any(raw.get(k) for k in ('implementation_files','screenshots','evidence_ids')) or any(raw.get('tests',{}).values()):
            raise ValueError(f'{fid}: unexpected implementation/evidence path in research handoff')
        if raw.get('risk_tier') not in RISK: raise ValueError(f'{fid}: unknown risk classification')
        row=copy.deepcopy(raw)
        for field in FIELDS:
            row.setdefault(field,[] if field in LIST_FIELDS else None)
        variants=row.get('variants')
        if isinstance(variants,list) and len(variants)>5 and all(isinstance(v,str) and len(v)==1 for v in variants):
            row['variants']=[''.join(variants)];report['normalized_character_arrays'].append(fid)
        # Missing references inherit design lineage only, not a factual competitor claim.
        if not refs:
            lineage=seeds[parent]['source_ids'] if parent else sorted({s for seed in seeds.values() if seed['app_ids']==[app] for s in seed['source_ids']})
            if not lineage: raise ValueError(f'{fid}: no explicit source or seed lineage')
            row['source_ids']=list(lineage);report['fallback_source_lineage'].append(fid)
        row.update(record_type='atomic' if parent else 'discovery',risk_tier=RISK[raw['risk_tier']],
                   competitor_presence={app:'UNVERIFIED'},source_passages=[],claimed_source_passages=passages,
                   claimed_competitor_presence=raw.get('competitor_presence',{}),status='DISCOVERED',delivery_mode='UNVERIFIED',
                   implementation_files=[],tests={'unit':[],'contract':[],'integration':[],'browser':[]},screenshots=[],evidence_ids=[],
                   launch_gates=['Independent source verification and complete Upmore contracts required; no provider or release authority established.'],
                   import_provenance={'file':f'docs/competition/_claude-research/features-{stem}.json','row_sha256':digest(raw),
                                      'researcher':'Claude handoff','independently_verified':False},
                   next_step='Independently verify cited behavior and restrictions, then specify and implement the Upmore outcome with owner-scoped evidence.')
        row['known_gaps']=list(row.get('known_gaps') or [])+['Imported public/source claims not independently verified; authenticated behavior UNVERIFIED.']
        if not refs: row['known_gaps'].append('Source references inherited as design lineage only; no precise supporting passage supplied.')
        report['feature_id_map'][fid]=fid
        report['atomic_count' if parent else 'discovery_count']+=1
        if fid in existing:
            if row!=existing[fid]: raise ValueError(f'feature ID collision: {fid}')
        else: catalog['features'].append(row);report['added_features']+=1
    report.update(total_features=len(catalog['features']),total_sources=len(sources['sources']),
                  catalog_sha256=digest(catalog),sources_sha256=digest(sources))
    return catalog,sources,report

def load_bundles(root):
    folder=root/'docs/competition/_claude-research'
    expected={f'{kind}-{stem}.json' for stem in FILES for kind in ('features','sources')}
    if {p.name for p in folder.iterdir()}!=expected: raise ValueError('unexpected/missing handoff file')
    bundles=[]
    for stem,app in FILES.items():
        docs=[]
        for kind in ('features','sources'):
            path=folder/f'{kind}-{stem}.json'
            if path.is_symlink() or path.resolve().parent!=folder.resolve(): raise ValueError('unsafe handoff path')
            docs.append(json.loads(path.read_text()))
        bundles.append((stem,app,*docs))
    return bundles

def main():
    folder=ROOT/'docs/competition'
    catalog,sources,report=merge(json.loads((folder/'features.json').read_text()),json.loads((folder/'sources.json').read_text()),load_bundles(ROOT))
    for name,doc in (('features.json',catalog),('sources.json',sources),('claude-merge-report.json',report)):
        (folder/name).write_text(json.dumps(doc,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({k:v for k,v in report.items() if not k.endswith('_map')},indent=2))

if __name__=='__main__':main()
