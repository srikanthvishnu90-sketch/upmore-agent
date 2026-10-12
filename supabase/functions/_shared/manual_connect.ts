// Guided manual connect, the machinery (owner addendum 2026-10-11; decision 1: no password storage, session-only).
// packages/domain/78-manual-connect.js is the policy (bundled in router_core): consent, read-only, session health, the
// honest status line and the log scrubber. This file is the HTTP side and the scheduled health check:
//   POST /functions/v1/manual-connect (verify_jwt on; the person is the verified JWT's user, never a body field)
//     { action: "status" }                                        every playbook platform with the person's state
//     { action: "consent", platform_id, accepted: true }          records the consent text verbatim; no yes, nothing
//     { action: "start", platform_id }                            opens the platform's own sign-in page in a live
//                                                                 Browserbase window and returns its live-view URL; the
//                                                                 person logs in and does their own 2FA there
//     { action: "check", platform_id }                            "I'm signed in": tests the page; signed in saves the
//                                                                 browser session (cookies, storage) encrypted in Vault
//                                                                 and closes the window; on a stored session it is a
//                                                                 health check
//     { action: "read", platform_id, verb? }                      restores the session and reads balances and holdings
//                                                                 with their as-of time; read verbs only
//     { action: "disconnect", platform_id }                       deletes the Vault session at once; state revoked
//   runManualHealth: the scheduled check (agent-proactive runs it hourly; a session is due every 6 hours), telling the
//   person once when they are signed out or the page changed.
// Upmore never types into the window, never asks for a password or a code, and never places an order, moves money or
// changes a setting there. Every log line goes through ManualConnect.scrub. A step that is not live answers NOT_WIRED.
import { ManualConnect, MANUAL_PLAYBOOKS_JSON } from "./router_core.js";

const MC: any = ManualConnect;
export const ACTIONS = ["status", "consent", "start", "check", "read", "disconnect"] as const;
// Only playbooks that pass the policy's own validation are offered.
export const PLAYBOOKS: any[] = (MANUAL_PLAYBOOKS_JSON as any[]).filter((p) => MC.validatePlaybook(p).length === 0);
export const playbookFor = (id: unknown) => (typeof id === "string" ? PLAYBOOKS.find((p) => p.platform_id === id) || null : null);
export const playbookStatus = (pb: any) => (pb.verified ? "verified playbook" : "unverified playbook");
export const vaultName = (userId: string, platformId: string) => `manual_${userId}_${platformId}`;
// The platform's own registrable domain (two labels is enough for the playbooks on file): cookies outside it are dropped.
export function siteDomain(pb: any): string { const h = new URL(pb.login_url).hostname.toLowerCase(); return h.split(".").slice(-2).join("."); }

