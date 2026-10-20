"use strict";
// The answer key's grading (tests/fixtures/extension/answer-key.json): the expected value of one bound field from the
// TEST persona, and whether what the card says was filled equals it. Shared by the WO-031 browser suite and the WO-042
// 60-in-30 benchmark, so both grade the same way.
const norm = (s) => String(s ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
// A sentence that says no counts as no ("I have never worked for SpaceX, ...", the live option list of WO-042).
const yn = (v) => (/^(yes|y|true|i agree|i accept|agree)\b/i.test(String(v).trim()) ? "yes" : /^(no|n|false|none|i have never|i have not|i'?ve never|i am not|i do not)\b/i.test(String(v).trim()) ? "no" : null);
// The expected value of one field from the persona (the key's rules, recorded in answer-key.json).
function expectedValue(spec, field, isWidget, persona, resumeName) {
  if (spec === null || spec === "any") return spec;
  const fact = typeof spec === "string" ? spec : spec.fact;
  if (typeof spec === "object" && "expect" in spec) return spec.expect;
  if (fact === "resume") return resumeName;
  const v = persona[fact];
  if (v === undefined) throw Error("persona has no " + fact);
  if (field.type === "file") return null;
  const opts = (field.options || []).filter((o) => o.label && !/^(select|please select)/i.test(o.label));
  if (opts.length) {
    const exact = opts.find((o) => norm(o.label) === norm(v));
    if (exact) return exact.label;
    const want = yn(v);
    const hits = want ? opts.filter((o) => yn(o.label) === want) : [];
    if (hits.length === 1) return hits[0].label;
    throw Error(`no expected option for ${field.name} (${fact}=${v}); give an explicit expect`);
  }
  if (field.type === "checkbox") return yn(v) === "yes" ? "Yes (checked)" : "No";
  if (isWidget) return yn(v) === "yes" ? "Yes" : yn(v) === "no" ? "No" : v;
  return v;
}
// A phone number is the same number however the page formats it ("+1 555-010-0000" for "+1 555 010 0000").
const PHONE = /^\+?[\d\s().-]{7,}$/;
const same = (got, want) => {
  if (PHONE.test(String(want ?? "").trim()) && PHONE.test(String(got ?? "").trim())) return String(got).replace(/\D/g, "") === String(want).replace(/\D/g, "");
  // A phone-country option names the country and its dialing code ("United States +1").
  const g = norm(got).replace(/^no \(left unchecked\)$/, "no").replace(/^(.+?)\s\+\d{1,4}$/, "$1"), w = norm(want);
  return g === w || (w === "yes (checked)" && g === "yes") || (w === "no" && g === "no") || samePlace(got, want);
};
// A place picked from the employer's own list names the same place as the persona's short form: "Chicago, Illinois,
// United States" is "Chicago, IL", and "Illinois, United States" is "IL" (WO-042, Lever's and Ashby's place search).
// The grader's own state list, kept apart from the product's.
const STATE = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california", co: "colorado", ct: "connecticut", de: "delaware",
  dc: "district of columbia", fl: "florida", ga: "georgia", hi: "hawaii", id: "idaho", il: "illinois", in: "indiana", ia: "iowa",
  ks: "kansas", ky: "kentucky", la: "louisiana", me: "maine", md: "maryland", ma: "massachusetts", mi: "michigan", mn: "minnesota",
  ms: "mississippi", mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire", nj: "new jersey",
  nm: "new mexico", ny: "new york", nc: "north carolina", nd: "north dakota", oh: "ohio", ok: "oklahoma", or: "oregon",
  pa: "pennsylvania", ri: "rhode island", sc: "south carolina", sd: "south dakota", tn: "tennessee", tx: "texas", ut: "utah",
  vt: "vermont", va: "virginia", wa: "washington", wv: "west virginia", wi: "wisconsin", wy: "wyoming",
};
const samePlace = (got, want) => {
  const g = norm(got).split(/\s*,\s*/), w = norm(want).split(/\s*,\s*/);
  const st = (x) => STATE[x] || x;
  const usa = (x) => !x || /^(united states( of america)?|usa|us)$/.test(x);
  if (w.length === 1 && STATE[w[0]]) return g.length <= 2 && st(g[0]) === STATE[w[0]] && usa(g[1]);
  if (w.length === 2 && STATE[w[1]]) return g.length >= 2 && g.length <= 3 && g[0] === w[0] && st(g[1]) === STATE[w[1]] && usa(g[2]);
  return false;
};
const emptyish = (v) => !v || norm(v) === "no (left unchecked)";

// One field's verdict: correct, wrong_value (filled, not the expected value), wrong_filled (filled where the key says it
// must stay empty), missed (should be filled, was not), empty_ok, or any.
function verdict(want, got) {
  const filled = !!got && got.source === "trainee" && !emptyish(got.value);
  const chose = !!got && got.source === "trainee" && norm(got.value) === "no (left unchecked)";
  if (want === "any") return "any";
  if (want === null) return filled ? "wrong_filled" : "empty_ok";
  if (filled || chose) return same(got.value, want) ? "correct" : "wrong_value";
  return "missed";
}

module.exports = { norm, yn, expectedValue, same, emptyish, verdict };
