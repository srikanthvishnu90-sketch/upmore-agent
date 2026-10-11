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
let cached = null; // { dataBlock, appBlock, preludeBlocks }

function readBlocks(html) {
  const fromFile = html === undefined;
  if (fromFile && cached) return cached;
  if (fromFile) html = fs.readFileSync(path.join(REPO_ROOT, "index.html"), "utf8");
  // Match semantic roles, never fixed positions. External scripts and the
  // bundled Supabase SDK stay unexecuted; buildContext supplies its stub.
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(m => !/\bsrc\s*=/i.test(m[1])).map(m => m[2]);
  const unique = (label, pattern) => {
    const matches = scripts.filter(block => pattern.test(block));
    if (matches.length !== 1) throw Error(`expected unique ${label} script block, got ${matches.length}`);
    return matches[0];
  };
  const dataBlock = unique('data', /\bconst\s+UPMORE_DATA\s*=/);
  const appBlock = unique('app', /\bfunction\s+guideAnswer\s*\(/);
  if (dataBlock === appBlock) throw Error('data and app must be separate script blocks');
  const preludeBlocks = [];
  for (const name of ['UpmoreLedgerReview','UpmoreBillWorkflow','UpmoreChatRequests']) {
    const matches = scripts.filter(block => new RegExp('globalThis\\.' + name + '\\s*=\\s*function\\b').test(block));
    if (matches.length > 1) throw Error(`expected unique ${name} prelude, got ${matches.length}`);
    if (matches.length) preludeBlocks.push(matches[0]);
  }
  const selected = {dataBlock,appBlock,preludeBlocks};
  if (fromFile) cached = selected;
  return selected;
}

// Fresh sandbox per agent. Returns { ctx, call, guide, setLS, getLS }.
function loadApp() {
  const { dataBlock, appBlock, preludeBlocks } = readBlocks();
  const { sandbox, byId, store } = buildContext();
  const ctx = vm.createContext(sandbox);
  vm.runInContext(dataBlock, ctx, { filename: "upmore-data.js" });
  preludeBlocks.forEach((block,index) => vm.runInContext(block,ctx,{filename:`upmore-controller-${index}.js`}));
  vm.runInContext(appBlock, ctx, { filename: "upmore-app.js" });

  const call = (expr) => vm.runInContext(expr, ctx);
  const guide = (text) => {
    const r = call(`guideAnswer(${JSON.stringify(String(text))})`);
    if (!r) return { text: "", paras: [], action: null };
    const paras = Array.isArray(r.paras) ? r.paras : [];
    return { text: paras.join("\n\n"), paras, action: r.action || null, card: r.card || null };
  };
  // Synthetic inputs enter the active test owner's/guest's namespace. Raw
  // unscoped private keys are deliberately quarantined by the actual app.
  const setLS = (k, v) => call(`financeStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(String(v))})`);
  const getLS = (k) => call(`financeStorage.getItem(${JSON.stringify(k)})`);
  return { ctx, call, guide, setLS, getLS, byId, store };
}

module.exports = { loadApp, readBlocks };
