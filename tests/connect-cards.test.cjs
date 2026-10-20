// Connect cards (owner, 2026-10-11): every "connect X" looks like the owner's reference screenshot, and every company is
// shown with its real logo. One short line, then the link alone; iMessage draws the card from the page behind the link,
// and the app draws the same card from the same image.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const CC = require('../packages/domain/76-connect-cards.js');
const B = require('../packages/domain/73-broker-accounts.js');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const providers = Object.keys(CC.PROVIDERS);

test('only providers a person can connect today, each with its real logo, its source and its license', () => {
  assert.deepEqual(providers, ['alpaca', 'gmail']);
  const sources = read('img/brands/SOURCES.md');
  for (const p of providers) {
    const svg = read(CC.PROVIDERS[p].icon);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[\d. -]+">/, `${p}: a vector logo`);
    assert.ok(!/<text\b|<image\b|data:/.test(svg), `${p}: the mark itself, not lettering or an embedded picture`);
    const row = sources.split('\n').find(l => l.startsWith(`| ${path.basename(CC.PROVIDERS[p].icon)} |`));
    assert.ok(row, `${p}: listed in img/brands/SOURCES.md`);
    assert.match(row, /Iconify `[a-z-]+:[a-z0-9-]+`.*\| (MIT|CC0) \|$/, `${p}: the collection and its license are named`);
  }
  // The colours are the companies' own: Alpaca's yellow, Gmail's four.
  assert.match(read('img/brands/alpaca.svg'), /#fcd72b/i);
  for (const c of ['#4285f4', '#34a853', '#fbbc04', '#ea4335']) assert.ok(read('img/brands/gmail.svg').toLowerCase().includes(c), `Gmail ${c}`);
});

test('the reply is one short line and the link alone, and only an exact connect link is read as a card', () => {
  const m = CC.message('alpaca', { lead: "No brokerage is connected yet, so nothing was placed - here's the link." });
  assert.equal(m, "No brokerage is connected yet, so nothing was placed - here's the link.\n\nhttps://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/alpaca");
  assert.equal(CC.message('gmail'), "Not connected yet - here's the link.\n\nhttps://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/gmail");
  assert.throws(() => CC.message('outlook'), /real logo/);
  assert.equal(CC.parse('https://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/alpaca'), 'alpaca');
  assert.equal(CC.parse('  https://preview-1.vercel.app/connect/gmail/ '), 'gmail');
  for (const not of ['http://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/alpaca', 'see https://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/alpaca', 'https://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/outlook', 'https://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/alpaca?x=1']) assert.equal(CC.parse(not), null, not);
  assert.equal(CC.title('alpaca'), 'Connect Alpaca to Upmore');
  assert.equal(CC.host(CC.url('alpaca')), 'upmore-srikanthvishnu90-sketchs-projects.vercel.app');
  // The production app the links point at is the one the brokerage callback returns to.
  assert.ok(read('supabase/functions/_shared/broker_connect.ts').includes(`export const DEFAULT_APP_URL = "${CC.DEFAULT_BASE}";`));
});

test('every brokerage prompt that asks the person to connect ends on the Alpaca connect link, alone on its line', () => {
  const link = '\n\nhttps://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/alpaca';
  for (const t of [B.MESSAGES.connect, B.MESSAGES.reconnect('Alpaca'), B.MESSAGES.not_wired('Charles Schwab'), B.unsupported('fidelity')]) {
    assert.ok(t.endsWith(link), t);
    assert.match(t.split('\n\n')[0], /nothing was placed/, 'what did not happen is said first');
    assert.match(t.split('\n\n')[0], /here's the link( to reconnect)?\.$/);
  }
  assert.ok(!B.MESSAGES.unavailable.includes('/connect/'), 'a connection we cannot read is not a connect prompt');
});

test('iMessage gets the line and the link as two bubbles, so it draws the preview card', () => {
  // toBubbles lives in the conversation interface every channel shares (WO-004); the texting channel imports it (WO-013b-2).
  assert.match(read('supabase/functions/trainee-inbound/handler.ts'), /import \{[^}]*\btoBubbles\b[^}]*\} from "\.\.\/_shared\/conversation\.ts"/);
  const src = read('supabase/functions/_shared/conversation.ts');
  const consts = src.match(/^(?:export )?const (OUTBOX_CHARS|MAX_BUBBLES|BUBBLE_CHARS) = \d+;$/gm).map((l) => l.replace(/^export /, '')).join('\n');
  const body = src.slice(src.indexOf('// ---- bubble formatting'), src.indexOf('\nexport async function handleInbound')).replace(/^export /gm, '');
  const js = require('node:module').stripTypeScriptTypes(consts + '\n' + body + '\nmodule.exports = toBubbles;');
  const mod = { exports: null }; new Function('module', js)(mod);
  assert.deepEqual(mod.exports(B.MESSAGES.connect), ["No brokerage is connected yet, so nothing was placed - here's the link.", 'https://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/alpaca']);
});

test('the page behind each link carries the card for iMessage, and the images are 1200x630', () => {
  execFileSync('node', ['scripts/build-connect-cards.cjs', '--check'], { cwd: root, stdio: 'pipe' });
  for (const p of providers) {
    const html = read(`connect/${p}.html`);
    assert.ok(html.includes(`<meta property="og:title" content="Connect ${CC.PROVIDERS[p].name} to Upmore">`));
    assert.ok(html.includes(`<meta property="og:image" content="${CC.DEFAULT_BASE}/img/connect/${p}.png">`));
    assert.ok(!/og:description/.test(html), 'title and domain only, as in the reference');
    assert.ok(html.includes(`location.replace("/?connect=${p}");`), 'opening it goes to the app, which starts the connection');
    const png = fs.readFileSync(path.join(root, CC.PROVIDERS[p].card));
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  }
});

