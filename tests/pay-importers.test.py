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


API = load("fetch_oews_api", "fetch-oews-api.py")


class TestOewsApi(unittest.TestCase):
    """The BLS API route builds the OEWS file's rows; invented values, never BLS data."""
    NY, SWE = "35620", "15-1252"

    def pt(self, year, value, notes=()):
        return {"year": str(year), "period": "A01", "value": value, "footnotes": [{"text": t} for t in notes] or [{}]}

    def series(self, dtype, *points):
        return {"seriesID": API.series_id(self.NY, self.SWE, dtype), "data": list(points)}

    def test_series_id_is_bls_format(self):
        sid = API.series_id("35620", "15-1252", "13")
        self.assertEqual(sid, "OEUM003562000000015125213")
        self.assertEqual(len(sid), 25)
        self.assertEqual(len(API.wanted(MAPS)), len(MAPS["metros"]) * len(MAPS["occupations"]) * 4)

    def test_rows_then_importer(self):
        s = [self.series("01", self.pt(2025, "100000"), self.pt(2024, "90000")),
             self.series("12", self.pt(2025, "130000")),
             self.series("13", self.pt(2025, "-", ["Estimate not released"])),
             self.series("14", self.pt(2025, "-", ["This wage is equal to or greater than $115.00 per hour or $239,200 per year."]))]
        rows, year = API.rows_from_api(s, MAPS)
        self.assertEqual(year, 2025)
        self.assertEqual(rows, [{"AREA": "35620", "AREA_TITLE": "New York metro", "OCC_CODE": "15-1252", "OCC_TITLE": "Software Developers",
                                 "TOT_EMP": "100000", "A_PCT25": "130000", "A_MEDIAN": "*", "A_PCT75": "#"}])
        cell = OEWS.import_rows(rows, MAPS, f"May {year}")["cells"][0]
        self.assertEqual((cell["metro"], cell["employment"], cell["p25"], cell["median"], cell["p75"]), ("new-york", 100000, 130000, None, None))
        self.assertEqual(sorted(cell["flags"]), ["median_not_released", "p75_top_coded"])

    def test_never_mixes_years(self):
        s = [self.series("01", self.pt(2025, "100000"), self.pt(2024, "90000")), self.series("13", self.pt(2024, "150000"))]
        rows, year = API.rows_from_api(s, MAPS)
        self.assertEqual(year, 2024, "the newest year every answered series has")
        self.assertEqual((rows[0]["TOT_EMP"], rows[0]["A_MEDIAN"]), ("90000", "150000"))

    def test_fetch_chunks_and_refusal(self):
        import io
        calls = []
        def opener(req, timeout):
            body = json.loads(req.data)
            calls.append(len(body["seriesid"]))
            return io.BytesIO(json.dumps({"status": "REQUEST_SUCCEEDED", "Results": {"series": []}}).encode())
        API.time.sleep = lambda _s: None
        API.fetch([str(i) for i in range(60)], None, opener)
        self.assertEqual(calls, [25, 25, 10], "25 a request without a key")
        def refused(req, timeout):
            return io.BytesIO(json.dumps({"status": "REQUEST_NOT_PROCESSED", "message": ["daily threshold"]}).encode())
        with self.assertRaises(SystemExit):
            API.fetch(["x"], None, refused)


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
