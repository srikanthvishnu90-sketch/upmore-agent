  /* The Upmore response-style corpus (corpus/upmore-convo-corpus-N-of-5.txt, owner 2026-10-11): canonical conversations
     that show the assistant's mannerisms (short, exact with money, never invent, a card before any money moves, one yes
     per card, honest failure, warm not wordy, plain refusals, one clarifying question). The model copies the behavior,
     not the words.
       parse(text, file)        "### n.nn Title" blocks -> { id, file, title, topic, turns: [{role, text}], note, tags, has_card }
       select(examples, msg, o) the k nearest examples to the person's message (default 6), plus the safety examples that
                                are always included (2.08 double yes, 2.09 stale yes, 5.01 provider outage, 5.04 unknown send
                                state). Never an example in RULED_OUT (one that breaks a standing owner rule).
                                Lexical TF-IDF over the example's user turns and title, with tag boosts; free,
                                deterministic and testable offline (no embedding call per message).
       render(selected)         the system-prompt block: the hard rules first, then the examples.
     The corpus is fiction (names, handles, balances); placeholders like [price from tool] are never filled in by the
     model. Capabilities shown in an example may not exist for this person; the hard rules say so. */
  const StyleCorpus = (() => {
    const SAFETY = ["2.08", "2.09", "5.01", "5.04"];
    // Examples that break a standing owner rule never reach a prompt, whatever the message: 5.14 asks the person to text
    // a one-time code ("One-time codes OK in chat"), while the agent never asks for a password, code or card in chat
    // (CLAUDE.md, secrets never travel through chat, 2026-10-11). Found building the STYLE-CORPUS depth packet.
    const RULED_OUT = ["5.14"];
    const HARD_RULES = [
      "HARD RULES (they outrank every example below):",
      "- Never invent balances, prices, fills, statuses, merchant names or confirmation numbers. They come from a tool result in this turn; otherwise say what is unknown.",
      "- Every money move, trade, cancellation or payee change needs a confirmation card (action, exact amount, exact handle or ticker, source account, fee, timing, what can't be undone) and a clear yes to that card.",
      "- A yes covers only the latest card. A stale or second yes never executes anything again.",
      "- Never retry a money move whose state is unknown; say what is known and what to check.",
      "- Only say an action happened when a tool result says it did. The examples show capabilities this person may not have; say plainly when something isn't available.",
      "- Placeholders like [price from tool] are filled only from a tool result, never by you.",
      "- Never ask for a password, a one-time code, a PIN or a card or account number in chat. Sign-ins happen on the company's own page; anything else sensitive goes on the secure link.",
    ].join("\n");
    const HEADER = "STYLE EXAMPLES: copy the mannerisms, not the words. The names, handles, accounts and amounts in them are fictional.";

    const TAG_RULES = [
      ["payment", /\b(send|sent|pay|paid|venmo|zelle|wire|transfer|request)\b/i],
      ["split", /\bsplit|share\b/i], ["rent_bill", /\b(rent|landlord|bill|comed|electric|autopay|utility)\b/i],
      ["iou", /\b(owe|owes|iou|paid me back|pay me back)\b/i],
      ["trade", /\b(buy|sell|shares?|stock|ticker|order|limit|market|nvda|aapl|tsla|etf|portfolio|ipo|crypto|bitcoin|margin)\b/i],
      ["subscription", /\b(cancel|subscription|netflix|hulu|spotify|gym|renews?|trial|planet fitness)\b/i],
      ["balance", /\b(balance|how much|spent|spend|budget|save|savings)\b/i],
      ["fraud", /\b(scam|fraud|gift cards?|irs|phishing|don'?t recognize|stolen|freeze|dispute)\b/i],
      ["advice", /\b(should i|what should|best stock|tips|recommend)\b/i],
      ["outage", /\b(outage|isn'?t responding|not responding|couldn'?t|can'?t reach|sign in again|unknown|didn'?t get a confirmation)\b/i],
      ["emotion", /\b(stressed|sorry|passed|died|rough|panick|angry|messed up|worried|broke|lost)\b/i],
      ["approval", /\b(yes|ya|ok|wait|cancel that|no|nvm|never mind)\b/i],
      ["security", /\b(password|code|verify|account number|private)\b/i],
    ];
    const STOP = new Set("a an the to of for and or in on at is it my me i you your this that be do does did can could would will just from with by as are was were its it's im i'm u ur pls please".split(" "));
    // Sloppy texting maps to the words the corpus uses, so "sned mom 100 rn" finds the payment examples.
    const NORMALIZE = { sned: "send", snd: "send", cancle: "cancel", cancl: "cancel", ya: "yes", yep: "yes", yeah: "yes", nvm: "nevermind", rn: "now", bal: "balance", sub: "subscription", subs: "subscription", stocks: "stock", shares: "share" };
    function tokens(text) {
      return String(text || "").toLowerCase().replace(/\$\s?\d[\d,]*(\.\d+)?/g, " money ").replace(/\b\d[\d,]*(\.\d+)?\b/g, " num ")
        .replace(/[^a-z0-9'@ ]+/g, " ").split(/\s+/).filter(Boolean).map(t => NORMALIZE[t] || t).filter(t => !STOP.has(t) && t.length > 1);
    }
    const tagsOf = text => TAG_RULES.filter(([, re]) => re.test(text)).map(([t]) => t);

    function parse(text, file) {
      const out = []; let topic = null, cur = null;
      const flush = () => { if (cur) { cur.note = cur.note || null; cur.has_card = cur.turns.some(t => t.role === "assistant" && /\[CARD\]/.test(t.text)); cur.tags = tagsOf([cur.title].concat(cur.turns.map(t => t.text)).join(" ")); out.push(cur); cur = null; } };
      for (const raw of String(text).split("\n")) {
        const line = raw.replace(/\s+$/, "");
        const ft = /^--- FILE (\d) OF 5: (.+?) ---$/.exec(line);
        if (ft) { flush(); topic = ft[2]; continue; }
        const h = /^### (\d\.\d\d) (.+)$/.exec(line);
        if (h) { flush(); cur = { id: h[1], file: file || Number(h[1][0]), title: h[2].trim(), topic, turns: [], note: null }; continue; }
        if (!cur) continue;
        if (/^#{3,}|^={5,}/.test(line)) { flush(); continue; }
        let m;
        if ((m = /^U: (.*)$/.exec(line))) cur.turns.push({ role: "user", text: m[1] });
        else if ((m = /^A: (.*)$/.exec(line))) cur.turns.push({ role: "assistant", text: m[1] });
        else if ((m = /^NOTE: (.*)$/.exec(line))) cur.note = m[1];
        else if ((m = /^\((.*)\)$/.exec(line.trim()))) cur.turns.push({ role: "context", text: m[1] });
        else if (line.trim() && cur.turns.length) cur.turns[cur.turns.length - 1].text += " " + line.trim();
      }
      flush();
      return out;
    }

    // TF-IDF over each example's user turns and title (what a person would type), cosine against the message.
    function index(examples) {
      const docs = examples.map(e => tokens([e.title].concat(e.turns.filter(t => t.role === "user").map(t => t.text)).join(" ")));
      const df = new Map(); for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
      const idf = t => Math.log((docs.length + 1) / ((df.get(t) || 0) + 1)) + 1;
      const vec = toks => { const v = new Map(); for (const t of toks) v.set(t, (v.get(t) || 0) + 1); let n = 0; for (const [t, c] of v) { const w = c * idf(t); v.set(t, w); n += w * w; } return { v, n: Math.sqrt(n) || 1 }; };
      return { vecs: docs.map(vec), vec };
    }
    const cache = new WeakMap();
    function select(examples, message, o) {
      const k = (o && o.k) || 6, always = (o && o.always) || SAFETY;
      if (!cache.has(examples)) cache.set(examples, index(examples));
      const ix = cache.get(examples), q = ix.vec(tokens(message)), qt = new Set(tagsOf(message));
      const scored = examples.map((e, i) => {
        let dot = 0; for (const [t, w] of q.v) { const x = ix.vecs[i].v.get(t); if (x) dot += w * x; }
        const cos = dot / (q.n * ix.vecs[i].n), tagHits = e.tags.filter(t => qt.has(t)).length;
        return { e, score: cos + 0.08 * tagHits };
      }).sort((a, b) => b.score - a.score || (a.e.id < b.e.id ? -1 : 1));
      const picked = scored.filter(s => !always.includes(s.e.id) && !RULED_OUT.includes(s.e.id) && s.score > 0).slice(0, k).map(s => s.e);
      const safety = always.filter(id => !RULED_OUT.includes(id)).map(id => examples.find(e => e.id === id)).filter(Boolean);
      return picked.concat(safety);
    }
    function render(selected) {
      const ex = selected.map(e => [`### ${e.id} ${e.title}`].concat(e.turns.map(t => t.role === "user" ? `U: ${t.text}` : t.role === "assistant" ? `A: ${t.text}` : `(${t.text})`), e.note ? [`NOTE: ${e.note}`] : []).join("\n"));
      return [HARD_RULES, "", HEADER].concat(ex.map(x => "\n" + x)).join("\n");
    }
    return { SAFETY, RULED_OUT, HARD_RULES, HEADER, parse, select, render, tokens, tagsOf };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = StyleCorpus;
