import copy
import importlib.machinery
import importlib.util
import json
from pathlib import Path
import hashlib
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
loader=importlib.machinery.SourceFileLoader('parity',str(ROOT/'scripts/parity-check'))
spec=importlib.util.spec_from_loader('parity',loader);parity=importlib.util.module_from_spec(spec);loader.exec_module(parity)

class ParityChecks(unittest.TestCase):
    def setUp(self):
        self.catalog=json.loads((ROOT/'docs/competition/features.json').read_text())
        self.sources=json.loads((ROOT/'docs/competition/sources.json').read_text())
        self.ledger=json.loads((ROOT/'docs/testing/evidence-ledger.json').read_text())
    def errors(self):return parity.validate(ROOT,self.catalog,self.sources,self.ledger,parity.source_digest())[0]
    def test_conservative_inventory_is_valid_but_not_complete(self):
        errors,summary,_=parity.validate(ROOT,self.catalog,self.sources,self.ledger,parity.source_digest())
        self.assertEqual(errors,[]);self.assertEqual(summary['baseline_seeds'],241)
        self.assertFalse(summary['inventory_complete']);self.assertEqual(summary['full_seed_outcomes']['live']['verified'],0)
    def test_orphan_source_is_rejected(self):
        self.catalog['features'][0]['source_ids']=['missing'];self.assertTrue(any('source reference' in e for e in self.errors()))
    def test_blocked_seed_cannot_disappear(self):
        self.catalog['features'].pop(0);self.assertTrue(any('baseline seeds' in e for e in self.errors()))
    def test_local_fixture_cannot_be_promoted_to_live(self):
        feature=self.catalog['features'][0];feature['status']='LIVE-VERIFIED';feature['evidence_ids']=[self.ledger['checks'][0]['id']]
        self.assertTrue(any('live completion not proved' in e for e in self.errors()))
    def test_missing_implementation_and_path_escape_rejected(self):
        self.catalog['features'][0]['implementation_files']=['../outside.ts']
        self.assertTrue(any('unsafe local reference' in e for e in self.errors()))
    def test_tampered_evidence_is_rejected(self):
        self.ledger['checks'][0]['log_sha256']='0'*64;self.assertTrue(any('changed evidence log' in e for e in self.errors()))
    def test_unverified_competitor_claim_is_rejected(self):
        self.catalog['features'][0]['competitor_presence']={'CA':'PRESENT'}
        self.catalog['features'][0]['source_passages']=[]
        self.assertTrue(any('lacks observed passage' in e for e in self.errors()))
    def test_empty_specification_is_not_specified(self):
        self.catalog['features'][0]['status']='SPECIFIED';self.assertTrue(any('incomplete specification' in e for e in self.errors()))
    def test_changed_per_app_counts_cannot_preserve_fake_baseline(self):
        self.catalog['cohort'][0]['seed_count']-=1;self.catalog['cohort'][1]['seed_count']+=1
        self.assertTrue(any('Fixed ten-app' in e for e in self.errors()))
    def test_unrelated_source_cannot_support_competitor_presence(self):
        feature=self.catalog['features'][0]
        feature['source_passages']=[{'source_id':'S07','locator':'Bill Pay','support_scope':'public claim'}]
        feature['competitor_presence']={'CA':'PRESENT'}
        self.assertTrue(any('not associated' in e for e in self.errors()))
        self.assertTrue(any('lacks observed passage' in e for e in self.errors()))

