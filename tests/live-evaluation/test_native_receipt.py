import copy
import json
from pathlib import Path
import tempfile
import unittest

from test_admission import binding, Gate
from admission import Denied, digest
from native_receipt import WHOLE_BOUND, from_native_metadata


class NativeReceiptTests(unittest.TestCase):
    def setUp(self):
        self.fixture = json.loads((Path(__file__).resolve().parents[2] /
            'docs/career/live-evaluation/evidence/native-200a/published-controlled-metadata.json').read_text())
        self.meta = self.fixture['career_model']
        self.body = self.fixture['request']
        self.b = binding(); self.b['bounds_micros'] = WHOLE_BOUND.copy()
        self.b['price_nanos'] = {'input':50, 'cached':5, 'output':400}
        self.b['response_models'] = ['gpt-5-nano','gpt-5-nano-2025-08-07']
        for leg, purpose, prompt in [('generation','generation','career_native_generation/v1'),
                                     ('checker','verification','career_native_checker/v1')]:
            self.b[leg+'_config_digest'] = digest({'version':'career_native_pair_config/v1', 'purpose':purpose,
                'provider':'openai', 'model':'gpt-5-nano', 'reasoning_effort':'minimal', 'prompt_version':prompt})
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.gate = Gate(self.tmp.name); self.gate.install_once(self.b)
        self.ticket = self.gate.reserve('controlled-public-metadata', self.body, digest(self.b))

    def map(self):
        return from_native_metadata(self.b, self.body, self.ticket, self.meta)

    def test_actual_published_controlled_metadata_maps_without_typed_rewrite(self):
        receipt = self.map()
        self.gate.record_verified_receipt(self.ticket['id'],receipt)
        state = self.gate.status()
        self.assertEqual(state['receipt_verified_micros'],22)  # synthetic only
        self.assertEqual(state['admitted_full_bounds_micros'],50_000)
        self.assertEqual(state['unresolved_full_bound_micros'],0)

    def test_unknown_zero_known_cost_is_not_final_zero_receipt(self):
        self.meta['accounting_state']='uncertain'; self.meta['uncertain_micros']=1488
        self.meta['legs']['generation'].update(final=False,cost_micros=0,state='started')
        with self.assertRaises(Denied): self.map()
        self.assertEqual(self.gate.status()['unresolved_full_bound_micros'],50_000)

    def test_wrong_original_native_request_hash_retains_full_bound(self):
        self.meta['native_request_sha256']='0'*64
        with self.assertRaises(Denied): self.map()

    def test_paid_checker_cannot_be_relabelled_local(self):
        self.meta['verification']['cost_policy']='local_no_external_calls'
        with self.assertRaises(Denied): self.map()

    def test_tampered_raw_usage_or_configuration_refused(self):
        for mutate in ('usage','configuration','provider_id','missing_raw'):
            with self.subTest(mutate=mutate):
                self.meta = copy.deepcopy(self.fixture['career_model'])
                leg = self.meta['legs']['checker']
                if mutate=='usage': leg['raw_usage_receipt']['usage']['completion_tokens']+=1
                if mutate=='configuration': leg['raw_usage_receipt']['config_digest']='0'*64
                if mutate=='provider_id': leg['provider_request_ids']=['different']
                if mutate=='missing_raw': del leg['raw_usage_receipt']
                with self.assertRaises(Denied): self.map()

    def test_hidden_other_liability_or_excessive_bound_refused(self):
        for kind in ('other','checker'):
            self.meta = copy.deepcopy(self.fixture['career_model'])
            self.meta['bounds_micros'][kind]=WHOLE_BOUND[kind]+1
            with self.assertRaises(Denied): self.map()

    def test_fifty_thousand_bound_admits_at_most_twenty_turns(self):
        self.gate.record_verified_receipt(self.ticket['id'],self.map())
        for i in range(1,20):
            ticket=self.gate.reserve('controlled-'+str(i),self.body,digest(self.b))
            metadata=copy.deepcopy(self.meta)
            for kind in ('generation','checker'):
                value='CONTROLLED-'+kind+'-'+str(i)
                metadata['legs'][kind]['provider_request_ids']=[value]
                metadata['legs'][kind]['raw_usage_receipt']['response_id']=value
            self.gate.record_verified_receipt(ticket['id'],from_native_metadata(self.b,self.body,ticket,metadata))
        self.assertEqual(self.gate.status()['admitted_full_bounds_micros'],1_000_000)
        with self.assertRaises(Denied): self.gate.reserve('twenty-one',self.body,digest(self.b))


if __name__ == '__main__':
    unittest.main(verbosity=2)
