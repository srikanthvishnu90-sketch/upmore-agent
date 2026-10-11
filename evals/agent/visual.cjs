// Testing agent, design family, on demand (D-06): the signed-out screens rendered in real Chromium.
//   1. Pixel regression: each screen on a phone (iPhone, 390x844) and on desktop (1280x800, the framed preview) is compared with its committed baseline
//      in evals/agent/visual-baseline/; more than 0.5% of pixels changed is a FAIL. --update rewrites the baselines.
//   2. Layout: no line of copy is cut off by its box or covered by a button or field.
//   3. Dead controls: every visible button, link and role=button on each screen must have a click handler on itself or an
//      ancestor below <body> (read through the DevTools protocol, so handlers added in JS count), an inline onclick, a
//      real href, or a form to submit. A control with none of these does nothing when tapped.
// Network is cut (only the local file loads), so fonts fall back and the run is the same offline every time; it does not
// gate CI because fonts and anti-aliasing still differ between machines. Signed-in screens need a live login: not run.
//   node evals/agent/visual.cjs [--update]
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
let chromium;
for (const id of ["playwright", process.env.PLAYWRIGHT_MODULE, "/opt/node-tools/node_modules/playwright", () => execSync("npm root -g").toString().trim() + "/playwright"]) {
  try { if (id) { ({ chromium } = require(typeof id === "function" ? id() : id)); break; } } catch { /* next */ }
}
if (!chromium) { console.log("visual: NOT RUN (Playwright not found: set PLAYWRIGHT_MODULE)"); process.exit(2); }

const ROOT = path.resolve(__dirname, "../.."), BASE = path.join(__dirname, "visual-baseline");
const SCREENS = ["splash", "login", "welcome", "time", "about", "situation", "plan", "phone", "tos"];
// The app draws a phone frame unless the browser is a phone, so the phone run is a real phone profile (user agent, touch).
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const VIEWPORTS = { phone: { viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA, isMobile: true, hasTouch: true }, desktop: { viewport: { width: 1280, height: 800 } } };
const UPDATE = process.argv.includes("--update"), TOLERANCE = 0.005;

