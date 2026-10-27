// FEATURE NEEDS (2026-10-26): what a mail connector is. Google (Gmail) is the only one today (./google.ts); Microsoft
// (Outlook, through Microsoft Graph) is planned and plugs in as one more Connector in ./index.ts, with no change to the
// chat (career_connectors.ts), the link (career_connect_links.connector) or the callback (career_connect_flow.ts).
// Tokens never leave a connector's own exchange and disconnect calls and the vault (./grant_store.ts): nothing here
// returns a token to a caller that shows text to the person or to a model.

// The capabilities a need asks for, in Trainee's words; each connector maps them to its own scopes.
export type Capability = "read" | "send";
export interface Exchanged {
  access_token: string;
  refresh_token: string | null;
  expires_in: number;
  // What the provider says this grant now holds (all of it, earlier grants included), or null when it does not say.
  granted: string[] | null;
  email: string | null;
}
export interface Env { get(k: string): string | undefined }
export interface Connector {
  id: string; // career_connect_links.connector
  label: string; // what the person sees ("Gmail")
  provider: string; // user_oauth_connections.provider and the vault name's middle (oauth_<provider>_<user>)
  legacyProviders: string[]; // older grants of the same account a disconnect also removes
  env: { clientId: string; clientSecret: string };
  scopes: Record<Capability, string>;
  // What a consent may ask for now (the approved list, plus what the owner has said was approved since), from what a
  // need asked for; `dropped` is what was asked and may not be asked yet.
  requestable(asked: string[], env: Env): { scopes: string[]; dropped: string[] };
  // Every scope the database may ever record on a link (the approved list and the deferred ones).
  allScopes(): string[];
  // What the person reads before consent and in the chat, for these scopes: what is read, what never happens, how to undo.
  notice(scopes: string[]): { reads: string[]; never: string[]; undo: string[] };
  consentUrl(o: { clientId: string; redirectUri: string; scopes: string[]; state: string }): string;
  exchange(o: { fetch: typeof fetch; code: string; clientId: string; clientSecret: string; redirectUri: string }): Promise<Exchanged>;
  // Revokes at the provider, deletes the stored tokens and rows, reads back what is left; the reply says only that.
  // deno-lint-ignore no-explicit-any
  disconnect(o: { admin: any; userId: string; fetch: typeof fetch }): Promise<{ reply: string; ok: boolean; had: string[] }>;
}
