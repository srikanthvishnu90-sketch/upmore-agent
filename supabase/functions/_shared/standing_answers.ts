// WO-074: standing answers. The person's own statement for a class of question, given once and kept like any saved answer
// under its class key (standing:how_heard, standing:relatives_at_employer, standing:work_rights, standing:office). Which
// questions belong to a class is question_map.ts standingClass (rules and an exclusion list, never a model). Here, code
// derives one form's answer from the statement and the posting's own facts (its location, the office and days a question
// names, the form's options), and only:
//   - onto one of the question's own options, or a plain yes/no where the form takes typed or ticked answers;
//   - when the statement settles it. Anything else (a country not known, more office days than stated, a place not
//     listed, a relation the statement does not cover, a list where no option fits) returns null and is asked as before.
// A statement is strict JSON the panel composes from the person's own picks; anything else is not a statement (no
// guessing from free text). Pure functions: no network, no model.
import { askedSentence, norm, type Question, standingClass, type StandingClass } from "./question_map.ts";
import { chooseOption, type Opt, yesNoOf } from "./answer_options.ts";
import { postingCountry, postingPlaces, STATE_NAMES } from "./posting_place.ts";

export type { StandingClass };
export const STANDING_CLASSES: StandingClass[] = ["how_heard", "relatives_at_employer", "work_rights", "office"];
export const standingKey = (c: StandingClass) => `standing:${c}`;
export const STANDING_KEY = /^standing:(how_heard|relatives_at_employer|work_rights|office)$/;
// What the panel asks once, in one line, and the number of inputs its short form has (the taps it costs the person).
export const STANDING_PROMPT: Record<StandingClass, string> = {
  how_heard: "How do you usually find the jobs you apply to? (used for every \"How did you hear about us?\")",
  relatives_at_employer: "Relatives or close relationships at the companies you apply to (used for every relatives question)",
  work_rights: "Where may you work without visa sponsorship? (used for work-rights questions about other countries)",
  office: "Where can you work on site, and up to how many days a week? (used for office questions)",
};
export const STANDING_TITLE: Record<StandingClass, string> = {
  how_heard: "how you find jobs", relatives_at_employer: "relatives at the employer", work_rights: "work rights by country", office: "office and place",
};
export const STANDING_INPUTS: Record<StandingClass, number> = { how_heard: 1, relatives_at_employer: 1, work_rights: 2, office: 2 };

// ------------------------------------------------------------------------------------------------ statements
export type Channel = "company_site" | "job_board" | "linkedin" | "indeed" | "glassdoor" | "search_engine";
export const CHANNEL_NAME: Record<Channel, string> = {
  company_site: "Company careers website", job_board: "Job board", linkedin: "LinkedIn", indeed: "Indeed", glassdoor: "Glassdoor", search_engine: "Search engine",
};
// The how-heard choices the panel offers, each the person's whole statement (in their order of preference).
export const HOW_HEARD_CHOICES: { label: string; channels: Channel[] }[] = [
  { label: "The company's own careers website", channels: ["company_site"] },
  { label: "The company's careers website or a job board", channels: ["company_site", "job_board"] },
  { label: "A job board", channels: ["job_board"] },
  { label: "LinkedIn", channels: ["linkedin"] },
  { label: "Indeed", channels: ["indeed"] },
  { label: "Glassdoor", channels: ["glassdoor"] },
];
export const RELATIVES_NONE = "No relatives or close relationships at companies I apply to; I'll tell Trainee if that changes";
export interface HowHeardStatement { channels: Channel[] }
export interface RelativesStatement { none: true }
export interface WorkRightsStatement { countries: string[]; complete: boolean; sponsorshipElsewhere: "yes" | "no" }
export interface OfficeStatement { places: string[]; maxDays: number }
export type Statement = HowHeardStatement | RelativesStatement | WorkRightsStatement | OfficeStatement;