(async () => {
  // Playwright finds the browser through PLAYWRIGHT_BROWSERS_PATH where one is installed.
  const browser = await chromium.launch();
  const results = []; let checked = 0;
  fs.mkdirSync(BASE, { recursive: true });
  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    const page = await browser.newPage(Object.assign({ deviceScaleFactor: 1 }, size));
    await page.route("**/*", r => r.request().url().startsWith("file:") ? r.continue() : r.abort());
    const cdp = await page.context().newCDPSession(page);
    for (const id of SCREENS) {
      // Each screen is opened the way the app opens it: its own start-up router reads the hash and calls show(id). The
      // splash advances to welcome on a timer, so every shot is taken well before that timer.
      await page.goto("file://" + path.join(ROOT, "index.html") + "?noanim" + (id === "splash" ? "" : "#" + id));
      await page.waitForTimeout(300);
      const only = await page.evaluate(id => [...document.querySelectorAll(".screen.on")].map(s => s.id).join(",") === id, id);
      if (!only) { results.push({ id: `${vp}:${id}`, status: "FAIL", why: "another screen took over while it was shown (a start-up race)" }); continue; }
      // Clipped or covered text: a line of copy cut off by its box, or drawn under a button or field. The text's own
      // rectangle is measured (a box can be squeezed smaller than its text, which then spills under the next control).
      // Copy inside a container that scrolls is reachable, so passing under a pinned footer there is not a defect.
      const covered = await page.evaluate(id => {
        const s = document.getElementById(id), out = [];
        const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity > 0; };
        const scrolls = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 2) return true; } return false; };
        const texts = [...s.querySelectorAll("h1, h2, h3, p, label, li")].filter(e => vis(e) && e.innerText.trim() && !e.querySelector("button, input, select, textarea"));
        const controls = [...s.querySelectorAll("button, input, select, textarea, a.btn, [role=button]")].filter(vis);
        for (const t of texts) {
          const name = t.innerText.trim().slice(0, 50), box = t.getBoundingClientRect();
          const rg = document.createRange(); rg.selectNodeContents(t); const a = rg.getBoundingClientRect();
          const cs = getComputedStyle(t);
          if (cs.overflow !== "visible" && cs.textOverflow !== "ellipsis" && a.bottom > box.bottom + 2) { out.push(`"${name}" is cut off by its box`); continue; }
          if (scrolls(t)) continue;
          for (const c of controls) { if (c.contains(t) || t.contains(c)) continue; const b = c.getBoundingClientRect(); const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (x > 4 && y > 4) { out.push(`"${name}" runs under "${(c.innerText || c.placeholder || c.getAttribute("aria-label") || c.tagName).trim().slice(0, 30)}"`); break; } }
        }
        return out;
      }, id);
      for (const w of covered) results.push({ id: `layout:${vp}:${id}`, status: "FAIL", why: w });
      const shot = await page.screenshot();
      const file = path.join(BASE, `${vp}-${id}.png`);
      if (UPDATE || !fs.existsSync(file)) { fs.writeFileSync(file, shot); results.push({ id: `${vp}:${id}`, status: "BASELINE", why: "written" }); }
      else {
        const diff = await page.evaluate(async ([a, b]) => {
          const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
          const [x, y] = await Promise.all([load(a), load(b)]);
          if (x.width !== y.width || x.height !== y.height) return 1;
          const px = img => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
          const p = px(x), q = px(y); let n = 0;
          for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 24) n++;
          return n / (p.length / 4);
        }, ["data:image/png;base64," + fs.readFileSync(file).toString("base64"), "data:image/png;base64," + shot.toString("base64")]);
        results.push({ id: `${vp}:${id}`, status: diff <= TOLERANCE ? "PASS" : "FAIL", why: `${(diff * 100).toFixed(2)}% of pixels changed` });
      }
      if (vp !== "phone") continue;
      // Dead controls, once per screen.
      const count = await page.evaluate(id => { const s = document.getElementById(id); window.__ctl = [...s.querySelectorAll("button, a, [role=button]")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; }); return window.__ctl.length; }, id);
      checked += count;
      for (let i = 0; i < count; i++) {
        const info = await page.evaluate(i => { const e = window.__ctl[i]; const href = e.getAttribute("href"); return { label: (e.innerText || e.getAttribute("aria-label") || e.id || e.tagName).trim().slice(0, 40), inline: !!e.getAttribute("onclick"), href: !!href && href !== "#" && !/^javascript:/i.test(href), form: e.tagName === "BUTTON" && !!e.form && (e.type || "submit") === "submit" }; }, i);
        let alive = info.inline || info.href || info.form;
        for (let depth = 0; !alive && depth < 12; depth++) {
          const { result } = await cdp.send("Runtime.evaluate", { expression: `(() => { let e = window.__ctl[${i}]; for (let k = 0; k < ${depth}; k++) e = e && e.parentElement; return e && e !== document.body ? e : null; })()` });
          if (!result.objectId) break;
          const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
          if (listeners.some(l => ["click", "pointerup", "pointerdown", "touchend", "mouseup", "keydown"].includes(l.type))) alive = true;
        }
        if (!alive) results.push({ id: `dead:${id}:${i}`, status: "FAIL", why: `"${info.label}" has no handler, href or form` });
      }
    }
    await page.close();
  }
  await browser.close();
  const bad = results.filter(r => r.status === "FAIL");
  for (const r of results.filter(r => r.status !== "PASS")) console.log(`  ${r.status} ${r.id}: ${r.why}`);
  console.log(`visual: ${bad.length ? "RED" : "GREEN"}; ${results.filter(r => r.status === "PASS").length} screens match, ${results.filter(r => r.status === "BASELINE").length} baselines written, ${bad.length} failures; ${checked} visible controls checked, ${bad.filter(r => r.id.startsWith("dead:")).length} dead`);
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error("visual: NOT RUN:", e.message); process.exit(2); });
