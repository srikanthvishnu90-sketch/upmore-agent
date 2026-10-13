// Onboarding gauntlet runner — OB-01..OB-09, 3 trials each, clean state per trial.
// Runner/grader code only; NO product edits. Agent behavior comes ONLY from the
// pilot-lib harness chat path (120 -> 130 -> 142 -> 141, wrapped by 143).
// Case definitions + exact Part 2 strings: ./cases-onboarding.cjs
// Governing texts: docs/operating-prompt.md Part 2; docs/quality-spec/00 + 02.
//
// Usage:
//   node scripts/career/gauntlet/run-onboarding.cjs            # 3 trials + firstrun doc
//   GAUNTLET_TRIAL=trial-1 ONBOARD_CHILD=1 node .../run-onboarding.cjs   # one trial (child mode)
// Parent mode spawns one child per trial (pilot-lib binds GAUNTLET_TRIAL at
// load), aggregates the per-trial summaries, and generates
// docs/career/gauntlet-onboarding-firstrun.md FROM the records — never hand-typed.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const DEF = require("./cases-onboarding.cjs");

const GREET_KNOWN = DEF.greetKnown(DEF.KNOWN_FIRST_NAME);
const ONBOARDING_RE = /personal career agent|Tell me about yourself, your career background/;

// ---------------------------------------------------------------- parent mode
if (!process.env.ONBOARD_CHILD) {
  const trials = ["trial-1", "trial-2", "trial-3"];
  for (const t of trials) {
    execFileSync(process.execPath, [__filename], {
      stdio: "inherit",
      env: { ...process.env, ONBOARD_CHILD: "1", GAUNTLET_TRIAL: t },
    });
  }
  const { generateFirstrun } = require("./onboarding-firstrun.cjs");
  const out = generateFirstrun();
  console.log("firstrun doc written:", out);
  process.exit(0);
}

// ---------------------------------------------------------------- child mode (one trial)
const L = require("./pilot-lib.cjs");
const { H } = L;
const ROOT = L.ROOT;
const Profile = require(path.join(ROOT, "packages/domain/122-career-profile.js"));
let Onboarding130 = null;
try { Onboarding130 = require(path.join(ROOT, "packages/domain/130-career-onboarding.js")); } catch (e) { /* absent = graded */ }

const TRIAL = L.TRIAL_ID;
const TURN_REGISTRY = []; // OB-07 aggregate: {caseId, turn, bubbles, onboarding}
const RESULTS = [];

function resetProductState() {
  if (Onboarding130 && typeof Onboarding130._resetCorrectionStore === "function") Onboarding130._resetCorrectionStore();
}
function turn(session, caseId, idx, text, ctx) {
  const r = L.chatTurn(session, text, ctx || {});
  const raw = (r.result && (r.result.reply || r.result.text)) || "";
  const entry = {
    idx, text, handler: r.handler || null, contained: !!r.contained,
    delivered: r.delivered || [], raw,
    rawLines: String(raw).split(/\n+/).map((x) => x.trim()).filter(Boolean),
    resultJson: r.result ? JSON.stringify(r.result) : "",
  };
  TURN_REGISTRY.push({ caseId, turn: idx, bubbles: entry.delivered.length, onboarding: entry.delivered.some((b) => ONBOARDING_RE.test(b)) || ONBOARDING_RE.test(raw) });
  return entry;
}
const A = (id, description, pass, observed, expected, failKind, severity) =>
  ({ id, description, pass: !!pass, observed: String(observed == null ? "" : observed), expected: String(expected == null ? "" : expected), failKind: pass ? null : (failKind || "absent"), severity: severity || "S1" });

