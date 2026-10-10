#!/usr/bin/env node
// News relevance labeled set (Instinct spec doc 12, dataset 4; the doc 10 eval).
//   node evals/data/generators/news-relevance.cjs   writes evals/data/labeled/news-relevance.json
// One week of firehose (500 stories, syndicated repeats included) and five fixture
// personas with different holdings, watchlists, employers, private holdings, screens
// and mutes. Every (persona, story) pair carries two labels set BY CONSTRUCTION from
// the planted event, never by the scorer: relevant (belongs in that persona's brief or
// alert) and alert (a material event on a name the persona holds, which may interrupt).
// The label rules are written out below and in the file so a reviewer can disagree
// with a rule rather than with 2,500 cells. Stories carry the entities an ingest NER
// would supply; cluster_key is not supplied, clustering has to earn its keep.
// Nothing here is a real user, holding or account.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..", "..", "..");
const OUT = path.join(root, "evals/data/labeled/news-relevance.json");

// Deterministic PRNG so the set is reproducible from this file.
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rand = mulberry32(20261010);
const pick = arr => arr[Math.floor(rand() * arr.length)];
const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const WEEK_END = Date.UTC(2026, 9, 10, 13, 0, 0); // the last brief of the week, 2026-10-10 13:00Z
const DAY = 86400000;
const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

// Companies: held by someone, or not held by anyone (controls).
const CO = {
  NVDA: { name: "Nvidia", sector: "semiconductors" }, AAPL: { name: "Apple", sector: "consumer electronics" }, MSFT: { name: "Microsoft", sector: "software" }, AMD: { name: "AMD", sector: "semiconductors" },
  VTI: { name: "Vanguard Total Market", sector: "index funds" }, SCHD: { name: "Schwab Dividend Equity", sector: "index funds" }, JNJ: { name: "Johnson & Johnson", sector: "healthcare" }, KO: { name: "Coca-Cola", sector: "consumer staples" }, PG: { name: "Procter & Gamble", sector: "consumer staples" },
  PFE: { name: "Pfizer", sector: "pharma" }, UNH: { name: "UnitedHealth", sector: "healthcare" }, LLY: { name: "Eli Lilly", sector: "pharma" }, MRNA: { name: "Moderna", sector: "biotech" },
  XOM: { name: "Exxon Mobil", sector: "energy" }, JPM: { name: "JPMorgan Chase", sector: "banking" }, CVX: { name: "Chevron", sector: "energy" }, BAC: { name: "Bank of America", sector: "banking" },
  SHOP: { name: "Shopify", sector: "ecommerce" }, XYZ: { name: "Block", sector: "fintech" }, COIN: { name: "Coinbase", sector: "crypto" }, KLAR: { name: "Klarna", sector: "fintech" },
  // not held by any persona
  TSLA: { name: "Tesla", sector: "autos" }, F: { name: "Ford", sector: "autos" }, BA: { name: "Boeing", sector: "aerospace" }, NFLX: { name: "Netflix", sector: "media" }, DIS: { name: "Disney", sector: "media" }, WMT: { name: "Walmart", sector: "retail" },
  TGT: { name: "Target", sector: "retail" }, INTC: { name: "Intel", sector: "semiconductors" }, ORCL: { name: "Oracle", sector: "software" }, UBER: { name: "Uber", sector: "mobility" }, ABNB: { name: "Airbnb", sector: "travel" }, META: { name: "Meta", sector: "social media" },
  GOOGL: { name: "Alphabet", sector: "software" }, AMZN: { name: "Amazon", sector: "ecommerce" }, CRM: { name: "Salesforce", sector: "software" }, ADBE: { name: "Adobe", sector: "software" }, AVGO: { name: "Broadcom", sector: "semiconductors" }, COST: { name: "Costco", sector: "retail" },
  NKE: { name: "Nike", sector: "apparel" }, SBUX: { name: "Starbucks", sector: "restaurants" }, HD: { name: "Home Depot", sector: "retail" }, LMT: { name: "Lockheed Martin", sector: "aerospace" }, DAL: { name: "Delta Air Lines", sector: "airlines" }, GM: { name: "General Motors", sector: "autos" }, CAT: { name: "Caterpillar", sector: "industrials" }
};
const name = sym => CO[sym].name;

