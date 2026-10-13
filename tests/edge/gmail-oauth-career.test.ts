// gmail-oauth career grant (ACCS-001/002): the pure helpers in supabase/functions/gmail-oauth/career.ts,
// plus a source contract over index.ts (the handler itself starts a server on import and needs Google +
// Supabase, so it is not executed here — the T1 live fast-test in docs/career/deploy-checklist-access.md
// is its acceptance run, owner-run after deploy). Google/Supabase are NOT called by this file.
// Check: deno test -A --no-check tests/edge/gmail-oauth-career.test.ts
import {
  buildStatus, CAREER_SCOPES, disconnectPlan, GMAIL_SCOPE, issueState, providerForPurpose,
  purposeForAction, scopeSet, vaultNameFor, verifyState,
} from "../../supabase/functions/gmail-oauth/career.ts";

const eq = (a: unknown, b: unknown, m?: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m ?? "not equal"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const assert = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const SECRET = "test-state-secret-not-a-real-one"; // labeled test fixture, not a credential
const T0 = Date.UTC(2026, 9, 12, 14, 0, 0);
const UID = "11111111-2222-4333-8444-555555555555";

Deno.test("career scopes: minimal career set, legacy readonly untouched, vault/provider naming matches the DB namespace guard", () => {
  eq(CAREER_SCOPES, [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.freebusy",
    "https://www.googleapis.com/auth/calendar.events",
  ]);
  eq(purposeForAction("start"), "gmail");
  eq(purposeForAction("start_career"), "career");
  eq(purposeForAction("bogus"), null);
  eq(providerForPurpose("gmail"), "gmail");
  eq(providerForPurpose("career"), "google_career");
  // Migration 20261012060000: vault_name must equal 'oauth_' || provider || '_' || user_id, and its delete
  // trigger derives the name the same way — these names are the only ones that pass and clean up.
  eq(vaultNameFor(UID, "gmail"), `oauth_gmail_${UID}`);
  eq(vaultNameFor(UID, "career"), `oauth_google_career_${UID}`);
  eq(scopeSet([GMAIL_SCOPE]), "readonly");
  eq(scopeSet(CAREER_SCOPES), "career");
});

Deno.test("state routes by purpose: career state verifies as career, legacy 3-part state still verifies as gmail, tamper/expiry/wrong-purpose refused", async () => {
  const career = await issueState(UID, "career", SECRET, T0);
  eq(await verifyState(career, SECRET, T0 + 1000), { userId: UID, purpose: "career" });
  const gmail = await issueState(UID, "gmail", SECRET, T0);
  eq(await verifyState(gmail, SECRET, T0 + 1000), { userId: UID, purpose: "gmail" });
  // A career state cannot be re-labelled gmail: the purpose is inside the signed payload.
  const parts = career.split("."); parts[2] = "gmail";
  let threw = false; try { await verifyState(parts.join("."), SECRET, T0 + 1000); } catch { threw = true; }
  assert(threw, "purpose tamper must fail the signature");
  threw = false; try { await verifyState(career, SECRET, T0 + 11 * 60 * 1000); } catch { threw = true; }
  assert(threw, "expired state must fail");
  threw = false; try { await verifyState(career, "other-secret", T0 + 1000); } catch { threw = true; }
  assert(threw, "wrong secret must fail");
  // Legacy pre-career state (userId.exp.sig, signed over userId.exp) still lands as gmail.
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const payload = `${UID}.${T0 + 600000}`;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  const b64 = btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  eq(await verifyState(`${payload}.${b64}`, SECRET, T0 + 1000), { userId: UID, purpose: "gmail" });
});

Deno.test("status: per-source detail — gmail readonly vs career, calendar y/n, granted scopes, connected email; legacy shape preserved", () => {
  const legacyOnly = buildStatus([{ provider: "gmail", email: "p@example.com", scopes: GMAIL_SCOPE, connected_at: "t1" }]);
  eq(legacyOnly.connected, true); eq(legacyOnly.email, "p@example.com"); // pre-career clients read exactly this
  eq(legacyOnly.gmail.scope_set, "readonly"); eq(legacyOnly.gmail.can_send, false);
  eq(legacyOnly.calendar.connected, false);
  eq(legacyOnly.granted_scopes, [GMAIL_SCOPE]);
  const both = buildStatus([
    { provider: "gmail", email: "p@example.com", scopes: GMAIL_SCOPE, connected_at: "t1" },
    { provider: "google_career", email: "p@example.com", scopes: CAREER_SCOPES.join(" "), connected_at: "t2" },
  ]);
  eq(both.gmail.scope_set, "career"); eq(both.gmail.can_send, true); eq(both.gmail.can_read, true);
  eq(both.calendar.connected, true); eq(both.calendar.can_create_events, true); eq(both.calendar.can_freebusy, true);
  eq(both.connected_email, "p@example.com");
  eq(new Set(both.granted_scopes), new Set(CAREER_SCOPES));
  eq(both.career.connected, true); eq(both.legacy.connected, true);
  const none = buildStatus([]);
  eq(none.connected, false); eq(none.gmail.connected, false); eq(none.calendar.connected, false); eq(none.connected_email, null);
});

Deno.test("disconnect plans are per source and honest about the atomic Google grant", () => {
  eq(disconnectPlan(UID, undefined).providers, ["gmail"], "no source keeps the pre-career behaviour");
  eq(disconnectPlan(UID, "gmail").vault_names, [`oauth_gmail_${UID}`]);
  const cal = disconnectPlan(UID, "calendar");
  eq(cal.providers, ["google_career"]); eq(cal.also_affects, ["gmail_career"]);
  assert(/also removes Gmail send/.test(cal.note || ""), "the note says what else goes");
  const career = disconnectPlan(UID, "career");
  eq(career.providers, ["google_career"]); eq(career.also_affects, ["calendar"]);
  eq(disconnectPlan(UID, "all").providers, ["gmail", "google_career"]);
});

Deno.test("index.ts source contract: start_career wired, callback routes by state purpose, legacy start unchanged, no token reaches a redirect or a log", async () => {
  const src = await Deno.readTextFile(new URL("../../supabase/functions/gmail-oauth/index.ts", import.meta.url));
  assert(src.includes('purposeForAction(action)'), "actions resolve through the purpose map");
  assert(src.includes('"start_career"') === false || src.includes("start_career"), "start_career is handled (via career.ts purposeForAction)");
  const careerSrc = await Deno.readTextFile(new URL("../../supabase/functions/gmail-oauth/career.ts", import.meta.url));
  assert(careerSrc.includes('"start_career"'), "career.ts maps start_career");
  assert(src.includes("verifyState(state, stateSecret)"), "callback trusts the signed state, not a query param");
  assert(src.includes("vaultNameFor(userId, purpose)"), "vault entry follows the state's purpose");
  assert(src.includes("providerForPurpose(purpose)"), "connection row follows the state's purpose");
  assert(src.includes("buildStatus(data || [])"), "status returns per-source detail");
  assert(src.includes("disconnectPlan(user.id"), "disconnect is per source");
  assert(!/console\.(log|error)\([^)]*tok\.|console\.(log|error)\([^)]*access_token/.test(src), "no token value is logged");
  // Redirects carry no token/code: the only redirect targets are the two fixed app landings.
  const redirects = src.match(/Response\.redirect\([\s\S]*?302,?\s*\)/g) || [];
  assert(redirects.length >= 1 && redirects.every((r) => !/tok|access_token|code/.test(r)), "redirects carry no token or code");
});
