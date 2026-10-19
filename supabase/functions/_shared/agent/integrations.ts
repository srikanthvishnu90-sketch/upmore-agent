// WO-027: no feature hard-fails on a missing integration. When something Trainee would read is not connected, the reply
// is one short line that says so and asks once, never an error. Email: forward or paste it, or connect Gmail, in the
// owner's connect-card shape (packages/domain/76-connect-cards.js: one short line, then the link alone on its own line,
// which iMessage and the app draw as the card). LinkedIn has no connect card (no real logo on file, so plain words):
// public information only, and one ask for their profile link.
// No imports, only erasable types: tests/career-connect-degrade.test.cjs loads this file in Node and checks the Gmail
// text equals ConnectCards.message("gmail", { lead }) and the link equals ConnectCards.url("gmail").

// The same default and the same URL builder as ConnectCards (DEFAULT_BASE, url()).
export const CONNECT_BASE = "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app";
export const connectUrl = (provider: string, base?: string) => `${String(base || CONNECT_BASE).replace(/\/+$/, "")}/connect/${provider}`;

export const EMAIL_LEAD = "I can't see your email. Forward or paste it here, or connect Gmail - here's the link.";
export const LINKEDIN_ASK = "LinkedIn isn't connected, so this uses only public information. Paste your LinkedIn profile link if you want me to use it.";

export type Integration = "email" | "gmail" | "linkedin" | "calendar";

export function missingIntegration(kind: string, opts?: { base?: string }): string {
  const k = String(kind || "").toLowerCase();
  if (k === "email" || k === "gmail") return `${EMAIL_LEAD}\n\n${connectUrl("gmail", opts?.base)}`;
  if (k === "linkedin") return LINKEDIN_ASK;
  if (k === "calendar") return "Your calendar isn't connected. Tell me the date and time and I'll work from that.";
  const name = String(kind || "That").replace(/\s+/g, " ").trim().slice(0, 40) || "That";
  return `${name} isn't connected. Tell me what you need from it and I'll work from that.`;
}
