// SEARCH COVERAGE: what a job-search sentence means, and which postings should never be offered. Pure (no I/O, no imports),
// so the ingest, the stores and the ranking share it.
//   "software engineering internship Chicago summer 2027"
//     -> role words [software, engineering], level intern, place Chicago, term summer 2027.
// Before this, every word had to appear literally in a posting's title/company/place/description: "internship" missed
// "Software Engineer Intern", "summer 2027" missed every posting that does not repeat it, and a place was a free word.
// Level and place are HARD filters (a senior role or another city is not what was asked). A term is a filter only against
// a posting that states a different term; a posting that states none stays, ranked after the ones that state it.
// Also here: closed / expired / scam signals read from a posting's own words, and the duplicate key.

export type Level = "intern" | "new_grad";
export interface Place { key: string; label: string; re: RegExp }
export interface Term { season: string | null; year: number | null }
export interface ParsedQuery { words: string[]; roleWords: string[]; level: Level | null; places: Place[]; term: Term | null; remote: boolean }

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[‘’]/g, "'");

// ------------------------------------------------------------------------------------------------ level
export const INTERN_RE = /\b(?:interns?|internships?|co-?ops?|co op)\b/;
const NEWGRAD_RE = /\b(?:new[- ]?grads?|new graduates?|recent graduates?|entry[- ]level|early[- ]career|university graduates?|graduate (?:program|scheme|engineer|developer|analyst)|campus hires?|junior|associate)\b/;
const SENIOR_RE = /\b(?:senior|sr\.?|staff|principal|lead|director|vp|vice president|head of|chief|manager|architect|distinguished|fellow)\b/;
const LEVEL_QUERY: [Level, RegExp][] = [["intern", /\b(?:interns?|internships?|co-?ops?|co op)\b/], ["new_grad", /\b(?:new[- ]?grads?|new graduates?|recent graduates?|entry[- ]level|early[- ]career|graduate roles?|campus)\b/]];
// The level a posting is: its own seniority band when the store set one, else read from its title.
export function postingLevel(p: { title?: string; seniority_band?: string | null }): Level | "senior" | "other" {
  const t = norm(p.title), band = norm(p.seniority_band);
  if (INTERN_RE.test(t) || /\b(?:summer|winter)\s+(?:business\s+)?(?:analyst|associate)\b/.test(t) && !/manager|director/.test(t)) return "intern";
  if (SENIOR_RE.test(t) && !/\bintern/.test(t)) return "senior";
  if (band === "intern") return "intern";
  if (NEWGRAD_RE.test(t) || band === "new_grad" || band === "junior") return "new_grad";
  if (band === "senior" || band === "staff" || band === "director" || band === "manager") return "senior";
  return "other";
}

