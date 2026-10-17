"""Pure mapping of A's published native metadata to evaluator admission receipts.

No provider call, metadata fabrication, funding operation or implicit release.
The trusted existing invocation must authenticate the source of the metadata.
"""
import re
from admission import Denied, LEGS, digest

WHOLE_BOUND = {"generation": 25_000, "checker": 25_000, "other": 0}


def integer(value):
    if type(value) is not int or not 0 <= value <= 10_000_000:
        raise Denied("native_usage_not_nonnegative_integer")
    return value


def sha256(value):
    return isinstance(value, str) and re.fullmatch(r"[a-f0-9]{64}", value) is not None


def from_native_metadata(binding, body, ticket, metadata):
    if set(body) != {"thread_id", "turn_key", "message"} or ticket["request_sha256"] != digest(body):
        raise Denied("native_body_admission_mismatch")
    if ticket["binding_sha256"] != digest(binding) or binding["bounds_micros"] != WHOLE_BOUND:
        raise Denied("native_fixed_whole_bound_binding_mismatch")
    if metadata.get("contract") != "native_pair_v1" or metadata.get("native_request_sha256") != digest(body):
        raise Denied("native_contract_or_original_request_mismatch")
    if metadata.get("accounting_state") != "settled" or metadata.get("uncertain_micros") != 0:
        raise Denied("native_accounting_unknown_full_bound_retained")
    if metadata.get("accounting_source") != "career_model_pair_read_v2" or not metadata.get("accounting_as_of"):
        raise Denied("native_accounting_provenance_missing")
    if metadata.get("verification", {}).get("cost_policy") != "paired_gateway_budgeted/v1":
        raise Denied("paid_checker_provenance_missing")
    exact = metadata.get("bounds_micros", {})
    legs = metadata.get("legs", {})
    if set(exact) != set(LEGS) or set(legs) != set(LEGS):
        raise Denied("native_leg_accounting_incomplete")
    if any(integer(exact[k]) > WHOLE_BOUND[k] for k in LEGS) or sum(exact.values()) != metadata.get("parent_bound_micros"):
        raise Denied("native_whole_or_per_leg_bound_mismatch")
    prices = binding.get("price_nanos")
    if prices != {"input": 50, "cached": 5, "output": 400}:
        raise Denied("native_reviewed_nano_price_pin_missing")
    mapped = {}; costs = 0; recorded = 0; seen = set()
    for name in LEGS:
        leg = legs[name]
        cost = integer(leg.get("cost_micros"))
        ids = leg.get("provider_request_ids")
        if leg.get("final") is not True or cost > exact[name] or not isinstance(ids, list):
            raise Denied("native_unknown_or_excessive_leg")
        if leg.get("state") == "not_sent":
            if cost != 0 or ids:
                raise Denied("native_not_sent_has_liability")
        elif leg.get("state") == "recorded" and name != "other":
            raw = leg.get("raw_usage_receipt", {})
            if (raw.get("version") != "gateway_usage_receipt/v1" or raw.get("provider") != "openai"
                    or raw.get("configured_model") != "gpt-5-nano"
                    or raw.get("response_model") not in binding.get("response_models", [])
                    or not sha256(raw.get("config_digest"))
                    or raw["config_digest"] != binding.get(name + "_config_digest")
                    or not sha256(raw.get("request_body_sha256")) or not sha256(raw.get("response_body_sha256"))
                    or not isinstance(raw.get("response_id"), str) or not raw["response_id"]
                    or ids != [raw["response_id"]] or raw["response_id"] in seen):
                raise Denied("native_raw_receipt_identity_mismatch")
            usage = raw.get("usage", {})
            prompt = integer(usage.get("prompt_tokens")); output = integer(usage.get("completion_tokens"))
            cached = integer(usage.get("prompt_tokens_details", {}).get("cached_tokens", 0))
            if cached > prompt or ("total_tokens" in usage and integer(usage["total_tokens"]) != prompt + output):
                raise Denied("native_raw_usage_invalid")
            computed = ((prompt-cached)*prices["input"] + cached*prices["cached"] + output*prices["output"] + 999)//1000
            if computed != cost:
                raise Denied("native_raw_usage_cost_mismatch")
            seen.add(raw["response_id"]); recorded += 1
        else:
            raise Denied("native_unbounded_or_unknown_leg")
        mapped[name] = {"cost_micros": cost, "final": True, "provider_request_ids": ids}
        costs += cost
    if (integer(metadata.get("known_cost_micros")) != costs
            or metadata.get("provider_calls_confirmed") != recorded
            or metadata.get("provider_calls_possible") != recorded):
        raise Denied("native_aggregate_accounting_mismatch")
    return {"admission_id": ticket["id"], "request_sha256": digest(body),
            "binding_sha256": digest(binding), "legs": mapped}