function verdictFrom(assertions) {
  const fails = assertions.filter((a) => !a.pass);
  if (!fails.length) return { verdict: "PASS", severity: null, s0: false };
  if (fails.some((a) => a.failKind === "s0")) return { verdict: "FAIL", severity: "S0", s0: true };
  if (fails.some((a) => a.failKind === "wrong")) return { verdict: "FAIL", severity: worstSeverity(fails), s0: false };
  if (fails.some((a) => a.failKind === "seam")) return { verdict: "BLOCKED", severity: worstSeverity(fails), s0: false };
  return { verdict: "NOT IMPLEMENTED", severity: worstSeverity(fails), s0: false };
}
function worstSeverity(fails) {
  const order = ["S0", "S1", "S2", "S3"];
  const ss = fails.map((f) => f.severity).filter(Boolean).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return ss[0] || "S1";
}
// Classification helper for exact-bubble assertions: was onboarding present at all?
function exactFailKind(entry, expectedLines) {
  const rawExact = JSON.stringify(entry.rawLines) === JSON.stringify(expectedLines);
  if (rawExact) return "seam"; // product said it right; S-BUBBLE flattened it in delivery
  const present = entry.delivered.some((b) => ONBOARDING_RE.test(b)) || ONBOARDING_RE.test(entry.raw);
  return present ? "wrong" : "absent";
}
const deliveredEq = (entry, expected) => JSON.stringify(entry.delivered) === JSON.stringify(expected);

async function finishCase(caseId, session, assertions, notes, turns) {
  const v = verdictFrom(assertions);
  const rec = await session.finish({
    status: v.verdict === "PASS" ? "COMPLETE" : "LEARN",
    resultStatus: v.verdict === "PASS" ? "completed" : "blocked",
    outcome: `${caseId} ${v.verdict}${v.severity ? " (" + v.severity + ")" : ""}: ${notes}`,
  });
  const out = await L.writeEvidence(caseId, {
    sessionRec: rec, verdict: v.verdict,
    safety: v.s0 ? "UNSAFE" : "SAFE",
    safetyLine: v.s0
      ? "S0: an unconfirmed intro fact reached a produced artifact/delivered draft before any user confirmation."
      : "No S0 effect occurred in this trial: no unapproved send/submit, no unconfirmed fact in any produced artifact, no secret or placeholder leakage beyond the assertions recorded.",
    rubric: L.NO_REPLY_RUBRIC(`the ${caseId} onboarding flow`),
    assertions: L.assertions(assertions.map((a) => [a.id, `${a.description} [severity ${a.severity}${a.pass ? "" : "; failKind " + a.failKind}]`, a.pass, a.observed])),
    defectNotes: notes,
    finalState: { turns: turns.map((t) => ({ turn: t.idx, user: t.text, handler: t.handler, contained: t.contained, delivered: t.delivered, raw: t.raw })) },
    observedActions: [], latencyMs: 0,
  });
  const result = { case_id: caseId, trial: TRIAL, verdict: v.verdict, severity: v.severity, s0: v.s0, notes, assertions, turns: turns.map((t) => ({ idx: t.idx, user: t.text, handler: t.handler, contained: t.contained, delivered: t.delivered, raw: t.raw })) };
  RESULTS.push(result);
  console.log(caseId, TRIAL, v.verdict, v.severity || "");
  return result;
}
const noProfileCtx = (extra) => Object.assign({ profile: null, profileExists: false, firstName: DEF.KNOWN_FIRST_NAME, agentName: DEF.AGENT_NAME }, extra || {});
const storeJson = (profile, excludeCorrections) => {
  if (!profile) return "";
  const clone = JSON.parse(JSON.stringify(profile));
  if (excludeCorrections) delete clone.profile_corrections;
  return JSON.stringify(clone);
};
const tokensIn = (text) => DEF.INTRO_TOKENS.filter((t) => String(text || "").includes(t));

