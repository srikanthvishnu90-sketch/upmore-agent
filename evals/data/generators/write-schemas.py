#!/usr/bin/env python3
"""Regenerate evals/data/schemas/*.json (doc 12). Hand edits go here, then rerun."""
import json
from pathlib import Path

out = Path(__file__).resolve().parents[1] / "schemas"
out.mkdir(exist_ok=True)
DATE = r"^\d{4}-\d{2}-\d{2}$"
S = {}
S["injection"] = {"file": "adversarial/injection.json", "count_path": "cases", "min_count": 100, "unique_key": "id",
    "schema": {"type": "object", "required": ["schema_version", "cases"], "properties": {"cases": {"type": "array", "items": {"type": "object",
        "required": ["id", "channel", "payload", "embedded_instruction", "expected"], "properties": {
        "id": {"type": "string", "pattern": r"^INJ-\d{3}$"},
        "channel": {"type": "string", "enum": ["transaction_memo", "payee_name", "receipt_email", "merchant_descriptor", "bill_pdf_text", "news_headline", "calendar_event", "support_chat", "csv_import", "connector_error_message"]},
        "payload": {"type": "string"}, "embedded_instruction": {"type": "string"},
        "expected": {"type": "string", "enum": ["treat_as_data", "refuse_and_flag"]}, "notes": {"type": "string"}}}}}}}
S["traps"] = {"file": "adversarial/traps.json", "count_path": "cases", "min_count": 40, "unique_key": "id",
    "schema": {"type": "object", "required": ["schema_version", "cases"], "properties": {"cases": {"type": "array", "items": {"type": "object",
        "required": ["id", "kind", "prompt", "fixture", "honest_answer_contains", "must_not_contain"], "properties": {
        "id": {"type": "string", "pattern": r"^TRAP-\d{3}$"},
        "kind": {"type": "string", "enum": ["hallucination", "money_math", "timezone", "rounding", "stale_data", "gated_capability"]},
        "prompt": {"type": "string"}, "fixture": {"type": "object"},
        "honest_answer_contains": {"type": "array", "items": {"type": "string"}, "minItems": 1},
        "must_not_contain": {"type": "array", "items": {"type": "string"}}}}}}}}
S["merchants"] = {"file": "labeled/merchants.json", "count_path": "rows", "min_count": 2000, "unique_key": "raw",
    "schema": {"type": "object", "required": ["schema_version", "categories", "rows"], "properties": {
        "categories": {"type": "array", "items": {"type": "string"}, "minItems": 10},
        "rows": {"type": "array", "items": {"type": "object", "required": ["raw", "merchant", "category", "kind"], "properties": {
            "raw": {"type": "string"}, "merchant": {"type": "string"}, "category": {"type": "string"},
            "kind": {"type": "string", "enum": ["purchase", "subscription", "transfer", "fee", "income", "refund", "bill", "atm", "unknown"]}}}}}}}
S["savings-lives"] = {"file": "labeled/savings-lives.json", "count_path": "lives", "min_count": 40, "unique_key": "id",
    "schema": {"type": "object", "required": ["schema_version", "lives"], "properties": {"lives": {"type": "array", "items": {"type": "object",
        "required": ["id", "archetype", "today", "accounts", "transactions", "bills", "debts", "opportunities"], "properties": {
        "id": {"type": "string", "pattern": r"^LIFE-\d{3}$"}, "archetype": {"type": "string"}, "today": {"type": "string", "pattern": DATE},
        "accounts": {"type": "array", "minItems": 1, "items": {"type": "object", "required": ["id", "kind", "balance_cents", "apy_bps"], "properties": {
            "id": {"type": "string"}, "kind": {"type": "string", "enum": ["checking", "savings", "hysa", "credit_card", "loan", "brokerage"]},
            "balance_cents": {"type": "integer"}, "apy_bps": {"type": "integer", "minimum": 0}, "apr_bps": {"type": "integer", "minimum": 0}}}},
        "transactions": {"type": "array", "minItems": 20, "items": {"type": "object", "required": ["id", "account_id", "posted_at", "amount", "merchant_raw"], "properties": {
            "id": {"type": "string"}, "account_id": {"type": "string"}, "posted_at": {"type": "string", "pattern": DATE}, "amount": {"type": "number"},
            "merchant_raw": {"type": "string"}, "is_pending": {"type": "boolean"}, "is_transfer": {"type": "boolean"}}}},
        "bills": {"type": "array", "items": {"type": "object", "required": ["name", "amount_cents", "market_cents"], "properties": {
            "name": {"type": "string"}, "amount_cents": {"type": "integer"}, "market_cents": {"type": "integer"}}}},
        "debts": {"type": "array", "items": {"type": "object", "required": ["id", "balance_cents", "apr_bps", "min_payment_cents"]}},
        "opportunities": {"type": "array", "minItems": 1, "items": {"type": "object", "required": ["play", "key", "expected_monthly_cents", "confidence"], "properties": {
            "play": {"type": "string", "enum": ["P1_subscription", "P2_negotiation", "P3_fee", "P4_rate", "P5_purchase", "P6_insurance", "P7_debt", "P8_structural", "control"]},
            "key": {"type": "string"}, "expected_monthly_cents": {"type": "integer", "minimum": 0},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]}}}}}}}}}}
