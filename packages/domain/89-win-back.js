  /* Win-back watch (owner Methods 3 M3-SUBS-09; overnight D4). After a person cancels a subscription, the service often
     emails an offer to come back. The person pastes that email; this reads it and shows, side by side: whether it really
     came from the service (the sender's domain against the service's domain on file, from the researched cancel catalog,
     supabase/functions/agent-exec/merchant-catalog.ts), the offer exactly as the email states it (price, length, the
     price after, the end date, quoted with "per the email you pasted, dated X"), and the regular price it compares to,
     which is the person's own last charge for that service before they cancelled (posted card rows, with the date).
     Nothing is invented: a price or date the email doesn't state is said to be missing, never filled in; several prices
     the email states are listed, never picked between. Resubscribing is the person's call: Upmore never signs anyone up,
     follows no link in the email, and says so. Pasted text is data: only numbers and dates matched by fixed patterns are
     repeated from it, never its words, links or addresses; service names are Upmore's own. Pure; tests in
     tests/win-back.test.cjs, depth packet WINBACK (tests/depth-WINBACK.test.cjs).
     Input to answer(): { message, today: "YYYY-MM-DD", transactions: chat rows, cancellations: cancel cases from the
     cancel flow's saved state (68-agent-cancel.js: { merchant, name, state, cancelled_at, claim, reference }) or null
     when they couldn't be read, domains: { catalog key: "hulu.com" } }. */
  const WinBack = (() => {
    const DAY = 86400000;
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const MON_NAME = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const money = c => "$" + (Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const label = raw => (typeof MerchantLabel !== "undefined" ? MerchantLabel : require("./32-merchant-label.js")).safe(raw);
    const utc = d => Date.parse(`${d}T00:00:00Z`);
    const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / DAY);
    const validYmd = s => ISO.test(String(s || "")) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
    const ymd = ms => new Date(ms).toISOString().slice(0, 10);

    // The services a win-back email can be from: Upmore's name for each, the cancel catalog key its domain is filed
    // under, how the email names it, and how its charge reads on a card. A service with no catalog domain is never
    // confirmed as the sender.
    const SERVICES = Object.freeze([
      { key: "netflix", name: "Netflix", words: /\bnetflix\b/i, row: /\bnetflix\b/i },
      { key: "hulu", name: "Hulu", words: /\bhulu\b/i, row: /\bhulu\b/i },
      { key: "disney_plus", name: "Disney+", words: /\bdisney\s*(?:\+|plus)|\bdisneyplus\b/i, row: /\bdisney\s*(?:\+|plus)|\bdisneyplus\b/i },
      { key: "max", name: "Max", words: /\bhbo\s*max\b|\bhbomax\b|\bmax\.com\b/i, row: /\bhbo\s*max\b|\bhbomax\b|\bmax\.com\b/i },
      { key: "peacock", name: "Peacock", words: /\bpeacock\b/i, row: /\bpeacock\b/i },
      { key: "paramount_plus", name: "Paramount+", words: /\bparamount\s*(?:\+|plus)|\bparamountplus\b/i, row: /\bparamount\s*(?:\+|plus)|\bparamountplus\b/i },
      { key: "spotify", name: "Spotify", words: /\bspotify\b/i, row: /\bspotify\b/i },
      { key: "youtube_premium", name: "YouTube Premium", words: /\byoutube\s*premium\b/i, row: /\byoutube\s*(?:premium|prem)\b|\byoutubepremium\b/i },
      { key: "audible", name: "Audible", words: /\baudible\b/i, row: /\baudible\b/i },
      { key: "amazon_prime", name: "Amazon Prime", words: /\b(?:amazon|amzn)\s*prime\b(?!\s*day)|\bprime\s*membership\b/i, row: /\b(?:amazon|amzn)\s*prime\b|\bprime\s*membership\b/i },
    ]);

    // What makes a message a win-back email or a win-back question. An offer needs the service, a come-back signal and
    // a price, a percent off or "free"; a question about win-back offers needs only the words.
    const COME_BACK = /\b(?:come back|coming back|welcome back|we miss you|miss you|wants? (?:me|you|us) back|rejoin|re-join|resubscribe|re-subscribe|restart (?:your |my )?(?:membership|subscription|plan)|win[- ]?back|former (?:member|subscriber)|returning (?:member|subscriber)|retention (?:offer|deal|discount))\b/i;
    const CANCELLED_OFFER = /\bcancell?(?:ed|ing)\b[^]{0,200}\b(?:offer(?:ing|ed|s)?|deal|promo(?:tion)?|discount)\b|\b(?:offer(?:ing|ed|s)?|deal|promo(?:tion)?|discount)\b[^]{0,200}\b(?:since|after|because) (?:i|you) cancell?(?:ed)?\b/i;
    const PRICED = /\$\s?\d|\b\d{1,4}\.\d{2}\s*(?:\/|per|a|an)\s*(?:mo|month|yr|year)\b|\b\d{1,2}\s?%\s?off\b|\bfree\b/i;
    const ASK = /\b(?:win[- ]?back (?:offer|deal|email|discount)s?|come[- ]?back (?:offer|deal|discount|price)s?|offers? to (?:come back|rejoin|resubscribe)|retention (?:offer|email|deal|discount)s? (?:after|from|when))\b/i;
    // An instruction the cancel flow owns (cancel, unsubscribe, undo) is never this answer's. "Resubscribe me at $2.99" is
    // answered here, and the answer is that the person does it.
    const ACTION = /^\s*(?:hey\s+|ok(?:ay)?\s+|please\s+|pls\s+|can you\s+|could you\s+)?(?:cancel|unsubscribe|undo)\b/i;

    // A domain as written, or null when it cannot be an exact ASCII domain (punycode or a non-ASCII lookalike).
    function cleanHost(h) {
      const s = String(h || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/:\d+$/, "").replace(/\.$/, "");
      if (!s || /[^a-z0-9.-]/.test(s) || /(?:^|\.)xn--/.test(s)) return null;
      return s;
    }
    const onDomain = (host, d) => !!host && !!d && (host === d || host.endsWith("." + d));
    // Only "From:", "Sender:" and "Reply-To:" lines count as senders; in a forwarded message only what follows the last
    // forward marker is the offer (the person who forwarded it is not the sender).
    const FORWARD = /-{2,}\s*(?:forwarded message|original message)\s*-{2,}|begin forwarded message:/i;
    const forwarded = text => { const parts = String(text).split(FORWARD); return parts[parts.length - 1]; };
    function senders(text) {
      const out = [];
      for (const m of forwarded(text).matchAll(/(?:^|[\s>])(?:from|sender|reply-to)\s*:\s*(.+)$/gim)) {
        const addr = m[1].match(/<\s*[^<>@\s]+@([^<>\s]+)\s*>/) || m[1].match(/[^\s<>"'@]+@([^\s<>"',;]+)/);
        out.push({ host: addr ? cleanHost(addr[1].replace(/[>.,;]+$/, "")) : null });
      }
      return out;
    }

    // A day as the email writes it. With a year it is a date; without one it is quoted as written ("Oct 31"), never
    // given a year.
    const DATE_RE = String.raw`(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?!\d)(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s+\d{4})?)`;
    function readDay(s) {
      const t = String(s || "").trim();
      let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return validYmd(m[0]) ? { iso: m[0], text: m[0] } : null;
      m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
      if (m) {
        if (!m[3]) return +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31 ? { iso: null, text: `${MON_NAME[+m[1] - 1]} ${+m[2]} (no year given)` } : null;
        const y = m[3].length === 2 ? `20${m[3]}` : m[3], v = `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
        return validYmd(v) ? { iso: v, text: v } : null;
      }
      m = t.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i) || (() => { const x = t.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s+(\d{4}))?/i); return x ? [x[0], x[2], x[1], x[3]] : null; })();
      if (!m) return null;
      const mi = MON.indexOf(m[1].toLowerCase().slice(0, 3)), d = +m[2];
      if (mi < 0 || d < 1 || d > 31) return null;
      if (!m[3]) return { iso: null, text: `${MON_NAME[mi]} ${d} (no year given)` };
      const v = `${m[3]}-${String(mi + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      return validYmd(v) ? { iso: v, text: v } : null;
    }
    const SENT = /^[ \t>]*(?:date|sent)\s*:\s*(.+)$/im;
    const ENDS = new RegExp(String.raw`\b(?:ends?|ending|expires?|expiring|valid (?:through|thru|until|till)|good (?:through|thru|until|till)|available (?:through|thru|until|till)|redeem (?:it )?(?:by|before)|claim (?:it )?(?:by|before)|(?:sign up|join|rejoin|resubscribe|subscribe) (?:by|before)|(?:offer|deal|promo(?:tion)?|discount|price) (?:good |valid )?(?:until|through|thru|till))\s*(?:on\s+)?:?\s*${DATE_RE}`, "i");

    // Numbers the email states, each with what kind it is. An amount right after "then", "after that" or "renews at" is
    // the price after the promo; after "regularly" or "was" it is the email's regular price; "save $5" or "$5 off" is a
    // discount, not a price; after "I pay" or "I used to pay" it is the person's own words, left out (their charges speak).
    const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
    const num = s => (WORD_NUM[String(s).toLowerCase()] || Number(s));
    const AFTER = /\b(?:then|after that|afterwards?|thereafter|after (?:the |your )?(?:promo(?:tion)?|offer|intro(?:ductory)?|discount)(?: period| ends)?|after (?:\d{1,2}|one|two|three|four|five|six|twelve) (?:months?|weeks?|days?)|renews? (?:at|for))\s*(?:it'?s\s+|is\s+|of\s+|at\s+|just\s+)?:?\s*$/i;
    // "regularly $17.99", "(reg. $17.99)", "was $17.99": the email's own regular price, quoted as the email's.
    const REGULAR = /\b(?:regular(?:ly)?(?: price)?|reg\.?|normally|usually|standard (?:price|rate)|full price|was|instead of|compared to|down from|originally|list price)\s*(?:it'?s\s+|is\s+|of\s+|at\s+)?:?\s*$/i;
    const PAID = /\b(?:used to pay|i(?:'m| am| was)? pay(?:ing)?|i paid|(?:i |we )?currently pay(?:ing)?|we pay|we paid)\s*(?:about\s+|around\s+|like\s+)?$/i;
    const SAVE = /\b(?:save|saving|savings of|discount of|take)\s*(?:up to\s+)?$/i;
    const PER = { mo: "month", month: "month", monthly: "month", yr: "year", year: "year", yearly: "year", annually: "year", annual: "year", wk: "week", week: "week", weekly: "week" };
    function offerTerms(text) {
      const t = forwarded(text).slice(0, 20000);
      const prices = [];
      // "$2.99", or a bare "2.99" only when a period follows it ("1.99 a month"): a bare number alone is never a price.
      for (const m of t.matchAll(/(?:\$\s?(\d{1,4}(?:,\d{3})*(?:\.\d{2})?)|(?<![\d.,$\/])(\d{1,4}\.\d{2})(?=\s*(?:\/|per|a|an|each)\s*(?:mo|month|yr|year|wk|week)\b))(?!\d)(\s*(?:\/|per|a|an|each)\s*(mo|month|yr|year|wk|week)\b|\s*(monthly|yearly|annually|weekly)\b)?(\s*off\b)?/gi)) {
        const cents = Math.round(Number((m[1] || m[2]).replace(/,/g, "")) * 100);
        const before = t.slice(Math.max(0, m.index - 40), m.index).split(/[!?\n$]|\.(?=\s+[A-Z])/).pop();
        const per = PER[String(m[4] || m[5] || "").toLowerCase()] || null;
        const kind = m[6] || SAVE.test(before) ? "discount" : AFTER.test(before) ? "after" : REGULAR.test(before) ? "regular" : "offer";
        if (PAID.test(before)) continue;
        prices.push({ cents, per, kind });
      }
      const pct = [...new Set([...t.matchAll(/\b(\d{1,2})\s?%\s?(?:off|discount)\b/gi)].map(m => +m[1]))];
      const freeM = t.match(/\b(\d{1,2}|one|two|three|four|five|six|twelve)\s+(months?|weeks?|days?)\s+(?:free|for free|on us)\b|\bfree for (?:the first |your first )?(\d{1,2}|one|two|three|four|five|six|twelve)\s+(months?|weeks?|days?)\b/i);
      const free = freeM ? `${num(freeM[1] || freeM[3])} ${String(freeM[2] || freeM[4]).toLowerCase().replace(/s$/, "")}${num(freeM[1] || freeM[3]) === 1 ? "" : "s"} free` : null;
      const durM = t.match(/\bfor (?:your |the )?(?:first |next )?(\d{1,2}|one|two|three|four|five|six|twelve)\s+(months?|weeks?|days?|years?)\b/i) || t.match(/\b(\d{1,2}|one|two|three|four|five|six|twelve)\s+(months?|weeks?|years?)\s+(?:for|at)\s+(?:just\s+|only\s+)?\$/i);
      const duration = durM ? { n: num(durM[1]), unit: String(durM[2]).toLowerCase().replace(/s$/, "") } : null;
      const endM = ENDS.exec(t);
      const ends = endM ? readDay(endM[1]) : null;
      const sentM = SENT.exec(t);
      const dated = sentM ? readDay((sentM[1].match(new RegExp(DATE_RE, "i")) || [])[1]) : null;
      const asksSecret = /\bpass(?:word|code)s?\b|\bone[- ]time (?:code|passcode)\b|\bverification codes?\b|\bcard number\b|\bCVV\b|\bsocial security\b|\bSSN\b|\bbank account number\b/i.test(t);
      return { prices, pct, free, duration, ends, dated, asksSecret };
    }

    // Which service the message is about: one whose domain the sender is on, else the only one named, else the first
    // named in the text.
    function serviceFor(text, domains) {
      const from = senders(text);
      const byDomain = SERVICES.filter(s => domains && domains[s.key] && from.some(f => onDomain(f.host, domains[s.key])));
      if (byDomain.length === 1) return byDomain[0];
      const named = SERVICES.map(s => ({ s, i: String(text).search(s.words) })).filter(x => x.i >= 0).sort((a, b) => a.i - b.i);
      return named.length ? named[0].s : null;
    }

    // "offer" (a pasted offer to read), "ask" (a question about win-back offers, nothing pasted), or null.
    function kind(message, domains) {
      const m = String(message || "");
      if (!m.trim() || ACTION.test(m)) return null;
      const svc = serviceFor(m, domains || {});
      if (svc && (COME_BACK.test(m) || CANCELLED_OFFER.test(m)) && PRICED.test(m)) return "offer";
      if (ASK.test(m) || (/\bwin[- ]?back\b/i.test(m) && /\b(?:offer|deal|email|discount|watch|wait)\w*\b/i.test(m))) return "ask";
      return null;
    }

    // The person's cancellation of this service: a case the cancel flow recorded as cancelled (or accepted, or confirmed
    // from the statement), with its day.
    function cancellationOf(svc, cancellations) {
      const done = (cancellations || []).filter(c => c && ["cancelled", "verified", "accepted"].includes(c.state) && (svc.row.test(String(c.name || "")) || svc.row.test(String(c.merchant || ""))));
      const dated = done.map(c => ({ c, day: Number.isFinite(c.cancelled_at) ? ymd(c.cancelled_at) : validYmd(c.claim && c.claim.created_at) ? c.claim.created_at : null })).filter(x => x.day);
      dated.sort((a, b) => (a.day < b.day ? -1 : 1));
      return dated.length ? dated[dated.length - 1] : null;
    }

    // The person's own charges for the service: posted, money out, in dollars, on or before today.
    function chargesOf(svc, rows, today) {
      return (rows || []).filter(r => r && validYmd(r.posted_on) && !r.is_pending && Number.isSafeInteger(r.amount_cents) && r.amount_cents < 0 && (!r.currency || r.currency === "USD") && r.posted_on <= today && svc.row.test(label(r.merchant_raw)))
        .sort((a, b) => (a.posted_on < b.posted_on ? -1 : a.posted_on > b.posted_on ? 1 : 0));
    }
    // How often the person was billed: monthly when the last two charges are 25 to 36 days apart, yearly at 330 to 400.
    function cadence(list) {
      if (list.length < 2) return null;
      const gap = daysBetween(list[list.length - 2].posted_on, list[list.length - 1].posted_on);
      return gap >= 25 && gap <= 36 ? "month" : gap >= 330 && gap <= 400 ? "year" : null;
    }
    const perText = p => (p ? ` a ${p}` : "");

    function info(svc, domains) {
      const d = svc && domains && domains[svc.key];
      return [`I can't read your email, so I can't watch your inbox for ${svc ? `a ${svc.name} offer` : "offers"}. When one comes, paste the whole email here, with its From: and Date: lines, and I'll check the sender${d ? ` against ${d}` : ""}, show the offer price next to what you last paid from your own charges, and the date the offer ends.`,
        "Resubscribing is your call; I won't sign you up."].join("\n");
    }

    function answer(input) {
      const o = input || {}, message = String(o.message || ""), today = o.today, domains = o.domains || {};
      if (!validYmd(today)) throw new Error("win-back: today must be a date");
      const k = kind(message, domains);
      if (!k) return null;
      const svc = serviceFor(message, domains);
      if (k === "ask") return info(svc, domains);
      const domain = domains[svc.key] && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domains[svc.key]) ? domains[svc.key] : null;
      const from = senders(message), terms = offerTerms(message);
      // Pasted means the text carries an email's own header lines; otherwise the person is describing an offer.
      const pasted = /^[ \t>]*(?:from|subject|date|sent|to)\s*:/im.test(message);
      const src = pasted ? "The email" : "What you wrote";
      const lines = [];

      // 1. Who sent it.
      const confirmed = !!domain && from.length > 0 && from.every(f => onDomain(f.host, domain));
      if (confirmed) lines.push(`This email is from ${svc.name}: the sender's address is on ${domain}, ${svc.name}'s domain on file.`);
      else if (!domain) lines.push(`I can't confirm this came from ${svc.name}: I don't have ${svc.name}'s email domain on file.`);
      else if (!from.length) lines.push(pasted ? `I can't confirm this came from ${svc.name}: what you pasted has no From: line. Paste the whole email with its sender and I'll check it against ${domain}.` : `I can't confirm this came from ${svc.name} without the email itself. Paste it here with its From: line and I'll check it against ${domain}.`);
      else lines.push(`I can't confirm this came from ${svc.name}: the sender's address isn't on ${domain}, ${svc.name}'s domain on file. Don't use its links or reply to it.`);
      // Links are never repeated or followed; one that leaves the service's domain is said, so the person signs in themselves.
      const offsite = confirmed && [...forwarded(message).matchAll(/\b(?:https?:\/\/|www\.)([^\s/<>"'()\]]+)/gi)].some(m => !onDomain(cleanHost(m[1].replace(/^[^@]*@/, "")), domain));
      if (offsite) lines.push(`Some of its links go somewhere other than ${domain}, so don't use them.`);
      if (terms.asksSecret) lines.push("It asks for sign-in, code or card details. Don't send those in a reply; if you want an offer, sign in on the service's own site.");
      // No saving is worked out for an offer from a sender that isn't the service's, or one that asks for secrets.
      const untrusted = (!!domain && from.length > 0 && !confirmed) || terms.asksSecret;

      // 2. Whether the person cancelled.
      const cancel = o.cancellations === null ? undefined : cancellationOf(svc, o.cancellations);
      const charges = chargesOf(svc, o.transactions, today);
      const last = charges.length ? charges[charges.length - 1] : null;
      // A confirmation number is the merchant's text: shown only through MerchantLabel, and left out if nothing survives.
      const shown = cancel && cancel.c.reference ? label(cancel.c.reference) : null;
      const ref = shown && shown !== "Unknown merchant" ? shown : null;
      if (cancel === undefined) lines.push("I couldn't read Upmore's cancellation records just now, so I can't say when you cancelled.");
      else if (cancel) lines.push(`You cancelled ${svc.name} through Upmore on ${cancel.day} (Upmore's cancellation record${ref ? `, confirmation ${ref}` : ""}).`);
      else if (last && daysBetween(last.posted_on, today) <= 40) lines.push(`I don't have a record of you cancelling ${svc.name} through Upmore, and I still see it charging you (${money(-last.amount_cents)} on ${last.posted_on}), so this may not be a come-back offer.`);
      else lines.push(`I don't have a record of you cancelling ${svc.name} through Upmore.`);

      // 3. The offer, as the email states it.
      const per = !pasted ? "as you describe it (I haven't seen the email)" : terms.dated ? `per the email you pasted, dated ${terms.dated.text}` : "per the email you pasted (I can't read a date on it)";
      const offers = [], seen = new Set();
      for (const p of terms.prices.filter(x => x.kind === "offer")) { const key = `${p.cents}/${p.per}`; if (!seen.has(key)) { seen.add(key); offers.push(p); } }
      const after = terms.prices.filter(x => x.kind === "after"), off = terms.prices.filter(x => x.kind === "discount");
      const dur = terms.duration ? ` for ${terms.duration.n} ${terms.duration.unit}${terms.duration.n === 1 ? "" : "s"}` : "";
      const afterText = after.length ? `, then ${[...new Set(after.map(a => `${money(a.cents)}${perText(a.per)}`))].join(" or ")}` : "";
      if (offers.length === 1) lines.push(`The offer, ${per}: ${money(offers[0].cents)}${perText(offers[0].per)}${dur}${afterText}.`);
      else if (offers.length > 1) lines.push(`${src} states more than one price (${offers.map(p => `${money(p.cents)}${perText(p.per)}`).join(", ")}), ${per}; I can't tell which one would apply to you, so I won't pick one.`);
      else {
        const parts = [];
        if (terms.free) parts.push(terms.free);
        for (const p of terms.pct) parts.push(`${p}% off${dur}`);
        for (const p of off) parts.push(`${money(p.cents)}${perText(p.per)} off${dur}`);
        const inDollars = terms.pct.length || off.length ? ` ${src} doesn't state the price you'd pay in dollars, so I won't work one out.` : "";
        if (parts.length) lines.push(`The offer, ${per}: ${parts.join("; ")}${afterText}.${inDollars}`);
        else lines.push(`I can't read an offer price in ${pasted ? "the email you pasted" : "what you wrote"}, so I won't put a number on it.`);
      }
      lines.push(terms.ends ? `${src} says the offer ends ${terms.ends.text}.` : `I don't see an end date in ${pasted ? "the email" : "what you wrote"}, so I can't say when the offer ends.`);
      const regular = [...new Set(terms.prices.filter(x => x.kind === "regular").map(a => `${money(a.cents)}${perText(a.per)}`))];
      if (regular.length) lines.push(`${src} gives ${regular.join(" or ")} as the regular price.`);
      if (offers.length === 1 && !after.length) lines.push(`${src} doesn't say what the price goes to after the offer.`);

      // 4. The regular price it compares to: the person's own last charge before they cancelled.
      const before = cancel ? charges.filter(r => r.posted_on <= cancel.day) : charges;
      const reg = before.length ? before[before.length - 1] : null;
      const through = (o.transactions || []).map(r => r && r.posted_on).filter(validYmd).sort().pop();
      if (reg) {
        const cad = cadence(before);
        lines.push(`What you paid: ${money(-reg.amount_cents)} on ${reg.posted_on}, your last ${svc.name} charge${cancel ? " before you cancelled" : ""}${cad ? ` (billed every ${cad})` : ""}.`);
        if (untrusted) lines.push(`I won't work out a saving for an offer I can't trust.${domain ? ` To check it, sign in at ${domain} yourself.` : ""}`);
        else if (offers.length === 1 && offers[0].per && cad === offers[0].per) {
          const gap = -reg.amount_cents - offers[0].cents;
          if (gap > 0) {
            const total = terms.duration && terms.duration.unit === offers[0].per ? ` Over the ${terms.duration.n} ${terms.duration.unit}${terms.duration.n === 1 ? "" : "s"} the email states, that's ${money(gap * terms.duration.n)}.` : "";
            lines.push(`That's ${money(gap)} a ${cad} less than you paid (if it's the same plan you had), while the offer price lasts.${total}`);
          } else lines.push(`That isn't lower than the ${money(-reg.amount_cents)} you paid.`);
        } else if (offers.length === 1) lines.push("I can't line the offer up with your charges (a different or unknown billing period), so I won't work out a saving.");
        lines.push(`From your linked card rows, through ${through}.`);
      } else lines.push(`I don't see a ${svc.name} charge on your linked cards${through ? ` (rows through ${through})` : ""}, so I can't compare the offer with what you paid.`);

      // 5. Whose decision it is.
      lines.push(`Whether to resubscribe is your call. I haven't signed you up and won't; nothing changes unless you do it yourself${domain ? `, by signing in at ${domain} rather than through the email's links` : ""}.`);
      return lines.join("\n");
    }

    return { answer, kind, offerTerms, senders, serviceFor, cancellationOf, chargesOf, readDay, SERVICES };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = WinBack;
