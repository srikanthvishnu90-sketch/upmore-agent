"use strict";
// The config.js side of scripts/extension/package.sh: reads the extension's flags, and makes the agent variant's config.
//
//   node scripts/extension/variant.cjs flags <config.js>          prints "personSubmits=<bool> agentSubmits=<bool>"
//   node scripts/extension/variant.cjs agent <src config.js> <dst config.js>
//        writes dst: src with ONLY `agentSubmits: false,` turned into `agentSubmits: true,`. Exit 1 (dst removed) unless,
//        read back, dst has agentSubmits true, personSubmits false, every other value equal to src's, and exactly one
//        line differs. src is only read, never written.
const fs = require("node:fs");
const vm = require("node:vm");

const FLAGS = ["personSubmits", "agentSubmits"];

function defaults(text, name) {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(text, sandbox, { filename: name, timeout: 1000 });
  const d = sandbox.TRAINEE_DEFAULTS;
  if (!d || typeof d !== "object") throw Error(`${name} does not set globalThis.TRAINEE_DEFAULTS`);
  for (const f of FLAGS) if (typeof d[f] !== "boolean") throw Error(`${name}: ${f} is not true or false`);
  return JSON.parse(JSON.stringify(d));
}

function fail(msg) {
  console.error("refused: " + msg);
  process.exit(1);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "flags" && a) {
  const d = defaults(fs.readFileSync(a, "utf8"), a);
  console.log(FLAGS.map((f) => `${f}=${d[f]}`).join(" "));
} else if (cmd === "agent" && a && b) {
  const src = fs.readFileSync(a, "utf8");
  const re = /^([ \t]*)agentSubmits:[ \t]*false,[ \t]*$/gm;
  const hits = src.match(re) || [];
  if (hits.length !== 1) fail(`expected exactly one "agentSubmits: false," line in ${a}, found ${hits.length}; the agent variant was not made`);
  const out = src.replace(re, "$1agentSubmits: true,");
  fs.writeFileSync(b, out);
  try {
    const before = defaults(src, a), after = defaults(fs.readFileSync(b, "utf8"), b);
    if (after.agentSubmits !== true) throw Error("agentSubmits is not true after the replacement");
    if (after.personSubmits !== false) throw Error("personSubmits is not false in the agent variant");
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of keys) {
      if (k === "agentSubmits") continue;
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) throw Error(`${k} changed`);
    }
    const x = src.split("\n"), y = out.split("\n");
    const changed = x.length === y.length ? x.filter((l, i) => l !== y[i]).length : -1;
    if (changed !== 1) throw Error(`expected one changed line, found ${changed}`);
  } catch (e) {
    fs.rmSync(b, { force: true });
    fail(e.message);
  }
} else {
  fail("usage: variant.cjs flags <config.js> | variant.cjs agent <src> <dst>");
}
