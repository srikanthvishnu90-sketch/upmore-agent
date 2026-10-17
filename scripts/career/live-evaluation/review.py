"""Human-coded conversation burden metrics; no paid judge or keyword scoring."""
from admission import Denied


def summarize(events, questions, outcome):
    """Events are actual ordered user/assistant/tool observations, numbered from 1.

    Questions require a human classification plus an exact assistant-event quote.
    Redundant questions additionally cite an earlier user fact. Outcome is an
    explicit human assessment supported by owned artifact/readback evidence.
    """
    if not events:
        return {"status": "NOT_RUN", "turns_consumed": None, "turns_to_actual_outcome": None,
                "necessary_questions": None, "unnecessary_questions": None}
    for i, event in enumerate(events, 1):
        if event.get("event_id") != i or event.get("role") not in ("user", "assistant", "tool"):
            raise Denied("incomplete_actual_transcript")
    by_id = {e["event_id"]: e for e in events}
    counts = {"necessary": 0, "unnecessary": 0}
    for q in questions:
        event = by_id.get(q.get("event_id"), {})
        kind = q.get("classification")
        if event.get("role") != "assistant" or kind not in counts or not q.get("reason"):
            raise Denied("unsubstantiated_question_coding")
        if not q.get("quote") or q["quote"] not in event.get("text", ""):
            raise Denied("question_quote_missing")
        if kind == "unnecessary" and q.get("reason_kind") == "already_known":
            source = by_id.get(q.get("fact_event_id"), {})
            if source.get("role") != "user" or source["event_id"] >= event["event_id"]:
                raise Denied("missing_prior_fact_evidence")
        counts[kind] += 1
    completed = outcome.get("status") == "completed"
    last = outcome.get("event_id")
    if completed:
        if last not in by_id or not outcome.get("artifact_proof_ref") or not outcome.get("mandatory_perturbations_complete"):
            raise Denied("completion_without_artifact_and_stressor_evidence")
    users = [e for e in events if e["role"] == "user"]
    return {"status": outcome.get("status", "blocked"), "turns_consumed": len(users),
            "turns_to_actual_outcome": sum(e["event_id"] <= last for e in users) if completed else None,
            "necessary_questions": counts["necessary"], "unnecessary_questions": counts["unnecessary"],
            "extra_detail_user_turns": sum(e.get("purpose") == "extra_prerequisite_detail" for e in users),
            "measurement": "human-coded actual transcript; task evidence requires independent inspection"}
