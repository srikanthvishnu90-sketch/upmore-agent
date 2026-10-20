// WO-024: application status from the person's own mail, as pure functions. classifyMail reads one message's sender,
// subject and Gmail snippet (never a body) and says what it is only when the words say so: anything unclear is "other",
// and "other" never moves a stage. matchApplication ties a message to one of the person's applications or to none (never
// a forced match). planUpdates turns a batch into stage changes (forward only), the texts that say them, and follow-up
// drafts. Drafts are only ever drafts: nothing here sends mail.

export type MailKind = "received" | "rejection" | "interview" | "assessment" | "offer" | "recruiter_reply" | "other";
export const STATUS_KINDS: MailKind[] = ["received", "rejection", "interview", "assessment", "offer", "recruiter_reply"];
export interface MailMeta { from: string; subject: string; snippet: string; date: string }
export interface Classified { kind: MailKind; company?: string; role?: string; domain?: string; evidence: string }

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
const ASSESSMENT_VENDORS = ["hackerrank.com", "codesignal.com", "codility.com", "shl.com", "harver.com", "criteriacorp.com", "hirevue.com", "testgorilla.com", "pymetrics.ai", "pymetrics.com", "karat.com", "coderpad.io"];
const JOB_BOARDS = ["linkedin.com", "indeed.com", "glassdoor.com", "ziprecruiter.com", "joinhandshake.com", "wellfound.com", "angel.co", "monster.com", "dice.com", "simplyhired.com", "careerbuilder.com", "builtin.com", "otta.com", "hired.com"];
const FREE_MAIL = ["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "yandex.com"];
// Well-known employers whose mail domain does not spell their name. Matching only; never a guess about the person.
const DOMAIN_ALIASES: Record<string, string> = {
  jpmchase: "JPMorgan Chase", jpmorgan: "JPMorgan Chase", chase: "JPMorgan Chase", gs: "Goldman Sachs", ms: "Morgan Stanley",
  bofa: "Bank of America", bankofamerica: "Bank of America", datadoghq: "Datadog", fb: "Meta", amazon: "Amazon",
};
const AUTOMATED_LOCAL = /^(no-?reply|do-?not-?reply|donotreply|notifications?|alerts?|jobs?|careers?|recruiting|recruitment|talent|hr|support|hello|team|info|mail|news|events?|community|crew|press|marketing|scheduling|digest)\b/i;
const GENERIC_NAME = /^(greenhouse|lever|ashby|workday|smartrecruiters|icims|taleo|successfactors|jobvite|workable|bamboohr|avature|hackerrank|codesignal|codility|shl|harver|criteria corp|hirevue|goodtime|docusign|notifications?|no-?reply|careers?|recruiting|recruiter|talent acquisition|hiring team|hr department|hr|jobs|team)$/i;

interface Sender { name: string; address: string; local: string; domain: string; label: string }
export function parseFrom(from: string): Sender {
  const s = String(from ?? "").trim();
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(s);
  const address = (m ? m[2] : s).trim().toLowerCase();
  const name = (m ? m[1] : "").trim();
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
const DOMAIN_SUFFIX = /^(hq|inc|corp|careers|jobs|group|global|usa|us|team|talent)$/;
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
function cleanName(name: string): string {
  let n = name.replace(/\s+via\s+.+$/i, "").replace(/^the\s+/i, "").replace(/\s+/g, " ").trim();
  n = n.replace(/\s*[-|,]?\s*\b(university recruiting|campus recruiting|talent acquisition|recruiting team|hiring team|talent team|recruiting|recruitment|careers|career|jobs|hr|team|workday)$/i, "").trim();
  return n;
}
// Two capitalized words are a person ("Rachel Kim") unless the last is a word companies end in ("Brightline Health").
const CORP_WORD = /^(health|healthcare|robotics|labs?|systems|technologies|technology|tech|bank|capital|group|partners|solutions|clinic|foods?|energy|motors|airlines?|insurance|media|studios?|software|analytics|consulting|financial|medical|hospital|university|pharma\w*|logistics|networks|security|street|trading|sachs|stanley|permanente|ventures|industries|services|holdings|global|international|corporation|company|bio\w*|therapeutics|games|works|brands|retail|markets|automotive|aerospace|dynamics|careers|recruiting)$/i;
const personName = (name: string) =>
  /^[A-Z][a-z'’-]+(?: [A-Z]\.?)?(?: [A-Z][a-z'’-]+){1,2}$/.test(name) && !GENERIC_NAME.test(name) && !CORP_WORD.test(name.split(" ").pop() ?? "");
const looksLikePerson = (s: Sender) => !AUTOMATED_LOCAL.test(s.local) && personName(s.name);
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
];
const NOT_COMPANY = /^(you|your|we|our|the|this|that|hi|hello|dear|thank|thanks|congratulations|please|next|re|fw|fwd|following|update|application|interview|offer|assessment|online|new|job|jobs|complete|invitation|scheduled?)$/i;
// The employer a sentence names, read sentence by sentence; leading words that are not a name are dropped.
export function companyFromText(text: string): string | undefined {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  for (const re of TEXT_COMPANY) for (const sentence of sentences) for (const m of sentence.matchAll(re)) {
    const words = m[1].replace(/[.,!?:;'’]+$/, "").replace(/'s$/, "").trim().split(/\s+/);
    while (words.length && (NOT_COMPANY.test(words[0].replace(/[^A-Za-z]/g, "")) || words[0] === "&")) words.shift();
    const name = words.join(" ");
    if (name && !GENERIC_NAME.test(name)) return name;
  }
  return undefined;
}
function companyOf(s: Sender, subject: string, snippet: string, vendor: boolean): string | undefined {
  const named = cleanName(s.name);
  const ats = endsWithDomain(s.domain, ATS);
  const person = ats ? personName(named) && (AUTOMATED_LOCAL.test(s.local) || !tenantAgrees(s.local, named)) : looksLikePerson(s);
  const nameOk = named && !GENERIC_NAME.test(named) && !person && !/@/.test(named);
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
const NOT = String.raw`(will not|won'?t|not|unable to|cannot|can'?t)`;
const RULES: [Exclude<MailKind, "other" | "recruiter_reply">, RegExp][] = [
  ["rejection", phrases(
    String.raw`regret to (inform|let you know|tell you)|we regret that|regrettably|sorry to (inform|tell|let you know)`,
    String.raw`not (been )?selected|(was|were|has been|is) (not successful|unsuccessful)`,
    String.raw`(decided|chosen|opted) not to (move|proceed|continue|progress|pursue|advance)|not to move forward`,
    NOT + String.raw` (be )?(moving|move|proceeding|proceed|progressing|progress|continuing|continue|advancing|advance) (forward|ahead)`,
    NOT + String.raw` (be )?(moving|proceeding|proceed|progressing|progress|continuing|continue|advancing|advance) (further )?(with )?(your|the|you|it\b|additional)`,
    String.raw`(move|moving|go|proceed|proceeding|pursue|pursuing|focus|focusing|continue) (forward |ahead )?(with|on) (other|another) (candidates|applicants|candidate)`,
    String.raw`(move|moving|go|proceed|proceeding) (forward |ahead )?with (candidates|applicants)|decided to (go|move|proceed) with (other |another )?(candidates|applicants|candidate)`,
    String.raw`pursue other (candidates|applicants)|selected (other )?candidates whose|other (candidates|applicants) [^.]{0,30}(more closely|better) (meet|match|fit|align)`,
    String.raw`(position|role|job|requisition) (you applied (for|to) )?(has been|was|is now|is) (filled|closed|no longer (open|available))`,
    String.raw`(have|has|'ve) filled the [^.]{0,40}(position|positions|role|roles|opening|openings)|(has|have) been filled`,
    String.raw`no longer (under consideration|being considered|considering)|(cannot|can'?t|unable to) consider your application`,
    String.raw`(unable|not able|won'?t be able) to (offer you|extend)|don'?t think (there'?s|there is|we have) a (fit|match)|not the right (fit|match) for`,
  )],
  ["offer", phrases(
    String.raw`offer letter|offer of employment|job offer|(internship|employment|verbal|written|formal|conditional) offer`,
    String.raw`(pleased|happy|excited|delighted|thrilled|glad) to (extend|offer you|make you an offer)|extend(ing)? (you )?an? (formal |verbal |written |conditional )?offer`,
    String.raw`make you an offer|your offer (from|with|letter|details|package|for)|offer (details|package) (is|are) (attached|ready)|accept (your|the) offer`,
    String.raw`you'?re hired|you are hired|(love|like) (for you|to have you) to (start|join)`,
  )],
  ["assessment", phrases(
    String.raw`online assessment|hacker ?rank|codesignal|codility|hirevue|pymetrics|games assessment|assessment (invitation|invite|link)`,
    String.raw`(coding|technical|programming|quant(itative)?|case|design|writing|written|take-?home|homework|skills?|cognitive|aptitude|problem-solving) (assessment|challenge|exercise|assignment|test|study|game)`,
    String.raw`take-?home|case study|(complete|take|finish) (the |your |an? )?([\w-]+ ){0,4}(assessment|test|exercise|challenge|game)`,
  )],
  ["interview", phrases(
    String.raw`interview invitation|invitation to interview|superday invitation\b|invit\w* (you )?to (an? |the |our |your )?([\w-]+ ){0,4}(interview|interviews|superday|onsite|on-site|phone screen|video call)`,
    String.raw`selected (you )?(to|for (an? |the )?)interview|would like to (interview you|meet with you|speak with you|chat with you)|(like|love|want) you to meet (with )?(the|our) (hiring manager|team)`,
    String.raw`(schedule|book|set up|arrange) (an?|your|the) ([\w-]+ ){0,3}(interview|call|chat|phone screen|screen|conversation)|come in for an? (interview|chat)`,
    String.raw`interview (loop |panel |day )?(is |has been )?(confirmed|scheduled)|(onsite|on-site|final|panel) interview|interview (loop|panel)`,
    String.raw`(first|second|third|final|next)[- ]round (of )?(interviews?|superday)|move (you )?(forward )?to the interview stage`,
    String.raw`availability (next week |this week )?for an? ([\w-]+ ){0,2}(interview|call|chat)|(pick|choose|select|book) (a|an) (interview )?time|(phone|video|technical|virtual) interview\b`,
  )],
  ["received", phrases(
    String.raw`thank(s| you) for (applying|your application|submitting your application|your interest in [^.]{0,60}?\. we (have )?received)`,
    String.raw`(we('ve| have)?|has been|was|we) (received|got) your application|we got your application|receipt of your application`,
    String.raw`application (has been |was )?(received|submitted|sent)|(was|been) submitted successfully|successfully submitted`,
    String.raw`application confirmation|(job )?submission confirmation|confirmation that your (job )?(application|submission)`,
    String.raw`your application to [^.]{1,60}? (was|has been) (submitted|sent|received)|you applied to [^.]{1,60}? (at|through) |your application [^.]{0,60}? is in\b`,
  )],
];
// Words that make a message something other than an application step, checked on the subject and sender first.
const NOISE_SUBJECT = /\b(job alerts?|new jobs|jobs for you|jobs? (matching|recommended)|recommended (jobs|for you)|is hiring|are hiring|hiring now|great match|top applicant|newsletter|webinar|digest|info session|career fair|events?|conference|registration|rsvp|survey|feedback|statement|receipt|your order|package|shipped|deals?|sale|% off|premium|verify|verification|password|sign[- ]?in|security code|candidate account|viewed your|tips|course|salaries|profile|product update|what'?s new|new features|withdrawn|self-identification)\b/i;
const NOISE_TEXT = /\b(complete your application|finish (applying|your application)|haven'?t (submitted|finished)|isn'?t finished|started an application|pick up where you left off|unsubscribe from (job )?alerts|viewed your (application|profile))\b/i;
// What scams and look-alikes ask for; a real employer never does in a first message.
const SCAM = /\b(telegram|whats ?app|signal app|check to (purchase|buy)|purchase (your |a |the )?(work )?(equipment|supplies|laptop|computer|software)|reimburse you|approved vendor|starter kit|bank (details|account (details|number))|ssn|social security|gift cards?|no interview (required|needed)|claim your|sign-on bonus of \$|secret shopper|mystery shopper|per assignment|wire transfer|crypto(currency)?)\b/i;
const COLD = /\b(came across your (profile|background|resume)|caught my eye|my client|open to (new )?opportunities|would you be interested|are you interested in|exciting (new )?opportunit)/i;
const RECRUITER_TEXT = /\b(your (application|resume|candidacy|file|portfolio)|the (hiring manager|hiring team|team) is (still )?reviewing|hiring manager|still (in process|being (reviewed|considered)|reviewing|collecting)|i'?m the recruiter|recruiter (for|on) the|thanks for (reaching out|following up|checking in|your (note|message|email|patience))|thank you for (reaching out|your (email|message|patience|note))|got your message|keep you posted|be in touch)\b/i;
// A step already done is not an invitation to it: "after completing the assessment", "thank you for interviewing".
const PAST_STEP = /\b(thanks? (you )?(again )?for (completing|taking|interviewing|your time)[^.]*|following (your|the) (assessment|interview|call)|after (your|the) (assessment|interview|call)|interview follow up)\b/gi;

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
// Evidence is stored: one line, no long numbers (an emailed code or an ID never lands in the table), 300 characters.
function evidenceLine(kind: MailKind, phrase: string, subject: string, domain: string): string {
  const line = `${kind}: "${clip(phrase, 80)}" in subject "${clip(subject, 120)}" from ${clip(domain, 60) || "unknown sender"}`;
  return line.replace(/\d{6,}/g, "[number]").slice(0, 300);
}

export function classifyMail(m: MailMeta): Classified {
  const s = parseFrom(m.from), subject = String(m.subject ?? ""), snippet = String(m.snippet ?? "");
  const text = `${subject}\n${snippet}`;
  const other = (why: string): Classified => ({ kind: "other", evidence: evidenceLine("other", why, subject, s.domain) });
  if (!s.domain) return other("no sender");
  const scam = SCAM.exec(text);
  if (scam) return other(scam[0]);
  if (/(^|-)(careers?|jobs?|hiring|recruit\w*|hr)(-|$)/.test(s.label) && s.label.includes("-")) return other(`look-alike domain ${s.domain}`);
  const board = endsWithDomain(s.domain, JOB_BOARDS), vendor = endsWithDomain(s.domain, ASSESSMENT_VENDORS);
  const free = endsWithDomain(s.domain, FREE_MAIL);
  const noise = NOISE_SUBJECT.exec(subject) ?? NOISE_TEXT.exec(text);
  if (noise) return other(noise[0]);
  if (/^(job-?alerts?|jobalerts-noreply|alerts?|digest|newsletter|jobs-listings|inmail)/i.test(s.local)) return other(s.local);
  const live = text.replace(PAST_STEP, " ");
  for (const [kind, re] of RULES) {
    const hit = re.exec(kind === "rejection" ? text : live);
    if (!hit) continue;
    // A job board says only that an application went; anything else from it is its own advert.
    if (board && kind !== "received") return other(`job board: ${hit[0]}`);
    if (free && kind !== "rejection") return other(`personal address: ${hit[0]}`);
    const company = companyOf(s, subject, snippet, vendor);
    if (board && !company) return other("job board, no employer named");
    return { kind, company, role: roleOf(subject, snippet), domain: s.domain, evidence: evidenceLine(kind, hit[0], subject, s.domain) };
  }
  // A person at a company domain answering about the application; cold outreach is not a reply to anything.
  if (!board && !free && !vendor && !endsWithDomain(s.domain, ATS) && looksLikePerson(s) && !COLD.test(text)) {
    const r = RECRUITER_TEXT.exec(text) ?? (/^\s*re:/i.test(subject) ? ["Re:"] : null);
    if (r) return { kind: "recruiter_reply", company: companyOf(s, subject, snippet, false), role: roleOf(subject, snippet), domain: s.domain, evidence: evidenceLine("recruiter_reply", r[0], subject, s.domain) };
  }
  return other(COLD.exec(text)?.[0] ?? "no status phrase");
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
    !(mail.role && a.role && roleWords(mail.role).size && roleWords(a.role).size && roleOverlap(a.role, mail.role) === 0));
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
}
export interface StatusText { key: string; hash: string; ref: string; text: string }
// step (WO-034): a thank-you drafted right after an interview ("thanks"), or the thank-you and nudge after quiet days (the
// default). Both are kind thank_you in the table; only the text that offers them differs.
export interface Draft { key: string; ref: string; kind: "followup" | "thank_you"; company: string; role?: string; text: string; basis: string; step?: "thanks" | "nudge" }
export interface Plan { events: StatusEvent[]; texts: StatusText[]; drafts: Draft[]; apps: TrackedApp[]; unmatched: number; ambiguous: number; other: number }

export const FOLLOW_UP_DAYS = 14, THANK_YOU_DAYS = 7, DRAFT_WINDOW_DAYS = 30;
const DAY = 86400000;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const slug = (s: string) => companyTokens(s).join("-").slice(0, 60) || "unknown";
const forRole = (role?: string) => (role ? ` (${clip(role, 60)})` : "");
const quote = (s: string) => `"${clip(s, 80)}"`;

function statusText(e: StatusEvent, subject: string, was: string): string {
  const co = clip(e.company, 80), when = day(e.at), r = forRole(e.role), email = ` Email: ${quote(subject)}`;
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
    a.events!.push({ kind: e.kind, at: e.at, source: "mail" });
    if (e.stage) a.stage = e.stage;
  }
  return out;
}

// Mail in, decisions out. Stage moves are forward only; a rejection after an offer, or anything after a closed
// application, is flagged and said, never applied. Follow-ups: no reply 14 days after applying, or 7 quiet days after an
// interview step, draft one message citing the application and its date. Drafts are never sent from here or anywhere.
export function planUpdates(mails: MailIn[], applications: TrackedApp[], now: number): Plan {
  const apps: TrackedApp[] = applications.map((a) => ({ ...a, events: [...(a.events ?? [])] }));
  const plan: Plan = { events: [], texts: [], drafts: [], apps, unmatched: 0, ambiguous: 0, other: 0 };
  const sorted = [...mails].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const m of sorted) {
    const c = classifyMail(m);
    if (c.kind === "other") { plan.other++; continue; }
    const hits = candidates(c, apps);
    let app = pick(hits, c.role ?? m.subject);
    let fresh = false;
    if (!app && hits.length) { plan.ambiguous++; continue; } // two applications there and nothing says which
    if (!app) {
      // An application made by hand: tracked only from the employer's own confirmation that it received the application,
      // naming the employer. An offer, interview, test, rejection or reply about nothing the person applied to is not
      // theirs to be told about ("Immediate job offer - virtual assistant" is a scam, not an offer): counted, never texted.
      if (!c.company || c.kind !== "received") { plan.unmatched++; continue; }
      app = { ref: `mail:${slug(c.company)}${c.role ? ":" + slug(c.role) : ""}`, company: c.company, role: c.role, applied_at: m.date, stage: "Submitted", source: "mail", events: [] };
      if (apps.some((a) => a.ref === app!.ref)) { plan.unmatched++; continue; }
      apps.push(app);
      fresh = true;
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
