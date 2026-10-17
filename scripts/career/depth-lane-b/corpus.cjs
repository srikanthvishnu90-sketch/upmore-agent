"use strict";
// Depth Lane B FRESH corpus (2026-10-16) — novel phrasings, never the exam
// set, never the audit's Lane C sentences (the three audit probes live in
// the replay guards instead, labeled as anchors). Bands: M1 clean,
// M2 typo'd/rambling, M3 multi-intent. Turn pass = not the fallback AND
// every `pass` regex matches the delivered text AND no `fail` regex does.
// Chain complete = every turn passes. Judged on the WORST band.
const FB = "I didn't catch that";
module.exports = [
  // ---------------- NEGOTIATION ----------------
  { id: "N1", family: "negotiation", band: "M1", turns: [
    { say: "I just got an offer from a SaaS company — $92k base, they need my answer by Friday", pass: ["offer", "92"], fail: [] },
    { say: "Can I get until Tuesday instead? I don't want to look difficult", pass: ["tuesday|extension|more time|deadline"], fail: [] },
    { say: "Write the email asking for that", pass: ["tuesday", "subject|dear|hello|hi |thank"], fail: [] },
    { say: "And if they say no to Tuesday, what's my counter on the base?", pass: ["counter", "92|base"], fail: [] },
    { say: "OK draft the counter too, keep it friendly", pass: ["counter|subject|dear|hello|thank", "92|95|96|98|100"], fail: [] },
  ]},
  { id: "N2", family: "negotiation", band: "M1", turns: [
    { say: "I have two offers now — one at 78k from a bank, one at 84k from an insurer. What math should I run?", pass: ["total|compar|side by side|both"], fail: [] },
    { say: "The bank one also has a $5k signing bonus, does that change the picture?", pass: ["signing|bonus|78|83|84"], fail: [] },
    { say: "Help me decline the insurer one gracefully", pass: ["decline|thank|insurer"], fail: [] },
  ]},
  { id: "N3", family: "negotiation", band: "M2", turns: [
    { say: "soo i got an offer its like 64k?? from a logistics co and theyr kinda rushing me, want an anser by thursday i think", pass: ["offer", "64"], fail: [] },
    { say: "can i ask for more tiem without it being weird", pass: ["extension|more time|deadline|thursday"], fail: [] },
    { say: "wright the email pls, the short one", pass: ["subject|dear|hello|hi |thank"], fail: [] },
  ]},
  { id: "N4", family: "negotiation", band: "M1", turns: [
    { say: "The recruiter just called — my offer expires in 48 hours, it's 110k, what do I do first?", pass: ["extension|deadline|first|110"], fail: [] },
    { say: "Draft the extension ask", pass: ["subject|dear|hello|thank", "extension|more time|48|two days"], fail: [] },
    { say: "While I wait on that, what's the counter strategy if they hold firm on 110?", pass: ["counter|strategy", "110"], fail: [] },
  ]},
  { id: "N5", family: "negotiation", band: "M3", turns: [
    { say: "I got an offer at 88k from a healthtech startup, answer by Monday — also, should I tell my current boss yet?", pass: ["offer", "88"], fail: [] },
    { say: "OK just the deadline part for now: write the extension email", pass: ["subject|dear|hello|thank", "monday|extension|more time"], fail: [] },
    { say: "Now the money part — is 88k low for this kind of role, and what would you counter at?", pass: ["counter", "88"], fail: ["typical range for|market rate is|average salary for"] },
  ]},
  { id: "N6", family: "negotiation", band: "M1", turns: [
    { say: "My offer is 95k base plus stock options — 4,000 shares over four years. What are the options actually worth?", pass: ["option|vesting|shares", "95|4,000|4000"], fail: ["the options are worth $|valued at $"] },
    { say: "What should I ask them about the grant before I sign?", pass: ["ask|strike|exercise|vesting|cliff"], fail: [] },
    { say: "Draft a reply asking for those details", pass: ["subject|dear|hello|thank", "grant|shares|vesting|strike"], fail: [] },
  ]},
  { id: "N7", family: "negotiation", band: "M2", turns: [
    { say: "recruiter asked what salary i expect before any offer lol, i panicked and said 70-80k. no offer yet", pass: ["expect|range|anchor|70"], fail: [] },
    { say: "they came back at 72k. can i still negotiate or did i cap myself", pass: ["negotiat|counter", "72"], fail: [] },
    { say: "what do i say on the call tomorow", pass: ["say|script|words|call"], fail: [] },
  ]},
  { id: "N8", family: "negotiation", band: "M3", turns: [
    { say: "Offer letter's here: base $120k, signing $10k, starts June 1, expires Wednesday. Also my lease ends in May lol", pass: ["120", "offer|letter"], fail: [] },
    { say: "Parse it properly — what's missing from the letter?", pass: ["missing|equity|bonus|benefit|start|expir"], fail: [] },
    { say: "Counter at 130 — draft it", pass: ["130", "subject|dear|counter|thank"], fail: [] },
  ]},
  // ---------------- CAREER OS ----------------
  { id: "C1", family: "career-os", band: "M1", turns: [
    { say: "I'm a junior accountant. I want to be a CFO one day — what should my next two moves be?", pass: ["cfo", "move|step|rung|next"], fail: [] },
    { say: "Which skills do I build first?", pass: ["skill"], fail: [] },
    { say: "Does the CPA matter on that path, and when should I get it?", pass: ["cpa"], fail: [] },
    { say: "What does the step after senior accountant look like?", pass: ["senior|controller|manager|fp&a|finance"], fail: [] },
  ]},
  { id: "C2", family: "career-os", band: "M1", turns: [
    { say: "I'm a customer support rep and I want to move into product management eventually", pass: ["product", "move|step|rung|path"], fail: [] },
    { say: "What's the rung between here and PM?", pass: ["rung|associate|apm|between|step"], fail: [] },
    { say: "What evidence should I be collecting in this job for that move?", pass: ["evidence|example|metric|record|work"], fail: [] },
  ]},
  { id: "C3", family: "career-os", band: "M2", turns: [
    { say: "been a bank teller 2 yrs, kinda stuck, wanna end up in corperate finance someday — wheres my next step?", pass: ["finance|step|move|path"], fail: [] },
    { say: "skills?? what do i learn first", pass: ["skill|learn|excel|model"], fail: [] },
    { say: "how long does each step usualy take", pass: ["year|month|typical|varies|depends"], fail: [] },
  ]},
  { id: "C4", family: "career-os", band: "M1", turns: [
    { say: "I'm an analyst — what's the ladder to associate actually made of?", pass: ["associate", "ladder|evidence|sponsor|step"], fail: [] },
    { say: "Log a win: I built the model the VP presented to the client", pass: ["win|log|added|record"], fail: [] },
    { say: "Show me my wins log", pass: ["model|win"], fail: [] },
  ]},
  { id: "C5", family: "career-os", band: "M3", turns: [
    { say: "I want a promotion this year and honestly my pay feels low for the market — what am I worth, and what's the plan?", pass: ["promotion|plan|worth"], fail: ["you are worth $|market rate is $"] },
    { say: "Start the plan — what's move one?", pass: ["move|step|first"], fail: [] },
  ]},
  { id: "C6", family: "career-os", band: "M1", turns: [
    { say: "I'm a nurse and I'm thinking about moving into hospital administration one day", pass: ["admin|path|move|step"], fail: [] },
    { say: "What's the first move?", pass: ["first|move|step"], fail: [] },
    { say: "Any credentials that actually matter on that path?", pass: ["credential|degree|certif|mha|license|qualification"], fail: [] },
  ]},
  { id: "C7", family: "career-os", band: "M2", turns: [
    { say: "so I'm in retail management right now, it's fine but I keep thinking about HR, like eventually running people ops somewhere — is that even a real path from here?", pass: ["path|hr|people", "step|move|rung"], fail: [] },
    { say: "ok what's first then", pass: ["first|step|move"], fail: [] },
  ]},
  { id: "C8", family: "career-os", band: "M1", turns: [
    { say: "Honestly I'm stuck and thinking of quitting — how does anyone get from analyst to associate around here?", pass: ["associate", "move|evidence|step"], fail: [] },
    { say: "Price the quit option for me — when does leaving actually beat staying?", pass: ["quit|leav|stay"], fail: [] },
    { say: "OK, staying one cycle — what's the plan?", pass: ["plan|move|step|cycle"], fail: [] },
  ]},
  // ---------------- INTERVIEW PREP ----------------
  { id: "P-A", family: "prep", band: "M1", turns: [
    { say: "I have a consulting interview next week — help me practice cases", pass: ["case|practice|consult"], fail: [FB] },
    { say: "Give me a case", pass: ["case|market|profit|revenue|cost|client"], fail: ["Tell me about yourself"] },
    { say: "harder one, and I'm weakest on profitability cases", pass: ["profit"], fail: ["Tell me about yourself"] },
    { say: "One more — market entry this time", pass: ["market|entry|expand|launch"], fail: ["Tell me about yourself"] },
  ]},
  { id: "P-B", family: "prep", band: "M1", turns: [
    { say: "Prep me for a banking interview — technicals", pass: ["technical|dcf|statement|lbo|question"], fail: [] },
    { say: "Hit me with the DCF question", pass: ["dcf"], fail: [] },
    { say: "What is the model answer supposed to hit?", pass: ["cash flow|discount|terminal|projection|free cash"], fail: [] },
    { say: "Now the three statements one", pass: ["statement"], fail: [] },
    { say: "The income statement, balance sheet, and cash flow statement — net income flows into retained earnings and the cash flow statement starts from net income", pass: ["correct|right|score|links|retained|cash"], fail: [] },
  ]},
  { id: "P-C", family: "prep", band: "M1", turns: [
    { say: "I have a data analyst interview Thursday — drill me", pass: ["question|sql|data|metric"], fail: [] },
    { say: "Another one", pass: ["question|sql|data|metric|join|query"], fail: ["Tell me about yourself"] },
    { say: "I'm weakest on SQL — focus there", pass: ["sql|join|query|select"], fail: [] },
    { say: "One more", pass: ["sql|join|query|select|question"], fail: [] },
  ]},
  { id: "P-D", family: "prep", band: "M1", turns: [
    { say: "Law firm interview coming up — what do they ask?", pass: ["question|law|firm"], fail: [] },
    { say: "Give me a question", pass: ["question|client|case|law|court|matter"], fail: ["Tell me about yourself"] },
    { say: "Another", pass: ["question|client|case|law|court|matter"], fail: ["Tell me about yourself"] },
  ]},
  { id: "P-E", family: "prep", band: "M2", turns: [
    { say: "med school interview nxt week, kinda nervous — can we practise?", pass: ["question|practice|medical|patient|mmi"], fail: [] },
    { say: "hit me with a question", pass: ["question|patient|care|medical|scenario|ethical"], fail: ["Tell me about yourself"] },
    { say: "an ethics one pls", pass: ["ethic|patient|dilemma|consent|confidential"], fail: [] },
  ]},
  { id: "P-F", family: "prep", band: "M1", turns: [
    { say: "Quant trading interview — drill me on probability", pass: ["probability|coin|dice|expected|flip"], fail: [] },
    { say: "Another", pass: ["probability|coin|dice|expected|flip|market"], fail: ["Tell me about yourself"] },
    { say: "A market-making one", pass: ["market|bid|ask|quote"], fail: [] },
  ]},
  { id: "P-G", family: "prep", band: "M3", turns: [
    { say: "I have a Netflix SWE interview Friday — prep me", pass: ["netflix|question|swe|software|coding"], fail: [] },
    { say: "Walk me through the three financial statements", pass: ["income statement", "balance sheet"], fail: ["linked list", "url shortener", "hash map"] },
    { say: "Back to Netflix — give me a coding question", pass: ["array|linked list|hash|design|coding|string|tree"], fail: [] },
  ]},
  { id: "P-H", family: "prep", band: "M1", turns: [
    { say: "PM interview loop next week — help me prep", pass: ["product|question|pm"], fail: [] },
    { say: "Give me a product sense question", pass: ["product"], fail: ["Tell me about yourself"] },
    { say: "Another one — execution this time", pass: ["metric|execution|drop|launch|priorit"], fail: ["Tell me about yourself"] },
  ]},
];
