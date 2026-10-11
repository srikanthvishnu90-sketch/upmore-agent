#!/usr/bin/env node
// corpus/upmore-convo-corpus-N-of-5.txt -> corpus/corpus.json (parsed by packages/domain/75-style-corpus.js), which
// scripts/build-router-core.py embeds in the edge bundle as STYLE_CORPUS_JSON. Edit the .txt files, never the JSON.
//   node scripts/build-style-corpus.cjs          rebuild
//   node scripts/build-style-corpus.cjs --check  fail when corpus.json is stale (tests/style-corpus.test.cjs, CI)
const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const StyleCorpus = require(path.join(root, "packages/domain/75-style-corpus.js"));
const files = [1, 2, 3, 4, 5].map(n => path.join(root, "corpus", `upmore-convo-corpus-${n}-of-5.txt`));
const examples = files.flatMap((f, i) => StyleCorpus.parse(fs.readFileSync(f, "utf8"), i + 1));
const out = JSON.stringify({ source: "corpus/upmore-convo-corpus-{1..5}-of-5.txt (owner, 2026-10-11)", count: examples.length, examples }, null, 1) + "\n";
const target = path.join(root, "corpus", "corpus.json");
if (process.argv.includes("--check")) {
  if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== out) { console.error("corpus/corpus.json is stale: run node scripts/build-style-corpus.cjs"); process.exit(1); }
  console.log(`style corpus verified: ${examples.length} examples`);
} else { fs.writeFileSync(target, out); console.log(`built corpus/corpus.json: ${examples.length} examples`); }
