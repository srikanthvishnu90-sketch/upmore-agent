  /* Dispute drafting from a text (live gauntlet S16-17, "dispute this charge": expected a drafted dispute, handed off
     pre-filled). Upmore never sends or submits a dispute itself: it finds the charge the person means in their own
     transactions and writes the two messages they send themselves, in order:
       1. to the merchant, asking for a refund (most refunds end here, and card issuers often ask whether you tried);
       2. if the merchant says no or goes quiet for WAIT_DAYS, to the card issuer or bank, with the same facts.
     The time limits are stated plainly: a credit card dispute goes to the issuer in writing within 60 days of the
     statement that first showed the charge (Fair Credit Billing Act); a debit card dispute goes to the bank under
     Regulation E, also within 60 days of the statement, sooner being better.
     Every amount and date comes from the person's rows (shaped like agent_financial_transactions: account_id,
     provider_transaction_id, amount_cents with money out negative, posted_on, merchant_raw, is_pending), and every
     reply that states one names its source and as-of date. A photo the host already read arrives as extracted fields
     ({ merchant, amount_cents, date }) and is matched the same way; with nothing linked to check it against, the
     draft says its details came from the photo.
     Pure: rows, today and photo fields are passed in. */
  const AgentDispute = (() => {
    const WAIT_DAYS = 10;
    const DATE_WINDOW_DAYS = 3; // a charge posts a day or three after the day the person remembers
    const MAX_LIST = 5;
    const DAY = 86400000;
    const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const ASK = /\b(?:disput(?:e|es|ed|ing)|charge[- ]?backs?|wrong charges?|(?:didn'?t|did not|never) authori[sz]e|unauthori[sz]ed (?:charges?|transactions?|payments?|purchases?)|refund (?:this|that|the|my) (?:charge|payment|transaction))\b/i;
    // A question about disputes in general, or about one already opened, is for the model, not a draft.
    const GENERAL = /^\s*(?:what(?:'s| is| are| does)|explain|define|tell me (?:about|what))\b|\bmy (?:open |last |old )?(?:dispute|chargeback)s?\b|\b(?:status|update) (?:of|on) (?:the |my )?(?:dispute|chargeback)/i;
    const LAST = /\b(?:the |my )?(?:last|latest|most recent|newest)\b(?: one| charge| payment| transaction)?/i;
    const STOP = new Set(("dispute disputes disputed disputing chargeback chargebacks charge charges back wrong didnt didn't did not never " +
      "authorize authorise authorized authorised unauthorized unauthorised refund this that the my a an on for from at in of to me " +
      "please pls can could would you u i it its it's was is be want wanna need help with and or one last latest most recent newest " +
      "transaction transactions payment payments purchase purchases card credit debit bank account statement amount yesterday today " +
      "dollars dollar bucks usd hey hi so just like weird strange random twice double again how do does make start open file " +
      "jan feb mar apr may jun jul aug sep sept oct nov dec january february march april june july august september october november december " +
      "st nd rd th photo picture pic screenshot attached here").split(/\s+/));

    const ymd = s => String(s || "").slice(0, 10);
    const dayNum = s => Math.round(Date.parse(ymd(s) + "T00:00:00Z") / DAY);
    const validYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(ymd(s)) && Number.isFinite(Date.parse(ymd(s) + "T00:00:00Z"));
    const money = c => "$" + Math.floor(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(Math.abs(c) % 100).padStart(2, "0");
    const nice = s => { const [y, m, d] = ymd(s).split("-").map(Number); return `${MONTH_NAMES[m - 1]} ${d}, ${y}`; };
    const squash = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

    // What the merchant is called in a sentence: the statement descriptor up to its first '*' or '#', without trailing
    // store numbers or a ".com", in title case ("STREAMFLIX*PREMIUM 0042" -> "Streamflix").
    function merchantName(raw) {
      let s = String(raw || "").split(/[*#]/)[0].replace(/\.(?:com|net|org|co)\b/ig, "").replace(/[\s\d\-_.]+$/, "").trim();
      if (!s) s = String(raw || "").trim();
      return s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
    }

    function isDisputeAsk(text) {
      const t = String(text || "");
      return ASK.test(t) && !GENERAL.test(t);
    }

    // What the person said about the charge: an amount, a date, "the last one", and the leftover words that may name
    // the merchant (only words that match a merchant in their rows end up counting).
    function parseAsk(text, today) {
      const t = String(text || "");
      let amount_cents = null;
      const am = t.match(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/) || t.match(/(?:^|[^\d/.\-$])(\d+)\.(\d{2})(?![\d/])/) || t.match(/\b(\d+)(?:\.(\d{2}))?\s*(?:dollars|bucks|usd)\b/i);
      if (am) amount_cents = Number(am[1].replace(/,/g, "")) * 100 + (am[2] ? Number(am[2].padEnd(2, "0")) : 0);
      let date = null;
      const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      const md = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
      const named = t.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
      const ty = validYmd(today) ? Number(ymd(today).slice(0, 4)) : null;
      const build = (y, m, d) => {
        if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
        let s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        // A date with no year is the most recent one on or before today.
        if (validYmd(today) && dayNum(s) > dayNum(today)) s = `${y - 1}-${s.slice(5)}`;
        return validYmd(s) ? s : null;
      };
      if (iso) date = validYmd(iso[0]) ? iso[0] : null;
      else if (md && ty) date = build(md[3] ? (md[3].length === 2 ? 2000 + Number(md[3]) : Number(md[3])) : ty, Number(md[1]), Number(md[2]));
      else if (named && ty) date = build(ty, MONTHS.indexOf(named[1].slice(0, 3).toLowerCase()) + 1, Number(named[2]));
      else if (/\byesterday\b/i.test(t) && validYmd(today)) date = new Date((dayNum(today) - 1) * DAY).toISOString().slice(0, 10);
      else if (/\btoday\b/i.test(t) && validYmd(today)) date = ymd(today);
      const words = t.toLowerCase().replace(/\$\s?[\d,.]+/g, " ").replace(/[^a-z0-9' ]+/g, " ").split(/\s+/)
        .map(w => w.replace(/'s$/, "").replace(/'/g, "")).filter(w => w.length >= 3 && !/^\d+$/.test(w) && !STOP.has(w));
      return { amount_cents, date, last: LAST.test(t), words };
    }

    // Money out only, with a real amount and date; transfers between the person's own accounts are not charges.
    function charges(rows) {
      return (rows || []).filter(r => r && Number.isSafeInteger(r.amount_cents) && r.amount_cents < 0 && validYmd(r.posted_on) && !r.is_transfer)
        .slice().sort((a, b) => ymd(b.posted_on).localeCompare(ymd(a.posted_on)) || String(a.provider_transaction_id).localeCompare(String(b.provider_transaction_id)));
    }
    const asOf = rows => (rows || []).filter(r => r && validYmd(r.posted_on)).map(r => ymd(r.posted_on)).sort().slice(-1)[0] || null;

    // Narrow the person's charges by what they said. Merchant words count only when they match a merchant; an amount
    // must match to the cent; a date matches within DATE_WINDOW_DAYS; "the last one" keeps the newest.
    function match(ask, rows) {
      let c = charges(rows);
      const all = c;
      let named = false;
      if (ask.words.length) {
        const hit = r => ask.words.filter(w => squash(r.merchant_raw).includes(w)).length;
        const best = Math.max(0, ...c.map(hit));
        if (best > 0) { c = c.filter(r => hit(r) === best); named = true; }
      }
      if (ask.amount_cents != null) c = c.filter(r => Math.abs(r.amount_cents) === ask.amount_cents);
      if (ask.date) {
        c = c.filter(r => Math.abs(dayNum(r.posted_on) - dayNum(ask.date)) <= DATE_WINDOW_DAYS);
        if (c.some(r => ymd(r.posted_on) === ask.date)) c = c.filter(r => ymd(r.posted_on) === ask.date);
      }
      if (ask.last && c.length > 1) c = c.slice(0, 1);
      const specific = named || ask.amount_cents != null || !!ask.date || ask.last;
      // Words that name no merchant the person has, with nothing else to go on: that charge isn't in these rows.
      if (ask.words.length && !specific) c = [];
      return { matches: c, specific: specific || ask.words.length > 0, searched: all.length };
    }

    function windowLines(postedOn, today) {
      const lines = [
        "Time limits: for a credit card, the Fair Credit Billing Act gives you 60 days from the date of the statement that first showed the charge to dispute it with the issuer in writing (their online dispute form or a letter). For a debit card, the dispute goes to your bank under Regulation E: report it within 60 days of that statement, and sooner is better, because what the bank must cover shrinks after that.",
      ];
      if (validYmd(postedOn) && validYmd(today) && dayNum(today) - dayNum(postedOn) > 75) {
        lines.push(`This charge posted ${dayNum(today) - dayNum(postedOn)} days ago, so the 60-day window may already be closing or closed; contact the issuer now and ask, and skip the wait in step 2.`);
      }
      return lines;
    }

    // The pre-filled draft. charge: { merchant_raw, amount_cents, posted_on, is_pending }; source: the line that says
    // where the facts came from and as of when.
    function draft(charge, opts) {
      const o = opts || {};
      const name = merchantName(charge.merchant_raw);
      const amt = money(charge.amount_cents);
      const when = validYmd(charge.posted_on) ? nice(charge.posted_on) : null;
      const posted = when ? (charge.is_pending ? `pending since ${when}` : `posted ${when}`) : "date not shown";
      const reason = o.unauthorized ? "I didn't authorize this charge." : "This charge isn't right.";
      const facts = `${name}, ${amt}, ${posted}`;
      const lines = [
        `Here's a dispute for the ${name} charge, pre-filled for you to send yourself. Nothing has been sent.`,
        `Charge: ${charge.merchant_raw ? String(charge.merchant_raw).trim() : name}, ${amt}, ${posted}.`,
        "",
        `Step 1, ask ${name} for a refund (their support page, app or email):`,
        `"Hi, I'm writing about a charge of ${amt} from ${name}${when ? ` on ${when}` : ""}. ${reason} Please refund ${amt} to the card it was charged to and confirm in writing. Thank you."`,
        "",
        `Step 2, if ${name} says no or hasn't answered in ${WAIT_DAYS} days, dispute it with your card issuer or bank (their app, website, or the number on the back of the card) with the same facts: ${facts}, and the date you asked ${name} for a refund.`,
      ];
      if (charge.is_pending) lines.push("It's still pending: step 1 works now; the card dispute can start once it posts.");
      lines.push("", ...windowLines(charge.posted_on, o.today));
      if (o.note) lines.push(o.note);
      lines.push(o.source);
      return lines.join("\n");
    }

    function pickList(list, source, lead) {
      const shown = list.slice(0, MAX_LIST);
      const first = shown[0];
      return [
        lead || "Which charge do you want to dispute?",
        ...shown.map((r, i) => `${i + 1}. ${merchantName(r.merchant_raw)}, ${money(r.amount_cents)}, ${r.is_pending ? "pending" : "posted"} ${nice(r.posted_on)}`),
        list.length > MAX_LIST ? `(${list.length - MAX_LIST} more; add the amount or date to narrow it.)` : null,
        `Say "dispute" with the amount and date of the one you mean, like "dispute ${merchantName(first.merchant_raw)} ${money(first.amount_cents)} on ${nice(first.posted_on).replace(/, \d{4}$/, "")}".`,
        source,
      ].filter(x => x != null).join("\n");
    }

    const NO_ROWS = "I don't see a connected bank or card, so I can't find that charge. Send a photo of it, or connect the card in the app (Home, then Connect bank), and I'll draft the dispute for you to send.";
    const sourceLine = rows => `From your linked accounts, as of ${asOf(rows)}.`;

    // The text path. Returns { kind, text, charge?, candidates? }:
    //   not_dispute (text null), defer (a photo carries the details and the text names nothing: the host's photo reader
    //   answers), none, pick, draft.
    function answer(text, rows, opts) {
      const o = opts || {};
      if (!isDisputeAsk(text)) return { kind: "not_dispute", text: null };
      const ask = parseAsk(text, o.today);
      const unauthorized = /\b(?:didn'?t|did not|never) authori[sz]e|unauthori[sz]ed\b/i.test(String(text));
      const rowsIn = rows || [];
      const all = charges(rowsIn);
      if (o.has_photo && !ask.amount_cents && !ask.date && !ask.last && !all.some(r => ask.words.some(w => squash(r.merchant_raw).includes(w)))) {
        return { kind: "defer", text: null };
      }
      if (!all.length) return { kind: "none", text: NO_ROWS };
      const source = sourceLine(rowsIn);
      const m = match(ask, rowsIn);
      if (m.matches.length === 1 && m.specific) {
        const c = m.matches[0];
        return { kind: "draft", charge: c, text: draft(c, { today: o.today, unauthorized, source }) };
      }
      if (!m.matches.length) {
        return { kind: "none", text: `I couldn't find that charge in your linked accounts (I checked ${m.searched} charge${m.searched === 1 ? "" : "s"} through ${asOf(rowsIn)}). Tell me the merchant, amount and date as they show on your statement, or send a photo of it, and I'll draft the dispute.` };
      }
      const list = m.specific ? m.matches : all;
      return { kind: "pick", candidates: list.slice(0, MAX_LIST), text: pickList(list, source, m.specific ? `I found ${list.length} charges that could be it. Which one do you want to dispute?` : null) };
    }

    // The photo path: fields the host extracted from an image ({ merchant, amount_cents, date }), matched against the
    // person's rows the same way. Unmatched or unlinked, the draft is made from the photo and says so.
    function fromPhoto(fields, rows, opts) {
      const o = opts || {};
      const f = fields || {};
      const amount = Number.isFinite(Number(f.amount_cents)) && f.amount_cents !== null && f.amount_cents !== "" ? Math.abs(Math.round(Number(f.amount_cents))) : null;
      const date = validYmd(f.date) ? ymd(f.date) : null;
      const merchant = String(f.merchant || "").trim();
      if (!merchant && amount == null) return { kind: "none", text: "I couldn't read the merchant or the amount in that photo. Tell me them as they show on your statement and I'll draft the dispute." };
      const rowsIn = rows || [];
      const words = merchant.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w));
      const all = charges(rowsIn);
      if (all.length) {
        const m = match({ amount_cents: amount, date, last: false, words }, rowsIn);
        const namedOk = !words.length || m.matches.every(r => words.some(w => squash(r.merchant_raw).includes(w)));
        const good = namedOk ? m.matches : [];
        if (good.length === 1) {
          return { kind: "draft", charge: good[0], text: draft(good[0], { today: o.today, source: sourceLine(rowsIn), note: "Matched to your photo." }) };
        }
        if (good.length > 1) {
          return { kind: "pick", candidates: good.slice(0, MAX_LIST), text: pickList(good, sourceLine(rowsIn), `Your photo matches ${good.length} charges. Which one do you want to dispute?`) };
        }
      }
      if (!merchant || amount == null) {
        return { kind: "none", text: `I could read ${merchant ? `the merchant (${merchant})` : `the amount (${money(amount)})`} in that photo but not the ${merchant ? "amount" : "merchant"}, and ${all.length ? "I couldn't find it in your linked accounts" : "there's no linked account to look it up in"}. Tell me the ${merchant ? "amount" : "merchant"} and I'll draft the dispute.` };
      }
      const charge = { merchant_raw: merchant, amount_cents: -amount, posted_on: date, is_pending: false };
      const note = all.length
        ? `I don't see this charge in your linked accounts (checked through ${asOf(rowsIn)}), so these details come from your photo; check them against your statement before you send.`
        : "These details come from your photo (there's no linked account to check them against); check them against your statement before you send.";
      return { kind: "draft_from_photo", charge, text: draft(charge, { today: o.today, note, source: `From your photo${date ? `, charge dated ${date}` : ", no date shown on it"}.` }) };
    }

    return { WAIT_DAYS, DATE_WINDOW_DAYS, MAX_LIST, isDisputeAsk, parseAsk, charges, match, merchantName, draft, answer, fromPhoto };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentDispute;