export interface SessionState { cookies: any[]; origins: { origin: string; local_storage: [string, string][] }[]; saved_at: string }
// The live window. Production: Browserbase over CDP (_shared/manual_browser.ts). Tests: a MOCK.
export interface ManualBrowser {
  configured(): boolean;
  create(): Promise<string>;                          // a keepAlive window; returns its id
  liveViewUrl(id: string): Promise<string>;          // the URL the person opens to use the window themselves
  goto(id: string, url: string): Promise<void>;
  click(id: string, alternatives: string[]): Promise<boolean>; // a link to reach sign-in; never a button that changes anything
  text(id: string): Promise<string>;                 // the visible text of the page now
  exportState(id: string, domain: string): Promise<SessionState>;
  importState(id: string, state: SessionState): Promise<void>;
  stop(id: string): Promise<void>;
}
export interface ManualRow { user_id: string; platform_id: string; state: string; consent_version: string; consent_text: string; consent_at: string; vault_name: string | null; window_id: string | null; last_checked: string | null; failures: number; told_signed_out: boolean }
export interface ManualDb {
  get(userId: string, platformId: string): Promise<ManualRow | null>;
  list(userId: string): Promise<ManualRow[]>;
  upsert(row: Partial<ManualRow> & { user_id: string; platform_id: string }): Promise<void>;
  update(userId: string, platformId: string, patch: Partial<ManualRow>): Promise<void>;
  due(limit: number): Promise<ManualRow[]>;
  vaultStore(name: string, secret: string): Promise<void>;
  vaultRead(name: string): Promise<string | null>;
  vaultDelete(name: string): Promise<void>;
}
const T = "manual_connections";
export function manualDb(admin: any): ManualDb {
  const stamp = () => new Date().toISOString();
  return {
    async get(u, p) { const r = await admin.from(T).select("*").eq("user_id", u).eq("platform_id", p).maybeSingle(); if (r.error) throw new Error("connections unavailable"); return r.data || null; },
    async list(u) { const r = await admin.from(T).select("platform_id,state,last_checked,told_signed_out").eq("user_id", u); if (r.error) throw new Error("connections unavailable"); return r.data || []; },
    async upsert(row) { const r = await admin.from(T).upsert(Object.assign({}, row, { updated_at: stamp() }), { onConflict: "user_id,platform_id" }); if (r.error) throw new Error("connection could not be saved"); },
    async update(u, p, patch) { const r = await admin.from(T).update(Object.assign({}, patch, { updated_at: stamp() })).eq("user_id", u).eq("platform_id", p); if (r.error) throw new Error("connection could not be saved"); },
    async due(limit) { const r = await admin.from(T).select("*").eq("state", "connected").order("last_checked", { ascending: true, nullsFirst: true }).limit(limit); if (r.error) throw new Error("connections unavailable"); return r.data || []; },
    // The session goes to Vault and comes back only here; an error never carries it into a log.
    async vaultStore(name, secret) { const r = await admin.rpc("manual_vault_store", { p_name: name, p_secret: secret }); if (r.error) throw new Error("session could not be saved"); },
    async vaultRead(name) { const r = await admin.rpc("manual_vault_read", { p_name: name }); if (r.error) throw new Error("session unavailable"); return typeof r.data === "string" && r.data ? r.data : null; },
    async vaultDelete(name) { const r = await admin.rpc("manual_vault_delete", { p_name: name }); if (r.error) throw new Error("session could not be deleted"); },
  };
}

// The row as the policy's session, and back.
const toSession = (r: ManualRow | null) => r ? { state: r.state, last_checked: r.last_checked ? Date.parse(r.last_checked) : null, told_signed_out: !!r.told_signed_out, failures: r.failures || 0 } : null;
const fromSession = (s: any) => ({ state: s.state, last_checked: s.last_checked ? new Date(s.last_checked).toISOString() : null, failures: s.failures, told_signed_out: s.told_signed_out });
export const fmtTime = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms)).replace(/[  ]/g, " ") + " UTC";
export const statusLine = (pb: any, row: ManualRow | null, now: number) => MC.statusLine(pb.display_name, toSession(row), now, fmtTime);

// What the page shows: a sign-in text means signed out (marketing pages show "Portfolio" too); otherwise a signed-in
// text means signed in; neither is a page that changed or did not load.
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s: string) => String(s || "").replace(/\s+/g, " ").toLowerCase();
export function detect(text: string, pb: any): { signed_in: boolean; signed_out: boolean } {
  const t = norm(text);
  const has = (s: string) => String(s).split("|").some((alt) => { const a = norm(alt).trim(); return !!a && new RegExp("(^|[^a-z0-9])" + escapeRe(a) + "([^a-z0-9]|$)").test(t); });
  const out = (pb.signed_out_when || []).some(has), inn = (pb.signed_in_when || []).some(has);
  return { signed_out: out, signed_in: inn && !out };
}

