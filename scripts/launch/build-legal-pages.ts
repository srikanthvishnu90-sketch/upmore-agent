// Google verification (2026-10-26, review of PR #196): the legal pages are published only when every owner input is
// filled. The templates live outside site/ (docs/launch/legal-pages/*.template.html), so nothing with a placeholder is
// ever served. This build:
//   1. reads the owner's inputs (docs/launch/legal-pages/owner-inputs.json, or --inputs <file>) and refuses, naming each
//      one, while any is missing, empty or not the right shape (SUPPORT_EMAIL must be one email address);
//   2. fills the templates and refuses if any {{PLACEHOLDER}} is left in what it would write;
//   3. writes privacy.html, terms.html and google.html (the pre-consent notice, from _shared/google_scopes.ts
//      consentNotice) and the homepage with its legal links pointed at them (index.html), into site/ or --out <dir>.
// Run: deno run -A scripts/launch/build-legal-pages.ts [--inputs file.json] [--out dir]
// Exit 1 and nothing written on any refusal. tests/architect/google-verification.test.ts runs it both ways.
import { consentNotice, EMAIL, GMAIL_READONLY, OPENID } from "../../supabase/functions/_shared/google_scopes.ts";

export const OWNER_INPUTS = ["LEGAL_NAME", "SUPPORT_EMAIL", "GOVERNING_STATE"] as const;
export type OwnerInputs = Record<(typeof OWNER_INPUTS)[number], string>;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const PLACEHOLDER = /\{\{[A-Z_]+\}\}/g;

