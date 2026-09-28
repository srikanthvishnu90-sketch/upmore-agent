// Loads the built Upmore app (index.html at repo root) into a Node vm sandbox.
// Uses the BUILT index.html because build-app.py injects UPMORE_DATA (catalog,
// routes, finance facts) at build time — the template alone has no data.
//
// The sandbox is per-agent: runner creates one app instance per agent so
// localStorage/DOM state never leaks between personas.
//
// Change nothing in the app: this file only READS index.html.
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const { buildContext } = require("./stubs");

const REPO_ROOT = path.join(__dirname, "..", "..", "..");
let cached = null; // { dataBlock, appBlock }

function readBlocks() {
  if (cached) return cached;
  const html = fs.readFileSync(path.join(REPO_ROOT, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (scripts.length < 3) {
    throw new Error(`expected >=3 script blocks in built index.html, got ${scripts.length}`);
  }
  if (!scripts[0].includes("const UPMORE_DATA")) {
    throw new Error("block 0 is not the UPMORE_DATA block — build output changed");
  }
  cached = { dataBlock: scripts[0], appBlock: scripts[2] };
  return cached;
}

// Fresh sandbox per agent. Returns { ctx, call, guide, setLS, getLS }.
function loadApp() {
  const { dataBlock, appBlock } = readBlocks();
  const { sandbox, byId, store } = buildContext();
  const ctx = vm.createContext(sandbox);
  vm.runInContext(dataBlock, ctx, { filename: "upmore-data.js" });
  vm.runInContext(appBlock, ctx, { filename: "upmore-app.js" });

  const call = (expr) => vm.runInContext(expr, ctx);
  const guide = (text) => {
    const r = call(`guideAnswer(${JSON.stringify(String(text))})`);
    if (!r) return { text: "", paras: [], action: null };
    const paras = Array.isArray(r.paras) ? r.paras : [];
    return { text: paras.join("\n\n"), paras, action: r.action || null, card: r.card || null };
  };
  const setLS = (k, v) => call(`localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(String(v))})`);
  const getLS = (k) => call(`localStorage.getItem(${JSON.stringify(k)})`);
  return { ctx, call, guide, setLS, getLS, byId, store };
}

module.exports = { loadApp, readBlocks };
