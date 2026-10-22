"use strict";
// THE MOCK EMPLOYER — a localhost-only fixture for the chat-to-confirmation E2E.
// It imitates a Greenhouse-shaped application page closely enough for the
// product's own engine (scripts/apply.ts via approve-first / the cloud
// worker) to drive it, and it records EXACTLY what it received so the test
// asserts on the employer's side of the wire, never on the driver's claims.
//
// Pages
//   GET  /jobs/mockco/1          the application form (below)
//   POST /jobs/mockco/1/apply    receives the submission (multipart), then
//                                answers with the confirmation page
//   GET  /received.json          the received-payload log (test-only readback)
//
// Form fields (Greenhouse-shaped names/labels)
//   first_name*  last_name*  email*  phone  resume* (file)
//   gender       EEO select incl. "I don't wish to answer" (the decline)
//   attestation* required checkbox: "I certify that the information I have
//                provided is true and complete." — a required attestation is
//                what makes the doorstep state reachable: with no confirmed
//                answer on file the prepare must stop and ask, not invent one.
//
// Received-payload log: one JSON object per request, appended to the file
// named by MOCK_EMPLOYER_LOG (default: an in-memory array only):
//   { at, method, path, content_type, fields: {name: value}, files:
//     [{name, filename, size, sha256}], user_agent }
// The confirmation page carries a confirmation number derived from the
// received payload's hash, so the test can bind page -> payload -> DB row.
const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");

const FORM = `<!doctype html><html><head><title>MockCo — TEST Data Analyst</title></head><body>
<h1>TEST Data Analyst</h1><h2>MockCo</h2>
<form method="post" action="/jobs/mockco/1/apply" enctype="multipart/form-data">
  <label for="first_name">First Name *</label><input id="first_name" name="first_name" required>
  <label for="last_name">Last Name *</label><input id="last_name" name="last_name" required>
  <label for="email">Email *</label><input id="email" name="email" type="email" required>
  <label for="phone">Phone</label><input id="phone" name="phone" type="tel">
  <label for="resume">Resume/CV *</label><input id="resume" name="resume" type="file" required>
  <label for="gender">Gender</label>
  <select id="gender" name="gender">
    <option value="">Select...</option>
    <option value="female">Female</option>
    <option value="male">Male</option>
    <option value="decline">I don't wish to answer</option>
  </select>
  <label for="attestation"><input id="attestation" name="attestation" type="checkbox" required>
  I certify that the information I have provided is true and complete.</label>
  <button type="submit">Submit application</button>
</form></body></html>`;

function createMockEmployer(logFile) {
  const received = [];
  const record = (entry) => {
    received.push(entry);
    if (logFile) fs.appendFileSync(logFile, JSON.stringify(entry) + "\n");
  };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    const parts = [];
    for await (const c of req) parts.push(c);
    const body = Buffer.concat(parts);
    if (u.pathname === "/received.json") {
      return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(received));
    }
    if (req.method === "GET" && u.pathname === "/jobs/mockco/1") {
      record({ at: new Date().toISOString(), method: "GET", path: u.pathname });
      return res.writeHead(200, { "Content-Type": "text/html" }).end(FORM);
    }
    if (req.method === "POST" && u.pathname === "/jobs/mockco/1/apply") {
      const entry = { at: new Date().toISOString(), method: "POST", path: u.pathname,
        content_type: req.headers["content-type"] || "", fields: {}, files: [] };
      try {
        const data = await new Response(body, { headers: { "content-type": req.headers["content-type"] } }).formData();
        for (const [k, v] of data.entries()) {
          if (typeof v === "string") entry.fields[k] = v;
          else {
            const buf = Buffer.from(await v.arrayBuffer());
            entry.files.push({ name: k, filename: v.name, size: buf.length,
              sha256: crypto.createHash("sha256").update(buf).digest("hex") });
          }
        }
      } catch (e) { entry.parse_error = String(e && e.message || e); }
      entry.received_sha256 = crypto.createHash("sha256")
        .update(JSON.stringify({ f: entry.fields, files: entry.files.map((x) => x.sha256) })).digest("hex");
      record(entry);
      const conf = "MOCK-" + entry.received_sha256.slice(0, 8).toUpperCase();
      return res.writeHead(200, { "Content-Type": "text/html" })
        .end(`<!doctype html><h1>Thank you for applying</h1><p>Your application has been received.</p><p>Confirmation number: ${conf}</p>`);
    }
    return res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
  });
  return { server, received };
}

if (require.main === module) {
  const port = Number(process.env.MOCK_EMPLOYER_PORT || 0);
  const { server } = createMockEmployer(process.env.MOCK_EMPLOYER_LOG || null);
  server.listen(port, "127.0.0.1", () => {
    console.log("MOCK_EMPLOYER http://127.0.0.1:" + server.address().port);
  });
}

module.exports = { createMockEmployer, FORM };