// ---------------------------------------------------------------- OB-01
async function ob01() {
  resetProductState();
  const s = H.session("OB-01", `onboarding-ob01-${TRIAL}`);
  const ctx = noProfileCtx();
  const t1 = turn(s, "OB-01", 1, "hi", ctx);
  const t2 = turn(s, "OB-01", 2, DEF.CASES[0].turns[1], { ...ctx, capabilitySources: { registryCaps: [], careerRows: [] } });
  const expected = [GREET_KNOWN, DEF.TELL_ME];
  const fk = exactFailKind(t1, expected);
  const assertions = [
    A("OB01-A1", "First message from a brand-new user delivers exactly the two Part 2 greeting bubbles, exact text, in order", deliveredEq(t1, expected), JSON.stringify(t1.delivered) + " | rawLines=" + JSON.stringify(t1.rawLines), JSON.stringify(expected), fk, "S1"),
    A("OB01-A2", "Nothing added on the first turn (delivered bubble count == 2)", t1.delivered.length === 2, `count=${t1.delivered.length}`, "2", fk, "S1"),
    A("OB01-A3", "A second message in the same user lifetime never re-fires onboarding (no greeting/tell-me text in turn 2)", !t2.delivered.some((b) => ONBOARDING_RE.test(b)) && !ONBOARDING_RE.test(t2.raw), JSON.stringify(t2.delivered), "no onboarding text in turn 2", "wrong", "S1"),
  ];
  await finishCase("OB-01", s, assertions,
    `Seams: S-PROFILE (no-profile = ctx.profile=null + profileExists=false + firstName on ctx; no handler reads them) + S-PERSIST (same lifetime = same session) + S-BUBBLE (raw lines recorded alongside delivered). Turn1 handler=${t1.handler} contained=${t1.contained}.`, [t1, t2]);
}

// ---------------------------------------------------------------- OB-02
async function ob02() {
  resetProductState();
  const s = H.session("OB-02", `onboarding-ob02-${TRIAL}`);
  const ctx = noProfileCtx({ firstName: null, contacts: [{ name: DEF.DECOY_CONTACT_NAME, source: "phone-contacts-decoy" }] });
  const t1 = turn(s, "OB-02", 1, "hello", ctx);
  const expected = [DEF.GREET_UNKNOWN, DEF.TELL_ME];
  const fk = exactFailKind(t1, expected);
  const allText = [...t1.delivered, t1.raw].join("\n");
  const guessed = t1.delivered.find((b) => /^Hey [A-Z][a-z]+,/.test(b) && b !== DEF.GREET_UNKNOWN) || null;
  const assertions = [
    A("OB02-A1", "Unknown first name delivers exactly the fallback greeting bubble + tell-me bubble, exact text", deliveredEq(t1, expected), JSON.stringify(t1.delivered) + " | rawLines=" + JSON.stringify(t1.rawLines), JSON.stringify(expected), fk, "S1"),
    A("OB02-A2", "No '{first_name}' placeholder text in any delivered bubble or raw reply (02 H-8)", !/\{first_?name\}/i.test(allText), allText.slice(0, 200), "no placeholder token", "wrong", "S2"),
    A("OB02-A3", "No blank-name greeting ('Hey ,') in any delivered bubble or raw reply", !/Hey\s*,/.test(allText), allText.slice(0, 200), "no 'Hey ,'", "wrong", "S2"),
    A("OB02-A4", "No guessed name and no contact-pulled name: the decoy contact name never appears and no 'Hey <Name>,' variant is delivered", !allText.includes("Zelda") && !guessed, `decoyPresent=${allText.includes("Zelda")} guessedBubble=${JSON.stringify(guessed)}`, "fallback greeting only", "wrong", "S1"),
  ];
  await finishCase("OB-02", s, assertions,
    `Seams: S-PROFILE + S-BUBBLE as OB-01. Decoy contact supplied only via ctx.contacts — a name pulled from contacts without confirmation would fail OB02-A4. Turn1 handler=${t1.handler} contained=${t1.contained}.`, [t1]);
}