class ReadinessBoundaryChecks(unittest.TestCase):
    """Synthetic proof packets test the checker, never the finance capability."""
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.catalog=json.loads((ROOT/'docs/competition/features.json').read_text())
        # Isolate this checker test from parallel research status updates.
        self.catalog['features']=[f for f in self.catalog['features'] if f['record_type']=='seed']
        for f in self.catalog['features']:
            f['status']='DISCOVERED';f['implementation_files']=[];f['tests']={};f['screenshots']=[];f['evidence_ids']=[];f['launch_gates']=[]
        self.sources=json.loads((ROOT/'docs/competition/sources.json').read_text())
        feature=copy.deepcopy(self.catalog['features'][0]);feature.update({'id':'CA-001.local','record_type':'atomic','parent_id':'CA-001','status':'BUILT-LOCAL','delivery_mode':'NATIVE-LOCAL','risk_tier':'R2','upstream_partner':None,'source_passages':[],'competitor_presence':{'CA':'UNVERIFIED'}})
        for field in parity.CONTRACT:feature[field]='specified'
        feature.update({'risk_tier':'R2','input_schema':{'type':'object'},'output_schema':{'type':'object'},'implementation_files':['implementation.ts'],'tests':{t:[t+'.py'] for t in ('unit','contract','integration','browser')},'screenshots':['view.png'],'evidence_ids':['proof']})
        self.feature=feature;self.catalog['features'].append(feature)
        for name in ['implementation.ts','unit.py','contract.py','integration.py','browser.py','view.png','proof.log']:(self.root/name).write_text('synthetic checker fixture')
        self.proof={'id':'proof','command':['synthetic-checker-test'],'commit':'fixture-head','source_digest':'current','observed_at':'2026-10-10','environment':{'mode':'synthetic'},'result':'PASS','exit_code':0,'log':'proof.log','log_sha256':hashlib.sha256((self.root/'proof.log').read_bytes()).hexdigest(),'verification_level':'BROWSER','provider_mode':'synthetic','feature_ids':[feature['id']],'test_files':[t+'.py' for t in ('unit','contract','integration','browser')],'screenshots':['view.png']}
        self.ledger={'checks':[self.proof]}
        self.proof['screenshot_sha256']={'view.png':hashlib.sha256((self.root/'view.png').read_bytes()).hexdigest()}
    def result(self):return parity.validate(self.root,self.catalog,self.sources,self.ledger,'current')
    def test_feature_scoped_local_proof_needs_no_external_gate(self):
        errors,summary,readiness=self.result();self.assertEqual(errors,[])
        self.assertTrue(readiness[self.feature['id']]['software']);self.assertTrue(readiness[self.feature['id']]['launch'])
        self.assertFalse(readiness[self.feature['id']]['provider']);self.assertFalse(readiness[self.feature['id']]['live'])
        self.assertEqual(summary['full_seed_outcomes']['software']['verified'],0)
    def test_unrelated_browser_pass_cannot_certify_feature(self):
        self.proof['feature_ids']=['another-feature']
        errors,_,readiness=self.result();self.assertFalse(readiness[self.feature['id']]['software'])
        self.assertTrue(any('local completion not proved' in e for e in errors))
    def test_all_test_paths_and_screenshots_must_be_in_proof(self):
        self.proof['test_files'].remove('integration.py');self.assertFalse(self.result()[2][self.feature['id']]['software'])
        self.proof['test_files'].append('integration.py');self.proof['screenshots']=[]
        self.assertFalse(self.result()[2][self.feature['id']]['software'])
    def test_changed_screenshot_cannot_certify_screen_inspection(self):
        (self.root/'view.png').write_text('changed synthetic artifact')
        self.assertFalse(self.result()[2][self.feature['id']]['software'])
    def test_schema_labels_are_not_data_contracts(self):
        self.feature['input_schema']='unknown'
        self.assertFalse(self.result()[2][self.feature['id']]['software'])
    def test_stale_or_failed_or_tampered_proof_cannot_count(self):
        for field,value in [('source_digest','old'),('exit_code',1),('log_sha256','0'*64)]:
            original=self.proof[field];self.proof[field]=value
            self.assertFalse(self.result()[2][self.feature['id']]['software']);self.proof[field]=original
    def test_different_head_cannot_reuse_proof(self):
        _,_,readiness=parity.validate(self.root,self.catalog,self.sources,self.ledger,'current','another-head')
        self.assertFalse(readiness[self.feature['id']]['software'])
    def test_synthetic_provider_reference_cannot_certify_sandbox(self):
        self.feature['status']='SANDBOX-VERIFIED';provider=copy.deepcopy(self.proof)
        provider.update({'id':'provider','verification_level':'SANDBOX','provider_reference':'fake-reference'})
        self.ledger['checks'].append(provider);self.feature['evidence_ids'].append('provider')
        self.assertFalse(self.result()[2][self.feature['id']]['provider'])
    def test_parent_outcome_requires_reviewed_complete_atomic_coverage(self):
        seed=self.catalog['features'][0];seed['atomic_requirement_ids']=[self.feature['id']]
        self.assertEqual(self.result()[1]['full_seed_outcomes']['software']['verified'],0)
        coverage=copy.deepcopy(self.proof);coverage.update({'id':'coverage','feature_ids':[seed['id']],'verification_level':'SPECIFICATION-REVIEW','atomic_requirement_ids':[self.feature['id']]})
        self.ledger['checks'].append(coverage);seed['coverage_evidence_ids']=['coverage']
        self.assertEqual(self.result()[1]['full_seed_outcomes']['software']['verified'],1)
        coverage['atomic_requirement_ids']=[];self.assertEqual(self.result()[1]['full_seed_outcomes']['software']['verified'],0)
    def test_failed_stale_or_unrelated_launch_approval_blocks_live(self):
        self.feature.update({'status':'PARTIAL','risk_tier':'R4','delivery_mode':'INTEGRATED','upstream_partner':'example-partner'})
        for kind in ('SANDBOX','LIVE'):
            proof=copy.deepcopy(self.proof);proof.update({'id':kind,'verification_level':kind,'provider_mode':'provider-sandbox' if kind=='SANDBOX' else 'production','provider_reference':'fixture-only'})
            self.ledger['checks'].append(proof);self.feature['evidence_ids'].append(kind)
        approval=copy.deepcopy(self.proof);approval.update({'id':'approval','verification_level':'LAUNCH-APPROVAL'})
        self.ledger['checks'].append(approval);self.feature['launch_gates']=[{'status':'CLEARED','evidence_id':'approval'}]
        self.assertTrue(self.result()[2][self.feature['id']]['live'])
        for field,value in [('result','FAIL'),('source_digest','old'),('feature_ids',['another-feature'])]:
            original=approval[field];approval[field]=value;self.assertFalse(self.result()[2][self.feature['id']]['live']);approval[field]=original

if __name__=='__main__':unittest.main()
