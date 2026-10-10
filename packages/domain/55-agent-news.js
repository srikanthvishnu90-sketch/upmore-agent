  /* Financial news and intelligence (Instinct spec doc 10): the pure half.
     Ingest from feed adapters (fixtures in tests), dedup and cluster the same
     event across outlets, resolve entities against the user's holdings,
     watchlist, screens and employer, score relevance (owned names outrank
     everything; daily market noise scores near zero), decide per doc 01
     (breaking on an owned name interrupts; everything else waits for the
     brief), compose the morning brief, breaking alerts, the acquisitions
     tracker and the weekly roundup, and learn from taps and mutes with
     decay and an anti-filter-bubble audit. No paywalled full text is ever
     stored: headline, summary and link only. Alert texts pass the advice
     guard. Quiet hours are enforced. Loads after AdviceGuard (45). */
  const AgentNews = (() => {
    const DAY = 86400000;
    const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9$ ]+/g, " ").replace(/\s+/g, " ").trim();
    const NOISE = /\b(stocks? (mixed|edge|tick|drift|inch|waver|close (up|down|flat)|open (up|down|flat))|markets? (wrap|today|close|open|roundup)|dow (rises|falls|gains|loses|slips|climbs)|s&p (rises|falls|gains|loses|slips|climbs)|what to watch|futures (rise|fall|point)|wall street (rises|falls|slips|gains))\b/i;
    const EVENT = [["acquisition", /\b(acquire[sd]?|acquisition|to buy|buys|buyout|takeover|merger|merge with|agrees to be acquired)\b/i], ["earnings", /\b(earnings|quarterly results|q[1-4] (results|revenue)|beats? (estimates|expectations)|misses? (estimates|expectations)|guidance (cut|raise|lowered|raised))\b/i], ["regulatory", /\b(sec (charges|sues|settles)|doj|antitrust|ftc|regulator|fined|probe|investigation)\b/i], ["executive", /\b(ceo|cfo|chief executive) (steps down|resigns|departs|exits|fired|ousted|to leave|named|appointed)\b/i], ["ipo", /\b(ipo|files to go public|s-1|public offering|direct listing)\b/i], ["funding", /\b(raises \$|funding round|series [a-f]\b|valuation of)\b/i], ["macro", /\b(fed|federal reserve|cpi|inflation|jobs report|payrolls|rate (hike|cut|decision))\b/i], ["dividend", /\b(dividend (cut|raise|increase|suspend))\b/i]];
    const MATERIAL = new Set(["acquisition", "earnings", "regulatory", "executive", "dividend"]);
    const AUTHORITY = { "wsj": 1.0, "reuters": 1.0, "bloomberg": 1.0, "ft": 0.95, "sec edgar": 1.1, "press release": 1.05, "techcrunch": 0.85, "cnbc": 0.8, "ap": 0.9, "the information": 0.85, "blog": 0.3, "forum": 0.1 };

    // Entities: tickers and company names the user cares about, from holdings, watchlist, screens, employer and private holdings.
    function profile(user) {
      const u = user || {}, ents = new Map();
      const add = (name, kind, weight, extra) => { const k = norm(name); if (!k) return; const e = ents.get(k) || { name, kind, weight: 0, aliases: new Set(), sectors: new Set() }; e.weight = Math.max(e.weight, weight); for (const a of (extra && extra.aliases) || []) e.aliases.add(norm(a)); for (const s of (extra && extra.sectors) || []) e.sectors.add(norm(s)); ents.set(k, e); };
      for (const h of u.holdings || []) add(h.symbol, "holding", 1.0, { aliases: [h.name].concat(h.aliases || []), sectors: h.sector ? [h.sector] : [] });
      for (const w of u.watchlist || []) add(w.symbol || w, "watchlist", 0.7, { aliases: [w.name].filter(Boolean) });
      for (const p of u.private_holdings || []) add(p.name, "private", 0.9, { aliases: p.aliases || [] });
      if (u.employer) add(u.employer, "employer", 0.8, {});
      const sectors = new Set((u.holdings || []).map(h => norm(h.sector)).filter(Boolean).concat((u.screens || []).flatMap(s => (s.sectors || []).map(norm))));
      return { entities: ents, sectors, topic_weights: Object.assign({}, u.topic_weights || {}), muted: new Set((u.muted || []).map(norm)) };
    }
    function entitiesIn(story, prof) {
      const text = norm(`${story.title} ${story.summary || ""}`), hits = [];
      for (const [k, e] of prof.entities) { const names = [k, ...e.aliases].filter(Boolean); if (names.some(n => n.length >= 2 && new RegExp(`(^| )\\$?${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(text))) hits.push({ entity: e.name, kind: e.kind, weight: e.weight }); }
      const sectorHits = [...prof.sectors].filter(s => s && text.includes(s));
      return { entities: hits, sectors: sectorHits, event: (EVENT.find(([, re]) => re.test(story.title + " " + (story.summary || ""))) || ["none"])[0] };
    }
    // Dedup and cluster: the same event in 40 outlets is one story; keep the best source.
    function cluster(stories) {
      const groups = [];
      for (const s of stories) {
        const t = norm(s.title), tokens = new Set(t.split(" ").filter(w => w.length > 3)), ev = (EVENT.find(([, re]) => re.test(s.title + " " + (s.summary || ""))) || ["none"])[0];
        const names = (s.entities || []).map(norm);
        let g = groups.find(g => { const overlap = [...tokens].filter(w => g.tokens.has(w)).length; const sameNames = names.length && g.names.length && names.some(n => g.names.includes(n)); return (g.event === ev && sameNames) || (overlap >= Math.max(3, Math.ceil(Math.min(tokens.size, g.tokens.size) * 0.6)) && Math.abs((s.published_at || 0) - g.published_at) <= 3 * DAY) || (s.cluster_key && s.cluster_key === g.cluster_key); });
        if (!g) { g = { id: `c${groups.length + 1}`, event: ev, names, tokens, published_at: s.published_at || 0, cluster_key: s.cluster_key || null, members: [] }; groups.push(g); }
        g.members.push(s); for (const w of tokens) g.tokens.add(w); for (const n of names) if (!g.names.includes(n)) g.names.push(n);
      }
      return groups.map(g => { const best = g.members.slice().sort((a, b) => (AUTHORITY[norm(b.source)] || 0.5) - (AUTHORITY[norm(a.source)] || 0.5) || (a.published_at || 0) - (b.published_at || 0))[0]; return { id: g.id, event: g.event, story: best, sources: g.members.length, outlets: [...new Set(g.members.map(m => m.source))], published_at: Math.min(...g.members.map(m => m.published_at || 0)) }; });
    }
    // Score: holdings match outranks everything, then watchlist, sector/theme, events in spaces the user reads, freshness, authority. Noise near zero.
    function score(c, prof, now) {
      const s = c.story, r = entitiesIn(Object.assign({}, s, { title: s.title, summary: s.summary }), prof);
      if (NOISE.test(s.title)) return { score: 0.02, why: ["market noise"], relevance: r, material: false };
      const why = []; let v = 0;
      // Broadly material events carry a small base score with no personal link, so the brief can hold one item outside the user's usual topics (NEWS-014) without it ever outranking a holding.
      const owned = r.entities.filter(e => e.kind === "holding"), watched = r.entities.filter(e => e.kind === "watchlist"), priv = r.entities.filter(e => e.kind === "private"), emp = r.entities.filter(e => e.kind === "employer");
      if (!r.entities.length) { if (c.event === "macro") { v += 0.15; why.push("broadly material: macro"); } else if ((c.event === "regulatory" || c.event === "acquisition" || c.event === "ipo") && c.sources >= 5) { v += 0.1; why.push(`broadly material: ${c.event} across ${c.sources} outlets`); } }
      if (owned.length) { v += 1.0; why.push(`you own ${owned.map(e => e.entity).join(", ")}`); }
      if (priv.length) { v += 0.9; why.push(`your private holding ${priv.map(e => e.entity).join(", ")}`); }
      if (emp.length) { v += 0.8; why.push(`your employer`); }
      if (watched.length) { v += 0.6; why.push(`on your watchlist: ${watched.map(e => e.entity).join(", ")}`); }
      if (r.sectors.length) { v += 0.3; why.push(`sector you hold: ${r.sectors.join(", ")}`); }
      if ((c.event === "acquisition" || c.event === "ipo" || c.event === "funding") && r.sectors.length) { v += 0.2; why.push("deal in a space you follow"); }
      for (const [topic, w] of Object.entries(prof.topic_weights)) if (norm(`${s.title} ${s.summary || ""}`).includes(norm(topic))) { v += w; why.push(`${w > 0 ? "more" : "less"} like this: ${topic}`); }
      const age = Math.max(0, (now - (c.published_at || now)) / DAY); v *= Math.max(0.3, 1 - age / 7);
      v *= 0.6 + 0.4 * (AUTHORITY[norm(s.source)] || 0.5);
      if (MATERIAL.has(c.event) && owned.length) { v += 0.5; why.push(`material event: ${c.event}`); }
      const muted = [...prof.muted].some(m => norm(`${s.title} ${s.summary || ""}`).includes(m)); if (muted) { v = 0; why.push("muted topic"); }
      return { score: +v.toFixed(3), why, relevance: r, material: MATERIAL.has(c.event) && owned.length > 0, muted };
    }
    // Decide per doc 01: breaking on an owned name with a material event interrupts (T1 alert); everything else waits for the brief.
    function decide(scored, opts) {
      const o = opts || {}, threshold = o.alert_threshold || 1.4;
      return scored.map(x => ({ cluster: x.cluster, score: x.score, decision: x.material && x.score >= threshold && !x.muted ? (inQuiet(o.now, o.quiet) ? "alert_after_quiet_hours" : "alert") : x.score >= (o.brief_threshold || 0.25) && !x.muted ? "brief" : "silent", why: x.why }));
    }
    function inQuiet(now, quiet) { if (!quiet || !now) return false; const h = new Date(now).getUTCHours() + (quiet.utc_offset_hours || 0); const hh = ((h % 24) + 24) % 24; return quiet.start > quiet.end ? (hh >= quiet.start || hh < quiet.end) : (hh >= quiet.start && hh < quiet.end); }
    function run(stories, user, opts) {
      const o = opts || {}, prof = profile(user), now = o.now || Date.now();
      const clusters = cluster(stories), scored = clusters.map(c => Object.assign({ cluster: c }, score(c, prof, now))).sort((a, b) => b.score - a.score);
      return { clusters, scored, decisions: decide(scored, o), profile: prof };
    }
    // Delivery formats.
    function brief(run, opts) {
      const o = opts || {}, max = Math.min(8, Math.max(5, o.max || 8));
      // Relevant items first; when fewer than five, fill from the best remaining non-noise, non-muted items so the brief is never thin.
      const relevant = run.decisions.filter(d => d.decision !== "silent" && !d.cluster.muted), filler = run.decisions.filter(d => d.decision === "silent" && !d.cluster.muted && d.score >= 0.05 && !NOISE.test(d.cluster.story.title));
      const isOutside = d => { const sc = run.scored.find(x => x.cluster.id === d.cluster.id); return !!sc && !sc.relevance.entities.length && !sc.relevance.sectors.length; };
      const items = relevant.concat(filler.slice(0, Math.max(0, 5 - relevant.length))).slice(0, max).map((d, i) => ({ rank: i + 1, title: d.cluster.story.title, summary: twoSentences(d.cluster.story.summary), link: d.cluster.story.link, source: d.cluster.story.source, sources: d.cluster.sources, why: (isOutside(d) ? "outside your usual topics, but broadly material (NEWS-014); " : "") + d.why.join("; "), score: d.score, event: d.cluster.event }));
      // Anti-filter-bubble: when something broadly material sits outside the user's usual topics, one such item is kept.
      const outside = run.scored.find(x => !x.relevance.entities.length && MATERIAL.has(x.cluster.event) && x.score > 0.1 && (x.cluster.event === "regulatory" || x.cluster.event === "macro" || x.cluster.sources >= 5));
      if (outside && !items.some(i => i.title === outside.cluster.story.title) && items.length >= 5) items[items.length - 1] = { rank: items.length, title: outside.cluster.story.title, summary: twoSentences(outside.cluster.story.summary), link: outside.cluster.story.link, source: outside.cluster.story.source, sources: outside.cluster.sources, why: "outside your usual topics, but broadly material (NEWS-014)", score: outside.score, event: outside.cluster.event };
      return { items, count: items.length, first_is_most_relevant: items.length ? items[0].score >= Math.max(...items.map(i => i.score)) : true, text: items.map(i => `${i.rank}. ${i.title}. ${i.summary} (${i.source}${i.sources > 1 ? ` and ${i.sources - 1} more` : ""}) ${i.link}`).join("\n") };
    }
    const twoSentences = s => { const parts = String(s || "").split(/(?<=[.!?])\s+/).filter(Boolean); return parts.slice(0, 2).join(" "); };
    function alert(d, user) {
      const s = d.cluster.story, owned = d.why.find(w => /^you own/.test(w)) || "";
      const touches = owned ? owned.replace("you own ", "") : "a name you follow";
      const text = `${s.title}. ${twoSentences(s.summary)} This touches ${touches} in your portfolio. ${s.link}`;
      const guard = typeof AdviceGuard !== "undefined" ? AdviceGuard.response(text) : { ok: true, findings: [] };
      return { text: guard.ok ? text : null, guard, tier: "T1", urgent: true, why: d.why };
    }
    function acquisitions(run, sinceMs) { return run.scored.filter(x => x.cluster.event === "acquisition" && (x.cluster.published_at || 0) >= (sinceMs || 0)).map(x => ({ title: x.cluster.story.title, size: (x.cluster.story.summary || "").match(/\$[\d.,]+ ?(billion|million|b|m)\b/i) ? x.cluster.story.summary.match(/\$[\d.,]+ ?(billion|million|b|m)\b/i)[0] : null, overlap: x.relevance.entities.map(e => e.entity), link: x.cluster.story.link, source: x.cluster.story.source })); }
    function roundup(run, sectors) { const want = new Set((sectors || []).map(norm)); return run.scored.filter(x => x.relevance.sectors.some(s => want.has(s)) && !x.cluster.muted && x.score > 0.1).slice(0, 10).map(x => ({ title: x.cluster.story.title, sector: x.relevance.sectors[0], link: x.cluster.story.link })); }
    // Personalization: taps raise topic weights, dismisses lower them, mutes zero them; weights decay so interests can change; everything inspectable.
    function learn(user, signal) {
      const u = Object.assign({}, user, { topic_weights: Object.assign({}, user && user.topic_weights || {}), muted: (user && user.muted || []).slice() });
      const t = norm(signal.topic); if (!t) return u;
      if (signal.kind === "mute") { if (!u.muted.includes(t)) u.muted.push(t); delete u.topic_weights[t]; }
      else if (signal.kind === "unmute") u.muted = u.muted.filter(m => m !== t);
      else { const delta = { tap: 0.15, expand: 0.2, follow_up: 0.25, dismiss: -0.2, more: 0.3, less: -0.3 }[signal.kind] || 0; u.topic_weights[t] = Math.max(-0.6, Math.min(0.6, +((u.topic_weights[t] || 0) + delta).toFixed(2))); }
      return u;
    }
    function decay(user, days) { const u = Object.assign({}, user, { topic_weights: {} }); const f = Math.pow(0.5, (days || 0) / 30); for (const [k, v] of Object.entries(user && user.topic_weights || {})) { const nv = +(v * f).toFixed(3); if (Math.abs(nv) >= 0.02) u.topic_weights[k] = nv; } return u; }
    const explain = (d) => `Why you're seeing this: ${d.why.join("; ")}.`;
    return { profile, entitiesIn, cluster, score, decide, run, brief, alert, acquisitions, roundup, learn, decay, explain, inQuiet, NOISE, EVENT: EVENT.map(e => e[0]), MATERIAL: [...MATERIAL] };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentNews;
