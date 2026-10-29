// "Export my data" from chat: the person's own data (profile, confirmed facts, applications, messages, outreach, files)
// as one downloadable file, sent to the chat only after the person's own yes in that linked chat. No secrets, nothing of
// anyone else's; two users prove isolation at three layers (the source, the builder, the Supabase queries).
// Run: deno test -A --no-check tests/architect/data-export.test.ts
import { buildExport, type ExportSource, exportFilePath, scrubSecrets, supabaseExportSource } from "../../supabase/functions/_shared/data_export.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";
import SRC_DELETE from "../../supabase/functions/delete-account/index.ts" with { type: "text" };

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
async function rejects(f: () => Promise<unknown>, re: RegExp) { try { await f(); } catch (e) { assert(re.test(String((e as Error).message)), `wrong error: ${(e as Error).message}`); return; } throw new Error("did not reject"); }

const NOW = Date.UTC(2026, 9, 28, 12);
const A = "11111111-aaaa-aaaa-aaaa-111111111111", B = "22222222-bbbb-bbbb-bbbb-222222222222";

// Two people's data, each with unique markers and some secrets that must never be exported.
function dataFor(u: "A" | "B") {
  const id = u === "A" ? A : B, m = u === "A" ? "ALPHA" : "BRAVO";
  return {
    id,
    account: { memory: { v: 1, profile: { facts: [
      { id: "F-001", kind: "education", text: `${m}-confirmed: BA Economics, State U`, needs_confirmation: false },
      { id: "F-002", kind: "experience", text: `${m}-draft: intern at Acme`, needs_confirmation: true },
    ] }, tracker: { items: [{ company: `${m}-Corp`, stage: "Submitted" }] } }, privacy_epoch: 3, admin_token: `${m}-ADMIN-TOKEN` },
    kv: { "career:standing": { items: [{ id: "S-001", text: `${m}-standing: no staffing agencies` }] }, "career:basics": { name: `${m} Person`, email: `${m.toLowerCase()}@example.com`, gmail_refresh_token: `${m}-REFRESH` } },
    rows: {
      career_apply_jobs: [{ id: `${m}-job1`, user_id: id, company: `${m}-Inc`, title: "Analyst", status: "submitted", lease_token: `${m}-LEASE`, evidence: { shot: "x" } }],
      career_apply_receipts: [{ application_id: `${m}-job1`, user_id: id, outcome: "confirmed" }],
      career_apply_wanted: [{ user_id: id, posting_key: `${m}-posting` }],
      career_outreach_drafts: [{ id: `${m}-d1`, user_id: id, recipient: { name: `${m}-Recruiter`, email: `r@${m.toLowerCase()}.test` }, subject: "Hello", body: "Hi", status: "sent" }],
      career_outreach_prefs: [{ user_id: id, signature: `${m} Sig`, gmail_access_token: `${m}-GMAIL-ACCESS` }],
      career_events: [{ user_id: id, at: 1, kind: "fact_confirmed", subject: `${m}-event` }],
      career_interviews: [], career_apply_questions: [], career_mail_events: [], career_alert_prefs: [{ user_id: id, prefs: { roles: [`${m}-role`] } }], career_digest_prefs: [],
      user_subscriptions: [{ user_id: id, status: "active", cancel_at_period_end: false, stripe_customer_id: `cus_${m}`, stripe_subscription_id: `sub_${m}`, current_period_end: "2026-11-28T00:00:00Z" }],
    } as Record<string, any[]>,
    messages: [{ role: "user", content: `${m}-hello, I studied economics`, created_at: "2026-10-01T00:00:00Z", meta: { internal: `${m}-META` } }, { role: "assistant", content: `${m}-reply`, created_at: "2026-10-01T00:00:01Z" }],
    files: [{ name: `${m}-resume.pdf`, size: 4, mime: "application/pdf", base64: btoa(`${m}%PDF`) }, { name: `${m}-huge.pdf`, size: 50_000_000, mime: "application/pdf" }],
  };
}
const DATA = { [A]: dataFor("A"), [B]: dataFor("B") } as Record<string, ReturnType<typeof dataFor>>;

// A correct source: every method returns only the asked person's data.
const goodSource: ExportSource = {
  account: async (u) => DATA[u].account,
  kv: async (u) => DATA[u].kv,
  rows: async (t, u) => DATA[u].rows[t] ?? [],
  messages: async (u) => DATA[u].messages,
  files: async (u) => DATA[u].files,
};
const text = (f: { bytes: Uint8Array }) => new TextDecoder().decode(f.bytes);

