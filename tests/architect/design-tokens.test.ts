// Product requirements doc 3 (design), the parts that need no browser:
//   Q540/Q553  the brand's colour pairs meet WCAG by the relative-luminance formula: AA (4.5:1) for every text on its ground in
//              light and dark, AAA (7:1) for the action's text on plum; the plum itself clears 7:1 on white.
//   Q564/Q565/Q726  every page Trainee serves starts from the same tokens and carries the same mark (one identity).
//   Q547/Q576/Q718  every posting on the jobs page shows how fresh it is, from the posting's own date (else said as the day Trainee
//              first saw it), and an old one carries an age warning instead of a quiet removal. Checked through the page handler.
// Synthetic data only; no network, no database.
import assertNode from "node:assert/strict";
import { BRAND, contrast, DARK, LIGHT, PLUM, readablePairs, TOKENS_CSS } from "../../supabase/functions/_shared/brand.ts";
import { postedLine, renderFeed, renderLinkState, renderPhoneLogin } from "../../supabase/functions/_shared/file_page.ts";
import { renderConnect, renderState } from "../../supabase/functions/_shared/connect_page.ts";
import { page as gmailPage } from "../../supabase/functions/_shared/connectors.ts";
import { page as outlookPage } from "../../supabase/functions/_shared/outlook_connector.ts";
import { careerLanding } from "../../supabase/functions/gmail-oauth/career.ts";
import { handleFile, type FileDeps, type FileStore } from "../../supabase/functions/trainee-file/handler.ts";
import { jobViewOf, refOf } from "../../supabase/functions/_shared/telegram_jobs.ts";
import { signedIn } from "./file-session-fakes.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ok = (v: unknown, m?: string) => assertNode.ok(v, m);

Deno.test("Q540/Q553: every text/ground pair is WCAG AA in light and dark; the action's text on plum is AAA; plum on white is AAA", () => {
  for (const [scheme, t] of [["light", LIGHT], ["dark", DARK]] as const) {
    for (const [what, fg, bg, min] of readablePairs(t)) ok(contrast(fg, bg) >= min, `${scheme}: ${what} ${fg} on ${bg} is ${contrast(fg, bg).toFixed(2)}:1, under ${min}:1`);
  }
  ok(contrast(PLUM, "#FFFFFF") >= 7, `plum on white ${contrast(PLUM, "#FFFFFF").toFixed(2)}:1`);
  // The formula itself, on values whose ratio is known: black on white is 21:1, a colour on itself 1:1.
  eq(Number(contrast("#000000", "#FFFFFF").toFixed(2)), 21);
  eq(contrast("#5C2751", "#5C2751"), 1);
  // The owner's proposed plum (requirements Q540) clears the same bar, so the switch is a value change, not a redesign.
  ok(contrast("#5C2751", "#FFFFFF") >= 7 && contrast("#FFFFFF", "#5C2751") >= 7);
  // Plum is reserved for actions: neither scheme uses it as the text colour or the ground.
  for (const t of [LIGHT, DARK]) ok(t.ink !== t.accent && t.bg !== t.accent);
});

