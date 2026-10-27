# Owner directive (2026-10-26 16:12 CDT, in writing): product first

"Focus primarily on the product and its essential capabilities; things exterior of the product aren't relevant right now. Focus only on what the product can do and what it can't, and fix it — get every rating to 5/5."

Next milestone: large-scale beta testing by Instinct acting as ~1,000 brand-new users, each trying to accomplish a real, large task end to end. Instinct will judge:
- Does Trainee operate perfectly for someone who knows nothing about it?
- Does it ask for everything a real product would ask for, exactly when it's needed, once?
- Connectors and secret keys: is there a real design (connect, store, revoke, fallback when absent)?
- Are tasks ACTUALLY completed (real state), not just answered?
- For each feature and each spec within it: is the full product derived end to end?

What this means for your work, now:
1. For everything you touch, trace the full chain for a new user on Telegram, web and SMS:
   trigger → what it asks → connectors/keys → execution → recorded outcome → truthful reply → failure paths → follow-through (status, edit, undo, erase).
   Close every missing link in your area, not just the one you were asked for.
2. Tests: write them as a new user would behave (messy phrasings, partial info, changing their mind). Assert state outcomes.
3. Don't build anything outside the product (business, growth, marketing, ops polish) unless it is already in flight and nearly done; finish it, don't expand it.
4. In your report, add a line per capability you touched: score 0–5 before and after, using the rule "5 = every link present and outcome-tested on every channel".
5. The strict standard (strict-standard.md) still applies. So do the holds: no deploys, no Vercel sandboxes, nothing live, nothing sent.
