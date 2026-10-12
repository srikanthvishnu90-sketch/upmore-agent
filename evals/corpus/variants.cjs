// Variants of a corpus example (corpus/USAGE-PROMPT.txt step 2: typos, slang, look-alikes, stale and double yeses). The
// person's first message is rewritten; the expected assistant turns stay, so a variant must grade the same as its seed.
// Look-alike names, stale yeses and double yeses are seeds of their own in the corpus (1.04, 2.01, 2.08, 2.09).
const TYPO = { send: "sned", cancel: "cancle", split: "spilt", request: "reqest", buy: "buy", sell: "sel", pay: "pya" };
const SLANG = [[/\bplease\b/gi, "pls"], [/\byou\b/gi, "u"], [/\bright now\b/gi, "rn"]];
function rewrite(example, fn) {
  let done = false;
  const turns = example.turns.map(t => { if (done || t.role !== "user") return t; done = true; return Object.assign({}, t, { text: fn(t.text) }); });
  return Object.assign({}, example, { turns });
}
function of(example) {
  const first = (example.turns.find(t => t.role === "user") || {}).text;
  if (!first) return [];
  const out = [];
  const w = /^(\w+)/.exec(first), verb = w && w[1].toLowerCase();
  if (verb && TYPO[verb] && TYPO[verb] !== verb) out.push({ kind: "typo", example: rewrite(example, t => t.replace(/^\w+/, TYPO[verb])) });
  out.push({ kind: "case_punct", example: rewrite(example, t => t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : "!!")) });
  const slang = SLANG.reduce((s, [re, r]) => s.replace(re, r), first);
  out.push({ kind: "slang", example: rewrite(example, t => slang === first ? t + " rn pls" : slang) });
  return out;
}
module.exports = { of, TYPO };
