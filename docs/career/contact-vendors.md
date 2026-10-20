# Contact data and email verification for outreach (WO-033)

Written 2026-10-20 for the owner's target: "500 bulge bracket investment bankers-class lists: built with verified emails in
under 24 hours, 85%+ deliverable addresses, under $50 data cost per list." Owner decision the same day: a data budget of
up to $300 a month, the owner signs up and pays; Apollo is the list source (CSV exported from Apollo's own UI), Hunter is
the independent verifier.

How to read the numbers:

- **VERIFIED**: read on the vendor's or regulator's own page, with its URL.
- **SOURCED**: an official page's text, read through a web-search excerpt because this session's network could not
  fetch the page itself (ftc.gov, apollo.io, hunter.io and support.google.com were refused by the egress proxy on
  2026-10-20). Treat it as close to VERIFIED, and confirm it on the page.
- **ASSUMED**: a third-party report (vendor review or pricing blog), named with its URL. Several of these disagree with
  each other; the disagreement is written down.
- **NOT_RUN**: nobody has measured it yet.

No vendor page could be fetched from this session, so **no price below is VERIFIED**. The owner confirms each one on the
vendor's pricing page when he signs up and types the real invoice number into Trainee (`record_list_cost`); only then is
a list's cost labeled VERIFIED.

## The choice

| Role | Vendor | How Trainee uses it | Why |
|---|---|---|---|
| List source | Apollo | The person builds the search in **their own** Apollo account, exports a CSV, and sends it to Trainee. No Apollo API call. An export from Upmore's or the owner's account is never given to users (D-018a: Apollo's terms allow internal business use only; serving lists to users needs a data licence). | The CSV path works on every plan; export credits and API terms differ by plan. |
| Verifier | Hunter Email Verifier | `GET https://api.hunter.io/v2/email-verifier?email=...&api_key=...` with `HUNTER_API_KEY`, only for addresses that passed Trainee's free checks, cached per address per month. | Independent of the list source; its statuses (`valid`, `invalid`, `accept_all`, `webmail`, `disposable`, `unknown`) map one to one. |
| Free first pass | Trainee | Syntax, MX through DNS-over-HTTPS, role inbox, throwaway domain. | Costs nothing. Credits are spent only on addresses that pass it. |

Trainee never probes a mailbox over SMTP itself. RCPT TO probing is abusive to the receiving server and gets the sending
IPs blocked. Hunter runs its own checks on its own servers. That is the one mailbox-level signal, and the report labels
it as Hunter's.

## Prices (none VERIFIED: see above)

| Vendor | Plan | Price | What you get | Label and source |
|---|---|---|---|---|
| Apollo | Free | $0 | Free credits cut from 100 to 75 a month between December 2025 and January 2026 | ASSUMED: https://www.landbase.com/blog/apollo-pricing |
| Apollo | Basic | $49 per user a month billed annually; $59 monthly (one source: $65 monthly since June to July 2026) | Email lookup is 1 credit, phone is 8; overage $0.20 a credit (minimum 250); export credits reported as about 1,000 a month (sources disagree) | ASSUMED: https://www.landbase.com/blog/apollo-pricing, https://bitscale.ai/blogs/apollo-pricing-a-full-breakdown-of-plans-credits-hidden-costs-2026, https://www.zeliq.com/blog/apolloio-pricing, https://www.joinvalley.co/blog/apollo-pricing-and-credits-explained-2026 |
| Apollo | Professional | $79 per user a month annually; $99 monthly | Export credits reported as 2,000 a month | ASSUMED: same sources |
| Apollo | Organization | $119 per user a month annually, at least 3 users | Export credits reported as 4,000 a month | ASSUMED: same sources |
| Hunter | Free | $0 | 50 credits a month | ASSUMED: https://emelia.io/hub/hunter-io-pricing, https://costbench.com/software/sales-intelligence/hunter-io/ |
| Hunter | Starter | $49 a month; $34 a month annually | 2,000 credits a month | ASSUMED: https://emelia.io/hub/hunter-io-pricing, https://marketbetter.ai/blog/hunter-io-pricing-breakdown-2026/ |
| Hunter | Growth | $149 a month; $104 annually | 10,000 credits a month | ASSUMED: same sources |
| Hunter | Scale | $299 a month; $209 annually | 25,000 credits a month (one source names a $499 "Business" tier instead) | ASSUMED: same sources; https://sendkit.ai/hunter-pricing for the conflict |
| People Data Labs | Pro | $98 a month or $940 a year | 350 person enrichments a month (about $0.28 a record); work email on about 3.4% of person records | ASSUMED: https://pipeline.zoominfo.com/sales/people-data-labs-pricing, https://www.syncgtm.com/blog/people-data-labs-review |
| RocketReach | Essentials / Pro / Ultimate | $399 / $899 / $2,099 a year (other sources: $229 / $619 / $1,379, or from $329) | 1,200 / 3,600 / 10,000 lookups a year | ASSUMED, conflicting: https://salesintel.io/blog/rocketreach-pricing-plans/, https://emelia.io/hub/rocketreach-pricing, https://salesmotion.io/blog/rocketreach-pricing |
| ZeroBounce | Pay as you go | $39 for 2,000 verifications | Credits reported as never expiring | ASSUMED: https://dupple.com/learn/best-email-verification-tools |
| NeverBounce | Pay as you go | About $0.008 a verification ($8 for 1,000) | Credit expiry disputed | ASSUMED: https://bouncezero.io/zerobounce-vs-neverbounce |

Hunter's credit cost per verification is reported as 1 credit, and 0.5 on some plans. ASSUMED: one blog, not confirmed.
Hunter's Email Verifier limits are reported as 10 requests a second and 300 a minute. ASSUMED:
https://www.withone.ai/knowledge/hunter (an integration page). Trainee stays at 4 a second and retries a 429 once after
its `retry-after`. A 202 means the check is still running; it is not cached and is asked again on the next pass.

People Data Labs is not chosen. Work email on about 3.4% of records makes it a poor source of addresses for cold email.

## One 500-banker list, costed (ASSUMED until the invoices exist)

Trainee's rule (`listCost`): a list's share of the plan is plan price x rows in the list / exports in the billing period.

| Line | Assumption | Cost |
|---|---|---|
| Apollo Basic, monthly | $59 a month, 1,000 exports a month, 500 used for this list | $29.50 |
| Hunter Starter | $49 for 2,000 credits, 1 credit a check, at most 500 checks (fewer: only free-pass survivors are paid for) | up to $12.25 |
| **One list** | | **up to $41.75: under $50 (ASSUMED)** |
| A month at that pace | Apollo Basic + Hunter Starter | $108 of the $300 budget |

If one list uses a whole month's Apollo plan (exports in the period = 500), the Apollo line is the full $59 (or $65), and
the list costs about $71 to $77, over the target. The target holds only when each month's exports serve two or more
lists. Trainee says which case applies once the owner records the real numbers.

## The 85% deliverable target

- Counted only over addresses Hunter checked.
- Only `valid` counts as deliverable.
- `accept_all` (a server that accepts any address, so the mailbox cannot be confirmed) and `webmail` are reported
  separately and never counted.
- Apollo's own "Email Status" column (Verified, Guessed, ...) is shown as Apollo's claim and never counted as a check.

Status: NOT_RUN. No real list has been checked.

## Apollo's export columns

Apollo's help center describes the export ("Export Contacts to a CSV",
https://knowledge.apollo.io/hc/en-us/articles/4409237712141-Export-Contacts-to-a-CSV). It says the included columns are
set under "Edit export CSV settings", and that exporting existing records does not enrich emails. Use CSV enrichment
first. It does not list the header names.

The mapping in `career_contacts.ts` is by header name, never by position. Header names are ASSUMED from Apollo export
files as they commonly appear:

- First Name, Last Name, Title, Company, Company Name for Emails, Email, Email Status
- Seniority, Departments, Person Linkedin Url, City, State, Country, Apollo Contact Id

The test fixture `tests/fixtures/wo-033/apollo-export.csv` uses these headers. "Person Linkedin Url" and every other URL
column are read past and never kept.

**Owner check:** export 5 rows from the real account and send the file. If a header differs, the mapping is one line.

## Terms of use for cold email

| Vendor | What their terms say about cold email | Label |
|---|---|---|
| Hunter | The Content Policy prohibits "sending unsolicited bulk commercial email using Hunter data" in violation of CAN-SPAM, CASL, the EU ePrivacy Directive or equivalent law. Hunter also sells its own cold-email tool, so one-to-one outreach that obeys the law is in scope. | SOURCED: https://hunter.io/transparency/content-policy |
| Apollo | Not read: the terms page could not be fetched here, and the search returned only its API terms (https://www.apollo.io/terms/api). The owner reads Apollo's Terms of Service and any acceptable-use policy before signing up. | NOT_RUN |
| Apollo and LinkedIn | LinkedIn removed Apollo's and Seamless.AI's company pages around 6 to 7 March 2025, without a public reason. Commentators tied it to Chrome extensions that pull data from LinkedIn profiles. Apollo's page was later restored. Trainee never uses Apollo's extension and never touches LinkedIn; it reads only the CSV the account holder exports. | ASSUMED: https://martech.org/a-pair-of-lead-gen-providers-have-disappeared-from-linkedin/, https://salesmotion.io/blog/linkedin-removed-apollo-brand-page-2025-alternatives |

## CAN-SPAM: what applies to one-to-one personal outreach

Source: the FTC's "CAN-SPAM Act: A Compliance Guide for Business",
https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business. SOURCED: read through search
excerpts, because the page could not be fetched from this session. This section is not legal advice.

**Scope**

- The Act covers a "commercial electronic mail message": any message "the primary purpose of which is the commercial
  advertisement or promotion of a commercial product or service".
- A message is commercial if a recipient reading the subject line would likely think it advertises something, or if
  its transactional or relationship content does not come first.
- The guide adds that the law makes no exception for business-to-business email.
- A single email can be covered; there is no bulk threshold.

**What Trainee says, and does not overclaim**

- A job seeker writing one person to ask about their work or for advice is not advertising a product or service.
  Most likely, that is outside the "commercial" category. Trainee says "most likely", never "exempt". The test is the
  message's primary purpose, and a person can write something that reads as promotion.
- The FTC reads the transactional and relationship exemptions narrowly. They are not the basis Trainee relies on.

**The Act's requirements for commercial mail, and what Trainee does anyway**

| Requirement | What Trainee does |
|---|---|
| Accurate header information | The message goes from the person's own Gmail, with their own name. Only To, Subject and the MIME headers are written; no Cc or Bcc, ever. |
| A subject line that is not deceptive | The person approves the exact subject. The fact-lock checks every name, number and claim in the subject and the body against confirmed facts and the recipient's row. |
| Identify the message as an ad | Not done, because it is not an ad. If the person turns outreach into selling something, this rule would apply, and Trainee does not handle that case. |
| A valid physical postal address | Not added. It is required only for commercial messages, and adding a student's home address to a networking email is a privacy harm. Said here so nobody assumes it is there. |
| A working way to opt out, honored within 10 business days | Every message ends with "If you'd rather not hear from me, reply stop and I won't write again." A "stop" or "unsubscribe" reply puts the address on the person's do-not-contact list at once (the next scheduled run), forever. The list is kept as a hash, so an erase of the career profile does not re-open the contact. |

**Penalties.** The FTC page gives up to $53,088 per violating email. Older copies of the guide say $16,000; the amount
is adjusted for inflation each year.

## Gmail's own rules

Google's sender guidelines (https://support.google.com/mail/answer/81126, SOURCED) say:

- **Senders of 5,000 or more messages a day:** must also set up SPF, DKIM and DMARC.
- **All senders:** must keep the spam rate reported in Postmaster Tools below 0.30%.

Trainee's caps are far below that tier, and they are what protect the person's address:

- 20 a day by default; the person may set up to 30, never more.
- 10 a day in the first week of sending.
- One message at a time, at least 90 seconds apart.
- One recipient per message.

## Not decided here

- **The Apollo plan:** monthly or annual, and how many seats.
- **The Hunter plan:** Starter covers about four 500-address lists a month.
- **Turning sending on** (`CAREER_OUTREACH_SEND=on`) and setting `HUNTER_API_KEY`. Both are the owner's, at deploy.
- **The 2026-10-13 send-disabled ruling** recorded in `packages/domain/124-career-outreach.js`. It still holds for that
  module. WO-033's send path is a separate rail that stays off until the owner flips the flag.