// The numbers next to the playbook's labels, in integer cents, never re-estimated. A label with no number is reported
// missing, never guessed.
const MONEY = /([-−])?\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/;
const toCents = (m: RegExpExecArray) => { const c = Number(m[2].replace(/,/g, "")) * 100 + (m[3] ? Number(m[3].padEnd(2, "0")) : 0); return m[1] ? -c : c; };
export const money = (c: number) => (c < 0 ? "-$" : "$") + Math.floor(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(Math.abs(c) % 100).padStart(2, "0");
// Same text, same indexes: the label is found in the text it is sliced from.
function labelAt(text: string, label: string): number { return text.toLowerCase().indexOf(String(label).toLowerCase()); }
export function extract(pages: Record<string, string>, pb: any, readAt: number) {
  const balances: any[] = [], positions: any[] = [], missing: string[] = [];
  let asOfText: string | null = null;
  for (const r of pb.reads || []) {
    const raw = String(pages[r.page] || "").replace(/\r/g, ""), flat = raw.replace(/[ \t]+/g, " ");
    for (const label of r.labels || []) {
      const at = labelAt(flat, label);
      if (at < 0) { missing.push(`${r.field}: ${label}`); continue; }
      const after = flat.slice(at + label.length);
      if (r.field === "balance") {
        const m = MONEY.exec(after.slice(0, 240));
        if (m) balances.push({ label, amount_cents: toCents(m), amount: money(toCents(m)) }); else missing.push(`balance: ${label}`);
      } else if (r.field === "position") {
        const found: any[] = [];
        for (const line of after.split("\n").slice(1, 41)) {
          const m = MONEY.exec(line); if (!m) continue;
          const name = line.replace(MONEY, "").replace(/\s+/g, " ").trim().slice(0, 80);
          if (name) found.push({ label, name, amount_cents: toCents(m), amount: money(toCents(m)) });
          if (found.length >= 50) break;
        }
        if (found.length) positions.push(...found); else missing.push(`position: ${label}`);
      } else if (r.field === "as_of" && !asOfText) {
        const line = after.split("\n")[0].replace(/^[\s:]+/, "").trim().slice(0, 60);
        if (line) asOfText = line; else missing.push(`as_of: ${label}`);
      }
    }
  }
  // A page date counts only with its year written out ("Sep 30" alone would parse as some other year).
  const pageDate = asOfText && /\b(?:19|20)\d{2}\b/.test(asOfText) ? Date.parse(asOfText) : NaN;
  // One holding is one holding, whichever label it was found under; one label is one balance.
  const uniq = (xs: any[], key: (x: any) => string) => { const seen = new Set<string>(); return xs.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
  return {
    balances: uniq(balances, (b) => b.label.toLowerCase()), positions: uniq(positions, (p) => `${p.name.toLowerCase()}|${p.amount_cents}`), missing,
    // The as-of time is the page's own date when it states one, otherwise the moment Upmore read the page.
    as_of: Number.isFinite(pageDate) ? new Date(pageDate).toISOString() : new Date(readAt).toISOString(),
    as_of_basis: Number.isFinite(pageDate) ? "the page's own date" : "read time",
    as_of_page_text: asOfText,
    read_at: new Date(readAt).toISOString(),
  };
}

// Every log line, scrubbed. Never page text, never a URL with a token, never the session.
export type Logger = (line: string) => void;
export const makeLog = (sink?: Logger) => (entry: Record<string, unknown>) => (sink || console.log)(JSON.stringify(MC.scrub(Object.assign({ fn: "manual-connect" }, entry))));

const SECRET_FIELD = /pass(?:word|wd|code)|otp|one_?time|^code$|^pin$|^username$|^login$|credential|cookie|^session$/i;
const NOT_WIRED_TEXT = "The live sign-in window isn't switched on yet (no Browserbase keys on this project), so nothing was opened and nothing was connected.";

// One health check of a stored session: restore it in a fresh window, open the first reading page, see what it shows.
export async function healthCheck(d: { db: ManualDb; browser: ManualBrowser; log: (e: Record<string, unknown>) => void }, row: ManualRow, pb: any, now: number) {
  const platform = pb.display_name;
  let det = { signed_in: false, signed_out: false };
  const raw = await d.db.vaultRead(vaultName(row.user_id, row.platform_id)).catch(() => undefined);
  if (raw === null) det = { signed_in: false, signed_out: true }; // the session is gone: signed out, honestly
  else if (raw !== undefined) {
    let id: string | null = null;
    try {
      id = await d.browser.create();
      await d.browser.importState(id, JSON.parse(raw));
      await d.browser.goto(id, (pb.reads[0] && pb.reads[0].page) || pb.login_url);
      det = detect(await d.browser.text(id), pb);
      if (det.signed_in) {
        // Sites rotate cookies; the fresh session replaces the old one so it keeps working.
        const fresh = await d.browser.exportState(id, siteDomain(pb)).catch(() => null);
        if (fresh && fresh.cookies.length) await d.db.vaultStore(vaultName(row.user_id, row.platform_id), JSON.stringify(fresh)).catch(() => d.log({ event: "session_refresh_failed", platform: row.platform_id }));
      }
    } catch { det = { signed_in: false, signed_out: false }; /* did not load: a blip, then broken */ }
    finally { if (id) await d.browser.stop(id).catch(() => {}); }
  }
  const before = row.last_checked;
  const r = MC.onCheck(toSession(row), Object.assign({ platform }, det), now);
  d.log({ event: "health", platform: row.platform_id, state: r.session.state, signed_in: det.signed_in, signed_out: det.signed_out });
  return { session: r.session, message: r.message as string | null, det, before };
}

export interface HandlerDeps { cors: Record<string, string>; user: (jwt: string) => Promise<{ id: string } | null>; db: ManualDb; browser: ManualBrowser; now?: () => number; log?: Logger }
export async function handleManualConnect(req: Request, deps: HandlerDeps): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...deps.cors, "content-type": "application/json", "cache-control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: deps.cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const m = (req.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const user = m ? await deps.user(m[1]).catch(() => null) : null;
  if (!user) return json({ error: "Sign in required" }, 401);
  const log = makeLog(deps.log), now = (deps.now || Date.now)();
  let body: any;
  try { const raw = await req.text(); if (raw.length > 2000) return json({ error: "request too large" }, 413); body = raw ? JSON.parse(raw) : {}; } catch { return json({ error: "invalid request" }, 400); }
  if (!body || typeof body !== "object") return json({ error: "invalid request" }, 400);
  // No password storage (decision 1): a password or a code sent here is refused, never read, stored or logged.
  if (Object.keys(body).some((k) => SECRET_FIELD.test(k))) { log({ event: "refused_secret_field", action: String(body.action || "") }); return json({ ok: false, code: "no_passwords", text: "Upmore never takes a password or a code. Log in yourself in the sign-in window; nothing was stored." }, 400); }
  const action = String(body.action || "");
  // Read-only, whatever is asked: a write verb is refused before anything else.
  if (!(ACTIONS as readonly string[]).includes(action)) {
    const a = MC.allow(action);
    return a.ok ? json({ error: "unknown action" }, 400) : json({ ok: false, code: a.code, text: a.text }, 403);
  }
  try {
    if (action === "status") {
      const rows = await deps.db.list(user.id);
      return json({ ok: true, consent_version: MC.CONSENT_VERSION, platforms: PLAYBOOKS.map((pb) => {
        const row = rows.find((r) => r.platform_id === pb.platform_id) || null;
        return { platform_id: pb.platform_id, display_name: pb.display_name, playbook_status: playbookStatus(pb), state: row ? row.state : "not_connected", status_line: statusLine(pb, row as ManualRow, now), consent_text: MC.consentText(pb.display_name), two_step: pb.two_step };
      }) });
    }
    const pb = playbookFor(body.platform_id);
    if (!pb) return json({ ok: false, code: "no_playbook", text: "That platform has no manual connect playbook, so it can't be connected this way. Nothing was opened." }, 404);
    const base = { platform_id: pb.platform_id, display_name: pb.display_name, playbook_status: playbookStatus(pb) };
    const row = await deps.db.get(user.id, pb.platform_id);
    const reply = (extra: Record<string, unknown>, status = 200, r: ManualRow | null = row) => json(Object.assign({}, base, extra, { status_line: statusLine(pb, r, now) }), status);

    if (action === "consent") {
      if (body.consent_version !== undefined && body.consent_version !== MC.CONSENT_VERSION) return reply({ ok: false, code: "consent_changed", text: "The consent text changed since you read it. Read the new one; nothing was connected." }, 409);
      const c = MC.consentRecord(pb.display_name, now, body.accepted);
      if (!c.ok) return reply({ ok: false, code: c.code, text: c.text }, 400);
      const fresh = !row || row.state === "revoked";
      const next: any = { user_id: user.id, platform_id: pb.platform_id, consent_version: c.record.version, consent_text: c.record.text, consent_at: c.record.accepted_at };
      if (fresh) Object.assign(next, { state: "pending_login", vault_name: null, window_id: null, last_checked: null, failures: 0, told_signed_out: false });
      await deps.db.upsert(next);
      log({ event: "consent", platform: pb.platform_id, state: fresh ? "pending_login" : row!.state, version: c.record.version });
      return reply({ ok: true, consent: { version: c.record.version, accepted_at: c.record.accepted_at } }, 200, Object.assign({}, row || {}, next));
    }

    if (action === "disconnect") {
      if (!row) return reply({ ok: true, state: "not_connected", text: `${pb.display_name} wasn't connected. Nothing to delete.` });
      if (row.window_id) await deps.browser.stop(row.window_id).catch(() => {});
      await deps.db.vaultDelete(vaultName(user.id, pb.platform_id));
      const next = Object.assign({}, row, { state: "revoked", vault_name: null, window_id: null });
      await deps.db.update(user.id, pb.platform_id, { state: "revoked", vault_name: null, window_id: null });
      log({ event: "disconnect", platform: pb.platform_id, state: "revoked" });
      return reply({ ok: true, state: "revoked", text: `Disconnected ${pb.display_name}: the session was deleted.` }, 200, next);
    }

    // Everything below needs a yes to the current consent.
    if (!row || row.state === "revoked" || row.consent_version !== MC.CONSENT_VERSION) return reply({ ok: false, code: "no_consent", text: `Nothing was opened: ${pb.display_name} connects only after you agree.`, consent_text: MC.consentText(pb.display_name), consent_version: MC.CONSENT_VERSION }, 412);

    if (action === "read") {
      const verb = body.verb === undefined ? "read_balances" : String(body.verb);
      const a = MC.allow(verb);
      if (!a.ok) return reply({ ok: false, code: a.code, text: a.text }, 403);
      if (row.state !== "connected") return reply({ ok: false, code: row.state, text: `${pb.display_name} isn't connected right now, so nothing was read.` }, 409);
      if (!deps.browser.configured()) return reply({ ok: false, code: "NOT_WIRED", text: NOT_WIRED_TEXT }, 503);
      const raw = await deps.db.vaultRead(vaultName(user.id, pb.platform_id));
      let det = { signed_in: false, signed_out: !raw }, pages: Record<string, string> = {}, id: string | null = null;
      if (raw) {
        try {
          id = await deps.browser.create();
          await deps.browser.importState(id, JSON.parse(raw));
          for (const page of [...new Set<string>(pb.reads.map((r: any) => r.page))]) {
            await deps.browser.goto(id, page);
            pages[page] = await deps.browser.text(id);
            if (Object.keys(pages).length === 1) { det = detect(pages[page], pb); if (!det.signed_in) break; }
          }
          if (det.signed_in) {
            const fresh = await deps.browser.exportState(id, siteDomain(pb)).catch(() => null);
            if (fresh && fresh.cookies.length) await deps.db.vaultStore(vaultName(user.id, pb.platform_id), JSON.stringify(fresh)).catch(() => {});
          }
        } catch { det = { signed_in: false, signed_out: false }; pages = {}; }
        finally { if (id) await deps.browser.stop(id).catch(() => {}); }
      }
      const r = MC.onCheck(toSession(row), Object.assign({ platform: pb.display_name }, det), now);
      const next = Object.assign({}, row, fromSession(r.session));
      await deps.db.update(user.id, pb.platform_id, fromSession(r.session));
      if (!det.signed_in) {
        log({ event: "read", platform: pb.platform_id, state: r.session.state, signed_out: det.signed_out });
        return reply({ ok: false, code: r.session.state, message: r.message, text: det.signed_out ? `${pb.display_name} signed you out, so nothing was read. Log in again to keep reading it.` : `${pb.display_name}'s page didn't show your account, so nothing was read. Nothing was changed.` }, 409, next);
      }
      const x = extract(pages, pb, now);
      log({ event: "read", platform: pb.platform_id, state: "connected", balances: x.balances.length, positions: x.positions.length, missing: x.missing.length });
      const source = `${pb.display_name}, manual session (${playbookStatus(pb)})`;
      const text = x.balances.length || x.positions.length
        ? `${source}, as of ${fmtTime(Date.parse(x.as_of))} (${x.as_of_basis}): ` + [...x.balances.map((b: any) => `${b.label} ${b.amount}`), ...(x.positions.length ? [`${x.positions.length} holding${x.positions.length === 1 ? "" : "s"}`] : [])].join(", ") + "."
        : `Signed in to ${pb.display_name}, but no number was found next to the playbook's labels; the playbook is unverified, so the page may differ. Nothing was guessed.`;
      return reply(Object.assign({ ok: true, read_only: true, source, text }, x), 200, next);
    }

    if (action === "start") {
      if (!deps.browser.configured()) { log({ event: "start", platform: pb.platform_id, result: "NOT_WIRED" }); return reply({ ok: false, code: "NOT_WIRED", text: NOT_WIRED_TEXT }, 503); }
      if (row.window_id) await deps.browser.stop(row.window_id).catch(() => {});
      let id: string | null = null, live: string;
      try {
        id = await deps.browser.create();
        await deps.browser.goto(id, pb.login_url);
        for (const s of pb.steps || []) if (s.kind === "click") await deps.browser.click(id, String(s.text).split("|")).catch(() => false);
        live = await deps.browser.liveViewUrl(id);
      } catch {
        if (id) await deps.browser.stop(id).catch(() => {});
        await deps.db.update(user.id, pb.platform_id, { window_id: null }).catch(() => {});
        log({ event: "start", platform: pb.platform_id, result: "window_failed" });
        return reply({ ok: false, code: "window_failed", text: `The sign-in window for ${pb.display_name} didn't open. Nothing was connected; try again in a moment.` }, 502);
      }
      await deps.db.update(user.id, pb.platform_id, { window_id: id });
      log({ event: "start", platform: pb.platform_id, state: row.state, result: "window_open" });
      return reply({ ok: true, live_view_url: live, two_step: pb.two_step, text: `Log in to ${pb.display_name} yourself in the window and do your own two-step check; Upmore types nothing and never sees your password. When you're in, tap "I'm signed in".` });
    }

    // check
    if (row.window_id) {
      const wid = row.window_id;
      let det = { signed_in: false, signed_out: false };
      try { det = detect(await deps.browser.text(wid), pb); } catch { /* the window closed or timed out */
        await deps.db.update(user.id, pb.platform_id, { window_id: null });
        log({ event: "check", platform: pb.platform_id, result: "window_gone" });
        return reply({ ok: false, code: "window_gone", text: "The sign-in window closed before you were signed in. Open it again; nothing was saved." }, 409, Object.assign({}, row, { window_id: null }));
      }
      if (!det.signed_in) {
        log({ event: "check", platform: pb.platform_id, result: "not_signed_in" });
        return reply({ ok: false, code: "not_signed_in", text: `You're not signed in to ${pb.display_name} yet. Finish in the window, then tap "I'm signed in" again. Nothing was saved.` }, 409);
      }
      const st = await deps.browser.exportState(wid, siteDomain(pb));
      if (!st || !Array.isArray(st.cookies) || !st.cookies.length) {
        log({ event: "check", platform: pb.platform_id, result: "no_session" });
        return reply({ ok: false, code: "no_session", text: `${pb.display_name} shows you signed in, but no session could be kept, so nothing was saved. The window is still open.` }, 409);
      }
      await deps.db.vaultStore(vaultName(user.id, pb.platform_id), JSON.stringify(st));
      const r = MC.onCheck(toSession(row), { platform: pb.display_name, signed_in: true }, now);
      const patch = Object.assign(fromSession(r.session), { vault_name: vaultName(user.id, pb.platform_id), window_id: null });
      await deps.db.update(user.id, pb.platform_id, patch);
      await deps.browser.stop(wid).catch(() => {});
      log({ event: "check", platform: pb.platform_id, state: "connected", result: "session_saved" });
      return reply({ ok: true, state: "connected", text: `Connected ${pb.display_name} (manual session, read-only). The window is closed; only the encrypted session is kept.` }, 200, Object.assign({}, row, patch));
    }
    if (row.state === "pending_login") return reply({ ok: false, code: "no_window", text: "Open the sign-in window first." }, 409);
    if (!deps.browser.configured()) return reply({ ok: false, code: "NOT_WIRED", text: NOT_WIRED_TEXT }, 503);
    const h = await healthCheck({ db: deps.db, browser: deps.browser, log }, row, pb, now);
    const next = Object.assign({}, row, fromSession(h.session));
    await deps.db.update(user.id, pb.platform_id, fromSession(h.session));
    return reply({ ok: h.session.state === "connected", state: h.session.state, message: h.message }, 200, next);
  } catch (e) {
    log({ event: "error", action, error: e instanceof Error ? e.message : "error" });
    return json({ ok: false, code: "error", text: "Something went wrong on Upmore's side. Nothing was changed; try again in a moment." }, 500);
  }
}

// ---- The scheduled health check (run hourly from agent-proactive; each session is due every 6 hours) ----
// The person hears once when they are signed out or the page changed: the policy's told_signed_out flag, and a delivery
// key unique to that episode in the once-only proactive log, so a retry or a second run never repeats it.
export interface HealthDeps { db: ManualDb; browser: ManualBrowser; deliver: (userId: string, msg: { key: string; kind: "connection"; text: string; capability_id: string | null; urgent: boolean; cadence: boolean; source: string; as_of: string }) => Promise<boolean>; now?: () => number; log?: Logger; limit?: number; deadline?: number }
export async function runManualHealth(d: HealthDeps) {
  const log = makeLog(d.log), now = (d.now || Date.now)();
  const totals = { checked: 0, connected: 0, needs_login: 0, broken: 0, told: 0, failed: 0, not_wired: false };
  if (!d.browser.configured()) { totals.not_wired = true; return totals; }
  const rows = (await d.db.due((d.limit || 20) * 5)).filter((r) => MC.due(toSession(r), now)).slice(0, d.limit || 20);
  for (const row of rows) {
    if (d.deadline && Date.now() > d.deadline) break;
    const pb = playbookFor(row.platform_id);
    if (!pb) continue;
    try {
      totals.checked++;
      const h = await healthCheck({ db: d.db, browser: d.browser, log }, row, pb, now);
      if (h.message) {
        const kind = h.session.state === "broken" ? "broken" : "signed_out";
        const ok = await d.deliver(row.user_id, { key: `manual:${row.platform_id}:${kind}:${h.before || "never"}`, kind: "connection", text: `${h.message} (${pb.display_name}, manual session; checked ${fmtTime(now)}.)`, capability_id: null, urgent: false, cadence: false, source: `${pb.display_name}, manual session`, as_of: new Date(now).toISOString() });
        if (ok) totals.told++;
      }
      await d.db.update(row.user_id, row.platform_id, fromSession(h.session));
      (totals as any)[h.session.state] = ((totals as any)[h.session.state] || 0) + 1;
    } catch (e) { totals.failed++; log({ event: "health_failed", platform: row.platform_id, error: e instanceof Error ? e.message : "error" }); }
  }
  return totals;
}
