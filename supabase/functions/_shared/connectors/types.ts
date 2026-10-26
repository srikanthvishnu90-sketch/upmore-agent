// FEATURE NEEDS (2026-10-26): what a mail connector is. Google (Gmail) is the only one today (./google.ts); Microsoft
// (Outlook, through Microsoft Graph) is planned and plugs in as one more Connector in ./index.ts, with no change to the
// chat (career_connectors.ts), the link (career_connect_links.connector) or the callback (career_connect_flow.ts).
// Tokens never leave a connector's own exchange, refresh and revoke calls and the vault: nothing here returns a token to
// a caller that shows text to the person or to a model.

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
export interface Connector {
  id: string; // career_connect_links.connector
  label: string; // what the person sees ("Gmail")
  provider: string; // user_oauth_connections.provider and the vault name's middle (oauth_<provider>_<user>)
  legacyProviders: string[]; // older grants of the same account a disconnect also removes
  env: { clientId: string; clientSecret: string };
  // The provider's scopes for each capability, and the identity scopes that name the connected address.
  scopes: Record<Capability, string>;
  identity: string[];
  // Every scope this connector may ever ask for (the audit list; the database check mirrors it).
  allScopes(): string[];
  // The plain words the person reads for each capability.
  words: Record<Capability, string>;
  consentUrl(o: { clientId: string; redirectUri: string; scopes: string[]; state: string }): string;
  exchange(o: { fetch: typeof fetch; code: string; clientId: string; clientSecret: string; redirectUri: string }): Promise<Exchanged>;
  // True: the provider confirmed the revoke (or no longer holds the token); false: it did not.
  revoke(o: { fetch: typeof fetch; token: string }): Promise<boolean>;
}
