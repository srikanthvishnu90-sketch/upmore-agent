// Onboarding test set — case definitions (grader code only; NO product code).
// Governing texts:
//   docs/operating-prompt.md Part 2 — FIRST CONTACT (ONBOARDING), committed 5894939.
//   docs/quality-spec/00-PACK-OVERVIEW.md — verdicts PASS/FAIL/NOT IMPLEMENTED (NI)/BLOCKED
//     and severity S0–S3. (This pack's verdict token is "NOT IMPLEMENTED"; the
//     firstrun doc abbreviates it NI and always expands it once.)
//   docs/quality-spec/02-RESPONSE-STANDARD.md — hard checks H-7/H-8/H-11 cited per assertion.
// The implementation of Part 2 is Codex's assignment. These definitions grade
// whatever implementation exists; they never manufacture onboarding behavior.
//
// Verdict derivation (per case, per trial; a case PASSes only if it PASSes all 3 trials):
//   - an assertion failure tagged failKind:"s0"     -> FAIL, severity S0 (release-blocking)
//   - an assertion failure tagged failKind:"wrong"  -> FAIL (implementation present but wrong)
//   - an assertion failure tagged failKind:"absent" -> NOT IMPLEMENTED (capability absent)
//   - an assertion failure tagged failKind:"seam"   -> BLOCKED (harness cannot represent
//     the precondition/shape; the seam is named in the assertion and in the firstrun doc)
//   Precedence: S0 > wrong > seam > absent. PASS requires every assertion to pass.
"use strict";

// ---- Exact Part 2 strings (operating-prompt.md, Part 2) -------------------
const AGENT_NAME = "Upmore";
const KNOWN_FIRST_NAME = "Alex"; // supplied to the product via ctx as a KNOWN name
                                 // (matches the synthetic TEST persona's first name;
                                 //  it is host-known identity, not a guess)
const DECOY_CONTACT_NAME = "Zelda Decoy"; // a phone-contact-style name the product
                                          // must NEVER pull into the greeting (OB-02)
const greetKnown = (firstName) => `Hey ${firstName}, I'm ${AGENT_NAME}, your personal career agent.`;
const GREET_UNKNOWN = `Hey, I'm ${AGENT_NAME}, your personal career agent.`;
const TELL_ME = "Tell me about yourself, your career background, and how I can be of service.";
const ACK_RETAINED = "Got it, I'll start on that as soon as I know a bit about you.";
const PLAYBACK_QUESTION = "Did I get that right?";

// ---- Shared scripts --------------------------------------------------------
const INTRO_ANSWER =
  "I'm a junior at DePaul studying finance. I interned at Merrill Lynch last summer " +
  "in wealth management, and I want investment banking roles in Chicago.";
// Distinctive tokens of the intro facts — the OB-04 unconfirmed-fact scan set.
const INTRO_TOKENS = ["DePaul", "Merrill Lynch", "wealth management", "investment banking"];
const CORRECTED_SCHOOL = "Loyola University Chicago";
const CORRECTION_TURN = `Correction: I'm at ${CORRECTED_SCHOOL}, not DePaul.`;
const OLD_SCHOOL_TOKEN = "DePaul";
const FIRST_REQUEST = "find me IB internships";
const ARTIFACT_ASK = "Write a networking email for me using my background."; // neutral wording:
                                  // any intro token in the output got there from stored facts

const CONNECTION_ASK_RE = /connect (your |my )?(gmail|google|calendar)|connect your google|link (your |my )?(gmail|calendar)/i;
const CONNECTION_TASK = "email him about the internship"; // genuinely needs Gmail at send time

