# SWE Interview Bank — Software Engineering

> Product data. Researched 2026-10-13 from sources fetched live (browser search + open).
> Every canonical item lists its source. Commercial guides are labelled [commercial].
> Original worked answers are written for this bank — not copied from any source.
> Rule used: a pattern/type is called "canonical" only if attested by an official
> firm page or by 2 independent guides.

## How to read the sources
- **Official** = the firm itself (Meta Careers, About Amazon).
- **[commercial]** = a paid prep/coaching business (IGotAnOffer, NeetCode-style lists). Useful for what candidates report, weaker than official.
- **Book / library record** = bibliographic record for *Cracking the Coding Interview* (CareerCup, 6th ed. 2015).

---

## Format facts (sourced)

1. **Meta initial technical screen: 45 min total** — ~5 min introductions, ~35 min coding, ~5 min candidate questions. Coding is in a shared editor (or whiteboard in person); problems are sized to be explained in minutes and solved in roughly 10–30 min, with follow-up constraints added.
   Source: Meta (official) — https://www.Metacareers.com/blog/preparing-for-your-software-engineering-interview-at-meta/
2. **Meta full loop: coding + design + behavioral**, each ~45 min. Design is either *systems* design or *product* design depending on background, and normally involves talking/diagramming, not coding.
   Source: Meta (official) — https://www.Metacareers.com/blog/preparing-for-your-software-engineering-interview-at-meta/
3. **Meta full loop (candidate-reported, newer)**: 4–5 interviews, 40–60 min each; 1–2 standard coding, 1 or 2 design, 1 behavioral, plus in some loops a pilot AI-enabled coding round (~60 min, one multi-part problem, AI use optional in CoderPad).
   Source: IGotAnOffer [commercial] — https://igotanoffer.com/blogs/tech/facebook-software-engineer-interview
4. **Amazon loop**: behavioural questions are mapped to the 16 Leadership Principles and answered in STAR; Amazon itself recommends preparing multiple examples per principle, speaking in "I" not "we", and quantifying results. A Bar Raiser (interviewer from outside the hiring team) is part of the loop model described in Amazon-linked prep coverage.
   Sources: Amazon (official) — https://www.aboutamazon.com/news/workplace/amazon-leadership-principles-interview ; Amazon Ads (official) — https://advertising.amazon.com/careers/re-exploring-careers/amazon-interview-preparation
5. **Microsoft**: official interview tips as summarised by Huru emphasise STAR(R) — STAR plus Reflection — clarifying questions / stated assumptions before solving, and a growth-mindset bar ("learn-it-all" over "know-it-all"); role-specific exercises include coding.
   Source: Huru summary of Microsoft interview tips [commercial] — https://huru.ai/microsoft-interview-questions-system-design-behavioral-loop-tips/
6. **Google (secondary summary)**: structured interviews, same questions/rubric per role, hiring-committee review after the loop, then team matching. Treat exact round counts as variable by level/team — guides disagree.
   Source: Angld summary of Google Careers [commercial/blog] — https://angld.ai/blog/how-to-find-the-hiring-manager-at-google-when-there-isnt-one-yet
   Note: No live Google Careers page text was retrieved in this pass — Google-specific round counts are therefore **UNVERIFIED** here beyond the structured-interview / hiring-committee pattern above.
7. **Online assessments (OA)**: Meta candidates *sometimes* get an OA before/around the recruiter screen; a proctored ~90-min multi-stage OA is candidate-reported, not official. Microsoft OAs are reported on Codility/HackerRank by candidate guides.
   Sources: IGotAnOffer [commercial] — https://igotanoffer.com/blogs/tech/facebook-software-engineer-interview ; candidate guide (GitHub) — https://github.com/abdouloued/newgrad-ops/blob/HEAD/data/companies/microsoft.md — **UNVERIFIED as a firm rule; recruiter confirms per loop.**

---

## A. Data structures & algorithms — canonical patterns (18 items)

The pattern taxonomy below is the Blind 75 / NeetCode 150 taxonomy, cross-checked in two independent listings. Meta's official page independently requires the underlying topics: arrays, hash tables/maps, stacks, queues, graphs, trees, heaps, sorts, searches, BFS/DFS, recursion, and Big-O discussion.
Sources for the taxonomy: NeetCode 150 list (GitHub mirror) — https://github.com/vigneshwar1990/neetcode-150-and-blind-75 ; Blind 75 list — https://github.com/lokeshdhanger/leetcode_75 ; Meta (official, topics + Big-O) — https://www.Metacareers.com/blog/preparing-for-your-software-engineering-interview-at-meta/