const PERSONAS = [
  { id: "P1", title: "tech-concentrated engineer", holdings: ["NVDA", "AAPL", "MSFT"], watchlist: ["AMD"], employer: "Stripe", private_holdings: [{ name: "Anduril", aliases: ["Anduril Industries"] }], screens: [], muted: ["crypto"] },
  { id: "P2", title: "index-and-dividend retiree", holdings: ["VTI", "SCHD", "JNJ", "KO"], watchlist: ["PG"], employer: null, private_holdings: [], screens: [], muted: ["meme stocks"] },
  { id: "P3", title: "healthcare professional", holdings: ["PFE", "UNH", "LLY"], watchlist: ["MRNA"], employer: "Mayo Clinic", private_holdings: [], screens: [{ sectors: ["biotech"] }], muted: [] },
  { id: "P4", title: "energy-and-banks value investor", holdings: ["XOM", "JPM", "CVX"], watchlist: ["BAC"], employer: null, private_holdings: [{ name: "Brightline Solar", aliases: [] }], screens: [], muted: ["sports betting"] },
  { id: "P5", title: "startup founder", holdings: ["SHOP", "XYZ", "COIN"], watchlist: ["KLAR"], employer: "Notion", private_holdings: [{ name: "Ramp", aliases: ["Ramp Financial"] }], screens: [{ sectors: ["fintech"] }], muted: [] }
];

const OUTLETS = ["Reuters", "WSJ", "Bloomberg", "CNBC", "AP", "FT", "TechCrunch", "The Information", "blog", "forum"];

