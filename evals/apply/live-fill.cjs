"use strict";
// WO-042: the extension on the 17 real application pages, filled and never sent. The captured forms (tests/fixtures/
// forms-ci) are opened at their real URLs on the real employer sites; the extension reads, plans and fills each one from
// the complete TEST persona and shows its card. That card is graded against the answer key, and every step is timed.
// What a capture cannot show is measured here: real page loads, the employer's own scripts, react-select option lists,
// and whether the form still exists or has changed since it was captured.
//
// Nothing is ever sent:
// - the person's Approve is never pressed, so the extension never clicks the site's Submit;
// - every request the browser makes that is not a GET, HEAD or OPTIONS is aborted before it leaves (a resume parser's
//   upload, a form post, analytics beacons), on every host but the local TEST stand-ins for Upmore and Supabase;
// - LinkedIn and Indeed are never opened.
// Upmore and Supabase are the local TEST world (sign-in, the person's facts, the record), so no real account is touched.
// The resume is a TEST file.
//
//   node evals/apply/live-fill.cjs [--out evals/apply/results/live-fill.json]
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ROOT = path.join(__dirname, "../..");
const { startWorld, APP_HOST, SUPABASE_HOST } = require(path.join(ROOT, "tests/fixtures/extension/world.cjs"));
const { expectedValue, verdict } = require(path.join(ROOT, "tests/fixtures/extension/grade.cjs"));
const arg = (k, d) => {
  const i = process.argv.indexOf("--" + k);
  return i > 0 ? process.argv[i + 1] : d;
};
const OUT = arg("out", path.join(ROOT, "evals/apply/results/live-fill.json"));
const EXT = path.join(ROOT, "extension");
const KEY = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/extension/answer-key.json"), "utf8"));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/forms-ci/manifest.json"), "utf8"));
const RESUME = { name: "test-person-resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% TEST resume for WO-042, not a real person\n") };
const NEVER = /(^|\.)(linkedin\.com|lnkd\.in|indeed\.com)$/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pw = null;
for (const id of [process.env.UPMORE_PLAYWRIGHT_PATH, "playwright", "/opt/node22/lib/node_modules/playwright"]) {
  if (!id) continue;
  try {
    pw = require(id);
    break;
  } catch { /* next */ }
}