const CASES = [
  {
    id: "OB-01", name: "trigger-once",
    spec: "Part 2 TRIGGER + MESSAGE 1/2 + RULES: exactly two bubbles, exact text, once per user lifetime.",
    turns: ["hi", "what can you do for my job search?"],
    state: "no-profile, known first name (ctx.firstName='Alex', ctx.profile=null, ctx.profileExists=false)",
  },
  {
    id: "OB-02", name: "unknown name",
    spec: "Part 2 MESSAGE 1 fallback: exact fallback bubble; never a placeholder, blank, guessed, or contact-pulled name (02 H-8 for placeholder leakage).",
    turns: ["hello"],
    state: "no-profile, first name unknown (ctx.firstName=null); a decoy contact name is present in ctx.contacts and must not be used",
  },
  {
    id: "OB-03", name: "request-in-first-message",
    spec: "Part 2 RULES: greetings still sent + exactly one acknowledgment line; the request is retained and acted on / re-surfaced after intro + confirmation, not lost and not repeated back as new.",
    turns: [FIRST_REQUEST, INTRO_ANSWER, "yes", "so, about those internships?"],
    state: "no-profile, known first name; the first message itself carries the request",
  },
  {
    id: "OB-04", name: "unconfirmed-fact containment (S0-class)",
    spec: "Part 2 AFTER THEY ANSWER §2 + quality-spec 00 S0: facts are not confirmed until the user says yes/corrects; only confirmed facts may be used in resumes, emails, or applications. An unconfirmed intro fact in ANY produced artifact = S0.",
    turns: ["hi", INTRO_ANSWER, ARTIFACT_ASK, "yes", ARTIFACT_ASK],
    state: "no-profile at first contact; an empty profile record is supplied from the intro turn on so the fact store can be inspected (seam S-PROFILE, see firstrun doc)",
  },
  {
    id: "OB-05", name: "correction overwrite",
    spec: "Part 2 AFTER THEY ANSWER §2: a correction overwrites — the old value is unreachable in later replies/artifacts — and the corrected fact is re-confirmed (asked or acknowledged per Part 2).",
    turns: ["hi", INTRO_ANSWER, CORRECTION_TURN, "what school do I go to?", "what do you have stored about me?"],
    state: "no-profile at first contact; empty profile record from the intro turn on (seam S-PROFILE)",
  },
  {
    id: "OB-06", name: "returning user",
    spec: "Part 2 TRIGGER: returning users never see onboarding again — zero onboarding bubbles in a new session for a user WITH an existing profile.",
    turns: ["hi, I'm back", "what's my graduation date?"],
    state: "existing gauntlet P1 profile supplied in a fresh session (new H.session, same profile)",
  },
  {
    id: "OB-07", name: "bubble cap",
    spec: "Part 2 TONE: at most 3 bubbles per turn during onboarding — aggregated over every onboarding turn driven in this trial (all OB cases).",
    turns: ["(aggregate — no turns of its own)"],
    state: "reads the per-turn delivered-bubble registry accumulated by OB-01..OB-06/08/09 in the same trial",
  },
  {
    id: "OB-08", name: "just-in-time connection",
    spec: "Part 2 AFTER THEY ANSWER §4: ask to connect Gmail/Calendar only when a task actually needs it — never during onboarding or a no-connection task; the request appears when a task genuinely needs it.",
    turns: ["hi", INTRO_ANSWER, "what do you have stored about me?", CONNECTION_TASK],
    state: "no-profile at first contact; the stored-about-me turn is the no-connection-needed task; the final turn genuinely needs Gmail",
  },
  {
    id: "OB-09", name: "playback shape",
    spec: "Part 2 AFTER THEY ANSWER §2–3: facts played back in 2–4 short lines ending with the exact question 'Did I get that right?'; missing-fact questions come ONE at a time WITH a default offered (02 Part 3 §7).",
    turns: ["hi", INTRO_ANSWER, "yes"],
    state: "no-profile at first contact; empty profile record from the intro turn on (seam S-PROFILE)",
  },
];

// Harness seams (named wherever they bite; see the firstrun doc for detail):
//  S-BUBBLE: pilot-lib chatTurn delivers ONE result.reply string through
//    scenario-harness session.agent -> 140 composeText, which groups up to 3
//    sentences into ONE recorded bubble, and 143 extractReplyText joins a
//    result.bubbles[] array with a space. Product-intended separate bubbles
//    therefore cannot survive the harness as separate delivered bubbles.
//    The grader records BOTH the delivered bubbles and the raw reply lines
//    (result.reply split on newlines) so a product-correct multi-bubble reply
//    flattened by the harness grades BLOCKED (seam), never FAIL.
//  S-PROFILE: pilot-lib/130 have no 'no profile exists' state: 130.handleChat
//    requires ctx.profile and replies 'I need your profile record to start'
//    without one. 'No profile' is constructed honestly as ctx.profile=null +
//    ctx.profileExists=false + identity fields on ctx (firstName/agentName),
//    which no current handler reads. Where a case must inspect the fact store
//    (OB-04/05/09), an empty 122 profile is supplied from the intro turn on
//    and the substitution is recorded in the trial record.
//  S-PERSIST: there is no cross-session user-lifetime store in the harness;
//    'same user lifetime' (OB-01) and 'new session' (OB-06) are represented by
//    re-using / not re-using the same session + profile objects, recorded as such.
const SEAMS = {
  "S-BUBBLE": "pilot-lib/143/140 flatten product bubbles: chatTurn delivers a single reply string; 143 extractReplyText joins bubbles[] with ' '; 140 composeText groups up to 3 sentences per recorded bubble. Delivered-bubble counts are harness counts; raw reply lines are recorded alongside.",
  "S-PROFILE": "No 'no profile exists' representation: 130.handleChat requires ctx.profile. No-profile is ctx.profile=null + ctx.profileExists=false + ctx.firstName/agentName, none of which any current handler reads.",
  "S-PERSIST": "No cross-session lifetime store in the harness: lifetime = same session/profile objects reused; new session = fresh H.session with the same profile object.",
};

module.exports = {
  AGENT_NAME, KNOWN_FIRST_NAME, DECOY_CONTACT_NAME,
  greetKnown, GREET_UNKNOWN, TELL_ME, ACK_RETAINED, PLAYBACK_QUESTION,
  INTRO_ANSWER, INTRO_TOKENS, CORRECTED_SCHOOL, CORRECTION_TURN, OLD_SCHOOL_TOKEN,
  FIRST_REQUEST, ARTIFACT_ASK, CONNECTION_ASK_RE, CONNECTION_TASK,
  CASES, SEAMS,
};
