"use strict";
// Controlled LOCAL portal, never an employer endpoint. Real multipart bytes,
// causal task headers and a durable receipt; no success from a click alone.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const PAGE = `<!doctype html><html><body><h1>LOCAL TEST application</h1>
<p class="instructions">Use only confirmed facts. A required unanswered question stops the form.</p>
<form method="post" action="/submit" enctype="multipart/form-data">
<section id="one">
<label>Full name <input id="full_name" name="full_name" required></label>
<label>Email <input id="email" name="email" type="email" required></label>
<label>Resume <input id="resume" name="resume" type="file" required></label>
<label>Will you require sponsorship? <select id="sponsorship" name="sponsorship" required><option value="">Select</option><option>Yes</option><option>No</option></select></label>
<div id="conditional"></div><button id="next" type="button">Next</button></section>
<section id="two" hidden><label><input id="certify" name="certify" type="checkbox" required>I certify this is true</label><button type="submit">Submit application</button></section>
</form><p role="alert" id="errors"></p>
<script>
document.querySelector('#sponsorship').addEventListener('change', e=>{
 const box=document.querySelector('#conditional');
 if(e.target.value==='Yes' && !box.children.length) box.innerHTML='<label>Are you authorized to work in the US? <select id="work_authorization" name="work_authorization" required><option value="">Select</option><option>Yes</option><option>No</option></select></label>';
});
document.querySelector('#next').onclick=()=>{
 if(!Array.from(document.querySelectorAll('#one input,#one select')).every(e=>e.checkValidity())) {document.querySelector('#errors').textContent='Required answers are missing';return;}
 document.querySelector('#one').hidden=true;document.querySelector('#two').hidden=false;
};
</script></body></html>`;
function multipart(buffer, contentType) {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  if (!boundary) throw new Error("multipart boundary missing");
  const fields = {}, files = {};
  for (const part of buffer.toString("latin1").split("--" + (boundary[1] || boundary[2]))) {
    const split = part.indexOf("\r\n\r\n"); if (split < 0) continue;
    const head = part.slice(0, split), name = head.match(/name="([^"]+)"/), filename = head.match(/filename="([^"]*)"/);
    if (!name) continue;
    const bytes = Buffer.from(part.slice(split + 4).replace(/\r\n$/, ""), "latin1");
    if (filename) files[name[1]] = { filename: filename[1], sha256: sha(bytes), bytes: bytes.length };
    else fields[name[1]] = bytes.toString("utf8");
  }
  return { fields, files };
}
function start(root) {
  fs.mkdirSync(root, { recursive: true });
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/form") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(PAGE); return; }
    if (req.method !== "POST" || req.url !== "/submit") { res.writeHead(404); res.end(); return; }
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 1000000) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
    try {
      const taskId = req.headers["x-upmore-task"];
      if (!/^[a-f0-9]{32}$/.test(taskId || "")) throw new Error("task identity missing");
      const parsed = multipart(Buffer.concat(chunks), req.headers["content-type"] || "");
      const resume = parsed.files.resume; if (!resume) throw new Error("real resume bytes missing");
      const payload = { full_name: parsed.fields.full_name, email: parsed.fields.email,
        resume: { filename: resume.filename, sha256: resume.sha256 }, sponsorship: parsed.fields.sponsorship };
      if (parsed.fields.work_authorization) payload.work_authorization = parsed.fields.work_authorization;
      payload.certify = parsed.fields.certify === "on";
      payload.resume_sha256 = resume.sha256;
      const receivedPayloadSha256 = sha(JSON.stringify(payload));
      if (receivedPayloadSha256 !== req.headers["x-upmore-review"] || resume.sha256 !== req.headers["x-upmore-resume"]) throw new Error("posted bytes differ from approved review");
      const dest = "http://localhost:" + server.address().port + "/submit";
      const proof = { source: "controlled_portal_readback", outcome: "accepted", taskId, userId: req.headers["x-upmore-user"],
        destination: dest, payloadSha256: req.headers["x-upmore-review"], resumeSha256: resume.sha256,
        confirmationId: "LOCAL-" + taskId.slice(0, 10), receivedFileBytes: resume.bytes,
        receivedPayloadSha256, receivedResumeSha256: resume.sha256 };
      const receipt = path.join(root, taskId + ".json");
      const fd = fs.openSync(receipt, "wx", 0o600); // a duplicate cannot create a second receipt
      fs.writeFileSync(fd, JSON.stringify(proof)); fs.fsyncSync(fd); fs.closeSync(fd);
      res.writeHead(200, { "Content-Type": "text/html" }); res.end("<h1>Application received</h1><p>Application ID: " + proof.confirmationId + "</p>");
    } catch (_) { res.writeHead(409); res.end("No new receipt confirmed"); }
  });
  server.listen(0, "127.0.0.1", () => { if (process.send) process.send({ port: server.address().port }); });
  return server;
}
if (require.main === module) start(process.argv[2]);
module.exports = { start, multipart };