async function main() {
  if (!pw) throw Error("PLAYWRIGHT_UNRESOLVABLE: set UPMORE_PLAYWRIGHT_PATH");
  const persona = JSON.parse(execFileSync(process.env.DENO_BIN || "deno", ["run", "--allow-read", path.join(ROOT, "tests/fixtures/extension/persona.ts")], { encoding: "utf8" }));
  const world = await startWorld();
  for (const [k, v] of Object.entries(persona)) world.answer("fact:" + k, "fact", v);
  // Only Upmore and Supabase go to the local TEST world; every employer page is the real one.
  const rules = [APP_HOST, SUPABASE_HOST].map((h) => `MAP ${h} 127.0.0.1:${world.port}`).join(", ");
  const CHROME = [process.env.UPMORE_EXTENSION_CHROMIUM_PATH, (() => {
    try {
      return pw.chromium.executablePath();
    } catch {
      return null;
    }
  })(), "/opt/pw-browsers/chromium"].find((p) => p && fs.existsSync(p));
  const off = process.env.UPMORE_CHROMIUM_SANDBOX === "off";
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), "trainee-live-"));
  const ctx = await pw.chromium.launchPersistentContext(ud, {
    headless: true, ...(CHROME ? { executablePath: CHROME } : {}), ...(off ? {} : { chromiumSandbox: true }), viewport: { width: 1280, height: 900 },
    // The TEST world's certificate is self-signed; it serves only the two mapped hosts above.
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--host-resolver-rules=${rules}`, "--ignore-certificate-errors", ...(off ? ["--no-sandbox"] : [])],
  });
  const aborted = [];
  // Ashby's job board reads its own form through GraphQL over POST. A read (a GraphQL query) is let through; a mutation
  // (submitting, uploading) never is, nor any other POST anywhere.
  const graphqlRead = (req, u) => {
    if (u.hostname !== "jobs.ashbyhq.com" || !/^\/api\/non-user-graphql$/.test(u.pathname) || req.method() !== "POST") return false;
    try {
      const body = JSON.parse(req.postData() || "{}");
      return [].concat(body).every((b) => typeof b.query === "string" && /^\s*query\b/.test(b.query) && !/\bmutation\b/.test(b.query));
    } catch {
      return false;
    }
  };
  const allowed = [];
  await ctx.route("**/*", (route) => {
    const req = route.request(), u = new URL(req.url());
    const local = u.hostname === APP_HOST || u.hostname === SUPABASE_HOST;
    if (graphqlRead(req, u)) {
      allowed.push({ host: u.hostname, op: u.searchParams.get("op") || "" });
      return route.continue();
    }
    if (NEVER.test(u.hostname) || (!local && !["GET", "HEAD", "OPTIONS"].includes(req.method()))) {
      aborted.push({ method: req.method(), host: u.hostname, path: u.pathname.slice(0, 80) });
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const extHost = new URL(sw.url()).host;
  const cardOf = (id) => sw.evaluate(async (t) => ((await chrome.storage.session.get("cards")).cards || {})[t] || null, id);
  const tabIdOf = (url) => sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u || t.pendingUrl === u)?.id ?? null, url);
  async function openPanel(q) {
    const url = `chrome-extension://${extHost}/panel.html${q}`;
    const waiting = ctx.waitForEvent("page", { predicate: (p) => p.url() === url, timeout: 10000 });
    await sw.evaluate((u) => chrome.windows.create({ url: u, type: "popup", focused: false, width: 440, height: 900 }), url);
    const p = await waiting;
    await p.waitForLoadState("domcontentloaded");
    return p;
  }
  const app = await ctx.newPage();
  await app.goto(`https://${APP_HOST}/`);
  const setup = await openPanel("");
  await setup.click("#use-app");
  await setup.waitForSelector("#page:not([hidden])", { timeout: 10000 });
  await setup.setInputFiles("#resume", RESUME);
  await setup.waitForFunction(() => document.getElementById("resume-name").textContent.includes(".pdf"));
  await setup.close();

  const rows = [];
  for (const f of MANIFEST.forms.filter((x) => x.status === "application" && KEY.forms[x.id])) {
    const r = { form: f.id, family: f.family, url: f.final_url || f.source_url };
    const page = await ctx.newPage();
    try {
      const t0 = Date.now();
      const resp = await page.goto(r.url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => ({ status: () => 0, err: e }));
      r.http_status = resp?.status?.() ?? 0;
      r.final_url = page.url();
      r.ms_goto_dcl = Date.now() - t0;
      await page.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
      r.ms_goto_load = Date.now() - t0;
      const tabId = await tabIdOf(page.url());
      const panel = await openPanel(`?tab=${tabId}`);
      const tFill = Date.now();
      await panel.click("#fill");
      let card = null;
      for (const end = Date.now() + 60000; Date.now() < end;) {
        card = await cardOf(tabId);
        if (card && ["ready", "blocked", "stopped"].includes(card.status) && (card.payload || card.status === "stopped")) break;
        await sleep(50);
      }
      r.ms_fill_click_to_card = Date.now() - tFill;
      r.status = card?.status || "no card";
      r.message = card?.message || null;
      r.timing = card?.timing || null;
      r.blockers = card?.blockers || [];
      r.open_required = card?.openRequired || [];
      if (card?.payload) {
        const fieldsNow = await sw.evaluate(async (id) => {
          const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: id }, func: () => {
            const f = globalThis.TraineeCore.dom.readForm();
            return f.schema.map((s) => ({ ...s, widget: f.bindings[s.name].widget }));
          } });
          return result;
        }, tabId);
        const key = KEY.forms[f.id];
        const byName = Object.fromEntries(card.payload.fields.map((x) => [x.name, x]));
        r.fields = fieldsNow.map((fld) => {
          const spec = key[fld.name];
          let want = "unkeyed";
          if (spec !== undefined) {
            try {
              want = expectedValue(spec, fld, !!fld.widget, persona, RESUME.name);
            } catch (e) {
              want = "unkeyed";
            }
          }
          const got = byName[fld.name];
          return { name: fld.name, label: String(fld.label).slice(0, 100), widget: fld.widget || null, required: !!fld.required, want, got: got ? got.value : null, source: got ? got.source : null, verdict: want === "unkeyed" ? "unkeyed" : verdict(want, got) };
        });
        r.verdicts = r.fields.reduce((a, g) => ((a[g.verdict] = (a[g.verdict] || 0) + 1), a), {});
        r.changed_since_capture = { new_fields: r.fields.filter((x) => x.want === "unkeyed").map((x) => x.label), gone_fields: Object.keys(key).filter((n) => !fieldsNow.some((x) => x.name === n)) };
      }
      // A react-select menu, opened the ways a page script can (untrusted events, as the extension's own): which way
      // opens it, and the employer's own option texts. Read only; Escape closes it again.
      if (f.family === "greenhouse" && r.fields) {
        const targets = r.fields.filter((x) => x.widget).slice(0, 3).map((x) => x.name);
        // Untrusted ways first (what an extension's own events can do), then React's own props read from the page (what
        // a script in the page's main world could call), then one trusted click as the control experiment. Read only:
        // nothing is chosen, Escape closes every menu.
        r.widget_probe = await page.evaluate(async (names) => {
          const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
          const vis = (el) => !!el && el.getClientRects().length > 0;
          const menuNow = () => {
            const o = Array.from(document.querySelectorAll("[class*='select__option'], [class*='-option'], [role='option']")).filter(vis).map((x) => x.textContent.replace(/\s+/g, " ").trim());
            return { options: o.length, first: o.slice(0, 6), menu: !!document.querySelector("[class*='select__menu'], [class*='-menu']") };
          };
          const close = async (inp) => {
            inp?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
            inp?.blur?.();
            await sleep(200);
          };
          const setNative = (el, v) => Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
          const reactKey = (el, pre) => el && Object.keys(el).find((k) => k.startsWith(pre));
          const out = { has_focus: document.hasFocus(), visibility: document.visibilityState, fields: [] };
          for (const name of names) {
            const inp = document.getElementById(name) || document.querySelector(`[name="${CSS.escape(name)}"]`);
            if (!inp) { out.fields.push({ name, found: false }); continue; }
            const control = inp.closest("[class*='select__control']") || inp.closest("[class*='-control']");
            const toggle = control?.querySelector("button[aria-label*='flyout' i], button[aria-label*='toggle' i], button");
            const res = { name, hydrated: !!reactKey(inp, "__reactFiber$") || !!reactKey(inp, "__reactProps$"), toggle_found: !!toggle, ways: {} };
            // React-select's own props, by walking up the fiber from the input: options and whether onChange exists.
            try {
              let fib = inp[reactKey(inp, "__reactFiber$")], hops = 0, found = null;
              while (fib && hops < 40 && !found) {
                const pr = fib.memoizedProps;
                if (pr && Array.isArray(pr.options) && typeof pr.onChange === "function") found = pr;
                fib = fib.return; hops++;
              }
              res.props = found ? { options: found.options.length, first: found.options.slice(0, 6).map((o) => o && (o.label ?? o.value ?? JSON.stringify(o).slice(0, 60))), isMulti: !!found.isMulti, hops } : null;
            } catch (e) { res.props = { error: String(e.message || e).slice(0, 120) }; }
            const ways = {
              focus_then_type: async () => { inp.focus(); res.active_after_focus = document.activeElement === inp; setNative(inp, "a"); inp.dispatchEvent(new Event("input", { bubbles: true })); },
              mousedown_control: async () => { control?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, view: window })); },
              mousedown_toggle: async () => { toggle?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0, view: window })); toggle?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0, view: window })); toggle?.click(); },
              arrowdown_on_input: async () => { inp.focus(); inp.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", keyCode: 40, which: 40, bubbles: true, cancelable: true })); },
            };
            for (const [k, fn] of Object.entries(ways)) {
              await fn();
              await sleep(1200);
              res.ways[k] = menuNow();
              if (k === "focus_then_type") { setNative(inp, ""); inp.dispatchEvent(new Event("input", { bubbles: true })); }
              await close(inp);
            }
            out.fields.push(res);
          }
          return out;
        }, targets).catch((e) => ({ error: String(e.message || e).slice(0, 200) }));
        // The control experiment: one trusted click (Playwright's input, as a person's), menu read, then Escape.
        if (targets[0]) {
          try {
            const ctl = page.locator(`#${targets[0].replace(/([^a-zA-Z0-9_-])/g, "\\$1")}`).locator("xpath=ancestor::*[contains(@class,'select__control')][1]");
            await ctl.click({ timeout: 5000 });
            await page.waitForTimeout(1200);
            r.widget_probe_trusted = await page.evaluate(() => {
              const o = Array.from(document.querySelectorAll("[class*='select__option'], [class*='-option'], [role='option']")).filter((el) => el.getClientRects().length).map((x) => x.textContent.replace(/\s+/g, " ").trim());
              return { options: o.length, first: o.slice(0, 6) };
            });
            await page.keyboard.press("Escape");
          } catch (e) {
            r.widget_probe_trusted = { error: String(e.message || e).slice(0, 200) };
          }
        }
      }
      await panel.close();
    } catch (e) {
      r.status = "error";
      r.message = String(e.message || e).slice(0, 300);
    }
    await page.close().catch(() => {});
    rows.push(r);
    console.log(`${r.form}: HTTP ${r.http_status} ${r.status} load ${r.ms_goto_load}ms fill-to-card ${r.ms_fill_click_to_card}ms ${JSON.stringify(r.verdicts || {})}`);
  }
  await ctx.close().catch(() => {});
  await world.close();

  const by = (fam) => rows.filter((r) => !fam || r.family === fam).flatMap((r) => r.fields || []);
  const agg = (fs_) => {
    const c = (k) => fs_.filter((x) => x.verdict === k).length;
    const filled = c("correct") + c("wrong_value") + c("wrong_filled"), should = c("correct") + c("wrong_value") + c("missed");
    return { correct: c("correct"), wrong: c("wrong_value") + c("wrong_filled"), missed: c("missed"), unkeyed: c("unkeyed"), precision: filled ? c("correct") / filled : null, coverage: should ? c("correct") / should : null,
      widgets: { should: fs_.filter((x) => x.widget && x.want !== null && x.want !== "any" && x.want !== "unkeyed").length, correct: fs_.filter((x) => x.widget && x.verdict === "correct").length } };
  };
  const report = {
    wo: "WO-042", kind: "live fill, never sent", measured_at: new Date().toISOString(), label: "VERIFIED-LIVE (real employer pages from this runner; never submitted)",
    forms: rows.length, reachable: rows.filter((r) => r.http_status === 200).length, carded: rows.filter((r) => ["ready", "blocked"].includes(r.status)).length,
    all: agg(by()), greenhouse: agg(by("greenhouse")), lever: agg(by("lever")), ashby: agg(by("ashby")),
    aborted_requests: aborted.length, aborted_hosts: [...new Set(aborted.map((a) => a.host))],
    allowed_graphql_reads: [...new Set(allowed.map((a) => a.op))],
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ report, rows, aborted: aborted.slice(0, 200) }, null, 1) + "\n");
  console.log(JSON.stringify(report, null, 1));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
