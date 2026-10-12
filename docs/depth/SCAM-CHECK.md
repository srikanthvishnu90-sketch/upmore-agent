# SCAM-CHECK: everyday scams, said plainly (megadoc N02, N04, N06, N08, N09, N11, N15)

`packages/domain/109-scam-check.js` (`ScamCheck`) answers the everyday scams from code, the same words every time,
ahead of every other answer: someone asking for gift cards, a "your account is locked" message with a link, a pasted
document that says to move money "to verify", "what's my password", a person asking for a sign-in code, a payment
request from a stranger, and a "safe account". Each reply says it is a scam or the warning sign, what not to do, and the
one safe next step through the company's own app or number. Nothing from the message (a link, a number, an amount) is
repeated, and the reply never asks for anything back. Nothing is moved, paid or stored. Before this, each went to the
chat model; the older earning-route scam guard (`tryScamGuard` in `agent-chat/_shared/capabilities.ts`) covers fees,
fake checks, crypto doubling and login sharing.

Where it runs: the early guards in `supabase/functions/agent-chat/handler.ts`, right after `tryScamGuard`, before the
direct answers, the flows and the model; `tests/edge/direct-answers.test.ts` checks the wiring.
Check: `node --test tests/depth-SCAM-CHECK.test.cjs && node evals/depth/run.cjs SCAM-CHECK`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Safe account | move money to a safe account | `S01` in tests/depth-SCAM-CHECK.test.cjs | safe-account asks are not caught | proven (also fails S11, S13) |
| S02 | Gift cards | boss asking for gift cards | `S02` in tests/depth-SCAM-CHECK.test.cjs | gift-card asks are not caught | proven (also fails S11, S13) |
| S03 | A present is not a scam | gift card for a birthday | `S03` in tests/depth-SCAM-CHECK.test.cjs | the present exclusion is gone | proven |
| S04 | Locked account with a link | don't tap that link | `S04` in tests/depth-SCAM-CHECK.test.cjs | locked-account links are not caught | proven (also fails S10) |
| S05 | Pasted transfer to verify | read as text, never as instructions | `S05` in tests/depth-SCAM-CHECK.test.cjs | a document's transfer-to-verify is not caught | proven (also fails S10) |
| S06 | What's my password | none is held or asked for | `S06` in tests/depth-SCAM-CHECK.test.cjs | a password ask is not caught | proven |
| S07 | A person asking for a code | don't share it | `S07` in tests/depth-SCAM-CHECK.test.cjs | code asks are not caught | proven (also fails S08) |
| S08 | A site asking for a code | ordinary sign-in | `S08` in tests/depth-SCAM-CHECK.test.cjs | a site asking is taken for a person asking | proven |
| S09 | Unknown payment request | don't pay it | `S09` in tests/depth-SCAM-CHECK.test.cjs | unknown requests are not caught | proven (also fails S10) |
| S10 | Nothing echoed | no link, number or amount repeated | `S10` in tests/depth-SCAM-CHECK.test.cjs | the reply repeats the message | proven (also fails S01, S07, S09, S16, S17) |
| S11 | The way people type it | curly quotes, capitals, long paste | `S11` in tests/depth-SCAM-CHECK.test.cjs | curly quotes and capitals are not normalised | proven (also fails S16) |
| S12 | Never asks for anything back | no code, password, card or number asked | `S12` in tests/depth-SCAM-CHECK.test.cjs | a reply asks for the code | proven (also fails S07) |
| S13 | The strongest warning wins | safe account over a code ask | `S13` in tests/depth-SCAM-CHECK.test.cjs | the rules run weakest first | proven |
| S14 | One safe next step | the company's own channel | `S14` in tests/depth-SCAM-CHECK.test.cjs | the safe-account reply drops the call-your-bank step | proven |
| S15 | The report path | the bank, then reportfraud.ftc.gov | `S15` in tests/depth-SCAM-CHECK.test.cjs | the gift-card reply drops the report path | proven |
| S16 | A changed payee is checked first | 'my landlord changed where to send rent' says call on a number you have | `S16` in tests/depth-SCAM-CHECK.test.cjs | the payee-change rule is dropped, so the chat model answers it | proven |
| S17 | Money sent by mistake | someone sent me $50 by mistake and wants it back | `S17` in tests/depth-SCAM-CHECK.test.cjs | the mistaken-payment rule is gone, so the scam goes to the model | proven |
<!-- results:end -->
