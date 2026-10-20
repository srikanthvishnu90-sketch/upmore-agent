// WO-020 part 2: a stated answer onto the employer's own options, by meaning. "Yes" finds "Yes, I am authorized"; a
// bachelor's degree finds "Bachelor's Degree" or "Undergraduate Degree"; 2 weeks' notice finds "1-2 weeks"; 6 years
// finds "4 – 7 years" or, of "1+ years ... 5+ years", the highest it reaches; "decline" finds "Prefer not to say". It only
// chooses among the options the form offers, and returns null when none fits or more than one fits equally: an unmatched
// answer is asked, never forced. Nothing here invents a value; the value is the person's own.
export interface Opt { label: string; value: string }

const low = (s: unknown) => String(s ?? "").toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
const only = (xs: Opt[]) => (xs.length === 1 ? xs[0].value : null);

const YES = /^(yes|yeah|yep|sí|si|ja|oui|はい|true|i am\b|i do\b|i have\b|i will\b|i can\b|i agree|i accept|i acknowledge|i understand|acknowledge|agree|accept|consent|confirm|read and understood|i consent)/;
const NO = /^(no\b|non\b|nee\b|いいえ|false|i am not|i'?m not|i do not|i don'?t|i have not|i haven'?t|i have never|i'?ve never|i will not|i won'?t|i cannot|i can'?t|i did not|not\b|never\b|none\b)/;
// The no-forms first: "I am not a U.S. person" and "I do not have an agreement" begin like a yes.
export function yesNoOf(v: unknown): "yes" | "no" | null {
  const t = low(v);
  return NO.test(t) ? "no" : YES.test(t) ? "yes" : null;
}
function byYesNo(want: "yes" | "no", options: Opt[]): string | null {
  const hit = options.filter((o) => yesNoOf(o.label) === want);
  if (hit.length === 1) return hit[0].value;
  // "Yes - Currently" and "Yes - Previously" are two different yeses: never pick one for the person. Plain "Yes" wins.
  const plain = hit.filter((o) => /^(yes|no|sí|si|ja|nee|oui|non|はい|いいえ)[.!]?$/i.test(o.label.trim()));
  return only(plain);
}

const DECLINE = /decline|prefer not|\bnot declared\b|rather not|do not wish|don'?t wish|not (to )?(answer|disclose|say|self-identify|specify)|choose not|i don'?t want to answer|ne préfère pas/;

const EDUCATION: Record<string, RegExp> = {
  high_school: /high school|ged|secondary|diploma or equivalent/,
  some_college: /some college|some university|enrollment/,
  associate: /associate/,
  // "B.A." inside "M.B.A." is not a bachelor's (WO-042, Greenhouse's degree list).
  bachelor: /bachelor|undergraduate degree|(?<![a-z]\.)\bb\.?s\.?c?\b|(?<![a-z]\.)\bb\.?a\.?\b|\bbsc\b/,
  master: /master|\bm\.?s\.?c?\b|\bmba\b|graduate degree(?!.*under)/,
  doctorate: /ph\.?d|doctor|doctoral/,
};

const STATES: Record<string, string> = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california", co: "colorado", ct: "connecticut", de: "delaware",
  dc: "district of columbia", fl: "florida", ga: "georgia", hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
  ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland", ma: "massachusetts", mi: "michigan", mn: "minnesota",
  ms: "mississippi", mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire", nj: "new jersey",
  nm: "new mexico", ny: "new york", nc: "north carolina", nd: "north dakota", oh: "ohio", ok: "oklahoma", or: "oregon",
  pa: "pennsylvania", ri: "rhode island", sc: "south carolina", sd: "south dakota", tn: "tennessee", tx: "texas", ut: "utah",
  vt: "vermont", va: "virginia", wa: "washington", wv: "west virginia", wi: "wisconsin", wy: "wyoming",
};
const US = /^(us|u\.s\.?|usa|u\.s\.a\.?|united states( of america)?|america)$/;
// What to type into an employer's place search for a stated place: the city of "Chicago, IL", or the state's full name
// for a state given by its abbreviation ("IL" -> "Illinois"), since a place search lists places by name (WO-042).
export function placeQuery(value: unknown): string {
  const v = String(value ?? "").trim();
  const st = STATES[low(v)];
  if (st) return st.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return v.split(",")[0].trim();
}

