  /* Merchant-terms reader (Rail 3, BUILD-STATUS), for any merchant whose published terms page is configured as data
     (packages/connectors/merchant-terms.json: name, terms URL, parse hints, fact rules).
       read(merchant)  fetches the page, extracts the configured section, normalizes it and returns { text, hash, fetched_at }
                       (hash = SHA-256 of the normalized text, so a markup change is not a terms change and a word change is).
                       An unreadable page (HTTP error, network, a section that is not where the hints say, an empty or
                       oversized page) returns ok:false with a plain sentence and the merchant's own link. Never a guess.
       facts(read)     the few facts a card may state from the terms (refund policy, when access ends, a cancellation fee),
                       each only when the configured phrase is literally in the fetched text, with that phrase as the quote.
     Two page structures are supported: html_headings (a heading and everything until the next heading of the same or a
     higher level) and numbered_clauses (a clause like "5.2 Cancellation." and everything until the next clause at the same
     depth or shallower). fetch and the clock are injected; nothing here reads the environment. */
  const MerchantTerms = (() => {
    // SHA-256, synchronous and dependency-free, so the same hash is computed in node tests and in the Deno function.
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    function utf8(s) { const out = []; for (const ch of String(s)) { let c = ch.codePointAt(0); if (c < 0x80) out.push(c); else if (c < 0x800) out.push(0xc0 | c >> 6, 0x80 | c & 63); else if (c < 0x10000) out.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63); else out.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63); } return out; }
    function sha256(str) {
      const bytes = utf8(str), bitLen = bytes.length * 8;
      bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
      for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);
      const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], W = new Array(64);
      const r = (x, n) => (x >>> n) | (x << (32 - n));
      for (let off = 0; off < bytes.length; off += 64) {
        for (let i = 0; i < 16; i++) W[i] = (bytes[off + 4 * i] << 24) | (bytes[off + 4 * i + 1] << 16) | (bytes[off + 4 * i + 2] << 8) | bytes[off + 4 * i + 3];
        for (let i = 16; i < 64; i++) { const s0 = r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10); W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0; }
        let [a, b, c, d, e, f, g, h] = H;
        for (let i = 0; i < 64; i++) { const S1 = r(e, 6) ^ r(e, 11) ^ r(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K[i] + W[i]) | 0, S0 = r(a, 2) ^ r(a, 13) ^ r(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0; h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0; }
        H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
      }
      return H.map(x => (x >>> 0).toString(16).padStart(8, "0")).join("");
    }

    const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: "-", mdash: "-", hellip: "...", copy: "(c)", reg: "(r)", trade: "(tm)" };
    const decode = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m);
    const norm = s => decode(String(s).replace(/<[^>]*>/g, " ")).replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();
    // The page as a list of blocks: headings with their level, paragraphs, list items. Scripts, styles and nav are dropped.
    function blocks(html) {
      const h = String(html || "").replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|nav|header|footer|svg)\b[\s\S]*?<\/\1>/gi, " ");
      const out = [], re = /<(h[1-6]|p|li|dt|dd|td|blockquote)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
      let m;
      while ((m = re.exec(h))) { const text = norm(m[3]); if (!text) continue; const tag = m[1].toLowerCase(), id = (/\bid\s*=\s*"([^"]+)"/i.exec(m[2]) || [])[1] || null; out.push({ tag, level: /^h[1-6]$/.test(tag) ? Number(tag[1]) : null, id, text }); }
      return out;
    }
    const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Extract the configured section. Returns { text } or { error } naming what was not found.
    function extract(html, parse) {
      const p = parse || {}, bl = blocks(html);
      if (!bl.length) return { error: "empty" };
      if (p.structure === "html_headings") {
        const want = new RegExp(`^(?:\\d+(?:\\.\\d+)*\\.?\\s+)?${esc(p.section_heading)}\\b`, "i");
        const i = bl.findIndex(b => b.level && want.test(b.text)); if (i < 0) return { error: `section "${p.section_heading}" not found` };
        const lvl = bl[i].level, body = [];
        for (let j = i + 1; j < bl.length; j++) { if (bl[j].level && bl[j].level <= lvl) break; body.push(bl[j].text); }
        return body.length ? { text: [bl[i].text].concat(body).join("\n") } : { error: `section "${p.section_heading}" is empty` };
      }
      if (p.structure === "numbered_clauses") {
        const num = /^(\d+(?:\.\d+)*)\.?\s+(\S.*)$/;
        const i = bl.findIndex(b => { const m = num.exec(b.text); return m && new RegExp(`^${esc(p.clause_title)}\\b`, "i").test(m[2]); });
        if (i < 0) return { error: `clause "${p.clause_title}" not found` };
        const depth = num.exec(bl[i].text)[1].split(".").length, body = [bl[i].text];
        for (let j = i + 1; j < bl.length; j++) { const m = num.exec(bl[j].text); if ((m && m[1].split(".").length <= depth) || bl[j].level) break; body.push(bl[j].text); }
        return { text: body.join("\n") };
      }
      return { error: `unknown page structure "${p.structure}"` };
    }

    function load(cfg) {
      const c = cfg || {}, list = Array.isArray(c.merchants) ? c.merchants : [], problems = [];
      for (const m of list) {
        if (!m.merchant_key || !m.name || !/^https:\/\//.test(String(m.terms_url || ""))) problems.push(`${m.merchant_key || "?"}: merchant_key, name and an https terms_url are required`);
        if (!m.parse || !["html_headings", "numbered_clauses"].includes(m.parse.structure)) problems.push(`${m.merchant_key}: parse.structure must be html_headings or numbered_clauses`);
        for (const [k, rule] of Object.entries(m.facts || {})) { try { new RegExp(rule.pattern, "i"); } catch (_) { problems.push(`${m.merchant_key}: fact ${k} pattern does not compile`); } }
      }
      if (problems.length) throw new Error("merchant-terms config: " + problems.join("; "));
      const by = {}; for (const m of list) by[m.merchant_key] = m;
      return { get: key => by[String(key || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")[0]] || by[String(key || "").toLowerCase()] || null, keys: () => Object.keys(by), list };
    }
    const host = u => String(u || "").replace(/^https?:\/\//i, "").replace(/[?#].*$/, "").replace(/\/$/, "");

    // read_terms(merchant): { ok, merchant_key, name, url, text, hash, fetched_at } or { ok: false, reason, url, link, message }.
    async function read(merchant, deps) {
      const d = deps || {}, cfg = d.config && typeof d.config.get === "function" ? d.config : load(d.config || {}), m = cfg.get(merchant);
      const clock = d.clock || (() => Date.now()), max = d.max_bytes || 2000000;
      if (!m) return { ok: false, reason: "unknown_merchant", url: null, link: null, message: `I don't have a terms page configured for ${merchant}, so I won't state its terms.` };
      const link = m.cancel_url || m.terms_url;
      const fail = (reason, what) => ({ ok: false, reason, merchant_key: m.merchant_key, name: m.name, url: m.terms_url, link, message: `I couldn't read ${m.name}'s terms page (${host(m.terms_url)} ${what}), so I won't state their terms. You can read them at ${m.terms_url}.` });
      const f = d.fetch || (typeof fetch !== "undefined" ? fetch : null); if (!f) return fail("network", "could not be fetched from here");
      let res, body;
      // A page that hangs is an unreadable page: the read gives up after timeout_ms (6 s by default) and says so.
      const ctl = typeof AbortController !== "undefined" ? new AbortController() : null, timer = ctl ? setTimeout(() => ctl.abort(), d.timeout_ms || 6000) : null;
      try { res = await f(m.terms_url, { headers: { accept: "text/html" }, redirect: "follow", signal: ctl ? ctl.signal : undefined }); } catch (e) { if (timer) clearTimeout(timer); return fail("network", "could not be reached"); }
      if (timer) clearTimeout(timer);
      if (!res || !res.ok) return fail(`http_${res ? res.status : 0}`, `answered ${res ? res.status : "nothing"}`);
      try { body = await res.text(); } catch (_) { return fail("network", "was cut off"); }
      if (!body || !body.trim()) return fail("empty", "was empty");
      if (body.length > max) return fail("too_large", "was too large to read");
      const ex = extract(body, m.parse);
      if (ex.error) return fail("section_not_found", `does not have the ${ex.error.replace(/ not found$/, "")} where I expect it; the page may have changed`);
      const text = ex.text.split("\n").map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
      return { ok: true, merchant_key: m.merchant_key, name: m.name, url: m.terms_url, link, text, hash: sha256(text), fetched_at: clock() };
    }
    // The facts a card may state, each with the phrase that supports it; a phrase that is not in the text yields nothing.
    function facts(r, deps) {
      if (!r || !r.ok) return {};
      const d = deps || {}, cfg = d.config && typeof d.config.get === "function" ? d.config : load(d.config || {}), m = cfg.get(r.merchant_key);
      const out = {};
      for (const [k, rule] of Object.entries((m && m.facts) || {})) { const hit = new RegExp(rule.pattern, "i").exec(r.text); if (hit) out[k] = { value: rule.value, quote: hit[0], source: r.url, fetched_at: r.fetched_at }; }
      return out;
    }
    return { read, facts, extract, blocks, load, sha256, normalize: norm };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = MerchantTerms;