// Material events (doc 10): the kinds that may interrupt when the name is held. Each has several paraphrases so syndication is realistic.
const MATERIAL = {
  earnings_beat: { titles: ["{N} beats estimates as revenue climbs", "{N} tops Wall Street estimates on strong quarter", "{N} posts quarterly results above expectations", "{N} earnings beat; guidance raised", "{N} quarterly results beat estimates", "{N} reports better-than-expected earnings"], summary: "{N} reported quarterly results above analyst estimates and raised guidance for the next quarter. Shares moved after hours." },
  earnings_miss: { titles: ["{N} misses estimates as costs rise", "{N} falls short of expectations in quarterly results", "{N} earnings miss; guidance cut", "{N} quarterly results miss estimates", "{N} reports weaker-than-expected earnings"], summary: "{N} reported quarterly results below analyst estimates and lowered guidance. The company cited higher costs." },
  acquisition: { titles: ["{N} to acquire {T} for ${B} billion", "{N} agrees to buy {T} in ${B} billion deal", "{N} buys {T} for ${B} billion", "{N}-{T} ${B} billion acquisition announced", "{N} strikes deal to acquire {T}"], summary: "{N} agreed to acquire {T} for ${B} billion in cash and stock. The deal is expected to close next year pending regulatory approval." },
  regulatory: { titles: ["SEC probe into {N} accounting disclosed in filing", "{N} discloses SEC investigation into accounting", "Regulator probe into {N} revealed", "{N} faces SEC probe over revenue recognition", "SEC investigation into {N} disclosed"], summary: "{N} disclosed an SEC investigation into its accounting in a regulatory filing. The company says it is cooperating." },
  executive: { titles: ["{N} CEO steps down after five years", "{N} chief executive to depart; board names interim CEO", "{N} CEO resigns", "{N} names interim CEO as chief executive steps down"], summary: "{N} said its chief executive will step down at the end of the quarter. The board named an interim chief executive and began a search." },
  dividend: { titles: ["{N} raises dividend 8 percent", "{N} boosts quarterly dividend", "{N} increases dividend, extends buyback", "{N} dividend raised; buyback expanded"], summary: "{N} raised its quarterly dividend by 8 percent and expanded its share buyback. The payout is the twelfth consecutive annual increase." }
};
// Non-material mentions of a name: brief-worthy when held, never an interruption.
const MENTION = {
  conference: { titles: ["{N} to sponsor developer conference in Austin", "{N} headlines industry conference keynote"], summary: "{N} will sponsor an industry conference next month. The keynote covers product roadmaps." },
  analyst: { titles: ["Analyst reiterates rating on {N}, keeps price target", "Brokerage keeps {N} rating unchanged"], summary: "An analyst reiterated an existing rating on {N} and left the price target unchanged. No new information was cited." },
  office: { titles: ["{N} opens new office in Raleigh", "{N} expands campus with new building"], summary: "{N} opened a new office that will house about 400 employees. The expansion was announced last year." },
  product: { titles: ["{N} updates app with new design", "{N} rolls out software update"], summary: "{N} released a software update with a redesigned interface. The update is rolling out over several weeks." },
  list: { titles: ["{N} named to list of most admired companies", "{N} ranks on best workplaces list"], summary: "{N} appeared on an annual list of admired companies. The ranking is based on a survey of executives." }
};
const MACRO = [
  { titles: ["Fed holds rates steady, signals patience on cuts", "Federal Reserve keeps rates unchanged", "Fed leaves rates on hold, flags inflation data"], summary: "The Federal Reserve held rates steady and signaled it would wait for more inflation data. Markets had expected the hold." },
  { titles: ["CPI rises 0.2 percent in September, in line with forecasts", "Inflation report shows prices up 0.2 percent", "September CPI matches expectations"], summary: "Consumer prices rose 0.2 percent in September, matching forecasts. Core inflation also matched expectations." },
  { titles: ["Jobs report: economy adds 150,000 jobs; unemployment steady", "Payrolls rise 150,000 in September", "September jobs report shows steady hiring"], summary: "Employers added 150,000 jobs in September and the unemployment rate held steady. Wage growth cooled slightly." },
  { titles: ["Treasury yields climb after jobs report", "10-year yield rises to highest since spring", "Bond yields climb on jobs data"], summary: "Treasury yields climbed after the jobs report. The 10-year yield reached its highest level since spring." },
  { titles: ["Fed minutes show officials divided on pace of cuts", "Fed meeting minutes reveal split on rate path"], summary: "Minutes from the Federal Reserve's last meeting showed officials divided on the pace of future cuts. Several wanted more data." },
  { titles: ["Oil prices jump 4 percent on supply concerns", "Crude climbs as supply worries mount"], summary: "Oil prices jumped 4 percent on supply concerns after an output disruption. Analysts expect volatility to continue." }
];
// Sector pieces with no named company: deals and regulation are brief-worthy for a persona in that sector; color pieces are not.
const SECTOR_DEAL = ["Private equity firm to acquire {S} supplier for $2 billion", "{S} startup raises $300 million funding round", "Regulators open antitrust probe into {S} pricing", "{S} company files for IPO"];
const SECTOR_COLOR = ["Why {S} stocks are in focus this week", "Five charts on the state of {S}", "The {S} debate: what analysts are saying", "Opinion: {S} is overhyped", "{S} conference draws record crowd"];
const SECTORS = ["semiconductors", "software", "healthcare", "pharma", "biotech", "energy", "banking", "fintech", "ecommerce", "consumer staples", "autos", "retail", "media"];
const MUTED_TOPICS = [
  { topic: "crypto", titles: ["Bitcoin crosses record high as crypto rally continues", "Crypto exchanges see volume surge", "Crypto market cap tops record"], summary: "Crypto prices climbed to a record as trading volume surged. Exchange volumes doubled from last month." },
  { topic: "meme stocks", titles: ["Meme stocks rally again as retail traders pile in", "Meme stocks surge on social media chatter"], summary: "Meme stocks rallied as retail traders returned. Analysts warned the moves are detached from fundamentals." },
  { topic: "sports betting", titles: ["Sports betting apps post record quarter", "Sports betting handle hits new high"], summary: "Sports betting apps reported a record quarter as more states legalized wagering. Margins improved." }
];
const NOISE = ["Stocks mixed as traders weigh earnings", "Dow rises 40 points in quiet session", "S&P slips ahead of Fed decision", "Markets wrap: stocks edge higher", "What to watch in markets today", "Futures point to flat open", "Wall Street gains in choppy trade", "Dow falls as yields climb"];
const FILLER_SUBJ = ["Local bakery", "Regional airline", "City council", "Community college", "Minor league team", "Craft brewery", "Farmers market", "Public library", "Bike share program", "Food truck festival", "County fair", "Hiking club", "Jazz festival", "Animal shelter", "Youth orchestra", "Garden club", "Ski resort", "Bookstore", "Pottery studio", "Marathon organizers"];
const FILLER_VERB = ["expands to second location", "announces weekend schedule", "debates parking rules", "adds evening classes", "opens new season", "tests oat milk latte", "moves to larger lot", "extends hours", "adds stations downtown", "returns for fifth year", "sets attendance record", "plans fall outing", "books headliner", "waives adoption fees", "holds auditions", "plants native species", "opens early", "hosts author reading", "offers beginner course", "reroutes course"];
const FILLER_WHERE = ["in Tulsa", "in Boise", "in Albany", "in Dayton", "in Reno", "in Fresno", "in Mobile", "in Lincoln", "in Peoria", "in Toledo", "in Spokane", "in Chattanooga", "in Akron"];

