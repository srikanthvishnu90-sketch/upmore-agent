// WO-020: what an application question asks, by meaning (_shared/fact_schema.json). The map names a fact and
// its kind; it never writes a value. Values come only from what the person stated and confirmed (D-007), and what each
// kind may do is the schema's: a fact or derived answer fills the form, a screen, attestation, consent or essay is shown
// in the approval, unknown is asked. Rules run in order and the first that matches wins; each names why it matched.
// Wording, punctuation, numbering and the employer's name do not matter; English, French, Dutch, Spanish and Japanese
// labels seen on real forms are read. This is the code layer; a question it cannot place stays unknown (never forced).
import schema from "./fact_schema.json" with { type: "json" };

export type Kind = "fact" | "derived" | "screen" | "attestation" | "consent" | "essay" | "file" | "unknown";
export interface MappedQuestion { fact: string; kind: Kind; why: string }
export interface Question { label: string; type?: string; options?: { label: string }[] }

const FACTS = (schema as any).facts as Record<string, { kind: Kind }>;
export const kindOf = (fact: string): Kind => (FACTS[fact]?.kind ?? "unknown") as Kind;

// The text a rule reads: lowercase, accents kept (French), numbering and markdown stripped, spaces collapsed.
export function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/[’`]/g, "'").replace(/^\s*(\(?\d+[a-z]?[.)]|[a-z]\))\s*/, "").replace(/\s+/g, " ").trim();
}
const FILE_TYPES = new Set(["input_file", "file"]);
const LONG_TYPES = new Set(["textarea"]);

type Rule = [fact: string, test: RegExp, when?: (q: Question, t: string) => boolean];
const isFile = (q: Question) => FILE_TYPES.has(String(q.type));
const notFile = (q: Question) => !isFile(q);
const opts = (q: Question) => (q.options || []).map((o) => String(o.label).toLowerCase()).join(" | ");
const yesNoOnly = (q: Question) => !q.options?.length || /^(yes|no|sí|si|ja|nee|はい|いいえ|n\/a|not sure|i'?m not sure| \| )+$/i.test(opts(q).replace(/[.\s]+/g, " ").replace(/ \| /g, " | ").trim()) || q.options!.every((o) => /^(yes|no)\b/i.test(String(o.label).trim()));

const WHY = /\bwhy\b(?!.*\b(good|great) fit\b)(?!.*\bwhy you'?re\b)|pourquoi|por qué|\binterest(s|ed)? you\b|\bexcites? you\b|\bexcited about\b|\bresonate|\bdrew you|\bwhat interested you\b|\bwhy are you interested\b|\bwhy do you want\b|\bmakes you excited\b|\bwhat makes you want\b/;
const DESCRIBE = /\b(describe|tell us|share|walk us through|give an example|provide an example|example of|explain|what is one|what's something|what are you most proud|most proud|hardest|exceptional|achieve|accomplish|built|project|summary about yourself|good fit|great fit|why you'?re|what attributes|philosophy|how do you|how have you|what skills|what relevant|elaborate|brief comment|in \d+ (words|sentences)|in fewer than|in 1-3)\b/;

const ackOpt = (x: string) => /^(i )?(acknowledge|agree|accept|understand|consent|confirm)|^acknowledge\/confirm|^read and understood|^i will read/.test(x);
function ackShaped(q: Question, t: string): boolean {
  const o = (q.options || []).map((x) => String(x.label).toLowerCase().trim());
  const onlyAck = o.length > 0 && o.every(ackOpt);
  const statement = o.length > 0 && o.some(ackOpt) && o.every((x) => ackOpt(x) || /^i (am not|do not|don'?t)\b.*\b(agree|acknowledge|agreement)/.test(x)) && t.length > 80;
  return (onlyAck || statement || (q.type === "checkbox" && t.length > 100 && !t.includes("?"))) && !/on-?site|in-?office|in office|relocat|days (a|per) week/.test(t);
}

// Ordered: files, then identity and contact, address, links, work, availability, pay, education, skills, authorization,
// legal, consent, application, job screens, essays. A rule's `when` narrows it (a type, a shape of options).
const RULES: Rule[] = [
  // Files: the input decides; the label names which document.
  ["resume", /\b(resume|résumé|cv|curriculum)\b/, isFile],
  ["cover_letter", /\bcover letter|lettre de motivation|motivatiebrief\b/, isFile],
  ["transcript", /\btranscript/, isFile],
  ["portfolio_file", /\bportfolio\b/, isFile],
  ["writing_sample", /\bwriting sample\b/, isFile],
  ["unknown", /.*/, isFile],
  ["resume", /^(resume|résumé|cv)( ?\/ ?(cv|resume))?$/],

  // A statement the person accepts (its only answers are acknowledgements, or a long checkbox with no question) is a
  // consent only when it is one a standing consent covers: privacy and data, certifying the answers are true, the
  // employer's AI-use policy. Any other statement (a faith commitment, a code of conduct, a firearms questionnaire) is
  // the person's own call: asked, or read by the rules below.
  ["ai_policy_ack", /\bai\b|artificial intelligence/, (q, t) => ackShaped(q, t)],
  ["certify_true", /\bcertif|\btrue and|\baccurate\b|applicant'?s statement/, (q, t) => ackShaped(q, t)],
  ["privacy_ack", /privacy|personal (data|information)|data (protection|processing)|\bccpa\b|consumer privacy|arbitrat|confidential|notice to (applicants|candidates)/, (q, t) => ackShaped(q, t)],
  ["unknown", /.*/, (q, t) => ackShaped(q, t) && !/firearms|prohibited possessor/.test(t)],

  // Identity.
  ["legal_name", /\bfull legal name\b|legal (first|last)? ?name and legal|^legal name\b/, (q, t) => !/native language|referr|team member/.test(t)],
  ["first_name", /^(legal )?first name\b|^given name\b|^prénom\b|^voornaam\b|^名$/],
  ["last_name", /^(legal )?(last|family) name\b|^surname\b|^nom( de famille)?$|^achternaam\b|^姓$/],
  ["preferred_name", /^preferred (first |last )?name\b/],
  ["pronouns", /\bpronouns?\b/],
  ["full_name", /^(full )?name\b|^your name\b|^nom complet\b/, (q, t) => !/referr|company|school|university|employer/.test(t)],
  ["signature", /^signature\b|\bsign(ature)? (here|below)\b|\btype your (full )?name\b/],
  ["email", /^e-?mail( address)?$|^email address\b|^電子メール$|^adresse e-?mail\b|^your e-?mail\b/],
  ["phone", /^(mobile |cell )?phone( number)?\b|^telephone\b|^telefoon\b|^téléphone\b|^電話$|^contact number\b/],

  // Address and location.
  ["street_address", /\bstreet address\b|^address line 1\b|^street\b/, (q, t) => !/\bcity\b.*\bstate\b|\bzip\b|full street address/.test(t)],
  ["full_address", /\b(full |physical |residential |home |legal |permanent |primary residence |current residential |complete current residential )?address\b/, (q, t) => !/e-?mail|ip address|work address/.test(t)],
  ["postal_code", /\b(zip|postal|post) ?(\/ ?postal )?code\b|^zip\b|\bcode postal\b/],
  ["city", /\bwhat city do you (currently )?(live|reside)|which city are you|^city\b|^ville\b/, (q, t) => !/\bstate\b/.test(t)],
  ["state", /^state( or province| \/ province)?\b|\bstate of residence\b|\bwhat (u\.?s\.? )?state\b|\bin which state\b|\bpermanent work location\b/, (q, t) => !/\bcity\b/.test(t)],
  ["timezone", /\btime ?zone are you\b|\bwhat time ?zone\b|\btime zone you are located\b|\bwhich time zone\b/],
  ["country", /\b(live|reside|based|located) in (the )?(united states|u\.?s\.?a?|canada|united kingdom)\b\??$/],
  ["country", /\b(what|which|in which|in what) country\b.*\b(live|reside|resident|based|currently)\b|\bcountry (where you|of residence)\b|^country\b|^select country\b|^pays\b/, (q, t) => !/citizen|nationality|right to work|authori[sz]ed|anticipate/.test(t)],
  ["location", /\bwhere (are|do) you (currently )?(located|live|reside|based)\b|\bcurrent(ly)? located\b|\bcity and state\b|\bcurrent location\b|^your location\b|^location\b|\bwhere are you located\b|\bare you (currently )?(based|located|local) in\b|\bdo you (currently )?(live|reside) in\b|\bplease confirm that you are based\b/, (q, t) => !/relocat|office|on-?site|hybrid|commut|in person|in-person/.test(t)],

  ["how_heard", /\bhoe ben je\b.*\b(gekomen|terechtgekomen)\b|\bhow did you (first |initially )?(hear|come across|find|learn|come to know)\b/],
  ["unknown", /\bconsecutive weeks\b|\binternship\/co-?op duration\b/],
  ["former_employers", /\bsecond most recent employer\b|\blist your work history\b|\bwork history\b/, (q, t) => !/discharged|resign|reason for leaving/.test(t)],

  // Links.
  ["linkedin", /\blinked ?in\b|\blinkedln\b/],
  ["github", /\bgithub\b/],
  ["website", /\b(portfolio|personal (web)?site|website)\b(?!.*\b(upload|file)\b)/, (q) => !LONG_TYPES.has(String(q.type))],

  // Work history.
  ["current_title", /^(current|your) (job )?title\b|\bcurrent or previous job title\b|^job title\b(?!.*second)/],
  ["unknown", /\bmay we contact your current employer\b/],
  ["notice_period", /\bnotice (period )?(to|would you need to provide to) your current employer\b|\bhow much notice\b/],
  ["current_employer", /\bcurrent (or most recent |\/ ?last )?(company|employer|organi[sz]ation)\b|\bmost recent employer\b|\bcurrent ?\/ ?(last|most recent) (company|employer)\b|\bwhere (are you currently|have you most recently|were you last) (employed|worked)\b|\bwho is your current or previous employer\b|^employer name\b|\bwhere have you most recently worked\b/, (q, t) => !/second|end date|discharged|related|relative|accenture|working on a project/.test(t)],
  ["employment_status", /\bare you (currently )?employed\b|\bcurrent employment status\b|\bon "?layoff"? status\b/],
  ["years_experience", /\b(total|relevant)( professional)? years? of experience\b|\bhow many years of (relevant|professional|relevant professional) experience\b|\byears of experience do you have in a related field\b|\bexperience level do you have for this position\b|\bcombien d'années d'expérience\b|\btotal year of experience\b/],

  // Availability.
  ["notice_period", /\bnotice period\b|\bhow much notice\b|\bpréavis\b|\blwd\b/],
  ["start_date", /\b(available|availability) to (start|begin)\b|\bstart date\b|\bwhen (can|could) you start\b|\bhow soon (are you able|can you) (to )?start\b|\bbest time to start\b|\bavailable to begin\b|\bdate available\b|\bcurrent availability to start\b|\bable to start within\b/],
  ["employment_type", /\b(looking for|seeking|interested in) (full|part)-?time\b|\bfull-?time or part-?time (employment|role|position|work)\b|^are you looking for full-?time or part-?time/, (q, t) => !/employed by|worked (at|for)|employee of/.test(t)],

  // Pay.
  ["pay_range_ok", /\bcompensation (expectations )?(range )?(align|aligns)\b|\balign(s)? with (the posted range|my expectations)\b|\bpays a rate of\b.*\baccept\b/],
  ["current_compensation", /\bcurrent (ctc|compensation|salary|base)\b/],
  ["salary_currency", /\bcurrency\b/],
  ["salary_expectation", /\bexpected (annual |base )?(ctc|compensation|salary)\b|\b(compensation|salary) (expectation|you expect|are you seeking|requirement)|\bdesired (salary|compensation)\b|\bideal annual compensation\b|\bexpected total annual compensation\b|\bcompensation you (expect|are seeking)\b|\bsalary expectations?\b/],

  // Education.
  // A graduate or doctoral GPA is not the undergraduate one: asked.
  ["unknown", /\b(graduate|doctorate|doctoral|master'?s) gpa\b|\bgpa \((graduate|doctorate)\)/, (q, t) => !/undergraduate/.test(t)],
  ["gpa", /\bgpa\b|\bppa\b|\bgrade point average\b|\bdegree result\b/],
  ["test_scores", /\b(sat|act|gre|gmat|lsat) score\b/],
  ["education_level", /\bhighest (level of )?(education|degree)\b(?! in\b)|\blevel of education\b|\bwhich best describes your education\b|\bhigher education degree\b|\bhigh school diploma or equivalent\b/],
  ["major", /^major\b|\byour major\b|\bmajor ?\/ ?area\b|\barea of study\b|\bfield of study\b|\bhighest level degree in\b/],
  ["graduation_date", /\bgraduation (date|year)\b|\bgraduat(e|ed|ion) date\b|\bexpected graduation\b|\bdiplôme\b|\bhave you graduated\b/],
  ["school", /\b(college|university|school)( name)?\b.*\b(attend|name)\b|^school name\b|\bwhat (college|university|school)\b|\bwhich university\b|\bdans quelle école\b|\bpost-secondary education\b/],

  // Skills.
  ["languages", /\bnative \w+ (translator|speaker)\b|\blanguages?\b.*\b(speak|fluent|proficien|communicate)|\b(fluent|fluency|proficien\w*) in\b|\bproficiency\b.*\blanguage|\blanguage (skill|proficiency)\b|\bspreek je\b|\bdo you speak\b|\bbusiness fluency\b|\bnative (level )?fluency\b|\blanguage\b.*\bproficiency\b/],
  ["drivers_license", /\bdriver'?s'? licen[cs]e\b/],
  // A license or ID number is never held (no identity digits); it is asked.
  ["unknown", /\b(licen[cs]e|permit|passport|social security|ssn|national id)( card)? number\b|\bexpiration date\b/],
  ["certifications", /\bcertification|\bcertified\b|\bcpa\b/, (q, t) => !/certify that/.test(t)],

  // Authorization.
  ["citizenship", /\bexport\b.*\bcountr(y|ies)\b.*\bcitizen(ship)?\b|\bcountr(y|ies) of citizenship\b/],
  ["us_person", /\bu\.?s\.? person\b|\bexport (controls?|compliance)\b|\bdeemed export\b|\bitar\b|\bexport licen/],
  ["us_person", /\bcitizen\b/, (q) => /asylee|refugee|protected individual/.test(opts(q))],
  ["security_clearance", /\bsecurity clearance|\bclearance\b(?!.*\bbackground\b)|\bts\/sci\b|\bdod\b.*\bclearance/],
  ["sponsorship", /\bsponsor(ship)?\b|\bvisa\b(?!.*\btransfer)|\bwork permit\b|\bimmigration case\b|\bright to work support\b|\bnonimmigrant\b/],
  ["citizenship", /\bcitizen(ship)?\b|\bnationality\b|\bpermanent resident\b|\bcitizenship ?\/ ?employment eligibility\b/, (q, t) => !/renounced/.test(t)],
  ["work_authorization", /\b(legally )?(authori[sz]ed|eligible|entitled) (to work|for employment)\b|\bright to work\b|\bunrestricted right\b|\bproof of authorization\b|\beligibility to work\b|\bpermiso de trabajo\b|\bwork authori[sz]ation\b|\blegal right to work\b|\bverify (your|both your) identity and|\bauthori[sz]ation to work\b/],
  ["over_18", /\b(at least |over (the age of )?|)18( years)?( of age| or older| jaar)\b|\b18 jaar\b|\bunder 18\b|\bover the age of 18\b|\bat least 18\b/],

  ["eeo", /\btransitioning service member\b|\bveteran\b|\bdisability\b|\bgender\b|\bethnicity\b|\brace\b|^tu es\b/],

  // Legal attestations.
  ["criminal_history", /\bconvicted\b|\bfelony\b|\bcrime\b|\bindictment\b|\bfugitive\b|\bunlawful user\b|\baddicted\b|\bmental (defective|institution)\b|\bdishonorabl\w*\b|\bdischarged\b|\basked to resign\b|\bcourt order\b|\brenounced\b|\billegally or unlawfully\b|\bprohibited possessor\b|\bfirearms licensee\b|\bprohibited or restricted\b/],
  ["government_employment", /\b(u\.?s\.? )?government (\(|employee|employment|or military)|\bgovernment employee\b|\barmed forces\b|\breserves or the national guard\b|\bstate-owned\b|\bus government employment\b|\bprior us government\b/],
  ["non_compete", /\btype of obligation\b|\bnon-?compete\b|\bnon-?solicit|\brestrictive covenant|\bpost-employment obligation|\boutside (employment|business)|\bcontractual obligations\b|\bobligations, if any\b|\bemployment agreement\b|\bconflict of interest\b/],
  ["background_check_ok", /\bbackground (check|investigation)\b|\bdrug (test|screen)\b|\bscreen monitoring\b/],

  // Consent.
  ["sms_opt_in", /\b(text|sms|whatsapp)\b.*\b(message|communication|update|opt|consent|contact)|\bopt[- ]in to (text|receive text)|\bsms consent\b|\bcontact you by text\b/],
  ["marketing_opt_in", /\bnewsletter|\btalent community\b|\bother job openings\b|\btraining opportunities and courses\b|\bstay connected\b|\btalent matching\b/],
  ["ai_policy_ack", /\bai policy\b|\bai notetaker|\buse (of )?ai (tools )?to\b.*\b(research|prepare|refine|application)|\bplagiarism\b|\bown words\b|\bembrace ai\b/, (q) => !LONG_TYPES.has(String(q.type))],
  ["certify_true", /\bcertif(y|ication)\b.*\b(true|accurate|correct|complete)|\btrue and (complete|correct)|\baccurate to the best\b|\bapplicant'?s? statement\b|\bcertification & attestation\b|\baffirmation\b/],
  ["privacy_ack", /\bprivacy\b|\bpersonal (data|information)\b|\bdata (protection|processing)\b|\barbitrat|\backnowledg|\bconfidential(ity)? (information|acknowledg)|\bi (agree|accept)\b|\bconsumer privacy act\b|\bin consideration of\b|\bplease read\b|\breview the linked document\b|\bnotify you that personal data\b/],

  // The application and this employer.
  ["referral", /\breferr(ed|al|ing)\b/],
  ["relative_here", /\b(relative|family member|spouse|related to|personal relationship|close relationship|in-laws|anyone you live with)\b/],
  ["applied_before", /\b(applied|interviewed) (to|for|at|with)?\b.*\b(before|past|previously|within the past)\b|\bhave you (ever )?(previously )?(applied|interviewed)\b|\bpast or existing job application\b/],
  ["worked_here_before", /\b(worked|employed|employee|contractor|work)\b.*\b(for|at|by|with|of)\b.*\b(before|past|previously|currently|now or have you ever|ever been|in any capacity|history)\b|\bemployment history\b|\bhistory with\b|\bhave you (ever )?(been )?(previously )?(employed|worked)\b.*\b(by|for|at|with)\b|\bwere you (ever )?(employed|an employee)\b.*\b(by|of|at)\b|\bhave you worked (at|for|with)\b|\bare you (a |an )?(current|former) (employee|contractor)|\bcurrently (an |a )?(intern|employee|contractor)\b|\bi am a (currently an|former) employee\b|\bcurrent employee of\b|\bcurrent contractor for\b|\bare you currently employed by\b|\bpresently employed by\b|\bwork for a member firm\b|\bex-employee\b/, (q, t) => !/government|relative|family|second most recent|reason for leaving|end date|how many|number of/.test(t)],
  ["how_heard", /\bhow did you (first |initially )?(hear|come across|find|learn|come to know)\b|\bwhere did you (hear|find)\b|\bhow (did you )?hear\b|\bcomment as-tu entendu\b|\bwhere you heard\b|\bheard about this position\b|\bhow you heard\b|\bsource\b(?!.*referral)/],
  ["references", /\breferences?\b(?!.*\b(cv|resume)\b)/],

  // This job's screens.
  ["essential_functions", /\bessential functions?\b|\bwith or without (a )?reasonable accommodation/],
  ["meets_qualifications", /\bmeet (each of |all )?(the )?(basic |essential |required )?qualifications\b|\bread the required qualifications\b/],
  ["job_physical", /\blift(ing)?\b.*\b(lbs?|pounds?)\b|\bstand(ing)? for\b|\bclimb\b|\bmedical waste\b/],
  ["job_schedule", /\bovertime\b|\bweekends?\b|\bshift\b|\bus (time ?zone|pst hours)\b|\bdays and times\b|\bweekend\b|\bin het weekend\b|\bus shift\b|\bpst\b/],
  ["job_travel", /\btravel\b/, (q, t) => !/open to travel\?$|^what % of travel/.test(t) || /\brequires?\b/.test(t)],
  ["travel_ok", /\bopen to travel\b|\bwhat % of travel\b|\bwilling to travel\b/],
  ["job_relocation", /\brelocat/, (q, t) => /\b(this position|this role|office|headquarters|hq)\b/.test(t) || /relocate (to|before)/.test(opts(q))],
  ["job_relocation", /\brelocat\w*\b.*\b(to|in)\b [a-z]/, (q, t) => !/^are you (open|willing) to relocat\w*( if needed)?\??$/.test(t)],
  ["relocation", /\brelocat/],
  ["onsite_ok", /\bdo you plan to work remotely\b/],
  ["job_onsite", /\bon-?site\b|\bin-?office\b|\bin the office\b|\bin office\b|\bhybrid\b|\bin[- ]person\b|\bcommut|\bdays (a|per) week\b|\boffice (location|days)|\bfloat to\b|\breport to the office\b|\bwork from our\b|\bwork remotely\b|\bremote opportunities\b|\banchor days\b|\bwithin \d+ miles\b|\breside within\b|\bmeet in person\b/],
  ["job_location_choice", /\bwhich location are you applying\b|\btop location preference\b|\bcountries you anticipate\b|\bcities are you available\b|\btop 3 .* locations\b|\bpreferred location\b/],
  ["essay_why_company", WHY, (q) => LONG_TYPES.has(String(q.type))],
  ["essay_experience", DESCRIBE, (q) => LONG_TYPES.has(String(q.type))],
  ["job_experience", /\b(experience|years?)\b.*\b(with|in|using|of|building|teaching|writing)\b|\bhave you (built|led|used|worked on|personally|had hands-on|independently)\b|\bdo you have (a minimum|at least|experience|any (relevant )?experience|hands-on|working knowledge)\b|\bare you comfortable\b|\bwhich best describes\b|\bhow many\b.*\b(products|years)\b|\bstacks\b|\bselect all that apply\b|\bskills\b/, (q, t) => !LONG_TYPES.has(String(q.type)) || yesNoOnly(q)],

  // Written answers.
  ["essay_why_company", WHY, (q) => LONG_TYPES.has(String(q.type)) || q.type === "text" || q.type === "input_text"],
  ["essay_experience", DESCRIBE, (q) => LONG_TYPES.has(String(q.type)) || q.type === "text"],
  ["essay_other", /\?|\bwhat\b|\bhow\b/, (q) => LONG_TYPES.has(String(q.type))],
];

export function mapQuestion(q: Question): MappedQuestion {
  const t = norm(q.label);
  for (const [fact, test, when] of RULES) {
    if (!test.test(t)) continue;
    if (when && !when(q, t)) continue;
    return { fact, kind: kindOf(fact), why: `${fact}: ${test.source.slice(0, 60)}` };
  }
  return { fact: "unknown", kind: "unknown", why: "no rule" };
}
export const RULE_COUNT = RULES.length;
