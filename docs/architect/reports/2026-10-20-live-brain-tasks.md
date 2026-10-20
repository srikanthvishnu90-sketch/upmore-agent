# The live brain, prompted with the jobs Trainee is hired for (2026-10-20)

Tier 2: the deployed commit 4b4e7981 (agent-chat v242), its real chain (120, 130, 142, 141 inside 143) through `career_host.js`, run with node. No database: an empty posting pool and no stored account, as for a new person. Driver: one fresh thread, the messages in order. Nothing was sent anywhere.

```
U: I applied to the Account Executive role at Klaviyo yesterday 
A: Noted — you already applied to that role manually, so I will not prepare or submit a duplicate application for it.
I recorded the manual application against this role, so nothing here can double-apply you. Say 'track it' and I will follow this application and report its status. 
   [intent intent_prior_application ]
   tracker: [{"company":"Klaviyo yesterday","role":"Account Executive","stage":"applied"}]
U: what's the status of my applications? 
A: Klaviyo yesterday: at the applied stage.
Applied 2026-10-19 — Account Executive, 1 day on record. Last event on the row: applied (2026-10-19). Tell me if anything moved and I will update the row from your report. 
   [intent tracking_status ]
   tracker: [{"company":"Klaviyo yesterday","role":"Account Executive","stage":"applied"}]
U: apply to the first two 
A: I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there. 
   [intent null ]
   tracker: [{"company":"Klaviyo yesterday","role":"Account Executive","stage":"applied"}]
U: apply me to 25 data analyst jobs today 
A: I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there. 
   [intent null ]
   tracker: [{"company":"Klaviyo yesterday","role":"Account Executive","stage":"applied"}]
U: submit 25 applications for me to software engineer roles 
A: I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there. 
   [intent null ]
   tracker: [{"company":"Klaviyo yesterday","role":"Account Executive","stage":"applied"}]
U: write a short note to a recruiter at Stripe about the data analyst role 
A: I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there. 
   [intent null ]
   tracker: [{"company":"Klaviyo yesterday","role":"Account Executive","stage":"applied"}]
U: who should I reach out to at Datadog for a referral? 
A: The Datadog file — Software Engineering (SWE), entry.
The bar: High, centralized bar: practical coding depth plus system design and a behavioral round that also probes past technical work. Entry routes: 3 on file — the front door is Direct application to an open SWE role on the official careers site 
   [intent company_intel ]
   tracker: [{"company":"Klaviyo yesterday","role":"Account Executive","stage":"applied"}]
U: watch for new product manager roles in Austin, max 2 texts a day 
A: I can set that watch up — I need your profile on file first.
A watch matches new postings against your confirmed facts and interests; with no profile there is nothing honest to match against, and a watch on no facts would fire on everything or nothing. Tell me about yourself first — school, class ye 
   [intent career_watch_create ]
   tracker: [{"company":"Klaviyo yesterday","role":"Account Executive","stage":"applied"}]
U: network for me with people at Notion 
A: Building the list now: investment bankers — sized by what the sources yield, not by a number invented here.
You named no firms, so the plan proposes a starting set instead of choosing for you: the bulge bracket set — Goldman Sachs, Morgan Stanley, JPMorgan, Bank of America, Citi, and 4 more — held a 
   [intent outreach_clarification ]
   tracker: [{"company":"Klaviyo yesterday","role":"Account Executive","stage":"applied"}]
```

## Verdict

- The live brain cannot take any of the core jobs:
  - mass applying ("I didn't catch that", 3 of 3 wordings);
  - a recruiter note ("I didn't catch that");
  - a referral (a company file instead);
  - networking at a named company (a list of "investment bankers").
- It records a reported application with the company "Klaviyo yesterday".
- The same picture in numbers:
  - D-008 eval: router 5/50 (10%) official and 7/38 (18%) held-out;
  - live-shelf task battery (WO-065, CI run 39460746482): router 1/15.