// Planted events for the week. Material events on held names are the alert ground truth; everything else is brief-or-nothing.
const HELD = [...new Set(PERSONAS.flatMap(p => p.holdings))];
const NOT_HELD = Object.keys(CO).filter(s => !HELD.includes(s) && !PERSONAS.some(p => p.watchlist.includes(s)));
const WATCH = [...new Set(PERSONAS.flatMap(p => p.watchlist))];

const stories = [];
const events = [];
let sid = 0;
function emit(ev, outlets, dayOffset, hourStart) {
  const titles = shuffle(ev.titles).slice(0, outlets);
  const outs = shuffle(OUTLETS).slice(0, outlets);
  titles.forEach((t, k) => {
    const ms = WEEK_END - dayOffset * DAY - (hourStart + k * 0.4) * 3600000;
    stories.push({ id: "NR-" + String(++sid).padStart(3, "0"), event_id: ev.id, title: t, summary: ev.summary, source: outs[k], link: "https://example.test/news/" + sid, published_at: iso(ms), entities: ev.entity_names || ev.entities.map(name), kind: ev.kind, event: ev.event, sector: ev.sector || null, topic: ev.topic || null });
  });
  events.push({ id: ev.id, kind: ev.kind, event: ev.event, entities: ev.entity_names || ev.entities, sector: ev.sector || null, topic: ev.topic || null, stories: outlets, material: ev.material });
}
const fill = (tpl, n, t, b) => tpl.replace(/\{N\}/g, name(n)).replace(/\{T\}/g, t ? name(t) : "").replace(/\{B\}/g, b || "").replace(/\{S\}/g, "");
let eid = 0;
function materialEvent(sym, kind, day, extra) {
  const m = MATERIAL[kind]; const target = extra && extra.target; const b = extra && extra.billions;
  return { id: "E" + String(++eid).padStart(3, "0"), kind: "material", event: kind, entities: target ? [sym, target] : [sym], material: true, titles: m.titles.map(t => fill(t, sym, target, b)), summary: fill(m.summary, sym, target, b), day };
}
function mentionEvent(sym, kind, day) { const m = MENTION[kind]; return { id: "E" + String(++eid).padStart(3, "0"), kind: "mention", event: "none", entities: [sym], material: false, titles: m.titles.map(t => fill(t, sym)), summary: fill(m.summary, sym), day }; }

