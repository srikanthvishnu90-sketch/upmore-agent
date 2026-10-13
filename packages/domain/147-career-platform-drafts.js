/* 147-career-platform-drafts.js — DePaulConnect lane (owner strategy
 * narrowing, 2026-10-13). DRAFTING HELP ONLY.
 *
 * Given an alumni profile the USER supplies (they pasted it / viewed it
 * themselves) plus an optional personalization fact the USER provides,
 * produce an in-platform message draft under the F1 draft rules. This
 * module has NO transport of any kind: it cannot read a directory, open a
 * profile, or deliver a message — the draft is returned to the user, who
 * sends it themselves in the platform. If the user provides no fact, the
 * draft says so (notes) and stays Tier C: it claims no personalization
 * that was never supplied. Facts about the profile come only from what
 * the user pasted; nothing is invented (a firm is named only when the
 * supplied profile carries one).
 */
"use strict";

const CareerPlatformDrafts = (() => {
  const MAX_WORDS = 120; // F1 platform-message cap (short in-platform note)

  function wordCount(text) { return String(text || "").trim().split(/\s+/).filter(Boolean).length; }

  function draftMessage(input) {
    input = input || {};
    const profile = input.profile || {};
    const user = input.user || {};
    const platform = input.platform || "the alumni platform";
    const notes = [];
    const fact = input.userFact && input.userFact.fact ? input.userFact : null;

    const fullName = String(profile.full_name || "").trim();
    const first = fullName.split(/\s+/)[0] || "there";
    const firm = String(profile.current_firm || "").trim();
    const title = String(profile.title || "").trim();
    if (!firm) notes.push("No firm on the supplied profile — the draft names no firm (nothing invented).");
    const userFirst = String(user.name || "").trim().split(/\s+/)[0] || "I";
    const school = String(profile.school || "").trim();
    const sameSchool = school && user.school && String(user.school).trim().toLowerCase() === school.toLowerCase();
    const userBlurb = user.blurb ? String(user.blurb).trim() : "I'm exploring investment banking and learning how people broke in.";

    let tier, factUsed = null;
    const lines = [`Hi ${first} —`];
    if (fact) {
      tier = "A";
      factUsed = { fact: String(fact.fact), source_note: fact.source_note || "provided by the user" };
      lines.push(`I saw that you ${String(fact.fact).replace(/\.$/, "")} — it stuck with me${sameSchool ? ` as a fellow ${school} student` : ""}.`);
    } else {
      tier = "C";
      notes.push("No personalization fact provided by the user — Tier C draft: no personalization is claimed.");
      lines.push(`I'm reaching out through ${platform}${sameSchool ? ` as a fellow ${school} student` : ""} who is learning the ropes.`);
    }
    lines.push(`I'm ${userFirst}${user.year ? `, a ${user.year}` : ""}${user.school ? ` at ${user.school}` : ""}. ${userBlurb}`);
    if (firm) lines.push(`Your path${title ? ` to ${title}` : ""} at ${firm} is close to what I hope to do, and I'd value your perspective.`);
    else lines.push("Your path is close to what I hope to do, and I'd value your perspective.");
    lines.push("Would you be open to a 15-minute call sometime Tuesday afternoon or Thursday morning? Totally fine if the timing is bad — even a pointer or two by message helps.");
    lines.push(`Thanks for your time,\n${user.name || userFirst}`);
    const body = lines.join("\n\n");
    const count = wordCount(body);
    if (count > MAX_WORDS) notes.push(`Draft is ${count} words, over the ${MAX_WORDS}-word platform cap — trim before sending.`);
    return { ok: true, platform,
      draft: { body, word_count: count, tier, fact_used: factUsed, to_name: fullName || null, sendable_by: "user_only", sent: false },
      notes };
  }

  return { draftMessage, MAX_WORDS };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerPlatformDrafts;