test('the app draws the card from the same module and image, and a tap starts that connection', () => {
  const tpl = read('src/upmore-app-template.html'), app = read('index.html');
  assert.ok(read('src/build-app.py').includes("('/*__CONNECT_CARDS__*/', '../packages/domain/76-connect-cards.js', False)"));
  assert.ok(app.includes(read('packages/domain/76-connect-cards.js').trim().split('\n')[8]), 'the module is inlined in the built app');
  assert.ok(tpl.indexOf('/*__CONNECT_CARDS__*/') < tpl.indexOf('(async function boot()'), 'defined before boot reads it');
  assert.match(tpl, /const p = ConnectCards\.parse\(line\);\n\s+if \(p\) \{ out = out\.replace\(\/\(<br>\)\+\$\/, ""\) \+ connectCardHTML\(line\.trim\(\), p\);/);
  assert.ok(tpl.includes('<span class="ccard-img"><img src="${esc(c.card)}" alt="${esc(c.name)} logo"'));
  assert.ok(tpl.includes('closest("a.ccard[data-connect]")') && tpl.includes('startConnect(a.dataset.connect);'));
  assert.ok(tpl.includes('await supa.functions.invoke("broker-oauth-start", { body: { provider: "alpaca" } })') && tpl.includes('await supa.functions.invoke("gmail-oauth", { body: { action: "start" } })'));
  assert.ok(tpl.includes('new URLSearchParams(location.search).get("connect")') && tpl.includes('if (pendingConnect && ConnectCards.PROVIDERS[pendingConnect]) startConnect(pendingConnect);'));
});

test('real company icons only: every logo on file is a real mark with its source, and the app never draws a letter tile', () => {
  const brands = JSON.parse(read('img/brands/brands.json'));
  assert.ok(brands.length >= 90, `${brands.length} logos`);
  assert.equal(new Set(brands.map(b => b.slug)).size, brands.length, 'one file per company');
  for (const b of brands) {
    const svg = read(b.file);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[\d. -]+">/, b.slug);
    assert.ok(!/currentColor|<text\b|<image\b|data:/.test(svg), `${b.slug}: the mark in its own colours, not lettering or a picture`);
    assert.ok(['MIT', 'CC0', 'CC-BY-4.0'].includes(b.license) && b.from && b.url, `${b.slug}: source and license`);
    assert.ok(b.match.length && b.match.every(m => m === m.toLowerCase() && m.trim()), `${b.slug}: lowercase match words`);
  }
  // Marks that could not be confirmed as the company's current logo stay out.
  for (const out of ['fidelity', 'spectrum', 'xfinity', 'progressive']) assert.ok(!brands.some(b => b.slug === out), out);
  const tpl = read('src/upmore-app-template.html');
  const fn = tpl.slice(tpl.indexOf('function appIcon(name, size)'), tpl.indexOf('let homeSubCache'));
  assert.ok(!/charAt\(0\)|letter|hsl\(/.test(fn), 'no letter tile or generated colour in appIcon');
  assert.ok(fn.includes('const b = brandIcon(name);') && fn.includes('style="display:none" aria-hidden="true"'), 'a real logo, or nothing');
  assert.ok(!/id="(sub|promo)SheetIcon">[A-Z]</.test(tpl), 'no letter placeholders');
  assert.ok(read('index.html').includes('const BRAND_ICONS = [{"slug":"1password"'), 'the manifest is inlined in the built app');
});

test('the card is dark grey with the Upmore wordmark in Upmore green Libre Baskerville (a finance-style serif) centered below the logo, on the projects domain', () => {
  const { imageHtml } = require('../scripts/build-connect-cards.cjs');
  const html = imageHtml('alpaca');
  assert.match(html, /html, body \{[^}]*background: linear-gradient\(160deg, #26282B 0%, #161719 100%\);/);
  assert.match(html, /body \{ display: flex; flex-direction: column; align-items: center; justify-content: center;/);
  assert.ok(html.indexOf('<div class="logo">') < html.indexOf('<div class="word">Upmore</div>'), 'the wordmark sits under the logo');
  assert.match(html, /\.word \{[^}]*font: 400 72px\/1 "Libre Baskerville", Baskerville, Georgia, serif;[^}]*color: #2E9E6B;/);
  assert.ok(fs.existsSync(path.join(root, 'fonts/libre-baskerville-regular.woff2')) && /SIL Open Font License/.test(read('fonts/libre-baskerville-OFL.txt')), 'the font and its license are in the repo');
  const tpl = read('src/upmore-app-template.html');
  assert.ok(tpl.includes('.ccard-img { display: block; background: #1E1F22; }') && /\.amsg a\.ccard \{[^}]*background: #2C2C2E;/.test(tpl), 'the app draws the dark grey card with the dark grey strip');
  // Until a domain is bought, everything points at the projects deployment (owner, 2026-10-11).
  assert.equal(CC.DEFAULT_BASE, 'https://upmore-srikanthvishnu90-sketchs-projects.vercel.app');
  assert.ok(read('supabase/functions/gmail-oauth/index.ts').includes(`const APP_URL = "${CC.DEFAULT_BASE}";`));
});
