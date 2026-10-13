// Re-render .html/.png for existing conversation evidence through the CURRENT
// harness renderer, without touching the .messages.json evidence record.
// Used after a renderer fix (FIN-E-001) so every swept render shows the new
// card anatomy. Usage: node scripts/career/rerender.cjs <base-name> [...]
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const H = require("./scenario-harness.cjs");
for (const base of process.argv.slice(2)) {
  const rec = JSON.parse(fs.readFileSync(path.join(H.OUT_DIR, base + ".messages.json"), "utf8"));
  const htmlPath = path.join(H.OUT_DIR, base + ".html");
  fs.writeFileSync(htmlPath, H.renderHtml(rec.scenario, rec.slug, rec.status, rec.messages));
  try { execFileSync("python3", [path.join(__dirname, "shoot.py"), htmlPath, path.join(H.OUT_DIR, base + ".png")], { stdio: "pipe", timeout: 60000 }); console.log(base + ": re-rendered"); }
  catch (e) { console.log(base + ": html re-rendered, screenshot failed: " + String(e).slice(0, 120)); }
}