// 1. Material events on held names: at least two per persona, kinds spread, syndicated 3-12 outlets.
const heldPlan = [["NVDA", "earnings_beat", 1, 12], ["AAPL", "executive", 3, 6], ["MSFT", "acquisition", 5, 8, { target: "ADBE", billions: "35" }], ["JNJ", "regulatory", 2, 6], ["KO", "dividend", 4, 4], ["VTI", "dividend", 6, 3],
  ["PFE", "earnings_miss", 1, 9], ["LLY", "regulatory", 4, 5], ["UNH", "executive", 6, 4], ["XOM", "earnings_beat", 2, 10], ["JPM", "dividend", 5, 4], ["CVX", "acquisition", 3, 7, { target: "F", billions: "12" }],
  ["SHOP", "earnings_beat", 2, 8], ["COIN", "regulatory", 3, 6], ["XYZ", "executive", 6, 5]];
for (const [sym, kind, day, outlets, extra] of heldPlan) emit(materialEvent(sym, kind, day, extra), outlets, day, 2 + Math.floor(rand() * 6));
// 2. Material events on names nobody holds (controls): same shapes, should reach nobody's alerts.
const controlPlan = [["TSLA", "earnings_miss", 1, 10], ["BA", "regulatory", 2, 6], ["NFLX", "earnings_beat", 3, 8], ["WMT", "acquisition", 4, 5, { target: "TGT", billions: "40" }], ["INTC", "executive", 5, 7], ["ORCL", "acquisition", 6, 6, { target: "UBER", billions: "20" }],
  ["META", "regulatory", 1, 5], ["COST", "dividend", 3, 3], ["DAL", "earnings_beat", 5, 4], ["CAT", "earnings_miss", 6, 5]];
for (const [sym, kind, day, outlets, extra] of controlPlan) emit(materialEvent(sym, kind, day, extra), outlets, day, 2 + Math.floor(rand() * 6));
// 3. Non-material mentions of held names (brief if held, never an alert) and of controls.
const mentionPlan = [["NVDA", "conference", 2], ["AAPL", "product", 4], ["JNJ", "list", 3], ["KO", "office", 5], ["PFE", "analyst", 2], ["UNH", "list", 5], ["XOM", "office", 1], ["JPM", "conference", 4], ["SHOP", "product", 3], ["COIN", "analyst", 6], ["MSFT", "analyst", 6], ["CVX", "list", 2],
  ["TSLA", "product", 1], ["NKE", "list", 2], ["SBUX", "office", 3], ["HD", "analyst", 4], ["GM", "conference", 5], ["AMZN", "product", 6], ["GOOGL", "list", 1], ["LMT", "office", 6]];
