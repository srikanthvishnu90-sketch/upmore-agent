from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/career/live-evaluation"))
from admission import Denied
from review import summarize


class ReviewTests(unittest.TestCase):
    def test_unrun_is_null_not_zero(self):
        result = summarize([], [], {})
        self.assertIsNone(result["unnecessary_questions"])
        self.assertIsNone(result["turns_to_actual_outcome"])

    def events(self):
        return [{"event_id": 1, "role": "user", "text": "I have 15 minutes."},
                {"event_id": 2, "role": "assistant", "text": "How long do you have? Which role?"},
                {"event_id": 3, "role": "user", "text": "15 minutes. Backend role.",
                 "purpose": "extra_prerequisite_detail"},
                {"event_id": 4, "role": "assistant", "text": "Saved."},
                {"event_id": 5, "role": "user", "text": "Open the note."},
                {"event_id": 6, "role": "tool", "text": "Actual saved bytes and owner receipt."}]

    def questions(self):
        return [{"event_id": 2, "quote": "How long do you have?", "classification": "unnecessary",
                 "reason_kind": "already_known", "fact_event_id": 1, "reason": "Current supplied fact"},
                {"event_id": 2, "quote": "Which role?", "classification": "necessary", "reason": "Role not supplied"}]

    def test_counts_real_burden_with_artifact_readback_event(self):
        outcome = {"status": "completed", "event_id": 6,
                   "artifact_proof_ref": "CONTROLLED bytes+owned receipt", "mandatory_perturbations_complete": True}
        r = summarize(self.events(), self.questions(), outcome)
        self.assertEqual((r["necessary_questions"], r["unnecessary_questions"], r["turns_to_actual_outcome"]), (1, 1, 3))
        self.assertEqual(r["extra_detail_user_turns"], 1)

    def test_failed_keeps_consumed_turns_and_no_completion_score(self):
        r = summarize(self.events(), self.questions(), {"status": "failed"})
        self.assertEqual(r["turns_consumed"], 3)
        self.assertIsNone(r["turns_to_actual_outcome"])

    def test_promised_file_cannot_count_as_complete(self):
        with self.assertRaises(Denied):
            summarize(self.events(), self.questions(), {"status": "completed", "event_id": 4})

    def test_question_coding_requires_quote_and_prior_fact(self):
        for field, value in (("quote", "invented"), ("fact_event_id", 3)):
            q = self.questions(); q[0][field] = value
            with self.assertRaises(Denied): summarize(self.events(), q, {"status": "blocked"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
