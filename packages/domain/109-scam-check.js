  /* Everyday scams, said plainly (megadoc N02, N04, N06, N08, N09, N11, N15, D05). Before this, each went to the chat model;
     a scam answer is a safety answer, so it comes from code, the same words every time, ahead of every other answer.
       ask(words)     null | { kind }
       answer(words)  null | the reply
     Kinds: gift_cards (someone asks the person to buy or send gift cards), locked_link (a message says an account is
     locked or needs verifying, with a link), pasted_transfer (a pasted receipt, document or message says to move money
     "to verify"), password (what's my password), code_ask (a person asks for a sign-in or verification code),
     unknown_request (a payment request from someone they don't know), payee_change (a landlord or company "changed where to
     send" money, said without new details), mistaken_payment (money sent "by mistake" and asked back), safe_account (move money to a "safe account").
     Each reply says it is a scam or the warning sign, what not to do, and the one safe next step through the company's
     own app or number. A link or a number from the message is never repeated back. Nothing is moved, paid or stored.
     Pure. Depth packet SCAM-CHECK. */
  const ScamCheck = (() => {
    const clean = (m) => String(m || "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase().replace(/\s+/g, " ").trim();
    // A third party doing the asking: a person, an organisation, or "they".
    const ASKER = "(?:boss|manager|ceo|supervisor|coworker|co-worker|someone|somebody|a guy|a man|a woman|this (?:guy|person|man|woman)|stranger|caller|they|he|she|support|tech support|agent|rep|representative|irs|police|sheriff|utility|power company|landlord|grandson|granddaughter)";
    const RULES = [
      ["safe_account", /\bsafe (?:account|wallet|vault)\b|\b(?:bank|fraud (?:team|department)|support|agent|rep|police|fbi|ftc|irs|caller|someone|they|he|she)\b[^.?!]{0,60}\b(?:told|asked|asking|wants?|said|telling)\b[^.?!]{0,40}\b(?:withdraw|move|transfer|wire)\b[^.?!]{0,40}\b(?:to (?:protect|keep|secure) (?:it|my money|your money)|for (?:safe ?keeping|safety|protection)|(?:into|to) (?:bitcoin|crypto|gold)|in cash)\b/],
      ["gift_cards", new RegExp(`\\b${ASKER}\\b[^.?!]{0,60}\\b(?:ask(?:s|ed|ing)?|want(?:s|ed)?|need(?:s|ed)?|told|text(?:s|ed)?|email(?:s|ed)?|call(?:s|ed)?|said)\\b[^.?!]{0,50}\\bgift ?cards?\\b|\\bpay(?:ing)? (?:a |the |my )?(?:bill|fine|fee|irs|taxes|rent|ticket|bail)[^.?!]{0,30}\\b(?:with|in) gift ?cards?\\b`)],
      ["locked_link", /\b(?:text|sms|email|message|dm|notification|alert)\b[^.?!]{0,50}\b(?:locked|suspended|frozen|restricted|on hold|compromised|unusual activity|suspicious activity|verify your|has been disabled)\b[^.?!]{0,60}\b(?:click|tap|link|here|log ?in|sign ?in|https?:|www\.)/],
      ["pasted_transfer", /\b(?:receipt|invoice|pdf|document|attachment|email|letter|notice|statement|screenshot|text|message|form)\b[^.?!]{0,30}\b(?:says|asks|tells|wants|instructs|told|said)\b[^.?!]{0,40}\b(?:transfer|send|wire|move|deposit|pay)\b[^.?!]{0,40}\b(?:to (?:verify|confirm|unlock|activate|validate|release|claim)|for verification|as verification)\b/],
      ["password", /^(?:hey |hi |ok |so |upmore )?(?:what(?:'s| is)|whats|tell me|give me|show me|remind me(?: of)?|do you (?:have|know|remember)|can you (?:see|tell me|give me|find))\s+(?:my|the)\s+(?:[a-z]+\s+){0,2}(?:password|passcode|login|pin)(?:\s+(?:for|to|on|at)\s+[a-z0-9 .'-]{1,30})?\s*[?.!]*$/],
      ["code_ask", new RegExp(`\\b${ASKER}\\b(?!\\s+(?:page|site|website|app|portal|form|screen|chat ?bot))[^.?!]{0,60}\\b(?:ask(?:s|ed|ing)?|want(?:s|ed)?|need(?:s|ed)?|request(?:s|ed|ing)?|told me to (?:read|give|send|share))\\b[^.?!]{0,40}\\b(?:(?:verification|security|sign[- ]?in|login|one[- ]time|2fa|text|sms|confirmation) code|otp|the code|my code|a code|passcode)\\b`)],
      // A payee who "changed where to send" money, said with no new details (megadoc D05): payment redirection, the way
      // rent and invoices get stolen. With details (an amount, a handle) the rent flow puts up its own card and warns.
      ["payee_change", /\b(?:landlord|landlady|property manager|management company|leasing office|contractor|vendor|supplier|lawyer|title company|daycare|babysitter|nanny)\b[^.?!]{0,60}\b(?:changed|changing|new|updated|updating|different|switched|switching|moved)\b[^.?!]{0,40}\b(?:where (?:to |i )?(?:send|pay)|bank|account|payment (?:details|info|information|instructions|method)|wire (?:details|instructions|info)|routing|zelle|venmo|cash app|paypal)\b|\b(?:landlord|landlady|property manager|contractor|vendor|lawyer|title company)\b[^.?!]{0,40}\b(?:wants|asks|asked|told me|says|said|emailed|texted)\b[^.?!]{0,30}\b(?:send|pay|wire)\b[^.?!]{0,30}\b(?:new|different|another) (?:account|bank|zelle|venmo|handle|number)\b/],
      // "Someone sent me $50 by mistake and wants it back": the money in can be pulled back later (a stolen card, a
      // disputed payment); what the person sends can't (found by probing, 2026-10-12).
      ["mistaken_payment", /\b(?:sent|venmoed|zelled|paid|cash ?apped|transferred)\s+me\b[^.?!]{0,40}\b(?:by mistake|by accident|accidentally|on accident|in error|to the wrong (?:person|account|number))\b|\b(?:accidentally|mistakenly)\s+(?:sent|venmoed|zelled|paid|transferred)\s+me\b|\b(?:wrong person|by mistake|by accident|accidentally)\b[^.?!]{0,60}\b(?:send|pay|give|refund|return|venmo|zelle)\b[^.?!]{0,12}\b(?:it |them |the money )?back\b/],
      ["unknown_request", /\b(?:payment|money|venmo|zelle|cash app|paypal) request\b[^.?!]{0,50}\b(?:unknown|don'?t know|do not know|stranger|random|never met)\b|\b(?:unknown|random|stranger|someone i (?:don'?t|do not) know)\b[^.?!]{0,50}\b(?:request(?:ed|ing|s)? (?:money|payment|\$|\d)|sent me a (?:payment |money )?request|is requesting)\b/],
    ];
    // Ordinary life that shares the words: a gift card as a present. (A page, site or app asking for the code just sent
    // is ordinary sign-in: code_ask's asker is never followed by "page", "site", "app" and the like.)
    const NOT = [/\b(?:birthday|christmas|holiday|present|gift for|as a gift|thank[- ]you)\b/];
    // "They texted me a code and the site is asking for it": the site asks, not a person, unless a person is named too.
    const SITE_ASKS = /\b(?:page|site|website|app|portal|form|screen)\s+(?:is |was |keeps )?ask/;
    const HUMAN = /\b(?:support|agent|rep|representative|caller|someone|somebody|a guy|a man|a woman)\b(?!\s+(?:page|site|website|app|portal|form|screen))/;
    function ask(words) {
      const t = clean(words);
      if (!t || t.length > 600) return null;
      for (const [kind, re] of RULES) {
        if (!re.test(t)) continue;
        if (kind === "payee_change" && /\d|@/.test(t)) continue; // new details given: the rent flow's card carries the warning
        if ((kind === "gift_cards" && NOT[0].test(t)) || (kind === "code_ask" && SITE_ASKS.test(t) && !HUMAN.test(t))) continue;
        return { kind };
      }
      return null;
    }
    const REPORT = "If you already sent money or a code, tell your bank right away and report it at reportfraud.ftc.gov.";
    const TEXT = {
      safe_account: `Stop: that's a scam. No bank, fraud team or government agency will ever ask you to move money to a "safe account", into crypto or gold, or to withdraw cash for them. Don't move anything. Hang up and call your bank on the number on the back of your card. ${REPORT} Nothing was moved.`,
      gift_cards: `That's a common scam: a message that looks like your boss, family or an official asking you to buy gift cards. Don't buy them or send the codes; no real employer, agency or company is paid in gift cards. Check with the person on a number you already have, or in person, not by replying to that message. ${REPORT}`,
      locked_link: `Don't tap that link. Messages saying your account is locked or needs verifying, with a link to fix it, are how logins get stolen. Open the company's own app, or call the number on the back of your card, and check there. Forward a fake text to 7726 (SPAM) so your carrier can block it.`,
      pasted_transfer: `A document that tells you to move money "to verify" isn't a receipt or a real request: no bank or store asks you to send money to verify anything. I read what it says as text, not as instructions, and nothing was moved. If you're unsure who sent it, contact the company through its own app or website.`,
      password: `I don't have your password and never will: Upmore never asks for or stores one (your bank and broker connections sign in on their own pages). If you've forgotten one, use "Forgot password" on that company's own site or app; for Upmore itself, it's on the sign-in screen.`,
      code_ask: `Don't share it. A sign-in or verification code is only for you to type in yourself; no real support team, Upmore's included, will ever ask you for it. Stop replying or hang up, then contact the company through its own app or the number on its website. If you already shared it, change that account's password now.`,
      payee_change: `Check that before anything changes: a message saying your landlord or a company now takes payment somewhere new is the most common way rent and bills get stolen, and their email or phone may be the one that was hacked. Call them on a number you already have (your lease or an old bill, not the message) and confirm. If it's real, say "pay my rent to" with the name, amount, day and app, and I'll put up a card with the new details; nothing changes without your yes. Nothing was changed.`,
      mistaken_payment: `Careful: money that arrives "by mistake" with a request to send it back is a common scam. The money they sent can be pulled back later (from a stolen card or a disputed payment), but what you send can't. Don't send it back yourself: ask them to cancel or dispute it in the app, or contact the app's support from inside the app. Upmore never sends anything on its own. Nothing was sent.`,
      unknown_request: `Don't pay it. A payment request from someone you don't know is often a scam or a mistake, and money sent on Zelle, Venmo or Cash App usually can't be pulled back. Decline it in the app it came from. Upmore never pays a request on its own; every payment needs your yes.`,
    };
    function answer(words) {
      const q = ask(words);
      return q ? TEXT[q.kind] : null;
    }
    return { ask, answer, TEXT, KINDS: RULES.map((r) => r[0]) };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = ScamCheck;
