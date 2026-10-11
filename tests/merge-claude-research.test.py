import copy
import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('merger',ROOT/'scripts/merge-claude-research.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class MergeTests(unittest.TestCase):
    def setUp(self):
        self.catalog={'cohort':[{'id':a,'app':a,'seed_count':n} for a,n in m.COUNTS.items()],
                      'features':[{'id':f'{a}-{i:03}','record_type':'seed','app_ids':[a],'source_ids':['S01'],'evidence_ids':['existing-proof']} for a,n in m.COUNTS.items() for i in range(1,n+1)]}
        self.sources={'sources':[{'id':'S01','app':'CA','url':'https://example.test/help','observed_at':'2026-10-10'}]}
        self.f={'id':'CA-001-A','parent_id':'CA-001','app_ids':['CA'],'source_ids':['CR-CA-01'],
                'source_passages':[{'source_id':'CR-CA-01','locator':'public claim'}],
                'competitor_presence':{'CA':'PRESENT'},'risk_tier':'money-movement','outcome':'send money',
                'status':'LIVE-VERIFIED','implementation_files':[],'tests':{}}
        self.s={'id':'CR-CA-01','url':'https://cash.app/help','observed_at':'2026-10-10','research_confidence':'OBSERVED-PUBLIC'}
    def run_merge(self,f=None,s=None,catalog=None,sources=None):
        return m.merge(catalog or self.catalog,sources or self.sources,[('cash-app','CA',{'schema_version':1,'features':f or [self.f]},{'schema_version':1,'sources':s or [self.s]})])
    def test_preserves_seeds_and_proofs_but_never_promotes_imported_claims(self):
        c,s,r=self.run_merge();row=c['features'][-1]
        self.assertEqual(c['features'][:-1],self.catalog['features'])
        self.assertEqual(row['status'],'DISCOVERED');self.assertEqual(row['competitor_presence'],{'CA':'UNVERIFIED'})
        self.assertEqual(row['source_passages'],[]);self.assertEqual(row['claimed_source_passages'],self.f['source_passages'])
        self.assertEqual(s['sources'][-1]['observed_at'],None);self.assertEqual(s['sources'][-1]['claimed_observed_at'],'2026-10-10')
        self.assertEqual(row['evidence_ids'],[]);self.assertEqual(r['preserved_seed_count'],241)
    def test_repeat_is_idempotent(self):
        c,s,_=self.run_merge();c2,s2,r=self.run_merge(catalog=c,sources=s)
        self.assertEqual(c,c2);self.assertEqual(s,s2);self.assertEqual(r['added_features'],0);self.assertEqual(r['added_sources'],0)
    def test_collision_rejects_without_mutating_inputs(self):
        before=copy.deepcopy(self.catalog);f={**self.f,'id':'CA-001'}
        with self.assertRaisesRegex(ValueError,'collision'):self.run_merge(f=[f])
        self.assertEqual(self.catalog,before)
    def test_duplicate_ids_and_missing_source_or_passage_reject(self):
        for fs in ([self.f,self.f],[{**self.f,'source_ids':['missing']}],[{**self.f,'source_passages':[{'source_id':'missing'}]}]):
            with self.assertRaises(ValueError):self.run_merge(f=fs)
        with self.assertRaisesRegex(ValueError,'duplicate'):self.run_merge(s=[self.s,self.s])
    def test_foreign_seed_parent_and_wrong_cohort_reject(self):
        for patch in ({'parent_id':'VE-001'},{'parent_id':'CA-999'},{'app_ids':['VE']}):
            with self.assertRaises(ValueError):self.run_merge(f=[{**self.f,**patch}])
    def test_arbitrary_paths_and_unsafe_urls_reject(self):
        for patch in ({'implementation_files':['../../etc/passwd']},{'tests':{'unit':['/private/secret']}},{'evidence_ids':['forged']}):
            with self.assertRaisesRegex(ValueError,'path'):self.run_merge(f=[{**self.f,**patch}])
        for url in ('file:///etc/passwd','http://example.test','https://user:secret@example.test'):
            with self.assertRaisesRegex(ValueError,'unsafe'):self.run_merge(s=[{**self.s,'url':url}])
    def test_parentless_discovery_and_unknown_behavior_remain_visible(self):
        f={**self.f,'id':'CA-X01','parent_id':None,'source_ids':[],'source_passages':[]}
        c,_,r=self.run_merge(f=[f]);row=c['features'][-1]
        self.assertEqual(row['record_type'],'discovery');self.assertEqual(row['source_ids'],['S01'])
        self.assertEqual(r['discovery_count'],1);self.assertIn('CA-X01',r['fallback_source_lineage'])
    def test_character_array_normalized_and_claim_hash_checked(self):
        c,_,r=self.run_merge(f=[{**self.f,'variants':list('Deposit cards')}])
        self.assertEqual(c['features'][-1]['variants'],['Deposit cards'])
        with self.assertRaisesRegex(ValueError,'hash'):self.run_merge(s=[{**self.s,'local_note':'claimed text','local_note_sha256':'wrong'}])
    def test_fixed_manifest_rejects_extra_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);folder=root/'docs/competition/_claude-research';folder.mkdir(parents=True)
            (folder/'../../outside.json').write_text('{}')
            with self.assertRaisesRegex(ValueError,'handoff file'):m.load_bundles(root)

    def test_actual_handoff_has_expected_counts_and_replays_without_changed_proof(self):
        bundles=m.load_bundles(ROOT)
        self.assertEqual(sum(len(b[2]['features']) for b in bundles),720)
        self.assertEqual(sum(len(b[3]['sources']) for b in bundles),325)
        catalog=json.loads((ROOT/'docs/competition/features.json').read_text())
        sources=json.loads((ROOT/'docs/competition/sources.json').read_text())
        c,s,r=m.merge(catalog,sources,bundles)
        self.assertEqual(c,catalog);self.assertEqual(s,sources)
        self.assertEqual(r['added_features'],0);self.assertEqual(r['added_sources'],0)
        self.assertEqual(r['atomic_count'],659);self.assertEqual(r['discovery_count'],61)

if __name__=='__main__':unittest.main()
