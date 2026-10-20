// WO-024: application status from the person's own mail, as pure functions. classifyMail reads one message's sender,
// subject and Gmail snippet (never a body) and says what it is only when the words say so: anything unclear is "other",
// and "other" never moves a stage. matchApplication ties a message to one of the person's applications or to none (never
// a forced match). planUpdates turns a batch into stage changes (forward only), the texts that say them, and follow-up
// drafts. Drafts are only ever drafts: nothing here sends mail.

export type MailKind = "received" | "rejection" | "interview" | "assessment" | "offer" | "recruiter_reply" | "other";
export const STATUS_KINDS: MailKind[] = ["received", "rejection", "interview", "assessment", "offer", "recruiter_reply"];
// auth: the message's Authentication-Results header values, top first (WO-032: only Gmail's own, the first, is trusted).
export interface MailMeta { from: string; subject: string; snippet: string; date: string; auth?: string[] }
// ambiguous (WO-040): the rules found no status phrase, but a step word from a sender that can write one; only these may
// go to the model's second pass. source "model": the second pass decided it (career_mail_model.ts), never the rules.
export interface Classified { kind: MailKind; company?: string; role?: string; domain?: string; evidence: string; ambiguous?: boolean; source?: "rules" | "model" }

// ------------------------------------------------------------------------------------------------ senders
// Applicant tracking systems and the vendors they hand steps to: the company is in the display name or the words, never
// the domain.
const ATS = [
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "ashbyhq.com", "myworkday.com", "myworkdayjobs.com", "workday.com",
  "smartrecruiters.com", "icims.com", "taleo.net", "successfactors.com", "successfactors.eu", "jobvite.com", "workablemail.com",
  "workable.com", "bamboohr.com", "avature.net", "breezy.hr", "recruitee.com", "jazzhr.com", "applytojob.com", "paylocity.com",
  "ultipro.com", "eightfold.ai", "phenompeople.com", "brassring.com", "teamtailor.com", "pinpointhq.com", "rippling.com",
  "dayforcehcm.com", "oraclecloud.com", "gem.com", "goodtime.io", "docusign.net", "amazon.jobs",
];
// WO-040: the vendors' own sending domains too ("hackerrankforwork.com"), and the one-way video vendors.
const ASSESSMENT_VENDORS = [
  "hackerrank.com", "hackerrankforwork.com", "codesignal.com", "codility.com", "shl.com", "harver.com", "criteriacorp.com", "hirevue.com",
  "testgorilla.com", "pymetrics.ai", "pymetrics.com", "karat.com", "karat.io", "coderpad.io", "sparkhire.com", "modernhire.com", "hackerearth.com",
  "testdome.com", "vervoe.com", "mettl.com", "imocha.io", "cappfinity.com", "arcticshores.com", "wonderlic.com", "willo.video", "myinterview.com",
];
const JOB_BOARDS = ["linkedin.com", "indeed.com", "glassdoor.com", "ziprecruiter.com", "joinhandshake.com", "wellfound.com", "angel.co", "monster.com", "dice.com", "simplyhired.com", "careerbuilder.com", "builtin.com", "otta.com", "hired.com",
  // WO-043: freelance marketplaces; a client's "invitation to interview" there is a gig, not an application the person made.
  "upwork.com", "fiverr.com", "freelancer.com"];
const FREE_MAIL = ["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "yandex.com"];
// Well-known employers whose mail domain does not spell their name. Matching only; never a guess about the person.
const DOMAIN_ALIASES: Record<string, string> = {
  jpmchase: "JPMorgan Chase", jpmorgan: "JPMorgan Chase", chase: "JPMorgan Chase", gs: "Goldman Sachs", ms: "Morgan Stanley",
  bofa: "Bank of America", bankofamerica: "Bank of America", datadoghq: "Datadog", fb: "Meta", amazon: "Amazon",
  // WO-045: employers' own mail domains and the short names they sign with.
  lmco: "Lockheed Martin", bswhealth: "Baylor Scott & White", tcs: "Tata Consultancy Services", bah: "Booz Allen Hamilton",
};
const AUTOMATED_LOCAL = /^(no-?reply|do-?not-?reply|donotreply|notifications?|alerts?|jobs?|careers?|recruiting|recruitment|talent|hr|support|hello|team|info|mail|news|events?|community|crew|press|marketing|scheduling|digest)\b/i;
const GENERIC_NAME = /^(greenhouse|lever|ashby|workday|smartrecruiters|icims|taleo|successfactors|jobvite|workable|bamboohr|avature|hackerrank|codesignal|codility|shl|harver|criteria corp|hirevue|spark hire|modern hire|testgorilla|hackerearth|testdome|vervoe|mettl|wonderlic|goodtime|docusign|notifications?|no-?reply|careers?|recruiting|recruiter|talent acquisition|hiring team|hr department|hr|jobs|team)$/i;

interface Sender { name: string; address: string; local: string; domain: string; label: string }
export function parseFrom(from: string): Sender {
  const s = String(from ?? "").trim();
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(s);
  // The comment form, "no-reply@stripe.com (Stripe)": the address, and the comment as the name.
  const c = m ? null : /^\s*([^\s<>()"]+@[^\s<>()"]+)\s*\(([^()]*)\)\s*$/.exec(s);
  const address = (m ? m[2] : c ? c[1] : s).trim().toLowerCase();
  const name = (m ? m[1] : c ? c[2] : "").trim();
  const at = address.lastIndexOf("@");
  const local = at > 0 ? address.slice(0, at) : address, domain = at > 0 ? address.slice(at + 1) : "";
  return { name, address, local, domain, label: registrableLabel(domain) };
}
const endsWithDomain = (domain: string, list: string[]) => list.some((d) => domain === d || domain.endsWith("." + d));
// "careers.jpmchase.com" -> "jpmchase"; "mail.notion.so" -> "notion"; "sutterhealth.org" -> "sutterhealth".
function registrableLabel(domain: string): string {
  const parts = domain.split(".").filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  const two = parts.slice(-2).join(".");
  const secondLevel = /^(co|com|org|net|ac|gov|edu)\.[a-z]{2}$/.test(two);
  return parts[parts.length - (secondLevel ? 3 : 2)] ?? "";
}

// ------------------------------------------------------------------------------------------------ company names
const DROP = new Set(["inc", "llc", "ltd", "corp", "corporation", "co", "company", "the", "plc", "group", "holdings", "and"]);
export function companyTokens(name: unknown): string[] {
  return String(name ?? "").toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t && !DROP.has(t));
}
const collapsed = (name: unknown) => companyTokens(name).join("");
const DOMAIN_SUFFIX = /^(hq|inc|corp|careers|jobs|group|global|usa|us|team|talent|mail)$/;
// The same employer: equal names, one name the leading words of the other ("Mayo" / "Mayo Clinic"), the leading letters
// spelled out ("JPMorgan" / "J.P. Morgan Chase"), or a mail domain that is the name plus a known suffix ("datadoghq").
export function sameCompany(a: unknown, b: unknown): boolean {
  const ta = companyTokens(DOMAIN_ALIASES[collapsed(a)] ?? a), tb = companyTokens(DOMAIN_ALIASES[collapsed(b)] ?? b);
  if (!ta.length || !tb.length) return false;
  const ca = ta.join(""), cb = tb.join("");
  if (ca === cb) return true;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.every((t, i) => long[i] === t)) return true;
  const cs = short.join("");
  if (cs.length >= 3) for (let i = 1; i <= long.length; i++) if (long.slice(0, i).join("") === cs) return true;
  const [s1, l1] = ca.length <= cb.length ? [ca, cb] : [cb, ca];
  return (ta.length === 1 || tb.length === 1) && s1.length >= 4 && l1.startsWith(s1) && DOMAIN_SUFFIX.test(l1.slice(s1.length));
}

