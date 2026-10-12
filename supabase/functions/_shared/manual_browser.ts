// The live sign-in window for guided manual connect, on Browserbase (the cancel agent already runs Browserbase sessions
// with keepAlive: supabase/functions/agent-exec/index.ts, bbCreateSession). Each window is a keepAlive session, so the
// person keeps using it through the live view while this process connects over CDP only for a moment at a time (to
// open the sign-in page, read the page text, or save and restore the session). Nothing here types into a field.
// The connect URL carries the API key and the session carries cookies: neither is ever logged, returned or put in an
// error message. Tests use a MOCK of the ManualBrowser interface (tests/edge/manual-connect.test.ts).
import type { ManualBrowser, SessionState } from "./manual_connect.ts";

const BB_API = "https://api.browserbase.com/v1";

class Cdp {
  private nextId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private waiters: Array<{ method: string; sessionId?: string; done: () => void }> = [];
  private constructor(private ws: WebSocket) {}
  static connect(url: string, timeoutMs = 20000): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url), cdp = new Cdp(ws);
      const t = setTimeout(() => { if (!settled) { settled = true; try { ws.close(); } catch { /* ignore */ } reject(new Error("window connect timeout")); } }, timeoutMs);
      ws.onopen = () => { if (!settled) { settled = true; clearTimeout(t); resolve(cdp); } };
      ws.onerror = () => { if (!settled) { settled = true; clearTimeout(t); reject(new Error("window connect failed")); } };
      ws.onmessage = (ev) => cdp.onMessage(String(ev.data));
      ws.onclose = () => { for (const [, p] of cdp.pending) p.reject(new Error("window closed")); cdp.pending.clear(); };
    });
  }
  private onMessage(data: string) {
    let msg: any; try { msg = JSON.parse(data); } catch { return; }
    if (msg.id != null && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!; this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error("window command failed")); else p.resolve(msg.result);
      return;
    }
    if (msg.method) {
      const hit = this.waiters.filter((w) => w.method === msg.method && (w.sessionId == null || w.sessionId === msg.sessionId));
      this.waiters = this.waiters.filter((w) => !hit.includes(w)); hit.forEach((w) => w.done());
    }
  }
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
    const id = ++this.nextId, payload: Record<string, unknown> = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); try { this.ws.send(JSON.stringify(payload)); } catch (e) { this.pending.delete(id); reject(e as Error); } });
  }
  waitFor(method: string, sessionId: string | undefined, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const done = () => { clearTimeout(t); resolve(true); };
      const t = setTimeout(() => { this.waiters = this.waiters.filter((w) => w.done !== done); resolve(false); }, timeoutMs);
      this.waiters.push({ method, sessionId, done });
    });
  }
  async eval(sessionId: string, expression: string): Promise<any> {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (r?.exceptionDetails) throw new Error("page eval failed");
    return r?.result?.value;
  }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

