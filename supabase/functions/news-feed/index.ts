// news-feed: finance headlines + market snapshot for the Upmore app.
// GET only, no secrets, dependency-free (Deno runtime).
// Sources are all fetched live and curl-verified; nothing is fabricated.
// If a feed fails it is skipped and named in `warnings`. If ALL feeds fail
// the function returns 502 — never synthetic news.

// NOTE: Stooq's free CSV endpoint (stooq.com/q/l/) returns a 404 HTML page
// as of 2026-09-27, so the market snapshot uses Yahoo Finance's free chart
// API (no key) instead. Fields are returned exactly as Yahoo reports them.

const FEEDS = [
  { name: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  {
    name: "Yahoo Finance",
    url:
      "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EDJI,%5EIXIC&region=US&lang=en-US",
  },
  {
    name: "Investing.com",
    url: "https://www.investing.com/rss/news_25.rss",
  },
];

const MARKET_SYMBOLS = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^DJI", label: "Dow" },
  { symbol: "NVDA", label: "Nvidia" },
];

const FETCH_TIMEOUT_MS = 6000;
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info",
  "Content-Type": "application/json",
};

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'");
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function field(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseRss(xml: string, source: string) {
  const items: {
    title: string;
    link: string;
    source: string;
    published: string;
    summary: string;
  }[] = [];
  const blocks = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    const title = stripHtml(field(b, "title"));
    const link = field(b, "link");
    if (!title || !link) continue;
    const summary = truncate(stripHtml(field(b, "description")), 180);
    const pubRaw = field(b, "pubDate") || field(b, "published") ||
      field(b, "dc:date");
    let published = "";
    if (pubRaw) {
      const d = new Date(decodeEntities(pubRaw));
      if (!isNaN(d.getTime())) published = d.toISOString();
    }
    items.push({ title, link, source, published, summary });
  }
  return items;
}

async function fetchFeed(feed: { name: string; url: string }) {
  const { signal, done } = withTimeout(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(feed.url, {
      signal,
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    if (!/<rss|<feed/i.test(xml)) throw new Error("not RSS/XML");
    const items = parseRss(xml, feed.name);
    if (items.length === 0) throw new Error("no items parsed");
    return items;
  } finally {
    done();
  }
}

async function fetchMarkets() {
  const out: {
    symbol: string;
    label: string;
    price: number;
    change: number;
    changePercent: number;
    asOf: string;
  }[] = [];
  for (const s of MARKET_SYMBOLS) {
    const { signal, done } = withTimeout(FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.symbol)}?interval=1d&range=5d`,
        { signal, headers: { "User-Agent": UA } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const meta = j?.chart?.result?.[0]?.meta;
      if (!meta || typeof meta.regularMarketPrice !== "number") {
        throw new Error("missing price");
      }
      const d = new Date((meta.regularMarketTime || 0) * 1000);
      out.push({
        symbol: s.symbol,
        label: s.label,
        // Fields exactly as Yahoo reports them:
        price: meta.regularMarketPrice, // latest regular-session price
        change: typeof meta.fulldayChange === "number" ? meta.fulldayChange : 0,
        changePercent: typeof meta.fulldayChangePercent === "number"
          ? meta.fulldayChangePercent
          : 0,
        asOf: isNaN(d.getTime()) ? "" : d.toISOString(),
      });
    } finally {
      done();
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "GET only" }), {
      status: 405,
      headers: CORS,
    });
  }

  const started = Date.now();
  const warnings: string[] = [];
  const items: ReturnType<typeof parseRss> = [];

  // RSS feeds in parallel, each isolated in try/catch.
  const feedJobs = FEEDS.map(async (feed) => {
    try {
      return await fetchFeed(feed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`${feed.name}: ${msg}`);
      return [];
    }
  });
  // Market snapshot in parallel; failure degrades gracefully.
  const marketsJob = (async () => {
    try {
      return await fetchMarkets();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`markets (Yahoo chart API): ${msg}`);
      return [];
    }
  })();

  const feedResults = await Promise.all(feedJobs);
  for (const r of feedResults) items.push(...r);
  const markets = await marketsJob;

  const elapsedMs = Date.now() - started;

  if (items.length === 0) {
    return new Response(JSON.stringify({ markets, items: [], warnings }), {
      status: 502,
      headers: CORS,
    });
  }

  // Newest first; items without a date go last. Cap at 30.
  items.sort((a, b) => {
    if (!a.published && !b.published) return 0;
    if (!a.published) return 1;
    if (!b.published) return -1;
    return b.published < a.published ? -1 : 1;
  });

  return new Response(
    JSON.stringify({
      markets,
      marketsSource: "yahoo-finance",
      items: items.slice(0, 30),
      warnings: warnings.length ? warnings : undefined,
      fetchedAt: new Date().toISOString(),
      elapsedMs,
    }),
    { status: 200, headers: CORS },
  );
});
