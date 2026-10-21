"use strict";
// TEST server for tests/career-resume-upload.test.cjs: every captured Greenhouse, Lever and Ashby application form
// (tests/fixtures/forms-ci) on localhost with its scripts removed, plus a TEST stand-in for what the employer's own
// upload widget does when a file is attached. The stand-ins are modeled only on what the live run recorded
// (evals/apply/results/live-fill.json, WO-042 live run, VERIFIED-LIVE, never sent):
//   greenhouse  attaching POSTs the file at once (to Greenhouse's S3 bucket, 5 of 5 forms) and the file input is gone
//               from the form afterwards (5 of 5: "resume" in gone_fields). The file-name line it leaves is a TEST
//               model; the capture is from before any attach.
//   lever       attaching POSTs the file to /parseResume (6 of 6) and the page fills its hidden resumeStorageId
//               (tests/fixtures/forms-ci); the input keeps the file (6 of 6 read back on the card).
//   ashby       attaching sends the GraphQL mutation ApiCreateFileUploadHandle (6 of 6); the input keeps the file (6
//               of 6). The first file input on every Ashby form is "Autofill from resume", not the resume question.
// Every upload the stand-ins make is appended to the JSONL file named on the command line: which input's file went,
// where, its name and the SHA-256 of its bytes. Path /<form id>/remount: the resume input is replaced by a fresh node
// with a new id once a text field is typed (the GH_FILE_REMOUNT shape of portal-fixture-server.cjs, BUG-207).
//   node tests/fixtures/resume-upload-server.cjs <uploads.jsonl>    prints FIXTURE_PORT <port>
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const FORMS = path.join(__dirname, "forms-ci");
const manifest = JSON.parse(fs.readFileSync(path.join(FORMS, "manifest.json"), "utf8"));
const forms = manifest.forms.filter((f) => f.status === "application" && f.html && ["greenhouse", "lever", "ashby"].includes(f.family));
const OUT = process.argv[2];
// The resume's own input on each family's form (tests/fixtures/extension/answer-key.json names it).
const OWN = { greenhouse: "resume", lever: "resume", ashby: "_systemfield_resume" };

const strip = (h) =>
  h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "").replace(/\s(src|srcset)="https?:[^"]*"/gi, "");

function standIn(family, remount) {
  const who = `function who(el) {
    if (el.closest(".ashby-application-form-autofill-input-root")) return "autofill";
    return el.getAttribute("data-test-own") || el.name || el.id || "unnamed";
  }
  function send(el, extra) {
    var f = el.files[0], fd = new FormData();
    fd.append("file", f, f.name);
    return fetch("/__upload?family=${family}&input=" + encodeURIComponent(who(el)) + (extra || ""), { method: "POST", body: fd });
  }`;
  const take = {
    // Greenhouse: the upload starts at once; the input leaves its group, which then shows the file's name.
    greenhouse: `document.addEventListener("change", function (e) {
      var el = e.target, g = el && el.type === "file" && el.closest('[role="group"][aria-labelledby^="upload-label-"]');
      if (!g || !el.files.length) return;
      send(el, "&to=s3");
      var name = el.files[0].name;
      setTimeout(function () {
        var w = g.querySelector(".file-upload__wrapper") || g;
        w.innerHTML = '<div class="file-upload__filename">' + name.replace(/[<>&]/g, "") + '</div><button type="button" aria-label="Remove file">Remove</button>';
      }, 100);
    }, true);`,
    lever: `document.addEventListener("change", function (e) {
      var el = e.target;
      if (!el || el.type !== "file" || !el.files.length) return;
      send(el, "&to=parseResume").then(function () {
        var h = document.querySelector("input[name=resumeStorageId]");
        if (h) h.value = "TEST-STORE-1";
      });
    }, true);`,
    ashby: `document.addEventListener("change", function (e) {
      var el = e.target;
      if (!el || el.type !== "file" || !el.files.length) return;
      fetch("/api/non-user-graphql?op=ApiCreateFileUploadHandle", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ operationName: "ApiCreateFileUploadHandle", variables: { fileName: el.files[0].name } }) })
        .then(function () { return send(el, "&to=handle"); });
    }, true);`,
  }[family];
  const own = OWN[family];
  const re = remount
    ? `(function () {
    var done = false;
    document.addEventListener("input", function (e) {
      if (done || !e.target || e.target.type === "file") return;
      var r = document.getElementById(${JSON.stringify(own)});
      if (!r) return;
      done = true;
      var n = r.cloneNode(false);
      n.id = ${JSON.stringify(own)} + "-file-2";
      n.setAttribute("data-test-own", ${JSON.stringify(own)});
      if (r.labels && r.labels[0]) r.labels[0].htmlFor = n.id;
      r.replaceWith(n);
    }, true);
  })();`
    : "";
  return `<script>/* TEST stand-in for the ${family} upload widget (scripts stripped from the capture). */ (function () { ${who} ${take} })(); ${re}</script>`;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (req.method === "POST") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    if (u.pathname === "/__upload") {
      const fd = await new Response(raw, { headers: { "content-type": req.headers["content-type"] } }).formData();
      const f = fd.get("file");
      const form = new URL(req.headers.referer || "http://localhost/").pathname.split("/")[1];
      const row = { form, family: u.searchParams.get("family"), input: u.searchParams.get("input"), to: u.searchParams.get("to"), name: f.name,
        sha256: crypto.createHash("sha256").update(Buffer.from(await f.arrayBuffer())).digest("hex") };
      fs.appendFileSync(OUT, JSON.stringify(row) + "\n");
    }
    return res.writeHead(200, { "content-type": "application/json" }).end("{}");
  }
  const [, id, variant] = u.pathname.split("/");
  const f = forms.find((x) => x.id === id);
  if (!f) return res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  const html = strip(fs.readFileSync(path.join(FORMS, f.html), "utf8"));
  const extra = standIn(f.family, variant === "remount");
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(/<\/body>/i.test(html) ? html.replace(/<\/body>/i, extra + "</body>") : html + extra);
});
server.listen(0, "127.0.0.1", () => console.log("FIXTURE_PORT " + server.address().port));
