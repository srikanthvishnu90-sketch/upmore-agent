"use strict";
/* measure-proxy-e.cjs — M3 validation of the full operator chain:
   Chromium (env proxy -> local relay -> upstream egress proxy) +
   the chromium wrapper (--ignore-certificate-errors for the host's
   TLS-interception CA). Expectation: the Greenhouse posting loads.
   Read-only page load; nothing filled. */
const pw = require("/home/hatch/workspace/sporve-agent-clone/node_modules/playwright");
const URL = "https://job-boards.greenhouse.io/gusto/jobs/8257115";
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
(async () => {
  const a = Date.now();
  try {
    const browser = await pw.chromium.launch({ headless: true, executablePath: "/home/hatch/worker-config/chromium-egress-wrapper.sh", args: ["--no-sandbox"] });
    const page = await (await browser.newContext()).newPage();
    const res = await page.goto(URL, { timeout: 30000, waitUntil: "domcontentloaded" });
    const title = await page.title();
    const hasForm = await page.evaluate(() => !!document.querySelector("form, #application_form, [id*=application]"));
    console.log(JSON.stringify({ ok: true, status: res && res.status(), title: title.slice(0, 80), hasForm, ms: Date.now() - a }));
    await browser.close();
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: String(e.message).split("\n")[0].slice(0, 160), ms: Date.now() - a }));
  }
  process.exit(0);
})();
