"use strict";
// TESTS ONLY: captured Veeva Lever card-cloud acceptance, synthetic facts and loopback HTTP only.
// Uses actual prepare -> runCloudJob -> cloudEngineRunner -> sandboxed browser. No provider or DB.
// Positive and mutation controls are existing behavior; rehashed-company acceptance is NOT_VERIFIED
// until this real-browser suite can run. The local DRIVER_ERROR is retained, not scored as a bug.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const dir = path.join(__dirname, "fixtures/forms-ci");
const FORM = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")).forms
  .find((f) => f.id === "lever-veeva-9ac55b31-df46-4acb-b305-2c0b7ed56027");
const strip = (h) =>
  h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "")
    .replace(/\s(src|srcset)="https?:[^"]*"/gi, "");
// The stand-in for Lever's submit script: the button posts its form (to the page's own URL, as Lever's does).
const SUBMIT = `<script>document.getElementById("btn-submit").addEventListener("click",()=>document.getElementById("application-form").requestSubmit())</script>`;
const PAGE = strip(fs.readFileSync(path.join(dir, FORM.html), "utf8")).replace(/<\/body>/i, SUBMIT + "</body>");

// The captured form's questions, by the names Lever gives them.
const SPONS = "cards[651d37ec-0ef2-40dc-9bf5-6f5973ab81c0][field0]"; // Do you now, or in the future require sponsorship?
const AUTH = "cards[651d37ec-0ef2-40dc-9bf5-6f5973ab81c0][field1]"; // ... the unrestricted right to work in the United States?
const ACK = "cards[f7ecb5fe-3e81-46f9-9b63-f1a6b71d53c3][field0]"; // I understand that next steps will be sent via email ...
const ACK_VALUE = "I understand that next steps will be sent via email and I have marked the sender address above as safe.";

const OWNER = "TEST-lever-owner";
const own = (factId, value, extra = {}) =>
  ({ value, factId, confirmed: true, provenance: "owner stated in chat (TEST)", confirmation_event_id: "evt-" + factId, ...extra });
