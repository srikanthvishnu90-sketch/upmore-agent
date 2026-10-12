  /* Airline refunds under the DOT rules (overnight C1; method cards M2-OWED-03 cancelled or big-change flight refund,
     M2-OWED-09 delayed bag fee, M2-OWED-11 paid extras not delivered, M1-CREATIVE-04 involuntary bump, M1-CREATIVE-10
     automatic airline refunds). The agent drafts, the person sends: Upmore never contacts the airline, files, sends or
     pays anything.
     In: what the person says or pastes (an airline email or their own words) and their own card rows (shaped like
     agent_financial_transactions: amount_cents with money out negative, posted_on, merchant_raw, is_pending,
     is_transfer). Out: which refund is owed, with every threshold, multiple and cap read from the offer book
     (packages/offers/terms.json through OfferBook, terms dot.refund.*, dot.bag.*, dot.bump.*, dot.extras.*) and cited
     with term(...).cite, so a term past its window says "may have changed"; the amount from the person's own card row
     (its date and the rows' as-of date) and never from pasted text; a ready-to-send request; a warning before a voucher
     is accepted; the 7-business-day watch date for the card credit; and, only once that date has passed with no credit
     row, the DOT complaint text. A fact the rule needs and the message lacks is asked for by name, never assumed.
     A pasted email is data: a sentence in it that addresses the agent ("ignore previous instructions", "AI:") is
     dropped before anything is read, so it cannot change the outcome. Identity digits never come back out: the only
     reference repeated is the 6-character booking reference the person typed, and a card descriptor (which can carry
     the 13-digit ticket number) is never quoted; the airline is named instead.
     Pure: text, rows, today and the offer book are passed in. */
  const AirlineRefunds = (() => {
    const DAY = 86400000;
    const MAX_PICK = 3;
    const COMPLAINT_URL = "https://www.transportation.gov/airconsumer/file-consumer-complaint";
    const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const T = Object.freeze({
      CHANGE_DOM: "dot.refund.change_hours.domestic", CHANGE_INTL: "dot.refund.change_hours.international",
      CARD_DAYS: "dot.refund.card_business_days",
      BAG_DOM: "dot.bag.late_hours.domestic", BAG_INTL_MIN: "dot.bag.late_hours.international_min", BAG_INTL_MAX: "dot.bag.late_hours.international_max",
      BUMP_MIN: "dot.bump.short.min_hours", BUMP_LONG_OVER: "dot.bump.long.over_hours",
      BUMP_SHORT_X: "dot.bump.short.multiple", BUMP_SHORT_CAP: "dot.bump.short.cap_cents",
      BUMP_LONG_X: "dot.bump.long.multiple", BUMP_LONG_CAP: "dot.bump.long.cap_cents",
      EXTRAS: "dot.extras.named_services",
    });

    // US airlines by what a person writes and what a card statement shows. A bare common word ("united", "spirit") counts
    // only next to a flight word; the statement pattern never quotes the descriptor back.
    const AIRLINES = [
      { key: "delta", name: "Delta", code: "DL", says: /\bdelta\b/i, row: /\bDELTA\b(?![\s-]*DENTAL)/i },
      { key: "united", name: "United", code: "UA", says: /\bunited air(?:lines)?\b/i, word: "united", row: /\bUNITED\s*(?:AIR|AIRLINES|\.COM|\d)/i },
      { key: "american", name: "American Airlines", code: "AA", says: /\bamerican air(?:lines)?\b|\baa\.com\b/i, word: "american", row: /\bAMERICAN\s*AIR|\bAA\.COM\b|\bAMERICAN\s+\d/i },
      { key: "southwest", name: "Southwest", code: "WN", says: /\bsouthwest\b/i, row: /\bSOUTHWES/i },
      { key: "jetblue", name: "JetBlue", code: "B6", says: /\bjet ?blue\b/i, row: /\bJET ?BLUE/i },
      { key: "alaska", name: "Alaska Airlines", code: "AS", says: /\balaska air(?:lines)?\b/i, word: "alaska", row: /\bALASKA\s*AIR/i },
      { key: "spirit", name: "Spirit", code: "NK", says: /\bspirit air(?:lines)?\b/i, word: "spirit", row: /\bSPIRIT\s*AIR/i },
      { key: "frontier", name: "Frontier", code: "F9", says: /\bfrontier air(?:lines)?\b/i, word: "frontier", row: /\bFRONTIER\s*AI/i },
      { key: "hawaiian", name: "Hawaiian Airlines", code: "HA", says: /\bhawaiian air(?:lines)?\b/i, word: "hawaiian", row: /\bHAWAIIAN\s*AIR/i },
      { key: "allegiant", name: "Allegiant", code: "G4", says: /\ballegiant\b/i, row: /\bALLEGIANT/i },
      { key: "suncountry", name: "Sun Country", code: "SY", says: /\bsun country\b/i, row: /\bSUN\s*COUNTRY/i },
      { key: "breeze", name: "Breeze", code: "MX", says: /\bbreeze airways\b/i, word: "breeze", row: /\bBREEZE\s*AIR/i },
      { key: "avelo", name: "Avelo", code: "XP", says: /\bavelo\b/i, row: /\bAVELO/i },
    ];
    const NEAR_FLIGHT = "(?=\\s+(?:flights?|tickets?|bags?|fares?|reservations?|bookings?|planes?|gates?|wi-?fi|seats?)\\b)";
    const WIFI_ROW = /\b(?:VIASAT|GOGO|INTELSAT|PANASONIC\s*AVI|INFLIGHT|IN-FLIGHT|WI-?FI)\b/i;

    // What makes a message an airline-refund message (isAirlineAsk).
    const FLIGHTY = /\b(?:flights?|airlines?|airways|airport|boarding|layover|plane|checked bags?|baggage|luggage|suitcases?|in-?flight|bumped|oversold|itinerary)\b/i;
    const BAG_WORD = /\b(?:bags?|baggage|luggage|suitcases?)\b/i;
    const CANCELLED = /\b(?:was|got|has been|have been|had been|been|is|were|being)\s+cancell?ed\b|\b(?:they|airline|airlines|it)\s+cancell?ed\b|\bcancell?ed\s+(?:my |our |the |your )?(?:[a-z0-9:]+\s+){0,2}?(?:flight|leg)\b|\bflight\s+cancell?ation\b|\bcancell?ation of (?:my |our |the |your )?flight\b/i;
    const CHANGED = /\b(?:schedule change|time change|rescheduled|retimed|re-?timed|changed|moved|pushed(?: back)?|delayed|delay)\b/i;
    const BUMP = /\bbump(?:ed|ing)?\b|\bdenied boarding\b|\boversold\b|\bgave (?:away )?my seat(?: away)?\b|\bno seat for (?:me|us)\b/i;
    const EXTRA = /\b(?:wi-?fi|internet|seat|exit row|extra legroom|economy plus|comfort\+?|entertainment|screen)\b/i;
    const NOT_DELIVERED = /\b(?:didn'?t|did not|never|wasn'?t|was not|couldn'?t|could not|weren'?t|were not)\b[^.\n]{0,25}\b(?:work|working|connect|load|available|get|give|honou?r|provided?|deliver(?:ed)?)\b|\b(?:not working|broken|out of service|no wi-?fi|was down|went down|gave (?:my|the|our) seats? (?:away|to)|moved (?:me |us )?(?:from|out of) (?:my|the|our) (?:paid )?(?:seat|row)|downgraded)\b/i;
    const PARTIAL = /\b(?:slow|spotty|patchy|intermittent|kept dropping|cut out|cutting out|laggy)\b/i;
    const BAG_LATE = /\b(?:late|later|delayed|took|arrived|came|delivered|showed up|lost|missing|hasn'?t (?:arrived|come|shown up)|never (?:arrived|came))\b/i;
    const ASK = /\b(?:refunds?|refunded|money back|owed?|owes|compensat(?:e|ed|ion)|entitled|claim|vouchers?|travel credits?|reimburs(?:e|ed|ement)|cash|what (?:do|can|should) (?:i|we) (?:get|do)|get (?:my|our) money)\b/i;
    // The person cancelling it themselves ("I cancelled my delta flight") is not the airline cancelling: the DOT refund
    // rule checked here doesn't cover it, so it is said plainly instead of being read as a cancellation they declined.
    const SELF_CANCEL = /\b(?:i|we)(?:'ve| have| had)?\s+(?:just\s+|already\s+|had to\s+|needed to\s+)?cancel(?:l?ed)?\s+(?:my|our|the)\s+(?:[a-z0-9:]+\s+){0,2}?(?:flights?|tickets?|bookings?|reservations?|trip)\b/i;
    const NOTICE = /\byour (?:flight|trip|itinerary|reservation|booking)\b[^.\n]{0,80}\b(?:has been|was|is|have been)\s+(?:cancell?ed|changed|rescheduled|delayed|updated)/i;
    const FIRST = /\b(?:my|our|i|we|me|us|i'm|i've|we're|we've)\b|\byour (?:flight|trip|itinerary|reservation|booking)\b/i;
    const GENERAL = /^\s*(?:what(?:'s| is| are| does)|how (?:do|does)|explain|define|tell me (?:about|what))\b/i;
    const NOT_OURS = /\b(?:insurance|insurer|miles|points|book (?:me |us )?(?:a |the )?flights?|cheap(?:er|est)? flights?|flight prices?|fare (?:alert|drop|dropped)|price drop|dropped in price|rental car|hotel (?:refund|booking|reservation|points))\b/i;
    const IMPERATIVE_CANCEL = /^\s*(?:(?:please|pls|can you|could you)\s+)?cancel\s+(?:my|our|the|this)\b/i;

    // Sentences in pasted text that address the agent instead of the passenger. They are data and are dropped.
    const INJECTION = /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:instructions?|prompts?|rules?|above|previous)\b|(?:^|[\s<!-])(?:system|assistant|ai|chatbot|bot|model|llm)\s*[:>]|\b(?:as an ai|you are (?:an? )?(?:ai|assistant|language model)|note to (?:the )?(?:ai|assistant|model|bot|agent)|tell the (?:customer|passenger|user)|(?:new|updated) instructions?)\b/i;

    const ymd = s => String(s || "").slice(0, 10);
    const validYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(ymd(s)) && Number.isFinite(Date.parse(ymd(s) + "T00:00:00Z"));
    const dayNum = s => Math.round(Date.parse(ymd(s) + "T00:00:00Z") / DAY);
    const fromDay = n => new Date(n * DAY).toISOString().slice(0, 10);
    const nice = s => { const [y, m, d] = ymd(s).split("-").map(Number); return `${MONTH_NAMES[m - 1]} ${d}, ${y}`; };
    const money = c => "$" + Math.floor(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(Math.abs(c) % 100).padStart(2, "0");
    const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
    const hm = min => { const h = Math.floor(min / 60), m = min % 60; return [h ? plural(h, "hour") : null, m ? plural(m, "minute") : null].filter(Boolean).join(" ") || "0 minutes"; };
    const WORD_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

    // Business days after a date, weekends skipped (a federal holiday in between can add a day; said in the reply).
    function addBusinessDays(start, n) {
      let d = dayNum(start), left = n;
      while (left > 0) { d += 1; const wd = new Date(d * DAY).getUTCDay(); if (wd !== 0 && wd !== 6) left -= 1; }
      return fromDay(d);
    }

    // Drop the sentences that talk to the agent; keep everything else as the facts to read.
    function cleanText(text) {
      const parts = String(text || "").replace(/<!--([\s\S]*?)-->/g, (m, inner) => `\n${inner}\n`).split(/\n+|(?<=[.!?])\s+/);
      const kept = [], dropped = [];
      for (const p of parts) (INJECTION.test(p) ? dropped : kept).push(p);
      return { text: kept.join("\n"), dropped: dropped.filter(s => s.trim()).length };
    }
    const sentences = text => String(text || "").split(/\n+|(?<=[.!?;])\s+/).map(s => s.trim()).filter(Boolean);

    function airlineOf(text) {
      const t = String(text || "");
      const code = t.match(/\b(DL|UA|AA|WN|B6|AS|NK|F9|HA|G4|SY|MX|XP)\s?(\d{1,4})\b/);
      for (const a of AIRLINES) {
        if (a.says.test(t)) return a;
        if (a.word && new RegExp(`\\b${a.word}${NEAR_FLIGHT}`, "i").test(t)) return a;
      }
      if (code) return AIRLINES.find(a => a.code === code[1]) || null;
      return null;
    }

    function isAirlineAsk(text) {
      const raw = String(text || "");
      if (!raw.trim() || NOT_OURS.test(raw) || IMPERATIVE_CANCEL.test(raw)) return false;
      const t = cleanText(raw).text;
      const airline = airlineOf(t);
      if (!FLIGHTY.test(t) && !airline) return false;
      const bag = BAG_WORD.test(t) && BAG_LATE.test(t);
      const extra = EXTRA.test(t) && (NOT_DELIVERED.test(t) || PARTIAL.test(t));
      const event = CANCELLED.test(t) || SELF_CANCEL.test(t) || BUMP.test(t) || bag || extra || (CHANGED.test(t) && /\b(?:flights?|departure|departs|schedule|itinerary)\b/i.test(t));
      if (!event) return false;
      const notice = NOTICE.test(t);
      if (!ASK.test(t) && !notice) return false;
      if (!FIRST.test(t) && !notice) return false;
      if (GENERAL.test(t) && !/\b(?:my|our|i|we|me|us)\b/i.test(t.replace(GENERAL, ""))) return false;
      return true;
    }

    // ---- reading the facts ----

    // Durations: "3 hours 1 minute", "3h01m", "3 hrs and 1 min", "90 minutes", "2 days", "an hour".
    const DUR = /\b(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(days?|hours?|hrs?|h)\b(?:\s*(?:and\s*)?(\d{1,2})\s*(?:minutes?|mins?|m)\b)?|\b(\d{1,2})h(\d{1,2})m?\b|\b(\d+)\s*(?:minutes?|mins?)\b/ig;
    function durations(s) {
      const out = [];
      for (const m of String(s).matchAll(DUR)) {
        let min = null;
        if (m[4] !== undefined) min = Number(m[4]) * 60 + Number(m[5]);
        else if (m[6] !== undefined) min = Number(m[6]);
        else {
          const n = WORD_NUM[m[1].toLowerCase()] !== undefined ? WORD_NUM[m[1].toLowerCase()] : Number(m[1]);
          const unit = /^d/i.test(m[2]) ? 1440 : 60;
          min = Math.round(n * unit) + (m[3] ? Number(m[3]) : 0);
        }
        if (Number.isFinite(min)) out.push({ min, index: m.index, end: m.index + m[0].length, text: m[0] });
      }
      return out;
    }

    // Dates with their positions: 2026-10-14, 10/14(/2026), Oct 14(, 2026). A date with no year is the one nearest today.
    function dates(text, today) {
      const t = String(text || ""), out = [];
      const ty = validYmd(today) ? Number(ymd(today).slice(0, 4)) : null;
      const nearest = (m, d) => {
        if (!ty) return null;
        let best = null;
        for (const y of [ty - 1, ty, ty + 1]) {
          const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          if (!validYmd(s) || new Date(dayNum(s) * DAY).getUTCDate() !== d) continue;
          if (!best || Math.abs(dayNum(s) - dayNum(today)) < Math.abs(dayNum(best) - dayNum(today))) best = s;
        }
        return best;
      };
      const full = (y, m, d) => { const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; return validYmd(s) && new Date(dayNum(s) * DAY).getUTCDate() === d ? s : null; };
      for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) { const s = full(+m[1], +m[2], +m[3]); if (s) out.push({ date: s, index: m.index, end: m.index + m[0].length }); }
      for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
        const mo = +m[1], d = +m[2]; if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
        const s = m[3] ? full(m[3].length === 2 ? 2000 + +m[3] : +m[3], mo, d) : nearest(mo, d);
        if (s) out.push({ date: s, index: m.index, end: m.index + m[0].length });
      }
      for (const m of t.matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s*(\d{4}))?/gi)) {
        const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, d = +m[2];
        const s = m[3] ? full(+m[3], mo, d) : nearest(mo, d);
        if (s) out.push({ date: s, index: m.index, end: m.index + m[0].length });
      }
      return out.sort((a, b) => a.index - b.index);
    }

    // Labeled clock times ("originally 8:00 AM", "now 11:01 AM", "from 8:00 AM to 11:01 AM", "instead of 8:00"), each
    // with the date written just before it. Returns the largest gap between an original time and its new one, in minutes.
    const ORIG_WORDS = /\b(?:original(?:ly)?|was scheduled|were scheduled|scheduled to (?:depart|leave|arrive)|old (?:time|departure|flight|schedule)|instead of|used to)\b/gi;
    const NEW_WORDS = /\b(?:new|now|rescheduled|changed to|moved to|will (?:now )?(?:depart|leave|arrive)|updated|revised)\b/gi;
    function changeFromTimes(text, today) {
      const t = String(text || ""), ds = dates(t, today), orig = [], neu = [];
      const re = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\b\.?|\b([01]?\d|2[0-3]):([0-5]\d)\b/gi;
      for (const m of t.matchAll(re)) {
        let h, mi;
        if (m[3]) { h = Number(m[1]); mi = Number(m[2] || 0); if (h < 1 || h > 12 || mi > 59) continue; h = h % 12 + (m[3].toLowerCase() === "p" ? 12 : 0); }
        else { h = Number(m[4]); mi = Number(m[5]); }
        const zone = t.slice(Math.max(0, m.index - 70), m.index);
        const prior = ds.filter(d => d.end <= m.index && m.index - d.end <= 30).slice(-1)[0];
        const lead = zone.replace(/[\s,]*(?:at\s*)?$/i, "").replace(/(?:\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)$/i, "").trim();
        let label = null;
        if (/\bfrom$/i.test(lead)) label = "orig";
        else if (/\bto$/i.test(lead)) label = "new";
        else {
          let lo = -1, ln = -1;
          for (const x of zone.matchAll(ORIG_WORDS)) lo = x.index;
          for (const x of zone.matchAll(NEW_WORDS)) ln = x.index;
          if (lo >= 0 || ln >= 0) label = lo > ln ? "orig" : "new";
        }
        if (!label) continue;
        (label === "orig" ? orig : neu).push({ minutes: h * 60 + mi, date: prior ? prior.date : null });
      }
      if (!orig.length || !neu.length) return null;
      const anyDate = [...orig, ...neu].map(x => x.date).find(Boolean) || null;
      const abs = x => (x.date || anyDate) ? dayNum(x.date || anyDate) * 1440 + x.minutes : x.minutes;
      let gap = null;
      for (let i = 0; i < Math.min(orig.length, neu.length); i++) gap = Math.max(gap === null ? 0 : gap, Math.abs(abs(neu[i]) - abs(orig[i])));
      const firstDate = orig.map(x => x.date).find(Boolean) || anyDate;
      return { minutes: gap, flight_date: firstDate };
    }

    const negated = (t, index) => /\b(?:didn'?t|did not|won'?t|will not|never|not|refused to|declined to|don'?t|do not)\b[^.\n]{0,12}$/i.test(t.slice(Math.max(0, index - 30), index));
    function hit(re, t) {
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      for (const m of t.matchAll(g)) if (!negated(t, m.index)) return true;
      return false;
    }
    // Only the person's own acceptance counts ("I took the voucher"); an email's "you can accept the travel credit" is an
    // offer, and an email that says "you accepted" against the person's own "I declined" is asked about, not assumed.
    const WE = "\\b(?:i|we|i've|we've|i have|we have|i already|we already|i just|we just)\\s+";
    const TOOK_VOUCHER = new RegExp(WE + "(?:took|accepted|used|kept|chose|picked|went with)\\b[^.\\n]{0,25}\\b(?:vouchers?|travel credits?|flight credits?|e-?credits?|credits?\\b(?!\\s*cards?))", "i");
    const TOOK_FLIGHT = new RegExp(WE + "(?:still\\s+)?(?:took|flew|accepted|kept|got on|boarded|went on)\\b[^.\\n]{0,25}\\b(?:new|rebooked|replacement|alternate|alternative|later|earlier|other|changed)\\s+(?:flights?|itinerary|option|time|one)\\b|\\bi (?:still )?(?:flew|took it)\\b", "i");
    const YOU_TOOK = /\byou(?:'ve| have)?\s+(?:accepted|chose|selected|kept)\b[^.\n]{0,25}\b(?:vouchers?|credits?|flights?|itinerary|option)\b/i;
    const DECLINED = /\b(?:declined|turned down|refused|rejected|said no to|didn'?t (?:take|accept|want|fly|travel)|did not (?:take|accept|want|fly|travel)|won'?t (?:take|accept|fly|travel)|will not (?:take|accept|fly|travel)|not taking|don'?t want (?:the |a |any )?(?:new flight|voucher|credit|rebooking|other flight)|chose not to (?:fly|travel)|cancell?ed (?:my|our) (?:trip|travel|plans)|i cancell?ed)\b|\b(?:refund|cash|money back)\s+instead\b|\bi(?:'d| would)? (?:want|like|need|prefer)\b[^.\n]{0,15}\b(?:refund|money back|cash)\b|\b(?:refund|cash|money back)\b[^.\n]{0,20}\b(?:not|instead of|rather than)\s+(?:a |the |any )?(?:voucher|credit|new flight|rebooking)|\b(?:not|instead of|rather than)\s+(?:a |the |any )?(?:voucher|credit|new flight)\b[^.\n]{0,20}\b(?:refund|cash|money back)\b/i;
    const VOUCHER_OFFER = /\b(?:offer(?:ed|ing|s)?|gave (?:me|us) the option of|giving (?:me|us)|propos(?:ed|ing))\b[^.\n]{0,30}\b(?:vouchers?|travel credits?|flight credits?|credits?)\b|\bshould (?:i|we) (?:take|accept) (?:the |a |their )?(?:vouchers?|credits?)|\b(?:vouchers?|travel credits?|flight credits?)\b[^.\n]{0,30}\b(?:instead|in place of|offered)\b/i;
    const VOLUNTARY = /\bvolunteer(?:ed|ing)?\b|\b(?:took|accepted) (?:their|the|an?) (?:offer|deal)\b|\bgave up my seat\b/i;
    const INVOLUNTARY = /\binvoluntar(?:y|ily)\b|\bagainst (?:my|our) will\b|\bdidn'?t volunteer\b|\bdid not volunteer\b|\b(?:they|airline|agent|gate agent) (?:made|forced) (?:me|us)\b|\bno volunteers?\b|\b(?:nobody|no one|no-one) volunteered\b|\bdenied boarding\b/i;
    const REPORT_YES = /\b(?:filed|made|submitted|opened|have|got|did)\b[^.\n]{0,30}\b(?:reports?|claims?|pir|file reference)\b|\breported (?:it|the bag|my bag|them)\b|\b(?:mishandled|delayed|lost)[- ]bag(?:gage)? report\b/i;
    const REPORT_NO = /\b(?:didn'?t|did not|never|haven'?t|have not|no)\b[^.\n]{0,20}\b(?:file|report|claim)/i;
    const SENT = /\b(?:i|we|i've|we've|i have|we have)\s+(?:already\s+)?(?:sent|asked|requested|submitted|emailed|filed|put in|made)\b|\brequested (?:a|the|my|our) refund\b|\b(?:asked|applied) (?:delta |united |them |the airline )?for (?:a|the|my|our) refund\b/i;

    function extrasOf(t) {
      const out = [];
      for (const s of sentences(t)) {
        const kinds = [];
        if (/\bwi-?fi\b|\binternet\b/i.test(s)) kinds.push("wifi");
        if (/\b(?:seats?|exit row|extra legroom|economy plus|comfort\+?|premium seat)\b/i.test(s) && !BUMP.test(s)) kinds.push("seat");
        if (/\b(?:entertainment|screen|seatback tv)\b/i.test(s)) kinds.push("entertainment");
        for (const kind of kinds) {
          if (out.some(e => e.kind === kind)) continue;
          const failed = NOT_DELIVERED.test(s), partial = PARTIAL.test(s);
          if (!failed && !partial) continue;
          out.push({ kind, delivered: failed ? false : "partial", paid: /\b(?:paid|bought|purchased|charged|\$\s?\d)/i.test(s) });
        }
      }
      return out;
    }

    function parse(text, today) {
      const cleaned = cleanText(text);
      const t = cleaned.text;
      const airline = airlineOf(t);
      const code = t.match(/\b(DL|UA|AA|WN|B6|AS|NK|F9|HA|G4|SY|MX|XP)\s?(\d{1,4})\b/);
      const fnum = code ? `${code[1]} ${code[2]}` : ((t.match(/\bflight\s+(?:number\s+|no\.?\s+|#\s?)?(\d{1,4})\b/i) || [])[1] || null);
      const ref = t.match(/\b(?:booking (?:reference|ref|code)|confirmation (?:code|number|#)|record locator|pnr|reservation (?:code|number))\s*(?:is|:|#)?\s*([A-Z0-9]{6})\b(?![A-Z0-9])/i);
      const booking_ref = ref && /[A-Z]/i.test(ref[1]) ? ref[1].toUpperCase() : null;
      const intl = /\binternational\b|\boverseas\b|\babroad\b/i.test(t), dom = /\bdomestic\b|\bwithin the (?:us|u\.s\.|united states|states)\b/i.test(t);
      const scope = intl && !dom ? "international" : dom && !intl ? "domestic" : null;
      const ss = sentences(t);
      const bump = BUMP.test(t);

      // When the person sent their request: the date (or "N days ago", "yesterday", "today") after "I asked / sent ...".
      let sent_on = null, sentIdx = -1;
      const sm = t.match(SENT);
      if (sm) {
        const after = t.slice(sm.index, sm.index + 120).split(/\n|(?<=[.!?])\s/)[0];
        const d = dates(after, today)[0];
        const ago = after.match(/\b(\d{1,2})\s+(?:business\s+)?days?\s+ago\b/i);
        if (d) { sent_on = d.date; sentIdx = sm.index + d.index; }
        else if (ago && validYmd(today)) sent_on = fromDay(dayNum(today) - Number(ago[1]));
        else if (/\byesterday\b/i.test(after) && validYmd(today)) sent_on = fromDay(dayNum(today) - 1);
        else if (/\btoday\b/i.test(after) && validYmd(today)) sent_on = ymd(today);
      }

      // The schedule change: labeled clock times first, then a stated duration in a sentence about the change.
      const nonBag = ss.filter(s => !BAG_WORD.test(s)).join("\n");
      const fromTimes = changeFromTimes(nonBag, today);
      let change_minutes = fromTimes ? fromTimes.minutes : null;
      let flight_minutes = null, bag_delay = null, arrival_delay = null;
      for (const s of ss) {
        let rest = s;
        const fl = s.match(/\b(\d{1,2}(?:\.\d)?)[- ]?(?:hours?|hrs?|h)\s+(?:long\s+)?flight\b|\bflight\s+(?:was|is|of|lasted|took)\s+(?:about\s+|around\s+)?(\d{1,2}(?:\.\d)?)\s*(?:hours?|hrs?|h)\b/i);
        if (fl) { flight_minutes = Math.round(Number(fl[1] || fl[2]) * 60); rest = s.replace(fl[0], " "); }
        const ds = durations(rest).filter(d => !/^\s*ago\b/i.test(rest.slice(d.end)));
        if (!ds.length) continue;
        if (BAG_WORD.test(rest) && BAG_LATE.test(rest)) { if (bag_delay === null) bag_delay = ds[0].min; continue; }
        // Bumped: a delay in the story is how late the person got to their destination, not a schedule change.
        if (bump) { if (arrival_delay === null && /\b(?:arriv\w*|got (?:there|in|home|to)|landed|reached|made it|late|later|delayed)\b/i.test(rest)) arrival_delay = ds[0].min; continue; }
        if (change_minutes === null && CHANGED.test(rest)) change_minutes = ds[0].min;
      }
      if (bump) { if (arrival_delay === null && fromTimes) arrival_delay = fromTimes.minutes; change_minutes = null; }

      // The flight's date: the original time's date, else the first date in a sentence about the flight that isn't the
      // day the request was sent.
      let flight_date = fromTimes && fromTimes.flight_date ? fromTimes.flight_date : null;
      if (!flight_date) {
        for (const d of dates(t, today)) {
          if (d.index === sentIdx) continue;
          const lineStart = t.lastIndexOf("\n", d.index) + 1, lineEnd = t.indexOf("\n", d.index);
          const line = t.slice(lineStart, lineEnd < 0 ? t.length : lineEnd);
          if (/\b(?:flights?|depart\w*|trip|travel\w*|fly|flew|flying|bags?|bump\w*|board\w*|landed|scheduled)\b/i.test(line) && !(SENT.test(line) && d.date === sent_on)) { flight_date = d.date; break; }
        }
      }

      const airlineSide = t.replace(new RegExp(SELF_CANCEL.source, "gi"), " ");
      const took_voucher = hit(TOOK_VOUCHER, t), took_flight = hit(TOOK_FLIGHT, t), declined = DECLINED.test(t);
      const conflict = !took_voucher && !took_flight && declined && YOU_TOOK.test(t);
      const decision = took_voucher ? "took_voucher" : took_flight ? "took_flight" : declined && !conflict ? "declined" : null;
      // Amounts the person wrote: used only to pick their own card row, never stated as owed themselves.
      const amounts = [...t.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g)].map(m => Number(m[1].replace(/,/g, "")) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0));
      const bagSaid = BAG_WORD.test(t) && BAG_LATE.test(t);
      return {
        airline, flight: fnum, booking_ref, scope, flight_date, sent_on, amounts, dropped: cleaned.dropped,
        cancelled: !bump && CANCELLED.test(airlineSide),
        self_cancelled: !bump && SELF_CANCEL.test(t) && !CANCELLED.test(airlineSide),
        change_minutes,
        decision, voucher_offered: VOUCHER_OFFER.test(t),
        bag: bagSaid ? { delay_minutes: bag_delay, report: REPORT_NO.test(t) ? false : REPORT_YES.test(t) ? true : null, flight_minutes } : null,
        extras: extrasOf(t),
        bump: bump ? { voluntary: INVOLUNTARY.test(t) ? false : VOLUNTARY.test(t) ? true : null, arrival_delay_minutes: arrival_delay, one_way: /\bone[- ]way\b/i.test(t) } : null,
      };
    }

    // ---- the person's card rows ----

    const usable = rows => (rows || []).filter(r => r && Number.isSafeInteger(r.amount_cents) && validYmd(r.posted_on) && !r.is_transfer);
    const asOf = rows => (rows || []).filter(r => r && validYmd(r.posted_on)).map(r => ymd(r.posted_on)).sort().slice(-1)[0] || null;

    // The charge a claim is about, from the person's own rows: the airline's debit (a Wi-Fi provider's for Wi-Fi), in the
    // window for its kind around the flight date, matched to the cent when the person gave an amount. One row or none;
    // several come back as choices, never a guess.
    function pickRow(kind, facts, rows) {
      const air = facts.airline, fd = validYmd(facts.flight_date) ? dayNum(facts.flight_date) : null;
      let c = usable(rows).filter(r => r.amount_cents < 0);
      if (kind === "wifi") c = c.filter(r => WIFI_ROW.test(r.merchant_raw) && (!air || air.row.test(r.merchant_raw) || !AIRLINES.some(a => a.row.test(r.merchant_raw))));
      else { if (!air) return { row: null, candidates: [], why: "no_airline" }; c = c.filter(r => air.row.test(r.merchant_raw) && !WIFI_ROW.test(r.merchant_raw)); }
      if (fd !== null) {
        const near = r => Math.abs(dayNum(r.posted_on) - fd) <= 1;
        if (kind === "fare") c = c.filter(r => dayNum(r.posted_on) < fd - 1);
        else if (kind === "seat") c = c.filter(r => dayNum(r.posted_on) <= fd + 1);
        else c = c.filter(near);
      }
      // An amount the person gave narrows to that charge when one of these is it; an amount about something else doesn't.
      const said = (facts.amounts || []).filter(Number.isSafeInteger);
      if (said.length && c.some(r => said.includes(Math.abs(r.amount_cents)))) c = c.filter(r => said.includes(Math.abs(r.amount_cents)));
      c = c.slice().sort((a, b) => ymd(b.posted_on).localeCompare(ymd(a.posted_on)));
      if (c.length === 1) return { row: c[0], candidates: c, why: null };
      return { row: null, candidates: c.slice(0, MAX_PICK), why: c.length ? "several" : "none" };
    }

    // A credit from the airline (or the Wi-Fi provider) on or after the earlier of the flight and the request.
    function creditRow(facts, rows, kinds) {
      const air = facts.airline;
      const from = [facts.sent_on, facts.flight_date].filter(validYmd).map(dayNum);
      const start = from.length ? Math.min(...from) : null;
      return usable(rows).filter(r => r.amount_cents > 0 && !r.is_pending && (start === null || dayNum(r.posted_on) >= start)
        && ((air && air.row.test(r.merchant_raw)) || (kinds.includes("wifi") && WIFI_ROW.test(r.merchant_raw))))
        .sort((a, b) => ymd(a.posted_on).localeCompare(ymd(b.posted_on)))[0] || null;
    }

    // ---- the rules, every number from the offer book ----

    function assess(facts, rows, opts) {
      const o = opts || {};
      const book = o.book || (typeof OfferBook !== "undefined" && typeof OFFER_TERMS_JSON !== "undefined" ? OfferBook.create(OFFER_TERMS_JSON) : null);
      if (!book) throw new Error("AirlineRefunds needs the offer book");
      const today = o.today;
      const term = id => book.term(id, today);
      const cite = id => term(id).cite;
      const f = Object.assign({}, facts);
      if (f.sent_on === undefined) f.sent_on = null;
      const claims = [], missing = [];
      const ask = q => { if (!missing.includes(q)) missing.push(q); };
      const rowLine = (p, what) => p.row ? null : p.why === "several"
        ? `I see ${p.candidates.length} ${what} charges that could be it: ${p.candidates.map(r => `${money(r.amount_cents)} on ${nice(r.posted_on)}`).join(", ")}. Which one is it?`
        : null;

      // 1. Cancelled, or changed by more than the limit, and the new flight turned down: the fare back.
      const changeMin = Number.isFinite(f.change_minutes) ? f.change_minutes : null;
      if (f.cancelled || changeMin !== null) {
        const c = { type: "refund", status: null, lines: [], cites: [] };
        let eventMet = false, eventLine = null;
        if (f.cancelled) { eventMet = true; eventLine = `${f.airline ? f.airline.name : "The airline"} cancelled the flight.`; }
        else {
          const dom = term(T.CHANGE_DOM), intl = term(T.CHANGE_INTL);
          const limit = f.scope === "international" ? intl : f.scope === "domestic" ? dom : null;
          c.cites.push(dom.id, intl.id);
          if (limit) {
            eventMet = changeMin > limit.value * 60;
            eventLine = eventMet
              ? `The schedule changed by ${hm(changeMin)}, more than the ${plural(limit.value, "hour")} the DOT rule allows on ${f.scope === "international" ? "an international" : "a domestic"} flight (${limit.cite}).`
              : `The schedule changed by ${hm(changeMin)}, which is not more than the ${plural(limit.value, "hour")} the DOT rule sets for ${f.scope === "international" ? "an international" : "a domestic"} flight (${limit.cite}), so the time change alone doesn't make a refund owed.`;
          } else if (changeMin > Math.max(dom.value, intl.value) * 60) {
            eventMet = true;
            eventLine = `The schedule changed by ${hm(changeMin)}, more than the DOT limit for domestic (${plural(dom.value, "hour")}) and international (${plural(intl.value, "hour")}) flights alike (${intl.cite}).`;
          } else if (changeMin <= Math.min(dom.value, intl.value) * 60) {
            eventLine = `The schedule changed by ${hm(changeMin)}, which is not more than the ${plural(Math.min(dom.value, intl.value), "hour")} the DOT rule sets even for a domestic flight (${dom.cite}), so the time change alone doesn't make a refund owed.`;
          } else {
            eventMet = null;
            ask(`Was the flight domestic (within the US) or international? A ${hm(changeMin)} change counts on a domestic flight (more than ${plural(dom.value, "hour")}) but not on an international one (more than ${plural(intl.value, "hour")}) (${dom.cite}).`);
          }
        }
        if (eventLine) c.lines.push(eventLine);
        if (eventMet === false) c.status = "not_owed";
        else if (f.decision === "took_voucher") {
          c.status = "not_owed";
          c.lines.push(`You accepted a voucher or travel credit, and accepting one can waive the cash refund under the DOT rule (${cite(T.CARD_DAYS)}). If you haven't used it, ask ${f.airline ? f.airline.name : "the airline"} in writing whether it will swap it for the cash refund.`);
        } else if (f.decision === "took_flight") {
          c.status = "not_owed";
          c.lines.push(`You took the new flight, so the cash refund right doesn't apply: it's owed only when you turn the new flight down (${cite(T.CARD_DAYS)}).`);
        } else {
          // Nothing accepted yet: warn before a voucher, whatever else is still to settle.
          c.voucher_warning = true;
          if (f.decision !== "declined") ask(`Did you turn down the new flight and any voucher, or did you accept one? The cash refund is owed only if you turned them down (${cite(T.CARD_DAYS)}).`);
          if (eventMet === true && f.decision === "declined") {
            c.status = "owed";
            c.lines.push(`You turned the new flight down, so under the DOT rule ${f.airline ? f.airline.name : "the airline"} owes you a cash refund of the full ticket price, taxes and fees included, to your original form of payment (${cite(T.CARD_DAYS)}).`);
          } else c.status = "missing";
        }
        if (c.status === "owed") {
          c.pick = pickRow("fare", f, rows);
          c.amount = c.pick.row ? -c.pick.row.amount_cents : null;
          const l = rowLine(c.pick, f.airline ? f.airline.name : "airline"); if (l) ask(l);
        }
        claims.push(c);
      }

      // 2. A checked bag later than the limit, with a mishandled-bag report: the bag fee back.
      if (f.bag) {
        const c = { type: "bag", status: null, lines: [] };
        const dom = term(T.BAG_DOM), lo = term(T.BAG_INTL_MIN), hi = term(T.BAG_INTL_MAX);
        const d = f.bag.delay_minutes;
        let late = null;
        if (!Number.isFinite(d)) ask("How many hours after your flight landed did the bag arrive?");
        else if (f.scope === "domestic") {
          late = d > dom.value * 60;
          c.lines.push(late ? `Your bag arrived ${hm(d)} after landing, later than the ${plural(dom.value, "hour")} the DOT rule allows on a domestic flight (${dom.cite}).`
            : `Your bag arrived ${hm(d)} after landing, within the ${plural(dom.value, "hour")} the DOT rule allows on a domestic flight (${dom.cite}), so the bag fee isn't owed back.`);
        } else if (f.scope === "international") {
          if (d > hi.value * 60) { late = true; c.lines.push(`Your bag arrived ${hm(d)} after landing, later than even the longest limit for an international flight, ${plural(hi.value, "hour")} (${hi.cite}).`); }
          else if (d <= lo.value * 60) { late = false; c.lines.push(`Your bag arrived ${hm(d)} after landing, within the shortest limit for an international flight, ${plural(lo.value, "hour")} (${lo.cite}), so the bag fee isn't owed back.`); }
          else { c.lines.push(`On an international flight the limit is ${lo.value} to ${plural(hi.value, "hour")} depending on the flight's length (${lo.cite}); ${hm(d)} falls in between, and the length cut-off isn't in my terms, so I can't say it's owed. Ask ${f.airline ? f.airline.name : "the airline"} which limit applies to your flight.`); late = null; c.unclear = true; }
        } else if (d > Math.max(dom.value, hi.value) * 60) { late = true; c.lines.push(`Your bag arrived ${hm(d)} after landing, later than the DOT limit for domestic (${plural(dom.value, "hour")}) and international (up to ${plural(hi.value, "hour")}) flights alike (${hi.cite}).`); }
        else if (d <= Math.min(dom.value, lo.value) * 60) { late = false; c.lines.push(`Your bag arrived ${hm(d)} after landing, within the ${plural(Math.min(dom.value, lo.value), "hour")} the DOT rule allows even on a domestic flight (${dom.cite}), so the bag fee isn't owed back.`); }
        else ask(`Was the flight domestic or international? The DOT limit is ${plural(dom.value, "hour")} on a domestic flight and ${lo.value} to ${plural(hi.value, "hour")} on an international one (${dom.cite}).`);
        if (late === false) c.status = "not_owed";
        else if (late === true) {
          if (f.bag.report === true) { c.status = "owed"; c.lines.push(`You filed a mishandled-bag report, so the checked bag fee is owed back to your original form of payment.`); }
          else if (f.bag.report === false) { c.status = "not_owed"; c.lines.push(`The refund needs a mishandled-bag report filed with ${f.airline ? f.airline.name : "the airline"}. File one now and ask whether it will still refund the fee; it may say it's too late.`); }
          else { c.status = "missing"; ask("Did you file a mishandled-bag report with the airline (at the airport or online)? The bag fee refund needs one."); }
        } else c.status = c.unclear ? "unclear" : "missing";
        if (c.status === "owed") {
          c.pick = pickRow("bag", f, rows);
          c.amount = c.pick.row ? -c.pick.row.amount_cents : null;
          const l = rowLine(c.pick, f.airline ? f.airline.name : "airline"); if (l) ask(l);
        }
        claims.push(c);
      }

      // 3. A paid extra the airline didn't provide (Wi-Fi, seat selection, inflight entertainment): its fee back.
      for (const e of f.extras || []) {
        const c = { type: "extra", kind: e.kind, status: null, lines: [] };
        const label = { wifi: "Wi-Fi", seat: "seat", entertainment: "inflight entertainment" }[e.kind];
        if (e.delivered === "partial") {
          c.status = "missing";
          ask(`Did the ${label} not work at all, or was it just slow? The DOT rule refunds a paid extra the airline didn't provide (${cite(T.EXTRAS)}); one that worked badly isn't covered.`);
        } else {
          c.pick = pickRow(e.kind === "wifi" ? "wifi" : e.kind === "seat" ? "seat" : "extra", f, rows);
          const paid = e.paid || !!c.pick.row;
          if (!paid) { c.status = "missing"; ask(`Did you pay for the ${label}? I don't see the charge in your card rows.`); }
          else {
            c.status = "owed";
            c.lines.push(`You paid for ${label} and didn't get it. The DOT rule names ${term(T.EXTRAS).value} among the paid extras an airline must refund when it doesn't provide them (${cite(T.EXTRAS)}).`);
            c.amount = c.pick.row ? -c.pick.row.amount_cents : null;
            const l = rowLine(c.pick, e.kind === "wifi" ? "Wi-Fi" : (f.airline ? f.airline.name : "airline")); if (l) ask(l);
          }
        }
        claims.push(c);
      }

      // 4. Bumped against your will: a multiple of the one-way fare, capped, by how late you arrived (domestic).
      if (f.bump) {
        const c = { type: "bump", status: null, lines: [] };
        const min = term(T.BUMP_MIN), over = term(T.BUMP_LONG_OVER);
        const bumpSource = term(T.BUMP_SHORT_X).source;
        if (f.bump.voluntary === true) {
          c.status = "negotiable";
          c.lines.push(`You volunteered to give up your seat, so what you get is whatever you and the airline agreed: it's negotiable, not owed under the rule. Before you accept, you can ask for cash or more, and ask when the voucher expires (${bumpSource.title}).`);
        } else if (f.bump.voluntary === null) {
          c.status = "missing";
          ask("Did you give up your seat voluntarily, or did the airline bump you against your will? Only an involuntary bump is owed compensation under the DOT rule.");
        } else if (f.scope === "international") {
          c.status = "unclear";
          c.lines.push(`An involuntary bump on a flight from the US to another country is covered too, but the DOT bands for international flights aren't in my terms, so I won't put a number on it. DOT's page: ${bumpSource.url}`);
        } else if (f.scope !== "domestic") {
          c.status = "missing";
          ask("Was the flight domestic (within the US) or international? The compensation bands I have are for domestic flights.");
        } else if (!Number.isFinite(f.bump.arrival_delay_minutes)) {
          c.status = "missing";
          ask("How much later than planned did you get to your final destination? The compensation depends on it.");
        } else {
          const late = f.bump.arrival_delay_minutes;
          if (late < min.value * 60) {
            c.status = "not_owed";
            c.lines.push(`You got there ${hm(late)} late, under the ${plural(min.value, "hour")} at which the DOT rule starts compensation for an involuntary bump (${min.cite}), so nothing is owed under it.`);
          } else {
            const long = late > over.value * 60;
            const x = term(long ? T.BUMP_LONG_X : T.BUMP_SHORT_X), cap = term(long ? T.BUMP_LONG_CAP : T.BUMP_SHORT_CAP);
            c.status = "owed";
            const band = long ? `more than ${plural(over.value, "hour")}` : `between ${min.value} and ${plural(over.value, "hour")}`;
            let fare = null;
            if (f.bump.one_way) { const p = pickRow("fare", f, rows); c.pick = p; if (p.row) fare = -p.row.amount_cents; else { const l = rowLine(p, f.airline ? f.airline.name : "airline"); if (l) ask(l); } }
            const pct = Math.round(x.value * 100);
            const cites = x.cite === cap.cite ? x.cite : `${x.cite}; cap ${cap.cite}`;
            if (fare !== null) {
              c.amount = Math.min(Math.round(fare * x.value), cap.value);
              c.capped = Math.round(fare * x.value) > cap.value;
              c.lines.push(`You were bumped against your will and got there ${hm(late)} late, ${band} late on a domestic flight, so the DOT rule owes you ${pct}% of your one-way fare, up to ${money(cap.value)} (${cites}). ${pct}% of ${money(fare)} is ${money(Math.round(fare * x.value))}${c.capped ? `, over the cap, so ${money(c.amount)}` : ""}: ${money(c.amount)} in cash or check, not just a voucher.`);
            } else {
              c.amount = null;
              c.lines.push(`You were bumped against your will and got there ${hm(late)} late, ${band} late on a domestic flight, so the DOT rule owes you ${pct}% of your one-way fare, up to ${money(cap.value)} (${cites}), in cash or check, not just a voucher.`);
              ask(f.bump.one_way ? "What was your one-way fare? I couldn't find it in your card rows." : "Was your ticket one-way? The compensation is a multiple of the one-way fare; for a round trip, tell me the one-way fare for the bumped flight.");
            }
          }
        }
        claims.push(c);
      }

      // The card credit: due within N business days of the request; a credit row means it's done; only after the watch
      // date passes with no credit row is the complaint text written.
      const owed = claims.filter(c => c.status === "owed" && c.type !== "bump");
      let watch = null;
      if (owed.length) {
        const days = term(T.CARD_DAYS);
        if (validYmd(f.sent_on)) {
          const due = addBusinessDays(f.sent_on, days.value);
          const credit = creditRow(f, rows, owed.map(c => c.kind || c.type));
          const passed = validYmd(today) && dayNum(today) > dayNum(due);
          watch = { sent_on: f.sent_on, due, credit, passed, complaint: !credit && passed, days, cite: days.cite };
        } else watch = { sent_on: null, due: validYmd(today) ? addBusinessDays(today, days.value) : null, credit: null, passed: false, complaint: false, days, cite: days.cite };
      }
      return { facts: f, claims, missing, watch, as_of: asOf(rows), rows_seen: usable(rows).length };
    }

    // ---- the reply ----

    function requestText(f, claims) {
      const air = f.airline ? f.airline.name : "the airline";
      const flight = [f.flight ? `flight ${f.flight}` : "my flight", f.flight_date ? `on ${nice(f.flight_date)}` : null].filter(Boolean).join(" ");
      const ref = f.booking_ref ? ` (booking reference ${f.booking_ref})` : "";
      const asks = [];
      for (const c of claims.filter(c => c.status === "owed")) {
        if (c.type === "refund") asks.push(`${f.cancelled ? "The flight was cancelled" : `The flight's schedule was changed by ${hm(f.change_minutes)}`}, and I declined the new flight and any voucher or travel credit. Under the DOT rule requiring automatic refunds, please refund ${c.amount != null ? `the full ticket price of ${money(c.amount)}` : "the full ticket price, including taxes and fees,"} to my original form of payment.`);
        if (c.type === "bag") asks.push(`My checked bag arrived ${hm(f.bag.delay_minutes)} after the flight landed, and I filed a mishandled-bag report (report number: add yours). Under the DOT rule, please refund the checked bag fee${c.amount != null ? ` of ${money(c.amount)}` : ""} to my original form of payment.`);
        if (c.type === "extra") asks.push(`I paid for ${{ wifi: "Wi-Fi", seat: "a seat selection", entertainment: "inflight entertainment" }[c.kind]} on this flight and didn't get it. Please refund the ${c.amount != null ? `${money(c.amount)} fee` : "fee"} to my original form of payment.`);
        if (c.type === "bump") asks.push(`I was denied boarding involuntarily and arrived ${hm(f.bump.arrival_delay_minutes)} late at my final destination. Under the DOT oversales rule, please pay the denied boarding compensation${c.amount != null ? ` of ${money(c.amount)}` : ""} in cash or by check.`);
      }
      return `"Hello ${air}, I'm writing about ${flight}${ref}. ${asks.join(" ")} Please confirm in writing. Thank you."`;
    }

    function complaintText(f, a) {
      const air = f.airline ? f.airline.name : "the airline";
      const total = a.claims.filter(c => c.status === "owed" && c.type !== "bump");
      const what = total.map(c => c.type === "refund" ? `a refund of ${c.amount != null ? money(c.amount) : "the full ticket price"} for ${f.flight ? `flight ${f.flight}` : "my flight"}${f.flight_date ? ` on ${nice(f.flight_date)}` : ""}, which was ${f.cancelled ? "cancelled" : `changed by ${hm(f.change_minutes)}`} and whose new flight I declined`
        : c.type === "bag" ? `a refund of the checked bag fee${c.amount != null ? ` (${money(c.amount)})` : ""} for a bag delivered ${hm(f.bag.delay_minutes)} late, with a mishandled-bag report filed`
        : `a refund of the ${c.amount != null ? `${money(c.amount)} ` : ""}fee for ${{ wifi: "Wi-Fi", seat: "a seat selection", entertainment: "inflight entertainment" }[c.kind]} I paid for and didn't get`).join("; and ");
      return `"On ${nice(a.watch.sent_on)} I asked ${air} for ${what}${f.booking_ref ? ` (booking reference ${f.booking_ref})` : ""}. Under the DOT rule, refunds to a card are due within ${plural(a.watch.days.value, "business day")}. As of ${nice(a.today)}, no refund has posted to my card. I'm asking DOT to help me get it."`;
    }

    function render(a, today) {
      const f = a.facts, air = f.airline ? f.airline.name : "the airline";
      const owed = a.claims.filter(c => c.status === "owed");
      const out = [];
      if (owed.length && a.watch && a.watch.sent_on) out.push(`Here's where your refund from ${air} stands under the DOT rules. Upmore doesn't contact the airline, file anything or pay anything.`);
      else if (owed.length) out.push(`Here's what ${air} owes you under the DOT rules, and a request you send yourself. Nothing has been sent: Upmore doesn't contact the airline, file anything or pay anything.`);
      else out.push(`Here's how the DOT rules read on what you told me. Nothing has been sent: Upmore doesn't contact the airline, file anything or pay anything.`);
      if (f.dropped) out.push(`(I skipped ${plural(f.dropped, "sentence")} in what you pasted that read like instructions to me; only the flight facts count.)`);
      for (const c of a.claims) for (const l of c.lines) out.push(l);
      if (a.claims.some(c => c.voucher_warning)) out.push(`Before you accept a voucher or travel credit: accepting one can waive your cash refund. If you want the money, turn the voucher and the new flight down in writing.`);
      if (a.missing.length) {
        out.push("", owed.length ? "To finish the request I need:" : "To say whether money is owed, I need:");
        a.missing.forEach((q, i) => out.push(`${i + 1}. ${q}`));
      }
      const usedRows = a.claims.filter(c => c.pick && c.pick.row && c.status === "owed");
      if (owed.length && a.watch && a.watch.sent_on) {
        const w = a.watch;
        out.push("");
        if (w.credit) out.push(`The refund posted: ${air} credited ${money(w.credit.amount_cents)} on ${nice(w.credit.posted_on)}. That one's done.`);
        else if (w.complaint) {
          out.push(`You asked on ${nice(w.sent_on)}; card refunds are due within ${plural(w.days.value, "business day")} (${w.cite}), so it was due by ${nice(w.due)}, and no credit from ${air} has posted to your card since. You can file with the DOT yourself at ${COMPLAINT_URL}. Here's the text:`);
          out.push(complaintText(f, Object.assign({}, a, { today })));
        } else out.push(`You asked on ${nice(w.sent_on)}; card refunds are due within ${plural(w.days.value, "business day")} (${w.cite}), so it's due by ${nice(w.due)} (weekends skipped; a federal holiday adds a day). No credit has posted yet; if none has by then, tell me and I'll write the DOT complaint for you to file.`);
      } else if (owed.length && !a.missing.some(q => /^Which one|charges that could be it/.test(q))) {
        out.push("", `Send this to ${air} (their refund form, app or email):`, requestText(f, a.claims));
        if (a.watch && a.watch.due) out.push(`If the refund goes back to a card, it's due within ${plural(a.watch.days.value, "business day")} (${a.watch.cite}): sent today, that's by ${nice(a.watch.due)} (weekends skipped; a federal holiday adds a day). When you've sent it, tell me again with the day you sent it (like "${air} cancelled my flight, I declined the new one, and requested my refund on Oct 3") and I'll check your card rows for the credit.`);
      }
      for (const c of usedRows) out.push(`Amount from your card: ${money(c.pick.row.amount_cents)} from ${air === "the airline" ? "the charge" : c.kind === "wifi" ? "the Wi-Fi charge" : air}, posted ${nice(c.pick.row.posted_on)}.`);
      if (usedRows.length || (a.watch && a.watch.sent_on && owed.length)) out.push(a.as_of ? `From your linked accounts, as of ${a.as_of}.` : "No linked card rows to check.");
      else if (owed.some(c => c.amount == null && c.type !== "bump")) out.push(a.rows_seen ? `I didn't find the charge in your linked accounts (checked through ${a.as_of}), so the request asks for the fee or fare without a number; the airline has it on record.` : "No card is linked, so the request asks for the fee or fare without a number; connect the card in the app (Home, then Connect bank) and I'll put in the amount from your own charge.");
      return out.join("\n").replace(/\n{3,}/g, "\n\n");
    }

    // The whole answer. Returns { kind, text, assessment } with kind one of not_airline (text null), owed, not_owed, ask,
    // negotiable, credited, watch, complaint.
    function answer(text, rows, opts) {
      const o = opts || {};
      if (!isAirlineAsk(text)) return { kind: "not_airline", text: null };
      const facts = parse(text, o.today);
      if (o.sent_on) facts.sent_on = o.sent_on;
      const a = assess(facts, rows, o);
      if (!a.claims.length && facts.self_cancelled) {
        const air = facts.airline ? facts.airline.name : "the airline";
        return { kind: "not_owed", assessment: a, text: `You said you cancelled this flight yourself. The DOT refund rule I check covers a flight the airline cancels or changes significantly, so it doesn't apply here: what you get back depends on your fare's rules with ${air}. If ${air} cancelled or changed the flight first, tell me how and I'll check again. Nothing has been sent: Upmore doesn't contact the airline, file anything or pay anything.` };
      }
      if (!a.claims.length) {
        return { kind: "ask", assessment: a, text: "I can check what an airline owes you under the DOT rules. Tell me what happened: was the flight cancelled or changed (and by how many hours), was a checked bag late, did a paid extra like Wi-Fi or a seat not come through, or were you bumped? Nothing has been sent." };
      }
      const owed = a.claims.some(c => c.status === "owed");
      const kind = a.watch && a.watch.sent_on && owed ? (a.watch.credit ? "credited" : a.watch.complaint ? "complaint" : "watch")
        : owed ? "owed" : a.missing.length ? "ask" : a.claims.some(c => c.status === "negotiable") ? "negotiable"
        : a.claims.some(c => c.status === "unclear") ? "unclear" : "not_owed";
      return { kind, assessment: a, text: render(a, o.today) };
    }

    return { COMPLAINT_URL, TERMS: T, isAirlineAsk, cleanText, parse, pickRow, assess, answer, addBusinessDays };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AirlineRefunds;
