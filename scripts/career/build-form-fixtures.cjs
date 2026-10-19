// WO-009b-2 fixtures: turn a render-form.cjs output directory into tests/fixtures/forms-ci: one manifest entry per
// source (what the live page held, its bot check, and whether it is an application), and for each application the
// rendered HTML with <script> and <style> bodies removed (the form markup is what the fill harness needs).
//   node scripts/career/build-form-fixtures.cjs <rendered-dir> <sources.json> <out-dir> <provenance note>
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const BOT_CHECKS = [["recaptcha_enterprise", "recaptcha/enterprise"], ["hcaptcha", "hcaptcha"], ["datadome", "captcha-delivery.com"], ["turnstile", "turnstile"]];
const strip = (html) => html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, "$1$2").replace(/(<style\b[^>]*>)[\s\S]*?(<\/style>)/gi, "$1$2");

function build(renderedDir, sources, outDir, note) {
  fs.mkdirSync(outDir, { recursive: true });
  const forms = sources.map((s) => {
    const d = JSON.parse(fs.readFileSync(path.join(renderedDir, s.id + ".rendered.json"), "utf8"));
    const htmlFile = path.join(renderedDir, s.id + ".rendered.html");
    const html = fs.existsSync(htmlFile) ? fs.readFileSync(htmlFile, "utf8") : "";
    const required = (d.fields || []).filter((f) => f.required);
    const application = d.resume_inputs > 0 && required.length > 0;
    const e = { id: s.id, family: s.family, company: s.company, source_url: d.source_url, final_url: d.final_url, http_status: d.http_status,
      rendered_at: d.rendered_at, status: application ? "application" : d.http_status === 403 ? "blocked_403" : "no_application",
      forms: d.forms, resume_inputs: d.resume_inputs, required: required.map((f) => ({ name: f.name, label: f.label, type: f.type })),
      fields: (d.fields || []).length, bot_check: BOT_CHECKS.filter(([, p]) => html.includes(p)).map(([k]) => k) };
    if (application) {
      const out = strip(html);
      fs.writeFileSync(path.join(outDir, s.id + ".html"), out);
      e.html = s.id + ".html";
      e.html_sha256 = crypto.createHash("sha256").update(out).digest("hex");
    }
    return e;
  });
  const manifest = { version: 1, captured_in: note, note: "Rendered application pages with <script> and <style> bodies removed; the summary is what the live page held before stripping.", forms };
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
  return manifest;
}

if (require.main === module) {
  const [renderedDir, sourcesFile, outDir, note = "CI form capture"] = process.argv.slice(2);
  const m = build(renderedDir, JSON.parse(fs.readFileSync(sourcesFile, "utf8")), outDir, note);
  const tally = {};
  for (const f of m.forms) tally[`${f.family}:${f.status}`] = (tally[`${f.family}:${f.status}`] || 0) + 1;
  console.log("FIXTURES " + JSON.stringify(tally));
}
module.exports = { build, strip };