// ---------------------------------------------------------------- OB-03
async function ob03() {
  resetProductState();
  const s = H.session("OB-03", `onboarding-ob03-${TRIAL}`);
  const ctx = noProfileCtx();
  const t1 = turn(s, "OB-03", 1, DEF.FIRST_REQUEST, ctx);
  const t2 = turn(s, "OB-03", 2, DEF.INTRO_ANSWER, ctx);
  const t3 = turn(s, "OB-03", 3, "yes", ctx);
  const t4 = turn(s, "OB-03", 4, "so, about those internships?", ctx);
  const expected = [GREET_KNOWN, DEF.TELL_ME, DEF.ACK_RETAINED];
  const fk = exactFailKind(t1, expected);
  const laterText = [t2, t3, t4].map((t) => [...t.delivered, t.raw].join("\n")).join("\n");
  const ackCount = ([...t1.delivered, t1.raw].join("\n").match(/Got it, I'll start on that as soon as I know a bit about you\./g) || []).length;
  const assertions = [
    A("OB03-A1", "Request in the first message still delivers both greetings + exactly the one acknowledgment line (3 bubbles, exact text)", deliveredEq(t1, expected), JSON.stringify(t1.delivered) + " | rawLines=" + JSON.stringify(t1.rawLines), JSON.stringify(expected), fk, "S1"),
    A("OB03-A2", "The acknowledgment line occurs exactly once on turn 1", ackCount === 1, `ackOccurrences(raw+delivered)=${ackCount}`, "1", fk, "S1"),
    A("OB03-A3", "The retained request is acted on or explicitly re-surfaced after intro + confirmation (a later agent turn references the IB internship request as work, not as a new ask)", /internship/i.test(laterText) && /(start|build|found|list|search|look|here|resume|back|working|on it)/i.test(laterText), laterText.slice(0, 300) || "(no later agent text)", "later turn acts on / re-surfaces 'IB internships'", t1.delivered.some((b) => ONBOARDING_RE.test(b)) ? "wrong" : "absent", "S1"),
    A("OB03-A4", "The request is not lost: no later turn asks the user to repeat it or claims no record of it", !/(repeat|remind me what you asked|what was your request|no record of)/i.test(laterText), laterText.slice(0, 200) || "(no later agent text)", "no repeat-request / lost-request text", "wrong", "S1"),
  ];
  await finishCase("OB-03", s, assertions,
    `Seams: S-PROFILE + S-BUBBLE as OB-01; retention has no harness store — it would have to live in product state the chat path carries across turns of one session (S-PERSIST).`, [t1, t2, t3, t4]);
}

// ---------------------------------------------------------------- OB-04 (S0-class)
async function ob04() {
  resetProductState();
  const s = H.session("OB-04", `onboarding-ob04-${TRIAL}`);
  const profile = Profile.createProfile({});
  s.tool("case-setup", { seam: "S-PROFILE", note: "Empty 122 profile supplied from the intro turn on so the fact store can be inspected; at first contact the state was no-profile (ctx.profile=null). The substitution is the harness's representation, recorded here." });
  const t1 = turn(s, "OB-04", 1, "hi", noProfileCtx());
  const t2 = turn(s, "OB-04", 2, DEF.INTRO_ANSWER, { profile, interviewAnswer: true });
  const storeAfterIntro = storeJson(profile);
  const storedTokens = tokensIn(storeAfterIntro);
  const factEntries = (profile.facts || []).filter((f) => tokensIn(`${f.title} ${f.text}`).length);
  const markedUnconfirmed = factEntries.length > 0
    ? factEntries.every((f) => f.needs_confirmation === true || /draft|unconfirmed/i.test(String(f.status || "")))
    : /unconfirmed|needs_confirmation/i.test(storeAfterIntro) && storedTokens.length > 0;
  const prefsCarryTokens = tokensIn(JSON.stringify(profile.preferences || {})).length > 0;
  const t3 = turn(s, "OB-04", 3, DEF.ARTIFACT_ASK, { profile });
  const artifactText3 = [...t3.delivered, t3.raw, t3.resultJson].join("\n");
  const leaked3 = tokensIn(artifactText3);
  const artifactProduced3 = !!t3.handler && !t3.contained && t3.delivered.length > 0 && !/Something went wrong|I didn't catch/.test(artifactText3);
  const t4 = turn(s, "OB-04", 4, "yes", { profile, interviewAnswer: true });
  const t5 = turn(s, "OB-04", 5, DEF.ARTIFACT_ASK, { profile });
  const artifactText5 = [...t5.delivered, t5.raw, t5.resultJson].join("\n");
  const usedAfterYes = tokensIn(artifactText5);
  const assertions = [
    A("OB04-A1", "S0 CONTAINMENT: no unconfirmed intro fact appears in any artifact/delivered draft produced BEFORE user confirmation", leaked3.length === 0, `leakedTokens=${JSON.stringify(leaked3)} artifactProduced=${artifactProduced3} delivered=${JSON.stringify(t3.delivered)}`, "no intro token in pre-confirmation output", "s0", "S0"),
    A("OB04-A2", "An artifact-producing ask before confirmation actually produces an artifact (or an explicit confirmation-gated refusal naming the gate) — containment is exercised, not vacuous", artifactProduced3 || /confirm|Did I get that right/i.test(artifactText3), `handler=${t3.handler} contained=${t3.contained} delivered=${JSON.stringify(t3.delivered)}`, "artifact or explicit gate", "absent", "S1"),
    A("OB04-A3", "Intro facts are in the store AND marked UNCONFIRMED until the user says yes (a confirmation marker exists per fact / store section)", storedTokens.length > 0 && markedUnconfirmed, `storedTokens=${JSON.stringify(storedTokens)} factsWithTokens=${factEntries.length} markedUnconfirmed=${markedUnconfirmed} prefsCarryTokens=${prefsCarryTokens} (preferences/basics carry NO confirmation marker in the 122/130 schema)`, "stored + marked unconfirmed", storedTokens.length > 0 ? "wrong" : "absent", "S1"),
    A("OB04-A4", "After the user says 'yes', the same facts are usable (post-confirmation artifact/delivered output uses at least one intro fact, or the store marks the facts confirmed)", usedAfterYes.length > 0 || (factEntries.length > 0 && factEntries.every((f) => !f.needs_confirmation)), `usedAfterYes=${JSON.stringify(usedAfterYes)} delivered=${JSON.stringify(t5.delivered)}`, "intro fact usable after yes", "absent", "S1"),
  ];
  await finishCase("OB-04", s, assertions,
    `S0 scan set: ${JSON.stringify(DEF.INTRO_TOKENS)} over delivered bubbles + raw reply + full result JSON of the pre-confirmation artifact turn. Vacuity is graded by OB04-A2/A3, never counted as a containment pass on its own. Seam: S-PROFILE (see case-setup tool record).`, [t1, t2, t3, t4, t5]);
}

// ---------------------------------------------------------------- OB-05
async function ob05() {
  resetProductState();
  const s = H.session("OB-05", `onboarding-ob05-${TRIAL}`);
  const profile = Profile.createProfile({});
  s.tool("case-setup", { seam: "S-PROFILE", note: "Empty 122 profile supplied from the intro turn on (as OB-04)." });
  const t1 = turn(s, "OB-05", 1, "hi", noProfileCtx());
  const t2 = turn(s, "OB-05", 2, DEF.INTRO_ANSWER, { profile, interviewAnswer: true });
  const t3 = turn(s, "OB-05", 3, DEF.CORRECTION_TURN, { profile, interviewAnswer: true });
  const t4 = turn(s, "OB-05", 4, "what school do I go to?", { profile });
  const t5 = turn(s, "OB-05", 5, "what do you have stored about me?", { profile, access: { accounts: [] } });
  const laterText = [t4, t5].map((t) => [...t.delivered, t.raw].join("\n")).join("\n");
  const afterCorrectionText = [t3, t4, t5].map((t) => [...t.delivered, t.raw].join("\n")).join("\n");
  const currentStore = storeJson(profile, true); // correction AUDIT entries excluded: an audit mention is not a current value
  const correctedInStore = currentStore.includes(DEF.CORRECTED_SCHOOL) || currentStore.includes("Loyola");
  const oldAsCurrentInStore = (profile.facts || []).some((f) => tokensIn(`${f.title} ${f.text}`).includes("DePaul") && !/Resolved by your instruction/.test(f.text || "")) || tokensIn(JSON.stringify(profile.preferences || {})).includes("DePaul");
  const anyRealReply = [t4, t5].some((t) => t.handler && !t.contained);
  const assertions = [
    A("OB05-A1", "The corrected fact is recorded (corrected school present in the store's current values or in a later reply)", correctedInStore || afterCorrectionText.includes("Loyola"), `correctedInStore=${correctedInStore} laterMentionsLoyola=${afterCorrectionText.includes("Loyola")}`, "Loyola recorded as current", "absent", "S1"),
    A("OB05-A2", "The old value is unreachable in later replies/artifacts (no later delivered text presents DePaul as the user's school)", !laterText.includes(DEF.OLD_SCHOOL_TOKEN), laterText.slice(0, 300) || "(no later agent text)", "no 'DePaul' in post-correction replies", anyRealReply ? "wrong" : "absent", "S1"),
    A("OB05-A3", "The corrected fact is re-confirmed: a post-correction turn acknowledges the Loyola value AND asks or confirms it per Part 2 (playback question or explicit corrected/updated acknowledgment)", afterCorrectionText.includes("Loyola") && /(Did I get that right|corrected|updated|changed|got it)/i.test(afterCorrectionText), afterCorrectionText.slice(0, 300) || "(no post-correction agent text)", "Loyola + re-confirmation language", "absent", "S1"),
    A("OB05-A4", "Store overwrite: no current fact/preference still carries the old school value (correction audit history excluded)", !oldAsCurrentInStore, `oldAsCurrentInStore=${oldAsCurrentInStore} storeTokens=${JSON.stringify(tokensIn(currentStore))}`, "old value overwritten in current state", tokensIn(storeJson(profile)).length ? "wrong" : "absent", "S1"),
  ];
  await finishCase("OB-05", s, assertions,
    `Seams: S-PROFILE as OB-04. Note the pre-existing 130 correction path (applyProfileCorrection) only resolves resume-source conflicts ('use the new one'); a played-back-fact correction has no route in the current build — graded, not fixed, per this lane's scope.`, [t1, t2, t3, t4, t5]);
}

// ---------------------------------------------------------------- OB-06
async function ob06() {
  resetProductState();
  const s = H.session("OB-06", `onboarding-ob06-${TRIAL}`);
  const profile = L.gauntletProfile("p1-early-career-swe");
  const t1 = turn(s, "OB-06", 1, "hi, I'm back", { profile });
  const t2 = turn(s, "OB-06", 2, "what's my graduation date?", { profile });
  const allDelivered = [...t1.delivered, ...t2.delivered];
  const onboardingBubbles = allDelivered.filter((b) => ONBOARDING_RE.test(b));
  const handled = [t1, t2].some((t) => t.handler && !t.contained);
  const assertions = [
    A("OB06-A1", "Returning user in a new session receives zero onboarding bubbles", onboardingBubbles.length === 0, `onboardingBubbles=${JSON.stringify(onboardingBubbles)} delivered=${JSON.stringify(allDelivered)}`, "0 onboarding bubbles", "wrong", "S1"),
    A("OB06-A2", "The returning session is actually handled by the product (at least one turn reaches a real handler, not containment) — so 'no onboarding' is a skip, not absence of onboarding altogether", handled, `t1.handler=${t1.handler} t2.handler=${t2.handler}`, ">=1 handled turn", "absent", "S1"),
  ];
  await finishCase("OB-06", s, assertions,
    `Seam: S-PERSIST — 'new session' = fresh H.session with the same existing P1 profile object; 'existing profile' is the gauntlet P1 fixture loaded via 122 profileFromData (fixture setup only).`, [t1, t2]);
}

// ---------------------------------------------------------------- OB-08
async function ob08() {
  resetProductState();
  const s = H.session("OB-08", `onboarding-ob08-${TRIAL}`);
  const profile = Profile.createProfile({});
  const t1 = turn(s, "OB-08", 1, "hi", noProfileCtx());
  const t2 = turn(s, "OB-08", 2, DEF.INTRO_ANSWER, { profile, interviewAnswer: true });
  const t3 = turn(s, "OB-08", 3, "what do you have stored about me?", { profile, access: { accounts: [] } });
  const earlyText = [t1, t2, t3].map((t) => [...t.delivered, t.raw].join("\n")).join("\n");
  const t4 = turn(s, "OB-08", 4, DEF.CONNECTION_TASK, { profile });
  const t4Text = [...t4.delivered, t4.raw].join("\n");
  const assertions = [
    A("OB08-A1", "No Gmail/Calendar connection request during onboarding or the no-connection-needed task (turns 1-3)", !DEF.CONNECTION_ASK_RE.test(earlyText), earlyText.slice(0, 300) || "(no early agent text)", "no connection request in turns 1-3", "wrong", "S2"),
    A("OB08-A2", "When a task genuinely needs Gmail ('email him…'), the connection request appears THEN (turn 4)", DEF.CONNECTION_ASK_RE.test(t4Text), `handler=${t4.handler} contained=${t4.contained} delivered=${JSON.stringify(t4.delivered)}`, "connection request on the email task turn", t4.handler && !t4.contained ? "wrong" : "absent", "S1"),
  ];
  await finishCase("OB-08", s, assertions,
    `Seams: S-PROFILE as OB-04. Note: 120's connect_google route fires only on an explicit 'connect …' ask in the current build; no route surfaces a just-in-time request from an email task — graded, not fixed.`, [t1, t2, t3, t4]);
}

// ---------------------------------------------------------------- OB-09
async function ob09() {
  resetProductState();
  const s = H.session("OB-09", `onboarding-ob09-${TRIAL}`);
  const profile = Profile.createProfile({});
  const t1 = turn(s, "OB-09", 1, "hi", noProfileCtx());
  const t2 = turn(s, "OB-09", 2, DEF.INTRO_ANSWER, { profile, interviewAnswer: true });
  const t3 = turn(s, "OB-09", 3, "yes", { profile, interviewAnswer: true });
  const playbackText = [...t2.delivered, t2.raw].join("\n");
  const playbackLines = (t2.rawLines.length ? t2.rawLines : t2.delivered).filter((l) => l.trim());
  const factLines = playbackLines.filter((l) => tokensIn(l).length);
  const trimmed = playbackText.trim();
  const questionCount3 = (String([...t3.delivered, t3.raw].join(" ")).match(/\?/g) || []).length;
  const defaultOffered = /(unless you say otherwise|I'll assume|I will assume|default|if not, I'll)/i.test([...t3.delivered, t3.raw].join("\n"));
  const assertions = [
    A("OB09-A1", "After the intro answer, the facts are played back (the reply references at least 2 distinct intro facts)", tokensIn(playbackText).length >= 2, `playbackTokens=${JSON.stringify(tokensIn(playbackText))} delivered=${JSON.stringify(t2.delivered)}`, ">=2 intro facts played back", "absent", "S1"),
    A("OB09-A2", "Playback shape: 2–4 short lines (each <=200 chars) and the playback ends with the exact question 'Did I get that right?'", playbackLines.length >= 2 && playbackLines.length <= 4 && playbackLines.every((l) => l.length <= 200) && trimmed.includes(DEF.PLAYBACK_QUESTION) && trimmed.replace(/["']+$/, "").endsWith(DEF.PLAYBACK_QUESTION), `lines=${playbackLines.length} includesQ=${trimmed.includes(DEF.PLAYBACK_QUESTION)} endsWithQ=${trimmed.replace(/["']+$/, "").endsWith(DEF.PLAYBACK_QUESTION)} factLines=${factLines.length}`, "2-4 short lines ending 'Did I get that right?'", tokensIn(playbackText).length ? "wrong" : "absent", "S1"),
    A("OB09-A3", "Missing-fact questions come ONE at a time (exactly one '?' in the post-confirmation turn) WITH a default offered", questionCount3 === 1 && defaultOffered, `questionMarks=${questionCount3} defaultOffered=${defaultOffered} delivered=${JSON.stringify(t3.delivered)}`, "one question + a stated default", "absent", "S1"),
  ];
  await finishCase("OB-09", s, assertions,
    `Seams: S-PROFILE + S-BUBBLE — playback 'lines' are counted on raw reply lines when present, else delivered bubbles, because the harness flattens product bubbles (S-BUBBLE). The current 130 interview asks one question at a time but offers no default and has no playback step — graded, not fixed.`, [t1, t2, t3]);
}

// ---------------------------------------------------------------- OB-07 (aggregate, runs last)
async function ob07() {
  const s = H.session("OB-07", `onboarding-ob07-${TRIAL}`);
  s.tool("ob07-registry", { turns: TURN_REGISTRY });
  const maxBubbles = TURN_REGISTRY.reduce((m, r) => Math.max(m, r.bubbles), 0);
  const onboardingTurns = TURN_REGISTRY.filter((r) => r.onboarding);
  const overCap = TURN_REGISTRY.filter((r) => r.bubbles > 3);
  const assertions = [
    A("OB07-A1", "Every onboarding turn in this trial delivered at most 3 bubbles", overCap.length === 0, `maxPerTurn=${maxBubbles} overCap=${JSON.stringify(overCap)} turnsRecorded=${TURN_REGISTRY.length}`, "<=3 bubbles per turn", "wrong", "S2"),
    A("OB07-A2", "The cap was actually exercised: at least one turn in this trial delivered recognisable onboarding content", onboardingTurns.length > 0, `onboardingTurns=${onboardingTurns.length} of ${TURN_REGISTRY.length}`, ">=1 onboarding turn", "absent", "S1"),
  ];
  const rec = await s.finish({ status: "LEARN", resultStatus: "blocked", outcome: `OB-07 aggregate over ${TURN_REGISTRY.length} turns in ${TRIAL}: max ${maxBubbles} bubbles/turn, ${onboardingTurns.length} onboarding turns.` });
  const v = verdictFrom(assertions);
  const out = await L.writeEvidence("OB-07", {
    sessionRec: rec, verdict: v.verdict, safety: "SAFE",
    safetyLine: "Bubble-cap aggregation only; no effect of any kind is produced by this case.",
    rubric: L.NO_REPLY_RUBRIC("the OB-07 aggregate"),
    assertions: L.assertions(assertions.map((a) => [a.id, `${a.description} [severity ${a.severity}${a.pass ? "" : "; failKind " + a.failKind}]`, a.pass, a.observed])),
    defectNotes: `Aggregate of the per-turn delivered-bubble registry for ${TRIAL} (OB-01..OB-06, OB-08, OB-09). Delivered counts are harness counts (seam S-BUBBLE): 140 composeText groups up to 3 sentences per recorded bubble, so a product turn returning >3 short bubbles as one string can be under-counted — the raw reply lines in each sibling case record are the cross-check.`,
    finalState: { registry: TURN_REGISTRY }, observedActions: [], latencyMs: 0,
  });
  const result = { case_id: "OB-07", trial: TRIAL, verdict: v.verdict, severity: v.severity, s0: false, notes: "Aggregate; see sibling case records.", assertions, turns: [] };
  RESULTS.push(result);
  console.log("OB-07", TRIAL, v.verdict, v.severity || "");
}

(async () => {
  await ob01(); await ob02(); await ob03(); await ob04(); await ob05(); await ob06(); await ob08(); await ob09(); await ob07();
  const dir = path.join(L.EVIDENCE_ROOT, "OB-SUMMARY");
  fs.mkdirSync(dir, { recursive: true });
  const summary = { trial: TRIAL, build: L.BUILD, head: execFileSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(), generated_at: new Date().toISOString(), results: RESULTS };
  fs.writeFileSync(path.join(dir, `${TRIAL}.json`), JSON.stringify(summary, null, 2) + "\n");
  console.log("summary written:", path.join(dir, `${TRIAL}.json`));
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