for (const [sym, kind, day] of mentionPlan) emit(mentionEvent(sym, kind, day), 1 + (rand() < 0.3 ? 1 : 0), day, 1 + Math.floor(rand() * 8));
// 4. Watchlist, private holding and employer events (brief, not alert).
emit(materialEvent("AMD", "earnings_beat", 2, {}), 6, 2, 3); emit(materialEvent("PG", "dividend", 4, {}), 3, 4, 5); emit(materialEvent("MRNA", "regulatory", 1, {}), 5, 1, 4); emit(materialEvent("BAC", "executive", 5, {}), 4, 5, 6); emit(materialEvent("KLAR", "acquisition", 3, { target: "ABNB", billions: "3" }), 5, 3, 2);
const priv = (nm, kind, titles, summary, day, n) => emit({ id: "E" + String(++eid).padStart(3, "0"), kind, event: kind === "private" ? "funding" : "none", entities: [], entity_names: [nm], material: false, titles, summary, day }, n, day, 3);
priv("Anduril", "private", ["Anduril raises $1.5 billion at higher valuation", "Anduril Industries closes $1.5 billion funding round", "Defense startup Anduril raises new round"], "Anduril raised $1.5 billion in a funding round led by institutional investors. The money funds manufacturing capacity.", 2, 3);
priv("Brightline Solar", "private", ["Brightline Solar raises $80 million for community projects", "Community solar developer Brightline Solar closes funding"], "Brightline Solar raised $80 million to build community solar projects in three states. The round was led by an infrastructure fund.", 4, 2);
priv("Ramp", "private", ["Ramp raises $200 million as spend management competition heats up", "Ramp Financial closes $200 million round"], "Ramp raised $200 million at a higher valuation. The company says revenue doubled over the past year.", 5, 2);
priv("Stripe", "employer", ["Stripe expands to new markets, adds local payment methods", "Stripe launches in three new countries"], "Stripe expanded to three new countries with local payment methods. The company said the expansion was planned for a year.", 3, 2);
priv("Mayo Clinic", "employer", ["Mayo Clinic breaks ground on $5 billion expansion", "Mayo Clinic starts major campus expansion"], "Mayo Clinic broke ground on a $5 billion campus expansion. Construction runs through 2030.", 1, 2);
priv("Notion", "employer", ["Notion adds AI features for enterprise plans", "Notion rolls out enterprise AI tools"], "Notion added AI features for enterprise plans. The company said the features roll out over the quarter.", 6, 2);
// 5. Macro, syndicated.
const MACRO_ENTITIES = [["Federal Reserve"], ["Bureau of Labor Statistics"], ["Bureau of Labor Statistics"], ["Treasury"], ["Federal Reserve"], ["OPEC"]]; // what an ingest tagger supplies
MACRO.forEach((m, i) => emit({ id: "E" + String(++eid).padStart(3, "0"), kind: "macro", event: "macro", entities: [], entity_names: MACRO_ENTITIES[i], material: false, titles: m.titles, summary: m.summary, day: i + 1 }, m.titles.length, i + 1, 2));
// 6. Sector pieces: deals and regulation (brief for that sector's personas) and color (nobody's brief).
SECTORS.forEach((s, i) => { const d = SECTOR_DEAL[i % SECTOR_DEAL.length]; emit({ id: "E" + String(++eid).padStart(3, "0"), kind: "sector_deal", event: /acquire/.test(d) ? "acquisition" : /IPO/.test(d) ? "ipo" : /antitrust/.test(d) ? "regulatory" : "funding", entities: [], sector: s, material: false, titles: [d.replace(/\{S\}/g, s.charAt(0).toUpperCase() + s.slice(1)), d.replace(/\{S\}/g, s)], summary: `A ${s} deal was announced. Terms were not fully disclosed.`, day: 1 + (i % 7) }, 1 + (i % 2), 1 + (i % 7), 4); });
SECTORS.forEach((s, i) => { const c = SECTOR_COLOR[i % SECTOR_COLOR.length]; emit({ id: "E" + String(++eid).padStart(3, "0"), kind: "sector_color", event: "none", entities: [], sector: s, material: false, titles: [c.replace(/\{S\}/g, s)], summary: `A look at ${s} this week. Opinions vary.`, day: 1 + ((i + 3) % 7) }, 1, 1 + ((i + 3) % 7), 7); });
// 7. Muted topics (a mute wins for that persona; the same story can be relevant to another persona through a holding sector).
MUTED_TOPICS.forEach((m, i) => emit({ id: "E" + String(++eid).padStart(3, "0"), kind: "topic", event: "none", entities: [], entity_names: [["Bitcoin"], [], []][i], topic: m.topic, material: false, titles: m.titles, summary: m.summary, day: 2 + i }, m.titles.length, 2 + i, 5));
// 8. Market noise: never relevant.
for (let k = 0; k < 40; k++) emit({ id: "E" + String(++eid).padStart(3, "0"), kind: "noise", event: "none", entities: [], material: false, titles: [NOISE[k % NOISE.length] + " (" + (k + 1) + ")"], summary: "Major indexes moved little on light volume. Traders awaited data.", day: 1 + (k % 7) }, 1, 1 + (k % 7), k % 9);
// 9. Filler to 500: unrelated local news, each title distinct so the clusterer has nothing to merge.
const fillerTitles = []; for (const s of FILLER_SUBJ) for (const v of FILLER_VERB) fillerTitles.push(`${s} ${v} ${pick(FILLER_WHERE)}`);
const fillers = shuffle([...new Set(fillerTitles)]);
for (let k = 0; stories.length < 500; k++) emit({ id: "E" + String(++eid).padStart(3, "0"), kind: "filler", event: "none", entities: [], material: false, titles: [fillers[k]], summary: "Details in the report. Organizers expect modest turnout.", day: 1 + (k % 7) }, 1, 1 + (k % 7), k % 11);
if (stories.length !== 500) throw new Error("expected 500 stories, built " + stories.length);

