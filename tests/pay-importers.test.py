#!/usr/bin/env python3
"""WO-036: the pay-data importers on test fixtures (invented rows, never DOL or BLS data).
Run: python3 tests/pay-importers.test.py"""
import importlib.util, json, pathlib, unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIX = ROOT / "tests/fixtures/career-pay"


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts/career/datasets" / file)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


LCA = load("aggregate_lca", "aggregate-lca.py")
OEWS = load("import_oews", "import-oews.py")
MAPS = json.loads((ROOT / "packages/career-data/datasets/pay-maps.json").read_text())


class TestLcaWageCells(unittest.TestCase):
    def setUp(self):
        self.out = LCA.wage_cells(LCA.rows_from_csv(str(FIX / "lca-fixture.csv")), MAPS, "FIXTURE Q0")
        self.cell = {(c["company_id"], c["soc"], c["metro"]): c for c in self.out["cells"]}

    def test_certified_only_and_metro_join(self):
        jpm = self.cell[("jpmorgan-ibd", "13-2051", "new-york")]
        # FIX-001..005 (Certified and Certified - Withdrawn, Jersey City is the New York metro); FIX-006 Denied is out.
        self.assertEqual(jpm["n"], 5)
        self.assertEqual(jpm["median"], 120000)
        self.assertEqual((jpm["p25"], jpm["p75"]), (110000, 125000))

    def test_small_cells_keep_their_n(self):
        gs = self.cell[("goldman-sachs-ibd", "13-2051", "new-york")]
        self.assertEqual(gs["n"], 4)  # kept with its n; the reader refuses to show it as a benchmark
        self.assertEqual(gs["median"], 117820)  # 110000, 115000, 58/hour x 2080 = 120640, 125000

    def test_unmatched_employer_and_unknown_city_dropped(self):
        self.assertFalse(any(c[0] == "acme" for c in self.cell))
        self.assertEqual(self.out["rows_scanned"], 13)

    def test_committed_fixture_is_the_importer_output(self):
        doc = json.loads((FIX / "lca-wages.fixture.json").read_text())
        self.assertTrue(doc["fixture"])
        self.assertEqual(doc["cells"], self.out["cells"])


class TestOews(unittest.TestCase):
    def setUp(self):
        self.out = OEWS.import_rows(OEWS.rows_from_csv(str(FIX / "oews-fixture.csv")), MAPS, "FIXTURE May 0000")
        self.cell = {(c["soc"], c["metro"]): c for c in self.out["cells"]}

    def test_percentiles_and_employment(self):
        c = self.cell[("13-2051", "new-york")]
        self.assertEqual((c["p25"], c["median"], c["p75"], c["employment"]), (90000, 120000, 160000, 60000))

    def test_top_coded_is_not_a_number(self):
        self.assertIsNone(self.cell[("15-1252", "new-york")]["p75"])
        self.assertIn("p75_top_coded", self.cell[("15-1252", "new-york")]["flags"])
        self.assertIsNone(self.cell[("15-1252", "seattle")]["median"])  # joined by its first city when the code differs

    def test_unmapped_occupation_and_area_dropped(self):
        self.assertNotIn(("29-1141", "new-york"), self.cell)
        self.assertEqual(len(self.out["cells"]), 3)

    def test_committed_fixture_is_the_importer_output(self):
        doc = json.loads((FIX / "oews-metro.fixture.json").read_text())
        self.assertTrue(doc["fixture"])
        self.assertEqual(doc["cells"], self.out["cells"])


class TestShippedFilesAreHonest(unittest.TestCase):
    def test_not_yet_imported_files_carry_no_numbers(self):
        for f in ("dol-lca-wages.json", "bls-oews-metro.json"):
            doc = json.loads((ROOT / "packages/career-data/datasets" / f).read_text())
            self.assertFalse(doc.get("fixture", False), f)
            if doc["status"] == "awaiting_import":
                self.assertEqual(doc["cells"], [], f)
            else:
                self.assertEqual(doc["status"], "imported", f)
                self.assertTrue(doc.get("period") or doc.get("reference_period"), f)


if __name__ == "__main__":
    unittest.main()