// ------------------------------------------------------------------------------------------------ place
const P = (key: string, label: string, re: RegExp): Place => ({ key, label, re });
// A city (and its everyday aliases / boroughs) read from a posting's place text. State codes are not matched alone
// (", IL" is Springfield too); a city name is.
export const PLACES: Place[] = [
  P("chicago", "Chicago", /\bchicago(?:land)?\b/), P("new york", "New York", /\bnew york(?: city)?\b|\bnyc\b|\bmanhattan\b|\bbrooklyn\b|\bqueens\b/),
  P("san francisco", "San Francisco", /\bsan francisco\b|\bsf\b|\bsouth san francisco\b/), P("bay area", "Bay Area", /\bbay area\b|\bsan francisco\b|\bsan jose\b|\bpalo alto\b|\bmountain view\b|\bsunnyvale\b|\bmenlo park\b|\bredwood city\b|\bsanta clara\b|\boakland\b|\bcupertino\b|\bsan mateo\b/),
  P("los angeles", "Los Angeles", /\blos angeles\b|\bla,|\bsanta monica\b|\bculver city\b|\bpasadena\b|\bel segundo\b/), P("seattle", "Seattle", /\bseattle\b|\bbellevue\b|\bredmond\b/),
  P("boston", "Boston", /\bboston\b|\bcambridge, ma\b|\bwaltham\b/), P("austin", "Austin", /\baustin\b/), P("dallas", "Dallas", /\bdallas\b|\bplano\b|\birving\b|\bfrisco\b/),
  P("houston", "Houston", /\bhouston\b/), P("atlanta", "Atlanta", /\batlanta\b/), P("denver", "Denver", /\bdenver\b|\bboulder\b/), P("washington dc", "Washington, DC", /\bwashington,? d\.?c\b|\barlington, va\b|\breston\b|\bmclean\b/),
  P("philadelphia", "Philadelphia", /\bphiladelphia\b|\bphilly\b/), P("miami", "Miami", /\bmiami\b/), P("san diego", "San Diego", /\bsan diego\b/), P("minneapolis", "Minneapolis", /\bminneapolis\b|\bst\.? paul\b/),
  P("detroit", "Detroit", /\bdetroit\b|\bann arbor\b/), P("pittsburgh", "Pittsburgh", /\bpittsburgh\b/), P("raleigh", "Raleigh", /\braleigh\b|\bdurham\b|\bcary\b|\bchapel hill\b/), P("phoenix", "Phoenix", /\bphoenix\b|\btempe\b|\bscottsdale\b/),
  P("salt lake city", "Salt Lake City", /\bsalt lake\b|\blehi\b|\bsandy, ut\b/), P("portland", "Portland", /\bportland\b/), P("nashville", "Nashville", /\bnashville\b/), P("charlotte", "Charlotte", /\bcharlotte\b/),
  P("toronto", "Toronto", /\btoronto\b/), P("london", "London", /\blondon\b/),
];
const PLACE_QUERY: [Place, RegExp][] = PLACES.map((pl) => [pl, new RegExp(`\\b${pl.key.replace(/ /g, "[ ]")}\\b${pl.key === "new york" ? "|\\bnyc\\b" : pl.key === "san francisco" ? "|\\bsf\\b" : pl.key === "los angeles" ? "|\\bla\\b" : pl.key === "washington dc" ? "|\\bwashington,? d\\.?c\\b|\\bdc\\b" : pl.key === "philadelphia" ? "|\\bphilly\\b" : ""}`)]);
// No usable place on the posting: it is not placed anywhere, so a place filter cannot say it is elsewhere.
const UNPLACED = /^(?:|n\/?a|tbd|multiple(?: locations?)?|various(?: locations?)?|several locations|nationwide|anywhere|united states(?: of america)?|usa|us|u\.s\.a?\.?|north america|global|worldwide)$/;
export function placeFit(location: unknown, places: Place[], remoteOk: boolean): "yes" | "unplaced" | "no" {
  if (!places.length) return "yes";
  const loc = norm(location).replace(/\s+/g, " ").trim();
  if (places.some((pl) => pl.re.test(loc))) return "yes";
  if (UNPLACED.test(loc.replace(/[()]/g, "").trim())) return "unplaced";
  if (remoteOk && /\bremote\b/.test(loc)) return "yes";
  return "no";
}