// A span of time in one unit (weeks for notice, years for experience): "1-2 weeks", "4+ weeks", "Less than 4 years",
// "1 Month", "Immediately", "No experience". [min, max]; max Infinity for "N+".
function span(label: string, unit: "weeks" | "years"): [number, number] | null {
  const t = low(label).replace(/–|—/g, "-");
  if (/immediate|none\/immediate|no experience|^none$|^0$/.test(t)) return [0, 0];
  const per = (u: string) => (unit === "weeks" ? (/month/.test(u) ? 4.345 : /day/.test(u) ? 1 / 7 : /year/.test(u) ? 52 : 1) : (/month/.test(u) ? 1 / 12 : 1));
  const u = (/(day|week|month|year)/.exec(t) || [, unit === "weeks" ? "week" : "year"])[1]!;
  const k = per(u);
  let m = /less than (\d+(?:\.\d+)?)/.exec(t);
  if (m) return [0, Number(m[1]) * k - 1e-9];
  m = /(\d+(?:\.\d+)?)\s*(?:\+|or more|and above|plus)|more than (\d+(?:\.\d+)?)/.exec(t);
  if (m) return [Number(m[1] ?? m[2]) * k, Infinity];
  m = /(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/.exec(t);
  if (m) return [Number(m[1]) * k, Number(m[2]) * k];
  m = /^(\d+(?:\.\d+)?)\b/.exec(t);
  if (m) return [Number(m[1]) * k, Number(m[1]) * k];
  return null;
}
function amount(value: string, unit: "weeks" | "years"): number | null {
  const t = low(value);
  if (/immediate|now|right away|asap|^none$|^0$/.test(t)) return 0;
  const m = /(\d+(?:\.\d+)?)\s*(day|week|month|year)?/.exec(t);
  if (!m) return null;
  const n = Number(m[1]), u = m[2] ?? (unit === "weeks" ? "week" : "year");
  return unit === "weeks" ? n * (u === "month" ? 4.345 : u === "day" ? 1 / 7 : u === "year" ? 52 : 1) : n * (u === "month" ? 1 / 12 : 1);
}
function bySpan(value: string, options: Opt[], unit: "weeks" | "years"): string | null {
  const v = amount(value, unit);
  if (v === null) return null;
  const spans = options.map((o) => ({ o, s: span(o.label, unit) })).filter((x) => x.s);
  const inside = spans.filter((x) => v >= x.s![0] - 1e-9 && v <= x.s![1] + 1e-9);
  if (inside.length <= 1) return inside[0]?.o.value ?? null;
  // "1+ years ... 5+ years": several open spans contain it; the one with the highest floor is the true one. Two closed
  // spans sharing an edge ("1-3 years", "3-5 years" for 3) is a guess either way: asked.
  if (!inside.every((x) => x.s![1] === Infinity)) return null;
  inside.sort((a, b) => b.s![0] - a.s![0]);
  return inside[0].s![0] === inside[1].s![0] ? null : inside[0].o.value;
}

// WO-048: a stated pay amount onto a list of pay ranges ("$80,000 - $99,999", "$120,000+", "80k - 100k"): the one range it
// falls in. An amount on the edge of two ranges, a list that is not ranges, or an amount that is not a number: asked.
const money = (s: string): number | null => {
  const m = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?$/i.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return m[2] ? n * 1000 : n;
};
function byPayRange(value: string, options: Opt[]): string | null {
  const v = money(String(value).replace(/\s*(usd|dollars|per year|a year|\/ ?(yr|year))\s*$/i, ""));
  if (v === null || v < 1000) return null;
  const ranges = options.map((o) => {
    const t = low(o.label).replace(/–|—/g, "-").replace(/\s*(usd|per year|annually|\/ ?(yr|year))\s*$/, "");
    let m = /^(.+?)\s*(?:-|to)\s*(.+)$/.exec(t);
    if (m && money(m[1]) !== null && money(m[2]) !== null) return { o, lo: money(m[1])!, hi: money(m[2])! };
    m = /^(.+?)\s*(?:\+|or more|and above)$/.exec(t);
    if (m && money(m[1]) !== null) return { o, lo: money(m[1])!, hi: Infinity };
    m = /^(?:less than|under|below)\s+(.+)$/.exec(t);
    if (m && money(m[1]) !== null) return { o, lo: 0, hi: money(m[1])! - 0.01 };
    return null;
  }).filter((x): x is { o: Opt; lo: number; hi: number } => !!x);
  return only(ranges.filter((r) => v >= r.lo && v <= r.hi).map((r) => r.o));
}

// How the person heard, as their usual answer onto the employer's list: the careers page has many names.
const HOW_HEARD: [RegExp, RegExp][] = [
  [/career|company (web)?site|website|direct/, /career(s)? (site|page|website)|careers at|company (careers page|website|site)|^website$|^career page$|^careers? site$|direct to careers|web ?site/],
  [/linkedin/, /^linked ?in( jobs)?$|^linkedin$/],
  [/indeed/, /^indeed$/],
  [/glassdoor/, /^glassdoor$/],
];
// A how-heard answer that names a channel (a careers site, LinkedIn): one that can be true of every employer.
export const howHeardChannel = (value: string) => HOW_HEARD.some(([v]) => v.test(low(value)));
// A yes/no question whose answer follows from a stated fact: a citizenship or residence that names the country asked
// about, an education level at or above the one asked, a notice period or start shorter than the one asked.
export function yesNoFromFact(fact: string, value: string, question: string): "yes" | "no" | null {
  const q = low(question), v = low(value);
  const usAsked = /\bu\.?s\.?a?\b|united states|\bamerica\b/.test(q);
  // "In Canada or the U.S.?", "a U.S. citizen or permanent resident?": a yes from the person's country is right; a no is not
  // known, since the other half may be true of them (WO-047).
  if ((fact === "citizenship" || fact === "country") && usAsked) return US.test(v) ? "yes" : v && !/\bor\b/.test(q) ? "no" : null;
  if (fact === "education_level") {
    const order = ["high_school", "some_college", "associate", "bachelor", "master", "doctorate"];
    const have = order.indexOf(v.replace(/'s|s$/g, "").replace(/ degree$/, ""));
    if (have < 0) return null;
    if (/high school|ged/.test(q)) return have >= 0 ? "yes" : "no";
    if (/higher education degree|college degree|university degree/.test(q)) return have >= 2 ? "yes" : "no";
    if (/bachelor/.test(q)) return have >= 3 ? "yes" : "no";
    return null;
  }
  if (fact === "notice_period" || fact === "start_date") {
    const m = /(less than|within|under) (\d+) (day|week|month)s?/.exec(q);
    const have = amount(value, "weeks");
    if (!m || have === null) return null;
    const limit = Number(m[2]) * (m[3] === "month" ? 4.345 : m[3] === "day" ? 1 / 7 : 1);
    return have <= limit ? "yes" : "no";
  }
  return null;
}

export function chooseOption(fact: string, value: string, options: Opt[], question = ""): string | null {
  if (!options.length) return null;
  const v = low(value);
  // The person's own words, exactly as an option: always first.
  const exact = options.filter((o) => low(o.label) === v || low(o.value) === v);
  if (exact.length) return exact[0].value;
  if (DECLINE.test(v) || v === "decline") return only(options.filter((o) => DECLINE.test(low(o.label))));
  const derived = question ? yesNoFromFact(fact, value, question) : null;
  // A derived yes or no lands only on a yes or no option; a list with no yes ("Master's | Bachelor's | ... | Not
  // applicable", "Canada | US | Other") is answered by the fact itself, below (WO-047).
  if (derived) {
    const yn = byYesNo(derived, options);
    if (yn || options.some((o) => yesNoOf(o.label) === "yes")) return yn;
  }
  switch (fact) {
    case "how_heard": {
      const rule = HOW_HEARD.find(([v2]) => v2.test(v));
      return rule ? only(options.filter((o) => rule[1].test(low(o.label)))) : null;
    }
    case "work_authorization": {
      if (yesNoOf(v) !== "yes") break;
      const free = options.filter((o) => /any employer|without (visa |employment )?sponsorship|no restriction|do not (need|require)|not require|unrestricted/.test(low(o.label)) && !/will (need|require)|in the future|present employer|current employer/.test(low(o.label)));
      if (free.length === 1) return free[0].value;
      break;
    }
    case "education_level": {
      const re = EDUCATION[v.replace(/'s|s$/g, "").replace(/ degree$/, "")] ?? EDUCATION[v];
      if (!re) return null;
      // A degree held is never one in progress. Two options that differ only in wording ("Bachelors" and "Bachelor's
      // Degree" on one live list, WO-042) are one answer: the person's own wording, else the one that says "degree", else
      // the first. "Bachelor of Arts" and "Bachelor of Science" differ in meaning, and the person is asked.
      const hits = options.filter((o) => re.test(low(o.label)) && !/in progress|pursuing|currently enrolled|incomplete|candidate|expected/.test(low(o.label)));
      const core = (l: string) => low(l).replace(/'s\b|\bdegree\b|[^a-z]/g, "").replace(/s$/, "");
      if (hits.length > 1 && hits.every((o) => core(o.label) === core(hits[0].label))) return (hits.find((o) => low(o.label) === v) ?? hits.find((o) => /\bdegree\b/.test(low(o.label))) ?? hits[0]).value;
      return only(hits);
    }
    case "state": {
      // A place list names the state with its country ("Illinois, United States", Ashby's search; WO-042).
      const full = STATES[v] ?? v;
      return only(options.filter((o) => {
        const l = low(o.label).replace(/\s*,\s*(united states( of america)?|usa|us)$/, "");
        return l === full || STATES[l] === full;
      }));
    }
    case "location":
    case "city": {
      // "Chicago, IL" onto a place list ("Chicago, Illinois, United States"): the same city, in the same state when one
      // is stated; "North Chicago" or "Chicago Heights" is another city. Only one such place, or nothing (WO-042).
      const [city, st] = v.split(/\s*,\s*/);
      if (!city) return null;
      const full = st ? STATES[st] ?? st : null;
      return only(options.filter((o) => {
        const parts = low(o.label).split(/\s*,\s*/);
        return parts[0] === city && (!full || parts[1] === full || STATES[parts[1]] === full);
      }));
    }
    case "country":
    case "citizenship":
      if (US.test(v)) {
        // A country list holds "United States" and "United States Minor Outlying Islands": the country itself, when it is
        // there exactly once, is the answer (WO-047, Canonical).
        const itself = options.filter((o) => US.test(low(o.label)));
        if (itself.length === 1) return itself[0].value;
        // WO-048: the same on a phone code list ("United States of America (+1)" beside "... Outlying Islands (+1)").
        const whole = options.filter((o) => US.test(low(o.label).replace(/\s*\(\+\d{1,4}\)$/, "")));
        if (whole.length === 1 && options.filter((o) => /^united states\b/.test(low(o.label))).length > 1) return whole[0].value;
        return only(options.filter((o) => US.test(low(o.label)) || /^united states\b|u\.?s\.? citizen/.test(low(o.label))));
      }
      return only(options.filter((o) => low(o.label).startsWith(v)));
    case "notice_period":
    case "start_date":
      return bySpan(value, options, "weeks");
    case "years_experience":
      return bySpan(value, options, "years");
    case "salary_expectation":
      return byPayRange(value, options);
    case "pronouns": {
      const p = /she/.test(v) ? /she/ : /he\/him|^he/.test(v) ? /\bhe\b/ : /they/.test(v) ? /they/ : null;
      return p ? only(options.filter((o) => p.test(low(o.label)))) : null;
    }
    case "security_clearance":
      if (/^(none|no|n\/a)$/.test(v)) return only(options.filter((o) => /^none\b|do not.*(hold|have)|never held|not.*hold|^n\/a|^no\b/.test(low(o.label))));
      return only(options.filter((o) => low(o.label).includes(v)));
  }
  const yn = yesNoOf(v);
  if (yn) return byYesNo(yn, options);
  // One option that contains the answer whole (a city in "Yes - Boston, MA" is not this; that has a yes first).
  return only(options.filter((o) => low(o.label).includes(v) && v.length >= 3));
}
