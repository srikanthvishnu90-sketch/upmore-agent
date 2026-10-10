import runpy
from pathlib import Path
import unittest
classify=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/capture-checks.py'))['classify']
extract=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/capture-checks.py'))['extract_test_ids']
class OutcomeChecks(unittest.TestCase):
    def test_exit_zero_does_not_hide_failed_agent_outcomes(self):
        status,counts=classify('agent100-dry',0,'4/103 agents pass (3.9%)')
        self.assertEqual(status,'FAIL');self.assertEqual(counts['failed'],99)
    def test_no_selected_agents_cannot_pass(self):self.assertEqual(classify('agent100-dry',0,'0/0 agents pass')[0],'FAIL')
    def test_missing_summary_cannot_pass(self):self.assertEqual(classify('agent100-dry',0,'runner exited')[0],'FAIL')
    def test_complete_report_and_successful_process_are_both_required(self):
        self.assertEqual(classify('agent100-dry',0,'103/103 agents pass')[0],'PASS')
        self.assertEqual(classify('agent100-dry',1,'103/103 agents pass')[0],'FAIL')
    def test_current_node_reporter_does_not_drop_test_ids(self):
        root=Path(__file__).resolve().parents[1]
        names=extract((root/'docs/testing/runs/parity-owner-bills-20261010/chat-controller.log').read_text())
        self.assertEqual(len(names),12);self.assertIn('sign-out and same-owner sign-in still invalidate old conversation tickets',names)
    def test_mixed_formats_preserve_names_without_counting_summaries_or_duplicates(self):
        self.assertEqual(extract('✔ owner is bound (1.25ms)\nℹ tests 1\n# Subtest: owner is bound\nRPC rejects replay ... ok (5ms)\n'),['owner is bound','RPC rejects replay'])
if __name__=='__main__':unittest.main()