// ------------------------------------------------------------------------------------------------ term
const SEASONS = ["spring", "summer", "fall", "autumn", "winter"];
const TERM_RE = /\b(spring|summer|fall|autumn|winter)\s*(?:of\s*|,?\s*)?(?:'(\d{2})|(20\d{2}))\b/g;
export function termsIn(text: unknown): Term[] {
  const t = norm(text), out: Term[] = [];
  for (const m of t.matchAll(TERM_RE)) out.push({ season: m[1] === "autumn" ? "fall" : m[1], year: m[3] ? Number(m[3]) : 2000 + Number(m[2]) });
  return out;
}
const SEASON_END_MONTH: Record<string, number> = { spring: 5, summer: 8, fall: 11, winter: 2 }; // 0-based month the season ends (winter: ends Feb of its year)
// A term wholly in the past is not a posting anyone can still join ("Summer 2025 Internship" in October 2026).
export function termExpired(t: Term, now: number): boolean {
  if (t.year === null) return false;
  const d = new Date(now), y = d.getUTCFullYear();
  if (t.year < y) return true;
  if (t.year > y) return false;
  const end = t.season ? SEASON_END_MONTH[t.season] : 11;
  return end !== undefined && d.getUTCMonth() > end;
}

// ------------------------------------------------------------------------------------------------ the query
const STOP = new Set(["job", "jobs", "role", "roles", "position", "positions", "opening", "openings", "opportunity", "opportunities", "work", "any", "some", "find", "me", "my", "near", "in", "at", "for", "the", "a", "an", "and", "or", "of", "to", "with", "on", "hiring", "open", "program", "programs", "class", "from", "around", "based"]);
const ROLE_SYN: Record<string, string[]> = { swe: ["software", "engineer"], sde: ["software", "engineer"], sdet: ["software", "engineer"], mle: ["machine", "learning"] };
export function parseSearchQuery(query: unknown): ParsedQuery {
  let q = norm(query).replace(/[^a-z0-9+#'.,\- ]+/g, " ");
  let level: Level | null = null;
  for (const [l, re] of LEVEL_QUERY) if (re.test(q)) { level = level ?? l; q = q.replace(new RegExp(re.source, "g"), " "); }
  const places: Place[] = [];
  for (const [pl, re] of PLACE_QUERY) if (re.test(q)) { places.push(pl); q = q.replace(new RegExp(re.source, "g"), " "); }
  let term: Term | null = null;
  const ts = termsIn(q);
  if (ts.length) { term = ts[0]; q = q.replace(TERM_RE, " "); }
  const loose = /\b(spring|summer|fall|autumn|winter)\b/.exec(q);
  if (!term && loose) term = { season: loose[1] === "autumn" ? "fall" : loose[1], year: null };
  q = q.replace(/\b(spring|summer|fall|autumn|winter)\b/g, " ");
  const yr = /\b(20\d{2})\b/.exec(q);
  if (yr) { term = { season: term?.season ?? null, year: Number(yr[1]) }; q = q.replace(/\b20\d{2}\b/g, " "); }
  const remote = /\bremote\b/.test(q);
  const words = q.split(/[^a-z0-9+#]+/).filter((w) => w.length > 1 && !STOP.has(w)).flatMap((w) => ROLE_SYN[w] ?? [w]);
  // "remote" stays a word to match unless a city was asked: "Chicago or remote" widens the place, it is no word to find.
  const roleWords = [...new Set(places.length ? words.filter((w) => w !== "remote") : words)];
  return { words, roleWords, level, places, term, remote };
}

// ------------------------------------------------------------------------------------------------ closed / expired / scam
const CLOSED = /\b(?:no longer (?:accepting|taking|open|available|active)|(?:position|role|job|posting|requisition|vacancy) (?:has been|is|was)? ?(?:now )?(?:filled|closed|cancel+ed|withdrawn|expired|on hold)|this (?:job|position|role|posting|opportunity) (?:has )?(?:expired|closed|been filled)|applications? (?:for this (?:job|role|position) )?(?:are |is |have )?(?:now |been )?closed|(?:job|posting) (?:is )?no longer (?:available|active)|we (?:have )?(?:stopped|are no longer) (?:accepting|reviewing) applications?|not accepting (?:any more |new )?applications?)\b/;
export type Status = { open: true } | { open: false; reason: "closed_text" | "expired_term" | "scam" };
export function postingStatus(p: { title?: string; description?: string; posted_at?: string | null; apply_email?: string | null }, now: number): Status {
  const head = norm(`${p.title ?? ""} . ${String(p.description ?? "").slice(0, 1500)}`);
  if (CLOSED.test(head)) return { open: false, reason: "closed_text" };
  const own = termsIn(p.title);
  if (own.length && own.every((t) => termExpired(t, now))) return { open: false, reason: "expired_term" };
  if (scamSignals(p).length >= 1) return { open: false, reason: "scam" };
  return { open: true };
}
// A real employer's posting never asks the applicant to pay, to cash a cheque, or to move to a chat app to be hired.
const SCAM_STRONG: [string, RegExp][] = [
  ["asks for money", /\b(?:pay|send|wire|deposit)\b[^.]{0,40}\b(?:a |an |the )?(?:registration|training|application|processing|starter kit|equipment|background check|security deposit|onboarding) (?:fee|cost|charge|payment|deposit)s?\b|\b(?:registration|training|application|processing|onboarding) fee (?:is )?required\b/],
  ["cheque or gift cards", /\b(?:(?:buy|purchase|send|pay (?:with|using|in))\b[^.]{0,30}\bgift cards?|western union|moneygram|cashier'?s? che(?:que|ck)|(?:we|company) will (?:send|mail|deposit) (?:you )?a che(?:que|ck)|purchase (?:your )?own equipment)\b/],
  ["chat-app hiring", /\b(?:contact|message|reach|text|add) (?:us|our (?:hr|recruiter|manager|agent)|the (?:hr|recruiter|manager))[^.]{0,40}\b(?:on |via |through |at )?(?:whatsapp|telegram|signal|wechat|line app)\b|\b(?:interview|hiring) (?:is |will be )?(?:conducted |held )?(?:on|via|through) (?:whatsapp|telegram|signal|google hangouts?)\b/],
  ["guaranteed income", /\b(?:earn|make) \$?\d[\d,]{2,}(?:\s?(?:-|to)\s?\$?\d[\d,]{2,})? (?:per|a|\/) ?(?:day|week)\b[^.]{0,60}\b(?:no experience|work from home|immediately)\b|\bno (?:experience|interview) (?:needed|required|necessary)[^.]{0,60}\b(?:hired|start) (?:immediately|today|same day)\b/],
];
export function scamSignals(p: { title?: string; description?: string; apply_email?: string | null }): string[] {
  const t = norm(`${p.title ?? ""} . ${p.description ?? ""}`);
  const out = SCAM_STRONG.filter(([, re]) => re.test(t)).map(([n]) => n);
  if (/@(?:gmail|yahoo|outlook|hotmail|aol|proton(?:mail)?)\.[a-z.]+$/.test(norm(p.apply_email)) && /\b(?:payment processing|reship|package forwarding|data entry from home|personal assistant to the ceo)\b/.test(t)) out.push("free-mail recruiter on a payments job");
  return out;
}

// ------------------------------------------------------------------------------------------------ duplicates
const squash = (s: unknown) => norm(s).replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\b(?:inc|llc|ltd|corp|co|the)\b/g, " ").replace(/\s+/g, " ").trim();
export function canonicalUrl(u: unknown): string {
  try { const x = new URL(String(u)); x.hash = ""; for (const k of [...x.searchParams.keys()]) if (/^(?:utm_|gh_src|lever-source|source|src|ref|refid|trk|campaign)/i.test(k)) x.searchParams.delete(k); return `${x.hostname.toLowerCase().replace(/^www\./, "")}${x.pathname.replace(/\/+$/, "")}${x.search}`; }
  catch { return norm(u).trim(); }
}
// Two rows are the same job when they share a link, or a company + title + place (a job re-posted under a new requisition
// id, or listed on two boards of one employer).
export function dupKeys(p: { company?: string; title?: string; location?: string; url?: string }): string[] {
  const keys = [`t:${squash(p.company)}|${squash(p.title)}|${squash(p.location)}`];
  if (p.url) keys.push(`u:${canonicalUrl(p.url)}`);
  return keys;
}