// A clean, owner-stated fact set that answers every required question on this form.
function cleanFacts() {
  return {
    user_id: OWNER,
    answers: {
      full_name: own("TEST-F-1", "Synthetic Tester"),
      email: own("TEST-F-2", "synthetic.tester@example.test"),
      sponsorship: own("TEST-F-3", "No"),
      work_authorization: own("TEST-F-4", "Yes"),
    },
    // The acknowledgement is answered by the owner himself (an attestation goes only on his own answer to it).
    saved: { [ACK_VALUE.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()]: own("TEST-F-5", "Yes", { authorizes: true }) },
  };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-cloud-lever-"));
const requests = [];
let server, base;
before(async () => {
  assert.ok(FORM && PAGE.includes(ACK_VALUE), "the captured Veeva Lever form and its acknowledgement question");
  server = http.createServer(async (req, res) => {
    const parts = [];
    for await (const c of req) parts.push(c);
    const u = new URL(req.url, "http://x");
    const r = { method: req.method, path: u.pathname };
    requests.push(r);
    if (req.method === "POST") {
      const data = await new Response(Buffer.concat(parts), { headers: { "content-type": req.headers["content-type"] } }).formData();
      r.entries = [...data.entries()].map(([k, v]) => [k, typeof v === "string" ? v : { file: v.name, size: v.size }]);
      return res.writeHead(200, { "Content-Type": "text/html" }).end("<h1>Thank you for applying</h1><p>Application submitted. Confirmation TEST-LEVER-1.</p>");
    }
    if (!/^\/veeva-[a-z0-9-]+\/9ac55b31-df46-4acb-b305-2c0b7ed56027\/apply$/.test(u.pathname)) return res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": "text/html" }).end(PAGE);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(root, { recursive: true, force: true });
});
const urlFor = (tag) => `${base}/veeva-${tag}/9ac55b31-df46-4acb-b305-2c0b7ed56027/apply`;


// Real captured form, actual dry run, actual worker and sandboxed engine. Loopback employer only.
// The cloud card binding here is synthetic queue metadata, not proof that any DB RPC approved it.
function drive(mutation) {
  const run = fs.mkdtempSync(path.join(root, "bridge-"));
  const repo = path.resolve(__dirname, "..");
  const driver = path.join(run, "driver.ts");
  fs.writeFileSync(driver, `
import { prepare } from ${JSON.stringify("file://"+repo+"/workers/career-browser/approve-first.ts")};
import { cloudEngineRunner, runCloudJob } from ${JSON.stringify("file://"+repo+"/workers/career-cloud/worker.ts")};
import { hashApplyPayload } from ${JSON.stringify("file://"+repo+"/supabase/functions/_shared/career_apply_store.ts")};
const dir=${JSON.stringify(run)},mutation=${JSON.stringify(mutation)},url=${JSON.stringify(urlFor("bridge-"+mutation))};
const resume=dir+"/resume.pdf",facts=dir+"/facts.json";
await Deno.writeTextFile(resume,"%PDF-1.4 SYNTHETIC TEST RESUME");
await Deno.writeTextFile(facts,JSON.stringify(${JSON.stringify(cleanFacts())}));
const bytes=await Deno.readFile(resume),engine=cloudEngineRunner({root:${JSON.stringify(repo)},evidenceRoot:dir+"/evidence"});
await Deno.mkdir(dir+"/evidence",{mode:0o700});
const p=await prepare({url,factsPath:facts,resumePath:resume,account:{epoch:1,version:1},now:Date.now(),runEngine:engine});
if(!p.ready){let details=null;try{details=JSON.parse(await Deno.readTextFile(p.result.evidence_path+"/evidence.json"));}catch{}console.log("BRIDGE_RESULT "+JSON.stringify({prepared:false,result:p.result,details}));Deno.exit(0);}
const approvedHash=p.hash,originalCompany=p.payload.company,engineApproval=p.payload.engine_approval;
if(mutation==="answer")p.payload.fields.find(f=>f.name==="email").value="changed@example.test";
if(mutation==="resume")p.payload.resume_sha256="b".repeat(64);
if(mutation==="destination")p.payload.destination=url+"?changed-destination";
if(mutation==="company")p.payload.company="Changed Employer After Tap";
const queueHash=await hashApplyPayload(p.payload);
const job={id:"TEST-BRIDGE-JOB",lease_token:"TEST-BRIDGE-LEASE",user_id:${JSON.stringify(OWNER)},company:p.payload.company,url,payload:p.payload,payload_hash:queueHash,approval_hash:queueHash,execution_mode:"cloud",card_id:"TEST-CARD",card_hash:"c".repeat(64),approval_id:"TEST-APPROVAL"};
let final,engineCalls=0;const argsSeen=[];
const queue={claim:async()=>[],gatePresent:async()=>true,authorize:async j=>{if(j.id!==job.id||j.lease_token!==job.lease_token)throw Error("CARD_CLOUD_LEASE_MISMATCH");if(await hashApplyPayload(j.payload)!==approvedHash)throw Error("APPROVED_APPLICATION_CHANGED");},resume:async()=>({filename:"resume.pdf",sha256:"overridden-by-owned-byte-digest",b64:btoa(String.fromCharCode(...bytes))}),ask:async()=>{throw Error("unexpected question");},finish:async(j,state,evidence,outcome)=>{final={state,evidence,outcome};}};
// The stored resume's hash is independent from the possibly edited payload.
const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(n=>n.toString(16).padStart(2,"0")).join("");
queue.resume=async()=>({filename:"resume.pdf",sha256:digest,b64:btoa(String.fromCharCode(...bytes))});
const tmpRoot=dir+"/tmp";await Deno.mkdir(tmpRoot);
await runCloudJob(job,{queue,tmpRoot,log:()=>{},runEngine:async(...args)=>{engineCalls++;argsSeen.push(args[0]);return await engine(...args);}});
console.log("BRIDGE_RESULT "+JSON.stringify({prepared:true,fields:p.payload.fields,pageNames:p.payload.page_field_names,approvedHash,currentHash:await hashApplyPayload(p.payload),originalCompany,engineApproval,engineCalls,argsSeen,final,left:[...Deno.readDirSync(tmpRoot)].length}));
`);
  return new Promise(resolve => {
    const child=spawn(process.env.DENO_BIN||"deno",["run","-A","--no-check",driver],{env:{...process.env,HOME:run},stdio:["ignore","pipe","pipe"]});
    let out="",err="";child.stdout.on("data",b=>out+=b);child.stderr.on("data",b=>err+=b);
    const timer=setTimeout(()=>child.kill("SIGKILL"),180000);
    child.on("exit",()=>{clearTimeout(timer);const line=out.split("\n").find(l=>l.startsWith("BRIDGE_RESULT "));resolve({out,err,done:line?JSON.parse(line.slice(14)):null});});
  });
}
function prepared(r){assert.ok(r.done,r.out+r.err);assert.equal(r.done.prepared,true,"fixture/browser unavailable; not a product regression: "+JSON.stringify(r.done));}
const posts=from=>requests.slice(from).filter(q=>q.method==="POST");
test("CONTROL captured Veeva: exact approved answers and resume produce one local POST with exact He",async()=>{
 const from=requests.length,r=await drive("clean");prepared(r);
 assert.equal(r.done.engineCalls,1);assert.equal(posts(from).length,1);assert.equal(r.done.final.outcome,"submitted");assert.equal(r.done.left,0);
 const args=r.done.argsSeen[0];assert.ok(args.includes("--submit"));assert.equal(args[args.indexOf("--approved")+1],r.done.engineApproval);
 const got=Object.fromEntries(posts(from)[0].entries.filter(([k,v])=>v!==""&&!r.done.pageNames.includes(k)));
 assert.equal(got.email,"synthetic.tester@example.test");assert.equal(got.name,"Synthetic Tester");assert.equal(got[SPONS],"No");assert.equal(got[AUTH],"Yes");assert.equal(got[ACK],ACK_VALUE);assert.equal(got.resume.size,30);
});
for(const [kind,reason]of [["answer","APPROVED_APPLICATION_CHANGED"],["resume","APPROVED_MANIFEST_CHANGED"],["destination","APPROVED_APPLICATION_CHANGED"]])test("CONTROL captured Veeva: post-tap "+kind+" mutation refuses without engine or local POST",async()=>{
 const from=requests.length,r=await drive(kind);prepared(r);assert.equal(r.done.engineCalls,0);assert.equal(posts(from).length,0);assert.equal(r.done.final.evidence.reason,reason);assert.equal(r.done.left,0);
});
test("ACCEPTANCE captured Veeva (browser verdict pending): rehashed company/Hq must not run the unchanged approved engine He",async()=>{
 const from=requests.length,r=await drive("company");prepared(r);assert.notEqual(r.done.currentHash,r.done.approvedHash);assert.equal(r.done.engineCalls,0,JSON.stringify(r.done));assert.equal(posts(from).length,0);assert.equal(r.done.final.evidence.reason,"APPROVED_APPLICATION_CHANGED");
});