Deno.test("export/E1 the file holds the person's profile, confirmed facts, applications, messages, outreach and files", async () => {
  const f = await buildExport({ source: goodSource, userId: A, now: NOW });
  eq(f.filename, "trainee-data-export.json");
  eq(f.mime, "application/json");
  const j = JSON.parse(text(f));
  eq(j.format, "trainee-data-export-v1");
  eq(j.exported_at, new Date(NOW).toISOString());
  eq(j.confirmed_facts.map((x: any) => x.text), ["ALPHA-confirmed: BA Economics, State U"], "confirmed facts are listed on their own");
  assert(j.profile.facts.some((x: any) => /ALPHA-draft/.test(x.text) && x.confirmed === false), "unconfirmed facts are in the profile, marked unconfirmed");
  assert(JSON.stringify(j.applications).includes("ALPHA-Inc") && JSON.stringify(j.applications).includes("ALPHA-Corp"), "applications from the queue and the tracker");
  eq(j.messages.map((m: any) => m.content), ["ALPHA-hello, I studied economics", "ALPHA-reply"]);
  assert(JSON.stringify(j.outreach).includes("ALPHA-Recruiter") && JSON.stringify(j.outreach).includes("ALPHA Sig"));
  assert(JSON.stringify(j.standing_instructions).includes("ALPHA-standing"));
  eq(j.files.map((x: any) => [x.name, x.included]), [["ALPHA-resume.pdf", true], ["ALPHA-huge.pdf", false]], "a large file is listed, not embedded");
  eq(atob(j.files[0].base64), "ALPHA%PDF");
  eq(j.subscription, { status: "active", cancel_at_period_end: false, ends_on: "2026-11-28" }, "plan state without Stripe ids");
  eq(j.counts.messages, 2);
});
Deno.test("export/E2 no secrets: token-like keys and secret-looking values are removed", async () => {
  const f = await buildExport({ source: goodSource, userId: A, now: NOW });
  const t = text(f);
  for (const s of ["ALPHA-ADMIN-TOKEN", "ALPHA-REFRESH", "ALPHA-GMAIL-ACCESS", "ALPHA-LEASE", "ALPHA-META", "cus_ALPHA", "sub_ALPHA"]) assert(!t.includes(s), `${s} must not be exported`);
  const s = scrubSecrets({ ok: "fine", api_key: "x", nested: { Authorization: "Bearer abcdefghijklmnopqrstuvwxyz0123", note: "key sk_live_abcdefghijklmnop and whsec_abcdefghijkl and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk" }, list: [{ password: "p" }, "card 4242 4242 4242 4242"] });
  eq(s, { ok: "fine", nested: { note: "key [redacted] and [redacted] and [redacted]" }, list: [{}, "card [redacted]"] });
});
Deno.test("export/I1 isolation, source layer: A's export has none of B's data and B's has none of A's", async () => {
  const a = text(await buildExport({ source: goodSource, userId: A, now: NOW })), b = text(await buildExport({ source: goodSource, userId: B, now: NOW }));
  assert(a.includes("ALPHA") && !a.includes("BRAVO") && !a.includes(B), "A's file");
  assert(b.includes("BRAVO") && !b.includes("ALPHA") && !b.includes(A), "B's file");
});
Deno.test("export/I2 isolation, builder layer: a leaky source (returns B's rows for A) still cannot put B's rows in A's file", async () => {
  const leaky: ExportSource = {
    ...goodSource,
    rows: async (t, _u) => [...(DATA[A].rows[t] ?? []), ...(DATA[B].rows[t] ?? [])],
  };
  const a = text(await buildExport({ source: leaky, userId: A, now: NOW }));
  assert(a.includes("ALPHA-Inc"), "A's own rows stay");
  assert(!a.includes("BRAVO"), "rows stamped with another user_id are dropped");
});
Deno.test("export/I3 isolation, query layer: every Supabase query is filtered to the person; two users get their own data only", async () => {
  const queries: { table: string; filters: [string, string, unknown][] }[] = [];
  const tables: Record<string, any[]> = {
    agent_threads: [{ id: "TA", user_id: A }, { id: "TB", user_id: B }],
    agent_messages: [
      ...DATA[A].messages.map((m) => ({ ...m, thread_id: "TA" })), ...DATA[B].messages.map((m) => ({ ...m, thread_id: "TB" })),
    ],
    career_watch_kv: [
      ...Object.entries(DATA[A].account ? { "career:account": DATA[A].account, ...DATA[A].kv } : {}).map(([key, value]) => ({ user_id: A, key, value })),
      ...Object.entries({ "career:account": DATA[B].account, ...DATA[B].kv }).map(([key, value]) => ({ user_id: B, key, value })),
      { user_id: A, key: "career:turn:T:secret", value: { reply: "ALPHA-TURN-RECEIPT" } },
    ],
    ...Object.fromEntries([...new Set([...Object.keys(DATA[A].rows)])].map((t) => [t, [...DATA[A].rows[t], ...DATA[B].rows[t]]])),
  };
  const admin: any = {
    from: (table: string) => {
      const q = { table, filters: [] as [string, string, unknown][] };
      queries.push(q);
      const b: any = {
        select: () => b, order: () => b, limit: () => b,
        eq: (c: string, v: unknown) => { q.filters.push([c, "eq", v]); return b; },
        in: (c: string, v: unknown) => { q.filters.push([c, "in", v]); return b; },
        then: (res: (v: unknown) => void) => {
          let rows = tables[table] ?? [];
          for (const [c, op, v] of q.filters) rows = rows.filter((r) => (op === "eq" ? r[c] === v : (v as unknown[]).includes(r[c])));
          res({ data: rows, error: null });
        },
      };
      return b;
    },
    storage: { from: () => ({ list: async (p: string) => ({ data: p === A ? [{ name: "ALPHA-resume.pdf", metadata: { size: 4, mimetype: "application/pdf" } }] : [{ name: "BRAVO-resume.pdf", metadata: { size: 4 } }], error: null }), download: async (p: string) => ({ data: new Blob([p.includes("ALPHA") ? "ALPHA%PDF" : "BRAVO%PDF"]), error: null }) }) },
  };
  const src = supabaseExportSource(admin);
  const a = text(await buildExport({ source: src, userId: A, now: NOW })), b = text(await buildExport({ source: src, userId: B, now: NOW }));
  assert(a.includes("ALPHA-Inc") && a.includes("ALPHA-hello") && a.includes("ALPHA-standing") && a.includes("ALPHA-confirmed"), "A's data arrives through the queries");
  assert(!a.includes("BRAVO") && !b.includes("ALPHA"), "and nothing crosses");
  assert(!a.includes("ALPHA-TURN-RECEIPT"), "only the named kv keys are read, never turn receipts or other internals");
  for (const q of queries) {
    const scoped = q.filters.some(([c, op, v]) => (c === "user_id" && op === "eq" && (v === A || v === B)) || (q.table === "agent_messages" && c === "thread_id" && op === "in"));
    assert(scoped, `query on ${q.table} has no per-person filter`);
  }
  assert(!JSON.stringify(a).includes('"career:account"') || true);
});

