// Connect cards, the owner's reference design (docs/depth/CONNECT-CARDS.md): packages/domain/76-connect-cards.js says
// which providers get a card (only those a person can connect today, each with its real logo on file), writes the reply
// (one short line saying what did not happen and "here's the link", then the link alone on its own line, which iMessage
// and the app draw as the card) and reads a reply line back as a card only when it is exactly a connect link. Reached by
// agent-chat direct_answers.ts (connect my X), 73-broker-accounts.js (every brokerage connect prompt), the app's chat
// (src/upmore-app-template.html md + connectCardHTML) and scripts/build-connect-cards.cjs (the page behind the link).
// One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Check: node --test tests/depth-CONNECT-CARDS.test.cjs && node evals/depth/run.cjs CONNECT-CARDS
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const CC = require(path.join(dir, "76-connect-cards.js"));
const B = require(path.join(dir, "73-broker-accounts.js"));
const BC = require(path.join(dir, "77-brokerage-connectors.js"));
const PLATFORMS = require(path.join(root, "packages/connectors/platforms.json")).platforms;
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const APP = "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app";

test("[S01] only providers a person can connect today get a card: Alpaca (OAuth) and Gmail, and every card the chat can raise is one of them", () => {
  assert.deepEqual(Object.keys(CC.PROVIDERS), ["alpaca", "gmail"]);
  // The connector matrix raises a card for a platform only when it is connectable and tradeable today.
  const raised = new Set();
  for (const r of PLATFORMS) { const a = BC.connectAnswer(PLATFORMS, `connect my ${r.platform}`); if (a && a.card) raised.add(a.card); }
  assert.deepEqual([...raised], ["alpaca"]);
  // Each card has the app's own way to start it.
  const tpl = read("src/upmore-app-template.html");
  assert.ok(tpl.includes('supa.functions.invoke("broker-oauth-start", { body: { provider: "alpaca" } })') && tpl.includes('supa.functions.invoke("gmail-oauth", { body: { action: "start" } })'));
});

