// The gauntlet's mechanical checks for one reply (spec16 and l3 turns). Pure: no I/O, no environment, so the live
// runner, the single-file build and tests/edge/live-replays.test.ts all grade the same way.
// A person still reads every reply in the raw log the result file keeps.
function check(c, res) {
  const reasons = [], reply = String(res && res.reply || ""), meta = res && res.route || {};
  if (!res || res.error) return [`handler error: ${res && res.error || "no response"}`];
  const questions = (reply.match(/\?/g) || []).length;
  if (c.flow && meta.flow !== c.flow) reasons.push(`flow ${meta.flow || "none"}, expected ${c.flow}`);
  if (c.outcome && meta.outcome !== c.outcome) reasons.push(`outcome ${meta.outcome || "none"}, expected ${c.outcome}`);
  for (const m of c.matches || []) if (!new RegExp(m, "m").test(reply)) reasons.push(`reply lacks /${m}/`);
  for (const m of c.not_matches || []) if (new RegExp(m, "m").test(reply)) reasons.push(`reply has /${m}/`);
  if (c.no_question && questions) reasons.push("asked a question");
  if (c.max_questions !== undefined && questions > c.max_questions) reasons.push(`${questions} questions, at most ${c.max_questions}`);
  if (c.max_sentences && reply.split(/[.!?](\s|$)/).filter(x => x && x.trim()).length > c.max_sentences) reasons.push(`more than ${c.max_sentences} sentences`);
  if (c.min_chars && reply.length < c.min_chars) reasons.push(`shorter than ${c.min_chars} characters`);
  if (c.max_chars && reply.length > c.max_chars) reasons.push(`longer than ${c.max_chars} characters`);
  if (c.min_list_items && reply.split(/\n|;|\u2022/).filter(x => x.trim()).length < c.min_list_items) reasons.push(`fewer than ${c.min_list_items} items`);
  if (c.any_of) { const alts = c.any_of.map(a => check(a, res)); if (!alts.some(a => !a.length)) reasons.push(`none of the allowed shapes: ${alts.map(a => a.join("; ")).join(" | ")}`); }
  return reasons;
}
module.exports = { check };
