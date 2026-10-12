# CONNECT-CARDS: the owner's connect-card design (packet added for G4)

`packages/domain/76-connect-cards.js` holds the owner's reference design for every "connect X" moment (2026-10-11): one
short line saying what did not happen and "here's the link", then the connect link alone on its own line, which iMessage
draws as the card (dark grey, the company's real logo centered, the Upmore wordmark below it, then a strip with "Connect
X to Upmore" and the domain) and the app draws from the same image. Only providers a person can actually connect today
get a card (Alpaca by OAuth, Gmail), each with its real logo on file in `img/brands/` (`SOURCES.md` names its source and
license); anything else gets plain words, never a stand-in. It is reached by `agent-chat/_shared/direct_answers.ts`
(connect my X, through the connector matrix's `connectAnswer`), `packages/domain/73-broker-accounts.js` (every brokerage
connect prompt), the app's chat (`md` and `connectCardHTML` in `src/upmore-app-template.html`) and
`scripts/build-connect-cards.cjs` (the page behind each link and its 1200x630 image).
Check: `node --test tests/depth-CONNECT-CARDS.test.cjs && node evals/depth/run.cjs CONNECT-CARDS`.

No bug was found building this packet: every card the chat can raise is Alpaca (checked over every platform in the
connector matrix), each card's logo is the company's own mark, and a reply line is drawn as a card only when it is
exactly an https connect link for a provider on the list.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Only providers a person can connect | the list is Alpaca and Gmail | `S01` in tests/depth-CONNECT-CARDS.test.cjs | Outlook gets a card though nothing connects it (a card that leads nowhere) | proven (also fails S02, S03, S07, S14, S15) |
| S02 | The real logo | Gmail's icon is its own mark in img/brands | `S02` in tests/depth-CONNECT-CARDS.test.cjs | a generic mail glyph stands in for Gmail's logo | proven |
| S03 | The provider's own card image | Alpaca's card is img/connect/alpaca.png | `S03` in tests/depth-CONNECT-CARDS.test.cjs | one shared card image for every provider | proven |
| S04 | The link alone on its own line | line, blank line, link | `S04` in tests/depth-CONNECT-CARDS.test.cjs | the link is run into the line, so no bubble is the link and no card is drawn | proven (also fails S06, S09) |
| S05 | What did not happen, and here's the link | the default line | `S05` in tests/depth-CONNECT-CARDS.test.cjs | the line becomes a call to action that says neither | proven (also fails S04, S09) |
| S06 | The caller's line is kept | a brokerage prompt says nothing was placed | `S06` in tests/depth-CONNECT-CARDS.test.cjs | the caller's line is dropped for the default | proven |
| S07 | No real logo, no card | Outlook gets no link | `S07` in tests/depth-CONNECT-CARDS.test.cjs | the provider check is dropped, so any name gets a link | proven |
| S08 | The production app | the link is the projects deployment | `S08` in tests/depth-CONNECT-CARDS.test.cjs | the link points at a domain that was never bought | proven (also fails S04, S06, S15) |
| S09 | One clean link | a trailing slash is not doubled | `S09` in tests/depth-CONNECT-CARDS.test.cjs | the base is used as given | proven |
| S10 | Any host, a trailing slash | a preview link with a trailing slash is a card | `S10` in tests/depth-CONNECT-CARDS.test.cjs | a trailing slash is not allowed | proven |
| S10 | Any case | /connect/Alpaca is the Alpaca card | `S10` in tests/depth-CONNECT-CARDS.test.cjs | the provider is looked up as typed | proven |
| S11 | https only | http is not a card | `S11` in tests/depth-CONNECT-CARDS.test.cjs | http is read as a card too | proven |
| S12 | The link alone | a link inside a sentence is text | `S12` in tests/depth-CONNECT-CARDS.test.cjs | the start of the line is not anchored | proven |
| S13 | Nothing after the provider | a query is not a card | `S13` in tests/depth-CONNECT-CARDS.test.cjs | the end of the line is not anchored | proven |
| S14 | Only a provider with a card | /connect/outlook is not drawn | `S14` in tests/depth-CONNECT-CARDS.test.cjs | any provider word is read as a card | proven |
| S15 | The company's name on the strip | Connect Alpaca to Upmore | `S15` in tests/depth-CONNECT-CARDS.test.cjs | the provider id is shown instead of the company's name | proven |
<!-- results:end -->
