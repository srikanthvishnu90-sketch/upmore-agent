// Launch readiness B7 (2026-10-26): the Trainee web app, end to end in a real Chromium, against the production agent-chat
// career handler (handler-career.ts handleChat, unchanged) on the flow harness's real Postgres (CI's migration order,
// Supabase-parity grants and row security), with sign-up closed as production has it (20261026230000, startPg gate invite).
//
//   1. the built app (site/app/index.html, what the Vercel project "trainee" serves at /app) opens on sign in, at phone
//      and desktop widths: no horizontal scroll, every control labelled, text contrast at least 4.5:1, focus visible
//   2. a person not invited signs in with a texted code and is told their spot hasn't opened: no admission, no turn; their
//      own session calling career_apply_prepare_own / career_apply_card_open_own / career_apply_card_answer_own directly
//      makes no row (the database refuses them); an invite link they hold is redeemed only through FEATURE WAVES
//   3. a person whose confirmed phone is on TRAINEE_ALLOWED_CONTACTS signs in by keyboard alone: admitted via the allow-list
//   4. their first chat turn (agent_messages rows, in their own thread)
//   5. "Add resume": a PDF is sent whole (bytes and sha256) and the server's answer shown (FEATURE 16 reads it; without it
//      the page says the file could not be read and nothing is saved); then the .txt, and "yes": every entry confirmed
//   6. a posting link queued; the worker's prepare (prepare-ahead.ts) asks only what is unknown; answered in the web chat
//   7. "show my applications": the card renders under the reply with every exact answer; the Applications tab shows the
//      same open card
//   8. their tap on Approve (a double tap answers once): career_apply_jobs queued, bound to the hash the card showed
//   9. a reload resumes the thread with its history; the answered card says so
//  10. loading and error states: a slow turn shows "Trainee is writing…"; a dropped reply keeps the message with Try again,
//      and the retry carries the same turn key; another person reads nothing of theirs
//
// The seams, disclosed: Supabase's HTTP (the PostgREST double over the real database, tests/flow/postgrest.ts, behind a
// local server the browser calls cross-origin, as it calls the Supabase project) and Supabase Auth's two code endpoints
// (/auth/v1/otp and /auth/v1/verify: the code is read from this test instead of a text message; verify creates the
// auth.users row with the confirmed phone, as Supabase Auth does). Ashby's posting API and form are local copies, as in
// flow-e2e-chat-submit.test.ts. Any other outbound request fails the test. Screenshots: WEB_SHOTS_DIR, else a temp dir.
import assertNode from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { pgBinDir, startPg } from "../flow/pg.ts";
import { postgrestDouble } from "../flow/postgrest.ts";
import { ANON_KEY, SERVICE_KEY, SUPABASE_URL, supabaseParity } from "../flow/handler.ts";
import { engineRunner } from "../../workers/career-browser/approve-first.ts";
import { prepareAhead, storedProfile, tailoredResume } from "../../workers/career-browser/prepare-ahead.ts";
import { edgeRenderer, memoryResumeStore, type ResumeStore } from "../../supabase/functions/_shared/career_tailor.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const assertEquals = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const CI = Deno.env.get("CI") === "true";
function browserEnv(): boolean {
  if (Deno.env.get("UPMORE_PLAYWRIGHT_PATH")) return true;
  try { Deno.statSync(`${ROOT}/tools/node_modules/playwright`); Deno.env.set("UPMORE_PLAYWRIGHT_PATH", `${ROOT}/tools/node_modules/playwright`); return true; }
  catch { return false; }
}
const RESUME_PATH = `${ROOT}/packages/career-data/fixtures/test-resume.txt`;
const CAPTURED = `${ROOT}/tests/fixtures/forms-ci/ashby-crusoe-b1b99030-d393-4329-80fe-5bc2e4c93b03.html`;
const JOB_UUID = "a13ae586-f4cb-4385-8822-c42b9b54ed74";
const LINK = `https://jobs.ashbyhq.com/ramp/${JOB_UUID}`;
const KEY = `ashby:ramp:${JOB_UUID}`;
const TITLE = "Frontend Engineer Intern (TEST)";
const WAITLISTED = { cc: "+1", national: "3125550142", e164: "+13125550142", auth: "13125550142" }; // on TRAINEE_ALLOWED_CONTACTS
const INVITEE = { cc: "+1", national: "3125550177", e164: "+13125550177", auth: "13125550177" }; // holds an invite link
const STRANGER = { cc: "+1", national: "3125550199", e164: "+13125550199", auth: "13125550199" };