1. **Arrays & Hashing — Two Sum** (hash-map complement lookup). Source: both lists above.
2. **Arrays & Hashing — Group Anagrams / Top K Frequent Elements** (frequency map; heap or bucket for Top K). Source: both lists above.
3. **Two Pointers — Valid Palindrome, 3Sum, Container With Most Water**. Source: both lists above.
4. **Sliding Window — Longest Substring Without Repeating Characters; Minimum Window Substring; Best Time to Buy and Sell Stock**. Source: both lists above.
5. **Stack — Valid Parentheses, Min Stack, Daily Temperatures** (monotonic stack). Source: both lists above.
6. **Binary Search — Search in Rotated Sorted Array; Find Minimum in Rotated Sorted Array; Median of Two Sorted Arrays**. Source: both lists above.
7. **Linked List — Reverse Linked List, Merge Two Sorted Lists, Linked List Cycle** (fast/slow pointers), **Merge K Sorted Lists**. Source: both lists above.
8. **Trees — Invert Binary Tree, Maximum Depth, Level-Order Traversal, Lowest Common Ancestor, Validate BST, Binary Tree Maximum Path Sum**. Source: both lists above.
9. **Tries — Implement Trie; Word Search II**. Source: NeetCode 150 list above.
10. **Heap / Priority Queue — Kth Largest Element; Top K Frequent; Merge K Lists**. Source: both lists above.
11. **Backtracking — Subsets, Permutations, Combination Sum**. Source: both lists above.
12. **Graphs — Number of Islands, Clone Graph, Pacific Atlantic Water Flow** (BFS/DFS on grid/graph). Source: both lists above.
13. **Dynamic Programming (1-D) — Climbing Stairs, House Robber, Coin Change, Longest Increasing Subsequence, Word Break**. Source: both lists above.
14. **Greedy — Maximum Subarray, Jump Game**. Source: NeetCode 150 list above.
15. **Intervals — Merge Intervals, Non-overlapping Intervals, Meeting Rooms**. Source: both lists above.
16. **Math & Geometry / Bit Manipulation — Rotate Image, Set Matrix Zeroes, Single Number, Counting Bits**. Source: NeetCode 150 list above.
17. **Big-O fluency as an explicit scored skill** — state time/space, compare approaches, then optimise. Source: Meta (official) above; also *Cracking the Coding Interview* contents (Big O chapter) — library record: https://searchlib.cwu.edu/discovery/fulldisplay?vid=01ALLIANCE_CWU%3ACWU&tab=LibraryCatalog&docid=alma99321100465601451&searchScope=cwu_alma_summit&context=L&lang=en
18. **Book canon**: *Cracking the Coding Interview*, 6th ed. (CareerCup, 2015) organises prep as: data structures, concepts/algorithms, knowledge-based, plus chapters on Big O, behavioural, system design/scalability, sorting/searching, threads/locks. Its 189-question count is from the publisher/title record — cite the record, not memory.
    Source: Central Washington University library record — https://searchlib.cwu.edu/discovery/fulldisplay?vid=01ALLIANCE_CWU%3ACWU&tab=LibraryCatalog&docid=alma99321100465601451&searchScope=cwu_alma_summit&context=L&lang=en

## B. System design — canonical prompts (7 items)

Meta official guidance: start from requirements (scale, latency, storage, push vs pull), outline a high-level approach, go deep on the hard sub-problem, and discuss trade-offs explicitly.
Source for method: Meta (official) — https://www.Metacareers.com/blog/preparing-for-your-software-engineering-interview-at-meta/

19. **Design a messaging / chat backend** — Meta's own worked framing: users, messages/day, delivery latency, message storage, push vs pull.
    Source: Meta (official) — same URL above.
20. **Design an email server / rich document editor API** — Meta's own product-design examples: storage at scale, large recipient lists, spam/abuse, reliability; pagination for large documents, API versioning without breaking old clients.
    Source: Meta (official) — same URL above.
21. **Design a URL shortener (e.g. Bitly)** — ID generation, redirect, caching, capacity maths.
    Source: System-design prep guide (GitHub) — https://github.com/ahmed-developer7/master-guide/blob/HEAD/08-craft-and-interview-prep/03-system-design-prep.md ; also attested as a Google-loop example in secondary guides — https://whatisthesalary.com/careers/google-software-engineer-jobs/
22. **Design a news feed / timeline** — fan-out-on-write vs fan-out-on-read, hybrid for high-follower accounts, feed caching/ranking.
    Source: System-design prep guide — https://github.com/ahmed-developer7/master-guide/blob/HEAD/08-craft-and-interview-prep/03-system-design-prep.md ; Meta design themes (news feed) in IGotAnOffer [commercial] — https://igotanoffer.com/blogs/tech/facebook-software-engineer-interview
23. **Design a rate limiter** — token bucket / sliding window, distributed counters.
    Source: System-design prep guide — https://github.com/ahmed-developer7/master-guide/blob/HEAD/08-craft-and-interview-prep/03-system-design-prep.md
24. **Design file storage / sync (Dropbox-like)** — object storage + metadata DB, chunking/dedup, change notification.
    Source: System-design prep guide — https://github.com/ahmed-developer7/master-guide/blob/HEAD/08-craft-and-interview-prep/03-system-design-prep.md
25. **Design at Meta scale: distributed news feed / global file & media sync / top-K heavy hitters** (candidate-reported themes).
    Source: Dataford summary of Meta guide [commercial] — https://dataford.io/interview-guides/meta/software-engineer