S["advice-boundary"] = {"file": "labeled/advice-boundary.json", "count_path": "prompts", "min_count": 100, "unique_key": "id",
    "schema": {"type": "object", "required": ["schema_version", "prompts"], "properties": {"prompts": {"type": "array", "items": {"type": "object",
        "required": ["id", "set", "prompt", "expected"], "properties": {
        "id": {"type": "string", "pattern": r"^ADV-\d{3}$"}, "set": {"type": "string", "enum": ["adversarial", "held_out", "legitimate"]},
        "prompt": {"type": "string"}, "expected": {"type": "string", "enum": ["block", "allow"]},
        "technique": {"type": "string"}, "candidate_response": {"type": "string"}}}}}}}
S["traces"] = {"file": "traces/traces.json", "count_path": "traces", "min_count": 5, "unique_key": "capability_id",
    "schema": {"type": "object", "required": ["schema_version", "traces"], "properties": {"traces": {"type": "array", "items": {"type": "object",
        "required": ["capability_id", "request", "calls", "verification_step"], "properties": {
        "capability_id": {"type": "string", "pattern": r"^[A-Z]{3,4}-\d{3}$"}, "request": {"type": "string"},
        "calls": {"type": "array", "minItems": 2, "items": {"type": "object", "required": ["step", "call", "input", "output"], "properties": {
            "step": {"type": "integer", "minimum": 1}, "call": {"type": "string"}, "input": {"type": "object"}, "output": {"type": "object"}}}},
        "verification_step": {"type": "integer", "minimum": 1}}}}}}}
S["gold"] = {"file": "gold/drafts.json", "count_path": "conversations", "min_count": 1500, "unique_key": "id",
    "schema": {"type": "object", "required": ["schema_version", "generated_by", "review_policy", "conversations"], "properties": {
        "conversations": {"type": "array", "items": {"type": "object",
            "required": ["id", "capability_id", "persona", "scenario", "assumes_status", "review", "principles", "turns"], "properties": {
            "id": {"type": "string"}, "capability_id": {"type": "string", "pattern": r"^[A-Z]{3,4}-\d{3}$"},
            "persona": {"type": "string", "enum": ["terse low-effort texter", "anxious first-timer", "detail-checker", "angry user mid-problem", "power user"]},
            "scenario": {"type": "string", "enum": ["happy path", "missing data", "ambiguous input", "stale connector", "declined confirmation", "correction mid-flow", "gated capability", "not yet built", "watch fired", "outside envelope"]},
            "assumes_status": {"type": "string", "enum": ["CLAIMED", "BUILT", "TESTED", "VERIFIED", "GATED", "NOT_WIRED"]},
            "review": {"type": "string", "enum": ["reviewed", "unreviewed"]},
            "principles": {"type": "array", "items": {"type": "string"}, "minItems": 1},
            "turns": {"type": "array", "minItems": 1, "items": {"type": "object"}}}}}}}}
S["news-relevance"] = {"file": "labeled/news-relevance.json", "count_path": "stories", "min_count": 500, "unique_key": "id",
    "schema": {"type": "object", "required": ["schema_version", "generated_by", "week_end", "days", "labeling", "rules", "personas", "events", "stories", "labels"], "properties": {
        "days": {"type": "integer", "minimum": 7}, "rules": {"type": "array", "items": {"type": "string"}, "minItems": 6},
        "personas": {"type": "array", "minItems": 5, "items": {"type": "object", "required": ["id", "title", "user"], "properties": {
            "id": {"type": "string", "pattern": r"^P\d$"}, "user": {"type": "object", "required": ["holdings", "watchlist", "muted"], "properties": {
                "holdings": {"type": "array", "minItems": 3, "items": {"type": "object", "required": ["symbol", "name", "sector"]}}}}}}},
        "events": {"type": "array", "items": {"type": "object", "required": ["id", "kind", "event", "entities", "stories", "material"], "properties": {
            "kind": {"type": "string", "enum": ["material", "mention", "private", "employer", "macro", "sector_deal", "sector_color", "topic", "noise", "filler"]},
            "stories": {"type": "integer", "minimum": 1}, "material": {"type": "boolean"}}}},
        "stories": {"type": "array", "items": {"type": "object", "required": ["id", "event_id", "title", "summary", "source", "link", "published_at", "entities", "kind"], "properties": {
            "id": {"type": "string", "pattern": r"^NR-\d{3}$"}, "published_at": {"type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$"},
            "entities": {"type": "array", "items": {"type": "string"}}}}},
        "labels": {"type": "object"}}}}
S["savings-lives"]["schema"]["properties"]["lives"]["items"]["properties"]["debts"]["items"]["properties"] = {
    "id": {"type": "string"}, "balance_cents": {"type": "integer", "minimum": 0}, "apr_bps": {"type": "integer", "minimum": 0}, "min_payment_cents": {"type": "integer", "minimum": 0}}
for name, schema in S.items():
    (out / f"{name}.json").write_text(json.dumps(schema, indent=1) + "\n")
print("schemas written:", ", ".join(sorted(S)))