// Ashby's public posting API and the employer's form, on 127.0.0.1 (as in flow-e2e-chat-submit.test.ts).
function ashby() {
  const applications: any[] = [], other: string[] = [];
  const strip = (h: string) => h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*>/gi, "")
    .replace(/\s(src|srcset)="https?:[^"]*"/gi, "").replace(/Crusoe/g, "Ramp");
  const script = `<script>
document.querySelectorAll(".ashby-application-form-input-yesno").forEach((g) => g.querySelectorAll("button").forEach((b) => b.addEventListener("click", (e) => {
  e.preventDefault(); g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  const box = g.querySelector("input[type=checkbox]"); if (box) box.checked = b.dataset.option === "yes";
})));
document.querySelectorAll("input[role=combobox]").forEach((inp) => {
  const list = document.createElement("div"); list.setAttribute("role", "listbox"); inp.parentElement.appendChild(list);
  inp.addEventListener("input", () => { list.innerHTML = inp.value ? '<div role="option" tabindex="-1">' + inp.value.replace(/[<>&"]/g, "") + "</div>" : ""; inp.setAttribute("aria-expanded", String(!!inp.value));
    const o = list.firstElementChild; if (o) o.addEventListener("mousedown", (e) => { e.preventDefault(); inp.value = o.textContent; list.innerHTML = ""; inp.setAttribute("aria-expanded", "false"); }); });
});
document.querySelector(".ashby-application-form-submit-button").addEventListener("click", async (e) => {
  e.preventDefault();
  const r = await fetch("/api/non-user-graphql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operationName: "ApiSubmitSingleApplicationFormAction" }) });
  if (r.ok) document.body.innerHTML = "<h1>Thank you for applying</h1>";
});
</script>`;
  const form = strip(Deno.readTextFileSync(CAPTURED)).replace(/<\/body>/i, `${script}</body>`);
  const board = { apiVersion: "1", jobs: [{
    id: JOB_UUID, title: TITLE, location: "New York, NY", departmentName: "Engineering", employmentType: "Intern", isListed: true,
    publishedAt: new Date().toISOString(), jobUrl: LINK, applyUrl: `${LINK}/application`,
    descriptionPlain: "TEST synthetic posting. Build product UI in React and TypeScript with the engineering team.",
  }] };
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const u = new URL(req.url);
    if (req.method === "GET" && u.pathname === "/posting-api/job-board/ramp") return Response.json(board);
    if (req.method === "GET" && u.pathname === `/ramp/${JOB_UUID}/application`) return new Response(form, { headers: { "content-type": "text/html" } });
    if (req.method === "POST" && u.pathname === "/api/non-user-graphql") { applications.push(await req.json().catch(() => ({}))); return Response.json({ data: { ok: true } }); }
    other.push(`${req.method} ${u.pathname}`);
    return new Response("not found", { status: 404 });
  });
  const origin = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`;
  return { origin, form: `${origin}/ramp/${JOB_UUID}/application`, applications, other, close: () => server.shutdown() };
}

// Supabase Auth's code sign-in, as the browser's supabase-js calls it. A code is "texted" into `codes`.
function fakeAuth(pg: Awaited<ReturnType<typeof startPg>>, users: Record<string, { id: string; email?: string; phone?: string; confirmed?: string }>) {
  const codes = new Map<string, string>(), sent: string[] = [];
  const userJson = (u: { id: string; phone?: string; confirmed?: string }) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: "", phone: u.phone ?? "",
    phone_confirmed_at: u.confirmed ?? null, confirmed_at: u.confirmed ?? null, app_metadata: { provider: "phone", providers: ["phone"] }, user_metadata: {},
    identities: [], created_at: u.confirmed ?? new Date().toISOString(), updated_at: new Date().toISOString() });
  const session = (tok: string, u: { id: string; phone?: string; confirmed?: string }) => ({ access_token: tok, token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `r-${tok}`, user: userJson(u) });
  async function handle(path: string, req: Request): Promise<Response | null> {
    if (path === "/auth/v1/otp" && req.method === "POST") {
      const b = await req.json();
      const phone = String(b.phone ?? "").replace(/\D/g, "");
      if (!phone) return Response.json({ code: 400, msg: "Unsupported test sign-in" }, { status: 400 });
      const code = String(100000 + Math.floor(Math.random() * 899999));
      codes.set(phone, code); sent.push(phone);
      return Response.json({});
    }
    if (path === "/auth/v1/verify" && req.method === "POST") {
      const b = await req.json();
      const phone = String(b.phone ?? "").replace(/\D/g, "");
      if (b.type !== "sms" || !codes.has(phone) || codes.get(phone) !== String(b.token)) return Response.json({ code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" }, { status: 403 });
      codes.delete(phone);
      const now = new Date().toISOString();
      let id = await pg.sql(`select id from auth.users where phone = '${phone}'`);
      if (!id) id = await pg.sql(`insert into auth.users (phone, phone_confirmed_at) values ('${phone}', '${now}') returning id`);
      const tok = `tok-${crypto.randomUUID()}`;
      users[tok] = { id, phone, confirmed: now };
      return Response.json(session(tok, users[tok]));
    }
    if (path === "/auth/v1/user" && req.method === "GET") {
      const u = users[(req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")];
      return u ? Response.json(userJson(u)) : Response.json({ code: 401, msg: "invalid JWT" }, { status: 401 });
    }
    if (path === "/auth/v1/logout") return new Response(null, { status: 204 });
    return null;
  }
  return { codes, sent, handle };
}

Deno.test({
  name: "web: invite-only sign-up, first turn, resume file, card in chat and Applications, tap approve, reload, loading and errors",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    if (!pgBinDir() || !browserEnv()) {
      if (CI) throw Error("the web sign-up flow needs Postgres 16 binaries and the gate's Playwright browser in CI");
      console.log("NOT_RUN locally: no Postgres binaries or Playwright browser");
      return;
    }
    if (Deno.uid?.() === 0 && !CI) { console.log("NOT_RUN locally as root: run it as an unprivileged user (Chromium's sandbox)"); return; }
    const require = createRequire(import.meta.url);
    const { chromium } = require(Deno.env.get("UPMORE_PLAYWRIGHT_PATH")!);
    const shots = Deno.env.get("WEB_SHOTS_DIR") || await Deno.makeTempDir({ prefix: "trainee-web-shots-" });
    await Deno.mkdir(shots, { recursive: true });
    const pg = await startPg({ gate: "invite" });
    const site = ashby();
    const work = await Deno.makeTempDir({ prefix: "trainee-web-e2e-" });
    const outbound: string[] = [], chatBodies: any[] = [];
    const realFetch = globalThis.fetch;
    let browser: any = null, app: Deno.HttpServer | null = null, backend: Deno.HttpServer | null = null;
    try {
      await supabaseParity(pg);
      const users: Record<string, { id: string; email?: string; phone?: string; confirmed?: string }> = {};
      const auth = fakeAuth(pg, users);
      const double = postgrestDouble(pg, { url: SUPABASE_URL, serviceKey: SERVICE_KEY, users });
      Deno.env.set("SUPABASE_URL", SUPABASE_URL); Deno.env.set("SUPABASE_ANON_KEY", ANON_KEY); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
      Deno.env.set("TRAINEE_ALLOWED_CONTACTS", `${WAITLISTED.e164}, someone@example.test`);
      assertEquals(await pg.sql(`select public.trainee_signup_mode()`), "invite", "sign-up is closed, as production has it");
      // The handler's own calls: Supabase (Auth's user read with the confirmed phone, then the double), Ashby (local);
      // nothing else.
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request && !init ? input : new Request(input as any, init);
        const u = new URL(req.url);
        if (u.origin === new URL(SUPABASE_URL).origin) return (await auth.handle(u.pathname, req)) ?? double.fetch(req);
        if (u.hostname === "127.0.0.1") return realFetch(req);
        outbound.push(u.href);
        if (u.hostname === "api.ashbyhq.com") return realFetch(new Request(`${site.origin}${u.pathname}${u.search}`, req));
        throw new Error(`the web e2e test reaches no real host: ${u.href}`);
      }) as typeof fetch;
      const { handleChat } = await import("../../supabase/functions/agent-chat/handler-career.ts");

      // The Supabase project, as the browser reaches it: its own CORS for Auth and the REST API, agent-chat's own.
      backend = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
        const u = new URL(req.url);
        // Another site trying to show the app in a frame (the framing check).
        if (u.pathname === "/frame-test") {
          return new Response(`<!doctype html><title>frame</title><iframe src="${APP}/app" width="400" height="400"></iframe><script>setTimeout(() => { window.frameDone = true; }, 2500)</script>`,
            { headers: { "content-type": "text/html" } });
        }
        const origin = req.headers.get("origin") ?? "";
        const supaCors = { "access-control-allow-origin": origin || "*", "access-control-allow-headers": req.headers.get("access-control-request-headers") ?? "*",
          "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS", "access-control-expose-headers": "content-range, x-supabase-api-version", "vary": "origin" };
        const inner = new Request(`${SUPABASE_URL}${u.pathname}${u.search}`, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer() });
        if (u.pathname === "/functions/v1/agent-chat") {
          if (req.method === "POST") chatBodies.push(JSON.parse(new TextDecoder().decode(await inner.clone().arrayBuffer()) || "{}"));
          return await handleChat(inner);
        }
        if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: supaCors });
        const res = u.pathname.startsWith("/auth/") ? (await auth.handle(u.pathname, inner)) ?? new Response(JSON.stringify({ msg: "not here" }), { status: 404 }) : await double.fetch(inner);
        const h = new Headers(res.headers); for (const [k, v] of Object.entries(supaCors)) h.set(k, v);
        return new Response(res.body, { status: res.status, headers: h });
      });
      const BACKEND = `http://127.0.0.1:${(backend.addr as Deno.NetAddr).port}`;
      // The app, from the committed build, on an origin agent-chat's CORS allows for local development.
      const files: Record<string, [string, string]> = {
        "/app": ["site/app/index.html", "text/html; charset=utf-8"], "/app/": ["site/app/index.html", "text/html; charset=utf-8"],
        "/app/icon.svg": ["site/app/icon.svg", "image/svg+xml"], "/app/fonts/libre-baskerville-regular.woff2": ["site/app/fonts/libre-baskerville-regular.woff2", "font/woff2"],
      };
      // The headers vercel.json gives these paths, applied as Vercel applies them (exact source, or "/app/(.*)").
      const vercel = JSON.parse(Deno.readTextFileSync(`${ROOT}/vercel.json`));
      const headersFor = (p: string) => {
        const h: Record<string, string> = {};
        for (const rule of vercel.headers) if (new RegExp(`^${String(rule.source).replace(/\(\.\*\)/g, ".*")}$`).test(p)) for (const x of rule.headers) h[x.key] = x.value;
        return h;
      };
      const PROD_BACKEND = "https://mrwngntwmnaqrqhupvlt.supabase.co";
      const serveApp = (req: Request) => {
        const p = new URL(req.url).pathname;
        if (p === "/app/config.js") return new Response(`window.TRAINEE_CONFIG = Object.freeze(${JSON.stringify({ backendUrl: BACKEND, anonKey: ANON_KEY })});`, { headers: { "content-type": "text/javascript", ...headersFor(p) } });
        const f = files[p];
        if (!f) return new Response("not found", { status: 404 });
        let body: Uint8Array | string = Deno.readFileSync(`${ROOT}/${f[0]}`);
        if (f[0].endsWith(".html")) {
          // The one seam in the page: its CSP names the production project as the only place it may connect; here that is
          // the local backend. Exactly one occurrence, inside the policy.
          const html = new TextDecoder().decode(body), csp = /connect-src https:\/\/mrwngntwmnaqrqhupvlt\.supabase\.co;/g;
          assertEquals(html.match(csp)?.length, 1, "the built CSP connects only to the project");
          body = html.replace(csp, `connect-src ${BACKEND};`);
        }
        return new Response(body, { headers: { "content-type": f[1], ...headersFor(p) } });
      };
      void PROD_BACKEND;
      for (const port of [8080, 8000]) { try { app = Deno.serve({ hostname: "127.0.0.1", port, onListen() {} }, serveApp); break; } catch { /* next */ } }
      assert(app, "the app server needs 127.0.0.1:8080 or :8000 (origins agent-chat allows for local development)");
      const APP = `http://127.0.0.1:${(app!.addr as Deno.NetAddr).port}`;

      browser = await chromium.launch({ headless: true, chromiumSandbox: true, ...(Deno.env.get("UPMORE_CHROMIUM_PATH") ? { executablePath: Deno.env.get("UPMORE_CHROMIUM_PATH") } : {}), timeout: 60000 });
      const unexpected: string[] = [], consoleErrors: string[] = [];
      const open = async (viewport: { width: number; height: number }, mobile: boolean) => {
        const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
        // Fonts come from Google Fonts in production; here the page falls back to its stack. Nothing else leaves 127.0.0.1.
        await context.route("**/*", (route: any) => {
          const u = new URL(route.request().url());
          if (u.hostname === "127.0.0.1") return route.continue();
          if (/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return route.fulfill({ status: 204, body: "" });
          unexpected.push(u.href);
          return route.abort();
        });
        const page = await context.newPage();
        page.on("console", (m: any) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
        page.on("pageerror", (e: any) => consoleErrors.push(String(e)));
        return { context, page };
      };
      // A page's quality floor: no sideways scroll, every control named, readable text, nothing clipped off screen.
      const floor = async (page: any, label: string) => {
        const r = await page.evaluate(() => {
          const lum = (c: string) => {
            const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
            const [r, g, b, a = 1] = m[1].split(",").map((x) => parseFloat(x));
            if (a === 0) return null;
            const ch = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
            return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
          };
          const bgOf = (el: Element | null): number => {
            for (let e = el; e; e = e.parentElement) { const l = lum(getComputedStyle(e).backgroundColor); if (l !== null) return l; }
            return lum(getComputedStyle(document.body).backgroundColor) ?? 1;
          };
          const visible = (el: Element) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && b.width > 0 && b.height > 0 && !el.closest("[hidden]") && !el.closest(".sr"); };
          const unnamed: string[] = [], lowContrast: string[] = [], offscreen: string[] = [];
          for (const el of Array.from(document.querySelectorAll("input, textarea, select, button, a[href]"))) {
            if (!visible(el) && !(el as HTMLInputElement).type?.match(/radio|file/)) continue;
            if ((el as HTMLInputElement).type && /radio|file/.test((el as HTMLInputElement).type) && el.closest("[hidden]")) continue;
            const labels = (el as HTMLInputElement).labels ? Array.from((el as HTMLInputElement).labels!).map((l) => l.textContent!.trim()).join(" ") : "";
            const name = labels || el.getAttribute("aria-label") || (el.tagName === "BUTTON" || el.tagName === "A" ? el.textContent!.trim() : "");
            if (!name) unnamed.push(el.outerHTML.slice(0, 100));
          }
          for (const el of Array.from(document.querySelectorAll("body *"))) {
            if (!visible(el)) continue;
            const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
            if (!own) continue;
            const s = getComputedStyle(el), fg = lum(s.color);
            if (fg === null) continue;
            const bg = bgOf(el), ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
            const size = parseFloat(s.fontSize), bold = parseInt(s.fontWeight) >= 700;
            const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
            const dim = parseFloat(s.opacity) < 1 || (el as HTMLButtonElement).disabled;
            if (!dim && ratio < need) lowContrast.push(`${ratio.toFixed(2)} "${el.textContent!.trim().slice(0, 40)}" ${s.color}`);
            const b = el.getBoundingClientRect();
            if (b.right > window.innerWidth + 1 || b.left < -1) offscreen.push(el.textContent!.trim().slice(0, 40));
          }
          return { overflow: document.documentElement.scrollWidth - window.innerWidth, unnamed, lowContrast, offscreen };
        });
        assertEquals(r.overflow <= 0, true, `${label}: no sideways scroll (${r.overflow}px too wide)`);
        assertEquals(r.unnamed, [], `${label}: every control has a name`);
        assertEquals(r.lowContrast, [], `${label}: text contrast`);
        assertEquals(r.offscreen, [], `${label}: nothing off screen`);
      };
      const shot = async (page: any, name: string) => { await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }); };
      const trainee = (page: any) => page.locator("li.msg.trainee:not(.pending)");
      const lastReply = async (page: any) => (await trainee(page).last().locator(":scope > span:nth-child(2)").textContent()) ?? "";
      const say = async (page: any, text: string, mobile = true) => {
        const before = await trainee(page).count();
        await page.fill("#message", text);
        if (mobile) await page.click("#send"); else await page.press("#message", "Enter");
        await page.waitForFunction((n: number) => document.querySelectorAll("li.msg.trainee:not(.pending)").length > n && !document.querySelector("li.msg.pending"), before, { timeout: 60000 });
        return await lastReply(page);
      };
      const signIn = async (page: any, who: typeof WAITLISTED, keyboard: boolean) => {
        if (keyboard) {
          await page.focus("#phone");
          await page.keyboard.type(who.national);
          await page.keyboard.press("Enter");
        } else {
          await page.fill("#phone", who.national);
          await page.click("#send-code");
        }
        await page.waitForSelector("#verify-form:not([hidden])");
        assert(/We texted a code to \+1/.test(await page.textContent("#sent-to") ?? ""), "the page says where the code went");
        const code = auth.codes.get(who.auth);
        assert(code, `a code was sent to ${who.auth}`);
        if (keyboard) { await page.keyboard.type(code!); await page.keyboard.press("Enter"); }
        else { await page.fill("#code", code!); await page.click("#verify"); }
      };
      const svc = pg.asService();

      await t.step("the app opens on sign in at phone and desktop widths; quality floor; keyboard order", async () => {
        for (const [w, h, mobile, name] of [[390, 844, true, "phone"], [320, 640, true, "small-phone"], [1280, 800, false, "desktop"]] as const) {
          const { context, page } = await open({ width: w, height: h }, mobile);
          await page.goto(`${APP}/app`);
          await page.waitForSelector("#signin:not([hidden])");
          assertEquals(await page.title(), "Trainee");
          assert(!/upmore/i.test(await page.content()), "no Upmore anywhere in the page");
          if (name === "phone") {
            const res = await page.goto(`${APP}/app`);
            const h = res.headers();
            assertEquals([h["x-frame-options"], h["content-security-policy"], h["x-content-type-options"], h["referrer-policy"]],
              ["DENY", "frame-ancestors 'none'; base-uri 'none'; object-src 'none'", "nosniff", "no-referrer"], "the app's response headers");
            assert(await page.locator('meta[http-equiv="Content-Security-Policy"]').count() === 1, "the page carries its CSP");
            await page.waitForSelector("#signin:not([hidden])");
          }
          await floor(page, `sign in ${name}`);
          await shot(page, `01-signin-${name}`);
          if (!mobile) {
            const order: string[] = [];
            for (let i = 0; i < 7; i++) { await page.keyboard.press("Tab"); order.push(await page.evaluate(() => { const a = document.activeElement as HTMLElement; return a.id || (a as HTMLInputElement).value || a.textContent!.trim(); })); }
            // skip link, the name, the Phone choice (the checked radio), country code, number, the button
            assertEquals(order.slice(0, 6), ["Skip to content", "Trainee", "phone", "cc", "phone", "send-code"], `tab order: ${order}`);
            const ring = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
            assert(ring !== "none", "the focused control shows a focus ring");
          }
          await context.close();
        }
      });

      await t.step("framing: another site cannot show the app in a frame", async () => {
        const { context, page } = await open({ width: 1280, height: 800 }, false);
        await page.goto(`${BACKEND}/frame-test`);
        await page.waitForFunction(() => (window as any).frameDone === true, null, { timeout: 15000 });
        const child = page.frames().find((f: any) => f !== page.mainFrame());
        assert(child, "the frame element exists");
        assert(child.url().startsWith("chrome-error://"), `the browser refused to show the app in the frame (${child.url()})`);
        consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/frame-ancestors|X-Frame-Options|Refused to display/.test(e)));
        await context.close();
      });

      await t.step("validation: a short number and an empty code are refused on the page; nothing is sent", async () => {
        const { context, page } = await open({ width: 390, height: 844 }, true);
        await page.goto(`${APP}/app`);
        await page.fill("#phone", "31255");
        await page.click("#send-code");
        assertEquals(await page.textContent("#send-error"), "Enter your mobile number, like (312) 555-0142.");
        assertEquals(await page.getAttribute("#phone", "aria-invalid"), "true");
        assertEquals(auth.sent.length, 0, "no code asked for");
        await page.check("input[name=method][value=email]");
        assertEquals(await page.textContent("#send-code"), "Email me a code");
        await page.fill("#email", "not-an-email");
        await page.click("#send-code");
        assertEquals(await page.textContent("#send-error"), "Enter your email, like name@example.com.");
        await shot(page, "02-signin-error-phone");
        // One code a minute per number: a second ask within the minute is refused on the page and nothing is sent.
        await page.check("input[name=method][value=phone]");
        await page.fill("#phone", "3125550166");
        await page.click("#send-code");
        await page.waitForSelector("#verify-form:not([hidden])");
        assertEquals(auth.sent.filter((x) => x === "13125550166").length, 1);
        await page.click("#change");
        await page.click("#send-code");
        assert(/A code was just sent to that number\. You can ask for a new one in \d+ seconds\./.test(await page.textContent("#send-error") ?? ""), await page.textContent("#send-error"));
        assertEquals(auth.sent.filter((x) => x === "13125550166").length, 1, "no second code within the minute");
        await context.close();
      });

      await t.step("a person not invited signs in and is told their spot hasn't opened; no admission, no turn", async () => {
        const { context, page } = await open({ width: 390, height: 844 }, true);
        await page.goto(`${APP}/app`);
        await signIn(page, STRANGER, false);
        await page.waitForSelector("#waiting:not([hidden])");
        assertEquals(await page.textContent("#waiting-title"), "Your spot hasn't opened yet");
        assert(/opens in waves|We open the waitlist in waves/.test(await page.textContent("#waiting-text") ?? ""), await page.textContent("#waiting-text"));
        const id = await pg.sql(`select id from auth.users where phone = '${STRANGER.auth}'`);
        assertEquals(await pg.sql(`select count(*) from public.trainee_admissions where user_id = '${id}'`), "0");
        assertEquals(await pg.sql(`select count(*) from public.agent_threads where user_id = '${id}'`), "0", "no thread, no turn");
        assertEquals(await pg.sql(`select count(*) from public.agent_rate_limits where user_id = '${id}'`), "0", "the rate limit is not spent");
        assert(chatBodies.some((b) => b.check_access === true), "the app asked agent-chat for access, not for a turn");
        await floor(page, "waiting");
        await shot(page, "03-waiting-phone");
        // Their own session, straight at the database's RPCs (what a person could do from the console): nothing is made.
        await pg.sql(`insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}') on conflict do nothing`);
        const attack = await page.evaluate(async ({ backend, anon, uid }: { backend: string; anon: string; uid: string }) => {
          const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x))!;
          const tok = JSON.parse(localStorage.getItem(k)!).access_token;
          const c = (window as any).supabase.createClient(backend, anon, { global: { headers: { Authorization: "Bearer " + tok } }, auth: { persistSession: false } });
          const payload = { version: 1, user_id: uid, job_id: "TEST-ATTACK-1", company: "Attack Co", url: "https://jobs.lever.co/attack/1", fields: [], privacy_epoch: 0, account_version: 0,
            expires_at: new Date(Date.now() + 86400000).toISOString() };
          const prep = await c.rpc("career_apply_prepare_own", { p_payload: payload, p_card_lines: ["Attack Co: Analyst"] });
          const open = await c.rpc("career_apply_card_open_own", { p_ids: ["00000000-0000-4000-8000-0000000000aa"] });
          return { prep: prep.error?.message ?? null, open: open.error?.message ?? null };
        }, { backend: BACKEND, anon: ANON_KEY, uid: id });
        assert(/not_admitted/.test(String(attack.prep)), `prepare_own refused: ${JSON.stringify(attack)}`);
        assert(attack.open, `card_open_own refused: ${JSON.stringify(attack)}`);
        for (const tbl of ["career_apply_prepared", "career_apply_cards", "career_apply_jobs", "career_apply_wanted"]) {
          assertEquals(await pg.sql(`select count(*) from public.${tbl} where user_id = '${id}'`), "0", `no ${tbl} row for a person not admitted`);
        }
        await context.close();
      });

      await t.step("an invite link: redeemed only through FEATURE WAVES, never treated as admission by itself", async () => {
        const waves = await pg.sql(`select to_regclass('public.career_invites') is not null`);
        const TOKEN = "TestInviteToken_0123456789abcdef";
        if (waves === "t") {
          // The one invite system: a sent invite for this number, its token stored by hash only.
          await pg.sql(`insert into public.career_invite_waves (id, open_key, size, opened_at) values (990002, 'web_e2e', 1, now());
            insert into public.career_invites (wave_id, phone, token_hash, state, signed_up_at, created_at, sent_at, expires_at)
            values (990002, '${INVITEE.e164}', public.career_invite_hash('${TOKEN}'), 'sent', now(), now(), now(), now() + interval '14 days')`);
        }
        const { context, page } = await open({ width: 390, height: 844 }, true);
        await page.goto(`${APP}/app/?invite=${TOKEN}`);
        await page.waitForSelector("#signin:not([hidden])");
        assert(!page.url().includes(TOKEN), "the token leaves the address bar at once");
        assert(await page.isVisible("#invite-note"), "the page says the invite is ready");
        await signIn(page, INVITEE, false);
        const id = await (async () => { for (let i = 0; i < 50; i++) { const v = await pg.sql(`select id from auth.users where phone = '${INVITEE.auth}'`); if (v) return v; await new Promise((r) => setTimeout(r, 100)); } return ""; })();
        await page.waitForSelector(waves === "t" ? "#chat:not([hidden])" : "#waiting:not([hidden])");
        assert(chatBodies.some((b) => b.check_access === true && b.invite === TOKEN), "the access check carried the invite");
        if (waves === "t") {
          assertEquals(await pg.sql(`select via from public.trainee_admissions where user_id = '${id}'`), "invite");
          assertEquals(await pg.sql(`select redeemed_user from public.career_invites where phone = '${INVITEE.e164}'`), id, "the invite is bound to this account, once");
        } else {
          // Without FEATURE WAVES there is no invite system here, so the link admits nobody.
          assertEquals(await pg.sql(`select count(*) from public.trainee_admissions where user_id = '${id}'`), "0", "a token alone admits nobody");
        }
        assertEquals(await page.evaluate(() => sessionStorage.getItem("trainee.invite")), null, "the token is not kept after the check");
        await context.close();
      });

      let PERSON = "";
      const { context, page } = await open({ width: 390, height: 844 }, true);
      await t.step("an allow-listed confirmed phone signs in by keyboard alone and is admitted via the allow-list", async () => {
        await page.goto(`${APP}/app`);
        await signIn(page, WAITLISTED, true);
        await page.waitForSelector("#chat:not([hidden])");
        PERSON = await pg.sql(`select id from auth.users where phone = '${WAITLISTED.auth}'`);
        assertEquals(await pg.sql(`select via from public.trainee_admissions where user_id = '${PERSON}'`), "allowlist");
        assertEquals(await page.evaluate(() => document.activeElement!.id), "message", "the composer has focus");
        await floor(page, "chat empty");
        await shot(page, "04-chat-empty-phone");
      });

      await t.step("their first chat turn: a reply in their own thread, saved", async () => {
        const reply = await say(page, "hi");
        assert(reply.length > 0, "a reply");
        const thread = await pg.sql(`select id from public.agent_threads where user_id = '${PERSON}'`);
        assert(/^[0-9a-f-]{36}$/.test(thread), "one thread of theirs");
        assertEquals(await pg.sql(`select string_agg(role, ',' order by id) from public.agent_messages where thread_id = '${thread}'`), "user,assistant");
        assertEquals(await pg.sql(`select content from public.agent_messages where thread_id = '${thread}' and role = 'assistant'`), reply, "the page shows the saved reply");
      });

      await t.step("their resume as a file: a PDF goes whole (bytes and sha256) and the server's answer is shown; then the .txt, confirmed", async () => {
        // A damaged PDF: the web sends it as it is; the server (FEATURE 16 when present) reads it and says what it could not.
        const bad = new TextEncoder().encode("%PDF-1.4 damaged");
        const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bad)), (x) => x.toString(16).padStart(2, "0")).join("");
        const msgs0 = await pg.sql(`select count(*) from public.agent_messages m join public.agent_threads t on t.id = m.thread_id where t.user_id = '${PERSON}'`);
        await page.setInputFiles("#file", { name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from(bad) });
        await page.waitForFunction((t: string) => document.getElementById("attached-name")!.textContent === t, "Resume added: resume.pdf", { timeout: 10000 });
        await page.click("#send");
        await page.waitForFunction(() => !document.querySelector("li.msg.pending"), null, { timeout: 60000 });
        const sent = chatBodies.at(-1);
        assertEquals([sent.resume_file?.name, sent.resume_file?.mime, sent.resume_file?.sha256, sent.resume_file?.data], ["resume.pdf", "application/pdf", sha, Buffer.from(bad).toString("base64")],
          "the file went whole, with its sha256");
        const intake = (() => { try { Deno.statSync(`${ROOT}/supabase/functions/_shared/career_resume_intake.ts`); return true; } catch { return false; } })();
        if (intake) {
          const said = await lastReply(page);
          assert(said.length > 0 && !/Resume saved|on record/i.test(said), `the server says it could not read the file: ${said}`);
        } else {
          // Without FEATURE 16 the server reads no files: the page says so, and nothing was saved.
          await page.locator("li.msg.me.failed .why", { hasText: "Not sent: Trainee couldn't read that file here. Paste the resume text instead." }).waitFor({ timeout: 10000 });
          assertEquals(await pg.sql(`select count(*) from public.agent_messages m join public.agent_threads t on t.id = m.thread_id where t.user_id = '${PERSON}'`), msgs0, "no turn was saved");
        }
        assertEquals(await pg.sql(`select count(*) from public.career_events where user_id = '${PERSON}' and kind = 'fact_confirmed'`), "0", "nothing confirmed from an unreadable file");
        await page.setInputFiles("#file", RESUME_PATH);
        await page.waitForFunction((t: string) => document.getElementById("attached-name")!.textContent === t, "Resume added: test-resume.txt", { timeout: 10000 });
        const before = await trainee(page).count();
        await page.click("#send");
        await page.waitForFunction((n: number) => document.querySelectorAll("li.msg.trainee:not(.pending)").length > n && !document.querySelector("li.msg.pending"), before, { timeout: 60000 });
        assert(chatBodies.at(-1).message.startsWith("Here is my resume:\n") && chatBodies.at(-1).message.includes((await Deno.readTextFile(RESUME_PATH)).trim().split("\n")[0]), "the file's text was sent");
        const yes = await say(page, "yes, that's my resume");
        assert(yes.length > 0);
        assert(Number(await pg.sql(`select count(*) from public.career_events where user_id = '${PERSON}' and kind = 'fact_confirmed'`)) >= 10, "one confirmed fact per entry");
        await floor(page, "chat with resume");
        await shot(page, "05-chat-resume-phone");
      });

      // The worker's preparation, as it runs on the server (the same deps as flow-e2e-chat-submit.test.ts).
      const memory = memoryResumeStore();
      const resumes: ResumeStore = {
        put: async (path, pdf) => { await memory.put(path, pdf); await pg.sql(`insert into storage.objects (bucket_id, name) values ('career-resumes', '${path}') on conflict (bucket_id, name) do nothing`); },
        signedUrl: (path, seconds) => memory.signedUrl(path, seconds), removeAll: (u) => memory.removeAll(u),
      };
      const runEngine = engineRunner({ root: ROOT, extra: ["--state-dir", `${work}/engine-state`, "--script-submit", "ashby"] });
      const prepare = async () => (await prepareAhead({ db: svc, runEngine, profileFor: storedProfile(svc), urlFor: () => site.form, resumeFor: tailoredResume({ render: edgeRenderer(), resumes }) }, { only: { user_id: PERSON, job_ids: [KEY] } })).map((d) => d.outcome);
      const answer = async (answers: [RegExp, string][]) => {
        const shown = await say(page, "what do you need from me");
        const lines = shown.split("\n");
        const parts = answers.map(([label, value]) => { const line = lines.find((l) => /^\d+\./.test(l) && label.test(l)); assert(line, `${label} is asked: ${shown}`); return `${/^(\d+)\./.exec(line!)![1]} ${value}`; });
        const r = await say(page, parts.join("\n"));
        assert(!/doesn't fit|does not fit|isn't one of/i.test(r), `their answers are taken: ${r}`);
      };

      let preparedHash = "", fields: any[] = [];
      await t.step("a posting link queued; prepare asks only what is unknown; answered in the web chat; ready", async () => {
        const q = await say(page, `apply me to this: ${LINK}`);
        assert(/^1\/1 queued/.test(q) && q.includes(TITLE), q);
        assertEquals(await prepare(), ["asked"]);
        await answer([[/First name/i, "Alex"], [/Last name/i, "Testcase"], [/Email/i, "alex.testcase@example.test"]]);
        assertEquals(await prepare(), ["asked"]);
        await answer([[/sponsorship/i, "no"], [/currently work for Ramp/i, "no"], [/state, province, or region/i, "Illinois"]]);
        assertEquals(await prepare(), ["ready"]);
        const row = JSON.parse(await pg.sql(`select row_to_json(p) from public.career_apply_prepared p where user_id = '${PERSON}'`));
        preparedHash = row.payload_hash;
        fields = row.payload.fields.filter((x: any) => x.name !== "_systemfield_resume");
        assertEquals(site.applications.length, 0, "nothing was sent to the employer");
      });

      let cardId = "";
      await t.step("'show my applications': the card renders under the reply with every exact answer; Applications shows it too", async () => {
        const shownText = await say(page, "show my applications");
        assert(/Tap Approve on the card to send it exactly as shown, or Decline\.$/.test(shownText.trim()), `the web card says to tap: ${shownText}`);
        assert(!/Reply "yes"/.test(shownText), "no texting instruction on the web");
        const card = trainee(page).last().locator(".career-apply-card");
        await card.locator("button", { hasText: "Approve" }).waitFor({ timeout: 20000 });
        assertEquals(await lastReply(page), "1 application is ready. Every answer below goes exactly as shown.", "the reply keeps its first paragraph; the card lists the answers once");
        const seen = await card.textContent() ?? "";
        for (const f of fields) assert(seen.includes(String(f.value)), `the web card shows ${f.label} = ${f.value}: ${seen}`);
        assert(/Resume: .*tailored for this role/.test(seen), seen);
        cardId = await pg.sql(`select id from public.career_apply_cards where user_id = '${PERSON}' and state = 'open'`);
        assertEquals(await pg.sql(`select items->0->>'payload_hash' from public.career_apply_cards where id = '${cardId}'`), preparedHash);
        await floor(page, "chat with card");
        await page.screenshot({ path: `${shots}/06-card-in-chat-phone.png` });
        assertEquals(await page.textContent("#apps-count"), "1", "the Applications tab counts the waiting application");
        await page.click("#tab-apps");
        const panel = page.locator(`#dashboard [data-tr-apply-card="${cardId}"] .career-apply-card`);
        await panel.locator("button", { hasText: "Approve" }).waitFor({ timeout: 20000 });
        for (const f of fields) assert((await panel.textContent() ?? "").includes(String(f.value)), `Applications shows ${f.label}`);
        assert(/1 awaiting approval/.test(await page.textContent("#dashboard [data-tr-summary]") ?? ""), "the dashboard counts the chat's card");
        assertEquals(await page.locator("#dashboard .tr-tab[aria-selected=true]").textContent(), "Queue1", "the dashboard opens on its queue");
        assertEquals(await page.locator('#dashboard [data-tr-reviewed]').count(), 0, "the application on the card is not listed again as reviewed");
        assertEquals(await page.locator("#apps h1").count(), 1, "one top heading on the Applications view");
        await floor(page, "applications");
        await shot(page, "07-applications-phone");
        await page.setViewportSize({ width: 1280, height: 800 });
        await floor(page, "applications desktop");
        await shot(page, "07-applications-desktop");
        await page.setViewportSize({ width: 390, height: 844 });
        await page.click("#tab-chat");
      });

      await t.step("another person reads nothing of theirs and cannot answer their card", async () => {
        const other = await pg.sql(`select id from auth.users where phone = '${STRANGER.auth}'`);
        const r = await pg.asPerson(other).rpc("career_apply_card_answer_own", { p_card: cardId, p_approve: [1] });
        assert(r.error && /invalid card answer/.test(r.error.message), JSON.stringify(r));
        const tok = Object.entries(users).find(([, u]) => u.id === other)![0];
        const seen = await double.fetch(new Request(`${SUPABASE_URL}/rest/v1/career_apply_cards?select=id&id=eq.${cardId}`, { headers: { authorization: `Bearer ${tok}` } }));
        assertEquals(await seen.json(), [], "their card is invisible to anyone else");
        assertEquals(await pg.sql(`select count(*) from public.career_apply_jobs`), "0");
      });

      await t.step("their tap on Approve (tapped twice): answered once, queued, bound to the hash the card showed", async () => {
        const before = double.log.filter((l) => l.path.startsWith("/rest/v1/rpc/career_apply_card_answer_own")).length;
        await page.evaluate(() => { const b = Array.from(document.querySelectorAll("li.msg.trainee .career-apply-card button")).find((x) => x.textContent === "Approve") as HTMLButtonElement; b.click(); b.click(); });
        await page.waitForFunction(() => /1 approved exactly as shown/.test(document.querySelector("li.msg.trainee:last-of-type .career-apply-card")?.textContent ?? ""), null, { timeout: 20000 });
        assertEquals(double.log.filter((l) => l.path.startsWith("/rest/v1/rpc/career_apply_card_answer_own")).length - before, 1, "one answer for two taps");
        const job = JSON.parse(await pg.sql(`select row_to_json(j) from public.career_apply_jobs j where user_id = '${PERSON}'`));
        assertEquals([job.state, job.approval_hash, job.payload_hash, job.company], ["queued", preparedHash, preparedHash, "Ramp"]);
        assertEquals(await pg.sql(`select state from public.career_apply_cards where id = '${cardId}'`), "answered");
        assert(/Nothing has gone to an employer yet/.test(await trainee(page).last().textContent() ?? ""), "the card says nothing was sent");
        assertEquals(site.applications.length, 0, "the tap queues; it sends nothing itself");
        await shot(page, "08-approved-phone");
      });

      await t.step("an application approval card in the thread (career_message_approval) is mounted and fails closed when unverifiable", async () => {
        const thread = await pg.sql(`select id from public.agent_threads where user_id = '${PERSON}'`);
        await pg.sql(`insert into public.agent_messages (thread_id, role, content, meta) values ('${thread}', 'assistant', 'Here is the approval for Acme.',
          '{"intent":"career_message_approval","career_approval_card_id":"00000000-0000-4000-8000-0000000000cc"}'::jsonb)`);
      });

      await t.step("a reload resumes the thread with its history; the answered card says so", async () => {
        const count = await pg.sql(`select count(*) from public.agent_messages m join public.agent_threads t on t.id = m.thread_id where t.user_id = '${PERSON}'`);
        await page.reload();
        await page.waitForSelector("#chat:not([hidden])");
        await page.waitForFunction((n: number) => document.querySelectorAll("#log li.msg").length >= n, Number(count), { timeout: 20000 });
        await page.locator("li.msg.trainee .career-apply-card", { hasText: "This card was already answered." }).first().waitFor({ timeout: 20000 });
        assertEquals(await page.locator("li.msg.trainee .career-apply-card button", { hasText: "Approve" }).count(), 0, "an answered card offers no Approve");
        await page.locator("li.msg.trainee", { hasText: "Here is the approval for Acme." }).locator(".career-apply-card", { hasText: "Nothing was approved." }).waitFor({ timeout: 20000 });
        assertEquals(await pg.sql(`select count(*) from public.career_apply_jobs where user_id = '${PERSON}' and company = 'Acme'`), "0", "nothing queued from a card that could not be verified");
      });

      await t.step("loading and errors: a slow turn shows that Trainee is writing; a dropped reply keeps the message and retries with the same key", async () => {
        await page.route(`${BACKEND}/functions/v1/agent-chat`, async (route: any) => { await new Promise((r) => setTimeout(r, 1200)); await route.continue(); }, { times: 1 });
        await page.fill("#message", "What can you do?");
        await page.click("#send");
        await page.locator("li.msg.pending", { hasText: "Trainee is writing…" }).waitFor({ timeout: 5000 });
        assertEquals(await page.textContent("#send"), "Sending…");
        assert(await page.isDisabled("#send"), "send is disabled while a turn is out");
        await shot(page, "09-loading-phone");
        await page.waitForFunction(() => !document.querySelector("li.msg.pending"), null, { timeout: 60000 });
        // The reply is lost on the way back (the turn ran); the message stays with Try again, and the retry is the same turn.
        await page.route(`${BACKEND}/functions/v1/agent-chat`, async (route: any) => { await route.fetch(); await route.abort("internetdisconnected"); }, { times: 1 });
        const users0 = await pg.sql(`select count(*) from public.agent_messages m join public.agent_threads t on t.id = m.thread_id where t.user_id = '${PERSON}' and m.role = 'user' and m.content = 'what roles fit my resume?'`);
        await page.fill("#message", "what roles fit my resume?");
        await page.click("#send");
        await page.locator("li.msg.me.failed .why", { hasText: "No answer arrived: Trainee couldn't be reached. Check your connection, then try again." }).waitFor({ timeout: 60000 });
        await floor(page, "error");
        await shot(page, "10-error-phone");
        const keyFirst = chatBodies.at(-1).turn_key;
        await page.click("li.msg.me.failed .retry");
        await page.waitForFunction(() => !document.querySelector("li.msg.pending") && !document.querySelector("li.msg.failed"), null, { timeout: 60000 });
        assertEquals(chatBodies.at(-1).turn_key, keyFirst, "the retry carries the same turn key");
        assertEquals(Number(await pg.sql(`select count(*) from public.agent_messages m join public.agent_threads t on t.id = m.thread_id where t.user_id = '${PERSON}' and m.role = 'user' and m.content = 'what roles fit my resume?'`)) - Number(users0), 1, "one turn saved for the two sends");
        assertEquals(await page.locator("li.msg.me", { hasText: "what roles fit my resume?" }).count(), 1, "the message is shown once");
      });

      await t.step("sign out returns to sign in and clears the conversation from the page", async () => {
        await page.click("#sign-out");
        await page.waitForSelector("#signin:not([hidden])");
        assertEquals(await page.locator("#log li").count(), 0);
        await context.close();
      });
      assertEquals(unexpected, [], "no request left 127.0.0.1 except the font stylesheet");
      assertEquals(consoleErrors, [], "no script errors on the page");
      assert(outbound.every((u) => u.startsWith("https://api.ashbyhq.com/")), `no other host was asked: ${outbound}`);
      console.log(`screenshots: ${shots}`);
    } finally {
      globalThis.fetch = realFetch;
      if (browser) await browser.close().catch(() => {});
      await app?.shutdown().catch(() => {});
      await backend?.shutdown().catch(() => {});
      await site.close();
      await pg.stop();
      await Deno.remove(work, { recursive: true }).catch(() => {});
      Deno.env.delete("TRAINEE_ALLOWED_CONTACTS");
    }
  },
});
