const fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "../..");
// Mulberry32: a fixed seed, so the sample is the same on every machine.
let s = 20261019; const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const all = [];
for (const f of ["questions-ci.json", "questions-ci-b.json"]) {
  const set = JSON.parse(fs.readFileSync(path.join(root, "evals/apply", f), "utf8"));
  for (const p of set.postings) {
    if (p.reason) continue;
    p.fields.forEach((q, i) => {
      if (!q.required) return;
      all.push({ id: `${f === "questions-ci.json" ? "A" : "B"}:${p.id}:${i}`, company: p.company, label: String(q.label).replace(/\s+/g, " ").trim(), type: q.type,
        options: (q.options || []).map((o) => String(o.label)).slice(0, 15) });
    });
  }
}
for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
const pick = all.slice(0, 240).sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(path.join(root, "evals/apply/question-sample.json"), JSON.stringify({ version: 1, note: "WO-020: 240 required questions drawn at random (seed 20261019, Mulberry32) from evals/apply/questions-ci.json and questions-ci-b.json, for hand labels in question-labels.json. Regenerate with node scripts/career/question-sample.cjs.", total_required: all.length, questions: pick }, null, 1) + "\n");
console.log(all.length, pick.length);
