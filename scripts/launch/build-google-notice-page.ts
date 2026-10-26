import { consentNotice, EMAIL, GMAIL_READONLY, OPENID } from "../../supabase/functions/_shared/google_scopes.ts";
const n = consentNotice([OPENID, EMAIL, GMAIL_READONLY], { modelCheck: true });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const li = (xs: string[]) => xs.map((x) => `    <li>${esc(x)}</li>`).join("\n");
// Google verification (2026-10-26): site/google.html is built from the consent notice (_shared/google_scopes.ts) and the
// privacy page's head and footer, so the public page and the in-app notice say the same words.
// Rebuild: deno run -A scripts/launch/build-google-notice-page.ts   (tests/architect/google-verification.test.ts checks it)
export function buildNoticePage(src: string): string {
const head = src.split('<main class="policy">')[0]
  .replace("<title>Privacy Policy — Trainee</title>", "<title>Connecting Gmail — Trainee</title>")
  .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="What Trainee reads in Gmail, what it never does, and how to disconnect.">');
const foot = "</main>" + src.split("</main>")[1];
const body = `<main class="policy">
  <h1>${esc(n.title)}</h1>
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
`;
  return head + body + foot;
}
if (import.meta.main) {
  const site = new URL("../../site/", import.meta.url);
  Deno.writeTextFileSync(new URL("google.html", site), buildNoticePage(Deno.readTextFileSync(new URL("privacy.html", site))));
}
