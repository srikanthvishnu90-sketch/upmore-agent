// FEATURE NEEDS (2026-10-26): a connector's grant, stored the one way Trainee stores grants: the tokens encrypted in the
// person's own Supabase Vault entry (oauth_<provider>_<user>, written and read only through the service-role
// oauth_vault_* functions), and a user_oauth_connections row that holds no token, only the entry's name, the address
// and the scopes the provider says were granted. This file is the only place in the connect flow that decrypts a token
// (to keep an existing refresh token; disconnect is the connector's own: connectors/google.ts); nothing it returns carries a token.
import type { Connector, Exchanged } from "./types.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;
export const vaultName = (c: Connector, userId: string) => `oauth_${c.provider}_${userId}`;
const split = (s: unknown) => (Array.isArray(s) ? s.map(String) : String(s ?? "").split(/[\s,]+/)).filter(Boolean);

export interface Grant { email: string | null; scopes: string[]; connected_at: string | null; providers: string[] }
// The person's grants for this connector (its own and any legacy one), or null when there are none.
export async function readGrant(admin: Admin, c: Connector, userId: string): Promise<Grant | null> {
  const { data, error } = await admin.from("user_oauth_connections").select("provider,email,scopes,connected_at").eq("user_id", userId).in("provider", [c.provider, ...c.legacyProviders]);
  if (error) throw new Error(`read the ${c.label} grant: ${error.message}`);
  const rows = (data ?? []) as { provider: string; email: string | null; scopes: unknown; connected_at: string | null }[];
  if (!rows.length) return null;
  const own = rows.find((r) => r.provider === c.provider) ?? null;
  return { email: own?.email ?? rows[0].email ?? null, scopes: own ? split(own.scopes) : [], connected_at: own?.connected_at ?? null, providers: rows.map((r) => r.provider) };
}

// Stores what the provider returned; keeps the refresh token already stored when the provider sent none (Google sends
// one only on the first consent). Returns the scopes recorded.
export async function storeGrant(admin: Admin, c: Connector, o: { userId: string; ex: Exchanged; asked: string[]; now: number }): Promise<string[]> {
  const vault = vaultName(c, o.userId);
  const prior = await admin.from("user_oauth_connections").select("scopes").eq("user_id", o.userId).eq("provider", c.provider).maybeSingle();
  const granted = o.ex.granted ?? [...new Set([...split(prior.data?.scopes), ...o.asked])];
  let refresh = o.ex.refresh_token;
  if (!refresh) {
    const old = await admin.rpc("oauth_vault_read", { p_name: vault });
    try { refresh = JSON.parse(String(old.data ?? "")).refresh_token ?? null; } catch { refresh = null; }
  }
  const stored = await admin.rpc("oauth_vault_store", { p_name: vault, p_secret: JSON.stringify({ access_token: o.ex.access_token, refresh_token: refresh,
    expires_at: o.now + o.ex.expires_in * 1000, email: o.ex.email, scopes: granted.join(" ") }) });
  if (stored.error) throw new Error("save the grant");
  const row = await admin.from("user_oauth_connections").upsert({ user_id: o.userId, provider: c.provider, vault_name: vault, email: o.ex.email,
    scopes: granted.join(" "), connected_at: new Date(o.now).toISOString() }, { onConflict: "user_id,provider" });
  if (row.error) throw new Error("record the connection");
  return granted;
}