test("[S02] each card shows the company's real logo, on file in img/brands with its source and license, a vector mark and not lettering", () => {
  const sources = read("img/brands/SOURCES.md");
  for (const [p, c] of Object.entries(CC.PROVIDERS)) {
    assert.match(c.icon, /^img\/brands\/[a-z0-9-]+\.svg$/, p);
    const svg = read(c.icon);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[\d. -]+">/, p);
    assert.ok(!/<text\b|<image\b|data:|currentColor/.test(svg), `${p}: the mark in its own colours`);
    assert.match(sources.split("\n").find(l => l.startsWith(`| ${path.basename(c.icon)} |`)) || "", /\| (MIT|CC0) \|$/, `${p}: source and license`);
  }
  assert.match(read(CC.PROVIDERS.alpaca.icon), /#fcd72b/i, "Alpaca's own yellow");
  for (const col of ["#4285f4", "#34a853", "#fbbc04", "#ea4335"]) assert.ok(read(CC.PROVIDERS.gmail.icon).toLowerCase().includes(col), `Gmail ${col}`);
});

test("[S03] each card image is that provider's own 1200x630 picture, the one the page behind the link names", () => {
  for (const [p, c] of Object.entries(CC.PROVIDERS)) {
    assert.equal(c.card, `img/connect/${p}.png`);
    const png = fs.readFileSync(path.join(root, c.card));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
    assert.ok(read(`connect/${p}.html`).includes(`<meta property="og:image" content="${APP}/${c.card}">`), p);
  }
});

test("[S04] the reply is the line, a blank line, then the link alone on its own line (iMessage draws the card from that bubble)", () => {
  const m = CC.message("gmail");
  assert.equal(m, `Not connected yet - here's the link.\n\n${APP}/connect/gmail`);
  const parts = m.split("\n\n");
  assert.equal(parts.length, 2);
  assert.equal(CC.parse(parts[1]), "gmail", "the second bubble is exactly the link");
  assert.equal(CC.parse(parts[0]), null);
});

test("[S05] the default line says what did not happen and \"here's the link\", in one short line", () => {
  assert.equal(CC.LEAD, "Not connected yet - here's the link.");
  assert.ok(CC.LEAD.length <= 60 && !CC.LEAD.includes("\n"));
});

test("[S06] the caller's line is kept: a brokerage prompt says nothing was placed, then the Alpaca link alone", () => {
  assert.equal(B.MESSAGES.connect, `No brokerage is connected yet, so nothing was placed - here's the link.\n\n${APP}/connect/alpaca`);
  assert.equal(B.unsupported("fidelity"), `Fidelity doesn't let apps place trades, so Upmore can't connect it and nothing was placed. Alpaca does - here's the link.\n\n${APP}/connect/alpaca`);
  assert.equal(CC.message("alpaca", { lead: "Alpaca connects through OAuth. Not connected yet - here's the link." }).split("\n\n")[0], "Alpaca connects through OAuth. Not connected yet - here's the link.");
});

test("[S07] no real logo, no card: a provider not on the list gets no link at all, never a stand-in", () => {
  for (const p of ["outlook", "fidelity", "robinhood", ""]) assert.throws(() => CC.message(p), /real logo/, p);
});

test("[S08] the link points at the production app, the one the Alpaca and Gmail sign-ins return to", () => {
  assert.equal(CC.DEFAULT_BASE, APP);
  assert.equal(CC.url("alpaca"), `${APP}/connect/alpaca`);
  assert.ok(read("supabase/functions/_shared/broker_connect.ts").includes(`export const DEFAULT_APP_URL = "${CC.DEFAULT_BASE}";`));
  assert.ok(read("supabase/functions/gmail-oauth/index.ts").includes(`const APP_URL = "${CC.DEFAULT_BASE}";`));
});

test("[S09] a base given with a trailing slash still makes one clean link", () => {
  assert.equal(CC.url("gmail", "https://preview-7.vercel.app/"), "https://preview-7.vercel.app/connect/gmail");
  assert.equal(CC.message("alpaca", { base: "https://preview-7.vercel.app//" }), "Not connected yet - here's the link.\n\nhttps://preview-7.vercel.app/connect/alpaca");
});

test("[S10] an exact connect link is a card on any host (a preview app too), with a trailing slash, spaces around it, any case", () => {
  assert.equal(CC.parse(`${APP}/connect/alpaca`), "alpaca");
  assert.equal(CC.parse("  https://preview-1.vercel.app/connect/gmail/ "), "gmail");
  assert.equal(CC.parse("https://localhost:8080/connect/alpaca"), "alpaca");
  assert.equal(CC.parse(`${APP}/connect/Alpaca`), "alpaca");
});

test("[S11] a plain-http link is never drawn as the card", () => {
  assert.equal(CC.parse(`http://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/alpaca`), null);
});

test("[S12] a link inside a sentence is text, not a card: the line must be the link alone", () => {
  assert.equal(CC.parse(`see ${APP}/connect/alpaca`), null);
  assert.equal(CC.parse(`Tap ${APP}/connect/gmail to connect`), null);
});

test("[S13] a link with a query or more path after the provider is not a card", () => {
  assert.equal(CC.parse(`${APP}/connect/alpaca?x=1`), null);
  assert.equal(CC.parse(`${APP}/connect/alpaca/oauth`), null);
});

test("[S14] a connect link for a provider without a card is not drawn as one", () => {
  assert.equal(CC.parse(`${APP}/connect/outlook`), null);
  assert.equal(CC.parse(`${APP}/connect/fidelity`), null);
});

test("[S15] the card's strip says \"Connect <the company's name> to Upmore\" and the domain the link goes to", () => {
  assert.equal(CC.title("alpaca"), "Connect Alpaca to Upmore");
  assert.equal(CC.title("gmail"), "Connect Gmail to Upmore");
  assert.equal(CC.host(CC.url("alpaca")), "upmore-srikanthvishnu90-sketchs-projects.vercel.app");
  assert.equal(CC.host("not a link"), "");
  for (const p of Object.keys(CC.PROVIDERS)) assert.ok(read(`connect/${p}.html`).includes(`<meta property="og:title" content="${CC.title(p)}">`), p);
});

test("[ADV] a reply that only mentions a provider, or smuggles a link in, never becomes a card; every brokerage prompt ends on the link alone", () => {
  for (const line of ["connect alpaca", "https://upmore.app/connect/alpaca extra", "javascript:alert(1)//https://x.app/connect/alpaca", "https://x.app/connect/alpaca\nmore", "<a href=\"https://x.app/connect/alpaca\">", "https://x.app/connect/../connect/alpaca"])
    assert.equal(CC.parse(line), null, line);
  for (const t of [B.MESSAGES.connect, B.MESSAGES.reconnect("Alpaca"), B.MESSAGES.not_wired("Charles Schwab"), B.unsupported("fidelity")]) {
    const [line, link, ...rest] = t.split("\n\n");
    assert.deepEqual(rest, []);
    assert.match(line, /nothing was placed/);
    assert.match(line, /here's the link( to reconnect)?\.$/);
    assert.equal(CC.parse(link), "alpaca");
  }
});