// The one page in the window (the one the person sees in the live view).
async function attachPage(cdp: Cdp): Promise<string> {
  const { targetInfos } = await cdp.send("Target.getTargets");
  let target = (targetInfos || []).find((t: any) => t.type === "page" && t.targetId && !String(t.url || "").startsWith("devtools"));
  if (!target) target = { targetId: (await cdp.send("Target.createTarget", { url: "about:blank" })).targetId };
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  return sessionId;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// CookieParam fields only (Storage.getCookies returns more than Storage.setCookies takes).
const cookieParam = (c: any) => {
  const o: Record<string, unknown> = { name: String(c.name), value: String(c.value), domain: String(c.domain), path: String(c.path || "/"), secure: !!c.secure, httpOnly: !!c.httpOnly };
  if (c.sameSite) o.sameSite = c.sameSite;
  if (typeof c.expires === "number" && c.expires > 0) o.expires = c.expires;
  return o;
};
const inDomain = (host: string, domain: string) => { const h = host.replace(/^\./, "").toLowerCase(); return h === domain || h.endsWith("." + domain); };

export function browserbaseBrowser(env: { get(k: string): string | undefined }, f: typeof fetch = fetch): ManualBrowser {
  const key = env.get("BROWSERBASE_API_KEY") || "", project = env.get("BROWSERBASE_PROJECT_ID") || "";
  const headers = () => ({ "x-bb-api-key": key, "Content-Type": "application/json" });
  async function connectUrl(id: string): Promise<string> {
    const res = await f(`${BB_API}/sessions/${encodeURIComponent(id)}`, { headers: headers() });
    if (!res.ok) throw new Error(`window not reachable (HTTP ${res.status})`);
    const j = await res.json();
    if (!j.connectUrl || (j.status && j.status !== "RUNNING")) throw new Error("window is not running");
    return j.connectUrl as string;
  }
  async function withPage<T>(id: string, fn: (cdp: Cdp, sid: string) => Promise<T>): Promise<T> {
    const cdp = await Cdp.connect(await connectUrl(id));
    try { return await fn(cdp, await attachPage(cdp)); } finally { cdp.close(); }
  }
  return {
    configured: () => !!(key && project),
    async create() {
      const res = await f(`${BB_API}/sessions`, { method: "POST", headers: headers(), body: JSON.stringify({ projectId: project, keepAlive: true }) });
      if (!res.ok) throw new Error(`window could not be created (HTTP ${res.status})`);
      const j = await res.json();
      if (!j.id) throw new Error("no window id");
      return String(j.id);
    },
    async liveViewUrl(id) {
      const res = await f(`${BB_API}/sessions/${encodeURIComponent(id)}/debug`, { headers: headers() });
      if (!res.ok) throw new Error(`live view unavailable (HTTP ${res.status})`);
      const j = await res.json();
      const url = j.debuggerFullscreenUrl || (j.pages && j.pages[0] && j.pages[0].debuggerFullscreenUrl);
      if (!url || !/^https:\/\//.test(url)) throw new Error("no live view URL");
      return String(url);
    },
    goto: (id, url) => withPage(id, async (cdp, sid) => {
      const loaded = cdp.waitFor("Page.loadEventFired", sid, 30000);
      await cdp.send("Page.navigate", { url }, sid);
      await loaded; await sleep(1500); // single-page apps draw after load
    }),
    // A link or button whose own words are one of the alternatives (the playbook's sign-in link); never typing.
    click: (id, alternatives) => withPage(id, async (cdp, sid) => !!(await cdp.eval(sid, `(() => {
      const want = ${JSON.stringify(alternatives.map((a) => a.trim().toLowerCase()))};
      const el = [...document.querySelectorAll("a, button, [role=button], [role=link]")].find((e) => e.offsetParent !== null && want.includes((e.innerText || "").trim().toLowerCase()));
      if (!el) return false; el.click(); return true; })()`).catch(() => false))),
    text: (id) => withPage(id, async (cdp, sid) => String(await cdp.eval(sid, "(document.body && document.body.innerText || '').slice(0, 60000)") || "")),
    exportState: (id, domain) => withPage(id, async (cdp, sid) => {
      const { cookies } = await cdp.send("Storage.getCookies");
      const keep = (cookies || []).filter((c: any) => inDomain(String(c.domain || ""), domain)).map(cookieParam);
      const here = await cdp.eval(sid, "JSON.stringify({ origin: location.origin, host: location.hostname, items: (() => { try { return Object.entries(localStorage); } catch (e) { return []; } })() })").catch(() => null);
      const origins: SessionState["origins"] = [];
      try { const h = JSON.parse(String(here)); if (h && inDomain(String(h.host), domain) && Array.isArray(h.items)) origins.push({ origin: h.origin, local_storage: h.items.slice(0, 500) }); } catch { /* no storage */ }
      return { cookies: keep, origins, saved_at: new Date().toISOString() };
    }),
    importState: (id, state) => withPage(id, async (cdp, sid) => {
      if (state.cookies && state.cookies.length) await cdp.send("Storage.setCookies", { cookies: state.cookies.map(cookieParam) });
      for (const o of state.origins || []) {
        const loaded = cdp.waitFor("Page.loadEventFired", sid, 30000);
        await cdp.send("Page.navigate", { url: o.origin + "/" }, sid); await loaded;
        await cdp.eval(sid, `(() => { const items = ${JSON.stringify(o.local_storage || [])}; try { for (const [k, v] of items) localStorage.setItem(k, v); } catch (e) {} return true; })()`).catch(() => false);
      }
    }),
    async stop(id) {
      try { await f(`${BB_API}/sessions/${encodeURIComponent(id)}`, { method: "POST", headers: headers(), body: JSON.stringify({ projectId: project, status: "REQUEST_RELEASE" }) }); } catch { /* best effort */ }
    },
  };
}
