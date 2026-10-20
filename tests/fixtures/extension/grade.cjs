"use strict";
// The answer key's grading (tests/fixtures/extension/answer-key.json): the expected value of one bound field from the
// TEST persona, and whether what the card says was filled equals it. Shared by the WO-031 browser suite and the WO-042
// 60-in-30 benchmark, so both grade the same way.
const norm = (s) => String(s ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const yn = (v) => (/^(yes|y|true|i agree|i accept|agree)\b/i.test(String(v).trim()) ? "yes" : /^(no|n|false|none)\b/i.test(String(v).trim()) ? "no" : null);
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
  return g === w || (w === "yes (checked)" && g === "yes") || (w === "no" && g === "no");
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
