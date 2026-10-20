"use strict";
// WO-086: what goes into the Chrome Web Store zip of extension/, and the checks that refuse a bad one. Used by
// scripts/launch/extension-package.sh (on the staged package) and by tests/extension-package.test.cjs (on extension/ as
// it is in the repository), so the two can never disagree.
//
//   node scripts/launch/extension-package-check.cjs list  <extension dir>   prints the files the package holds
//   node scripts/launch/extension-package-check.cjs check <unzipped dir>    every file there is checked as shipped; exit 1
//                                                                          and say why when a check fails
const fs = require("node:fs");
const path = require("node:path");

const MAX_FILE_BYTES = 1024 * 1024;

// Never in the package: sources the bundle is built from, the build script, docs, tests, source maps, editor and OS litter.
const EXCLUDED = [
  /^src\//,
  /^build\.ts$/,
  /(^|\/)README[^/]*$/i,
  /(^|\/)tests?\//,
  /\.test\.[^/]+$/,
  /\.map$/,
  /(^|\/)\.[^/]+$/, // dotfiles (.DS_Store, .eslintrc, ...)
  /\.(md|ts|tsx)$/,
];

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else if (e.isFile()) out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out.sort();
}

/** The files of `extDir` that go into the store package, relative and sorted. */
function packageFiles(extDir) {
  return walk(extDir).filter((f) => !EXCLUDED.some((re) => re.test(f)));
}

function jwtPayloads(text) {
  const found = [];
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g)) {
    try {
      found.push(JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")));
    } catch { /* not a JWT */ }
  }
  return found;
}

/** Every file the package must hold for the extension to load: named by the manifest, the panel page and the worker. */
function referencedFiles(pkgDir, manifest) {
  const refs = new Set(["manifest.json"]);
  if (manifest.background?.service_worker) refs.add(manifest.background.service_worker);
  for (const cs of manifest.content_scripts || []) for (const f of [...(cs.js || []), ...(cs.css || [])]) refs.add(f);
  if (manifest.side_panel?.default_path) refs.add(manifest.side_panel.default_path);
  if (manifest.action?.default_popup) refs.add(manifest.action.default_popup);
  for (const v of Object.values(manifest.icons || {})) refs.add(v);
  for (const v of Object.values(manifest.action?.default_icon || {})) refs.add(v);
  const read = (f) => (fs.existsSync(path.join(pkgDir, f)) ? fs.readFileSync(path.join(pkgDir, f), "utf8") : "");
  const sw = manifest.background?.service_worker ? read(manifest.background.service_worker) : "";
  for (const m of sw.matchAll(/importScripts\(([^)]*)\)/g)) for (const s of m[1].matchAll(/["']([^"']+)["']/g)) refs.add(s[1]);
  for (const m of sw.matchAll(/files:\s*\[([^\]]*)\]/g)) for (const s of m[1].matchAll(/["']([^"']+)["']/g)) refs.add(s[1]);
  for (const page of [manifest.side_panel?.default_path, manifest.action?.default_popup].filter(Boolean)) {
    for (const m of read(page).matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)) refs.add(m[1]);
  }
  return [...refs];
}

/**
 * The checks. `pkgDir` holds the files (a staged package, or extension/ itself); `files` is what the zip holds.
 * Returns a list of problems; empty means the package may go to the store.
 */
function checkPackage(pkgDir, files) {
  const problems = [];
  const has = new Set(files);
  if (!has.has("manifest.json")) return ["no manifest.json in the package"];
  const manifestText = fs.readFileSync(path.join(pkgDir, "manifest.json"), "utf8");
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (e) {
    return ["manifest.json is not JSON: " + e.message];
  }

  // The manifest: no local development hosts, MV3, a version, a description the store accepts, the icon set.
  if (/localhost|127\.0\.0\.1/i.test(manifestText)) problems.push("manifest.json names localhost or 127.0.0.1 (a development build)");
  if (manifest.manifest_version !== 3) problems.push("manifest_version is not 3");
  if (!/^\d+(\.\d+){0,3}$/.test(String(manifest.version || ""))) problems.push("manifest version is missing or not dotted numbers");
  if (typeof manifest.description !== "string" || !manifest.description || manifest.description.length > 132) {
    problems.push("manifest description is missing or over 132 characters");
  }
  for (const size of ["16", "32", "48", "128"]) {
    if (!manifest.icons?.[size]) problems.push(`manifest has no ${size}px icon`);
  }
  if (!manifest.action?.default_icon) problems.push("manifest action has no default_icon");
  // Remote code: the extension's pages run only their own scripts, and nothing is exposed to web pages.
  const csp = manifest.content_security_policy?.extension_pages || "";
  if (/https?:|\*|unsafe-eval|unsafe-inline/.test(csp)) problems.push("content_security_policy allows remote or inline code: " + csp);
  if (manifest.web_accessible_resources) problems.push("web_accessible_resources is set: nothing in this extension is for web pages");
  if (manifest.externally_connectable) problems.push("externally_connectable is set: no web page may message the extension");
  const cs = (manifest.content_scripts || []).flatMap((c) => c.matches || []);
  if (cs.some((m) => /linkedin|indeed|<all_urls>|^\*:\/\/\*\//i.test(m))) problems.push("a content script runs beyond the application forms (or on LinkedIn/Indeed)");

  // Every file it names is in the package.
  for (const f of referencedFiles(pkgDir, manifest)) {
    if (!has.has(f)) problems.push(`${f} is referenced but not in the package`);
  }

  for (const f of files) {
    const abs = path.join(pkgDir, f);
    const size = fs.statSync(abs).size;
    if (size > MAX_FILE_BYTES) problems.push(`${f} is ${size} bytes (over 1 MB)`);
    if (/\.json$/i.test(f) && f !== "manifest.json") problems.push(`${f}: no JSON file other than manifest.json ships (fixtures stay out)`);
    if (EXCLUDED.some((re) => re.test(f))) problems.push(`${f} must not ship (sources, build script, docs, tests, source maps)`);
    if (!/\.(js|cjs|mjs|html|css|json|txt|svg)$/i.test(f)) continue;
    const text = fs.readFileSync(abs, "utf8");
    if (/service_role/.test(text)) problems.push(`${f} contains "service_role"`);
    for (const claims of jwtPayloads(text)) {
      if (claims.role && claims.role !== "anon") problems.push(`${f} holds a JWT with role "${claims.role}" (only the public anon key may ship)`);
    }
    if (/sourceMappingURL=/.test(text)) problems.push(`${f} points at a source map`);
    if (/grant_type=password/.test(text)) problems.push(`${f} signs in with a password grant`);
    if (/\.(js|cjs|mjs)$/i.test(f) && /\beval\s*\(|\bnew\s+Function\s*\(/.test(text)) problems.push(`${f} evaluates strings as code`);
    if (/\.html$/i.test(f) && /<script\b[^>]*\bsrc=["']?(https?:)?\/\//i.test(text)) problems.push(`${f} loads a remote script`);
  }
  return problems;
}

module.exports = { walk, packageFiles, checkPackage, referencedFiles, MAX_FILE_BYTES };

if (require.main === module) {
  const [cmd, dir] = process.argv.slice(2);
  if (!dir || !["list", "check"].includes(cmd)) {
    console.error("usage: extension-package-check.cjs list|check <dir>");
    process.exit(2);
  }
  if (cmd === "list") {
    for (const f of packageFiles(dir)) console.log(f);
  } else {
    const problems = checkPackage(dir, walk(dir));
    for (const p of problems) console.error("REFUSED: " + p);
    if (problems.length) process.exit(1);
    console.log("package checks: OK");
  }
}