Deno.test("Q564/Q565/Q726: every page Trainee serves starts from the same tokens and carries the same mark", async () => {
  const pages: Record<string, string> = {
    "jobs list": renderFeed({ token: "x", rows: [], setHash: null, setSize: 0 }),
    "phone sign-in": renderPhoneLogin({ step: "phone" }),
    "link state": renderLinkState("This link expired", ["Nothing was sent."]),
    "connect page": renderConnect({ token: "x", reason: "replies", botUrl: null, providers: [{ id: "google", configured: true, state: "not_connected", email: null, scopes: [] }] }),
    "connect state": renderState("Not available yet", ["Nothing was connected."], null),
    "gmail connect page": await gmailPage("Connect Gmail to Trainee", ["One tap."], 200, { action: "/c", token: "t", label: "Continue to Google" }).text(),
    "outlook page": await outlookPage("Outlook connected", ["You can close this tab."]).text(),
    "gmail landing": await careerLanding(true).text(),
    "gmail landing (not connected)": await careerLanding(false).text(),
  };
  for (const [name, html] of Object.entries(pages)) {
    ok(html.includes(TOKENS_CSS), `${name}: not drawn from the shared tokens`);
    ok(html.includes(BRAND), `${name}: no Trainee mark`);
    ok(!/color:#4A2F5E|color:\s*#4A2F5E/i.test(html.replace(/background:#4A2F5E/gi, "")), `${name}: plum used as a text colour`);
  }
  // The connection pages kept their words and their one button.
  const g = await gmailPage("Connect Gmail to Trainee", ["One tap."], 200, { action: "/c", token: "t", label: "Continue to Google" }).text();
  ok(/<form method="post" action="\/c"><input type="hidden" name="t" value="t"><button type="submit" class="apply">Continue to Google<\/button><\/form>/.test(g));
  ok((await outlookPage("Sign in", ["x"], 200, { action: "/o", token: "t" }).text()).includes(">Continue to Microsoft</button>"));
  ok(!(await gmailPage("<b>x</b>", ["<script>"]).text()).includes("<script>"), "page text is escaped");
  // The fonts the pages ask for are allowed by their own Content-Security-Policy, and nothing else is opened up.
  for (const r of [gmailPage("t", []), outlookPage("t", []), careerLanding(true)]) {
    const csp = r.headers.get("content-security-policy") ?? "";
    ok(/default-src 'none'/.test(csp) && /style-src 'unsafe-inline' https:\/\/fonts\.googleapis\.com/.test(csp) && /font-src https:\/\/fonts\.gstatic\.com/.test(csp) && !/script-src/.test(csp), csp);
  }
});

Deno.test("Q576: the freshness line says the posting's own age, else when Trainee first saw it, and warns past 30 days", () => {
  const now = Date.parse("2026-10-31T12:00:00Z");
  eq(postedLine({ posted_at: "2026-10-28T09:00:00Z", first_seen_at: "2026-10-30T09:00:00Z" }, now), "Posted 3 d ago (Oct 28)");
  eq(postedLine({ posted_at: "2026-10-31T09:30:00Z" }, now), "Posted 2 h ago (Oct 31)");
  eq(postedLine({ posted_at: null, first_seen_at: "2026-10-31T11:20:00Z" }, now), "First seen by Trainee 40 min ago (Oct 31); the posting gives no date");
  eq(postedLine({ posted_at: "2026-09-20T12:00:00Z" }, now), "Posted 41 d ago (Sep 20) · over 30 days old, it may be filled");
  eq(postedLine({ posted_at: "2026-10-01T12:00:00Z" }, now), "Posted 30 d ago (Oct 1)", "exactly 30 days is not yet over 30");
  eq(postedLine({ posted_at: "2026-11-02T12:00:00Z" }, now), "Posted on Nov 2", "a date ahead of our clock is its day");
  eq(postedLine({ posted_at: "not a date", first_seen_at: null }, now), null, "no date, no line: nothing is invented");
  eq(postedLine({}, now), null);
});

// ---------------------------------------------------------------- the jobs page handler, signed in, two postings
const U = "11111111-1111-4111-8111-111111111111", LIST = "0123456789", NOW = Date.parse("2026-10-31T12:00:00Z");
const SECRET = "file-link-secret-0123456789-abcdef";
const hit = (n: number) => ({ job_id: `greenhouse:acme:${n}`, company: `Acme ${n}`, title: `Data Analyst ${n}`, location: "Austin, TX", url: `https://boards.greenhouse.io/acme/jobs/${n}`, pay: "$90k", first_seen_at: "2026-10-31T10:00:00Z" });
const posting = (n: number) => ({ job_id: `greenhouse:acme:${n}`, provider: "greenhouse", company: `Acme ${n}`, title: `Data Analyst ${n}`, location: "Austin, TX", url: `https://boards.greenhouse.io/acme/jobs/${n}`,
  description: "<p>Build dashboards for the growth team.</p>", pay: "$90k", closed_at: null, first_seen_at: "2026-10-31T10:00:00Z",
  posted_at: n === 1 ? "2026-10-28T09:00:00Z" : n === 2 ? null : "2026-09-20T12:00:00Z" });
async function world() {
  const kv = new Map<string, any>();
  const store: FileStore = {
    async remember(u, ref, job, shownAs) { kv.set(`${u}|job|${ref}`, { job, shownAs }); },
    async recall(u, ref) { return kv.get(`${u}|job|${ref}`) ?? null; },
    async rememberList(u, id, refs) { kv.set(`${u}|list|${id}`, refs); },
    async recallList(u, id) { return kv.get(`${u}|list|${id}`) ?? null; },
    async postings(ids) { return ids.map((id) => posting(Number(id.split(":").pop()))); },
    async save() { return "saved"; },
    async prepared() { return null; },
    async applied() { return false; },
    async want() { return { result: "queued" }; },
    async appRow() { return null; },
    async wanted() { return false; },
  } as FileStore;
  const refs: string[] = [];
  for (const n of [1, 2, 3]) { const ref = await refOf(U, `greenhouse:acme:${n}`); refs.push(ref); await store.remember(U, ref, jobViewOf(hit(n), posting(n) as any), "text"); }
  await store.rememberList(U, LIST, refs);
  const A = signedIn();
  const env: Record<string, string> = { TRAINEE_FILE_LINK_SECRET: SECRET, TRAINEE_FILE_BASE_URL: "https://trainee.example/file", TELEGRAM_BOT_TOKEN: "123456:BOT-TOKEN-for-tests" };
  const d = { ...A.deps, store, now: () => NOW, env: { get: (k: string) => env[k] }, cards: { async open() { return null; } }, tap: {} as any, userOfTelegram: async () => null } as unknown as FileDeps;
  return { d, tok: await A.tok(U, LIST, NOW), refs };
}

Deno.test("Q547/Q576/Q718: the signed-in jobs page shows every posting's freshness in its row, from the stored posting", async () => {
  const w = await world();
  const html = await (await handleFile(new Request("https://x.example/f", { headers: { cookie: `tf_s=${w.tok}` } }), w.d)).text();
  const rowOf = (ref: string) => new RegExp(`<li class="row" id="r-${ref}">([\\s\\S]*?)</li>`).exec(html)?.[1] ?? "";
  eq(w.refs.map((r) => /<p class="meta posted">([^<]*)<\/p>/.exec(rowOf(r))?.[1] ?? null), [
    "Posted 3 d ago (Oct 28)",
    "First seen by Trainee 2 h ago (Oct 31); the posting gives no date",
    "Posted 41 d ago (Sep 20) · over 30 days old, it may be filled",
  ]);
});