export function parseStanding(cls: string, text: unknown): Statement | null {
  let v: any;
  try {
    v = JSON.parse(String(text ?? ""));
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  if (cls === "how_heard") {
    const ch = v.channels;
    if (!Array.isArray(ch) || !ch.length || ch.length > 3 || new Set(ch).size !== ch.length || !ch.every((c) => Object.hasOwn(CHANNEL_NAME, c))) return null;
    return { channels: ch };
  }
  if (cls === "relatives_at_employer") return v.none === true ? { none: true } : null;
  if (cls === "work_rights") {
    const cs = Array.isArray(v.countries) ? v.countries.map((c: unknown) => canonicalCountry(String(c))) : [];
    if (!cs.length || cs.length > 20 || cs.some((c: string | null) => !c) || typeof v.complete !== "boolean" || !["yes", "no"].includes(v.sponsorshipElsewhere)) return null;
    return { countries: [...new Set(cs as string[])], complete: v.complete, sponsorshipElsewhere: v.sponsorshipElsewhere };
  }
  if (cls === "office") {
    const ps = Array.isArray(v.places) ? v.places.map((p: unknown) => String(p ?? "").replace(/\s+/g, " ").trim()).filter(Boolean) : [];
    if (!ps.length || ps.length > 10 || ps.some((p: string) => !placeOf(p)) || !Number.isInteger(v.maxDays) || v.maxDays < 1 || v.maxDays > 5) return null;
    return { places: ps, maxDays: v.maxDays };
  }
  return null;
}
// The statement in the person's words, for the panel and the card.
export function standingSummary(cls: StandingClass, st: Statement): string {
  if (cls === "how_heard") return (st as HowHeardStatement).channels.map((c) => CHANNEL_NAME[c]).join(" or ");
  if (cls === "relatives_at_employer") return RELATIVES_NONE;
  if (cls === "work_rights") {
    const w = st as WorkRightsStatement;
    return `may work without sponsorship in ${w.countries.join(", ")}${w.complete ? " (every such country)" : ""}; elsewhere ${w.sponsorshipElsewhere === "yes" ? "needs" : "does not need"} sponsorship`;
  }
  const o = st as OfficeStatement;
  return `on site in ${o.places.join("; ")}, up to ${o.maxDays} day${o.maxDays === 1 ? "" : "s"} a week`;
}
// Every standing statement the person has given, as card lines read them (class -> summary).
export function standingSummaries(saved: Record<string, { value: unknown }>): Partial<Record<StandingClass, string>> {
  const out: Partial<Record<StandingClass, string>> = {};
  for (const c of STANDING_CLASSES) {
    const st = parseStanding(c, saved?.[standingKey(c)]?.value);
    if (st) out[c] = standingSummary(c, st);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ countries
// A country by its name (or a name forms use for it). Regions (the EU, EMEA, Europe) are not countries: never settled.
const COUNTRIES: [string, RegExp][] = [
  ["United States", /\b[Uu]nited [Ss]tates( of [Aa]merica)?\b|\bUNITED STATES\b|\bU\.S\.A?\.?(?![a-z])|\bUSA\b|\bUS\b|\bAmerica\b/],
  ["United Kingdom", /\bunited kingdom\b|\bU\.?K\.?\b|\bgreat britain\b|\bbritain\b|\bbritish\b|\bengland\b|\bscotland\b|\bwales\b|\bnorthern ireland\b/i],
  ["Canada", /\bcanad(a|ian)\b/i], ["Ireland", /\bireland\b(?<!northern ireland)|\birish\b/i], ["Germany", /\bgermany\b|\bdeutschland\b/i],
  ["France", /\bfrance\b/i], ["Spain", /\bspain\b|\bespaña\b/i], ["Portugal", /\bportugal\b/i], ["Italy", /\bitaly\b|\bitalia\b/i],
  ["Netherlands", /\bnetherlands\b|\bnederland\b|\bholland\b/i], ["Belgium", /\bbelgium\b/i], ["Switzerland", /\bswitzerland\b|\bswiss\b/i],
  ["Austria", /\baustria\b/i], ["Sweden", /\bsweden\b/i], ["Norway", /\bnorway\b/i], ["Denmark", /\bdenmark\b/i], ["Finland", /\bfinland\b/i],
  ["Poland", /\bpoland\b/i], ["Czechia", /\bczechia\b|\bczech republic\b/i], ["Hungary", /\bhungary\b/i], ["Romania", /\bromania\b/i],
  ["Bulgaria", /\bbulgaria\b/i], ["Greece", /\bgreece\b/i], ["Estonia", /\bestonia\b/i], ["Israel", /\bisrael\b/i], ["India", /\bindia\b/i],
  ["China", /\b(mainland )?china\b|\bprc\b/i], ["Hong Kong", /\bhong kong\b/i], ["Taiwan", /\btaiwan\b/i], ["Japan", /\bjapan\b/i],
  ["South Korea", /\bsouth korea(n)?\b|\bkorea\b/i], ["Singapore", /\bsingapore\b/i], ["Australia", /\baustralia\b/i], ["New Zealand", /\bnew zealand\b/i],
  ["Mexico", /\bmexico\b|\bméxico\b/i], ["Brazil", /\bbrazil\b|\bbrasil\b/i], ["Argentina", /\bargentina\b/i], ["Colombia", /\bcolombia\b/i],
  ["Chile", /\bchile\b/i], ["Philippines", /\bphilippines\b/i], ["Vietnam", /\bvietnam\b|\bviet nam\b/i], ["Indonesia", /\bindonesia\b/i],
  ["Malaysia", /\bmalaysia\b/i], ["Thailand", /\bthailand\b/i], ["United Arab Emirates", /\bunited arab emirates\b|\bUAE\b/],
  ["Saudi Arabia", /\bsaudi arabia\b/i], ["Qatar", /\bqatar\b/i], ["South Africa", /\bsouth africa\b/i], ["Nigeria", /\bnigeria\b/i],
  ["Kenya", /\bkenya\b/i], ["Egypt", /\begypt\b/i], ["Turkey", /\bturkey\b|\btürkiye\b/i],
];
const REGION = /\beuropean union\b|\bEU\b|\bEEA\b|\beurope\b|\bemea\b|\bapac\b|\blatam\b|\bschengen\b|\bnorth america\b/i;
// The cities postings name without their country, and the codes they use beside a city.
const CITY_COUNTRY: [RegExp, string][] = [
  [/\blondon\b|\bmanchester\b|\bbristol\b|\bedinburgh\b|\bglasgow\b|\bbelfast\b|\bnottingham\b|\bbournemouth\b|\bwinnersh\b|\bchiswick\b|\bcamden\b/i, "United Kingdom"],
  [/\btoronto\b|\bvancouver, bc\b|\bmontr[eé]al\b|\bedmonton\b|\bcalgary\b|\bottawa\b|\bmississauga\b|\bwaterloo, on\b/i, "Canada"],
  [/\bberlin\b|\bmunich\b|\bmünchen\b|\bhamburg\b|\bfrankfurt\b/i, "Germany"], [/\bamsterdam\b|\brotterdam\b/i, "Netherlands"], [/\bparis\b(?!, (tx|texas))/i, "France"],
  [/\bmadrid\b|\bbarcelona\b|\bvalencia\b/i, "Spain"], [/\blisbon\b|\bporto\b/i, "Portugal"], // (Dublin alone may be Dublin, CA or OH: only with its country, WO-074 review)
  [/\btel aviv\b/i, "Israel"], [/\bbangalore\b|\bbengaluru\b|\bhyderabad\b|\bpune\b|\bmumbai\b|\bdelhi\b|\bnoida\b|\bgurgaon\b|\bgurugram\b|\bchennai\b/i, "India"],
  [/\btokyo\b|\bosaka\b/i, "Japan"], [/\bseoul\b|\bbusan\b/i, "South Korea"], [/\bsydney\b|\bmelbourne\b(?!, (fl|florida))|\bcanberra\b/i, "Australia"],
  [/\bdubai\b|\babu dhabi\b/i, "United Arab Emirates"], [/\briyadh\b/i, "Saudi Arabia"], [/\bs[ãa]o paulo\b/i, "Brazil"], [/\bmexico city\b/i, "Mexico"],
  [/\bbogot[áa]\b/i, "Colombia"], [/\bbuenos aires\b/i, "Argentina"], [/\bwarsaw\b|\bkrak[oó]w\b/i, "Poland"], [/\bz[uü]rich\b|\bgeneva\b|\bzug\b/i, "Switzerland"],
  [/\bstockholm\b/i, "Sweden"], [/\bcopenhagen\b/i, "Denmark"], [/\boslo\b/i, "Norway"], [/\bhelsinki\b/i, "Finland"], [/\bprague\b/i, "Czechia"],
  [/\bvienna\b/i, "Austria"], [/\bmanila\b/i, "Philippines"], [/\bjakarta\b/i, "Indonesia"], [/\bshanghai\b|\bbeijing\b|\bshenzhen\b/i, "China"],
  [/\btaipei\b/i, "Taiwan"], [/\bbudapest\b/i, "Hungary"], [/\bsofia\b/i, "Bulgaria"], [/\bho chi minh\b|\bhanoi\b/i, "Vietnam"],
];
const CODE_COUNTRY: Record<string, string> = {
  GB: "United Kingdom", UK: "United Kingdom", ES: "Spain", IE: "Ireland", DE: "Germany", FR: "France", PT: "Portugal", IT: "Italy", BE: "Belgium",
  CH: "Switzerland", AT: "Austria", SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland", PL: "Poland", CZ: "Czechia", HK: "Hong Kong",
  SG: "Singapore", JP: "Japan", KR: "South Korea", AU: "Australia", NZ: "New Zealand", MX: "Mexico", BR: "Brazil", IN: "India",
  ON: "Canada", BC: "Canada", QC: "Canada", AB: "Canada", NS: "Canada", MB: "Canada", SK: "Canada", NB: "Canada",
};
export function canonicalCountry(name: string): string | null {
  const v = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!v || v.length > 60 || REGION.test(v)) return null;
  const u = /^(us|usa|u\.s\.?|u\.s\.a\.?|united states( of america)?)$/i.test(v) ? "United States" : v;
  const hits = COUNTRIES.filter(([, re]) => re.test(u));
  return hits.length === 1 ? hits[0][0] : null;
}
// Countries a text names (each once); `region` when it names a region instead.
export function countriesNamed(text: string): { countries: string[]; region: boolean } {
  const t = String(text ?? "");
  return { countries: COUNTRIES.filter(([, re]) => re.test(t)).map(([c]) => c), region: REGION.test(t) };
}
// The one country a posting is in, from its own location text: every place it names must be in that same country, read
// from the text alone (a country's name, a city the postings use, a code beside a city). Remote with no country, two
// countries, or a place the text does not settle: null.
export function postingCountryName(location?: string): string | null {
  const chunks = String(location ?? "").split(/\s*(?:;|\||•|·|\n)\s*/).filter((x) => x.trim());
  if (!chunks.length) return null;
  const found = new Set<string>();
  for (const chunk of chunks) {
    const parts = postingPlaces(chunk);
    const c = postingCountry(parts);
    if (c === "us") {
      found.add("United States");
      continue;
    }
    if (c !== "abroad") return null;
    const named = countriesNamed(chunk).countries.filter((x) => x !== "United States");
    const cities = CITY_COUNTRY.filter(([re]) => re.test(chunk)).map(([, x]) => x);
    const codes = [...chunk.matchAll(/(?:^|[\s,(-])([A-Z]{2})(?=$|[\s,)-])/g)].map((m) => CODE_COUNTRY[m[1]]).filter(Boolean);
    const all = new Set([...named, ...cities, ...codes]);
    if (all.size !== 1) return null;
    found.add([...all][0]);
  }
  return found.size === 1 ? [...found][0] : null;
}

// ------------------------------------------------------------------------------------------------ places
interface Place { city: string; state: string }
const CITY_ALIAS: Record<string, string> = { nyc: "new york", "new york city": "new york", sf: "san francisco", "san fran": "san francisco", la: "los angeles", dc: "washington" };
const STATE_BY_NAME = Object.fromEntries(Object.entries(STATE_NAMES).map(([c, n]) => [n, c]));
const cityKey = (s: string) => {
  const c = String(s ?? "").toLowerCase().replace(/^greater\s+/, "").replace(/\s+(hq|headquarters|office|offices|campus|area|metro|bay area)$/, "").replace(/[.]/g, "").replace(/\s+/g, " ").trim();
  return CITY_ALIAS[c] ?? c;
};
const stateCode = (s: string): string => {
  const v = String(s ?? "").toLowerCase().replace(/\./g, "").trim();
  return STATE_NAMES[v] ? v : STATE_BY_NAME[v] ?? "";
};
function placeOf(p: string): Place | null {
  const [city, st] = String(p ?? "").split(",").map((x) => x.trim());
  if (!city || !/^[A-Za-zÀ-ÿ .'’-]{2,40}$/.test(city)) return null;
  return { city: cityKey(city), state: st ? stateCode(st) : "" };
}
const samePlace = (a: Place, b: Place) => a.city === b.city && (!a.state || !b.state || a.state === b.state);

// ------------------------------------------------------------------------------------------------ deriving
export interface StandingContext {
  company: string;
  location?: string;
  // The places the question names (career_apply placesNamed over its label), read where the form is planned.
  named?: string[];
  // The person's confirmed facts (their home country is their facts' to answer: WO-052, WO-053).
  answers?: Record<string, { value: unknown }>;
}
export interface StandingAnswer { value: string; factId: string; cls: StandingClass }
const options = (q: Question): Opt[] => (q.options || []).map((o: any) => ({ label: String(o.label), value: String(o.value ?? o.label) }));
// A yes or no onto the form: one of its own options when it has any (every option a yes or a no, and exactly one says
// this), a plain Yes/No for a box or a typed answer (the planner checks the box asks yes or no).
function yesNoOnto(q: Question, want: "yes" | "no"): string | null {
  const o = options(q);
  if (!o.length) return want === "yes" ? "Yes" : "No";
  if (!o.every((x) => yesNoOf(x.label))) return null;
  const hit = o.filter((x) => yesNoOf(x.label) === want);
  if (hit.length === 1) return hit[0].value;
  const plain = hit.filter((x) => /^(yes|no)[.!]?$/i.test(x.label.trim()));
  return plain.length === 1 ? plain[0].value : null;
}
const yesNoShaped = (q: Question) => !options(q).length || options(q).every((x) => yesNoOf(x.label));

// Work rights: which country the question asks about, and whether it asks the authorization or the sponsorship.
const AUTH = /\b(authori[sz]ed|eligible|entitled|permitted|allowed)\b.{0,30}\b(work|employment)\b|\bright to work\b|\bwork authori[sz]ation\b|\bpermiso de trabajo\b/;
const SPONSOR = /\b(require|need|requiring)\b.{0,80}\b(sponsor\w*|visa|work permit|work authori[sz]ation|immigration)\b|\bsponsor\w*\b.{0,40}\b(require|need)/;
const WITHOUT = /\bwithout\b.{0,40}\b(sponsor|visa)/;
const US_VISA_WORDS = /\bh-?1b?\b|\btn visa\b|\bf-?1\b|\bo-?1\b|\bgreen card\b/i;
function rightsAsked(q: Question, ctx: StandingContext): { country: string; ask: "auth" | "sponsor" } | null {
  const asked = norm(askedSentence(q.label));
  const without = WITHOUT.test(asked), auth = AUTH.test(asked), sponsor = SPONSOR.test(asked) && !without;
  if (auth && sponsor) return null;
  if (!auth && !sponsor && !without) return null;
  if (sponsor && /\bnot\b|\bno longer\b/.test(asked.split("?")[0])) return null;
  const inAsked = countriesNamed(askedSentence(q.label)), inLabel = countriesNamed(q.label);
  if (inAsked.region || inLabel.region) return null;
  const posting = postingCountryName(ctx.location);
  let country: string | null;
  if (inAsked.countries.length) country = inAsked.countries.length === 1 ? inAsked.countries[0] : null;
  else country = posting && inLabel.countries.every((c) => c === posting) ? posting : null;
  if (!country) return null;
  // A US visa named as the example ("e.g., H-1B") about a job abroad may mean the US: not settled.
  if (country !== "United States" && US_VISA_WORDS.test(q.label)) return null;
  // The person's home country is their facts' (WO-052, WO-053), never the statement's.
  const home = canonicalCountry(String(ctx.answers?.country?.value ?? "")) ?? "United States";
  if (country === home) return null;
  return { country, ask: auth || without ? "auth" : "sponsor" };
}
// Office: the days a question asks, its places (named, or the posting's own), and the person's places.
const NUM: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5" };
export function daysAsked(label: string): number | null {
  const t = norm(label).replace(/\b(one|two|three|four|five)\b/g, (w) => NUM[w]);
  if (/\bdaily\b|\bevery day\b|\bmonday\s*(-|–|to|through|thru)\s*friday\b|\bfull[- ]?time\b|\bfully (on-?site|onsite|in[- ]?person|in[- ]?office)\b|\b100\s*%|\bfive days\b/.test(t)) return 5;
  const nums: number[] = [];
  for (const m of t.matchAll(/\b([1-5])(?:\s*(?:-|–|to|or)\s*([1-5]))?\s*(?:x|\+)?\s*-?\s*(?:days?\b|x\b|x\s*\/|times\b)/g)) nums.push(Number(m[1]), Number(m[2] ?? m[1]));
  if (nums.length) return Math.max(...nums);
  const weekdays = (t.match(/\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|mon|tue|tues|wed|thu|thur|thurs|fri)\b/g) ?? []).length;
  return weekdays >= 2 ? Math.min(weekdays, 5) : null;
}
const PLACE_NOISE = /\b(is|in|are|at|to|be|we|you|team|teams|work|working|our|the|a|an|this|that|days?|week|per|will|can|role|position|job)\b/i;
function officePlaces(ctx: StandingContext): Place[] | null {
  // A "place" read from ordinary words ("Our team is in office" gives "team is in") is not one.
  const named = (ctx.named ?? []).map((x) => x.trim()).filter((x) => x && !PLACE_NOISE.test(x));
  if (named.length) {
    const states = named.filter((x) => stateCode(x)), cities = named.filter((x) => !stateCode(x));
    if (!cities.length) return null; // "our Utah office": which city is not said
    return cities.map((c) => ({ city: cityKey(c), state: states.length === 1 ? stateCode(states[0]) : "" }));
  }
  const parts = postingPlaces(ctx.location ?? "");
  if (!parts.length || parts.some((p) => p.remote || !p.city)) return null;
  return parts.map((p) => ({ city: cityKey(p.city), state: p.state }));
}
// Relatives: the question is about the company applied to, never another one it names.
const ORG_STOP = /^(i|if|yes|no|n\/a|na|please|do|are|is|have|has|does|will|would|can|our|the|this|company|companies|employee|employees|current|currently|any|note|for|example|e\.g|a|an|and|or|to|of|we|you|your|in|at|by|us|u\.s|usa|relatives?|family|members?|spouses?|immediate|household|close|personal|relationships?|partners?|in-laws?|significant|other|others|domestic|related|anyone|someone|including|marriage|employed|working|work)$/i;
export function namesOtherOrg(label: string, company: string): boolean {
  const c = String(company ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const s of String(label ?? "").match(/\b[A-Z][\w&.'’-]*(?:\s+(?:[A-Z][\w&.'’-]*|&|of))*/g) ?? []) {
    const words = s.split(/\s+/).filter((w) => !ORG_STOP.test(w.replace(/[^\w\/.-]/g, "").replace(/\.$/, "")));
    const n = words.join("").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (n.length < 2) continue;
    if (c && (c.includes(n) || n.includes(c))) continue;
    return true;
  }
  return false;
}
// How heard: each channel the person named, in their order, onto exactly one of the form's options.
const OPT_EXCLUDE = /\bads?\b|advert|sponsored|banner|universit|college|school|campus|student|handshake|\bother\b|third[- ]party|\bjob site\b/;
const nameWords = (company: string) => String(company ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
  .filter((w) => w.length >= 3 && !/^(the|and|inc|llc|ltd|corp|group|company|technologies|technology|labs|software|systems|health|global)$/.test(w));
const leaf = (l: string) => String(l).toLowerCase().split(/\s+>\s+/).pop()!.trim();
const CHANNEL_OPTION: Record<Exclude<Channel, "company_site">, RegExp> = {
  job_board: /^(job ?boards?|online job (boards?|search|postings?)|job (search )?sites?|third[- ]party (career|job) (sites?|boards?))\b/,
  linkedin: /^linked ?in(\s*[-–:]?\s*(jobs?|job (postings?|search|board)))?$/,
  indeed: /^indeed( jobs?)?$/,
  glassdoor: /^glassdoor( jobs?| job search)?$/,
  search_engine: /^(search engine|web search|internet search|online search|google( search)?)\b(?!.*\bjobs?\b)/,
};
const BOARDISH = /\b(job ?boards?|job (search )?sites?|online job|indeed|glassdoor|zip ?recruiter|monster|careerbuilder|built ?in|otta|wellfound|angel ?list|dice|handshake|simply ?hired|google jobs|efinancialcareers|welcome to the jungle|jobteaser|the muse|wayup|fairygodboss|linked ?in|third[- ]party (career|job))\b/;
function channelOptions(ch: Channel, q: Question, company: string): Opt[] {
  const o = options(q);
  if (ch === "company_site") {
    const v = chooseOption("how_heard", "Company website", o, q.label);
    if (v !== null) return o.filter((x) => x.value === v);
    const words = nameWords(company);
    const compact = String(company ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return o.filter((x) => {
      const l = leaf(x.label);
      if (!/\b(web ?site|site|career(s)?( page| site| website)?)\b/.test(l) || OPT_EXCLUDE.test(l)) return false;
      const flat = l.replace(/[^a-z0-9]/g, "");
      return words.some((w) => new RegExp(`\\b${w}\\b`).test(l)) || (compact.length >= 3 && flat.includes(compact));
    });
  }
  return o.filter((x) => CHANNEL_OPTION[ch].test(leaf(x.label)) && (ch !== "job_board" || !/\bother\b/.test(leaf(x.label))));
}

// Whether a question is one a standing answer of its class could settle at this posting (its class, the posting's
// country or place known, a yes/no shape), before knowing the statement: the panel asks the class's statement for these.
export function standingApplies(q: Question, ctx: StandingContext): StandingClass | null {
  const c = standingClass(q)?.cls ?? null;
  if (!c) return null;
  if (c === "how_heard") return c;
  if (!yesNoShaped(q)) return null;
  if (c === "relatives_at_employer") return namesOtherOrg(q.label, ctx.company) ? null : c;
  if (c === "work_rights") return rightsAsked(q, ctx) ? c : null;
  return officePlaces(ctx) ? c : null;
}

// The answer a standing statement gives this question at this posting, or null (asked as before).
export function standingAnswer(q: Question, saved: Record<string, { value: unknown; factId: string }>, ctx: StandingContext): StandingAnswer | null {
  const cls = standingApplies(q, ctx);
  if (!cls) return null;
  const row = saved?.[standingKey(cls)];
  const st = row ? parseStanding(cls, row.value) : null;
  if (!row || !st) return null;
  const out = (value: string | null) => (value === null ? null : { value, factId: `standing:${cls}:${row.factId}`.slice(0, 200), cls });
  if (cls === "how_heard") {
    const s = st as HowHeardStatement;
    // Tuned on samples A-D (WO-074 review): a statement that names two ways ("the careers website or a job board") settles
    // a form only when the form offers exactly one of them; a job board counts as offered when any board is on the list
    // (Indeed, Glassdoor, "Job Board"...), and a generic "Job Board" beside a named board could be either: asked.
    if (!options(q).length) return s.channels.length === 1 ? out(CHANNEL_NAME[s.channels[0]]) : null;
    const boards = options(q).filter((o) => BOARDISH.test(leaf(o.label)));
    const offered = s.channels.filter((ch) => (ch === "job_board" ? boards.length > 0 : channelOptions(ch, q, ctx.company).length > 0));
    if (offered.length !== 1) return null;
    const hit = channelOptions(offered[0], q, ctx.company);
    if (offered[0] === "job_board" && s.channels.length > 1 && boards.length !== 1) return null;
    return hit.length === 1 ? out(hit[0].value) : null;
  }
  if (cls === "relatives_at_employer") return out(yesNoOnto(q, "no"));
  if (cls === "work_rights") {
    const w = st as WorkRightsStatement, r = rightsAsked(q, ctx)!;
    const listed = w.countries.includes(r.country);
    if (!listed && !w.complete) return null; // a list the person did not confirm as complete says nothing of other countries
    if (r.ask === "auth") return out(yesNoOnto(q, listed ? "yes" : "no"));
    return out(yesNoOnto(q, listed ? "no" : w.sponsorshipElsewhere));
  }
  const o = st as OfficeStatement;
  const days = daysAsked(q.label) ?? 5; // no days said: the whole week, the most a question can ask
  if (days > o.maxDays) return null;
  const mine = o.places.map(placeOf).filter((p): p is Place => !!p);
  const asked = officePlaces(ctx)!;
  if (!asked.every((a) => mine.some((m) => samePlace(a, m)))) return null;
  return out(yesNoOnto(q, "yes"));
}
