#!/usr/bin/env python3
"""Depth benchmark: ~1000 genuinely DISTINCT scenarios.
Each scenario tests a different capability — not rewordings of the same task.
Organized by capability area. Built from batch files."""

import json
from pathlib import Path

DEPTH_RUBRIC = {
    "autonomy": "Acts with available tools vs asks unnecessary questions (0-3)",
    "data_specificity": "Real itemized data vs generic advice (0-3)",
    "proactive_flagging": "Catches problems user didn't ask about (0-3)",
    "coverage_honesty": "Clear about limitations and blind spots (0-3)",
    "reasoning_transparency": "Explains how/why it did what it did (0-3)",
    "actionability": "Concrete next steps vs vague suggestions (0-3)",
}

def load_batches():
    base = Path(__file__).parent / "batches"
    scenarios = []
    for f in sorted(base.glob("batch_*.json")):
        data = json.loads(f.read_text())
        # Handle both bare lists and {"scenarios": [...]} wrappers
        if isinstance(data, dict):
            data = data.get("scenarios", [])
        scenarios.extend(data)
    return scenarios

def main():
    scenarios = load_batches()
    # Assign sequential IDs
    for i, s in enumerate(scenarios, 1):
        s["scenario_id"] = f"S{i:04d}"
    out = Path(__file__).parent / "scenarios.json"
    out.write_text(json.dumps({
        "meta": {
            "count": len(scenarios),
            "depth_rubric": DEPTH_RUBRIC,
            "generated": "2026-10-04",
            "note": "Each scenario is a distinct capability test, not a rewording.",
        },
        "scenarios": scenarios,
    }, indent=2))
    print(f"Built {len(scenarios)} distinct scenarios -> {out}")

if __name__ == "__main__":
    main()
