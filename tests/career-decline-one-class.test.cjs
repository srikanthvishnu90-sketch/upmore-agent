// The EEO "decline to answer" choice is one meaning worded many ways across boards. It was matched by three separate
// lists that drifted: the browser helper learned Lever's "I do not want to answer" (F-024) while module 149's gate,
// which checks what was filled, did not know it, so the gate refused the helper's correct fill. Module 149's
// EEO_DECLINE_MEANING is now the one home; the helper reads it, and the answer-option matcher (answer_options.ts,
// used for a person's saved "decline" answer) must agree with it on every rendering below.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const Portal = require("../packages/domain/149-career-portal-apply.js");

// Renderings measured on real boards (DECLINE-VOCAB lane's 24 fills, F-024's Lever select) and known variants.
const DECLINE = [
  "I don't wish to answer", "I don’t wish to answer", "Decline To Self Identify", "Decline to self-identify", "Decline",
  "I prefer not to say", "Prefer not to answer", "I do not want to answer", "I don't want to answer",
  "Do not wish to disclose", "I choose not to disclose", "I would rather not say", "Prefer not to disclose",
  "I do not wish to self-identify", "Choose not to identify",
];
// Substantive answers that must never be read as a decline.
const SUBSTANTIVE = [
  "I do not have a disability", "No, I do not have a disability and have not had one in the past", "I am not a protected veteran",
  "Yes, I have a disability (or previously had a disability)", "Male", "Female", "Hispanic or Latino", "Not Hispanic or Latino",
  "Two or More Races", "I identify as one or more of the classifications of protected veteran",
];

test("module 149's gate: every decline rendering is decline-class, no substantive answer is", () => {
  for (const t of DECLINE) assert.ok(Portal.isEeoDeclineText(t), `gate refuses decline rendering: ${t}`);
  for (const t of SUBSTANTIVE) assert.equal(Portal.isEeoDeclineText(t), false, `gate reads a real answer as decline: ${t}`);
});

test("the browser helper has no decline list of its own: it reads 149's", () => {
  const src = require("node:fs").readFileSync(path.join(__dirname, "..", "scripts", "career", "portal-browser-helper.cjs"), "utf8");
  assert.match(src, /EEO_DECLINE_SOURCE/);
  assert.doesNotMatch(src, /\/decline\|prefer not\|/, "an inline copy of the decline regex is back in the helper");
  const re = new RegExp(Portal.EEO_DECLINE_SOURCE);
  // The in-page matcher normalizes without dropping curly quotes first ("don’t" -> "don t"); the class covers both.
  const inPageNorm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  for (const t of DECLINE) assert.ok(re.test(inPageNorm(t)), `in-page matcher misses: ${t}`);
  for (const t of SUBSTANTIVE) assert.equal(re.test(inPageNorm(t)), false, `in-page matcher reads a real answer as decline: ${t}`);
});

test("answer_options.ts picks the decline option for a saved decline answer on every rendering", () => {
  const esbuild = require(process.env.UPMORE_ESBUILD_PATH || (process.env.ESBUILD_BIN ? path.resolve(path.dirname(process.env.ESBUILD_BIN), "..", "esbuild") : "esbuild"));
  const code = esbuild.buildSync({ entryPoints: [path.join(__dirname, "..", "supabase", "functions", "_shared", "answer_options.ts")], bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent" }).outputFiles[0].text;
  const mod = new Module("answer-options-parity", module); mod.filename = __filename; mod._compile(code, __filename);
  const { chooseOption } = mod.exports;
  for (const t of DECLINE) {
    const options = [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }, { label: t, value: "decline" }];
    assert.equal(chooseOption("disability", "decline to answer", options, "Do you have a disability?"), "decline", `saved decline does not pick: ${t}`);
  }
});
