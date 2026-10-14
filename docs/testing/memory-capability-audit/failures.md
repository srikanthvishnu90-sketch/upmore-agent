# Reproducible repaired failures

Baseline: `192132dfd83f6f9834a7e8c962be91f570f6bbc7`. Repair commit: `4b31e822502e9f9837cbcbfb593f8fac05dbe77a`. All conversations below are synthetic. Each failure reproduced in all three baseline trials and passed in all three repaired trials.

## M08: Bare currency correction retains payment context

Router dispatch and send correction grammar differed. Shared bounded grammar now dispatches the edit without clearing context.

```text
User: send sam 20
Upmore: Set up $20.00 to Sam Kim (@samk) in Venmo from checking, for you to send. No fee. Can't be undone once received. Reply YES or NO within 10 min, or DETAILS.
User: $12.50 instead
Upmore: (I dropped the $20.00 to Sam Kim since you moved on; nothing was sent. Say it again when you want it.)
User: yes
Upmore: [flow fell through; full model reply unrun]
```

Expected contract: [{"step": 2, "expected": {"reply": "12.50.*Sam Kim"}, "actual": {"fallthrough": true, "note": "(I dropped the $20.00 to Sam Kim since you moved on; nothing was sent. Say it again when you want it.)"}}, {"step": 2, "expected": {"outcome": "confirm"}, "actual": {"fallthrough": true, "note": "(I dropped the $20.00 to Sam Kim since you moved on; nothing was sent. Say it again when you want it.)"}}, {"step": 3, "expected": {"reply": "12.50"}, "actual": null}, {"step": 3, "expected": {"outcome": "staged"}, "actual": null}]

## M09: Split total correction recomputes every share before approval

General voice classification missed split-total corrections. Recompute shares and re-confirm through the shared edit grammar.

```text
User: split 60 with sam and maya
Upmore: Request $20.00 each from Sam Kim (@samk) and Maya Rao (@mayar) in Venmo: $60.00 split 3 ways, yours $20.00. No fee. You tap Request in the app; nothing is sent from here. Reply YES or NO within 10 min, or DETAILS.
User: make it 90
Upmore: Yes or no? Request $20.00 each from Sam Kim (@samk) and Maya Rao (@mayar) in Venmo: $60.00 split 3 ways, yours $20.00. No fee. You tap Request in the app; nothing is sent from here. Reply YES or NO within 10 min, or DETAILS.
User: yes
Upmore: Staged. Tap Request for each: Sam Kim (@samk) $20.00 in Venmo, Maya Rao (@mayar) $20.00 in Venmo. I'll mark each one paid when the money lands.
```

Expected contract: [{"step": 2, "expected": {"reply": "30.00 each.*90.00"}, "actual": {"reply": "Yes or no? Request $20.00 each from Sam Kim (@samk) and Maya Rao (@mayar) in Venmo: $60.00 split 3 ways, yours $20.00. No fee. You tap Request in the app; nothing is sent from here. Reply YES or NO within 10 min, or DETAILS.", "withhold_user_text": false, "route": {"route": "card_reply", "flow": "split", "source": "deterministic", "understood": true, "understood_first": true, "outcome": "ask", "canonical": null, "ask_reason": null, "problems": []}}}, {"step": 2, "expected": {"outcome": "confirm"}, "actual": {"reply": "Yes or no? Request $20.00 each from Sam Kim (@samk) and Maya Rao (@mayar) in Venmo: $60.00 split 3 ways, yours $20.00. No fee. You tap Request in the app; nothing is sent from here. Reply YES or NO within 10 min, or DETAILS.", "withhold_user_text": false, "route": {"route": "card_reply", "flow": "split", "source": "deterministic", "understood": true, "understood_first": true, "outcome": "ask", "canonical": null, "ask_reason": null, "problems": []}}}, {"step": 3, "expected": {"reply": "30.00"}, "actual": {"reply": "Staged. Tap Request for each: Sam Kim (@samk) $20.00 in Venmo, Maya Rao (@mayar) $20.00 in Venmo. I'll mark each one paid when the money lands.", "withhold_user_text": false, "route": {"route": "card_reply", "flow": "split", "source": "deterministic", "understood": true, "understood_first": true, "outcome": "staged", "canonical": null, "ask_reason": null, "problems": []}}}]

## M13: Cancellation that resolves the last discussed subscription

Identified merchant was remembered only after account terms were read. Keep the uniquely resolved merchant even while blocked.

```text
User: cancel netflix
Upmore: I can't read Netflix's account page from here yet, so I can't show you the cancellation terms or cancel it for you. Nothing was changed. You can cancel at https://netflix.com/YourAccount; tell me when it's done and I'll watch the 2026-11-03 charge.
User: cancel that
Upmore: Cancel which one? Nothing has been mentioned yet.
```

Expected contract: [{"step": 2, "expected": {"reply": "Netflix"}, "actual": {"reply": "Cancel which one? Nothing has been mentioned yet.", "withhold_user_text": false, "route": {"route": "cancel_subscription", "flow": "cancel", "source": "regex_net", "understood": false, "understood_first": false, "outcome": "ask", "canonical": "cancel that", "ask_reason": null, "problems": ["no model"]}}}]

## M25: Status follow-up recalls staged versus sent

Generic questions fell through before recent payment status was resolved. Read staged task and posting evidence first for bounded status questions.

```text
User: send sam 20
Upmore: Set up $20.00 to Sam Kim (@samk) in Venmo from checking, for you to send. No fee. Can't be undone once received. Reply YES or NO within 10 min, or DETAILS.
User: yes
Upmore: Staged, not sent. In Venmo: 1. Open Venmo and tap Pay/Request; 2. Search @samk; 3. Enter $20.00; 4. Keep it private, then Pay. I'll confirm when $20.00 to Sam Kim posts; if it hasn't by tonight, I'll ask.
User: did it go through
Upmore: [flow fell through; full model reply unrun]
```

Expected contract: [{"step": 3, "expected": {"reply": "(?:not (?:yet )?(?:sent|posted)|staged|have not seen|waiting for.*post)"}, "actual": null}]

## M41: Repeating a staged approval does not stage twice after restore

The second yes cleared settlement memory. Preserve the original summary and timestamp without renewing authority.

```text
User: send sam 20
Upmore: Set up $20.00 to Sam Kim (@samk) in Venmo from checking, for you to send. No fee. Can't be undone once received. Reply YES or NO within 10 min, or DETAILS.
User: yes
Upmore: Staged, not sent. In Venmo: 1. Open Venmo and tap Pay/Request; 2. Search @samk; 3. Enter $20.00; 4. Keep it private, then Pay. I'll confirm when $20.00 to Sam Kim posts; if it hasn't by tonight, I'll ask.
User: yes
Upmore: That's already staged: $20.00 to Sam Kim for you to send in Venmo. A second yes doesn't stage it again.
User: yes
Upmore: [flow fell through; full model reply unrun]
```

Expected contract: [{"step": 4, "expected": {"reply": "already staged"}, "actual": null}, {"step": 4, "expected": {"outcome": "already_done"}, "actual": null}]
