  /* Connect cards (owner, 2026-10-11): every "connect X" moment looks like the owner's reference screenshot. One short
     line, then the link alone on its own line. In iMessage the link becomes a preview card: dark grey/silver, the company's real
     logo in the middle, the Upmore wordmark bottom right in green serif, and under it "Connect X to Upmore" with the domain. The card is
     drawn by the page behind the link (connect/<provider>.html: its og:title and og:image, img/connect/<provider>.png),
     and the app's chat draws the same card from the same image when a reply line is exactly that link.
     Real company icons only: a provider is listed here only with its real logo in img/brands/ (SOURCES.md says where each
     came from). A provider without one gets plain words, never a stand-in icon. Only providers a person can actually
     connect today are listed: a card that leads nowhere would be a faked connector. */
  const ConnectCards = (() => {
    // The production app (the same default as supabase/functions/_shared/broker_connect.ts DEFAULT_APP_URL).
    const DEFAULT_BASE = "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app";
    const PROVIDERS = Object.freeze({
      alpaca: Object.freeze({ name: "Alpaca", icon: "img/brands/alpaca.svg", card: "img/connect/alpaca.png" }),
      gmail: Object.freeze({ name: "Gmail", icon: "img/brands/gmail.svg", card: "img/connect/gmail.png" }),
    });
    const LEAD = "Not connected yet - here's the link.";
    const url = (provider, base) => `${String(base || DEFAULT_BASE).replace(/\/+$/, "")}/connect/${provider}`;
    const title = provider => `Connect ${PROVIDERS[provider].name} to Upmore`;
    // The reply is two bubbles, as in the reference: one short line (what did not happen, said plainly, then "here's the
    // link"), and the link alone, which iMessage and the app draw as the card.
    function message(provider, opts) {
      const o = opts || {};
      if (!PROVIDERS[provider]) throw new Error(`No connect card for ${provider}: add its real logo to img/brands first.`);
      return `${o.lead || LEAD}\n\n${url(provider, o.base)}`;
    }
    // A line that is exactly a connect link (any host, so a preview or staging app works too) names its provider.
    function parse(line) {
      const m = /^\s*https:\/\/[a-z0-9.-]+(?::\d+)?\/connect\/([a-z0-9-]+)\/?\s*$/i.exec(String(line || ""));
      return m && PROVIDERS[m[1].toLowerCase()] ? m[1].toLowerCase() : null;
    }
    const host = link => { try { return new URL(link).host; } catch (_) { return ""; } };
    return { DEFAULT_BASE, PROVIDERS, LEAD, url, title, message, parse, host };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = ConnectCards;