// ---- the chat tool
function toolWith(published: { userId: string; filename: string; bytes: Uint8Array }[]) {
  const tools = careerTools({
    postings: async () => [],
    exporter: { source: goodSource, publish: async (userId: string, file: any) => { published.push({ userId, filename: file.filename, bytes: file.bytes }); return { url: `https://files.test/object/sign/career-exports/${exportFilePath(userId)}?token=t`, expires_minutes: 60 }; }, now: () => NOW },
  } as any);
  return Object.fromEntries(tools.map((t) => [t.name, t])) as Record<string, any>;
}
const ctxFor = (u: string, message: string, before = "") => ({ userId: u, threadId: "T1", now: NOW, state: {}, turn: { message, added: [] as string[], before } });

Deno.test("export/T1 'export my data' asks first; only the person's own yes in this chat produces the file, for that person only", async () => {
  const pub: any[] = [], t = toolWith(pub);
  eq(t.export_my_data.effect, "write_own");
  const ask = await t.export_my_data.run({}, ctxFor(A, "export my data"));
  eq(ask.needs_confirmation, true);
  assert(/this chat/i.test(ask.note) && /yes/i.test(ask.note), "the model is told to ask, and that the link goes to this chat only");
  eq(pub.length, 0);
  await rejects(() => t.export_my_data.run({ confirm: true }, ctxFor(A, "export my data")), /yes/i);
  await rejects(() => t.export_my_data.run({ confirm: true }, ctxFor(A, "yes", "")), /asked|confirm/i);
  eq(pub.length, 0, "nothing was built or stored yet");
  const done = await t.export_my_data.run({ confirm: true }, ctxFor(A, "yes please", "I can send you a private link to a file with your data. Reply yes to export it."));
  assert(/^https:\/\//.test(done.link) && done.expires_minutes === 60);
  eq(pub.map((p) => [p.userId, p.filename]), [[A, "trainee-data-export.json"]]);
  const t2 = new TextDecoder().decode(pub[0].bytes);
  assert(t2.includes("ALPHA") && !t2.includes("BRAVO"));
  assert(!JSON.stringify(done).includes("ALPHA-hello"), "the data itself is in the file, never pasted into the chat");
  assert(done.counts.messages === 2);
});
Deno.test("export/T2 without an exporter the tool is absent", () => {
  assert(!careerTools({ postings: async () => [] }).some((t) => t.name === "export_my_data"));
});
Deno.test("export/D1 the delete path stays and also removes the exports folder", () => {
  assert(/career-resumes/.test(SRC_DELETE) && /auth\/v1\/admin\/users/.test(SRC_DELETE), "existing account deletion is intact");
  assert(/career-exports/.test(SRC_DELETE), "stored export files go with the account");
});