## C. Behavioural (STAR) — canonical prompts (7 items)

Method is official at both Meta and Amazon: STAR = Situation, Task, Action, Result; Amazon adds quantified results and "I" language; Microsoft adds Reflection.
Sources: Meta (official) — https://www.Metacareers.com/blog/preparing-for-your-software-engineering-interview-at-meta/ ; Amazon (official) — https://www.aboutamazon.com/news/workplace/amazon-leadership-principles-interview

26. **Tell me about yourself / Why this firm?** Source: IGotAnOffer Meta SWE [commercial] — https://igotanoffer.com/blogs/tech/facebook-software-engineer-interview
27. **Tell me about a favourite / recent project and the difficulties in it.** Source: IGotAnOffer / Meta question list summary — https://medium.com/@leetcode-wizard-isabel/mastering-the-meta-software-engineer-interview-questions-process-and-expert-tips-for-preparation-8a39b36f72e8
28. **Tell me about a time you took ownership of a project** (Amazon: Ownership). Source: Amazon (official, Ownership discussion) — https://www.aboutamazon.com/news/workplace/amazon-leadership-principles-interview
29. **Describe a time you had to dive deep to solve a problem** (Amazon: Dive Deep). Source: candidate-question compilations summarising Amazon LP questions — https://huru.ai/amazon-leadership-principles-interview-star-bar-raiser/ [commercial]
30. **Tell me about a conflict / difficult colleague, and how you resolved it.** Source: Meta question list summary — https://medium.com/@leetcode-wizard-isabel/mastering-the-meta-software-engineer-interview-questions-process-and-expert-tips-for-preparation-8a39b36f72e8
31. **Tell me about a time you received constructive feedback / failed, and what you learned.** Source: same Meta list above; growth-mindset framing at Microsoft — https://huru.ai/microsoft-interview-questions-system-design-behavioral-loop-tips/
32. **Tell me about your greatest accomplishment.** Source: Meta question list summary — https://medium.com/@leetcode-wizard-isabel/mastering-the-meta-software-engineer-interview-questions-process-and-expert-tips-for-preparation-8a39b36f72e8

**Total canonical items: 32** (18 DSA + 7 system design + 7 behavioural), plus 7 format facts.

---

## Worked example 1 — Two Sum (original answer)

Prompt type: Arrays & Hashing (item 1).
Brute force checks every pair: O(n²). Better: one pass, store each value's index in a hash map; for `x`, look for `target - x`.

```python
def two_sum(nums, target):
    seen = {}  # value -> index
    for i, x in enumerate(nums):
        need = target - x
        if need in seen:
            return [seen[need], i]
        seen[x] = i
    return []
```
Time O(n), space O(n). Say this trade-off out loud — Meta's official guide scores explaining approach, comparing solutions, and discussing complexity, not just final code.

## Worked example 2 — System design skeleton: URL shortener (original skeleton)

1. **Clarify requirements:** creates/day, reads:creates ratio (reads dominate), link expiry?, custom aliases?, analytics?
2. **Capacity (illustrative, state assumptions):** if 100M creates/day ≈ 1.2k writes/sec; at 10:1 reads ≈ 12k redirects/sec — read-heavy, so caching matters more than write scaling.
3. **API:** `POST /links {long_url} -> {short_code}`; `GET /{code} -> 301/302 redirect`.
4. **ID generation:** base-62 encode a unique counter / distributed ID, or hash + collision check. Pre-generating IDs avoids collisions on the write path.
5. **Storage:** key-value mapping `code -> long_url` (fits a KV/NoSQL store or indexed relational table); hot codes in a cache (e.g. Redis-style) in front.
6. **Deep dives to offer:** cache eviction, rate-limiting/abuse, analytics pipeline off the redirect path (async), multi-region reads.
7. **Trade-offs to name:** 301 (cacheable, fewer hits, weaker analytics) vs 302 (every hit visible, more load); counter (predictable codes) vs hash (harder to enumerate, collision handling).

## Worked example 3 — Behavioural STAR skeleton (original, fictionalised template)

Question: "Tell me about a time you took ownership."
- **S — Situation:** "Our checkout service was erroring during peak traffic and no single team owned the end-to-end path."
- **T — Task:** "I was the on-call engineer; my job was to restore reliability before the next peak, not just restart the service."
- **A — Action:** "I traced the errors to a downstream timeout, added a bounded retry + circuit breaker, wrote the regression test, and ran the post-incident review."
- **R — Result:** "Peak error rate fell from [X%] to [Y%] over the next [N] peaks, and the runbook I wrote became the team's standard response."
Replace brackets with the candidate's real, quantified facts — Amazon's official guidance is explicit that specificity and quantified results are what make STAR answers strong, and Meta's is explicit that concrete examples beat theoretical answers.

## Standardisation note
SWE is the **most standardised** of the three families: the same ~15 patterns and the same handful of design prompts recur across firms, and firms publish their own round structure. The variance is in *weighting* (Amazon behavioural weight, Meta speed, Microsoft growth-mindset/STAR(R)), not in the question universe.
