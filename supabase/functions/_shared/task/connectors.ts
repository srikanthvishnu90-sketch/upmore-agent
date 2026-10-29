// Task intelligence: missing connectors are asked through K1's requireConnector(userId, capability) -> {ok} | {ask, link}
// (feat/connector-framework-20261027). Until K1 lands on trunk, this interim reader answers the same shape from the live
// grants (user_oauth_connections: Google career with gmail.send / gmail.readonly, Microsoft with Mail.Send / Mail.Read /
// Calendars, PR #226) and trunk's connect link and ask (agent/integrations.ts). It reads; it never connects anything.
// deno-lint-ignore-file no-explicit-any
import { connectUrl, missingIntegration } from "../agent/integrations.ts";
import type { RequireConnector } from "./registry.ts";
import { registry } from "./registry.ts";

const NEED: Record<string, { google: string[]; microsoft: string[] }> = {
  mail_send: { google: ["https://www.googleapis.com/auth/gmail.send"], microsoft: ["Mail.Send"] },
  mail_read: { google: ["https://www.googleapis.com/auth/gmail.readonly"], microsoft: ["Mail.Read"] },
  calendar: { google: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar"], microsoft: ["Calendars.ReadWrite"] },
};
const scopesOf = (r: any) => Array.isArray(r?.scopes) ? r.scopes.map(String) : String(r?.scopes ?? "").split(/[\s,]+/).filter(Boolean);

export function grantsConnector(admin: any): RequireConnector {
  const reg = registry();
  return async (userId, capability) => {
    const declared = reg.get(capability)?.requires.connectors ?? [];
    const needs = declared.length ? declared : ["mail_send"]; // connect.mail itself: a mailbox that can send
    const { data, error } = await admin.from("user_oauth_connections").select("provider,scopes").eq("user_id", userId).in("provider", ["google_career", "microsoft"]);
    const rows = error ? [] : (data ?? []);
    const has = (need: string) => rows.some((r: any) => {
      const s = scopesOf(r), want = r.provider === "microsoft" ? NEED[need]?.microsoft : NEED[need]?.google;
      return !!want && want.some((w) => s.includes(w));
    });
    const missing = needs.find((n) => !has(n));
    if (!missing && !error) return { ok: true };
    const kind = missing === "calendar" ? "calendar" : "gmail";
    return { ask: missingIntegration(kind), link: connectUrl(kind === "calendar" ? "google_calendar" : "gmail") };
  };
}
