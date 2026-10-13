#!/usr/bin/env python3
"""Unit tests for scripts/career/datasets/aggregate-lca.py (finisher lane C).
Run: python3 tests/aggregate-lca.test.py"""
import importlib.util, pathlib, unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("aggregate_lca", ROOT / "scripts/career/datasets/aggregate-lca.py")
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)

class TestAnnualize(unittest.TestCase):
    def test_year_passthrough(self): self.assertEqual(M.annualize(150000, "Year"), 150000.0)
    def test_hour_to_year(self): self.assertEqual(M.annualize(50, "Hour"), 104000.0)
    def test_month_and_biweekly(self):
        self.assertEqual(M.annualize(10000, "Month"), 120000.0)
        self.assertEqual(M.annualize(4000, "Bi-Weekly"), 104000.0)
    def test_bad_values_rejected(self):
        self.assertIsNone(M.annualize(None, "Year")); self.assertIsNone(M.annualize(0, "Year"))
        self.assertIsNone(M.annualize("x", "Year")); self.assertIsNone(M.annualize(10, "Furlong"))

class TestMatch(unittest.TestCase):
    def test_known_employers(self):
        self.assertEqual(M.match_company("STRIPE, INC."), "stripe")
        self.assertEqual(M.match_company("Goldman Sachs & Co. LLC"), "goldman-sachs-ibd")
        self.assertEqual(M.match_company("AMAZON WEB SERVICES, INC."), "amazon")
        self.assertEqual(M.match_company("JPMorgan Chase & Co."), "jpmorgan-ibd")
        self.assertEqual(M.match_company("D. E. Shaw & Co., L.P."), "de-shaw")
    def test_unmatched_and_ambiguous(self):
        self.assertIsNone(M.match_company("ACME WIDGETS LLC"))
        self.assertIsNone(M.match_company("RAMP UP CONSULTING LLC"))  # generic 'ramp' never matches

class TestAggregate(unittest.TestCase):
    def test_aggregate_counts_and_wages(self):
        rows = [
            {"EMPLOYER_NAME": "STRIPE, INC.", "SOC_TITLE": "Software Developers", "JOB_TITLE": "Software Engineer", "WAGE_RATE_OF_PAY_FROM": 100000, "WAGE_UNIT_OF_PAY": "Year", "CASE_STATUS": "Certified"},
            {"EMPLOYER_NAME": "STRIPE, INC.", "SOC_TITLE": "Software Developers", "JOB_TITLE": "Software Engineer", "WAGE_RATE_OF_PAY_FROM": 60, "WAGE_UNIT_OF_PAY": "Hour", "CASE_STATUS": "Certified"},
            {"EMPLOYER_NAME": "UNRELATED LLC", "SOC_TITLE": "Cooks", "JOB_TITLE": "Cook", "WAGE_RATE_OF_PAY_FROM": 30000, "WAGE_UNIT_OF_PAY": "Year", "CASE_STATUS": "Certified"},
        ]
        agg = M.aggregate(rows)
        self.assertEqual(agg["rows_scanned"], 3); self.assertEqual(agg["rows_matched_to_cir_companies"], 2)
        stripe = agg["companies"][0]
        self.assertEqual(stripe["lca_cases"], 2)
        self.assertEqual(stripe["wage_annualized_usd"]["median"], 112400)  # median(100000, 124800)
        self.assertEqual(stripe["top_soc_titles"][0]["cases"], 2)

class TestXlsxReader(unittest.TestCase):
    def test_rows_from_xlsx_roundtrip(self):
        import openpyxl, tempfile, os
        wb = openpyxl.Workbook(); ws = wb.active
        ws.append(["CASE_NUMBER", "EMPLOYER_NAME", "SOC_TITLE", "JOB_TITLE", "WAGE_RATE_OF_PAY_FROM", "WAGE_UNIT_OF_PAY", "CASE_STATUS"])
        ws.append(["X1", "STRIPE, INC.", "Software Developers", "Software Engineer", 120000, "Year", "Certified"])
        ws.append(["X2", "ACME LLC", "Cooks", "Cook", 25, "Hour", "Denied"])
        fd, path = tempfile.mkstemp(suffix=".xlsx"); os.close(fd)
        try:
            wb.save(path)
            rows = list(M.rows_from_xlsx(path))
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]["EMPLOYER_NAME"], "STRIPE, INC.")
            self.assertEqual(float(rows[0]["WAGE_RATE_OF_PAY_FROM"]), 120000)
            agg = M.aggregate(rows)
            self.assertEqual(agg["rows_matched_to_cir_companies"], 1)
        finally:
            os.unlink(path)

if __name__ == "__main__":
    unittest.main()