// Labels by rule. Written once here, applied to every cell.
const RULES = [
  "R1 alert: a material event (earnings, acquisition, regulatory, executive, dividend) whose named entities include a name the persona holds. Alerts are also relevant.",
  "R2 relevant: any story naming a held, watchlist, private or employer name, material or not (a mention belongs in the brief, never an interruption).",
  "R3 relevant: macro (Fed, CPI, jobs, yields, oil) for every persona.",
  "R4 relevant: a sector deal, funding, IPO or regulatory piece in a sector the persona holds or screens; sector color pieces are not relevant to anyone.",
  "R5 not relevant: market noise, local filler, and any story on a topic the persona muted, even when another rule would apply.",
  "R6 not relevant: a material event on a name nobody holds is a control: relevant to no one."
];
function held(p) { return new Set(p.holdings.map(name)); }
function followed(p) { return new Set([...p.watchlist.map(name), ...p.private_holdings.map(x => x.name), p.employer].filter(Boolean)); }
function sectorsOf(p) { return new Set([...p.holdings.map(s => CO[s].sector), ...p.screens.flatMap(s => s.sectors)]); }
function label(p, s) {
  const text = (s.title + " " + s.summary).toLowerCase();
  if (p.muted.some(m => text.includes(m))) return { relevant: false, alert: false, rule: "R5" };
  if (s.kind === "noise" || s.kind === "filler" || s.kind === "sector_color") return { relevant: false, alert: false, rule: "R5" };
  const ents = s.entities || [];
  if (s.kind === "material" && ents.some(e => held(p).has(e))) return { relevant: true, alert: true, rule: "R1" };
  if (ents.some(e => held(p).has(e) || followed(p).has(e))) return { relevant: true, alert: false, rule: "R2" };
  if (s.kind === "macro") return { relevant: true, alert: false, rule: "R3" };
  if (s.kind === "sector_deal" && sectorsOf(p).has(s.sector)) return { relevant: true, alert: false, rule: "R4" };
  if (s.kind === "topic") { const sec = { crypto: "crypto" }[s.topic]; if (sec && sectorsOf(p).has(sec)) return { relevant: true, alert: false, rule: "R4" }; }
  return { relevant: false, alert: false, rule: s.kind === "material" ? "R6" : "R5" };
}
const labels = {};
for (const p of PERSONAS) labels[p.id] = Object.fromEntries(stories.map(s => [s.id, label(p, s)]));

const out = {
  schema_version: 1, generated_by: "evals/data/generators/news-relevance.cjs", generated_on: "2026-10-10", week_end: iso(WEEK_END), days: 7,
  labeling: "constructed: labels follow the rules below from the planted event, never from the scorer; a reviewer disagrees with a rule, not a cell. Not yet hand-reviewed.",
  rules: RULES,
  personas: PERSONAS.map(p => ({ id: p.id, title: p.title, user: { holdings: p.holdings.map(s => ({ symbol: s, name: name(s), sector: CO[s].sector })), watchlist: p.watchlist.map(s => ({ symbol: s, name: name(s) })), employer: p.employer, private_holdings: p.private_holdings, screens: p.screens, muted: p.muted } })),
  events, stories, labels,
  counts: { stories: stories.length, events: events.length, per_persona: Object.fromEntries(PERSONAS.map(p => [p.id, { relevant: Object.values(labels[p.id]).filter(l => l.relevant).length, alert: Object.values(labels[p.id]).filter(l => l.alert).length }])) }
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`news relevance: ${stories.length} stories, ${events.length} events, ${PERSONAS.length} personas; per persona ${JSON.stringify(out.counts.per_persona)} -> ${path.relative(root, OUT)}`);
