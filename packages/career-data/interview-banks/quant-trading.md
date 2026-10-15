# Quant / Trading — Interview Question Bank

> Product data — sourced synthesis, not a copy of any guide. Items are paraphrased and cited to pages actually fetched during research (Oct 2026). Worked answers below are original derivations of standard problems (mathematics is not paraphrased from any single source's wording).
> Role split matters: **Trader** interviews weight probability, market-making and mental math; **Quant Research / Algorithm Developer** interviews add statistics, regression and heavier coding; **SWE-at-a-trading-firm** interviews add DSA/system design with a probability layer. Items are tagged accordingly.

## Source key (all URLs fetched)

- **JS-Official** — Jane Street, *Probability & Markets* (firm's own trading-interview guide, PDF) — https://www.janestreet.com/static/pdfs/trading-interview.pdf
- **EFC-JS/Citadel** — eFinancialCareers, interview questions of Jane Street, Jump and Citadel Securities — https://www.efinancialcareers.com/news/electronic-trading-interviews
- **Optiver-WSO** — Wall Street Oasis, Optiver Trader interview report (Amsterdam) — https://www.wallstreetoasis.com/company/optiver/interview/trader-2
- **Optiver-Extern** — Extern, Optiver Internship Guide (process + 80-in-8 description) — https://www.extern.com/post/optiver-internship-guide
- **Optiver-Math** — SpaceComplexity, Zetamac and Mental Math for Quant Interviews (Optiver 80-in-8 breakdown) — https://spacecomplexity.ai/blog/zetamac-mental-math-quant-interview
- **HRT-WSO** — Wall Street Oasis, Hudson River Trading Algorithm Engineer interview report — https://www.wallstreetoasis.com/company/hudson-river-trading-llc/interview/algorithm-engineer
- **Citadel-Glassdoor** — Glassdoor, Citadel Quant Research Intern interview report (bias/variance, linear regression closed form) — https://www.glassdoor.co.uk/Interview/1-Past-research-experirence-reinforcenment-learning-model-explainability-A-lot-of-followups-2-Bias-and-variance-tra-QTN_4948455.htm
- **JS-Guide-Secondary** — Myntbit, Jane Street Quant Interview Prep Guide 2026 (secondary compilation; used only where it matches JS-Official concepts) — https://myntbit.com/blog/jane-street-quant-interview-guide-2026

---

## Format facts (sourced)

- **Jane Street (trading):** probability and market-making games are the core, run conversationally with evolving follow-ups — the interviewer changes the game as you reason. JS-Official is explicit that the firm publishes the guide because these concepts *are* the day job. Sources: JS-Official; EFC-JS/Citadel.
- **Optiver (trader):** a multi-stage funnel starting with an online assessment. Multiple independent reports agree on the headline screen: **80 mental-math questions in 8 minutes** ("80 in 8"), multiple choice, with negative marking in at least some versions (report versions differ on the exact penalty — see honesty note), followed by probability/logic, sequence puzzles and cognitive games, then phone/video interviews, then a final round with a trading simulation / market-making game, a technical interview and a behavioral interview. Sources: Optiver-WSO; Optiver-Extern; Optiver-Math.
- **HRT (algorithm developer / quant):** online coding assessment first (reported as 2–3 problems, C/C++ or Python depending on role), then phone rounds split between probability and algorithms/C++ depth, then an onsite/superday mixing coding, probability, data/codebase and behavioral rounds. Sources: HRT-WSO; Glassdoor HRT reports found in search (https://www.glassdoor.co.in/Interview/Hudson-River-Trading-Quantitative-Researcher-Interview-Questions-EI_IE470937.0,20_KO21,44.htm).
- **Timed vs untimed:** Mental-math screens are hard-timed (80-in-8 = ~6 seconds/question). Probability interviews are untimed on paper but judged on speed and clarity of reasoning out loud. Coding assessments are hard-timed; live coding is time-boxed per round. Sources: Optiver-Math; HRT-WSO.
- **Retake lockout (Optiver):** Extern reports candidates can attempt Optiver's assessment only once every 8 months. Single secondary source — treat as **reported, not firm-confirmed**.
- **Scoring discrepancy — honesty note:** Optiver-WSO reports +1 / −2 (wrong) on an older in-person version with no skipping allowed; Optiver-Math reports +1 / −1 wrong / −1 skipped on the online version. **Do not teach one penalty scheme as universal** — version and year differ. Teach the invariant: guessing policy must follow the stated penalty, so read the instructions on the day.

## AI-flag / authenticity note (sourced, limited)

- No fetched firm page (Jane Street, Optiver, HRT) stated an AI-use policy or AI-answer detection method for interviews. **Any claim about quant firms' AI-flag rates is UNVERIFIED in this bank.**
- What *is* sourced: these interviews are predominantly live, interactive and follow-up-driven (interviewer changes the dice game, asks "what if it's biased?", extends your code) — a format in which a memorised/scripted answer degrades visibly, per the process descriptions in JS-Official and HRT-WSO. Present that as a format fact, not as a detection claim.

---

## A. Probability & Expectation — 10 items [Trader + Quant]

1. **Expected value of a die roll; price a bet that pays the number of pips.** Foundation of JS-Official (uniform distribution, expectation, linearity). Source: JS-Official.
2. **Conditional probability with dice/coins** — e.g. P(roll = 5 | roll ≥ 4); P(exactly 2 heads in 3 flips | at least 1 tail). Worked in JS-Official. Source: JS-Official.
3. **Sum of two dice — distribution, P(sum = 7), P(sum = 10), why sums are not equally likely.** Source: JS-Official.
4. **Expected number of trials to a pattern** — e.g. flips to two consecutive heads; rolls to see every die face (coupon collector); expected rolls for two dice to sum to 7 (HRT-reported variant). Sources: JS-Guide-Secondary; HRT reports via dev.to summary found in search (https://dev.to/net_programhelp_e160eef28/hudson-river-trading-vo-interview-experience-gch).
5. **Bayes / biased-coin problem** — bag with mostly fair coins and one double-headed coin; after a run of heads, probability you hold the biased coin. Widely attested Jane Street-style prompt in secondary compilations. Source: JS-Guide-Secondary (labelled community-reported there — treat the *type* as canonical, not a verbatim firm question).
6. **Optimal stopping / reroll strategy** — roll a die, optionally reroll once (or stop-or-continue for a running sum, with a bust condition); find the threshold strategy and its EV. Sources: EFC-JS/Citadel (stop-or-bust die game reported from Glassdoor); JS-Guide-Secondary.
7. **Broken-stick / geometric probability** — two random breaks, probability the pieces form a triangle. Source: JS-Guide-Secondary.
8. **Linearity of expectation counting** — e.g. expected number of distinct outcomes hit (floors stopped at, faces seen, fixed points). Source: JS-Guide-Secondary; concept is core to JS-Official's expectation chapter.
9. **Cards without replacement** — probabilities for sequences/draws, expected value of an extreme card in a split deck. Sources: JS-Official (with/without replacement draws); EFC-JS/Citadel.
10. **Fermi / estimation under uncertainty with confidence intervals** — estimate an unknown quantity, give a calibrated interval, update it when given a new fact. JS-Official devotes a section to confidence intervals and overconfidence. Source: JS-Official. (Citadel-reported market-estimation variants — e.g. sizing a company's revenue with no data — in EFC-JS/Citadel.)

## B. Market-making games — 6 items [Trader]

11. **Make a market on a die roll** (payoff = pips): quote bid/ask and size, justify the spread. JS-Official's own example lands (in its words, paraphrased) around a fair value of 3.5 with a two-sided quote below/above it and a stated size. Source: JS-Official; also EFC-JS/Citadel.
12. **Make a market on the number of heads in 10 coin flips** — EV 5, use variance/standard deviation (~1.58) to set spread width, widen if the counterparty may know more. Source: secondary Jane Street compilations found in search (https://blog.theinterviewguys.com/jane-street-interview-questions/) — *type canonical, wording secondary*.
13. **Make a market on an unknown real-world quantity** (sport result, a count, a date) — build the estimate, quote around it, manage inventory after a trade. Sources: JS-Official (making markets on unverifiable-at-quote-time contracts); EFC-JS/Citadel (Citadel market-making on obscure sports/stat facts reported).
14. **Adverse selection follow-ups** — "I lift your offer instantly and want double size — what do you do now? What did you just learn?" JS-Official has a dedicated adverse-selection section. Source: JS-Official.
15. **Update your market on new information mid-game** (a roll is revealed, a card is shown, the other trader's behaviour leaks information) — Bayesian repricing, not just a new EV. Sources: JS-Official; JS-Guide-Secondary (calibration / Bayesian updating / trading when you have edge are named as graded skills there).
16. **Trading simulation / market-making game (final round)** — multi-player or simulated-market exercise at Optiver-style finals; graded on quote discipline, position limits and P&L, not on one price. Source: Optiver-Extern.

*How to answer any market-making prompt (pattern from JS-Official, paraphrased): state fair value and how you got it → quote a spread around it sized to your uncertainty and the counterparty's likely edge → state size → say in advance what would make you widen, tighten, or skew.*

## C. Mental math drills — 5 items [Trader, some Quant]

17. **80-in-8 style arithmetic:** two-digit × two-digit, decimals (e.g. 0.014 × 0.0004), fractions of quantities, fraction↔decimal conversions, division by decimals. No calculator; ~6 sec/question in the Optiver screen. Sources: Optiver-WSO; Optiver-Math; Optiver-Extern.
18. **Fraction → percentage speed conversions** (sevenths, eighths, thirteenths etc.) and percentage-of-quantity in one step. Source: JS-Guide-Secondary (mental-math skill list); Optiver-Math.
19. **Rule of 72 / compounding estimates** — doubling time ≈ 72 / rate%; tripling ≈ 114 / rate%. Source: JS-Guide-Secondary.
20. **Sequence / next-term puzzles** (Optiver assessment section: ~25 sequences in a relaxed-but-timed block, per WSO report). Source: Optiver-WSO.
21. **Guessing strategy under negative marking** — compute the EV of guessing vs skipping from the *stated* penalty before the test starts (see format-facts discrepancy note). Sources: Optiver-WSO; Optiver-Math.

## D. Brainteasers & logic — 5 items [Trader + Quant]

22. **Balance-scale problem** — 8–9 balls, one heavier, find it in 2 weighings (ternary split logic). Widely attested quant brainteaser type in secondary compilations. Source: secondary Jane Street compilation found in search (https://crtc.ohri.ca/uploaded-files/aphN9B/0FE012/JaneStreetInterviewQuestions.pdf) — *secondary only; type canonical, exact numbers vary*.
23. **Monty Hall problem** — and the follow-up with more doors / a host who may be adversarial. Source: same secondary compilation above.
24. **Water-jug / measuring problem** (3L and 5L jugs, measure 4L). Source: same secondary compilation above.
25. **100-prisoners-and-a-lightbulb style coordination puzzle** (Citadel-reported). Source: EFC-JS/Citadel.
26. **Dice-design / game-design problem** — design dice or choose a strategy to beat an opponent's die/game (HRT-reported: first derive the optimal strategy, then code a validation). Source: Glassdoor HRT report in HRT search results (URL in source key notes above).

## E. Statistics / Regression / ML — 7 items [Quant Research primarily]

27. **Linear regression closed form, with and without L2 (ridge) regularisation** — derive β̂ = (XᵀX)⁻¹Xᵀy and β̂_ridge = (XᵀX + λI)⁻¹Xᵀy; when XᵀX is singular and what ridge fixes. **Firm-reported.** Source: Citadel-Glassdoor.
28. **Bias–variance tradeoff, incl. in random forests** — why bagging/averaging many trees cuts variance without much bias change; what deeper trees do to each term. **Firm-reported (same Citadel interview).** Source: Citadel-Glassdoor.
29. **Regression assumptions** — linearity, independent errors, homoscedasticity, (for inference) normal residuals, low multicollinearity; what breaks when each fails and how you would diagnose it (residual plots etc.). Widely taught statistics-interview canon. Source: statistics interview compilation found in search (https://www.scribd.com/document/454840920/document-pdf) — *secondary; treat as standard syllabus, not a firm quote*.
30. **Hypothesis testing / statistical significance in a trading-data context** — e.g. a claim tested on a sample (did this person / strategy really beat chance?), choosing a test, p-values and multiple-testing traps. HRT-reported significance question type. Sources: HRT reports found in search (Jointaro HRT summaries, https://www.jointaro.com/interviews/companies/hudson-river-trading/experiences/new-grad-algorithm-developer-united-states-october-1-2020-no-offer-neutral-9741e488/).
31. **Overfitting / backtest hygiene** — data snooping, look-ahead bias, why in-sample Sharpe inflates, train/test discipline on noisy, adversarial, non-stationary market data. Framing source: Jane Street's own ML researcher role description (signals are small, noise is high, markets evolve) found in search — https://www.janestreet.com/join-jane-street/closed-internship/machine-learning-researcher-may-august-nyc/. *Question wording is a synthesis — UNVERIFIED as a verbatim firm prompt.*
32. **Options / derivatives basics for quant roles** — Black–Scholes inputs and PDE at awareness level, synthetic positions (long call + short put at same strike/expiry = synthetic long stock), what VaR measures. Source: *Heard on the Street* (Timothy Crack) question tradition as summarised in the fetched compilation — https://db1.thecrucible.org/Download_PDFS/details/596/429/aN14QE/HeardOnTheStreetQuantitativeQuestionsFromWallStreetJobInterviews.pdf — *secondary summary of the book; do not quote the book from it*.
33. **Explain your past research — deep follow-ups.** Firm-reported as the opening of the Citadel quant research interview, with heavy follow-up questioning. Source: Citadel-Glassdoor.

## F. Coding expectations — 6 items [Quant / Algo Dev / SWE]

34. **Online assessment: 2–3 algorithmic problems, hard-timed, graded on correctness *and* (at HRT, reportedly) runtime** — LeetCode medium-to-hard difficulty band. Sources: HRT-WSO; Glassdoor HRT reports in search results.
35. **Live coding that extends a probability problem** — derive the optimal strategy on paper, then implement/simulate it to validate. Source: Glassdoor HRT report in search results.
36. **Data-structure design under constraints** — e.g. a structure supporting push and random-pop; order-book simulation (process a stream of buy/sell orders, match, report execution prices). Sources: Jointaro HRT report in search results; Optiver HackerRank report found in search (https://medium.com/@anqi.silvia/optiver-interview-my-real-hackerrank-coding-questions-5e0d9b62c30b) — *candidate reports, not firm syllabi*.
37. **Language expectations:** C++ depth (memory/cache behaviour, bit-level questions) is probed verbally at HRT even in non-coding rounds; Jane Street uses OCaml internally but does not require it to interview, valuing clean functional decomposition; Optiver commonly accepts C++/Python/Java with C++ favoured for performance roles. Sources: HRT-WSO; secondary comparisons found in search (https://spacecomplexity.ai/blog/optiver-vs-jane-street-interview).
38. **Systems / performance awareness (SWE & algo roles):** latency, concurrency, memory hierarchy — "simple-sounding but tricky" questions that go past surface level. Source: HRT-WSO.
39. **Coding style graded, not just output:** narrate reasoning, name complexity, handle edge cases aloud; interviewers question design decisions constructively in real time. Sources: HRT-WSO; HRT candidate-experience summary found in search (https://dev.to/net_programhelp_e160eef28/hudson-river-trading-vo-interview-experience-gch).

## G. Behavioral for quant firms — 3 items

40. **"Tell me about a time you changed your mind on something technical / a decision you later regretted."** — graded for intellectual honesty and updating on evidence. Source: secondary Jane Street comparison found in search (https://spacecomplexity.ai/blog/optiver-vs-jane-street-interview).
41. **"Why this firm?" with firm-specific substance** (not generic prestige) — Optiver reports warn generic answers fail. Source: Optiver SDE experience found in search (https://medium.com/@yourhome1106/optiver-sde-interview-experience-2026-3-rounds-6c3b6f85976c).
42. **Conflict / teamwork under pressure, answered with data** (e.g. resolving a strategy disagreement by backtest comparison). Source: same Optiver report above.

---

## Fully worked example answers (original derivations)

### Worked example 1 — Expected flips to two consecutive heads (Item 4)

Let E₀ = expected remaining flips with no trailing head, E₁ = expected remaining flips having just flipped one head.
- E₀ = 1 + ½·E₁ + ½·E₀  (one flip; heads moves to state 1, tails restarts)
- E₁ = 1 + ½·0 + ½·E₀  (heads finishes, tails restarts)
From the second: E₁ = 1 + E₀/2. Substitute: E₀ = 1 + ½(1 + E₀/2) + ½E₀ = 1.5 + ¾E₀ → ¼E₀ = 1.5 → **E₀ = 6 flips.**
Teaching point to say aloud: the state-machine setup, not the arithmetic, is what is graded. (Problem type: JS-Guide-Secondary; HRT pattern-flip variants in §A item 4.)

### Worked example 2 — Making a market on a die roll (Item 11)

Payoff = pips on one fair d6. Fair value = (1+2+3+4+5+6)/6 = **3.5**.
- You must quote both sides and a size, e.g. (in the format JS-Official teaches: bid at offer, size up) a market centred on 3.5 with a spread that pays you for variance and for the chance the counterparty knows something — illustratively "3 bid / 4 offered, 10 lots" for a plain roll with no information asymmetry.
- If the counterparty instantly buys all you offer and asks for more, update: either they are noise (keep quoting, you earn the spread) or they have information about the die (widen or skew down your offer first, then re-derive fair value). Naming that fork *before* trading is the adverse-selection answer JS-Official trains.
- Check: over many rolls at 3/4 you buy at 3 (EV +0.5/roll) and sell at 4 (EV +0.5/roll) against a fair counterparty — the spread is your edge; variance is why size stays finite.
Source for the game and its format: JS-Official.

### Worked example 3 — The biased-coin Bayes problem (Item 5)

Bag: 99 fair coins, 1 double-headed coin. You draw one at random and flip it 10 times: all heads. Probability it is the double-headed coin?
- Prior: P(biased) = 1/100, P(fair) = 99/100.
- Likelihoods: P(10 heads | biased) = 1. P(10 heads | fair) = (½)¹⁰ = 1/1024.
- Posterior: P(biased | 10H) = (1 × 1/100) / [(1 × 1/100) + (1/1024 × 99/100)] = (1) / [1 + 99/1024] = 1024 / 1123 ≈ **0.912**.
Teaching point: ten heads feels conclusive, but the 99:1 prior against still leaves ~9% on "fair coin, lucky run" — state the prior explicitly before computing. (Problem type: JS-Guide-Secondary, community-reported.)

### Bonus drill answer — Expected rolls for two dice to sum to 7 (Item 4 variant)

P(sum = 7) = 6/36 = 1/6 (six ordered pairs). Rolls to first success are geometric with p = 1/6, so expected rolls = 1/p = **6**. Follow-ups to expect: biased dice (recompute p), same sum twice in a row (states, as in Example 1). Source: HRT candidate report in search results.

---

## Canonical bookshelf (named in the task; status honest)

- **Jane Street, *Probability & Markets*** — fetched and used directly (JS-Official). The single best primary source in this file.
- ***Heard on the Street* — Timothy Crack ("the Green Book" tradition):** used only via a secondary summary (see item 32). **The book itself was NOT fetched — UNVERIFIED at primary-source level.** Its attested question families are probability, brainteasers, and market/derivatives basics.
- **Mark Joshi, *Quant Job Interview Questions and Answers*:** search returned only low-quality aggregator copies; **no trustworthy page was fetched, so no item in this bank is cited to Joshi.** His attested territory (probability, Black–Scholes derivations, coding) overlaps items 27–38, but treat the Joshi attribution as UNVERIFIED here.

## Count and honesty notes

- **Canonical items in this file: 42** (10 probability + 6 market-making + 5 mental math + 5 brainteasers + 7 statistics/regression + 6 coding + 3 behavioral), plus 3 fully worked answers and 1 bonus drill.
- **Firm-confirmed vs community-reported:** JS-Official items (1–3, 10, 11, 14) and the Citadel-Glassdoor items (27, 28, 33) rest on a firm source or a named-firm interview report. Optiver/HRT process facts rest on convergent candidate reports (WSO/Glassdoor/Extern), not firm pages — convergent and consistent, but labelled as reports throughout.
- **Biggest variance across firms:** unlike IB, there is no single quant skeleton. Jane Street grades reasoning-aloud on probability/markets; Optiver front-loads a brutal timed arithmetic screen; HRT/Citadel quant-research routes grade coding and statistics depth. A candidate prepped only for one firm's game is unprepared for the other two.