// The missing or malformed inputs, by name; empty when every one is usable.
export function missingInputs(raw: Record<string, unknown> | null): string[] {
  const out: string[] = [];
  for (const k of OWNER_INPUTS) {
    const v = raw?.[k];
    if (typeof v !== "string" || !v.trim() || /[{}<>]/.test(v)) out.push(k);
    else if (k === "SUPPORT_EMAIL" && !EMAIL_RE.test(v.trim())) out.push(k);
  }
  return out;
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function fill(template: string, inputs: OwnerInputs): string {
  return template.replace(PLACEHOLDER, (m) => {
    const k = m.slice(2, -2) as keyof OwnerInputs;
    return k in inputs ? escHtml(inputs[k].trim()) : m;
  });
}
export function placeholdersIn(html: string): string[] {
  return [...new Set(html.match(PLACEHOLDER) ?? [])];
}

// The public copy of the words shown before Google's consent screen, with the privacy page's head and footer.
export function buildNoticePage(privacy: string): string {
  const n = consentNotice([OPENID, EMAIL, GMAIL_READONLY], { modelCheck: true });
  const li = (xs: string[]) => xs.map((x) => `    <li>${escHtml(x)}</li>`).join("\n");
  const head = privacy.split('<main class="policy">')[0]
    .replace("<title>Privacy Policy — Trainee</title>", "<title>Connecting Gmail — Trainee</title>")
    .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="What Trainee reads in Gmail, what it never does, and how to disconnect.">');
  const foot = "</main>" + privacy.split("</main>")[1];
  return `${head}<main class="policy">
  <h1>${escHtml(n.title)}</h1>
  <p class="updated muted">What Trainee reads in Gmail, what it never does, and how to undo it. Last updated: October 26, 2026</p>
  <h2>What Trainee will read</h2>
  <ul>
${li(n.reads)}
  </ul>
  <h2>What Trainee never does</h2>
  <ul>
${li(n.never)}
  </ul>
  <h2>How to undo it</h2>
  <ul>
${li(n.undo)}
  </ul>
  <p>Connecting is optional: without it you type an emailed code yourself and tell Trainee how an application went. The full details are in the <a href="/privacy#google">Privacy Policy</a>.</p>
${foot}`;
}

// The homepage's legal links and help pages, pointed at the published pages. Each edit must find its text exactly once
// (a homepage that moved on fails the build instead of shipping half-edited).
export function patchHome(home: string, inputs: OwnerInputs): string {
  let s = home.replaceAll('href="#product/privacy"', 'href="/privacy"').replaceAll('href="#product/terms"', 'href="/terms"');
  const once = (from: string, to: string) => {
    const n = s.split(from).length - 1;
    if (n !== 1) throw new Error(`homepage: expected one "${from.slice(0, 60)}", found ${n}`);
    s = s.replace(from, to);
  };
  const i = s.indexOf("{ slug:'privacy', group:'Trust & Legal'"), k = s.indexOf("{ slug:'sms-terms', group:'Trust & Legal'");
  if (i < 0 || k < i) throw new Error("homepage: the privacy and terms help pages were not found");
  s = s.slice(0, i) + `{ slug:'privacy', group:'Trust & Legal', title:'Privacy Policy',
  desc:'What we collect, why, and the choices you have.',
  html:\`
<p>Trainee's Privacy Policy, including how it uses data from a Google account you connect (Google API Services User Data Policy, Limited Use), is at <a href="/privacy">/privacy</a>.</p>
<p>What Trainee reads in Gmail, before you connect it: <a href="/google">/google</a>.</p>\`},

{ slug:'terms', group:'Trust & Legal', title:'Terms of Service',
  desc:'The rules for using Trainee.',
  html:\`
<p>Trainee's Terms of Service are at <a href="/terms">/terms</a>.</p>\`},

` + s.slice(k);
  once("<p>[Describe encryption in transit and at rest, where data is hosted, and who on your team can access it.]</p>",
    "<p>Information is sent over encrypted connections. Each person can read only their own records, and the tokens of accounts you connect are kept in an encrypted secret store that only Trainee's servers use.</p>");
  once("<p>[Describe how connections are authorized, for example through OAuth, and that passwords are never stored.]</p>",
    "<p>Google is connected on Google's own page, so Trainee never sees your Google password. Saying \"disconnect gmail\" revokes Trainee's access at Google and deletes what it kept. See <a href=\"/google\">what Trainee reads in Gmail</a>.</p>");
  once("supportEmail: 'support@example.com',", `supportEmail: '${inputs.SUPPORT_EMAIL.trim().replace(/'/g, "")}',`);
  return s;
}

export interface Built { files: Record<string, string> }
export function buildLegal(raw: Record<string, unknown> | null, t: { privacy: string; terms: string; home: string }): { ok: true; built: Built } | { ok: false; missing: string[]; left: string[] } {
  const missing = missingInputs(raw);
  if (missing.length) return { ok: false, missing, left: [] };
  const inputs = Object.fromEntries(OWNER_INPUTS.map((k) => [k, String(raw![k])])) as OwnerInputs;
  const privacy = fill(t.privacy, inputs), terms = fill(t.terms, inputs);
  const files = { "privacy.html": privacy, "terms.html": terms, "google.html": buildNoticePage(privacy), "index.html": patchHome(t.home, inputs) };
  const left = Object.values(files).flatMap(placeholdersIn);
  if (left.length) return { ok: false, missing: [], left: [...new Set(left)] };
  return { ok: true, built: { files } };
}

if (import.meta.main) {
  const arg = (n: string) => { const i = Deno.args.indexOf(n); return i >= 0 ? Deno.args[i + 1] : undefined; };
  const root = new URL("../../", import.meta.url);
  const src = new URL("docs/launch/legal-pages/", root);
  const inputsPath = arg("--inputs") ?? new URL("owner-inputs.json", src).pathname;
  const out = arg("--out") ?? new URL("site/", root).pathname;
  let raw: Record<string, unknown> | null = null;
  try { raw = JSON.parse(Deno.readTextFileSync(inputsPath)); } catch (e) { console.error(`cannot read ${inputsPath}: ${(e as Error).message}`); }
  const r = buildLegal(raw, {
    privacy: Deno.readTextFileSync(new URL("privacy.template.html", src)),
    terms: Deno.readTextFileSync(new URL("terms.template.html", src)),
    home: Deno.readTextFileSync(new URL("site/index.html", root)),
  });
  if (!r.ok) {
    if (r.missing.length) console.error(`REFUSED: owner inputs missing or invalid: ${r.missing.join(", ")} (in ${inputsPath}). Nothing was written.`);
    if (r.left.length) console.error(`REFUSED: placeholders left after filling: ${r.left.join(", ")}. Nothing was written.`);
    Deno.exit(1);
  }
  for (const [name, html] of Object.entries(r.built.files)) Deno.writeTextFileSync(`${out.replace(/\/$/, "")}/${name}`, html);
  console.log(`wrote ${Object.keys(r.built.files).join(", ")} to ${out}`);
}