// A display name stripped of what is not the company: "Datadog Recruiting" -> "Datadog", "Plaid via DocuSign" -> "Plaid".
// WO-045: a person or a hiring desk "at" the company ("Sophie at Loom", "Hiring Team at Canva"), a hiring desk named first
// ("Recruitment Wipro", "Talent Acquisition | Deloitte"), and the desk's other names ("Linear Hiring", "Palantir Interview
// Coordination") all name the company only.
const HIRING_DESK = String.raw`university recruiting|campus recruiting|talent acquisition|recruiting team|recruitment team|hiring team|talent team|people team|interview coordination|interview scheduling|recruiting coordination|recruiting|recruitment|recruiter|careers|career|jobs|hiring|interviews|scheduling|coordination|talent|hr team|hr|team|workday`;
// A desk's name with no company left in it ("HR Department", "Talent Acquisition") stays as it is (and names nobody).
const DESK_ONLY = new RegExp(String.raw`^((${HIRING_DESK}|department|acquisition|office|desk|operations|services)\s*)*$`, "i");
const DESK_LEAD = new RegExp(String.raw`^(${HIRING_DESK})(\s*[-|:,]\s*|\s+)(?=\S)`, "i");
const DESK_TAIL = new RegExp(String.raw`\s*[-|,:]?\s*\b(${HIRING_DESK})$`, "i");
function cleanName(name: string): string {
  let n = name.replace(/\s+via\s+.+$/i, "").replace(/^the\s+/i, "").replace(/\s+/g, " ").trim();
  const at = /^(.+?)\s+(?:at|@)\s+(.+)$/i.exec(n);
  if (at && (personName(at[1]) || /^\p{Lu}[\p{Ll}'’-]+$/u.test(at[1]) || DESK_ONLY.test(at[1]))) n = at[2].trim();
  const lead = n.replace(DESK_LEAD, "").trim();
  if (!DESK_ONLY.test(lead)) n = lead;
  for (let i = 0; i < 2; i++) {
    const tail = n.replace(DESK_TAIL, "").trim();
    if (!DESK_ONLY.test(tail)) n = tail;
  }
  return n;
}
// A hiring desk's name is never a person's ("Karat Scheduling", "Palantir Interview Coordination", "Linear Hiring").
const DESK_WORD = /\b(recruiting|recruitment|recruiters?|talent|careers?|hiring|interviews?|coordination|coordinator|scheduling|staffing|acquisition|hr|team|jobs|people ops|notifications?)\b/i;
// Two capitalized words are a person ("Rachel Kim") unless the last is a word companies end in ("Brightline Health").
const CORP_WORD = /^(health|healthcare|robotics|labs?|systems|technologies|technology|tech|bank|capital|group|partners|solutions|clinic|foods?|energy|motors|airlines?|insurance|media|studios?|software|analytics|consulting|financial|medical|hospital|university|pharma\w*|logistics|networks|security|street|trading|sachs|stanley|permanente|ventures|industries|services|holdings|global|international|corporation|company|bio\w*|therapeutics|games|works|brands|retail|markets|automotive|aerospace|dynamics|careers|recruiting)$/i;
// WO-045: letters outside ASCII too ("Sabine Müller"), and never a hiring desk's name.
const personName = (name: string) =>
  (/^\p{Lu}[\p{Ll}'’-]+(?: \p{Lu}\.?)?(?: \p{Lu}[\p{Ll}'’-]+){1,2}$/u.test(name) || /^\p{Lu}[\p{Ll}'’-]+ \p{Lu}\.?$/u.test(name)) && !GENERIC_NAME.test(name) && !CORP_WORD.test(name.split(" ").pop() ?? "") && !DESK_WORD.test(name);
// WO-045: a display name that spells the sender's own domain is the brand, not a person ("Capital One
// <capitalone@notification.capitalone.com>"); a lone given name that is the address's own local part is a person ("Ollie
// <ollie@pinecrest.dev>"); "Sophie at Loom" is a person at Loom.
const brandName = (s: Sender) => {
  const c = collapsed(s.name), l = s.label.replace(/[^a-z0-9]/g, "");
  return c.length >= 3 && !!l && (l.startsWith(c) || c.startsWith(l));
};
const givenName = (s: Sender) => {
  const at = /^(\p{Lu}[\p{Ll}'’-]+)\s+(?:at|@)\s+\S/u.exec(s.name);
  if (at) return !DESK_WORD.test(at[1]);
  return /^\p{Lu}[\p{Ll}'’-]+$/u.test(s.name) && !GENERIC_NAME.test(s.name) && !DESK_WORD.test(s.name) &&
    s.local.replace(/[^a-z]/g, "").startsWith(s.name.toLowerCase().replace(/[^a-z]/g, "")) && s.local.length <= s.name.length + 12;
};
const looksLikePerson = (s: Sender) => !AUTOMATED_LOCAL.test(s.local) && !brandName(s) && (personName(s.name) || givenName(s));
// An ATS tenant address spells the employer: "Kaiser Permanente <kp@myworkday.com>", "Target <target@myworkday.com>".
function tenantAgrees(local: string, name: string): boolean {
  const l = local.replace(/[^a-z0-9]/g, ""), t = companyTokens(name), c = t.join("");
  return !!l && (l === t.map((w) => w[0]).join("") || (l.length >= 3 && (c.startsWith(l) || l.startsWith(c))));
}

const CO = "([A-Z][A-Za-z0-9&.'’-]*(?:\\s+(?:[A-Z][A-Za-z0-9&.'’-]*|&|of)){0,3})";
const TEXT_COMPANY = [
  new RegExp(`\\b${CO}\\s+(?:has\\s+)?(?:invited|invites|requested|sent|has sent)\\b`, "g"),
  new RegExp(`\\b(?:invited by|application (?:was )?(?:sent|submitted) to|has been submitted to|application to|applying to|applied to [^.]{0,60}? at|offer from|test from|invitation from|from)\\s+${CO}`, "g"),
  new RegExp(`\\bat ${CO}(?=\\s+(?:has|was|is)\\b|[,!]|\\s*$)`, "g"),
  // WO-045: a vendor working for the employer ("Roblox has partnered with Karat", "Your Karat interview for Indeed"), the
  // employer asking through the vendor ("Robinhood would like to invite you"), and a receipt's subject ("Application
  // received: Linear").
  new RegExp(`\\b${CO}\\s+(?:has\\s+)?(?:partnered|is partnering)\\s+with\\b`, "g"),
  new RegExp(`\\b(?:Karat|HackerRank|CodeSignal|Codility|HireVue|TestGorilla|HackerEarth)\\s+(?:interview|test|assessment|challenge)\\s+(?:for|with)\\s+${CO}`, "g"),
  new RegExp(`\\b${CO}\\s+(?:would like to|wants to)\\s+(?:invite|schedule|interview|meet)\\b`, "g"),
  new RegExp(`^(?:Application received|Thanks for applying|Thank you for applying|Application confirmation)\\s*[:|–—-]\\s*${CO}\\s*$`, "g"),
];
const NOT_COMPANY = /^(i|you|your|we|our|the|this|that|hi|hello|dear|thank|thanks|congratulations|please|next|re|fw|fwd|following|update|application|interview|offer|assessment|online|new|job|jobs|complete|invitation|scheduled?)$/i;
// The employer a sentence names, read sentence by sentence; leading words that are not a name are dropped.
export function companyFromText(text: string): string | undefined {
  // "Gap Inc. has invited you": the period of an abbreviation does not end the sentence.
  const sentences = text.split(/(?<!\b(?:Inc|Co|Corp|Ltd|Jr|Sr|St|Mr|Ms|Mrs|Dr)\.)(?<=[.!?])\s+|\n+/);
  for (const re of TEXT_COMPANY) for (const sentence of sentences) for (const m of sentence.matchAll(re)) {
    const words = m[1].replace(/[.,!?:;'’]+$/, "").replace(/'s$/, "").trim().split(/\s+/);
    while (words.length && (NOT_COMPANY.test(words[0].replace(/[^A-Za-z]/g, "")) || words[0] === "&")) words.shift();
    const name = words.join(" ");
    if (name && !GENERIC_NAME.test(name)) return name;
  }
  return undefined;
}
// WO-045: a person at a company that is itself an ATS ("Nina Park <nina@rippling.com>") writes as that company, not as
// its product: the address spells the person's own name.
function spellsName(local: string, name: string): boolean {
  const l = local.replace(/[^a-z]/g, "");
  const t = name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").split(/\s+/).map((w) => w.replace(/[^a-z]/g, "")).filter(Boolean);
  if (!l || t.length < 2) return false;
  const first = t[0], last = t[t.length - 1];
  return [first, last, first[0] + last].includes(l) || (/[._-]/.test(local) && l === first + last);
}
// Hosts where the address's local part is an employer's tenant ("delta@myworkday.com"), never a person's mailbox.
const TENANT_HOSTS = ["myworkday.com", "myworkdayjobs.com", "taleo.net", "successfactors.com", "successfactors.eu", "brassring.com", "oraclecloud.com", "dayforcehcm.com", "ultipro.com", "paylocity.com", "avature.net", "icims.com", "amazon.jobs"];
const atsSender = (s: Sender) =>
  endsWithDomain(s.domain, ATS) && !(!endsWithDomain(s.domain, TENANT_HOSTS) && personName(s.name) && spellsName(s.local, s.name));
function companyOf(s: Sender, subject: string, snippet: string, vendor: boolean): string | undefined {
  const cleaned = cleanName(s.name);
  // A short name an employer signs with is the employer's full name ("TCS Careers" is Tata Consultancy Services).
  const named = DOMAIN_ALIASES[collapsed(cleaned)] ?? cleaned;
  const ats = atsSender(s);
  // "Sophie at Loom": the person is at the company the name gives.
  const atForm = /\s(?:at|@)\s/i.test(s.name) && cleaned !== s.name.trim();
  const person = ats ? personName(named) && (AUTOMATED_LOCAL.test(s.local) || !tenantAgrees(s.local, named)) : looksLikePerson(s) && !atForm;
  const nameOk = named && !GENERIC_NAME.test(named) && !DESK_ONLY.test(named) && !person && !/@/.test(named);
  if (vendor) return companyFromText(`${subject}. ${snippet}`) ?? (nameOk ? named : undefined);
  if (ats) return nameOk ? named : companyFromText(`${subject}. ${snippet}`);
  if (endsWithDomain(s.domain, JOB_BOARDS)) return companyFromText(`${subject}. ${snippet}`);
  if (nameOk) return named;
  // A personal address names no employer; only the words can.
  if (endsWithDomain(s.domain, FREE_MAIL)) return companyFromText(`${subject}. ${snippet}`);
  return DOMAIN_ALIASES[s.label] ?? (s.label || undefined);
}

const ROLE = "([A-Z0-9][A-Za-z0-9 ,&/()'’.+-]{2,70}?)";
const ROLE_RES = [
  new RegExp(`\\b(?:for|to) the (?:position (?:of )?)?${ROLE}\\s+(?:role|position|program|programme)\\b`),
  new RegExp(`\\b(?:application|applying|applied|interview|offer letter|assessment|test|exercise|case study|offer) for (?:the )?${ROLE}(?:\\s+(?:at|with)\\s|[.,;!]|\\s+-\\s|\\s+\\(|$)`),
  new RegExp(`\\byour application for ${ROLE}(?:\\s+at\\s|[.,;]|$)`),
];
export function roleOf(subject: string, snippet: string): string | undefined {
  for (const t of [snippet, subject]) for (const re of ROLE_RES) {
    const m = re.exec(t);
    if (m && !/^(the|a|an|this|your|our|position|role)$/i.test(m[1].trim())) return m[1].trim().replace(/\s+/g, " ");
  }
  return undefined;
}

// ------------------------------------------------------------------------------------------------ phrases
// Status phrases, strongest first. Each is a phrase an employer writes, never a lone word: "offer" alone is a sale,
// "interview" alone is a newsletter. Listed one phrase family per line so a miss can be found and fixed.
const phrases = (...p: string[]) => new RegExp(String.raw`\b(` + p.join("|") + String.raw`)\b`, "i");
// A reference to the person's own application (WO-040 review): its role, the application, an interview, the hiring side.
export const APP_REF = /\b(your (application|candidacy|resume|cv|portfolio)|you applied|applied (for|to)|(the|this|that)\b[^.]{0,50}?\b(role|position|opening|requisition)\b|interview\w*|hiring (manager|team)|next (step|steps|round|stage)|(phone|recruiter|technical) screen)\b/i;
const NOT = String.raw`(will not|won'?t|not|unable to|cannot|can'?t)`;
// A third element: the phrase counts only when the words also refer to the person's application (WO-040 review).
const RULES: [Exclude<MailKind, "other" | "recruiter_reply">, RegExp, RegExp?][] = [
  ["rejection", phrases(
    String.raw`regret to (inform|let you know|tell you)|we regret that|regrettably|sorry to (inform|tell|let you know)`,
    String.raw`not (been )?selected|(was|were|has been|is) (not successful|unsuccessful)`,
    String.raw`(decided|chosen|opted) not to (move|proceed|continue|progress|pursue|advance)|not to move forward`,
    NOT + String.raw` (be )?(moving|move|proceeding|proceed|progressing|progress|continuing|continue|advancing|advance) (forward|ahead)`,
    NOT + String.raw` (be )?(moving|proceeding|proceed|progressing|progress|continuing|continue|advancing|advance) (further )?(with )?(your|the|you|it\b|additional)`,
    String.raw`(move|moving|go|proceed|proceeding|pursue|pursuing|focus|focusing|continue) (forward |ahead )?(with|on) (other|another) (candidates|applicants|candidate)`,
    String.raw`(move|moving|go|proceed|proceeding) (forward |ahead )?with (candidates|applicants)|decided to (go|move|proceed) with (other |another )?(candidates|applicants|candidate)`,
    String.raw`pursu(e|ing) other (candidates|applicants)|selected (other )?candidates whose|other (candidates|applicants) [^.]{0,30}(more closely|better) (meet|match|fit|align)`,
    // WO-040: the same decision in the other ways employers write it.
    String.raw`(decided|chosen|opted|go|going|went|move|moving|moved|head|heading|take|taking|took)\b[^.]{0,30}?\bin a different direction|(moved|moving|move|gone|went|proceeded) (on |ahead |forward )?with (an?other|other|a different|the other) (candidates?|applicants?|person)`,
    String.raw`(decided|chosen|opted|elected) to (hire|select|go with|offer the (role|position|job) to|extend an offer to) (a|an|another|other|a different|someone)\b[^.]{0,20}?(candidates?|applicants?|person|else|whose|who)`,
    String.raw`(selected|chosen|hired|identified) (an?other|a different|other) (candidates?|applicants?|person)|(offer|position|role|job) to (an?other|a different) (candidate|applicant|person)`,
    String.raw`(decided|chosen) to (keep looking|keep searching|continue (our|the|my) search)|(qualifications|experience|background|skills|profile) (do|does|did) not (match|meet|align with|fit)`,
    String.raw`clos(e|ed|ing) (out )?(your|all) (applications?|candidacy)|your (application|candidacy) (is|has been) (now )?closed`,
    String.raw`(will|would|can|could) not be (considered|progressed|advanced|taken (forward|further)|shortlisted)|` + NOT + String.raw` (be )?(inviting|invite) you|` + NOT + String.raw` (be )?offering you (an? )?(interview|position|role|job|place)|(cannot|can'?t|unable to|not able to|won'?t be able to|will not be able to) offer you`,
    String.raw`(position|role|job|requisition|opening|posting)\b[^.]{0,60}?(has been|was|is now|is|have been) (cancell?ed|put on hold|on hold)|not be filling`,
    String.raw`(position|role|job|requisition) (you applied (for|to) )?(has been|was|is now|is) (filled|closed|no longer (open|available))`,
    String.raw`(have|has|'ve) filled the [^.]{0,40}(position|positions|role|roles|opening|openings)|(has|have) been filled`,
    String.raw`no longer (under consideration|being considered|considering)|(cannot|can'?t|unable to) consider your application`,
    String.raw`(unable|not able|won'?t be able) to (offer you|extend)|don'?t think (there'?s|there is|we have) a (fit|match)|not the right (fit|match) for`,
  )],
  ["offer", phrases(
    String.raw`offer letter|offer of employment|job offer|(internship|employment|verbal|written|formal|conditional|contingent|tentative|provisional) offer`,
    String.raw`offer you (the|a|an) ([\w-]+ ){0,5}(position|role|job|place|internship|spot)\b`,
    String.raw`(pleased|happy|excited|delighted|thrilled|glad) to (extend|offer you|make you an offer)|extend(ing)? (you )?an? (formal |verbal |written |conditional )?offer`,
    String.raw`make you an offer|your offer (from|with|letter|details|package|for)|offer (details|package) (is|are) (attached|ready)|accept (your|the) offer`,
    String.raw`you'?re hired|you are hired|(love|like) (for you to|to have you) (start|join)`,
  )],
  ["assessment", phrases(
    String.raw`online assessment|hacker ?rank|codesignal|codility|hirevue|pymetrics|games assessment|assessment (invitation|invite|link)`,
    String.raw`(coding|technical|programming|quant(itative)?|case|design|writing|written|take-?home|homework|skills?|cognitive|aptitude|problem-solving) (assessment|challenge|exercise|assignment|test|study|game)`,
    String.raw`take-?home|case study|(complete|take|finish) (the |your |an? )?([\w-]+ ){0,4}(assessment|test|exercise|challenge|game)`,
    // WO-040: a step named by its skill ("SQL challenge", "programming task"), a work sample, and a one-way video: recorded
    // answers are an assessment, not an interview with a person.
    String.raw`(sql|python|java(script)?|excel|coding|code|data|analytics|analysis|modell?ing|financial|presentation|sales|role-?play|programming|numerical|verbal|logical|abstract|situational judge?ment|personality|behaviou?ral|reasoning|typing) (reasoning )?(exercise|assessment|challenge|assignment|test|task|questionnaire|quiz|problem)`,
    String.raw`work sample|(one-way|on-demand|pre-recorded|recorded|asynchronous|async) (video )?(interview|assessment)|record (your )?(answers|responses|a video)|answer [^.]{0,40} on video|video (assessment|screening)`,
  )],
  ["interview", phrases(
    String.raw`interview invitation|invitation to interview|superday invitation\b|invit\w* (you )?to (an? |the |our |your )?([\w-]+ ){0,4}(interview|interviews|superday|power day|onsite|on-site|(phone|recruiter|technical|intro|initial|video) screen|video call)`,
    String.raw`selected (you )?(to|for (an? |the )?)interview|would like to interview you|(like|love|want) you to meet (with )?(the|our) (hiring manager|team)`,
    // WO-045: shortlisted for a named interview, an interview's confirmation, an interview moved to a new time.
    String.raw`(shortlisted|selected) for (an? |the )?([\w-]+ ){0,3}interview|confirms? (that )?your ([\w-]+ ){0,2}interview|interview confirmation|(the )?details (for|of|about) your ([\w-]+ ){0,3}interview|(moved|shifted|rescheduled|pushed) your ([\w-]+ ){0,2}interview|interview (has been |was )?(moved|rescheduled) to`,
    String.raw`(re-?schedule|schedule|book|set up|arrange) (an?|your|the) ([\w-]+ ){0,3}(interviews?|phone screen|screen|onsite|on-site|superday)|come in for an? interview`,
    String.raw`interview (loop |panel |day )?(is |has been )?(confirmed|scheduled)|(onsite|on-site|final|panel) interview|interview (loop|panel)`,
    String.raw`(first|second|third|final|next)[- ]round (of )?(interviews?|superday)|move (you )?(forward )?to the interview stage`,
    // WO-040: a screen, the next round, a confirmed time.
    String.raw`(recruiter|technical|intro|introductory|initial|hiring manager) (screen|screening)\b|(advanced|advance|moved|moving|progressed) (you )?(on |forward )?to the (next|final|second|third|interview) (round|stage)`,
    String.raw`interview\b[^.]{0,60}?\b(is|has been) (confirmed|scheduled|set|booked)|(confirmed|scheduled|booked):? (your )?interview|(join|attend)\b[^.]{0,50}\b(for )?(your|the) interview\b`,
    String.raw`move (you )?forward with (an?|the|your) ([\w-]+ ){0,3}(interview|interviews|screen)|(select|share|send) your interview times?`,
    String.raw`(are you|would you be) (available|free)\b[^.?]{0,60}\b(interview|screen)|availability (next week |this week )?for an? ([\w-]+ ){0,2}interview|(pick|choose|select|book) (a|an) interview time|(phone|video|technical|virtual) interview\b`,
  )],
  // WO-040: the words anyone uses to ask for a call (a sales rep, a sourcer, a friend) are an invitation only when they
  // are about the person's application: "the Data Analyst role", "your application", the hiring manager, an interview.
  ["interview", phrases(
    String.raw`(would|'d) (like|love) to (talk|speak|chat|meet|connect) (with )?you|wants? to (talk|speak|chat|meet) (with )?you|(would|'d) (like|love) to bring you in|would like to (meet|speak|chat) with you`,
    String.raw`(re-?schedule|schedule|book|set up|arrange) (an?|your|the) ([\w-]+ ){0,3}(call|chat|conversation)|come in for an? chat|move (you )?forward with (an?|the|your) ([\w-]+ ){0,3}(call|conversation|chat)`,
    String.raw`(are you|would you be) (available|free)\b[^.?]{0,60}\b(call|chat|meeting|conversation)|availability (next week |this week )?for an? ([\w-]+ ){0,2}(call|chat)|(pick|choose|select|book) (a|an) time|(select|share|send) your availability`,
  ), APP_REF],
  ["received", phrases(
    String.raw`thank(s| you) for (applying|your application|submitting your application|your interest in [^.]{0,60}?\. we (have )?received)`,
    String.raw`(we('ve| have)?|has been|was|we) (received|got) your application|we got your application|receipt of your application`,
    String.raw`application (has been |was )?(received|submitted|sent)|(was|been) submitted successfully|successfully submitted`,
    String.raw`application confirmation|(job )?submission confirmation|confirmation that your (job )?(application|submission)`,
    String.raw`your application to [^.]{1,60}? (was|has been) (submitted|sent|received)|you applied to [^.]{1,60}? (at|through) |your application [^.]{0,60}? is in\b`,
    // WO-040: the acknowledgement in the other words ATS templates use.
    String.raw`(we('ve| have)?|has been|was) received your (submission|resume|cv|candidacy)|acknowledg(e|ement|ing)( that)?( we( have)?)?( received)? (of |receipt of )?your (application|submission)|we have your application`,
    String.raw`your application (is|has been) (now )?(in|under) review|(application|submission) acknowledg(ed|ement)|confirms? (that )?we (have )?(received|got|have) your application`,
  )],
];
// Words that make a message something other than an application step, checked on the subject and sender first.
// WO-045: a candidate-experience survey ("How was your interview experience at Lyft?").
const NOISE_SUBJECT = /\b(job alerts?|new jobs|jobs for you|jobs? (matching|recommended)|recommended (jobs|for you)|is hiring|are hiring|hiring now|great match|top applicant|newsletter|webinar|digest|info session|career fair|events?|conference|registration|rsvp|survey|feedback|statement|receipt|your order|package|shipped|deals?|sale|% off|premium|verify|verification|password|sign[- ]?in|security code|candidate account|viewed your|tips|course|salaries|profile|product update|what'?s new|new features|withdrawn|self-identification|automatic reply|auto-?reply|autoreply|out of (the )?office|ooo|how (was|did) your [^?]{0,40}?(experience|go)|(rate|tell us about|share) your [^?]{0,30}?experience|candidate experience)\b/i;
const NOISE_TEXT = new RegExp(String.raw`\b(complete your application|finish (applying|your application)|haven'?t (submitted|finished)|isn'?t finished|started an application|pick up where you left off|unsubscribe from (job )?alerts|viewed your (application|profile)|mock interviews?|practice interviews?|interview tips|career coach(es|ing)?|(health|wellness|wellbeing|property|tax|fitness|medical|hearing|vision|skin|home|energy|credit) assessments?|assessor|out of (the )?office|when i return|limited access to (my )?e-?mail|video visit|clinician|telehealth|your (doctor|provider|care team)|mychart|lab results|` +
  // WO-043: a journalist's or podcast's interview, and a test vendor's own marketing ("practice questions", "free trial").
  String.raw`(podcast|press|media|radio|tv|news) interview|(working on|writing) (a|an) (story|article|piece|episode)|for (our|a|an) (story|article|podcast|episode|show)|practice (questions|problems|tests?)|start practicing|interview-ready|free trial|` +
  // WO-045: a practice site's games ("keep your streak alive", "the leaderboard", "your weekly coding challenge").
  String.raw`leaderboard|(keep|extend|lose|save) your [^.]{0,20}?streak|(weekly|daily) (coding )?challenge|arcade)\b`, "i");
// WO-040 review: a calendar or meeting tool's notice repeats an event's title; it is not the employer's words, and its
// sender ("Google Calendar") is never the employer.
const SYSTEM_SENDER = /\b(calendar|calendly)\b|calendar-notification/i;
const SYSTEM_DOMAINS = ["calendly.com", "zoom.us", "webex.com", "calendar.google.com"];
// WO-040: applications that are not for a job (a card, a loan, a lease, a visa, an account) use the same words.
// WO-043: a volunteer post, a trusted-traveler or visa interview, a degree programme are not jobs either.
// WO-045: a pet adoption or foster application, and an application for a card by any product name ("your application for
// the Venture Rewards card").
const NOT_A_JOB = /\b((credit card|card|loan|mortgage|rental|lease|apartment|housing|brokerage|bank|checking|savings|investment|account|membership|visa|passport|insurance|scholarship|grant|admissions?|enrollment|financing|credit|volunteer|adoption|foster|pet) application|apply(ing)? (to|for) (adopt|foster)\b|applying for (the |a |an )?[^.]{0,40}? card\b|application for (the |a |an |your )?[^.]{0,50}? card\b(?!\s+(services|operations|analyst|specialist|associate|representative|manager|engineer|role|position|team))|apply(ing)? to live|pre-?approv\w*|global entry|tsa pre-?check|trusted traveler|enrollment cent(er|re)|(visa|consular|embassy) (interview|appointment)|(mba|master'?s|ph\.?d\.?|doctoral|undergraduate|degree) (program|programme|application))/i;
// A university's admissions office writes about admissions, never about a job.
const ADMISSIONS_SENDER = /\badmissions?\b/i;
// What scams and look-alikes ask for; a real employer never does in a first message.
// WO-040: payment apps, a copy of an ID, a bank login and "send us your name and address" are the same ask.
const SCAM = /\b(telegram|whats ?app|signal app|check to (purchase|buy)|purchase (your |a |the )?(work )?(equipment|supplies|laptop|computer|software)|reimburse you|approved vendor|starter kit|bank (details|account (details|number)|login)|ssn|social security|gift cards?|no interview (required|needed)|claim your|sign-on bonus of \$|secret shopper|mystery shopper|per assignment|wire transfer|crypto(currency)?|zelle|cash ?app|venmo|copy of your (id|passport|driver'?s licen[cs]e)|(send|share|provide|kindly send) (us )?your (full name|home address|address|date of birth)|no experience (needed|required))\b/i;
// A look-alike domain: an employer's name joined to a hiring word ("amazon-hr-careers.com", "deloitte-onboarding.com").
const LOOKALIKE = /(^|-)(careers?|jobs?|hiring|recruit\w*|hr|talent|staffing|onboarding|offers?|employment|workforce)(-|$)/;
// WO-045: a sales sequence's follow-up ("are you the right person to talk to about ...", "a 15-min demo of our platform").
const COLD = /\b(came across your (profile|background|resume)|caught my eye|my client|open to (new )?opportunities|would you be interested|are you interested in|exciting (new )?opportunit|(are you|you are|you're) the right person|right person to (talk|speak|chat|reach)|book(s|ed)? \d+% more|(\d+[- ]?min(ute)?|quick|short) demo|demo of our)/i;
const RECRUITER_TEXT = /\b(your (application|resume|candidacy|file|portfolio)|the (hiring manager|hiring team|team) is (still )?reviewing|hiring manager|still (in process|being (reviewed|considered)|reviewing|collecting)|i'?m the recruiter|recruiter (for|on) the|thanks for (reaching out|following up|checking in|your (note|message|email|patience))|thank you for (reaching out|your (email|message|patience|note))|got your message|keep you posted|be in touch|(you('ll| will| should)|expect to) hear (back )?from (me|us)|(i'?ll|i will|we'?ll|we will) (follow up|get back to you|let you know|update you)|still (interviewing|collecting|gathering|waiting)|(finishing|wrapping) up (the|our|interviews)|hiring decisions?|decisions? (are|is) (delayed|expected)|(salary|compensation|pay) expectations|earliest start date)\b/i;
// A step already done is not an invitation to it: "after completing the assessment", "thank you for interviewing".
const PAST_STEP = /\b(thanks? (you )?(again )?for (completing|taking|interviewing|your time)[^.]*|following (your|the) (assessment|interview|call)|after (your|the) (assessment|interview|call)|interview follow up)\b/gi;
// WO-040: a step that may come is not an invitation to it: "if you are selected for an interview, we will contact you".
// WO-043: "if you are not selected for an interview" is a condition too.
const MAYBE_STEP = /\b(if|should|once|when|in case) (you are |you're |you get |you be |you have been )?(not |n't )?(been )?(selected|chosen|shortlisted|invited|moved forward)\b[^.]*/gi;
// A job word: a company's own domain writing about a step names the application, the role or the process. Without one,
// "complete your assessment" or "take your test" is the company's product talking.
const JOB_CUE = /\b(applications?|applied|applying|candidate|candidacy|positions?|roles?|jobs?|openings?|requisition|interview\w*|recruit\w*|hiring|internship|(graduate|internship|leadership|rotational|analyst|trainee|early careers?) program(me)?|resume|cv|portfolio|panel|next (stage|step|round)|employment|start date)\b/i;
const JOB_SENDER = /(career|recruit|talent|jobs?\b|hiring|\bhr\b|people)/i;
// Words that make a message worth a second look by the model (WO-040), when the rules found no status phrase.
const STEP_CUE = /\b(applications?|applied|candidacy|candidate|positions?|roles?|interview\w*|assessment|offer|recruit\w*|hiring|next steps?|update on|status|decision|move forward|moving forward|schedul\w*|availability)\b/i;

// ------------------------------------------------------------------------------------------------ WO-043: intent scorer
// The phrase rules above fit the wordings they were tuned on (WO-040: 33-50% recall on unseen wording). The scorer reads
// the same subject and snippet as families of intent instead of fixed phrases: a negator in front of any verb of progress
// ("won't be taking yours further", "has not progressed") is a rejection however it is worded; a step noun next to a
// scheduling verb is an interview; a test noun next to a deadline is an assessment. Each family is one feature; the rule
// hits above are features too. A kind's score is the sum of its feature weights (MAIL_WEIGHTS, fitted on the tuning
// splits only by evals/career/mail-fit.ts; deterministic, no model, no network). A kind is said only when its share of
// the evidence is at least MAIL_DECISION.minShare and its own words are present; otherwise the message is "other".
// Every guard above still runs first, and the ones after a phrase hit (job board, personal address, cold outreach, no
// job word) still run after the scorer. Code, not weights, keeps the safety rules: words that decide against the person
// are never another status, an offer talked about is never an interview, a call is an interview only about the
// application, and a recruiter's reply only from a person.
// Text the families read: lower case, straight quotes, contractions spelled out ("won't" -> "will not"), and a line break
// (the subject's end) as a sentence's end.
export function normText(t: string): string {
  return String(t ?? "").toLowerCase().replace(/\s*\n+\s*/g, ". ").replace(/[’‘`]/g, "'").replace(/[“”]/g, '"')
    .replace(/\bwon't\b/g, "will not").replace(/\bcan't\b/g, "cannot").replace(/\bshan't\b/g, "shall not").replace(/n't\b/g, " not")
    .replace(/\bi'm\b/g, "i am").replace(/'re\b/g, " are").replace(/'ll\b/g, " will").replace(/'ve\b/g, " have").replace(/'d\b/g, " would")
    .replace(/\b(it|that|there|what|here|who)'s\b/g, "$1 is").replace(/\s+/g, " ").trim();
}
const re = (s: string) => new RegExp(s, "i");
// A verb of progress through a hiring process. Negated in its clause, it is a decision against the person.
const PROGRESS = String.raw`(mov(e|ed|es|ing)( (you|your \w+|yours|it|this))? (forward|ahead|on|further|to the next)|proceed\w*|progress\w*|advanc\w*|continu\w*|tak(e|ing) (you|your \w+|yours|it|this|things|them)( any)? (further|forward)|pursu\w*|consider(ed|ing)?|select\w*|chosen|shortlist\w*|invit\w*|offer(ing)? you|(an|the|any) offer|extend\w*|schedul\w*|hir(e|ed|ing)(?! (team|manager|managers|process|committee|panel|lead|partner))|(been )?successful|match\w*|(a|the right|a good|a strong) (fit|match)|align\w*|go(ing)? (forward|ahead)|be (moving|proceeding|progressing|continuing|advancing|offering|inviting|scheduling|pursuing|taking|able to (move|offer|proceed|take|invite|extend|progress|advance|continue)))`;
const NEGATED_PROGRESS = re(String.raw`\b(not|no longer|unable to|cannot|never|decided against)\b(\s+\S+){0,5}?\s+` + PROGRESS + String.raw`\b`);
// A clause the negation does not decide anything in: a condition, an instruction, a group of other people.
const NOT_A_DECISION = /\b(if|unless|until|without|otherwise|whether|in case)\b|please do not|do not (hesitate|forget|miss|worry|reply|respond|share)|\b(those|anyone|applicants|candidates) (who|that) ((are|were|have|do|did|will|may) )?(not|never)\b/;
const clauses = (n: string) => n.split(/[.;!?\n]+|,? but |,? however,? /i);
// WO-045: the text without the clauses that negate a step ("we will not be extending an offer"), as written.
function unNegated(t: string): string {
  return t.split(/(?<=[.;!?\n])/).filter((c) => { const n = normText(c); return NOT_A_DECISION.test(n) || !NEGATED_PROGRESS.test(n); }).join(" ");
}
// WO-045: a reply's subject in the languages recruiters write in ("Re:", "AW:", "SV:", "R:", "RES:", "Antw:").
export const REPLY_PREFIX = /^\s*(re|aw|sv|vs|antw|r|rif|res|odp|ynt)\s*:/i;
// The parts of a text that can carry a decision for a rejection phrase (read on the normalized words, returned as
// written): split at commas too, and dropped only when the part opens with a condition ("if you are not selected, ...")
// or is about other people or an instruction.
const CONDITION_FIRST = /^\s*(if|unless|should|in case|once|when|whether)\b|\b(until|unless)\b|please do not|do not (hesitate|forget|miss|worry|reply|respond|share)|\b(those|anyone|applicants|candidates) (who|that) ((are|were|have|do|did|will|may) )?(not|never)\b/;
const decidingClauses = (t: string) => t.split(/[.;!?\n,]+|\bbut\b|\bhowever\b/i).filter((c) => !CONDITION_FIRST.test(normText(c)));
// Families: [feature, regex] read on the normalized text ("all": rejection families read the whole text, a step already
// done included, because "thank you for interviewing ... unfortunately" is a rejection; the rest read the live text).
const FAMILIES: [string, RegExp, "all" | "live"][] = [
  // rejection
  // A decision verb (going with, hiring, selecting, focusing on, giving the offer to) whose object is someone else.
  ["rj:other_candidate", re(String.raw`\b((go|going|gone|went|mov(e|ed|ing) (forward|ahead|on)|proceed(ed|ing)?|continu(e|ed|ing)) (forward |ahead )?with|(focus\w*|concentrat\w*) on|(opted|opt|gone|went|go|going|decided) for|decided on|hire|hired|hiring|select(ed|ing)?|chose|chosen|identified|pursu(e|ed|ing)|fill(ed|ing)?( the \w+)?( with)?|offer\w* (the|this) (role|position|job) to|extended the offer to|offer went to|offered to)\b(\s+\S+){0,3}?\s+(another|other|a different|someone (else|whose|who|with)|somebody else|an internal|a more \w+|a stronger|candidates? (who|whose|with|that)|applicants? (who|whose|with|that)|a candidate|an applicant)\b`), "all"],
  ["rj:closed", re(String.raw`\b(position|role|opening|openings|requisition|req|vacancy|job|posting)\b(\s+\S+){0,8}?\s+(has|have|was|were|is|are) (now |already |since |just )?(been )?(filled|closed|cancell?ed|withdrawn|put on hold|placed on hold|on hold|no longer (open|available|accepting))|\bfilled (internally|its|the|this|our|all)\b|\b(has|have) (now )?been filled\b|no longer (hiring|recruiting) for`), "all"],
  ["rj:pass", re(String.raw`\b(pass(ing)? on (your|you)|(will|would|going to|decided to|have to|had to) pass\b|end the process|(go|going|gone|went|head\w*|mov\w*|decided to go) (in )?(another|a different) (way|direction)|(keep|continue) (looking|searching|our search)|not (the right|a good|a strong|a) (fit|match)|(looking|look) for someone (with )?more|clos\w* (out )?(your|all|all remaining|remaining) (applications?|candidacy)|no longer (being )?(considered|under consideration|in consideration|in the running)|(will|would) not (be )?(reviewed|considered) further|(has|have|was|were) not (been )?successful|unsuccessful|(application|candidacy|profile)\b[^.]{0,60}? (has been|was|is|have been) (declined|rejected|archived)|not (been )?(selected|chosen|shortlisted)|it (has been|was) (declined|rejected))\b`), "all"],
  ["rj:regret", re(String.raw`\b(unfortunately|regret\w*|sadly|sorry to (say|share|inform|tell|let)|we are sorry|i am sorry|disappoint\w*)\b`), "all"],
  ["rj:closer", re(String.raw`\b(wish(ing)? you (the |all the |every |continued |much |a lot of )?(best|luck|success)|best of luck|good luck (with|in) your|success in your (job )?(search|future|career))`), "all"],
  ["rj:future", re(String.raw`\b(keep (your|you) (resume|cv|details|profile|information|application)? ?(on file|in (our )?(database|mind|system))|(on file|in our database) for future|encourage you to (re-?apply|apply|keep an eye)|re-?apply|future (openings|opportunities|roles|vacancies|positions)|paths cross|stay in touch)\b`), "all"],
  ["rj:decision", re(String.raw`\b((tough|difficult|hard) (call|decision|choice)|not (always )?(an )?easy|on this occasion|this time\b)`), "all"],
  // interview
  // A recorded or one-way "interview" is an assessment, not a meeting with a person (WO-040).
  ["iv:noun", re(String.raw`\b((?<!(one-way|on-demand|pre-recorded|recorded|asynchronous|async|digital)( video)? )interview(s|ing)?|phone screen|screening call|recruiter screen|technical screen|onsite|on-site|superday|super day|power day|(first|second|third|next|final) round|interview loop|panel|walk-in|face to face|meet and greet|discovery cent(re|er)|assessment cent(re|er)|hiring event)\b`), "live"],
  ["iv:talk", re(String.raw`\b(call|chat|coffee|conversation|meeting|session|discussion|zoom|teams|webex|google meet|meet (you|with|our|the)|get to know|speak (with|to)|talk (with|to)|pairing)\b`), "live"],
  ["iv:invite", re(String.raw`\b(would (like|love) to (meet|speak|talk|chat|interview|connect|have you|bring you|invite|set up|schedule|get to know|move you|continue)|wants? to (meet|speak|talk|chat|interview)|(keen|eager|excited) to (meet|speak|talk|chat)|(invit(e|ed|ing)|pleased to invite|happy to invite|delighted to invite) (you )?(to|for)|you are invited to|shortlisted for|(selected|shortlisted|chosen) (you )?(to|for) (participate|the |a |an )?(\w+ ){0,2}(round|interviews?|stage|onsite|superday|discussion)|(moved?|moving) (you )?(forward |on )?to (the |a )?(next|following|final|onsite|interview|virtual)|advanc(e|ed|ing) (you )?to|progressed to|next up is|congratulations on (advancing|moving|clearing|progressing)|great news)\b`), "live"],
  ["iv:schedule", re(String.raw`\b(schedul\w*|re-?schedul\w*|(moved|shifted|pushed|changed|updated) (your|the) ([\w-]+ ){0,3}(interview|call|chat|screen|meeting|time)|(swing|stop|drop|pop) (by|in)|(any chance|is there any chance) you (are|would be|will be) (around|free|available)|set up|book (a|an|any|your|time|it)|(pick|choose|select|book|grab) (a |an |one |any )?([\w-]+ ){0,2}(time|slot|times|slots|day|date)s?\b|pick (a |one )?(time|slot|day|date)|choose (a |an |one |from )?(the )?(time|slot|day|date|appointment|available|proposed)|select (a |from |one )?(the )?(time|slot|available|date)|(share|send|provide|let us know|let me know) (us |me )?(your |some |a few |three |two )?(availability|times|windows|slots|when you)|availability|available times|times? (that|which) works?|what times? (work|suit)|works? for you|time ?slots?|self-scheduling|my calendar|confirm (your )?(attendance|presence|availability|the date)|grab|come by|bring you (in|back)|have you back|hop on|jump on|are you (free|available)|(do you have|have you got) (\d+|a few) min\w*)\b`), "live"],
  ["iv:when", re(String.raw`(^(updated invitation|invitation|rescheduled|confirmed|updated|new time proposed):|\b((is|are|has been|have been) (confirmed|scheduled|booked|set) (for|on)|reminder|new time|(for|on) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(monday|tuesday|wednesday|thursday|friday) (morning|afternoon|evening)|tomorrow at|(on|this|next) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{1,2}(:\d\d)? ?(am|pm)|half-day)\b)`), "live"],
  ["iv:who", re(String.raw`\b(with (me and )?(the |our |my |two |\w+ )?(co-?founders?|ceo|cto|coo|vp of \w+|hiring manager|team|recruiter|recruiting team|engineers?|director|lead|head|manager|founder|controller|store manager|nurse manager|practice manager|interviewers?|people)|interviewers?:|live)\b`), "live"],
  // assessment
  ["as:noun", re(String.raw`\b(assessments?|tests?|challenges?|exercises?|assignments?|take[- ]?home|case study|questionnaire|quiz|simulation|tryout|games|work sample|writing sample|admit card|hall ticket|(written|business|short|take-home|practical|mini) case|(coding|aptitude|online|written) round)\b`), "live"],
  ["as:task", re(String.raw`\b(tasks?|project|critique|problem set)\b`), "live"],
  ["as:do", re(String.raw`\b(complete|completing|take|taking|finish|solve|submit|return|record|play|attempt|sit|build|draft|work through|put together)\b`), "live"],
  ["as:deadline", re(String.raw`\b(within (the next )?\d+ (days?|hours?)|in the next \d+ (days?|hours?)|(\d+|one|two|three|four|five|seven) (days?|hours?) to (complete|finish|submit)|deadline|expires?|time limit|must be completed|one sitting|duration|valid (until|till|for)|(send|return|submit|share) (it|them|this|that|one|your \w+)( back)?( to (us|me))? (by|before|within|no later))\b`), "live"],
  // Neutral cues the fit weighs for itself: a length in minutes (a call or a test), a step named as the next one.
  ["x:minutes", re(String.raw`\b\d+[- ]?(min|mins|minutes?)\b`), "live"],
  ["x:next_step", re(String.raw`\b((as )?(a|the|our|your) next (step|stage)|next (step|stage) (is|will be|in)|for the next (step|stage|round))\b`), "live"],
  ["as:recorded", re(String.raw`\b(record\w*|on-demand|one-way|digital interview|pre-recorded|asynchronous)\b`), "live"],
  ["as:vendor_word", re(String.raw`\b(hackerrank|codesignal|codility|hirevue|pymetrics|karat|testgorilla|shl|criteria|vervoe|modern ?hire|hackerearth|coderpad|wonderlic|harver|prove it|ccat)\b`), "live"],
  // offer
  ["of:noun", re(String.raw`\b(offer (letter|details|package|of employment|for)|(your|an|the|formal|written|verbal|contingent|conditional|job|employment|internship) offer\b(?! (expires|ends|is valid|valid|code|inside|is waiting|waiting|just))|letter of intent|employment (contract|agreement)|(your|the) contract\b|contract (proposal|is attached|for (your )?signature))`), "live"],
  ["of:extend", re(String.raw`\b(extend\w* (you )?(an? |the |your )?(formal |verbal |written |contingent |conditional )?offer|(make|making|present|presenting) you (with )?an offer|offer you (the|a|an)( [\w-]+){0,5} (position|role|job|place|internship|spot|seat)|offer you employment|offer\w* (has been |is )?released|(have been|were|are|been) offered|pleasure to offer)\b`), "live"],
  ["of:joy", re(String.raw`\b(congratulations|congrats|it is official|it is a yes|welcome aboard|welcome to the team|the role is yours|got the job|(selected|picked|chose) you|you have been selected (as|for the position)|(want|love) (for )?(you )?to (join|have you join)|love to have you join|join (us|the team|\w+) as|welcome you (as|to (the|our) team)|(come|coming) on board|on board as)\b`), "live"],
  ["of:sign", re(String.raw`\b(accept\w* (your |the )?offer|accept (it|by|within)|sign (the|your|and)|e-sign|signature|compensation|salary|equity|start date|background check|benefits|new hire paperwork)\b`), "live"],
  // received
  ["rc:got", re(String.raw`\b((received|receipt of|got|have) your (application|submission|resume|cv|profile|candidacy|documents|details)|your (application|submission|candidacy|resume|profile|documents)\b[^.]{0,60}? (has |was |is )?(been )?(received|submitted|complete|registered|in|safely|made it|arrived|reached|landed)\b|submitted successfully|successfully (submitted|applied|registered|received)|made it to us|has arrived|has reached|safely with us|registered (successfully|your)|(have|has) received your|confirm\w* (the )?(receipt|that we|we have)|acknowledg\w*|application (confirmation|complete|received))\b`), "live"],
  ["rc:thanks", re(String.raw`\b(thank(s| you)?( so much| very much)? for (applying|your application|your interest|submitting|taking the time to apply|putting|apply|your submission|the application)|(many|thanks) thanks for your application)`), "live"],
  ["rc:review", re(String.raw`\b((will|are|is|now|currently) (be )?(review(ed|ing)?|being (reviewed|processed)|under review|looking (through|over|at))|under review|being processed|(will|we will|i will) (be in touch|reach out|contact you|get back to you|let you know)( \w+){0,3}? (if|once|as soon|should|when)|if (there is|we find) a (match|fit)|if your (qualifications|experience|skills|background|profile)|no need to reply|track (its|your application|the) status|what happens next|rolling basis)\b`), "live"],
  // recruiter reply
  ["rr:status", re(String.raw`\b((no|any) (decision|update|news|feedback) (yet|just yet)|(very much |still )in consideration|taking (longer|more time)|inform you (about|of) the (outcome|result|decision)|reach (back )?out (as soon|once|when)|ping you|(has|have) not made a decision|radio silence|(sorry|apologies) for the (delay|slow reply|wait|radio silence)|waiting (on|for) (feedback|their|the team|the hiring)|still (meeting|deliberating|aligning)|(the )?(hm|hiring manager|team|panel) (is|are|was|has been) (still|out|traveling|travelling|back|meeting)|still (very much )?(in the running|under consideration|being considered|talking|deciding|finali[sz]ing|finishing|interviewing|reviewing|collecting|open|in process)|(running|a bit|a little) behind|taking (a little |a bit )?longer|circle back|come back to you|(should|will|would) (have|know) (more|something|an update|feedback)|(could|can) you (send|share|tell|confirm)|kindly (share|send)|(passed|shared|flagged|forwarded|noted) (your|it|them|this)|update (you|for you)|(hiring manager|team|panel) (is|are|was) (still|out|traveling|meeting)|timeline|keep you posted|be in touch)\b`), "all"],
];
export const MAIL_KINDS: MailKind[] = ["received", "rejection", "interview", "assessment", "offer", "recruiter_reply", "other"];
// BEGIN MAIL_WEIGHTS (generated by evals/career/mail-fit.ts from 493 tuning emails; steps 4000, rate 0.5, l2 0.004)
export const MAIL_BIAS: Partial<Record<MailKind, number>> = { rejection: 0.24, interview: -0.93, assessment: -0.83, offer: -0.43, recruiter_reply: -0.53, other: 2.52 };
export const MAIL_WEIGHTS: Record<string, Partial<Record<MailKind, number>>> = {
  "as:deadline": { received: -0.18, rejection: -0.14, interview: -0.11, assessment: 0.67, other: -0.22 },
  "as:do": { received: -0.35, rejection: -0.52, interview: -0.44, assessment: 1.31, offer: -0.3, recruiter_reply: 0.11, other: 0.19 },
  "as:noun": { received: -0.44, rejection: -0.41, interview: -0.23, assessment: 1.29, offer: -0.21, recruiter_reply: -0.17, other: 0.15 },
  "as:recorded": { received: -0.05, interview: -0.19, assessment: 0.48, other: -0.16 },
  "as:task": { received: -0.15, rejection: -0.18, interview: -0.06, assessment: 0.43, offer: -0.06, recruiter_reply: -0.05, other: 0.08 },
  "as:vendor_word": { received: -0.09, rejection: -0.08, interview: -0.06, assessment: 0.38, recruiter_reply: -0.05, other: -0.06 },
  "iv:invite": { received: -0.36, interview: 0.92, assessment: 0.22, recruiter_reply: -0.3, other: -0.52 },
  "iv:noun": { received: -0.5, rejection: -0.08, interview: 1.26, offer: -0.4, other: -0.3 },
  "iv:schedule": { received: -0.33, rejection: -0.36, interview: 1.48, assessment: -0.29, recruiter_reply: -0.19, other: -0.29 },
  "iv:talk": { received: -0.33, rejection: -0.17, interview: 0.9, assessment: -0.19, offer: 0.17, recruiter_reply: -0.47, other: 0.08 },
  "iv:when": { received: -0.19, rejection: -0.32, interview: 0.86, assessment: -0.16, recruiter_reply: -0.16, other: -0.05 },
  "iv:who": { received: -0.06, interview: 0.46, assessment: -0.18, offer: -0.1, other: -0.15 },
  "of:extend": { received: -0.25, rejection: 0.05, interview: -0.13, assessment: -0.09, offer: 0.96, recruiter_reply: -0.22, other: -0.32 },
  "of:joy": { received: -0.21, rejection: -0.32, interview: 0.14, assessment: -0.16, offer: 0.91, recruiter_reply: -0.15, other: -0.2 },
  "of:noun": { received: -0.23, rejection: -0.22, interview: -0.35, assessment: -0.13, offer: 1.51, recruiter_reply: -0.23, other: -0.34 },
  "of:sign": { received: -0.12, rejection: -0.18, interview: -0.08, assessment: -0.13, offer: 0.47, recruiter_reply: 0.14, other: -0.09 },
  "rc:got": { received: 1.6, rejection: -0.44, interview: -0.27, assessment: -0.2, offer: -0.21, recruiter_reply: 0.11, other: -0.6 },
  "rc:review": { received: 0.84, rejection: -0.46, interview: -0.17, assessment: -0.17, offer: -0.1, recruiter_reply: 0.1, other: -0.05 },
  "rc:thanks": { received: 0.77, rejection: 0.45, interview: -0.06, assessment: 0.12, offer: -0.34, recruiter_reply: -0.27, other: -0.68 },
  "rj:closed": { received: -0.25, rejection: 0.61, interview: -0.05, assessment: -0.05, offer: -0.05, other: -0.19 },
  "rj:closer": { received: -0.12, rejection: 0.71, offer: -0.05, recruiter_reply: -0.2, other: -0.26 },
  "rj:decision": { received: -0.19, rejection: 0.55, interview: -0.1, assessment: -0.06, other: -0.12 },
  "rj:future": { received: -0.09, rejection: 0.64, interview: -0.05, assessment: -0.05, offer: -0.06, recruiter_reply: -0.12, other: -0.27 },
  "rj:negated": { received: -0.49, rejection: 1.9, interview: -0.71, assessment: -0.16, offer: -0.21, recruiter_reply: -0.25, other: -0.07 },
  "rj:other_candidate": { received: -0.48, rejection: 1.38, interview: -0.1, assessment: -0.08, offer: -0.12, recruiter_reply: -0.25, other: -0.34 },
  "rj:pass": { received: -0.21, rejection: 0.95, interview: -0.23, assessment: -0.1, offer: -0.12, recruiter_reply: -0.26 },
  "rj:regret": { received: -0.15, rejection: 0.31, interview: -0.14, assessment: -0.07, offer: -0.07, recruiter_reply: -0.18, other: 0.3 },
  "rr:status": { rejection: -0.34, interview: -0.08, assessment: -0.16, offer: -0.16, recruiter_reply: 1.24, other: -0.53 },
  "rule:assessment": { received: -0.34, rejection: -0.28, interview: -0.3, assessment: 1.72, offer: -0.15, recruiter_reply: -0.19, other: -0.45 },
  "rule:interview": { received: -0.32, rejection: -0.15, interview: 1.58, assessment: -0.09, offer: -0.27, recruiter_reply: -0.29, other: -0.46 },
  "rule:offer": { received: -0.39, rejection: -0.32, interview: -0.23, assessment: -0.17, offer: 1.95, recruiter_reply: -0.19, other: -0.65 },
  "rule:received": { received: 1.77, rejection: -0.16, assessment: -0.05, offer: -0.31, recruiter_reply: -0.29, other: -0.97 },
  "rule:recruiter_reply": { received: -0.32, rejection: -0.23, assessment: -0.2, offer: -0.3, recruiter_reply: 1.56, other: -0.54 },
  "rule:rejection": { received: -0.56, rejection: 1.83, interview: -0.21, assessment: -0.18, offer: -0.21, recruiter_reply: -0.46, other: -0.22 },
  "s:ats": { received: 0.59, rejection: 0.76, interview: 0.63, assessment: 0.26, offer: 0.05, recruiter_reply: -0.58, other: -1.72 },
  "s:board": { received: 0.63, rejection: -0.18, interview: -0.32, assessment: -0.12, offer: -0.25, recruiter_reply: -0.1, other: 0.34 },
  "s:free": { received: -0.06, interview: -0.16, assessment: -0.05, offer: -0.06, recruiter_reply: -0.1, other: 0.4 },
  "s:person": { received: -0.51, rejection: -0.12, interview: 0.19, assessment: -0.1, offer: 0.15, recruiter_reply: 1.38, other: -0.98 },
  "s:re": { received: -0.21, rejection: 0.45, interview: -0.39, assessment: -0.13, offer: -0.19, recruiter_reply: 0.68, other: -0.22 },
  "s:vendor": { received: -0.07, rejection: -0.11, interview: -0.16, assessment: 0.93, offer: -0.07, recruiter_reply: -0.07, other: -0.44 },
  "x:minutes": { received: -0.22, rejection: -0.24, interview: 0.53, assessment: 0.11, offer: -0.15, recruiter_reply: -0.23, other: 0.2 },
  "x:next_step": { received: -0.16, rejection: -0.08, interview: -0.08, assessment: 0.75, offer: -0.09, other: -0.38 },
};
// END MAIL_WEIGHTS
// The least share of the evidence a kind needs to be said (chosen on the tuning splits by cross-validation, precision
// first). An object so evals/career/mail-fit.ts --cv can try others; nothing in the product changes it.
export const MAIL_DECISION = { minShare: 0.5 };

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
// Evidence is stored: one line, no long numbers (an emailed code or an ID never lands in the table), 300 characters.
function evidenceLine(kind: MailKind, phrase: string, subject: string, domain: string): string {
  const line = `${kind}: "${clip(phrase, 80)}" in subject "${clip(subject, 120)}" from ${clip(domain, 60) || "unknown sender"}`;
  return line.replace(/\d{6,}/g, "[number]").slice(0, 300);
}

export function classifyMail(m: MailMeta): Classified {
  return readMail(m).out;
}
// WO-043: the features the scorer saw for a message (feature -> the words that fired it), or null when a guard decided it
// before the scorer (no sender, a scam, a look-alike, a calendar, noise, an alert sender). Used by evals/career/mail-fit.ts.
export function mailFeatures(m: MailMeta): Map<string, string> | null {
  return readMail(m).features;
}
// A rejection family that decides against the person outright; with one present no other status is said (WO-043: a
// rejection read as an interview is the worst error there is).
const DECIDED_AGAINST = ["rule:rejection", "rj:negated", "rj:other_candidate", "rj:closed", "rj:pass"];
const OFFER_SAID = ["rule:offer", "of:extend", "of:noun"];
// The kinds that move the person forward. A thank-you for applying (received) is in most rejections; it never outvotes one.
const FORWARD: MailKind[] = ["interview", "assessment", "offer", "recruiter_reply"];
// The family prefix that is a kind's own evidence.
const OWN: Record<MailKind, string> = { received: "rc:", rejection: "rj:", interview: "iv:", assessment: "as:", offer: "of:", recruiter_reply: "rr:", other: "-" };
function readMail(m: MailMeta): { out: Classified; features: Map<string, string> | null } {
  const s = parseFrom(m.from), subject = String(m.subject ?? ""), snippet = String(m.snippet ?? "");
  const text = `${subject}\n${snippet}`;
  const other = (why: string): Classified => ({ kind: "other", evidence: evidenceLine("other", why, subject, s.domain) });
  const guard = (c: Classified) => ({ out: c, features: null });
  if (!s.domain) return guard(other("no sender"));
  const scam = SCAM.exec(text);
  if (scam) return guard(other(scam[0]));
  if (lookAlike(s)) return guard(other(`look-alike domain ${s.domain}`));
  if (SYSTEM_SENDER.test(`${s.name} ${s.local}`) || endsWithDomain(s.domain, SYSTEM_DOMAINS)) return guard(other("calendar or meeting notice"));
  const board = endsWithDomain(s.domain, JOB_BOARDS), vendor = endsWithDomain(s.domain, ASSESSMENT_VENDORS);
  const free = endsWithDomain(s.domain, FREE_MAIL), ats = atsSender(s);
  // An ATS or a vendor writes only about jobs; "Your Visa application" from Visa's careers site is one.
  const notJob = ats || vendor ? null : NOT_A_JOB.exec(text);
  // WO-045: a reply in a thread the person is in ("Re: Interview feedback?") is not a feedback form.
  const noise = NOISE_SUBJECT.exec(REPLY_PREFIX.test(subject) ? subject.replace(/\bfeedback\b/gi, "") : subject) ?? NOISE_TEXT.exec(text) ?? (notJob && ![collapsed(cleanName(s.name)), s.label].includes(collapsed(notJob[0].split(" ")[0])) ? notJob : null);
  if (noise) return guard(other(noise[0]));
  if (!ats && !vendor && ADMISSIONS_SENDER.test(`${s.name} ${s.local}`)) return guard(other("admissions office"));
  if (/^(job-?alerts?|jobalerts-noreply|alerts?|digest|newsletter|jobs-listings|inmail)/i.test(s.local)) return guard(other(s.local));
  const live = text.replace(PAST_STEP, " ").replace(MAYBE_STEP, " ");
  const cold = !ats && !vendor ? COLD.exec(text) : null;
  // A person at a company domain; only such a sender writes a recruiter's reply. Cold outreach is not a reply to anything.
  const person = !board && !free && !vendor && !ats && looksLikePerson(s) && !COLD.test(text);
  const f = new Map<string, string>();
  for (const [kind, re, needs] of RULES) {
    // WO-043: a rejection phrase counts only in a clause that decides something: not in a condition ("if you are not
    // selected"), an instruction, or a sentence about other people ("candidates who are not selected will be told").
    const hit = kind === "rejection" ? decidingClauses(text).map((c) => re.exec(c)).find((h) => h) ?? null : re.exec(kind === "offer" ? unNegated(live) : live);
    if (hit && (!needs || needs.test(text)) && !f.has(`rule:${kind}`)) f.set(`rule:${kind}`, hit[0]);
  }
  const replied = REPLY_PREFIX.exec(subject);
  const reply = RECRUITER_TEXT.exec(text) ?? (replied ? [replied[0].trim()] : null);
  // WO-045: a sender known only by a given name ("Ollie") is a person, but a bare "Re:" from one is not a recruiter's reply
  // (the WO-024 hole for full names, "Re: lunch", is not widened).
  if (person && reply && (personName(s.name) || !replied || reply[0] !== replied[0].trim())) f.set("rule:recruiter_reply", reply[0]);
  if (ats) f.set("s:ats", s.domain);
  if (vendor) f.set("s:vendor", s.domain);
  if (board) f.set("s:board", s.domain);
  if (free) f.set("s:free", s.domain);
  if (person) f.set("s:person", s.address);
  if (replied) f.set("s:re", replied[0].trim());
  const all = normText(text), alive = normText(live), deciding = decidingClauses(all).join(". ");
  // WO-045: an offer said not to be made ("we won't be extending an offer") is not offer talk; only the rejection reads it.
  const aliveOffer = normText(unNegated(live));
  for (const [name, rx, on] of FAMILIES) {
    const hit = rx.exec(on === "live" ? (name.startsWith("of:") ? aliveOffer : alive) : name.startsWith("rj:") ? deciding : all);
    if (hit) f.set(name, hit[0]);
  }
  for (const c of clauses(all)) {
    if (NOT_A_DECISION.test(c)) continue;
    const hit = NEGATED_PROGRESS.exec(c);
    if (hit) { f.set("rj:negated", hit[0]); break; }
  }
  const scores = mailScores(f);
  let kind = MAIL_KINDS.reduce((a, b) => (scores[b] > scores[a] ? b : a), "other" as MailKind);
  // WO-045: an invitation to a step often thanks the person for applying or answers their note ("thanks for applying, want
  // to hop on a call?"): the earlier steps' evidence agrees with an interview or a test that leads, it is not against it.
  // WO-045: a person's own receipt ("just confirming we got your application ... thanks for your patience") is a receipt:
  // courtesy words are not news about where the process stands unless they say so (rr:status).
  const receipt = (kind === "recruiter_reply" || kind === "received") && f.has("rule:received") && !f.has("rr:status");
  if (receipt) kind = "received";
  if (kind !== "other" && share(scores, kind, kind === "interview" || kind === "assessment" ? EARLIER : receipt ? ["recruiter_reply"] : []) < MAIL_DECISION.minShare) kind = "other";
  // A kind is said only on its own words: a sender, a greeting and a thank-you never say "no" (or anything) by themselves.
  if (kind !== "other" && ![...f.keys()].some((k) => k.startsWith(OWN[kind]) || k === `rule:${kind}`)) kind = "other";
  // A recruiter's reply comes from a person at a company; without the WO-024 reply rule it needs a job word too.
  if (kind === "recruiter_reply" && (!person || (!f.has("rule:recruiter_reply") && !JOB_CUE.test(text)))) kind = "other";
  // A call or a chat is an interview only when the words refer to the person's application (WO-040 review: a sales rep or
  // a sourcer asks for a call too). An interview noun, a rule's phrase or an ATS sender already says it is about one.
  if (kind === "interview" && !f.has("rule:interview") && !f.has("iv:noun") && !ats && !APP_REF.test(text)) kind = "other";
  // Words that decide against the person: a rejection when it leads every other status (under the share bar too: these
  // families are written to be decisive), otherwise nothing at all.
  if (DECIDED_AGAINST.some((k) => f.has(k))) kind = FORWARD.every((k) => scores.rejection >= scores[k]) ? "rejection" : "other";
  // An offer talked about is not an interview, a test, a receipt or a recruiter's note ("a call to go through the offer").
  if (["interview", "assessment", "received", "recruiter_reply"].includes(kind) && OFFER_SAID.some((k) => f.has(k))) kind = "other";
  if (kind !== "other") {
    // The words that said it: the rule's own phrase when a rule said this kind, else the heaviest family for it.
    const phrase = f.get(`rule:${kind}`) ?? [...f.entries()].filter(([k]) => k.startsWith(OWN[kind]) && (MAIL_WEIGHTS[k]?.[kind] ?? 0) > 0)
      .sort((a, b) => (MAIL_WEIGHTS[b[0]]?.[kind] ?? 0) - (MAIL_WEIGHTS[a[0]]?.[kind] ?? 0))[0]?.[1] ?? kind;
    const said = (c: Classified) => ({ out: c, features: f });
    // A job board says only that an application went; anything else from it is its own advert.
    if (board && kind !== "received") return said(other(`job board: ${phrase}`));
    if (free && kind !== "rejection") return said(other(`personal address: ${phrase}`));
    // Cold outreach is not a step in anything the person applied to, however it is worded (WO-040).
    if (cold) return said(other(cold[0]));
    // An automated sender that is not an ATS writes about a job only in job words; "we regret that we are unable to ship"
    // is a shop (WO-040 review: rejections too).
    if (!ats && !vendor && !board && !looksLikePerson(s) && !JOB_SENDER.test(`${s.local} ${s.name}`) && !JOB_CUE.test(text)) return said(other(`no job word: ${phrase}`));
    const company = companyOf(s, subject, snippet, vendor);
    if (board && !company) return said(other("job board, no employer named"));
    return said({ kind, company, role: roleOf(subject, snippet), domain: s.domain, evidence: evidenceLine(kind, phrase, subject, s.domain) });
  }
  if (COLD.test(text)) return { out: other(COLD.exec(text)![0]), features: f };
  // Unclear, from an employer's ATS or a vendor, or naming the job, with a step word: "other" by the rules, but worth a
  // second look. A person's "status of your filing" or a shop's "order status" names no job and is never ambiguous.
  const out = other("no status phrase");
  if (!board && !free && (ats || vendor || JOB_CUE.test(text)) && STEP_CUE.test(text)) out.ambiguous = true;
  return { out, features: f };
}
// A kind's score: its bias plus the weight of every feature present.
export function mailScores(f: Map<string, string> | Set<string>): Record<MailKind, number> {
  const out = Object.fromEntries(MAIL_KINDS.map((k) => [k, MAIL_BIAS[k] ?? 0])) as Record<MailKind, number>;
  for (const name of f.keys()) for (const [k, w] of Object.entries(MAIL_WEIGHTS[name] ?? {})) out[k as MailKind] += w as number;
  return out;
}
// A kind's share of the evidence (softmax over the scores).
// with: kinds whose evidence counts toward this kind's share (WO-045: the earlier steps, for an interview or a test).
const EARLIER: MailKind[] = ["received", "recruiter_reply"];
function share(scores: Record<MailKind, number>, kind: MailKind, with_: MailKind[] = []): number {
  const top = Math.max(...Object.values(scores));
  let sum = 0;
  for (const v of Object.values(scores)) sum += Math.exp(v - top);
  return [kind, ...with_].reduce((a, k) => a + Math.exp(scores[k] - top), 0) / sum;
}
// The brand of an ATS or a test vendor on any other domain ("greenhouse.xyz", "ashbyhq.net", "myworkdayjobs.net").
const BRAND_EXEMPT = new Set(["amazon", "oraclecloud"]);
const ATS_BRANDS = new Set([...ATS, ...ASSESSMENT_VENDORS].map((d) => registrableLabel(d)).filter((l) => l && !BRAND_EXEMPT.has(l)));
export function lookAlike(s: Pick<Sender, "label" | "domain">): boolean {
  if (s.label.includes("-") && LOOKALIKE.test(s.label)) return true;
  return ATS_BRANDS.has(s.label) && !endsWithDomain(s.domain, [...ATS, ...ASSESSMENT_VENDORS]);
}

// WO-040: a kind decided outside the rules (the model's second pass, career_mail_model.ts), with the employer, role and
// domain read by the same code the rules use. The model never names the employer or writes anything the person reads.
export function decidedAs(m: MailMeta, kind: Exclude<MailKind, "other">, why: string): Classified {
  const s = parseFrom(m.from), subject = String(m.subject ?? ""), snippet = String(m.snippet ?? "");
  const company = companyOf(s, subject, snippet, endsWithDomain(s.domain, ASSESSMENT_VENDORS));
  return { kind, company, role: roleOf(subject, snippet), domain: s.domain, evidence: evidenceLine(kind, why, subject, s.domain), source: "model" };
}

// WO-034: the phrase that makes a text an interview invitation, read with the same rules as mail (a step already done is
// not an invitation; a rejection, an offer, a scam or a newsletter is not one either), for an invite pasted into chat
// where there is no sender to read. null: it does not read as an invite.
export function interviewPhrase(text: string): string | null {
  const t = String(text ?? "");
  if (SCAM.exec(t) || NOISE_TEXT.exec(t)) return null;
  for (const [kind, re] of RULES) {
    const hit = re.exec(kind === "rejection" ? t : t.replace(PAST_STEP, " "));
    if (hit) return kind === "interview" ? hit[0] : null;
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ applications
// One application, from any source: the apply queue (career_apply_jobs), the tracker the person keeps by text, or one
// first seen in mail (an application made by hand that nothing else knew about).
export interface TrackedApp {
  ref: string; company: string; role?: string; url?: string;
  applied_at?: string; stage: string; source: "queue" | "tracker" | "mail";
  // source: where that event was read ("mail" for a status email, "tracker" for what the person reported).
  events?: { kind: MailKind | "applied"; at: string; source?: string }[];
  // WO-034: the date of an interview the invite stated (career_interviews). With it, the interview planner
  // (career_invite.ts interviewDrafts) owns the thank-you and the nudge, counted from the interview, not the invite.
  interview_on?: string;
}
export const STAGES = ["Saved", "Submitted", "Recruiter screen", "OA/assessment", "Interview rounds", "Final", "Offer", "Rejected", "Withdrawn", "Accepted"];
export const TERMINAL = new Set(["Rejected", "Withdrawn", "Accepted"]);
const RANK: Record<string, number> = { Saved: 0, Tailoring: 0, Ready: 0, Submitted: 1, Confirmed: 1, Ghosted: 1, "Recruiter screen": 2, "OA/assessment": 3, "Interview rounds": 4, Final: 5, Offer: 6 };
export const STAGE_OF: Record<Exclude<MailKind, "other">, string> = {
  received: "Submitted", recruiter_reply: "Recruiter screen", assessment: "OA/assessment", interview: "Interview rounds", offer: "Offer", rejection: "Rejected",
};

// The board slug an application's link carries: boards.greenhouse.io/stripe, jobs.lever.co/plaid, jobs.ashbyhq.com/ramp,
// jpmc.wd5.myworkdayjobs.com.
function urlSlugs(url?: string): string[] {
  try {
    const u = new URL(String(url ?? ""));
    const host = u.hostname.toLowerCase(), first = u.pathname.split("/").filter(Boolean)[0] ?? "";
    const out = [registrableLabel(host)];
    if (/(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com)$/.test(host) && first) out.push(first.toLowerCase());
    if (/myworkdayjobs\.com$/.test(host)) out.push(host.split(".")[0]);
    return out.filter(Boolean);
  } catch { return []; }
}
const roleWords = (r?: string) => new Set(companyTokens(r).filter((t) => t.length > 2 && !/^(the|for|and|role|position|program|summer|full|time|new|grad)$/.test(t)));
function roleOverlap(a?: string, b?: string): number {
  const x = roleWords(a), y = roleWords(b);
  let n = 0;
  for (const t of x) if (y.has(t)) n++;
  return x.size && y.size ? n / Math.min(x.size, y.size) : 0;
}

// Every application a message could be about: the employer named, the sender's own domain, or the board slug in the
// application's link. A role the message names that shares no word with an application's role rules that one out.
export function candidates(mail: Classified, apps: TrackedApp[]): TrackedApp[] {
  if (mail.kind === "other") return [];
  const label = mail.domain ? registrableLabel(mail.domain) : "";
  const fromCompanyDomain = !!mail.domain && !endsWithDomain(mail.domain, [...ATS, ...ASSESSMENT_VENDORS, ...JOB_BOARDS, ...FREE_MAIL]);
  return apps.filter((a) =>
    ((mail.company && sameCompany(a.company, mail.company)) ||
      (fromCompanyDomain && (sameCompany(a.company, label) || urlSlugs(a.url).includes(label))) ||
      (mail.company && urlSlugs(a.url).includes(collapsed(mail.company)))) &&
    !(mail.role && a.role && roleWords(mail.role).size && roleWords(a.role).size && roleOverlap(a.role, mail.role) === 0) &&
    !(mail.kind === "rejection" && mail.role && a.role && !sameJob(a.role, mail.role)));
}
// WO-040 review: a rejection moves an application only for that job. "Software Engineer, Infrastructure" is not
// "Software Engineer, Payments": each names a word the other lacks. One inside the other, or nearly equal, is the same.
function sameJob(a: string, b: string): boolean {
  const x = roleWords(a), y = roleWords(b);
  if (!x.size || !y.size) return true;
  const xOnly = [...x].filter((t) => !y.has(t)).length, yOnly = [...y].filter((t) => !x.has(t)).length;
  return xOnly === 0 || yOnly === 0 || roleOverlap(a, b) >= 0.75 && Math.max(x.size, y.size) >= 4;
}
// WO-032: the message comes from this employer itself, or from the applicant tracking system it applies through naming
// it; never from a personal address, a job board, an assessment vendor or any other domain ("Stripe <apply@talent-mail.io>"
// says Stripe in its name and nothing else does). Used where a message decides something, not just tracks it, so it is
// stricter than candidates() (architect review of WO-032):
//   - an ATS sender only from the ATS's own registrable domain (greenhouse-mail.io, never greenhouse.xyz or greenhouse.com),
//     never a scheduling or e-signature vendor, and naming this employer: its display name or words, or a tenant address
//     ("jpmc@myworkday.com") that spells the employer or the application's own tenant;
//   - the employer's own domain: the registrable domain of the employer's own site when the application link is on it
//     ("careers.acme.co.uk" is acme.co.uk, so acme.com is not Acme's); otherwise the name exactly (no "careers"/"jobs"
//     suffix: stripecareers.com and stripejobs.net are the scam pattern), or a listed alias, on a common corporate TLD
//     (never "any TLD": stripe.xyz is not Stripe);
//   - the application link counts only for its ATS path slug or Workday tenant, never the ATS host's own name.
const NEVER_CONFIRMS = ["docusign.net", "gem.com", "goodtime.io"];
const CONFIRMING_ATS = ATS.filter((d) => !NEVER_CONFIRMS.includes(d));
// Hosting, form and site-builder platforms: many tenants share one domain, so a subdomain there is nobody's own site and
// a message from there (a form's receipt) is evidence, never an employer's confirmation. Each is a public suffix here.
const PLATFORMS = [
  "google.com", "forms.gle", "googleusercontent.com", "typeform.com", "jotform.com", "airtable.com", "tally.so", "office.com",
  "microsoft.com", "sharepoint.com", "notion.site", "github.io", "herokuapp.com", "vercel.app", "netlify.app", "pages.dev",
  "webflow.io", "wixsite.com", "myshopify.com", "wufoo.com", "formstack.com", "surveymonkey.com",
];
// The registrable domain: the label under the public suffix ("careers.acme.co.uk" is acme.co.uk; "acme.github.io" is
// acme.github.io, never github.io).
function registrable(domain: string): { label: string; tld: string; full: string; platform: boolean } {
  const parts = domain.toLowerCase().split(".").filter(Boolean);
  const plat = PLATFORMS.find((p) => parts.join(".") === p || parts.join(".").endsWith("." + p));
  const suffixLen = plat ? plat.split(".").length : /^(co|com|org|net|ac|gov|edu)\.[a-z]{2}$/.test(parts.slice(-2).join(".")) && parts.length >= 3 ? 2 : 1;
  const reg = parts.slice(-(suffixLen + 1));
  return { label: reg[0] ?? "", tld: reg.slice(1).join("."), full: reg.join("."), platform: !!plat };
}
// The ATS path slug (boards.greenhouse.io/stripe, or the embed form's ?for=stripe) or Workday tenant
// (jpmc.wd5.myworkdayjobs.com) of an application link, and the employer's own site when the link is on it (not an ATS,
// a job board or a shared platform).
function linkOf(url?: string): { slug: string | null; site: { full: string; tld: string } | null } {
  try {
    const u = new URL(String(url ?? ""));
    const host = u.hostname.toLowerCase(), first = (u.pathname.split("/").filter(Boolean)[0] ?? "").toLowerCase();
    if (/(^|\.)myworkdayjobs\.com$/.test(host)) return { slug: host.split(".")[0], site: null };
    if (/(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com)$/.test(host)) {
      const slug = first === "embed" ? (u.searchParams.get("for") ?? "").toLowerCase() : first;
      return { slug: slug || null, site: null };
    }
    const r = registrable(host);
    if (r.platform || endsWithDomain(host, [...ATS, ...JOB_BOARDS])) return { slug: null, site: null };
    return { slug: null, site: { full: r.full, tld: r.tld } };
  } catch { return { slug: null, site: null }; }
}
// The same employer, strictly: equal names, or an alias, or one name plus only words a careers address adds
// ("Block Recruiting" is Block; "Block Party" is not).
const CAREERS_WORDS = new Set(["careers", "career", "recruiting", "recruitment", "jobs", "talent", "hiring", "team", "hr"]);
function sameEmployer(a: unknown, b: unknown): boolean {
  const ta = companyTokens(DOMAIN_ALIASES[collapsed(a)] ?? a), tb = companyTokens(DOMAIN_ALIASES[collapsed(b)] ?? b);
  if (!ta.length || !tb.length) return false;
  if (ta.join("") === tb.join("")) return true;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.every((t, i) => long[i] === t) && long.slice(short.length).every((t) => CAREERS_WORDS.has(t));
}
// The employer's own domain: the registrable domain of its own site when the posting names one; otherwise its exact name
// or a listed alias, on .com only (never stripe.io, stripe.co.in or any other TLD). Never a shared platform.
function employerDomain(domain: string, app: { company: string; url?: string }): boolean {
  const r = registrable(domain);
  if (!r.label || r.platform) return false;
  const link = linkOf(app.url);
  if (link.site) return r.full === link.site.full;
  if (r.tld !== "com") return false;
  const alias = DOMAIN_ALIASES[r.label];
  return collapsed(app.company) === r.label || (!!alias && sameEmployer(app.company, alias)) || (!!link.slug && link.slug === r.label);
}
// The message is authenticated as coming from its sender's own domain: Gmail's own Authentication-Results (the first one,
// authserv-id mx.google.com; a header the sender wrote lower down is never read) says dmarc=pass for that domain, or
// dkim=pass with a signing domain (header.d, or header.i's domain) under the sender's registrable domain.
export function authenticated(auth: string[] | undefined, domain: string): boolean {
  const top = String(auth?.[0] ?? "").replace(/\s+/g, " ").trim();
  if (!/^mx\.google\.com\s*;/i.test(top)) return false;
  const reg = registrable(domain).full;
  const ours = (d: string) => { const x = d.toLowerCase().replace(/^@/, "").split("@").pop() ?? ""; return !!x && registrable(x).full === reg; };
  for (const part of top.split(";").slice(1).map((p) => p.trim())) {
    const dmarc = /^dmarc=pass\b.*\bheader\.from=([^\s;]+)/i.exec(part);
    if (dmarc && ours(dmarc[1])) return true;
    const dkim = /^dkim=pass\b/i.test(part) ? /\bheader\.(?:d|i)=([^\s;]+)/i.exec(part) : null;
    if (dkim && ours(dkim[1])) return true;
  }
  return false;
}
export function fromEmployer(mail: Classified, app: { company: string; url?: string }, from = "", auth?: string[]): boolean {
  const domain = (mail.domain ?? "").toLowerCase();
  if (!domain || endsWithDomain(domain, [...ASSESSMENT_VENDORS, ...JOB_BOARDS, ...FREE_MAIL, ...NEVER_CONFIRMS])) return false;
  if (!authenticated(auth, domain)) return false; // a From line alone proves nothing
  if (endsWithDomain(domain, CONFIRMING_ATS)) {
    const link = linkOf(app.url);
    const named = !!mail.company && sameEmployer(app.company, mail.company);
    // The sender's own address names the employer only in the tenant form "<tenant>@<ats>" (not "no-reply@").
    const local = parseFrom(from).local;
    const tenant = !!local && !AUTOMATED_LOCAL.test(local) && (tenantAgrees(local, app.company) || (!!link.slug && local.replace(/[^a-z0-9]/g, "") === link.slug.replace(/[^a-z0-9]/g, "")));
    return named || tenant;
  }
  return employerDomain(domain, app);
}
// WO-032 card warning: whether an email address is on the employer's own domain, by the same rules.
export function onEmployerDomain(address: string, company: string, url?: string): boolean {
  const domain = String(address ?? "").toLowerCase().split("@")[1] ?? "";
  return !!domain && employerDomain(domain, { company, url });
}
export { roleOverlap };

// WO-040 review: services where anyone can send in an employer's name: e-signature, and ATSs with a free self-serve sign-up.
// An offer through one is said with "check it is real" and never moves a stage.
const SELF_SERVE: Record<string, string> = {
  "docusign.net": "DocuSign", "breezy.hr": "Breezy", "recruitee.com": "Recruitee", "jazzhr.com": "JazzHR", "applytojob.com": "JazzHR",
  "workable.com": "Workable", "workablemail.com": "Workable", "bamboohr.com": "BambooHR", "pinpointhq.com": "Pinpoint", "teamtailor.com": "Teamtailor",
};
function offerVia(domain?: string): string | null {
  const d = String(domain ?? "").toLowerCase();
  const hit = Object.keys(SELF_SERVE).find((k) => d === k || d.endsWith("." + k));
  return hit ? SELF_SERVE[hit] : null;
}
// One of them, only when it is the only one or its role is the clear best; otherwise null (a forced match would move
// the wrong application).
function pick(hits: TrackedApp[], said: string): TrackedApp | null {
  if (hits.length <= 1) return hits[0] ?? null;
  const scored = hits.map((a) => ({ a, s: roleOverlap(a.role, said) })).filter((x) => x.s >= 0.5).sort((p, q) => q.s - p.s);
  if (scored.length === 1 || (scored.length > 1 && scored[0].s > scored[1].s)) return scored[0].a;
  return null;
}
export function matchApplication(mail: Classified, apps: TrackedApp[], subject = ""): TrackedApp | null {
  return pick(candidates(mail, apps), mail.role ?? subject);
}

// One list from the apply queue and the tracker: a tracker row for an application the queue already has (same employer,
// and the same link or no role that tells them apart) is the same application and is dropped.
export function mergeApps(queue: TrackedApp[], tracker: TrackedApp[]): TrackedApp[] {
  const dup = (t: TrackedApp) => queue.some((q) => sameCompany(q.company, t.company) &&
    ((q.url && t.url && q.url === t.url) || !q.role || !t.role || roleOverlap(q.role, t.role) >= 0.5));
  return [...queue, ...tracker.filter((t) => !dup(t))];
}

// ------------------------------------------------------------------------------------------------ the plan
export interface MailIn extends MailMeta { hash: string }
export interface StatusEvent {
  hash: string; ref: string; kind: Exclude<MailKind, "other">; company: string; role?: string;
  stage: string | null; // the stage after this message; null when it did not move one (already there, or flagged)
  flagged: boolean; evidence: string; at: string; new_app: boolean;
  // WO-040 review: why a flagged event was only said, never applied: an offer through an e-signature or self-serve ATS
  // ("via DocuSign"), or the model's reading of an offer or rejection ("model").
  note?: string;
}
export interface StatusText { key: string; hash: string; ref: string; text: string }
// step (WO-034): a thank-you drafted right after an interview ("thanks"), or the thank-you and nudge after quiet days (the
// default). Both are kind thank_you in the table; only the text that offers them differs.
export interface Draft { key: string; ref: string; kind: "followup" | "thank_you"; company: string; role?: string; text: string; basis: string; step?: "thanks" | "nudge" }
// refused (WO-040): matched an application but not from that employer's own mail (an offer, or anything the model decided).
export interface Plan { events: StatusEvent[]; texts: StatusText[]; drafts: Draft[]; apps: TrackedApp[]; unmatched: number; ambiguous: number; other: number; refused: number }

export const FOLLOW_UP_DAYS = 14, THANK_YOU_DAYS = 7, DRAFT_WINDOW_DAYS = 30;
const DAY = 86400000;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const slug = (s: string) => companyTokens(s).join("-").slice(0, 60) || "unknown";
const forRole = (role?: string) => (role ? ` (${clip(role, 60)})` : "");
const quote = (s: string) => `"${clip(s, 80)}"`;

function statusText(e: StatusEvent, subject: string, was: string): string {
  const co = clip(e.company, 80), when = day(e.at), r = forRole(e.role), email = ` Email: ${quote(subject)}`;
  if (e.flagged && e.note?.startsWith("via ")) return `${co}${r}: an email on ${when} reads as an offer ${e.note}. Check it is real with ${co} before you act on it; I left it at ${was}.${email}`;
  if (e.flagged && e.note === "model") return `${co}${r}: an email on ${when} may be a${e.kind === "offer" ? "n" : ""} ${e.kind}, but its words don't say so plainly, so I left it at ${was}. Tell me if it changed.${email}`;
  if (e.flagged) return `${co}${r} sent what reads as a ${e.kind.replace("_", " ")} on ${when}, but you are at ${was} with them. I left it at ${was}; tell me if it changed.${email}`;
  switch (e.kind) {
    case "received": return `${co}${r} confirmed your application on ${when}. I'm tracking it.${email}`;
    case "rejection": return `${co}${r} said no on ${when}. Marked Rejected.${email}`;
    case "interview": return `${co}${r} wants to interview you (email ${when}). Marked Interview rounds.${email}`;
    case "assessment": return `${co}${r} sent an assessment on ${when}. Marked OA/assessment; check the email for the deadline.${email}`;
    case "offer": return `${co}${r} sent an offer on ${when}. Marked Offer.${email}`;
    case "recruiter_reply": return `A recruiter at ${co}${r} wrote on ${when}. Marked Recruiter screen.${email}`;
  }
}

// Fold mail already recorded into the applications: the stage each reached and when, and the applications only mail
// knows about. Events are applied in time order, forward only, as planUpdates applied them.
export function foldEvents(apps: TrackedApp[], events: StatusEvent[]): TrackedApp[] {
  const out = apps.map((a) => ({ ...a, events: [...(a.events ?? [])] }));
  for (const e of [...events].sort((x, y) => x.at.localeCompare(y.at))) {
    let a = out.find((x) => x.ref === e.ref);
    if (!a) { a = { ref: e.ref, company: e.company, role: e.role, applied_at: e.at, stage: "Submitted", source: "mail", events: [] }; out.push(a); }
    // WO-040 review: a flagged event that moved nothing (an offer "via DocuSign", the model's reading) is not a step.
    if (!(e.flagged && !e.stage)) a.events!.push({ kind: e.kind, at: e.at, source: "mail" });
    if (e.stage) a.stage = e.stage;
  }
  return out;
}

// Mail in, decisions out. Stage moves are forward only; a rejection after an offer, or anything after a closed
// application, is flagged and said, never applied. Follow-ups: no reply 14 days after applying, or 7 quiet days after an
// interview step, draft one message citing the application and its date. Drafts are never sent from here or anywhere.
// decided (WO-040): the model's second pass, by message hash, for mail the rules left ambiguous. Such a message only ever
// moves an application the person already has, and only from that employer's own mail.
export function planUpdates(mails: MailIn[], applications: TrackedApp[], now: number, decided?: Map<string, Classified>): Plan {
  const apps: TrackedApp[] = applications.map((a) => ({ ...a, events: [...(a.events ?? [])] }));
  const plan: Plan = { events: [], texts: [], drafts: [], apps, unmatched: 0, ambiguous: 0, other: 0, refused: 0 };
  const sorted = [...mails].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const m of sorted) {
    const c = decided?.get(m.hash) ?? classifyMail(m);
    if (c.kind === "other") { plan.other++; continue; }
    const hits = candidates(c, apps);
    let app = pick(hits, c.role ?? m.subject);
    let fresh = false;
    if (!app && hits.length) { plan.ambiguous++; continue; } // two applications there and nothing says which
    if (!app) {
      // An application made by hand: tracked only from the employer's own confirmation that it received the application,
      // naming the employer. An offer, interview, test, rejection or reply about nothing the person applied to is not
      // theirs to be told about ("Immediate job offer - virtual assistant" is a scam, not an offer): counted, never texted.
      // The model's reading never starts one (WO-040): only the employer's own words, read by the rules.
      if (!c.company || c.kind !== "received" || c.source === "model") { plan.unmatched++; continue; }
      app = { ref: `mail:${slug(c.company)}${c.role ? ":" + slug(c.role) : ""}`, company: c.company, role: c.role, applied_at: m.date, stage: "Submitted", source: "mail", events: [] };
      if (apps.some((a) => a.ref === app!.ref)) { plan.unmatched++; continue; }
      apps.push(app);
      fresh = true;
    }
    // An offer, or anything the model read, only from the employer's own authenticated mail (WO-032's fromEmployer); an
    // offer through an e-signature or self-serve ATS is said with a warning; the model's offer or rejection is only said.
    const via = c.kind === "offer" ? offerVia(c.domain) : null;
    if (!fresh && !via && (c.kind === "offer" || c.source === "model") && !fromEmployer(c, app, m.from, m.auth)) { plan.refused++; continue; }
    if (c.source === "model" && c.kind === "received") { plan.refused++; continue; }
    const soft = via ? `via ${via}` : c.source === "model" && (c.kind === "offer" || c.kind === "rejection") ? "model" : null;
    if (soft) {
      const e: StatusEvent = { hash: m.hash, ref: app.ref, kind: c.kind, company: app.company, role: app.role ?? c.role, stage: null, flagged: true, evidence: c.evidence, at: new Date(Date.parse(m.date) || now).toISOString(), new_app: false, note: soft };
      plan.events.push(e);
      plan.texts.push({ key: `status:${m.hash}`, hash: m.hash, ref: app.ref, text: statusText(e, m.subject, app.stage) });
      continue;
    }
    const was = app.stage, to = STAGE_OF[c.kind];
    const closed = TERMINAL.has(was), offerThenNo = was === "Offer" && c.kind === "rejection";
    const flagged = (closed && to !== was) || offerThenNo;
    const forward = !flagged && (c.kind === "rejection" ? !closed : (RANK[to] ?? 0) > (RANK[was] ?? 0));
    const e: StatusEvent = {
      hash: m.hash, ref: app.ref, kind: c.kind, company: app.company, role: app.role ?? c.role,
      stage: forward ? to : fresh ? was : null, flagged, evidence: c.evidence, at: new Date(Date.parse(m.date) || now).toISOString(), new_app: fresh,
    };
    plan.events.push(e);
    app.events!.push({ kind: c.kind, at: e.at, source: "mail" });
    if (forward) app.stage = to;
    // Said once per message: a stage that moved, a newly tracked application, or a flag. A repeat is only recorded.
    if (forward || flagged || fresh) plan.texts.push({ key: `status:${m.hash}`, hash: m.hash, ref: app.ref, text: statusText(e, m.subject, was) });
  }
  plan.drafts = followUps(apps, now);
  return plan;
}

const REPLIES = new Set(["rejection", "interview", "assessment", "offer", "recruiter_reply"]);
export function followUps(apps: TrackedApp[], now: number): Draft[] {
  const out: Draft[] = [];
  for (const a of apps) {
    if (TERMINAL.has(a.stage) || a.stage === "Offer" || a.stage === "Saved") continue;
    const evs = [...(a.events ?? [])].sort((x, y) => x.at.localeCompare(y.at));
    const applied = Date.parse(a.applied_at ?? "");
    const co = clip(a.company, 80);
    if (RANK[a.stage] === 1 && Number.isFinite(applied) && !evs.some((e) => REPLIES.has(e.kind))) {
      const quiet = (now - applied) / DAY;
      if (quiet >= FOLLOW_UP_DAYS && quiet <= DRAFT_WINDOW_DAYS) {
        const when = day(new Date(applied).toISOString());
        out.push({
          key: `followup:${a.ref}`, ref: a.ref, kind: "followup", company: a.company, role: a.role,
          basis: `applied ${when}; no reply in ${Math.floor(quiet)} days`,
          text: `Hello, I applied for ${a.role ? `the ${clip(a.role, 60)} role` : "a role"} at ${co} on ${when} and wanted to follow up. I am still very interested and would be glad to hear where things stand. Thank you for your time.`,
        });
      }
      continue;
    }
    const last = evs[evs.length - 1];
    // An interview whose date the invite stated is the interview planner's (career_invite.ts): its thank-you comes right
    // after it and its nudge 7 quiet days after it, never 7 days after the invite.
    if (a.interview_on) continue;
    if ((a.stage === "Interview rounds" || a.stage === "Final") && last && last.kind === "interview") {
      const quiet = (now - Date.parse(last.at)) / DAY;
      if (quiet >= THANK_YOU_DAYS && quiet <= DRAFT_WINDOW_DAYS) {
        const when = day(last.at);
        out.push({
          key: `thank_you:${a.ref}:${last.at.slice(0, 10)}`, ref: a.ref, kind: "thank_you", company: a.company, role: a.role,
          basis: `interview step ${when}; nothing since in ${Math.floor(quiet)} days`,
          text: `Hello, thank you again for the time with ${co}${a.role ? ` about the ${clip(a.role, 60)} role` : ""} (your invitation of ${when}). I enjoyed the conversation and remain very interested. Is there an update on next steps?`,
        });
      }
    }
  }
  return out;
}
// The text that offers a draft. The draft is shown in full; nothing is sent until the person sends it themselves.
export function draftOffer(d: Draft): string {
  if (d.step === "thanks") return `Your ${clip(d.company, 80)}${forRole(d.role)} interview (${d.basis}). I drafted a thank-you for you to send; it is not sent:\n\n${d.text}`;
  const what = d.kind === "followup" ? `No reply from ${clip(d.company, 80)}${forRole(d.role)} (${d.basis}).` : `Nothing from ${clip(d.company, 80)}${forRole(d.role)} since the interview (${d.basis}).`;
  return `${what} I drafted a ${d.kind === "followup" ? "follow-up" : "thank-you and nudge"}; it is not sent:\n\n${d.text}`;
}

// ------------------------------------------------------------------------------------------------ where do I stand
// Every application to that company, its stage, and the last thing that happened, from the records only.
// WO-034: each stage the application reached, with its date and where that was read: "Trainee" (an application Trainee
// sent), "tracker" (what the person told Trainee) or "mail" (a status email). An application with no date says so.
export interface StageAt { stage: string; date: string | null; source: string }
const SOURCE_WORD: Record<TrackedApp["source"], string> = { queue: "Trainee", tracker: "tracker", mail: "mail" };
export function stagesOf(a: TrackedApp): StageAt[] {
  const out: StageAt[] = [{ stage: "Submitted", date: a.applied_at ? day(a.applied_at) : null, source: SOURCE_WORD[a.source] ?? a.source }];
  for (const e of [...(a.events ?? [])].sort((x, y) => x.at.localeCompare(y.at))) {
    if (e.kind === "applied" || e.kind === "other" || e.kind === "received") continue;
    const stage = STAGE_OF[e.kind];
    if (stage && out[out.length - 1].stage !== stage) out.push({ stage, date: day(e.at), source: e.source ?? (a.source === "tracker" ? "tracker" : "mail") });
  }
  return out;
}
export function standing(company: string, apps: TrackedApp[], events: StatusEvent[]): { found: number; text: string; history: string; applications: { ref: string; company: string; role?: string; stage: string; last?: string; stages: StageAt[] }[] } {
  const all = foldEvents(apps, events).filter((a) => sameCompany(a.company, company))
    .sort((a, b) => String(a.applied_at ?? "").localeCompare(String(b.applied_at ?? "")));
  if (!all.length) return { found: 0, text: `No application to ${clip(company, 80)} on file.`, history: "", applications: [] };
  const rows = all.map((a) => {
    const evs = [...(a.events ?? [])].sort((x, y) => x.at.localeCompare(y.at));
    const last = evs[evs.length - 1];
    const lastText = last && last.kind !== "applied" ? `last: ${last.kind.replace("_", " ")} email ${day(last.at)}` : a.applied_at ? `applied ${day(a.applied_at)}, nothing since` : "no date on file";
    return { ref: a.ref, company: a.company, role: a.role, stage: a.stage, last: lastText, stages: stagesOf(a) };
  });
  const lines = rows.map((r) => `${clip(r.company, 80)}${forRole(r.role)}: ${r.stage} (${r.last})`);
  const history = rows.map((r) => `${clip(r.company, 80)}${forRole(r.role)}: ${r.stages.map((s) => `${s.stage} ${s.date ?? "(no date on file)"} (${s.source})`).join("; ")}`).join("\n");
  return { found: rows.length, text: lines.join("\n"), history, applications: rows };
}
